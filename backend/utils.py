from datetime import datetime, timezone
import logging
from backend import env

__all__ = [
    "date_now",
    "logger"
]
# Set up logging configuration
_level = logging._nameToLevel.get(env.LOGGER_LEVEL, "INFO")
logging.basicConfig(level=_level)
logger = logging.getLogger(__name__)

def date_now() -> datetime:
    """Creates a TZ-aware instance of datetime.now()"""
    return datetime.now(tz=timezone.utc)