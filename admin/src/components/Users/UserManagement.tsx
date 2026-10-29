import React, { useEffect, useState } from 'react';
import { Search, Filter, Edit, Trash2, Ban, Play, Users, MoreVertical, X, ExternalLink, FileText, Building2 } from 'lucide-react';
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

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

  const filteredUsers = users.filter(
    (u) =>
      (u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (statusFilter === 'all' || u.status === statusFilter)
  );

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-2xl font-bold`}>Accountant Management</h1>
          <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Manage accountants, company permissions, and credentials</p>
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
        <div className="flex gap-2 w-full md:w-auto">
          {['all', 'active', 'suspended', 'pending'].map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${statusFilter === filter ? 'bg-primary text-white shadow-sm' : theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
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
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    No accountants found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
