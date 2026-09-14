/**
 * Hand-rolled inline SVG charts — no library, so they load instantly offline.
 *
 * House rules followed here: thin marks, one scale per chart (two measures on
 * different scales become two charts, never two axes), recessive gridlines,
 * 4px rounded data-ends, a 2px surface ring on overlapping dots, a hover
 * tooltip on every plot, and a "show the numbers" table behind each one so the
 * data is never locked behind colour.
 */
import { escapeHtml, fmtDateMed } from './util.js';

const VB_W = 320;

/* ------------------------------- tally ---------------------------------- */

/**
 * Hash marks, five to a group — the paper-and-pencil way of counting days.
 * Long streaks collapse into "×N" blocks so the page never renders thousands
 * of nodes.
 */
export function tally(days, { color = 'var(--ember)' } = {}) {
  if (days <= 0) return '<p class="tally-note">Your first mark appears after a full day free.</p>';
  const groups = Math.floor(days / 5);
  const rest = days % 5;
  const MAX_GROUPS = 80; // ~400 days drawn individually
  const drawn = Math.min(groups, MAX_GROUPS);
  const collapsed = groups - drawn;

  const mark = (n, full) => {
    const bars = [];
    for (let i = 0; i < n; i++) {
      const x = 5 + i * 9;
      bars.push(`<line x1="${x}" y1="4" x2="${x}" y2="34" />`);
    }
    if (full) bars.push('<line x1="1" y1="33" x2="42" y2="5" />');
    return `<svg class="tally-group" width="46" height="38" viewBox="0 0 46 38" aria-hidden="true"
      stroke="${color}" stroke-width="3.4" stroke-linecap="round" fill="none">${bars.join('')}</svg>`;
  };

  let html = '';
  for (let i = 0; i < drawn; i++) html += mark(4, true);
  if (rest) html += mark(rest, false);
  let note = groups === 0
    ? `<p class="tally-note"><strong>${days}</strong> mark${days === 1 ? '' : 's'} so far — five makes your first group.</p>`
    : `<p class="tally-note">${groups} group${groups === 1 ? '' : 's'} of five${rest ? ` + ${rest}` : ''} = <strong>${days}</strong> day${days === 1 ? '' : 's'}.</p>`;
  if (collapsed > 0) {
    html += `<span class="badge gold" style="align-self:center">+ ${collapsed * 5} more</span>`;
    note = `<p class="tally-note">Showing the most recent ${drawn * 5 + rest} marks of <strong>${days}</strong>.</p>`;
  }
  return `<div class="tally-wrap"><div class="tally-scroll" role="img"
      aria-label="${days} tally marks, one for each day free">${html}</div>${note}</div>`;
}

/* ------------------------------ sparkline -------------------------------- */

/**
 * One series, one scale. Points with a null value break the line rather than
 * inventing data for days that were never logged.
 */
export function sparkline(points, {
  color = 'var(--ember)', min, max, height = 84, valueFmt = (v) => String(v),
  id = `sp${Math.random().toString(36).slice(2, 7)}`, label = '', yLabels = false,
} = {}) {
  const real = points.filter((p) => p.v !== null && p.v !== undefined);
  if (real.length < 2) {
    return `<p class="chart-empty">Not enough logged days yet — this fills in as you check in.</p>`;
  }
  const lo = min ?? Math.min(...real.map((p) => p.v));
  const hi = max ?? Math.max(...real.map((p) => p.v));
  const span = hi - lo || 1;
  const padL = yLabels ? 20 : 6, padR = 6, padT = 10, padB = 16;
  const w = VB_W - padL - padR;
  const h = height - padT - padB;
  const xOf = (i) => padL + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const yOf = (v) => padT + h - ((v - lo) / span) * h;

  // Split into contiguous segments so gaps stay gaps.
  const segments = [];
  let cur = [];
  points.forEach((p, i) => {
    if (p.v === null || p.v === undefined) { if (cur.length) segments.push(cur); cur = []; }
    else cur.push({ x: xOf(i), y: yOf(p.v), i });
  });
  if (cur.length) segments.push(cur);

  const lines = segments.filter((s) => s.length > 1)
    .map((s) => `<path d="M${s.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}"
        fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const dots = segments.filter((s) => s.length === 1)
    .map((s) => `<circle cx="${s[0].x.toFixed(1)}" cy="${s[0].y.toFixed(1)}" r="3.2" fill="${color}"/>`).join('');

  // Every segment gets its own wash, so a gap reads as a gap rather than as
  // one stretch of the chart being highlighted.
  const area = segments.filter((seg) => seg.length > 1).map((seg) => `
    <path d="M${seg[0].x.toFixed(1)},${(padT + h).toFixed(1)}L${seg.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}L${seg[seg.length - 1].x.toFixed(1)},${(padT + h).toFixed(1)}Z"
          fill="${color}" opacity="0.1"/>`).join('');

  const last = real[real.length - 1];
  const lastIdx = points.findIndex((p) => p === last);
  const endX = xOf(lastIdx), endY = yOf(last.v);

  const tipData = points.map((p) => ({
    x: +xOf(points.indexOf(p)).toFixed(1),
    y: p.v === null || p.v === undefined ? null : +yOf(p.v).toFixed(1),
    t: `${fmtDateMed(p.key)} · ${p.v === null || p.v === undefined ? 'not logged' : valueFmt(p.v)}`,
  }));

  return `
  <div class="chart-wrap" data-chart="line" data-points='${escapeHtml(JSON.stringify(tipData))}' data-vbw="${VB_W}">
    <svg class="chart" viewBox="0 0 ${VB_W} ${height}" style="height:auto" role="img"
         aria-label="${escapeHtml(label || 'Trend')}: ${real.length} logged days, from ${valueFmt(lo)} to ${valueFmt(hi)}">
      <line x1="${padL}" y1="${padT + h}" x2="${VB_W - padR}" y2="${padT + h}" stroke="var(--line)" stroke-width="1"/>
      ${yLabels ? `
        <line x1="${padL}" y1="${(padT + h / 2).toFixed(1)}" x2="${VB_W - padR}" y2="${(padT + h / 2).toFixed(1)}" stroke="var(--line)" stroke-width="1" opacity=".7"/>
        <text x="0" y="${padT + 4}" font-size="9" fill="var(--ink-3)">${escapeHtml(valueFmt(hi))}</text>
        <text x="0" y="${padT + h + 3}" font-size="9" fill="var(--ink-3)">${escapeHtml(valueFmt(lo))}</text>` : ''}
      ${area}${lines}${dots}
      <circle cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="4.6" fill="${color}" stroke="var(--surface)" stroke-width="2"/>
      <text x="${padL}" y="${height - 3}" font-size="9" fill="var(--ink-3)">${escapeHtml(fmtDateMed(points[0].key))}</text>
      <text x="${VB_W - padR}" y="${height - 3}" font-size="9" fill="var(--ink-3)" text-anchor="end">${escapeHtml(fmtDateMed(points[points.length - 1].key))}</text>
      <line class="chart-cursor" x1="0" y1="${padT}" x2="0" y2="${padT + h}" stroke="var(--ink-3)" stroke-width="1" opacity="0"/>
    </svg>
    <div class="chart-tip"></div>
  </div>`;
}

/* ---------------------------- horizontal bars ---------------------------- */

export function hbars(items, {
  color = 'var(--ember)', valueFmt = (v) => String(v), max, rowH = 26, label = '',
} = {}) {
  if (!items.length) return '<p class="chart-empty">Nothing to show yet.</p>';
  const hi = max ?? Math.max(...items.map((i) => i.value), 1);
  const labelW = 74, padR = 52, barMax = VB_W - labelW - padR;
  const height = items.length * rowH + 8;
  const BAR = Math.min(16, rowH - 10); // thin marks; the band keeps its air

  const rows = items.map((it, i) => {
    const y = 4 + i * rowH;
    const w = it.value <= 0 ? 0 : Math.max(3, (it.value / hi) * barMax);
    return `
      <g data-tip="${escapeHtml(`${it.label}: ${valueFmt(it.value)}${it.sub ? ` · ${it.sub}` : ''}`)}">
        <rect x="0" y="${y}" width="${VB_W}" height="${rowH}" fill="transparent"/>
        <text x="0" y="${y + rowH / 2 + 3.5}" font-size="10.5" fill="var(--ink-2)">${escapeHtml(it.label)}</text>
        <rect x="${labelW}" y="${y + (rowH - BAR) / 2}" width="${barMax}" height="${BAR}" rx="4" fill="var(--surface-3)" opacity=".55"/>
        ${w > 0 ? `<rect x="${labelW}" y="${y + (rowH - BAR) / 2}" width="${w.toFixed(1)}" height="${BAR}" rx="4" fill="${it.color || color}"/>` : ''}
        <text x="${VB_W}" y="${y + rowH / 2 + 3.5}" font-size="10.5" fill="var(--ink-2)" text-anchor="end">${escapeHtml(valueFmt(it.value))}</text>
      </g>`;
  }).join('');

  return `
  <div class="chart-wrap" data-chart="hover">
    <svg class="chart" viewBox="0 0 ${VB_W} ${height}" style="height:auto" role="img"
         aria-label="${escapeHtml(label || 'Bar chart')}">${rows}</svg>
    <div class="chart-tip"></div>
  </div>`;
}

/* ------------------------------- columns --------------------------------- */

export function columns(items, {
  color = 'var(--ember)', valueFmt = (v) => String(v), height = 128, label = '',
} = {}) {
  if (!items.length) return '<p class="chart-empty">Nothing to show yet.</p>';
  const hi = Math.max(...items.map((i) => i.value), 1);
  const padT = 14, padB = 22;
  const h = height - padT - padB;
  const band = VB_W / items.length;
  const BAR = Math.min(24, band - 8); // cap the mark; leftover band is air

  const bars = items.map((it, i) => {
    const bh = Math.max(3, (it.value / hi) * h);
    const x = i * band + (band - BAR) / 2;
    const y = padT + h - bh;
    return `
      <g data-tip="${escapeHtml(`${it.label}: ${valueFmt(it.value)}`)}">
        <rect x="${i * band}" y="0" width="${band}" height="${height}" fill="transparent"/>
        <path d="M${x},${padT + h} v${-(bh - 4)} a4,4 0 0 1 4,-4 h${BAR - 8} a4,4 0 0 1 4,4 v${bh - 4} z"
              fill="${it.color || color}"/>
        <text x="${i * band + band / 2}" y="${height - 7}" font-size="9" fill="var(--ink-3)" text-anchor="middle">${escapeHtml(it.label)}</text>
      </g>`;
  }).join('');

  const best = items.reduce((a, b, i) => (b.value > items[a].value ? i : a), 0);
  const bestX = best * band + band / 2;
  const bestY = padT + h - Math.max(3, (items[best].value / hi) * h) - 4;

  return `
  <div class="chart-wrap" data-chart="hover">
    <svg class="chart" viewBox="0 0 ${VB_W} ${height}" style="height:auto" role="img"
         aria-label="${escapeHtml(label || 'Column chart')}">
      <line x1="0" y1="${padT + h}" x2="${VB_W}" y2="${padT + h}" stroke="var(--line)" stroke-width="1"/>
      ${bars}
      <text x="${bestX}" y="${bestY}" font-size="10" font-weight="700" fill="var(--ink-2)" text-anchor="middle">${escapeHtml(valueFmt(items[best].value))}</text>
    </svg>
    <div class="chart-tip"></div>
  </div>`;
}

/* ------------------------------ data table ------------------------------- */

export function dataTable(headers, rows, { id = `t${Math.random().toString(36).slice(2, 7)}` } = {}) {
  return `
    <button class="table-toggle" data-action="toggle-table" data-target="${id}" aria-expanded="false">Show the numbers</button>
    <div class="table-scroll" id="${id}" hidden>
      <table class="data-table">
        <thead><tr>${headers.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;
}

/* ------------------------------- wiring ---------------------------------- */

/** Attaches hover/tap tooltips to every chart inside `root`. */
export function mountCharts(root = document) {
  root.querySelectorAll('[data-chart]').forEach((wrap) => {
    if (wrap.dataset.wired) return;
    wrap.dataset.wired = '1';
    const tip = wrap.querySelector('.chart-tip');
    const svgEl = wrap.querySelector('svg');
    if (!tip || !svgEl) return;

    const place = (clientX, clientY, text) => {
      const box = wrap.getBoundingClientRect();
      tip.textContent = text;
      tip.classList.add('show');
      const x = Math.min(Math.max(clientX - box.left, 42), box.width - 42);
      tip.style.left = `${x}px`;
      tip.style.top = `${Math.max(clientY - box.top, 20)}px`;
    };
    const hide = () => {
      tip.classList.remove('show');
      const cursor = wrap.querySelector('.chart-cursor');
      if (cursor) cursor.setAttribute('opacity', '0');
    };

    if (wrap.dataset.chart === 'line') {
      let pts = [];
      try { pts = JSON.parse(wrap.dataset.points); } catch { return; }
      const vbw = Number(wrap.dataset.vbw) || VB_W;
      const move = (e) => {
        const box = svgEl.getBoundingClientRect();
        const vx = ((e.clientX - box.left) / box.width) * vbw;
        let best = null, bestD = Infinity;
        for (const p of pts) {
          const d = Math.abs(p.x - vx);
          if (d < bestD) { bestD = d; best = p; }
        }
        if (!best) return;
        const cursor = wrap.querySelector('.chart-cursor');
        if (cursor) {
          cursor.setAttribute('x1', best.x); cursor.setAttribute('x2', best.x);
          cursor.setAttribute('opacity', '0.35');
        }
        const yClient = best.y === null ? box.top + box.height / 2 : box.top + (best.y / (svgEl.viewBox.baseVal.height || 84)) * box.height;
        place(e.clientX, yClient, best.t);
      };
      svgEl.addEventListener('pointermove', move);
      svgEl.addEventListener('pointerdown', move);
      svgEl.addEventListener('pointerleave', hide);
      svgEl.addEventListener('pointercancel', hide);
    } else {
      svgEl.addEventListener('pointermove', (e) => {
        const g = e.target.closest('g[data-tip]');
        if (!g) return hide();
        place(e.clientX, e.clientY, g.dataset.tip);
      });
      svgEl.addEventListener('pointerdown', (e) => {
        const g = e.target.closest('g[data-tip]');
        if (g) place(e.clientX, e.clientY, g.dataset.tip);
      });
      svgEl.addEventListener('pointerleave', hide);
    }
  });
}
