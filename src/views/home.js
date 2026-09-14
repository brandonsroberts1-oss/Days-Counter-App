/* The main screen: the number, the tally, the money, what's next. */
import {
  escapeHtml, fmtMoney, plural, todayKey, fmtNumber, relativeDayLabel,
} from '../util.js';
import {
  heroCount, streak, moneySavedThisStreak, lifetimeSaved, lifetimeCleanDays,
  dailyCost, bestStreakDays, habitLabel, checkinStreak,
} from '../model.js';
import { nextMilestone, recentBadges } from '../achievements.js';
import { describeCode, fmtTemp } from '../weather.js';
import { analyze } from '../insights.js';
import { tally } from '../charts.js';
import { icon } from '../ui.js';
import { getState } from '../store.js';
import { openCheckIn, openSlip } from '../sheets.js';

export const meta = { id: 'home', label: 'Streak', icon: 'flame' };

export function title(s) {
  return s.profile.emoji ? `${s.profile.emoji} Freedays` : 'Freedays';
}

export function render(s, ctx) {
  const now = ctx.now;
  const hero = heroCount(s, now);
  const st = streak(s, now);
  const saved = moneySavedThisStreak(s, now);
  const best = bestStreakDays(s, now);
  const next = nextMilestone(s, now);
  const today = todayKey();
  const checkedIn = Boolean(s.entries[today]);
  const w = s.weather[today];
  const cur = w?.now;
  const risk = s.relapses.length >= 1 ? analyze(s, now).risk : null;

  const weatherCard = s.settings.weatherEnabled && (cur || w?.code != null) ? `
    <div class="card">
      <div class="weather-strip">
        <span class="w-emoji">${describeCode(cur?.code ?? w.code).emoji}</span>
        <div style="flex:1;min-width:0">
          <div class="w-temp">${fmtTemp(cur?.temp ?? w.tmax, s)}</div>
          <div class="w-desc">${escapeHtml(describeCode(cur?.code ?? w.code).label)}${s.settings.location?.label ? ` · ${escapeHtml(s.settings.location.label)}` : ''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:.78rem;color:var(--ink-3)">High ${fmtTemp(w?.tmax, s)}</div>
          <div style="font-size:.78rem;color:var(--ink-3)">Low ${fmtTemp(w?.tmin, s)}</div>
        </div>
      </div>
    </div>` : '';

  const milestoneCard = next ? `
    <div class="card">
      <div class="card-head">
        <h2>Next milestone</h2>
        <span class="card-head-action badge gold">${next.emoji} ${escapeHtml(next.name)}</span>
      </div>
      <div class="meter"><i style="width:${Math.round(next.progress * 100)}%"></i></div>
      <div class="progress-row">
        <strong>${plural(next.daysToGo, 'day')}</strong> to go — you'll have saved about
        ${fmtMoney(dailyCost(s) * next.d, s.profile.currency)} by then.
      </div>
    </div>` : '';

  const riskCard = risk && risk.drivers.length ? `
    <div class="card">
      <div class="card-head"><h2>Today's read</h2>
        <span class="card-head-action badge ${risk.level === 'high' ? 'bad' : risk.level === 'watch' ? 'gold' : 'good'}">
          ${risk.level === 'high' ? 'Take care today' : risk.level === 'watch' ? 'Worth watching' : 'Steady'}
        </span>
      </div>
      <div class="meter ${risk.level === 'high' ? 'high' : risk.level === 'watch' ? 'warn' : ''}"><i style="width:${risk.score}%"></i></div>
      <ul style="margin:10px 0 0;padding-left:18px;font-size:.85rem;color:var(--ink-2)">
        ${risk.drivers.slice(0, 3).map((d) => `<li>${escapeHtml(d.label)} <span style="color:var(--ink-3)">— ${escapeHtml(d.detail)}</span></li>`).join('')}
      </ul>
      ${!risk.confident ? `<p class="field-hint">Based on limited history so far — it sharpens as you check in.</p>` : ''}
    </div>` : '';

  const recent = recentBadges(s, now, 4);

  return `
    <section class="hero">
      <div class="hero-label">Day ${fmtNumber(st.dayNumber)}${checkedIn ? ' · checked in' : ''}</div>
      <div class="hero-number" id="hero-number">${fmtNumber(hero.value)}</div>
      <div class="hero-unit">${escapeHtml(hero.unit)}${s.profile.habit ? ` of ${escapeHtml(s.profile.habit.toLowerCase())}` : ''}</div>
      <div class="hero-habit">${escapeHtml(s.profile.emoji || '🌱')} ${escapeHtml(habitLabel(s))}</div>
      <div class="hero-meta">
        <div class="hero-stat">
          <span class="v" id="hero-money">${fmtMoney(saved, s.profile.currency, { cents: saved < 1000 })}</span>
          <span class="k">saved this streak</span>
        </div>
        <div class="hero-stat">
          <span class="v">${fmtNumber(best)}</span>
          <span class="k">best streak (days)</span>
        </div>
      </div>
    </section>

    <div class="btn-row" style="margin-bottom:16px">
      <button class="btn ${checkedIn ? 'btn-ghost' : 'btn-primary'}" data-act="checkin">
        ${icon(checkedIn ? 'pencil' : 'check')} ${checkedIn ? 'Edit check-in' : 'Check in'}
      </button>
      <button class="btn btn-ghost" data-act="slip">${icon('reset')} Log a slip</button>
    </div>

    ${weatherCard}

    <div class="card">
      <div class="card-head"><h2>${fmtNumber(st.days)} ${st.days === 1 ? 'day' : 'days'} free</h2></div>
      ${tally(st.days)}
    </div>

    ${milestoneCard}
    ${riskCard}

    <div class="card">
      <div class="card-head"><h2>Money kept</h2><span class="card-head-action">${icon('wallet')}</span></div>
      <div class="hero-meta" style="margin-top:0">
        <div class="hero-stat">
          <span class="v">${fmtMoney(lifetimeSaved(s, now), s.profile.currency)}</span>
          <span class="k">all time</span>
        </div>
        <div class="hero-stat">
          <span class="v">${fmtMoney(dailyCost(s), s.profile.currency, { cents: true })}</span>
          <span class="k">every day free</span>
        </div>
        <div class="hero-stat">
          <span class="v">${fmtNumber(lifetimeCleanDays(s))}</span>
          <span class="k">free days total</span>
        </div>
      </div>
      <p class="field-hint" style="margin-top:12px">
        Based on ${fmtMoney(s.profile.costPerTime, s.profile.currency)} × ${fmtNumber(s.profile.timesPerWeek)} a week.
        You can change that in Settings.
      </p>
    </div>

    ${recent.length ? `
      <div class="card">
        <div class="card-head"><h2>Recent badges</h2>
          <button class="btn btn-quiet btn-sm card-head-action" data-act="go-insights">See all</button>
        </div>
        <div class="ach-grid">
          ${recent.map((b) => `
            <div class="ach unlocked">
              <span class="ach-emoji">${b.emoji}</span>
              <div class="ach-name">${escapeHtml(b.name)}</div>
              <div class="ach-sub">${escapeHtml(b.sub)}</div>
            </div>`).join('')}
        </div>
      </div>` : ''}

    ${checkinStreak(s) >= 2 ? `<p class="tally-note" style="text-align:center;margin-top:4px">
      📓 ${plural(checkinStreak(s), 'day')} of check-ins in a row.</p>` : ''}
  `;
}

export function mount(root, s, ctx) {
  root.querySelector('[data-act="checkin"]')?.addEventListener('click', () => openCheckIn(todayKey(), { onSaved: ctx.rerender }));
  root.querySelector('[data-act="slip"]')?.addEventListener('click', () => openSlip({ onSaved: ctx.rerender }));
  root.querySelector('[data-act="go-insights"]')?.addEventListener('click', () => ctx.setTab('insights'));

  // Keep the live numbers moving without re-rendering the whole screen.
  const heroEl = root.querySelector('#hero-number');
  const moneyEl = root.querySelector('#hero-money');
  const tick = () => {
    const st = getState();
    if (!st || !heroEl?.isConnected) return;
    const h = heroCount(st, Date.now());
    heroEl.textContent = fmtNumber(h.value);
    const saved = moneySavedThisStreak(st, Date.now());
    if (moneyEl) moneyEl.textContent = fmtMoney(saved, st.profile.currency, { cents: saved < 1000 });
  };
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

