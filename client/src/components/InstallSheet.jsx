import { useEffect, useState } from 'react';
import { Modal } from './Modal.jsx';
import { canPromptInstall, iosBrowser, isAndroid, isIOS, isStandalone, isWebBrowser, onInstallPromptChange, promptInstall } from '../lib/platform.js';
import { IS_LOCAL } from '../edition.js';
import { reminderSupport } from '../lib/reminders.js';

const SEEN_KEY = 'lyft_install_hint_seen_v1';

/** First visit from a phone browser tab: show "add to Home Screen" steps once. */
export function shouldShowInstallHint() {
  if (!IS_LOCAL || !isWebBrowser() || isStandalone()) return false;
  if (!isIOS() && !isAndroid()) return false;
  try {
    return localStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

const ShareGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v12" />
    <path d="M8 7l4-4 4 4" />
    <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);

const AddGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

const MenuGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
);

function Step({ n, children }) {
  return (
    <li className="install-step">
      <span className="install-num" aria-hidden>
        {n}
      </span>
      <span className="install-text">{children}</span>
    </li>
  );
}

function IOSSteps() {
  const browser = iosBrowser();
  if (browser === 'in-app') {
    return (
      <p className="modal-message">
        This page is open inside another app. Tap the <b>•••</b> menu and choose <b>Open in Safari</b>. Then follow the steps there to add
        Lyft to your Home Screen.
      </p>
    );
  }
  const where = browser === 'safari' ? 'in the toolbar at the bottom of the screen' : 'next to the address bar';
  return (
    <ol className="install-steps">
      <Step n={1}>
        Tap the <span className="install-chip"><ShareGlyph /> Share</span> button {where}.
      </Step>
      <Step n={2}>
        Scroll down and tap <span className="install-chip"><AddGlyph /> Add to Home Screen</span>. If you don&apos;t see it, tap{' '}
        <b>View More</b> first.
      </Step>
      <Step n={3}>
        Tap <b>Add</b>, then open <b>Lyft</b> from your Home Screen.
      </Step>
    </ol>
  );
}

function AndroidSteps() {
  return (
    <ol className="install-steps">
      <Step n={1}>
        Tap the <span className="install-chip"><MenuGlyph /> menu</span> button at the top right of your browser.
      </Step>
      <Step n={2}>
        Tap <b>Install app</b> or <b>Add to Home screen</b>.
      </Step>
      <Step n={3}>
        Open <b>Lyft</b> from your Home screen.
      </Step>
    </ol>
  );
}

export function InstallSheet({ open, onClose }) {
  const ios = isIOS();
  const [canInstall, setCanInstall] = useState(canPromptInstall);

  useEffect(() => onInstallPromptChange(setCanInstall), []);

  const close = () => {
    markSeen();
    onClose();
  };

  const install = async () => {
    const accepted = await promptInstall();
    if (accepted) close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={ios ? 'Add Lyft to your Home Screen' : 'Install Lyft'}
      size="sm"
      footer={
        !ios && canInstall ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={close}>
              Not now
            </button>
            <button type="button" className="btn btn-primary" onClick={install}>
              Install
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={close}>
            Got it
          </button>
        )
      }
    >
      <p className="install-lead">
        Lyft works best as an app. It opens full screen and works offline
        {['push', 'needs-install'].includes(reminderSupport()) ? ', and can remind you at 9pm to log your day.' : '.'}
      </p>
      {ios ? <IOSSteps /> : canInstall ? <p className="modal-message">Tap <b>Install</b> to add Lyft to your Home screen.</p> : <AndroidSteps />}
      {ios && (
        <p className="install-note">
          Data you enter in the browser stays in the browser, so add Lyft to your Home Screen before you start logging.
        </p>
      )}
    </Modal>
  );
}
