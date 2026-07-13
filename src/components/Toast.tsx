import { useEffect, useState } from 'react';

interface Toast {
  id: number;
  msg: string;
  kind: 'info' | 'success' | 'warn' | 'error';
}

let toastCounter = 0;
const listeners: Array<(toasts: Toast[]) => void> = [];
let toasts: Toast[] = [];

export function showToast(msg: string, kind: Toast['kind'] = 'info', duration = 3000) {
  const id = ++toastCounter;
  toasts = [...toasts, { id, msg, kind }];
  listeners.forEach(l => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id);
    listeners.forEach(l => l(toasts));
  }, duration);
}

export function Toast() {
  const [list, setList] = useState<Toast[]>(toasts);
  useEffect(() => {
    const l = (next: Toast[]) => setList(next);
    listeners.push(l);
    return () => {
      const i = listeners.indexOf(l);
      if (i >= 0) listeners.splice(i, 1);
    };
  }, []);
  return (
    <div className="toast-host" aria-live="polite">
      {list.map(t => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>
      ))}
    </div>
  );
}
