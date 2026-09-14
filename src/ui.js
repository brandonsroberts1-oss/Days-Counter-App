/* DOM plumbing: icons, bottom sheets, toasts, confirmations. */
import { escapeHtml } from './util.js';

/* ------------------------------- icons ---------------------------------- */
const svg = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}${extra}</svg>`;

export const ICONS = {
  flame: svg('<path d="M12 3c.6 3.2-1.2 4.3-2.4 5.6A6.7 6.7 0 0 0 7.5 13a4.5 4.5 0 0 0 9 0c0-1.6-.7-2.7-1.6-3.7"/><path d="M12 21a4.5 4.5 0 0 1-4.5-4.5"/>'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  book: svg('<path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 3v18M11 8h5M11 12h5"/>'),
  spark: svg('<path d="M4 18l4.5-5.5 3.5 3 7-8.5"/><path d="M19 7h-4M19 7v4"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.1-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4.9z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  check: svg('<path d="M5 13l4.5 4.5L19 7"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  left: svg('<path d="M15 5l-7 7 7 7"/>'),
  right: svg('<path d="M9 5l7 7-7 7"/>'),
  bell: svg('<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10.5 20a2 2 0 0 0 3 0"/>'),
  share: svg('<path d="M12 15V3M8.5 6.5L12 3l3.5 3.5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>'),
  download: svg('<path d="M12 3v12M8.5 11.5L12 15l3.5-3.5"/><path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/>'),
  upload: svg('<path d="M12 15V3M8.5 6.5L12 3l3.5 3.5"/><path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>'),
  pencil: svg('<path d="M4 20l4-1 10-10a2.1 2.1 0 0 0-3-3L5 16z"/>'),
  heart: svg('<path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z"/>'),
  wallet: svg('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16.5 14.5h.01"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  add: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  reset: svg('<path d="M4 12a8 8 0 1 1 2.5 5.8"/><path d="M4 18v-5h5"/>'),
};
export const icon = (name) => ICONS[name] || '';

/* ------------------------------- sheets --------------------------------- */

let sheetCleanup = null;

export function closeSheet() {
  const root = document.getElementById('sheet-root');
  if (!root.firstChild) return;
  root.innerHTML = '';
  document.body.style.overflow = '';
  if (sheetCleanup) { try { sheetCleanup(); } catch {} sheetCleanup = null; }
}

/**
 * Bottom sheet. `body` is an HTML string; `onMount(sheetEl)` wires it up and
 * may return a cleanup function.
 */
export function openSheet({ title, body, onMount, size = 'auto' }) {
  const root = document.getElementById('sheet-root');
  closeSheet();
  root.innerHTML = `
    <div class="sheet-backdrop" data-sheet-dismiss></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || 'Sheet')}"
             ${size === 'tall' ? 'style="height:88dvh"' : ''}>
      <div class="sheet-grab" data-sheet-dismiss></div>
      <header class="sheet-head">
        <h2>${escapeHtml(title || '')}</h2>
        <button class="sheet-close" data-sheet-dismiss aria-label="Close">${icon('x')}</button>
      </header>
      <div class="sheet-body">${body}</div>
    </section>`;
  document.body.style.overflow = 'hidden';

  const sheet = root.querySelector('.sheet');
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-sheet-dismiss]')) closeSheet();
  });
  const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };
  document.addEventListener('keydown', onKey);

  const userCleanup = onMount ? onMount(sheet) : null;
  sheetCleanup = () => {
    document.removeEventListener('keydown', onKey);
    if (typeof userCleanup === 'function') userCleanup();
  };
  // Focus the first meaningful control for keyboard and screen-reader users.
  const first = sheet.querySelector('input, textarea, select, button:not(.sheet-close)');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
  return sheet;
}

export function confirmSheet({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } closeSheet(); };
    openSheet({
      title,
      body: `
        <p style="color:var(--ink-2);font-size:.92rem">${escapeHtml(message)}</p>
        <div class="sheet-actions">
          <div class="btn-row">
            <button class="btn btn-ghost" data-confirm="no">Cancel</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm="yes">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>`,
      onMount(sheet) {
        sheet.querySelector('[data-confirm="yes"]').addEventListener('click', () => done(true));
        sheet.querySelector('[data-confirm="no"]').addEventListener('click', () => done(false));
        return () => { if (!settled) { settled = true; resolve(false); } };
      },
    });
  });
}

/* ------------------------------- toasts --------------------------------- */

export function toast(message, { celebrate = false, ms = 3200 } = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast${celebrate ? ' celebrate' : ''}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s ease, transform .25s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 260);
  }, ms);
}

export function haptic(pattern = 12) {
  try { navigator.vibrate?.(pattern); } catch {}
}
