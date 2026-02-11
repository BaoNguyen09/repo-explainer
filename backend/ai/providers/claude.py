from typing import Optional

import anthropic

from backend import env, utils
from backend.ai.providers.base import LLMProvider


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

