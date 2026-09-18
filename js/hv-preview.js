/* ===== HvPreview — hover-loaded preview thumbnails (HyperKit) =====
   Loads each preview card's <iframe> only while the card is hovered, and
   unloads it shortly after the pointer leaves. The prototypes gallery contains
   many standalone WebGL apps; booting all of them at once exhausts the browser
   GPU process (WebView2 renders a crash page). Hover-loading keeps at most one
   or two live contexts at a time, which the GPU handles comfortably.

   The generator emits each iframe with an empty src and a data-preview-src
   attribute. HvPreview:
     - on card mouseenter/focusin: set src (boot the preview)
     - on card mouseleave/focusout: after a short grace period, clear src
       (tear the WebGL context down) so idle cards cost nothing

   The grace period avoids thrashing when the pointer skims across cards.

   Boundary: owns neither the card markup nor the iframe styling — only the src
   lifecycle. Containment is entirely CSS (the frame's overflow:hidden).

   Idempotent, strict-mode IIFE — matches the other HvX modules.
*/
(function initPreview() {
  "use strict";
  if (window.HvPreview) return; // idempotent

  var CARD_SELECTOR = ".preview-card";
  var UNLOAD_DELAY = 400; // ms grace before tearing down after pointer leaves

  function frameOf(card) {
    return card.querySelector("[data-preview-src]");
  }

  function boot(card) {
    var iframe = frameOf(card);
    if (!iframe) return;
    if (iframe._unloadTimer) {
      clearTimeout(iframe._unloadTimer);
      iframe._unloadTimer = null;
    }
    var src = iframe.getAttribute("data-preview-src");
    if (!src || iframe.getAttribute("src")) return; // nothing to do / already booted
    iframe.setAttribute("src", src);
    iframe.addEventListener(
      "load",
      function () {
        var box = iframe.closest(".preview-card-frame");
        if (box) box.classList.add("preview-loaded");
      },
      { once: true }
    );
  }

  function teardown(card) {
    var iframe = frameOf(card);
    if (!iframe || !iframe.getAttribute("src")) return;
    iframe._unloadTimer = setTimeout(function () {
      // Clearing src destroys the embedded document and its WebGL context.
      iframe.removeAttribute("src");
      var box = iframe.closest(".preview-card-frame");
      if (box) box.classList.remove("preview-loaded");
      iframe._unloadTimer = null;
    }, UNLOAD_DELAY);
  }

  function bind(card) {
    if (card._previewBound) return; // idempotent per card
    card._previewBound = true;
    card.addEventListener("mouseenter", function () { boot(card); });
    card.addEventListener("mouseleave", function () { teardown(card); });
    // Keyboard/focus parity — booting on focus so keyboard users see the preview.
    card.addEventListener("focusin", function () { boot(card); });
    card.addEventListener("focusout", function () { teardown(card); });
  }

  function scan(root) {
    root = root || document;
    var cards = root.querySelectorAll(CARD_SELECTOR);
    Array.prototype.forEach.call(cards, bind);
  }

  function init() {
    scan(document);
    if (window.__router && typeof window.__router.onNavigate === "function") {
      window.__router.onNavigate(null, function () { scan(document); });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.addEventListener("routeChanged", function () { scan(document); });

  window.HvPreview = { scan: scan, init: init };
})();
