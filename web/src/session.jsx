import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const SessionCtx = createContext(null);

export function SessionProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, clubs: [], meta: null });

  const refresh = useCallback(async () => {
    const [me, meta] = await Promise.all([api('/auth/me'), state.meta ? Promise.resolve(state.meta) : api('/meta')]);
    setState({ loading: false, user: me.user, clubs: me.clubs, meta });
  }, [state.meta]);

  useEffect(() => { refresh().catch(() => setState(s => ({ ...s, loading: false }))); }, []); // eslint-disable-line

  const logout = async () => { await api('/auth/logout', { method: 'POST' }); await refresh(); };

  return <SessionCtx.Provider value={{ ...state, refresh, logout }}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);

// Small toast system for short confirmations ("Registered").
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const show = useCallback((text, kind = 'ok') => {
    setToast({ text, kind, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-zone" aria-live="polite">
        {toast && <div key={toast.id} className={`toast toast-${toast.kind}`}>{toast.text}</div>}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
