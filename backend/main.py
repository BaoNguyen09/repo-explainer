import asyncio
from collections import defaultdict, deque
import json
import time
from typing import Any, Optional

import httpx
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from posthog import Posthog

from backend import GitHubTools
from backend import ai_service
from backend import chat_service
from backend import env, utils
from backend.schema import ModelResponse, RepoInfo

# —— PostHog analytics (no-op when API key is absent) ——
posthog_client: Posthog | None = None
if env.POSTHOG_API_KEY:
    posthog_client = Posthog(env.POSTHOG_API_KEY, host=env.POSTHOG_HOST)


def track_event(
    request: Request, owner: str, repo: str, endpoint: str, status_name: str
) -> None:
    """Record a repo_explained event in PostHog (no-op if client is disabled)."""
    if not posthog_client:
        return
    client_ip = get_remote_address(request)
    posthog_client.capture(
        distinct_id=client_ip,
        event="repo_explained",
        properties={
            "owner": owner,
            "repo": repo,
            "repo_full": f"{owner}/{repo}",
            "endpoint": endpoint,
            "status": status_name,
        },
    )


def _user_facing_error(msg: str) -> str:
    """Map known API/backend errors to user-friendly messages; pass through the rest."""
    if not msg:
        return "Something went wrong. Please try again."
    msg_lower = msg.lower()
    if "prompt is too long" in msg_lower or ("too long" in msg_lower and "token" in msg_lower):
        return "This repository has too much content to analyze (over the model's limit). Try a smaller repo or a specific branch."
    if "connection" in msg_lower and "failed" in msg_lower:
        return "Could not reach the AI service. Check your connection or try again in a moment."
    if "rate limit" in msg_lower or "429" in msg:
        return "Rate limit exceeded. Please try again later."
    return msg


def _validate_chat_style(style: Any) -> str:
    """Validate the requested chat style."""
    if style in (None, "", "normal"):
        return "normal"
    if style == "caveman":
        return "caveman"
    raise ValueError("Invalid style. Expected 'normal' or 'caveman'.")


def _validate_chat_history(history: Any) -> list[dict[str, str]]:
    """Validate the client-provided chat history."""
    if history in (None, ""):
        return []
    if not isinstance(history, list):
        raise ValueError("History must be an array of messages.")

    validated: list[dict[str, str]] = []
    for index, item in enumerate(history):
        if not isinstance(item, dict):
            raise ValueError(f"History item {index + 1} must be an object.")

        role = item.get("role")
        content = item.get("content")
        if role not in {"user", "assistant"}:
            raise ValueError(f"History item {index + 1} has invalid role.")
        if not isinstance(content, str) or not content.strip():
            raise ValueError(f"History item {index + 1} must have non-empty content.")

        validated.append({"role": role, "content": content.strip()})

    return validated


def _is_allowed_ws_origin(origin: Optional[str]) -> bool:
    """Apply the configured CORS origin policy to browser WebSocket handshakes."""
    if not origin:
        return True
    if "*" in origins:
        return True
    return origin in origins


def _is_chat_rate_limited(client_id: str) -> bool:
    """Sliding-window limiter for paid chat turns across WebSocket connections."""
    now = time.monotonic()
    window = max(env.CHAT_WS_RATE_LIMIT_WINDOW_SECONDS, 1)
    limit = max(env.CHAT_WS_RATE_LIMIT_MESSAGES, 1)
    bucket = _chat_rate_windows[client_id]

    while bucket and now - bucket[0] > window:
        bucket.popleft()

    if len(bucket) >= limit:
        return True

    bucket.append(now)
    return False


limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

origins = [origin.strip() for origin in env.CORS_ORIGINS.split(",") if origin.strip()]
_chat_rate_windows: dict[str, deque[float]] = defaultdict(deque)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def posthog_flush_middleware(request: Request, call_next):
    """Flush PostHog events after each request so nothing is lost on shutdown."""
    response = await call_next(request)
    if posthog_client:
        posthog_client.flush()
    return response


@app.get("/")
def root():
    return "Welcome to Repo Explainer!"


@app.get(
    "/{owner}/{repo}",
    responses={
        403: {"description": "Repository is private or GitHub rate limit exceeded"},
        404: {"description": "Repository not found"},
        500: {"description": "Internal server error"},
    },
)
@limiter.limit("20/day")
async def explain_repo(
    request: Request,
    owner: str,
    repo: str,
    ref: Optional[str] = None,
    instructions: Optional[str] = Query(None),
):
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"https://github.com/{owner}/{repo}")
            res.raise_for_status()

            repo_info = RepoInfo(owner=owner, repo_name=repo)
            github_token = request.headers.get("X-GitHub-Token") or env.GITHUB_TOKEN
            if github_token == "":
                github_token = None

            github = GitHubTools(client, github_token=github_token, ref=ref)
            default_branch = await github.get_default_branch(repo_info)
            repo_content, success = await github.get_repo_context(repo_info)
            if not success:
                raise HTTPException(status_code=500, detail="Failed to fetch repository context")

            explanation, success = await ai_service.explain_repo(
                repo_info,
                repo_content,
                instructions=instructions,
            )
            if not success:
                raise HTTPException(
                    status_code=500,
                    detail=_user_facing_error(explanation or "Failed to generate explanation"),
                )

            track_event(request, owner, repo, "explain", "success")
            return ModelResponse(
                explanation=explanation,
                repo=f"{owner}/{repo}",
                cache=False,
                timestamp=utils.date_now(),
                default_branch=default_branch,
            )
    except httpx.HTTPStatusError as e:
        status_code = e.response.status_code
        error_messages = {
            403: f"Repository '{owner}/{repo}' is private or access is forbidden.",
            404: f"Repository '{owner}/{repo}' not found. Please check the owner and repository name.",
            429: "Too many requests to GitHub. Please try again later.",
        }
        detail = error_messages.get(
            status_code,
            f"Error accessing repository '{owner}/{repo}' (HTTP {status_code})",
        )

        track_event(request, owner, repo, "explain", "error")
        raise HTTPException(
            status_code=status_code if status_code < 500 else 500,
            detail=detail,
        )
    except Exception as e:
        utils.logger.exception("Error in explain_repo(): %s", e)
        track_event(request, owner, repo, "explain", "error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred internally on the server",
        )


def _sse_event(event_type: str, data: Any) -> str:
    """Format one SSE event (event type + data line, double newline)."""
    payload = json.dumps(data) if not isinstance(data, str) else data
    return f"event: {event_type}\ndata: {payload}\n\n"


async def _run_stream_pipeline(
    owner: str,
    repo: str,
    ref: Optional[str],
    instructions: Optional[str],
    request: Request,
    queue: asyncio.Queue,
) -> None:
    """Run get_repo_context + explain_repo and push status/result/error to queue."""
    try:
        async with httpx.AsyncClient() as client:
            repo_info = RepoInfo(owner=owner, repo_name=repo)
            github_token = request.headers.get("X-GitHub-Token") or env.GITHUB_TOKEN
            if github_token == "":
                github_token = None
            github = GitHubTools(client, github_token=github_token, ref=ref)
            default_branch = await github.get_default_branch(repo_info)

            def status_callback(stage: str) -> None:
                queue.put_nowait(stage)

            repo_content, success = await github.get_repo_context(repo_info, status_callback=status_callback)
            if not success:
                queue.put_nowait({"error": "Failed to fetch repository context"})
                return

            explanation, success = await ai_service.explain_repo(
                repo_info,
                repo_content,
                instructions=instructions,
                status_callback=status_callback,
            )
            if not success:
                queue.put_nowait({"error": _user_facing_error(explanation or "Failed to generate explanation")})
                return

            track_event(request, owner, repo, "stream", "success")
            queue.put_nowait(
                {
                    "done": True,
                    "result": ModelResponse(
                        explanation=explanation,
                        repo=f"{owner}/{repo}",
                        cache=False,
                        timestamp=utils.date_now(),
                        default_branch=default_branch,
                    ),
                }
            )
    except Exception as e:
        utils.logger.exception("Stream pipeline error: %s", e)
        track_event(request, owner, repo, "stream", "error")
        queue.put_nowait({"error": str(e)})


async def _stream_generator(
    owner: str,
    repo: str,
    ref: Optional[str],
    instructions: Optional[str],
    request: Request,
) -> Any:
    """Yield SSE events: status (stage), then result or error."""
    yield _sse_event("status", {"stage": "validating"})
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"https://github.com/{owner}/{repo}")
            res.raise_for_status()
    except httpx.HTTPStatusError as e:
        status_code = e.response.status_code
        error_messages = {
            403: f"Repository '{owner}/{repo}' is private or access is forbidden.",
            404: f"Repository '{owner}/{repo}' not found. Please check the owner and repository name.",
            429: "Too many requests to GitHub. Please try again later.",
        }
        detail = error_messages.get(status_code, f"Error accessing repository (HTTP {status_code})")
        yield _sse_event("error", {"detail": detail})
        return
    except Exception:
        yield _sse_event("error", {"detail": "Could not validate repository."})
        return

    queue: asyncio.Queue = asyncio.Queue()
    task = asyncio.create_task(_run_stream_pipeline(owner, repo, ref, instructions, request, queue))

    try:
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=300.0)
            except asyncio.TimeoutError:
                yield _sse_event("error", {"detail": "Request timed out."})
                break

            if isinstance(item, str):
                yield _sse_event("status", {"stage": item})
            elif isinstance(item, dict):
                if item.get("error"):
                    yield _sse_event("error", {"detail": item["error"]})
                    break
                if item.get("done") and "result" in item:
                    result = item["result"]
                    data = result.model_dump()
                    data["timestamp"] = result.timestamp.isoformat()
                    yield _sse_event("result", data)
                    break
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


@app.websocket("/{owner}/{repo}/chat")
async def chat_websocket(
    websocket: WebSocket,
    owner: str,
    repo: str,
):
    """
    Stateless WebSocket endpoint for chatting about a repository.

    Client sends JSON:
    {
      "type": "message",
      "content": "...",
      "history": [{"role": "user"|"assistant", "content": "..."}],
      "explanation": "...",
      "style": "normal"|"caveman",
      "github_token": "..."  // optional; prefer server GITHUB_TOKEN when available
    }
    """
    if not _is_allowed_ws_origin(websocket.headers.get("origin")):
        await websocket.close(code=1008, reason="Origin not allowed")
        return

    await websocket.accept()
    client_ip = websocket.client.host if websocket.client else "unknown"
    messages_processed = 0

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "detail": "Invalid JSON"})
                continue

            msg_type = data.get("type")
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if msg_type != "message":
                await websocket.send_json({"type": "error", "detail": f"Unknown message type: {msg_type}"})
                continue

            messages_processed += 1
            if messages_processed > env.CHAT_WS_MAX_MESSAGES_PER_CONNECTION:
                await websocket.send_json(
                    {
                        "type": "error",
                        "detail": "Chat message limit reached for this connection. Please reconnect to continue.",
                    }
                )
                await websocket.close(code=1008, reason="Connection chat limit reached")
                return

            if _is_chat_rate_limited(client_ip):
                await websocket.send_json(
                    {
                        "type": "error",
                        "detail": "Chat rate limit exceeded. Please try again shortly.",
                    }
                )
                continue

            try:
                content = (data.get("content") or "").strip()
                explanation = (data.get("explanation") or "").strip()
                history = _validate_chat_history(data.get("history"))
                style = _validate_chat_style(data.get("style"))
                request_github_token = data.get("github_token")
                if request_github_token is not None and not isinstance(request_github_token, str):
                    raise ValueError("GitHub token must be a string when provided.")
            except ValueError as e:
                await websocket.send_json({"type": "error", "detail": str(e)})
                continue

            if not content:
                await websocket.send_json({"type": "error", "detail": "Message cannot be empty."})
                continue
            if len(content) > env.CHAT_MAX_MESSAGE_LENGTH:
                await websocket.send_json(
                    {
                        "type": "error",
                        "detail": f"Message too long. Maximum {env.CHAT_MAX_MESSAGE_LENGTH} characters.",
                    }
                )
                continue
            if not explanation:
                await websocket.send_json(
                    {
                        "type": "error",
                        "detail": "No repository explanation found. Please generate the overview first.",
                    }
                )
                continue

            repo_info = RepoInfo(owner=owner, repo_name=repo)
            github_token = request_github_token or env.GITHUB_TOKEN or None

            async def status_callback(stage: str, detail: Optional[str]) -> None:
                message = {"type": "status", "stage": stage}
                if detail:
                    message["path"] = detail
                await websocket.send_json(message)

            async def tool_call_callback(tool_name: str, detail: str) -> None:
                await websocket.send_json({"type": "tool_call", "tool": tool_name, "path": detail})

            async def chunk_callback(delta: str) -> None:
                await websocket.send_json({"type": "chunk", "delta": delta})

            try:
                async with httpx.AsyncClient() as client:
                    github = GitHubTools(client, github_token=github_token)
                    tree = await github.fetch_directory_tree_with_depth(repo_info, depth=3)
                    response_text = await chat_service.chat_with_repo(
                        repo=repo_info,
                        session_history=history,
                        user_message=content,
                        cached_explanation=explanation,
                        directory_tree=tree,
                        github=github,
                        status_callback=status_callback,
                        tool_call_callback=tool_call_callback,
                        style=style,
                        chunk_callback=chunk_callback,
                    )

                await websocket.send_json({"type": "result", "message": response_text})
            except Exception as e:
                utils.logger.exception("Chat pipeline error for %s/%s from %s: %s", owner, repo, client_ip, e)
                await websocket.send_json({"type": "error", "detail": _user_facing_error(str(e))})
    except WebSocketDisconnect:
        utils.logger.info("Chat WebSocket disconnected: %s/%s from %s", owner, repo, client_ip)
    except Exception as e:
        utils.logger.exception("WebSocket error: %s", e)
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except Exception:
            pass


@app.get(
    "/{owner}/{repo}/stream",
    responses={
        403: {"description": "Repository is private or GitHub rate limit exceeded"},
        404: {"description": "Repository not found"},
        500: {"description": "Internal server error"},
    },
)
@limiter.limit("20/day")
async def explain_repo_stream(
    request: Request,
    owner: str,
    repo: str,
    ref: Optional[str] = None,
    instructions: Optional[str] = Query(None),
):
    """SSE endpoint: streams status events then result or error."""
    return StreamingResponse(
        _stream_generator(owner, repo, ref, instructions, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    )
