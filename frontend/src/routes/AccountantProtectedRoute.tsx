import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../home/context/AuthContext';

interface AccountantProtectedRouteProps {
  children?: React.ReactNode;
}

const AccountantProtectedRoute: React.FC<AccountantProtectedRouteProps> = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-semibold tracking-wide text-slate-400">Verifying Accountant Access...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const role = user?.userType || localStorage.getItem('userType');
  const isAccountant = role === 'accountant' || role === 'ca' || role === 'new_ca';

  if (!isAccountant) {
    // Normal users or owners trying to access accountant panel are redirected to their main app
    return <Navigate to="/app" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default AccountantProtectedRoute;
