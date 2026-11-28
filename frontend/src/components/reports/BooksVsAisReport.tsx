import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAppContext } from "../../context/AppContext";
import { useCompany } from "../../context/CompanyContext";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Search,
  RefreshCw,
  FileText,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Upload,
} from "lucide-react";
import AisManualPanel from "./AisManualPanel";
import {
  fetchAisEntries,
  AIS_UPDATED_EVENT,
  type AisManualEntry,
} from "../../services/booksVsAisService";

type VoucherKind = "sales" | "purchase" | "receipt";

interface BooksVoucherRecord {
  key: string;
  id: string;
  voucherType: VoucherKind;
  date: string; // normalized YYYY-MM-DD
  voucherNumber: string;
  partyName: string;
  subInfo: string;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
  editPath: string;
}

const toLocalYmd = (dateStr?: string | null): string => {
  if (!dateStr) return "";
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return s.slice(0, 10);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const fmtMoney = (v: number) =>
  `₹${(Number.isFinite(v) ? v : 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const ymd = toLocalYmd(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, day] = ymd.split("-");
    return `${day}/${m}/${y}`;
  }
  return String(d);
};

const RETURN_URL = encodeURIComponent("/app/reports/books-vs-ais");

const BooksVsAisReport: React.FC = () => {
  const { theme } = useAppContext();
  const { companyInfo, activeCompanyId } = useCompany();
  const navigate = useNavigate();
  const isDark = theme === "dark";

  const [booksVouchers, setBooksVouchers] = useState<BooksVoucherRecord[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [booksError, setBooksError] = useState<string | null>(null);

  const [aisEntries, setAisEntries] = useState<AisManualEntry[]>([]);
  const [loadingAis, setLoadingAis] = useState(true);

  const [activeVoucherTab, setActiveVoucherTab] = useState<"all" | VoucherKind>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [periodMode, setPeriodMode] = useState<"all" | "month" | "quarter" | "fy" | "custom">("all");
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4 | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

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

  const fyStartYear = useMemo(() => {
    const fy = localStorage.getItem("selectedFinYear") || "";
    const m = fy.match(/(\d{4})/);
    if (m) return parseInt(m[1], 10);
    const now = new Date();
    return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  }, []);

  const FY_MONTHS = [
    { label: "Apr", month: 3 },
    { label: "May", month: 4 },
    { label: "Jun", month: 5 },
    { label: "Jul", month: 6 },
    { label: "Aug", month: 7 },
    { label: "Sep", month: 8 },
    { label: "Oct", month: 9 },
    { label: "Nov", month: 10 },
    { label: "Dec", month: 11 },
    { label: "Jan", month: 0 },
    { label: "Feb", month: 1 },
    { label: "Mar", month: 2 },
  ];

  const FY_QUARTERS: { q: 1 | 2 | 3 | 4; label: string; months: string }[] = [
    { q: 1, label: "Q1", months: "Apr–Jun" },
    { q: 2, label: "Q2", months: "Jul–Sep" },
    { q: 3, label: "Q3", months: "Oct–Dec" },
    { q: 4, label: "Q4", months: "Jan–Mar" },
  ];

  const fmtDateInput = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  const handlePeriodMode = (mode: "all" | "month" | "quarter" | "fy") => {
    setPeriodMode(mode);
    setSelectedMonth(null);
    setSelectedQuarter(null);
    if (mode === "all") {
      setFromDate("");
      setToDate("");
    } else if (mode === "fy") {
      setFromDate(`${fyStartYear}-04-01`);
      setToDate(`${fyStartYear + 1}-03-31`);
    } else {
      setFromDate("");
      setToDate("");
    }
  };

  const handleMonthSelect = (calendarMonth: number) => {
    setPeriodMode("month");
    setSelectedMonth(calendarMonth);
    setSelectedQuarter(null);
    const y = calendarMonth >= 3 ? fyStartYear : fyStartYear + 1;
    setFromDate(fmtDateInput(new Date(y, calendarMonth, 1)));
    setToDate(fmtDateInput(new Date(y, calendarMonth + 1, 0)));
  };

  const handleQuarterSelect = (q: 1 | 2 | 3 | 4) => {
    setPeriodMode("quarter");
    setSelectedQuarter(q);
    setSelectedMonth(null);
    const startMonth = q === 1 ? 3 : q === 2 ? 6 : q === 3 ? 9 : 0;
    const startYear = q === 4 ? fyStartYear + 1 : fyStartYear;
    setFromDate(fmtDateInput(new Date(startYear, startMonth, 1)));
    setToDate(fmtDateInput(new Date(startYear, startMonth + 3, 0)));
  };

  const fetchBooksVouchers = useCallback(async () => {
    if (!companyId || !ownerId) {
      setBooksError("Please select a company first.");
      setBooksVouchers([]);
      setLoadingBooks(false);
      return;
    }

    setLoadingBooks(true);
    setBooksError(null);

    const apiBase = import.meta.env.VITE_API_URL || "";
    const snakeQuery = `company_id=${encodeURIComponent(companyId)}&owner_type=${encodeURIComponent(
      ownerType
    )}&owner_id=${encodeURIComponent(ownerId)}`;
    const camelQuery = `companyId=${encodeURIComponent(companyId)}&ownerType=${encodeURIComponent(
      ownerType
    )}&ownerId=${encodeURIComponent(ownerId)}`;

    try {
      const [salesRes, purchaseRes, receiptRes, ledgerRes] = await Promise.allSettled([
        fetch(`${apiBase}/api/sales-report?${snakeQuery}`).then(async (r) => {
          if (!r.ok) throw new Error(`Sales (${r.status})`);
          return r.json();
        }),
        fetch(`${apiBase}/api/purchase-report?${snakeQuery}`).then(async (r) => {
          if (!r.ok) throw new Error(`Purchase (${r.status})`);
          return r.json();
        }),
        fetch(`${apiBase}/api/vouchers?${camelQuery}&voucherType=receipt`).then(async (r) => {
          if (!r.ok) throw new Error(`Receipt (${r.status})`);
          return r.json();
        }),
        fetch(`${apiBase}/api/ledger?${snakeQuery}`).then(async (r) => {
          if (!r.ok) return [];
          return r.json();
        }),
      ]);

      const ledgerMap = new Map<string, string>();
      if (ledgerRes.status === "fulfilled") {
        const ledgerRaw = ledgerRes.value;
        const ledgerArr = Array.isArray(ledgerRaw)
          ? ledgerRaw
          : Array.isArray(ledgerRaw?.data)
          ? ledgerRaw.data
          : [];
        for (const l of ledgerArr) {
          if (l?.id != null && l?.name) {
            ledgerMap.set(String(l.id), String(l.name));
          }
        }
      }

      const combined: BooksVoucherRecord[] = [];
      const failedSources: string[] = [];

      // 1. Sales Vouchers
      if (salesRes.status === "fulfilled") {
        const json = salesRes.value;
        const rows = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
          ? json.data
          : [];
        for (const r of rows) {
          const id = String(r.id ?? "");
          const taxable = Number(r.taxableAmount ?? r.subtotal ?? 0) || 0;
          const cgst = Number(r.cgstAmount ?? r.cgstTotal ?? 0) || 0;
          const sgst = Number(r.sgstAmount ?? r.sgstTotal ?? 0) || 0;
          const igst = Number(r.igstAmount ?? r.igstTotal ?? 0) || 0;
          const tax = cgst + sgst + igst || Number(r.taxAmount ?? 0) || 0;
          const total = Number(r.total ?? r.netAmount ?? taxable + tax) || 0;
          const voucherNo = String(r.voucherNo || r.number || r.referenceNo || "-");
          combined.push({
            key: `sales-${id || voucherNo}-${Math.random()}`,
            id,
            voucherType: "sales",
            date: toLocalYmd(r.date),
            voucherNumber: voucherNo,
            partyName: String(r.partyName || "Cash / Counter Sale"),
            subInfo: r.partyGSTIN ? `GSTIN: ${r.partyGSTIN}` : "",
            taxableAmount: taxable,
            taxAmount: tax,
            totalAmount: total,
            editPath: id
              ? `/app/vouchers/sales/edit/${id}?returnUrl=${RETURN_URL}`
              : "/app/reports/voucher/sales",
          });
        }
      } else {
        failedSources.push(salesRes.reason?.message || "Sales");
      }

      // 2. Purchase Vouchers
      if (purchaseRes.status === "fulfilled") {
        const json = purchaseRes.value;
        const rows = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
          ? json.data
          : [];
        for (const r of rows) {
          const id = String(r.id ?? "");
          const taxable = Number(r.taxableAmount ?? r.subtotal ?? 0) || 0;
          const cgst = Number(r.cgstAmount ?? r.cgstTotal ?? 0) || 0;
          const sgst = Number(r.sgstAmount ?? r.sgstTotal ?? 0) || 0;
          const igst = Number(r.igstAmount ?? r.igstTotal ?? 0) || 0;
          const tax = cgst + sgst + igst || Number(r.taxAmount ?? 0) || 0;
          const total = Number(r.total ?? r.netAmount ?? taxable + tax) || 0;
          const voucherNo = String(r.voucherNo || r.number || r.bill_no || r.referenceNo || "-");
          combined.push({
            key: `purchase-${id || voucherNo}-${Math.random()}`,
            id,
            voucherType: "purchase",
            date: toLocalYmd(r.date),
            voucherNumber: voucherNo,
            partyName: String(r.partyName || "Supplier"),
            subInfo: r.partyGSTIN ? `GSTIN: ${r.partyGSTIN}` : "",
            taxableAmount: taxable,
            taxAmount: tax,
            totalAmount: total,
            editPath: id
              ? `/app/vouchers/purchase/edit/${id}?returnUrl=${RETURN_URL}`
              : "/app/reports/voucher/purchase",
          });
        }
      } else {
        failedSources.push(purchaseRes.reason?.message || "Purchase");
      }

      // 3. Receipt Vouchers
      if (receiptRes.status === "fulfilled") {
        const json = receiptRes.value;
        const rows = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
          ? json.data
          : [];
        for (const v of rows) {
          const id = String(v.id ?? "");
          const entries: any[] = Array.isArray(v.entries) ? v.entries : [];
          const resolveEntryName = (e: any) =>
            String(
              e?.ledger_name ||
                e?.ledgerName ||
                ledgerMap.get(String(e?.ledger_id ?? e?.ledgerId ?? "")) ||
                ""
            ).trim();

          const creditEntries = entries.filter(
            (e) => String(e.type || "").toLowerCase() === "credit"
          );
          const debitEntries = entries.filter(
            (e) => String(e.type || "").toLowerCase() === "debit"
          );

          const creditSum = creditEntries.reduce(
            (s, e) => s + Math.abs(Number(e.amount) || 0),
            0
          );
          const debitSum = debitEntries.reduce(
            (s, e) => s + Math.abs(Number(e.amount) || 0),
            0
          );
          const totalAmount = creditSum > 0 ? creditSum : debitSum;

          const partyLedgers = Array.from(
            new Set(
              (creditEntries.length > 0 ? creditEntries : entries)
                .map(resolveEntryName)
                .filter(Boolean)
            )
          );
          const accountLedgers = Array.from(
            new Set(debitEntries.map(resolveEntryName).filter(Boolean))
          );

          const voucherNo = String(v.number || v.voucherNumber || v.reference_no || "-");
          const subParts: string[] = [];
          if (accountLedgers.length > 0) subParts.push(`A/c: ${accountLedgers.join(", ")}`);
          if (v.reference_no) subParts.push(`Ref: ${v.reference_no}`);
          else if (v.narration) subParts.push(String(v.narration));

          combined.push({
            key: `receipt-${id || voucherNo}-${Math.random()}`,
            id,
            voucherType: "receipt",
            date: toLocalYmd(v.date),
            voucherNumber: voucherNo,
            partyName: partyLedgers.join(", ") || "Receipt Voucher",
            subInfo: subParts.join(" • "),
            taxableAmount: totalAmount,
            taxAmount: 0,
            totalAmount,
            editPath: id
              ? `/app/vouchers/receipt/edit/${id}?returnUrl=${RETURN_URL}`
              : "/app/reports/voucher/receipt",
          });
        }
      } else {
        failedSources.push(receiptRes.reason?.message || "Receipt");
      }

      combined.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.voucherNumber.localeCompare(a.voucherNumber);
      });

      setBooksVouchers(combined);
      if (failedSources.length > 0) {
        setBooksError(`Could not load: ${failedSources.join(", ")}`);
      }
    } catch (err: any) {
      console.error("Books vs AIS fetch error:", err);
      setBooksError(err?.message || "Failed to load Books vouchers");
      setBooksVouchers([]);
    } finally {
      setLoadingBooks(false);
    }
  }, [companyId, ownerType, ownerId]);

  useEffect(() => {
    fetchBooksVouchers();
  }, [fetchBooksVouchers]);

  // Period + Search filtered vouchers (across all 3 types, before type-tab filter)
  const periodAndSearchFiltered = useMemo(() => {
    let list = booksVouchers;
    if (fromDate || toDate) {
      list = list.filter((r) => {
        if (!r.date) return false;
        if (fromDate && r.date < fromDate) return false;
        if (toDate && r.date > toDate) return false;
        return true;
      });
    }
    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.voucherNumber.toLowerCase().includes(t) ||
          r.partyName.toLowerCase().includes(t) ||
          r.subInfo.toLowerCase().includes(t) ||
          r.voucherType.toLowerCase().includes(t) ||
          r.date.includes(t) ||
          r.totalAmount.toFixed(2).includes(t)
      );
    }
    return list;
  }, [booksVouchers, fromDate, toDate, searchTerm]);

  const typeStats = useMemo(() => {
    const stats = {
      all: { count: 0, total: 0 },
      sales: { count: 0, total: 0 },
      purchase: { count: 0, total: 0 },
      receipt: { count: 0, total: 0 },
    };
    for (const r of periodAndSearchFiltered) {
      stats.all.count += 1;
      stats.all.total += r.totalAmount;
      stats[r.voucherType].count += 1;
      stats[r.voucherType].total += r.totalAmount;
    }
    return stats;
  }, [periodAndSearchFiltered]);

  const displayedBooksVouchers = useMemo(() => {
    if (activeVoucherTab === "all") return periodAndSearchFiltered;
    return periodAndSearchFiltered.filter((r) => r.voucherType === activeVoucherTab);
  }, [periodAndSearchFiltered, activeVoucherTab]);

  const displayedTotalTaxable = useMemo(
    () => displayedBooksVouchers.reduce((s, r) => s + r.taxableAmount, 0),
    [displayedBooksVouchers]
  );

  const displayedTotalAmount = useMemo(
    () => displayedBooksVouchers.reduce((s, r) => s + r.totalAmount, 0),
    [displayedBooksVouchers]
  );

  const loadAisEntries = useCallback(async () => {
    if (!companyId) {
      setAisEntries([]);
      setLoadingAis(false);
      return;
    }
    setLoadingAis(true);
    try {
      const list = await fetchAisEntries(companyId);
      setAisEntries(list);
    } finally {
      setLoadingAis(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadAisEntries();
  }, [loadAisEntries]);

  useEffect(() => {
    const handler = () => {
      loadAisEntries();
    };
    window.addEventListener(AIS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(AIS_UPDATED_EVENT, handler);
  }, [loadAisEntries]);

  const filteredAisEntries = useMemo(() => {
    if (!searchTerm.trim()) return aisEntries;
    const t = searchTerm.toLowerCase().trim();
    return aisEntries.filter(
      (e) =>
        e.narration.toLowerCase().includes(t) ||
        e.amount.toFixed(2).includes(t) ||
        e.createdAt.toLowerCase().includes(t)
    );
  }, [aisEntries, searchTerm]);

  const aisTotalAmount = useMemo(
    () => filteredAisEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [filteredAisEntries]
  );

  const variance = displayedTotalAmount - aisTotalAmount;

  const cardBg = isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200";
  const pageBg = isDark ? "bg-gray-900 text-gray-100" : "bg-gray-50 text-gray-800";

  const badgeClass = (type: VoucherKind) => {
    if (type === "sales") {
      return isDark
        ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60"
        : "bg-emerald-50 text-emerald-700 border border-emerald-200";
    }
    if (type === "purchase") {
      return isDark
        ? "bg-blue-950/60 text-blue-300 border border-blue-800/60"
        : "bg-blue-50 text-blue-700 border border-blue-200";
    }
    return isDark
      ? "bg-purple-950/60 text-purple-300 border border-purple-800/60"
      : "bg-purple-50 text-purple-700 border border-purple-200";
  };

  return (
    <div className={`pt-[56px] p-4 md:p-6 min-h-screen ${pageBg}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-gray-200 dark:border-gray-700 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate("/app/reports")}
            title="Back to Reports"
            className={`p-2 rounded-lg border shrink-0 ${cardBg} hover:opacity-80`}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <FileText className="text-blue-600 shrink-0" size={22} />
              Books vs AIS Matching
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Books (Sales, Purchase & Receipt Vouchers) vs AIS • (50% - 50% Split Partition)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              fetchBooksVouchers();
              loadAisEntries();
            }}
            disabled={loadingBooks || loadingAis}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 ${cardBg} hover:opacity-80 disabled:opacity-60`}
          >
            <RefreshCw size={14} className={loadingBooks || loadingAis ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => navigate("/app/vouchers/import/books-vs-ais")}
            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
          >
            <Upload size={14} /> AIS Import
          </button>
          <button
            type="button"
            onClick={() => navigate("/app/reports")}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 ${cardBg} hover:opacity-80`}
          >
            <ArrowLeft size={14} /> All Reports
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className={`p-3 rounded-xl border ${cardBg} mb-4 space-y-2.5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold text-gray-500 flex items-center gap-1 mr-1">
              <Calendar size={12} /> Period
            </span>
            {(
              [
                { id: "all", label: "All" },
                { id: "month", label: "Month" },
                { id: "quarter", label: "Quarter" },
                { id: "fy", label: "This FY" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePeriodMode(p.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
                  periodMode === p.id
                    ? "bg-blue-600 text-white"
                    : isDark
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-gray-500">From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPeriodMode("custom");
                  setSelectedMonth(null);
                  setSelectedQuarter(null);
                }}
                className={`px-2 py-1 rounded border text-xs ${
                  isDark ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"
                }`}
              />
              <span className="text-gray-500">To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPeriodMode("custom");
                  setSelectedMonth(null);
                  setSelectedQuarter(null);
                }}
                className={`px-2 py-1 rounded border text-xs ${
                  isDark ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"
                }`}
              />
            </div>

            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search voucher, party, amount..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`pl-8 pr-3 py-1.5 rounded-lg border text-xs w-56 ${
                  isDark ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"
                }`}
              />
            </div>
          </div>
        </div>

        {periodMode === "month" && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-200 dark:border-gray-700">
            <span className="text-[10px] font-semibold text-gray-500 mr-1">Select Month:</span>
            {FY_MONTHS.map((m) => (
              <button
                key={m.label}
                type="button"
                onClick={() => handleMonthSelect(m.month)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium min-w-[40px] ${
                  selectedMonth === m.month
                    ? "bg-blue-600 text-white"
                    : isDark
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {periodMode === "quarter" && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-200 dark:border-gray-700">
            <span className="text-[10px] font-semibold text-gray-500 mr-1">Select Quarter:</span>
            {FY_QUARTERS.map((q) => (
              <button
                key={q.q}
                type="button"
                onClick={() => handleQuarterSelect(q.q)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium ${
                  selectedQuarter === q.q
                    ? "bg-purple-600 text-white"
                    : isDark
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {q.label} <span className="opacity-80">({q.months})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 50% - 50% Summary Header Partition */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Left Partition (50%): Books */}
        <div
          className={`p-4 rounded-xl border relative overflow-hidden ${
            isDark
              ? "bg-gradient-to-r from-blue-950/40 to-gray-800 border-blue-900/60"
              : "bg-gradient-to-r from-blue-50 to-white border-blue-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950">
              Left Partition (50%) • Books
            </span>
            <span className="text-xs font-semibold text-gray-500">
              {typeStats.all.count} Vouchers
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              Books Vouchers (Sales, Purchase, Receipt)
            </h3>
            <span className="text-xl font-extrabold text-blue-600 dark:text-blue-400">
              {fmtMoney(displayedTotalAmount)}
            </span>
          </div>

          {/* Interactive breakdown pills for Sales / Purchase / Receipt */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <button
              type="button"
              onClick={() =>
                setActiveVoucherTab(activeVoucherTab === "sales" ? "all" : "sales")
              }
              className={`p-2 rounded-lg border text-left transition-colors ${
                activeVoucherTab === "sales"
                  ? "border-emerald-500 ring-1 ring-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40"
                  : isDark
                  ? "border-gray-700 bg-gray-800/70 hover:bg-gray-700"
                  : "border-gray-200 bg-white/80 hover:bg-emerald-50/40"
              }`}
            >
              <div className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                Sales ({typeStats.sales.count})
              </div>
              <div className="text-xs font-bold mt-0.5 truncate">
                {fmtMoney(typeStats.sales.total)}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveVoucherTab(activeVoucherTab === "purchase" ? "all" : "purchase")
              }
              className={`p-2 rounded-lg border text-left transition-colors ${
                activeVoucherTab === "purchase"
                  ? "border-blue-500 ring-1 ring-blue-500 bg-blue-50/70 dark:bg-blue-950/40"
                  : isDark
                  ? "border-gray-700 bg-gray-800/70 hover:bg-gray-700"
                  : "border-gray-200 bg-white/80 hover:bg-blue-50/40"
              }`}
            >
              <div className="text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-400">
                Purchase ({typeStats.purchase.count})
              </div>
              <div className="text-xs font-bold mt-0.5 truncate">
                {fmtMoney(typeStats.purchase.total)}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveVoucherTab(activeVoucherTab === "receipt" ? "all" : "receipt")
              }
              className={`p-2 rounded-lg border text-left transition-colors ${
                activeVoucherTab === "receipt"
                  ? "border-purple-500 ring-1 ring-purple-500 bg-purple-50/70 dark:bg-purple-950/40"
                  : isDark
                  ? "border-gray-700 bg-gray-800/70 hover:bg-gray-700"
                  : "border-gray-200 bg-white/80 hover:bg-purple-50/40"
              }`}
            >
              <div className="text-[10px] font-semibold uppercase text-purple-600 dark:text-purple-400">
                Receipt ({typeStats.receipt.count})
              </div>
              <div className="text-xs font-bold mt-0.5 truncate">
                {fmtMoney(typeStats.receipt.total)}
              </div>
            </button>
          </div>
        </div>

        {/* Right Partition (50%): AIS */}
        <div
          className={`p-4 rounded-xl border relative overflow-hidden flex flex-col justify-between ${
            isDark
              ? "bg-gradient-to-r from-teal-950/40 to-gray-800 border-teal-900/60"
              : "bg-gradient-to-r from-teal-50 to-white border-teal-200 shadow-sm"
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-950">
                Right Partition (50%) • VS AIS
              </span>
              <span className="text-xs font-semibold text-gray-500">
                {filteredAisEntries.length} {filteredAisEntries.length === 1 ? "Entry" : "Entries"}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                AIS (Annual Information Statement)
              </h3>
              <span className="text-xl font-extrabold text-teal-600 dark:text-teal-400">
                {fmtMoney(aisTotalAmount)}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-teal-200/60 dark:border-teal-900/50 text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              Variance (Books − AIS):{" "}
              <strong
                className={
                  Math.abs(variance) < 1
                    ? "text-green-600 dark:text-green-400"
                    : "text-amber-600 dark:text-amber-400"
                }
              >
                {fmtMoney(variance)}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => navigate("/app/vouchers/import/books-vs-ais")}
              className="text-teal-700 dark:text-teal-300 hover:underline font-medium inline-flex items-center gap-1"
            >
              Add from Import Page <ExternalLink size={11} />
            </button>
          </div>
        </div>
      </div>

      {booksError && (
        <div className="mb-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle size={14} className="shrink-0" />
          <span>{booksError}</span>
        </div>
      )}

      {/* 50% - 50% Split Partition Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* Left Partition (50%): Books Vouchers */}
        <div className={`border rounded-xl overflow-hidden min-w-0 flex flex-col ${cardBg}`}>
          <div className="px-3 py-2.5 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <span className="text-sm font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
              <BookOpen size={15} /> Books Vouchers ({displayedBooksVouchers.length})
            </span>

            {/* Linked Voucher Register shortcuts */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => navigate("/app/reports/voucher/sales")}
                className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 hover:opacity-80 font-medium inline-flex items-center gap-1"
                title="Open Sales Voucher Register"
              >
                Sales <ExternalLink size={10} />
              </button>
              <button
                type="button"
                onClick={() => navigate("/app/reports/voucher/purchase")}
                className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:opacity-80 font-medium inline-flex items-center gap-1"
                title="Open Purchase Voucher Register"
              >
                Purchase <ExternalLink size={10} />
              </button>
              <button
                type="button"
                onClick={() => navigate("/app/reports/voucher/receipt")}
                className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 hover:opacity-80 font-medium inline-flex items-center gap-1"
                title="Open Receipt Voucher Register"
              >
                Receipt <ExternalLink size={10} />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-1.5 bg-gray-50/60 dark:bg-gray-900/30">
            {(
              [
                { id: "all", label: "All", count: typeStats.all.count },
                { id: "sales", label: "Sales", count: typeStats.sales.count },
                { id: "purchase", label: "Purchase", count: typeStats.purchase.count },
                { id: "receipt", label: "Receipt", count: typeStats.receipt.count },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveVoucherTab(tab.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  activeVoucherTab === tab.id
                    ? "bg-blue-600 text-white"
                    : isDark
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          <div className="overflow-x-auto max-h-[520px] flex-1">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0 z-10">
                <tr>
                  <th className="px-2.5 py-2 text-left">Date</th>
                  <th className="px-2.5 py-2 text-left">Type</th>
                  <th className="px-2.5 py-2 text-left">Voucher No</th>
                  <th className="px-2.5 py-2 text-left">Party / Ledger</th>
                  <th className="px-2.5 py-2 text-right">Amount</th>
                  <th className="px-2.5 py-2 text-center">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {loadingBooks ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-gray-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 size={15} className="animate-spin" />
                        Loading Sales, Purchase & Receipt vouchers...
                      </span>
                    </td>
                  </tr>
                ) : displayedBooksVouchers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-gray-500 whitespace-normal">
                      No {activeVoucherTab === "all" ? "Sales, Purchase, or Receipt" : activeVoucherTab} vouchers found for the selected filter.
                    </td>
                  </tr>
                ) : (
                  displayedBooksVouchers.map((v) => (
                    <tr
                      key={v.key}
                      onClick={() => navigate(v.editPath)}
                      className="cursor-pointer hover:bg-blue-50/50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <td className="px-2.5 py-2">{fmtDate(v.date)}</td>
                      <td className="px-2.5 py-2">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${badgeClass(
                            v.voucherType
                          )}`}
                        >
                          {v.voucherType}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {v.voucherNumber}
                      </td>
                      <td className="px-2.5 py-2 max-w-[200px] truncate" title={v.partyName}>
                        <div className="font-medium truncate">{v.partyName}</div>
                        {v.subInfo && (
                          <div className="text-[10px] text-gray-400 truncate" title={v.subInfo}>
                            {v.subInfo}
                          </div>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-right font-semibold">
                        <div>{fmtMoney(v.totalAmount)}</div>
                        {v.taxAmount > 0 && (
                          <div className="text-[10px] font-normal text-gray-400">
                            Tax: {fmtMoney(v.taxAmount)}
                          </div>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(v.editPath);
                          }}
                          title={`Open ${v.voucherType} voucher ${v.voucherNumber}`}
                          className="p-1 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 inline-flex items-center"
                        >
                          <ExternalLink size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {displayedBooksVouchers.length > 0 && (
                <tfoot className="bg-gray-100 dark:bg-gray-900 sticky bottom-0 font-semibold border-t border-gray-300 dark:border-gray-700">
                  <tr>
                    <td colSpan={4} className="px-2.5 py-2 text-right">
                      Total ({displayedBooksVouchers.length} vouchers)
                      {displayedTotalTaxable !== displayedTotalAmount && (
                        <span className="ml-2 text-[10px] font-normal text-gray-500">
                          (Base: {fmtMoney(displayedTotalTaxable)})
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-right text-blue-600 dark:text-blue-400">
                      {fmtMoney(displayedTotalAmount)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Right Partition (50%): AIS Manual Entry + Saved Rows */}
        <div className={`border rounded-xl overflow-hidden min-w-0 flex flex-col ${cardBg}`}>
          <div className="px-3 py-2.5 bg-teal-50 dark:bg-teal-950/40 border-b border-teal-200 dark:border-teal-900 flex items-center justify-between shrink-0">
            <span className="text-sm font-semibold text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
              📊 VS AIS Matching ({filteredAisEntries.length})
            </span>
            <button
              type="button"
              onClick={() => navigate("/app/vouchers/import/books-vs-ais")}
              className="text-[11px] font-medium px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200 hover:opacity-80 inline-flex items-center gap-1"
            >
              AIS Import Page <ExternalLink size={10} />
            </button>
          </div>
          <AisManualPanel
            companyId={companyId}
            ownerType={ownerType}
            ownerId={ownerId}
            isDark={isDark}
            entries={aisEntries}
            loading={loadingAis}
            searchTerm={searchTerm}
            onEntriesChanged={loadAisEntries}
          />
        </div>
      </div>
    </div>
  );
};

export default BooksVsAisReport;
