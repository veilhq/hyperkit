"""
Design lint - Hyperkit shared Python module.

Flags declarations whose value is a raw literal on a property the design
charter governs (spacing, type size, weight, tracking, line-height, duration,
radius, shadow, color) instead of a token. Custom-property definitions are
tokens and are never flagged; tokens.css is exempt as the token source. A bare
accent-family reference (--accent, -dim, -glow, -border) is also flagged: an
accent mark names its meaning through a role token. Further rules flag a bare
palette hue (--warm, --comp, --cool) outside a custom-property definition, a
translate/scale transform in a :hover rule, a raw literal var() fallback for a
token defined in tokens.css, and a raw z-index other than -1/0/1/2.

Utility pages are linted in three places: <style> blocks, inline style="..."
attributes, and style text built in <script> (cssText, el.style.prop strings,
style attributes in JS templates, and CSS rules in export templates).

Builds run in error mode: any off-scale value fails the build with a one-line
summary. Run directly for the full report:
    python .hyperspace/.hyperkit/python/design_lint.py [-v] [--strict]

A declaration can opt out with a comment containing `design-lint: allow`
on the same line or the line directly above it, stating the reason.
"""
from __future__ import annotations

import argparse
import bisect
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

HYPERKIT_DIR = Path(__file__).resolve().parent.parent
HYPERSPACE_DIR = HYPERKIT_DIR.parent
EXEMPT_FILES = {HYPERKIT_DIR / "css" / "tokens.css"}
ALLOW_MARKER = "design-lint: allow"
# The charter's sanctioned character layer (kaomoji emote glow): openly
# decorative, so its glow and ambient period are not instrument values.
ALLOW_CONTEXTS = {"@keyframes emote-glow", ".emote"}

SPACING_PROPS = {
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "padding-block", "padding-block-start", "padding-block-end",
    "padding-inline", "padding-inline-start", "padding-inline-end",
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "margin-block", "margin-block-start", "margin-block-end",
    "margin-inline", "margin-inline-start", "margin-inline-end",
    "gap", "row-gap", "column-gap",
}
DURATION_PROPS = {
    "transition", "transition-duration", "transition-delay",
    "animation", "animation-duration", "animation-delay",
}
SHADOW_PROPS = {"box-shadow", "text-shadow"}
NAMED_COLOR_PROPS = {
    "color", "background", "background-color", "border", "border-color",
    "border-top", "border-right", "border-bottom", "border-left",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "outline", "outline-color", "fill", "stroke", "caret-color", "accent-color",
    "text-decoration-color", "column-rule-color",
} | SHADOW_PROPS

RAW_LENGTH = re.compile(r"(?<![\w.#-])-?(\d*\.?\d+)(px|rem|em)\b")
RAW_TIME = re.compile(r"(?<![\w.#-])(\d*\.?\d+)(ms|s)\b")
RAW_NUMBER = re.compile(r"(?<![\w.#-])-?(\d*\.?\d+)\b")
HEX_COLOR = re.compile(r"#[0-9a-fA-F]{3,8}\b")
COLOR_FUNC = re.compile(r"\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*(?!from\b)")
NAMED_COLOR = re.compile(r"\b(?:white|black|red|green|blue|gray|grey|yellow|orange|purple|pink)\b", re.I)
WEIGHT_LITERAL = re.compile(r"\b(?:\d{3}|bold|bolder|lighter|normal)\b")
STRIP_FUNC = re.compile(r"\b(?:var|url|env)\(")
# Accent marks must name their meaning through a role token (--interactive, --selected, ...).
BARE_ACCENT = re.compile(r"var\(\s*--accent(?:-dim|-glow|-border)?\s*[,)]")
# Palette hues carry meaning only through a local tone property or a role token.
BARE_HUE = re.compile(r"var\(\s*--(?:warm|comp|cool)\s*[,)]")
HOVER_LIFT = re.compile(r"\b(?:translate[XYZ3d]*|scale[XYZ3d]*)\(", re.I)
VAR_FALLBACK = re.compile(r"var\(\s*(--[\w-]+)\s*,\s*([^\s)]{1,4})")
Z_LITERAL = re.compile(r"-?\d+")
Z_ALLOWED = {"-1", "0", "1", "2"}
STRING = re.compile(r"\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'")


@dataclass(frozen=True)
class Violation:
    path: Path
    line: int
    selector: str
    prop: str
    value: str
    category: str


def _strip(value: str) -> str:
    """Remove strings and var()/url()/env() calls (with nested parens) from a value."""
    value = STRING.sub(" ", value)
    while True:
        match = STRIP_FUNC.search(value)
        if not match:
            return value
        depth, i = 0, match.end() - 1
        while i < len(value):
            if value[i] == "(":
                depth += 1
            elif value[i] == ")":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        value = value[:match.start()] + " " + value[i + 1:]


def _nonzero(matches) -> bool:
    return any(float(m.group(1)) != 0 for m in matches)


def _token_names() -> frozenset[str]:
    """Custom properties defined in tokens.css (the token source)."""
    try:
        text = (HYPERKIT_DIR / "css" / "tokens.css").read_text(encoding="utf-8")
    except OSError:
        return frozenset()
    return frozenset(re.findall(r"(--[\w-]+)\s*:", re.sub(r"/\*.*?\*/", " ", text, flags=re.S)))


TOKENS = _token_names()


def _hovered_self(selector: str) -> bool:
    """True when the rule targets the hovered element itself (not a child or pseudo-element)."""
    for part in selector.rsplit("{", 1)[-1].split(","):
        tail = part.rsplit(":hover", 1)
        if len(tail) == 2 and not re.search(r"[\s>+~]|::", tail[1].rstrip()):
            return True
    return False


def _categories(prop: str, value: str, selector: str = "") -> list[str]:
    raw = _strip(value)
    lowered = raw.strip().lower()
    unquoted = STRING.sub(" ", value)
    found = []
    if BARE_ACCENT.search(unquoted):
        found.append("accent")
    if BARE_HUE.search(unquoted) and ".highlight" not in selector:
        found.append("hue")
    lift = HOVER_LIFT.search(unquoted) if prop == "transform" else lowered not in ("none", "0")
    if prop in ("transform", "translate", "scale") and _hovered_self(selector) and lift:
        found.append("hover-lift")
    if any(name in TOKENS and not fallback.lower().startswith("var(")
           for name, fallback in VAR_FALLBACK.findall(unquoted)):
        found.append("fallback")
    if prop == "z-index" and Z_LITERAL.fullmatch(lowered) and lowered not in Z_ALLOWED:
        found.append("z-index")
    if prop in SPACING_PROPS and _nonzero(RAW_LENGTH.finditer(raw)):
        found.append("spacing")
    if prop in ("font-size", "font") and _nonzero(RAW_LENGTH.finditer(raw)):
        found.append("font-size")
    if prop == "font-weight" and WEIGHT_LITERAL.search(lowered):
        found.append("font-weight")
    if prop == "letter-spacing" and lowered not in ("normal", "inherit") and _nonzero(RAW_LENGTH.finditer(raw)):
        found.append("tracking")
    if prop == "line-height" and lowered not in ("normal", "inherit") and RAW_NUMBER.search(raw):
        found.append("line-height")
    if prop in DURATION_PROPS and _nonzero(RAW_TIME.finditer(raw)):
        found.append("duration")
    if (prop == "border-radius" or (prop.startswith("border-") and prop.endswith("-radius"))) \
            and _nonzero(RAW_LENGTH.finditer(raw)):
        found.append("radius")
    if prop in SHADOW_PROPS and lowered != "none" and _nonzero(RAW_LENGTH.finditer(raw)):
        found.append("shadow")
    if HEX_COLOR.search(raw) or COLOR_FUNC.search(raw) or \
            (prop in NAMED_COLOR_PROPS and NAMED_COLOR.search(raw)):
        found.append("color")
    return found


def _blank(match: re.Match) -> str:
    """Replace a match with spaces, keeping newlines so line numbers survive."""
    return re.sub(r"[^\n]", " ", match.group(0))


def lint_css(text: str, path: Path, line_offset: int = 0) -> list[Violation]:
    """Lint one CSS source. line_offset shifts reported lines (for <style> blocks)."""
    lines = text.split("\n")
    allowed_lines = {i + 1 for i, line in enumerate(lines) if ALLOW_MARKER in line}
    code = re.sub(r"/\*.*?\*/", _blank, text, flags=re.S)
    newline_at = [i for i, ch in enumerate(code) if ch == "\n"]

    def line_of(index: int) -> int:
        return bisect.bisect_right(newline_at, index - 1) + 1

    violations: list[Violation] = []
    stack: list[str] = []
    seg_start, paren, quote, i = 0, 0, None, 0
    while i < len(code):
        ch = code[i]
        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == "(":
            paren += 1
        elif ch == ")":
            paren = max(0, paren - 1)
        elif paren == 0 and ch == "{":
            stack.append(" ".join(code[seg_start:i].split()))
            seg_start = i + 1
        elif paren == 0 and ch in ";}":
            segment = code[seg_start:i]
            if stack and ":" in segment:
                prop, _, value = segment.partition(":")
                prop = prop.strip().lower()
                if re.fullmatch(r"[a-z][a-z-]*", prop) and not ALLOW_CONTEXTS.intersection(stack):
                    start = seg_start + (len(segment) - len(segment.lstrip()))
                    first, last = line_of(start), line_of(i)
                    if not allowed_lines.intersection({first - 1, first, last}):
                        selector = " ".join(stack)
                        for category in _categories(prop, value.replace("!important", ""), selector):
                            violations.append(Violation(
                                path, first + line_offset, stack[-1][:80], prop,
                                " ".join(value.split())[:100], category,
                            ))
            if ch == "}" and stack:
                stack.pop()
            seg_start = i + 1
        i += 1
    return violations


STYLE_ATTR = re.compile(r"(?<![\w-])style\s*=\s*(?:\"([^\"]*)(?:\"|$)|'([^']*)(?:'|$))", re.I)
CSS_TEXT_ASSIGN = re.compile(r"\.style\.cssText\s*\+?=|setAttribute\(\s*['\"]style['\"]\s*,")
STYLE_PROP_ASSIGN = re.compile(r"\.style\.([a-z]+(?:[A-Z][a-z]*)*)\s*=(?!=)\s*(['\"`])((?:\\.|(?!\2).)*)\2")
CSS_RULE = re.compile(r"[^{};]+\{[^{}]*:[^{}]*\}")
TEMPLATE_EXPR = re.compile(r"\$\{[^}]*\}")


def _literals(code: str):
    """Yield (start, end, content_start) for each string literal in JS, skipping comments."""
    i, size = 0, len(code)
    while i < size:
        pair = code[i:i + 2]
        if pair == "//":
            i = code.find("\n", i)
            i = size if i < 0 else i
        elif pair == "/*":
            i = code.find("*/", i + 2)
            i = size if i < 0 else i + 2
        elif code[i] in "\"'`":
            quote, j = code[i], i + 1
            while j < size and code[j] != quote and not (quote != "`" and code[j] == "\n"):
                j += 2 if code[j] == "\\" else 1
            yield i, j, i + 1
            i = j + 1
        else:
            i += 1


def _script_fragments(body: str):
    """Yield (index, css, kind) pieces of style text found in one script body."""
    for start, end, content_start in _literals(body):
        content = TEMPLATE_EXPR.sub(_blank, body[content_start:end])
        for attr in STYLE_ATTR.finditer(content):
            group = 1 if attr.group(1) is not None else 2
            yield content_start + attr.start(group), attr.group(group), "decl"
        if CSS_RULE.search(content):
            yield content_start, content, "rule"
    for assign in CSS_TEXT_ASSIGN.finditer(body):
        base = prev_end = assign.end()
        for start, stop, content_start in _literals(body[base:]):
            gap = body[prev_end:base + start]
            if ";" in gap or ("\n" in gap and "+" not in gap):
                break
            yield base + content_start, body[base + content_start:base + stop], "decl"
            prev_end = base + stop + 1
    for assign in STYLE_PROP_ASSIGN.finditer(body):
        if assign.group(1) == "cssText":
            continue
        prop = re.sub(r"[A-Z]", lambda m: "-" + m.group(0).lower(), assign.group(1))
        yield assign.start(3), f"{prop}:{assign.group(3)}", "decl"


def _fragment_violations(css: str, kind: str, text: str, index: int, path: Path) -> list[Violation]:
    """Lint a style fragment found at text[index], reporting absolute file lines."""
    source = css if kind == "rule" else "x{" + css + "}"
    return lint_css(source, path, text.count("\n", 0, index))


def lint_file(path: Path) -> list[Violation]:
    if path in EXEMPT_FILES:
        return []
    text = path.read_text(encoding="utf-8")
    if path.suffix != ".html":
        return lint_css(text, path)
    # Utility pages: <style> blocks, inline style attributes, and style text built in <script>.
    lines = text.split("\n")
    markup = re.sub(r"<script\b.*?</script>", _blank, text, flags=re.S | re.I)
    found = []
    for match in re.finditer(r"<style\b[^>]*>(.*?)</style>", markup, flags=re.S | re.I):
        found += lint_css(match.group(1), path, markup.count("\n", 0, match.start(1)))
    markup = re.sub(r"<style\b.*?</style>", _blank, markup, flags=re.S | re.I)
    inline = []
    for attr in STYLE_ATTR.finditer(markup):
        group = 1 if attr.group(1) is not None else 2
        inline.append((attr.start(group), attr.group(group), "decl"))
    for script in re.finditer(r"<script\b[^>]*>(.*?)</script>", text, flags=re.S | re.I):
        for index, css, kind in _script_fragments(script.group(1)):
            inline.append((script.start(1) + index, css, kind))
    for index, css, kind in inline:
        for violation in _fragment_violations(css, kind, text, index, path):
            near = lines[violation.line - 2:violation.line]
            if not any(ALLOW_MARKER in line for line in near):
                found.append(violation)
    return found


def shared_sources() -> list[Path]:
    """Every shared HyperKit stylesheet (all apps bundle a subset of these)."""
    return sorted((HYPERKIT_DIR / "css").glob("*.css")) + sorted((HYPERKIT_DIR / "layouts").rglob("*.css"))


def app_sources(app_dir: Path) -> list[Path]:
    """An app's own stylesheets under assets/ (vendored CSS excluded) plus utility pages."""
    css = [p for p in sorted((app_dir / "assets").rglob("*.css")) if "vendor" not in p.parts]
    return css + sorted((app_dir / "utilities").glob("*.html"))


def lint_paths(paths) -> list[Violation]:
    found = []
    for path in paths:
        found += lint_file(path)
    return found


def report(app_label: str, app_dir: Path) -> None:
    """Print a one-line summary for a build and exit 1 when any value is off-scale."""
    try:
        app_count = len(lint_paths(app_sources(Path(app_dir))))
        shared_count = len(lint_paths(shared_sources()))
    except (OSError, UnicodeDecodeError) as exc:
        print(f"design-lint: skipped ({exc})")
        return
    print(
        f"design-lint: {app_label} {app_count} off-scale values, "
        f"shared HyperKit {shared_count} - details: python .hyperkit/python/design_lint.py -v"
    )
    if app_count or shared_count:
        sys.exit(1)


def _app_dirs() -> list[Path]:
    return sorted(p for p in HYPERSPACE_DIR.glob(".hyper*") if p.is_dir() and (p / "assets").is_dir() and p != HYPERKIT_DIR)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Report raw values that bypass HyperKit tokens.")
    parser.add_argument("-v", "--verbose", action="store_true", help="list every violation")
    parser.add_argument("--strict", action="store_true", help="exit 1 when any violation exists")
    args = parser.parse_args(argv)

    groups = [("shared HyperKit", shared_sources())] + [(d.name.lstrip("."), app_sources(d)) for d in _app_dirs()]
    total = Counter()
    every = []
    for label, paths in groups:
        found = lint_paths(paths)
        every += found
        by_cat = Counter(v.category for v in found)
        total.update(by_cat)
        detail = ", ".join(f"{cat} {n}" for cat, n in by_cat.most_common())
        print(f"{label:<16} {len(found):>5}  {detail}")
    print(f"{'TOTAL':<16} {sum(total.values()):>5}  " + ", ".join(f"{c} {n}" for c, n in total.most_common()))

    if args.verbose:
        by_file = Counter(v.path for v in every)
        print("\nBy file:")
        for path, n in by_file.most_common():
            print(f"  {n:>4}  {path.relative_to(HYPERSPACE_DIR)}")
        print("\nViolations:")
        for v in every:
            print(f"  {v.path.relative_to(HYPERSPACE_DIR)}:{v.line}  [{v.category}]  {v.selector} {{ {v.prop}: {v.value} }}")

    return 1 if args.strict and every else 0


if __name__ == "__main__":
    sys.exit(main())
