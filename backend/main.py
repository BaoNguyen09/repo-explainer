import asyncio
from collections import defaultdict, deque
import json
import re
import time
from typing import Any, Optional

import httpx
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.datastructures import Headers
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from posthog import Posthog

from backend import GitHubTools
from backend import ai_service
from backend import chat_service
from backend import env, job_registry, utils
from backend.schema import ModelResponse, RepoInfo, SuggestedQuestionsRequest

# —— PostHog analytics (no-op when API key is absent) ——
posthog_client: Posthog | None = None
if env.POSTHOG_API_KEY:
    posthog_client = Posthog(env.POSTHOG_API_KEY, host=env.POSTHOG_HOST)


# posthog-js anonymous IDs are UUID-like; anything outside this shape is
# untrusted input on a public endpoint and must not become a PostHog person.
_DISTINCT_ID_RE = re.compile(r"[A-Za-z0-9._-]{1,64}")


def _analytics_distinct_id(query_params: Any, client_ip: str) -> str:
    """Pick the PostHog identity for a backend event.

    The frontend passes its posthog-js distinct_id as a `distinct_id` query
    param (EventSource and WebSocket cannot set custom headers), so backend
    events attach to the same PostHog person as the browser's events.
    Falls back to the client IP when no usable distinct_id was provided.
    Never raises: analytics must not break the request path.
    """
    try:
        candidate = (query_params.get("distinct_id") or "").strip()
        if _DISTINCT_ID_RE.fullmatch(candidate):
            return candidate
    except Exception:
        pass
    return client_ip


def track_event(
    request: Request,
    owner: str,
    repo: str,
    endpoint: str,
    status_name: str,
    duration_ms: Optional[float] = None,
    time_to_first_event_ms: Optional[float] = None,
    tree_file_count: Optional[int] = None,
    files_read_count: Optional[int] = None,
    files_failed_count: Optional[int] = None,
    explanation_chars: Optional[int] = None,
    instructions_present: Optional[bool] = None,
    error_stage: Optional[str] = None,
    error_type: Optional[str] = None,
) -> None:
    """Record a repo_explained event in PostHog (no-op if client is disabled)."""
    if not posthog_client:
        return
    try:
        client_ip = get_remote_address(request)
        posthog_client.capture(
            distinct_id=_analytics_distinct_id(request.query_params, client_ip),
            event="repo_explained",
            properties={
                "client_ip": client_ip,
                "owner": owner,
                "repo": repo,
                "repo_full": f"{owner}/{repo}",
                "endpoint": endpoint,
                "status": status_name,
                "duration_ms": duration_ms,
                "time_to_first_event_ms": time_to_first_event_ms,
                "provider": env.AI_PROVIDER,
                "model": env.MODEL,
                "tree_file_count": tree_file_count,
                "files_read_count": files_read_count,
                "files_failed_count": files_failed_count,
                "explanation_chars": explanation_chars,
                "instructions_present": instructions_present,
                "error_stage": error_stage,
                "error_type": error_type,
            },
        )
    except Exception:
        utils.logger.exception("track_event: failed to capture repo_explained")


def _track_chat_session_started(distinct_id: str, client_ip: str, owner: str, repo: str) -> None:
    """Record a chat_session_started event in PostHog (no-op if client is disabled)."""
    if not posthog_client:
        return
    try:
        posthog_client.capture(
            distinct_id=distinct_id,
            event="chat_session_started",
            properties={
                "client_ip": client_ip,
                "owner": owner,
                "repo": repo,
                "repo_full": f"{owner}/{repo}",
            },
        )
    except Exception:
        utils.logger.exception("track_event: failed to capture chat_session_started")


def _track_chat_message(
    distinct_id: str,
    client_ip: str,
    owner: str,
    repo: str,
    message_index: int,
    style: str,
    status_name: str,
    time_to_first_token_ms: Optional[float],
    total_ms: float,
    response_chars: int,
) -> None:
    """Record a chat_message event in PostHog (no-op if client is disabled). Metadata only, never message content."""
    if not posthog_client:
        return
    try:
        posthog_client.capture(
            distinct_id=distinct_id,
            event="chat_message",
            properties={
                "client_ip": client_ip,
                "repo_full": f"{owner}/{repo}",
                "message_index": message_index,
                "style": style,
                "provider": env.AI_PROVIDER,
                "status": status_name,
                "time_to_first_token_ms": time_to_first_token_ms,
                "total_ms": total_ms,
                "response_chars": response_chars,
            },
        )
    except Exception:
        utils.logger.exception("track_event: failed to capture chat_message")


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


def _sliding_window_exceeded(bucket: deque[float], limit: int, window_seconds: int) -> bool:
    """Drop timestamps older than the window; record and admit unless at the limit."""
    now = time.monotonic()
    window = max(window_seconds, 1)
    limit = max(limit, 1)

    while bucket and now - bucket[0] > window:
        bucket.popleft()

    if len(bucket) >= limit:
        return True

    bucket.append(now)
    return False


def _is_chat_rate_limited(client_id: str) -> bool:
    """Sliding-window limiter for paid chat turns across WebSocket connections."""
    return _sliding_window_exceeded(
        _chat_rate_windows[client_id],
        env.CHAT_WS_RATE_LIMIT_MESSAGES,
        env.CHAT_WS_RATE_LIMIT_WINDOW_SECONDS,
    )


def _is_explain_rate_limited(client_id: str) -> bool:
    """Sliding-window limiter counting only *new* explain jobs.

    Applied in code rather than as a slowapi decorator because reconnecting to
    an already-running job must be free: a user who reloads the page five times
    while one repo is being explained should not burn five days' worth of quota.
    """
    return _sliding_window_exceeded(
        _explain_rate_windows[client_id],
        env.EXPLAIN_RATE_LIMIT_JOBS,
        env.EXPLAIN_RATE_LIMIT_WINDOW_SECONDS,
    )


limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

origins = [origin.strip() for origin in env.CORS_ORIGINS.split(",") if origin.strip()]
_chat_rate_windows: dict[str, deque[float]] = defaultdict(deque)
_explain_rate_windows: dict[str, deque[float]] = defaultdict(deque)

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
    start = time.perf_counter()
    instructions_present = bool(instructions and instructions.strip())
    tree_file_count: Optional[int] = None
    files_read_count: Optional[int] = None
    files_failed_count: Optional[int] = None
    explanation_chars: Optional[int] = None
    stage = "github_validation"  # advanced as the pipeline progresses; reported on error
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
            stage = "context_fetch"
            repo_content, success, tree_file_count, files_read_count, files_failed_count = await github.get_repo_context(repo_info)
            if not success:
                raise HTTPException(status_code=500, detail="Failed to fetch repository context")

            stage = "ai_generation"
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

            explanation_chars = len(explanation)
            duration_ms = (time.perf_counter() - start) * 1000
            track_event(
                request, owner, repo, "explain", "success",
                duration_ms=duration_ms,
                tree_file_count=tree_file_count,
                files_read_count=files_read_count,
                files_failed_count=files_failed_count,
                explanation_chars=explanation_chars,
                instructions_present=instructions_present,
            )

            suggested_questions: list[str] = []
            try:
                tree = await github.fetch_directory_tree_with_depth(repo_info, depth=3)
                suggested_questions = await ai_service.suggest_questions(explanation, tree)
            except Exception:
                utils.logger.exception("Failed to generate suggested questions for %s/%s", owner, repo)

            return ModelResponse(
                explanation=explanation,
                repo=f"{owner}/{repo}",
                cache=False,
                timestamp=utils.date_now(),
                default_branch=default_branch,
                suggested_questions=suggested_questions,
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

        duration_ms = (time.perf_counter() - start) * 1000
        track_event(
            request, owner, repo, "explain", "error",
            duration_ms=duration_ms,
            tree_file_count=tree_file_count,
            files_read_count=files_read_count,
            explanation_chars=explanation_chars,
            instructions_present=instructions_present,
            error_stage=stage,
            error_type=f"HTTP{status_code}",
        )
        raise HTTPException(
            status_code=status_code if status_code < 500 else 500,
            detail=detail,
        )
    except Exception as e:
        utils.logger.exception("Error in explain_repo(): %s", e)
        duration_ms = (time.perf_counter() - start) * 1000
        track_event(
            request, owner, repo, "explain", "error",
            duration_ms=duration_ms,
            tree_file_count=tree_file_count,
            files_read_count=files_read_count,
            explanation_chars=explanation_chars,
            instructions_present=instructions_present,
            error_stage=stage,
            error_type=type(e).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred internally on the server",
        )


class _RequestSnapshot:
    """The parts of a Request a detached explain job still needs after it returns.

    A background job outlives the HTTP request that started it, and a Starlette
    Request is tied to that connection's scope, so the job copies out the client
    IP, headers, and query params it needs for the GitHub token and analytics
    instead of holding the live object. Shaped like a Request only where
    `track_event`/`get_remote_address` look.
    """

    __slots__ = ("client", "headers", "query_params")

    def __init__(self, request: Request) -> None:
        self.client = request.client
        # Headers (not a plain dict) so case-insensitive lookups like
        # "X-GitHub-Token" keep working the way they do on a real Request.
        self.headers = Headers(raw=list(request.headers.raw))
        self.query_params = dict(request.query_params)


def _sse_event(event_type: str, data: Any) -> str:
    """Format one SSE event (event type + data line, double newline)."""
    payload = json.dumps(data) if not isinstance(data, str) else data
    return f"event: {event_type}\ndata: {payload}\n\n"


async def _run_stream_pipeline(
    owner: str,
    repo: str,
    ref: Optional[str],
    instructions: Optional[str],
    request: Any,
    queue: Any,
) -> None:
    """Run get_repo_context + explain_repo and push status/result/error to queue.

    `request` is a `_RequestSnapshot` in production (the job outlives the real
    Request) and `queue` is an `ExplainJob`, which quacks like an asyncio.Queue
    so this pipeline is identical whether or not anyone is currently listening.
    """
    start = time.perf_counter()
    instructions_present = bool(instructions and instructions.strip())
    first_event_ms: Optional[float] = None
    tree_file_count: Optional[int] = None
    files_read_count: Optional[int] = None
    files_failed_count: Optional[int] = None
    pipeline_stage = "github_validation"  # advanced as the pipeline progresses; reported on error
    try:
        async with httpx.AsyncClient() as client:
            repo_info = RepoInfo(owner=owner, repo_name=repo)
            github_token = request.headers.get("X-GitHub-Token") or env.GITHUB_TOKEN
            if github_token == "":
                github_token = None
            github = GitHubTools(client, github_token=github_token, ref=ref)
            default_branch = await github.get_default_branch(repo_info)

            def status_callback(stage: str) -> None:
                nonlocal first_event_ms
                if first_event_ms is None:
                    first_event_ms = (time.perf_counter() - start) * 1000
                queue.put_nowait(stage)

            pipeline_stage = "context_fetch"
            repo_content, success, tree_file_count, files_read_count, files_failed_count = await github.get_repo_context(
                repo_info, status_callback=status_callback
            )
            if not success:
                track_event(
                    request, owner, repo, "stream", "error",
                    duration_ms=(time.perf_counter() - start) * 1000,
                    time_to_first_event_ms=first_event_ms,
                    tree_file_count=tree_file_count,
                    files_read_count=files_read_count,
                    instructions_present=instructions_present,
                    error_stage=pipeline_stage,
                )
                queue.put_nowait({"error": "Failed to fetch repository context"})
                return

            pipeline_stage = "ai_generation"
            explanation, success = await ai_service.explain_repo(
                repo_info,
                repo_content,
                instructions=instructions,
                status_callback=status_callback,
            )
            if not success:
                track_event(
                    request, owner, repo, "stream", "error",
                    duration_ms=(time.perf_counter() - start) * 1000,
                    time_to_first_event_ms=first_event_ms,
                    tree_file_count=tree_file_count,
                    files_read_count=files_read_count,
                    instructions_present=instructions_present,
                    error_stage=pipeline_stage,
                )
                queue.put_nowait({"error": _user_facing_error(explanation or "Failed to generate explanation")})
                return

            duration_ms = (time.perf_counter() - start) * 1000
            track_event(
                request, owner, repo, "stream", "success",
                duration_ms=duration_ms,
                time_to_first_event_ms=first_event_ms,
                tree_file_count=tree_file_count,
                files_read_count=files_read_count,
                files_failed_count=files_failed_count,
                explanation_chars=len(explanation),
                instructions_present=instructions_present,
            )

            # Chat suggestions are fetched separately by the client (POST
            # /{owner}/{repo}/suggested-questions) right after this event lands,
            # instead of being generated here — that used to add an extra tree
            # fetch + LLM call to every explain request before the overview
            # could even be shown.
            queue.put_nowait(
                {
                    "done": True,
                    "result": ModelResponse(
                        explanation=explanation,
                        repo=f"{owner}/{repo}",
                        cache=False,
                        timestamp=utils.date_now(),
                        default_branch=default_branch,
                        suggested_questions=[],
                    ),
                }
            )
    except Exception as e:
        utils.logger.exception("Stream pipeline error: %s", e)
        duration_ms = (time.perf_counter() - start) * 1000
        track_event(
            request, owner, repo, "stream", "error",
            duration_ms=duration_ms,
            time_to_first_event_ms=first_event_ms,
            tree_file_count=tree_file_count,
            files_read_count=files_read_count,
            instructions_present=instructions_present,
            error_stage=pipeline_stage,
            error_type=type(e).__name__,
        )
        queue.put_nowait({"error": str(e)})


async def _validate_repo_exists(owner: str, repo: str) -> Optional[str]:
    """Return a user-facing error message if the repo can't be reached, else None."""
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"https://github.com/{owner}/{repo}")
            res.raise_for_status()
        return None
    except httpx.HTTPStatusError as e:
        status_code = e.response.status_code
        error_messages = {
            403: f"Repository '{owner}/{repo}' is private or access is forbidden.",
            404: f"Repository '{owner}/{repo}' not found. Please check the owner and repository name.",
            429: "Too many requests to GitHub. Please try again later.",
        }
        return error_messages.get(status_code, f"Error accessing repository (HTTP {status_code})")
    except Exception:
        return "Could not validate repository."


async def _stream_generator(
    owner: str,
    repo: str,
    ref: Optional[str],
    instructions: Optional[str],
    request: Request,
    resume: bool = False,
) -> Any:
    """Yield SSE events: status (stage), then result or error.

    The connection attaches to a job rather than owning one. If a job for this
    repo is already running it is followed from where it is (replaying the
    stages already emitted), and when this connection goes away the job keeps
    running — so a reload re-attaches instead of paying for the work twice, and
    a user who moves on to another repo doesn't abort the first one.

    `resume` marks a reconnect from a client that believes it already has a job
    in flight; it is what lets a *just-finished* job still deliver its result,
    while a normal submit (or an explicit regenerate) always starts fresh.
    """
    key = job_registry.job_key(owner, repo, ref, instructions)
    job = job_registry.find(key)
    started_here = False

    if job is None or (job.done and not resume):
        # Charged before the outbound GitHub call, not after: validation is the
        # expensive part of a rejected request, so checking quota afterwards
        # would let a caller drive unlimited github.com traffic for free.
        if _is_explain_rate_limited(get_remote_address(request)):
            yield _sse_event("error", {"detail": "Rate limit exceeded. Please try again later."})
            return

        # Validate before a job exists so a bad URL fails fast and cheaply.
        yield _sse_event("status", {"stage": "validating"})
        detail = await _validate_repo_exists(owner, repo)
        if detail:
            yield _sse_event("error", {"detail": detail})
            return

        snapshot = _RequestSnapshot(request)

        async def runner(new_job: job_registry.ExplainJob) -> None:
            await _run_stream_pipeline(owner, repo, ref, instructions, snapshot, new_job)

        job = job_registry.start(key, owner, repo, runner)
        started_here = True

    queue = job.subscribe()
    if started_here:
        # Seeded after subscribing so this connection — which was handed the
        # event directly above — doesn't see it twice, while a later reconnect
        # still replays the full stage sequence from the beginning.
        job.seed("validating")

    try:
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=300.0)
            except asyncio.TimeoutError:
                # Only this connection gives up; the job stays alive so the
                # client can reconnect and pick the result back up.
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
        job.unsubscribe(queue)


@app.post("/{owner}/{repo}/suggested-questions")
@limiter.limit("60/day")
async def suggested_questions(
    request: Request,
    owner: str,
    repo: str,
    body: SuggestedQuestionsRequest,
):
    """Suggest 3 short follow-up questions for a repo's chat, based on its explanation."""
    explanation = (body.explanation or "").strip()
    if not explanation:
        raise HTTPException(status_code=400, detail="Explanation is required.")
    questions = await ai_service.suggest_questions(explanation)
    return {"questions": questions}


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
    distinct_id = _analytics_distinct_id(websocket.query_params, client_ip)
    messages_processed = 0
    _track_chat_session_started(distinct_id, client_ip, owner, repo)

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

            msg_start = time.perf_counter()
            first_chunk_ms: Optional[float] = None

            async def chunk_callback(delta: str, _msg_start: float = msg_start) -> None:
                nonlocal first_chunk_ms
                if first_chunk_ms is None:
                    first_chunk_ms = (time.perf_counter() - _msg_start) * 1000
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
                _track_chat_message(
                    distinct_id, client_ip, owner, repo, messages_processed, style, "success",
                    first_chunk_ms, (time.perf_counter() - msg_start) * 1000, len(response_text),
                )
            except Exception as e:
                utils.logger.exception("Chat pipeline error for %s/%s from %s: %s", owner, repo, client_ip, e)
                await websocket.send_json({"type": "error", "detail": _user_facing_error(str(e))})
                _track_chat_message(
                    distinct_id, client_ip, owner, repo, messages_processed, style, f"error:{type(e).__name__}",
                    first_chunk_ms, (time.perf_counter() - msg_start) * 1000, 0,
                )
    except WebSocketDisconnect:
        utils.logger.info("Chat WebSocket disconnected: %s/%s from %s", owner, repo, client_ip)
    except Exception as e:
        utils.logger.exception("WebSocket error: %s", e)
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except Exception:
            pass
    finally:
        # WS handlers bypass the HTTP flush middleware, so flush explicitly here.
        if posthog_client:
            try:
                posthog_client.flush()
            except Exception:
                utils.logger.exception("chat_websocket: failed to flush PostHog events")


@app.get(
    "/{owner}/{repo}/stream",
    responses={
        403: {"description": "Repository is private or GitHub rate limit exceeded"},
        404: {"description": "Repository not found"},
        500: {"description": "Internal server error"},
    },
)
@limiter.limit(env.EXPLAIN_STREAM_REQUEST_RATE_LIMIT)
async def explain_repo_stream(
    request: Request,
    owner: str,
    repo: str,
    ref: Optional[str] = None,
    instructions: Optional[str] = Query(None),
    resume: bool = Query(False),
):
    """SSE endpoint: streams status events then result or error.

    Two limits apply, because connection count and work done are no longer the
    same thing once a job outlives its connection:

    * the decorator caps *requests*, including reconnects, so attaching to an
      existing job can't be used to open connections without bound;
    * `_is_explain_rate_limited` caps *new jobs* (see `_stream_generator`), so
      reloading during a long run costs nothing against the daily budget.

    The decorator's limit is therefore a burst ceiling, not a daily quota.
    """
    return StreamingResponse(
        _stream_generator(owner, repo, ref, instructions, request, resume=resume),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    )
