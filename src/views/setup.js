/* First run. Five short questions, then straight into the app. */
import { escapeHtml, todayKey, dateKey, currencySymbol, fmtMoney } from '../util.js';
import { getState, mutate, setProfile, setSettings } from '../store.js';
import { streak } from '../model.js';
import { seedSilently } from '../achievements.js';
import * as notify from '../notify.js';
import { getCurrentPosition, sync as syncWeather } from '../weather.js';
import { toast, icon } from '../ui.js';

const PRESETS = [
  { name: 'Alcohol', emoji: '🍷' },
  { name: 'Gambling', emoji: '🎰' },
  { name: 'Smoking', emoji: '🚬' },
  { name: 'Vaping', emoji: '💨' },
  { name: 'Substances', emoji: '💊' },
  { name: 'Overeating', emoji: '🍩' },
  { name: 'Sugar', emoji: '🍬' },
  { name: 'Porn', emoji: '💔' },
  { name: 'Social media', emoji: '📱' },
  { name: 'Gaming', emoji: '🎮' },
  { name: 'Shopping', emoji: '🛒' },
  { name: 'Something else', emoji: '✍️' },
];

const REGION_CURRENCY = {
  US: 'USD', GB: 'GBP', IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR',
  PT: 'EUR', AT: 'EUR', BE: 'EUR', FI: 'EUR', GR: 'EUR', CA: 'CAD', AU: 'AUD', NZ: 'NZD',
  JP: 'JPY', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', ZA: 'ZAR',
  IN: 'INR', SG: 'SGD', HK: 'HKD', MX: 'MXN', BR: 'BRL', AE: 'AED',
};
function guessCurrency() {
  try {
    const loc = new Intl.Locale(navigator.language);
    return REGION_CURRENCY[loc.region] || 'USD';
  } catch { return 'USD'; }
}

const draft = {
  habit: '', emoji: '🌱', startKey: todayKey(), startNow: true,
  costPerTime: '', timesPerWeek: '', currency: guessCurrency(), reason: '',
  notifications: false, weather: false,
};

let step = 0;
let onFinish = null;
const STEPS = 5;

export function startSetup(onDone) {
  const root = document.getElementById('setup-root');
  root.hidden = false;
  document.getElementById('app').hidden = true;
  step = 0;
  onFinish = onDone;
  draw(root);
}

function draw(root) {
  root.innerHTML = `
    <div class="setup">
      <div class="setup-progress">${Array.from({ length: STEPS }, (_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
      <div class="setup-body">${STEP_HTML[step]()}</div>
      <div class="setup-foot">
        ${step > 0 ? '<button class="btn btn-ghost" data-back>Back</button>' : ''}
        <button class="btn btn-primary" data-next>${step === STEPS - 1 ? 'Start counting' : 'Continue'}</button>
      </div>
    </div>`;
  root.scrollTop = 0;
  WIRE[step](root);

  root.querySelector('[data-back]')?.addEventListener('click', () => { step--; draw(root); });
  root.querySelector('[data-next]').addEventListener('click', async () => {
    const err = VALIDATE[step]?.();
    if (err) { toast(err); return; }
    if (step === STEPS - 1) { await finish(root); return; }
    step++;
    draw(root);
  });
}

/* ------------------------------- steps ---------------------------------- */

const STEP_HTML = [
  () => `
    <h1>What are you leaving behind?</h1>
    <p class="setup-lede">Pick one to start. You can rename it any time.</p>
    <div class="preset-grid">
      ${PRESETS.map((p) => `
        <button type="button" class="preset" data-preset="${escapeHtml(p.name)}" data-emoji="${p.emoji}"
                aria-pressed="${draft.habit === p.name}">
          <span class="p-emoji">${p.emoji}</span><span>${escapeHtml(p.name)}</span>
        </button>`).join('')}
    </div>
    <div class="field" style="margin-top:18px">
      <label for="su-habit">Or name it yourself</label>
      <input type="text" id="su-habit" value="${escapeHtml(draft.habit)}" placeholder="e.g. late-night scrolling" />
    </div>`,

  () => `
    <h1>When did the clock start?</h1>
    <p class="setup-lede">If you're starting right now, that's the strongest possible answer.</p>
    <div class="segmented" id="su-when" style="margin-bottom:18px">
      <button type="button" data-v="now" aria-pressed="${draft.startNow}">Right now</button>
      <button type="button" data-v="past" aria-pressed="${!draft.startNow}">An earlier date</button>
    </div>
    <div class="field" id="su-date-field" ${draft.startNow ? 'hidden' : ''}>
      <label for="su-date">First day free</label>
      <input type="date" id="su-date" max="${todayKey()}" value="${draft.startKey}" />
      <p class="field-hint">Days before this stay blank on your calendar.</p>
    </div>
    <div class="card" style="margin-top:20px">
      <p style="font-size:.9rem;color:var(--ink-2);margin:0">
        Counting from ${draft.startNow ? '<strong>today</strong>' : `<strong>${escapeHtml(draft.startKey)}</strong>`}.
        If you slip later, you log it and the count starts again — that's the whole design.
      </p>
    </div>`,

  () => {
    const sym = currencySymbol(draft.currency);
    return `
    <h1>What does it cost you?</h1>
    <p class="setup-lede">A rough number is fine. It's what turns days into money kept.</p>
    <div class="field-row">
      <div class="field">
        <label for="su-cost">Typical cost each time</label>
        <div class="input-prefix"><span>${escapeHtml(sym)}</span>
          <input type="number" id="su-cost" inputmode="decimal" min="0" step="0.01" value="${draft.costPerTime}" placeholder="20" />
        </div>
      </div>
      <div class="field">
        <label for="su-times">Times a week</label>
        <input type="number" id="su-times" inputmode="decimal" min="0" step="0.5" value="${draft.timesPerWeek}" placeholder="4" />
      </div>
    </div>
    <div class="field">
      <label for="su-currency">Currency</label>
      <select id="su-currency">
        ${['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'ZAR', 'INR', 'SGD', 'HKD', 'MXN', 'BRL', 'AED']
        .map((c) => `<option value="${c}" ${c === draft.currency ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="card" id="su-preview"><p style="margin:0;font-size:.92rem;color:var(--ink-2)">Enter a cost to see the daily figure.</p></div>`;
  },

  () => `
    <h1>Why this, why now?</h1>
    <p class="setup-lede">Optional — but this is the line you'll want to read on a hard night.</p>
    <div class="field">
      <textarea id="su-reason" placeholder="Because I want to be present with my kids. Because I'm tired of the mornings.">${escapeHtml(draft.reason)}</textarea>
    </div>`,

  () => `
    <h1>Two last things</h1>
    <p class="setup-lede">Both optional, both changeable later.</p>
    <div class="card">
      <div class="switch-row">
        <div class="sr-body">
          <div class="sr-title">Milestone alerts</div>
          <div class="sr-sub">"You've been free of ${escapeHtml(draft.habit || 'it')} for 7 days and saved…"</div>
        </div>
        <button class="switch" role="switch" id="su-notify" aria-checked="${draft.notifications}" aria-label="Enable notifications"></button>
      </div>
      <div class="switch-row">
        <div class="sr-body">
          <div class="sr-title">Track the weather</div>
          <div class="sr-sub">Lets Insights test whether weather lines up with your harder days.</div>
        </div>
        <button class="switch" role="switch" id="su-weather" aria-checked="${draft.weather}" aria-label="Enable weather"></button>
      </div>
    </div>
    <div class="card">
      <p style="font-size:.88rem;color:var(--ink-2);margin:0">
        🔒 Everything you write stays on this device. No account, no sign-in, nothing uploaded.
        The only request Freedays ever makes is an anonymous weather lookup, and only if you switch it on.
      </p>
    </div>`,
];

/* ------------------------------- wiring --------------------------------- */

const WIRE = [
  (root) => {
    root.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      draft.habit = b.dataset.preset === 'Something else' ? '' : b.dataset.preset;
      draft.emoji = b.dataset.emoji;
      root.querySelectorAll('[data-preset]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const input = root.querySelector('#su-habit');
      input.value = draft.habit;
      if (b.dataset.preset === 'Something else') input.focus();
    }));
    root.querySelector('#su-habit').addEventListener('input', (e) => { draft.habit = e.target.value; });
  },
  (root) => {
    root.querySelector('#su-when').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      draft.startNow = b.dataset.v === 'now';
      root.querySelectorAll('#su-when [data-v]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      root.querySelector('#su-date-field').hidden = draft.startNow;
    });
    root.querySelector('#su-date').addEventListener('change', (e) => { draft.startKey = e.target.value || todayKey(); });
  },
  (root) => {
    const preview = root.querySelector('#su-preview');
    const update = () => {
      const c = Number(root.querySelector('#su-cost').value) || 0;
      const t = Number(root.querySelector('#su-times').value) || 0;
      draft.costPerTime = root.querySelector('#su-cost').value;
      draft.timesPerWeek = root.querySelector('#su-times').value;
      const daily = (c * t) / 7;
      preview.innerHTML = daily > 0
        ? `<p style="margin:0;font-size:.92rem;color:var(--ink-2)">
             That's <strong style="color:var(--ink)">${fmtMoney(daily, draft.currency, { cents: true })} a day</strong>,
             ${fmtMoney(daily * 30, draft.currency)} a month, ${fmtMoney(daily * 365, draft.currency)} a year.</p>`
        : '<p style="margin:0;font-size:.92rem;color:var(--ink-2)">Enter a cost to see the daily figure.</p>';
    };
    root.querySelector('#su-cost').addEventListener('input', update);
    root.querySelector('#su-times').addEventListener('input', update);
    root.querySelector('#su-currency').addEventListener('change', (e) => { draft.currency = e.target.value; update(); step = 2; draw(document.getElementById('setup-root')); });
    update();
  },
  (root) => {
    root.querySelector('#su-reason').addEventListener('input', (e) => { draft.reason = e.target.value; });
  },
  (root) => {
    root.querySelector('#su-notify').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.getAttribute('aria-checked') === 'true') {
        draft.notifications = false;
      } else {
        const res = await notify.requestPermission();
        draft.notifications = res === 'granted';
        if (res === 'denied') toast('Your browser blocked notifications.');
      }
      btn.setAttribute('aria-checked', String(draft.notifications));
    });
    root.querySelector('#su-weather').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      draft.weather = btn.getAttribute('aria-checked') !== 'true';
      btn.setAttribute('aria-checked', String(draft.weather));
    });
  },
];

const VALIDATE = [
  () => (draft.habit.trim() ? null : 'Give it a name first — even a rough one.'),
  () => null,
  () => null,
  () => null,
  () => null,
];

/* ------------------------------- finish --------------------------------- */

async function finish(root) {
  const startISO = draft.startNow
    ? new Date().toISOString()
    : new Date(`${draft.startKey}T00:00:00`).toISOString();
  const startKey = draft.startNow ? todayKey() : draft.startKey;

  mutate((s) => {
    s.onboarded = true;
    s.streakStartAt = startISO;
    Object.assign(s.profile, {
      habit: draft.habit.trim(),
      emoji: draft.emoji,
      reason: draft.reason.trim(),
      costPerTime: Number(draft.costPerTime) || 0,
      timesPerWeek: Number(draft.timesPerWeek) || 0,
      currency: draft.currency,
      trackingStart: startKey,
      createdAt: new Date().toISOString(),
    });
    Object.assign(s.settings, {
      notifications: draft.notifications,
      weatherEnabled: draft.weather,
    });
  });

  // Past milestones shouldn't all fire at once for someone starting mid-journey.
  seedSilently();

  if (draft.notifications) notify.scheduleReminder();
  if (draft.weather) {
    try {
      const loc = await getCurrentPosition();
      setSettings({ location: loc });
      await syncWeather({ force: true });
    } catch (err) {
      toast('Weather needs a location — set one in Settings when you like.');
    }
  }

  root.hidden = true;
  root.innerHTML = '';
  document.getElementById('app').hidden = false;
  onFinish?.();
  const days = streak(getState()).days;
  toast(days >= 1
    ? `${days} ${days === 1 ? 'day' : 'days'} free of ${draft.habit.trim()} already. Counting from here.`
    : `Day one. You're free of ${draft.habit.trim()}.`, { celebrate: true });
}
