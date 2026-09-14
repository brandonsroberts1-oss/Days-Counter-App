/**
 * The forms: daily check-in, logging a slip, and the per-day detail view.
 * Tone matters here — a slip is logged, never scolded.
 */
import {
  escapeHtml, todayKey, dateKey, parseKey, fmtDateLong, relativeDayLabel,
  fmtMoney, currencySymbol, fmtTime, clamp,
} from './util.js';
import { getState, upsertEntry, deleteEntry, addRelapse, deleteRelapse, mutate } from './store.js';
import { dayStatus, daySavings, dailyCost, relapsesByDate, habitLabel } from './model.js';
import { describeCode, fmtTemp } from './weather.js';
import { openSheet, closeSheet, confirmSheet, toast, haptic, icon } from './ui.js';
import { TRIGGER_TAGS } from './insights.js';

const MOODS = [
  { v: 1, emoji: '😖', label: 'Rough' },
  { v: 2, emoji: '😕', label: 'Low' },
  { v: 3, emoji: '😐', label: 'OK' },
  { v: 4, emoji: '🙂', label: 'Good' },
  { v: 5, emoji: '😄', label: 'Great' },
];
const DAY_TAGS = [
  'Bored', 'Stressed', 'Lonely', 'Tired', 'Anxious', 'Angry', 'Celebrating',
  'Social event', 'Payday', 'Conflict', 'Alone at home', 'Work pressure',
  'Money worries', 'Exercised', 'Good sleep', 'Saw friends', 'Busy day',
];

const chipRow = (tags, selected) => tags.map((t) => `
  <button type="button" class="chip" data-tag="${escapeHtml(t)}" aria-pressed="${selected.includes(t)}">${escapeHtml(t)}</button>`).join('');

const scaleRow = (name, value) => MOODS.map((m) => `
  <button type="button" data-${name}="${m.v}" aria-pressed="${Number(value) === m.v}" aria-label="${m.label}">${m.emoji}</button>`).join('');

/* ---------------------------- daily check-in ---------------------------- */

export function openCheckIn(key = todayKey(), { onSaved } = {}) {
  const s = getState();
  const e = s.entries[key] || {};
  const w = s.weather[key];
  const tags = Array.isArray(e.tags) ? [...e.tags] : [];
  const weatherLine = w?.code != null
    ? `<div class="badge" style="margin-bottom:14px">${describeCode(w.code).emoji} ${escapeHtml(describeCode(w.code).label)} · ${fmtTemp(w.tmax, s)}</div>`
    : '';

  openSheet({
    title: `Check in · ${relativeDayLabel(key)}`,
    size: 'tall',
    body: `
      <p class="card-sub" style="margin-top:-4px">${escapeHtml(fmtDateLong(key))}</p>
      ${weatherLine}
      <div class="field">
        <span class="field-label">How was your mood?</span>
        <div class="scale" data-scale="mood">${scaleRow('mood', e.mood)}</div>
        <div class="scale-labels"><span>Rough</span><span>Great</span></div>
      </div>
      <div class="field">
        <label for="ci-craving">Craving strength</label>
        <div class="range-wrap">
          <input type="range" id="ci-craving" min="0" max="10" step="1" value="${Number(e.craving ?? 0)}"
                 data-set="${e.craving != null}" />
          <output class="range-value" id="ci-craving-out">${e.craving != null ? e.craving : '—'}</output>
        </div>
        <div class="scale-labels"><span>None</span><span>Overwhelming</span></div>
      </div>
      <div class="field">
        <label for="ci-stress">Stress level</label>
        <div class="range-wrap">
          <input type="range" id="ci-stress" min="0" max="10" step="1" value="${Number(e.stress ?? 0)}"
                 data-set="${e.stress != null}" />
          <output class="range-value" id="ci-stress-out">${e.stress != null ? e.stress : '—'}</output>
        </div>
      </div>
      <div class="field">
        <label for="ci-sleep">Hours of sleep last night</label>
        <input type="number" id="ci-sleep" inputmode="decimal" min="0" max="16" step="0.5"
               placeholder="e.g. 7.5" value="${e.sleep ?? ''}" />
      </div>
      <div class="field">
        <span class="field-label">What kind of day was it?</span>
        <div class="chips" data-chips>${chipRow(DAY_TAGS, tags)}</div>
      </div>
      <div class="field">
        <label for="ci-note">Notes</label>
        <textarea id="ci-note" placeholder="What happened today? What helped? What was hard?">${escapeHtml(e.note || '')}</textarea>
        <p class="field-hint">Anything you write here stays on this device.</p>
      </div>
      <div class="sheet-actions">
        <div class="btn-row">
          ${s.entries[key] ? '<button class="btn btn-ghost" data-act="delete">Delete</button>' : ''}
          <button class="btn btn-primary" data-act="save">${icon('check')} Save check-in</button>
        </div>
      </div>`,
    onMount(sheet) {
      let mood = e.mood ?? null;
      const selected = tags;

      sheet.querySelector('[data-scale="mood"]').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-mood]');
        if (!b) return;
        mood = Number(b.dataset.mood);
        sheet.querySelectorAll('[data-mood]').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.mood) === mood)));
        haptic();
      });
      // A slider nobody moved is "not recorded", not "zero" — otherwise every
      // skipped question would look like a calm, craving-free day.
      for (const name of ['craving', 'stress']) {
        const input = sheet.querySelector(`#ci-${name}`);
        const out = sheet.querySelector(`#ci-${name}-out`);
        input.addEventListener('input', () => {
          input.dataset.set = 'true';
          out.textContent = input.value;
        });
      }
      const readSlider = (name) => {
        const input = sheet.querySelector(`#ci-${name}`);
        return input.dataset.set === 'true' ? Number(input.value) : null;
      };
      sheet.querySelector('[data-chips]').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-tag]');
        if (!b) return;
        const t = b.dataset.tag;
        const i = selected.indexOf(t);
        if (i >= 0) selected.splice(i, 1); else selected.push(t);
        b.setAttribute('aria-pressed', String(i < 0));
        haptic();
      });
      sheet.querySelector('[data-act="save"]').addEventListener('click', () => {
        const sleepRaw = sheet.querySelector('#ci-sleep').value;
        upsertEntry(key, {
          mood,
          craving: readSlider('craving'),
          stress: readSlider('stress'),
          sleep: sleepRaw === '' ? null : clamp(Number(sleepRaw), 0, 16),
          tags: selected,
          note: sheet.querySelector('#ci-note').value.trim(),
        });
        closeSheet();
        toast('Check-in saved');
        onSaved?.();
      });
      sheet.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
        if (await confirmSheet({
          title: 'Delete this check-in?', message: 'The note and ratings for this day will be removed.',
          confirmLabel: 'Delete', danger: true,
        })) {
          deleteEntry(key);
          toast('Check-in deleted');
          onSaved?.();
        }
      });
    },
  });
}

/* ------------------------------ log a slip ------------------------------ */

export function openSlip({ key = todayKey(), onSaved } = {}) {
  const s = getState();
  const now = new Date();
  const sym = currencySymbol(s.profile.currency);
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  openSheet({
    title: 'Log a slip',
    size: 'tall',
    body: `
      <p style="color:var(--ink-2);font-size:.92rem">
        This resets the day counter — nothing else. Everything you've already saved,
        learned and banked stays exactly where it is.
      </p>
      <div class="field field-row" style="margin-top:18px">
        <div>
          <label for="sl-date">Date</label>
          <input type="date" id="sl-date" value="${key}" max="${todayKey()}" />
        </div>
        <div>
          <label for="sl-time">Time</label>
          <input type="time" id="sl-time" value="${timeStr}" />
        </div>
      </div>
      <div class="field">
        <span class="field-label">How would you describe it?</span>
        <div class="segmented" data-seg="severity">
          <button type="button" data-v="1" aria-pressed="false">A small slip</button>
          <button type="button" data-v="2" aria-pressed="true">A relapse</button>
          <button type="button" data-v="3" aria-pressed="false">A heavy one</button>
        </div>
      </div>
      <div class="field">
        <label for="sl-cost">What did it cost? (optional)</label>
        <div class="input-prefix"><span>${escapeHtml(sym)}</span>
          <input type="number" id="sl-cost" inputmode="decimal" min="0" step="0.01" placeholder="0" />
        </div>
      </div>
      <div class="field">
        <span class="field-label">What set it off?</span>
        <div class="chips" data-chips>${chipRow(TRIGGER_TAGS, [])}</div>
      </div>
      <div class="field">
        <label for="sl-note">What was going on? (optional)</label>
        <textarea id="sl-note" placeholder="The more honest this is, the better the patterns get."></textarea>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-primary btn-block" data-act="save">Log it and start again</button>
      </div>`,
    onMount(sheet) {
      let severity = 2;
      const triggers = [];
      sheet.querySelector('[data-seg="severity"]').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-v]');
        if (!b) return;
        severity = Number(b.dataset.v);
        sheet.querySelectorAll('[data-seg="severity"] [data-v]')
          .forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.v) === severity)));
      });
      sheet.querySelector('[data-chips]').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-tag]');
        if (!b) return;
        const t = b.dataset.tag;
        const i = triggers.indexOf(t);
        if (i >= 0) triggers.splice(i, 1); else triggers.push(t);
        b.setAttribute('aria-pressed', String(i < 0));
        haptic();
      });
      sheet.querySelector('[data-act="save"]').addEventListener('click', () => {
        const d = sheet.querySelector('#sl-date').value || todayKey();
        const t = sheet.querySelector('#sl-time').value || '12:00';
        const at = new Date(`${d}T${t}:00`);
        const when = Number.isNaN(+at) ? new Date() : at;
        addRelapse({
          dateKey: d,
          at: (when > new Date() ? new Date() : when).toISOString(),
          amountSpent: Number(sheet.querySelector('#sl-cost').value) || 0,
          severity,
          triggers,
          note: sheet.querySelector('#sl-note').value.trim(),
        });
        // Fold the triggers into that day's entry so the pattern engine sees them.
        const prev = getState().entries[d]?.tags || [];
        if (triggers.length) upsertEntry(d, { tags: [...new Set([...prev, ...triggers])] });
        closeSheet();
        toast('Logged. Day one starts now.', { celebrate: false });
        onSaved?.();
      });
    },
  });
}

/* ----------------------------- day details ------------------------------ */

export function openDay(key, { onChanged } = {}) {
  const s = getState();
  const status = dayStatus(s, key);
  const e = s.entries[key];
  const w = s.weather[key];
  const slips = relapsesByDate(s).get(key) || [];
  const saved = daySavings(s, key);

  const statusBadge = {
    clean: `<span class="badge good">✓ Free day</span>`,
    slip: `<span class="badge bad">✕ Slip logged</span>`,
    untracked: `<span class="badge">Before you started</span>`,
    future: `<span class="badge">Still to come</span>`,
  }[status];

  const moneyRow = status === 'clean'
    ? `<div class="switch-row"><div class="sr-body">
         <div class="sr-title">${fmtMoney(saved, s.profile.currency, { cents: true })} saved</div>
         <div class="sr-sub">Your daily ${escapeHtml(habitLabel(s))} spend, kept.</div>
       </div><span style="font-size:1.4rem">💰</span></div>`
    : status === 'slip'
      ? `<div class="switch-row"><div class="sr-body">
           <div class="sr-title">${fmtMoney(slips.reduce((a, r) => a + (r.amountSpent || 0), 0), s.profile.currency, { cents: true })} spent</div>
           <div class="sr-sub">Logged against this day.</div>
         </div><span style="font-size:1.4rem">🧾</span></div>`
      : '';

  const weatherRow = w?.code != null ? `
    <div class="switch-row"><div class="sr-body">
      <div class="sr-title">${describeCode(w.code).emoji} ${escapeHtml(describeCode(w.code).label)}</div>
      <div class="sr-sub">High ${fmtTemp(w.tmax, s)} · low ${fmtTemp(w.tmin, s)}${w.precip != null ? ` · ${w.precip}${s.settings.units === 'imperial' ? 'in' : 'mm'} rain` : ''}</div>
    </div></div>` : '';

  const entryBlock = e ? `
    <div class="card" style="margin-top:14px">
      <div class="card-head"><h2>Your check-in</h2></div>
      <div class="chips" style="margin-bottom:10px">
        ${e.mood ? `<span class="chip chip-static">${MOODS.find((m) => m.v === e.mood)?.emoji || ''} Mood ${e.mood}/5</span>` : ''}
        ${e.craving != null ? `<span class="chip chip-static">🌀 Craving ${e.craving}/10</span>` : ''}
        ${e.stress != null ? `<span class="chip chip-static">😣 Stress ${e.stress}/10</span>` : ''}
        ${e.sleep != null ? `<span class="chip chip-static">😴 ${e.sleep}h</span>` : ''}
      </div>
      ${(e.tags || []).length ? `<div class="chips" style="margin-bottom:10px">${e.tags.map((t) => `<span class="chip chip-static">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      ${e.note ? `<p style="font-size:.9rem;white-space:pre-wrap;color:var(--ink-2)">${escapeHtml(e.note)}</p>` : ''}
    </div>` : '';

  const slipBlock = slips.length ? `
    <div class="card" style="margin-top:14px">
      <div class="card-head"><h2>Slip${slips.length > 1 ? 's' : ''}</h2></div>
      ${slips.map((r) => `
        <div style="padding:8px 0;border-bottom:1px solid var(--line)">
          <div style="font-weight:650;font-size:.92rem">${fmtTime(r.at)} · ${['', 'small slip', 'relapse', 'heavy one'][r.severity] || 'relapse'}</div>
          ${(r.triggers || []).length ? `<div class="chips" style="margin-top:8px">${r.triggers.map((t) => `<span class="chip chip-static">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          ${r.note ? `<p style="font-size:.88rem;color:var(--ink-2);margin-top:8px;white-space:pre-wrap">${escapeHtml(r.note)}</p>` : ''}
          <button class="btn btn-quiet btn-sm" data-del-slip="${r.id}" style="margin-top:6px">${icon('trash')} Remove this slip</button>
        </div>`).join('')}
    </div>` : '';

  openSheet({
    title: relativeDayLabel(key),
    size: slips.length || e ? 'tall' : 'auto',
    body: `
      <p class="card-sub" style="margin-top:-4px">${escapeHtml(fmtDateLong(key))} ${statusBadge}</p>
      ${moneyRow}${weatherRow}
      ${entryBlock}${slipBlock}
      <div class="sheet-actions">
        <div class="btn-row">
          ${status !== 'future' ? `<button class="btn btn-ghost" data-act="slip">Log a slip</button>` : ''}
          ${status !== 'future' ? `<button class="btn btn-primary" data-act="checkin">${e ? 'Edit check-in' : 'Check in'}</button>` : ''}
        </div>
      </div>`,
    onMount(sheet) {
      sheet.querySelector('[data-act="checkin"]')?.addEventListener('click', () => openCheckIn(key, { onSaved: onChanged }));
      sheet.querySelector('[data-act="slip"]')?.addEventListener('click', () => openSlip({ key, onSaved: onChanged }));
      sheet.querySelectorAll('[data-del-slip]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (await confirmSheet({
            title: 'Remove this slip?',
            message: 'Your streak will be recalculated from the slip before it. This cannot be undone.',
            confirmLabel: 'Remove', danger: true,
          })) {
            deleteRelapse(btn.dataset.delSlip);
            toast('Slip removed');
            onChanged?.();
          }
        });
      });
    },
  });
}

export { MOODS, DAY_TAGS };
