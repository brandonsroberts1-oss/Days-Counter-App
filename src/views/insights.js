/* What the data actually says — and, just as important, what it can't say yet. */
import { escapeHtml, fmtMoney, fmtNumber, plural, fmtDateMed } from '../util.js';
import { analyze } from '../insights.js';
import { badgeState } from '../achievements.js';
import { lifetimeSaved, lifetimeSpentOnSlips, bestStreakDays, habitLabel } from '../model.js';
import { sparkline, hbars, columns, dataTable, mountCharts } from '../charts.js';
import { icon } from '../ui.js';

export const meta = { id: 'insights', label: 'Insights', icon: 'spark' };
export const title = () => 'Insights';

export function render(s, ctx) {
  const a = analyze(s, ctx.now);
  const cur = s.profile.currency;

  /* ----- readiness ----- */
  const readiness = a.ready ? '' : `
    <div class="card install-card">
      <div class="card-head"><h2>Still gathering</h2></div>
      <p style="font-size:.9rem;color:var(--ink-2)">
        Patterns need something to compare. So far: <strong>${plural(a.counts.loggedDays, 'check-in')}</strong>
        across ${plural(a.counts.trackedDays, 'tracked day')}, and ${plural(a.counts.slips, 'slip')} logged.
      </p>
      <p style="font-size:.9rem;color:var(--ink-2)">
        Correlations appear once there are at least ${a.MIN_DAYS} check-ins and ${a.MIN_SLIPS} slips to compare.
        ${a.needs.length ? `Still needed: ${escapeHtml(a.needs.join(', '))}.` : ''}
        The trends and charts below already work.
      </p>
    </div>`;

  /* ----- risk ----- */
  const risk = a.risk;
  const riskCard = `
    <div class="card">
      <div class="card-head"><h2>Today's read</h2>
        <span class="card-head-action badge ${risk.level === 'high' ? 'bad' : risk.level === 'watch' ? 'gold' : 'good'}">
          ${risk.level === 'high' ? 'Take care' : risk.level === 'watch' ? 'Worth watching' : 'Steady'}
        </span>
      </div>
      <div class="meter ${risk.level === 'high' ? 'high' : risk.level === 'watch' ? 'warn' : ''}">
        <i style="width:${risk.score}%"></i>
      </div>
      ${risk.drivers.length ? `
        <ul style="margin:12px 0 0;padding-left:18px;font-size:.87rem;color:var(--ink-2)">
          ${risk.drivers.map((d) => `<li><strong style="color:var(--ink);font-weight:650">${escapeHtml(d.label)}</strong> — ${escapeHtml(d.detail)}</li>`).join('')}
        </ul>` : '<p class="field-hint">Check in today and this gets specific.</p>'}
      <p class="field-hint">A weighted read of your own history — not a prediction, and not a verdict on how today will go.</p>
    </div>`;

  /* ----- findings ----- */
  const findings = a.headlines.length ? `
    <div class="card">
      <div class="card-head"><h2>What stands out</h2></div>
      ${a.headlines.map((h) => `
        <div class="insight">
          <span class="ins-icon">${h.emoji}</span>
          <div>
            <div class="ins-title">${escapeHtml(h.title)}</div>
            <div class="ins-text">${escapeHtml(h.text).replace(/\*(.+?)\*/g, '<em>$1</em>')}</div>
            <div class="ins-strength">${escapeHtml(h.strength)}</div>
          </div>
        </div>`).join('')}
      <p class="field-hint" style="margin-top:14px">
        These are patterns in your own log, not causes. A pattern is a prompt to look closer, nothing more.
      </p>
    </div>` : `
    <div class="card">
      <div class="card-head"><h2>What stands out</h2></div>
      <p style="font-size:.9rem;color:var(--ink-2)">Nothing clear yet. Keep checking in — mood, craving, stress, sleep and the weather all get compared against your slip days automatically.</p>
    </div>`;

  /* ----- charts ----- */
  const moodPoints = a.series.mood;
  const cravingPoints = a.series.craving;
  const moodRows = moodPoints.filter((p) => p.v != null).map((p) => [fmtDateMed(p.key), `${p.v}/5`]);
  const cravingRows = cravingPoints.filter((p) => p.v != null).map((p) => [fmtDateMed(p.key), `${p.v}/10`]);

  const trendCards = `
    <div class="card">
      <div class="card-head"><h2>Mood, last ${moodPoints.length} days</h2></div>
      <p class="card-sub">Higher is better. Gaps are days you didn't check in.</p>
      ${sparkline(moodPoints, { color: 'var(--ember)', min: 1, max: 5, height: 118, yLabels: true, valueFmt: (v) => `${v}`, label: 'Mood' })}
      ${moodRows.length ? dataTable(['Day', 'Mood'], moodRows) : ''}
    </div>
    <div class="card">
      <div class="card-head"><h2>Craving, last ${cravingPoints.length} days</h2></div>
      <p class="card-sub">Lower is better. Shown separately from mood — different scales never share an axis.</p>
      ${sparkline(cravingPoints, { color: 'var(--teal)', min: 0, max: 10, height: 118, yLabels: true, valueFmt: (v) => `${v}`, label: 'Craving' })}
      ${cravingRows.length ? dataTable(['Day', 'Craving'], cravingRows) : ''}
    </div>`;

  const dowItems = a.dowTable
    .filter((d) => d.days > 0)
    .sort((x, y) => x.key - y.key)
    .map((d) => ({ label: d.label.slice(0, 3), value: d.slips, sub: `${d.days} tracked`, color: 'var(--bad)' }));
  const dowCard = a.counts.slips >= 1 ? `
    <div class="card">
      <div class="card-head"><h2>Slips by day of the week</h2></div>
      <p class="card-sub">Counted across ${plural(a.counts.trackedDays, 'tracked day')}.</p>
      ${hbars(dowItems, { valueFmt: (v) => fmtNumber(v), label: 'Slips by weekday' })}
      ${dataTable(['Day', 'Slips', 'Days tracked', 'Rate'],
        a.dowTable.sort((x, y) => x.key - y.key).map((d) => [d.label, d.slips, d.days, `${Math.round(d.rate * 100)}%`]))}
    </div>` : '';

  const weatherItems = a.weatherTable
    .filter((w) => w.days >= 2)
    .map((w) => ({ label: w.label.split(' ')[0], value: Math.round(w.rate * 100), sub: `${w.days} days`, color: 'var(--teal)' }));
  const weatherCard = weatherItems.length >= 2 ? `
    <div class="card">
      <div class="card-head"><h2>Slip rate by weather</h2></div>
      <p class="card-sub">Share of days with that weather that included a slip.</p>
      ${hbars(weatherItems, { valueFmt: (v) => `${v}%`, label: 'Slip rate by weather' })}
      ${dataTable(['Weather', 'Slips', 'Days', 'Rate'],
        a.weatherTable.map((w) => [w.label, w.slips, w.days, `${Math.round(w.rate * 100)}%`]))}
      <p class="field-hint">Weather is the weakest of these signals — treat it as curiosity, not cause.</p>
    </div>` : '';

  const streakItems = a.streaks.slice(-10).map((x, i) => ({
    label: x.current ? 'Now' : `#${a.streaks.length - Math.min(10, a.streaks.length) + i + 1}`,
    value: x.days,
    color: x.current ? 'var(--ember)' : 'var(--good)',
  }));
  const streakCard = a.streaks.length > 1 ? `
    <div class="card">
      <div class="card-head"><h2>Every streak so far</h2></div>
      <p class="card-sub">Each attempt, in order. The current one is highlighted.</p>
      ${columns(streakItems, { valueFmt: (v) => `${v}d`, label: 'Streak lengths in days' })}
      ${dataTable(['Streak', 'Started', 'Ended', 'Days'],
        a.streaks.map((x, i) => [x.current ? 'Current' : `#${i + 1}`, fmtDateMed(x.startKey), x.endKey ? fmtDateMed(x.endKey) : '—', x.days]))}
    </div>` : '';

  /* ----- factor detail ----- */
  const factorCard = a.factors.some((f) => f.rank > 0) ? `
    <div class="card">
      <div class="card-head"><h2>Slip days vs clean days</h2></div>
      <p class="card-sub">Averages from your own check-ins.</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th scope="col">Factor</th><th scope="col">Slip days</th><th scope="col">Clean days</th><th scope="col">Signal</th></tr></thead>
          <tbody>
            ${a.factors.map((f) => `<tr>
              <td>${f.emoji} ${escapeHtml(f.label)}</td>
              <td>${escapeHtml(f.fmt(f.slipMean))}</td>
              <td>${escapeHtml(f.fmt(f.cleanMean))}</td>
              <td>${escapeHtml(f.strength)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="field-hint">Based on ${plural(a.factors[0]?.n || 0, 'logged day')}, of which ${plural(a.factors[0]?.slipN || 0, 'was a slip', 'were slips')}.</p>
    </div>` : '';

  /* ----- badges ----- */
  const badges = badgeState(s, ctx.now);
  const unlocked = badges.filter((b) => b.unlocked).length;
  const badgeCard = `
    <div class="card">
      <div class="card-head"><h2>Badges</h2><span class="card-head-action badge gold">${unlocked}/${badges.length}</span></div>
      <div class="ach-grid">
        ${badges.map((b) => `
          <div class="ach ${b.unlocked ? 'unlocked' : 'locked'}">
            <span class="ach-emoji">${b.unlocked ? b.emoji : '🔒'}</span>
            <div class="ach-name">${escapeHtml(b.name)}</div>
            <div class="ach-sub">${escapeHtml(b.sub)}</div>
          </div>`).join('')}
      </div>
    </div>`;

  const totals = `
    <div class="card">
      <div class="card-head"><h2>The ledger</h2></div>
      <div class="hero-meta" style="margin-top:0">
        <div class="hero-stat"><span class="v">${fmtMoney(lifetimeSaved(s, ctx.now), cur)}</span><span class="k">kept</span></div>
        <div class="hero-stat"><span class="v">${fmtMoney(lifetimeSpentOnSlips(s), cur)}</span><span class="k">spent on slips</span></div>
        <div class="hero-stat"><span class="v">${fmtNumber(bestStreakDays(s, ctx.now))}</span><span class="k">best run (days)</span></div>
      </div>
    </div>`;

  return `
    ${readiness}
    ${riskCard}
    ${findings}
    ${totals}
    <div class="section-title">Trends</div>
    ${trendCards}
    ${streakCard}
    <div class="section-title">Where slips cluster</div>
    ${dowCard}${weatherCard}${factorCard}
    ${a.counts.slips === 0 ? `
      <div class="card"><p style="font-size:.9rem;color:var(--ink-2)">
        No slips logged, so there is nothing to correlate against — which is the best possible reason for this section to be empty.
      </p></div>` : ''}
    <div class="section-title">Milestones</div>
    ${badgeCard}
    <p class="field-hint" style="text-align:center;margin-top:16px">
      Freedays is a tracker, not treatment. Stopping some substances — alcohol and benzodiazepines especially —
      can be medically risky, so please talk to a doctor if that applies to you.
    </p>`;
}

export function mount(root) {
  mountCharts(root);
  root.querySelectorAll('[data-action="toggle-table"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = root.querySelector(`#${btn.dataset.target}`);
      if (!target) return;
      const open = !target.hidden;
      target.hidden = open;
      btn.setAttribute('aria-expanded', String(!open));
      btn.textContent = open ? 'Show the numbers' : 'Hide the numbers';
    });
  });
}
