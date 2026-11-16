import { formatTime } from '../lib/dates.js';
import { ProfileButton } from './Avatar.jsx';

export function TopBar({ lastSynced, hasUnsavedChanges, saving, loading, onSave, onLoad, profile, onOpenProfile }) {
  const busy = saving || loading;
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="sync-pill glass-panel">
          <span className="sync-status">
            {lastSynced ? (
              <>
                <span className="sync-label">Last saved:</span> <span className="tabular">{formatTime(lastSynced)}</span>
              </>
            ) : (
              <span className="sync-none">Not synced</span>
            )}
          </span>
          <button type="button" className="pill-btn" onClick={onLoad} disabled={busy} aria-label="Load from server">
            {loading ? <span className="spinner" aria-hidden /> : 'Load'}
          </button>
          <button
            type="button"
            className={`pill-btn pill-btn-primary ${hasUnsavedChanges ? 'is-dirty' : ''}`}
            onClick={onSave}
            disabled={busy}
            aria-label={hasUnsavedChanges ? 'Save to server (unsaved changes)' : 'Save to server'}
          >
            {hasUnsavedChanges && !saving && <span className="dirty-dot" aria-hidden />}
            {saving ? <span className="spinner" aria-hidden /> : 'Save'}
          </button>
        </div>
        <ProfileButton profile={profile} onClick={onOpenProfile} />
      </div>
    </header>
  );
}
