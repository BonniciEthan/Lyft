import { useEffect, useMemo, useRef, useState } from 'react';
import { computeRanks } from '../lib/rankingEngine.js';
import { DISPLAY_NAME_MAX, hasBodyweight, normalizeProfile, setAvatar, setDisplayName } from '../lib/lifterProfileStore.js';
import { calculateCurrentStreak, workoutTotals } from '../lib/profileStats.js';
import { compressAvatar } from '../lib/avatarImage.js';
import { todayKey } from '../lib/dates.js';
import { IS_LOCAL } from '../edition.js';
import { Avatar } from './Avatar.jsx';
import { AttendanceGrid } from './AttendanceGrid.jsx';
import { RankCrest } from './TierCrest.jsx';
import { ReminderCard } from './ReminderControls.jsx';
import { CameraIcon, CheckIcon, ChevronLeft, CloseIcon, EditIcon, FlameIcon } from './Icons.jsx';
import { tierInk } from '../lib/rankFormat.js';
import { MetricReadout } from './ui/MetricReadout.jsx';
import { Segmented } from './Controls.jsx';
import { THEME_OPTIONS, getTheme, setTheme } from '../lib/theme.js';

function NameEditor({ name, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const start = () => {
    setDraft(name);
    setEditing(true);
  };
  const save = () => {
    onSave(draft);
    setEditing(false);
  };
  const cancel = () => setEditing(false);

  if (!editing) {
    return (
      <div className="pf-name-row">
        <h2 className="pf-name">{name}</h2>
        <button type="button" className="icon-btn pf-name-edit" onClick={start} aria-label="Edit display name">
          <EditIcon width={18} height={18} />
        </button>
      </div>
    );
  }

  return (
    <form
      className="pf-name-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        className="glass-input pf-name-input"
        type="text"
        value={draft}
        maxLength={DISPLAY_NAME_MAX}
        autoFocus
        enterKeyHint="done"
        aria-label="Display name"
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && cancel()}
      />
      <button type="submit" className="icon-btn glass-btn pf-name-save" aria-label="Save name">
        <CheckIcon width={18} height={18} />
      </button>
      <button type="button" className="icon-btn glass-btn" onClick={cancel} aria-label="Cancel">
        <CloseIcon width={18} height={18} />
      </button>
    </form>
  );
}

function RankSummary({ state, profile, onGoToRank }) {
  const ready = hasBodyweight(profile);
  const rank = useMemo(() => (ready ? computeRanks(state, profile).overall.rank : null), [state, profile, ready]);

  if (!rank || !rank.ranked) {
    return (
      <button type="button" className="pf-rank is-unranked" onClick={onGoToRank}>
        <RankCrest rank={{ ranked: false }} size={44} />
        <span className="pf-rank-text">
          <span className="pf-rank-label">Unranked</span>
          <span className="pf-rank-sub">{ready ? 'Log a working set to get ranked' : 'Add your bodyweight in Rank'}</span>
        </span>
      </button>
    );
  }
  return (
    <button type="button" className="pf-rank" onClick={onGoToRank} style={{ '--tier': tierInk(rank.tier) }}>
      <RankCrest rank={rank} size={44} />
      <span className="pf-rank-text">
        <span className="pf-rank-label">{rank.label}</span>
        <span className="pf-rank-sub tabular">{rank.score} SR</span>
      </span>
    </button>
  );
}

function Stat({ label, value, unit, icon }) {
  return (
    <MetricReadout
      className="pf-stat"
      label={label}
      value={
        <>
          {icon}
          {value}
        </>
      }
      unit={unit}
      size="lg"
      align="center"
    />
  );
}

const THEME_LABELS = { system: 'System', dark: 'Dark', light: 'Light' };

/** Device-only appearance preference (lib/theme.js); not part of the synced state. */
function AppearanceRow() {
  const [theme, setThemeState] = useState(getTheme);
  return (
    <div className="pf-appearance">
      <span className="pf-appearance-label">Appearance</span>
      <Segmented
        small
        label="Appearance"
        value={theme}
        onChange={(v) => setThemeState(setTheme(v))}
        options={THEME_OPTIONS.map((value) => ({ value, label: THEME_LABELS[value] }))}
      />
    </div>
  );
}

export function ProfilePage({ state, update, toast, onBack, onGoToRank, onOpenBackup, onOpenPrivacy, onOpenSettings, onShowInstall }) {
  const profile = useMemo(() => normalizeProfile(state.profile), [state.profile]);
  const today = todayKey();
  const streak = useMemo(() => calculateCurrentStreak(state.logs, state.split, today, state.rotations), [state.logs, state.split, today, state.rotations]);
  const totals = useMemo(() => workoutTotals(state.logs), [state.logs]);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const changeProfile = (fn) =>
    update((d) => {
      d.profile = fn(normalizeProfile(d.profile));
    });

  const pickPhoto = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const url = await compressAvatar(file);
      changeProfile((p) => setAvatar(p, url));
      toast('Profile photo updated');
    } catch {
      toast('Could not process image', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-page">
      <header className="topbar pf-topbar">
        <div className="topbar-inner pf-topbar-inner">
          <button type="button" className="pf-back" onClick={onBack} aria-label="Back">
            <ChevronLeft width={22} height={22} />
            <span>Back</span>
          </button>
          <h1 className="app-title">Profile</h1>
          <span className="pf-topbar-spacer" aria-hidden />
        </div>
      </header>

      <main className="content pf-content">
        <section className="glass-panel card pf-identity">
          <div className="pf-avatar-wrap">
            <button
              type="button"
              className={`pf-avatar ${busy ? 'is-busy' : ''}`}
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label={profile.avatarDataUrl ? 'Change profile photo' : 'Add profile photo'}
            >
              <Avatar profile={profile} />
              <span className="pf-avatar-badge" aria-hidden>
                {busy ? <span className="spinner" /> : <CameraIcon width={15} height={15} />}
              </span>
            </button>
            {profile.avatarDataUrl && (
              <button type="button" className="pf-link" onClick={() => changeProfile((p) => setAvatar(p, null))}>
                Remove photo
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                pickPhoto(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>

          <NameEditor name={profile.displayName} onSave={(name) => changeProfile((p) => setDisplayName(p, name))} />
          <RankSummary state={state} profile={profile} onGoToRank={onGoToRank} />
        </section>

        <section className="pf-stats" aria-label="Key stats">
          <Stat label="Current streak" value={streak} unit={streak === 1 ? 'day' : 'days'} icon={<FlameIcon width={18} height={18} className="pf-flame" />} />
          <Stat label="Workouts" value={totals.workouts} />
          <Stat label="Total sets" value={totals.sets} />
        </section>

        <section className="glass-panel card pf-attendance">
          <div className="card-head">
            <h2>Gym attendance</h2>
          </div>
          <AttendanceGrid logs={state.logs} split={state.split} rotations={state.rotations} today={today} />
        </section>

        <ReminderCard toast={toast} onShowInstall={onShowInstall} />

        <section className="glass-panel card pf-data">
          <div className="card-head">
            <h2>Data &amp; Backup</h2>
          </div>
          <p className="pf-data-text">
            {IS_LOCAL
              ? 'Everything is stored only on this device. Export a backup file now and then so you can restore it on a new phone.'
              : 'Changes are kept on this device and sent to your server only when you press Save. You can also export everything to a file.'}
          </p>
          <AppearanceRow />
          <div className="pf-data-actions">
            <button type="button" className="btn btn-primary" onClick={onOpenBackup}>
              Import / Export Data
            </button>
            {!IS_LOCAL && (
              <button type="button" className="btn btn-glass" onClick={onOpenSettings}>
                Server settings
              </button>
            )}
            <button type="button" className="btn btn-glass" onClick={onOpenPrivacy}>
              Privacy &amp; data
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
