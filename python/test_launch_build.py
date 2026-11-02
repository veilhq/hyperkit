"""Unit tests for launch_build. Run: python .hyperspace/.hyperkit/python/test_launch_build.py -v"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import launch_build  # noqa: E402


class WithNoticeTests(unittest.TestCase):
    def test_no_message_leaves_page_unchanged(self):
        self.assertEqual(launch_build.with_notice("<body>x</body>", None), "<body>x</body>")

    def test_toast_script_lands_before_body_close_and_escapes_closing_tags(self):
        page = launch_build.with_notice("<body>x</body>", "bad </script> value")
        self.assertIn("HvToast.show", page)
        self.assertLess(page.index("HvToast.show"), page.index("</body>"))
        self.assertEqual(page.count("</script>"), 1)

    def test_page_without_body_close_gets_script_appended(self):
        self.assertTrue(launch_build.with_notice("<p>x</p>", "m").endswith("</script>"))


if __name__ == "__main__":
    unittest.main()
