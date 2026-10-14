import { useState, useEffect, type ReactNode } from 'react';
import api from '../services/api';
import { requestLogin, type LoginPhase } from '../services/loginConnection';
import { notify } from '../utils/notify';
import { AuthContext, type User } from './auth-context';

const normalizeUser = (user: User): User => ({
  ...user,
  id: user.id || user._id,
} as User);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('token')));

  useEffect(() => {
    const onUnauthorized = () => { setUser(null); setLoading(false); };
    window.addEventListener('evalsys:unauthorized', onUnauthorized);
    return () => window.removeEventListener('evalsys:unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    api.get('/auth/me')
      .then((res) => setUser(normalizeUser(res.data)))
      .catch((err) => {
        // Only clear token if it's actually invalid (401/403)
        // If it's 429 (Rate Limit), keep the token and maybe show an alert
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem('token');
        } else if (err.response?.status === 429) {
          notify('Too many requests. Please wait a moment before refreshing again.', { type: 'error' });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string, onPhase?: (phase: LoginPhase) => void) => {
    const res = await requestLogin(email, password, onPhase);
    const loggedInUser = normalizeUser(res.data.user);
    localStorage.setItem('token', res.data.token);
    setUser(loggedInUser);
    return loggedInUser;
  };

  const changePassword = async (newPassword: string) => {
    await api.patch('/auth/change-password', { newPassword });
    setUser((current) => current ? { ...current, mustChangePassword: false } : current);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, changePassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
