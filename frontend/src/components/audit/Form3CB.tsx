import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useCompany } from '../../context/CompanyContext';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { mapForm3CBData, type Form3CBData } from '../../utils/auditFormMapper';
import { useFinancialYear } from '../../hooks/useFinancialYear';
import { 
  ArrowLeft, 
  Save, 
  Download, 
  Printer,
  FileCheck,
  AlertCircle,
  Loader2,
  Calendar,
  Building2
} from 'lucide-react';

const Form3CB: React.FC = () => {
  const { theme } = useAppContext();
  const { companyInfo, activeCompanyId } = useCompany();
  const { selectedFinYear } = useFinancialYear();
  const navigate = useNavigate();
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [formData, setFormData] = useState<Form3CBData>(() => mapForm3CBData(null, companyInfo, null, null, selectedFinYear));

  useEffect(() => {
    let isMounted = true;
    const fetchForm3CBData = async () => {
      setIsLoading(true);
      try {
        const companyId = activeCompanyId || localStorage.getItem('company_id') || '';
        const userId = localStorage.getItem('user_id') || '';
        const userType = localStorage.getItem('userType') || '';

        if (companyId) {
          const res = await fetch(
            `${import.meta.env.VITE_API_URL}/api/audit/form?company_id=${encodeURIComponent(companyId)}&form_type=3CB&user_id=${encodeURIComponent(userId)}&user_type=${encodeURIComponent(userType)}&financialYear=${encodeURIComponent(selectedFinYear || '')}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.success && isMounted) {
              const mapped = mapForm3CBData(data.savedData, data.companyInfo || companyInfo, data.caInfo, data.financialParticulars, selectedFinYear);
              setFormData(mapped);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch Form 3CB data:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchForm3CBData();
    return () => {
      isMounted = false;
    };
  }, [activeCompanyId, selectedFinYear]);

  const handleInputChange = (field: keyof Form3CBData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const saveAuditForm = async (status: 'draft' | 'submitted') => {
    const companyId = activeCompanyId || localStorage.getItem('company_id') || '';
    const userId = localStorage.getItem('user_id') || '';
    if (!companyId) {
      Swal.fire('Error', 'No company selected. Please select a company first.', 'error');
      return;
    }

    setIsSaving(true);
    setNotification(null);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/audit/form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          ca_id: userId,
          form_type: '3CB',
          assessment_year: formData.assessmentYear,
          form_data: formData,
          status
        })
      });

      const resData = await response.json();
      if (response.ok && resData.success) {
        const msg = status === 'submitted' ? 'Form 3CB submitted successfully!' : 'Form 3CB saved successfully!';
        setNotification({ type: 'success', message: msg });
        Swal.fire({
          icon: 'success',
          title: status === 'submitted' ? 'Submitted!' : 'Saved!',
          text: msg,
          timer: 2000,
          showConfirmButton: false
        });
      } else {
        throw new Error(resData.message || 'Failed to save form data');
      }
    } catch (err: any) {
      console.error('Error saving Form 3CB:', err);
      const errorMsg = err.message || 'Error saving form. Please try again.';
      setNotification({ type: 'error', message: errorMsg });
      Swal.fire('Save Failed', errorMsg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => saveAuditForm('draft');
  const handleSubmit = () => saveAuditForm('submitted');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="pt-[56px] px-4 max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
        <p className={`text-base font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
          Loading Form 3CB Audit Data...
        </p>
      </div>
    );
  }

  return (
    <div className="pt-[56px] px-4 max-w-7xl mx-auto">
      {notification && (
        <div className={`mb-4 p-4 rounded-lg flex items-center justify-between ${
          notification.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border border-red-200'
        }`}>
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-sm font-semibold underline ml-4">Dismiss</button>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div className="flex items-center">
          <button
           title='Back to Audit Module'
            onClick={() => navigate('/app/audit')}
            className={`mr-4 p-2 rounded-full ${
              theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
            }`}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Form 3CB</h1>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Report of Tax Audit under Section 44AB
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center text-sm"
          >
            {isSaving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
            Save
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center text-sm"
          >
            {isSaving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <FileCheck size={14} className="mr-1" />}
            Submit
          </button>
          <button className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center text-sm">
            <Download size={14} className="mr-1" />
            Download
          </button>
          <button className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center text-sm">
            <Printer size={14} className="mr-1" />
            Print
          </button>
        </div>
      </div>

      {/* Form Content - All Sections in Single View */}
      <div className="space-y-8">
        
        {/* Part A - General Information */}
        <div className={`rounded-xl border p-6 ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <h2 className="text-xl font-semibold mb-6 text-blue-600">Part A - General Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Name of Entity *</label>
              <input
                type="text"
                value={formData.nameOfEntity}
                onChange={(e) => handleInputChange('nameOfEntity', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
                placeholder="Enter entity name"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">PAN of Entity *</label>
              <input
                type="text"
                value={formData.panOfEntity}
                onChange={(e) => handleInputChange('panOfEntity', e.target.value.toUpperCase())}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
                placeholder="ABCDE1234F"
                maxLength={10}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Assessment Year *</label>
              <select
                title='Assessment Year'
                value={formData.assessmentYear}
                onChange={(e) => handleInputChange('assessmentYear', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
              >
                <option value="2024-25">2024-25</option>
                <option value="2023-24">2023-24</option>
                <option value="2022-23">2022-23</option>
                <option value="2021-22">2021-22</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Previous Year *</label>
              <select
              title='Previous Year'
                value={formData.previousYear}
                onChange={(e) => handleInputChange('previousYear', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
              >
                <option value="2023-24">2023-24</option>
                <option value="2022-23">2022-23</option>
                <option value="2021-22">2021-22</option>
                <option value="2020-21">2020-21</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">PIN Code *</label>
              <input
                type="text"
                value={formData.pinCode}
                onChange={(e) => handleInputChange('pinCode', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
                placeholder="123456"
                maxLength={6}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">State Code *</label>
              <input
                type="text"
                value={formData.stateCode}
                onChange={(e) => handleInputChange('stateCode', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
                placeholder="27"
                maxLength={2}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div>
              <label className="block text-sm font-medium mb-2">Address of Entity *</label>
              <textarea
                value={formData.addressOfEntity}
                onChange={(e) => handleInputChange('addressOfEntity', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
                rows={3}
                placeholder="Enter complete address"
              />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    theme === 'dark' 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300'
                  }`}
                  placeholder="entity@email.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    theme === 'dark' 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300'
                  }`}
                  placeholder="+91 9876543210"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Part B - Nature of Entity */}
        <div className={`rounded-xl border p-6 ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <h2 className="text-xl font-semibold mb-6 text-green-600">Part B - Nature of Entity</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Nature of Entity *</label>
              <select
              title='Nature of Entity'
                value={formData.natureOfEntity}
                onChange={(e) => handleInputChange('natureOfEntity', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
              >
                <option value="">Select Nature</option>
                <option value="Individual">Individual</option>
                <option value="HUF">Hindu Undivided Family</option>
                <option value="Company">Company</option>
                <option value="Partnership">Partnership Firm</option>
                <option value="LLP">Limited Liability Partnership</option>
                <option value="AOP">Association of Persons</option>
                <option value="BOI">Body of Individuals</option>
                <option value="Trust">Trust</option>
                <option value="Society">Society</option>
                <option value="Cooperative">Cooperative Society</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Date of Registration</label>
              <input
                title='Date of Registration'
                type="date"
                value={formData.dateOfRegistration}
                onChange={(e) => handleInputChange('dateOfRegistration', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Registration Number</label>
              <input
                type="text"
                value={formData.registrationNumber}
                onChange={(e) => handleInputChange('registrationNumber', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
                placeholder="Enter registration number (if applicable)"
              />
            </div>
          </div>
        </div>

        {/* Part C - Books of Account */}
        <div className={`rounded-xl border p-6 ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <h2 className="text-xl font-semibold mb-6 text-purple-600">Part C - Books of Account</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Books of Account Maintained? *</label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="Yes"
                    checked={formData.booksOfAccountMaintained === 'Yes'}
                    onChange={(e) => handleInputChange('booksOfAccountMaintained', e.target.value as 'Yes' | 'No')}
                    className="mr-2"
                  />
                  Yes
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="No"
                    checked={formData.booksOfAccountMaintained === 'No'}
                    onChange={(e) => handleInputChange('booksOfAccountMaintained', e.target.value as 'Yes' | 'No')}
                    className="mr-2"
                  />
                  No
                </label>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Regular Books of Account? *</label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="Yes"
                    checked={formData.regularBooksOfAccount === 'Yes'}
                    onChange={(e) => handleInputChange('regularBooksOfAccount', e.target.value as 'Yes' | 'No')}
                    className="mr-2"
                  />
                  Yes
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="No"
                    checked={formData.regularBooksOfAccount === 'No'}
                    onChange={(e) => handleInputChange('regularBooksOfAccount', e.target.value as 'Yes' | 'No')}
                    className="mr-2"
                  />
                  No
                </label>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Books Maintained From Date</label>
              <input
                title='Books Maintained From Date'
                type="date"
                value={formData.booksOfAccountFromDate}
                onChange={(e) => handleInputChange('booksOfAccountFromDate', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Books Maintained To Date</label>
              <input
                title='Books Maintained To Date'
                type="date"
                value={formData.booksOfAccountToDate}
                onChange={(e) => handleInputChange('booksOfAccountToDate', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
              />
            </div>
          </div>
          
          {formData.booksOfAccountMaintained === 'No' && (
            <div className="mt-6">
              <label className="block text-sm font-medium mb-2">Reason for Not Maintaining Books</label>
              <textarea
                value={formData.reasonForNotMaintaining}
                onChange={(e) => handleInputChange('reasonForNotMaintaining', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
                rows={3}
                placeholder="Explain the reason for not maintaining books of account"
              />
            </div>
          )}
        </div>

        {/* Part D - Financial Particulars */}
        <div className={`rounded-xl border p-6 ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-2 border-b pb-3 border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-xl font-semibold text-orange-600">Part D - Financial Particulars</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Financial records calculated for the selected company and financial year
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <Building2 size={13} /> {companyInfo?.name || "Active Company"}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                <Calendar size={13} /> FY {selectedFinYear || "Active Period"}
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Gross Receipts (₹)</label>
              <input
                type="number"
                value={formData.grossReceipts}
                onChange={(e) => handleInputChange('grossReceipts', parseFloat(e.target.value) || 0)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1">{formatCurrency(formData.grossReceipts)}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Total Sales (₹)</label>
              <input
                type="number"
                value={formData.totalSales}
                onChange={(e) => handleInputChange('totalSales', parseFloat(e.target.value) || 0)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1">{formatCurrency(formData.totalSales)}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Total Purchases (₹)</label>
              <input
                type="number"
                value={formData.totalPurchases}
                onChange={(e) => handleInputChange('totalPurchases', parseFloat(e.target.value) || 0)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1">{formatCurrency(formData.totalPurchases)}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Gross Profit (₹)</label>
              <input
                type="number"
                value={formData.grossProfit}
                onChange={(e) => handleInputChange('grossProfit', parseFloat(e.target.value) || 0)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1">{formatCurrency(formData.grossProfit)}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Total Expenses (₹)</label>
              <input
                type="number"
                value={formData.totalExpenses}
                onChange={(e) => handleInputChange('totalExpenses', parseFloat(e.target.value) || 0)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1">{formatCurrency(formData.totalExpenses)}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Net Profit (₹)</label>
              <input
                type="number"
                value={formData.netProfit}
                onChange={(e) => handleInputChange('netProfit', parseFloat(e.target.value) || 0)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1">{formatCurrency(formData.netProfit)}</p>
            </div>
          </div>
          
          <div className="mt-6">
            <label className="block text-sm font-medium mb-2">Depreciation Claimed (₹)</label>
            <input
              type="number"
              value={formData.depreciationClaimed}
              onChange={(e) => handleInputChange('depreciationClaimed', parseFloat(e.target.value) || 0)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                theme === 'dark' 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300'
              }`}
              placeholder="0.00"
            />
            <p className="text-xs text-gray-500 mt-1">{formatCurrency(formData.depreciationClaimed)}</p>
          </div>
          
          {/* Financial Summary */}
          <div className={`mt-6 p-4 rounded-lg border ${
            theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
          }`}>
            <h4 className="font-semibold mb-3">Financial Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Gross Receipts:</span>
                <p className="font-medium">{formatCurrency(formData.grossReceipts)}</p>
              </div>
              <div>
                <span className="text-gray-500">Total Expenses:</span>
                <p className="font-medium">{formatCurrency(formData.totalExpenses)}</p>
              </div>
              <div>
                <span className="text-gray-500">Net Profit:</span>
                <p className="font-medium text-green-600">{formatCurrency(formData.netProfit)}</p>
              </div>
              <div>
                <span className="text-gray-500">Profit Margin:</span>
                <p className="font-medium">
                  {formData.grossReceipts > 0 ? ((formData.netProfit / formData.grossReceipts) * 100).toFixed(2) : 0}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Part E - Method of Accounting */}
        <div className={`rounded-xl border p-6 ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <h2 className="text-xl font-semibold mb-6 text-teal-600">Part E - Method of Accounting</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Method of Accounting *</label>
              <select
                title='Method of Accounting'
                value={formData.methodOfAccounting}
                onChange={(e) => handleInputChange('methodOfAccounting', e.target.value as 'Cash' | 'Mercantile' | 'Hybrid')}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
              >
                <option value="Cash">Cash System</option>
                <option value="Mercantile">Mercantile System</option>
                <option value="Hybrid">Hybrid System</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Inventory Valuation Method</label>
              <select
                title='Inventory Valuation Method'
                value={formData.inventoryValuationMethod}
                onChange={(e) => handleInputChange('inventoryValuationMethod', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
              >
                <option value="">Select Method</option>
                <option value="FIFO">First In First Out (FIFO)</option>
                <option value="LIFO">Last In First Out (LIFO)</option>
                <option value="WeightedAverage">Weighted Average</option>
                <option value="SpecificIdentification">Specific Identification</option>
                <option value="StandardCost">Standard Cost</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Depreciation Method</label>
              <select
              title='Depreciation Method'
                value={formData.depreciationMethod}
                onChange={(e) => handleInputChange('depreciationMethod', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
              >
                <option value="">Select Method</option>
                <option value="StraightLine">Straight Line Method</option>
                <option value="WrittenDownValue">Written Down Value Method</option>
                <option value="DoubleDeclining">Double Declining Balance</option>
                <option value="SumOfYears">Sum of Years Digits</option>
                <option value="UnitsOfProduction">Units of Production</option>
              </select>
            </div>
          </div>
          
          {/* Accounting Method Info */}
          <div className={`mt-6 p-4 rounded-lg border ${
            theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-blue-50 border-blue-200'
          }`}>
            <h4 className="font-semibold mb-2">Accounting Method Information</h4>
            <div className="text-sm space-y-1">
              {formData.methodOfAccounting === 'Cash' && (
                <p>Cash System: Income and expenses are recorded when cash is received or paid.</p>
              )}
              {formData.methodOfAccounting === 'Mercantile' && (
                <p>Mercantile System: Income and expenses are recorded when they are earned or incurred, regardless of cash flow.</p>
              )}
              {formData.methodOfAccounting === 'Hybrid' && (
                <p>Hybrid System: Combination of cash and mercantile systems for different types of transactions.</p>
              )}
            </div>
          </div>
        </div>

        {/* Part F - Tax Audit Observations */}
        <div className={`rounded-xl border p-6 ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <h2 className="text-xl font-semibold mb-6 text-red-600">Part F - Tax Audit Observations</h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Tax Audit Observations</label>
              <textarea
                value={formData.taxAuditObservations}
                onChange={(e) => handleInputChange('taxAuditObservations', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
                rows={4}
                placeholder="Enter detailed tax audit observations, if any"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Any Discrepancies Found? *</label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="Yes"
                    checked={formData.discrepanciesFound === 'Yes'}
                    onChange={(e) => handleInputChange('discrepanciesFound', e.target.value as 'Yes' | 'No')}
                    className="mr-2"
                  />
                  Yes
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="No"
                    checked={formData.discrepanciesFound === 'No'}
                    onChange={(e) => handleInputChange('discrepanciesFound', e.target.value as 'Yes' | 'No')}
                    className="mr-2"
                  />
                  No
                </label>
              </div>
            </div>
            
            {formData.discrepanciesFound === 'Yes' && (
              <div>
                <label className="block text-sm font-medium mb-2">Discrepancy Details</label>
                <textarea
                  value={formData.discrepancyDetails}
                  onChange={(e) => handleInputChange('discrepancyDetails', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    theme === 'dark' 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300'
                  }`}
                  rows={4}
                  placeholder="Provide detailed explanation of discrepancies found"
                />
              </div>
            )}
          </div>
        </div>

        {/* Part G - Other Information */}
        <div className={`rounded-xl border p-6 ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <h2 className="text-xl font-semibold mb-6 text-indigo-600">Part G - Other Information</h2>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Applicability of Section 44AB *</label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="Yes"
                      checked={formData.applicabilityOfSection44AB === 'Yes'}
                      onChange={(e) => handleInputChange('applicabilityOfSection44AB', e.target.value as 'Yes' | 'No')}
                      className="mr-2"
                    />
                    Yes
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="No"
                      checked={formData.applicabilityOfSection44AB === 'No'}
                      onChange={(e) => handleInputChange('applicabilityOfSection44AB', e.target.value as 'Yes' | 'No')}
                      className="mr-2"
                    />
                    No
                  </label>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Applicability of Section 44AD *</label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="Yes"
                      checked={formData.applicabilityOfSection44AD === 'Yes'}
                      onChange={(e) => handleInputChange('applicabilityOfSection44AD', e.target.value as 'Yes' | 'No')}
                      className="mr-2"
                    />
                    Yes
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="No"
                      checked={formData.applicabilityOfSection44AD === 'No'}
                      onChange={(e) => handleInputChange('applicabilityOfSection44AD', e.target.value as 'Yes' | 'No')}
                      className="mr-2"
                    />
                    No
                  </label>
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Any Other Information</label>
              <textarea
                value={formData.anyOtherInformation}
                onChange={(e) => handleInputChange('anyOtherInformation', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  theme === 'dark' 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
                rows={4}
                placeholder="Enter any other relevant information"
              />
            </div>
            
            {/* Compliance Summary */}
            <div className={`p-4 rounded-lg border ${
              theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-green-50 border-green-200'
            }`}>
              <h4 className="font-semibold mb-3">Compliance Summary</h4>
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span>Section 44AB Applicable:</span>
                  <span className="font-medium">{formData.applicabilityOfSection44AB}</span>
                </div>
                <div className="flex justify-between">
                  <span>Section 44AD Applicable:</span>
                  <span className="font-medium">{formData.applicabilityOfSection44AD}</span>
                </div>
                <div className="flex justify-between">
                  <span>Books of Account Maintained:</span>
                  <span className="font-medium">{formData.booksOfAccountMaintained}</span>
                </div>
                <div className="flex justify-between">
                  <span>Accounting Method:</span>
                  <span className="font-medium">{formData.methodOfAccounting}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form Info */}
      <div className={`mt-8 p-4 rounded-lg border ${
        theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-blue-200'
      }`}>
        <div className="flex items-start">
          <AlertCircle size={20} className="text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-blue-800 mb-1">Form 3CB Information</p>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              Form 3CB is required to be filed by entities whose accounts are required to be audited under Section 44AB. 
              This form contains details of tax audit report and must be filed before the due date.
            </p>
            <ul className={`mt-2 space-y-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              <li>• All mandatory fields marked with (*) must be filled</li>
              <li>• Financial figures should be in Indian Rupees</li>
              <li>• Save your progress regularly using the "Save" button</li>
              <li>• Review all sections before final submission</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Form3CB;

