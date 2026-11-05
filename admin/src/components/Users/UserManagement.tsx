import React, { useEffect, useState } from 'react';
import {
  Search,
  Filter,
  Edit,
  Trash2,
  Ban,
  Play,
  Users,
  MoreVertical,
  X,
  ExternalLink,
  FileText,
  Building2,
  Clock,
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Shield,
  Check,
  ChevronRight
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAdmin } from '../../hooks/useAdmin';
import { format } from 'date-fns';
import api from '../../services/api';
import Swal from 'sweetalert2';

interface User {
  id: string;
  name: string;
  phone: string;
  email: string;
  password?: string;
  status: 'active' | 'suspended' | 'pending';
  lastLogin?: string | null;
  terms_file?: string | null;
  company_count?: number;
  user_count?: number;
  // Free trial fields
  is_free_trial_enabled?: boolean;
  trial_start_date?: string | null;
  trial_expiry_date?: string | null;
  trial_status?: 'active' | 'expired' | 'disabled';
  trial_remaining_days?: number | null;
  trial_granted_by?: number | null;
}

interface Company {
  id: number;
  name: string;
  financial_year?: string;
  pan_number?: string;
  gst_number?: string;
}

const UserManagement: React.FC = () => {
  const { theme } = useTheme();
  const { adminData } = useAdmin();
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [trialFilter, setTrialFilter] = useState<'all' | 'active' | 'expired' | 'disabled'>('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Free Trial Modal States
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [trialUser, setTrialUser] = useState<User | null>(null);
  const [trialEnabled, setTrialEnabled] = useState(false);
  const [trialExpiryDate, setTrialExpiryDate] = useState<string>('');
  const [savingTrial, setSavingTrial] = useState(false);

  // Details Modal States
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [caEmployees, setCaEmployees] = useState<any[]>([]);

  const getFileUrl = (filePath: string | null | undefined) => {
    if (!filePath) return '';
    if (filePath.startsWith('http')) return filePath;
    return `${import.meta.env.VITE_API_URL}${filePath}`;
  };

  const [newUser, setNewUser] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
    status: 'active' as 'active' | 'suspended' | 'pending',
    terms_file: null as File | null,
  });

  // Fetch users (accountants)
  const fetchUsers = async () => {
    try {
      const res = await api.get('/api/adminUser');
      setUsers(res.data);
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'Fetch Failed',
        text: err.response?.data?.error || err.message,
      });
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    const matchesTrial = trialFilter === 'all' || u.trial_status === trialFilter;
    return matchesSearch && matchesStatus && matchesTrial;
  });

  const handleAddUser = async () => {
    if (newUser.password !== newUser.confirmPassword) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Passwords do not match',
      });
      return;
    }

    Swal.fire({
      title: 'Creating Accountant...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const formData = new FormData();
      formData.append('name', newUser.name);
      formData.append('phone', newUser.phone);
      formData.append('email', newUser.email);
      formData.append('password', newUser.password);
      formData.append('status', newUser.status);
      if (newUser.terms_file) {
        formData.append('terms_file', newUser.terms_file);
      }

      const res = await api.post('/api/adminUser', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setUsers((prev) => [res.data, ...prev]);
      resetForm();
      Swal.fire({
        icon: 'success',
        title: 'Accountant Created',
        text: 'The accountant account has been created successfully.',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (err: any) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: 'Operation Failed',
        text: err.response?.data?.error || 'Failed to add accountant',
      });
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    if (newUser.password && newUser.password !== newUser.confirmPassword) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Passwords do not match',
      });
      return;
    }

    Swal.fire({
      title: 'Updating Accountant...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const formData = new FormData();
      formData.append('name', newUser.name);
      formData.append('phone', newUser.phone);
      formData.append('email', newUser.email);
      formData.append('status', newUser.status);
      if (newUser.password) formData.append('password', newUser.password);
      if (newUser.terms_file) {
        formData.append('terms_file', newUser.terms_file);
      }

      const res = await api.put(`/api/adminUser/${editingUser.id}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setUsers((prev) =>
        prev.map((u) => (u.id === editingUser.id ? { ...u, ...res.data } : u))
      );
      resetForm();
      Swal.fire({
        icon: 'success',
        title: 'Accountant Updated',
        text: 'Accountant profile has been updated successfully.',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (err: any) {
      console.error('Update failed:', err);
      Swal.fire({
        icon: 'error',
        title: 'Update Failed',
        text: err.response?.data?.error || err.message,
      });
    }
  };

  const handleDeleteUser = async (id: string) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this accountant deletion!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!'
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/api/adminUser/${id}`);
        setUsers((prev) => prev.filter((u) => u.id !== id));
        Swal.fire(
          'Deleted!',
          'Accountant has been removed from the system.',
          'success'
        );
      } catch (err: any) {
        Swal.fire({
          icon: 'error',
          title: 'Delete Failed',
          text: err.response?.data?.error || err.message,
        });
      }
    }
  };

  const handleStatusChange = async (id: string, status: 'active' | 'suspended') => {
    try {
      await api.patch(`/api/adminUser/${id}/status`, { status });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, status } : u));

      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Accountant status changed to ${status}`,
        showConfirmButton: false,
        timer: 3000
      });
    } catch (err: any) {
      console.error('Status update failed:', err);
      Swal.fire({
        icon: 'error',
        title: 'Status Update Failed',
        text: err.response?.data?.error || err.message,
      });
    }
  };

  // --- FREE TRIAL MANAGEMENT HANDLERS ---
  const handleOpenTrialModal = (user: User) => {
    setTrialUser(user);
    setTrialEnabled(Boolean(user.is_free_trial_enabled));
    if (user.trial_expiry_date) {
      const d = new Date(user.trial_expiry_date);
      setTrialExpiryDate(d.toISOString().split('T')[0]);
    } else {
      // Default to 6 months from now
      const d = new Date();
      d.setMonth(d.getMonth() + 6);
      setTrialExpiryDate(d.toISOString().split('T')[0]);
    }
    setShowTrialModal(true);
  };

  const handleToggleTrial = async (newEnabled: boolean) => {
    // If admin is about to disable an active trial, ask for confirmation
    if (!newEnabled && trialUser?.is_free_trial_enabled) {
      const confirmResult = await Swal.fire({
        title: 'Revoke Free Trial?',
        html: `Are you sure you want to disable the free trial for <strong>${trialUser.name}</strong>?<br/><br/><span style="font-size:0.875rem; color:#6b7280;">The accountant will immediately lose free trial access and will be prompted to subscribe upon login. Existing paid subscriptions will NOT be affected.</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, Revoke Trial',
        cancelButtonText: 'Keep Trial Active'
      });

      if (!confirmResult.isConfirmed) {
        return;
      }
    }
    setTrialEnabled(newEnabled);
  };

  const applyPresetDate = (months: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    setTrialExpiryDate(d.toISOString().split('T')[0]);
    setTrialEnabled(true);
  };

  const handleSaveTrial = async () => {
    if (!trialUser) return;

    try {
      setSavingTrial(true);
      const payload = {
        is_free_trial_enabled: trialEnabled,
        trial_expiry_date: trialEnabled && trialExpiryDate ? new Date(trialExpiryDate + 'T23:59:59').toISOString() : null,
      };

      const res = await api.put(`/api/adminUser/${trialUser.id}/trial`, payload);
      const updatedData = res.data?.data;

      setUsers(prev => prev.map(u => {
        if (u.id === trialUser.id) {
          return {
            ...u,
            is_free_trial_enabled: updatedData.is_free_trial_enabled,
            trial_start_date: updatedData.trial_start_date,
            trial_expiry_date: updatedData.trial_expiry_date,
            trial_status: updatedData.trial_status,
            trial_remaining_days: updatedData.trial_remaining_days,
            trial_granted_by: updatedData.trial_granted_by,
          };
        }
        return u;
      }));

      setShowTrialModal(false);
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: trialEnabled ? 'Free trial updated successfully' : 'Free trial revoked',
        showConfirmButton: false,
        timer: 3000
      });
    } catch (err: any) {
      console.error('Failed to update trial:', err);
      Swal.fire({
        icon: 'error',
        title: 'Trial Update Failed',
        text: err.response?.data?.error || err.message,
      });
    } finally {
      setSavingTrial(false);
    }
  };

  const resetForm = () => {
    setNewUser({
      name: '',
      phone: '',
      email: '',
      password: '',
      confirmPassword: '',
      status: 'active',
      terms_file: null,
    });
    setEditingUser(null);
    setShowAddForm(false);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setNewUser({
      name: user.name,
      phone: user.phone || '',
      email: user.email,
      password: '',
      confirmPassword: '',
      status: user.status,
      terms_file: null,
    });
    setShowAddForm(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
      case 'suspended':
        return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
      default:
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
    }
  };

  const getTrialBadge = (user: User) => {
    const status = user.trial_status || 'disabled';
    if (status === 'active') {
      const days = user.trial_remaining_days;
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
          <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          Active {days !== null && days !== undefined ? `(${days}d left)` : ''}
        </span>
      );
    }
    if (status === 'expired') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
          <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
          Expired
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
        <Clock className="w-3 h-3 text-slate-400" />
        Disabled
      </span>
    );
  };

  // Preview remaining days based on selected trialExpiryDate
  const getPreviewRemainingDays = () => {
    if (!trialExpiryDate) return null;
    const now = new Date();
    const expiry = new Date(trialExpiryDate + 'T23:59:59');
    const diffMs = expiry.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-2xl font-bold`}>Accountant Management</h1>
          <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Manage accountants, free trial access, company permissions, and credentials</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddForm(true);
          }}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primaryDark transition-all active:scale-95 shadow-lg shadow-primary/20"
        >
          + Add New Accountant
        </button>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className={`rounded-xl border p-4 sm:p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} shadow-xl animate-in fade-in slide-in-from-top-4 duration-300`}>
          <h3 className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-lg font-semibold mb-4 flex items-center`}>
            {editingUser ? <Edit className="w-5 h-5 mr-2 text-primary" /> : <Users className="w-5 h-5 mr-2 text-primary" />}
            {editingUser ? 'Edit Accountant Profile' : 'Create New Accountant'}
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {['name', 'phone', 'email', 'password', 'confirmPassword'].map((field) => (
              <div key={field}>
                <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                  {field.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
                  {field === 'password' && editingUser && <span className="text-xs text-gray-400 font-normal ml-2">(Leave blank to keep current)</span>}
                </label>
                <input
                  type={field.includes('password') ? 'password' : field === 'email' ? 'email' : 'text'}
                  value={(newUser as any)[field] || ''}
                  onChange={(e) => setNewUser((prev) => ({ ...prev, [field]: e.target.value }))}
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all ${theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-200 bg-gray-50 text-gray-900'}`}
                  placeholder={`Enter ${field.toLowerCase()}...`}
                />
              </div>
            ))}
            <div>
              <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Account Status</label>
              <select
                value={newUser.status}
                onChange={(e) => setNewUser((prev) => ({ ...prev, status: e.target.value as 'active' | 'suspended' | 'pending' }))}
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all ${theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-200 bg-gray-50 text-gray-900'}`}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Terms & Condition (PDF/JPG)</label>
              <div className="flex gap-4 items-start">
                <div className="flex-1">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setNewUser((prev) => ({ ...prev, terms_file: file }));
                    }}
                    className={`w-full px-4 py-2.5 border rounded-xl file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold ${theme === 'dark' ? 'border-gray-600 bg-gray-700 text-gray-300 file:bg-gray-600 file:text-primary hover:file:bg-gray-500' : 'border-gray-200 bg-gray-50 text-gray-700 file:bg-blue-50 file:text-primary hover:file:bg-blue-100'} transition-all cursor-pointer`}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={resetForm}
              className={`px-5 py-2.5 rounded-xl border font-medium ${theme === 'dark' ? 'border-gray-600 hover:bg-gray-700 text-gray-300' : 'border-gray-200 hover:bg-gray-50 text-gray-700'} transition-all`}
            >
              Cancel
            </button>
            <button
              onClick={editingUser ? handleUpdateUser : handleAddUser}
              className="px-6 py-2.5 bg-primary hover:bg-primaryDark text-white font-medium rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95"
            >
              {editingUser ? 'Save Changes' : 'Create Accountant'}
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className={`p-4 rounded-xl border flex flex-col md:flex-row gap-4 items-center justify-between ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} shadow-sm`}>
        <div className="relative w-full md:w-96">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search accountants by name, email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-primary/50 transition-all text-sm ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
          />
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
          <span className="text-xs text-gray-400 font-medium mr-1">Status:</span>
          {['all', 'active', 'suspended', 'pending'].map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${statusFilter === filter ? 'bg-primary text-white shadow-sm' : theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {filter}
            </button>
          ))}
          <span className="text-xs text-gray-400 font-medium ml-3 mr-1">Trial:</span>
          {(['all', 'active', 'expired', 'disabled'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setTrialFilter(filter)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${trialFilter === filter ? 'bg-indigo-600 text-white shadow-sm' : theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Accountants Table */}
      <div className={`rounded-xl border overflow-hidden shadow-sm ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={`border-b ${theme === 'dark' ? 'bg-gray-700/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              <tr>
                <th className={`px-6 py-4 text-left font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Accountant</th>
                <th className={`px-6 py-4 text-left font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Status</th>
                <th className={`px-6 py-4 text-left font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Free Trial Access</th>
                <th className={`px-6 py-4 text-left font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Companies Assigned</th>
                <th className={`px-6 py-4 text-left font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Users Managed</th>
                <th className={`px-6 py-4 text-left font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Phone</th>
                <th className={`px-6 py-4 text-left font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Last Login</th>
                <th className={`px-6 py-4 text-left font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${theme === 'dark' ? 'divide-gray-700' : 'divide-gray-200'}`}>
              {filteredUsers.length > 0 ? filteredUsers.map((user) => (
                <tr key={user.id} className={`${theme === 'dark' ? 'hover:bg-gray-700/50' : 'hover:bg-blue-50/30'} transition-colors`}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-semibold`}>{user.name}</span>
                      <span className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} text-xs italic`}>{user.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-3 py-1 text-xs font-bold rounded-full ${getStatusBadge(user.status)} shadow-sm`}>
                      {user.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1 items-start">
                      <div className="flex items-center gap-2">
                        {getTrialBadge(user)}
                        <button
                          onClick={() => handleOpenTrialModal(user)}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                          title="Manage Trial Settings"
                        >
                          Manage
                        </button>
                      </div>
                      {user.is_free_trial_enabled && user.trial_expiry_date && (
                        <span className={`text-[11px] ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                          Expires: {format(new Date(user.trial_expiry_date), 'dd MMM yyyy')}
                        </span>
                      )}
                      {!user.is_free_trial_enabled && (
                        <span className="text-[11px] text-gray-400">
                          No trial granted
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {user.company_count || 0} Company(s)
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {user.user_count || 0} User(s)
                    </span>
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                    {user.phone || 'N/A'}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    {user.lastLogin ? format(new Date(user.lastLogin), 'MMM dd, yyyy HH:mm') : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        title="Manage Free Trial Access"
                        onClick={() => handleOpenTrialModal(user)}
                        className="p-2 bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300 rounded-lg hover:bg-indigo-600 hover:text-white transition-all transform hover:scale-105 shadow-sm"
                      >
                        <Clock className="w-4 h-4" />
                      </button>

                      <button
                        title="Edit Accountant"
                        onClick={() => handleEdit(user)}
                        className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all transform hover:scale-105 shadow-sm"
                      >
                        <Edit className="w-4 h-4" />
                      </button>

                      <button
                        title={user.status === 'active' ? 'Suspend Accountant' : 'Activate Accountant'}
                        onClick={() => handleStatusChange(user.id, user.status === 'active' ? 'suspended' : 'active')}
                        className={`p-2 rounded-lg transition-all transform hover:scale-105 shadow-sm ${user.status === 'active'
                          ? 'bg-amber-100 text-amber-600 hover:bg-amber-600 hover:text-white'
                          : 'bg-green-100 text-green-600 hover:bg-green-600 hover:text-white'
                          }`}
                      >
                        {user.status === 'active' ? <Ban className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>

                      <button
                        title="Delete Accountant"
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all transform hover:scale-105 shadow-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    No accountants found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- FREE TRIAL MANAGEMENT MODAL --- */}
      {showTrialModal && trialUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden transition-all transform scale-100 ${
              theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'
            }`}
          >
            {/* Modal Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${theme === 'dark' ? 'border-gray-700 bg-gray-800/80' : 'border-gray-100 bg-slate-50'}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">Manage Free Trial</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Accountant: <span className="font-semibold text-gray-700 dark:text-gray-300">{trialUser.name}</span> ({trialUser.email})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTrialModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Current Status Overview Card */}
              <div className={`p-4 rounded-xl border ${theme === 'dark' ? 'bg-gray-900/60 border-gray-700' : 'bg-slate-50 border-slate-200'}`}>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-gray-400 block mb-1">Free Trial Status</span>
                    {getTrialBadge(trialUser)}
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-1">Remaining Trial Days</span>
                    <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                      {trialUser.trial_status === 'active'
                        ? trialUser.trial_remaining_days !== null
                          ? `${trialUser.trial_remaining_days} Days Left`
                          : 'Unlimited (No Expiry)'
                        : trialUser.trial_status === 'expired'
                        ? '0 Days (Expired)'
                        : '0 Days (Disabled)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-1">Trial Start Date</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {trialUser.trial_start_date
                        ? format(new Date(trialUser.trial_start_date), 'dd MMM yyyy')
                        : 'Not started'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-1">Current Expiry Date</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {trialUser.trial_expiry_date
                        ? format(new Date(trialUser.trial_expiry_date), 'dd MMM yyyy')
                        : 'No expiry set'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Option A: Enable / Disable Toggle Switch */}
              <div className={`p-4 rounded-xl border flex items-center justify-between transition-colors ${
                trialEnabled
                  ? theme === 'dark' ? 'bg-emerald-950/20 border-emerald-800/60' : 'bg-emerald-50/70 border-emerald-200'
                  : theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              }`}>
                <div>
                  <label htmlFor="enableTrialToggle" className="font-semibold text-sm cursor-pointer flex items-center gap-2">
                    Enable Free Trial
                    {trialEnabled && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                        ACTIVE
                      </span>
                    )}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {trialEnabled
                      ? 'Accountant has free access to the panel without payment.'
                      : 'Free trial access is revoked. Accountant will be required to subscribe.'}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="enableTrialToggle"
                    type="checkbox"
                    checked={trialEnabled}
                    onChange={(e) => handleToggleTrial(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-hidden rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Option B: Custom Trial Expiry Date Picker */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    Custom Trial Expiry Date
                  </label>
                  {trialEnabled && trialExpiryDate && (
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                      {getPreviewRemainingDays() !== null && (getPreviewRemainingDays()! > 0
                        ? `≈ ${getPreviewRemainingDays()} days of access`
                        : 'Selected date has already passed')}
                    </span>
                  )}
                </div>

                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={trialExpiryDate}
                  onChange={(e) => {
                    setTrialExpiryDate(e.target.value);
                    if (!trialEnabled && e.target.value) {
                      setTrialEnabled(true);
                    }
                  }}
                  className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm ${
                    theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-200 bg-gray-50 text-gray-900'
                  }`}
                />

                {/* Quick Presets */}
                <div className="space-y-1">
                  <span className="text-[11px] text-gray-400 block font-medium">Quick Date Presets:</span>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: '+1 Month', months: 1 },
                      { label: '+3 Months', months: 3 },
                      { label: '+6 Months', months: 6 },
                      { label: '+1 Year', months: 12 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => applyPresetDate(preset.months)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all text-center ${
                          theme === 'dark'
                            ? 'border-gray-700 bg-gray-700/60 hover:bg-indigo-900/40 hover:border-indigo-700 text-gray-300'
                            : 'border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 text-gray-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Once this expiry date passes, free trial access will automatically expire. The accountant will log in normally and see the "Subscription Required" modal.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className={`px-6 py-4 border-t flex items-center justify-end gap-3 ${theme === 'dark' ? 'border-gray-700 bg-gray-800/80' : 'border-gray-100 bg-slate-50'}`}>
              <button
                type="button"
                onClick={() => setShowTrialModal(false)}
                disabled={savingTrial}
                className={`px-4 py-2 rounded-xl border text-sm font-medium transition ${
                  theme === 'dark' ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTrial}
                disabled={savingTrial}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md transition flex items-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {savingTrial ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save Trial Settings
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
