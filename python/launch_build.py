"""
Launch-time build helpers - Hyperkit shared Python module.

Launchers rebuild their app on start. A failed build or a design-lint failure
comes back as a message that the app shows as a sticky error toast (HvToast);
the app still opens on its last good build unless none exists.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def build_or_warn(app_dir, label: str) -> str | None:
    """Run the app's build.py. Returns a toast message on failure, None on success."""
    app_dir = Path(app_dir).resolve()
    result = subprocess.run(
        [sys.executable, str(app_dir / "build.py")],
        cwd=str(app_dir), capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if result.stdout:
        print(result.stdout, end="")
    if result.returncode == 0:
        return None
    detail = [line.strip() for line in (result.stdout + result.stderr).splitlines() if line.strip()]
    reason = detail[-1] if detail else f"build exited with code {result.returncode}"
    print(f"{label} build failed: {reason}", file=sys.stderr)
    if not (app_dir / "generated_html.py").exists():
        sys.exit(1)
    return f"{label} build failed, showing the last good build - {reason}"


def off_scale_notice(label: str, app_dir) -> str | None:
    """Toast message when the app or shared HyperKit carries off-scale design values."""
    import design_lint
    try:
        found = design_lint.lint_paths(design_lint.app_sources(Path(app_dir)))
        found += design_lint.lint_paths(design_lint.shared_sources())
    except (OSError, UnicodeDecodeError):
        return None
    if not found:
        return None
    first = found[0]
    return (f"{label} design lint: {len(found)} off-scale values "
            f"(first: {first.path.name}:{first.line} {first.prop}) - run design_lint.py -v")


def notice_js(message: str) -> str:
    """JS that raises a sticky error toast."""
    options = {"variant": "error", "message": message, "duration": "sticky", "dedupeKey": "build-failed"}
    return f"if(window.HvToast)window.HvToast.show({json.dumps(options)});"


def with_notice(html: str, message: str | None) -> str:
    """Return the page with a load-time error toast injected; unchanged when there is no message."""
    if not message:
        return html
    body = notice_js(message).replace("</", "<\/")
    script = "<script>window.addEventListener('load',function(){" + body + "});</script>"
    index = html.rfind("</body>")
    return html[:index] + script + html[index:] if index != -1 else html + script
