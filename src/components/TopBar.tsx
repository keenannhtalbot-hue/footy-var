import { useApp } from '../lib/context';
import { useNavigate } from '../lib/navigate';

export function TopBar() {
  const { state } = useApp();
  const go = useNavigate();
  return (
    <header className="top-bar">
      <button
        className="brand"
        onClick={() => go('home')}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}
        aria-label="FootyVAR home"
      >
        <span className="brand-mark" aria-hidden="true">⚽</span>
        <span>FootyVAR</span>
      </button>
      <div className="actions">
        {state.mode !== 'home' && (
          <button
            className="icon-btn"
            onClick={() => go('home')}
            aria-label="Back to home"
            title="Back to home"
          >
            ←
          </button>
        )}
        <button
          className="icon-btn"
          onClick={() => go('history')}
          aria-label="History"
          title="Session history"
        >
          📋
        </button>
      </div>
    </header>
  );
}
