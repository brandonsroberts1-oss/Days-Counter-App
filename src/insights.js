/**
 * Pattern finder.
 *
 * Honesty rules baked in: nothing is reported until there is enough data to
 * say it, every claim carries its sample size, and the language stays at
 * "pattern worth noticing" — never "cause".
 */
import {
  todayKey, keyAddDays, daysBetweenKeys, eachDayKey, correlation, mean, trendSlope, clamp,
} from './util.js';
import { relapseDateSet, streakHistory, dailyCost } from './model.js';
import { describeCode, GROUP_LABEL } from './weather.js';

const MIN_DAYS = 10;      // logged days before any correlation is shown
const MIN_SLIPS = 3;      // slips before relapse patterns are shown
const MIN_CATEGORY = 3;   // observations before a category gets an opinion

export const NUMERIC_FACTORS = [
  { key: 'mood',     label: 'Mood',           emoji: '🙂', lowGood: false, unit: '/5',  fmt: (v) => `${v.toFixed(1)}/5` },
  { key: 'craving',  label: 'Craving',        emoji: '🌀', lowGood: true,  unit: '/10', fmt: (v) => `${v.toFixed(1)}/10` },
  { key: 'stress',   label: 'Stress',         emoji: '😣', lowGood: true,  unit: '/10', fmt: (v) => `${v.toFixed(1)}/10` },
  { key: 'sleep',    label: 'Sleep',          emoji: '😴', lowGood: false, unit: 'h',   fmt: (v) => `${v.toFixed(1)}h` },
  { key: 'tmax',     label: 'Temperature',    emoji: '🌡️', lowGood: null, unit: '°',   fmt: (v) => `${Math.round(v)}°` },
  { key: 'precip',   label: 'Rainfall',       emoji: '🌧️', lowGood: null, unit: '',    fmt: (v) => v.toFixed(1) },
  { key: 'sunshine', label: 'Sunshine',       emoji: '🌤️', lowGood: null, unit: 'h',   fmt: (v) => `${v.toFixed(1)}h` },
];

export const TRIGGER_TAGS = [
  'Bored', 'Stressed', 'Lonely', 'Tired', 'Anxious', 'Angry', 'Celebrating',
  'Social event', 'Payday', 'Conflict', 'Cravings hit hard', 'Passed a trigger',
  'Alone at home', 'Drinking nearby', 'Work pressure', 'Money worries',
];

const LADDER = [
  { label: 'No clear link', rank: 0 },
  { label: 'Early signal', rank: 1 },
  { label: 'Moderate pattern', rank: 2 },
  { label: 'Strong pattern', rank: 3 },
];
/**
 * Correlation strength, capped by how much evidence sits behind it — five slip
 * days can suggest a pattern, but they can't earn the word "strong".
 */
function strengthOf(r, sampleSlips = Infinity) {
  const a = Math.abs(r);
  let rank = a >= 0.5 ? 3 : a >= 0.3 ? 2 : a >= 0.15 ? 1 : 0;
  const cap = sampleSlips >= 8 ? 3 : sampleSlips >= 5 ? 2 : sampleSlips >= 3 ? 1 : 0;
  return LADDER[Math.min(rank, cap)];
}

/** One row per tracked day: the features we know, plus whether it was a slip. */
export function buildDayTable(s, today = todayKey()) {
  const start = s.profile.trackingStart;
  if (daysBetweenKeys(start, today) < 0) return [];
  const slips = relapseDateSet(s);
  return eachDayKey(start, today).map((key) => {
    const e = s.entries[key] || {};
    const w = s.weather[key] || {};
    const nextKey = keyAddDays(key, 1);
    return {
      key,
      dow: new Date(`${key}T00:00:00`).getDay(),
      slip: slips.has(key),
      slipTomorrow: slips.has(nextKey),
      logged: Boolean(s.entries[key]),
      mood: num(e.mood),
      craving: num(e.craving),
      stress: num(e.stress),
      sleep: num(e.sleep),
      tags: Array.isArray(e.tags) ? e.tags : [],
      note: e.note || '',
      tmax: num(w.tmax),
      precip: num(w.precip),
      sunshine: num(w.sunshineHours),
      wcode: w.code ?? null,
      wgroup: w.code != null ? describeCode(w.code).group : null,
    };
  });
}
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/* --------------------------- numeric factors ---------------------------- */

function factorFindings(rows) {
  const out = [];
  for (const f of NUMERIC_FACTORS) {
    const usable = rows.filter((r) => r[f.key] !== null);
    if (usable.length < MIN_DAYS) continue;
    const slipRows = usable.filter((r) => r.slip);
    const cleanRows = usable.filter((r) => !r.slip);
    if (slipRows.length < 2 || cleanRows.length < 3) continue;

    const xs = usable.map((r) => r[f.key]);
    const ys = usable.map((r) => (r.slip ? 1 : 0));
    const r = correlation(xs, ys);
    const slipMean = mean(slipRows.map((x) => x[f.key]));
    const cleanMean = mean(cleanRows.map((x) => x[f.key]));
    const strength = strengthOf(r, slipRows.length);

    // The lead indicator: what the day *before* a slip looked like.
    const beforeRows = usable.filter((x) => x.slipTomorrow && !x.slip);
    const before = beforeRows.length >= MIN_SLIPS ? mean(beforeRows.map((x) => x[f.key])) : null;

    out.push({
      ...f,
      n: usable.length,
      slipN: slipRows.length,
      r,
      slipMean,
      cleanMean,
      delta: slipMean - cleanMean,
      beforeMean: before,
      beforeN: beforeRows.length,
      strength: strength.label,
      rank: strength.rank,
      direction: r > 0 ? 'higher' : 'lower',
    });
  }
  return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

/* -------------------------- categorical splits -------------------------- */

function rateTable(rows, keyFn, labelFn) {
  const buckets = new Map();
  for (const row of rows) {
    const k = keyFn(row);
    if (k === null || k === undefined) continue;
    if (!buckets.has(k)) buckets.set(k, { key: k, label: labelFn(k), days: 0, slips: 0 });
    const b = buckets.get(k);
    b.days++;
    if (row.slip) b.slips++;
  }
  const totalDays = rows.length;
  const totalSlips = rows.filter((r) => r.slip).length;
  const base = totalDays ? totalSlips / totalDays : 0;
  return [...buckets.values()]
    .map((b) => ({ ...b, rate: b.days ? b.slips / b.days : 0, lift: base ? (b.slips / b.days) / base : 0, base }))
    .sort((a, b) => b.rate - a.rate);
}

function tagFindings(rows) {
  const totalSlips = rows.filter((r) => r.slip).length;
  const counts = new Map();
  for (const row of rows) {
    for (const t of row.tags) {
      if (!counts.has(t)) counts.set(t, { tag: t, days: 0, slips: 0 });
      const c = counts.get(t);
      c.days++;
      if (row.slip || row.slipTomorrow) c.slips++;
    }
  }
  const logged = rows.filter((r) => r.logged).length;
  const base = logged ? rows.filter((r) => r.logged && (r.slip || r.slipTomorrow)).length / logged : 0;
  return [...counts.values()]
    .filter((c) => c.days >= MIN_CATEGORY)
    .map((c) => ({ ...c, rate: c.slips / c.days, lift: base ? (c.slips / c.days) / base : 0, base, totalSlips }))
    .sort((a, b) => b.rate - a.rate);
}

/* ------------------------------ slip notes ------------------------------ */

function triggerCounts(s) {
  const counts = new Map();
  for (const r of s.relapses) {
    for (const t of r.triggers || []) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n);
}
function timeOfDayCounts(s) {
  const buckets = { Morning: 0, Afternoon: 0, Evening: 0, 'Late night': 0 };
  for (const r of s.relapses) {
    const h = new Date(r.at).getHours();
    const b = h < 6 ? 'Late night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 22 ? 'Evening' : 'Late night';
    buckets[b]++;
  }
  return Object.entries(buckets).map(([label, n]) => ({ label, n })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
}

/* -------------------------------- risk ---------------------------------- */

function todayRisk(s, rows, factors, dowTable, weatherTable, today) {
  const drivers = [];
  const row = rows.find((r) => r.key === today);
  const base = rows.length ? rows.filter((r) => r.slip).length / rows.length : 0;
  let score = clamp(base * 100, 4, 40); // start at the user's own baseline rate
  let evidence = 0;

  const bump = (amount, label, detail) => {
    score += amount;
    drivers.push({ label, detail, weight: amount });
    if (Math.abs(amount) >= 4) evidence++;
  };

  if (row) {
    if (row.craving !== null) {
      const c = row.craving;
      if (c >= 7) bump(22, 'Craving is high today', `You logged ${c}/10.`);
      else if (c >= 4) bump(9, 'Craving is moderate today', `You logged ${c}/10.`);
      else if (c <= 2) bump(-8, 'Craving is low today', `You logged ${c}/10.`);
    }
    if (row.stress !== null && row.stress >= 7) bump(12, 'Stress is high today', `You logged ${row.stress}/10.`);
    if (row.mood !== null && row.mood <= 2) bump(10, 'Mood is low today', `You logged ${row.mood}/5.`);
    if (row.sleep !== null && row.sleep <= 5.5) bump(8, 'Short sleep last night', `${row.sleep}h logged.`);
  }

  const dow = dowTable.find((d) => d.key === new Date(`${today}T00:00:00`).getDay());
  if (dow && dow.days >= MIN_CATEGORY && dow.slips >= 2 && dow.lift > 1.3) {
    bump(10, `${dow.label}s have been harder`, `${dow.slips} of your ${dow.slips + (dow.days - dow.slips)} ${dow.label}s included a slip.`);
  }
  const wg = rows.find((r) => r.key === today)?.wgroup;
  const wRow = weatherTable.find((w) => w.key === wg);
  if (wRow && wRow.days >= MIN_CATEGORY && wRow.slips >= 2 && wRow.lift > 1.3) {
    bump(8, `${wRow.label} days have run higher`, `${wRow.slips} slips across ${wRow.days} such days.`);
  }

  // A long clean run is protective in practice — reflect it, gently.
  const cur = streakHistory(s)[streakHistory(s).length - 1];
  if (cur && cur.days >= 30) bump(-10, 'You have real momentum', `${cur.days} days into this streak.`);

  score = clamp(Math.round(score), 3, 97);
  const level = score >= 60 ? 'high' : score >= 33 ? 'watch' : 'steady';
  return {
    score, level, drivers: drivers.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
    confident: evidence >= 2 && rows.filter((r) => r.logged).length >= MIN_DAYS,
  };
}

/* ------------------------------ headlines ------------------------------- */

function headlines(s, { factors, dowTable, weatherTable, tags, triggers, moodTrend, cravingTrend, streaks, times }) {
  const out = [];
  const slipTotal = s.relapses.length;

  for (const f of factors.slice(0, 4)) {
    if (f.rank === 0) continue;
    const dir = f.delta > 0 ? 'higher' : 'lower';
    out.push({
      emoji: f.emoji,
      title: `${f.label} runs ${dir} on slip days`,
      text: `${f.label} averaged ${f.fmt(f.slipMean)} on the ${f.slipN} day${f.slipN === 1 ? '' : 's'} you slipped, against ${f.fmt(f.cleanMean)} on clean days.`
        + (f.beforeMean !== null ? ` The day *before* a slip it averaged ${f.fmt(f.beforeMean)}.` : ''),
      strength: f.strength,
      rank: f.rank,
    });
  }

  const worstDow = dowTable.find((d) => d.days >= MIN_CATEGORY && d.slips >= 2 && d.lift >= 1.4);
  if (worstDow && slipTotal >= MIN_SLIPS) {
    out.push({
      emoji: '📅',
      title: `${worstDow.label}s are your hardest day`,
      text: `${worstDow.slips} of your ${slipTotal} slips landed on a ${worstDow.label} — ${Math.round(worstDow.rate * 100)}% of the ${worstDow.days} ${worstDow.label}s you've tracked, against ${Math.round(worstDow.base * 100)}% across all days.`,
      strength: worstDow.slips >= 5 && worstDow.lift >= 2 ? 'Strong pattern'
        : worstDow.slips >= 3 ? 'Moderate pattern' : 'Early signal',
      rank: worstDow.slips >= 5 && worstDow.lift >= 2 ? 3 : worstDow.slips >= 3 ? 2 : 1,
    });
  }

  const worstWeather = weatherTable.find((w) => w.days >= 5 && w.slips >= 2 && w.lift >= 1.4);
  if (worstWeather && slipTotal >= MIN_SLIPS) {
    out.push({
      emoji: '🌦️',
      title: `${worstWeather.label} weather shows up more often`,
      text: `${worstWeather.slips} slips across ${worstWeather.days} ${worstWeather.label.toLowerCase()} days (${Math.round(worstWeather.rate * 100)}%), against ${Math.round(worstWeather.base * 100)}% on an average day.`,
      strength: 'Early signal',
      rank: 1,
    });
  }

  const topTag = tags.find((t) => t.slips >= 2 && t.lift >= 1.4);
  if (topTag) {
    out.push({
      emoji: '🏷️',
      title: `"${topTag.tag}" days carry more risk`,
      text: `${topTag.slips} of the ${topTag.days} days you tagged "${topTag.tag}" ended in a slip, or were followed by one.`,
      strength: topTag.slips >= 4 && topTag.lift >= 2 ? 'Moderate pattern' : 'Early signal',
      rank: topTag.slips >= 4 && topTag.lift >= 2 ? 2 : 1,
    });
  }

  if (triggers.length && triggers[0].n >= 2) {
    out.push({
      emoji: '🎯',
      title: `Your most common trigger is "${triggers[0].tag}"`,
      text: `Named in ${triggers[0].n} of ${slipTotal} slips.`
        + (triggers[1] ? ` Next: "${triggers[1].tag}" (${triggers[1].n}).` : ''),
      strength: 'From your own notes',
      rank: 2,
    });
  }

  if (times.length && times[0].n >= 2 && slipTotal >= MIN_SLIPS) {
    out.push({
      emoji: '🕗',
      title: `Slips cluster in the ${times[0].label.toLowerCase()}`,
      text: `${times[0].n} of ${slipTotal} happened then. Worth having a plan for that window.`,
      strength: 'From your own notes',
      rank: 2,
    });
  }

  if (moodTrend.n >= 14) {
    const up = moodTrend.slope > 0.01, down = moodTrend.slope < -0.01;
    if (up || down) {
      out.push({
        emoji: up ? '📈' : '📉',
        title: `Your mood is trending ${up ? 'up' : 'down'}`,
        text: `Across your last ${moodTrend.n} check-ins, mood has moved ${up ? 'upward' : 'downward'} by about ${Math.abs(moodTrend.slope * 30).toFixed(1)} points a month.`,
        strength: 'Trend',
        rank: up ? 1 : 2,
      });
    }
  }
  if (cravingTrend.n >= 14 && cravingTrend.slope < -0.02) {
    out.push({
      emoji: '🌊',
      title: 'Cravings are easing off',
      text: `Down roughly ${Math.abs(cravingTrend.slope * 30).toFixed(1)} points a month across your last ${cravingTrend.n} check-ins.`,
      strength: 'Trend',
      rank: 1,
    });
  }

  const finished = streaks.filter((x) => !x.current);
  if (finished.length >= 2) {
    const half = Math.ceil(finished.length / 2);
    const early = mean(finished.slice(0, half).map((x) => x.days));
    const late = mean(finished.slice(half).map((x) => x.days));
    if (late > early * 1.25) {
      out.push({
        emoji: '💪', title: 'Your streaks are getting longer',
        text: `Early attempts averaged ${early.toFixed(0)} days; your recent ones average ${late.toFixed(0)}. The trend matters more than any single day.`,
        strength: 'Trend', rank: 3,
      });
    }
  }

  return out.sort((a, b) => b.rank - a.rank);
}

/* -------------------------------- main ---------------------------------- */

export function analyze(s, now = Date.now()) {
  const today = todayKey();
  const rows = buildDayTable(s, today);
  const loggedRows = rows.filter((r) => r.logged);
  const slipCount = s.relapses.length;

  const factors = factorFindings(rows);
  const dowTable = rateTable(rows, (r) => r.dow, (k) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][k]);
  const weatherTable = rateTable(rows.filter((r) => r.wgroup), (r) => r.wgroup, (k) => GROUP_LABEL[k] || k);
  const tags = tagFindings(rows);
  const triggers = triggerCounts(s);
  const times = timeOfDayCounts(s);
  const streaks = streakHistory(s, now);

  const recent = rows.slice(-60);
  const moodVals = recent.filter((r) => r.mood !== null);
  const cravingVals = recent.filter((r) => r.craving !== null);
  const moodTrend = { n: moodVals.length, slope: trendSlope(moodVals.map((r) => r.mood)) };
  const cravingTrend = { n: cravingVals.length, slope: trendSlope(cravingVals.map((r) => r.craving)) };

  const risk = todayRisk(s, rows, factors, dowTable, weatherTable, today);

  const ready = loggedRows.length >= MIN_DAYS && slipCount >= MIN_SLIPS;
  const needs = [];
  if (loggedRows.length < MIN_DAYS) needs.push(`${MIN_DAYS - loggedRows.length} more daily check-in${MIN_DAYS - loggedRows.length === 1 ? '' : 's'}`);
  if (slipCount < MIN_SLIPS) needs.push('a longer history to compare against');

  return {
    rows,
    counts: { trackedDays: rows.length, loggedDays: loggedRows.length, slips: slipCount },
    ready, needs,
    factors, dowTable, weatherTable, tags, triggers, times, streaks,
    moodTrend, cravingTrend,
    risk,
    headlines: headlines(s, { factors, dowTable, weatherTable, tags, triggers, moodTrend, cravingTrend, streaks, times }),
    series: {
      mood: rows.slice(-45).map((r) => ({ key: r.key, v: r.mood })),
      craving: rows.slice(-45).map((r) => ({ key: r.key, v: r.craving })),
      savings: rows.slice(-45).map((r, i) => ({ key: r.key, v: dailyCost(s) * (i + 1) })),
    },
    MIN_DAYS, MIN_SLIPS,
  };
}
