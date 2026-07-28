/* ===== Toast notifications (WI-115 variant-aware primitive) =====
   Relocated to Hyperkit (WI-142 Phase 1). Previously byte-mirrored between
   `.hypervisor/assets/js/core/00-core.js` and `.hyperagent/assets/js/00-core.js`
   — see `.hyperspace/work/done/hyper-ecosystem-toast-rework.md` for the
   original consolidation history. Source of truth now lives here; do not
   copy this back into either app's local assets/js/.

     HvToast.show("plain message")                    → info variant, 3s
     HvToast.show({ variant, title, message, icon,
                    duration, action, dedupeKey })    → full options

     variant:   'success' | 'info' | 'warn' | 'error'   (default: 'info')
     duration:  ms number | 'sticky'                    (variant defaults apply)
     action:    { label: string, onClick: () => void }  (adds inline button)
     dedupeKey: string — replaces prior toast with same key (rebuild spam guard)

   Also exposed as `window.__hypervisorToast` for the Hypervisor Python bridge
   and legacy call sites (drop-import.js, writeback.js, content.js, pins.js,
   ideas-dismiss.js, hypervisor-app.py). Despite the Hypervisor-specific name,
   both apps expose this alias for cross-app snippet compatibility. Both
   signatures (string or options) flow through the same code path.
*/
(function initToasts() {
  if (window.HvToast) return; // idempotent

  var container = document.createElement('div');
  container.className = 'hv-toast-container';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'false');
  function attach() { document.body.appendChild(container); }
  if (document.body) attach();
  else document.addEventListener('DOMContentLoaded', attach);

  var VARIANTS = {
    success: { icon: 'check-circle',   duration: 3000,     assertive: false },
    info:    { icon: 'info',           duration: 3000,     assertive: false },
    warn:    { icon: 'alert-triangle', duration: 5000,     assertive: true  },
    error:   { icon: 'circle-x',       duration: 'sticky', assertive: true  }
  };
  var MAX_VISIBLE = 5;
  var EXIT_MS = 300;
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
    toast.classList.remove('hv-toast-visible');
    toast.classList.add('hv-toast-exit');
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
    var icon = opts.icon || defaults.icon;
    var duration = opts.duration != null ? opts.duration : defaults.duration;
    var sticky = duration === 'sticky';
    var message = opts.message == null ? '' : String(opts.message);
    var title = opts.title ? String(opts.title) : '';
    var action = opts.action && opts.action.label && typeof opts.action.onClick === 'function' ? opts.action : null;
    var dedupeKey = opts.dedupeKey || null;

    if (dedupeKey && dedupeMap[dedupeKey]) dismiss(dedupeMap[dedupeKey]);

    var toast = document.createElement('div');
    toast.className = 'hv-toast hv-toast-' + variant;
    if (defaults.assertive) toast.setAttribute('role', 'alert');
    toast.__dedupeKey = dedupeKey;

    var iconEl = document.createElement('i');
    iconEl.className = 'hv-toast-icon';
    iconEl.setAttribute('data-lucide', icon);
    toast.appendChild(iconEl);

    var body = document.createElement('div');
    body.className = 'hv-toast-body';
    if (title) {
      var titleEl = document.createElement('div');
      titleEl.className = 'hv-toast-title';
      titleEl.textContent = title;
      body.appendChild(titleEl);
    }
    var msgEl = document.createElement('div');
    msgEl.className = 'hv-toast-message';
    msgEl.textContent = message;
    body.appendChild(msgEl);
    if (action) {
      var actionBtn = document.createElement('button');
      actionBtn.className = 'hv-button hv-button-ghost hv-toast-action';
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
      closeBtn.className = 'hv-toast-close';
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

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { window.lucide.createIcons(); } catch (e) {}
    }

    requestAnimationFrame(function () { toast.classList.add('hv-toast-visible'); });

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
