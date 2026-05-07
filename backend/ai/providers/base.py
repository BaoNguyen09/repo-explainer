from typing import Any, Awaitable, Callable, Protocol

StreamCallback = Callable[[str], Awaitable[None]]


class LLMProvider(Protocol):
    """
    Minimal interface that all AI providers must implement.

    Providers take a system prompt and user content and return the assistant text.
    """

    async def call_llm(self, system: str, user_content: str, max_tokens: int = 4096) -> str:
        ...

    async def stream_llm(
        self,
        system: str,
        messages: list[dict[str, Any]],
        on_chunk: StreamCallback,
        max_tokens: int = 4096,
    ) -> str:
        ...

    async def call_llm_with_tools(
        self,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        ...
