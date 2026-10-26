import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building, Mail, Phone, CreditCard } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import Swal from 'sweetalert2';
import { Calendar, CheckCircle, XCircle, Settings2 } from 'lucide-react';

const TraderDetail: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { theme } = useTheme();
    const [details, setDetails] = useState<{ info: any, companies: any[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCompany, setSelectedCompany] = useState<any>(null);
    const [showManageModal, setShowManageModal] = useState(false);
    const [newStartDate, setNewStartDate] = useState('');
    const [newEndDate, setNewEndDate] = useState('');
    const [newIsTrial, setNewIsTrial] = useState(true);
    const [updating, setUpdating] = useState(false);

    const fetchDetails = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/api/traders/${id}`);
            setDetails(res.data);
        } catch (err: any) {
            Swal.fire({ icon: 'error', title: 'Oops...', text: 'Could not load details' });
            navigate('/trader');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) {
            fetchDetails();
        }
    }, [id]);

    const getNextMarch31 = (customDate?: Date) => {
        const today = customDate || new Date();
        const year = today.getFullYear();
        // If today is on or before March 31, the FY ends this year.
        // Else it ends next year.
        if (today.getMonth() < 3 || (today.getMonth() === 3 && today.getDate() <= 31)) {
            return `${year}-03-31`;
        }
        return `${year + 1}-03-31`;
    };

    const handleManageSubscription = (company: any) => {
        setSelectedCompany(company);
        setNewStartDate(company.start_date ? new Date(company.start_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
        setNewEndDate(company.end_date ? new Date(company.end_date).toISOString().split('T')[0] : getNextMarch31());
        setNewIsTrial(company.is_trial === 1);
        setShowManageModal(true);
    };

    const handleUpdateSubscription = async () => {
        if (!newStartDate || !newEndDate) return Swal.fire('Error', 'Please select both start and expiry dates', 'error');
        if (new Date(newStartDate) >= new Date(newEndDate)) return Swal.fire('Error', 'Expiry date must be after start date', 'error');
        try {
            setUpdating(true);
            await api.patch(`/api/traders/company/${selectedCompany.id}/subscription`, {
                startDate: newStartDate,
                endDate: newEndDate,
                isTrial: newIsTrial,
                status: 'active'
            });
            Swal.fire({
                icon: 'success',
                title: 'Subscription Updated',
                text: 'The company subscription has been modified successfully.',
                timer: 2000,
                showConfirmButton: false
            });
            setShowManageModal(false);
            fetchDetails();
        } catch (err: any) {
            Swal.fire('Error', err.response?.data?.error || err.message, 'error');
        } finally {
            setUpdating(false);
        }
    };

    const setFYDate = (year: number) => {
        // Enforce Financial Year (April 1st to March 31st)
        setNewStartDate(`${year - 1}-04-01`);
        setNewEndDate(`${year}-03-31`);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-500 font-medium text-sm">Loading trader details...</p>
            </div>
        );
    }

    if (!details) return null;

    return (
        <div className={`space-y-6 animate-in fade-in duration-500`}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/trader')}
                        className={`p-2 rounded-lg transition-all ${theme === 'dark' ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300 border shadow-sm'}`}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-2xl font-bold`}>
                        Trader Profile
                    </h1>
                </div>
            </div>

            <div className="space-y-6">
                {/* Top Section: Basic Info Card */}
                <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300 shadow-md shadow-gray-200/50'}`}>
                    <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
                        <div className={`w-24 h-24 rounded-full flex items-center justify-center bg-indigo-100 text-indigo-600 text-3xl font-bold flex-shrink-0`}>
                            {details.info.firstName[0]}{details.info.lastName[0]}
                        </div>

                        <div className="flex-1 space-y-4">
                            <div>
                                <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                    {details.info.firstName} {details.info.lastName}
                                </h2>
                                <p className="text-sm text-gray-700 font-bold">Trader ID: #{id}</p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="flex items-center gap-3 text-sm p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                                    <Mail className="w-4 h-4 text-indigo-500" />
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-gray-600 font-black uppercase tracking-wider">Email Address</span>
                                        <span className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>{details.info.email}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 text-sm p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                                    <Phone className="w-4 h-4 text-emerald-500" />
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-gray-600 font-black uppercase tracking-wider">Phone Number</span>
                                        <span className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>{details.info.phoneNumber || 'Not provided'}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 text-sm p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                                    <CreditCard className="w-4 h-4 text-blue-500" />
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-gray-600 font-black uppercase tracking-wider">PAN Number</span>
                                        <span className={`font-medium uppercase ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>{details.info.pan || 'N/A'}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 text-sm p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                                    <Building className="w-4 h-4 text-purple-500" />
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-gray-600 font-black uppercase tracking-wider">Total companies</span>
                                        <span className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>{details.companies.length} Records</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Section: Associated Companies */}
                <div className={`rounded-xl border ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300 shadow-lg shadow-gray-200/40'}`}>
                    <div className="p-6 border-b border-gray-300 dark:border-gray-700 flex items-center justify-between">
                        <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                            Associated Companies
                        </h3>
                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full">
                            {details.companies.length} Total
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className={`text-xs uppercase tracking-wider ${theme === 'dark' ? 'bg-gray-900 text-gray-400' : 'bg-gray-100/80 text-gray-800'}`}>
                                <tr>
                                    <th className="px-6 py-4 font-bold">Company Name</th>
                                    <th className="px-6 py-4 font-bold">Purchase Date</th>
                                    <th className="px-6 py-4 font-bold">Status</th>
                                    <th className="px-6 py-4 font-bold">Validity</th>
                                    <th className="px-6 py-4 font-bold">Access ID</th>
                                    <th className="px-6 py-4 font-bold text-center">FY</th>
                                    <th className="px-6 py-4 font-bold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className={`divide-y ${theme === 'dark' ? 'divide-gray-700' : 'divide-gray-300'}`}>
                                {details.companies.length > 0 ? details.companies.map((company: any) => {
                                    const isExpired = company.daysRemaining <= 0;
                                    return (
                                        <tr key={company.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{company.name}</span>
                                                    <span className="text-[10px] text-gray-600 font-bold">GST: {company.gst_number || 'N/A'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-800 font-bold">
                                                {company.purchaseDate ? new Date(company.purchaseDate).toLocaleDateString() : 'N/A'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${company.is_trial
                                                    ? 'bg-amber-100 text-amber-700'
                                                    : 'bg-emerald-100 text-emerald-700'
                                                    }`}>
                                                    {company.is_trial ? 'Trial mode' : 'Purchased'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className={`font-bold ${isExpired ? 'text-red-600' : 'text-gray-900 dark:text-gray-300'}`}>
                                                        {isExpired ? 'Expired' : `${company.daysRemaining} days left`}
                                                    </span>
                                                    <span className="text-[10px] text-gray-600 font-black whitespace-nowrap">Valid till: {company.end_date ? new Date(company.end_date).toLocaleDateString() : 'N/A'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-800 font-bold">
                                                {company.username || 'No Access'}
                                            </td>
                                            <td className="px-6 py-4 text-center text-gray-900 font-black">
                                                {company.financial_year}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleManageSubscription(company)}
                                                    className="p-2 hover:bg-indigo-100 hover:text-indigo-600 rounded-lg transition-colors text-gray-600 border border-transparent hover:border-indigo-200"
                                                    title="Manage Subscription"
                                                >
                                                    <Settings2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-gray-700 font-bold">
                                            No companies associated with this trader.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Manage Subscription Modal */}
            {showManageModal && selectedCompany && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <div className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                        <div className="p-6 border-b border-gray-300 dark:border-gray-700 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black">Manage Subscription</h3>
                                <p className="text-xs text-gray-700 font-bold">{selectedCompany.name}</p>
                            </div>
                            <button onClick={() => setShowManageModal(false)} className="text-gray-700 hover:text-gray-900 bg-gray-100 p-1 rounded-full">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Trial Toggle */}
                            <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-300">
                                <div className="flex flex-col">
                                    <span className="text-base font-black">Trial Mode</span>
                                    <span className="text-[11px] text-gray-700 font-bold">Toggle between trial and purchased status</span>
                                </div>
                                <button
                                    onClick={() => setNewIsTrial(!newIsTrial)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${newIsTrial ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${newIsTrial ? 'translate-x-1' : 'translate-x-6'}`} />
                                </button>
                            </div>

                            {/* Date Pickers */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-700 uppercase tracking-widest flex items-center gap-2">
                                        <Calendar className="w-3 h-3 text-indigo-600" /> Start Date
                                    </label>
                                    <input
                                        type="date"
                                        value={newStartDate}
                                        onChange={(e) => setNewStartDate(e.target.value)}
                                        className={`w-full px-4 py-3 rounded-xl border-2 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 outline-none transition-all ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : 'bg-gray-50 border-gray-300 text-gray-900 font-bold'}`}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-700 uppercase tracking-widest flex items-center gap-2">
                                        <Calendar className="w-3 h-3 text-indigo-600" /> Expiry Date
                                    </label>
                                    <input
                                        type="date"
                                        value={newEndDate}
                                        onChange={(e) => setNewEndDate(e.target.value)}
                                        className={`w-full px-4 py-3 rounded-xl border-2 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 outline-none transition-all ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-white' : 'bg-gray-50 border-gray-300 text-gray-900 font-bold'}`}
                                    />
                                </div>
                            </div>
                            <p className="text-[10px] text-amber-700 font-black text-center bg-amber-50 py-1.5 rounded-lg border border-amber-200">Note: Select the subscription period (e.g., for a full financial year).</p>

                            {/* FY Presets */}
                            <div className="space-y-3">
                                <label className="text-xs font-black text-gray-700 uppercase tracking-widest">Quick Session Presets</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setFYDate(2026)}
                                        className={`px-4 py-2.5 rounded-xl border-2 text-xs font-black transition-all ${newEndDate === '2026-03-31' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200' : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-700'}`}
                                    >
                                        2025-26 (Apr-Mar)
                                    </button>
                                    <button
                                        onClick={() => setFYDate(2027)}
                                        className={`px-4 py-2.5 rounded-xl border-2 text-xs font-black transition-all ${newEndDate === '2027-03-31' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200' : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-700'}`}
                                    >
                                        2026-27 (Apr-Mar)
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-gray-100 dark:bg-gray-800/50 flex gap-3 border-t border-gray-300">
                            <button
                                onClick={() => setShowManageModal(false)}
                                className={`flex-1 px-6 py-3 rounded-xl font-black text-sm border-2 transition-all ${theme === 'dark' ? 'border-gray-700 text-gray-400 hover:bg-gray-700' : 'border-gray-300 text-gray-800 hover:bg-white active:scale-95'}`}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdateSubscription}
                                disabled={updating}
                                className="flex-1 px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {updating ? 'Updating...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TraderDetail;
