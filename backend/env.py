"""
env vars.
"""

import os
from dotenv import load_dotenv

load_dotenv()

LOGGER_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")
ANTHROPIC_API_KEY: str = os.environ.get("ANTHROPIC_API_KEY", "")
TZ: str = os.environ.get("TZ", "UTC")
GITHUB_TOKEN: str = os.environ.get("GITHUB_TOKEN", "")
GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")

# Which AI provider to use for explanations and file selection.
# Supported values: "claude" (default), "gemini".
AI_PROVIDER: str = os.environ.get("AI_PROVIDER", "claude")
MODEL: str = os.environ.get("MODEL", "claude-haiku-4-5-20251001")

# CORS origins - comma-separated list of allowed origins
# Default: localhost for development
CORS_ORIGINS: str = os.environ.get("CORS_ORIGINS", "http://localhost:5173")

# PostHog analytics
POSTHOG_API_KEY: str = os.environ.get("POSTHOG_API_KEY", "")
POSTHOG_HOST: str = os.environ.get("POSTHOG_HOST", "https://us.i.posthog.com")

# Database-related
DATABASE_URL: str = os.environ.get("DATABASE_URL", "postgresql+psycopg2://repoexplainer:repoexplainer@localhost:5432/repoexplainer")
CACHE_TTL_DAYS: int = int(os.environ.get("CACHE_TTL_DAYS", "7"))

# Explain jobs (detached background runs; see backend/job_registry.py)
# How long a finished job's result stays replayable to a reconnecting client.
EXPLAIN_JOB_RESULT_TTL_SECONDS: int = int(os.environ.get("EXPLAIN_JOB_RESULT_TTL_SECONDS", "900"))
# How long a still-running job is kept before it is assumed wedged and cancelled.
EXPLAIN_JOB_MAX_RUNTIME_SECONDS: int = int(os.environ.get("EXPLAIN_JOB_MAX_RUNTIME_SECONDS", "600"))
# Sliding-window limit on *new* explain jobs per client. Reconnecting to a job
# already running does not count, so reloading a page costs no quota.
EXPLAIN_RATE_LIMIT_JOBS: int = int(os.environ.get("EXPLAIN_RATE_LIMIT_JOBS", "20"))
EXPLAIN_RATE_LIMIT_WINDOW_SECONDS: int = int(os.environ.get("EXPLAIN_RATE_LIMIT_WINDOW_SECONDS", "86400"))

# Chat
CHAT_MAX_MESSAGE_LENGTH: int = int(os.environ.get("CHAT_MAX_MESSAGE_LENGTH", "1000"))
CHAT_MAX_TOOL_ROUNDS: int = int(os.environ.get("CHAT_MAX_TOOL_ROUNDS", "5"))
CHAT_WS_MAX_MESSAGES_PER_CONNECTION: int = int(os.environ.get("CHAT_WS_MAX_MESSAGES_PER_CONNECTION", "20"))
CHAT_WS_RATE_LIMIT_MESSAGES: int = int(os.environ.get("CHAT_WS_RATE_LIMIT_MESSAGES", "30"))
CHAT_WS_RATE_LIMIT_WINDOW_SECONDS: int = int(os.environ.get("CHAT_WS_RATE_LIMIT_WINDOW_SECONDS", "60"))
AI_SERVICE_MAX_RETRIES: int = int(os.environ.get("AI_SERVICE_MAX_RETRIES", "3"))
