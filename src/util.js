/* Small shared helpers: dates as local YYYY-MM-DD keys, money, formatting. */

export const DAY_MS = 86400000;

export const pad2 = (n) => String(n).padStart(2, '0');

/** Local-time date key, e.g. "2026-09-14". Never UTC — a streak is lived locally. */
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export const todayKey = () => dateKey(new Date());

/** Parse a key back to local midnight. */
export function parseKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function keyAddDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
/** Whole days from key a to key b (b - a), immune to DST shifts. */
export function daysBetweenKeys(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / DAY_MS);
}
export function eachDayKey(fromKey, toKey) {
  const out = [];
  const n = daysBetweenKeys(fromKey, toKey);
  for (let i = 0; i <= n; i++) out.push(keyAddDays(fromKey, i));
  return out;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ------------------------------ formatting ------------------------------ */

export function fmtMoney(value, currency = 'USD', { cents = false, compact = false } = {}) {
  const n = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: cents ? 2 : n % 1 === 0 ? 0 : 2,
      maximumFractionDigits: cents ? 2 : 2,
      notation: compact && Math.abs(n) >= 100000 ? 'compact' : 'standard',
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(cents ? 2 : 0)}`;
  }
}
export function currencySymbol(currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency })
      .formatToParts(0).find((p) => p.type === 'currency')?.value || '$';
  } catch { return '$'; }
}
export function fmtNumber(n) {
  try { return new Intl.NumberFormat().format(n); } catch { return String(n); }
}
export function fmtDateLong(key) {
  return parseKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
export function fmtDateMed(key) {
  return parseKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
export function fmtMonthYear(y, m) {
  return new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
export function fmtTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
/** "Today" / "Yesterday" / "Sat, Sep 12" */
export function relativeDayLabel(key, today = todayKey()) {
  const diff = daysBetweenKeys(key, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  return fmtDateMed(key);
}
export function dowShort(key) {
  return parseKey(key).toLocaleDateString(undefined, { weekday: 'short' });
}
export const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Duration in the friendliest unit for a fresh start. */
export function elapsedParts(fromISO, now = Date.now()) {
  const ms = Math.max(0, now - new Date(fromISO).getTime());
  return {
    ms,
    days: Math.floor(ms / DAY_MS),
    hours: Math.floor(ms / 3600000),
    minutes: Math.floor(ms / 60000),
    fractionalDays: ms / DAY_MS,
  };
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function plural(n, one, many = one + 's') {
  return `${fmtNumber(n)} ${n === 1 ? one : many}`;
}

/* ------------------------------ statistics ------------------------------ */

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
/** Pearson correlation; with one binary variable this is the point-biserial r. */
export function correlation(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}
/** Least-squares slope of y over its index — used for "is this trending up?" */
export function trendSlope(ys) {
  const n = ys.length;
  if (n < 3) return 0;
  const xs = ys.map((_, i) => i);
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? 0 : num / den;
}
