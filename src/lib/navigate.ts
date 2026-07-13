import { useCallback } from 'react';
import { useApp } from './context';

// Direct dispatch wrapper - simpler than event-based nav
export function useNavigate() {
  const { dispatch } = useApp();
  return useCallback((mode: string) => {
    dispatch({ type: 'SET_MODE', mode: mode as any });
  }, [dispatch]);
}