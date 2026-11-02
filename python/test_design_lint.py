"""Unit tests for design_lint. Run: python .hyperspace/.hyperkit/python/test_design_lint.py -v"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import design_lint  # noqa: E402

CSS = Path("sample.css")


def categories(css):
    return sorted(v.category for v in design_lint.lint_css(css, CSS))


class TokenizedValuesPass(unittest.TestCase):
    def test_tokens_and_zero_values_are_clean(self):
        css = ".a { padding: var(--space-2) 0; margin: 0 auto; font-size: var(--fs-sm); " \
              "transition: color var(--motion-fast) var(--ease); border-radius: 50%; gap: 0; }"
        self.assertEqual(categories(css), [])

    def test_custom_property_definitions_are_tokens(self):
        self.assertEqual(categories(":root { --sidebar-width: 240px; --tint: #ff0000; }"), [])

    def test_var_fallback_literal_is_ignored(self):
        self.assertEqual(categories(".a { padding: var(--doc-pad, 50px); color: var(--x, #fff); }"), [])

    def test_relative_color_from_token_is_allowed(self):
        self.assertEqual(categories(".a { color: oklch(from var(--interactive) l c h); }"), [])

    def test_data_uri_with_semicolon_and_hash_is_ignored(self):
        css = ".a { background-image: url(\"data:image/svg+xml;utf8,<svg fill='#00ff41'/>\"); padding: var(--space-1); }"
        self.assertEqual(categories(css), [])

    def test_comment_contents_are_ignored(self):
        self.assertEqual(categories("/* padding: 3px; color: #fff; */ .a { color: var(--text); }"), [])


class RawValuesAreFlagged(unittest.TestCase):
    def test_each_governed_axis(self):
        css = (".a { padding: 3px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; "
               "line-height: 1.4; transition: opacity 0.6s; border-radius: 2px; "
               "box-shadow: 0 2px 10px var(--x); color: #ccc; }")
        self.assertEqual(categories(css), sorted([
            "spacing", "font-size", "font-weight", "tracking", "line-height",
            "duration", "radius", "shadow", "color",
        ]))

    def test_font_shorthand_size(self):
        self.assertEqual(categories(".a { font: 0.55rem/1 var(--font); }"), ["font-size"])

    def test_bare_accent_is_flagged_but_roles_and_definitions_are_not(self):
        self.assertEqual(categories(".a { color: var(--accent); border: 1px solid var(--accent-border); }"),
                         ["accent", "accent"])
        self.assertEqual(categories(".a { color: var(--interactive); background: var(--selected-wash); }"), [])
        self.assertEqual(categories(".a { --indicator-color: var(--accent); }"), [])
        self.assertEqual(categories(".a { color: var(--accent-ish); }"), [])

    def test_raw_length_inside_calc(self):
        self.assertEqual(categories(".a { padding: calc(100% - 3rem); }"), ["spacing"])

    def test_named_color_only_on_color_properties(self):
        self.assertEqual(categories(".a { color: white; }"), ["color"])
        self.assertEqual(categories(".a { animation-name: blue-pulse; }"), [])

    def test_reports_selector_and_line(self):
        found = design_lint.lint_css(".a {\n  color: var(--text);\n}\n@media (max-width: 900px) {\n  .b { gap: 4px; }\n}\n", CSS)
        self.assertEqual([(v.line, v.selector, v.prop) for v in found], [(5, ".b", "gap")])


class Exemptions(unittest.TestCase):
    def test_allow_marker_same_line_and_line_above(self):
        css = ".a {\n  color: #fff; /* design-lint: allow - blend operand */\n" \
              "  /* design-lint: allow - optical nudge */\n  padding: 1px;\n  gap: 3px;\n}"
        self.assertEqual(categories(css), ["spacing"])

    def test_character_layer_contexts(self):
        css = "@keyframes emote-glow { 0% { text-shadow: 0 0 6px var(--accent); } }\n" \
              ".emote { animation: emote-glow 8s infinite; }"
        self.assertEqual(categories(css), [])

    def test_html_style_blocks_scanned_but_script_markup_ignored(self):
        html = "<style>\n.a { gap: 4px; }\n</style>\n<script>var s = '<style>.b { color: #000; }</style>';</script>"
        fixture = Path(__file__).with_name("_lint_fixture.html")
        try:
            fixture.write_text(html, encoding="utf-8")
            found = design_lint.lint_file(fixture)
        finally:
            fixture.unlink()
        self.assertEqual([(v.category, v.line) for v in found], [("spacing", 2)])

    def test_report_exits_nonzero_on_violations_and_zero_when_clean(self):
        app = Path(__file__).with_name("_lint_app")
        (app / "assets").mkdir(parents=True, exist_ok=True)
        sheet = app / "assets" / "a.css"
        try:
            sheet.write_text(".a { gap: 4px; }", encoding="utf-8")
            with self.assertRaises(SystemExit) as raised:
                design_lint.report("Fixture", app)
            self.assertEqual(raised.exception.code, 1)
            sheet.write_text(".a { gap: var(--space-1); }", encoding="utf-8")
            design_lint.report("Fixture", app)
        finally:
            sheet.unlink()
            (app / "assets").rmdir()
            app.rmdir()


if __name__ == "__main__":
    unittest.main()
