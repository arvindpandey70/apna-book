import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAppContext } from "../../context/AppContext";
import { useCompany } from "../../context/CompanyContext";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  FileText,
  Layers,
  Calendar,
  Search,
  RefreshCw,
  AlertCircle,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";
import {
  fetchLatestGstr2bFromDatabase,
  type ParsedGstr2bData,
} from "../../services/gstr2bImportService";
import Gstr2bJsonScanner, {
  isDateInRange,
  normalizeToIsoDate,
} from "../vouchers/import/gstr2b-scanner/Gstr2bJsonScanner";

export interface BookPurchaseRecord {
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

const BooksVs2bReport: React.FC = () => {
  const { theme } = useAppContext();
  const { companyInfo, activeCompanyId } = useCompany();
  const navigate = useNavigate();

  // Scanned / Persisted GSTR-2B JSON Data
  const [scannedGstr2bData, setScannedGstr2bData] = useState<ParsedGstr2bData | null>(null);

  // Books Purchases Data & Active Filter Tab (B2B vs B2C)
  const [booksPurchases, setBooksPurchases] = useState<BookPurchaseRecord[]>([]);
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [booksActiveTab, setBooksActiveTab] = useState<"b2b" | "b2c">("b2b");

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [periodPreset, setPeriodPreset] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // Quarter & Month Selection States
  const [selectedQuarter, setSelectedQuarter] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [isQuarterOpen, setIsQuarterOpen] = useState(false);
  const [isMonthOpen, setIsMonthOpen] = useState(false);
  const quarterRef = useRef<HTMLDivElement>(null);
  const monthRef = useRef<HTMLDivElement>(null);

  // Financial Year determination (defaults to current FY start year: e.g. 2026 for FY 2026-27)
  const defaultFyStart = useMemo(() => {
    const now = new Date();
    return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  }, []);
  const [fyYear, setFyYear] = useState<number>(defaultFyStart);

  // Synchronize Financial Year if uploaded GSTR-2B JSON has return period (rtnprd)
  useEffect(() => {
    if (scannedGstr2bData?.metadata?.rtnprd) {
      const fpStr = scannedGstr2bData.metadata.rtnprd.trim();
      if (fpStr.length === 6 && /^\d{6}$/.test(fpStr)) {
        const m = parseInt(fpStr.slice(0, 2), 10);
        const y = parseInt(fpStr.slice(2), 10);
        if (!isNaN(m) && !isNaN(y)) {
          const detectedFy = m >= 4 ? y : y - 1;
          setFyYear(detectedFy);
        }
      }
    }
  }, [scannedGstr2bData]);

  // Click outside and ESC key listener for popovers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        quarterRef.current &&
        !quarterRef.current.contains(e.target as Node)
      ) {
        setIsQuarterOpen(false);
      }
      if (
        monthRef.current &&
        !monthRef.current.contains(e.target as Node)
      ) {
        setIsMonthOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsQuarterOpen(false);
        setIsMonthOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // 4 Quarters definition for selected FY
  const quartersList = useMemo(() => {
    const nextYear = fyYear + 1;
    return [
      {
        id: "Q1",
        label: "Q1 (Apr - Jun)",
        monthsLabel: "Apr – Jun",
        from: `${fyYear}-04-01`,
        to: `${fyYear}-06-30`,
      },
      {
        id: "Q2",
        label: "Q2 (Jul - Sep)",
        monthsLabel: "Jul – Sep",
        from: `${fyYear}-07-01`,
        to: `${fyYear}-09-30`,
      },
      {
        id: "Q3",
        label: "Q3 (Oct - Dec)",
        monthsLabel: "Oct – Dec",
        from: `${fyYear}-10-01`,
        to: `${fyYear}-12-31`,
      },
      {
        id: "Q4",
        label: "Q4 (Jan - Mar)",
        monthsLabel: "Jan – Mar",
        from: `${nextYear}-01-01`,
        to: `${nextYear}-03-31`,
      },
    ];
  }, [fyYear]);

  // 12 FY Months definition (April to March) for selected FY
  const monthsList = useMemo(() => {
    const nextYear = fyYear + 1;
    const defs = [
      { name: "April", short: "Apr", mNum: 4, year: fyYear },
      { name: "May", short: "May", mNum: 5, year: fyYear },
      { name: "June", short: "Jun", mNum: 6, year: fyYear },
      { name: "July", short: "Jul", mNum: 7, year: fyYear },
      { name: "August", short: "Aug", mNum: 8, year: fyYear },
      { name: "September", short: "Sep", mNum: 9, year: fyYear },
      { name: "October", short: "Oct", mNum: 10, year: fyYear },
      { name: "November", short: "Nov", mNum: 11, year: fyYear },
      { name: "December", short: "Dec", mNum: 12, year: fyYear },
      { name: "January", short: "Jan", mNum: 1, year: nextYear },
      { name: "February", short: "Feb", mNum: 2, year: nextYear },
      { name: "March", short: "Mar", mNum: 3, year: nextYear },
    ];

    return defs.map((d) => {
      const lastDay = new Date(d.year, d.mNum, 0).getDate();
      const mm = String(d.mNum).padStart(2, "0");
      const dd = String(lastDay).padStart(2, "0");
      return {
        name: d.name,
        short: d.short,
        from: `${d.year}-${mm}-01`,
        to: `${d.year}-${mm}-${dd}`,
        year: d.year,
      };
    });
  }, [fyYear]);

  // Currency & Date formatting helpers
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
    if (preset === "this-fy") {
      return {
        from: `${fyYear}-04-01`,
        to: `${fyYear + 1}-03-31`,
      };
    }
    return { from: "", to: "" };
  };

  // Load persisted GSTR-2B return from database on mount or activeCompanyId change
  useEffect(() => {
    const companyId =
      activeCompanyId ||
      companyInfo?.id ||
      localStorage.getItem("company_id") ||
      "1";

    fetchLatestGstr2bFromDatabase(companyId)
      .then((dbData) => {
        if (dbData) setScannedGstr2bData(dbData);
      })
      .catch((err) => console.error("Error fetching persisted GSTR-2B:", err));
  }, [activeCompanyId, companyInfo]);

  // Fetch actual Books Purchases records from backend API
  const fetchBooksPurchases = useCallback(
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
        let url = `${apiBase}/api/purchase-report?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
        if (from && to) {
          url += `&from_date=${from}&to_date=${to}`;
        }

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to load purchase records (${res.status})`);
        }
        const json = await res.json();
        const rows = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
          ? json.data
          : [];

        const records: BookPurchaseRecord[] = rows.map((r: any) => {
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
            partyName: r.partyName || r.supplierName || "",
            partyGSTIN: r.partyGSTIN || r.gstin || r.supplierGstin || "",
          };
        });

        setBooksPurchases(records);
      } catch (err: any) {
        console.error("Books purchase fetch error:", err);
        setBooksError(err.message || "Failed to load purchase records from Books");
      } finally {
        setIsLoadingBooks(false);
      }
    },
    [activeCompanyId, companyInfo]
  );

  // Initial and reactive fetch
  useEffect(() => {
    fetchBooksPurchases(fromDate, toDate);
  }, [fetchBooksPurchases, fromDate, toDate]);

  // Quarter selection
  const handleSelectQuarter = (quarterId: string) => {
    const q = quartersList.find((x) => x.id === quarterId);
    if (!q) return;
    setSelectedQuarter(quarterId);
    setSelectedMonth("");
    setPeriodPreset(`quarter-${quarterId.toLowerCase()}`);
    setFromDate(q.from);
    setToDate(q.to);
    setIsQuarterOpen(false);
    setIsMonthOpen(false);
  };

  // Month selection (April to March)
  const handleSelectMonth = (monthName: string) => {
    const m = monthsList.find(
      (x) => x.name.toLowerCase() === monthName.toLowerCase()
    );
    if (!m) return;
    setSelectedMonth(m.name);
    setSelectedQuarter("");
    setPeriodPreset(`month-${m.name.toLowerCase()}`);
    setFromDate(m.from);
    setToDate(m.to);
    setIsMonthOpen(false);
    setIsQuarterOpen(false);
  };

  // Switch FY Year and recompute current active period range
  const handleFyYearChange = (newYear: number) => {
    setFyYear(newYear);
    const nextYear = newYear + 1;
    if (selectedQuarter) {
      const qDates: Record<string, { from: string; to: string }> = {
        Q1: { from: `${newYear}-04-01`, to: `${newYear}-06-30` },
        Q2: { from: `${newYear}-07-01`, to: `${newYear}-09-30` },
        Q3: { from: `${newYear}-10-01`, to: `${newYear}-12-31` },
        Q4: { from: `${nextYear}-01-01`, to: `${nextYear}-03-31` },
      };
      const range = qDates[selectedQuarter];
      if (range) {
        setFromDate(range.from);
        setToDate(range.to);
      }
    } else if (selectedMonth) {
      const mDefs: Record<string, { mNum: number; yr: number }> = {
        April: { mNum: 4, yr: newYear },
        May: { mNum: 5, yr: newYear },
        June: { mNum: 6, yr: newYear },
        July: { mNum: 7, yr: newYear },
        August: { mNum: 8, yr: newYear },
        September: { mNum: 9, yr: newYear },
        October: { mNum: 10, yr: newYear },
        November: { mNum: 11, yr: newYear },
        December: { mNum: 12, yr: newYear },
        January: { mNum: 1, yr: nextYear },
        February: { mNum: 2, yr: nextYear },
        March: { mNum: 3, yr: nextYear },
      };
      const def = mDefs[selectedMonth];
      if (def) {
        const lastDay = new Date(def.yr, def.mNum, 0).getDate();
        const mm = String(def.mNum).padStart(2, "0");
        const dd = String(lastDay).padStart(2, "0");
        setFromDate(`${def.yr}-${mm}-01`);
        setToDate(`${def.yr}-${mm}-${dd}`);
      }
    } else if (periodPreset === "this-fy") {
      setFromDate(`${newYear}-04-01`);
      setToDate(`${newYear + 1}-03-31`);
    }
  };

  // Handle Preset Change
  const handlePresetChange = (preset: string) => {
    setSelectedQuarter("");
    setSelectedMonth("");
    setIsQuarterOpen(false);
    setIsMonthOpen(false);
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

  // Filtered Books Records (filtered by fromDate, toDate, and searchTerm)
  const filteredBooksRecords = useMemo(() => {
    let list = booksPurchases;

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
  }, [booksPurchases, fromDate, toDate, searchTerm]);

  // Helper to determine if a Books purchase is B2B (registered supplier GSTIN)
  const isB2b = (r: BookPurchaseRecord): boolean => {
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

  // Filtered GSTR-2B B2B invoices based on fromDate, toDate, searchTerm
  const filteredGstr2bB2bInvoices = useMemo(() => {
    if (!scannedGstr2bData) return [];
    let list = scannedGstr2bData.b2bInvoices;

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
        (r.trdnm && r.trdnm.toLowerCase().includes(term)) ||
        r.idt.toLowerCase().includes(term) ||
        r.txval.toString().includes(term)
    );
  }, [scannedGstr2bData, fromDate, toDate, searchTerm]);

  // Filtered GSTR-2B CDNR notes based on fromDate, toDate, searchTerm
  const filteredGstr2bCdnrNotes = useMemo(() => {
    if (!scannedGstr2bData) return [];
    let list = scannedGstr2bData.cdnrNotes;

    // Filter by Date Range
    if (fromDate || toDate) {
      list = list.filter((r) => isDateInRange(r.dt, fromDate, toDate));
    }

    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase().trim();
    return list.filter(
      (r) =>
        r.ntnum.toLowerCase().includes(term) ||
        r.ctin.toLowerCase().includes(term) ||
        (r.trdnm && r.trdnm.toLowerCase().includes(term)) ||
        r.dt.toLowerCase().includes(term) ||
        r.txval.toString().includes(term)
    );
  }, [scannedGstr2bData, fromDate, toDate, searchTerm]);

  // Effective GSTR-2B Metrics (using scanned/persisted JSON)
  const effectiveGstr2bTaxable = useMemo(() => {
    if (!scannedGstr2bData) return 0;
    const b2b = filteredGstr2bB2bInvoices.reduce((a, b) => a + b.txval, 0);
    const cdnr = filteredGstr2bCdnrNotes.reduce((a, b) => a + b.txval, 0);
    return b2b + cdnr;
  }, [scannedGstr2bData, filteredGstr2bB2bInvoices, filteredGstr2bCdnrNotes]);

  const effectiveGstr2bTax = useMemo(() => {
    if (!scannedGstr2bData) return 0;
    const b2b = filteredGstr2bB2bInvoices.reduce(
      (a, b) => a + b.camt + b.samt + b.iamt + b.csamt,
      0
    );
    const cdnr = filteredGstr2bCdnrNotes.reduce(
      (a, b) => a + b.camt + b.samt + b.iamt + b.csamt,
      0
    );
    return b2b + cdnr;
  }, [scannedGstr2bData, filteredGstr2bB2bInvoices, filteredGstr2bCdnrNotes]);

  const effectiveGstr2bCount = useMemo(() => {
    if (!scannedGstr2bData) return 0;
    return filteredGstr2bB2bInvoices.length + filteredGstr2bCdnrNotes.length;
  }, [scannedGstr2bData, filteredGstr2bB2bInvoices, filteredGstr2bCdnrNotes]);

  // Reconciliation Variance
  const taxableVariance = totalBookValue - effectiveGstr2bTaxable;
  const itcVariance = totalBookTax - effectiveGstr2bTax;
  const hasGstr2bData = Boolean(scannedGstr2bData);
  const isReconciled =
    Math.abs(taxableVariance) < 0.01 &&
    filteredBooksRecords.length > 0 &&
    hasGstr2bData;

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
              <BookOpen className="text-blue-600 dark:text-blue-400" size={28} />
              Books vs GSTR-2B Report
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Purchase Register (Books) vs Filed GSTR-2B Inward Return Reconciliation (50% - 50% Split Partition)
            </p>
          </div>
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

          {/* All Records */}
          <button
            onClick={() => handlePresetChange("all")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              periodPreset === "all"
                ? "bg-blue-600 text-white shadow-xs"
                : theme === "dark"
                ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
          >
            All Records
          </button>

          {/* Quarter Dropdown (4 Quarters) */}
          <div className="relative" ref={quarterRef}>
            <button
              type="button"
              onClick={() => {
                setIsQuarterOpen((prev) => !prev);
                setIsMonthOpen(false);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                periodPreset.startsWith("quarter-")
                  ? "bg-blue-600 text-white shadow-xs"
                  : theme === "dark"
                  ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              <span>
                {selectedQuarter ? `Quarter: ${selectedQuarter}` : "Quarter"}
              </span>
              <ChevronDown
                size={13}
                className={`transition-transform duration-200 ${
                  isQuarterOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isQuarterOpen && (
              <div
                className={`absolute left-0 top-full mt-1.5 w-64 rounded-xl shadow-xl border p-2.5 z-40 animate-in fade-in-50 zoom-in-95 ${
                  theme === "dark"
                    ? "bg-gray-800 border-gray-700 text-gray-200"
                    : "bg-white border-gray-200 text-gray-800"
                }`}
              >
                <div className="flex items-center justify-between px-1 py-1 mb-2 border-b border-gray-200 dark:border-gray-700 text-xs">
                  <span className="font-semibold text-gray-600 dark:text-gray-300">
                    Select Quarter
                  </span>
                  <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-md">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFyYearChange(fyYear - 1);
                      }}
                      className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-500 hover:text-gray-900 dark:hover:text-white"
                      title="Previous FY"
                    >
                      <ChevronLeft size={11} />
                    </button>
                    <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                      FY {fyYear}-{String(fyYear + 1).slice(2)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFyYearChange(fyYear + 1);
                      }}
                      className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-500 hover:text-gray-900 dark:hover:text-white"
                      title="Next FY"
                    >
                      <ChevronRight size={11} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {quartersList.map((q) => {
                    const isSelected = selectedQuarter === q.id;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => handleSelectQuarter(q.id)}
                        className={`p-2 rounded-lg text-left transition-all flex flex-col justify-between ${
                          isSelected
                            ? "bg-blue-600 text-white shadow-xs"
                            : theme === "dark"
                            ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
                            : "bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200/60"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-bold text-xs">{q.id}</span>
                          {isSelected && <Check size={12} className="stroke-[3]" />}
                        </div>
                        <span
                          className={`text-[10px] mt-0.5 ${
                            isSelected
                              ? "text-blue-100"
                              : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {q.monthsLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Month Dropdown (April to March) */}
          <div className="relative" ref={monthRef}>
            <button
              type="button"
              onClick={() => {
                setIsMonthOpen((prev) => !prev);
                setIsQuarterOpen(false);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                periodPreset.startsWith("month-")
                  ? "bg-blue-600 text-white shadow-xs"
                  : theme === "dark"
                  ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              <span>
                {selectedMonth ? `Month: ${selectedMonth}` : "Month"}
              </span>
              <ChevronDown
                size={13}
                className={`transition-transform duration-200 ${
                  isMonthOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isMonthOpen && (
              <div
                className={`absolute left-0 top-full mt-1.5 w-72 rounded-xl shadow-xl border p-2.5 z-40 animate-in fade-in-50 zoom-in-95 ${
                  theme === "dark"
                    ? "bg-gray-800 border-gray-700 text-gray-200"
                    : "bg-white border-gray-200 text-gray-800"
                }`}
              >
                <div className="flex items-center justify-between px-1 py-1 mb-2 border-b border-gray-200 dark:border-gray-700 text-xs">
                  <span className="font-semibold text-gray-600 dark:text-gray-300">
                    Select Month (Apr – Mar)
                  </span>
                  <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-md">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFyYearChange(fyYear - 1);
                      }}
                      className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-500 hover:text-gray-900 dark:hover:text-white"
                      title="Previous FY"
                    >
                      <ChevronLeft size={11} />
                    </button>
                    <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                      FY {fyYear}-{String(fyYear + 1).slice(2)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFyYearChange(fyYear + 1);
                      }}
                      className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-500 hover:text-gray-900 dark:hover:text-white"
                      title="Next FY"
                    >
                      <ChevronRight size={11} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {monthsList.map((m) => {
                    const isSelected = selectedMonth === m.name;
                    return (
                      <button
                        key={m.name}
                        type="button"
                        onClick={() => handleSelectMonth(m.name)}
                        className={`px-2 py-1.5 rounded-lg text-center transition-all ${
                          isSelected
                            ? "bg-blue-600 text-white shadow-xs font-bold"
                            : theme === "dark"
                            ? "bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium"
                            : "bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200/60 font-medium"
                        }`}
                      >
                        <div className="text-xs">{m.name}</div>
                        <div
                          className={`text-[9px] ${
                            isSelected
                              ? "text-blue-100"
                              : "text-gray-400 dark:text-gray-400"
                          }`}
                        >
                          {m.year}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
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
                setSelectedQuarter("");
                setSelectedMonth("");
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
                setSelectedQuarter("");
                setSelectedMonth("");
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
              placeholder="Search invoice, supplier, amount..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* 50% - 50% Summary Header Partition */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Left Partition (50%): Books Purchase Summary */}
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
            📘 Books Purchase Register
          </h3>
          <div className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 mt-2">
            {formatCurrency(totalBookValue)}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>ITC / Tax: <strong>{formatCurrency(totalBookTax)}</strong></span>
            <span>•</span>
            <span>Total: <strong>{formatCurrency(totalBookTotal)}</strong></span>
          </div>
        </div>

        {/* Right Partition (50%): GSTR-2B Summary */}
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
              {scannedGstr2bData ? (
                <span className="text-green-600 dark:text-green-400 font-medium">
                  {filteredGstr2bB2bInvoices.length} B2B + {filteredGstr2bCdnrNotes.length} CDNR (JSON Scanned)
                </span>
              ) : (
                "Awaiting GSTR-2B JSON"
              )}
            </span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center justify-between">
            <span>📊 Filed GSTR-2B Return</span>
            {scannedGstr2bData?.metadata?.gstin && (
              <span className="text-xs font-mono font-normal text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/70 px-2 py-0.5 rounded">
                {scannedGstr2bData.metadata.gstin}
              </span>
            )}
          </h3>
          <div className="text-3xl font-extrabold text-green-600 dark:text-green-400 mt-2">
            {formatCurrency(effectiveGstr2bTaxable)}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>ITC / Tax: <strong>{formatCurrency(effectiveGstr2bTax)}</strong></span>
            <span>•</span>
            <span>
              Taxable Variance:{" "}
              <strong
                className={
                  Math.abs(taxableVariance) < 0.01
                    ? "text-green-600"
                    : "text-gray-800 dark:text-gray-200"
                }
              >
                {formatCurrency(taxableVariance)}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Variance Alert Banner */}
      {hasGstr2bData && filteredBooksRecords.length > 0 ? (
        <div
          className={`p-3.5 rounded-lg mb-6 border flex items-center justify-between text-xs ${
            isReconciled
              ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
              : "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {isReconciled ? (
              <CheckCircle2 size={18} className="text-green-600" />
            ) : (
              <CheckCircle2 size={18} className="text-slate-500" />
            )}
            <span>
              <strong>Reconciliation Status:</strong>{" "}
              {isReconciled
                ? "Books Purchases and GSTR-2B reported values match perfectly."
                : `Variance of ${formatCurrency(Math.abs(taxableVariance))} detected between Books Purchases (${formatCurrency(totalBookValue)}) and GSTR-2B (${formatCurrency(effectiveGstr2bTaxable)}). ITC Variance: ${formatCurrency(itcVariance)}.`}
            </span>
          </div>
          <span className="font-semibold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded bg-white dark:bg-gray-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {isReconciled ? "Matched" : "Variance Detected"}
          </span>
        </div>
      ) : !hasGstr2bData ? (
        <div className="p-3.5 rounded-lg mb-6 border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-blue-600" />
            <span>
              <strong>GSTR-2B Upload Ready:</strong> Select and scan your official GSTR-2B JSON file in the right partition below to compare B2B invoices and CDNR notes against Books purchases.
            </span>
          </div>
          <span className="font-semibold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded bg-white/60 dark:bg-gray-800">
            Awaiting GSTR-2B
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
              📘 Books Purchase Records (50% Partition)
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
                <p className="text-sm font-medium">Loading purchase records from Books...</p>
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
                  onClick={() => fetchBooksPurchases(fromDate, toDate)}
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
                  No purchase records found in Books
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {searchTerm || fromDate || toDate
                    ? "Try adjusting your filters or date range"
                    : "No purchase vouchers recorded in the accounting books"}
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
                      None of the {filteredBooksRecords.length} purchase records in Books have a registered supplier GSTIN.
                    </p>
                  </>
                ) : (
                  <>
                    <Layers size={36} className="text-gray-400 mb-2" />
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      No B2C Records Found
                    </p>
                    <p className="text-xs text-gray-400 mt-1 max-w-sm">
                      All {filteredBooksRecords.length} purchase records in Books have registered supplier GSTINs (B2B).
                    </p>
                  </>
                )}
              </div>
            ) : (
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
                  <tr>
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
                      colSpan={3}
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

        {/* Right Partition (50%): GSTR-2B Side with GSTR-2B JSON Scanner */}
        <div className="flex flex-col space-y-4">
          <Gstr2bJsonScanner
            initialData={scannedGstr2bData}
            isSavedInDb={!!scannedGstr2bData}
            onDataLoaded={(data) => setScannedGstr2bData(data)}
            fromDate={fromDate}
            toDate={toDate}
            searchTerm={searchTerm}
          />
        </div>
      </div>
    </div>
  );
};

export default BooksVs2bReport;
