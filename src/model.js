/**
 * Derived values. Nothing here mutates state — every function takes the state
 * and answers one question about it.
 */
import {
  DAY_MS, dateKey, todayKey, parseKey, keyAddDays, daysBetweenKeys,
  eachDayKey, elapsedParts, plural, fmtNumber,
} from './util.js';

/** What the habit costs per day, averaged from "£X, Y times a week". */
export function dailyCost(s) {
  const c = Number(s.profile.costPerTime) || 0;
  const t = Number(s.profile.timesPerWeek) || 0;
  return (c * t) / 7;
}

/** The live streak: days, and the finer units that matter on day one. */
export function streak(s, now = Date.now()) {
  const e = elapsedParts(s.streakStartAt, now);
  return {
    ...e,
    startAt: s.streakStartAt,
    startKey: dateKey(new Date(s.streakStartAt)),
    dayNumber: e.days + 1, // "you are in day 3" reads better than "2 days"
  };
}

/** The headline number and its unit — hours on the first day, then days. */
export function heroCount(s, now = Date.now()) {
  const e = streak(s, now);
  if (e.days >= 1) return { value: e.days, unit: e.days === 1 ? 'day free' : 'days free', precision: 'days' };
  if (e.hours >= 1) return { value: e.hours, unit: e.hours === 1 ? 'hour free' : 'hours free', precision: 'hours' };
  return { value: e.minutes, unit: e.minutes === 1 ? 'minute free' : 'minutes free', precision: 'minutes' };
}

export function moneySavedThisStreak(s, now = Date.now()) {
  return dailyCost(s) * streak(s, now).fractionalDays;
}

/** Every day since tracking began that wasn't a slip day. */
export function lifetimeCleanDays(s, today = todayKey()) {
  const start = s.profile.trackingStart;
  if (daysBetweenKeys(start, today) < 0) return 0;
  const slips = relapseDateSet(s);
  let n = 0;
  for (const k of eachDayKey(start, today)) if (!slips.has(k)) n++;
  return n;
}
/**
 * Clean days, counting today as the fraction lived so far — so the all-time
 * figure and the live streak figure agree instead of drifting by a day.
 */
export function lifetimeCleanDaysFractional(s, now = Date.now(), today = todayKey()) {
  const whole = lifetimeCleanDays(s, today);
  if (whole === 0) return 0;
  if (dayStatus(s, today, today) !== 'clean') return whole;
  const sinceMidnight = (now - parseKey(today).getTime()) / DAY_MS;
  return whole - 1 + Math.min(1, Math.max(0, sinceMidnight));
}
export function lifetimeSaved(s, now = Date.now(), today = todayKey()) {
  return dailyCost(s) * lifetimeCleanDaysFractional(s, now, today);
}
export function lifetimeSpentOnSlips(s) {
  return s.relapses.reduce((a, r) => a + (Number(r.amountSpent) || 0), 0);
}

export function relapseDateSet(s) {
  return new Set(s.relapses.map((r) => r.dateKey));
}
export function relapsesByDate(s) {
  const map = new Map();
  for (const r of s.relapses) {
    if (!map.has(r.dateKey)) map.set(r.dateKey, []);
    map.get(r.dateKey).push(r);
  }
  return map;
}

/** 'future' | 'untracked' | 'slip' | 'clean' */
export function dayStatus(s, key, today = todayKey()) {
  if (daysBetweenKeys(today, key) > 0) return 'future';
  if (daysBetweenKeys(s.profile.trackingStart, key) < 0) return 'untracked';
  return relapseDateSet(s).has(key) ? 'slip' : 'clean';
}

export function daySavings(s, key, today = todayKey()) {
  return dayStatus(s, key, today) === 'clean' ? dailyCost(s) : 0;
}

/** Every streak the user has run, oldest first, including the live one. */
export function streakHistory(s, now = Date.now()) {
  const out = [];
  const slips = [...s.relapses].sort((a, b) => (a.at < b.at ? -1 : 1));
  let startMs = parseKey(s.profile.trackingStart).getTime();
  for (const r of slips) {
    const endMs = new Date(r.at).getTime();
    if (endMs < startMs) continue;
    out.push({
      startKey: dateKey(new Date(startMs)),
      endKey: r.dateKey,
      days: Math.floor((endMs - startMs) / DAY_MS),
      endedBy: r.id,
    });
    startMs = endMs;
  }
  out.push({
    startKey: dateKey(new Date(startMs)),
    endKey: null,
    days: Math.floor((now - startMs) / DAY_MS),
    current: true,
  });
  return out;
}
export function bestStreakDays(s, now = Date.now()) {
  return streakHistory(s, now).reduce((m, x) => Math.max(m, x.days), 0);
}

/** Consecutive days (ending today or yesterday) with a journal entry. */
export function checkinStreak(s, today = todayKey()) {
  let n = 0;
  let k = s.entries[today] ? today : keyAddDays(today, -1);
  while (s.entries[k]) { n++; k = keyAddDays(k, -1); }
  return n;
}

export function entriesSorted(s) {
  return Object.entries(s.entries)
    .map(([key, e]) => ({ key, ...e }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}

/** Journal + slips woven into one reverse-chronological timeline. */
export function timeline(s) {
  const items = [];
  for (const [key, e] of Object.entries(s.entries)) items.push({ type: 'entry', key, data: e });
  for (const r of s.relapses) items.push({ type: 'slip', key: r.dateKey, data: r });
  return items.sort((a, b) => {
    if (a.key !== b.key) return a.key < b.key ? 1 : -1;
    return a.type === 'slip' ? -1 : 1;
  });
}

export function habitLabel(s) {
  return s.profile.habit || 'this habit';
}

export function summaryLine(s, now = Date.now()) {
  const st = streak(s, now);
  return `${plural(st.days, 'day')} free of ${habitLabel(s)}`;
}

export { fmtNumber };
