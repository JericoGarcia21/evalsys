import { useState, type FormEvent } from 'react';
import api from '../services/api';
import { notify } from '../utils/notify';
import PasswordField from '../components/PasswordField';
import { useAuth } from '../context/useAuth';

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
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update password';

export default function AccountSecurity() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const checks = passwordChecks(newPassword);
  const passedChecks = checks.filter(Boolean).length;
  const progress = (passedChecks / checks.length) * 100;
  const passwordsMatch = Boolean(confirmPassword) && newPassword === confirmPassword;
  const passwordsMismatch = Boolean(confirmPassword) && newPassword !== confirmPassword;
  const canSubmit = Boolean(currentPassword) && isStrongPassword(newPassword) && passwordsMatch && !saving;

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
      const res = await api.patch('/auth/my-password', { currentPassword, newPassword });
      if (res.data.token) localStorage.setItem('token', res.data.token);
      notify(res.data.message || 'Password updated successfully', { type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h2 className="evl-page-title">Account Security</h2>
        <p className="evl-page-subtitle">
          Change the password for {user?.email}. Use a strong password that only you know.
        </p>
      </div>

      <form onSubmit={submit} className="evl-card p-6 space-y-5">
        {error && <div className="evl-alert-error">{error}</div>}

        <PasswordField
          label="Current Password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
        />

        <div>
          <PasswordField
            label="New Password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
          />
          <div className="mt-3">
            <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  passedChecks <= 2 ? 'bg-danger' : passedChecks <= 4 ? 'bg-warning' : 'bg-success'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between gap-3 text-[11px] font-bold">
              <span className={passedChecks === 5 ? 'text-success' : 'text-text/65'}>
                Needs uppercase, lowercase, number, symbol, and 8+ characters.
              </span>
              <span className="text-text/65">{passedChecks}/5</span>
            </div>
          </div>
        </div>

        <div>
          <PasswordField
            label="Confirm New Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
          {passwordsMatch && <p className="text-[11px] text-success font-semibold mt-2">Passwords match.</p>}
          {passwordsMismatch && <p className="text-[11px] text-danger font-semibold mt-2">Passwords do not match yet.</p>}
        </div>

        <button type="submit" disabled={!canSubmit} className="evl-btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed">
          {saving ? 'Updating Password...' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}
