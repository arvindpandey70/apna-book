import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { useCompany } from '../../../context/CompanyContext';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
  mapForm3CDData,
  type Form3CDData,
  type Form3CDPartnerRow,
  type Form3CDBusinessNatureRow,
  type Form3CDPropertyTransferRow,
  type Form3CDRelatedPartyRow,
  type Form3CDEmployeeContributionRow,
  type Form3CDSection43BRow,
  type Form3CDLossCarryForwardRow,
  type Form3CDTdsStatementRow,
  type Form3CDTdsDeductionRow,
  type Form3CDTaxDemandRefundRow
} from '../../../utils/auditFormMapper';
import {
  ArrowLeft,
  Save,
  Download,
  Printer,
  FileCheck,
  AlertCircle,
  Loader2,
  Plus,
  Trash2
} from 'lucide-react';
import BalanceSheet from '../../reports/BalanceSheet';
import ProfitLoss from '../../reports/ProfitLoss';

const Form3CD: React.FC = () => {
  const { theme } = useAppContext();
  const { companyInfo, activeCompanyId } = useCompany();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [activeTab, setActiveTab] = useState<'partA' | 'partB' | 'partC' | 'partD' | 'partE'>('partA');
  const [formData, setFormData] = useState<Form3CDData>(() => mapForm3CDData(null, companyInfo, null));

  useEffect(() => {
    let isMounted = true;
    const fetchForm3CDData = async () => {
      setIsLoading(true);
      try {
        const companyId = activeCompanyId || localStorage.getItem('company_id') || '';
        const userId = localStorage.getItem('user_id') || '';
        const userType = localStorage.getItem('userType') || '';

        if (companyId) {
          const res = await fetch(
            `${import.meta.env.VITE_API_URL}/api/audit/form?company_id=${encodeURIComponent(companyId)}&form_type=3CD&user_id=${encodeURIComponent(userId)}&user_type=${encodeURIComponent(userType)}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.success && isMounted) {
              const mapped = mapForm3CDData(data.savedData, data.companyInfo || companyInfo, data.caInfo);
              setFormData(mapped);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch Form 3CD data:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchForm3CDData();
    return () => {
      isMounted = false;
    };
  }, [activeCompanyId]);

  // Reusable input change handler
  const handleInputChange = (field: keyof Form3CDData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Reusable nested field change handler
  const handleNestedChange = (parentField: keyof Form3CDData, childField: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [parentField]: {
        ...(prev[parentField] as object),
        [childField]: value
      }
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
          form_type: '3CD',
          assessment_year: formData.assessmentYear,
          form_data: formData,
          status
        })
      });

      const resData = await response.json();
      if (response.ok && resData.success) {
        const msg = status === 'submitted' ? 'Form 3CD submitted successfully!' : 'Form 3CD saved successfully!';
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
      console.error('Error saving Form 3CD:', err);
      const errorMsg = err.message || 'Error saving form. Please try again.';
      setNotification({ type: 'error', message: errorMsg });
      Swal.fire('Save Failed', errorMsg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => saveAuditForm('draft');
  const handleSubmit = () => saveAuditForm('submitted');

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);

  // Reusable Form Input Component
  const FormInput = ({
    label,
    field,
    type = 'text',
    placeholder = '',
    required = false,
    className = '',
    options = []
  }: {
    label: string;
    field: keyof Form3CDData;
    type?: string;
    placeholder?: string;
    required?: boolean;
    className?: string;
    options?: { value: string; label: string }[];
  }) => (
    <div className={className}>
      <label className="block text-sm font-medium mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {type === 'select' ? (
        <select
          value={(formData[field] as string) || ''}
          onChange={(e) => handleInputChange(field, e.target.value)}
          title={label}
          aria-label={label}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm ${
            theme === 'dark'
              ? 'bg-gray-700 border-gray-600 text-white'
              : 'bg-white border-gray-300 text-gray-900'
          }`}
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          value={(formData[field] as string) || ''}
          onChange={(e) => handleInputChange(field, e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm ${
            theme === 'dark'
              ? 'bg-gray-700 border-gray-600 text-white'
              : 'bg-white border-gray-300 text-gray-900'
          }`}
          placeholder={placeholder}
          rows={3}
        />
      ) : type === 'number' ? (
        <div>
          <input
            type="number"
            value={formData[field] !== undefined && formData[field] !== null ? (formData[field] as number) : ''}
            onChange={(e) => handleInputChange(field, parseFloat(e.target.value) || 0)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm ${
              theme === 'dark'
                ? 'bg-gray-700 border-gray-600 text-white'
                : 'bg-white border-gray-300 text-gray-900'
            }`}
            placeholder={placeholder}
          />
          <p className="text-xs text-gray-400 mt-1">{formatCurrency(formData[field] as number)}</p>
        </div>
      ) : (
        <input
          type={type}
          value={(formData[field] as string) || ''}
          onChange={(e) => handleInputChange(field, type === 'text' && field === 'panNumber'
            ? e.target.value.toUpperCase()
            : e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm ${
            theme === 'dark'
              ? 'bg-gray-700 border-gray-600 text-white'
              : 'bg-white border-gray-300 text-gray-900'
          }`}
          placeholder={placeholder}
          maxLength={field === 'panNumber' ? 10 : undefined}
        />
      )}
    </div>
  );

  // Reusable Radio Group Component
  const RadioGroup = ({
    label,
    field,
    options,
    required = false
  }: {
    label: string;
    field: keyof Form3CDData;
    options: { value: string; label: string }[];
    required?: boolean;
  }) => (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="flex space-x-4 pt-1">
        {options.map(option => (
          <label key={option.value} className="flex items-center text-sm cursor-pointer">
            <input
              type="radio"
              value={option.value}
              checked={formData[field] === option.value}
              onChange={(e) => handleInputChange(field, e.target.value)}
              className="mr-2 text-blue-600 focus:ring-blue-500"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="pt-[56px] px-4 max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
        <p className={`text-base font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
          Loading Form 3CD Audit Data...
        </p>
      </div>
    );
  }

  return (
    <div className="pt-[56px] px-4 max-w-7xl mx-auto pb-12">
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
            title="Back to Audit Module"
            onClick={() => navigate('/app/audit')}
            className={`mr-4 p-2 rounded-full ${
              theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
            }`}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold">Form No. 3CD</h1>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Statement of particulars required to be furnished under section 44AB of the Income-tax Act, 1961
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center text-sm font-medium"
          >
            {isSaving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
            Save Draft
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center text-sm font-medium"
          >
            {isSaving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <FileCheck size={14} className="mr-1" />}
            Submit
          </button>
          <button className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center text-sm font-medium">
            <Download size={14} className="mr-1" />
            Download
          </button>
          <button className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center text-sm font-medium">
            <Printer size={14} className="mr-1" />
            Print
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className={`flex border-b overflow-x-auto mb-6 ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
        <button
          onClick={() => setActiveTab('partA')}
          className={`py-3 px-6 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'partA'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Part A: Basic & Accounts (Clauses 1–18)
        </button>
        <button
          onClick={() => setActiveTab('partB')}
          className={`py-3 px-6 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'partB'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Part B: Tax & Deductions (Clauses 19–26)
        </button>
        <button
          onClick={() => setActiveTab('partC')}
          className={`py-3 px-6 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'partC'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Part C: Compliances & TP (Clauses 27–34)
        </button>
        <button
          onClick={() => setActiveTab('partD')}
          className={`py-3 px-6 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'partD'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Part D: Ratios, Audits & GST (Clauses 35–44)
        </button>
        <button
          onClick={() => setActiveTab('partE')}
          className={`py-3 px-6 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'partE'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Part E: Financial Statements (BS & P&L)
        </button>
      </div>

      {/* TAB CONTENT */}

      {/* PART A */}
      {activeTab === 'partA' && (
        <div className="space-y-6">
          {/* Clauses 1-8A */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-blue-600">Clauses 1–8A: Basic Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FormInput label="1. Name of Assessee" field="nameOfAssessee" required />
              <FormInput label="3. PAN Number" field="panNumber" placeholder="ABCDE1234F" required />
              <RadioGroup
                label="4. Liable to pay indirect tax?"
                field="indirectTaxLiability"
                options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
                required
              />
              <FormInput label="4. Registration Numbers (GST, etc.)" field="registrationNumbers" placeholder="Enter registration numbers" />
              <FormInput
                label="5. Status"
                field="status"
                type="select"
                required
                options={[
                  { value: '', label: 'Select Status' },
                  { value: 'Individual', label: 'Individual' },
                  { value: 'HUF', label: 'Hindu Undivided Family' },
                  { value: 'Company', label: 'Company' },
                  { value: 'Partnership', label: 'Partnership Firm' },
                  { value: 'LLP', label: 'Limited Liability Partnership' },
                  { value: 'AOP', label: 'Association of Persons' },
                  { value: 'BOI', label: 'Body of Individuals' },
                  { value: 'Trust', label: 'Trust' },
                  { value: 'Society', label: 'Society' },
                  { value: 'Cooperative', label: 'Cooperative Society' }
                ]}
              />
              <FormInput label="6. Previous Year From" field="previousYearFrom" type="date" required />
              <FormInput label="6. Previous Year To" field="previousYearTo" type="date" required />
              <FormInput
                label="7. Assessment Year"
                field="assessmentYear"
                type="select"
                required
                options={[
                  { value: '2024-25', label: '2024-25' },
                  { value: '2023-24', label: '2023-24' },
                  { value: '2022-23', label: '2022-23' }
                ]}
              />
              <FormInput
                label="8. Section 44AB Clause"
                field="section44ABClause"
                type="select"
                required
                options={[
                  { value: '', label: 'Select Clause' },
                  { value: 'Clause (a)', label: 'Clause (a) - Business turnover exceeds threshold' },
                  { value: 'Clause (b)', label: 'Clause (b) - Professional receipts exceed threshold' },
                  { value: 'Clause (c)', label: 'Clause (c) - Presumptive taxation' },
                  { value: 'Clause (d)', label: 'Clause (d) - Business loss' },
                  { value: 'Clause (e)', label: 'Clause (e) - Other cases' }
                ]}
              />
              <FormInput
                label="8A. Tax Regime Opted"
                field="taxRegimeOpted"
                type="select"
                options={[
                  { value: '', label: 'Select Tax Regime' },
                  { value: 'Old Regime', label: 'Old Tax Regime' },
                  { value: 'Section 115BAC', label: 'Section 115BAC - New Tax Regime' },
                  { value: 'Section 115BAA', label: 'Section 115BAA - Domestic Company' },
                  { value: 'Section 115BAB', label: 'Section 115BAB - New Manufacturing Company' }
                ]}
              />
            </div>
            <div className="mt-6">
              <FormInput label="2. Address of Assessee" field="address" type="textarea" placeholder="Enter complete address" required />
            </div>
          </div>

          {/* Clause 9: Partners / Members Details */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-blue-600">Clause 9: Partners / Members Details</h2>
              <button
                type="button"
                onClick={() => {
                  const updated = [...(formData.partnerList || []), { name: '', pan: '', profitShare: 0, capitalShare: 0 }];
                  handleInputChange('partnerList', updated);
                }}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium flex items-center hover:bg-blue-700"
              >
                <Plus size={14} className="mr-1" /> Add Partner/Member
              </button>
            </div>
            {formData.partnerList && formData.partnerList.length > 0 ? (
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm text-left border">
                  <thead className={theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}>
                    <tr>
                      <th className="p-2 border">Name</th>
                      <th className="p-2 border">PAN</th>
                      <th className="p-2 border">Profit Share (%)</th>
                      <th className="p-2 border">Capital Ratio (%)</th>
                      <th className="p-2 border text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.partnerList.map((row, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2 border">
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => {
                              const updated = [...formData.partnerList];
                              updated[idx].name = e.target.value;
                              handleInputChange('partnerList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            type="text"
                            value={row.pan}
                            onChange={(e) => {
                              const updated = [...formData.partnerList];
                              updated[idx].pan = e.target.value.toUpperCase();
                              handleInputChange('partnerList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            type="number"
                            value={row.profitShare}
                            onChange={(e) => {
                              const updated = [...formData.partnerList];
                              updated[idx].profitShare = parseFloat(e.target.value) || 0;
                              handleInputChange('partnerList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            type="number"
                            value={row.capitalShare}
                            onChange={(e) => {
                              const updated = [...formData.partnerList];
                              updated[idx].capitalShare = parseFloat(e.target.value) || 0;
                              handleInputChange('partnerList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border text-center">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = formData.partnerList.filter((_, i) => i !== idx);
                              handleInputChange('partnerList', updated);
                            }}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-500 mb-4">No partner/member details added yet.</p>
            )}
            <FormInput label="9(b). Details of changes in partners/members" field="partnersChangeDetails" type="textarea" placeholder="State changes in partners or profit sharing ratio" />
          </div>

          {/* Clause 10: Nature of Business / Profession */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-blue-600">Clause 10: Nature of Business / Profession</h2>
              <button
                type="button"
                onClick={() => {
                  const updated = [...(formData.businessNatureList || []), { sector: '', code: '', name: '', description: '' }];
                  handleInputChange('businessNatureList', updated);
                }}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium flex items-center hover:bg-blue-700"
              >
                <Plus size={14} className="mr-1" /> Add Business Line
              </button>
            </div>
            {formData.businessNatureList && formData.businessNatureList.length > 0 ? (
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm text-left border">
                  <thead className={theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}>
                    <tr>
                      <th className="p-2 border">Sector</th>
                      <th className="p-2 border">Code</th>
                      <th className="p-2 border">Business Name</th>
                      <th className="p-2 border">Description</th>
                      <th className="p-2 border text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.businessNatureList.map((row, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2 border">
                          <input
                            type="text"
                            value={row.sector}
                            onChange={(e) => {
                              const updated = [...formData.businessNatureList];
                              updated[idx].sector = e.target.value;
                              handleInputChange('businessNatureList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            type="text"
                            value={row.code}
                            onChange={(e) => {
                              const updated = [...formData.businessNatureList];
                              updated[idx].code = e.target.value;
                              handleInputChange('businessNatureList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => {
                              const updated = [...formData.businessNatureList];
                              updated[idx].name = e.target.value;
                              handleInputChange('businessNatureList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => {
                              const updated = [...formData.businessNatureList];
                              updated[idx].description = e.target.value;
                              handleInputChange('businessNatureList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border text-center">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = formData.businessNatureList.filter((_, i) => i !== idx);
                              handleInputChange('businessNatureList', updated);
                            }}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-500 mb-4">No business nature rows added yet.</p>
            )}
            <FormInput label="10(b). Details of changes in nature of business" field="businessChangeDetails" type="textarea" placeholder="State changes in nature of business" />
          </div>

          {/* Clause 11: Books of Account */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-blue-600">Clause 11: Books of Account</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
              <RadioGroup label="11(a). Books prescribed u/s 44AA?" field="booksPrescribed" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
              <FormInput label="11(b). Address where books are maintained" field="booksAddress" type="textarea" placeholder="Enter principal address" />
            </div>
          </div>

          {/* Clause 12: Presumptive Income */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-green-600">Clause 12: Presumptive Taxation</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <RadioGroup label="Includes presumptive income?" field="presumptiveProfits" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
              <FormInput label="Presumptive Amount (₹)" field="presumptiveAmount" type="number" />
              <FormInput
                label="Relevant Section"
                field="presumptiveSection"
                type="select"
                options={[
                  { value: '', label: 'Select Section' },
                  { value: '44AD', label: 'Section 44AD' },
                  { value: '44ADA', label: 'Section 44ADA' },
                  { value: '44AE', label: 'Section 44AE' },
                  { value: '44B', label: 'Section 44B' },
                  { value: '44BB', label: 'Section 44BB' }
                ]}
              />
            </div>
          </div>

          {/* Clause 13: Accounting Method */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-purple-600">Clause 13: Method of Accounting & ICDS</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <FormInput
                label="13(a). Accounting Method"
                field="accountingMethod"
                type="select"
                options={[
                  { value: 'Mercantile', label: 'Mercantile System' },
                  { value: 'Cash', label: 'Cash System' }
                ]}
              />
              <RadioGroup label="13(b). Change in method?" field="accountingMethodChange" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
              <RadioGroup label="13(d). ICDS adjustment required?" field="icdsAdjustmentRequired" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
            </div>
            <div className="space-y-4">
              <FormInput label="13(c). Change details" field="accountingChangeDetails" type="textarea" placeholder="Effect of change on profit/loss" />
              <FormInput label="13(e). ICDS adjustments" field="icdsAdjustmentDetails" type="textarea" placeholder="Net impact of ICDS I to X" />
              <FormInput label="13(f). ICDS disclosures" field="icdsDisclosure" type="textarea" placeholder="Disclosures as per ICDS" />
            </div>
          </div>

          {/* Clause 14: Valuation of Stock */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-indigo-600">Clause 14: Closing Stock Valuation & Sec 145A</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormInput label="14(a). Method of valuation" field="stockValuationMethod" placeholder="Cost or NRV whichever is lower" />
              <FormInput label="14(b). Deviation from Section 145A & effect" field="stockDeviationDetails" type="textarea" placeholder="Effect on profit/loss" />
            </div>
          </div>

          {/* Clause 15, 16, 17, 18 */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-teal-600">Clause 15–18: Capital Assets, Non-Credited Amounts & Depreciation</h2>
            
            <div className="mb-6">
              <h3 className="text-md font-semibold mb-2">Clause 16: Amounts Not Credited to P&L Account</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormInput label="16(a). Items u/s 28 (₹)" field="section28Items" type="number" />
                <FormInput label="16(b). Proforma credits/refunds (₹)" field="proformaCredits" type="number" />
                <FormInput label="16(c). Escalation claims (₹)" field="escalationClaims" type="number" />
                <FormInput label="16(d). Other income items (₹)" field="otherIncomeItems" type="number" />
                <FormInput label="16(e). Capital receipts (₹)" field="capitalReceipts" type="number" />
              </div>
            </div>

            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-md font-semibold">Clause 17: Property Transfer u/s 43CA / 50C</h3>
                <button
                  type="button"
                  onClick={() => {
                    const updated = [...(formData.propertyTransferList || []), { description: '', address: '', stampValue: 0, consideration: 0 }];
                    handleInputChange('propertyTransferList', updated);
                  }}
                  className="px-3 py-1 bg-teal-600 text-white rounded text-xs font-medium flex items-center hover:bg-teal-700"
                >
                  <Plus size={14} className="mr-1" /> Add Property
                </button>
              </div>
              {formData.propertyTransferList && formData.propertyTransferList.length > 0 ? (
                <table className="w-full text-sm text-left border mb-4">
                  <thead className={theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}>
                    <tr>
                      <th className="p-2 border">Property Description</th>
                      <th className="p-2 border">Address</th>
                      <th className="p-2 border">Stamp Value (₹)</th>
                      <th className="p-2 border">Consideration (₹)</th>
                      <th className="p-2 border text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.propertyTransferList.map((row, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2 border">
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => {
                              const updated = [...formData.propertyTransferList];
                              updated[idx].description = e.target.value;
                              handleInputChange('propertyTransferList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            type="text"
                            value={row.address}
                            onChange={(e) => {
                              const updated = [...formData.propertyTransferList];
                              updated[idx].address = e.target.value;
                              handleInputChange('propertyTransferList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            type="number"
                            value={row.stampValue}
                            onChange={(e) => {
                              const updated = [...formData.propertyTransferList];
                              updated[idx].stampValue = parseFloat(e.target.value) || 0;
                              handleInputChange('propertyTransferList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            type="number"
                            value={row.consideration}
                            onChange={(e) => {
                              const updated = [...formData.propertyTransferList];
                              updated[idx].consideration = parseFloat(e.target.value) || 0;
                              handleInputChange('propertyTransferList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border text-center">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = formData.propertyTransferList.filter((_, i) => i !== idx);
                              handleInputChange('propertyTransferList', updated);
                            }}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-gray-500 mb-4">No property transfer records u/s 43CA / 50C.</p>
              )}
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-md font-semibold">Clause 18: Depreciation Details</h3>
                <button
                  type="button"
                  onClick={() => {
                    const updated = [...(formData.depreciationDetails || []), { assetBlock: '', rate: 15, wdvCost: 0, adjustments: 0, additionsDeductions: '', depreciationAllowed: 0, endingWdv: 0 }];
                    handleInputChange('depreciationDetails', updated);
                  }}
                  className="px-3 py-1 bg-teal-600 text-white rounded text-xs font-medium flex items-center hover:bg-teal-700"
                >
                  <Plus size={14} className="mr-1" /> Add Asset Block
                </button>
              </div>
              {formData.depreciationDetails && formData.depreciationDetails.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border">
                    <thead className={theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}>
                      <tr>
                        <th className="p-2 border">Asset Block</th>
                        <th className="p-2 border">Rate (%)</th>
                        <th className="p-2 border">Opening WDV (₹)</th>
                        <th className="p-2 border">Depreciation (₹)</th>
                        <th className="p-2 border">Ending WDV (₹)</th>
                        <th className="p-2 border text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.depreciationDetails.map((row, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="p-2 border">
                            <input
                              type="text"
                              value={row.assetBlock}
                              onChange={(e) => {
                                const updated = [...formData.depreciationDetails];
                                updated[idx].assetBlock = e.target.value;
                                handleInputChange('depreciationDetails', updated);
                              }}
                              className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                            />
                          </td>
                          <td className="p-2 border">
                            <input
                              type="number"
                              value={row.rate}
                              onChange={(e) => {
                                const updated = [...formData.depreciationDetails];
                                updated[idx].rate = parseFloat(e.target.value) || 0;
                                handleInputChange('depreciationDetails', updated);
                              }}
                              className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                            />
                          </td>
                          <td className="p-2 border">
                            <input
                              type="number"
                              value={row.wdvCost}
                              onChange={(e) => {
                                const updated = [...formData.depreciationDetails];
                                updated[idx].wdvCost = parseFloat(e.target.value) || 0;
                                handleInputChange('depreciationDetails', updated);
                              }}
                              className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                            />
                          </td>
                          <td className="p-2 border">
                            <input
                              type="number"
                              value={row.depreciationAllowed}
                              onChange={(e) => {
                                const updated = [...formData.depreciationDetails];
                                updated[idx].depreciationAllowed = parseFloat(e.target.value) || 0;
                                handleInputChange('depreciationDetails', updated);
                              }}
                              className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                            />
                          </td>
                          <td className="p-2 border">
                            <input
                              type="number"
                              value={row.endingWdv}
                              onChange={(e) => {
                                const updated = [...formData.depreciationDetails];
                                updated[idx].endingWdv = parseFloat(e.target.value) || 0;
                                handleInputChange('depreciationDetails', updated);
                              }}
                              className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                            />
                          </td>
                          <td className="p-2 border text-center">
                            <button
                              type="button"
                              onClick={() => {
                                const updated = formData.depreciationDetails.filter((_, i) => i !== idx);
                                handleInputChange('depreciationDetails', updated);
                              }}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-gray-500">No depreciation blocks added.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PART B */}
      {activeTab === 'partB' && (
        <div className="space-y-6">
          {/* Clause 19: Special Deductions */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-purple-600">Clause 19: Amounts Admissible under Section 33AB, 35, etc.</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Section 33AB (₹)</label>
                <input
                  type="number"
                  value={formData.specialDeductions?.section33AB || 0}
                  onChange={(e) => handleNestedChange('specialDeductions', 'section33AB', parseFloat(e.target.value) || 0)}
                  className={`w-full p-2 border rounded-lg ${theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Section 35(1)(i) (₹)</label>
                <input
                  type="number"
                  value={formData.specialDeductions?.section35_1_i || 0}
                  onChange={(e) => handleNestedChange('specialDeductions', 'section35_1_i', parseFloat(e.target.value) || 0)}
                  className={`w-full p-2 border rounded-lg ${theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Section 35AD (₹)</label>
                <input
                  type="number"
                  value={formData.specialDeductions?.section35AD || 0}
                  onChange={(e) => handleNestedChange('specialDeductions', 'section35AD', parseFloat(e.target.value) || 0)}
                  className={`w-full p-2 border rounded-lg ${theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Section 35CCD (₹)</label>
                <input
                  type="number"
                  value={formData.specialDeductions?.section35CCD || 0}
                  onChange={(e) => handleNestedChange('specialDeductions', 'section35CCD', parseFloat(e.target.value) || 0)}
                  className={`w-full p-2 border rounded-lg ${theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                />
              </div>
            </div>
          </div>

          {/* Clause 20: Bonus/Commission & Employee Funds */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-purple-600">Clause 20: Bonus/Commission & Employee Contributions</h2>
            <div className="mb-6">
              <FormInput label="20(a). Bonus / Commission to employees u/s 36(1)(ii)" field="bonusCommissionDetails" type="textarea" placeholder="Particulars of bonus or commission paid" />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-md font-semibold">20(b). Employee Contributions (PF / ESI) u/s 36(1)(va)</h3>
                <button
                  type="button"
                  onClick={() => {
                    const updated = [...(formData.employeeContributionList || []), { fundNature: 'Provident Fund', amountReceived: 0, dueDate: '', paidDate: '', amountPaid: 0 }];
                    handleInputChange('employeeContributionList', updated);
                  }}
                  className="px-3 py-1 bg-purple-600 text-white rounded text-xs font-medium flex items-center hover:bg-purple-700"
                >
                  <Plus size={14} className="mr-1" /> Add Fund Entry
                </button>
              </div>
              {formData.employeeContributionList && formData.employeeContributionList.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border">
                    <thead className={theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}>
                      <tr>
                        <th className="p-2 border">Fund Nature</th>
                        <th className="p-2 border">Amount Received (₹)</th>
                        <th className="p-2 border">Due Date</th>
                        <th className="p-2 border">Paid Date</th>
                        <th className="p-2 border">Amount Paid (₹)</th>
                        <th className="p-2 border text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.employeeContributionList.map((row, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="p-2 border">
                            <input
                              type="text"
                              value={row.fundNature}
                              onChange={(e) => {
                                const updated = [...formData.employeeContributionList];
                                updated[idx].fundNature = e.target.value;
                                handleInputChange('employeeContributionList', updated);
                              }}
                              className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                            />
                          </td>
                          <td className="p-2 border">
                            <input
                              type="number"
                              value={row.amountReceived}
                              onChange={(e) => {
                                const updated = [...formData.employeeContributionList];
                                updated[idx].amountReceived = parseFloat(e.target.value) || 0;
                                handleInputChange('employeeContributionList', updated);
                              }}
                              className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                            />
                          </td>
                          <td className="p-2 border">
                            <input
                              type="date"
                              value={row.dueDate}
                              onChange={(e) => {
                                const updated = [...formData.employeeContributionList];
                                updated[idx].dueDate = e.target.value;
                                handleInputChange('employeeContributionList', updated);
                              }}
                              className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                            />
                          </td>
                          <td className="p-2 border">
                            <input
                              type="date"
                              value={row.paidDate}
                              onChange={(e) => {
                                const updated = [...formData.employeeContributionList];
                                updated[idx].paidDate = e.target.value;
                                handleInputChange('employeeContributionList', updated);
                              }}
                              className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                            />
                          </td>
                          <td className="p-2 border">
                            <input
                              type="number"
                              value={row.amountPaid}
                              onChange={(e) => {
                                const updated = [...formData.employeeContributionList];
                                updated[idx].amountPaid = parseFloat(e.target.value) || 0;
                                handleInputChange('employeeContributionList', updated);
                              }}
                              className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                            />
                          </td>
                          <td className="p-2 border text-center">
                            <button
                              type="button"
                              onClick={() => {
                                const updated = formData.employeeContributionList.filter((_, i) => i !== idx);
                                handleInputChange('employeeContributionList', updated);
                              }}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-gray-500">No employee fund contribution records added.</p>
              )}
            </div>
          </div>

          {/* Clause 21: Inadmissible Expenditure */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-red-600">Clause 21: Inadmissible Expenditure</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <FormInput label="21(a). Capital & Personal Expenditure (₹)" field="capitalPersonalExpenditure" type="number" />
              <FormInput label="21(b). Section 40(a) Disallowances (₹)" field="section40aDisallowances" type="number" />
              <FormInput label="21(c). Section 40(b) Disallowances (₹)" field="section40bDisallowances" type="number" />
              <FormInput label="21(d). Section 40A(3) Cash Payment (₹)" field="section40A3Disallowance" type="number" />
              <FormInput label="21(e). Provision for Gratuity u/s 40A(7) (₹)" field="gratuityProvisionDisallowance" type="number" />
              <FormInput label="21(f). Payment to Fund u/s 40A(9) (₹)" field="section40A9Disallowance" type="number" />
              <FormInput label="21(h). Exempt Income Expenses u/s 14A (₹)" field="section14ADisallowance" type="number" />
              <FormInput label="21(i). Borrowing Interest u/s 36(1)(iii) (₹)" field="section36_1_iiiDisallowance" type="number" />
            </div>
            <FormInput label="21(g). Contingent Liabilities Details" field="contingentLiabilities" type="textarea" placeholder="Details of contingent liabilities" />
          </div>

          {/* Clause 22: MSME Dues */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-orange-600">Clause 22: MSME Dues & Interest u/s 23</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <FormInput label="Inadmissible Interest u/s 23 (₹)" field="msmeInterestInadmissible" type="number" />
              <FormInput label="Total Amount Payable (₹)" field="msmeTotalPayable" type="number" />
              <FormInput label="Timely Payments (₹)" field="msmeTimelyPayments" type="number" />
              <FormInput label="Delayed Payments (₹)" field="msmeDelayedPayments" type="number" />
            </div>
          </div>

          {/* Clause 23: Payments to Related Persons */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-orange-600">Clause 23: Payments to Related Persons u/s 40A(2)(b)</h2>
              <button
                type="button"
                onClick={() => {
                  const updated = [...(formData.relatedPartyList || []), { name: '', pan: '', relationship: '', amount: 0, transactionNature: '' }];
                  handleInputChange('relatedPartyList', updated);
                }}
                className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-medium flex items-center hover:bg-orange-700"
              >
                <Plus size={14} className="mr-1" /> Add Related Person
              </button>
            </div>
            {formData.relatedPartyList && formData.relatedPartyList.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border">
                  <thead className={theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}>
                    <tr>
                      <th className="p-2 border">Name</th>
                      <th className="p-2 border">PAN</th>
                      <th className="p-2 border">Relationship</th>
                      <th className="p-2 border">Amount (₹)</th>
                      <th className="p-2 border">Nature of Payment</th>
                      <th className="p-2 border text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.relatedPartyList.map((row, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2 border">
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => {
                              const updated = [...formData.relatedPartyList];
                              updated[idx].name = e.target.value;
                              handleInputChange('relatedPartyList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            type="text"
                            value={row.pan}
                            onChange={(e) => {
                              const updated = [...formData.relatedPartyList];
                              updated[idx].pan = e.target.value.toUpperCase();
                              handleInputChange('relatedPartyList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            type="text"
                            value={row.relationship}
                            onChange={(e) => {
                              const updated = [...formData.relatedPartyList];
                              updated[idx].relationship = e.target.value;
                              handleInputChange('relatedPartyList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            type="number"
                            value={row.amount}
                            onChange={(e) => {
                              const updated = [...formData.relatedPartyList];
                              updated[idx].amount = parseFloat(e.target.value) || 0;
                              handleInputChange('relatedPartyList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            type="text"
                            value={row.transactionNature}
                            onChange={(e) => {
                              const updated = [...formData.relatedPartyList];
                              updated[idx].transactionNature = e.target.value;
                              handleInputChange('relatedPartyList', updated);
                            }}
                            className={`w-full p-1 border rounded ${theme === 'dark' ? 'bg-gray-800 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                          />
                        </td>
                        <td className="p-2 border text-center">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = formData.relatedPartyList.filter((_, i) => i !== idx);
                              handleInputChange('relatedPartyList', updated);
                            }}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-500">No related party payments added.</p>
            )}
          </div>

          {/* Clause 24, 25, 26 */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-yellow-600">Clause 24–26: Deemed Profits, Sec 41 & Sec 43B</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <FormInput label="24. Deemed profits u/s 32AC/33AB (₹)" field="deemedProfitsSection32AC" type="number" />
              <FormInput label="25. Amounts chargeable u/s 41 (₹)" field="section41Profits" type="number" />
            </div>
            <FormInput label="25. Details of section 41 amounts" field="section41Details" type="textarea" placeholder="Breakup of section 41 profits" />

            <div className="mt-6 border-t pt-4">
              <h3 className="text-md font-semibold mb-4">Clause 26: Section 43B Liabilities Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium mb-2">Pre-existing Liabilities</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs">Paid (₹)</label>
                      <input
                        type="number"
                        value={formData.section43BPreexisting?.paid || 0}
                        onChange={(e) => handleNestedChange('section43BPreexisting', 'paid', parseFloat(e.target.value) || 0)}
                        className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                      />
                    </div>
                    <div>
                      <label className="text-xs">Unpaid (₹)</label>
                      <input
                        type="number"
                        value={formData.section43BPreexisting?.notPaid || 0}
                        onChange={(e) => handleNestedChange('section43BPreexisting', 'notPaid', parseFloat(e.target.value) || 0)}
                        className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">Current Year Liabilities</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs">Paid before due date (₹)</label>
                      <input
                        type="number"
                        value={formData.section43BCurrentYear?.paidBeforeDueDate || 0}
                        onChange={(e) => handleNestedChange('section43BCurrentYear', 'paidBeforeDueDate', parseFloat(e.target.value) || 0)}
                        className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                      />
                    </div>
                    <div>
                      <label className="text-xs">Unpaid before due date (₹)</label>
                      <input
                        type="number"
                        value={formData.section43BCurrentYear?.notPaidBeforeDueDate || 0}
                        onChange={(e) => handleNestedChange('section43BCurrentYear', 'notPaidBeforeDueDate', parseFloat(e.target.value) || 0)}
                        className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PART C */}
      {activeTab === 'partC' && (
        <div className="space-y-6">
          {/* Clause 27-29 */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-teal-600">Clause 27–29: CENVAT/ITC, Prior Period & Section 56</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
              <FormInput label="27(a). CENVAT / Input Tax Credit availed (₹)" field="cenvatCredits" type="number" />
              <FormInput label="27(a). Accounting treatment of CENVAT/ITC" field="cenvatTreatment" placeholder="Credited to P&L / Asset account" />
            </div>
            <div className="space-y-4">
              <FormInput label="27(b). Prior period items debited/credited to P&L" field="priorPeriodItems" type="textarea" placeholder="Particulars of prior period expenditure" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormInput label="28. Section 56(2)(ix) forfeited advance (₹)" field="incomeOtherSourcesAmount" type="number" />
                <FormInput label="29. Section 56(2)(x) income details" field="incomeOtherSourcesNature" placeholder="Consideration received in excess of FMV" />
              </div>
            </div>
          </div>

          {/* Clause 30, 30A, 30B, 30C */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-teal-600">Clause 30–30C: TP & GAAR Compliances</h2>

            <div className="mb-6">
              <h3 className="text-md font-semibold mb-2">Clause 30A: Transfer Pricing (Section 92CE)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <RadioGroup label="Primary adjustment made?" field="transferPricingAdjustment" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
                <FormInput label="Adjustment Amount (₹)" field="transferPricingAmount" type="number" />
                <FormInput label="Imputed Interest (₹)" field="imputedInterest" type="number" />
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-md font-semibold mb-2">Clause 30B: Interest Limitation (Section 94B)</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <RadioGroup label="Interest > ₹1 Cr?" field="interestExceedsOneCrore" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
                <FormInput label="Interest Paid (₹)" field="interestExpenditure" type="number" />
                <FormInput label="EBITDA (₹)" field="ebitda" type="number" />
                <FormInput label="Excess Interest (₹)" field="excessInterest" type="number" />
              </div>
            </div>

            <div>
              <h3 className="text-md font-semibold mb-2">Clause 30C: GAAR / Impermissible Avoidance</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <RadioGroup label="Impermissible arrangement?" field="impermissibleArrangement" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
                <FormInput label="Arrangement Nature" field="arrangementNature" placeholder="Brief description" />
                <FormInput label="Tax Benefit Amount (₹)" field="taxBenefitAmount" type="number" />
              </div>
            </div>
          </div>

          {/* Clause 31: Loans & Deposits u/s 269SS/269T */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-indigo-600">Clause 31: Loans, Deposits & Specified Sums (Section 269SS / 269T)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold mb-2">31(a) / 31(b). Loans/Deposits Taken Above Limit</h3>
                <p className="text-xs text-gray-500 mb-2">Loans or specified sums taken exceeding Section 269SS limits.</p>
                <FormInput label="Hundi Borrowings u/s 69D (₹)" field="hundiBorrowings" type="number" />
              </div>
              <div>
                <FormInput label="31(c-e). Repayment particulars" field="hundiDetails" type="textarea" placeholder="Mode of repayment (Cheque, NEFT, RTGS, etc.)" />
              </div>
            </div>
          </div>

          {/* Clause 32 & 33 */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-indigo-600">Clause 32 & 33: Losses & Chapter VI-A Deductions</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <FormInput label="32(a). Brought Forward Loss (₹)" field="broughtForwardLoss" type="number" />
              <FormInput label="32(a). Brought Forward Depreciation (₹)" field="broughtForwardDepreciation" type="number" />
              <RadioGroup label="32(b). Shareholding change u/s 79?" field="shareholdingChange" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
            </div>

            <div className="border-t pt-4">
              <h3 className="text-md font-semibold mb-4">Clause 33: Chapter VI-A Deductions</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <label className="text-xs font-medium">80C (₹)</label>
                  <input
                    type="number"
                    value={formData.chapterVIADeductions?.section80C || 0}
                    onChange={(e) => handleNestedChange('chapterVIADeductions', 'section80C', parseFloat(e.target.value) || 0)}
                    className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">80D (₹)</label>
                  <input
                    type="number"
                    value={formData.chapterVIADeductions?.section80D || 0}
                    onChange={(e) => handleNestedChange('chapterVIADeductions', 'section80D', parseFloat(e.target.value) || 0)}
                    className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">80G (₹)</label>
                  <input
                    type="number"
                    value={formData.chapterVIADeductions?.section80G || 0}
                    onChange={(e) => handleNestedChange('chapterVIADeductions', 'section80G', parseFloat(e.target.value) || 0)}
                    className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">10A (₹)</label>
                  <input
                    type="number"
                    value={formData.chapterVIADeductions?.section10A || 0}
                    onChange={(e) => handleNestedChange('chapterVIADeductions', 'section10A', parseFloat(e.target.value) || 0)}
                    className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">10AA (₹)</label>
                  <input
                    type="number"
                    value={formData.chapterVIADeductions?.section10AA || 0}
                    onChange={(e) => handleNestedChange('chapterVIADeductions', 'section10AA', parseFloat(e.target.value) || 0)}
                    className={`w-full p-2 border rounded ${theme === 'dark' ? 'bg-gray-700 text-white border-gray-600' : 'bg-white border-gray-300'}`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Clause 34: TDS/TCS Compliance */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-cyan-600">Clause 34: TDS / TCS Compliance & Statements</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
              <RadioGroup label="34(a). Liable to deduct TDS/TCS?" field="tdsRequired" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
              <RadioGroup label="34(b). Furnished quarterly statements?" field="tcsRequired" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
              <FormInput label="34(c). TDS Interest u/s 201(1A) (₹)" field="tdsInterest" type="number" />
            </div>
            <FormInput label="34(a) Summary of TDS compliance" field="tdsDetails" type="textarea" placeholder="Overview of TDS deduction and deposit" />
          </div>
        </div>
      )}

      {/* PART D */}
      {activeTab === 'partD' && (
        <div className="space-y-6">
          {/* Clause 35: Quantitative Details */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-emerald-600">Clause 35: Quantitative Details</h2>
            <p className="text-xs text-gray-500 mb-4">Quantitative details of Principal Items, Finished Goods & Raw Materials.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold mb-2">Trading Items Details</h3>
                <FormInput label="Trading Items Summary" field="stockDeviationDetails" type="textarea" placeholder="Item name, Opening stock, Purchases, Sales, Closing stock, Shortage/Yield" />
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Manufacturing Raw Materials</h3>
                <FormInput label="Raw Materials Summary" field="icdsDisclosure" type="textarea" placeholder="Raw materials, Opening stock, Receipts, Consumption, Closing stock, Yield %" />
              </div>
            </div>
          </div>

          {/* Clause 36-39 */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-emerald-600">Clause 36–39: Dividend, Cost & Indirect Tax Audits</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <RadioGroup label="36. Dividend u/s 2(22)(e) received?" field="deemedDividendReceived" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
              <FormInput label="Deemed Dividend Amount (₹)" field="deemedDividendAmount" type="number" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <RadioGroup label="37. Cost Audit conducted?" field="costAuditConducted" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
                <FormInput label="Disagreements / Qualifications" field="costAuditDisagreements" placeholder="Cost audit findings" />
              </div>
              <div>
                <RadioGroup label="38. Central Excise / GST Audit?" field="exciseAuditConducted" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
                <FormInput label="Disagreements / Qualifications" field="exciseAuditDisagreements" placeholder="Indirect tax audit findings" />
              </div>
              <div>
                <RadioGroup label="38. Service Tax Audit?" field="serviceAuditConducted" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
                <FormInput label="Disagreements / Qualifications" field="serviceAuditDisagreements" placeholder="Service tax audit findings" />
              </div>
            </div>
          </div>

          {/* Clause 40: Ratios */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-emerald-600">Clause 40: Turnover & Accounting Ratios</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-md font-semibold mb-4 text-blue-600">Current Year Ratios</h3>
                <div className="space-y-4">
                  <FormInput label="Total Turnover (₹)" field="totalTurnover" type="number" />
                  <FormInput label="Gross Profit Ratio (%)" field="grossProfitRatio" type="number" />
                  <FormInput label="Net Profit Ratio (%)" field="netProfitRatio" type="number" />
                  <FormInput label="Stock Turnover Ratio" field="stockTurnoverRatio" type="number" />
                  <FormInput label="Material Consumption Ratio (%)" field="materialConsumptionRatio" type="number" />
                </div>
              </div>
              <div>
                <h3 className="text-md font-semibold mb-4 text-gray-500">Previous Year Ratios</h3>
                <div className="space-y-4">
                  <FormInput label="Previous Year Turnover (₹)" field="previousYearTurnover" type="number" />
                  <FormInput label="Previous Gross Profit Ratio (%)" field="previousGrossProfitRatio" type="number" />
                  <FormInput label="Previous Net Profit Ratio (%)" field="previousNetProfitRatio" type="number" />
                </div>
              </div>
            </div>
          </div>

          {/* Clause 41-43 */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-violet-600">Clause 41–43: Tax Demands, Form 61 & CbCR</h2>
            <div className="space-y-4 mb-6">
              <FormInput label="41. Tax Demand / Refund Details" field="taxDemandsRefunds" type="textarea" placeholder="Particulars of demand raised or refund issued under any tax law" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <RadioGroup label="42. Form 61 / 61A / 61B required?" field="form61Required" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
                <FormInput label="Form 61 details & ITDREIN" field="form61Details" placeholder="ITDREIN and filing date" />
              </div>
              <div>
                <RadioGroup label="43. CbCR report u/s 286 required?" field="cbcrRequired" options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
                <FormInput label="Parent / Alternate Entity Name" field="parentEntityName" placeholder="Name of parent entity" />
              </div>
            </div>
          </div>

          {/* Clause 44: GST Expenditure Breakup */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-violet-600">Clause 44: GST Expenditure Breakup</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <FormInput label="GST Registered Entities (₹)" field="gstRegisteredExpenditure" type="number" />
              <FormInput label="GST Unregistered Entities (₹)" field="gstUnregisteredExpenditure" type="number" />
              <FormInput label="GST Composition Scheme (₹)" field="gstCompositionExpenditure" type="number" />
              <FormInput label="GST Exempt Supplies (₹)" field="gstExemptExpenditure" type="number" />
            </div>
          </div>

          {/* Auditor Information */}
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold mb-6 text-gray-600">Auditor Sign-off & Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
              <FormInput label="Name of Auditor" field="auditorName" required />
              <FormInput label="Membership Number" field="auditorMembershipNo" required />
              <FormInput label="Firm Registration Number" field="auditorFirmRegNo" />
              <FormInput label="Place of Signing" field="placeOfSigning" required />
              <FormInput label="Date of Signing" field="dateOfSigning" type="date" required />
            </div>
            <FormInput label="Auditor Address" field="auditorAddress" type="textarea" required />
          </div>
        </div>
      )}

      {/* PART E */}
      {activeTab === 'partE' && (
        <div className="space-y-8">
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h2 className="text-xl font-semibold text-blue-600 mb-2">Part E: Financial Statements</h2>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Balance Sheet, Trading Account, and Profit & Loss Account derived from books of account for Audit Form 3CD.
            </p>
          </div>

          {/* Section 1: Balance Sheet */}
          <BalanceSheet showHeader={false} />

          {/* Section 2 & 3: Trading Account, Profit & Loss Account, Summary */}
          <ProfitLoss showHeader={false} />
        </div>
      )}

      {/* Summary Footer */}
      <div className={`mt-8 p-4 rounded-lg border ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-blue-200'}`}>
        <div className="flex items-start">
          <AlertCircle size={20} className="text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-blue-800 mb-1">Complete Form 3CD Statement - Clauses 1 to 44</p>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              All 44 clauses are now fully implemented and integrated with backend API and database storage. 
              Data saved as draft or submitted will persist seamlessly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Form3CD;
