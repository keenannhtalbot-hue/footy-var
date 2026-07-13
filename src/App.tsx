import { useEffect, useReducer } from 'react';
import { appReducer, initialState } from './state';
import { AppContext } from './lib/context';
import { HomeScreen } from './screens/HomeScreen';
import { VARScreen } from './screens/VARScreen';
import { BallSpeedScreen } from './screens/BallSpeedScreen';
import { KickSpeedScreen } from './screens/KickSpeedScreen';
import { PenaltyScreen } from './screens/PenaltyScreen';
import { Toast } from './components/Toast';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { LoadingOverlay } from './components/LoadingOverlay';
import { loadMediaPipe } from './lib/mediapipe';
import './styles/app.css';

export function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const go = (mode: any) => dispatch({ type: 'SET_MODE', mode });

  // Pre-load MediaPipe on first user interaction (heavy ~5MB download)
  useEffect(() => {
    const loadOnInteract = () => {
      loadMediaPipe()
        .then(() => dispatch({ type: 'SET_MEDIAPIPE_READY', ready: true }))
        .catch((err) => {
          console.error('MediaPipe load failed:', err);
        });
      window.removeEventListener('pointerdown', loadOnInteract);
      window.removeEventListener('keydown', loadOnInteract);
    };
    window.addEventListener('pointerdown', loadOnInteract, { once: true, passive: true });
    window.addEventListener('keydown', loadOnInteract, { once: true, passive: true });

    return () => {
      window.removeEventListener('pointerdown', loadOnInteract);
      window.removeEventListener('keydown', loadOnInteract);
    };
  }, []);

  // Listen for navigation events
  useEffect(() => {
    const handler = (e: Event) => go((e as CustomEvent).detail);
    window.addEventListener('footyvar:navigate', handler);
    return () => window.removeEventListener('footyvar:navigate', handler);
  }, []);

  // Prevent screen sleep during active session (keep camera running)
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      if (state.mode !== 'home' && 'wakeLock' in navigator) {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        } catch (e) {
          console.warn('Wake Lock failed:', e);
        }
      }
    };
    requestWakeLock();
    return () => {
      wakeLock?.release().catch(() => {});
    };
  }, [state.mode]);

  const renderScreen = () => {
    switch (state.mode) {
      case 'home':
        return <HomeScreen />;
      case 'var':
        return <VARScreen />;
      case 'ball-speed':
        return <BallSpeedScreen />;
      case 'kick-speed':
        return <KickSpeedScreen />;
      case 'penalty':
        return <PenaltyScreen />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <div className="app">
        <TopBar />
        <main className="screen-area">
          {renderScreen()}
        </main>
        <BottomNav />
        <Toast />
        {!state.mediapipeReady && state.mode !== 'home' && <LoadingOverlay />}
      </div>
    </AppContext.Provider>
  );
}
