import { useState, useEffect } from 'react';
import type { User } from '../types/auth';
import { authenticateUser, initializeDefaultAdmin } from '../utils/storage';

interface LoginProps {
  onLogin: (user: User) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showInfo, setShowInfo] = useState(true);

  // Initialize default admin on component mount
  useEffect(() => {
    initializeDefaultAdmin();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }

    const user = authenticateUser(username, password);
    if (user) {
      onLogin(user);
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>Automated Rubric System</h1>
          <p>Evaluation Management Platform</p>
        </div>

        {showInfo && (
          <div className="info-box">
            <button className="close-info" onClick={() => setShowInfo(false)}>×</button>
            <h3>Default Login Credentials:</h3>
            <p><strong>Admin:</strong> username: admin / password: admin123</p>
            <p className="info-note">Change password after first login</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="login-btn">
            Login
          </button>
        </form>

        <div className="login-footer">
          <p>Secure evaluation system with role-based access</p>
        </div>
      </div>
    </div>
  );
}
