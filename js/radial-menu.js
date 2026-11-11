/* ===== Radial Menu (reusable ring of actions around the cursor) =====
   Hyperkit shared module - available to all hyper-ecosystem apps.

   Usage:
     HvRadialMenu.register(selector, itemsFn, { shift: true })
     HvRadialMenu.open(x, y, items)
     HvRadialMenu.close()

   selector:  CSS selector for elements whose right-click opens the ring.
   options.shift: open on Shift + right-click instead, taking priority over the
              context menu so the ring works anywhere, even over a card.
   itemsFn:   Function(targetEl, event) -> Array of 2 to 8 items:
              { label, icon?, svg?, action(center)?, children?, active?, disabled? }
   icon is a Lucide name; svg is trusted inline SVG markup. An item with neither
   shows its label as text in the tile. action gets the ring's center {x, y}.
   An item with children opens a second ring of those items in its place; the
   middle button (or Backspace) steps back. active marks the current choice.

   The ring opens centered on the cursor and stays inside the viewport. The
   hovered or focused item's label shows in the middle. Arrow keys move between
   items, Enter or a click runs one, the digits 1-8 pick an item directly, and
   Escape steps back or closes. A plain right-click already handled by the
   context menu is left alone.
*/
(function initRadialMenu() {
  if (window.HvRadialMenu) return; // idempotent

  var MAX_ITEMS = 8;
  var EDGE = 4;
  var root = null;
  var scrim = null;
  var hub = null;
  var buttons = [];
  var trail = [];
  var returnFocus = null;
  var center = { x: 0, y: 0 };
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
    root.setAttribute('data-depth', '0');
    hub = document.createElement('button');
    hub.type = 'button';
    hub.className = 'radial-menu-hub';
    hub.tabIndex = -1;
    hub.addEventListener('click', function (e) { e.stopPropagation(); back(); });
    document.body.appendChild(root);
  }

  function ensure() {
    if (!root && document.body) build();
    return !!root;
  }

  function isOpen() { return !!root && root.classList.contains('open'); }

  function close() {
    if (!root || scrim.hidden) return;
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
    scrim.hidden = true;
    root.innerHTML = '';
    buttons = [];
    trail = [];
    if (returnFocus && returnFocus.isConnected && returnFocus.focus) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }

  function show(button) {
    var text = button ? button.getAttribute('aria-label') : (trail.length ? 'Back' : '');
    hub.textContent = text;
    buttons.forEach(function (other) { other.classList.toggle('is-active', other === button); });
  }

  function run(item) {
    var at = center;
    close();
    if (item.action) item.action(at);
  }

  function pick(item, list) {
    if (item.children && item.children.length) {
      trail.push(list);
      render(item.children);
    } else {
      run(item);
    }
  }

  function back() {
    if (trail.length) render(trail.pop());
  }

  function makeButton(item, index, list) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'radial-menu-item';
    button.setAttribute('role', item.active === undefined ? 'menuitem' : 'menuitemradio');
    if (item.active !== undefined) button.setAttribute('aria-checked', item.active ? 'true' : 'false');
    if (item.children && item.children.length) button.setAttribute('aria-haspopup', 'menu');
    button.classList.toggle('is-checked', !!item.active);
    button.setAttribute('aria-label', item.label);
    if (item.disabled) button.disabled = true;
    var angle = (index / list.length) * Math.PI * 2 - Math.PI / 2;
    button.style.setProperty('--radial-x', Math.cos(angle).toFixed(4));
    button.style.setProperty('--radial-y', Math.sin(angle).toFixed(4));
    button.style.setProperty('--radial-index', index);
    var face = document.createElement('span');
    if (item.svg || item.icon) {
      face.className = 'radial-menu-icon';
      face.innerHTML = item.svg || '<i data-lucide="' + item.icon + '"></i>';
    } else {
      face.className = 'radial-menu-text';
      face.textContent = item.label;
    }
    button.appendChild(face);
    button.addEventListener('mouseenter', function () { show(button); });
    button.addEventListener('focus', function () { show(button); });
    button.addEventListener('mouseleave', function () { if (document.activeElement !== button) show(null); });
    button.addEventListener('click', function (e) { e.stopPropagation(); pick(item, list); });
    return button;
  }

  // Draws one ring of items; the tiles fly out from the middle each time, including when a sub-ring replaces it.
  function render(list) {
    root.classList.remove('open');
    root.innerHTML = '';
    root.setAttribute('data-depth', String(trail.length));
    hub.tabIndex = trail.length ? 0 : -1;
    root.appendChild(hub);
    buttons = list.map(function (item, index) { return makeButton(item, index, list); });
    buttons.forEach(function (button) { root.appendChild(button); });
    if (window.lucide) window.lucide.createIcons({ nodes: [root], attrs: { 'stroke-width': 2 } });
    show(null);
    void root.offsetWidth;
    requestAnimationFrame(function () {
      if (!root || scrim.hidden) return;
      root.classList.add('open');
      var start = buttons.filter(function (button) { return button.classList.contains('is-checked') && !button.disabled; })[0]
        || buttons.filter(function (button) { return !button.disabled; })[0];
      if (start) start.focus({ preventScroll: true });
    });
  }

  // Opens the ring centered on a point, nudged inward so the whole ring stays on screen.
  function open(x, y, items) {
    if (!items || !items.length || !ensure()) return;
    close();
    scrim.hidden = false;
    root.style.left = '0px';
    root.style.top = '0px';
    var half = root.offsetWidth / 2;
    var cx = Math.min(Math.max(EDGE + half, x), Math.max(EDGE + half, window.innerWidth - EDGE - half));
    var cy = Math.min(Math.max(EDGE + half, y), Math.max(EDGE + half, window.innerHeight - EDGE - half));
    root.style.left = cx + 'px';
    root.style.top = cy + 'px';
    center = { x: cx, y: cy };
    root.setAttribute('aria-hidden', 'false');
    returnFocus = document.activeElement;
    trail = [];
    render(items.slice(0, MAX_ITEMS));
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
    if (e.key === 'Escape') { e.preventDefault(); if (trail.length) back(); else close(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); back(); return; }
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
