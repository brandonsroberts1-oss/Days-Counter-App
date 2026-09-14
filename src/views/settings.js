/* Profile, money, notifications, weather, data. Everything saves as you type. */
import { escapeHtml, fmtMoney, currencySymbol, todayKey, dateKey, fmtDateLong } from '../util.js';
import {
  getState, setProfile, setSettings, mutate, exportJSON, importJSON, resetAll,
} from '../store.js';
import { dailyCost, habitLabel, streak } from '../model.js';
import * as notify from '../notify.js';
import { sync as syncWeather, getCurrentPosition, searchPlaces } from '../weather.js';
import { openSheet, closeSheet, confirmSheet, toast, icon } from '../ui.js';
import { applyTheme, installState, promptInstall } from '../install.js';

export const meta = { id: 'settings', label: 'You', icon: 'gear' };
export const title = () => 'Settings';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'ZAR', 'INR', 'SGD', 'HKD', 'MXN', 'BRL', 'AED'];
const EMOJI = ['🌱', '🍺', '🍷', '🎰', '🚬', '💊', '🍩', '🎮', '📱', '💔', '🧊', '🛒', '☕', '🍬'];

export function render(s) {
  const sym = currencySymbol(s.profile.currency);
  const inst = installState();

  return `
    <div class="card">
      <div class="card-head"><h2>What you're free of</h2></div>
      <div class="field">
        <label for="st-habit">Habit</label>
        <input type="text" id="st-habit" value="${escapeHtml(s.profile.habit)}" placeholder="Alcohol, gambling, vaping…" />
      </div>
      <div class="field">
        <span class="field-label">Icon</span>
        <div class="chips">${EMOJI.map((e) => `
          <button type="button" class="chip" data-emoji="${e}" aria-pressed="${s.profile.emoji === e}">${e}</button>`).join('')}</div>
      </div>
      <div class="field" style="margin-bottom:0">
        <label for="st-reason">Why you're doing this</label>
        <textarea id="st-reason" placeholder="The reason you'll want to read at 11pm on a hard night.">${escapeHtml(s.profile.reason || '')}</textarea>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>What it costs</h2></div>
      <div class="field-row">
        <div class="field">
          <label for="st-cost">Typical cost each time</label>
          <div class="input-prefix"><span>${escapeHtml(sym)}</span>
            <input type="number" id="st-cost" inputmode="decimal" min="0" step="0.01" value="${s.profile.costPerTime || ''}" />
          </div>
        </div>
        <div class="field">
          <label for="st-times">Times a week</label>
          <input type="number" id="st-times" inputmode="decimal" min="0" step="0.5" value="${s.profile.timesPerWeek || ''}" />
        </div>
      </div>
      <div class="field">
        <label for="st-currency">Currency</label>
        <select id="st-currency">
          ${CURRENCIES.map((c) => `<option value="${c}" ${c === s.profile.currency ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="badge gold">≈ ${fmtMoney(dailyCost(s), s.profile.currency, { cents: true })} saved every day free</div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Dates</h2></div>
      <div class="field">
        <label for="st-start">Current streak started</label>
        <input type="date" id="st-start" max="${todayKey()}" value="${dateKey(new Date(s.streakStartAt))}" />
        <p class="field-hint">Day ${streak(s).dayNumber} · since ${escapeHtml(fmtDateLong(dateKey(new Date(s.streakStartAt))))}</p>
      </div>
      <div class="field" style="margin-bottom:0">
        <label for="st-track">Tracking began</label>
        <input type="date" id="st-track" max="${todayKey()}" value="${s.profile.trackingStart}" />
        <p class="field-hint">Days before this are left blank on the calendar.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Reminders</h2></div>
      <div class="switch-row">
        <div class="sr-body">
          <div class="sr-title">Milestone & check-in alerts</div>
          <div class="sr-sub">${notify.supported()
            ? 'Congratulations when you hit a milestone, plus a nudge to check in.'
            : 'This browser does not support notifications.'}</div>
        </div>
        <button class="switch" role="switch" id="st-notify"
          aria-checked="${Boolean(s.settings.notifications)}" ${notify.supported() ? '' : 'disabled'}
          aria-label="Enable notifications"></button>
      </div>
      ${s.settings.notifications ? `
        <div class="field" style="margin-top:14px">
          <label for="st-hour">Daily nudge at</label>
          <select id="st-hour">
            ${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === Number(s.settings.reminderHour) ? 'selected' : ''}>
              ${new Date(2020, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-ghost btn-sm" id="st-test">${icon('bell')} Send a test notification</button>` : ''}
      <p class="field-hint">
        These are local alerts, so they arrive while Freedays is open or when you next open it.
        Delivering to a closed phone needs a server, and Freedays deliberately has none.
      </p>
    </div>

    <div class="card">
      <div class="card-head"><h2>Weather</h2></div>
      <div class="switch-row">
        <div class="sr-body">
          <div class="sr-title">Track the weather</div>
          <div class="sr-sub">Logs daily conditions so Insights can compare them against slips.</div>
        </div>
        <button class="switch" role="switch" id="st-weather" aria-checked="${Boolean(s.settings.weatherEnabled)}" aria-label="Enable weather"></button>
      </div>
      ${s.settings.weatherEnabled ? `
        <div class="switch-row">
          <div class="sr-body">
            <div class="sr-title">${escapeHtml(s.settings.location?.label || 'No location set')}</div>
            <div class="sr-sub">${s.settings.location ? `${s.settings.location.lat}, ${s.settings.location.lon}` : 'Needed before weather can load.'}</div>
          </div>
        </div>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn btn-ghost btn-sm" id="st-locate">Use my location</button>
          <button class="btn btn-ghost btn-sm" id="st-search">Search a city</button>
        </div>
        <div class="field" style="margin-top:14px;margin-bottom:0">
          <span class="field-label">Units</span>
          <div class="segmented" id="st-units">
            <button type="button" data-v="metric" aria-pressed="${s.settings.units === 'metric'}">°C · mm</button>
            <button type="button" data-v="imperial" aria-pressed="${s.settings.units === 'imperial'}">°F · in</button>
          </div>
        </div>
        <p class="field-hint">Only a rounded latitude and longitude is sent, to Open-Meteo. No account, no identifiers.</p>
      ` : ''}
    </div>

    <div class="card">
      <div class="card-head"><h2>Appearance</h2></div>
      <div class="segmented" id="st-theme">
        ${['system', 'light', 'dark'].map((t) => `
          <button type="button" data-v="${t}" aria-pressed="${(s.settings.theme || 'system') === t}">${t[0].toUpperCase()}${t.slice(1)}</button>`).join('')}
      </div>
    </div>

    ${inst.canPrompt || inst.isIOS ? `
      <div class="card install-card">
        <div class="card-head"><h2>Put it on your home screen</h2></div>
        <p style="font-size:.9rem;color:var(--ink-2)">One tap, no app store — it then opens full-screen like any other app, and works offline.</p>
        <button class="btn btn-primary btn-block" id="st-install">${icon('download')} ${inst.canPrompt ? 'Install Freedays' : 'How to install'}</button>
      </div>` : ''}

    <div class="card">
      <div class="card-head"><h2>Your data</h2></div>
      <p style="font-size:.88rem;color:var(--ink-2)">
        Everything lives on this device. Back it up before changing phones — there is no cloud copy.
      </p>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-ghost btn-sm" id="st-export">${icon('download')} Export</button>
        <button class="btn btn-ghost btn-sm" id="st-import">${icon('upload')} Import</button>
      </div>
      <button class="btn btn-danger btn-block btn-sm" id="st-reset" style="margin-top:12px">${icon('trash')} Erase everything</button>
    </div>

    <p class="field-hint" style="text-align:center;margin-top:18px">
      Freedays ${escapeHtml(window.__FREEDAYS_VERSION || '1.0')} · offline-first · no account, no tracking.<br>
      A tracker, not treatment. If quitting is medically risky for you — alcohol and benzodiazepines especially — please involve a doctor.
    </p>`;
}

export function mount(root, s, ctx) {
  const rerender = ctx.rerender;
  const bindText = (id, key, target = 'profile') => {
    const el = root.querySelector(`#${id}`);
    if (!el) return;
    el.addEventListener('change', () => {
      const v = el.type === 'number' ? Number(el.value) || 0 : el.value;
      (target === 'profile' ? setProfile : setSettings)({ [key]: v });
      if (['costPerTime', 'timesPerWeek', 'currency'].includes(key)) rerender();
    });
  };
  bindText('st-habit', 'habit');
  bindText('st-reason', 'reason');
  bindText('st-cost', 'costPerTime');
  bindText('st-times', 'timesPerWeek');
  bindText('st-currency', 'currency');

  root.querySelectorAll('[data-emoji]').forEach((b) => b.addEventListener('click', () => {
    setProfile({ emoji: b.dataset.emoji });
    rerender();
  }));

  root.querySelector('#st-start')?.addEventListener('change', (e) => {
    const key = e.target.value;
    if (!key) return;
    const keep = new Date(s.streakStartAt);
    const next = new Date(`${key}T${String(keep.getHours()).padStart(2, '0')}:${String(keep.getMinutes()).padStart(2, '0')}:00`);
    mutate((st) => { st.streakStartAt = (next > new Date() ? new Date() : next).toISOString(); });
    toast('Streak start updated');
    rerender();
  });
  root.querySelector('#st-track')?.addEventListener('change', (e) => {
    if (e.target.value) { setProfile({ trackingStart: e.target.value }); rerender(); }
  });

  /* notifications */
  root.querySelector('#st-notify')?.addEventListener('click', async () => {
    if (getState().settings.notifications) {
      notify.disable();
      toast('Notifications off');
    } else {
      const result = await notify.enable();
      toast(result === 'granted' ? 'Notifications on' :
        result === 'denied' ? 'Your browser blocked notifications — enable them in site settings.' :
          'Notifications are not available here.');
    }
    rerender();
  });
  root.querySelector('#st-hour')?.addEventListener('change', (e) => {
    setSettings({ reminderHour: Number(e.target.value) });
    notify.scheduleReminder();
    toast('Reminder time saved');
  });
  root.querySelector('#st-test')?.addEventListener('click', async () => {
    const ok = await notify.show('Freedays', `You're ${streak(getState()).days} days free of ${habitLabel(getState())}. This is what a milestone will look like.`);
    if (!ok) toast('Could not send — check notification permission.');
  });

  /* weather */
  root.querySelector('#st-weather')?.addEventListener('click', async () => {
    const on = !getState().settings.weatherEnabled;
    setSettings({ weatherEnabled: on });
    rerender();
    if (on && !getState().settings.location) {
      try {
        const loc = await getCurrentPosition();
        setSettings({ location: loc });
        await syncWeather({ force: true });
        toast('Weather on');
      } catch (err) {
        toast(err.message + ' You can search for a city instead.');
      }
      rerender();
    }
  });
  root.querySelector('#st-locate')?.addEventListener('click', async () => {
    try {
      const loc = await getCurrentPosition();
      setSettings({ location: loc });
      await syncWeather({ force: true });
      toast('Location set');
    } catch (err) { toast(err.message); }
    rerender();
  });
  root.querySelector('#st-search')?.addEventListener('click', () => openCitySearch(rerender));
  root.querySelector('#st-units')?.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    setSettings({ units: b.dataset.v });
    rerender();
    try { await syncWeather({ force: true }); rerender(); } catch {}
  });

  /* appearance */
  root.querySelector('#st-theme')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    setSettings({ theme: b.dataset.v });
    applyTheme(b.dataset.v);
    rerender();
  });

  /* install */
  root.querySelector('#st-install')?.addEventListener('click', () => promptInstall());

  /* data */
  root.querySelector('#st-export')?.addEventListener('click', () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freedays-backup-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup downloaded');
  });
  root.querySelector('#st-import')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!await confirmSheet({
        title: 'Replace everything?',
        message: 'Importing a backup overwrites the data currently on this device.',
        confirmLabel: 'Import', danger: true,
      })) return;
      try {
        importJSON(await file.text());
        toast('Backup restored');
        rerender();
      } catch (err) { toast(err.message || 'That file could not be read.'); }
    });
    input.click();
  });
  root.querySelector('#st-reset')?.addEventListener('click', async () => {
    if (await confirmSheet({
      title: 'Erase everything?',
      message: 'Your streak, notes, slips and badges will be deleted from this device for good. Export a backup first if you might want them.',
      confirmLabel: 'Erase it all', danger: true,
    })) {
      resetAll();
      location.reload();
    }
  });
}

function openCitySearch(rerender) {
  openSheet({
    title: 'Find your city',
    body: `
      <div class="field">
        <label for="city-q">City or town</label>
        <input type="search" id="city-q" placeholder="e.g. Portland" autocomplete="off" />
      </div>
      <div id="city-results" class="list"></div>`,
    onMount(sheet) {
      const input = sheet.querySelector('#city-q');
      const results = sheet.querySelector('#city-results');
      let timer = null;
      input.addEventListener('input', () => {
        clearTimeout(timer);
        const q = input.value.trim();
        if (q.length < 2) { results.innerHTML = ''; return; }
        timer = setTimeout(async () => {
          results.innerHTML = '<p class="chart-empty">Searching…</p>';
          try {
            const places = await searchPlaces(q);
            results.innerHTML = places.length
              ? places.map((p) => `<button class="list-item" data-lat="${p.lat}" data-lon="${p.lon}" data-label="${escapeHtml(p.label)}">
                  <span class="li-icon">📍</span><span class="li-body"><span class="li-title">${escapeHtml(p.label)}</span></span></button>`).join('')
              : '<p class="chart-empty">No matches.</p>';
          } catch {
            results.innerHTML = '<p class="chart-empty">Search failed — check your connection.</p>';
          }
        }, 320);
      });
      results.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-lat]');
        if (!b) return;
        setSettings({ location: { lat: Number(b.dataset.lat), lon: Number(b.dataset.lon), label: b.dataset.label } });
        closeSheet();
        toast('Location set');
        try { await syncWeather({ force: true }); } catch {}
        rerender();
      });
    },
  });
}
