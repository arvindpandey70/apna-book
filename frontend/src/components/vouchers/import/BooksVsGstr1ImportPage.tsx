import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  FileJson,
  RefreshCw,
  ArrowRight,
  Building2,
  Calendar,
  Layers,
  FileText,
  CheckCircle,
  Database,
  Trash2,
  AlertCircle,
  X,
  Upload,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { useAppContext } from "../../../context/AppContext";
import { useCompany } from "../../../context/CompanyContext";
import GstJsonScanner, {
  type ParsedGstr1Data,
  formatIndianCurrency,
} from "../../reports/gst-scanner/GstJsonScanner";
import {
  saveGstr1ToDatabase,
  fetchLatestGstr1FromDatabase,
  deleteGstr1Import,
} from "../../../services/gstr1ImportService";

const BooksVsGstr1ImportPage: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useAppContext();
  const { activeCompanyId, companyInfo } = useCompany();

  // Persisted data state (from database)
  const [persistedData, setPersistedData] = useState<ParsedGstr1Data | null>(null);
  const [persistedImportId, setPersistedImportId] = useState<number | null>(null);

  // Staged / preview data state (from uploaded file before saving)
  const [stagedData, setStagedData] = useState<ParsedGstr1Data | null>(null);
  const [rawJsonText, setRawJsonText] = useState<string | undefined>(undefined);
  const [isSaved, setIsSaved] = useState<boolean>(true);

  // Loading & operation states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const bottomSaveRef = useRef<HTMLDivElement>(null);

  /**
   * Load the most recently saved GSTR-1 return for the active company from MySQL database
   */
  const loadSavedGstr1 = useCallback(
    async (showToast = false) => {
      if (!activeCompanyId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await fetchLatestGstr1FromDatabase(activeCompanyId);
        if (data) {
          setPersistedData(data);
          setStagedData(data);
          setPersistedImportId((data as any).id || null);
          setIsSaved(true);
          setRawJsonText(undefined);

          if (showToast) {
            Swal.fire({
              icon: "success",
              title: "Data Refreshed",
              text: `Loaded saved GSTR-1 return (${data.b2bInvoices.length} B2B invoices, ${data.b2cSummaries.length} B2C records) from database.`,
              timer: 2000,
              showConfirmButton: false,
            });
          }
        } else {
          setPersistedData(null);
          setStagedData(null);
          setPersistedImportId(null);
          setIsSaved(true);
          setRawJsonText(undefined);

          if (showToast) {
            Swal.fire({
              icon: "info",
              title: "No Records Found",
              text: "No saved GSTR-1 return data found for this company in the database. Please select a JSON file to preview and save.",
              timer: 2500,
              showConfirmButton: false,
            });
          }
        }
      } catch (err: any) {
        console.error("Error loading saved GSTR-1:", err);
        setErrorMessage(
          err?.response?.data?.message ||
            err?.message ||
            "Failed to load saved GSTR-1 data"
        );
      } finally {
        setIsLoading(false);
      }
    },
    [activeCompanyId]
  );

  // Initial load on mount or when active company changes
  useEffect(() => {
    loadSavedGstr1();
  }, [loadSavedGstr1]);

  /**
   * When user selects or drops a JSON file in GstJsonScanner:
   * It loads all data in the UI immediately for preview WITHOUT saving automatically to DB.
   */
  const handleDataLoaded = (data: ParsedGstr1Data | null, rawText?: string) => {
    if (data) {
      setStagedData(data);
      setRawJsonText(rawText);
      setIsSaved(false);
      setErrorMessage(null);

      // Smooth scroll to make bottom save card visible
      setTimeout(() => {
        bottomSaveRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 200);
    } else {
      // Cleared file
      if (persistedData) {
        setStagedData(persistedData);
        setIsSaved(true);
      } else {
        setStagedData(null);
        setIsSaved(true);
      }
      setRawJsonText(undefined);
    }
  };

  /**
   * Cancel preview and revert to persisted state (or empty)
   */
  const handleCancelPreview = () => {
    if (persistedData) {
      setStagedData(persistedData);
      setIsSaved(true);
    } else {
      setStagedData(null);
      setIsSaved(true);
    }
    setRawJsonText(undefined);
    setErrorMessage(null);
  };

  /**
   * User explicitly clicks "Save GSTR-1 Data to Database"
   */
  const handleSaveToDatabase = async () => {
    if (!stagedData) {
      Swal.fire("Warning", "No GSTR-1 data available to save. Please upload a JSON file first.", "warning");
      return;
    }

    if (!activeCompanyId) {
      Swal.fire("Error", "Please select an active company before importing GSTR-1 data.", "error");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      let rawJsonObj = null;
      if (rawJsonText) {
        try {
          rawJsonObj = JSON.parse(rawJsonText);
        } catch {
          // ignore parsing error if string is too large or malformed
        }
      }

      const res = await saveGstr1ToDatabase(stagedData, activeCompanyId, {
        ownerType: "company",
        rawJson: rawJsonObj,
      });

      if (!res.success) {
        throw new Error(res.message || "Backend persistence failed");
      }

      // Mark as saved and refresh persisted record from database
      setIsSaved(true);
      await loadSavedGstr1();

      Swal.fire({
        icon: "success",
        title: "Saved to Database Successfully!",
        html: `
          <div style="text-align: left; font-size: 13px; line-height: 1.6;">
            <p><strong>Return Period:</strong> ${stagedData.metadata.fp || "N/A"}</p>
            <p><strong>GSTIN:</strong> ${stagedData.metadata.gstin || "N/A"}</p>
            <p><strong>B2B Invoices Persisted:</strong> ${stagedData.b2bInvoices.length}</p>
            <p><strong>B2C Records Persisted:</strong> ${stagedData.b2cSummaries.length}</p>
            <p style="margin-top: 10px; color: #16a34a; font-weight: bold;">
              ✓ All records have been safely saved to the MySQL database.
            </p>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: "View Books vs GSTR-1 Report",
        cancelButtonText: "Stay on Page",
        confirmButtonColor: "#16a34a",
      }).then((result) => {
        if (result.isConfirmed) {
          navigate("/app/reports/books-vs-gstr1");
        }
      });
    } catch (err: any) {
      console.error("Database Persistence Error:", err);
      const errMsg =
        err?.response?.data?.message ||
        err?.message ||
        "An unexpected error occurred while saving GSTR-1 data to the database.";
      setErrorMessage(errMsg);
      Swal.fire({
        icon: "error",
        title: "Save Failed",
        text: errMsg,
      });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Delete previously saved import from database
   */
  const handleDeleteImport = async () => {
    if (!persistedImportId || !activeCompanyId) return;

    const result = await Swal.fire({
      title: "Delete Saved Import?",
      text: "This will remove the saved GSTR-1 return and all its B2B/B2C invoices from the database. This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete It",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
    });

    if (result.isConfirmed) {
      try {
        const success = await deleteGstr1Import(persistedImportId, activeCompanyId);
        if (success) {
          setPersistedData(null);
          setStagedData(null);
          setPersistedImportId(null);
          setIsSaved(true);
          setRawJsonText(undefined);
          Swal.fire("Deleted!", "The saved GSTR-1 data has been removed from the database.", "success");
        } else {
          Swal.fire("Error", "Failed to delete the saved GSTR-1 data.", "error");
        }
      } catch (err: any) {
        Swal.fire("Error", err?.message || "Failed to delete GSTR-1 data", "error");
      }
    }
  };

  return (
    <main
      className={`pt-[56px] px-4 min-h-[calc(100vh-64px)] transition-colors ${
        theme === "dark" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-800"
      }`}
    >
      <section className="max-w-7xl mx-auto py-6 space-y-6">
        {/* Top Navigation & Action Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/app/vouchers")}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                theme === "dark"
                  ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700"
                  : "bg-white hover:bg-gray-100 text-gray-700 border-gray-300 shadow-sm"
              }`}
              aria-label="Back to vouchers"
              title="Back to Vouchers"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-400">
                  <FileJson size={22} />
                </span>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                  Books vs GSTR-1 Import
                </h1>
                {isSaved && persistedData ? (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <Database size={12} /> Persisted in DB
                  </span>
                ) : stagedData && !isSaved ? (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Unsaved Preview
                  </span>
                ) : null}
              </div>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Upload official GSTR-1 offline JSON file, preview B2B & B2C data, and click Save to persist records to database
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadSavedGstr1(true)}
              disabled={isLoading || isSaving}
              className={`px-3 py-2 rounded-lg border text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                theme === "dark"
                  ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700"
                  : "bg-white hover:bg-gray-100 text-gray-700 border-gray-300 shadow-sm"
              }`}
              title="Refresh saved data from database"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Refresh Data</span>
            </button>

            {persistedImportId && (
              <button
                onClick={handleDeleteImport}
                disabled={isLoading || isSaving}
                className="px-3 py-2 rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Delete saved import from database"
              >
                <Trash2 size={15} />
                <span className="hidden sm:inline">Delete Saved</span>
              </button>
            )}

            <button
              onClick={() => navigate("/app/reports/books-vs-gstr1")}
              className="px-3.5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm font-medium shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <FileText size={15} />
              <span>Go to Comparison Report</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Active Company & Context Bar */}
        <div
          className={`px-4 py-2.5 rounded-xl border flex flex-wrap items-center justify-between text-xs gap-3 ${
            theme === "dark"
              ? "bg-gray-800/80 border-gray-700 text-gray-300"
              : "bg-white border-gray-200 text-gray-600 shadow-xs"
          }`}
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-gray-100">
              <Building2 size={15} className="text-green-600 dark:text-green-400" />
              <span>Company:</span>
              <span className="font-mono text-green-700 dark:text-green-300">
                {companyInfo?.name || `ID #${activeCompanyId || "-"}`}
              </span>
            </div>

            {companyInfo?.gstNumber && (
              <div className="flex items-center gap-1 text-gray-500">
                <span>GSTIN:</span>
                <span className="font-mono font-medium text-gray-800 dark:text-gray-200">
                  {companyInfo.gstNumber}
                </span>
              </div>
            )}

            {companyInfo?.financialYear && (
              <div className="flex items-center gap-1 text-gray-500">
                <Calendar size={13} />
                <span>FY:</span>
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {companyInfo.financialYear}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            {isSaved && persistedData ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle size={13} />
                Saved in database ({persistedData.b2bInvoices.length} B2B, {persistedData.b2cSummaries.length} B2C)
              </span>
            ) : stagedData && !isSaved ? (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                <AlertCircle size={13} />
                JSON preview loaded • Click Save button below to persist
              </span>
            ) : (
              <span>No GSTR-1 return saved yet for this company</span>
            )}
          </div>
        </div>

        {/* Global Error Banner if any */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-500 hover:text-red-700 text-xs font-bold ml-2 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Content: Pixel-Accurate Replication of GSTR-1 JSON Import Section */}
        <div className="w-full">
          <GstJsonScanner
            initialData={stagedData}
            isLoadingInitial={isLoading}
            isSavedInDb={isSaved}
            onDataLoaded={handleDataLoaded}
            onClearFile={() => {
              handleCancelPreview();
            }}
          />
        </div>

        {/* BOTTOM SAVE BAR: Shown when a file is selected / previewed but not yet saved */}
        {stagedData && !isSaved && (
          <div
            ref={bottomSaveRef}
            className={`p-4 rounded-xl border transition-all shadow-lg flex flex-wrap items-center justify-between gap-4 ${
              theme === "dark"
                ? "bg-gray-800/95 border-green-700/60"
                : "bg-white border-green-300 shadow-green-100/50"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-lg bg-green-100 dark:bg-green-950/80 text-green-700 dark:text-green-400">
                <FileJson size={24} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    File Ready to Save: {stagedData.fileName}
                  </h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    Unsaved
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Contains{" "}
                  <strong className="text-green-700 dark:text-green-400">
                    {stagedData.b2bInvoices.length} B2B invoices
                  </strong>{" "}
                  (Taxable: {formatIndianCurrency(stagedData.totalB2bTaxable)}) and{" "}
                  <strong className="text-blue-700 dark:text-blue-400">
                    {stagedData.b2cSummaries.length} B2C records
                  </strong>{" "}
                  (Taxable: {formatIndianCurrency(stagedData.totalB2cTaxable)}). Click the save button to persist to database.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCancelPreview}
                disabled={isSaving}
                className={`px-4 py-2 rounded-lg border text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                  theme === "dark"
                    ? "border-gray-700 text-gray-300 hover:bg-gray-750"
                    : "border-gray-300 text-gray-700 hover:bg-gray-100"
                }`}
              >
                Cancel Preview
              </button>

              <button
                type="button"
                onClick={handleSaveToDatabase}
                disabled={isSaving}
                className="px-6 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 active:scale-98 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <RefreshCw size={17} className="animate-spin" />
                    <span>Saving to Database...</span>
                  </>
                ) : (
                  <>
                    <Database size={17} />
                    <span>Save GSTR-1 Data to Database</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
};

export default BooksVsGstr1ImportPage;
