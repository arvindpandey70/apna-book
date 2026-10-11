import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAppContext } from "../../context/AppContext";
import { useCompany } from "../../context/CompanyContext";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Upload,
  Calendar,
  Search,
  RefreshCw,
  AlertCircle,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
} from "lucide-react";
import { getReportData, type StoredReportData } from "../../services/reportImportService";

export interface BookSaleRecord {
  id: string;
  date: string;
  invoiceNumber: string;
  value: number;
  tax: number;
  total: number;
  partyName?: string;
  partyGSTIN?: string;
}

const BooksVsGstr1Report: React.FC = () => {
  const { theme } = useAppContext();
  const { companyInfo, activeCompanyId } = useCompany();
  const navigate = useNavigate();

  // Stored / Imported GSTR-1 Data
  const [reportData, setReportData] = useState<StoredReportData | null>(null);

  // Books Sales Data
  const [booksSales, setBooksSales] = useState<BookSaleRecord[]>([]);
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [booksError, setBooksError] = useState<string | null>(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [periodPreset, setPeriodPreset] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // Helpers
  const formatCurrency = (val: number | string | undefined | null): string => {
    const num = typeof val === "number" ? val : parseFloat(String(val || 0));
    if (isNaN(num)) return "₹0.00";
    return `₹${num.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (dateStr: string | undefined | null): string => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return String(dateStr);
    }
  };

  // Helper to compute date range presets
  const getPresetRange = (preset: string): { from: string; to: string } => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    if (preset === "this-month") {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      return { from: fmt(start), to: fmt(end) };
    }
    if (preset === "last-month") {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      return { from: fmt(start), to: fmt(end) };
    }
    if (preset === "this-quarter") {
      let startMonth = 0;
      if (month >= 3 && month <= 5) startMonth = 3;
      else if (month >= 6 && month <= 8) startMonth = 6;
      else if (month >= 9 && month <= 11) startMonth = 9;
      else startMonth = 0;
      const start = new Date(year, startMonth, 1);
      const end = new Date(year, startMonth + 3, 0);
      return { from: fmt(start), to: fmt(end) };
    }
    if (preset === "this-fy") {
      const fyStart = month >= 3 ? year : year - 1;
      return {
        from: `${fyStart}-04-01`,
        to: `${fyStart + 1}-03-31`,
      };
    }
    return { from: "", to: "" };
  };

  // Load imported GSTR-1 comparison data
  useEffect(() => {
    const data = getReportData("books-vs-gstr1");
    setReportData(data);
  }, []);

  // Fetch actual Books Sales records from backend API
  const fetchBooksSales = useCallback(
    async (from?: string, to?: string) => {
      setIsLoadingBooks(true);
      setBooksError(null);
      try {
        const companyId =
          activeCompanyId ||
          companyInfo?.id ||
          localStorage.getItem("company_id") ||
          "1";
        const ownerType = localStorage.getItem("supplier") || "employee";
        const ownerId =
          localStorage.getItem(
            ownerType === "employee" ? "employee_id" : "user_id"
          ) || "1";

        const apiBase = import.meta.env.VITE_API_URL || "";
        let url = `${apiBase}/api/sales-report?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
        if (from && to) {
          url += `&from_date=${from}&to_date=${to}`;
        }

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to load sales records (${res.status})`);
        }
        const json = await res.json();
        const rows = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
          ? json.data
          : [];

        const records: BookSaleRecord[] = rows.map((r: any) => {
          const taxable = Number(r.taxableAmount ?? r.subtotal ?? 0);
          const cgst = Number(r.cgstAmount ?? r.cgstTotal ?? 0);
          const sgst = Number(r.sgstAmount ?? r.sgstTotal ?? 0);
          const igst = Number(r.igstAmount ?? r.igstTotal ?? 0);
          const tax = cgst + sgst + igst || Number(r.taxAmount ?? 0);
          const total = Number(r.total ?? r.netAmount ?? taxable + tax);

          return {
            id: String(r.id || r.voucherNo || Math.random()),
            date: r.date ? String(r.date) : "",
            invoiceNumber:
              r.voucherNo || r.number || r.bill_no || r.referenceNo || "-",
            value: taxable,
            tax: tax,
            total: total,
            partyName: r.partyName || "",
            partyGSTIN: r.partyGSTIN || "",
          };
        });

        setBooksSales(records);
      } catch (err: any) {
        console.error("Books sales fetch error:", err);
        setBooksError(err.message || "Failed to load sales records from Books");
      } finally {
        setIsLoadingBooks(false);
      }
    },
    [activeCompanyId, companyInfo]
  );

  // Initial and reactive fetch
  useEffect(() => {
    fetchBooksSales(fromDate, toDate);
  }, [fetchBooksSales, fromDate, toDate]);

  // Handle Preset Change
  const handlePresetChange = (preset: string) => {
    setPeriodPreset(preset);
    if (preset === "all") {
      setFromDate("");
      setToDate("");
    } else {
      const range = getPresetRange(preset);
      setFromDate(range.from);
      setToDate(range.to);
    }
  };

  // Merge database records with imported fallback if database is empty but imported report exists
  const effectiveBooksRecords = useMemo(() => {
    if (booksSales.length > 0) {
      return booksSales;
    }
    // Fallback to imported books rows if available in stored report data
    if (reportData?.rows && reportData.rows.length > 0) {
      const imported = reportData.rows
        .filter(
          (r) =>
            r["Book Invoice No"] ||
            r.bookInvoiceNo ||
            r["Book Taxable Value"] ||
            r.bookTaxable
        )
        .map((r, i) => {
          const val =
            parseFloat(r["Book Taxable Value"] || r.bookTaxable || 0) || 0;
          const tax =
            parseFloat(r["Book Tax Amount"] || r.bookTaxAmount || 0) || 0;
          return {
            id: `import-${i}`,
            date: r["Invoice Date"] || r.invoiceDate || "",
            invoiceNumber: r["Book Invoice No"] || r.bookInvoiceNo || "-",
            value: val,
            tax: tax,
            total: val + tax,
            partyName: r["Customer Name"] || r.customerName || "",
            partyGSTIN: r["Customer GSTIN"] || r.customerGstin || "",
          };
        });
      if (imported.length > 0) return imported;
    }
    return [];
  }, [booksSales, reportData]);

  // Filtered Books Records
  const filteredBooksRecords = useMemo(() => {
    if (!searchTerm.trim()) return effectiveBooksRecords;
    const term = searchTerm.toLowerCase();
    return effectiveBooksRecords.filter(
      (r) =>
        r.invoiceNumber.toLowerCase().includes(term) ||
        r.date.toLowerCase().includes(term) ||
        (r.partyName && r.partyName.toLowerCase().includes(term)) ||
        (r.partyGSTIN && r.partyGSTIN.toLowerCase().includes(term)) ||
        r.value.toString().includes(term) ||
        r.tax.toString().includes(term) ||
        r.total.toString().includes(term)
    );
  }, [effectiveBooksRecords, searchTerm]);

  // Books Totals
  const totalBookValue = useMemo(
    () => filteredBooksRecords.reduce((acc, r) => acc + r.value, 0),
    [filteredBooksRecords]
  );
  const totalBookTax = useMemo(
    () => filteredBooksRecords.reduce((acc, r) => acc + r.tax, 0),
    [filteredBooksRecords]
  );
  const totalBookTotal = useMemo(
    () => filteredBooksRecords.reduce((acc, r) => acc + r.total, 0),
    [filteredBooksRecords]
  );

  // GSTR-1 Rows from imported report data
  const gstr1Rows = reportData?.rows || [];

  const filteredGstr1Rows = useMemo(() => {
    if (!searchTerm.trim()) return gstr1Rows;
    const term = searchTerm.toLowerCase();
    return gstr1Rows.filter((r) =>
      JSON.stringify(r).toLowerCase().includes(term)
    );
  }, [gstr1Rows, searchTerm]);

  const totalGstr1Taxable = useMemo(
    () =>
      filteredGstr1Rows.reduce(
        (acc, r) =>
          acc +
          (parseFloat(r["GSTR1 Taxable Value"] || r.gstr1Taxable || 0) || 0),
        0
      ),
    [filteredGstr1Rows]
  );

  const totalGstr1Tax = useMemo(
    () =>
      filteredGstr1Rows.reduce(
        (acc, r) =>
          acc +
          (parseFloat(r["GSTR1 Tax Amount"] || r.gstr1TaxAmount || 0) || 0),
        0
      ),
    [filteredGstr1Rows]
  );

  // Reconciliation Variance
  const taxableVariance = totalBookValue - totalGstr1Taxable;
  const isReconciled =
    Math.abs(taxableVariance) < 0.01 &&
    filteredBooksRecords.length > 0 &&
    filteredGstr1Rows.length > 0;

  return (
    <div
      className={`pt-[56px] px-4 min-h-[calc(100vh-64px)] pb-12 ${
        theme === "dark" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-800"
      }`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-2 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div className="flex items-center">
          <button
            onClick={() => navigate("/app/reports")}
            title="Back to Reports"
            className={`p-2 rounded-lg mr-3 transition-colors ${
              theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700 text-white border border-gray-700"
                : "bg-white hover:bg-gray-100 text-gray-700 border shadow-sm"
            }`}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="text-blue-600 dark:text-blue-400" size={28} />
              Books vs GSTR-1 Report
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Sales Register (Books) vs Filed GSTR-1 Outward Return Reconciliation (50% - 50% Split Partition)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchBooksSales(fromDate, toDate)}
            title="Refresh Books Data"
            className={`p-2 rounded-lg border transition-colors flex items-center gap-1.5 text-sm ${
              theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700"
                : "bg-white hover:bg-gray-100 text-gray-700 border-gray-300 shadow-sm"
            }`}
          >
            <RefreshCw size={16} className={isLoadingBooks ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => navigate("/app/vouchers/import?type=books-vs-gstr1")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"
          >
            <Upload size={16} />
            Import / Update GSTR-1
          </button>
        </div>
      </div>

      {/* Reporting Period & Filter Bar */}
      <div
        className={`p-4 rounded-xl border mb-6 flex flex-wrap items-center justify-between gap-4 ${
          theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 flex items-center gap-1 mr-1">
            <Calendar size={14} /> Period:
          </span>
          {[
            { id: "all", label: "All Records" },
            { id: "this-month", label: "This Month" },
            { id: "last-month", label: "Last Month" },
            { id: "this-quarter", label: "This Quarter" },
            { id: "this-fy", label: "This FY" },
          ].map((preset) => (
            <button
              key={preset.id}
              onClick={() => handlePresetChange(preset.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                periodPreset === preset.id
                  ? "bg-blue-600 text-white"
                  : theme === "dark"
                  ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Date Pickers & Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-gray-500">From:</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPeriodPreset("custom");
              }}
              className="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-900"
            />
            <span className="text-gray-500">To:</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPeriodPreset("custom");
              }}
              className="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-900"
            />
          </div>

          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search invoice, customer, amount..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* 50% - 50% Summary Header Partition */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Left Partition (50%): Books Summary */}
        <div
          className={`p-5 rounded-xl border relative overflow-hidden ${
            theme === "dark"
              ? "bg-gradient-to-r from-blue-950/40 to-gray-800 border-blue-900/60"
              : "bg-gradient-to-r from-blue-50 to-white border-blue-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950">
              Left Partition (50%)
            </span>
            <span className="text-xs font-semibold text-gray-500">
              {filteredBooksRecords.length} Sales Records
            </span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            📘 Books Sales Register
          </h3>
          <div className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 mt-2">
            {formatCurrency(totalBookValue)}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>Tax: <strong>{formatCurrency(totalBookTax)}</strong></span>
            <span>•</span>
            <span>Total: <strong>{formatCurrency(totalBookTotal)}</strong></span>
          </div>
        </div>

        {/* Right Partition (50%): GSTR-1 Summary */}
        <div
          className={`p-5 rounded-xl border relative overflow-hidden ${
            theme === "dark"
              ? "bg-gradient-to-r from-green-950/40 to-gray-800 border-green-900/60"
              : "bg-gradient-to-r from-green-50 to-white border-green-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-green-600 dark:text-green-400 px-2 py-0.5 rounded bg-green-100 dark:bg-green-950">
              Right Partition (50%)
            </span>
            <span className="text-xs font-semibold text-gray-500">
              {filteredGstr1Rows.length} GSTR-1 Invoices
            </span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            📊 Filed GSTR-1 Return
          </h3>
          <div className="text-3xl font-extrabold text-green-600 dark:text-green-400 mt-2">
            {formatCurrency(totalGstr1Taxable)}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>Tax: <strong>{formatCurrency(totalGstr1Tax)}</strong></span>
            <span>•</span>
            <span>
              Variance:{" "}
              <strong
                className={
                  Math.abs(taxableVariance) < 0.01
                    ? "text-green-600"
                    : "text-amber-600"
                }
              >
                {formatCurrency(taxableVariance)}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Variance Alert Banner */}
      {filteredGstr1Rows.length > 0 && filteredBooksRecords.length > 0 && (
        <div
          className={`p-3.5 rounded-lg mb-6 border flex items-center justify-between text-xs ${
            isReconciled
              ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
              : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {isReconciled ? (
              <CheckCircle2 size={18} className="text-green-600" />
            ) : (
              <AlertTriangle size={18} className="text-amber-600" />
            )}
            <span>
              <strong>Reconciliation Status:</strong>{" "}
              {isReconciled
                ? "Books Sales and GSTR-1 reported values match perfectly."
                : `Variance of ${formatCurrency(Math.abs(taxableVariance))} detected between Books (${formatCurrency(totalBookValue)}) and GSTR-1 (${formatCurrency(totalGstr1Taxable)}).`}
            </span>
          </div>
          <span className="font-semibold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded bg-white/60 dark:bg-gray-800">
            {isReconciled ? "Matched" : "Variance Detected"}
          </span>
        </div>
      )}

      {/* 50% - 50% Split Content Partition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Partition Table (50%): Books Side */}
        <div
          className={`border rounded-xl overflow-hidden flex flex-col ${
            theme === "dark"
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <div className="p-3.5 bg-blue-50 dark:bg-blue-950/50 border-b border-blue-200 dark:border-blue-900 flex items-center justify-between">
            <span className="font-bold text-sm text-blue-900 dark:text-blue-200 flex items-center gap-2">
              📘 Books Sales Records (50% Partition)
            </span>
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-2 py-0.5 rounded">
              {filteredBooksRecords.length}{" "}
              {filteredBooksRecords.length === 1 ? "Record" : "Records"}
            </span>
          </div>

          <div className="overflow-x-auto flex-1 min-h-[320px]">
            {isLoadingBooks ? (
              <div className="flex flex-col items-center justify-center p-16 text-gray-500">
                <Loader2 className="animate-spin mb-2 text-blue-600" size={32} />
                <p className="text-sm font-medium">Loading sales records from Books...</p>
              </div>
            ) : booksError ? (
              <div className="p-10 text-center">
                <div className="inline-flex p-3 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 mb-3">
                  <AlertCircle size={24} />
                </div>
                <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
                  {booksError}
                </p>
                <button
                  onClick={() => fetchBooksSales(fromDate, toDate)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <RefreshCw size={12} />
                  Retry
                </button>
              </div>
            ) : filteredBooksRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 text-gray-500 text-center">
                <FileText className="mb-2 text-gray-400" size={36} />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  No sales records found in Books
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {searchTerm || fromDate || toDate
                    ? "Try adjusting your filters or date range"
                    : "No sales vouchers recorded in the accounting books"}
                </p>
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-b sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Date</th>
                    <th className="px-3 py-2.5 font-semibold">Invoice Number</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Value</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Tax</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredBooksRecords.map((r, i) => (
                    <tr
                      key={r.id || i}
                      className="hover:bg-blue-50/40 dark:hover:bg-gray-750 transition-colors"
                    >
                      <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap font-medium">
                        {formatDate(r.date)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-gray-900 dark:text-gray-100 font-mono">
                          {r.invoiceNumber}
                        </div>
                        {r.partyName && (
                          <div
                            className="text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[180px]"
                            title={r.partyName}
                          >
                            {r.partyName}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
                        {formatCurrency(r.value)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        {formatCurrency(r.tax)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {formatCurrency(r.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-gray-900/80 font-bold border-t border-gray-200 dark:border-gray-700">
                  <tr>
                    <td
                      className="px-3 py-2.5 text-gray-900 dark:text-gray-100"
                      colSpan={2}
                    >
                      Total ({filteredBooksRecords.length}{" "}
                      {filteredBooksRecords.length === 1 ? "invoice" : "invoices"})
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {formatCurrency(totalBookValue)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      {formatCurrency(totalBookTax)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {formatCurrency(totalBookTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>

        {/* Right Partition Table (50%): GSTR-1 Side */}
        <div
          className={`border rounded-xl overflow-hidden flex flex-col ${
            theme === "dark"
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <div className="p-3.5 bg-green-50 dark:bg-green-950/50 border-b border-green-200 dark:border-green-900 flex items-center justify-between">
            <span className="font-bold text-sm text-green-900 dark:text-green-200 flex items-center gap-2">
              📊 Filed GSTR-1 Invoices (50% Partition)
            </span>
            <span className="text-xs font-semibold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/60 px-2 py-0.5 rounded">
              {filteredGstr1Rows.length}{" "}
              {filteredGstr1Rows.length === 1 ? "Invoice" : "Invoices"}
            </span>
          </div>

          <div className="overflow-x-auto flex-1 min-h-[320px]">
            {filteredGstr1Rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 text-gray-500 text-center">
                <FileText className="mb-2 text-gray-400" size={36} />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  No GSTR-1 return records imported yet
                </p>
                <p className="text-xs text-gray-400 mt-1 max-w-xs mb-4">
                  Import your filed GSTR-1 returns spreadsheet to compare against accounting books
                </p>
                <button
                  onClick={() => navigate("/app/vouchers/import?type=books-vs-gstr1")}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <Upload size={14} />
                  Import GSTR-1 Data
                </button>
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-b sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">GSTR1 Inv No</th>
                    <th className="px-3 py-2.5 font-semibold">Date</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Taxable</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Tax Amount</th>
                    <th className="px-3 py-2.5 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredGstr1Rows.map((r, i) => {
                    const statusStr = String(
                      r["Match Status"] || r.matchStatus || "Matched"
                    ).toLowerCase();
                    const isMatched =
                      statusStr.includes("matched") && !statusStr.includes("mis");
                    return (
                      <tr
                        key={i}
                        className="hover:bg-green-50/40 dark:hover:bg-gray-750 transition-colors"
                      >
                        <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-gray-100 font-mono">
                          {r["GSTR1 Invoice No"] || r.gstr1InvoiceNo || "-"}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(r["Invoice Date"] || r.invoiceDate)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
                          {formatCurrency(
                            parseFloat(r["GSTR1 Taxable Value"] || r.gstr1Taxable || 0)
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-green-600 dark:text-green-400 whitespace-nowrap">
                          {formatCurrency(
                            parseFloat(r["GSTR1 Tax Amount"] || r.gstr1TaxAmount || 0)
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isMatched
                                ? "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300"
                            }`}
                          >
                            {r["Match Status"] || r.matchStatus || "Matched"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-gray-900/80 font-bold border-t border-gray-200 dark:border-gray-700">
                  <tr>
                    <td
                      className="px-3 py-2.5 text-gray-900 dark:text-gray-100"
                      colSpan={2}
                    >
                      Total ({filteredGstr1Rows.length}{" "}
                      {filteredGstr1Rows.length === 1 ? "invoice" : "invoices"})
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {formatCurrency(totalGstr1Taxable)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-green-600 dark:text-green-400 whitespace-nowrap">
                      {formatCurrency(totalGstr1Tax)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-500">-</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BooksVsGstr1Report;
