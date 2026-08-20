"""
Hyper Ecosystem — Shared Logging Configuration

Provides a unified logging setup for all hyper ecosystem apps
(Hypervisor, Hyperagent, ACP Bridge). Each app calls setup_logger()
once at startup to get a configured logger with:

- Structured line format: ISO timestamp, level, source, message
- RotatingFileHandler (2 MB × 3 backups)
- All logs written to .hyperspace/.logs/
- A flight recorder that keeps verbose records (TRACE/DEBUG) in memory and
  writes them out only when an ERROR fires, so failure context is always
  captured without paying disk cost or burning rotation in normal operation

Relocated to .hyperkit/python/ (WI-142 Phase 1). A back-compat shim remains
at the old .hyperspace/hyper_logging.py location so existing `sys.path`
inserts pointing at the hyperspace root keep working during the transition.

Usage:
    from hyper_logging import setup_logger
    logger = setup_logger("hyperagent")
    logger.info("Session started")
    logger.error("Connection lost: %s", reason)

To change what is written live without disabling the recorder, use
set_output_level(logger, level) rather than setting handler levels directly.
"""

import collections
import copy
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

# How many sub-threshold records to keep in memory for error context.
# ~400 records spans a full agent turn's worth of JSON-RPC frames at roughly
# 200 KB of RAM.
_RECORDER_CAPACITY = 400


class FlightRecorderHandler(logging.Handler):
    """Ring-buffers verbose records in memory and replays them when an error fires.

    Verbose diagnostics are expensive to keep on disk: TRACE frame dumps bury the
    INFO signal and burn through rotation, so in practice they get left switched
    off and are unavailable at the exact moment something breaks. This handler
    keeps them in memory instead and writes them to `target` only when a record at
    or above `trigger_level` arrives. The context leading up to a failure is
    captured automatically, with no steady-state disk cost and nothing to remember
    to enable.

    Records that `target` already writes on its own are not buffered, so a replay
    never duplicates a line that is in the file already.

    Replayed records keep their original timestamps, so they are appended to the
    file out of chronological order relative to surrounding live lines. Readers
    that sort by timestamp (the Hypervisor log viewer) place them correctly; the
    "[replay]" prefix on each message is what disambiguates them in a raw tail.
    """

    def __init__(self, target, capacity=_RECORDER_CAPACITY, trigger_level=logging.ERROR):
        # Fixed at TRACE: this handler must see everything the logger creates.
        # Use set_output_level() to change what reaches disk live, which leaves
        # this level alone.
        super().__init__(level=TRACE)
        self.target = target
        self.trigger_level = trigger_level
        self.buffer = collections.deque(maxlen=capacity)

    def emit(self, record):
        # logging.handlers.MemoryHandler is deliberately not reused here. Its
        # shouldFlush() also returns True once the buffer is full, which would
        # stream verbose records to disk continuously and defeat the purpose.
        # This buffer is bounded and drops its oldest entry instead.
        try:
            if record.levelno >= self.trigger_level:
                self.replay()
                # The triggering record is not written here — it reaches the file
                # through its own handler, which would otherwise double-log it.
                return
            if record.levelno < self.target.level:
                self.buffer.append(record)
        except Exception:
            self.handleError(record)

    def replay(self):
        """Write the buffered records to the target and clear the buffer."""
        self.acquire()
        try:
            if not self.buffer:
                return
            for record in self.buffer:
                echo = copy.copy(record)
                # Pre-render, then drop args: the message is rebuilt with the
                # prefix, so leaving args in place would re-apply them.
                echo.msg = "[replay] %s" % record.getMessage()
                echo.args = None
                # handle() rather than emit() so the target's filters still apply.
                # It performs no level check, which is what lets a sub-threshold
                # record through.
                self.target.handle(echo)
            self.buffer.clear()
        finally:
            self.release()

    def flush(self):
        # Intentionally a no-op. logging.shutdown() flushes every handler, so
        # writing here would dump the buffer on every clean exit — the opposite
        # of only-on-error.
        pass

    def close(self):
        self.buffer.clear()
        super().close()


def set_output_level(logger, level):
    """Set the threshold for what reaches disk live, preserving the recorder.

    Apps re-assert their configured level after import because setup_logger() is
    idempotent and returns early when handlers already exist. Iterating
    logger.handlers directly would also raise the FlightRecorderHandler's level
    and stop it seeing the verbose records it exists to capture, so route level
    changes through here instead.
    """
    for handler in logger.handlers:
        if isinstance(handler, FlightRecorderHandler):
            continue
        handler.setLevel(level)
    # The logger itself stays wide open so records exist to be buffered.
    logger.setLevel(TRACE)


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
        level: Threshold for what is written to the log file live. The logger
            itself is always opened to TRACE so verbose records still exist for
            the flight recorder to buffer; records below this level reach disk
            only as error context.
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

    # The logger stays wide open regardless of `level` so that verbose records
    # exist for the flight recorder to buffer. `level` governs the file handler,
    # i.e. what is written live.
    logger.setLevel(TRACE)

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

    # Order matters. Handlers run in the order they are added, so the recorder is
    # attached first: on an ERROR it replays its context into the file before the
    # file handler writes the error itself, keeping cause ahead of effect.
    recorder = FlightRecorderHandler(file_handler)
    recorder.setFormatter(formatter)
    logger.addHandler(recorder)
    logger.addHandler(file_handler)

    # Prevent propagation to root logger (avoids duplicate stderr output)
    logger.propagate = False

    return logger
