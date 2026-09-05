import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import Header from './Header';
import Sidebar from './Sidebar';
import ShortcutsHelp from './ShortcutsHelp';
import HorizontalMenu from './HorizontalMenu';
import { useAuth } from '../../home/context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import ErrorBoundary from './ErrorBoundary';


const MainLayout: React.FC = () => {
  const { theme } = useAppContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const { isAuthenticated, isLoading: authLoading, hasCompany, checkPermission, user } = useAuth();
  const { isLoading: companyLoading } = useCompany();
  const navigate = useNavigate();

  const isLoading = authLoading || companyLoading;

  const location = useLocation();

  useEffect(() => {
    // If auth has finished loading and user is not authenticated, redirect to login
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
      return;
    }

    // If authenticated but no company, handle routing based on role
    if (!isLoading && isAuthenticated && !hasCompany) {
      const isOwner = user?.userType === 'employee' || user?.userType === 'new_ca';
      if (isOwner) {
        if (!location.pathname.startsWith('/app/company')) {
          navigate('/app/company');
          return;
        }
      } else {
        if (!location.pathname.startsWith('/app/no-company')) {
          navigate('/app/no-company');
          return;
        }
      }
    }

    // Role-based route protection
    if (!isLoading && isAuthenticated) {
      const isOwner = user?.userType === 'employee' || user?.userType === 'new_ca';
      
      // Block accountants from owner-only routes
      if (!isOwner) {
        if (location.pathname.startsWith('/app/company') || location.pathname.startsWith('/app/config')) {
          console.warn(`Access denied to ${location.pathname} for non-owner role`);
          if (hasCompany) {
            navigate('/app');
          } else {
            navigate('/app/no-company');
          }
          return;
        }
      }

      const isCa = user?.userType === 'ca' || user?.userType === 'new_ca';
      if (isCa) {
        const caRestrictedPaths = [
          '/app/masters',
          '/app/vouchers',
          '/app/reports',
          '/app/voucher-register',
        ];
        const isCaRestricted = caRestrictedPaths.some(path => location.pathname.startsWith(path));
        if (isCaRestricted) {
          console.warn(`Access denied to ${location.pathname} for CA role`);
          navigate('/app');
          return;
        }
      }

      const restrictedPaths = [
        { path: '/app/gst', moduleId: 'gst' },
        { path: '/app/tds', moduleId: 'tds' },
        { path: '/app/tds-report', moduleId: 'tds' },
        { path: '/app/audit', moduleId: 'audit' },
        { path: '/app/income-tax', moduleId: 'income-tax' },
      ];

      const currentRestricted = restrictedPaths.find(p => location.pathname.startsWith(p.path));
      if (currentRestricted && !checkPermission(currentRestricted.moduleId)) {
        console.warn(`Access denied to ${location.pathname} for current role`);
        navigate('/app');
      }
    }
  }, [isLoading, isAuthenticated, hasCompany, navigate, location, checkPermission, user]);

  // Global subscription UI guard: if subscription / trial expired, only allow dashboard
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;

    const trialDays = user.trialDaysRemaining ?? null;
    const status = user.subscriptionStatus ?? null;

    const isExpired =
      user.isExpired ||
      status === 'expired' ||
      (user.isTrial && trialDays !== null && trialDays < 0);

    // Allow access to dashboard (index) even if expired
    const isAtDashboard = location.pathname === '/app' || location.pathname === '/app/';
    // Allow pricing and payments even when expired to allow renewal
    const isPricingPath = location.pathname.startsWith('/app/pricing') || 
                         location.pathname.startsWith('/app/payments');
    // Allow config pages and company-creation to be viewed even when expired
    const isConfigPath = location.pathname.startsWith('/app/config');
    const isCompanyPath = location.pathname.startsWith('/app/company');

    if (isExpired && !isAtDashboard && !isPricingPath && !isConfigPath && !isCompanyPath) {
      // Show a modal prompting renewal (Removed navigate('/app') to stay on current page)
      setShowSubscriptionModal(true);
    } else if (!isExpired || isAtDashboard || isPricingPath) {
      // Hide modal if we are in a "safe" place or no longer expired
      setShowSubscriptionModal(false);
    }
  }, [isLoading, isAuthenticated, user, location.pathname, navigate]);

  // Close sidebar on mobile when navigating to a new page
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F1 for help
      if (e.key === 'F1') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }

      // Escape to close shortcuts help
      if (e.key === 'Escape' && showShortcuts) {
        setShowShortcuts(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showShortcuts]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  // Removed the unlockedCompanyId check - All companies are now directly accessible with full UI


  return (
    <div className={`min-h-screen flex flex-col ${theme === 'dark' ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <Header toggleSidebar={() => setSidebarOpen(prev => !prev)} />
      {/* <HorizontalMenu /> */}
      <HorizontalMenu sidebarOpen={sidebarOpen} />
      {/* Subscription modal shown when user attempts to access pages after expiry */}
      {showSubscriptionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={() => setShowSubscriptionModal(false)} />
          <div className={`relative rounded-2xl shadow-xl max-w-md w-full p-6 z-10 border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}>
            <h3 className="text-lg font-bold mb-2">Subscription Required</h3>
            <p className={`text-sm mb-5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>Your free trial or subscription has expired. Please renew to continue accessing all features.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSubscriptionModal(false)}
                className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-colors ${theme === 'dark' ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
              >
                Close
              </button>
              <button
                onClick={() => { setShowSubscriptionModal(false); navigate('/app/pricing'); }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm"
              >
                Renew Now
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-1 min-w-0 max-w-full">
        <Sidebar isOpen={sidebarOpen} />
        <main className={`flex-1 min-w-0 max-w-full overflow-x-hidden transition-all duration-300 print:ml-0 print:pt-0 ${sidebarOpen ? 'ml-60' : 'ml-0 md:ml-16'} pt-14 md:pt-24`}>
          <div className="p-4 sm:p-6 pt-2 sm:pt-4 print:p-0 h-full min-w-0 max-w-full">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
      {showShortcuts && <ShortcutsHelp onClose={() => setShowShortcuts(false)} />}
    </div>
  );
};

export default MainLayout;