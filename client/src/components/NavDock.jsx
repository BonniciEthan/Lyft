import { FoodIcon, ProgressIcon, RankIcon, SplitIcon } from './Icons.jsx';

export const TABS = [
  { id: 'split', label: 'My Split', Icon: SplitIcon },
  { id: 'progress', label: 'Progress', Icon: ProgressIcon },
  { id: 'food', label: 'Food', Icon: FoodIcon },
  { id: 'rank', label: 'Rank', Icon: RankIcon },
];

export function NavDock({ active, onChange }) {
  const index = Math.max(0, TABS.findIndex((t) => t.id === active));
  return (
    <nav className="nav-dock glass-panel" aria-label="Main">
      <div className="nav-track" style={{ '--nav-index': index, '--nav-count': TABS.length }}>
        <span className="nav-pill" aria-hidden />
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`nav-tab ${active === id ? 'is-active' : ''}`}
            aria-current={active === id ? 'page' : undefined}
            onClick={() => onChange(id)}
          >
            <Icon width={20} height={20} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
