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


class SemanticRules(unittest.TestCase):
    def test_bare_hue_flagged_outside_tone_definitions(self):
        self.assertEqual(categories(".a { color: var(--warm); border-color: var(--cool); }"), ["hue", "hue"])
        self.assertEqual(categories(".a { --badge-tone: var(--comp); color: var(--badge-tone); }"), [])
        self.assertEqual(categories(".highlight .k { color: var(--warm); }"), [])
        self.assertEqual(categories(".a { color: var(--warm); /* design-lint: allow - clock */ }"), [])
        self.assertEqual(categories(".a { color: var(--warm-ish); }"), [])

    def test_hover_lift_on_hovered_element(self):
        self.assertEqual(categories(".a:hover { transform: translateY(-2px); }"), ["hover-lift"])
        self.assertEqual(categories(".a, .b:hover:not(.c) { transform: scale(1.02); }"), ["hover-lift"])
        self.assertEqual(categories(".a:hover { translate: 0 -1px; }"), ["hover-lift"])

    def test_hover_reveal_and_non_hover_transforms_pass(self):
        self.assertEqual(categories(".a:hover::after { transform: scaleX(1); }"), [])
        self.assertEqual(categories(".a:hover .b { transform: rotate(90deg) scaleX(1); }"), [])
        self.assertEqual(categories(".a:hover { transform: rotate(90deg); }"), [])
        self.assertEqual(categories(".a.open { transform: translateY(0); }"), [])

    def test_raw_fallback_for_defined_token(self):
        name = next(iter(design_lint.TOKENS))
        self.assertEqual(categories(f".a {{ padding: var({name}, 0.35rem); }}"), ["fallback"])
        self.assertEqual(categories(f".a {{ color: var({name}, var(--text)); }}"), [])
        self.assertEqual(categories(".a { opacity: var(--i, 0); }"), [])

    def test_raw_z_index(self):
        self.assertEqual(categories(".a { z-index: 9000; } .b { z-index: 10; }"), ["z-index", "z-index"])
        self.assertEqual(categories(".a { z-index: -1; } .b { z-index: 2; } .c { z-index: var(--z-modal); }"), [])


class InlineAndScriptStyles(unittest.TestCase):
    def lint_html(self, html):
        fixture = Path(__file__).with_name("_lint_fixture.html")
        try:
            fixture.write_text(html, encoding="utf-8")
            return sorted((v.category, v.line) for v in design_lint.lint_file(fixture))
        finally:
            fixture.unlink()

    def test_inline_style_attribute_flagged_with_line(self):
        html = '<p>\n<div style="padding:0.5rem;color:#ccc;width:11px">x</div>'
        self.assertEqual(self.lint_html(html), [("color", 2), ("spacing", 2)])

    def test_tokenized_inline_style_and_data_style_pass(self):
        html = '<div style="gap:var(--space-2);display:none" data-style="padding:4px"></div>'
        self.assertEqual(self.lint_html(html), [])

    def test_css_text_concatenation_is_scanned(self):
        html = "<script>\nel.style.cssText = 'gap:0.5rem;border-left:2px solid ' + c +\n  ';color:#fff';\n</script>"
        self.assertEqual(self.lint_html(html), [("color", 3), ("spacing", 2)])

    def test_style_attribute_inside_js_template(self):
        html = "<script>\nvar h = `<i style=\"margin-top:3px\"></i>`;\nvar j = '<b style=\"width:' + w + '%\">';\n</script>"
        self.assertEqual(self.lint_html(html), [("spacing", 2)])

    def test_style_property_assignment_and_export_rules(self):
        html = "<script>\nel.style.letterSpacing = '0.1em';\nel.style.display = 'none';\n" \
               "var css = 'body { color: #000; padding: 2rem; }\\n';\n</script>"
        self.assertEqual(self.lint_html(html), [("color", 4), ("spacing", 4), ("tracking", 2)])

    def test_comments_in_script_do_not_open_strings(self):
        html = "<script>\n// don't pad: 4px\nvar a = 1; el.style.cssText = 'gap:var(--space-1)';\n</script>"
        self.assertEqual(self.lint_html(html), [])

    def test_allow_marker_covers_inline_and_script_styles(self):
        html = '<!-- design-lint: allow - fixed swatch -->\n<i style="color:#fff"></i>\n' \
               "<script>\nel.style.cssText = 'color:#000'; // design-lint: allow - export\n</script>"
        self.assertEqual(self.lint_html(html), [])


class Exemptions(unittest.TestCase):
    def test_allow_marker_same_line_and_line_above(self):
        css = ".a {\n  color: #fff; /* design-lint: allow - blend operand */\n" \
              "  /* design-lint: allow - optical nudge */\n  padding: 1px;\n  gap: 3px;\n}"
        self.assertEqual(categories(css), ["spacing"])

    def test_character_layer_contexts(self):
        css = "@keyframes emote-glow { 0% { text-shadow: 0 0 6px var(--accent); } }\n" \
              ".emote { animation: emote-glow 8s infinite; }"
        self.assertEqual(categories(css), [])

    def test_html_style_blocks_and_script_style_templates_scanned(self):
        html = "<style>\n.a { gap: 4px; }\n</style>\n<script>var s = '<style>.b { color: #000; }</style>';</script>"
        fixture = Path(__file__).with_name("_lint_fixture.html")
        try:
            fixture.write_text(html, encoding="utf-8")
            found = design_lint.lint_file(fixture)
        finally:
            fixture.unlink()
        self.assertEqual([(v.category, v.line) for v in found], [("spacing", 2), ("color", 4)])

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
