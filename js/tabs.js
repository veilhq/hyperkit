/* ===== Tabs behavioral primitive (HyperKit) =====
   The keyboard-navigation + ARIA layer for a tab strip. Adds roving tabindex,
   ArrowLeft/Right/Home/End navigation, and role/aria-selected management to a
   tablist the app already renders and owns.

   Boundary: this owns ONLY selection focus + keyboard + ARIA. It does not own
   what a tab contains or what happens on switch - the app keeps its tab model
   (chat sessions, terminal sessions, doc fragments) and does the actual content
   switch inside the onSelect hook. Composes with the style-only .nav-tab CSS
   primitive: HvTabs is the behavior half to its style half.

   Usage:
     HvTabs.register({
       tablist: elementOrId,        // container holding the tabs
       tabSelector: ".tab-item",    // how to find tab elements within it
       onSelect: fn(tabEl, index)   // app hook: perform the actual switch
     });

   Handles a CHANGING set of tabs: a MutationObserver re-applies roving tabindex
   whenever the app re-renders the strip, so add/remove/reorder need no extra
   calls. Reads tabs live from the DOM each time rather than caching references.

   Automatic activation: arrow keys move selection AND fire onSelect (matches the
   click-to-switch feel these strips already have). Home/End jump to ends.

   Idempotent, strict-mode IIFE - matches the other HvX modules.
*/
(function initTabs() {
  "use strict";
  if (window.HvTabs) return; // idempotent

  function resolve(elOrId) {
    if (!elOrId) return null;
    return typeof elOrId === "string" ? document.getElementById(elOrId) : elOrId;
  }

  function register(opts) {
    opts = opts || {};
    var tablist = resolve(opts.tablist);
    var tabSelector = opts.tabSelector || ".nav-tab";
    var onSelect = typeof opts.onSelect === "function" ? opts.onSelect : null;
    if (!tablist) return null;

    tablist.setAttribute("role", "tablist");

    function tabs() {
      return Array.prototype.slice.call(tablist.querySelectorAll(tabSelector));
    }

    function selectedIndex(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].getAttribute("aria-selected") === "true") return i;
      }
      return -1;
    }

    // Apply role + roving tabindex to the current tab set. The selected tab is
    // the only one in the tab order (tabindex 0); the rest are -1, reachable via
    // arrow keys. Re-run whenever the strip changes.
    function applyRovingTabindex() {
      var list = tabs();
      var sel = selectedIndex(list);
      if (sel === -1 && list.length) sel = 0; // default focusable = first
      list.forEach(function (tab, i) {
        tab.setAttribute("role", "tab");
        if (!tab.hasAttribute("aria-selected")) {
          tab.setAttribute("aria-selected", i === sel ? "true" : "false");
        }
        tab.setAttribute("tabindex", i === sel ? "0" : "-1");
      });
    }

    function select(index, focus) {
      var list = tabs();
      if (!list.length) return;
      if (index < 0) index = list.length - 1;
      if (index >= list.length) index = 0;
      var tab = list[index];
      // Roving tabindex: only the newly-selected tab is tabbable.
      list.forEach(function (t, i) {
        t.setAttribute("tabindex", i === index ? "0" : "-1");
      });
      // Run the app's switch first - it may re-render the whole strip, which
      // would destroy `tab`. So re-query and focus by index afterward.
      if (onSelect) onSelect(tab, index);
      if (focus) {
        var after = tabs();
        var target = after[index];
        if (target) {
          target.setAttribute("tabindex", "0");
          target.focus();
        }
      }
    }

    tablist.addEventListener("keydown", function (e) {
      var list = tabs();
      if (!list.length) return;
      // Only act when focus is on a tab within this list.
      var current = list.indexOf(document.activeElement);
      if (current === -1) return;
      var next = null;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown": next = current + 1; break;
        case "ArrowLeft":
        case "ArrowUp": next = current - 1; break;
        case "Home": next = 0; break;
        case "End": next = list.length - 1; break;
        default: return;
      }
      e.preventDefault();
      select(next, true);
    });

    // Re-apply roving tabindex when the app re-renders the strip.
    applyRovingTabindex();
    var observer = new MutationObserver(function () { applyRovingTabindex(); });
    observer.observe(tablist, { childList: true, subtree: true });

    return {
      refresh: applyRovingTabindex,
      select: function (index) { select(index, false); }
    };
  }

  window.HvTabs = { register: register };
})();
