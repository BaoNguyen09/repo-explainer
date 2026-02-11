from typing import Optional

from google import genai
from google.genai import types

from backend import env, utils
from backend.ai.providers.base import LLMProvider


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
