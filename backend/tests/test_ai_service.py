"""Tests for ai_service.suggest_questions."""

import asyncio

from backend import ai_service


class _FakeProvider:
    def __init__(self, response: str):
        self._response = response
        self.calls: list[dict] = []

    async def call_llm(self, system, user_content, max_tokens=4096, thinking_level="high"):
        self.calls.append({"max_tokens": max_tokens, "thinking_level": thinking_level})
        return self._response


def test_suggest_questions_uses_low_thinking_effort(monkeypatch):
    """Regression guard: 'high' thinking burns the token budget on reasoning before any
    question text, which is what caused suggestions to silently fall back to defaults."""
    provider = _FakeProvider("How does routing work?\nWhere is auth handled?\nExplain the test setup")
    monkeypatch.setattr(ai_service, "_get_provider", lambda: provider)
    asyncio.run(ai_service.suggest_questions("some explanation"))
    assert provider.calls[0]["thinking_level"] == "low"


def test_suggest_questions_discards_truncated_response(monkeypatch):
    """A cut-off response (fewer than 3 questions) must not surface a partial result."""
    monkeypatch.setattr(ai_service, "_get_provider", lambda: _FakeProvider("How does backend/chat_"))
    result = asyncio.run(ai_service.suggest_questions("some explanation"))
    assert result == []


def test_suggest_questions_returns_three_when_complete(monkeypatch):
    monkeypatch.setattr(
        ai_service,
        "_get_provider",
        lambda: _FakeProvider("How does routing work?\nWhere is auth handled?\nExplain the test setup"),
    )
    result = asyncio.run(ai_service.suggest_questions("some explanation"))
    assert result == ["How does routing work?", "Where is auth handled?", "Explain the test setup"]
