/* ===== Kaomoji greeting picker - extractable module =====
   Rotating greetings for the homepage / Hyperagent welcome screen.
   Kaomoji entries (any greeting that doesn't start with an ASCII letter) get
   the `emote` CSS class applied for glow treatment.

   Public API exposed on window.HvGreeting:
     pick() - returns { text, isEmote }
     applyTo(element) - picks and applies to element (sets textContent + emote class)

   Lives in Hyperkit. Source of truth - do not copy back
   into app-local assets/js/. Each app's build pulls this file directly.
   ================================================================= */

(function () {
  if (window.HvGreeting) return;

  var GREETINGS = [
    'Welcome back, {name}.',
    'Workspace online.',
    'Good to see you, {name}.',
    'Hyperspace loaded.',
    'Ready when you are.',
    'Let\'s get to work.',
    'The vault, as you left it.',
    'Still here. Still working.',
    'Awaiting instruction.',
    'Terminal\'s warm.',
    'The desk is yours.',
    'Lights are on.',
    'Back in the vault.',
    'Everything where you left it.',
    // Butler register - JARVIS/Alfred: composed, ready, never servile, no fake telemetry
    'Standing by.',
    'Full capacity. Awaiting input.',
    'All channels open.',
    'Online and listening.',
    'Systems warm. Standing by.',
    'Every tool on the rack.',
    'At your service.',
    'Good to have you back, {name}.',
    'Shall we begin?',
    'Whenever you\'re ready, {name}.',
    'Powered up and at the ready.',
    'Everything is running smoothly.',
    // Kaomoji - ambient flavor, no state claims
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

  // Address forms treated as names/titles - capitalized wherever they land.
  var ADDRESS = ['V', 'Operator'];

  function pick() {
    var text = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
    var name = ADDRESS[Math.floor(Math.random() * ADDRESS.length)];
    text = text.replace('{name}', name);
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
