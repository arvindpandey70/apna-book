import React from 'react';
import { useAuth } from '../../home/context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { useNavigate, useLocation } from 'react-router-dom';

interface RequireCompanyProps {
  children: React.ReactNode;
}

const RequireCompany: React.FC<RequireCompanyProps> = ({ children }) => {
  const { hasCompany, isLoading: authLoading, isAuthenticated, user } = useAuth();
  const { isLoading: companyLoading } = useCompany();
  const navigate = useNavigate();
  const location = useLocation();

  const isLoading = authLoading || companyLoading;

  React.useEffect(() => {
    if (!isLoading && isAuthenticated) {
      if (!hasCompany) {
        const isAccountant = user?.userType === 'accountant';
        if (isAccountant) {
          navigate('/accountant/dashboard');
          return;
        }
        const isCa = user?.userType === 'ca' || user?.userType === 'new_ca';
        if (isCa) {
          navigate('/app');
          return;
        }
        const isOwner = user?.userType === 'employee';
        if (isOwner) {
          navigate('/app/company');
        } else {
          navigate('/app/no-company');
        }
      }
    }
  }, [isLoading, isAuthenticated, hasCompany, navigate, location.pathname, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  // If user is not authenticated, MainLayout will handle the redirect
  if (!isAuthenticated) {
    return null;
  }

  // If no company, show message
  if (!hasCompany) {
    const isCa = user?.userType === 'ca' || user?.userType === 'new_ca';
    const isAccountant = user?.userType === 'accountant';
    if (isAccountant) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Company Selection Required</h2>
            <p className="text-gray-600 mb-4">Please select an authorized company from the Accountant Dashboard first.</p>
            <button
              onClick={() => navigate('/accountant/dashboard')}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 cursor-pointer"
            >
              Go to Accountant Dashboard
            </button>
          </div>
        </div>
      );
    }

    if (isCa) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Company Selection Required</h2>
            <p className="text-gray-600 mb-4">Please select an assigned company from the CA Dashboard first.</p>
            <button
              onClick={() => navigate('/app')}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700"
            >
              Go to CA Dashboard
            </button>
          </div>
        </div>
      );
    }

    const isOwner = user?.userType === 'employee';
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          {isOwner ? (
            <>
              <h2 className="text-xl font-semibold mb-2">Company Required</h2>
              <p className="text-gray-600 mb-4">Please create a company first to access this feature.</p>
              <button
                onClick={() => navigate('/app/company')}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
              >
                Create Company
              </button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-2 text-red-600">Access Denied</h2>
              <p className="text-gray-600 mb-4">No Company Assigned. Please contact your administrator.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // User is authenticated and has company
  return <>{children}</>;
};

export default RequireCompany;
