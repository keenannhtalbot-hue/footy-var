// Centralized app state — uses useReducer for clarity
// Modes, settings, results all flow through one store

export type Mode = 'home' | 'var' | 'ball-speed' | 'kick-speed' | 'penalty';

export interface SpeedResult {
  kmh: number;
  source: 'line' | 'body';
  ts: number;
  photoDataUrl?: string;
}

export interface GoalResult {
  isGoal: boolean;
  confidence: number;     // 0-1
  ballVisible: boolean;
  ballOverLine: boolean;
  ts: number;
  slowmoVideoUrl?: string;
}

export interface PenaltyResult {
  score: { team: number; opponent: number };
  shots: number;
  lastResult: 'goal' | 'save' | 'miss' | null;
  ballPosition: { x: number; y: number };  // 0-1 normalized
  keeperDive: 'left' | 'center' | 'right' | null;
}

export interface Settings {
  unit: 'kmh' | 'mph';
  // Future: voice, slowmo FPS, etc.
}

export interface AppState {
  mode: Mode;
  history: Array<{ mode: Mode; result: SpeedResult | GoalResult | PenaltyResult; ts: number }>;
  settings: Settings;
  cameraReady: boolean;
  mediapipeReady: boolean;
  cameraError: string | null;
}

export const initialState: AppState = {
  mode: 'home',
  history: [],
  settings: { unit: 'kmh' },
  cameraReady: false,
  mediapipeReady: false,
  cameraError: null
};

export type Action =
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'SET_CAMERA_READY'; ready: boolean }
  | { type: 'SET_MEDIAPIPE_READY'; ready: boolean }
  | { type: 'SET_CAMERA_ERROR'; error: string | null }
  | { type: 'ADD_RESULT'; mode: Mode; result: SpeedResult | GoalResult | PenaltyResult }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  | { type: 'CLEAR_HISTORY' };

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, mode: action.mode };
    case 'SET_CAMERA_READY':
      return { ...state, cameraReady: action.ready };
    case 'SET_MEDIAPIPE_READY':
      return { ...state, mediapipeReady: action.ready };
    case 'SET_CAMERA_ERROR':
      return { ...state, cameraError: action.error };
    case 'ADD_RESULT':
      return {
        ...state,
        history: [{ mode: action.mode, result: action.result, ts: Date.now() }, ...state.history].slice(0, 50)
      };
    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.settings } };
    case 'CLEAR_HISTORY':
      return { ...state, history: [] };
    default:
      return state;
  }
}

// Unit conversion helper
export function formatSpeed(kmh: number, unit: 'kmh' | 'mph' = 'kmh'): string {
  if (unit === 'mph') return `${Math.round(kmh * 0.621371)} mph`;
  return `${Math.round(kmh)} km/h`;
}

// Speed context comparisons
export const speedContext = (kmh: number): { label: string; color: string } => {
  if (kmh >= 130) return { label: '⚡ World-class strike', color: '#ff6b35' };
  if (kmh >= 100) return { label: '🔥 Pro level', color: '#ff9f1c' };
  if (kmh >= 70)  return { label: '💪 Solid amateur', color: '#ffd700' };
  if (kmh >= 40)  return { label: '🏃 Training pace', color: '#06d6a0' };
  return { label: '🌱 Getting started', color: '#a0a0a0' };
};
