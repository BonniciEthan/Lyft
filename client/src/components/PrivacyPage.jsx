import { useState } from 'react';
import { Modal } from './Modal.jsx';
import { IS_LOCAL } from '../edition.js';
import { deleteAllLocalData } from '../lib/privacy.js';

// [PLACEHOLDER: contact email] — replace with the address people should write to about
// their data. Until then, questions go to the project's GitHub issues.
export const PRIVACY_CONTACT_URL = 'https://github.com/BonniciEthan/Lyft/issues';
export const PRIVACY_UPDATED = '2026-11-16';

const THIRD_PARTIES = [
  {
    name: 'Open Food Facts',
    when: 'Only when you search for a food or scan a barcode',
    data: 'The search text or barcode number, plus your IP address (as with any web request)',
  },
  {
    name: 'Lyft push server (Cloudflare Workers)',
    when: 'Only on the web app, and only if you turn on the daily reminder',
    data: "Your browser's push address. No name, diary or workout data.",
  },
  {
    name: 'Browser push service (Google, Apple, Mozilla or Microsoft)',
    when: 'Delivers the daily reminder, if turned on',
    data: 'An empty message. The reminder text is added by the app on your device.',
  },
  {
    name: 'GitHub Pages',
    when: 'Hosts the web app at bonniciethan.github.io/Lyft',
    data: 'Standard web server logs (IP address, browser) kept by GitHub',
  },
];

export function PrivacyPage({ open, onClose, askConfirm, toast }) {
  const [busy, setBusy] = useState(false);

  const doDelete = async () => {
    const ok = await askConfirm({
      title: 'Delete all data on this device?',
      message: IS_LOCAL
        ? 'This erases your workouts, food diary, goals and profile from this device and turns off the reminder. It cannot be undone, so export a backup first if you might want it back.'
        : 'This erases your workouts, food diary, goals, profile and server address from this device and turns off the reminder. The copy on your server is not changed. It cannot be undone.',
      confirmLabel: 'Delete everything',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteAllLocalData();
      window.location.reload();
    } catch (err) {
      setBusy(false);
      toast(`Could not delete everything (${err?.message || 'unknown error'})`, 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Privacy & data">
      <div className="privacy">
        <p className="privacy-lead">
          Lyft has no accounts, ads, analytics or tracking. Your data stays on your device
          {IS_LOCAL ? '' : ' and on the server you run yourself'}.
        </p>

        <h3>What Lyft stores</h3>
        <ul>
          <li>Your split, routines, logged sets, goals and food diary</li>
          <li>Your profile: display name, optional photo, sex and bodyweight (used to calculate ranks and calorie targets)</li>
          <li>A cache of foods you looked up, plus small settings such as whether the reminder is on</li>
        </ul>
        <p>
          {IS_LOCAL
            ? 'All of it is kept in this browser or app on this device. Nothing is uploaded.'
            : 'It is kept on this device. When you press Save, it is sent to the Lyft server you set up in Server settings, which keeps one copy. Nothing goes anywhere else.'}{' '}
          The barcode scanner uses your camera only while it is open, and the image never leaves your device.
        </p>

        <h3>Third parties</h3>
        <div className="privacy-table" role="table" aria-label="Third-party services">
          {THIRD_PARTIES.map((t) => (
            <div className="privacy-row" role="row" key={t.name}>
              <strong role="cell">{t.name}</strong>
              <span role="cell">{t.when}</span>
              <span role="cell" className="muted">{t.data}</span>
            </div>
          ))}
        </div>
        <p>Lyft does not sell or share your data, and none of it is used to train AI.</p>

        <h3>How long it's kept</h3>
        <p>
          Until you delete it. The push address is removed when you turn the reminder off, or automatically
          when your browser says it is no longer valid.
        </p>

        <h3>Age</h3>
        <p>Lyft is meant for people aged 13 and over.</p>

        <h3>Your controls</h3>
        <p>
          Export a copy of everything from <em>Import / Export Data</em> on your profile. To erase it, use the
          button below.
        </p>
        <button type="button" className="btn btn-danger privacy-delete" onClick={doDelete} disabled={busy}>
          {busy ? <span className="spinner" aria-hidden /> : null}
          Delete all data on this device
        </button>
        {!IS_LOCAL && (
          <p className="field-hint">
            To remove the server copy too, delete <code>gym.db</code> on your server, or press Save after deleting here
            to overwrite it with the starter data.
          </p>
        )}

        <h3>Questions</h3>
        <p>
          Open an issue on{' '}
          <a href={PRIVACY_CONTACT_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          .
        </p>
        <p className="privacy-updated muted">Last updated {PRIVACY_UPDATED}</p>
      </div>
    </Modal>
  );
}
