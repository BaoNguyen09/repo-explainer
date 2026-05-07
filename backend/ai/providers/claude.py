from typing import Any, Optional

import anthropic

from backend import env, utils
from backend.ai.providers.base import LLMProvider, StreamCallback


class ClaudeProvider(LLMProvider):
    """Anthropic Claude implementation of the LLMProvider interface."""

    MODEL = env.MODEL

    def __init__(self, api_key: Optional[str] = None) -> None:
        self._api_key = api_key or env.ANTHROPIC_API_KEY

    async def call_llm(self, system: str, user_content: str, max_tokens: int = 4096) -> str:
        """
        Single LLM call. Returns the assistant text.

        Mirrors the previous ClaudeService._call_llm behaviour so existing
        prompts and callers can remain unchanged.
        """
        if not self._api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set but Claude provider is selected")

        client = anthropic.AsyncAnthropic(api_key=self._api_key)
        utils.logger.info("ClaudeProvider.call_llm(): Calling Anthropic API with model %s", self.MODEL)
        message = await client.messages.create(
            model=self.MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )
        return message.content[0].text

    async def stream_llm(
        self,
        system: str,
        messages: list[dict[str, Any]],
        on_chunk: StreamCallback,
        max_tokens: int = 4096,
    ) -> str:
        """Stream a plain-text Claude response when no tool use is needed."""
        if not self._api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set but Claude provider is selected")

        client = anthropic.AsyncAnthropic(api_key=self._api_key)
        text_parts: list[str] = []
        async with client.messages.stream(
            model=self.MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                if not text:
                    continue
                text_parts.append(text)
                await on_chunk(text)
        return "".join(text_parts)

    async def call_llm_with_tools(
        self,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        """Run a Claude call that may return tool invocations."""
        if not self._api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set but Claude provider is selected")

        client = anthropic.AsyncAnthropic(api_key=self._api_key)
        utils.logger.info(
            "ClaudeProvider.call_llm_with_tools(): Calling Anthropic API with model %s and %d tools",
            self.MODEL,
            len(tools),
        )
        message = await client.messages.create(
            model=self.MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
            tools=tools,
        )

        if message.stop_reason == "tool_use":
            tool_calls = []
            for block in message.content:
                if getattr(block, "type", None) == "tool_use":
                    tool_calls.append(
                        {
                            "id": block.id,
                            "name": block.name,
                            "input": block.input,
                        }
                    )
            return {"type": "tool_use", "calls": tool_calls, "raw_content": message.content}

        text_parts = []
        for block in message.content:
            if hasattr(block, "text"):
                text_parts.append(block.text)
        return {"type": "text", "content": "\n".join(text_parts)}

