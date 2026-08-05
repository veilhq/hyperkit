"""
Chip rendering helper — Hyperkit shared Python module.

Composes the ecosystem primitive class `.hv-chip` with a semantic variant and
optional specific class names for JS hooks or unique overrides. Replaces
scattered inline `<span class="...">` construction across emit-side Python
modules in any consuming app.

Semantic vocabulary (from WI-111 Phase 4):
- filled           → live/current (WI IDs on active rows, In Progress status)
- outlined-accent  → structured/notable (Project, "NEW" activity marker)
- outlined-muted   → historical/quiet (idle status, "UPD" marker, tags, missing)
"""
from __future__ import annotations

CHIP_VARIANTS = frozenset({"filled", "outlined-accent", "outlined-muted"})


def render_chip(
    variant: str,
    text: str,
    extra_class: str = "",
    data_attrs: dict[str, str] | None = None,
) -> str:
    """Render a chip HTML span.

    Args:
        variant: One of 'filled', 'outlined-accent', 'outlined-muted'.
        text: Label text (caller is responsible for HTML-safety; entities like
              `&mdash;` may be passed as-is).
        extra_class: Space-separated specific class names layered on top of
                     the primitive (for JS hooks or unique overrides).
        data_attrs: Optional dict of data-* attributes; keys become `data-{k}`.

    Returns:
        HTML string like `<span class="hv-chip hv-chip-filled pulse-chip-work">text</span>`.

    Raises:
        ValueError: If variant is not one of the canonical set.
    """
    if variant not in CHIP_VARIANTS:
        raise ValueError(
            f"Unknown chip variant '{variant}'; expected one of {sorted(CHIP_VARIANTS)}"
        )

    classes = f"hv-chip hv-chip-{variant}"
    if extra_class:
        classes += f" {extra_class.strip()}"

    attrs = ""
    if data_attrs:
        attrs = "".join(f' data-{k}="{v}"' for k, v in data_attrs.items())

    return f'<span class="{classes}"{attrs}>{text}</span>'
