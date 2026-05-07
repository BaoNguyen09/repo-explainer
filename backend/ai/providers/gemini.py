from typing import Any, Optional

from google import genai
from google.genai import types

from backend import env, utils
from backend.ai.providers.base import LLMProvider, StreamCallback


class GeminiProvider(LLMProvider):
    """
    Google Gemini implementation of the LLMProvider interface.

    Uses the async client path (client.aio) so the event loop is NOT blocked
    while waiting for the Gemini API, allowing SSE status events to be flushed
    to the frontend in real time.
    """

    MODEL = env.MODEL

    def __init__(self, api_key: Optional[str] = None) -> None:
        self._api_key = api_key or env.GEMINI_API_KEY

    async def call_llm(self, system: str, user_content: str, max_tokens: int = 4096) -> str:
        """
        Call the Gemini text model asynchronously.
        """
        if not self._api_key:
            raise RuntimeError("GEMINI_API_KEY is not set but Gemini provider is selected")

        utils.logger.info("GeminiProvider.call_llm(): Calling Gemini API with model %s", self.MODEL)
        client = genai.Client()
        response = await client.aio.models.generate_content(
            model=self.MODEL,
            contents=user_content,
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level="high"),
                system_instruction=system,
                max_output_tokens=max_tokens,
            ),
        )

        return response.text

    async def stream_llm(
        self,
        system: str,
        messages: list[dict[str, Any]],
        on_chunk: StreamCallback,
        max_tokens: int = 4096,
    ) -> str:
        """Stream a plain-text Gemini response when no tool use is needed."""
        if not self._api_key:
            raise RuntimeError("GEMINI_API_KEY is not set but Gemini provider is selected")

        utils.logger.info("GeminiProvider.stream_llm(): Streaming Gemini API with model %s", self.MODEL)
        client = genai.Client()
        contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            content_val = msg.get("content", "")
            if isinstance(content_val, str):
                contents.append(types.Content(role=role, parts=[types.Part.from_text(text=content_val)]))

        text_parts: list[str] = []
        stream = await client.aio.models.generate_content_stream(
            model=self.MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=max_tokens,
            ),
        )
        async for chunk in stream:
            text = chunk.text or ""
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
        """Run a Gemini call that may return function calls."""
        if not self._api_key:
            raise RuntimeError("GEMINI_API_KEY is not set but Gemini provider is selected")

        utils.logger.info(
            "GeminiProvider.call_llm_with_tools(): Calling Gemini API with model %s and %d tools",
            self.MODEL,
            len(tools),
        )
        client = genai.Client()

        function_declarations = []
        for tool in tools:
            function_declarations.append(
                types.FunctionDeclaration(
                    name=tool["name"],
                    description=tool.get("description", ""),
                    parameters=tool.get("input_schema", {}),
                )
            )

        gemini_tools = [types.Tool(function_declarations=function_declarations)] if function_declarations else []

        contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            content_val = msg.get("content", "")
            if isinstance(content_val, types.Content):
                contents.append(content_val)
                continue
            if isinstance(content_val, str):
                contents.append(types.Content(role=role, parts=[types.Part.from_text(text=content_val)]))
                continue

            parts = []
            for block in content_val:
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    parts.append(
                        types.Part.from_function_call(
                            name=block.get("name", "unknown"),
                            args=block.get("input", {}),
                        )
                    )
                elif isinstance(block, dict) and block.get("type") == "tool_result":
                    parts.append(
                        types.Part.from_function_response(
                            name=block.get("name", "unknown"),
                            response={"result": block.get("content", "")},
                        )
                    )
                elif isinstance(block, dict) and block.get("type") == "text":
                    parts.append(types.Part.from_text(text=block.get("text", "")))
                else:
                    parts.append(types.Part.from_text(text=str(block)))
            if parts:
                contents.append(types.Content(role=role, parts=parts))

        response = await client.aio.models.generate_content(
            model=self.MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=max_tokens,
                tools=gemini_tools,
            ),
        )

        if response.candidates and response.candidates[0].content.parts:
            function_calls = []
            text_parts = []
            for part in response.candidates[0].content.parts:
                if part.function_call:
                    function_calls.append(
                        {
                            "id": f"gemini_{part.function_call.name}",
                            "name": part.function_call.name,
                            "input": dict(part.function_call.args) if part.function_call.args else {},
                        }
                    )
                elif part.text:
                    text_parts.append(part.text)

            if function_calls:
                return {
                    "type": "tool_use",
                    "calls": function_calls,
                    "raw_content": response.candidates[0].content,
                }

            return {"type": "text", "content": "\n".join(text_parts)}

        return {"type": "text", "content": response.text or ""}


def _is_retryable_gemini_error(exc: Exception) -> bool:
    """Best-effort detection for transient Gemini API failures."""
    text = str(exc).upper()
    retry_markers = (
        "503",
        "UNAVAILABLE",
        "RESOURCE_EXHAUSTED",
        "TOO MANY REQUESTS",
        "RATE LIMIT",
        "HIGH DEMAND",
        "TRY AGAIN LATER",
    )
    return any(marker in text for marker in retry_markers)
