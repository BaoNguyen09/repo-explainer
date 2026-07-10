"""Shared retry helpers for transient upstream AI service failures."""

import asyncio
from typing import Awaitable, Callable, TypeVar

import httpx

from backend import env, utils

T = TypeVar("T")

RETRYABLE_ERROR_MARKERS = (
    "429",
    "500",
    "502",
    "503",
    "504",
    "UNAVAILABLE",
    "RESOURCE_EXHAUSTED",
    "TOO MANY REQUESTS",
    "RATE LIMIT",
    "HIGH DEMAND",
    "TRY AGAIN LATER",
    "TIMED OUT",
    "TIMEOUT",
    "CONNECTION RESET",
    "SERVICE UNAVAILABLE",
    "OVERLOADED",
)


def is_retryable_ai_error(exc: Exception) -> bool:
    """Best-effort detection for transient provider/API failures."""
    if isinstance(exc, (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError)):
        return True

    text = str(exc).upper()
    return any(marker in text for marker in RETRYABLE_ERROR_MARKERS)


def _track_retry(event: str, **properties) -> None:
    """Fire-and-forget PostHog capture for retry outcomes (no-op if client disabled).

    Local import avoids a circular import: retry.py <- ai_service.py <- main.py.
    """
    try:
        from backend.main import posthog_client

        if not posthog_client:
            return
        posthog_client.capture(distinct_id="server", event=event, properties=properties)
    except Exception:
        utils.logger.exception("with_ai_retry: failed to capture %s", event)


async def with_ai_retry(
    operation_name: str,
    operation: Callable[[], Awaitable[T]],
    attempts: int | None = None,
) -> T:
    """Retry transient AI failures with short exponential backoff."""
    max_attempts = attempts or env.AI_SERVICE_MAX_RETRIES
    last_error: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            result = await operation()
            if attempt > 1:
                _track_retry("ai_retry_recovered", operation=operation_name, attempts_used=attempt)
            return result
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if not is_retryable_ai_error(exc) or attempt == max_attempts:
                if is_retryable_ai_error(exc) and attempt == max_attempts and max_attempts > 1:
                    _track_retry("ai_retry_exhausted", operation=operation_name, attempts=attempt)
                raise

            delay_s = 0.75 * (2 ** (attempt - 1))
            utils.logger.warning(
                "AI retry: %s failed on attempt %d/%d, retrying in %.2fs: %s",
                operation_name,
                attempt,
                max_attempts,
                delay_s,
                exc,
            )
            await asyncio.sleep(delay_s)

    if last_error is not None:
        raise last_error
    raise RuntimeError(f"{operation_name} failed without raising an exception")
