"""
env vars.
"""

import os
from dotenv import load_dotenv

load_dotenv()

LOGGER_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")
