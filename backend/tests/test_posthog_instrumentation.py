"""Tests for PostHog instrumentation: repo_explained enrichment, chat events, retry events."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from backend import main
from backend.ai.retry import with_ai_retry
from backend.github_tools import GitHubTools


def _fake_request(client_ip: str = "1.2.3.4") -> SimpleNamespace:
    """Minimal stand-in for a Starlette Request, enough for get_remote_address()."""
    return SimpleNamespace(client=SimpleNamespace(host=client_ip), headers={})


def test_track_event_is_noop_without_posthog_client(monkeypatch):
    """track_event should not raise or do anything when posthog_client is disabled."""
    monkeypatch.setattr(main, "posthog_client", None)
    main.track_event(_fake_request(), "octocat", "Hello-World", "explain", "success")


def test_track_event_captures_enriched_repo_explained_properties(monkeypatch):
    """repo_explained should carry the new latency/model/coverage properties."""
    mock_client = MagicMock()
    monkeypatch.setattr(main, "posthog_client", mock_client)

    main.track_event(
        _fake_request(),
        "octocat",
        "Hello-World",
        "explain",
        "success",
        duration_ms=123.4,
        time_to_first_event_ms=56.7,
        tree_file_count=10,
        files_read_count=3,
        explanation_chars=500,
        instructions_present=True,
    )

    mock_client.capture.assert_called_once()
    kwargs = mock_client.capture.call_args.kwargs
    assert kwargs["event"] == "repo_explained"
    props = kwargs["properties"]
    assert props["repo_full"] == "octocat/Hello-World"
    assert props["endpoint"] == "explain"
    assert props["status"] == "success"
    assert props["duration_ms"] == 123.4
    assert props["time_to_first_event_ms"] == 56.7
    assert props["tree_file_count"] == 10
    assert props["files_read_count"] == 3
    assert props["explanation_chars"] == 500
    assert props["instructions_present"] is True
    assert props["provider"] == main.env.AI_PROVIDER
    assert props["model"] == main.env.MODEL


def test_track_event_never_raises_when_capture_fails(monkeypatch):
    """A broken PostHog client must never break the request path."""
    mock_client = MagicMock()
    mock_client.capture.side_effect = RuntimeError("network down")
    monkeypatch.setattr(main, "posthog_client", mock_client)

    main.track_event(_fake_request(), "octocat", "Hello-World", "explain", "error")


def test_track_chat_session_started_captures_repo_properties(monkeypatch):
    mock_client = MagicMock()
    monkeypatch.setattr(main, "posthog_client", mock_client)

    main._track_chat_session_started("9.9.9.9", "octocat", "Hello-World")

    mock_client.capture.assert_called_once()
    kwargs = mock_client.capture.call_args.kwargs
    assert kwargs["event"] == "chat_session_started"
    assert kwargs["distinct_id"] == "9.9.9.9"
    assert kwargs["properties"]["repo_full"] == "octocat/Hello-World"


def test_track_chat_message_never_includes_message_content(monkeypatch):
    """chat_message properties must be metadata only -- no message text."""
    mock_client = MagicMock()
    monkeypatch.setattr(main, "posthog_client", mock_client)

    main._track_chat_message(
        "9.9.9.9", "octocat", "Hello-World",
        message_index=2, style="caveman", status_name="success",
        time_to_first_token_ms=42.0, total_ms=200.0, response_chars=80,
    )

    props = mock_client.capture.call_args.kwargs["properties"]
    assert props["message_index"] == 2
    assert props["style"] == "caveman"
    assert props["status"] == "success"
    assert props["time_to_first_token_ms"] == 42.0
    assert props["total_ms"] == 200.0
    assert props["response_chars"] == 80
    assert "content" not in props
    assert "message" not in props


def test_chat_websocket_success_flow_captures_session_and_message_events(monkeypatch):
    """A full happy-path chat turn should fire session_started + chat_message and flush."""
    mock_client = MagicMock()
    monkeypatch.setattr(main, "posthog_client", mock_client)

    async def fake_fetch_tree(self, repo, depth=3, full_depth=False):
        return "Directory structure:\n└── octocat/Hello-World/\n    └── README.md"

    async def fake_chat_with_repo(**kwargs):
        chunk_callback = kwargs.get("chunk_callback")
        if chunk_callback:
            await chunk_callback("Hello")
        return "Hello world"

    monkeypatch.setattr(GitHubTools, "fetch_directory_tree_with_depth", fake_fetch_tree)
    monkeypatch.setattr(main.chat_service, "chat_with_repo", fake_chat_with_repo)

    with TestClient(main.app) as client:
        with client.websocket_connect("/octocat/Hello-World/chat") as websocket:
            websocket.send_json(
                {
                    "type": "message",
                    "content": "What does this repo do?",
                    "history": [],
                    "explanation": "Existing overview",
                    "style": "normal",
                }
            )
            response = websocket.receive_json()  # chunk
            assert response["type"] == "chunk"
            result = websocket.receive_json()
            assert result["type"] == "result"

    events = [c.kwargs["event"] for c in mock_client.capture.call_args_list]
    assert "chat_session_started" in events
    assert "chat_message" in events

    message_call = next(c for c in mock_client.capture.call_args_list if c.kwargs["event"] == "chat_message")
    props = message_call.kwargs["properties"]
    assert props["message_index"] == 1
    assert props["status"] == "success"
    assert props["response_chars"] == len("Hello world")
    assert props["time_to_first_token_ms"] is not None

    mock_client.flush.assert_called()


def test_get_repo_context_returns_tree_and_file_counts():
    """_count_tree_files should count file lines, not directories, in a formatted tree."""
    tree_str = (
        "Directory structure:\n"
        "└── octocat/Hello-World/\n"
        "    ├── src/\n"
        "    │   └── main.py\n"
        "    └── README.md"
    )
    assert GitHubTools._count_tree_files(tree_str) == 2


def test_with_ai_retry_captures_recovery_event(monkeypatch):
    """Successful retry after a transient failure should fire ai_retry_recovered."""
    import backend.main as backend_main

    mock_client = MagicMock()
    monkeypatch.setattr(backend_main, "posthog_client", mock_client)

    attempts = {"count": 0}

    async def flaky_operation():
        attempts["count"] += 1
        if attempts["count"] < 2:
            raise RuntimeError("503 UNAVAILABLE")
        return "ok"

    import asyncio

    result = asyncio.run(with_ai_retry("test_op", flaky_operation, attempts=3))

    assert result == "ok"
    mock_client.capture.assert_called_once()
    kwargs = mock_client.capture.call_args.kwargs
    assert kwargs["event"] == "ai_retry_recovered"
    assert kwargs["properties"]["operation"] == "test_op"
    assert kwargs["properties"]["attempts_used"] == 2


def test_with_ai_retry_captures_exhausted_event(monkeypatch):
    """Exhausting all retries on a transient failure should fire ai_retry_exhausted."""
    import backend.main as backend_main

    mock_client = MagicMock()
    monkeypatch.setattr(backend_main, "posthog_client", mock_client)

    async def always_fails():
        raise RuntimeError("503 UNAVAILABLE")

    import asyncio

    with pytest.raises(RuntimeError):
        asyncio.run(with_ai_retry("test_op", always_fails, attempts=2))

    mock_client.capture.assert_called_once()
    kwargs = mock_client.capture.call_args.kwargs
    assert kwargs["event"] == "ai_retry_exhausted"
    assert kwargs["properties"]["operation"] == "test_op"
    assert kwargs["properties"]["attempts"] == 2


def test_with_ai_retry_no_event_for_non_retryable_first_attempt_failure(monkeypatch):
    """A non-retryable failure on the first attempt should not fire any retry event."""
    import backend.main as backend_main

    mock_client = MagicMock()
    monkeypatch.setattr(backend_main, "posthog_client", mock_client)

    async def bad_operation():
        raise RuntimeError("invalid api key")

    import asyncio

    with pytest.raises(RuntimeError):
        asyncio.run(with_ai_retry("test_op", bad_operation, attempts=3))

    mock_client.capture.assert_not_called()
