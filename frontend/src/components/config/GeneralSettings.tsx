import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import Swal from 'sweetalert2';

function isTruthyFlag(val: unknown): boolean {
  return val === true || val === 1 || val === '1' || val === 'true';
}

const GeneralSettings = () => {
  const navigate = useNavigate();
  const { companyInfo, updateCompany, activeCompanyId } = useCompany();
  const [backDateAllowed, setBackDateAllowed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const updateCompanyRef = useRef(updateCompany);
  updateCompanyRef.current = updateCompany;

  useEffect(() => {
    if (companyInfo) {
      const legacyFlag = (companyInfo as Record<string, unknown>).back_date_allowed;
      setBackDateAllowed(isTruthyFlag(companyInfo.backDateAllowed ?? legacyFlag));
    }
  }, [companyInfo]);

  useEffect(() => {
    if (!activeCompanyId) return;
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        const response = await fetch(`${apiUrl}/api/company/company/${activeCompanyId}`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (!response.ok || cancelled) return;
        const data: Record<string, unknown> = await response.json();
        const isAllowed = isTruthyFlag(data.backDateAllowed ?? data.back_date_allowed);
        if (!cancelled) {
          setBackDateAllowed(isAllowed);
          updateCompanyRef.current(activeCompanyId, { backDateAllowed: isAllowed });
        }
      } catch (err) {
        console.error('Failed to load general settings:', err);
      }
    };

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [activeCompanyId]);

  const handleToggle = async (checked: boolean) => {
    if (!activeCompanyId) return;
    
    setBackDateAllowed(checked);
    setIsSaving(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      const response = await fetch(`${apiUrl}/api/company/company/${activeCompanyId}/general-settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          backDateAllowed: checked
        })
      });

      const data = await response.json().catch(() => ({})) as { message?: string };

      if (response.ok) {
        updateCompany(activeCompanyId, { backDateAllowed: checked });
        Swal.fire({
          icon: 'success',
          title: 'Success',
          text: 'Setting updated',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000
        });
      } else {
        throw new Error(data.message || 'Failed to update');
      }
    } catch (error: unknown) {
      console.error('Save error:', error);
      setBackDateAllowed(!checked); // Revert on failure
      const message = error instanceof Error ? error.message : 'Failed to save';
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: message
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="pt-[56px] px-4">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <button
              title='Back to Reports'
              type='button'
              onClick={() => navigate('/app/config')}
              className="mr-4 p-2 rounded-full hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-xl font-semibold text-gray-900">General Settings</h2>
          </div>
          {isSaving && (
            <div className="flex items-center gap-2 text-blue-600 text-sm font-medium">
              <Loader2 className="animate-spin" size={16} />
              Saving...
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-1">System Configuration</h3>
            <p className="text-sm text-gray-600 mb-6">Configure basic system settings and company-wide rules</p>
            
            <div className="space-y-6">
              <div className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex items-center h-5">
                  <input
                    id="backdate_allow"
                    name="backdate_allow"
                    type="checkbox"
                    disabled={isSaving}
                    checked={backDateAllowed}
                    onChange={(e) => handleToggle(e.target.checked)}
                    className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                  />
                </div>
                <div className="flex flex-col">
                  <label htmlFor="backdate_allow" className="font-medium text-gray-900 cursor-pointer">
                    Allow Back-Dated Vouchers
                  </label>
                  <p className="text-sm text-gray-500">
                    If disabled, users will only be able to record vouchers for the current date. 
                    Historical entries will be restricted.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralSettings;