"""
Hyper Ecosystem — Shared Logging Configuration

Provides a unified logging setup for all hyper ecosystem apps
(Hypervisor, Hyperagent, ACP Bridge). Each app calls setup_logger()
once at startup to get a configured logger with:

- Structured line format: ISO timestamp, level, source, message
- RotatingFileHandler (2 MB × 3 backups)
- All logs written to .hyperspace/.logs/

Relocated to .hyperkit/python/ (WI-142 Phase 1). A back-compat shim remains
at the old .hyperspace/hyper_logging.py location so existing `sys.path`
inserts pointing at the hyperspace root keep working during the transition.

Usage:
    from hyper_logging import setup_logger
    logger = setup_logger("hyperagent")
    logger.info("Session started")
    logger.error("Connection lost: %s", reason)
"""

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

# Custom TRACE level for wire-protocol noise (below DEBUG).
# Use logger.trace(...) for high-volume events like JSON-RPC frame dumps,
# push_js confirmations, streaming session_update rows. Hidden by default;
# enable by setting the logger's level to TRACE (5) or via HYPERAGENT_LOG_LEVEL=TRACE.
TRACE = 5
logging.addLevelName(TRACE, "TRACE")


def _trace(self, message, *args, **kwargs):
    if self.isEnabledFor(TRACE):
        self._log(TRACE, message, args, **kwargs)


logging.Logger.trace = _trace

# This file lives at .hyperspace/.hyperkit/python/hyper_logging.py — logs
# still write to .hyperspace/.logs/, so we go up two levels (python/ ->
# .hyperkit/ -> .hyperspace/) rather than using this file's immediate parent.
LOG_DIR = Path(__file__).parent.parent.parent / ".logs"

# Ensure log directory exists
LOG_DIR.mkdir(exist_ok=True)

# Unified format:
# 2026-07-14T12:15:03.421 [INFO ] [hyperagent.acp] Session loaded
_LOG_FORMAT = "%(asctime)s.%(msecs)03d [%(levelname)-5s] [%(name)s] %(message)s"
_DATE_FORMAT = "%Y-%m-%dT%H:%M:%S"

# Rotation settings
_MAX_BYTES = 2 * 1024 * 1024  # 2 MB
_BACKUP_COUNT = 3


def setup_logger(
    app_name: str,
    *,
    level: int = logging.DEBUG,
    log_dir: Path | None = None,
    max_bytes: int = _MAX_BYTES,
    backup_count: int = _BACKUP_COUNT,
) -> logging.Logger:
    """Configure and return a logger for a hyper ecosystem app.

    Args:
        app_name: Logger name and log filename prefix (e.g., "hyperagent", "bridge", "hypervisor").
        level: Minimum log level (default DEBUG — let the handler capture everything).
        log_dir: Override log directory (default: .hyperspace/.logs/).
        max_bytes: Max file size before rotation (default 2 MB).
        backup_count: Number of rotated backup files to keep (default 3).

    Returns:
        Configured logging.Logger instance.
    """
    target_dir = log_dir or LOG_DIR
    target_dir.mkdir(exist_ok=True)

    logger = logging.getLogger(app_name)

    # Avoid duplicate handlers if setup_logger is called multiple times
    if logger.handlers:
        return logger

    logger.setLevel(level)

    # File handler with rotation
    file_handler = RotatingFileHandler(
        target_dir / f"{app_name}.log",
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8",
    )
    file_handler.setLevel(level)

    formatter = logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT)
    file_handler.setFormatter(formatter)

    logger.addHandler(file_handler)

    # Prevent propagation to root logger (avoids duplicate stderr output)
    logger.propagate = False

    return logger
