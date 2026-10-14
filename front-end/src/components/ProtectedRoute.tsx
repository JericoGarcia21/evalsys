import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import Layout from './Layout';
import { type ReactNode } from 'react';
import { TableSkeleton } from './LoadingSkeleton';

interface Props {
  children: ReactNode;
  role?: 'admin' | 'panel';
  instructorOnly?: boolean;
  instructorOrPanelOnly?: boolean;
  superadminOnly?: boolean;
}

export default function ProtectedRoute({ children, role, instructorOnly, instructorOrPanelOnly, superadminOnly }: Props) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen bg-bg">
        {/* Sidebar Skeleton mimicking the real Layout sidebar */}
        <aside className="hidden lg:flex w-60 fixed h-screen left-0 bg-dark flex-col shrink-0">
          <div className="h-16 flex items-center px-4 border-b border-white/10 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-primary/20 animate-pulse" />
            <div className="ml-3 w-20 h-4 bg-white/10 rounded animate-pulse" />
          </div>
          <div className="flex-1 px-3 py-6 space-y-4">
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />
            ))}
          </div>
        </aside>
        
        {/* Main Content Skeleton */}
        <main className="flex-1 lg:ml-60">
          <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8 2xl:px-14 space-y-8">
            <div className="space-y-2">
              <div className="h-10 w-48 bg-muted/40 rounded-lg animate-pulse" />
              <div className="h-4 w-72 bg-muted/20 rounded animate-pulse" />
            </div>
            
            {/* Show a mix of skeletons to give a "premium" feel while loading */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="h-32 bg-surface rounded-xl border border-muted/20 animate-pulse" />
              <div className="h-32 bg-surface rounded-xl border border-muted/20 animate-pulse" />
              <div className="h-32 bg-surface rounded-xl border border-muted/20 animate-pulse" />
            </div>

            <TableSkeleton rows={6} cols={5} />
          </div>
        </main>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (role === 'admin' && !['admin', 'superadmin'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  if (role === 'panel' && user.role !== 'panel') return <Navigate to="/dashboard" replace />;
  if (instructorOrPanelOnly && !['admin', 'panel'].includes(user.role)) return <Navigate to="/dashboard" replace />;
  if (instructorOnly && user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  if (superadminOnly && user.role !== 'superadmin') return <Navigate to="/dashboard" replace />;

  return <Layout>{children}</Layout>;
}
