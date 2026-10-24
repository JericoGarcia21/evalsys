import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import { ensureServerReady, type LoginPhase } from '../services/loginConnection';
import { notify } from '../utils/notify';
import PasswordField from '../components/PasswordField';
import LegalLinks, { CopyrightNotice } from '../components/LegalLinks';
import './Login.css';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginPhase, setLoginPhase] = useState<LoginPhase>('connecting');

  const [isWakingUp, setIsWakingUp] = useState(false);

  useEffect(() => {
    let active = true;
    // Start readiness checking while the user enters their details.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsWakingUp(true);
    void ensureServerReady().catch(() => {
      // Submission reports a connection problem if readiness still fails.
    }).finally(() => { if (active) setIsWakingUp(false); });
    return () => { active = false; };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await login(email, password, setLoginPhase);
      navigate(loggedInUser.mustChangePassword ? '/change-password' : '/dashboard', { replace: true });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response) {
          setError(err.response.data?.message || 'Sign in failed. Please try again.');
        } else if (err.request) {
          setError('The connection was interrupted. Please try again shortly; your sign-in details have been kept.');
        } else {
          setError('Unable to send the login request. Please try again.');
        }
      } else {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <aside className="login-story" aria-label="About EvalSys">
        <Link to="/" className="login-brand" aria-label="EvalSys home"><img src="/app-icon.svg" alt="" width="38" height="38" /><span>EvalSys<small>PROJECT EVALUATION</small></span></Link>
        <div className="login-story-body"><p className="login-eyebrow">FROM RUBRIC TO RESULTS</p><h2>Good evaluations<br />start with<br /><em>a clear process.</em></h2><p>A shared workflow for instructors, student groups, and assigned panels.</p><ol><li><span>01</span> Set your criteria</li><li><span>02</span> Evaluate with feedback</li><li><span>03</span> Review the results</li></ol></div>
        <p className="login-story-footer">Your subject. Your rubric. Your evaluation.</p>
      </aside>
      <div className="login-main">
        <Link className="login-back" to="/"><span aria-hidden="true">←</span> Back to home</Link>
        <main className="login-form-panel">
          <p className="login-eyebrow">THE EVALSYS PORTAL</p>
          <h1>Welcome back.</h1>
          <p className="login-intro">Sign in to your evaluation workspace.</p>
          {error && <div id="login-error" role="alert" className="login-error">{error}</div>}
          {(isWakingUp || (loading && loginPhase !== 'signing-in')) && !error && <div role="status" className="login-status"><span aria-hidden="true" />{loading && loginPhase === 'reconnecting' ? 'Reconnecting automatically. Please keep this page open.' : 'Connecting to the server. It may take a moment to start.'}</div>}
          <form onSubmit={handleSubmit} aria-label="Sign in" aria-busy={loading} aria-describedby={error ? 'login-error' : undefined}>
            <fieldset disabled={loading}>
              <div><label className="evl-label" htmlFor="login-email">Email or username</label><input id="login-email" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} type="text" value={email} onChange={e => setEmail(e.target.value)} required className="evl-input" placeholder="Enter your email or username" /></div>
              <PasswordField id="login-password" label="Password" value={password} onChange={setPassword} placeholder="Enter your password" autoComplete="current-password" />
              <div className="login-forgot"><button type="button" onClick={() => notify('Please contact the System Administrator or your instructor to give you a temporary password.')}>Forgot password?</button></div>
              <button type="submit" disabled={loading} aria-label={loading ? (loginPhase === 'connecting' ? 'Connecting…' : loginPhase === 'reconnecting' ? 'Reconnecting…' : 'Signing in…') : 'Sign in'} className="evl-btn-primary login-submit">{loading ? <span role="status">{loginPhase === 'connecting' ? 'Connecting…' : loginPhase === 'reconnecting' ? 'Reconnecting…' : 'Signing in…'}</span> : <><span>Sign in</span><span aria-hidden="true">↗</span></>}</button>
            </fieldset>
          </form>
          <div className="login-help"><p>Need an instructor account?</p><p>Contact Jerico B. Garcia, the developer. Include your full name, school or institution, department, and subjects.</p><a className="login-contact" href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=garciajerico217%40gmail.com&amp;su=EvalSys%20Instructor%20Account%20Request" target="_blank" rel="noopener noreferrer">garciajerico217@gmail.com</a><p>Panel judges receive an account from their instructor. Students register through their class registration link.</p></div>
        </main>
        <footer className="login-footer"><span>EvalSys · Project Evaluation System</span><CopyrightNotice /><LegalLinks newTab /></footer>
      </div>
    </div>
  );
}
