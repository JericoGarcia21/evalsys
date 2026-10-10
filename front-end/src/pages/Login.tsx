import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import { notify } from '../utils/notify';
import PasswordField from '../components/PasswordField';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [isWakingUp, setIsWakingUp] = useState(false);

  useEffect(() => {
    const wakeServer = async () => {
      try {
        setIsWakingUp(true);
        await api.get('/health');
      } catch (err) {
        console.error('Server wake up failed', err);
      } finally {
        setIsWakingUp(false);
      }
    };
    wakeServer();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await login(email, password);
      navigate(loggedInUser.mustChangePassword ? '/change-password' : '/dashboard', { replace: true });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response) {
          setError(err.response.data?.message || 'Sign in failed. Please try again.');
        } else if (err.request) {
          setError('Cannot connect to the server. Please make sure the backend is running and try again.');
        } else {
          setError('Unable to send the login request. Please try again.');
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white text-xl font-extrabold mx-auto mb-4">
            E
          </div>
          <h1 className="text-2xl font-extrabold text-text tracking-tight">Welcome back</h1>
          <p className="text-text/70 text-sm mt-1">Sign in to EvalSys</p>
        </div>

        {/* Card */}
        <div className="evl-card p-8">
          {error && (
            <div className="evl-alert-error mb-5 text-center">{error}</div>
          )}
          
          {isWakingUp && !error && (
            <div className="bg-primary/10 text-primary text-[11px] font-bold py-2 px-3 rounded-lg mb-5 text-center flex items-center justify-center gap-2 animate-pulse">
              <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
              Please wait. First login may take 30 seconds or more.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="evl-label" htmlFor="login-email">Email or username</label>
              <input
                id="login-email"
                autoComplete="username"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="evl-input"
                placeholder="username or username@evalsys.com"
              />
            </div>
            <PasswordField
              id="login-password"
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder="Password"
              autoComplete="current-password"
            />
            <div className="flex justify-end mt-2">
              <button 
                type="button" 
                onClick={() => notify('Please contact the System Administrator or your instructor to give you a temporary password.')}
                className="text-xs text-primary font-bold hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="evl-btn-primary w-full py-3 mt-4"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>
        <div className="mt-8 text-center border-t border-muted/20 pt-8">
          <p className="text-text/60 text-[10px] font-bold uppercase tracking-widest mb-1">Developed & Maintained by</p>
          <p className="text-text/65 text-sm font-black tracking-tight">Jerico B. Garcia</p>
        </div>
      </div>
    </div>
  );
}


