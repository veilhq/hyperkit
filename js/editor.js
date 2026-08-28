/* === Hyperkit: Shared Editor Component ===
   Reusable plaintext editor with save/cancel, Tab-inserts-spaces,
   Ctrl+S save, dirty tracking. Consumer provides read/write callbacks.

   Usage:
     var editor = window.HvEditor.create({
       container: document.getElementById('my-container'),
       onSave: function(content) { ... return Promise },
       onCancel: function() { ... },
     });
     editor.open(content, filename);
     editor.close();
*/

(function() {
"use strict";

if (window.HvEditor) return;

window.HvEditor = { create: create };

function create(opts) {
  var container = opts.container;
  var onSave = opts.onSave || function() {};
  var onCancel = opts.onCancel || function() {};

  var wrap = null;
  var textarea = null;
  var indicator = null;
  var filenameEl = null;
  var dirty = false;
  var currentFilename = "";
  var isOpen = false;

  function build() {
    wrap = document.createElement("div");
    wrap.className = "hv-editor-wrap";
    wrap.style.display = "none";

    // Header row: filename + indicator
    var header = document.createElement("div");
    header.className = "hv-editor-header";

    filenameEl = document.createElement("span");
    filenameEl.className = "hv-editor-filename";
    header.appendChild(filenameEl);

    indicator = document.createElement("span");
    indicator.className = "hv-editor-indicator";
    header.appendChild(indicator);

    wrap.appendChild(header);

    // Textarea
    textarea = document.createElement("textarea");
    textarea.className = "hv-editor-textarea";
    textarea.setAttribute("spellcheck", "false");
    textarea.setAttribute("autocomplete", "off");
    textarea.setAttribute("autocorrect", "off");
    textarea.setAttribute("autocapitalize", "off");
    textarea.setAttribute("aria-label", "File editor");
    wrap.appendChild(textarea);

    // Action bar
    var actions = document.createElement("div");
    actions.className = "hv-editor-actions";

    var cancelBtn = document.createElement("button");
    cancelBtn.className = "hv-editor-cancel";
    cancelBtn.textContent = "cancel";
    cancelBtn.addEventListener("click", close);

    var saveBtn = document.createElement("button");
    saveBtn.className = "hv-editor-save";
    saveBtn.textContent = "save";
    saveBtn.addEventListener("click", save);

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    wrap.appendChild(actions);

    // Key handlers
    textarea.addEventListener("keydown", function(e) {
      // Tab inserts 2 spaces
      if (e.key === "Tab") {
        e.preventDefault();
        var start = textarea.selectionStart;
        var end = textarea.selectionEnd;
        var val = textarea.value;
        textarea.value = val.substring(0, start) + "  " + val.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        dirty = true;
      }
      // Ctrl+S save
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
      // Esc cancel
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });

    textarea.addEventListener("input", function() {
      dirty = true;
    });

    container.appendChild(wrap);
  }

  function open(content, filename) {
    if (!wrap) build();
    currentFilename = filename || "";
    filenameEl.textContent = currentFilename;
    textarea.value = content || "";
    dirty = false;
    wrap.style.display = "";
    isOpen = true;
    showIndicator("");
    textarea.focus();
  }

  function close() {
    if (!isOpen) return;
    if (wrap) wrap.style.display = "none";
    isOpen = false;
    dirty = false;
    onCancel();
  }

  function save() {
    if (!dirty || !isOpen) return;
    dirty = false;
    showIndicator("saving...");
    var result = onSave(textarea.value, currentFilename);
    if (result && typeof result.then === "function") {
      result.then(function(ok) {
        showIndicator(ok ? "saved" : "error");
        if (ok) setTimeout(function() { showIndicator(""); }, 2000);
      }).catch(function() {
        showIndicator("error");
        dirty = true;
      });
    } else {
      showIndicator("saved");
      setTimeout(function() { showIndicator(""); }, 2000);
    }
  }

  function showIndicator(msg) {
    if (!indicator) return;
    indicator.textContent = msg;
    indicator.classList.toggle("visible", !!msg);
  }

  function getValue() {
    return textarea ? textarea.value : "";
  }

  function isDirty() {
    return dirty;
  }

  return {
    open: open,
    close: close,
    save: save,
    getValue: getValue,
    isDirty: isDirty,
    isOpen: function() { return isOpen; },
  };
}

})();
