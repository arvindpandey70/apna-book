import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import {
  Users,
  Search,
  UserPlus,
  Trash2,
  Ban,
  Play,
  Building2,
  Filter,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import Swal from 'sweetalert2';

interface ManagedUser {
  id: number;
  company_id: number;
  company_name: string;
  username: string;
  email: string;
  phone?: string;
  department?: string;
  role: string;
  status: 'active' | 'suspended' | 'inactive';
  last_login?: string | null;
  created_at: string;
}

interface Company {
  id: number;
  name: string;
}

const AccountantUsers: React.FC = () => {
  const { theme } = useAppContext();
  const isDark = theme === 'dark';
  const [searchParams] = useSearchParams();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState(searchParams.get('company_id') || 'all');

  useEffect(() => {
    fetchUsers();
    fetchCompanies();
  }, [statusFilter, companyFilter]);

  const fetchCompanies = async () => {
    try {
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
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (companyFilter !== 'all') params.append('company_id', companyFilter);

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/accountant/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error('Error fetching accountant users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusToggle = async (user: ManagedUser) => {
    const nextStatus = user.status === 'active' ? 'suspended' : 'active';
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/accountant/users/${user.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: nextStatus })
      });

      const data = await res.json();
      if (data.success) {
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: nextStatus } : u));
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `User status changed to ${nextStatus}`,
          showConfirmButton: false,
          timer: 2500
        });
      } else {
        Swal.fire({ icon: 'error', title: 'Update Failed', text: data.error || 'Failed to update user status' });
      }
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  };

  const handleDeleteUser = async (userId: number) => {
    const confirm = await Swal.fire({
      title: 'Delete User?',
      text: "This normal user will be permanently deleted and cannot be recovered.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete user'
    });

    if (confirm.isConfirmed) {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/accountant/users/${userId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          setUsers(prev => prev.filter(u => u.id !== userId));
          Swal.fire('Deleted!', 'User has been removed.', 'success');
        } else {
          Swal.fire({ icon: 'error', title: 'Delete Failed', text: data.error || 'Failed to delete user' });
        }
      } catch (err: any) {
        Swal.fire({ icon: 'error', title: 'Error', text: err.message });
      }
    }
  };

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.company_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Users className="text-indigo-600" />
            Managed Client Users
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Create and oversee standard users belonging to your authorized client companies
          </p>
        </div>

        <Link
          to="/accountant/users/create"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 inline-flex items-center gap-1.5 transition-all active:scale-95"
        >
          <UserPlus size={15} />
          + Create New User
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row gap-3 items-center justify-between ${
        isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by username, email, company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-9 pr-4 py-2 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all ${
              isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Company Filter Dropdown */}
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className={`text-xs font-semibold px-3 py-2 rounded-xl border outline-none cursor-pointer ${
              isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <option value="all">All Companies</option>
            {companies.map(c => (
              <option key={c.id} value={c.id.toString()}>{c.name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <div className="flex gap-1">
            {['all', 'active', 'suspended'].map(filter => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all cursor-pointer ${
                  statusFilter === filter
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : isDark
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className={`rounded-3xl border overflow-hidden shadow-xs ${
        isDark ? 'bg-slate-800/90 border-slate-700/80' : 'bg-white border-slate-200'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={`border-b ${isDark ? 'border-slate-700 text-slate-400 bg-slate-850' : 'border-slate-200 text-slate-500 bg-slate-50'}`}>
              <tr>
                <th className="p-4 font-semibold uppercase tracking-wider">Username & Email</th>
                <th className="p-4 font-semibold uppercase tracking-wider">Client Company</th>
                <th className="p-4 font-semibold uppercase tracking-wider">Role</th>
                <th className="p-4 font-semibold uppercase tracking-wider">Status</th>
                <th className="p-4 font-semibold uppercase tracking-wider">Phone</th>
                <th className="p-4 font-semibold uppercase tracking-wider">Created Date</th>
                <th className="p-4 font-semibold uppercase tracking-wider text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">Loading users...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    No users found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-750/30 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-slate-900 dark:text-white">{user.username}</div>
                      <div className="text-[11px] text-slate-400">{user.email}</div>
                    </td>
                    <td className="p-4 font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Building2 size={13} className="text-indigo-500 shrink-0" />
                      {user.company_name}
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 rounded-md font-semibold text-[11px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        {user.role}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        user.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-slate-500">{user.phone || '—'}</td>
                    <td className="p-4 text-slate-400 font-mono">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-center">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleStatusToggle(user)}
                          title={user.status === 'active' ? 'Suspend User' : 'Activate User'}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            user.status === 'active'
                              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                        >
                          {user.status === 'active' ? <Ban size={14} /> : <Play size={14} />}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          title="Delete User"
                          className="p-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950 dark:text-red-300 transition-colors cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AccountantUsers;
