import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../home/context/AuthContext';
import { useAppContext } from '../../context/AppContext';
import {
  Building2,
  Search,
  BookOpen,
  UserPlus,
  Users,
  Eye,
  X,
  FileText,
  Calendar,
  AlertCircle
} from 'lucide-react';

interface Company {
  id: number;
  name: string;
  financial_year?: string;
  address?: string;
  pan_number?: string;
  gst_number?: string;
  email?: string;
  phone_number?: string;
  state?: string;
  tax_type?: string;
  user_count?: number;
  voucher_count?: number;
}

const AccountantCompanies: React.FC = () => {
  const { updateCompany } = useAuth();
  const { theme } = useAppContext();
  const navigate = useNavigate();
  const isDark = theme === 'dark';

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOverview, setSelectedOverview] = useState<any | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/accountant/companies`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setCompanies(data.companies || []);
      }
    } catch (err) {
      console.error('Error fetching companies:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenBooks = (company: Company) => {
    updateCompany(String(company.id), company);
    localStorage.setItem("supplier", "employee");
    localStorage.setItem("employee_id", String((company as any).employee_id || 0));
    navigate('/app');
  };

  const handleViewOverview = async (companyId: number) => {
    setLoadingOverview(true);
    setSelectedOverview(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/accountant/companies/${companyId}/overview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSelectedOverview(data);
      }
    } catch (err) {
      console.error('Error fetching company overview:', err);
    } finally {
      setLoadingOverview(false);
    }
  };

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.pan_number && c.pan_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.gst_number && c.gst_number.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Building2 className="text-indigo-600" />
            Client Companies
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            View assigned client companies, manage company users, and access accounting ledgers
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by company, PAN, GST..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-9 pr-4 py-2 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all ${
                isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
              }`}
            />
          </div>
          <Link
            to="/accountant/companies/create"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 transition-all shrink-0 active:scale-95"
          >
            <Building2 size={15} /> + Create Company
          </Link>
        </div>
      </div>

      {/* Companies Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px]">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-400 font-semibold mt-3">Loading companies...</p>
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className={`p-12 text-center rounded-3xl border ${
          isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'
        }`}>
          <Building2 size={36} className="mx-auto text-slate-400 mb-2 opacity-50" />
          <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200">No client companies found</h3>
          <p className="text-xs text-slate-400 mt-1 mb-4">
            You haven't created any client companies yet, or no companies matched your search.
          </p>
          <Link
            to="/accountant/companies/create"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all"
          >
            <Building2 size={15} /> + Create First Client Company
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCompanies.map((c) => (
            <div
              key={c.id}
              className={`p-5 rounded-3xl border flex flex-col justify-between transition-all hover:shadow-lg ${
                isDark ? 'bg-slate-800/90 border-slate-700/80 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-base text-slate-900 dark:text-white leading-tight">
                    {c.name}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0">
                    {c.user_count || 0} User(s)
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mb-3">
                  {c.address || 'Address not specified'}
                </p>

                <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-750 text-xs font-mono mb-4">
                  <div className="flex justify-between">
                    <span className="text-slate-400">PAN:</span>
                    <span className="font-semibold">{c.pan_number || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">GST:</span>
                    <span className="font-semibold">{c.gst_number || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">FY:</span>
                    <span className="font-semibold">{c.financial_year || 'Current'}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <button
                  onClick={() => handleOpenBooks(c)}
                  className="w-full py-2 px-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <BookOpen size={14} /> Open Books Workspace
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleViewOverview(c.id)}
                    className="flex-1 py-1.5 px-2 text-xs font-semibold border rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors inline-flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Eye size={13} /> Stats
                  </button>
                  <Link
                    to={`/accountant/users/create?company_id=${c.id}`}
                    className="flex-1 py-1.5 px-2 text-xs font-semibold border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors inline-flex items-center justify-center gap-1"
                  >
                    <UserPlus size={13} /> Add User
                  </Link>
                  <Link
                    to={`/accountant/users?company_id=${c.id}`}
                    className="py-1.5 px-2.5 text-xs font-semibold border rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors inline-flex items-center justify-center gap-1"
                    title="View Users"
                  >
                    <Users size={13} />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Overview Modal */}
      {(selectedOverview || loadingOverview) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className={`w-full max-w-xl rounded-3xl shadow-2xl border p-6 ${
            isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Building2 className="text-indigo-600" />
                {selectedOverview?.company?.name || 'Company Overview'}
              </h3>
              <button
                onClick={() => setSelectedOverview(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            {loadingOverview ? (
              <div className="py-12 text-center text-xs text-slate-400">Loading overview...</div>
            ) : selectedOverview ? (
              <div className="space-y-4">
                {/* Quick Metrics */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-750 border border-slate-200/60 dark:border-slate-700 text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Total Sales</div>
                    <div className="text-base font-black text-emerald-600 mt-0.5">
                      ₹ {selectedOverview.stats.totalSales.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-750 border border-slate-200/60 dark:border-slate-700 text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Total Purchases</div>
                    <div className="text-base font-black text-indigo-600 mt-0.5">
                      ₹ {selectedOverview.stats.totalPurchases.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-750 border border-slate-200/60 dark:border-slate-700 text-center">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Vouchers</div>
                    <div className="text-base font-black mt-0.5">
                      {selectedOverview.stats.totalVouchers}
                    </div>
                  </div>
                </div>

                {/* Company Users Created by this Accountant */}
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Users Managed by You for This Company ({selectedOverview.users.length})
                  </h4>
                  {selectedOverview.users.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-xs rounded-xl bg-slate-50 dark:bg-slate-750">
                      No users created yet for this company.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {selectedOverview.users.map((u: any) => (
                        <div key={u.id} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold">{u.username}</span>
                            <span className="text-slate-400 ml-2">({u.email})</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            u.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-700'
                          }`}>
                            {u.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      const comp = selectedOverview.company;
                      setSelectedOverview(null);
                      handleOpenBooks(comp);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all"
                  >
                    Open Company Books
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountantCompanies;
