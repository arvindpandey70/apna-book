import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../home/context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import {
  LayoutDashboard,
  Building2,
  Users,
  UserPlus,
  BookOpen,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  ChevronRight,
  Sun,
  Moon,
  Building,
  PlusCircle
} from 'lucide-react';

interface AuthorizedCompany {
  id: number;
  name: string;
  financial_year?: string;
  pan_number?: string;
  gst_number?: string;
}

const AccountantLayout: React.FC = () => {
  const { user, logout, updateCompany } = useAuth();
  const { theme, toggleTheme } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [companies, setCompanies] = useState<AuthorizedCompany[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<string>(() => {
    return localStorage.getItem('company_id') || '';
  });

  const isDark = theme === 'dark';

  // Fetch authorized companies for accountant
  useEffect(() => {
    localStorage.setItem('supplier', 'accountant');
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch(`${import.meta.env.VITE_API_URL}/api/accountant/companies`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.companies) {
          setCompanies(data.companies);
          if (!activeCompanyId && data.companies.length > 0) {
            const firstId = String(data.companies[0].id);
            setActiveCompanyId(firstId);
            updateCompany(firstId, data.companies[0]);
          }
        }
      })
      .catch(err => console.error('Failed to load accountant companies:', err));
  }, []);

  const handleCompanyChange = (companyId: string) => {
    setActiveCompanyId(companyId);
    const selected = companies.find(c => String(c.id) === companyId);
    if (selected) {
      updateCompany(companyId, selected);
      localStorage.setItem("employee_id", String(selected.employee_id || 0));
    }
  };

  const navItems = [
    { label: 'Dashboard', path: '/accountant/dashboard', icon: LayoutDashboard },
    { label: 'Client Companies', path: '/accountant/companies', icon: Building2 },
    { label: 'Create Company', path: '/accountant/companies/create', icon: PlusCircle },
    { label: 'Managed Users', path: '/accountant/users', icon: Users },
    { label: 'Create User', path: '/accountant/users/create', icon: UserPlus },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className={`min-h-screen flex flex-col ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Top Navbar */}
      <header className={`h-16 border-b flex items-center justify-between px-4 sm:px-6 z-30 sticky top-0 backdrop-blur-md ${
        isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white/90 border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <Link to="/accountant/dashboard" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="font-extrabold text-base tracking-tight leading-none bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                ApnaBook
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mt-0.5">
                Accountant Portal
              </div>
            </div>
          </Link>
        </div>

        {/* Center: Active Client Company Selector */}
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
            <Building size={14} className="text-indigo-500" />
            Active Company:
          </span>
          {companies.length > 0 ? (
            <select
              value={activeCompanyId}
              onChange={(e) => handleCompanyChange(e.target.value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl border outline-none cursor-pointer max-w-[220px] truncate ${
                isDark 
                  ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-indigo-500' 
                  : 'bg-slate-100 border-slate-300 text-slate-800 focus:border-indigo-500'
              }`}
            >
              {companies.map(c => (
                <option key={c.id} value={c.id.toString()}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <Link
              to="/accountant/companies/create"
              className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1"
            >
              + Create First Company
            </Link>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Quick link into the company books */}
          {activeCompanyId && (
            <button
              onClick={() => {
                const selected = companies.find(c => String(c.id) === activeCompanyId);
                if (selected) {
                  updateCompany(activeCompanyId, selected);
                }
                localStorage.setItem("supplier", "employee");
                localStorage.setItem("employee_id", String(selected?.employee_id || 0));
                navigate('/app');
              }}
              title="Open full company books in standard app view"
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors cursor-pointer"
            >
              <BookOpen size={14} />
              Open Books
            </button>
          )}

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Accountant Profile */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold truncate max-w-[140px]">{user?.firstName || user?.name || 'Accountant'}</div>
              <div className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]">{user?.email}</div>
            </div>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-2 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex flex-1">
        {/* Mobile Sidebar Backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Left Navigation Sidebar */}
        <aside className={`fixed md:sticky top-16 z-40 w-64 h-[calc(100vh-4rem)] border-r transition-transform duration-200 flex flex-col justify-between p-4 ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          <div className="space-y-1">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Accountant Workspace
            </div>
            {navItems.map((item) => {
              const active = isActive(item.path);
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    active
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                      : isDark
                        ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </div>
                  {active && <ChevronRight size={14} />}
                </Link>
              );
            })}
          </div>

          {/* Bottom Card */}
          <div className={`p-4 rounded-2xl border text-xs ${
            isDark ? 'bg-slate-800/80 border-slate-700/80' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-2 font-bold mb-1 text-indigo-600 dark:text-indigo-400">
              <ShieldCheck size={16} />
              Controlled Access
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              You are authorized to manage users and access accounts for {companies.length} assigned client company(s).
            </p>
          </div>
        </aside>

        {/* Page Content Outlet */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AccountantLayout;
