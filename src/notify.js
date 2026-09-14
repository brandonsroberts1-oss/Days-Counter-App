/**
 * Notifications.
 *
 * These are *local* notifications: they fire from the app itself, so they
 * arrive while Freedays is open or when you next open it. True push (a message
 * to a closed phone) needs a server and a push subscription — deliberately out
 * of scope for an app that keeps all of its data on your device.
 */
import { getState, setSettings } from './store.js';

export const supported = () => typeof Notification !== 'undefined';
export const permission = () => (supported() ? Notification.permission : 'unsupported');

export async function requestPermission() {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

async function registration() {
  try { return await navigator.serviceWorker?.ready; } catch { return null; }
}

export async function show(title, body, { tag = 'freedays', data = {} } = {}) {
  if (!supported() || Notification.permission !== 'granted') return false;
  const options = {
    body,
    tag,
    renotify: false,
    badge: './assets/icons/icon-192.png',
    icon: './assets/icons/icon-192.png',
    data: { url: './', ...data },
    vibrate: [70, 40, 70],
  };
  const reg = await registration();
  try {
    if (reg?.showNotification) await reg.showNotification(title, options);
    else new Notification(title, options);
    return true;
  } catch (err) {
    console.warn('Notification failed', err);
    return false;
  }
}

/* ------------------------- daily check-in nudge ------------------------- */

let reminderTimer = null;

export function scheduleReminder() {
  clearTimeout(reminderTimer);
  const s = getState();
  if (!s.settings.notifications || permission() !== 'granted') return;
  const hour = Number(s.settings.reminderHour);
  if (!Number.isFinite(hour)) return;

  const now = new Date();
  const next = new Date();
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next - now;
  // setTimeout caps out around 24.8 days; a day always fits.
  reminderTimer = setTimeout(async () => {
    const st = getState();
    const today = new Date().toISOString().slice(0, 10);
    if (!st.entries[today]) {
      await show('How did today go?', `A quick check-in keeps your ${st.profile.habit || 'habit'} patterns worth reading.`, { tag: 'freedays-daily' });
    }
    scheduleReminder();
  }, delay);
}

export async function enable() {
  const result = await requestPermission();
  const granted = result === 'granted';
  setSettings({ notifications: granted });
  if (granted) scheduleReminder();
  return result;
}
export function disable() {
  clearTimeout(reminderTimer);
  setSettings({ notifications: false });
}
