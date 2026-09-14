/* Home-screen install + theme. */
import { openSheet, closeSheet, toast, icon } from './ui.js';

let deferredPrompt = null;

export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new CustomEvent('freedays:installable'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    toast('Installed — open it from your home screen.', { celebrate: true });
  });
}

export function installState() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  return { canPrompt: Boolean(deferredPrompt), isIOS, isStandalone };
}

export async function promptInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') toast('Installing…');
    return outcome;
  }
  showManualInstructions();
  return 'manual';
}

export function showManualInstructions() {
  const { isIOS } = installState();
  openSheet({
    title: 'Add to your home screen',
    body: `
      <p style="font-size:.93rem;color:var(--ink-2)">
        Freedays installs straight from the browser — no app store, no account.
      </p>
      ${isIOS ? `
        <ol style="font-size:.93rem;line-height:1.75;padding-left:20px">
          <li>Tap the <strong>Share</strong> button ${icon('share')} at the bottom of Safari.</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>. Freedays appears with your other apps.</li>
        </ol>
        <p class="field-hint">It has to be Safari — other iOS browsers can't install web apps.</p>
      ` : `
        <ol style="font-size:.93rem;line-height:1.75;padding-left:20px">
          <li>Open the browser menu (⋮ or ⋯).</li>
          <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
          <li>Confirm. Freedays appears with your other apps.</li>
        </ol>
      `}
      <div class="sheet-actions">
        <button class="btn btn-primary btn-block" data-sheet-dismiss>Got it</button>
      </div>`,
  });
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  // Keep the browser chrome in step with the page.
  const dark = theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = dark ? '#16110E' : '#FBF5EE';
  document.head.appendChild(meta);
}
