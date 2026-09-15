/* ===== Disclosure behavioral primitive (HyperKit) =====
   Show/hide a panel from a trigger, with click-outside + Escape dismissal.
   Extracted from the byte-for-byte-identical open/close state machines that
   the model-picker and changelog dropdowns each hand-rolled.

   Boundary: this owns NEITHER content nor a rendered node. The app already has
   its trigger and panel markup in the DOM; HvDisclosure attaches only the
   open/close behavior to that existing trigger+panel+host triple. (Contrast:
   HvTooltip owns a shared node; HvContextMenu owns menu content.)

   Usage:
     var d = HvDisclosure.register({
       trigger: elOrId,           // the button that toggles the panel
       panel:   elOrId,           // the panel shown/hidden
       host:    elOrId,           // containment root for click-outside
                                  //   (default: trigger.parentNode)
       openClass:        "open",  // class toggled on the panel (default "open")
       triggerOpenClass: "...",   // optional class on trigger while open
       onOpen:  function () {},   // per-consumer side effect (render, load, ...)
       onClose: function () {}
     });
     // d.open() / d.close() / d.toggle() / d.isOpen()

   Two details are load-bearing and easy to get wrong when hand-rolled:
     1. The outside-click listener is attached on a setTimeout(0), AFTER the
        opening click finishes bubbling - otherwise that same click closes it.
     2. Listeners are attached in the CAPTURE phase and removed on close, so
        they never leak when multiple disclosures exist.

   Idempotent, strict-mode IIFE - matches the other HvX modules.
*/
(function initDisclosure() {
  "use strict";
  if (window.HvDisclosure) return; // idempotent

  function resolve(elOrId) {
    if (!elOrId) return null;
    return typeof elOrId === "string" ? document.getElementById(elOrId) : elOrId;
  }

  function register(opts) {
    opts = opts || {};
    var openClass = opts.openClass || "open";
    var triggerOpenClass = opts.triggerOpenClass || null;
    var onOpen = typeof opts.onOpen === "function" ? opts.onOpen : null;
    var onClose = typeof opts.onClose === "function" ? opts.onClose : null;

    var open = false;
    var docClick = null;
    var docKey = null;

    function els() {
      var trigger = resolve(opts.trigger);
      var panel = resolve(opts.panel);
      var host = resolve(opts.host) || (trigger ? trigger.parentNode : null);
      return { trigger: trigger, panel: panel, host: host };
    }

    function doOpen() {
      var e = els();
      if (!e.trigger || !e.panel || open) return;
      open = true;
      e.panel.classList.add(openClass);
      if (triggerOpenClass) e.trigger.classList.add(triggerOpenClass);
      e.trigger.setAttribute("aria-expanded", "true");
      if (onOpen) onOpen(e);

      // Defer the outside-click closer until the opening click has bubbled,
      // so it does not immediately close what it just opened.
      docClick = function (ev) {
        var host = els().host;
        if (host && !host.contains(ev.target)) doClose();
      };
      docKey = function (ev) {
        if (ev.key === "Escape") doClose();
      };
      setTimeout(function () {
        document.addEventListener("click", docClick, true);
        document.addEventListener("keydown", docKey, true);
      }, 0);
    }

    function doClose() {
      var e = els();
      if (!open) return;
      open = false;
      if (e.panel) e.panel.classList.remove(openClass);
      if (e.trigger) {
        if (triggerOpenClass) e.trigger.classList.remove(triggerOpenClass);
        e.trigger.setAttribute("aria-expanded", "false");
      }
      if (docClick) { document.removeEventListener("click", docClick, true); docClick = null; }
      if (docKey) { document.removeEventListener("keydown", docKey, true); docKey = null; }
      if (onClose) onClose(e);
    }

    function toggle() { if (open) doClose(); else doOpen(); }

    // Seed aria-expanded on the trigger if present.
    var seed = els();
    if (seed.trigger && !seed.trigger.hasAttribute("aria-expanded")) {
      seed.trigger.setAttribute("aria-expanded", "false");
    }

    return {
      open: doOpen,
      close: doClose,
      toggle: toggle,
      isOpen: function () { return open; }
    };
  }

  window.HvDisclosure = { register: register };
})();
