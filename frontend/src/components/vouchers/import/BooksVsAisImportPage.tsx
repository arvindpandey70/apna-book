import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, FileText, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../../context/AppContext";
import { useCompany } from "../../../context/CompanyContext";
import AisManualPanel from "../../reports/AisManualPanel";
import {
  fetchAisEntries,
  AIS_UPDATED_EVENT,
  type AisManualEntry,
} from "../../../services/booksVsAisService";

const BooksVsAisImportPage: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useAppContext();
  const { companyInfo, activeCompanyId } = useCompany();
  const isDark = theme === "dark";

  const companyId =
    activeCompanyId ||
    companyInfo?.id ||
    localStorage.getItem("company_id") ||
    "";
  const ownerType =
    localStorage.getItem("supplier") ||
    (localStorage.getItem("employee_id") ? "employee" : "user");
  const ownerId =
    localStorage.getItem(ownerType === "employee" ? "employee_id" : "user_id") || "";

  const [aisEntries, setAisEntries] = useState<AisManualEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEntries = useCallback(async () => {
    if (!companyId) {
      setAisEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchAisEntries(companyId);
      setAisEntries(list);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    const handler = () => {
      loadEntries();
    };
    window.addEventListener(AIS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(AIS_UPDATED_EVENT, handler);
  }, [loadEntries]);

  const totalAmount = aisEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return (
    <main
      className={`pt-[56px] p-4 md:p-6 min-h-screen ${
        isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-800"
      }`}
    >
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/app/vouchers")}
              className={`p-2 rounded-lg border transition-colors ${
                isDark
                  ? "bg-gray-800 hover:bg-gray-700 border-gray-700"
                  : "bg-white hover:bg-gray-100 border-gray-200 shadow-sm"
              }`}
              aria-label="Back to Vouchers"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <FileText className="text-teal-600 dark:text-teal-400" size={22} />
                AIS Manual Entry (Books vs AIS)
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Add Narration and Amount entries here — they sync directly with the Books vs AIS report
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/app/reports/books-vs-ais")}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            View Books vs AIS Report <ExternalLink size={14} />
          </button>
        </div>

        {/* Summary strip */}
        <div
          className={`p-4 rounded-xl border mb-4 flex flex-wrap items-center justify-between gap-3 ${
            isDark
              ? "bg-gradient-to-r from-teal-950/40 to-gray-800 border-teal-900/60"
              : "bg-gradient-to-r from-teal-50 to-white border-teal-200 shadow-sm"
          }`}
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
              Saved AIS Entries
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {aisEntries.length} {aisEntries.length === 1 ? "entry" : "entries"} recorded
            </p>
          </div>
          <div className="text-2xl font-extrabold text-teal-600 dark:text-teal-400">
            ₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        {/* Shared Narration + Amount + Save panel */}
        <div
          className={`border rounded-xl overflow-hidden shadow-sm ${
            isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
          }`}
        >
          <div className="px-4 py-2.5 bg-teal-50 dark:bg-teal-950/40 border-b border-teal-200 dark:border-teal-900 flex items-center justify-between">
            <span className="text-sm font-semibold text-teal-900 dark:text-teal-200">
              Add AIS Entry
            </span>
            <span className="text-[11px] text-teal-700 dark:text-teal-300 font-medium">
              Synced with /app/reports/books-vs-ais
            </span>
          </div>

          <AisManualPanel
            companyId={companyId}
            ownerType={ownerType}
            ownerId={ownerId}
            isDark={isDark}
            entries={aisEntries}
            loading={loading}
            onEntriesChanged={loadEntries}
          />
        </div>
      </div>
    </main>
  );
};

export default BooksVsAisImportPage;
