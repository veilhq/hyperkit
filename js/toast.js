/* ===== Toast notifications (WI-115 variant-aware primitive) =====
   Relocated to Hyperkit (WI-142 Phase 1). Previously byte-mirrored between
   `.hypervisor/assets/js/core/00-core.js` and `.hyperagent/assets/js/00-core.js`
   — see `.hyperspace/work/done/hyper-ecosystem-toast-rework.md` for the
   original consolidation history. Source of truth now lives here; do not
   copy this back into either app's local assets/js/.

     HvToast.show("plain message")                    → info variant, 3s
     HvToast.show({ variant, title, message,
                    duration, action, dedupeKey })    → full options

     variant:   'success' | 'info' | 'warn' | 'error'   (default: 'info')
     duration:  ms number | 'sticky'                    (variant defaults apply)
     action:    { label: string, onClick: () => void }  (adds inline button)
     dedupeKey: string — replaces prior toast with same key (rebuild spam guard)

   State is expressed the way a tool-indicator expresses it: the whole box is
   filled in the variant color with the glyph + message knocked out in --bg,
   and severity is carried by the icon mark + fill color (success check, info
   `i`, warn triangle, error `x`). There is no level/title text. A legacy `icon`
   option and a legacy `title` option are both accepted and ignored for
   call-site compatibility.

   Also exposed as `window.__hypervisorToast` for the Hypervisor Python bridge
   and legacy call sites (drop-import.js, writeback.js, content.js, pins.js,
   ideas-dismiss.js, hypervisor-app.py). Despite the Hypervisor-specific name,
   both apps expose this alias for cross-app snippet compatibility. Both
   signatures (string or options) flow through the same code path.
*/
(function initToasts() {
  if (window.HvToast) return; // idempotent

  var container = document.createElement('div');
  container.className = 'notification-toast-container';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'false');
  function attach() { document.body.appendChild(container); }
  if (document.body) attach();
  else document.addEventListener('DOMContentLoaded', attach);

  // Per-variant behavior + icon mark. The box fills with the variant color
  // (driven by the `.notification-toast-{variant}` class in CSS); the glyph is
  // knocked out of that fill in --bg. Marks are hard-edged inline SVGs matching
  // the ecosystem's lucide-style line icons: success check, info `i`, warn solid
  // triangle, error `x`. The JS carries the mark SVG + duration/assertiveness.
  var MARKS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"><path d="M4 12l5 5L20 6"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><line x1="12" y1="10" x2="12" y2="17"/><line x1="12" y1="6.4" x2="12" y2="6.5"/></svg>',
    warn:    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3 L22 20 L2 20 Z"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>'
  };
  var VARIANTS = {
    success: { duration: 3000,     assertive: false },
    info:    { duration: 3000,     assertive: false },
    warn:    { duration: 5000,     assertive: true  },
    error:   { duration: 'sticky', assertive: true  }
  };
  var MAX_VISIBLE = 5;
  var EXIT_MS = 300;
  // Delay before unfurling: let the toolAppear scale-in (--motion-slow, 0.3s)
  // settle as a square first, THEN grow the width open. Keeps the two entrance
  // beats sequential rather than overlapping.
  var UNFURL_MS = 320;
  var visible = [];       // ordered oldest → newest
  var dedupeMap = {};     // key → toast element

  function normalize(input) {
    if (typeof input === 'string') return { variant: 'info', message: input };
    if (!input || typeof input !== 'object') return { variant: 'info', message: String(input) };
    return input;
  }

  function dismiss(toast) {
    if (!toast || toast.__dismissed) return;
    toast.__dismissed = true;
    if (toast.__timer) clearTimeout(toast.__timer);
    if (toast.__unfurlTimer) clearTimeout(toast.__unfurlTimer);
    toast.classList.remove('notification-toast-unfurled');
    toast.classList.remove('notification-toast-visible');
    toast.classList.add('notification-toast-exit');
    var idx = visible.indexOf(toast);
    if (idx >= 0) visible.splice(idx, 1);
    if (toast.__dedupeKey && dedupeMap[toast.__dedupeKey] === toast) {
      delete dedupeMap[toast.__dedupeKey];
    }
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, EXIT_MS);
  }

  function show(input) {
    var opts = normalize(input);
    var variant = VARIANTS[opts.variant] ? opts.variant : 'info';
    var defaults = VARIANTS[variant];
    var duration = opts.duration != null ? opts.duration : defaults.duration;
    var sticky = duration === 'sticky';
    var message = opts.message == null ? '' : String(opts.message);
    // `title` is accepted for call-site compatibility but no longer rendered -
    // severity is carried by the icon mark + fill color, not a level label.
    var action = opts.action && opts.action.label && typeof opts.action.onClick === 'function' ? opts.action : null;
    var dedupeKey = opts.dedupeKey || null;

    if (dedupeKey && dedupeMap[dedupeKey]) dismiss(dedupeMap[dedupeKey]);

    var toast = document.createElement('div');
    toast.className = 'notification-toast notification-toast-' + variant;
    if (defaults.assertive) toast.setAttribute('role', 'alert');
    toast.__dedupeKey = dedupeKey;

    // Icon mark - the glyph knocked out of the variant-color fill. The mark SVG
    // is set in JS (per variant); the fill/knockout is driven by the CSS class.
    var iconEl = document.createElement('span');
    iconEl.className = 'notification-toast-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.innerHTML = MARKS[variant] || MARKS.info;
    toast.appendChild(iconEl);

    // Body - the unfurling region to the right of the icon. Holds the message
    // and (when present) the inline action button.
    var body = document.createElement('div');
    body.className = 'notification-toast-body';
    var msgEl = document.createElement('div');
    msgEl.className = 'notification-toast-message';
    msgEl.textContent = message;
    // Message truncates to a single line with an ellipsis; expose the full text
    // as a native tooltip so a clipped message is still recoverable on hover.
    if (message) msgEl.title = message;
    body.appendChild(msgEl);
    if (action) {
      var actionBtn = document.createElement('button');
      actionBtn.className = 'action-button action-button-ghost notification-toast-action';
      actionBtn.type = 'button';
      actionBtn.textContent = action.label;
      actionBtn.addEventListener('click', function () {
        try { action.onClick(); } catch (e) {}
        dismiss(toast);
      });
      body.appendChild(actionBtn);
    }
    toast.appendChild(body);

    if (sticky || action) {
      var closeBtn = document.createElement('button');
      closeBtn.className = 'notification-toast-close';
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Dismiss notification');
      closeBtn.textContent = '\u00d7';
      closeBtn.addEventListener('click', function () { dismiss(toast); });
      toast.appendChild(closeBtn);
    }

    container.appendChild(toast);
    visible.push(toast);
    if (dedupeKey) dedupeMap[dedupeKey] = toast;

    while (visible.length > MAX_VISIBLE) dismiss(visible[0]);

    // Entry: the box scales in as a square (toolAppear, CSS), then unfurls its
    // width open once the scale-in has settled.
    toast.__unfurlTimer = setTimeout(function () {
      toast.classList.add('notification-toast-unfurled');
    }, UNFURL_MS);

    if (!sticky) {
      toast.__timer = setTimeout(function () { dismiss(toast); }, duration);
    }

    return { dismiss: function () { dismiss(toast); } };
  }

  // Recover pending notification from a live-reload (Hypervisor-only path;
  // no-op in Hyperagent where nothing writes this key).
  try {
    var pending = sessionStorage.getItem('__hv_notify');
    if (pending) {
      sessionStorage.removeItem('__hv_notify');
      show(pending);
    }
  } catch (e) {}

  window.HvToast = { show: show, dismiss: dismiss };
  window.__hypervisorToast = show;  // legacy alias — accepts string or options
})();
