from datetime import datetime
import logging
from zoneinfo import ZoneInfo
import env

__all__ = [
    "date_now",
    "logger"
]
# Set up logging configuration
_level = logging._nameToLevel.get(env.LOGGER_LEVEL, "INFO")
logging.basicConfig(level=_level)
logger = logging.getLogger(__name__)

def date_now(timezone_name: str = env.TZ) -> datetime:
    """Creates a TZ-aware instance of datetime.now()"""
    return datetime.now(ZoneInfo(timezone_name))