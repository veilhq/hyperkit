/* ===== Cursor companion box — extractable module (WI-142 follow-up) =====
   A small bordered box that follows the pointer and lights up solid when
   hovering a clickable element, with a brief blink flash on click.

   Clickability is detected via computed `cursor: pointer` rather than a
   hardcoded selector list. `cursor` is an inherited CSS property, so any
   element that is itself styled `cursor: pointer` (native <a href>, or a
   custom div/button/span that declares it in CSS) is picked up automatically
   at the point under the pointer — no separate list to keep in sync when a
   new clickable element is added anywhere in the app. Plain <button> does
   NOT get `cursor: pointer` from the browser's default stylesheet, so any
   button-like element that should trigger the box must declare it in CSS
   (the existing `.hv-icon-btn` / `.hv-button` primitives already do).

   Public API exposed on window.HvCursorBox:
     start(container?)   — mounts the box <div> into container (default
                            document.body) and wires mousemove/mousedown
                            listeners on document. Idempotent — safe to call
                            more than once.

   Relocated to Hyperkit (WI-142 follow-up) from byte-identical copies in
   Hypervisor's assets/js/features/effects.js and Hyperagent's assets/js/03-ui.js.
   Source of truth — do not copy back into app-local assets/js/. Each app's
   build pulls this file directly.
   ================================================================= */

(function () {
  if (window.HvCursorBox) return;

  var OFFSET_X = 14;
  var OFFSET_Y = -4;

  // Native interactive elements that browsers don't always style with
  // cursor:pointer by default (buttons, summaries, labels). Short list of
  // HTML semantics — stable, not app-specific, won't drift.
  var NATIVE_INTERACTIVE = "a[href], button, summary, [role='button'], input, select, label[for], textarea";

  function isClickable(el) {
    if (!el) return false;
    if (getComputedStyle(el).cursor === "pointer") return true;
    // Fallback: native interactive elements the browser doesn't give pointer to
    if (el.closest && el.closest(NATIVE_INTERACTIVE)) return true;
    return false;
  }

  function start(container) {
    var host = container || document.body;
    var box = document.createElement("div");
    box.className = "cursor-box";
    host.appendChild(box);

    var hovering = false;

    document.addEventListener("mousemove", function (e) {
      box.style.left = (e.clientX + OFFSET_X) + "px";
      box.style.top = (e.clientY + OFFSET_Y) + "px";

      var over = document.elementFromPoint(e.clientX, e.clientY);
      var clickable = isClickable(over);
      if (clickable && !hovering) {
        hovering = true;
        box.classList.add("visible");
      } else if (!clickable && hovering) {
        hovering = false;
        box.classList.remove("visible", "blink");
      }
    });

    document.addEventListener("mousedown", function (e) {
      var over = document.elementFromPoint(e.clientX, e.clientY);
      if (!isClickable(over)) return;
      box.classList.remove("blink");
      void box.offsetWidth;
      box.classList.add("blink");
      setTimeout(function () { box.classList.remove("blink"); }, 350);
    });
  }

  window.HvCursorBox = { start: start };
})();
