import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../home/context/AuthContext';
import {
  Building2,
  Calendar,
  MapPin,
  Phone,
  Mail,
  CreditCard,
  Hash,
  ArrowLeft,
  Briefcase,
  CheckCircle2
} from 'lucide-react';
import Swal from 'sweetalert2';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Chandigarh', 'Puducherry'
];

const AccountantCreateCompany: React.FC = () => {
  const { theme } = useAppContext();
  const { updateCompany } = useAuth();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    financialYear: '2026-27',
    booksBeginningYear: '2026-04-01',
    address: '',
    state: 'Delhi',
    pin: '',
    phoneNumber: '',
    email: '',
    panNumber: '',
    tanNumber: '',
    taxType: 'GST',
    gstNumber: '',
    vatNumber: '',
    companyType: 'Private Limited',
    assesseeName: '',
    backDateAllowed: true
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      Swal.fire({ icon: 'warning', title: 'Required', text: 'Company Name is required.' });
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/accountant/companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Update auth / company context
        if (data.company?.id) {
          updateCompany(String(data.company.id), data.company);
        }

        await Swal.fire({
          icon: 'success',
          title: 'Company Created!',
          text: `"${formData.name.trim()}" has been created and linked to your Accountant account. You can now create users or access company books.`,
          confirmButtonText: 'Go to Companies'
        });

        navigate('/accountant/companies');
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Creation Failed',
          text: data.error || 'Failed to create company.'
        });
      }
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Network Error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top back link */}
      <Link
        to="/accountant/companies"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={14} /> Back to Companies
      </Link>

      <div className={`p-6 sm:p-8 rounded-3xl border shadow-sm ${
        isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
            <Building2 size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Create Client Company</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Set up a new company profile under your Accountant management with full accounting chart of accounts
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Basic Company Information */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-1.5">
              <Building2 size={14} /> Basic Company Profile
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Company / Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="e.g. Skyline Logistics Pvt Ltd"
                  value={formData.name}
                  onChange={handleChange}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Business Entity Type
                </label>
                <div className="relative">
                  <Briefcase className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <select
                    name="companyType"
                    value={formData.companyType}
                    onChange={handleChange}
                    className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-xs outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500/50 ${
                      isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  >
                    <option value="Private Limited">Private Limited Company</option>
                    <option value="Proprietorship">Sole Proprietorship</option>
                    <option value="Partnership">Partnership Firm</option>
                    <option value="LLP">Limited Liability Partnership (LLP)</option>
                    <option value="Public Limited">Public Limited Company</option>
                    <option value="Trust/NGO">Trust / Society / NGO</option>
                    <option value="Individual">Individual</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Assessee / Owner Name (Optional)
                </label>
                <input
                  type="text"
                  name="assesseeName"
                  placeholder="e.g. Ramesh Kumar"
                  value={formData.assesseeName}
                  onChange={handleChange}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Period & Accounting Dates */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-1.5">
              <Calendar size={14} /> Accounting Period
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Financial Year
                </label>
                <input
                  type="text"
                  name="financialYear"
                  value={formData.financialYear}
                  onChange={handleChange}
                  placeholder="e.g. 2026-27"
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Books Beginning Date
                </label>
                <input
                  type="date"
                  name="booksBeginningYear"
                  value={formData.booksBeginningYear}
                  onChange={handleChange}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Statutory & Taxation Details */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-1.5">
              <CreditCard size={14} /> Taxation & Compliance
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  PAN Number
                </label>
                <input
                  type="text"
                  name="panNumber"
                  maxLength={10}
                  placeholder="e.g. ABCDE1234F"
                  value={formData.panNumber}
                  onChange={handleChange}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs font-mono uppercase outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Tax Type
                </label>
                <select
                  name="taxType"
                  value={formData.taxType}
                  onChange={handleChange}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500/50 ${
                    isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <option value="GST">GST Registered</option>
                  <option value="Composite">GST Composition</option>
                  <option value="VAT">VAT / CST</option>
                  <option value="None">Non-GST / Exempt</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  GSTIN / VAT Number
                </label>
                <input
                  type="text"
                  name="gstNumber"
                  maxLength={15}
                  placeholder="e.g. 07AAAAA0000A1Z5"
                  value={formData.gstNumber}
                  onChange={handleChange}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs font-mono uppercase outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Section 4: Contact & Location */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-1.5">
              <MapPin size={14} /> Address & Contact Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Registered Address
                </label>
                <textarea
                  name="address"
                  rows={2}
                  placeholder="Enter complete office address..."
                  value={formData.address}
                  onChange={handleChange}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  State
                </label>
                <select
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500/50 ${
                    isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  {INDIAN_STATES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  PIN Code
                </label>
                <div className="relative">
                  <Hash className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    name="pin"
                    maxLength={6}
                    placeholder="e.g. 110001"
                    value={formData.pin}
                    onChange={handleChange}
                    className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                      isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Phone Number (Optional)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    name="phoneNumber"
                    placeholder="e.g. 9876543210"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                      isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Email Address (Optional)
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    name="email"
                    placeholder="e.g. accounts@skyline.com"
                    value={formData.email}
                    onChange={handleChange}
                    className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                      isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <Link
              to="/accountant/companies"
              className="px-5 py-2.5 rounded-xl border text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/25 transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              <CheckCircle2 size={16} />
              {submitting ? 'Creating Company...' : 'Create Client Company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AccountantCreateCompany;
