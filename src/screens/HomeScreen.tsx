import { useNavigate } from '../lib/navigate';
import { useApp } from '../lib/context';
import { formatSpeed, speedContext } from '../state';

export function HomeScreen() {
  const { state } = useApp();
  const go = useNavigate();
  const recent = state.history.slice(0, 3);

  return (
    <div className="screen home-screen">
      <div className="home-hero">
        <div className="hero-eyebrow">📺 Sideline referee</div>
        <h1 className="hero-title">FootyVAR</h1>
        <p className="hero-subtitle">Goal-line camera. Kick speed. Penalty tracker.</p>
      </div>

      <div className="mode-grid">
        <button className="mode-card var" onClick={() => go('var')}>
          <div className="mode-icon" aria-hidden="true">📺</div>
          <div className="mode-title">VAR Review</div>
          <div className="mode-desc">Goal-line camera with auto-detection</div>
        </button>

        <button className="mode-card ball" onClick={() => go('ball-speed')}>
          <div className="mode-icon" aria-hidden="true">⚽</div>
          <div className="mode-title">Ball Speed</div>
          <div className="mode-desc">Prop phone perpendicular to kick</div>
        </button>

        <button className="mode-card kick" onClick={() => go('kick-speed')}>
          <div className="mode-icon" aria-hidden="true">🦵</div>
          <div className="mode-title">Kick Speed</div>
          <div className="mode-desc">Face camera at the kicker</div>
        </button>

        <button className="mode-card penalty" onClick={() => go('penalty')}>
          <div className="mode-icon" aria-hidden="true">🥅</div>
          <div className="mode-title">Penalty</div>
          <div className="mode-desc">5 shots + VAR review</div>
        </button>
      </div>

      {recent.length > 0 && (
        <div className="recent">
          <h2 className="label-eyebrow">Recent</h2>
          {recent.map((r, i) => (
            <div key={i} className="recent-item">
              <div className="recent-mode">{r.mode.replace('-', ' ').toUpperCase()}</div>
              <RecentResult result={r.result} unit={state.settings.unit} />
            </div>
          ))}
        </div>
      )}

      <div className="home-footer">
        <span className="text-mute" style={{ fontSize: 12 }}>
          Pro tip: tap a mode to load MediaPipe (~5MB, cached after first use)
        </span>
      </div>
    </div>
  );
}

function RecentResult({ result, unit }: { result: any; unit: 'kmh' | 'mph' }) {
  if ('kmh' in result) {
    const ctx = speedContext(result.kmh);
    return (
      <div className="recent-val" style={{ color: ctx.color }}>
        {formatSpeed(result.kmh, unit)}
        <div className="recent-label">{result.source === 'line' ? 'Ball' : 'Kick'}</div>
      </div>
    );
  }
  if ('isGoal' in result) {
    return (
      <div className="recent-val" style={{ color: result.isGoal ? 'var(--goal-yellow)' : 'var(--var-red)' }}>
        {result.isGoal ? 'GOAL' : 'NO GOAL'}
      </div>
    );
  }
  return null;
}
