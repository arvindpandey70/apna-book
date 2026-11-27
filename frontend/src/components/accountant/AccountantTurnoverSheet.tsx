import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { ArrowLeft, Clock, FileSpreadsheet } from 'lucide-react';

const AccountantTurnoverSheet: React.FC = () => {
  const { theme } = useAppContext();
  const navigate = useNavigate();
  const isDark = theme === 'dark';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2.5">
            <FileSpreadsheet className="text-indigo-500" size={26} />
            Turnover Sheet
          </h1>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Client turnover summary and period-wise sheet analysis
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/accountant/dashboard')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
            isDark
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <ArrowLeft size={15} />
          Back to Dashboard
        </button>
      </div>

      {/* Coming Soon Card */}
      <div className="flex items-center justify-center py-12">
        <div
          className={`max-w-lg w-full rounded-3xl border p-8 sm:p-10 text-center shadow-lg transition-all ${
            isDark
              ? 'bg-slate-800/80 border-slate-700 text-slate-100'
              : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>

          <div className="inline-block px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider mb-3">
            Coming Soon
          </div>

          <h2 className="text-2xl font-extrabold tracking-tight mb-2">
            Turnover Sheet
          </h2>

          <p className={`text-sm leading-relaxed mb-6 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Coming Soon — We are working on the Turnover Sheet feature for the Accountant Portal. Stay tuned for updates!
          </p>

          <button
            type="button"
            onClick={() => navigate('/accountant/dashboard')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold shadow-md shadow-indigo-600/25 transition-all cursor-pointer"
          >
            <ArrowLeft size={15} />
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountantTurnoverSheet;
