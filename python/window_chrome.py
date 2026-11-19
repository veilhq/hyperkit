"""
Hyper Ecosystem - Shared Windows window chrome

Applies the dark title bar and the app icon to a top-level PyWebView window.
Every desktop app in the ecosystem calls this once its window exists:

    from window_chrome import apply_window_chrome
    apply_window_chrome("Hyperline", ICON_FILE, logger)

The icon is loaded twice, once per WM_SETICON slot, at the sizes Windows
expects for the window's current DPI. Each load picks the closest frame from
the multi-size .ico, so the taskbar and Alt+Tab get a frame that is already
the right size instead of a small one stretched up. Windows-only; a no-op
elsewhere. Never raises.
"""

import logging
import sys
from pathlib import Path

_DWMWA_USE_IMMERSIVE_DARK_MODE = 20
_IMAGE_ICON = 1
_LR_LOADFROMFILE = 0x0010
_WM_SETICON = 0x0080
_ICON_SMALL = 0
_ICON_BIG = 1
_SM_CXICON = 11
_SM_CXSMICON = 49
_DEFAULT_DPI = 96

_log = logging.getLogger("window_chrome")


def icon_sizes_for_dpi(dpi):
    """Return (small, big) icon edge lengths in pixels for a DPI value."""
    import ctypes

    user32 = ctypes.windll.user32
    return (
        user32.GetSystemMetricsForDpi(_SM_CXSMICON, dpi),
        user32.GetSystemMetricsForDpi(_SM_CXICON, dpi),
    )


def set_window_icon(hwnd, icon_path, logger=None):
    """Set the small and big icons of `hwnd` from a multi-size .ico file.

    Returns True when both slots were set.
    """
    import ctypes

    log = logger or _log
    user32 = ctypes.windll.user32
    user32.LoadImageW.restype = ctypes.c_void_p
    dpi = user32.GetDpiForWindow(hwnd) or _DEFAULT_DPI
    small, big = icon_sizes_for_dpi(dpi)
    applied = 0
    for slot, dim in ((_ICON_SMALL, small), (_ICON_BIG, big)):
        hicon = user32.LoadImageW(0, str(icon_path), _IMAGE_ICON, dim, dim, _LR_LOADFROMFILE)
        if hicon:
            user32.SendMessageW(hwnd, _WM_SETICON, slot, ctypes.c_void_p(hicon))
            applied += 1
        else:
            log.warning("window icon: failed to load %dpx frame from %s", dim, icon_path)
    log.info("window icon: %d/2 slots set at %d dpi (%dpx, %dpx) from %s",
             applied, dpi, small, big, Path(icon_path).name)
    return applied == 2


def apply_window_chrome(title, icon_path=None, logger=None):
    """Give the window titled `title` a dark title bar and, if given, its icon.

    Returns True when the window was found. Missing icon files are logged and
    skipped; failures never propagate to the caller.
    """
    if sys.platform != "win32":
        return False
    log = logger or _log
    try:
        import ctypes

        hwnd = ctypes.windll.user32.FindWindowW(None, title)
        if not hwnd:
            log.warning("window chrome skipped: no window titled %r yet", title)
            return False

        val = ctypes.c_int(1)
        hr = ctypes.windll.dwmapi.DwmSetWindowAttribute(
            hwnd, _DWMWA_USE_IMMERSIVE_DARK_MODE, ctypes.byref(val), ctypes.sizeof(val)
        )
        if hr != 0:
            log.warning("dark title bar request returned HRESULT 0x%08x", hr & 0xFFFFFFFF)

        if icon_path:
            if Path(icon_path).exists():
                set_window_icon(hwnd, icon_path, log)
            else:
                log.warning("window icon missing: %s", icon_path)
        return True
    except Exception:
        log.exception("window chrome failed for %r", title)
        return False
