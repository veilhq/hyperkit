/* ===== Context Menu (reusable right-click menu primitive) =====
   Hyperkit shared module - available to all hyper-ecosystem apps.

   Usage:
     HvContextMenu.register(selector, itemsFn)

   selector:  CSS selector for elements that trigger the context menu.
   itemsFn:   Function(targetEl, event) -> Array of menu item objects:
              { label, icon?, action, disabled?, separator? }

   Special item: { separator: true } renders a divider line.

   Example:
     HvContextMenu.register('a[data-href]', function (el) {
       return [
         { label: 'Open', icon: 'external-link', action: function () { ... } },
         { label: 'Copy path', icon: 'clipboard', action: function () { ... } },
         { separator: true },
         { label: 'Delete', icon: 'trash-2', action: function () { ... }, disabled: true },
       ];
     });

   Multiple registrations can match the same element - items are merged in
   registration order. The menu positions itself near the cursor and stays
   within viewport bounds.

   HvContextMenu.openFor(element, items) opens the same menu anchored to an
   element instead of the cursor.
*/
(function initContextMenu() {
  if (window.HvContextMenu) return; // idempotent

  var menu = null;
  var registrations = [];

  function createMenuEl() {
    var el = document.createElement('div');
    el.className = 'floating-panel context-menu';
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    return el;
  }

  function ensureMenu() {
    if (!menu) {
      if (document.body) menu = createMenuEl();
      else document.addEventListener('DOMContentLoaded', function () { menu = createMenuEl(); });
    }
    return menu;
  }

  function close() {
    if (menu) {
      menu.setAttribute('aria-hidden', 'true');
      menu.classList.remove('visible');
      menu.innerHTML = '';
    }
  }

  var EDGE = 4;
  var GAP = 4;

  // Measures the menu while it is still hidden, picks a spot, then reveals it - so it never visibly jumps.
  // A point opens at the cursor; an anchor rect opens beside an element, below it when there is room, else above.
  function positionMenu(x, y, anchor) {
    if (!menu) return;
    menu.classList.remove('visible', 'flip-up', 'flip-end');
    menu.style.left = '0px';
    menu.style.top = '0px';
    // offset sizes ignore the reveal transform, which shrinks getBoundingClientRect while it unfurls.
    var width = menu.offsetWidth;
    var height = menu.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var left, top, up = false, end = false;
    if (anchor) {
      left = anchor.left;
      if (left + width > vw - EDGE) { left = anchor.right - width; end = true; }
      top = anchor.bottom + GAP;
      if (top + height > vh - EDGE && anchor.top - GAP - height >= EDGE) { top = anchor.top - GAP - height; up = true; }
    } else {
      left = x;
      if (left + width > vw - EDGE) { left = x - width; end = true; }
      top = y;
      if (top + height > vh - EDGE && y - height >= EDGE) { top = y - height; up = true; }
    }
    left = Math.min(Math.max(EDGE, left), Math.max(EDGE, vw - width - EDGE));
    top = Math.min(Math.max(EDGE, top), Math.max(EDGE, vh - height - EDGE));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.classList.toggle('flip-up', up);
    menu.classList.toggle('flip-end', end);
    menu.setAttribute('aria-hidden', 'false');
    menu.classList.add('visible');
  }

  function renderItems(items) {
    if (!menu) return;
    menu.innerHTML = '';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.separator) {
        var sep = document.createElement('div');
        sep.className = 'menu-item-separator';
        sep.setAttribute('role', 'separator');
        menu.appendChild(sep);
        continue;
      }

      // Submenu item - expandable group with children
      if (item.children && item.children.length) {
        (function (parentItem) {
          var group = document.createElement('div');
          group.className = 'context-menu-group';

          var trigger = document.createElement('button');
          trigger.className = 'menu-item context-menu-item-parent';
          trigger.setAttribute('role', 'menuitem');
          trigger.setAttribute('aria-expanded', 'false');
          var triggerHtml = '';
          if (parentItem.icon) {
            triggerHtml += '<i data-lucide="' + parentItem.icon + '" class="menu-item-icon"></i>';
          }
          triggerHtml += '<span class="menu-item-label">' + parentItem.label + '</span>';
          triggerHtml += '<i data-lucide="chevron-right" class="context-menu-chevron"></i>';
          trigger.innerHTML = triggerHtml;

          var childWrap = document.createElement('div');
          childWrap.className = 'context-menu-children';
          childWrap.setAttribute('aria-hidden', 'true');

          for (var c = 0; c < parentItem.children.length; c++) {
            var child = parentItem.children[c];
            if (child.separator) {
              var csep = document.createElement('div');
              csep.className = 'menu-item-separator';
              csep.setAttribute('role', 'separator');
              childWrap.appendChild(csep);
              continue;
            }
            var cbtn = document.createElement('button');
            cbtn.className = 'menu-item context-menu-item-child';
            cbtn.setAttribute('role', 'menuitem');
            if (child.disabled) { cbtn.disabled = true; cbtn.classList.add('disabled'); }
            var chtml = '';
            if (child.icon) {
              chtml += '<i data-lucide="' + child.icon + '" class="menu-item-icon"></i>';
            }
            chtml += '<span class="menu-item-label">' + child.label + '</span>';
            cbtn.innerHTML = chtml;
            (function (action) {
              cbtn.addEventListener('click', function (e) {
                e.stopPropagation();
                close();
                if (action) action();
              });
            })(child.action);
            childWrap.appendChild(cbtn);
          }

          trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            // Only one submenu open at a time - collapse siblings first.
            if (!group.classList.contains('context-menu-group-open') && menu) {
              var openGroups = menu.querySelectorAll('.context-menu-group-open');
              for (var o = 0; o < openGroups.length; o++) {
                openGroups[o].classList.remove('context-menu-group-open');
                var t = openGroups[o].querySelector('.context-menu-item-parent');
                if (t) t.setAttribute('aria-expanded', 'false');
              }
            }
            var expanded = group.classList.toggle('context-menu-group-open');
            trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            childWrap.setAttribute('aria-hidden', expanded ? 'false' : 'true');
            // Flip the flyout to the left when it would overflow the right edge.
            childWrap.classList.remove('flip-left');
            childWrap.style.top = '';
            if (expanded) {
              requestAnimationFrame(function () {
                var rect = childWrap.getBoundingClientRect();
                if (rect.right > window.innerWidth - EDGE) {
                  childWrap.classList.add('flip-left');
                }
                // Slide the flyout up when it would run off the bottom edge, keeping its top on screen.
                var over = rect.bottom - (window.innerHeight - EDGE);
                if (over > 0) {
                  var shift = Math.min(over, Math.max(0, rect.top - EDGE));
                  childWrap.style.top = 'calc(var(--space-3) * -1 - ' + shift + 'px)';
                }
              });
            }
          });

          group.appendChild(trigger);
          group.appendChild(childWrap);
          menu.appendChild(group);
        })(item);
        continue;
      }

      var btn = document.createElement('button');
      btn.className = 'menu-item';
      btn.setAttribute('role', 'menuitem');
      if (item.disabled) {
        btn.disabled = true;
        btn.classList.add('disabled');
      }
      // Icon (Lucide name) + label
      var html = '';
      if (item.icon) {
        html += '<i data-lucide="' + item.icon + '" class="menu-item-icon"></i>';
      }
      html += '<span class="menu-item-label">' + item.label + '</span>';
      btn.innerHTML = html;
      // Bind action
      (function (action) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          close();
          if (action) action();
        });
      })(item.action);
      menu.appendChild(btn);
    }
    // Re-render Lucide icons inside the menu
    if (window.lucide) lucide.createIcons({ nodes: [menu], attrs: { 'stroke-width': 2 } });
  }

  function handleContextMenu(e) {
    var allItems = [];
    for (var i = 0; i < registrations.length; i++) {
      var reg = registrations[i];
      var target = e.target.closest(reg.selector);
      if (target) {
        var items = reg.itemsFn(target, e);
        if (items && items.length) {
          allItems = items;
          break; // First match with results wins - no merging
        }
      }
    }
    if (!allItems.length) return; // no matches - let default context menu through

    e.preventDefault();
    e.stopPropagation();
    ensureMenu();
    renderItems(allItems);
    positionMenu(e.clientX, e.clientY, null);
  }

  // Close on click outside, escape, or scroll
  document.addEventListener('click', function (e) {
    if (menu && !menu.contains(e.target)) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
  document.addEventListener('scroll', function (e) {
    if (menu && e.target instanceof Node && menu.contains(e.target)) return;
    close();
  }, true);

  // Listen globally for contextmenu
  document.addEventListener('contextmenu', handleContextMenu);

  // Public API
  window.HvContextMenu = {
    register: function (selector, itemsFn) {
      registrations.push({ selector: selector, itemsFn: itemsFn });
    },
    // Opens a menu of items beside an element (below it, or above when short on room). Call from the element's click handler with the click's propagation stopped.
    openFor: function (element, items) {
      if (!element || !items || !items.length) return;
      ensureMenu();
      renderItems(items);
      positionMenu(0, 0, element.getBoundingClientRect());
    },
    close: close
  };
})();
