/* ===== Collapsible behavioral primitive (HyperKit) =====
   Toggle a persistent panel between expanded and collapsed by clicking its
   header. Extracted from the identical collapse state machines the Hypervisor
   TOC card and the Hyperagent task panel each hand-rolled.

   Boundary: this owns NEITHER content nor a rendered node. The app supplies its
   header (the click target) and panel (the element the collapsed class toggles
   on) in the DOM; HvCollapsible attaches only the toggle behavior.

   Distinct from HvDisclosure: a disclosure is a DISMISSABLE overlay (dropdown)
   that closes on outside-click and Escape. A collapsible is a PERSISTENT panel
   that stays put — clicking the header only folds/unfolds it; clicking away or
   pressing Escape does NOT collapse it. Do not conflate the two.

   Usage:
     var c = HvCollapsible.register({
       header: elOrId,                 // click target that toggles collapse
       panel:  elOrId,                 // element the collapsedClass toggles on
                                       //   (default: header.parentNode)
       collapsedClass: "collapsed",    // class toggled on the panel (default)
       collapsed: false,               // initial state (default expanded)
       onToggle: function (isCollapsed) {}  // optional per-consumer side effect
     });
     // c.expand() / c.collapse() / c.toggle() / c.isCollapsed()

   Idempotent, strict-mode IIFE — matches the other HvX modules.
*/
(function initCollapsible() {
  "use strict";
  if (window.HvCollapsible) return; // idempotent

  function resolve(elOrId) {
    if (!elOrId) return null;
    return typeof elOrId === "string" ? document.getElementById(elOrId) : elOrId;
  }

  function register(opts) {
    opts = opts || {};
    var collapsedClass = opts.collapsedClass || "collapsed";
    var onToggle = typeof opts.onToggle === "function" ? opts.onToggle : null;

    var header = resolve(opts.header);
    var panel = resolve(opts.panel) || (header ? header.parentNode : null);
    if (!header || !panel) return null;

    function apply(isCollapsed) {
      panel.classList.toggle(collapsedClass, isCollapsed);
      header.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
      if (onToggle) onToggle(isCollapsed);
    }

    function collapse() { apply(true); }
    function expand() { apply(false); }
    function isCollapsed() { return panel.classList.contains(collapsedClass); }
    function toggle() { apply(!isCollapsed()); }

    // Seed initial state (default expanded).
    apply(!!opts.collapsed);

    header.addEventListener("click", toggle);

    return {
      expand: expand,
      collapse: collapse,
      toggle: toggle,
      isCollapsed: isCollapsed
    };
  }

  window.HvCollapsible = { register: register };
})();
