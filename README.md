<h1 align="center">Hyperkit</h1>

<p align="center">
  The shared design system package for the hyper ecosystem - CSS tokens, primitives, JS modules, and stdlib Python helpers that every hyper app builds from.
</p>

---

## What It Does

Hyperkit is not an app - it has no entry point, no window, nothing to launch. It is a folder of plain CSS, vanilla JS, self-hosted fonts, and stdlib Python that each app's own `build.py` reads from directly:

- **Universal design tokens** - the `:root` custom properties (colors, type scale, space scale, icons, motion, z-index, borders) that every hyper app renders from
- **Shared component primitives** - `.status-chip`, `.label-badge`, `.notification-toast`, `.nav-tab`, `.pill-toggle`, `.text-button`, `.link-button`, and friends - the class vocabulary that gives every app the same visual language
- **Ecosystem JS modules** - self-contained IIFEs (`HvUtils`, `HvToast`, `HvViz`, `HvTabs`, ...) that ship byte-identical to every consumer
- **Build helpers** - the `hyperkit_css()` stylesheet loader, embedded font faces, palette derivation, the design lint, and shared structured logging

Consumers: Hypervisor, Hyperagent, Hyperline, HyperEye, HyperField, Hypernote, Hypercycle, and Hyperbridge.

## Design Philosophy

- **Zero frameworks.** No Node, no npm, no bundler. Plain CSS, vanilla JS IIFEs, stdlib Python.
- **Fail loud, never silent.** If a build cannot find a Hyperkit file it needs, it stops with a clear error - it never falls back to a stale local copy.
- **Extend, don't fork.** When an app needs different behavior than a shared primitive provides, it overrides the specific property in its own local CSS. The shared file itself never gets copied and modified.
- **The charter governs.** Every value snaps to a ratified scale; the design lint enforces it in every app build.

## Quick Start

There is nothing to run here - Hyperkit has no build step of its own. Consuming apps read its files directly:

```bash
# .hyperkit/ must sit as a sibling of the app folder
cd .hypervisor  # or any other consumer
python build.py
```

## How It Works

```
.hyperspace/
+-- .hyperkit/
|   +-- css/
|   |   +-- tokens.css         universal :root custom properties
|   |   +-- keyframes.css      shared @keyframes
|   |   +-- primitives.css     chips, badges, toasts, tabs, buttons, overlays
|   |   +-- globals.css        font-smoothing, scrollbars, selection, ambient backdrop
|   |   +-- components.css     section panels, confirm dialogs, bordered controls
|   |   +-- content.css        markdown body rendering (headings, code, tables, admonitions)
|   |   +-- cards.css          card grids, dashboard, doc lists, pin cards, pulse rows
|   |   +-- features.css       TOC, search, tag filters, app-shelf
|   |   +-- viz.css            data-visualization primitives (hv-viz-*)
|   |   +-- accessibility.css  a11y preference overrides
|   +-- layouts/cyberdeck/layout.css   page structure (topbar, nav rail, page grid, drawer)
|   +-- fonts/                 Departure Mono + Host Grotesk (SIL OFL)
|   +-- js/                    ecosystem IIFE modules (see below)
|   +-- python/
|       +-- hyperkit_css.py    hyperkit_css() / hyperkit_css_parts() stylesheet loader
|       +-- font_faces.py      font_face_css() - embedded @font-face block
|       +-- palette.py         OKLCH/HSL palette derivation from one accent
|       +-- design_lint.py     the charter lint, run by every build
|       +-- chips.py           render_chip() for semantic chip HTML
|       +-- hyper_logging.py   setup_logger() for all ecosystem apps
|       +-- launch_build.py    rebuild-on-launch helpers
+-- .hypervisor/, .hyperagent/, ...   consume Hyperkit at build time
```

### The CSS loader

`python/hyperkit_css.py` returns the Hyperkit stylesheets concatenated in the one canonical cascade order, so no app hand-maintains its own list:

```python
from hyperkit_css import hyperkit_css

css = hyperkit_css(optional=("components", "content", "cards"), app="Hyperline")
```

- **Required** (always loaded): `tokens`, `keyframes`, `primitives`, `globals`, `accessibility`
- **Optional** (loaded when named): `components`, `content`, `cards`, `features`, `viz`
- The embedded font faces follow `tokens` unless `font_faces=False`.
- An unknown module name raises `ValueError`; a missing file raises `FileNotFoundError`.
- `hyperkit_css_parts()` returns the same modules as a list.

Cascade order: `tokens -> keyframes -> primitives -> globals -> components -> content -> cards -> features -> viz -> accessibility`, then the layout pack, then app-local CSS (numbered, sorted), which can override any shared rule.

### Ecosystem JS modules

Each module exports one object to `window` and is guarded (`if (window.HvX) return;`) so it is safe to load once ahead of every other script.

| Module | Exports |
|--------|---------|
| `utils.js` | `HvUtils` - shared helpers (escapeHtml) |
| `toast.js` | `HvToast` (+ legacy `__hypervisorToast` alias) - variant-aware `.notification-toast` |
| `viz.js` | `HvViz` - donut, bars, stacked, legend, line, sparkline |
| `tabs.js`, `collapsible.js`, `disclosure.js` | `HvTabs`, `HvCollapsible`, `HvDisclosure` |
| `context-menu.js`, `tooltip.js` | `HvContextMenu`, `HvTooltip` |
| `editor.js`, `hv-preview.js` | `HvEditor`, `HvPreview` |
| `client-diagnostics.js` | `HvClientDiag` |
| `cursor-box.js`, `cursor-trail.js`, `noise-field.js`, `greeting.js` | `HvCursorBox`, `HvCursorTrail`, `HvNoiseField`, `HvGreeting` - the sanctioned character layer |

### Python helpers

- `render_chip(variant, text, extra_class, data_attrs)` returns a `.status-chip` span with a variant (`filled`, `outlined-accent`, `outlined-muted`).
- `setup_logger(app_name)` gives a rotating file handler writing structured, timestamped lines to the shared logs folder.

Consumers add `.hyperkit/python/` to `sys.path` and import directly.

## Editing Rules

1. **Edit here, then rebuild each consumer.** Never copy Hyperkit content into an app's local `assets/`.
2. **Use tokens, never literals.** Colors go through semantic and role tokens; palette hues only appear in local tone properties. Borders use `var(--border-hair) solid var(--border)`; corners use `var(--radius)`.
3. **Don't duplicate primitive properties in an app-local override.** Declare only the properties that differ.
4. **Extract only real duplication.** A module moves here when 2+ consumers already share it.
5. **Keep builds failing loud.** Load CSS through `hyperkit_css()` so missing files raise.
6. **Run the lint.** `python .hyperkit/python/design_lint.py -v` lists every violation.

## License

Personal project. Not currently licensed for distribution.
