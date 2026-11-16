/* ===== Switch - metaball filter =====
   Adds the shared SVG goo filter that .switch-goo references, once per page.
   The filter thresholds blurred alpha only, so the dots keep their color.
*/
(function () {
  "use strict";

  function addFilter() {
    if (document.getElementById("hk-switch-goo")) return;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "switch-filter");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = '<filter id="hk-switch-goo" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">'
      + '<feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur"/>'
      + '<feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 16 -6"/></filter>';
    document.body.appendChild(svg);
  }

  if (document.body) addFilter();
  else document.addEventListener("DOMContentLoaded", addFilter);
})();
