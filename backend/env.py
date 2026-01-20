"""
env vars.
"""

import os
from dotenv import load_dotenv

load_dotenv()

LOGGER_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")
ANTHROPIC_API_KEY: str = os.environ.get("ANTHROPIC_API_KEY", "")
TZ: str = os.environ.get("TZ", "UTC")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")

# CORS origins - comma-separated list of allowed origins
# Default: localhost for development
CORS_ORIGINS: str = os.environ.get("CORS_ORIGINS", "http://localhost:5173")