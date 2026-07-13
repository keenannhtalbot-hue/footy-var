import { useNavigate } from '../lib/navigate';
import { useApp } from '../lib/context';
import type { Mode } from '../state';

const TABS: Array<{ id: Mode; label: string; icon: string }> = [
  { id: 'home',       label: 'Home',     icon: '🏠' },
  { id: 'var',        label: 'VAR',      icon: '📺' },
  { id: 'ball-speed', label: 'Ball',     icon: '⚽' },
  { id: 'kick-speed', label: 'Kick',     icon: '🦵' },
  { id: 'penalty',    label: 'Penalty',  icon: '🥅' }
];

export function BottomNav() {
  const { state } = useApp();
  const go = useNavigate();
  return (
    <nav className="bottom-nav" role="navigation" aria-label="Mode switcher">
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`nav-btn ${state.mode === tab.id ? 'active' : ''}`}
          onClick={() => go(tab.id)}
          aria-label={tab.label}
          aria-current={state.mode === tab.id ? 'page' : undefined}
        >
          <span className="icon" aria-hidden="true">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
