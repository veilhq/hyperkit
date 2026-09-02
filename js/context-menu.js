/* ===== Context Menu (reusable right-click menu primitive) =====
   Hyperkit shared module — available to all hyper-ecosystem apps.

   Usage:
     HvContextMenu.register(selector, itemsFn)

   selector:  CSS selector for elements that trigger the context menu.
   itemsFn:   Function(targetEl, event) → Array of menu item objects:
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

   Multiple registrations can match the same element — items are merged in
   registration order. The menu positions itself near the cursor and stays
   within viewport bounds.
*/
(function initContextMenu() {
  if (window.HvContextMenu) return; // idempotent

  var menu = null;
  var registrations = [];

  function createMenuEl() {
    var el = document.createElement('div');
    el.className = 'context-menu';
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

  function positionMenu(x, y) {
    if (!menu) return;
    // Place at cursor, then adjust to stay in viewport
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.add('visible');
    menu.setAttribute('aria-hidden', 'false');

    // Adjust after render so dimensions are known
    requestAnimationFrame(function () {
      var rect = menu.getBoundingClientRect();
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      if (rect.right > vw) menu.style.left = Math.max(4, x - rect.width) + 'px';
      if (rect.bottom > vh) menu.style.top = Math.max(4, y - rect.height) + 'px';
    });
  }

  function renderItems(items) {
    if (!menu) return;
    menu.innerHTML = '';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.separator) {
        var sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        sep.setAttribute('role', 'separator');
        menu.appendChild(sep);
        continue;
      }

      // Submenu item — expandable group with children
      if (item.children && item.children.length) {
        (function (parentItem) {
          var group = document.createElement('div');
          group.className = 'context-menu-group';

          var trigger = document.createElement('button');
          trigger.className = 'context-menu-item context-menu-item-parent';
          trigger.setAttribute('role', 'menuitem');
          trigger.setAttribute('aria-expanded', 'false');
          var triggerHtml = '';
          if (parentItem.icon) {
            triggerHtml += '<i data-lucide="' + parentItem.icon + '" class="context-menu-icon"></i>';
          }
          triggerHtml += '<span class="context-menu-label">' + parentItem.label + '</span>';
          triggerHtml += '<i data-lucide="chevron-right" class="context-menu-chevron"></i>';
          trigger.innerHTML = triggerHtml;

          var childWrap = document.createElement('div');
          childWrap.className = 'context-menu-children';
          childWrap.setAttribute('aria-hidden', 'true');

          for (var c = 0; c < parentItem.children.length; c++) {
            var child = parentItem.children[c];
            if (child.separator) {
              var csep = document.createElement('div');
              csep.className = 'context-menu-separator';
              csep.setAttribute('role', 'separator');
              childWrap.appendChild(csep);
              continue;
            }
            var cbtn = document.createElement('button');
            cbtn.className = 'context-menu-item context-menu-item-child';
            cbtn.setAttribute('role', 'menuitem');
            if (child.disabled) { cbtn.disabled = true; cbtn.classList.add('disabled'); }
            var chtml = '';
            if (child.icon) {
              chtml += '<i data-lucide="' + child.icon + '" class="context-menu-icon"></i>';
            }
            chtml += '<span class="context-menu-label">' + child.label + '</span>';
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
            var expanded = group.classList.toggle('context-menu-group-open');
            trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            childWrap.setAttribute('aria-hidden', expanded ? 'false' : 'true');
          });

          group.appendChild(trigger);
          group.appendChild(childWrap);
          menu.appendChild(group);
        })(item);
        continue;
      }

      var btn = document.createElement('button');
      btn.className = 'context-menu-item';
      btn.setAttribute('role', 'menuitem');
      if (item.disabled) {
        btn.disabled = true;
        btn.classList.add('disabled');
      }
      // Icon (Lucide name) + label
      var html = '';
      if (item.icon) {
        html += '<i data-lucide="' + item.icon + '" class="context-menu-icon"></i>';
      }
      html += '<span class="context-menu-label">' + item.label + '</span>';
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
          break; // First match with results wins — no merging
        }
      }
    }
    if (!allItems.length) return; // no matches — let default context menu through

    e.preventDefault();
    e.stopPropagation();
    ensureMenu();
    renderItems(allItems);
    positionMenu(e.clientX, e.clientY);
  }

  // Close on click outside, escape, or scroll
  document.addEventListener('click', function (e) {
    if (menu && !menu.contains(e.target)) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
  document.addEventListener('scroll', close, true);

  // Listen globally for contextmenu
  document.addEventListener('contextmenu', handleContextMenu);

  // Public API
  window.HvContextMenu = {
    register: function (selector, itemsFn) {
      registrations.push({ selector: selector, itemsFn: itemsFn });
    },
    close: close
  };
})();
