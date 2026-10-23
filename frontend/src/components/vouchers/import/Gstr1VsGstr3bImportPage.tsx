import React from "react";
import { ArrowLeft, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../../context/AppContext";

const Gstr1VsGstr3bImportPage: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useAppContext();

  return (
    <main className={`pt-[56px] px-4 min-h-[calc(100vh-64px)] ${theme === "dark" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-800"}`}>
      <section className="max-w-4xl mx-auto py-8">
        <button onClick={() => navigate("/app/vouchers")} className="p-2 mb-6 rounded-lg border border-gray-300 dark:border-gray-700" aria-label="Back to vouchers">
          <ArrowLeft size={20} />
        </button>
        <div className="p-8 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-center shadow-sm">
          <Clock className="mx-auto mb-4 text-amber-500" size={40} />
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Coming Soon</p>
          <h1 className="text-2xl font-bold">GSTR-1 vs GSTR-3B Import</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">This page is under development. Import functionality is not available yet.</p>
        </div>
      </section>
    </main>
  );
};

export default Gstr1VsGstr3bImportPage;
