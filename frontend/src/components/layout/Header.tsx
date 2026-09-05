import React, { useEffect, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Moon, Sun, Menu } from 'lucide-react';
import { useAuth } from '../../home/context/AuthContext';

interface HeaderProps {
  toggleSidebar: () => void;
}

interface CompanyData {
  name: string;
  fdAccountType: string;
  AccountantName?: string;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
  const { theme, toggleTheme } = useAppContext();
  const { user } = useAuth();
  const storedCompanyId = localStorage.getItem("company_id");
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);

  useEffect(() => {
    const storedCompanyId = localStorage.getItem("company_id");

    if (!storedCompanyId || storedCompanyId === "null") return;

    fetch(`${import.meta.env.VITE_API_URL}/api/header/${storedCompanyId}`)
  .then(res => res.json())
  .then((data) => {
    if (data.error) {
      setCompanyData(null);
    } else {
      setCompanyData(data);
    }
  })
  .catch(err => {
    setCompanyData(null);
    console.error("Failed to fetch company info:", err);
  });

  }, [storedCompanyId]);

  return (
    <header
      className={`print:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-3 md:px-5 border-b h-14 transition-colors duration-200 ${
        theme === 'dark'
          ? 'bg-slate-900/95 border-slate-800 text-slate-100 backdrop-blur-md'
          : 'bg-indigo-950 border-indigo-900 text-white shadow-xs'
      }`}
    >
      <div className="flex items-center flex-1 overflow-hidden pr-3 gap-3">
        <button
          title="Toggle Sidebar"
          onClick={toggleSidebar}
          className={`p-2 rounded-xl transition-colors flex-shrink-0 cursor-pointer ${
            theme === 'dark'
              ? 'hover:bg-slate-800 text-slate-300'
              : 'hover:bg-indigo-900 text-indigo-100'
          }`}
        >
          <Menu size={19} />
        </button>

        <div className="font-semibold flex-1 overflow-x-auto no-scrollbar whitespace-nowrap flex items-center gap-3">
          {companyData ? (
            <div className="inline-flex items-center gap-2.5 text-sm">
              <span className="font-bold text-white tracking-wide truncate max-w-[200px] sm:max-w-[280px]">
                {companyData.name}
              </span>

              {user && (
                <div className="inline-flex items-center gap-2 text-xs">
                  <span className="opacity-30">|</span>
                  {localStorage.getItem('userType') === 'employee' ? (
                    <>
                      <span className="px-2.5 py-0.5 bg-indigo-600/90 text-white font-medium rounded-lg shadow-2xs border border-indigo-500/40">
                        Trader: {companyData.TraderName || user.firstName || user.name}
                      </span>
                      {companyData.AccountantName && (
                        <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-300 font-medium rounded-lg border border-amber-500/30">
                          Accountant: {companyData.AccountantName}
                        </span>
                      )}
                      {companyData.NewCAName && (
                        <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 font-medium rounded-lg border border-emerald-500/30">
                          CA: {companyData.NewCAName}
                        </span>
                      )}
                    </>
                  ) : localStorage.getItem('userType') === 'ca' ? (
                    <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-300 font-medium rounded-lg border border-amber-500/30">
                      Accountant: {user.firstName || user.name}
                    </span>
                  ) : localStorage.getItem('userType') === 'new_ca' ? (
                    <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 font-medium rounded-lg border border-emerald-500/30">
                      CA: {user.firstName || user.name}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 bg-slate-700 text-slate-200 font-medium rounded-lg border border-slate-600">
                      User: {user.firstName || user.name}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs opacity-75">No company assigned</span>
          )}

          {companyData?.fdAccountType && (
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/10 text-indigo-200 font-medium">
              {companyData.fdAccountType.toLowerCase() === 'self' ? 'Self Maintained' : 'Accountant'}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2 md:space-x-3 flex-shrink-0">
        <span className="text-[11px] opacity-75 hidden xl:inline-block font-mono bg-white/10 px-2 py-1 rounded-md">
          F1: Help | F2: Period | Alt+F1: Company
        </span>

        <button
          onClick={toggleTheme}
          className={`p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center ${
            theme === 'dark'
              ? 'bg-slate-800 text-amber-400 hover:bg-slate-700 border border-slate-700'
              : 'bg-indigo-900/80 text-amber-300 hover:bg-indigo-900 border border-indigo-800'
          }`}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {localStorage.getItem('userType') === 'new_ca' ? (
          <span className="px-2.5 py-1 bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-2xs border border-emerald-400">
            CA
          </span>
        ) : localStorage.getItem('userType') === 'employee' ? (
          <span className="px-2.5 py-1 bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-2xs border border-indigo-400">
            Trader
          </span>
        ) : (
          <span className="px-2.5 py-1 bg-amber-500 text-slate-950 text-xs font-bold rounded-lg shadow-2xs border border-amber-400">
            Accountant
          </span>
        )}
      </div>
    </header>
  );
};

export default Header;
