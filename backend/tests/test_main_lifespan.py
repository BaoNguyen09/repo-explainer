"""Tests for stateless chat validation helpers and websocket guardrails."""

import asyncio

from fastapi.testclient import TestClient

from backend import env
from backend.ai.providers.gemini import _is_retryable_gemini_error
from backend.ai.retry import is_retryable_ai_error, with_ai_retry
from backend.main import (
    _chat_rate_windows,
    _is_allowed_ws_origin,
    _is_chat_rate_limited,
    _validate_chat_history,
    _validate_chat_style,
    app,
    origins,
)
from backend.prompts import CHAT_SYSTEM_TEMPLATE, SYSTEM_PROMPT, build_chat_system_prompt, load_caveman_prompt


def test_validate_chat_style_defaults_to_normal():
    """Missing style should resolve to normal."""
    assert _validate_chat_style(None) == "normal"


def test_validate_chat_style_rejects_unknown_value():
    """Unknown chat styles should raise a validation error."""
    try:
        _validate_chat_style("pirate")
    except ValueError as exc:
        assert "Invalid style" in str(exc)
    else:
        raise AssertionError("Expected ValueError for unknown style")


def test_validate_chat_history_accepts_user_and_assistant_messages():
    """Well-formed history entries should be normalized and preserved."""
    history = _validate_chat_history(
        [
            {"role": "user", "content": " How does auth work? "},
            {"role": "assistant", "content": "It uses JWT."},
        ]
    )
    assert history == [
        {"role": "user", "content": "How does auth work?"},
        {"role": "assistant", "content": "It uses JWT."},
    ]


def test_validate_chat_history_rejects_tool_messages_from_ui_history():
    """Tool event rows are UI-only and should never be accepted as model history."""
    try:
        _validate_chat_history([{"role": "tool", "content": "Read src/main.py"}])
    except ValueError as exc:
        assert "invalid role" in str(exc)
    else:
        raise AssertionError("Expected ValueError for tool history")


def test_websocket_origin_policy_rejects_unconfigured_browser_origin():
    """Browser websocket origins should use the same allow-list as HTTP CORS."""
    original = origins[:]
    try:
        origins[:] = ["http://localhost:5173"]

        assert _is_allowed_ws_origin("http://localhost:5173")
        assert not _is_allowed_ws_origin("https://evil.example")
        assert _is_allowed_ws_origin(None)
    finally:
        origins[:] = original


def test_chat_rate_limiter_limits_by_client_and_window():
    """Chat turns should be capped per client in a sliding window."""
    original_limit = env.CHAT_WS_RATE_LIMIT_MESSAGES
    original_window = env.CHAT_WS_RATE_LIMIT_WINDOW_SECONDS
    client_id = "test-client"
    try:
        env.CHAT_WS_RATE_LIMIT_MESSAGES = 2
        env.CHAT_WS_RATE_LIMIT_WINDOW_SECONDS = 60
        _chat_rate_windows.pop(client_id, None)

        assert not _is_chat_rate_limited(client_id)
        assert not _is_chat_rate_limited(client_id)
        assert _is_chat_rate_limited(client_id)
    finally:
        env.CHAT_WS_RATE_LIMIT_MESSAGES = original_limit
        env.CHAT_WS_RATE_LIMIT_WINDOW_SECONDS = original_window
        _chat_rate_windows.pop(client_id, None)


def test_chat_websocket_requires_explanation_before_answering():
    """Chat should fail fast if frontend does not provide an overview."""
    with TestClient(app) as client:
        with client.websocket_connect("/test/repo/chat") as websocket:
            websocket.send_json(
                {
                    "type": "message",
                    "content": "What does this repo do?",
                    "history": [],
                    "explanation": "",
                    "style": "normal",
                }
            )
            response = websocket.receive_json()

    assert response["type"] == "error"
    assert "generate the overview first" in response["detail"].lower()


def test_chat_websocket_rejects_invalid_style():
    """Chat should reject unknown style values before touching external services."""
    with TestClient(app) as client:
        with client.websocket_connect("/test/repo/chat") as websocket:
            websocket.send_json(
                {
                    "type": "message",
                    "content": "What does this repo do?",
                    "history": [],
                    "explanation": "Existing overview",
                    "style": "pirate",
                }
            )
            response = websocket.receive_json()

    assert response["type"] == "error"
    assert "invalid style" in response["detail"].lower()


def test_load_caveman_prompt_reads_full_prompt_asset():
    """Caveman mode should come from the markdown asset, not an inline stub."""
    prompt = load_caveman_prompt()

    assert "Respond terse like smart caveman" in prompt
    assert "## Auto-Clarity" in prompt


def test_chat_prompt_includes_caveman_instructions_when_enabled():
    """Caveman chat style should inject the full terse-response instruction set."""
    prompt = build_chat_system_prompt(
        owner="octocat",
        repo="Hello-World",
        explanation="Existing overview",
        tree="Hello-World/\n└── README",
        style="caveman",
    )

    assert "Style mode active: caveman, full intensity" in prompt
    assert "Respond terse like smart caveman" in prompt
    assert "Drop: articles" in prompt


def test_chat_prompt_omits_caveman_instructions_by_default():
    """Normal chat style should not accidentally inherit caveman constraints."""
    prompt = build_chat_system_prompt(
        owner="octocat",
        repo="Hello-World",
        explanation="Existing overview",
        tree="Hello-World/\n└── README",
    )

    assert "Style mode active: caveman" not in prompt
    assert "Respond terse like smart caveman" not in prompt


def test_overview_prompt_requires_full_repo_relative_paths():
    """Overview prompt should require full repo-relative file paths in prose."""
    assert "full repo-relative path from the repository root" in SYSTEM_PROMPT
    assert "write `src/server.c`, not `server.c`" in SYSTEM_PROMPT


def test_overview_prompt_discourages_unsupported_repo_lore():
    """Overview prompt should keep repo explanations grounded in fetched context."""
    assert "Do NOT invent or overstate history" in SYSTEM_PROMPT
    assert "For tiny repositories, stay brief" in SYSTEM_PROMPT
    assert "Only include command examples that are valid" in SYSTEM_PROMPT
    assert "canonical" in SYSTEM_PROMPT
    assert "typically" in SYSTEM_PROMPT
    assert "avoid guessing intent" in SYSTEM_PROMPT
    assert "purpose" in SYSTEM_PROMPT
    assert "visible contents and behavior" in SYSTEM_PROMPT


def test_chat_prompt_requires_full_repo_relative_paths():
    """Chat prompt should require full repo-relative file paths too."""
    assert "full repo-relative path from the repository root" in CHAT_SYSTEM_TEMPLATE


def test_gemini_retry_helper_matches_transient_unavailable_errors():
    """Gemini retry helper should catch common transient 503/unavailable failures."""
    assert _is_retryable_gemini_error(RuntimeError("503 UNAVAILABLE: model under high demand"))
    assert not _is_retryable_gemini_error(RuntimeError("invalid api key"))


def test_shared_ai_retry_helper_matches_common_transient_errors():
    """Shared retry helper should catch generic upstream transient failures too."""
    assert is_retryable_ai_error(RuntimeError("503 UNAVAILABLE: model under high demand"))
    assert is_retryable_ai_error(RuntimeError("429 rate limit exceeded"))
    assert not is_retryable_ai_error(RuntimeError("invalid api key"))


def test_with_ai_retry_retries_until_success():
    """Transient provider failures should retry and eventually return success."""
    attempts = {"count": 0}

    async def flaky_operation() -> str:
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise RuntimeError("503 UNAVAILABLE")
        return "ok"

    result = asyncio.run(with_ai_retry("test", flaky_operation, attempts=3))

    assert result == "ok"
    assert attempts["count"] == 3


def test_with_ai_retry_does_not_retry_non_retryable_errors():
    """Non-transient failures should fail fast without burning all retries."""
    attempts = {"count": 0}

    async def bad_operation() -> str:
        attempts["count"] += 1
        raise RuntimeError("invalid api key")

    try:
        asyncio.run(with_ai_retry("test", bad_operation, attempts=3))
    except RuntimeError as exc:
        assert "invalid api key" in str(exc)
    else:
        raise AssertionError("Expected RuntimeError for non-retryable failure")

    assert attempts["count"] == 1
