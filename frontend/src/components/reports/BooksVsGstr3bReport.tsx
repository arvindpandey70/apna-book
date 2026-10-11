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

export interface Gstr3bRow {
  periodOrType: string;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  totalTax: number;
  status?: string;
}

const BooksVsGstr3bReport: React.FC = () => {
  const { theme } = useAppContext();
  const { companyInfo, activeCompanyId } = useCompany();
  const navigate = useNavigate();

  // Stored / Imported GSTR-3B Data
  const [reportData, setReportData] = useState<StoredReportData | null>(null);

  // Books Sales Data
  const [booksSales, setBooksSales] = useState<BookSaleRecord[]>([]);
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [booksError, setBooksError] = useState<string | null>(null);

  // GSTR-3B Data from API
  const [apiGstr3bRows, setApiGstr3bRows] = useState<Gstr3bRow[]>([]);
  const [isLoadingGstr3b, setIsLoadingGstr3b] = useState(false);

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

  // Load imported GSTR-3B comparison data
  useEffect(() => {
    const data = getReportData("books-vs-gstr3b") || getReportData("gstr1-vs-gstr3b");
    setReportData(data);
  }, []);

  // Fetch Books Sales records from backend API
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

  // Fetch GSTR-3B Outward Return details from API
  const fetchGstr3bData = useCallback(async () => {
    setIsLoadingGstr3b(true);
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
      const url = `${apiBase}/api/gstr3b?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;

      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const a = json?.a;
        const b = json?.b;
        const c = json?.c;

        const rows: Gstr3bRow[] = [];

        if (a && (a.taxable_value || a.integrated_tax || a.central_tax || a.state_tax)) {
          const igst = Number(a.integrated_tax || 0);
          const cgst = Number(a.central_tax || 0);
          const sgst = Number(a.state_tax || 0);
          rows.push({
            periodOrType: "3.1(a) Outward Taxable Supplies",
            taxableValue: Number(a.taxable_value || 0),
            igst,
            cgst,
            sgst,
            totalTax: igst + cgst + sgst,
            status: "Filed",
          });
        }

        if (b && (b.total || (b.byVoucher && b.byVoucher.length > 0))) {
          rows.push({
            periodOrType: "3.1(b) Outward Taxable Supplies (Zero Rated)",
            taxableValue: Number(b.total || 0),
            igst: 0,
            cgst: 0,
            sgst: 0,
            totalTax: 0,
            status: "Filed",
          });
        }

        const nilExemptTotal =
          (Number(c?.nil?.total || 0)) + (Number(c?.exempted?.total || 0));
        if (nilExemptTotal > 0) {
          rows.push({
            periodOrType: "3.1(c) Other Outward Supplies (Nil Rated, Exempted)",
            taxableValue: nilExemptTotal,
            igst: 0,
            cgst: 0,
            sgst: 0,
            totalTax: 0,
            status: "Filed",
          });
        }

        setApiGstr3bRows(rows);
      }
    } catch (err) {
      console.warn("GSTR3B API fetch notice:", err);
    } finally {
      setIsLoadingGstr3b(false);
    }
  }, [activeCompanyId, companyInfo]);

  useEffect(() => {
    fetchBooksSales(fromDate, toDate);
    fetchGstr3bData();
  }, [fetchBooksSales, fetchGstr3bData, fromDate, toDate]);

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

  // Merge Books data
  const effectiveBooksRecords = useMemo(() => {
    if (booksSales.length > 0) {
      return booksSales;
    }
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

  // Filter Books by search term
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

  // Books totals
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

  // GSTR-3B rows: Use imported rows if available, else API rows
  const effectiveGstr3bRows = useMemo<Gstr3bRow[]>(() => {
    if (reportData?.rows && reportData.rows.length > 0) {
      return reportData.rows.map((r) => {
        const taxable =
          parseFloat(r["GSTR3B Taxable Value"] || r.gstr3bTaxable || 0) || 0;
        const igst =
          parseFloat(r["GSTR3B IGST"] || r.gstr3bIgst || 0) || 0;
        const cgst =
          parseFloat(r["GSTR3B CGST"] || r.gstr3bCgst || 0) || 0;
        const sgst =
          parseFloat(r["GSTR3B SGST"] || r.gstr3bSgst || 0) || 0;
        const totalTax =
          parseFloat(r["GSTR3B Total Tax"] || r.gstr3bTotalTax || 0) ||
          igst + cgst + sgst;
        return {
          periodOrType:
            r["Return Period"] ||
            r.returnPeriod ||
            r["Supply Type"] ||
            r.supplyType ||
            "Outward Supplies",
          taxableValue: taxable,
          igst,
          cgst,
          sgst,
          totalTax,
          status: r["Variance Status"] || r.status || "Filed",
        };
      });
    }

    if (apiGstr3bRows.length > 0) {
      return apiGstr3bRows;
    }

    return [];
  }, [reportData, apiGstr3bRows]);

  const filteredGstr3bRows = useMemo(() => {
    if (!searchTerm.trim()) return effectiveGstr3bRows;
    const term = searchTerm.toLowerCase();
    return effectiveGstr3bRows.filter((r) =>
      JSON.stringify(r).toLowerCase().includes(term)
    );
  }, [effectiveGstr3bRows, searchTerm]);

  const totalGstr3bTaxable = useMemo(
    () => filteredGstr3bRows.reduce((acc, r) => acc + r.taxableValue, 0),
    [filteredGstr3bRows]
  );
  const totalGstr3bTax = useMemo(
    () => filteredGstr3bRows.reduce((acc, r) => acc + r.totalTax, 0),
    [filteredGstr3bRows]
  );

  const taxableVariance = totalBookValue - totalGstr3bTaxable;
  const isReconciled =
    Math.abs(taxableVariance) < 0.01 &&
    filteredBooksRecords.length > 0 &&
    filteredGstr3bRows.length > 0;

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
              <FileText className="text-indigo-600 dark:text-indigo-400" size={28} />
              Books vs GSTR-3B Report
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Sales Register (Books) vs Filed GSTR-3B Summary Reconciliation (50% - 50% Split Partition)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchBooksSales(fromDate, toDate);
              fetchGstr3bData();
            }}
            title="Refresh Data"
            className={`p-2 rounded-lg border transition-colors flex items-center gap-1.5 text-sm ${
              theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700"
                : "bg-white hover:bg-gray-100 text-gray-700 border-gray-300 shadow-sm"
            }`}
          >
            <RefreshCw size={16} className={isLoadingBooks || isLoadingGstr3b ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => navigate("/app/vouchers/import?type=books-vs-gstr3b")}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"
          >
            <Upload size={16} />
            Import / Update GSTR-3B
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
                  ? "bg-indigo-600 text-white"
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
              className="pl-8 pr-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

        {/* Right Partition (50%): GSTR-3B Summary */}
        <div
          className={`p-5 rounded-xl border relative overflow-hidden ${
            theme === "dark"
              ? "bg-gradient-to-r from-indigo-950/40 to-gray-800 border-indigo-900/60"
              : "bg-gradient-to-r from-indigo-50 to-white border-indigo-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950">
              Right Partition (50%)
            </span>
            <span className="text-xs font-semibold text-gray-500">
              {filteredGstr3bRows.length} Return Entries
            </span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            📊 Filed GSTR-3B Return
          </h3>
          <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-2">
            {formatCurrency(totalGstr3bTaxable)}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>Tax: <strong>{formatCurrency(totalGstr3bTax)}</strong></span>
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
      {filteredGstr3bRows.length > 0 && filteredBooksRecords.length > 0 && (
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
                ? "Books Sales and GSTR-3B Outward supplies match perfectly."
                : `Variance of ${formatCurrency(Math.abs(taxableVariance))} detected between Books (${formatCurrency(totalBookValue)}) and GSTR-3B (${formatCurrency(totalGstr3bTaxable)}).`}
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

        {/* Right Partition Table (50%): GSTR-3B Side */}
        <div
          className={`border rounded-xl overflow-hidden flex flex-col ${
            theme === "dark"
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/50 border-b border-indigo-200 dark:border-indigo-900 flex items-center justify-between">
            <span className="font-bold text-sm text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
              📊 Filed GSTR-3B Return (50% Partition)
            </span>
            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded">
              {filteredGstr3bRows.length}{" "}
              {filteredGstr3bRows.length === 1 ? "Entry" : "Entries"}
            </span>
          </div>

          <div className="overflow-x-auto flex-1 min-h-[320px]">
            {isLoadingGstr3b ? (
              <div className="flex flex-col items-center justify-center p-16 text-gray-500">
                <Loader2 className="animate-spin mb-2 text-indigo-600" size={32} />
                <p className="text-sm font-medium">Loading GSTR-3B return details...</p>
              </div>
            ) : filteredGstr3bRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 text-gray-500 text-center">
                <FileText className="mb-2 text-gray-400" size={36} />
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  No GSTR-3B return records imported yet
                </p>
                <p className="text-xs text-gray-400 mt-1 max-w-xs mb-4">
                  Import your filed GSTR-3B returns spreadsheet to compare against accounting books
                </p>
                <button
                  onClick={() => navigate("/app/vouchers/import?type=books-vs-gstr3b")}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <Upload size={14} />
                  Import GSTR-3B Data
                </button>
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-b sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Supply Type / Period</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Taxable</th>
                    <th className="px-3 py-2.5 font-semibold text-right">IGST</th>
                    <th className="px-3 py-2.5 font-semibold text-right">CGST</th>
                    <th className="px-3 py-2.5 font-semibold text-right">SGST</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Total Tax</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredGstr3bRows.map((r, i) => (
                    <tr
                      key={i}
                      className="hover:bg-indigo-50/40 dark:hover:bg-gray-750 transition-colors"
                    >
                      <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-gray-100">
                        {r.periodOrType}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
                        {formatCurrency(r.taxableValue)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {formatCurrency(r.igst)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {formatCurrency(r.cgst)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {formatCurrency(r.sgst)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                        {formatCurrency(r.totalTax)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-gray-900/80 font-bold border-t border-gray-200 dark:border-gray-700">
                  <tr>
                    <td className="px-3 py-2.5 text-gray-900 dark:text-gray-100">
                      Total ({filteredGstr3bRows.length}{" "}
                      {filteredGstr3bRows.length === 1 ? "entry" : "entries"})
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {formatCurrency(totalGstr3bTaxable)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap" colSpan={3}>
                      -
                    </td>
                    <td className="px-3 py-2.5 text-right text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                      {formatCurrency(totalGstr3bTax)}
                    </td>
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

export default BooksVsGstr3bReport;
