import logging
import env

__all__ = [
    "logger"
]
# Set up logging configuration
_level = logging._nameToLevel.get(env.LOGGER_LEVEL, "INFO")
logging.basicConfig(level=_level)
logger = logging.getLogger(__name__)