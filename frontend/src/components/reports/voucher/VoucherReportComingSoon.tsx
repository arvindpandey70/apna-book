import React from 'react';
import { useAppContext } from '../../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, FileText } from 'lucide-react';

interface VoucherReportComingSoonProps {
  title: string;
}

const VoucherReportComingSoon: React.FC<VoucherReportComingSoonProps> = ({ title }) => {
  const { theme } = useAppContext();
  const navigate = useNavigate();

  return (
    <div className={`pt-[56px] px-4 min-h-[calc(100vh-64px)] ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
      {/* Top Header */}
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate('/app/reports')}
          title="Back to Reports"
          className={`p-2 rounded-lg mr-3 transition-colors ${
            theme === 'dark'
              ? 'bg-gray-700 hover:bg-gray-600 text-white'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="text-blue-600" size={28} />
            {title}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Voucher Report Details
          </p>
        </div>
      </div>

      {/* Coming Soon Card */}
      <div className="flex flex-col items-center justify-center pt-12 pb-16">
        <div
          className={`p-8 sm:p-12 rounded-2xl flex flex-col items-center max-w-lg w-full shadow-lg border transition-all ${
            theme === 'dark'
              ? 'bg-gray-800 border-gray-700'
              : 'bg-white border-gray-100'
          }`}
        >
          <div className="p-4 rounded-full bg-orange-100 dark:bg-orange-950/40 mb-6">
            <Clock size={48} className="text-orange-500 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold mb-3 text-center">{title}</h2>
          <p className="text-gray-500 dark:text-gray-400 text-center text-sm leading-relaxed mb-6">
            We are actively developing the {title} module. This report will be available soon with comprehensive analytics and export features.
          </p>
          <button
            onClick={() => navigate('/app/reports')}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Back to All Reports
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoucherReportComingSoon;
