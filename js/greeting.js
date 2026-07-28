/* ===== Kaomoji greeting picker — extractable module (WI-112 Phase 6) =====
   Rotating greetings for the homepage / Hyperagent welcome screen.
   Kaomoji entries (any greeting that doesn't start with an ASCII letter) get
   the `emote` CSS class applied for glow treatment.

   Public API exposed on window.HvGreeting:
     pick()                  — returns { text, isEmote }
     applyTo(element)        — picks and applies to element (sets textContent + emote class)

   Relocated to Hyperkit (WI-142 Phase 1). Source of truth — do not copy back
   into app-local assets/js/. Each app's build pulls this file directly.
   ================================================================= */

(function () {
  if (window.HvGreeting) return;

  var GREETINGS = [
    'welcome back, operator.',
    'workspace online.',
    'good to see you, V.',
    'systems nominal.',
    'hyperspace loaded.',
    'ready when you are.',
    'let\'s get to work.',
    'signal acquired.',
    'context restored.',
    'the vault, as you left it.',
    'still here. still working.',
    'no drift detected.',
    'awaiting instruction.',
    'all lines open.',
    'buffer clear. proceed.',
    'the map is up to date.',
    // Kaomoji greetings — canonical list from steering
    '[+1]',
    '(-_-)b',
    '[\u2713]',
    '\\o/',
    '(._.)',
    '(?_?)',
    '(\uff3e_\uff3e)\uff9e',
    '(\u3000-_-)\u65e6~',
    '(._. )'
  ];

  function pick() {
    var text = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
    var isEmote = !/^[a-zA-Z]/.test(text);
    return { text: text, isEmote: isEmote };
  }

  function applyTo(element) {
    if (!element) return null;
    var g = pick();
    element.textContent = g.text;
    element.classList.toggle('emote', g.isEmote);
    return g;
  }

  window.HvGreeting = { pick: pick, applyTo: applyTo };
})();
