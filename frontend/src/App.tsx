import { useState, useEffect } from 'react';
import type { User } from './types/auth';
import { getCurrentUser, setCurrentUser } from './utils/storage';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import PanelDashboard from './components/PanelDashboard';
import './App.css';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const currentUser = getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
    }
    setIsLoading(false);
  }, []);

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    setCurrentUser(loggedInUser);
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentUser(null);
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  if (user.role === 'admin') {
    return <AdminDashboard currentUser={user} onLogout={handleLogout} />;
  }

  return <PanelDashboard currentUser={user} onLogout={handleLogout} />;
}

export default App;
