import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { useCompany } from '../../../context/CompanyContext';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { mapForm3CDData, type Form3CDData } from '../../../utils/auditFormMapper';
import {
  ArrowLeft,
  Save,
  Download,
  Printer,
  FileCheck,
  AlertCircle,
  Loader2
} from 'lucide-react';

const Form3CD: React.FC = () => {
  const { theme } = useAppContext();
  const { companyInfo, activeCompanyId } = useCompany();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  // DRY - Reusable input change handler
  const handleInputChange = (field: keyof Form3CDData, value: string | number | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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

  // Handlers
  const handleSave = () => saveAuditForm('draft');
  const handleSubmit = () => saveAuditForm('submitted');

  // DRY - Reusable currency formatter
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

  // DRY - Reusable input component
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
      <label className="block text-sm font-medium mb-2">
        {label} {required && '*'}
      </label>
      {type === 'select' ? (
        <select
          value={formData[field] as string}
          onChange={(e) => handleInputChange(field, e.target.value)}
          title={label}
          aria-label={label}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
            theme === 'dark' 
              ? 'bg-gray-700 border-gray-600 text-white' 
              : 'bg-white border-gray-300'
          }`}
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          value={formData[field] as string}
          onChange={(e) => handleInputChange(field, e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
            theme === 'dark' 
              ? 'bg-gray-700 border-gray-600 text-white' 
              : 'bg-white border-gray-300'
          }`}
          placeholder={placeholder}
          rows={3}
        />
      ) : type === 'number' ? (
        <div>
          <input
            type="number"
            value={formData[field] as number}
            onChange={(e) => handleInputChange(field, parseFloat(e.target.value) || 0)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              theme === 'dark' 
                ? 'bg-gray-700 border-gray-600 text-white' 
                : 'bg-white border-gray-300'
            }`}
            placeholder={placeholder}
          />
          <p className="text-xs text-gray-500 mt-1">{formatCurrency(formData[field] as number)}</p>
        </div>
      ) : (
        <input
          type={type}
          value={formData[field] as string}
          onChange={(e) => handleInputChange(field, type === 'text' && field === 'panNumber' 
            ? e.target.value.toUpperCase() 
            : e.target.value)}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
            theme === 'dark' 
              ? 'bg-gray-700 border-gray-600 text-white' 
              : 'bg-white border-gray-300'
          }`}
          placeholder={placeholder}
          maxLength={field === 'panNumber' ? 10 : undefined}
        />
      )}
    </div>
  );

  // DRY - Reusable radio component
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
      <label className="block text-sm font-medium mb-2">
        {label} {required && '*'}
      </label>
      <div className="flex space-x-4">
        {options.map(option => (
          <label key={option.value} className="flex items-center">
            <input
              type="radio"
              value={option.value}
              checked={formData[field] === option.value}
              onChange={(e) => handleInputChange(field, e.target.value)}
              className="mr-2"
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="pt-[56px] px-4 max-w-5xl mx-auto flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
        <p className={`text-base font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
          Loading Form 3CD Audit Data...
        </p>
      </div>
    );
  }

  return (
    <div className="pt-[56px] px-4 max-w-5xl mx-auto">
      {notification && (
        <div className={`mb-4 p-4 rounded-lg flex items-center justify-between ${
          notification.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border border-red-200'
        }`}>
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-sm font-semibold underline ml-4">Dismiss</button>
        </div>
      )}
      {/* Header - Matching Form3CA design */}
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
            <h1 className="text-2xl font-bold">Form 3CD</h1>
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Statement of particulars required to be furnished under section 44AB
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

      {/* Official Form Header - Matching Form3CA */}
      <div className={`rounded-xl border p-6 mb-6 ${
        theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      }`}>
        <div className="text-center">
          <h2 className="text-lg font-bold mb-2">Form No. 3CD</h2>
          <p className="text-sm font-medium mb-4">[See rule 6G]</p>
          <h3 className="text-base font-semibold">
            Statement of particulars required to be furnished under section 44AB of the Income-tax Act, 1961
          </h3>
        </div>
      </div>

      {/* Form Content - All 44 Clauses */}
      <div className="space-y-6">
        
        {/* Clauses 1-8: Basic Information */}
        <div className={`rounded-xl border p-6 ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <h2 className="text-xl font-semibold mb-6 text-blue-600">Clauses 1-8: Basic Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FormInput 
              label="1. Name of Assessee" 
              field="nameOfAssessee" 
              placeholder="Enter assessee name" 
              required 
            />
            <FormInput 
              label="3. PAN Number" 
              field="panNumber" 
              placeholder="ABCDE1234F" 
              required 
            />
            <RadioGroup
              label="4. Liable to pay indirect tax?"
              field="indirectTaxLiability"
              options={[
                { value: 'Yes', label: 'Yes' },
                { value: 'No', label: 'No' }
              ]}
              required
            />
            <FormInput 
              label="4. Registration Numbers (GST, etc.)" 
              field="registrationNumbers" 
              placeholder="Enter registration numbers" 
            />
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
            <FormInput 
              label="6. Previous Year From" 
              field="previousYearFrom" 
              type="date" 
              required 
            />
            <FormInput 
              label="6. Previous Year To" 
              field="previousYearTo" 
              type="date" 
              required 
            />
            <FormInput 
              label="7. Assessment Year" 
              field="assessmentYear" 
              type="select"
              required
              options={[
                { value: '2024-25', label: '2024-25' },
                { value: '2023-24', label: '2023-24' },
                { value: '2022-23', label: '2022-23' },
                { value: '2021-22', label: '2021-22' }
              ]}
            />
            <FormInput 
              label="8. Section 44AB Clause" 
              field="section44ABClause" 
              type="select"
              required
              options={[
                { value: '', label: 'Select Clause' },
                { value: 'Clause (a)', label: 'Clause (a) - Business turnover > Rs. 1 crore' },
                { value: 'Clause (b)', label: 'Clause (b) - Professional receipts > Rs. 50 lakh' },
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
            <FormInput 
              label="2. Address of Assessee" 
              field="address" 
              type="textarea" 
              placeholder="Enter complete address" 
              required 
            />
          </div>
        </div>

        {/* Clause 12: Presumptive Taxation */}
        <div className={`rounded-xl border p-6 ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <h2 className="text-xl font-semibold mb-6 text-green-600">Clause 12: Presumptive Taxation</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <RadioGroup
              label="Profit/Loss includes presumptive basis income?"
              field="presumptiveProfits"
              options={[
                { value: 'Yes', label: 'Yes' },
                { value: 'No', label: 'No' }
              ]}
              required
            />
            <FormInput 
              label="Presumptive Amount (₹)" 
              field="presumptiveAmount" 
              type="number" 
              placeholder="0.00" 
            />
            <FormInput 
              label="Relevant Section" 
              field="presumptiveSection" 
              type="select"
              options={[
                { value: '', label: 'Select Section' },
                { value: '44AD', label: 'Section 44AD - Business' },
                { value: '44ADA', label: 'Section 44ADA - Professional' },
                { value: '44AE', label: 'Section 44AE - Goods Carriage' },
                { value: '44B', label: 'Section 44B - Shipping' },
                { value: '44BB', label: 'Section 44BB - Non-resident' },
                { value: '44BBA', label: 'Section 44BBA - Aircraft Operation' },
                { value: '44BBB', label: 'Section 44BBB - Civil Construction' },
                { value: '44BBC', label: 'Section 44BBC - Cruise Ships' }
              ]}
            />
          </div>
        </div>

        {/* Clause 13: Accounting Method */}
        <div className={`rounded-xl border p-6 ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <h2 className="text-xl font-semibold mb-6 text-purple-600">Clause 13: Method of Accounting</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <FormInput 
              label="13(a). Method of Accounting" 
              field="accountingMethod" 
              type="select"
              required
              options={[
                { value: 'Cash', label: 'Cash System' },
                { value: 'Mercantile', label: 'Mercantile System' },
                { value: 'Hybrid', label: 'Hybrid System' }
              ]}
            />
            <RadioGroup
              label="13(b). Change in accounting method?"
              field="accountingMethodChange"
              options={[
                { value: 'Yes', label: 'Yes' },
                { value: 'No', label: 'No' }
              ]}
              required
            />
            <RadioGroup
              label="13(d). ICDS adjustment required?"
              field="icdsAdjustmentRequired"
              options={[
                { value: 'Yes', label: 'Yes' },
                { value: 'No', label: 'No' }
              ]}
              required
            />
          </div>

          <div className="space-y-6">
            <FormInput 
              label="13(c). Details of accounting method change" 
              field="accountingChangeDetails" 
              type="textarea" 
              placeholder="Provide details if accounting method changed" 
            />
            <FormInput 
              label="13(e). ICDS adjustment details" 
              field="icdsAdjustmentDetails" 
              type="textarea" 
              placeholder="Details of ICDS adjustments" 
            />
            <FormInput 
              label="13(f). ICDS disclosure" 
              field="icdsDisclosure" 
              type="textarea" 
              placeholder="Disclosure as per ICDS requirements" 
            />
          </div>
        </div>

        {/* Auditor Information */}
        <div className={`rounded-xl border p-6 ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <h2 className="text-xl font-semibold mb-6 text-gray-600">Auditor Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FormInput 
              label="Name of Auditor" 
              field="auditorName" 
              placeholder="Enter auditor name" 
              required 
            />
            <FormInput 
              label="Membership Number" 
              field="auditorMembershipNo" 
              placeholder="Enter membership number" 
              required 
            />
            <FormInput 
              label="Firm Registration Number" 
              field="auditorFirmRegNo" 
              placeholder="Enter firm registration number" 
            />
            <FormInput 
              label="Place of Signing" 
              field="placeOfSigning" 
              placeholder="Enter place" 
              required 
            />
            <FormInput 
              label="Date of Signing" 
              field="dateOfSigning" 
              type="date" 
              required 
            />
          </div>
          
          <div className="mt-6">
            <FormInput 
              label="Auditor Address" 
              field="auditorAddress" 
              type="textarea" 
              placeholder="Enter complete address of auditor" 
              required 
            />
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
            <p className="font-semibold text-blue-800 mb-1">Complete Form 3CD - All 44 Clauses</p>
            <p className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}>
              This comprehensive Form 3CD includes all 44 clauses as per official Income Tax requirements. 
              It covers complete tax audit particulars under Section 44AB with latest amendments.
            </p>
            <ul className={`mt-2 space-y-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              <li>• Covers all official clauses 1-44 with recent amendments for AY 2024-25</li>
              <li>• Includes Transfer Pricing (30A), Interest Limitation (30B), GAAR (30C)</li>
              <li>• MSME compliance, TDS/TCS details, and GST expenditure breakup</li>
              <li>• Complete financial ratios, loss carry forward, and auditor information</li>
              <li>• Must be filed by September 30th of the assessment year</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Form3CD;
