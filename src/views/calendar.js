/* Month grid. Status is never colour alone — every state carries a glyph. */
import {
  escapeHtml, fmtMonthYear, dateKey, todayKey, parseKey, daysBetweenKeys,
  fmtMoney, fmtNumber, plural,
} from '../util.js';
import { dayStatus, dailyCost, relapsesByDate } from '../model.js';
import { getState } from '../store.js';
import { icon } from '../ui.js';
import { openDay } from '../sheets.js';

export const meta = { id: 'calendar', label: 'Calendar', icon: 'calendar' };
export const title = () => 'Calendar';

// Which month the user is looking at; survives re-renders within a session.
let cursor = null;
export function resetCursor() { cursor = null; }

function ensureCursor() {
  if (!cursor) {
    const n = new Date();
    cursor = { y: n.getFullYear(), m: n.getMonth() };
  }
  return cursor;
}

function weekdayNames() {
  // Honour the locale's first day of week where the browser exposes it.
  const base = new Date(2024, 8, 1); // a Sunday
  const first = firstDayOfWeek();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + ((i + first) % 7));
    return d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2);
  });
}
function firstDayOfWeek() {
  try {
    const loc = new Intl.Locale(navigator.language);
    const info = loc.getWeekInfo?.() || loc.weekInfo;
    if (info?.firstDay) return info.firstDay % 7; // 7 = Sunday → 0
  } catch { /* fall through */ }
  return new Intl.DateTimeFormat(navigator.language).resolvedOptions().locale?.startsWith('en-US') ? 0 : 1;
}

export function render(s) {
  const { y, m } = ensureCursor();
  const today = todayKey();
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const offset = (first.getDay() - firstDayOfWeek() + 7) % 7;
  const slipMap = relapsesByDate(s);

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<div class="cal-cell is-out" aria-hidden="true"></div>');

  let cleanDays = 0, slipDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(new Date(y, m, d));
    const status = dayStatus(s, key, today);
    if (status === 'clean') cleanDays++;
    if (status === 'slip') slipDays++;
    const isToday = key === today;
    const hasNote = Boolean(s.entries[key]?.note);
    const glyph = status === 'clean' ? '<span class="cal-dot"></span>'
      : status === 'slip' ? '<span class="cal-slip-glyph">✕</span>' : '';
    const label = `${key}, ${{
      clean: 'free day', slip: 'slip logged', untracked: 'before tracking', future: 'upcoming',
    }[status]}`;
    cells.push(`
      <button class="cal-cell is-${status}${isToday ? ' is-today' : ''}"
              data-day="${key}" ${status === 'future' ? 'disabled' : ''}
              aria-label="${escapeHtml(label)}">
        <span>${d}</span>${glyph}
        ${hasNote ? '<span class="cal-note-mark" aria-hidden="true"></span>' : ''}
      </button>`);
  }

  const monthSaved = cleanDays * dailyCost(s);
  const canGoNext = new Date(y, m + 1, 1) <= new Date();

  return `
    <div class="card">
      <div class="cal-head">
        <button class="cal-nav" data-nav="-1" aria-label="Previous month">${icon('left')}</button>
        <div class="cal-title">${escapeHtml(fmtMonthYear(y, m))}</div>
        <button class="cal-nav" data-nav="1" aria-label="Next month" ${canGoNext ? '' : 'disabled'}>${icon('right')}</button>
      </div>
      <div class="cal-grid" role="grid">
        ${weekdayNames().map((w) => `<div class="cal-dow">${escapeHtml(w)}</div>`).join('')}
        ${cells.join('')}
      </div>
      <div class="cal-legend">
        <span class="cal-legend-item"><span class="legend-swatch" style="background:var(--good-tint);color:var(--good)">•</span> Free day</span>
        <span class="cal-legend-item"><span class="legend-swatch" style="background:var(--bad-tint);color:var(--bad)">✕</span> Slip</span>
        <span class="cal-legend-item"><span class="legend-swatch" style="border:1px solid var(--line)"></span> Untracked</span>
        <span class="cal-legend-item"><span class="legend-swatch" style="background:var(--surface-2)"><span style="width:4px;height:4px;border-radius:50%;background:var(--ink-3);display:block"></span></span> Has a note</span>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>${escapeHtml(fmtMonthYear(y, m))} at a glance</h2></div>
      <div class="hero-meta" style="margin-top:0">
        <div class="hero-stat"><span class="v">${fmtNumber(cleanDays)}</span><span class="k">free days</span></div>
        <div class="hero-stat"><span class="v">${fmtNumber(slipDays)}</span><span class="k">slip days</span></div>
        <div class="hero-stat"><span class="v">${fmtMoney(monthSaved, s.profile.currency)}</span><span class="k">saved</span></div>
      </div>
      <p class="field-hint" style="margin-top:12px">Tap any day to read it, add a note, or log a slip you forgot.</p>
    </div>`;
}

export function mount(root, s, ctx) {
  root.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
    const delta = Number(b.dataset.nav);
    const c = ensureCursor();
    const d = new Date(c.y, c.m + delta, 1);
    cursor = { y: d.getFullYear(), m: d.getMonth() };
    ctx.rerender();
  }));
  root.querySelector('.cal-grid')?.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-day]');
    if (!cell || cell.disabled) return;
    openDay(cell.dataset.day, { onChanged: ctx.rerender });
  });
}
