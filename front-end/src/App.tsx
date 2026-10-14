import PanelChat from './pages/panel/PanelChat';
import { ChatProvider } from './context/ChatProvider';
import Analytics from './pages/admin/Analytics';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sections from './pages/admin/Sections';
import Groups from './pages/admin/Groups';
import Users from './pages/admin/Users';
import Results from './pages/admin/Results';
import AIInsights from './pages/admin/AIInsights';
import Rubrics from './pages/admin/Rubrics';
import AssignPanels from './pages/admin/AssignPanels';
import RegistrationLinks from './pages/admin/RegistrationLinks';
import Subjects from './pages/admin/Subjects';
import Subscription from './pages/admin/Subscription';
import LegacyData from './pages/admin/LegacyData';
import Operations from './pages/admin/Operations';
import SystemControl from './pages/admin/SystemControl';
import SecurityMonitor from './pages/admin/SecurityMonitor';
import Grade from './pages/panel/Grade';
import RegisterGroup from './pages/RegisterGroup';
import Landing from './pages/Landing';
import AppAlert from './components/AppAlert';
import UpdateAvailableNotice from './components/UpdateAvailableNotice';
import InstallAppNotice from './components/InstallAppNotice';
import SystemNotice from './components/SystemNotice';
import ChangePassword from './pages/ChangePassword';
import AccountSecurity from './pages/AccountSecurity';
import ProposalViewer from './pages/ProposalViewer';
import TutorialProvider from './tutorial/TutorialProvider';

// Handles router-aware redirect when the API interceptor fires evalsys:unauthorized.
// Must live inside BrowserRouter so useNavigate is available.
function AuthGuard() {
  const navigate = useNavigate();
  useEffect(() => {
    const handleUnauthorized = () => navigate('/login', { replace: true });
    window.addEventListener('evalsys:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('evalsys:unauthorized', handleUnauthorized);
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <ChatProvider>
      <AppAlert />
      <UpdateAvailableNotice />
      <InstallAppNotice />
      <SystemNotice />
      <BrowserRouter>
        <TutorialProvider>
        <AuthGuard />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/account-security" element={<ProtectedRoute><AccountSecurity /></ProtectedRoute>} />
          <Route path="/proposal/:groupId" element={<ProtectedRoute><ProposalViewer /></ProtectedRoute>} />
          <Route path="/register" element={<RegisterGroup />} />
          <Route path="/register/:token" element={<RegisterGroup />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

          <Route path="/analytics" element={<ProtectedRoute role="admin" superadminOnly><Analytics /></ProtectedRoute>} />

          {/* Admin routes */}
          <Route path="/sections" element={<ProtectedRoute role="admin"><Sections /></ProtectedRoute>} />
          <Route path="/subjects" element={<ProtectedRoute role="admin"><Subjects /></ProtectedRoute>} />
          <Route path="/subscription" element={<ProtectedRoute role="admin"><Subscription /></ProtectedRoute>} />
          <Route path="/operations" element={<ProtectedRoute role="admin" superadminOnly><Operations /></ProtectedRoute>} />
          <Route path="/security" element={<ProtectedRoute role="admin" superadminOnly><SecurityMonitor /></ProtectedRoute>} />
          <Route path="/system-control" element={<ProtectedRoute role="admin" superadminOnly><SystemControl /></ProtectedRoute>} />
          <Route path="/legacy-data" element={<ProtectedRoute role="admin" superadminOnly><LegacyData /></ProtectedRoute>} />
          <Route path="/groups" element={<ProtectedRoute role="admin"><Groups /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute role="admin"><Users /></ProtectedRoute>} />
          <Route path="/assign-panels" element={<ProtectedRoute role="admin"><AssignPanels /></ProtectedRoute>} />
          <Route path="/registration-links" element={<ProtectedRoute role="admin"><RegistrationLinks /></ProtectedRoute>} />
          <Route path="/results" element={<ProtectedRoute role="admin"><Results /></ProtectedRoute>} />
          <Route path="/ai-insights" element={<ProtectedRoute role="admin" instructorOnly><AIInsights /></ProtectedRoute>} />
          <Route path="/rubrics" element={<ProtectedRoute role="admin" instructorOnly><Rubrics /></ProtectedRoute>} />

          <Route path="/chat" element={<ProtectedRoute instructorOrPanelOnly><PanelChat /></ProtectedRoute>} />

          {/* Panel routes */}
          <Route path="/grade" element={<ProtectedRoute role="panel"><Grade /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </TutorialProvider>
      </BrowserRouter>
      </ChatProvider>
    </AuthProvider>
  );
}
