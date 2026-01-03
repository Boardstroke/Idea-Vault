"""Logging configuration."""

import logging
import sys


def setup_logging(name: str = None, level: int = logging.INFO):
    """
    Setup logging for spending forecast.

    Args:
        name: Optional logger name (None for root)
        level: Logging level
    """
    # Configure basic logging if not already configured
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        stream=sys.stdout,
    )

    logger = logging.getLogger(name)
    logger.setLevel(level)

    return logger
