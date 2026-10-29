import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import {
  UserPlus,
  Building2,
  Lock,
  Mail,
  User,
  Phone,
  Briefcase,
  Shield,
  ArrowLeft,
  AlertCircle
} from 'lucide-react';
import Swal from 'sweetalert2';

interface Company {
  id: number;
  name: string;
  pan_number?: string;
}

const AccountantCreateUser: React.FC = () => {
  const { theme } = useAppContext();
  const isDark = theme === 'dark';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    company_id: searchParams.get('company_id') || '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'User',
    phone: '',
    department: ''
  });

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      setLoadingCompanies(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/accountant/companies`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.companies) {
        setCompanies(data.companies);
        if (!formData.company_id && data.companies.length > 0) {
          setFormData(prev => ({ ...prev, company_id: String(data.companies[0].id) }));
        }
      }
    } catch (err) {
      console.error('Failed to load companies:', err);
    } finally {
      setLoadingCompanies(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.company_id) {
      Swal.fire({ icon: 'warning', title: 'Missing Company', text: 'Please select an authorized client company.' });
      return;
    }
    if (!formData.username.trim() || !formData.email.trim() || !formData.password) {
      Swal.fire({ icon: 'warning', title: 'Required Fields', text: 'Username, Email, and Password are required.' });
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      Swal.fire({ icon: 'warning', title: 'Password Mismatch', text: 'Passwords do not match.' });
      return;
    }
    if (formData.password.length < 6) {
      Swal.fire({ icon: 'warning', title: 'Weak Password', text: 'Password must be at least 6 characters long.' });
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/accountant/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          company_id: Number(formData.company_id),
          username: formData.username.trim(),
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
          role: formData.role,
          phone: formData.phone.trim(),
          department: formData.department.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await Swal.fire({
          icon: 'success',
          title: 'User Created',
          text: `Normal user "${formData.username}" successfully created for company "${data.user.company_name}". They can now log in using these credentials.`,
          confirmButtonText: 'View Users'
        });
        navigate('/accountant/users');
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Creation Failed',
          text: data.error || 'Failed to create normal user.'
        });
      }
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Network Error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top back link */}
      <Link
        to="/accountant/users"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={14} /> Back to Managed Users
      </Link>

      <div className={`p-6 sm:p-8 rounded-3xl border shadow-sm ${
        isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            <UserPlus size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Provision Client Normal User</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create login credentials for client staff assigned strictly to an authorized company
            </p>
          </div>
        </div>

        {companies.length === 0 && !loadingCompanies ? (
          <div className="p-6 rounded-2xl border border-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/40 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-xs">
            <h4 className="font-bold flex items-center gap-1.5 mb-1.5 text-sm text-indigo-700 dark:text-indigo-300">
              <AlertCircle size={18} /> No Companies Created Yet
            </h4>
            <p className="mb-4 text-slate-600 dark:text-slate-300 leading-relaxed">
              You haven't created any client companies yet. A company is required so that the normal user can be assigned strictly to that company's books.
            </p>
            <Link
              to="/accountant/companies/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 active:scale-95"
            >
              <Building2 size={15} /> + Create Client Company Now
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 1. Client Company Selection (Enforces business rule) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Client Company <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <select
                  name="company_id"
                  value={formData.company_id}
                  onChange={handleChange}
                  required
                  disabled={loadingCompanies}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs font-semibold outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500/50 ${
                    isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <option value="" disabled>-- Select Authorized Company --</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id.toString()}>
                      {c.name} {c.pan_number ? `(PAN: ${c.pan_number})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                The created user will have isolated access strictly to this company.
              </p>
            </div>

            {/* 2. User Credentials */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Username <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    name="username"
                    required
                    placeholder="e.g. rahul_accounts"
                    value={formData.username}
                    onChange={handleChange}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                      isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="e.g. rahul@company.com"
                    value={formData.email}
                    onChange={handleChange}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                      isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* 3. Password & Confirm */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    name="password"
                    required
                    placeholder="Minimum 6 characters"
                    value={formData.password}
                    onChange={handleChange}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                      isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    name="confirmPassword"
                    required
                    placeholder="Re-enter password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                      isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* 4. Role (Whitelisted Non-Privileged Only) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                User Role / Permission Level
              </label>
              <div className="relative">
                <Shield className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs font-semibold outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500/50 ${
                    isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <option value="User">Standard User (Accounting & Vouchers)</option>
                  <option value="Data Entry">Data Entry Operator (Vouchers creation)</option>
                  <option value="Viewer">Viewer / Auditor (Read-only reports)</option>
                  <option value="Operator">Billing Operator</option>
                </select>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Accountant-created users are standard company users and cannot receive administrative roles.
              </p>
            </div>

            {/* 5. Phone & Department */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Phone (Optional)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    name="phone"
                    placeholder="e.g. 9876543210"
                    value={formData.phone}
                    onChange={handleChange}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                      isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Department (Optional)
                </label>
                <div className="relative">
                  <Briefcase className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    name="department"
                    placeholder="e.g. Accounts / Billing"
                    value={formData.department}
                    onChange={handleChange}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                      isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <Link
                to="/accountant/users"
                className="px-5 py-2.5 rounded-xl border text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitting || companies.length === 0}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/25 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Creating User...' : 'Create Normal User'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default AccountantCreateUser;
