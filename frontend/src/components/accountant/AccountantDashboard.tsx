import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../home/context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import {
  Building2,
  Users,
  UserCheck,
  UserPlus,
  BookOpen,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileText
} from 'lucide-react';

interface DashboardData {
  accountant: {
    id: number;
    name: string;
    email: string;
    phone: string;
    status: string;
  };
  stats: {
    totalCompanies: number;
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
  };
  companies: any[];
  recentUsers: any[];
}

const AccountantDashboard: React.FC = () => {
  const { updateCompany } = useAuth();
  const { theme } = useAppContext();
  const navigate = useNavigate();
  const isDark = theme === 'dark';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch(`${import.meta.env.VITE_API_URL}/api/accountant/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(resData => {
        if (resData.success) {
          setData(resData);
        } else {
          setError(resData.error || 'Failed to load dashboard data');
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectCompany = (company: any) => {
    updateCompany(String(company.id), company);
    localStorage.setItem("supplier", "employee");
    localStorage.setItem("employee_id", String(company.employee_id || 0));
    navigate('/app');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-slate-400 font-semibold mt-3">Loading Accountant Dashboard...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-800 text-red-600">
        <h3 className="font-bold flex items-center gap-2">
          <AlertCircle size={18} />
          Dashboard Error
        </h3>
        <p className="text-xs mt-1">{error || 'Unable to load dashboard'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome & Quick Action Header */}
      <div className={`p-6 rounded-3xl border shadow-xs transition-colors ${
        isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Accountant Workspace
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                data.accountant.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-700'
              }`}>
                {data.accountant.status}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight">
              Welcome back, {data.accountant.name || 'Accountant'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manage client companies, provision user credentials, and oversee client accounts.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Link
              to="/accountant/companies/create"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all active:scale-95"
            >
              <Building2 size={15} />
              + Create Company
            </Link>
            <Link
              to="/accountant/users/create"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-md shadow-violet-600/20 transition-all active:scale-95"
            >
              <UserPlus size={15} />
              + Create User
            </Link>
            <Link
              to="/accountant/companies"
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                isDark ? 'border-slate-700 hover:bg-slate-700 text-slate-200' : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              View Companies
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Companies */}
        <div className={`p-5 rounded-2xl border ${
          isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-indigo-500 mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Authorized Companies</span>
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60">
              <Building2 size={18} />
            </div>
          </div>
          <div className="text-3xl font-black">{data.stats.totalCompanies}</div>
          <div className="text-[11px] text-slate-400 mt-1">Assigned client accounts</div>
        </div>

        {/* Total Users Created */}
        <div className={`p-5 rounded-2xl border ${
          isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-violet-500 mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Managed Users</span>
            <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-950/60">
              <Users size={18} />
            </div>
          </div>
          <div className="text-3xl font-black">{data.stats.totalUsers}</div>
          <div className="text-[11px] text-slate-400 mt-1">Created under your account</div>
        </div>

        {/* Active Users */}
        <div className={`p-5 rounded-2xl border ${
          isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-emerald-500 mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Users</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60">
              <UserCheck size={18} />
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{data.stats.activeUsers}</div>
          <div className="text-[11px] text-slate-400 mt-1">Permitted login active</div>
        </div>

        {/* Security Isolation */}
        <div className={`p-5 rounded-2xl border ${
          isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-amber-500 mb-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Security Scope</span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60">
              <ShieldCheck size={18} />
            </div>
          </div>
          <div className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 mt-1">
            <CheckCircle2 size={16} className="text-emerald-500" /> Isolated
          </div>
          <div className="text-[11px] text-slate-400 mt-2">Zero cross-accountant access</div>
        </div>
      </div>

      {/* Authorized Companies Section */}
      <div className={`p-6 rounded-3xl border ${
        isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold">Your Authorized Client Companies</h2>
            <p className="text-xs text-slate-400">Companies you can manage users for and access books</p>
          </div>
          <Link
            to="/accountant/companies"
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            View All ({data.companies.length}) <ArrowUpRight size={14} />
          </Link>
        </div>

        {data.companies.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700">
            <Building2 size={36} className="mx-auto text-slate-400 mb-2 opacity-50" />
            <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200 mb-1">No Client Companies Created Yet</h3>
            <p className="text-xs text-slate-400 mb-4">
              Get started by creating your first client company. You can then manage its books and create staff users.
            </p>
            <Link
              to="/accountant/companies/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              <Building2 size={14} /> + Create Client Company Now
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.companies.map((comp) => (
              <div
                key={comp.id}
                className={`p-4 rounded-2xl border flex flex-col justify-between transition-all hover:shadow-md ${
                  isDark ? 'bg-slate-850 border-slate-700 hover:border-slate-600' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="font-bold text-sm truncate" title={comp.name}>{comp.name}</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                      {comp.user_count || 0} User(s)
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400 font-mono mb-4">
                    <div>PAN: {comp.pan_number || '—'}</div>
                    <div>GST: {comp.gst_number || '—'}</div>
                    <div>FY: {comp.financial_year || 'Current'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-200 dark:border-slate-700/60">
                  <button
                    onClick={() => handleSelectCompany(comp)}
                    className="flex-1 px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-xs inline-flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <BookOpen size={13} /> Open Books
                  </button>
                  <Link
                    to={`/accountant/users/create?company_id=${comp.id}`}
                    className="px-3 py-1.5 text-xs font-semibold border rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors inline-flex items-center gap-1"
                  >
                    <UserPlus size={13} /> Add User
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Users Created */}
      <div className={`p-6 rounded-3xl border ${
        isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold">Recently Created Users</h2>
            <p className="text-xs text-slate-400">Normal users created by your accountant account</p>
          </div>
          <Link
            to="/accountant/users"
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            Manage All Users <ArrowUpRight size={14} />
          </Link>
        </div>

        {data.recentUsers.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            You haven't created any users yet. Click "+ Create User" above to add your first client operator.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className={`border-b ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                  <th className="p-3 font-semibold">Username / Email</th>
                  <th className="p-3 font-semibold">Assigned Company</th>
                  <th className="p-3 font-semibold">Phone</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold">Created Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60">
                {data.recentUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-750/30">
                    <td className="p-3">
                      <div className="font-bold">{u.username}</div>
                      <div className="text-[11px] text-slate-400">{u.email}</div>
                    </td>
                    <td className="p-3 font-medium">{u.company_name}</td>
                    <td className="p-3 font-mono">{u.phone || '—'}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        u.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-700'
                      }`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400 font-mono">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountantDashboard;
