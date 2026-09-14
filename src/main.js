/* App shell: boot, routing between tabs, and the background housekeeping. */
import { load, getState, subscribe, requestPersistence, save } from './store.js';
import { todayKey, escapeHtml, plural } from './util.js';
import { habitLabel, streak } from './model.js';
import { claimNew, messageFor } from './achievements.js';
import * as notify from './notify.js';
import { sync as syncWeather } from './weather.js';
import { applyTheme, initInstall, installState, promptInstall, showManualInstructions } from './install.js';
import { toast, icon, closeSheet } from './ui.js';
import { openCheckIn } from './sheets.js';
import { startSetup } from './views/setup.js';

import * as home from './views/home.js';
import * as calendar from './views/calendar.js';
import * as journal from './views/journal.js';
import * as insights from './views/insights.js';
import * as settings from './views/settings.js';

window.__FREEDAYS_VERSION = '1.0.0';

const VIEWS = { home, calendar, journal, insights, settings };
const ORDER = ['home', 'calendar', 'journal', 'insights', 'settings'];

let currentTab = 'home';
let cleanup = null;
let lastRenderedDay = todayKey();

/* ------------------------------- render --------------------------------- */

function renderTabs() {
  const s = getState();
  document.getElementById('tabbar').innerHTML = `
    <div class="tabbar-inner">
      ${ORDER.map((id) => {
        const v = VIEWS[id];
        const on = id === currentTab;
        return `<button class="tab" data-tab="${id}" ${on ? 'aria-current="page"' : ''}>
          <span class="tab-icon">${icon(v.meta.icon)}</span>
          <span>${escapeHtml(v.meta.label)}</span>
        </button>`;
      }).join('')}
    </div>`;
}

function renderTopbar() {
  const s = getState();
  const v = VIEWS[currentTab];
  const heading = typeof v.title === 'function' ? v.title(s) : v.meta.label;
  const sub = currentTab === 'home' && s.profile.reason
    ? `<div class="topbar-sub">${escapeHtml(s.profile.reason.slice(0, 64))}${s.profile.reason.length > 64 ? '…' : ''}</div>`
    : '';
  document.getElementById('topbar').innerHTML = `
    <div style="min-width:0">
      <h1>${escapeHtml(heading)}</h1>
      ${sub}
    </div>
    <div class="topbar-spacer"></div>
    ${currentTab === 'home' && !installState().isStandalone
      ? `<button class="btn btn-ghost btn-sm" data-act="install">${icon('download')} Install</button>` : ''}`;
}

export function render() {
  const s = getState();
  const view = VIEWS[currentTab];
  const root = document.getElementById('view');
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }

  const ctx = {
    now: Date.now(),
    rerender: render,
    setTab,
  };
  root.innerHTML = view.render(s, ctx);
  cleanup = view.mount?.(root, s, ctx) || null;
  renderTopbar();
  renderTabs();
  lastRenderedDay = todayKey();
}

function setTab(id, { scroll = true } = {}) {
  if (!VIEWS[id]) return;
  currentTab = id;
  closeSheet();
  render();
  if (scroll) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  try { history.replaceState(null, '', `?tab=${id}`); } catch {}
}

/* ---------------------------- housekeeping ------------------------------ */

/**
 * Announce anything newly earned — a toast now, a notification if allowed.
 * A backlog (restoring a backup, say) is summarised rather than fired one by
 * one: ten pop-ups in a row is noise, not a celebration.
 */
async function announceMilestones() {
  const fresh = claimNew();
  if (!fresh.length) return;
  const s = getState();
  const canNotify = s.settings.notifications && notify.permission() === 'granted';

  if (fresh.length > 2) {
    const headline = fresh[fresh.length - 1];
    toast(`🎉 ${fresh.length} new badges — ${headline.emoji} ${headline.name} and more`, { celebrate: true, ms: 5200 });
    if (canNotify) {
      const msg = messageFor(headline, s);
      await notify.show(msg.title, msg.body, { tag: 'freedays-batch' });
    }
  } else {
    for (const badge of fresh) {
      const msg = messageFor(badge, s);
      toast(msg.title, { celebrate: true, ms: 5200 });
      if (canNotify) await notify.show(msg.title, msg.body, { tag: `freedays-${badge.id}` });
    }
  }
  render();
}

async function refreshWeather() {
  const s = getState();
  if (!s.settings.weatherEnabled || !s.settings.location) return;
  try {
    await syncWeather();
    if (currentTab === 'home' || currentTab === 'insights') render();
  } catch (err) {
    console.warn('Weather sync failed', err);
  }
}

/** Once a minute: has the date rolled over, and has anything been earned? */
function startHeartbeat() {
  setInterval(async () => {
    if (todayKey() !== lastRenderedDay) {
      lastRenderedDay = todayKey();
      render();
      refreshWeather();
    }
    await announceMilestones();
  }, 60000);
}

/* -------------------------------- boot ---------------------------------- */

function wireGlobalEvents() {
  document.getElementById('tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) setTab(b.dataset.tab);
  });
  document.getElementById('topbar').addEventListener('click', (e) => {
    if (e.target.closest('[data-act="install"]')) promptInstall();
  });

  // Subtle divider once the page has scrolled.
  const topbar = document.getElementById('topbar');
  window.addEventListener('scroll', () => {
    topbar.classList.toggle('is-scrolled', window.scrollY > 6);
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { save({ immediate: true }); return; }
    if (todayKey() !== lastRenderedDay) render();
    announceMilestones();
    refreshWeather();
  });
  window.addEventListener('pagehide', () => save({ immediate: true }));

  window.addEventListener('freedays:installable', () => {
    if (currentTab === 'home' || currentTab === 'settings') render();
  });
  window.addEventListener('freedays:save-error', () => {
    toast('Could not save to this device — check that storage is not full or blocked.', { ms: 6000 });
  });

  // Keyboard: 1–5 jump between tabs on a desktop browser.
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select') || e.metaKey || e.ctrlKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= ORDER.length) setTab(ORDER[n - 1]);
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Update ready — reopen Freedays to apply it.', { ms: 5000 });
        }
      });
    });
  } catch (err) {
    console.warn('Service worker registration failed', err);
  }
}

function handleLaunchParams() {
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  if (tab && VIEWS[tab]) currentTab = tab;
  if (params.get('action') === 'checkin') {
    setTimeout(() => openCheckIn(todayKey(), { onSaved: render }), 250);
  }
}

async function boot() {
  const s = load();
  applyTheme(s.settings.theme || 'system');
  initInstall();
  wireGlobalEvents();
  registerServiceWorker();
  requestPersistence();

  if (!s.onboarded) {
    startSetup(() => {
      document.getElementById('app').hidden = false;
      render();
      startHeartbeat();
      announceMilestones();
    });
    return;
  }

  handleLaunchParams();
  document.getElementById('app').hidden = false;
  render();
  startHeartbeat();
  announceMilestones();
  refreshWeather();
  if (s.settings.notifications && notify.permission() === 'granted') notify.scheduleReminder();

  subscribe(() => { /* views re-render explicitly; this keeps room for future listeners */ });
}

// Surface errors instead of leaving a blank screen.
window.addEventListener('error', (e) => console.error('Freedays error', e.error || e.message));
boot();
