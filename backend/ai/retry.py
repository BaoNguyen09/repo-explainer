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
            return await operation()
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if not is_retryable_ai_error(exc) or attempt == max_attempts:
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
