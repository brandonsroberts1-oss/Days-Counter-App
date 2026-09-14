/**
 * Persistence. Everything lives on the device in localStorage — no account,
 * no server, nothing leaves the phone except the anonymous weather lookup.
 */
import { todayKey, uid } from './util.js';

const KEY = 'freedays.state.v1';
const SCHEMA = 1;

export function defaultState() {
  return {
    schema: SCHEMA,
    onboarded: false,
    profile: {
      habit: '',                 // "Alcohol", "Gambling", …
      emoji: '🌱',
      reason: '',                // why the user is doing this
      costPerTime: 0,            // money per occurrence
      timesPerWeek: 0,           // typical occurrences per week
      currency: 'USD',
      trackingStart: todayKey(), // first day ever tracked
      createdAt: new Date().toISOString(),
    },
    streakStartAt: new Date().toISOString(), // reset on every slip
    bestStreakDays: 0,
    relapses: [],   // { id, dateKey, at, amountSpent, severity, triggers[], feeling, note }
    entries: {},    // dateKey -> { mood, craving, stress, sleep, tags[], note, updatedAt }
    achievements: {},   // id -> { unlockedAt }
    weather: {},        // dateKey -> daily weather snapshot
    settings: {
      theme: 'system',
      notifications: false,
      reminderHour: 20,
      weatherEnabled: false,
      units: 'metric',
      location: null,   // { lat, lon, label }
      lastOpenedKey: todayKey(),
    },
    meta: { lastWeatherSync: 0, installPromptDismissed: false },
  };
}

let state = defaultState();
const listeners = new Set();

/* --------------------------------- io ---------------------------------- */

function migrate(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  // Deep-ish merge so a new field added in a later version never breaks an old save.
  const merged = {
    ...base, ...raw,
    profile: { ...base.profile, ...(raw.profile || {}) },
    settings: { ...base.settings, ...(raw.settings || {}) },
    meta: { ...base.meta, ...(raw.meta || {}) },
    entries: raw.entries && typeof raw.entries === 'object' ? raw.entries : {},
    weather: raw.weather && typeof raw.weather === 'object' ? raw.weather : {},
    achievements: raw.achievements && typeof raw.achievements === 'object' ? raw.achievements : {},
    relapses: Array.isArray(raw.relapses) ? raw.relapses : [],
  };
  merged.schema = SCHEMA;
  return merged;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = migrate(raw ? JSON.parse(raw) : null);
  } catch (err) {
    console.warn('Could not read saved data, starting fresh.', err);
    state = defaultState();
  }
  return state;
}

let saveTimer = null;
let lastGoodSnapshot = null;

export function save({ immediate = false } = {}) {
  const write = () => {
    try {
      const json = JSON.stringify(state);
      localStorage.setItem(KEY, json);
      lastGoodSnapshot = json;
    } catch (err) {
      // Quota or private-mode failure: keep running in memory, tell the user once.
      console.error('Save failed', err);
      window.dispatchEvent(new CustomEvent('freedays:save-error', { detail: err }));
    }
  };
  if (immediate) { clearTimeout(saveTimer); write(); return; }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(write, 180);
}

/** Ask the browser not to evict our data when storage runs low. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
  } catch { /* not supported — localStorage still survives normal use */ }
  return false;
}

/* ------------------------------- access -------------------------------- */

export const getState = () => state;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function notify() {
  for (const fn of listeners) {
    try { fn(state); } catch (err) { console.error(err); }
  }
}
/** Mutate → persist → re-render. The only sanctioned way to change state. */
export function mutate(fn, { silent = false } = {}) {
  const result = fn(state);
  save();
  if (!silent) notify();
  return result;
}

/* ------------------------------ mutations ------------------------------ */

export function upsertEntry(dateKey, patch) {
  return mutate((s) => {
    const prev = s.entries[dateKey] || {};
    const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
    // Drop keys explicitly set to null so a cleared field doesn't linger.
    for (const [k, v] of Object.entries(next)) if (v === null) delete next[k];
    s.entries[dateKey] = next;
    return next;
  });
}
export function deleteEntry(dateKey) {
  return mutate((s) => { delete s.entries[dateKey]; });
}

export function addRelapse({ dateKey, at, amountSpent = 0, severity = 2, triggers = [], feeling = '', note = '' }) {
  return mutate((s) => {
    const record = {
      id: uid(),
      dateKey,
      at: at || new Date().toISOString(),
      amountSpent: Number(amountSpent) || 0,
      severity,
      triggers,
      feeling,
      note,
    };
    s.relapses.push(record);
    s.relapses.sort((a, b) => (a.at < b.at ? 1 : -1));
    // The streak restarts from the moment of the slip.
    const newStart = new Date(record.at);
    if (newStart.getTime() > new Date(s.streakStartAt).getTime()) {
      s.streakStartAt = newStart.toISOString();
    }
    return record;
  });
}
export function updateRelapse(id, patch) {
  return mutate((s) => {
    const r = s.relapses.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
    return r;
  });
}
export function deleteRelapse(id) {
  return mutate((s) => {
    const idx = s.relapses.findIndex((x) => x.id === id);
    if (idx >= 0) s.relapses.splice(idx, 1);
    // Fall back to the most recent remaining slip, else the original quit date.
    const latest = s.relapses[0];
    s.streakStartAt = latest ? latest.at : new Date(`${s.profile.trackingStart}T00:00:00`).toISOString();
  });
}

export function setSettings(patch) {
  return mutate((s) => { Object.assign(s.settings, patch); });
}
export function setProfile(patch) {
  return mutate((s) => { Object.assign(s.profile, patch); });
}
export function cacheWeather(dateKey, data) {
  return mutate((s) => { s.weather[dateKey] = data; }, { silent: true });
}

/* ------------------------------ backup --------------------------------- */

export function exportJSON() {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString(), app: 'freedays' }, null, 2);
}
export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !parsed.profile) throw new Error('That file is not a Freedays backup.');
  state = migrate(parsed);
  save({ immediate: true });
  notify();
  return state;
}
export function resetAll() {
  state = defaultState();
  save({ immediate: true });
  notify();
}
export function restoreLastSnapshot() {
  if (!lastGoodSnapshot) return false;
  state = migrate(JSON.parse(lastGoodSnapshot));
  notify();
  return true;
}
