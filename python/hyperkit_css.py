"""Shared HyperKit CSS loader for every hyper ecosystem app build.

Returns the HyperKit stylesheet modules concatenated in the one canonical
cascade order, so no app can load them out of order or drift its own list.
Required modules always load; optional ones load only when an app asks.
A missing file fails the build loudly instead of silently dropping styles.
"""

from pathlib import Path

from font_faces import font_face_css

HYPERKIT_CSS_DIR = Path(__file__).resolve().parent.parent / "css"

# Canonical cascade order: tokens first, accessibility overrides last.
CSS_ORDER = (
    "tokens",
    "keyframes",
    "primitives",
    "globals",
    "components",
    "content",
    "cards",
    "features",
    "viz",
    "accessibility",
)

REQUIRED = frozenset({"tokens", "keyframes", "primitives", "globals", "accessibility"})
OPTIONAL = frozenset({"components", "content", "cards", "features", "viz"})


def hyperkit_css_parts(optional=(), app="This app", font_faces=True):
    """Return the HyperKit CSS module texts as a list in cascade order.

    The self-hosted font faces block sits directly after tokens when
    font_faces is true. Raises ValueError for unknown module names and
    FileNotFoundError for a missing module file.
    """
    wanted = set(optional)
    unknown = wanted - OPTIONAL - REQUIRED
    if unknown:
        raise ValueError(
            f"Unknown HyperKit CSS module(s): {sorted(unknown)}. "
            f"Optional modules are {sorted(OPTIONAL)}."
        )
    wanted |= REQUIRED
    parts = []
    for name in CSS_ORDER:
        if name not in wanted:
            continue
        f = HYPERKIT_CSS_DIR / f"{name}.css"
        if not f.exists():
            raise FileNotFoundError(
                f"Hyperkit CSS file missing: {f}\n"
                f"{app}'s build.py requires the shared CSS modules in "
                f"{HYPERKIT_CSS_DIR}. Restore the .hyperkit/ directory."
            )
        parts.append(f.read_text(encoding="utf-8"))
        if name == "tokens" and font_faces:
            parts.append(font_face_css())
    return parts


def hyperkit_css(optional=(), app="This app", font_faces=True):
    """Return the HyperKit CSS modules concatenated into one string."""
    return "\n".join(hyperkit_css_parts(optional, app=app, font_faces=font_faces))
