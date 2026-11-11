/* ===== Radial Menu (reusable ring of actions around the cursor) =====
   Hyperkit shared module - available to all hyper-ecosystem apps.

   Usage:
     HvRadialMenu.register(selector, itemsFn, { shift: true })
     HvRadialMenu.open(x, y, items)
     HvRadialMenu.close()

   selector:  CSS selector for elements whose right-click opens the ring.
   options.shift: open on Shift + right-click instead, taking priority over the
              context menu so the ring works anywhere, even over a card.
   itemsFn:   Function(targetEl, event) -> Array of 3 to 8 items:
              { label, icon?, svg?, action, disabled? }
   icon is a Lucide name; svg is trusted inline SVG markup (use one or the other).

   The ring opens centered on the cursor and stays inside the viewport. The
   hovered or focused item's label shows in the middle. Arrow keys move between
   items, Enter or a click runs one, the digits 1-8 run an item directly, and
   Escape or a click outside closes it. A plain right-click already handled by
   the context menu is left alone.
*/
(function initRadialMenu() {
  if (window.HvRadialMenu) return; // idempotent

  var MAX_ITEMS = 8;
  var EDGE = 4;
  var root = null;
  var scrim = null;
  var label = null;
  var buttons = [];
  var returnFocus = null;
  var registrations = [];

  function build() {
    scrim = document.createElement('div');
    scrim.className = 'radial-menu-scrim';
    scrim.hidden = true;
    scrim.addEventListener('mousedown', close);
    scrim.addEventListener('contextmenu', function (e) { e.preventDefault(); close(); });
    document.body.appendChild(scrim);

    root = document.createElement('div');
    root.className = 'radial-menu';
    root.setAttribute('role', 'menu');
    root.setAttribute('aria-hidden', 'true');
    label = document.createElement('span');
    label.className = 'radial-menu-label';
    label.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);
  }

  function ensure() {
    if (!root && document.body) build();
    return !!root;
  }

  function isOpen() { return !!root && root.classList.contains('open'); }

  function close() {
    if (!isOpen()) return;
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
    scrim.hidden = true;
    root.innerHTML = '';
    buttons = [];
    if (returnFocus && returnFocus.isConnected && returnFocus.focus) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }

  function show(button) {
    label.textContent = button ? button.getAttribute('aria-label') : '';
    buttons.forEach(function (other) { other.classList.toggle('is-active', other === button); });
  }

  function run(item) {
    close();
    if (item.action) item.action();
  }

  function makeButton(item, index, count) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'radial-menu-item';
    button.setAttribute('role', 'menuitem');
    button.setAttribute('aria-label', item.label);
    if (item.disabled) button.disabled = true;
    var angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    button.style.setProperty('--radial-x', Math.cos(angle).toFixed(4));
    button.style.setProperty('--radial-y', Math.sin(angle).toFixed(4));
    button.style.setProperty('--radial-index', index);
    var icon = document.createElement('span');
    icon.className = 'radial-menu-icon';
    if (item.svg) icon.innerHTML = item.svg;
    else if (item.icon) icon.innerHTML = '<i data-lucide="' + item.icon + '"></i>';
    button.appendChild(icon);
    button.addEventListener('mouseenter', function () { show(button); });
    button.addEventListener('focus', function () { show(button); });
    button.addEventListener('mouseleave', function () { if (document.activeElement !== button) show(null); });
    button.addEventListener('click', function (e) { e.stopPropagation(); run(item); });
    return button;
  }

  // Opens the ring centered on a point, nudged inward so the whole ring stays on screen.
  function open(x, y, items) {
    if (!items || !items.length || !ensure()) return;
    close();
    var list = items.slice(0, MAX_ITEMS);
    root.innerHTML = '';
    root.appendChild(label);
    buttons = list.map(function (item, index) { return makeButton(item, index, list.length); });
    buttons.forEach(function (button) { root.appendChild(button); });
    if (window.lucide) window.lucide.createIcons({ nodes: [root], attrs: { 'stroke-width': 2 } });
    show(null);
    scrim.hidden = false;
    root.style.left = '0px';
    root.style.top = '0px';
    var half = root.offsetWidth / 2;
    var cx = Math.min(Math.max(EDGE + half, x), Math.max(EDGE + half, window.innerWidth - EDGE - half));
    var cy = Math.min(Math.max(EDGE + half, y), Math.max(EDGE + half, window.innerHeight - EDGE - half));
    root.style.left = cx + 'px';
    root.style.top = cy + 'px';
    root.setAttribute('aria-hidden', 'false');
    returnFocus = document.activeElement;
    requestAnimationFrame(function () {
      if (!root) return;
      root.classList.add('open');
      var first = buttons.filter(function (button) { return !button.disabled; })[0];
      if (first) first.focus({ preventScroll: true });
    });
  }

  function step(direction) {
    var live = buttons.filter(function (button) { return !button.disabled; });
    if (!live.length) return;
    var at = live.indexOf(document.activeElement);
    live[(at + direction + live.length) % live.length].focus({ preventScroll: true });
  }

  // Opens the first matching registration that offers items; returns whether it did.
  function tryOpen(e, shifted) {
    for (var i = 0; i < registrations.length; i++) {
      if (registrations[i].shift !== shifted) continue;
      var target = e.target.closest(registrations[i].selector);
      if (!target) continue;
      var items = registrations[i].itemsFn(target, e);
      if (items && items.length) {
        e.preventDefault();
        open(e.clientX, e.clientY, items);
        return true;
      }
    }
    return false;
  }

  // Shift + right-click runs first (capture) so it wins over the context menu.
  document.addEventListener('contextmenu', function (e) {
    if (e.shiftKey && tryOpen(e, true)) e.stopImmediatePropagation();
  }, true);
  document.addEventListener('contextmenu', function (e) {
    if (!e.defaultPrevented && !e.shiftKey) tryOpen(e, false);
  });

  document.addEventListener('keydown', function (e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); return; }
    var digit = Number(e.key);
    if (digit >= 1 && digit <= buttons.length && !buttons[digit - 1].disabled) { e.preventDefault(); buttons[digit - 1].click(); }
  });
  window.addEventListener('resize', close);
  window.addEventListener('blur', close);

  window.HvRadialMenu = {
    register: function (selector, itemsFn, options) {
      registrations.push({ selector: selector, itemsFn: itemsFn, shift: !!(options && options.shift) });
    },
    open: open,
    close: close
  };
})();
