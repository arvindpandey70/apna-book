import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAppContext } from "../../context/AppContext";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ShieldCheck,
  Upload,
  Search,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import {
  getReportData,
  fetch26AsFromServer,
  type StoredReportData,
} from "../../services/reportImportService";

interface BooksTdsRow {
  id: number | string;
  date: string;
  voucherNumber: string;
  deductorName: string;
  deductorTan: string;
  section: string;
  amountPaid: number;
  tdsDeducted: number;
}

interface As26Row {
  deductorTan: string;
  deductorName: string;
  section: string;
  transactionDate: string;
  amountPaid: number;
  tdsDeducted: number;
  tdsDeposited: number;
  bookingStatus: string;
  status: string;
  raw: Record<string, any>;
}

const num = (v: any): number => {
  const n = parseFloat(String(v ?? 0).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const fmtMoney = (v: number) =>
  `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d).slice(0, 10);
  return dt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const normalizeTan = (v: any) =>
  String(v || "")
    .trim()
    .toUpperCase();

const normalizeName = (v: any) =>
  String(v || "")
    .trim()
    .toLowerCase();

const Form26ASReport: React.FC = () => {
  const { theme } = useAppContext();
  const navigate = useNavigate();
  const isDark = theme === "dark";

  const [reportData, setReportData] = useState<StoredReportData | null>(null);
  const [booksRows, setBooksRows] = useState<BooksTdsRow[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [periodMode, setPeriodMode] = useState<"all" | "month" | "quarter" | "fy">("all");
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null); // 0-11 calendar month
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4 | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const companyId = localStorage.getItem("company_id") || "";
  const ownerType = localStorage.getItem("supplier") || localStorage.getItem("userType") || "employee";
  const ownerId =
    localStorage.getItem(ownerType === "employee" ? "employee_id" : "user_id") || "";

  // FY start year from header TY (e.g. 2026-27 → 2026)
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

  const fmtYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const yearForMonth = (calendarMonth: number) =>
    calendarMonth >= 3 ? fyStartYear : fyStartYear + 1;

  const applyMonthRange = (calendarMonth: number) => {
    const y = yearForMonth(calendarMonth);
    const from = new Date(y, calendarMonth, 1);
    const to = new Date(y, calendarMonth + 1, 0);
    setFromDate(fmtYmd(from));
    setToDate(fmtYmd(to));
  };

  const applyQuarterRange = (q: 1 | 2 | 3 | 4) => {
    // Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar
    const startMonth = q === 1 ? 3 : q === 2 ? 6 : q === 3 ? 9 : 0;
    const startYear = q === 4 ? fyStartYear + 1 : fyStartYear;
    const from = new Date(startYear, startMonth, 1);
    const to = new Date(startYear, startMonth + 3, 0);
    setFromDate(fmtYmd(from));
    setToDate(fmtYmd(to));
  };

  const loadImported = useCallback(async () => {
    const serverData = await fetch26AsFromServer(companyId);
    if (serverData && serverData.rows.length > 0) {
      setReportData(serverData);
      return;
    }
    setReportData(getReportData("26as"));
  }, [companyId]);

  const fetchBooksTds = useCallback(async () => {
    if (!companyId) {
      setBooksError("Please select a company first.");
      setBooksRows([]);
      return;
    }
    setLoadingBooks(true);
    setBooksError(null);
    try {
      const params = new URLSearchParams({
        company_id: companyId,
        owner_type: ownerType,
        owner_id: ownerId,
      });
      if (fromDate) params.append("from_date", fromDate);
      if (toDate) params.append("to_date", toDate);

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/books-vs-ats-168/books-tds?${params}`
      );
      if (!res.ok) throw new Error(`Failed to load Books TDS (${res.status})`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to load Books TDS");
      setBooksRows(Array.isArray(json.data) ? json.data : []);
    } catch (err: any) {
      console.error(err);
      setBooksError(err.message || "Failed to load Books TDS");
      setBooksRows([]);
    } finally {
      setLoadingBooks(false);
    }
  }, [companyId, ownerType, ownerId, fromDate, toDate]);

  useEffect(() => {
    loadImported();
  }, [loadImported]);

  useEffect(() => {
    fetchBooksTds();
  }, [fetchBooksTds]);

  const handlePeriodMode = (mode: "all" | "month" | "quarter" | "fy") => {
    setPeriodMode(mode);
    setSelectedMonth(null);
    setSelectedQuarter(null);

    if (mode === "all") {
      setFromDate("");
      setToDate("");
      return;
    }
    if (mode === "fy") {
      setFromDate(`${fyStartYear}-04-01`);
      setToDate(`${fyStartYear + 1}-03-31`);
      return;
    }
    // month / quarter: wait for sub-selection (clear dates until chosen)
    setFromDate("");
    setToDate("");
  };

  const handleMonthSelect = (calendarMonth: number) => {
    setPeriodMode("month");
    setSelectedMonth(calendarMonth);
    setSelectedQuarter(null);
    applyMonthRange(calendarMonth);
  };

  const handleQuarterSelect = (q: 1 | 2 | 3 | 4) => {
    setPeriodMode("quarter");
    setSelectedQuarter(q);
    setSelectedMonth(null);
    applyQuarterRange(q);
  };

  const as26Rows: As26Row[] = useMemo(() => {
    const rows = reportData?.rows || [];
    return rows.map((r) => ({
      deductorTan: normalizeTan(r["Deductor TAN"] || r.deductorTan),
      deductorName: String(r["Deductor Name"] || r.deductorName || ""),
      section: String(r.Section || r.section || ""),
      transactionDate: String(r["Transaction Date"] || r.transactionDate || ""),
      amountPaid: num(r["Total Amount Paid"] || r.totalAmountPaid || r.amountPaid),
      tdsDeducted: num(r["TDS Deducted"] || r.tdsDeducted),
      tdsDeposited: num(r["TDS Deposited"] || r.tdsDeposited),
      bookingStatus: String(r["Booking Status"] || r.bookingStatus || ""),
      status: String(r.Status || r.status || ""),
      raw: r,
    }));
  }, [reportData]);

  const filteredBooks = useMemo(() => {
    if (!searchTerm.trim()) return booksRows;
    const t = searchTerm.toLowerCase();
    return booksRows.filter(
      (r) =>
        r.deductorName.toLowerCase().includes(t) ||
        r.deductorTan.toLowerCase().includes(t) ||
        r.section.toLowerCase().includes(t) ||
        r.voucherNumber.toLowerCase().includes(t) ||
        String(r.tdsDeducted).includes(t)
    );
  }, [booksRows, searchTerm]);

  const filteredAs26 = useMemo(() => {
    let rows = as26Rows;
    if (fromDate || toDate) {
      rows = rows.filter((r) => {
        const d = String(r.transactionDate || "").slice(0, 10);
        if (!d) return true;
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
        return true;
      });
    }
    if (!searchTerm.trim()) return rows;
    const t = searchTerm.toLowerCase();
    return rows.filter(
      (r) =>
        r.deductorName.toLowerCase().includes(t) ||
        r.deductorTan.toLowerCase().includes(t) ||
        r.section.toLowerCase().includes(t) ||
        String(r.tdsDeposited).includes(t) ||
        r.status.toLowerCase().includes(t)
    );
  }, [as26Rows, searchTerm, fromDate, toDate]);

  const booksTotalTds = useMemo(
    () => filteredBooks.reduce((s, r) => s + r.tdsDeducted, 0),
    [filteredBooks]
  );
  const as26TotalDeposited = useMemo(
    () => filteredAs26.reduce((s, r) => s + r.tdsDeposited, 0),
    [filteredAs26]
  );
  const variance = booksTotalTds - as26TotalDeposited;

  const matchStatusForBooks = (row: BooksTdsRow): string => {
    const tan = normalizeTan(row.deductorTan);
    const name = normalizeName(row.deductorName);
    const hit = as26Rows.find(
      (a) =>
        (tan && a.deductorTan === tan) ||
        (name && normalizeName(a.deductorName) === name)
    );
    if (!hit) return "Books Only";
    const diff = Math.abs(row.tdsDeducted - (hit.tdsDeposited || hit.tdsDeducted));
    return diff < 1 ? "Matched" : "Amount Diff";
  };

  const matchStatusForAs26 = (row: As26Row): string => {
    const explicit = row.status.trim().toLowerCase();
    if (
      explicit === "matched" ||
      explicit === "amount diff" ||
      explicit === "26as only" ||
      explicit === "ats 168 only"
    ) {
      return row.status;
    }
    const tan = normalizeTan(row.deductorTan);
    const name = normalizeName(row.deductorName);
    const hit = booksRows.find(
      (b) =>
        (tan && normalizeTan(b.deductorTan) === tan) ||
        (name && normalizeName(b.deductorName) === name)
    );
    if (!hit) return "ATS 168 Only";
    const diff = Math.abs((row.tdsDeposited || row.tdsDeducted) - hit.tdsDeducted);
    return diff < 1 ? "Matched" : "Amount Diff";
  };

  const statusClass = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes("match")) {
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
    }
    if (s.includes("diff") || s.includes("mismatch")) {
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    }
    if (s.includes("only")) {
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
    }
    return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
  };

  const cardBg = isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200";
  const pageBg = isDark ? "bg-gray-900 text-gray-100" : "bg-gray-50 text-gray-800";

  return (
    <div className={`p-4 md:p-6 min-h-screen ${pageBg}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-gray-200 dark:border-gray-700 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate("/app/reports")}
            title="Back to Reports"
            className={`p-2 rounded-lg border shrink-0 ${cardBg} hover:opacity-80`}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="text-red-600 shrink-0" size={22} />
              Books vs ATS 168
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Reconcile Books TDS with ATS 168 (Annual Tax Statement) tax credit
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate("/app/vouchers/import/ats-168")}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 shrink-0"
        >
          <Upload size={15} />
          Import ATS 168
        </button>
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
                    ? "bg-red-600 text-white"
                    : isDark
                    ? "bg-gray-700 text-gray-300"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search TAN, name, section..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`pl-8 pr-3 py-1.5 rounded-lg border text-xs w-56 ${
                isDark ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"
              }`}
            />
          </div>
        </div>

        {/* Month: Apr → Mar (FY) */}
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

        {/* Quarter: Q1–Q4 */}
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

        {(fromDate || toDate) && (
          <p className="text-[10px] text-gray-400">
            Filter range: {fromDate || "—"} to {toDate || "—"} (applies to Books + ATS 168)
          </p>
        )}
      </div>

      {/* 50% - 50% Summary */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className={`px-3 py-2.5 rounded-lg border min-w-0 ${
          isDark ? "bg-blue-950/30 border-blue-900/50" : "bg-blue-50 border-blue-200"
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Books (50%)</span>
            <span className="text-[10px] text-gray-500">{filteredBooks.length} entries</span>
          </div>
          <p className="text-[11px] text-gray-500">TDS Deducted in Books</p>
          <p className="text-xl font-bold text-blue-600 leading-tight">{fmtMoney(booksTotalTds)}</p>
        </div>
        <div className={`px-3 py-2.5 rounded-lg border min-w-0 ${
          isDark ? "bg-purple-950/30 border-purple-900/50" : "bg-purple-50 border-purple-200"
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600">
              ATS 168 (50%)
              {reportData?.metadata?.pan ? ` • ${reportData.metadata.pan}` : ""}
              {reportData?.metadata?.taxYear ? ` • TY ${reportData.metadata.taxYear}` : ""}
            </span>
            <span className="text-[10px] text-gray-500 flex items-center gap-1">
              {reportData?.rows?.length ? (
                <><CheckCircle2 size={11} className="text-green-500" /> Imported</>
              ) : (
                <><AlertTriangle size={11} className="text-amber-500" /> Not imported</>
              )}
            </span>
          </div>
          <p className="text-[11px] text-gray-500">TDS Deposited in ATS 168</p>
          <p className="text-xl font-bold text-purple-600 leading-tight">{fmtMoney(as26TotalDeposited)}</p>
        </div>
      </div>

      <div className={`mb-4 px-3 py-2 rounded-lg border flex flex-wrap items-center justify-between gap-2 ${cardBg} border-l-[3px] ${
        Math.abs(variance) < 1 ? "border-l-green-500" : "border-l-amber-500"
      }`}>
        <span className="text-xs text-gray-500">Variance (Books − ATS 168)</span>
        <span className={`text-sm font-bold ${Math.abs(variance) < 1 ? "text-green-600" : "text-amber-600"}`}>
          {fmtMoney(variance)}
          <span className="ml-2 text-[11px] font-medium text-gray-400">
            {Math.abs(variance) < 1 ? "Reconciled" : "Difference found"}
          </span>
        </span>
      </div>

      {booksError && (
        <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertTriangle size={14} />
          {booksError}
        </div>
      )}

      {/* 50% - 50% Split tables */}
      <div className="grid grid-cols-2 gap-3 items-stretch">
        {/* Books — Left 50% */}
        <div className={`border rounded-xl overflow-hidden min-w-0 flex flex-col ${cardBg}`}>
          <div className="px-3 py-2.5 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900 flex items-center justify-between shrink-0">
            <span className="text-sm font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
              <BookOpen size={15} /> Books TDS (50%)
            </span>
            <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300">
              {filteredBooks.length} rows
            </span>
          </div>
          <div className="overflow-x-auto max-h-[480px] flex-1">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0">
                <tr>
                  <th className="px-2.5 py-2 text-left">Date</th>
                  <th className="px-2.5 py-2 text-left">Party / TAN</th>
                  <th className="px-2.5 py-2 text-left">Section</th>
                  <th className="px-2.5 py-2 text-right">Amount</th>
                  <th className="px-2.5 py-2 text-right">TDS</th>
                  <th className="px-2.5 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {loadingBooks ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                      Loading Books TDS...
                    </td>
                  </tr>
                ) : filteredBooks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-gray-500 whitespace-normal">
                      No TDS entries found in purchase vouchers for this period.
                    </td>
                  </tr>
                ) : (
                  filteredBooks.map((r) => {
                    const st = matchStatusForBooks(r);
                    return (
                      <tr key={r.id} className="hover:bg-blue-50/40 dark:hover:bg-gray-750">
                        <td className="px-2.5 py-2">{fmtDate(r.date)}</td>
                        <td className="px-2.5 py-2">
                          <span className="font-medium">{r.deductorName || "—"}</span>
                          {r.deductorTan ? (
                            <span className="ml-1.5 text-[10px] text-gray-400 font-mono">
                              {r.deductorTan}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2.5 py-2">{r.section || "—"}</td>
                        <td className="px-2.5 py-2 text-right">{fmtMoney(r.amountPaid)}</td>
                        <td className="px-2.5 py-2 text-right font-semibold text-blue-600">
                          {fmtMoney(r.tdsDeducted)}
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${statusClass(st)}`}>
                            {st}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ATS 168 — Right 50% */}
        <div className={`border rounded-xl overflow-hidden min-w-0 flex flex-col ${cardBg}`}>
          <div className="px-3 py-2.5 bg-purple-50 dark:bg-purple-950/40 border-b border-purple-200 dark:border-purple-900 flex items-center justify-between shrink-0">
            <span className="text-sm font-semibold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
              <ShieldCheck size={15} /> ATS 168 (50%)
            </span>
            <span className="text-[10px] font-medium text-purple-700 dark:text-purple-300">
              {filteredAs26.length} rows
            </span>
          </div>
          <div className="overflow-x-auto max-h-[480px] flex-1">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0">
                <tr>
                  <th className="px-2.5 py-2 text-left">Date</th>
                  <th className="px-2.5 py-2 text-left">Deductor / TAN</th>
                  <th className="px-2.5 py-2 text-left">Section</th>
                  <th className="px-2.5 py-2 text-right">Deposited</th>
                  <th className="px-2.5 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredAs26.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-gray-500 whitespace-normal">
                      <p className="mb-2">No ATS 168 data found for this period.</p>
                      <button
                        onClick={() => navigate("/app/vouchers/import/ats-168")}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg inline-flex items-center gap-1"
                      >
                        <Upload size={12} />
                        Import ATS 168 File
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredAs26.map((r, i) => {
                    const st = matchStatusForAs26(r);
                    return (
                      <tr key={i} className="hover:bg-purple-50/40 dark:hover:bg-gray-750">
                        <td className="px-2.5 py-2">{fmtDate(r.transactionDate)}</td>
                        <td className="px-2.5 py-2">
                          <span className="font-medium">{r.deductorName || "—"}</span>
                          {r.deductorTan ? (
                            <span className="ml-1.5 text-[10px] text-gray-400 font-mono">
                              {r.deductorTan}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2.5 py-2">{r.section || "—"}</td>
                        <td className="px-2.5 py-2 text-right font-semibold text-green-600">
                          {fmtMoney(r.tdsDeposited || r.tdsDeducted)}
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${statusClass(st)}`}>
                            {st}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Form26ASReport;
