/* Everything you've written, newest first, with search. */
import { escapeHtml, relativeDayLabel, fmtDateMed, fmtTime, fmtNumber, plural, todayKey } from '../util.js';
import { timeline, checkinStreak } from '../model.js';
import { describeCode } from '../weather.js';
import { icon } from '../ui.js';
import { openCheckIn, openDay, MOODS } from '../sheets.js';

export const meta = { id: 'journal', label: 'Journal', icon: 'book' };
export const title = () => 'Journal';

let query = '';
export function resetQuery() { query = ''; }

const SEVERITY = ['', 'small slip', 'relapse', 'heavy one'];

function matches(item, q) {
  if (!q) return true;
  const hay = [
    item.key,
    item.data.note || '',
    (item.data.tags || []).join(' '),
    (item.data.triggers || []).join(' '),
  ].join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function render(s) {
  const items = timeline(s).filter((i) => matches(i, query));
  const total = Object.keys(s.entries).length;

  const rows = items.map((item) => {
    if (item.type === 'slip') {
      const r = item.data;
      return `
        <button class="list-item" data-day="${item.key}">
          <span class="li-icon bad">✕</span>
          <span class="li-body">
            <span class="li-title">Slip · ${escapeHtml(SEVERITY[r.severity] || 'relapse')}</span>
            <span class="li-sub">${escapeHtml(relativeDayLabel(item.key))} at ${escapeHtml(fmtTime(r.at))}${(r.triggers || []).length ? ` · ${escapeHtml(r.triggers.slice(0, 2).join(', '))}` : ''}</span>
            ${r.note ? `<span class="li-sub" style="color:var(--ink-2);margin-top:4px">${escapeHtml(r.note.slice(0, 120))}${r.note.length > 120 ? '…' : ''}</span>` : ''}
          </span>
        </button>`;
    }
    const e = item.data;
    const w = s.weather[item.key];
    const mood = MOODS.find((m) => m.v === e.mood);
    return `
      <button class="list-item" data-day="${item.key}">
        <span class="li-icon">${mood ? mood.emoji : '📝'}</span>
        <span class="li-body">
          <span class="li-title">${escapeHtml(relativeDayLabel(item.key))}</span>
          <span class="li-sub">
            ${e.craving != null ? `Craving ${e.craving}/10` : ''}${e.stress != null ? ` · Stress ${e.stress}/10` : ''}${e.sleep != null ? ` · ${e.sleep}h sleep` : ''}
            ${w?.code != null ? ` · ${describeCode(w.code).emoji}` : ''}
          </span>
          ${e.note ? `<span class="li-sub" style="color:var(--ink-2);margin-top:4px">${escapeHtml(e.note.slice(0, 140))}${e.note.length > 140 ? '…' : ''}</span>` : ''}
          ${(e.tags || []).length ? `<span class="li-sub" style="margin-top:4px">${escapeHtml(e.tags.slice(0, 4).join(' · '))}</span>` : ''}
        </span>
      </button>`;
  }).join('');

  return `
    <div class="btn-row" style="margin-bottom:14px">
      <button class="btn btn-primary" data-act="checkin">${icon('plus')} ${s.entries[todayKey()] ? "Edit today's entry" : 'Write today'}</button>
    </div>

    ${total >= 3 ? `
      <div class="field">
        <input type="search" id="jr-search" placeholder="Search your notes and tags" value="${escapeHtml(query)}" />
      </div>` : ''}

    ${checkinStreak(s) >= 3 ? `<p class="tally-note" style="margin:-4px 2px 12px">📓 ${plural(checkinStreak(s), 'day')} in a row — keep it going.</p>` : ''}

    <div class="card flush">
      ${items.length ? `<div class="list">${rows}</div>` : `
        <div class="empty">
          <span class="empty-emoji">📖</span>
          <p>${query
            ? 'Nothing matches that search.'
            : 'Nothing written yet. A line a day is enough — it is what makes the patterns in Insights worth reading.'}</p>
        </div>`}
    </div>`;
}

export function mount(root, s, ctx) {
  root.querySelector('[data-act="checkin"]')?.addEventListener('click', () => openCheckIn(todayKey(), { onSaved: ctx.rerender }));
  root.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => openDay(b.dataset.day, { onChanged: ctx.rerender })));

  const search = root.querySelector('#jr-search');
  if (search) {
    let t = null;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        query = search.value;
        ctx.rerender();
        const again = document.querySelector('#jr-search');
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      }, 220);
    });
  }
}
