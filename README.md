<h1 align="center">Hyperkit</h1>

<p align="center">
  The shared design system package for the hyper ecosystem — CSS tokens, primitives, and JS modules that Hypervisor, Hyperagent, and future apps all build from.
</p>

---

## What It Does

Hyperkit is not an app — it has no entry point, no window, nothing to launch. It's a folder of plain CSS, vanilla JS, and stdlib Python that Hypervisor's and Hyperagent's own build scripts read from directly:

- **Universal design tokens** — the `:root` custom properties (colors, type scale, space scale, motion, z-index, shadows) that every hyper app renders from
- **Shared component primitives** — `hv-chip`, `hv-row`, `hv-button`, `hv-overlay`, `hv-progress-*`, and friends — the CSS class vocabulary that gives every app the same visual language
- **Ecosystem JS modules** — `HvUtils`, `HvCursorBox`, `HvNoiseField`, `HvGreeting`, `HvCursorTrail`, `HvToast` — self-contained IIFEs that ship byte-identical to every consumer
- **Shared structured logging** — `setup_logger()` for consistent, rotated logs across every app

Before Hyperkit, these lived as byte-mirrored copies inside each app's own `assets/` folder — the same file, pasted twice, drifting apart the moment anyone edited one copy without the other. Hyperkit replaces the copy-paste with a single canonical source both apps import from at build time.

## Design Philosophy

- **Mechanical, not architectural.** Hyperkit is Phase 1 of a two-phase plan — a straight relocation of what was already identical across apps, not a redesign. No new visual patterns get invented here.
- **Zero frameworks.** Same rule as every other hyper app: no Node, no npm, no bundler. Plain CSS, vanilla JS IIFEs, stdlib Python.
- **Fail loud, never silent.** If a consuming app's build can't find a Hyperkit file it needs, the build stops with a clear error — it never quietly falls back to a stale local copy.
- **Extend, don't fork.** When an app needs different behavior than a shared primitive provides, it overrides the specific property in its own local CSS. The shared file itself never gets copied and modified.

## Quick Start

There's nothing to run here — Hyperkit has no build step of its own. Consuming apps read its files directly:

```bash
# Hypervisor's build.py and Hyperagent's build.py both do this automatically —
# nothing to configure, just make sure .hyperkit/ exists as a sibling of
# .hypervisor/ and .hyperagent/
cd .hypervisor  # or .hyperagent
python build.py
```

If `.hyperkit/css/tokens.css`, `primitives.css`, or any of the six JS modules are missing, the build raises `FileNotFoundError` immediately rather than shipping a broken or stale site.

## How It Works

Hyperkit expects to live as a sibling of every app that consumes it:

```
.hyperspace/                 ← content root
├── .hyperkit/               ← this package
│   ├── css/
│   │   ├── tokens.css       ← universal :root custom properties
│   │   ├── primitives.css   ← shared component classes (hv-chip, hv-row, hv-button, ...)
│   │   ├── globals.css      ← universal behaviors (font-smoothing, scrollbars, keyframes)
│   │   ├── components.css   ← section panels, confirm dialogs, overlays
│   │   ├── content.css      ← markdown body rendering (headings, code, tables, admonitions)
│   │   ├── cards.css        ← card grids, dashboard, doc lists, pin cards, pulse rows
│   │   ├── features.css     ← TOC, tabs, search, tag filters, app-shelf
│   │   └── accessibility.css ← a11y preference overrides
│   ├── layouts/
│   │   └── cyberdeck/
│   │       └── layout.css   ← page structure (topbar, nav rail, page grid, footer, drawer)
│   ├── js/
│   │   ├── utils.js         ← window.HvUtils
│   │   ├── cursor-box.js    ← window.HvCursorBox
│   │   ├── noise-field.js   ← window.HvNoiseField
│   │   ├── greeting.js      ← window.HvGreeting
│   │   ├── cursor-trail.js  ← window.HvCursorTrail
│   │   └── toast.js         ← window.HvToast + window.__hypervisorToast
│   ├── python/
│   │   ├── hyper_logging.py ← setup_logger() for all ecosystem apps
│   │   └── chips.py         ← render_chip() for semantic chip HTML
│   └── README.md            ← this file
├── .hypervisor/             ← consumes Hyperkit at build time
├── .hyperagent/             ← consumes Hyperkit at build time
└── (your markdown content)
```

Each consuming app's `build.py` reads Hyperkit's CSS and JS **before** its own local files — app-local content loads after, so it can override a shared primitive via normal CSS cascade order when it needs to look or behave differently.

## Features

### Centralized Style Architecture

Hyperkit's CSS cascade is the single source of truth for the visual language across all ecosystem apps. Changes to tokens propagate to every consumer on their next build — no per-app updates needed.

**How new elements hook into the system:**

1. **Use token variables** — never hardcode colors, spacing, radius, or motion durations. Reference `var(--radius)`, `var(--border)`, `var(--space-3)`, `var(--motion-fast)`, etc.
2. **Use `var(--radius)` for all border-radius** — this single token controls the ecosystem's corner rounding. Currently `4px`.
3. **Use `var(--border-hair) solid var(--border)` for borders** — consistent 1px borders in the ecosystem border color.
4. **Use the text hierarchy** — `var(--text-bright)` for emphasis, `var(--text)` for body, `var(--text-muted)` for secondary, `var(--text-dim)` for tertiary.
5. **Use motion tokens for transitions** — `var(--motion-fast)` (0.15s) for micro-interactions, `var(--motion-base)` (0.2s) for standard UI, `var(--motion-medium)` (0.25s) for reveals.

**CSS cascade order (each layer can override the previous):**

```
1. tokens.css         — :root custom properties (colors, scale, motion)
2. primitives.css     — shared component classes (hv-chip, hv-row, hv-button)
3. globals.css        — universal behaviors (font-smoothing, scrollbars, selection)
4. components.css     — section panels, confirm dialogs, shared structures
5. content.css        — markdown body rendering (headings, code, tables, blockquotes)
6. cards.css          — card grids, dock, dashboard, doc lists, pin cards
7. features.css       — TOC, tabs, search, tag filters, app-shelf
8. accessibility.css  — a11y overrides
9. layouts/*/         — layout pack (topbar, nav, page grid, footer, drawer)
10. app-local css/    — per-app overrides (numbered, sorted)
```

**When to edit where:**

| Change scope | Edit location |
|-------------|--------------|
| All apps (token-level: colors, radius, spacing) | `.hyperkit/css/tokens.css` |
| All apps (global behaviors) | `.hyperkit/css/globals.css` |
| All apps (component/content/card styling) | `.hyperkit/css/{module}.css` |
| Hypervisor page structure only | `.hyperkit/layouts/cyberdeck/layout.css` |
| Hypervisor app-specific behavior | `.hypervisor/assets/css/` |
| Hyperagent app-specific behavior | `.hyperagent/assets/css/` |

### CSS Tokens & Primitives

`tokens.css` holds every color, spacing, typography, motion, and z-index custom property the ecosystem shares. `primitives.css` holds the composable class vocabulary — chips, rows, buttons, overlays, progress bars — built entirely from those tokens. Consuming apps prepend both files ahead of their own numbered CSS modules.

### The Override Pattern

The one deliberate divergence in the whole primitive set is `.hv-tab`: Hypervisor renders it as a bordered box, Hyperagent renders it with a clipped corner. Hyperkit ships only the shared base (position, background, hover transition); each app layers its own shape on top in a small local override file. This is the template for any future divergence — extend the shared base, never fork it.

### Ecosystem JS Modules

Six self-contained modules, each exporting one object to `window`:

| Module | Exports | What it does |
|--------|---------|---------------|
| `utils.js` | `window.HvUtils` | Shared utility functions (escapeHtml) |
| `cursor-box.js` | `window.HvCursorBox` | Pointer-following box that lights up over clickable elements |
| `noise-field.js` | `window.HvNoiseField` | WebGL2 Bayer-dither background texture |
| `greeting.js` | `window.HvGreeting` | Rotating kaomoji/text welcome-screen greeting |
| `cursor-trail.js` | `window.HvCursorTrail` | WebGL2 ping-pong cursor smear effect |
| `toast.js` | `window.HvToast` (+ legacy `window.__hypervisorToast` alias) | Variant-aware toast notifications |

Every module is idempotent (`if (window.HvX) return;` guard) and self-wrapped in strict-mode IIFEs — safe to load exactly once, ahead of every other script.

### Shared Logging

`setup_logger(app_name)` gives every consumer a rotating file handler (2 MB × 3 backups) writing structured, timestamped lines to `.hyperspace/.logs/`. A back-compat shim remains at the old `.hyperspace/hyper_logging.py` location for any consumer that hasn't updated its import path yet.

### Shared Chip Rendering

`render_chip(variant, text, extra_class, data_attrs)` returns a semantic chip `<span>` composing the `.hv-chip` primitive class with a variant (`filled`, `outlined-accent`, `outlined-muted`) and optional specific classes for JS hooks. Consuming apps add `.hyperkit/python/` to `sys.path` and call `from chips import render_chip`.

## Development

Edit source files here, never in a local copy inside an app's `assets/`:

- **CSS** → `css/tokens.css`, `css/primitives.css`
- **JS** → `js/*.js` (six modules, each its own file)
- **Python** → `python/hyper_logging.py`, `python/chips.py`

After editing, rebuild each consuming app (`python build.py` inside `.hypervisor/` and `.hyperagent/`) to pick up the change — Hyperkit itself has nothing to build.

**Before adding something new here:** it needs to already be identical (or near-identical) across 2+ real consumers. Don't pre-build a shared module speculatively — extract when actual duplication exists. See Editing Rules below for the complete checklist.

## Editing Rules

1. **Edit here, then rebuild each consumer.** Never copy Hyperkit content back into an app's local `assets/`.
2. **Don't duplicate primitive properties in an app-local override.** Extend, don't copy — only declare the properties that differ.
3. **New shared modules must be identical (or near-identical) across consumers before moving here.** If only one app uses something, it stays local.
4. **Keep the fail-loud behavior in each app's `build.py`.** If you add a new Hyperkit file that a build depends on, add the same `FileNotFoundError` guard — no silent fallbacks.

## What's Not Here Yet

Phase 2 (WI-146) investigated whether Hyperkit should grow a component layer above the current primitives. The conclusion: **not yet.** The audit found that most cross-app duplication was non-composition of existing primitives (sites hand-reimplementing `hv-panel-header`, `hv-hover-lift`, etc. instead of composing them), not missing components. A compliance sweep addressed the `hv-panel-header` sites; the remaining shapes (hover-lift, overlay/drawer) have intentional visual differences that need a design call.

A component layer (`.hyperkit/components/` with render-helper modules like the existing `chips.py`) remains a valid future step, but only when genuine 2-consumer components emerge from real app development — not from speculative extraction. The render-helper pattern (pure function → HTML string, same idiom as `render_chip()`) is the established approach when that time comes.

## License

Personal project. Not currently licensed for distribution.
