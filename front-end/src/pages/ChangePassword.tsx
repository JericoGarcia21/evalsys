import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import PasswordField from '../components/PasswordField';

const isStrongPassword = (password: string) =>
  password.length >= 8 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9]/.test(password);

const passwordChecks = (password: string) => [
  password.length >= 8,
  /[A-Z]/.test(password),
  /[a-z]/.test(password),
  /\d/.test(password),
  /[^A-Za-z0-9]/.test(password),
];

const getErrorMessage = (error: unknown) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to change password';

const strengthLabel = (passed: number) => {
  if (passed === 0) return 'Enter a new password.';
  if (passed <= 2) return 'Weak password.';
  if (passed <= 4) return 'Almost there.';
  return 'Password is strong.';
};

const strengthColor = (passed: number) => {
  if (passed <= 2) return 'bg-danger';
  if (passed <= 4) return 'bg-warning';
  return 'bg-success';
};

export default function ChangePassword() {
  const { user, loading, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const checks = passwordChecks(newPassword);
  const passedChecks = checks.filter(Boolean).length;
  const progress = (passedChecks / checks.length) * 100;
  const passwordsMatch = Boolean(confirmPassword) && newPassword === confirmPassword;
  const passwordsMismatch = Boolean(confirmPassword) && newPassword !== confirmPassword;
  const canSubmit = isStrongPassword(newPassword) && passwordsMatch && !saving;

  if (loading) return <div className="min-h-screen bg-bg" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to="/dashboard" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!isStrongPassword(newPassword)) {
      setError('Use 8+ characters with uppercase, lowercase, number, and symbol.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await changePassword(newPassword);
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <div className="w-11 h-11 rounded-xl bg-primary text-white flex items-center justify-center font-black text-lg mb-5">
            E
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary mb-2">
            Temporary Password Detected
          </p>
          <h1 className="text-3xl font-black text-dark tracking-tight">Change Your Password</h1>
          <p className="text-text/55 text-sm mt-2 leading-relaxed">
            Create a private password before continuing to EvalSys.
          </p>
        </div>

        <form onSubmit={submit} className="bg-surface border border-muted/50 rounded-xl shadow-lg shadow-dark/5 p-6 space-y-5">
          {error && <div className="evl-alert-error">{error}</div>}

          <div>
            <PasswordField id="new-password" label="New Password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
            <div className="mt-3">
              <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${strengthColor(passedChecks)}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className={`text-[11px] font-bold ${
                  passedChecks === checks.length ? 'text-success' : 'text-text/65'
                }`}>
                  {strengthLabel(passedChecks)}
                </p>
                <p className="text-[11px] font-bold text-text/60">{passedChecks}/5</p>
              </div>
              <p className="text-[11px] text-text/65 mt-1">
                Needs uppercase, lowercase, number, symbol, and 8+ characters.
              </p>
            </div>
          </div>

          <div>
            <PasswordField id="confirm-new-password" label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
            {passwordsMatch && (
              <p className="text-[11px] text-success font-semibold mt-2">Passwords match.</p>
            )}
            {passwordsMismatch && (
              <p className="text-[11px] text-danger font-semibold mt-2">Passwords do not match yet.</p>
            )}
          </div>

          <div className="space-y-3 pt-1">
            <button type="submit" disabled={!canSubmit} className="evl-btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? 'Changing Password...' : 'Change Password'}
            </button>
            <button type="button" onClick={logout} className="evl-btn-secondary w-full">
              Sign Out
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

