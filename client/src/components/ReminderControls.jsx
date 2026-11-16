import { useState } from 'react';
import { Modal } from './Modal.jsx';
import { disableReminder, enableReminder, sendTestReminder, isReminderEnabled, markReminderAsked, reminderSupport, wasReminderAsked } from '../lib/reminders.js';

const WORKS = ['native', 'desktop', 'push'];

function describe(kind) {
  switch (kind) {
    case 'native':
      return 'Get a notification every day at 9pm (Malta time) to log your workout and food.';
    case 'desktop':
      return 'Get a notification every day at 9pm (Malta time) while Lyft is open or minimised.';
    case 'push':
      return 'Get a notification every day at 9pm (Malta time) to log your workout and food, even when Lyft is closed.';
    case 'needs-install':
      return 'On iPhone and iPad, notifications only work once Lyft is added to your Home Screen. Add it, open it from there and turn reminders on.';
    case 'unconfigured':
      return 'Reminders are not set up for this copy of Lyft yet.';
    default:
      return 'This browser does not support notifications. Try Chrome, Edge, Firefox or Safari.';
  }
}

function useReminderToggle(toast) {
  const [enabled, setEnabled] = useState(isReminderEnabled);
  const [busy, setBusy] = useState(false);

  const turnOn = async () => {
    setBusy(true);
    try {
      await enableReminder();
      setEnabled(true);
      toast?.('Daily reminder on: 9pm');
      return true;
    } catch (err) {
      toast?.(err.message || 'Could not turn on reminders', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    await disableReminder();
    setEnabled(false);
    setBusy(false);
    toast?.('Daily reminder off');
  };

  return { enabled, busy, turnOn, turnOff };
}

/** "Daily reminder" card on the Profile page. */
export function ReminderCard({ toast, onShowInstall }) {
  const kind = reminderSupport();
  const { enabled, busy, turnOn, turnOff } = useReminderToggle(toast);
  if ((kind === 'unsupported' || kind === 'unconfigured') && !enabled) return null;

  return (
    <section className="glass-panel card pf-reminder">
      <div className="card-head">
        <h2>Daily reminder</h2>
        {WORKS.includes(kind) && (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Daily reminder at 9pm"
            className={`switch ${enabled ? 'is-on' : ''}`}
            disabled={busy}
            onClick={enabled ? turnOff : turnOn}
          >
            <span className="switch-knob" aria-hidden />
          </button>
        )}
      </div>
      <p className="pf-data-text">{describe(kind)}</p>
      {enabled && WORKS.includes(kind) && (
        <div className="pf-data-actions">
          <button
            type="button"
            className="btn btn-glass"
            onClick={() =>
              sendTestReminder()
                .then(() => toast?.(kind === 'native' ? 'Test notification in 5 seconds' : 'Test notification sent'))
                .catch((err) => toast?.(err.message || 'Test failed', 'error'))
            }
          >
            Send a test notification
          </button>
        </div>
      )}
      {kind === 'needs-install' && onShowInstall && (
        <div className="pf-data-actions">
          <button type="button" className="btn btn-glass" onClick={onShowInstall}>
            Show me how
          </button>
        </div>
      )}
    </section>
  );
}

/** One-time question on the first open where reminders can work. */
export function shouldAskReminder() {
  return WORKS.includes(reminderSupport()) && !isReminderEnabled() && !wasReminderAsked();
}

export function ReminderPrompt({ open, onClose, toast }) {
  const { busy, turnOn } = useReminderToggle(toast);

  const later = () => {
    markReminderAsked();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={later}
      title="Daily reminder?"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={later} disabled={busy}>
            Not now
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              await turnOn();
              onClose();
            }}
          >
            {busy ? <span className="spinner" aria-hidden /> : null}
            Turn on
          </button>
        </>
      }
    >
      <p className="modal-message">
        Lyft can send you a short notification at 9pm every day to log your workout and food. You can turn it off any time on your
        Profile page.
      </p>
    </Modal>
  );
}
