import { useMemo, useRef, useState } from 'react';
import { computeRanks, getMuscleTarget, MUSCLES, rankHistory } from '../lib/rankingEngine.js';
import { formatWeight, fromKg, hasBodyweight, normalizeProfile, parseWeightInput, roundForUnit, setBodyweight, setSex, setUnit } from '../lib/lifterProfileStore.js';
import { formatSet, targetOptions } from '../lib/rankFormat.js';
import { formatShortDate, todayKey } from '../lib/dates.js';
import { Segmented } from './Controls.jsx';
import { ChevronDown } from './Icons.jsx';
import { Modal } from './Modal.jsx';
import { RankCrest } from './TierCrest.jsx';
import { Bodygraph, TierLegend } from './Bodygraph.jsx';
import { StrengthChart } from './StrengthChart.jsx';
import { RankCalculator } from './RankCalculator.jsx';
import { LpBar } from './RankBits.jsx';

const SEX_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];
const UNIT_OPTIONS = [
  { value: 'kg', label: 'KG' },
  { value: 'lbs', label: 'LBS' },
];
const VIEWS = [
  { value: 'bodygraph', label: 'Bodygraph' },
  { value: 'overview', label: 'Overview & Calculator' },
];

/* ------------------------------------------------------------------ */
/* Profile                                                              */
/* ------------------------------------------------------------------ */

function BodyweightInput({ profile, onCommit, autoFocus = false }) {
  const shown = profile.bodyweight ? String(roundForUnit(fromKg(profile.bodyweight, profile.unit), profile.unit)) : '';
  const [draft, setDraft] = useState(shown);
  const [focused, setFocused] = useState(false);
  const value = focused ? draft : shown;
  const commit = () => {
    setFocused(false);
    const kg = parseWeightInput(draft, profile.unit);
    if (kg && Math.abs(kg - (profile.bodyweight || 0)) > 0.01) onCommit(kg);
  };
  return (
    <label className="bw-input">
      <input
        className="glass-input tabular"
        inputMode="decimal"
        enterKeyHint="done"
        autoFocus={autoFocus}
        placeholder={profile.unit === 'lbs' ? '175' : '80'}
        value={value}
        aria-label={`Bodyweight in ${profile.unit}`}
        onFocus={(e) => {
          setDraft(shown);
          setFocused(true);
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => /^\d*([.,]\d{0,2})?$/.test(e.target.value) && setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span className="bw-unit">{profile.unit}</span>
    </label>
  );
}

function ProfileBar({ profile, onChange }) {
  const [open, setOpen] = useState(false);
  const last = profile.bodyweightHistory.at(-1);
  return (
    <div className={`glass-panel profile-bar ${open ? 'is-open' : ''}`}>
      <button type="button" className="profile-summary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="profile-title">Lifter Profile</span>
        <span className="profile-chips tabular">
          <span>{formatWeight(profile.bodyweight, profile.unit)}</span>
          <span>{profile.sex === 'female' ? 'Female' : 'Male'}</span>
          <span>{profile.unit.toUpperCase()}</span>
        </span>
        <ChevronDown width={18} height={18} className="profile-chevron" />
      </button>
      {open && (
        <div className="profile-edit">
          <div className="profile-row">
            <span className="field-label">Bodyweight</span>
            <BodyweightInput profile={profile} onCommit={(kg) => onChange((p) => setBodyweight(p, kg, todayKey()))} />
          </div>
          <div className="profile-row">
            <span className="field-label">Sex</span>
            <Segmented small options={SEX_OPTIONS} value={profile.sex} onChange={(v) => onChange((p) => setSex(p, v))} label="Sex" />
          </div>
          <div className="profile-row">
            <span className="field-label">Unit</span>
            <Segmented small options={UNIT_OPTIONS} value={profile.unit} onChange={(v) => onChange((p) => setUnit(p, v))} label="Unit" />
          </div>
          {last && (
            <p className="field-hint">
              {profile.bodyweightHistory.length} weigh-in{profile.bodyweightHistory.length === 1 ? '' : 's'} · last {formatShortDate(last.date)}. Past
              workouts use the weight logged closest before them.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SetupCard({ profile, onChange }) {
  const [draft, setDraft] = useState('');
  const kg = parseWeightInput(draft, profile.unit);
  const submit = (e) => {
    e.preventDefault();
    if (kg) onChange((p) => setBodyweight(p, kg, todayKey()));
  };
  return (
    <form className="glass-panel card rank-setup" onSubmit={submit}>
      <RankCrest rank={{ ranked: false }} size={72} />
      <h2>Set up your lifter profile</h2>
      <p>Ranks compare your lifts to your bodyweight. Add yours to unlock the Bodygraph and your scores.</p>
      <div className="rank-setup-fields">
        <label className="bw-input">
          <input
            className="glass-input tabular"
            inputMode="decimal"
            autoFocus
            placeholder="Bodyweight"
            value={draft}
            aria-label={`Bodyweight in ${profile.unit}`}
            onChange={(e) => /^\d*([.,]\d{0,2})?$/.test(e.target.value) && setDraft(e.target.value)}
          />
          <span className="bw-unit">{profile.unit}</span>
        </label>
        <Segmented options={SEX_OPTIONS} value={profile.sex} onChange={(v) => onChange((p) => setSex(p, v))} label="Sex" />
        <Segmented options={UNIT_OPTIONS} value={profile.unit} onChange={(v) => onChange((p) => setUnit(p, v))} label="Unit" />
      </div>
      <button type="submit" className="btn btn-primary" disabled={!kg}>
        Unlock Rank
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Muscle detail                                                        */
/* ------------------------------------------------------------------ */

function TargetCallout({ target, unit, prefix }) {
  if (!target) return null;
  const opts = targetOptions(target, target.exercise?.cls, unit);
  if (!opts.length) return null;
  return (
    <div className="target-callout" style={{ '--tier': target.tier?.color }}>
      <div className="target-title">
        To reach <strong>{target.label}</strong> <span className="tabular">({target.minScore})</span>
      </div>
      <div className="target-body">
        {prefix && <span className="target-ex">{prefix}</span>}
        {opts.map((o, i) => (
          <span key={o.kind}>
            {i > 0 && <span className="target-or"> or </span>}
            <span className="tabular target-set">{o.text}</span> <span className="target-delta">({o.delta})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ExerciseRow({ ex, unit, onPick }) {
  return (
    <li>
      <button type="button" className="rank-row" onClick={() => onPick?.(ex)}>
        <RankCrest rank={ex.rank} size={34} />
        <span className="rank-row-main">
          <span className="rank-row-name">{ex.name}</span>
          <span className="rank-row-sub tabular">
            {formatSet(ex.best.weightKg, ex.best.reps, ex.cls, unit)} · e1RM {formatWeight(ex.best.e1rm, unit)}
          </span>
        </span>
        <span className="rank-row-end">
          <span className="rank-row-score tabular">{ex.rank.score}</span>
          <span className="rank-row-label" style={{ color: ex.rank.tier.color }}>
            {ex.rank.label}
          </span>
        </span>
      </button>
    </li>
  );
}

function MuscleSheet({ muscle, profile, onClose, onPickExercise }) {
  const target = useMemo(() => (muscle ? getMuscleTarget(muscle, profile) : null), [muscle, profile]);
  if (!muscle) return <Modal open={false} />;
  const { rank } = muscle;
  return (
    <Modal open onClose={onClose} title={muscle.name} size="sheet">
      <div className="sheet-hero">
        <RankCrest rank={rank} size={76} />
        <div className="sheet-hero-body">
          <span className="rank-label" style={{ color: rank.tier?.color }}>
            {rank.label}
          </span>
          <span className="rank-score tabular">
            {rank.ranked ? rank.score : 0}
            <small> / 1000</small>
          </span>
        </div>
      </div>
      <LpBar rank={rank} />

      {rank.ranked ? (
        <>
          <TargetCallout target={target} unit={profile.unit} prefix={target ? `${target.exercise.name}:` : ''} />
          <h3 className="sheet-sub">Contributing exercises</h3>
          <ul className="rank-list">
            {muscle.exercises.map((ex) => (
              <ExerciseRow key={ex.id} ex={ex} unit={profile.unit} onPick={onPickExercise} />
            ))}
          </ul>
          <p className="field-hint">Tap an exercise to load it into the Rank Calculator.</p>
        </>
      ) : (
        <p className="modal-message sheet-empty">No {muscle.name.toLowerCase()} exercises logged yet. Log a working set to rank this muscle.</p>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Overview                                                             */
/* ------------------------------------------------------------------ */

function HeroBanner({ overall }) {
  const { rank } = overall;
  return (
    <div className="glass-panel card rank-hero" style={{ '--tier': rank.tier?.color || 'var(--text-3)' }}>
      <RankCrest rank={rank} size={112} className="rank-hero-crest" />
      <div className="rank-hero-label">Overall Rank</div>
      <div className="rank-hero-tier" style={{ color: rank.tier?.color }}>
        {rank.label}
      </div>
      <div className="rank-hero-score tabular">
        {rank.ranked ? rank.score : 0}
        <small> / 1000</small>
      </div>
      <LpBar rank={rank} />
      <div className="rank-hero-count tabular">
        {overall.rankedMuscles} / {overall.totalMuscles} muscles ranked
      </div>
    </div>
  );
}

function MuscleBreakdown({ muscles, onOpen }) {
  const sorted = MUSCLES.map((m) => muscles[m.id]).sort((a, b) => b.score - a.score);
  return (
    <ul className="rank-list">
      {sorted.map((m) => (
        <li key={m.id}>
          <button type="button" className="rank-row" onClick={() => onOpen(m.id)}>
            <RankCrest rank={m.rank} size={34} />
            <span className="rank-row-main">
              <span className="rank-row-name">{m.name}</span>
              <span className="rank-row-sub">{m.top ? `Top lift: ${m.top.name}` : 'Unranked'}</span>
              <LpBar rank={m.rank} thin showMeta={false} />
            </span>
            <span className="rank-row-end">
              <span className="rank-row-score tabular">{m.rank.ranked ? m.rank.score : '–'}</span>
              <span className="rank-row-label" style={{ color: m.rank.tier?.color }}>
                {m.rank.label}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Tab                                                                  */
/* ------------------------------------------------------------------ */

export function RankTab({ state, update }) {
  const profile = useMemo(() => normalizeProfile(state.profile), [state.profile]);
  const ready = hasBodyweight(profile);
  const [view, setView] = useState('bodygraph');
  const [openMuscle, setOpenMuscle] = useState(null);
  const [preset, setPreset] = useState(null);
  const calcRef = useRef(null);

  const ranks = useMemo(() => (ready ? computeRanks(state, profile) : null), [state, profile, ready]);
  const history = useMemo(() => (ready ? rankHistory(state, profile) : []), [state, profile, ready]);

  const changeProfile = (fn) => update((d) => void (d.profile = fn(normalizeProfile(d.profile))));

  const pickExercise = (ex) => {
    setOpenMuscle(null);
    setView('overview');
    setPreset({ ...ex, at: Date.now() });
    setTimeout(() => calcRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  };

  return (
    <section className="tab-rank">
      <div className="section-head">
        <h1>Rank</h1>
        {ranks && (
          <span className="rank-head-badge" style={{ color: ranks.overall.rank.tier?.color }}>
            <RankCrest rank={ranks.overall.rank} size={26} />
            {ranks.overall.rank.label}
          </span>
        )}
      </div>

      {!ready ? (
        <SetupCard profile={profile} onChange={changeProfile} />
      ) : (
        <>
          <ProfileBar profile={profile} onChange={changeProfile} />
          <div className="rank-switch">
            <Segmented options={VIEWS} value={view} onChange={setView} label="Rank view" />
          </div>

          {view === 'bodygraph' ? (
            <div className="glass-panel card bodygraph-card">
              <Bodygraph muscles={ranks.muscles} selected={openMuscle} onSelect={setOpenMuscle} />
              <TierLegend />
            </div>
          ) : (
            <>
              <HeroBanner overall={ranks.overall} />
              <div className="glass-panel card">
                <div className="card-head">
                  <h2>Muscle Tiers</h2>
                </div>
                <MuscleBreakdown muscles={ranks.muscles} onOpen={setOpenMuscle} />
              </div>
              <div className="glass-panel card">
                <div className="card-head">
                  <h2>Strength Rating</h2>
                </div>
                <StrengthChart history={history} />
              </div>
              <div className="glass-panel card">
                <div className="card-head">
                  <h2>Rank Calculator</h2>
                  <span className="calc-badge">Preview</span>
                </div>
                <RankCalculator ref={calcRef} state={state} profile={profile} ranks={ranks} preset={preset} />
              </div>
            </>
          )}

          <MuscleSheet
            muscle={openMuscle ? ranks.muscles[openMuscle] : null}
            profile={profile}
            onClose={() => setOpenMuscle(null)}
            onPickExercise={pickExercise}
          />
        </>
      )}
    </section>
  );
}
