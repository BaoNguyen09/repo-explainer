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

# Database-related
DATABASE_URL: str = os.environ.get("DATABASE_URL", "postgresql+psycopg2://repoexplainer:repoexplainer@localhost:5432/repoexplainer")
CACHE_TTL_DAYS: int = int(os.environ.get("CACHE_TTL_DAYS", "7"))