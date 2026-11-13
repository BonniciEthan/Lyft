import { useEffect, useState } from 'react';
import { Modal } from './Modal.jsx';
import { testConnection } from '../lib/api.js';
import { cleanServerUrl, getServerUrl, isTauri, setServerUrl } from '../lib/storage.js';

export function SettingsModal({ open, onClose, onSaved }) {
  const [url, setUrl] = useState('');
  const [test, setTest] = useState({ state: 'idle' });
  const desktop = isTauri();

  useEffect(() => {
    if (open) {
      setUrl(getServerUrl());
      setTest({ state: 'idle' });
    }
  }, [open]);

  const cleaned = cleanServerUrl(url);
  const invalid = cleaned !== '' && !/^https?:\/\/[^\s/]+/i.test(cleaned);

  const runTest = async () => {
    setTest({ state: 'testing' });
    try {
      const { latency } = await testConnection(cleaned);
      setTest({ state: 'ok', latency });
    } catch (err) {
      setTest({ state: 'error', message: err.message });
    }
  };

  const save = () => {
    setServerUrl(cleaned);
    onSaved?.(cleaned);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={invalid}>
            Save
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Backend Server URL</span>
        <input
          className="glass-input"
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={desktop ? 'http://192.168.1.50:3456' : 'Leave blank to use this server'}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setTest({ state: 'idle' });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !invalid) save();
          }}
        />
        <span className="field-hint">
          {desktop
            ? 'Desktop app: enter your home server LAN or Tailscale address, e.g. http://100.64.0.10:3456.'
            : 'Leave blank when this page is served by your Gym Tracker server. Use a full URL to point at another server.'}
        </span>
        {invalid && <span className="field-error">URL must start with http:// or https://</span>}
      </label>

      <div className="test-row">
        <button type="button" className="btn btn-glass" onClick={runTest} disabled={invalid || test.state === 'testing'}>
          {test.state === 'testing' ? <span className="spinner" aria-hidden /> : null}
          Test Connection
        </button>
        <div className={`test-result test-${test.state}`} aria-live="polite">
          {test.state === 'ok' && (
            <>
              <span className="status-dot ok" aria-hidden /> Connected · <span className="tabular">{test.latency} ms</span>
            </>
          )}
          {test.state === 'error' && (
            <>
              <span className="status-dot err" aria-hidden /> {test.message}
            </>
          )}
          {test.state === 'testing' && 'Pinging /api/health…'}
        </div>
      </div>
    </Modal>
  );
}
