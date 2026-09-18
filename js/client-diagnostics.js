/* ===== HvClientDiag — renderer error capture -> server log (HyperKit) =====
   Pipes renderer-side failures to hypervisor.log via the PyWebView bridge
   (window.pywebview.api.log_client_error), so errors that precede a WebView2
   renderer crash are captured server-side. The renderer's own console is lost
   when the process dies, so this forwarding is the only durable trace.

   Captures:
     - window.onerror (uncaught synchronous errors)
     - unhandledrejection (uncaught promise rejections)
     - a periodic memory high-water mark (Chromium performance.memory), which
       helps confirm/deny an out-of-memory renderer crash after the fact

   Best-effort and defensive: if the bridge isn't ready, it queues and flushes
   once available. Never throws (a crash-logger that crashes is worthless).

   Idempotent, strict-mode IIFE — matches the other HvX modules.
*/
(function initClientDiag() {
  "use strict";
  if (window.HvClientDiag) return; // idempotent

  var queue = [];
  var MAX_QUEUE = 50;

  function bridgeReady() {
    return !!(window.pywebview && window.pywebview.api &&
              typeof window.pywebview.api.log_client_error === "function");
  }

  function flush() {
    if (!bridgeReady() || !queue.length) return;
    var pending = queue.splice(0, queue.length);
    pending.forEach(function (payload) {
      try { window.pywebview.api.log_client_error(payload); } catch (e) { /* drop */ }
    });
  }

  function report(payload) {
    try {
      payload.url = location.pathname + (location.hash || "");
      payload.ts = new Date().toISOString();
      if (queue.length < MAX_QUEUE) queue.push(payload);
      flush();
    } catch (e) { /* never throw from the reporter */ }
  }

  window.addEventListener("error", function (e) {
    report({
      kind: "error",
      message: (e && e.message) || String(e),
      source: (e && e.filename) || "",
      line: (e && e.lineno) || "",
      col: (e && e.colno) || "",
      stack: (e && e.error && e.error.stack) ? String(e.error.stack) : ""
    });
  });

  window.addEventListener("unhandledrejection", function (e) {
    var reason = e && e.reason;
    report({
      kind: "unhandledrejection",
      message: (reason && reason.message) ? reason.message : String(reason),
      stack: (reason && reason.stack) ? String(reason.stack) : ""
    });
  });

  // Memory high-water mark — non-standard (Chromium only), guarded. Logs only
  // when usage crosses a new 100MB band, so it flags a climb toward an OOM
  // renderer crash without spamming.
  var lastBand = 0;
  function sampleMemory() {
    try {
      var m = window.performance && window.performance.memory;
      if (!m) return;
      var usedMB = Math.round(m.usedJSHeapSize / (1024 * 1024));
      var band = Math.floor(usedMB / 100);
      if (band > lastBand) {
        lastBand = band;
        report({
          kind: "memory",
          message: "JS heap ~" + usedMB + "MB (limit ~" +
                   Math.round(m.jsHeapSizeLimit / (1024 * 1024)) + "MB)"
        });
      }
    } catch (e) { /* ignore */ }
  }
  setInterval(sampleMemory, 5000);

  // Flush queued reports once the bridge comes online.
  if (window.pywebview) {
    window.addEventListener("pywebviewready", flush);
  }
  setInterval(flush, 3000);

  window.HvClientDiag = { report: report, flush: flush };
})();
