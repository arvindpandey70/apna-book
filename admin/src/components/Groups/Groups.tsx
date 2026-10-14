import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import { Plus, X, Edit, Trash2, Layers } from 'lucide-react';
import Swal from 'sweetalert2';
import { allSystemGroups, type SystemGroup } from '../../constants/ledgerGroups';

interface AdminGroup {
  id: number;
  name: string;
  parent: number | null;
  nature: string | null;
  created_at: string;
  company_id: number;
  owner_type: string;
  company_name: string | null;
}

const Groups: React.FC = () => {
  const { theme } = useTheme();
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [parentGroups, setParentGroups] = useState<SystemGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    parent: '',
    nature: 'Assets'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchGroups = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/api/admin/all-groups');
      setGroups(response.data);
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchParentGroups = async () => {
    try {
      const response = await api.get('/api/ledger-dropdown');
      const dbGroups = response.data;
      const combined = [...allSystemGroups, ...(Array.isArray(dbGroups) ? dbGroups : [])];
      const uniqueMap = new Map();
      for (const g of combined) {
        if (!uniqueMap.has(String(g.id))) {
          uniqueMap.set(String(g.id), g);
        }
      }
      const uniqueList = Array.from(uniqueMap.values()).sort((a: any, b: any) =>
        a.name.localeCompare(b.name)
      );
      setParentGroups(uniqueList);
    } catch (error) {
      console.error('Failed to fetch parent groups:', error);
      const uniqueList = [...allSystemGroups].sort((a, b) => a.name.localeCompare(b.name));
      setParentGroups(uniqueList);
    }
  };

  useEffect(() => {
    fetchGroups();
    fetchParentGroups();
  }, []);

  const handleParentChange = (parentIdStr: string) => {
    let nextNature = formData.nature;
    if (parentIdStr) {
      const parentNum = Number(parentIdStr);
      const found = parentGroups.find((g) => Number(g.id) === parentNum);
      if (found && found.nature) {
        nextNature = found.nature;
      }
    }
    setFormData({
      ...formData,
      parent: parentIdStr,
      nature: nextNature
    });
  };

  const handleCreateOrEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Validation Error',
        text: 'Group Name is required'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        parent: formData.parent ? Number(formData.parent) : null,
        nature: formData.nature
      };

      if (editingGroupId) {
        await api.put(`/api/admin/global-group/${editingGroupId}`, payload);
      } else {
        await api.post('/api/admin/create-global-group', payload);
      }

      setIsModalOpen(false);
      setEditingGroupId(null);
      setFormData({ name: '', parent: '', nature: 'Assets' });
      fetchGroups();
      fetchParentGroups();

      Swal.fire({
        icon: 'success',
        title: editingGroupId ? 'Updated!' : 'Created!',
        text: editingGroupId
          ? 'Global group updated successfully across all companies.'
          : 'Global group created successfully and copied to all companies.',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (error: any) {
      console.error('Failed to save global group:', error);
      Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: error.response?.data?.message || 'Failed to save global group'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (group: AdminGroup) => {
    setEditingGroupId(group.id);
    setFormData({
      name: group.name,
      parent: group.parent !== null && group.parent !== undefined ? String(group.parent) : '',
      nature: group.nature || 'Assets'
    });
    setIsModalOpen(true);
  };

  const handleDeleteClick = async (id: number) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: 'It will be removed from all companies that are not actively using it.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!'
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/api/admin/global-group/${id}`);
        fetchGroups();
        fetchParentGroups();
        Swal.fire({
          icon: 'success',
          title: 'Deleted!',
          text: 'Global group has been deleted.',
          timer: 2000,
          showConfirmButton: false
        });
      } catch (error: any) {
        console.error('Failed to delete group:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error!',
          text: error.response?.data?.message || 'Failed to delete global group'
        });
      }
    }
  };

  const openCreateModal = () => {
    setEditingGroupId(null);
    setFormData({ name: '', parent: '', nature: 'Assets' });
    setIsModalOpen(true);
  };

  const getParentName = (parentVal: number | null) => {
    if (parentVal === null || parentVal === undefined || parentVal === 0) {
      return 'Primary';
    }
    const found = parentGroups.find((g) => Number(g.id) === Number(parentVal));
    if (found) {
      return found.name;
    }
    const sys = allSystemGroups.find((g) => g.id === Number(parentVal));
    if (sys) {
      return sys.name;
    }
    const adminGrp = groups.find((g) => g.id === Number(parentVal));
    if (adminGrp) {
      return adminGrp.name;
    }
    return `ID: ${parentVal}`;
  };

  const getNatureBadgeColor = (nature: string | null) => {
    switch (nature) {
      case 'Assets':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
      case 'Liabilities':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
      case 'Income':
        return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
      case 'Expenses':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const filteredGroups = groups
    .filter((group) => {
      const matchName = group.name.toLowerCase().includes(searchTerm.toLowerCase());
      const parentName = getParentName(group.parent).toLowerCase();
      const matchParent = parentName.includes(searchTerm.toLowerCase());
      const matchNature = (group.nature || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchName || matchParent || matchNature;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Groups</h1>
          <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
            View and manage global groups across companies.
          </p>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-bold flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Global Group
          </button>
          <button
            onClick={() => {
              fetchGroups();
              fetchParentGroups();
            }}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primaryDark transition-colors font-bold"
          >
            Refresh Data
          </button>
        </div>
      </div>

      <div
        className={`rounded-xl shadow-sm border p-6 ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Global Admin Groups
          </h3>
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Search global groups..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-4 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none ${
                theme === 'dark'
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-gray-50 border-gray-200 text-gray-900'
              }`}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr
                  className={`text-left text-xs font-black uppercase tracking-wider ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                  }`}
                >
                  <th className="px-4 py-3 border-b border-gray-700/50">Group Name</th>
                  <th className="px-4 py-3 border-b border-gray-700/50">Under</th>
                  <th className="px-4 py-3 border-b border-gray-700/50">Nature of Group</th>
                  <th className="px-4 py-3 border-b border-gray-700/50">Created At</th>
                  <th className="px-4 py-3 border-b border-gray-700/50 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.length > 0 ? (
                  filteredGroups.map((group) => (
                    <tr
                      key={group.id}
                      className={`${
                        theme === 'dark' ? 'hover:bg-gray-700/30' : 'hover:bg-gray-50'
                      } transition-colors group`}
                    >
                      <td
                        className={`px-4 py-4 border-b ${
                          theme === 'dark' ? 'border-gray-700/50' : 'border-gray-100'
                        }`}
                      >
                        <div className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                          {group.name}
                        </div>
                        <div className="text-xs text-gray-500">ID: #{group.id}</div>
                      </td>
                      <td
                        className={`px-4 py-4 border-b ${
                          theme === 'dark' ? 'border-gray-700/50' : 'border-gray-100'
                        }`}
                      >
                        <div className="text-sm font-medium">
                          <span className="text-purple-500 font-bold px-2 py-1 bg-purple-500/10 rounded">
                            {getParentName(group.parent)}
                          </span>
                        </div>
                      </td>
                      <td
                        className={`px-4 py-4 border-b ${
                          theme === 'dark' ? 'border-gray-700/50' : 'border-gray-100'
                        } text-sm`}
                      >
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold uppercase ${getNatureBadgeColor(
                            group.nature
                          )}`}
                        >
                          {group.nature || 'N/A'}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-4 border-b ${
                          theme === 'dark' ? 'border-gray-700/50' : 'border-gray-100'
                        } text-sm text-gray-400`}
                      >
                        {group.created_at ? new Date(group.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td
                        className={`px-4 py-4 border-b ${
                          theme === 'dark' ? 'border-gray-700/50' : 'border-gray-100'
                        } text-right`}
                      >
                        <button
                          onClick={() => handleEditClick(group)}
                          className="text-blue-500 hover:text-blue-700 transition-colors mr-3"
                          title="Edit"
                        >
                          <Edit className="w-5 h-5 inline" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(group.id)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-5 h-5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No groups found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Global Group Modal */}
      {isModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div
              className={`w-full max-w-md rounded-2xl shadow-xl overflow-hidden ${
                theme === 'dark' ? 'bg-gray-800' : 'bg-white'
              }`}
            >
              <div
                className={`px-6 py-4 border-b flex justify-between items-center ${
                  theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-primary/10 text-primary rounded-lg">
                    <Layers className="w-5 h-5" />
                  </div>
                  <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {editingGroupId ? 'Edit Global Group' : 'Create Global Group'}
                  </h2>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className={`p-1 rounded-full transition-colors ${
                    theme === 'dark'
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-white'
                      : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleCreateOrEditGroup} className="p-6 space-y-4">
                <div>
                  <label
                    className={`block text-sm font-medium mb-1 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  >
                    Group Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all ${
                      theme === 'dark'
                        ? 'bg-gray-700 border-gray-600 text-white'
                        : 'bg-gray-50 border-gray-200 text-gray-900'
                    }`}
                    placeholder="e.g. Wholesale, Retail, General"
                  />
                </div>

                <div>
                  <label
                    className={`block text-sm font-medium mb-1 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  >
                    Under *
                  </label>
                  <select
                    value={formData.parent}
                    onChange={(e) => handleParentChange(e.target.value)}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all ${
                      theme === 'dark'
                        ? 'bg-gray-700 border-gray-600 text-white'
                        : 'bg-gray-50 border-gray-200 text-gray-900'
                    }`}
                  >
                    <option value="">Primary</option>
                    {parentGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    className={`block text-sm font-medium mb-1 ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  >
                    Nature of Group *
                  </label>
                  <select
                    required
                    value={formData.nature}
                    onChange={(e) => setFormData({ ...formData, nature: e.target.value })}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all ${
                      theme === 'dark'
                        ? 'bg-gray-700 border-gray-600 text-white'
                        : 'bg-gray-50 border-gray-200 text-gray-900'
                    }`}
                  >
                    <option value="Assets">Assets</option>
                    <option value="Liabilities">Liabilities</option>
                    <option value="Income">Income</option>
                    <option value="Expenses">Expenses</option>
                  </select>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className={`flex-1 px-4 py-2 rounded-lg font-bold transition-colors ${
                      theme === 'dark'
                        ? 'bg-gray-700 text-white hover:bg-gray-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-primary text-white rounded-lg font-bold hover:bg-primaryDark transition-colors disabled:opacity-70 flex justify-center items-center"
                  >
                    {isSubmitting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : editingGroupId ? (
                      'Update Globally'
                    ) : (
                      'Create Globally'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Groups;
