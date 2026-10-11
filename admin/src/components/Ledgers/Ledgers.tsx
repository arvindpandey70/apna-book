import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import { Plus, X, Edit, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { allSystemGroups, buildGroupHierarchy, type HierarchicalGroup } from '../../constants/ledgerGroups';

interface Ledger {
  id: number;
  name: string;
  opening_balance: string;
  balance_type: string;
  created_at: string;
  company_id: number;
  company_name: string | null;
  owner_type: string;
  group_id: string | number;
}

const Ledgers: React.FC = () => {
  const { theme } = useTheme();
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [ledgerGroups, setLedgerGroups] = useState<HierarchicalGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLedgerId, setEditingLedgerId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    groupId: '',
    openingBalance: '',
    balanceType: 'debit'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchLedgers = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/api/admin/all-ledgers');
      setLedgers(response.data);
    } catch (error) {
      console.error('Failed to fetch ledgers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLedgerGroups = async () => {
    try {
      const response = await api.get('/api/ledger-dropdown');
      const dbGroups = response.data;
      const combined = [...allSystemGroups, ...(Array.isArray(dbGroups) ? dbGroups : [])];
      setLedgerGroups(buildGroupHierarchy(combined));
    } catch (error) {
      console.error('Failed to fetch ledger groups:', error);
      setLedgerGroups(buildGroupHierarchy(allSystemGroups));
    }
  };

  useEffect(() => {
    fetchLedgers();
    fetchLedgerGroups();
  }, []);

  const handleCreateOrEditLedger = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingLedgerId) {
        await api.put(`/api/admin/global-ledger/${editingLedgerId}`, {
          name: formData.name,
          groupId: formData.groupId,
          openingBalance: formData.openingBalance || 0,
          balanceType: formData.balanceType
        });
      } else {
        await api.post('/api/admin/create-global-ledger', {
          name: formData.name,
          groupId: formData.groupId,
          openingBalance: formData.openingBalance || 0,
          balanceType: formData.balanceType
        });
      }
      setIsModalOpen(false);
      setEditingLedgerId(null);
      setFormData({ name: '', groupId: '', openingBalance: '', balanceType: 'debit' });
      fetchLedgers(); // Refresh list
      
      Swal.fire({
        icon: 'success',
        title: editingLedgerId ? 'Updated!' : 'Created!',
        text: editingLedgerId ? 'Global ledger updated successfully across all companies.' : 'Global ledger created successfully.',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (error: any) {
      console.error('Failed to save global ledger:', error);
      Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: error.response?.data?.message || 'Failed to save global ledger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (ledger: Ledger) => {
    setEditingLedgerId(ledger.id);
    setFormData({
      name: ledger.name,
      groupId: String(ledger.group_id || ''),
      openingBalance: Math.abs(parseFloat(ledger.opening_balance)).toString(),
      balanceType: ledger.balance_type
    });
    setIsModalOpen(true);
  };

  const handleDeleteClick = async (id: number) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: "It will be removed from all companies that are not actively using it.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!'
    });

    if (result.isConfirmed) {
      try {
        await api.delete(`/api/admin/global-ledger/${id}`);
        fetchLedgers();
        Swal.fire({
          icon: 'success',
          title: 'Deleted!',
          text: 'Global ledger has been deleted.',
          timer: 2000,
          showConfirmButton: false
        });
      } catch (error: any) {
        console.error('Failed to delete ledger:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error!',
          text: error.response?.data?.message || 'Failed to delete global ledger'
        });
      }
    }
  };

  const openCreateModal = () => {
    setEditingLedgerId(null);
    setFormData({ name: '', groupId: '', openingBalance: '', balanceType: 'debit' });
    setIsModalOpen(true);
  };

  const filteredLedgers = ledgers
    .filter(ledger =>
      ledger.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ledger.company_name && ledger.company_name.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0.00';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Ledgers</h1>
          <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>View all ledgers across companies.</p>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-bold flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Global Ledger
          </button>
          <button
            onClick={fetchLedgers}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primaryDark transition-colors font-bold"
          >
            Refresh Data
          </button>
        </div>
      </div>

      <div className={`rounded-xl shadow-sm border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Global Admin Ledgers</h3>
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Search global ledgers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-4 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
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
                <tr className={`text-left text-xs font-black uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  <th className="px-4 py-3 border-b border-gray-700/50">Ledger Name</th>
                  <th className="px-4 py-3 border-b border-gray-700/50">Group</th>
                  <th className="px-4 py-3 border-b border-gray-700/50 text-right">Opening Balance</th>
                  <th className="px-4 py-3 border-b border-gray-700/50">Balance Type</th>
                  <th className="px-4 py-3 border-b border-gray-700/50">Created At</th>
                  <th className="px-4 py-3 border-b border-gray-700/50 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedgers.length > 0 ? filteredLedgers.map((ledger) => (
                  <tr key={ledger.id} className={`${theme === 'dark' ? 'hover:bg-gray-700/30' : 'hover:bg-gray-50'} transition-colors group`}>
                    <td className={`px-4 py-4 border-b ${theme === 'dark' ? 'border-gray-700/50' : 'border-gray-100'}`}>
                      <div className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{ledger.name}</div>
                      <div className="text-xs text-gray-500">ID: #{ledger.id}</div>
                    </td>
                    <td className={`px-4 py-4 border-b ${theme === 'dark' ? 'border-gray-700/50' : 'border-gray-100'}`}>
                      <div className="text-sm font-medium">
                        <span className="text-purple-500 font-bold px-2 py-1 bg-purple-500/10 rounded">
                          {ledgerGroups.find(g => String(g.id) === String(ledger.group_id))?.name || 'Unknown Group'}
                        </span> 
                      </div>
                    </td>
                    <td className={`px-4 py-4 border-b ${theme === 'dark' ? 'border-gray-700/50' : 'border-gray-100'} text-right font-mono font-medium ${parseFloat(ledger.opening_balance) < 0 ? 'text-red-500' : ''}`}>
                      {formatCurrency(ledger.opening_balance)}
                    </td>
                    <td className={`px-4 py-4 border-b ${theme === 'dark' ? 'border-gray-700/50' : 'border-gray-100'} text-sm`}>
                      <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${ledger.balance_type === 'credit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {ledger.balance_type}
                      </span>
                    </td>
                    <td className={`px-4 py-4 border-b ${theme === 'dark' ? 'border-gray-700/50' : 'border-gray-100'} text-sm text-gray-400`}>
                      {ledger.created_at ? new Date(ledger.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className={`px-4 py-4 border-b ${theme === 'dark' ? 'border-gray-700/50' : 'border-gray-100'} text-right`}>
                      <button 
                        onClick={() => handleEditClick(ledger)}
                        className="text-blue-500 hover:text-blue-700 transition-colors mr-3"
                        title="Edit"
                      >
                        <Edit className="w-5 h-5 inline" />
                      </button>
                      <button 
                        onClick={() => handleDeleteClick(ledger.id)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-5 h-5 inline" />
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No ledgers found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Global Ledger Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl shadow-xl overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'}`}>
            <div className={`px-6 py-4 border-b flex justify-between items-center ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
              <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {editingLedgerId ? 'Edit Global Ledger' : 'Create Global Ledger'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className={`p-1 rounded-full transition-colors ${theme === 'dark' ? 'hover:bg-gray-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'}`}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleCreateOrEditLedger} className="p-6 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Ledger Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all ${
                    theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'
                  }`}
                  placeholder="e.g. GST Payable"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Under Group *</label>
                <select
                  required
                  value={formData.groupId}
                  onChange={(e) => setFormData({...formData, groupId: e.target.value})}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all ${
                    theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <option value="">Select Group</option>
                  {ledgerGroups.map(group => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Opening Balance</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.openingBalance}
                    onChange={(e) => setFormData({...formData, openingBalance: e.target.value})}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all ${
                      theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'
                    }`}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Dr/Cr</label>
                  <select
                    value={formData.balanceType}
                    onChange={(e) => setFormData({...formData, balanceType: e.target.value})}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all ${
                      theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <option value="debit">Debit (Dr)</option>
                    <option value="credit">Credit (Cr)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className={`flex-1 px-4 py-2 rounded-lg font-bold transition-colors ${
                    theme === 'dark' ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                  ) : (
                    editingLedgerId ? 'Update Globally' : 'Create Globally'
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

export default Ledgers;
