/* ===== Hyperkit: Shared JS Utilities =====
   Small utility functions used by multiple ecosystem apps.
   Loaded before all app-local JS - safe to reference from any module.

   Usage: HvUtils.escapeHtml(str)
*/
(function () {
  "use strict";
  if (window.HvUtils) return;

  window.HvUtils = {
    /**
     * Escape HTML special characters to prevent XSS in dynamic content.
     * @param {string} str - raw string to escape
     * @returns {string} - HTML-safe string
     */
    /** Zero-pad a count readout to two digits: 1 -> "01". */
    pad2: function (n) {
      return n < 10 ? "0" + n : String(n);
    },

    escapeHtml: function (str) {
      return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
  };
})();
