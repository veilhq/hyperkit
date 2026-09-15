/* ===== Tooltip behavioral primitive (HyperKit) =====
   Upgrades the CSS-only [data-tooltip] pseudo-element into a positioned,
   accessible tooltip. Preserves the existing data-tooltip attribute contract
   used across the ecosystem (~40 call sites) - no markup changes required.

   Over the old ::after approach this adds:
     - Edge-aware positioning: flips above when no room below, clamps to viewport.
     - Container-escape: one shared node is appended to <body>, so tooltips are
       never clipped by an overflow:hidden/auto ancestor (dock, pin cards, drawers).
     - Keyboard/focus support + Escape-to-dismiss (WAI-ARIA tooltip pattern).
     - Hover-intent delay so tooltips do not flash on transient pointer passes.

   Event-delegated: works for elements added to the DOM after load (the JS call
   sites that set data-tooltip at runtime - content.js, pins.js, editor.js).

   Idempotent, strict-mode IIFE - safe to load once ahead of app scripts,
   matching the other HvX modules. Visual style lives in globals.css.
*/
(function initTooltip() {
  "use strict";
  if (window.HvTooltip) return; // idempotent

  var SHOW_DELAY = 400;   // ms hover-intent before showing
  var GAP = 6;            // px between trigger and tooltip
  var VIEWPORT_PAD = 4;   // px min distance from viewport edge

  var tip = null;         // the single shared tooltip node
  var showTimer = null;
  var currentTrigger = null;
  var lastPointer = null;   // {x, y} viewport coords, for SVG cursor-anchoring

  function ensureNode() {
    if (tip) return tip;
    tip = document.createElement("div");
    tip.className = "hk-tooltip";
    tip.setAttribute("role", "tooltip");
    tip.setAttribute("aria-hidden", "true");
    if (document.body) document.body.appendChild(tip);
    else document.addEventListener("DOMContentLoaded", function () {
      if (tip && !tip.parentNode) document.body.appendChild(tip);
    });
    return tip;
  }

  function position(trigger) {
    var node = ensureNode();
    var tw = node.offsetWidth;
    var th = node.offsetHeight;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;

    // SVG elements report a geometry-based bounding box that often does not
    // match the hovered region - e.g. donut arcs are stroked circles that all
    // share the full donut's box, so every slice would anchor to the same
    // point. For SVG, anchor to the cursor instead; for HTML, use the element
    // rect (stable, so a button's tooltip does not jitter with the pointer).
    var isSvg = (typeof SVGElement !== "undefined") && (trigger instanceof SVGElement) && !!lastPointer;

    var top, left, placeAbove;
    if (isSvg && lastPointer) {
      var below = lastPointer.y + GAP + 8;
      placeAbove = (below + th > vh - VIEWPORT_PAD) && (lastPointer.y - GAP - th >= VIEWPORT_PAD);
      top = placeAbove ? (lastPointer.y - GAP - th) : below;
      left = lastPointer.x - (tw / 2);
    } else {
      var r = trigger.getBoundingClientRect();
      var belowEl = r.bottom + GAP;
      placeAbove = (belowEl + th > vh - VIEWPORT_PAD) && (r.top - GAP - th >= VIEWPORT_PAD);
      top = placeAbove ? (r.top - GAP - th) : belowEl;
      left = r.left + (r.width / 2) - (tw / 2);
    }

    // Clamp into the viewport.
    if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
    if (left + tw > vw - VIEWPORT_PAD) left = vw - VIEWPORT_PAD - tw;
    if (top < VIEWPORT_PAD) top = VIEWPORT_PAD;

    node.style.top = Math.round(top) + "px";
    node.style.left = Math.round(left) + "px";
    node.setAttribute("data-placement", placeAbove ? "top" : "bottom");
  }

  function show(trigger) {
    var text = trigger.getAttribute("data-tooltip");
    if (!text) return;
    var node = ensureNode();
    node.textContent = text;

    // Associate the tooltip with its trigger for assistive tech.
    if (!node.id) node.id = "hk-tooltip-node";
    trigger.setAttribute("aria-describedby", node.id);

    // Make measurable, then position, then reveal.
    node.classList.add("hk-tooltip-measuring");
    node.setAttribute("aria-hidden", "false");
    position(trigger);
    node.classList.remove("hk-tooltip-measuring");
    node.classList.add("hk-tooltip-visible");
    currentTrigger = trigger;
  }

  function hide() {
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    if (!tip) return;
    tip.classList.remove("hk-tooltip-visible");
    tip.setAttribute("aria-hidden", "true");
    if (currentTrigger) {
      currentTrigger.removeAttribute("aria-describedby");
      currentTrigger = null;
    }
  }

  function scheduleShow(trigger) {
    if (showTimer) clearTimeout(showTimer);
    showTimer = setTimeout(function () { show(trigger); }, SHOW_DELAY);
  }

  // Resolve the nearest ancestor (or self) carrying a data-tooltip.
  function triggerFrom(target) {
    var el = target;
    while (el && el !== document.body) {
      if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute("data-tooltip")) return el;
      el = el.parentNode;
    }
    return null;
  }

  // --- Delegated listeners (cover dynamically-added elements) ---
  document.addEventListener("mousemove", function (e) {
    lastPointer = { x: e.clientX, y: e.clientY };
  }, { passive: true });
  document.addEventListener("mouseover", function (e) {
    lastPointer = { x: e.clientX, y: e.clientY };
    var trigger = triggerFrom(e.target);
    if (!trigger || trigger === currentTrigger) return;
    scheduleShow(trigger);
  });
  document.addEventListener("mouseout", function (e) {
    var trigger = triggerFrom(e.target);
    if (!trigger) return;
    // Ignore moves within the same trigger's subtree.
    var to = e.relatedTarget;
    if (to && trigger.contains(to)) return;
    hide();
  });
  document.addEventListener("focusin", function (e) {
    var trigger = triggerFrom(e.target);
    if (!trigger) return;
    show(trigger); // focus shows immediately (no hover-intent delay)
  });
  document.addEventListener("focusout", function (e) {
    var trigger = triggerFrom(e.target);
    if (!trigger) return;
    hide();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && currentTrigger) hide();
  });
  // Dismiss on scroll/resize since the anchored position goes stale.
  window.addEventListener("scroll", function () { if (currentTrigger) hide(); }, true);
  window.addEventListener("resize", function () { if (currentTrigger) hide(); });

  window.HvTooltip = { show: show, hide: hide };
})();
