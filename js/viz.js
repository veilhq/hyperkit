/* ===== Hyperkit — Visualization Primitives (window.HvViz) =====
   Vanilla renderers for the hv-viz-* CSS primitives (css/viz.css). No frameworks,
   no charting library — SVG for donut/bar/stacked/legend, <canvas> for line/spark.

   Self-contained IIFE, idempotent, strict mode — same idiom as HvToast/HvUtils.
   Load once, ahead of app scripts that call it.

   API (all take a container element or its id):
     HvViz.donut(target, { segments:[{label,value,color}], total?, totalLabel?, thickness?, gap? })
     HvViz.bars(target, { rows:[{label,value,color?}], max? })
     HvViz.stackedBar(target, { segments:[{label,value,color}], legend? })
     HvViz.teamBars(target, { rows:[{name,meta?,segments:[{label,value,color?}]}] })
     HvViz.legend(target, items:[{label,color,style?}])   // style: 'swatch'|'line'|'line-dashed'
     HvViz.lineChart(target, { series:[{points:[y...],color?,dashed?}], xLabels?, yMax?, yTitle?, xTitle?, todayIndex?, todayLabel?, legend? })
     HvViz.sparkline(target, { values:[n...], color?, baseline?, showValues? })

   Colors: pass explicit per-item colors, or omit to fall back to the shared
   palette (accent/warm/cool/... resolved from tokens at render time).
*/
(function initHvViz() {
  'use strict';
  if (window.HvViz) return; // idempotent

  // --- helpers -----------------------------------------------------------
  function el(target) {
    return typeof target === 'string' ? document.getElementById(target) : target;
  }
  function token(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  // Default categorical palette — token-resolved, cycles for extra segments.
  function palette() {
    return [
      token('--accent', '#00ff41'),
      token('--warm', '#ffb000'),
      token('--cool', '#00cccc'),
      token('--comp', '#ff3333'),
      token('--text-muted', '#909090'),
      token('--accent-dim', '#00cc33')
    ];
  }
  function colorAt(i, explicit) {
    if (explicit) return explicit;
    var p = palette();
    return p[i % p.length];
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    return e;
  }
  function emptyState(node, msg) {
    clear(node);
    var d = document.createElement('div');
    d.className = 'hv-viz-empty';
    d.textContent = msg || 'No data available';
    node.appendChild(d);
  }
  // Canvas hi-DPI setup — returns {ctx, w, h} or null if no element.
  function setupCanvas(canvas, fallbackH) {
    if (!canvas) return null;
    var container = canvas.parentElement;
    var dpr = window.devicePixelRatio || 1;
    var w = container.offsetWidth;
    var h = container.offsetHeight || fallbackH;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx: ctx, w: w, h: h };
  }

  // --- legend ------------------------------------------------------------
  function legend(target, items) {
    var node = el(target);
    if (!node) return;
    clear(node);
    node.className = 'hv-viz-legend';
    (items || []).forEach(function (it) {
      var item = document.createElement('div');
      item.className = 'hv-viz-legend-item';
      var mark = document.createElement('div');
      var style = it.style || 'swatch';
      if (style === 'line') {
        mark.className = 'hv-viz-legend-line';
        mark.style.background = it.color;
      } else if (style === 'line-dashed') {
        mark.className = 'hv-viz-legend-line-dashed';
      } else {
        mark.className = 'hv-viz-legend-swatch';
        mark.style.background = it.color;
      }
      item.appendChild(mark);
      var label = document.createElement('span');
      label.textContent = it.label;
      item.appendChild(label);
      node.appendChild(item);
    });
  }

  // --- donut / ring (SVG stroke-dasharray) -------------------------------
  function donut(target, opts) {
    var node = el(target);
    if (!node) return;
    opts = opts || {};
    var segs = (opts.segments || []).filter(function (s) { return s.value > 0; });
    var total = opts.total != null
      ? opts.total
      : segs.reduce(function (a, s) { return a + s.value; }, 0);

    if (!segs.length || total <= 0) { emptyState(node, opts.emptyMessage); return; }

    clear(node);
    node.className = 'hv-viz-donut-wrap';

    // Geometry: viewBox 100x100, radius chosen so stroke sits inside.
    var thickness = opts.thickness || 10;
    var gap = opts.gap != null ? opts.gap : 2;
    var r = 50 - thickness / 2;
    var circ = 2 * Math.PI * r;

    var donutBox = document.createElement('div');
    donutBox.className = 'hv-viz-donut';
    var svg = svgEl('svg', { viewBox: '0 0 100 100', role: 'img' });

    // Track ring
    svg.appendChild(svgEl('circle', {
      class: 'hv-viz-donut-track', cx: 50, cy: 50, r: r, 'stroke-width': thickness
    }));

    // Length normalization so small slices stay visible without dots:
    //   1. Any slice whose TRUE share is below the minimum visible fraction
    //      (minArc/circ ≈ 7.78%) is floored to that minimum — bumped up so it
    //      can render as an arc.
    //   2. The slices above the floor split the REMAINING fraction
    //      (1 − sum of floored fractions), proportioned among their own values.
    // Original segment order is preserved (no sorting). The tooltip still
    // reports each slice's true percentage; only the drawn length is adjusted.
    var minFrac = (gap + thickness) / circ;  // ≈ 7.78% floor for a visible arc

    // Pass 1 — decide floored vs free, in the caller's original order.
    var flooredSum = 0;     // sum of floored display fractions
    var freeValue = 0;      // sum of values for non-floored slices
    var meta = segs.map(function (s) {
      var trueFrac = total > 0 ? s.value / total : 0;
      var floored = trueFrac < minFrac;
      if (floored) flooredSum += minFrac;
      else freeValue += s.value;
      return { s: s, trueFrac: trueFrac, floored: floored };
    });
    // Guard: if floors would consume the whole ring (many tiny slices), cap the
    // floor fraction so `remaining` can't go negative.
    var remaining = 1 - flooredSum;
    if (remaining < 0) { remaining = 0; }

    // Pass 2 — assign each slice its display fraction.
    meta.forEach(function (m) {
      if (m.floored) {
        m.dispFrac = minFrac;
      } else {
        m.dispFrac = freeValue > 0 ? (m.s.value / freeValue) * remaining : 0;
      }
    });

    // Render — every slice is a full-thickness round-capped arc.
    var offset = 0;
    meta.forEach(function (m, i) {
      var s = m.s, color = colorAt(i, s.color);
      var slotLen = m.dispFrac * circ;
      var dash = Math.max(0.01, slotLen - gap - thickness);
      var pad = (slotLen - (dash + thickness)) / 2;

      // TRUE percentage (not display-adjusted) for the tooltip + accessible name.
      var segLabel = s.label + ': ' + s.value + ' (' + Math.round(m.trueFrac * 100) + '%)';
      var arc = svgEl('circle', {
        class: 'hv-viz-donut-seg',
        cx: 50, cy: 50, r: r,
        stroke: color,
        'stroke-width': thickness,
        'stroke-linecap': 'round',
        'stroke-dasharray': dash.toFixed(3) + ' ' + (circ - dash).toFixed(3),
        'stroke-dashoffset': (-(offset + pad + thickness / 2)).toFixed(3),
        'data-tooltip': segLabel,
        'aria-label': segLabel
      });
      svg.appendChild(arc);
      offset += slotLen;
    });
    donutBox.appendChild(svg);

    // Center total
    var center = document.createElement('div');
    center.className = 'hv-viz-donut-center';
    var totalEl = document.createElement('div');
    totalEl.className = 'hv-viz-donut-total';
    totalEl.textContent = total;
    center.appendChild(totalEl);
    if (opts.totalLabel) {
      var lbl = document.createElement('div');
      lbl.className = 'hv-viz-donut-total-label';
      lbl.textContent = opts.totalLabel;
      center.appendChild(lbl);
    }
    donutBox.appendChild(center);
    node.appendChild(donutBox);

    // Legend
    if (opts.legend !== false) {
      var legendNode = document.createElement('div');
      node.appendChild(legendNode);
      legend(legendNode, segs.map(function (s, i) {
        return { label: s.label + ' (' + s.value + ')', color: colorAt(i, s.color) };
      }));
    }
  }

  // --- horizontal bars ---------------------------------------------------
  function bars(target, opts) {
    var node = el(target);
    if (!node) return;
    opts = opts || {};
    var rows = opts.rows || [];
    if (!rows.length) { emptyState(node, opts.emptyMessage); return; }
    var max = opts.max != null
      ? opts.max
      : Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([0]));
    clear(node);
    node.className = 'hv-viz-bars';
    rows.forEach(function (r, i) {
      var pct = max > 0 ? (r.value / max) * 100 : 0;
      var row = document.createElement('div');
      row.className = 'hv-viz-bar-row';

      var track = document.createElement('div');
      track.className = 'hv-viz-bar-track';
      var fill = document.createElement('div');
      fill.className = 'hv-viz-bar-fill';
      fill.style.width = pct + '%';
      if (r.color) fill.style.background = r.color;
      track.appendChild(fill);

      // Label overlaid inside the track. mix-blend-mode (see viz.css) makes the
      // text auto-contrast against both the filled and empty parts of the bar,
      // so it stays legible regardless of fill color or bar length.
      var label = document.createElement('span');
      label.className = 'hv-viz-bar-label';
      label.textContent = r.label;
      track.appendChild(label);

      var val = document.createElement('span');
      val.className = 'hv-viz-bar-val';
      val.textContent = r.value;

      row.appendChild(track);
      row.appendChild(val);
      node.appendChild(row);
    });
  }

  // --- stacked bar -------------------------------------------------------
  function stackedBar(target, opts) {
    var node = el(target);
    if (!node) return;
    opts = opts || {};
    var segs = (opts.segments || []).filter(function (s) { return s.value > 0; });
    var total = segs.reduce(function (a, s) { return a + s.value; }, 0);
    if (!segs.length || total <= 0) { emptyState(node, opts.emptyMessage); return; }
    clear(node);
    node.className = '';

    var bar = document.createElement('div');
    bar.className = 'hv-viz-stacked';
    segs.forEach(function (s, i) {
      var seg = document.createElement('div');
      seg.className = 'hv-viz-stacked-seg';
      seg.style.width = ((s.value / total) * 100) + '%';
      seg.style.background = colorAt(i, s.color);
      seg.setAttribute('data-tooltip', s.label + ': ' + s.value);
      bar.appendChild(seg);
    });
    node.appendChild(bar);

    if (opts.legend !== false) {
      var legendNode = document.createElement('div');
      node.appendChild(legendNode);
      legend(legendNode, segs.map(function (s, i) {
        return { label: s.label + ' (' + s.value + ')', color: colorAt(i, s.color) };
      }));
    }
  }

  // --- team bars (labeled multi-row stacked: name + stacked bar + meta) ---
  // rows: [{ name, meta?, segments:[{label,value,color?}] }]
  function teamBars(target, opts) {
    var node = el(target);
    if (!node) return;
    opts = opts || {};
    var rows = (opts.rows || []).filter(function (r) {
      return (r.segments || []).some(function (s) { return s.value > 0; });
    });
    if (!rows.length) { emptyState(node, opts.emptyMessage); return; }
    clear(node);
    node.className = 'hv-viz-team';
    rows.forEach(function (r) {
      var total = (r.segments || []).reduce(function (a, s) { return a + s.value; }, 0) || 1;
      var row = document.createElement('div');
      row.className = 'hv-viz-team-row';

      var name = document.createElement('span');
      name.className = 'hv-viz-team-name';
      name.textContent = r.name;

      var bar = document.createElement('div');
      bar.className = 'hv-viz-team-bar';
      (r.segments || []).forEach(function (s, i) {
        if (s.value <= 0) return;
        var seg = document.createElement('div');
        seg.className = 'hv-viz-team-seg';
        seg.style.width = ((s.value / total) * 100) + '%';
        seg.style.background = colorAt(i, s.color);
        seg.setAttribute('data-tooltip', s.label + ': ' + s.value);
        bar.appendChild(seg);
      });

      var meta = document.createElement('span');
      meta.className = 'hv-viz-team-meta';
      meta.textContent = r.meta != null ? r.meta : total;

      row.appendChild(name);
      row.appendChild(bar);
      row.appendChild(meta);
      node.appendChild(row);
    });
  }

  // --- line chart (canvas — burndown-style ideal/actual) -----------------
  function lineChart(target, opts) {
    var node = el(target);
    if (!node) return;
    opts = opts || {};
    var series = opts.series || [];

    // Ensure a canvas child exists.
    var canvas = node.querySelector('canvas');
    if (!canvas) { clear(node); canvas = document.createElement('canvas'); node.appendChild(canvas); }
    node.classList.add('hv-viz-line');

    function draw() {
      var s = setupCanvas(canvas, 180);
      if (!s) return;
      var ctx = s.ctx, w = s.w, h = s.h;
      var textDim = token('--text-dim', '#666');
      var textMuted = token('--text-muted', '#909090');
      var border = token('--border', '#222');
      var font = '10px ' + token('--font', 'monospace');

      var allPts = series.reduce(function (a, ser) { return a.concat(ser.points || []); }, []);
      if (!allPts.length) {
        ctx.fillStyle = textMuted; ctx.font = font; ctx.textAlign = 'center';
        ctx.fillText(opts.emptyMessage || 'no data', w / 2, h / 2);
        return;
      }

      var padL = 40, padR = 12, padT = 16, padB = 28;
      var cw = w - padL - padR, ch = h - padT - padB;
      var yMax = opts.yMax != null ? opts.yMax : Math.max.apply(null, allPts) || 1;
      var maxLen = Math.max.apply(null, series.map(function (ser) { return (ser.points || []).length; }));

      // gridlines
      ctx.strokeStyle = border; ctx.lineWidth = 1;
      var step = Math.ceil(yMax / 5 / 5) * 5; if (step < 1) step = 1;
      for (var val = 0; val <= yMax; val += step) {
        var y = padT + ch * (1 - val / yMax);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke();
        ctx.fillStyle = textDim; ctx.font = font; ctx.textAlign = 'right';
        ctx.fillText(val, padL - 6, y + 4);
      }
      // x labels
      if (opts.xLabels) {
        ctx.textAlign = 'center'; ctx.fillStyle = textDim;
        opts.xLabels.forEach(function (lab, i) {
          var x = padL + (cw / Math.max(1, opts.xLabels.length - 1)) * i;
          ctx.fillText(lab, x, padT + ch + 14);
        });
      }
      // axis titles (optional)
      var titleFont = '9px ' + token('--font', 'monospace');
      if (opts.yTitle) {
        ctx.save();
        ctx.translate(10, padT + ch / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = textMuted; ctx.font = titleFont; ctx.textAlign = 'center';
        ctx.fillText(opts.yTitle, 0, 0);
        ctx.restore();
      }
      if (opts.xTitle) {
        ctx.fillStyle = textMuted; ctx.font = titleFont; ctx.textAlign = 'center';
        ctx.fillText(opts.xTitle, padL + cw / 2, h - 2);
      }
      // series
      series.forEach(function (ser) {
        var pts = ser.points || [];
        if (!pts.length) return;
        ctx.strokeStyle = ser.color || token('--accent', '#00ff41');
        ctx.lineWidth = ser.dashed ? 1.5 : 2;
        ctx.setLineDash(ser.dashed ? [6, 4] : []);
        ctx.beginPath();
        for (var i = 0; i < pts.length; i++) {
          var x = padL + (cw / Math.max(1, maxLen - 1)) * i;
          var y = padT + ch * (1 - pts[i] / yMax);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (!ser.dashed) {
          ctx.fillStyle = ser.color || token('--accent', '#00ff41');
          for (var j = 0; j < pts.length; j++) {
            var px = padL + (cw / Math.max(1, maxLen - 1)) * j;
            var py = padT + ch * (1 - pts[j] / yMax);
            ctx.fillRect(px - 3, py - 3, 6, 6); // square dots, no radius
          }
        }
      });
      // today marker (optional) — vertical dashed line + label at a data index
      if (opts.todayIndex != null && opts.todayIndex >= 0) {
        var accent = token('--accent', '#00ff41');
        var tx = padL + (cw / Math.max(1, maxLen - 1)) * opts.todayIndex;
        ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(tx, padT); ctx.lineTo(tx, padT + ch); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = accent; ctx.font = titleFont; ctx.textAlign = 'center';
        ctx.fillText(opts.todayLabel || 'today', tx, padT - 2);
      }
    }

    draw();
    if (!canvas.__hvVizBound) {
      window.addEventListener('resize', draw);
      canvas.__hvVizBound = true;
    }

    if (opts.legend) {
      var legendNode = node.querySelector('.hv-viz-legend');
      if (!legendNode) { legendNode = document.createElement('div'); node.appendChild(legendNode); }
      legend(legendNode, opts.legend);
    }
  }

  // --- sparkline (canvas) ------------------------------------------------
  function sparkline(target, opts) {
    var node = el(target);
    if (!node) return;
    opts = opts || {};
    var values = opts.values || [];
    var canvas = node.querySelector('canvas');
    if (!canvas) { clear(node); canvas = document.createElement('canvas'); node.appendChild(canvas); }
    node.classList.add('hv-viz-sparkline');

    function draw() {
      var s = setupCanvas(canvas, 120);
      if (!s) return;
      var ctx = s.ctx, w = s.w, h = s.h;
      if (!values.length) return;
      var accent = opts.color || token('--accent', '#00ff41');
      var textDim = token('--text-dim', '#666');
      var font = '9px ' + token('--font', 'monospace');
      var padL = 12, padR = 12, padT = 20, padB = 18;
      var cw = w - padL - padR, ch = h - padT - padB;
      var minV = Math.min.apply(null, values) - 3;
      var maxV = Math.max.apply(null, values) + 3;
      var range = (maxV - minV) || 1;
      function xAt(i) { return padL + (cw / Math.max(1, values.length - 1)) * i; }
      function yAt(v) { return padT + ch * (1 - (v - minV) / range); }

      // average baseline (optional)
      if (opts.baseline) {
        var avg = values.reduce(function (a, b) { return a + b; }, 0) / values.length;
        var ay = yAt(avg);
        ctx.strokeStyle = textDim; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(padL, ay); ctx.lineTo(padL + cw, ay); ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath();
      values.forEach(function (v, i) {
        var x = xAt(i), y = yAt(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = accent;
      values.forEach(function (v, i) {
        ctx.fillRect(xAt(i) - 2, yAt(v) - 2, 4, 4);
      });

      // value labels above points (optional)
      if (opts.showValues) {
        ctx.fillStyle = textDim; ctx.font = font; ctx.textAlign = 'center';
        values.forEach(function (v, i) {
          ctx.fillText(v, xAt(i), yAt(v) - 6);
        });
      }
    }

    draw();
    if (!canvas.__hvVizBound) {
      window.addEventListener('resize', draw);
      canvas.__hvVizBound = true;
    }
  }

  window.HvViz = {
    donut: donut,
    bars: bars,
    stackedBar: stackedBar,
    teamBars: teamBars,
    legend: legend,
    lineChart: lineChart,
    sparkline: sparkline
  };
})();
