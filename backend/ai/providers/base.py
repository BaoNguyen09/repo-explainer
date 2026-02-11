from typing import Protocol


class LLMProvider(Protocol):
    """
    Minimal interface that all AI providers must implement.

    Providers take a system prompt and user content and return the assistant text.
    """

    async def call_llm(self, system: str, user_content: str, max_tokens: int = 4096) -> str:
        pass