import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal.jsx';
import { DownloadIcon, UploadIcon } from './Icons.jsx';
import { BackupError, backupFileName, buildBackup, isEmptySummary, parseBackup, summarizeState } from '../lib/backup.js';
import { getLastBackupAt, readFileText, saveBackupFile, setLastBackupAt } from '../lib/backupFile.js';
import { readCache } from '../lib/openFoodFactsService.js';
import { formatShortDate, todayKey, toKey, daysBetween } from '../lib/dates.js';
import { IS_LOCAL } from '../edition.js';

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function summaryText(s) {
  const parts = [];
  if (s.workoutDays) parts.push(plural(s.workoutDays, 'workout day'));
  if (s.foodDays) parts.push(plural(s.foodDays, 'food day'));
  if (s.customFoods) parts.push(plural(s.customFoods, 'custom food'));
  if (s.savedMeals) parts.push(plural(s.savedMeals, 'saved meal'));
  if (s.bodyweightEntries) parts.push(plural(s.bodyweightEntries, 'bodyweight entry').replace('entrys', 'entries'));
  return parts.length ? parts.join(' · ') : 'No logged data yet';
}

function lastBackupLabel(iso) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never';
  const days = daysBetween(toKey(d), todayKey());
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export function BackupModal({ open, onClose, state, onImport, askConfirm, toast }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastAt, setLastAt] = useState(getLastBackupAt());

  useEffect(() => {
    if (open) {
      setError('');
      setLastAt(getLastBackupAt());
    }
  }, [open]);

  const summary = summarizeState(state);

  const doExport = async () => {
    setBusy(true);
    setError('');
    try {
      const data = buildBackup(state, { appVersion: APP_VERSION, edition: IS_LOCAL ? 'local' : 'server', barcodeCache: readCache() });
      const result = await saveBackupFile(backupFileName(), JSON.stringify(data));
      if (result !== 'cancelled') {
        setLastBackupAt();
        setLastAt(getLastBackupAt());
        toast(result === 'downloaded' ? 'Backup downloaded' : 'Backup ready, choose where to save it');
      }
    } catch (err) {
      setError(`Could not export the backup (${err?.message || 'unknown error'}).`);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (file) => {
    if (!file) return;
    setError('');
    let parsed;
    try {
      parsed = parseBackup(await readFileText(file));
    } catch (err) {
      setError(err instanceof BackupError ? err.message : 'Could not read that file.');
      return;
    }
    onClose();
    const from = parsed.exportedAt ? ` from ${formatShortDate(parsed.exportedAt)}` : '';
    const ok = await askConfirm({
      title: 'Restore this backup?',
      message: `Backup${from}${parsed.appVersion ? ` (Lyft ${parsed.appVersion})` : ''}: ${summaryText(parsed.summary)}.\n\nThis replaces everything currently on this device${
        isEmptySummary(summary) ? '' : ` (${summaryText(summary)})`
      }.`,
      confirmLabel: 'Restore',
      destructive: true,
    });
    if (ok) onImport(parsed);
  };

  return (
    <Modal open={open} onClose={onClose} title="Backup & Restore" size="sheet">
      <div className="backup">
        <p className="backup-intro">
          {IS_LOCAL
            ? 'Your data is stored only on this device. Save a backup now and then so you can restore it if you lose your phone, delete the app or switch devices.'
            : 'Save a copy of all your Lyft data to a file, or restore one.'}
        </p>

        <div className="backup-stats">
          <div className="metric">
            <span className="metric-label">On this device</span>
            <strong className="backup-summary">{summaryText(summary)}</strong>
          </div>
          <div className="metric">
            <span className="metric-label">Last backup</span>
            <strong className={`backup-last ${!lastAt ? 'is-never' : ''}`}>{lastBackupLabel(lastAt)}</strong>
          </div>
        </div>

        <button type="button" className="btn btn-primary backup-btn" onClick={doExport} disabled={busy}>
          {busy ? <span className="spinner" aria-hidden /> : <DownloadIcon width={18} height={18} />}
          Export backup
        </button>
        <p className="field-hint backup-hint">On iPhone, choose “Save to Files”. On Android, pick Drive, Files or email.</p>

        <div className="sheet-sub">Restore</div>
        <button type="button" className="btn btn-glass backup-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          <UploadIcon width={18} height={18} /> Import backup…
        </button>
        <p className="field-hint backup-hint">Replaces everything on this device with the backup’s data.</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            doImport(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {error && <p className="field-error backup-error">{error}</p>}

        {APP_VERSION && (
          <p className="backup-version tabular">
            Lyft {APP_VERSION}
            {IS_LOCAL ? ' · Local edition' : ''}
          </p>
        )}
      </div>
    </Modal>
  );
}
