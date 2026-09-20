import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as authApi from '../api/auth.js';
import { apiClient } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const generation = useRef(0);
  const refresh = useCallback(async signal => {
    const current = ++generation.current;
    try {
      const result = await authApi.fetchCurrentUser(signal);
      if (current === generation.current && !signal?.aborted) { setUser(result); setStatus('ready'); }
    } catch (error) {
      if (current !== generation.current || signal?.aborted) return;
      if (error.response?.status === 401) { setUser(null); setStatus('ready'); }
      else setStatus('error');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const interceptor = apiClient.interceptors.response.use(response => response, error => {
      if (error.response?.status === 401 && !['/auth/login', '/auth/register', '/auth/me'].includes(error.config?.url)) {
        generation.current++;
        setUser(null); setStatus('ready');
      }
      return Promise.reject(error);
    });
    return () => { controller.abort(); generation.current++; window.removeEventListener('focus', onFocus); apiClient.interceptors.response.eject(interceptor); };
  }, [refresh]);

  const acceptUser = result => { generation.current++; setUser(result); setStatus('ready'); return result; };
  const signIn = async input => acceptUser(await authApi.login(input));
  const signUp = async input => acceptUser(await authApi.register(input));
  const signOut = async () => { await authApi.logout(); acceptUser(null); };

  return <AuthContext.Provider value={{ user, status, refresh, signIn, signUp, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
