"""Unit tests for window_chrome. Run: python .hyperspace/.hyperkit/python/test_window_chrome.py -v"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import window_chrome  # noqa: E402

ICON = Path(__file__).resolve().parent.parent.parent / ".hyperagent" / "assets" / "hyperagent.ico"


@unittest.skipUnless(sys.platform == "win32", "Windows-only window chrome")
class WindowChromeTests(unittest.TestCase):
    def test_icon_sizes_scale_with_dpi(self):
        self.assertEqual(window_chrome.icon_sizes_for_dpi(96), (16, 32))
        self.assertEqual(window_chrome.icon_sizes_for_dpi(144), (24, 48))

    def test_missing_window_returns_false(self):
        self.assertFalse(window_chrome.apply_window_chrome("no-such-window-for-test", ICON))

    def test_sets_both_icon_slots_at_full_size(self):
        import ctypes
        import tkinter as tk

        user32 = ctypes.windll.user32
        user32.SendMessageW.restype = ctypes.c_void_p
        win = tk.Tk()
        try:
            win.title("window-chrome-test")
            win.update()
            self.assertTrue(window_chrome.apply_window_chrome("window-chrome-test", ICON))
            hwnd = user32.FindWindowW(None, "window-chrome-test")
            small = user32.SendMessageW(hwnd, 0x007F, 0, 0)
            big = user32.SendMessageW(hwnd, 0x007F, 1, 0)
            self.assertTrue(small and big)
            self.assertNotEqual(small, big)
        finally:
            win.destroy()


if __name__ == "__main__":
    unittest.main()
