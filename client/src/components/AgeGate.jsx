import { useEffect, useRef, useState } from 'react';
import { confirmAge } from '../lib/privacy.js';

/** One-time "13 or older" check on first launch. The answer is stored only on this device. */
export function AgeGate({ onConfirmed, onOpenPrivacy }) {
  const [under, setUnder] = useState(false);
  const headRef = useRef(null);

  useEffect(() => {
    headRef.current?.focus();
  }, [under]);

  return (
    <div className="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
      <div className="glass-panel age-gate-card">
        {under ? (
          <>
            <h1 id="age-gate-title" ref={headRef} tabIndex={-1}>
              Sorry, Lyft isn't for you yet
            </h1>
            <p>Lyft is meant for people aged 13 and over. Ask a parent or guardian about other ways to track your training.</p>
            <button type="button" className="btn btn-ghost" onClick={() => setUnder(false)}>
              Go back
            </button>
          </>
        ) : (
          <>
            <h1 id="age-gate-title" ref={headRef} tabIndex={-1}>
              Welcome to Lyft
            </h1>
            <p>Lyft is meant for people aged 13 and over. Please confirm your age to continue.</p>
            <div className="age-gate-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  confirmAge();
                  onConfirmed();
                }}
              >
                I'm 13 or older
              </button>
              <button type="button" className="btn btn-glass" onClick={() => setUnder(true)}>
                I'm under 13
              </button>
            </div>
            <p className="field-hint">
              Your answer is saved only on this device.{' '}
              <button type="button" className="link-btn" onClick={onOpenPrivacy}>
                Privacy &amp; data
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
