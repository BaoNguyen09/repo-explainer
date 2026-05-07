"""
Chat-with-repo service: orchestrates the tool-calling loop between the AI
provider and GitHubTools, using conversation history for context.
"""

import asyncio
from typing import Any, Awaitable, Callable, Optional, Union

from backend import env, utils
from backend.ai.providers.base import LLMProvider
from backend.ai.retry import with_ai_retry
from backend.chat_tools import CHAT_TOOLS, execute_tool
from backend.github_tools import GitHubTools
from backend.prompts import build_chat_system_prompt
from backend.schema import RepoInfo

StatusCallback = Callable[[str, Optional[str]], Union[None, Awaitable[None]]]
ToolCallCallback = Callable[[str, str], Union[None, Awaitable[None]]]

__all__ = ["chat_with_repo"]

_provider: Optional[LLMProvider] = None


def _chunk_text(text: str, chunk_size: int = 80) -> list[str]:
    """Split text into UI-friendly chunks for fallback streaming."""
    return [text[index : index + chunk_size] for index in range(0, len(text), chunk_size)]


def _get_provider() -> LLMProvider:
    """Lazily construct and cache the configured provider."""
    global _provider
    if _provider is not None:
        return _provider

    provider_name = (env.AI_PROVIDER or "claude").strip().lower()
    if provider_name == "gemini":
        from backend.ai.providers.gemini import GeminiProvider

        _provider = GeminiProvider()
    else:
        from backend.ai.providers.claude import ClaudeProvider

        _provider = ClaudeProvider()
    return _provider


def _build_messages_from_history(
    history: list[dict[str, str]],
    user_message: str,
) -> list[dict[str, Any]]:
    """Build the provider message array from prior chat history plus the new user message."""
    messages: list[dict[str, Any]] = []
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_message})
    return messages


async def _notify(callback: Optional[StatusCallback], stage: str, detail: Optional[str] = None) -> None:
    """Invoke the status callback, awaiting if it returns a coroutine."""
    if not callback:
        return
    result = callback(stage, detail)
    if result is not None:
        await result


async def _notify_tool_call(callback: Optional[ToolCallCallback], tool_name: str, detail: str) -> None:
    """Notify the UI that the backend is about to execute a GitHub grounding tool."""
    if not callback:
        return
    result = callback(tool_name, detail)
    if result is not None:
        await result


async def chat_with_repo(
    repo: RepoInfo,
    session_history: list[dict[str, str]],
    user_message: str,
    cached_explanation: str,
    directory_tree: str,
    github: GitHubTools,
    status_callback: Optional[StatusCallback] = None,
    tool_call_callback: Optional[ToolCallCallback] = None,
    style: str = "normal",
    chunk_callback: Optional[Callable[[str], Awaitable[None]]] = None,
) -> str:
    """
    Send a chat message about a repository and get a response.

    The frontend owns history. Backend uses the provided history and repo overview
    as prompt context for a single stateless chat turn.
    """
    provider = _get_provider()
    system = build_chat_system_prompt(
        owner=repo.owner,
        repo=repo.repo_name,
        explanation=cached_explanation,
        tree=directory_tree,
        style=style,
    )

    messages = _build_messages_from_history(session_history, user_message)
    max_rounds = env.CHAT_MAX_TOOL_ROUNDS

    async def emit_chunked_text(text: str) -> str:
        if not chunk_callback or not text:
            return text
        for chunk in _chunk_text(text, chunk_size=24):
            await chunk_callback(chunk)
            await asyncio.sleep(0.035)
        return text

    for round_num in range(max_rounds):
        await _notify(status_callback, "thinking")

        result = await with_ai_retry(
            "chat_with_repo.call_llm_with_tools",
            lambda: provider.call_llm_with_tools(
                system=system,
                messages=messages,
                tools=CHAT_TOOLS,
                max_tokens=4096,
            ),
        )

        if result["type"] == "text":
            return await emit_chunked_text(result["content"])

        tool_calls = result.get("calls", [])
        if not tool_calls:
            return result.get("content", "I couldn't generate a response.")

        raw_content = result.get("raw_content")
        if raw_content is not None:
            messages.append({"role": "assistant", "content": raw_content})
        else:
            messages.append(
                {
                    "role": "assistant",
                    "content": [
                        {"type": "tool_use", "id": tc["id"], "name": tc["name"], "input": tc["input"]}
                        for tc in tool_calls
                    ],
                }
            )

        tool_results = []
        for tc in tool_calls:
            tool_name = tc["name"]
            tool_input = tc["input"]
            detail = tool_input.get("path", "")
            stage = "reading_file" if tool_name == "read_file" else "listing_directory"
            await _notify_tool_call(tool_call_callback, tool_name, detail)
            await _notify(status_callback, stage, detail)

            utils.logger.info(
                "chat_service: executing tool %s(%s) [round %d/%d]",
                tool_name,
                tool_input,
                round_num + 1,
                max_rounds,
            )
            output = await execute_tool(tool_name, tool_input, github, repo)
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tc["id"],
                    "name": tool_name,
                    "content": output,
                }
            )

        messages.append({"role": "user", "content": tool_results})

    utils.logger.warning("chat_service: max tool rounds (%d) reached, forcing text response", max_rounds)
    await _notify(status_callback, "thinking")

    if chunk_callback:
        return await with_ai_retry(
            "chat_with_repo.stream_llm",
            lambda: provider.stream_llm(
                system=system,
                messages=messages,
                on_chunk=chunk_callback,
                max_tokens=4096,
            ),
        )
    final = await with_ai_retry(
        "chat_with_repo.final_call_llm_with_tools",
        lambda: provider.call_llm_with_tools(
            system=system,
            messages=messages,
            tools=[],
            max_tokens=4096,
        ),
    )
    return final.get("content", "I ran out of tool rounds. Please try a more specific question.")
