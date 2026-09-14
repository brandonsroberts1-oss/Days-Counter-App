/**
 * Milestones. Each one is a small, specific congratulation — the day count and
 * the money saved, in the user's own currency, for the habit they named.
 */
import { fmtMoney, plural } from './util.js';
import { streak, moneySavedThisStreak, lifetimeSaved, checkinStreak, habitLabel, streakHistory } from './model.js';
import { getState, mutate } from './store.js';

const DAY_BADGES = [
  { d: 1,   emoji: '🌱', name: 'Day one' },
  { d: 3,   emoji: '🌿', name: 'Three days' },
  { d: 7,   emoji: '🎉', name: 'One week' },
  { d: 14,  emoji: '✨', name: 'Two weeks' },
  { d: 21,  emoji: '🔁', name: 'Three weeks' },
  { d: 30,  emoji: '🏅', name: 'One month' },
  { d: 60,  emoji: '🔥', name: 'Two months' },
  { d: 90,  emoji: '💎', name: 'Ninety days' },
  { d: 100, emoji: '💯', name: 'One hundred' },
  { d: 180, emoji: '🌞', name: 'Half a year' },
  { d: 270, emoji: '🌳', name: 'Nine months' },
  { d: 365, emoji: '👑', name: 'One year' },
  { d: 500, emoji: '🚀', name: 'Five hundred' },
  { d: 730, emoji: '🏔️', name: 'Two years' },
  { d: 1000,emoji: '🌟', name: 'One thousand' },
];
const MONEY_BADGES = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const CHECKIN_BADGES = [
  { n: 3,  emoji: '📓', name: '3-day journal' },
  { n: 7,  emoji: '📔', name: '7-day journal' },
  { n: 30, emoji: '📚', name: '30-day journal' },
];

export function allBadges(s) {
  const cur = fmtCurrency(s);
  return [
    ...DAY_BADGES.map((b) => ({
      id: `d${b.d}`, kind: 'days', threshold: b.d, emoji: b.emoji, name: b.name,
      sub: plural(b.d, 'day'),
    })),
    ...MONEY_BADGES.map((m) => ({
      id: `m${m}`, kind: 'money', threshold: m, emoji: '💰', name: cur(m),
      sub: 'saved',
    })),
    ...CHECKIN_BADGES.map((b) => ({
      id: `j${b.n}`, kind: 'checkins', threshold: b.n, emoji: b.emoji, name: b.name,
      sub: `${b.n} in a row`,
    })),
    { id: 'honest', kind: 'special', emoji: '🫱', name: 'Honest', sub: 'Logged a slip' },
    { id: 'comeback', kind: 'special', emoji: '🌅', name: 'Comeback', sub: '7 days after a slip' },
    { id: 'restart', kind: 'special', emoji: '💗', name: 'Began again', sub: 'Started a new streak' },
  ];
}
const fmtCurrency = (s) => (v) => fmtMoney(v, s.profile.currency, { cents: false });

/** Which badges are earned right now, regardless of what's been announced. */
export function earnedIds(s, now = Date.now()) {
  const days = streak(s, now).days;
  const saved = lifetimeSaved(s, now);
  const journal = checkinStreak(s);
  const history = streakHistory(s, now);
  const ids = new Set();

  for (const b of DAY_BADGES) if (days >= b.d) ids.add(`d${b.d}`);
  for (const m of MONEY_BADGES) if (saved >= m) ids.add(`m${m}`);
  for (const b of CHECKIN_BADGES) if (journal >= b.n) ids.add(`j${b.n}`);
  if (s.relapses.length > 0) { ids.add('honest'); ids.add('restart'); }
  if (s.relapses.length > 0 && days >= 7) ids.add('comeback');
  if (history.length > 1) ids.add('restart');
  return ids;
}

export function badgeState(s, now = Date.now()) {
  const earned = earnedIds(s, now);
  return allBadges(s).map((b) => ({
    ...b,
    unlocked: earned.has(b.id),
    unlockedAt: s.achievements[b.id]?.unlockedAt || null,
  }));
}

/**
 * The handful worth showing on the home screen: most recently unlocked first,
 * and for badges unlocked in the same moment (a fresh install seeds them all),
 * the biggest of each kind wins.
 */
export function recentBadges(s, now = Date.now(), limit = 4) {
  const KIND_RANK = { days: 4, money: 3, checkins: 2, special: 1 };
  return badgeState(s, now)
    .filter((b) => b.unlocked)
    .sort((a, b) => {
      const at = Date.parse(a.unlockedAt || 0) || 0;
      const bt = Date.parse(b.unlockedAt || 0) || 0;
      if (Math.abs(at - bt) > 2000) return bt - at;
      if (a.kind !== b.kind) return (KIND_RANK[b.kind] || 0) - (KIND_RANK[a.kind] || 0);
      return (b.threshold || 0) - (a.threshold || 0);
    })
    .slice(0, limit);
}

/** The next day-milestone to aim at, with progress toward it. */
export function nextMilestone(s, now = Date.now()) {
  const days = streak(s, now).days;
  const next = DAY_BADGES.find((b) => b.d > days);
  if (!next) return null;
  const prev = [...DAY_BADGES].reverse().find((b) => b.d <= days)?.d ?? 0;
  const span = next.d - prev || 1;
  return {
    ...next,
    daysToGo: next.d - days,
    progress: Math.max(0, Math.min(1, (days - prev) / span)),
  };
}

/** Congratulation copy — the message that lands on the lock screen. */
export function messageFor(badge, s, now = Date.now()) {
  const habit = habitLabel(s);
  const money = fmtMoney(lifetimeSaved(s, now), s.profile.currency, { cents: false });
  const days = streak(s, now).days;
  if (badge.kind === 'days') {
    return {
      title: `${badge.emoji} ${badge.name} free of ${habit}`,
      body: `Congratulations — you've been free of ${habit} for ${plural(badge.threshold, 'day')} and saved ${money}.`,
    };
  }
  if (badge.kind === 'money') {
    return {
      title: `${badge.emoji} ${badge.name} saved`,
      body: `That's ${badge.name} you haven't spent on ${habit} — ${plural(days, 'day')} free and counting.`,
    };
  }
  if (badge.kind === 'checkins') {
    return { title: `${badge.emoji} ${badge.name}`, body: `${badge.threshold} days of checking in. Knowing your own patterns is how this gets easier.` };
  }
  if (badge.id === 'comeback') {
    return { title: '🌅 Comeback', body: `A week free of ${habit} since your last slip. Starting again is the whole skill.` };
  }
  if (badge.id === 'honest') {
    return { title: '🫱 Honest', body: 'Logging a slip takes more courage than hiding it. The counter resets; the progress does not.' };
  }
  return { title: `${badge.emoji} ${badge.name}`, body: badge.sub };
}

/**
 * Award anything newly earned and hand back the badges that need announcing.
 * Announcements are recorded, so a badge is only ever celebrated once.
 */
export function claimNew(now = Date.now()) {
  const s = getState();
  const earned = earnedIds(s, now);
  const badges = allBadges(s);
  const fresh = [];
  mutate((st) => {
    for (const b of badges) {
      if (earned.has(b.id) && !st.achievements[b.id]) {
        st.achievements[b.id] = { unlockedAt: new Date().toISOString() };
        fresh.push(b);
      }
    }
  }, { silent: fresh.length === 0 });
  return fresh;
}

/** On a fresh install we don't want a backlog of pop-ups for past milestones. */
export function seedSilently(now = Date.now()) {
  const s = getState();
  const earned = earnedIds(s, now);
  mutate((st) => {
    for (const id of earned) if (!st.achievements[id]) st.achievements[id] = { unlockedAt: new Date().toISOString(), seeded: true };
  }, { silent: true });
}
