import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAppContext } from "../../context/AppContext";
import { useCompany } from "../../context/CompanyContext";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Layers,
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
import GstJsonScanner, {
  type ParsedGstr1Data,
  isDateInRange,
  isPeriodInRange,
  normalizeToIsoDate,
} from "./gst-scanner/GstJsonScanner";

export interface BookSaleRecord {
  id: string;
  date: string;
  invoiceNumber: string;
  value: number;
  cgst: number;
  sgst: number;
  igst: number;
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

  // Scanned GSTR-1 JSON Data & Partition View Mode
  const [scannedGstr1Data, setScannedGstr1Data] = useState<ParsedGstr1Data | null>(null);
  const [rightPartitionView, setRightPartitionView] = useState<"json-scanner" | "spreadsheet">("json-scanner");

  // Books Sales Data & Active Filter Tab (B2B vs B2C)
  const [booksSales, setBooksSales] = useState<BookSaleRecord[]>([]);
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [booksActiveTab, setBooksActiveTab] = useState<"b2b" | "b2c">("b2b");

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
            cgst: cgst,
            sgst: sgst,
            igst: igst,
            tax: tax,
            total: total,
            partyName: r.partyName || r.customerName || "",
            partyGSTIN: r.partyGSTIN || r.gstin || r.customerGstin || "",
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
          const cgst =
            parseFloat(r["Book CGST"] || r.bookCgst || 0) || (tax > 0 ? tax / 2 : 0);
          const sgst =
            parseFloat(r["Book SGST"] || r.bookSgst || 0) || (tax > 0 ? tax / 2 : 0);
          const igst =
            parseFloat(r["Book IGST"] || r.bookIgst || 0) || 0;
          return {
            id: `import-${i}`,
            date: r["Invoice Date"] || r.invoiceDate || "",
            invoiceNumber: r["Book Invoice No"] || r.bookInvoiceNo || "-",
            value: val,
            cgst: cgst,
            sgst: sgst,
            igst: igst,
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

  // Filtered Books Records (filtered by fromDate, toDate, and searchTerm)
  const filteredBooksRecords = useMemo(() => {
    let list = effectiveBooksRecords;

    // Filter by Date Range
    if (fromDate || toDate) {
      list = list.filter((r) => isDateInRange(r.date, fromDate, toDate));
    }

    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase().trim();
    return list.filter(
      (r) =>
        r.invoiceNumber.toLowerCase().includes(term) ||
        r.date.toLowerCase().includes(term) ||
        (r.partyName && r.partyName.toLowerCase().includes(term)) ||
        (r.partyGSTIN && r.partyGSTIN.toLowerCase().includes(term)) ||
        r.value.toString().includes(term) ||
        r.tax.toString().includes(term) ||
        r.total.toString().includes(term)
    );
  }, [effectiveBooksRecords, fromDate, toDate, searchTerm]);

  // Helper to determine if a Books record is B2B (registered customer GSTIN)
  const isB2b = (r: BookSaleRecord): boolean => {
    if (!r.partyGSTIN) return false;
    const gstin = r.partyGSTIN.trim().toUpperCase();
    if (
      gstin === "" ||
      gstin === "-" ||
      gstin === "NA" ||
      gstin === "N/A" ||
      gstin === "URP" ||
      gstin === "UNREGISTERED" ||
      gstin === "CONSUMER"
    ) {
      return false;
    }
    return gstin.length >= 10;
  };

  // Books B2B vs B2C Split
  const booksB2bRecords = useMemo(
    () => filteredBooksRecords.filter(isB2b),
    [filteredBooksRecords]
  );

  const booksB2cRecords = useMemo(
    () => filteredBooksRecords.filter((r) => !isB2b(r)),
    [filteredBooksRecords]
  );

  // Displayed Books records based on active tab (B2B vs B2C)
  const displayedBooksRecords = useMemo(() => {
    return booksActiveTab === "b2b" ? booksB2bRecords : booksB2cRecords;
  }, [booksActiveTab, booksB2bRecords, booksB2cRecords]);

  // Displayed Books Totals (for table footer)
  const displayedBookValue = useMemo(
    () => displayedBooksRecords.reduce((acc, r) => acc + r.value, 0),
    [displayedBooksRecords]
  );
  const displayedBookCgst = useMemo(
    () => displayedBooksRecords.reduce((acc, r) => acc + (r.cgst || 0), 0),
    [displayedBooksRecords]
  );
  const displayedBookSgst = useMemo(
    () => displayedBooksRecords.reduce((acc, r) => acc + (r.sgst || 0), 0),
    [displayedBooksRecords]
  );
  const displayedBookIgst = useMemo(
    () => displayedBooksRecords.reduce((acc, r) => acc + (r.igst || 0), 0),
    [displayedBooksRecords]
  );
  const displayedBookTotal = useMemo(
    () => displayedBooksRecords.reduce((acc, r) => acc + r.total, 0),
    [displayedBooksRecords]
  );

  // Overall Books Totals (for summary cards & variance)
  const totalBookValue = useMemo(
    () => filteredBooksRecords.reduce((acc, r) => acc + r.value, 0),
    [filteredBooksRecords]
  );
  const totalBookCgst = useMemo(
    () => filteredBooksRecords.reduce((acc, r) => acc + (r.cgst || 0), 0),
    [filteredBooksRecords]
  );
  const totalBookSgst = useMemo(
    () => filteredBooksRecords.reduce((acc, r) => acc + (r.sgst || 0), 0),
    [filteredBooksRecords]
  );
  const totalBookIgst = useMemo(
    () => filteredBooksRecords.reduce((acc, r) => acc + (r.igst || 0), 0),
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

  // Filtered GSTR-1 B2B invoices based on fromDate, toDate, searchTerm
  const filteredGstr1B2bInvoices = useMemo(() => {
    if (!scannedGstr1Data) return [];
    let list = scannedGstr1Data.b2bInvoices;

    // Filter by Date Range
    if (fromDate || toDate) {
      list = list.filter((r) => isDateInRange(r.idt, fromDate, toDate));
    }

    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase().trim();
    return list.filter(
      (r) =>
        r.inum.toLowerCase().includes(term) ||
        r.ctin.toLowerCase().includes(term) ||
        r.idt.toLowerCase().includes(term) ||
        r.txval.toString().includes(term)
    );
  }, [scannedGstr1Data, fromDate, toDate, searchTerm]);

  // Filtered GSTR-1 B2C summaries based on fromDate, toDate
  const filteredGstr1B2cSummaries = useMemo(() => {
    if (!scannedGstr1Data) return [];
    let list = scannedGstr1Data.b2cSummaries;

    if (fromDate || toDate) {
      const inRange = isPeriodInRange(
        scannedGstr1Data.metadata.fp,
        scannedGstr1Data.metadata.fil_dt,
        fromDate,
        toDate
      );
      if (!inRange) return [];
    }

    return list;
  }, [scannedGstr1Data, fromDate, toDate]);

  // GSTR-1 Rows from imported report data (spreadsheet fallback)
  const gstr1Rows = reportData?.rows || [];

  const filteredGstr1Rows = useMemo(() => {
    let list = gstr1Rows;
    if (fromDate || toDate) {
      list = list.filter((r) =>
        isDateInRange(r["Invoice Date"] || r.invoiceDate, fromDate, toDate)
      );
    }
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase().trim();
    return list.filter((r) =>
      JSON.stringify(r).toLowerCase().includes(term)
    );
  }, [gstr1Rows, fromDate, toDate, searchTerm]);

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

  // Effective GSTR-1 Metrics (using scanned JSON if uploaded, or spreadsheet rows)
  const effectiveGstr1Taxable = useMemo(() => {
    if (scannedGstr1Data) {
      const b2b = filteredGstr1B2bInvoices.reduce((a, b) => a + b.txval, 0);
      const b2c = filteredGstr1B2cSummaries.reduce((a, b) => a + b.txval, 0);
      return b2b + b2c;
    }
    return totalGstr1Taxable;
  }, [scannedGstr1Data, filteredGstr1B2bInvoices, filteredGstr1B2cSummaries, totalGstr1Taxable]);

  const effectiveGstr1Tax = useMemo(() => {
    if (scannedGstr1Data) {
      const b2b = filteredGstr1B2bInvoices.reduce(
        (a, b) => a + b.camt + b.samt + b.iamt + b.csamt,
        0
      );
      const b2c = filteredGstr1B2cSummaries.reduce(
        (a, b) => a + b.camt + b.samt + b.iamt + b.csamt,
        0
      );
      return b2b + b2c;
    }
    return totalGstr1Tax;
  }, [scannedGstr1Data, filteredGstr1B2bInvoices, filteredGstr1B2cSummaries, totalGstr1Tax]);

  const effectiveGstr1Count = useMemo(() => {
    if (scannedGstr1Data) {
      return (
        filteredGstr1B2bInvoices.length + filteredGstr1B2cSummaries.length
      );
    }
    return filteredGstr1Rows.length;
  }, [scannedGstr1Data, filteredGstr1B2bInvoices, filteredGstr1B2cSummaries, filteredGstr1Rows.length]);

  // Reconciliation Variance
  const taxableVariance = totalBookValue - effectiveGstr1Taxable;
  const hasGstr1Data = Boolean(scannedGstr1Data) || filteredGstr1Rows.length > 0;
  const isReconciled =
    Math.abs(taxableVariance) < 0.01 &&
    filteredBooksRecords.length > 0 &&
    hasGstr1Data;

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
              <span className="text-blue-600 dark:text-blue-400 font-medium">
                {booksB2bRecords.length} B2B + {booksB2cRecords.length} B2C
              </span>
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
              {scannedGstr1Data ? (
                <span className="text-green-600 dark:text-green-400 font-medium">
                  {filteredGstr1B2bInvoices.length} B2B + {filteredGstr1B2cSummaries.length} B2C (JSON Scanned)
                </span>
              ) : (
                `${filteredGstr1Rows.length} GSTR-1 Invoices`
              )}
            </span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center justify-between">
            <span>📊 Filed GSTR-1 Return</span>
            {scannedGstr1Data?.metadata.gstin && (
              <span className="text-xs font-mono font-normal text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/70 px-2 py-0.5 rounded">
                {scannedGstr1Data.metadata.gstin}
              </span>
            )}
          </h3>
          <div className="text-3xl font-extrabold text-green-600 dark:text-green-400 mt-2">
            {formatCurrency(effectiveGstr1Taxable)}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>Tax: <strong>{formatCurrency(effectiveGstr1Tax)}</strong></span>
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
      {hasGstr1Data && filteredBooksRecords.length > 0 ? (
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
                : `Variance of ${formatCurrency(Math.abs(taxableVariance))} detected between Books (${formatCurrency(totalBookValue)}) and GSTR-1 (${formatCurrency(effectiveGstr1Taxable)}).`}
            </span>
          </div>
          <span className="font-semibold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded bg-white/60 dark:bg-gray-800">
            {isReconciled ? "Matched" : "Variance Detected"}
          </span>
        </div>
      ) : !hasGstr1Data ? (
        <div className="p-3.5 rounded-lg mb-6 border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-blue-600" />
            <span>
              <strong>GSTR-1 Upload Ready:</strong> Select and scan your official GSTR-1 JSON file in the right partition below to compare B2B invoices and B2C summaries against Books sales.
            </span>
          </div>
          <span className="font-semibold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded bg-white/60 dark:bg-gray-800">
            Awaiting GSTR-1
          </span>
        </div>
      ) : null}

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
              {displayedBooksRecords.length}{" "}
              {displayedBooksRecords.length === 1 ? "Record" : "Records"}
            </span>
          </div>

          {/* Tab Switcher for Books: B2B Invoices | B2C Summary */}
          <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2 bg-gray-50/50 dark:bg-gray-850">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBooksActiveTab("b2b")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  booksActiveTab === "b2b"
                    ? "bg-blue-600 text-white shadow-xs"
                    : theme === "dark"
                    ? "bg-gray-750 text-gray-300 hover:bg-gray-700"
                    : "bg-white text-gray-700 border hover:bg-gray-100"
                }`}
              >
                <FileText size={14} />
                B2B Invoices
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    booksActiveTab === "b2b"
                      ? "bg-white/20 text-white"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300"
                  }`}
                >
                  {booksB2bRecords.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setBooksActiveTab("b2c")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  booksActiveTab === "b2c"
                    ? "bg-blue-600 text-white shadow-xs"
                    : theme === "dark"
                    ? "bg-gray-750 text-gray-300 hover:bg-gray-700"
                    : "bg-white text-gray-700 border hover:bg-gray-100"
                }`}
              >
                <Layers size={14} />
                B2C Summary
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    booksActiveTab === "b2c"
                      ? "bg-white/20 text-white"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300"
                  }`}
                >
                  {booksB2cRecords.length}
                </span>
              </button>
            </div>
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
            ) : displayedBooksRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-14 text-center text-gray-500">
                {booksActiveTab === "b2b" ? (
                  <>
                    <FileText size={36} className="text-gray-400 mb-2" />
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      No B2B Invoices Found
                    </p>
                    <p className="text-xs text-gray-400 mt-1 max-w-sm">
                      None of the {filteredBooksRecords.length} sales records in Books have a registered customer GSTIN.
                    </p>
                  </>
                ) : (
                  <>
                    <Layers size={36} className="text-gray-400 mb-2" />
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      No B2C Records Found
                    </p>
                    <p className="text-xs text-gray-400 mt-1 max-w-sm">
                      All {filteredBooksRecords.length} sales records in Books have registered customer GSTINs (B2B).
                    </p>
                  </>
                )}
              </div>
            ) : (
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-2.5 py-2.5 font-semibold text-center w-10">
                      #
                    </th>
                    <th className="px-3 py-2.5 font-semibold">
                      Customer GSTIN (ctin)
                    </th>
                    <th className="px-3 py-2.5 font-semibold">
                      Invoice No (inum)
                    </th>
                    <th className="px-3 py-2.5 font-semibold">
                      Date (idt)
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-right">
                      Taxable Value (txval)
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-right">
                      CGST (camt)
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-right">
                      SGST (samt)
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-right">
                      IGST (iamt)
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-right bg-blue-50/60 dark:bg-blue-950/40">
                      Invoice Val (val)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {displayedBooksRecords.map((r, i) => (
                    <tr
                      key={r.id || i}
                      className="hover:bg-blue-50/40 dark:hover:bg-gray-750 transition-colors"
                    >
                      <td className="px-2.5 py-2 text-center text-gray-500 font-mono">
                        {i + 1}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                          {r.partyGSTIN || (
                            <span className="text-gray-400 font-normal italic">URP (Consumer)</span>
                          )}
                        </div>
                        {r.partyName && (
                          <div
                            className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[150px]"
                            title={r.partyName}
                          >
                            {r.partyName}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono font-medium text-blue-600 dark:text-blue-400">
                        {r.invoiceNumber}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {formatDate(r.date)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {formatCurrency(r.value)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {formatCurrency(r.cgst)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {formatCurrency(r.sgst)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {formatCurrency(r.igst)}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-blue-700 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-950/20 whitespace-nowrap">
                        {formatCurrency(r.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 dark:bg-gray-900 font-bold border-t border-gray-300 dark:border-gray-700 sticky bottom-0 z-10">
                  <tr>
                    <td
                      className="px-3 py-2.5 text-gray-800 dark:text-gray-200"
                      colSpan={4}
                    >
                      Total {booksActiveTab === "b2b" ? "B2B" : booksActiveTab === "b2c" ? "B2C" : ""} ({displayedBooksRecords.length}{" "}
                      {displayedBooksRecords.length === 1 ? "invoice" : "invoices"})
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">
                      {formatCurrency(displayedBookValue)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formatCurrency(displayedBookCgst)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formatCurrency(displayedBookSgst)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formatCurrency(displayedBookIgst)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-extrabold text-blue-700 dark:text-blue-400 bg-blue-100/60 dark:bg-blue-950/60 whitespace-nowrap">
                      {formatCurrency(displayedBookTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>

        {/* Right Partition (50%): GSTR-1 Side with GST JSON Scanner */}
        <div className="flex flex-col space-y-4">
          {/* If legacy spreadsheet rows exist, show a view switcher toggle */}
          {filteredGstr1Rows.length > 0 && (
            <div
              className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                theme === "dark"
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                Right Partition Data Source:
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setRightPartitionView("json-scanner")}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    rightPartitionView === "json-scanner"
                      ? "bg-green-600 text-white shadow-xs"
                      : theme === "dark"
                      ? "bg-gray-750 text-gray-300 hover:bg-gray-700"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  ⚡ GST JSON Scanner
                </button>
                <button
                  onClick={() => setRightPartitionView("spreadsheet")}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    rightPartitionView === "spreadsheet"
                      ? "bg-green-600 text-white shadow-xs"
                      : theme === "dark"
                      ? "bg-gray-750 text-gray-300 hover:bg-gray-700"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  📄 Spreadsheet ({filteredGstr1Rows.length})
                </button>
              </div>
            </div>
          )}

          {rightPartitionView === "json-scanner" ? (
            <GstJsonScanner
              onDataLoaded={(data) => setScannedGstr1Data(data)}
              fromDate={fromDate}
              toDate={toDate}
              searchTerm={searchTerm}
            />
          ) : (
            <div
              className={`border rounded-xl overflow-hidden flex flex-col ${
                theme === "dark"
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <div className="p-3.5 bg-green-50 dark:bg-green-950/50 border-b border-green-200 dark:border-green-900 flex items-center justify-between">
                <span className="font-bold text-sm text-green-900 dark:text-green-200 flex items-center gap-2">
                  📊 Filed GSTR-1 Invoices (Spreadsheet View)
                </span>
                <span className="text-xs font-semibold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/60 px-2 py-0.5 rounded">
                  {filteredGstr1Rows.length}{" "}
                  {filteredGstr1Rows.length === 1 ? "Invoice" : "Invoices"}
                </span>
              </div>

              <div className="overflow-x-auto flex-1 min-h-[320px]">
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BooksVsGstr1Report;
