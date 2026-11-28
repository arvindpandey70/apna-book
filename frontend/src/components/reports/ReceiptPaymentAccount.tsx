import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAppContext } from "../../context/AppContext";
import { useCompany } from "../../context/CompanyContext";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx-js-style";
import {
  ArrowLeft,
  FileText,
  Printer,
  Download,
  Search,
  RefreshCw,
  Calendar,
  Landmark,
  Wallet,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";

type VoucherTypeKey = "receipt" | "payment" | "sales" | "purchase" | "contra" | "journal";

interface ReceiptPaymentEntry {
  id: string;
  voucherId: string;
  date: string;
  voucherNo: string;
  voucherType: VoucherTypeKey;
  particulars: string;
  type: "Receipt" | "Payment";
  head: string;
  accountKind: "cash" | "bank";
  narration?: string;
  amount: number;
  editPath?: string;
}

interface CashBankAccountSummary {
  id: number;
  name: string;
  kind: "cash" | "bank";
  opening: number;
  receipts: number;
  payments: number;
  closing: number;
}

interface ReceiptPaymentSummary {
  openingCash: number;
  openingBank: number;
  openingTotal: number;
  totalReceipts: number;
  totalPayments: number;
  closingCash: number;
  closingBank: number;
  closingTotal: number;
  leftGrandTotal: number;
  rightGrandTotal: number;
  contraExcludedCount: number;
  contraExcludedAmount: number;
}

const EMPTY_SUMMARY: ReceiptPaymentSummary = {
  openingCash: 0,
  openingBank: 0,
  openingTotal: 0,
  totalReceipts: 0,
  totalPayments: 0,
  closingCash: 0,
  closingBank: 0,
  closingTotal: 0,
  leftGrandTotal: 0,
  rightGrandTotal: 0,
  contraExcludedCount: 0,
  contraExcludedAmount: 0,
};

const VOUCHER_BADGE_MAP: Record<VoucherTypeKey, { label: string; className: string }> = {
  receipt: {
    label: "Receipt",
    className: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  },
  payment: {
    label: "Payment",
    className: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  },
  sales: {
    label: "Cash Sales",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  },
  purchase: {
    label: "Cash Purchase",
    className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300",
  },
  contra: {
    label: "Contra",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
  },
  journal: {
    label: "Journal",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  },
};

const fmtMoney = (val: number) => {
  const num = Number(val) || 0;
  const formatted = Math.abs(num).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return num < 0 ? `-₹${formatted}` : `₹${formatted}`;
};

const fmtDate = (d?: string) => {
  if (!d || d === "-") return "—";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return d;
};

const ReceiptPaymentAccount: React.FC = () => {
  const { theme } = useAppContext();
  const { companyInfo, activeCompanyId } = useCompany();
  const navigate = useNavigate();
  const isDark = theme === "dark";

  const [searchTerm, setSearchTerm] = useState("");
  const [periodMode, setPeriodMode] = useState<"all" | "fy" | "custom">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [accountScope, setAccountScope] = useState<string>("all");
  const [includeContra, setIncludeContra] = useState(false);
  const [voucherTypeFilter, setVoucherTypeFilter] = useState<"all" | VoucherTypeKey>("all");
  const [showAccountsTable, setShowAccountsTable] = useState(true);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReceiptPaymentSummary>(EMPTY_SUMMARY);
  const [accounts, setAccounts] = useState<CashBankAccountSummary[]>([]);
  const [receipts, setReceipts] = useState<ReceiptPaymentEntry[]>([]);
  const [payments, setPayments] = useState<ReceiptPaymentEntry[]>([]);

  const companyId =
    activeCompanyId || companyInfo?.id || localStorage.getItem("company_id") || "";
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

  const handlePeriodPreset = (mode: "all" | "fy" | "custom") => {
    setPeriodMode(mode);
    if (mode === "all") {
      setFromDate("");
      setToDate("");
    } else if (mode === "fy") {
      setFromDate(`${fyStartYear}-04-01`);
      setToDate(`${fyStartYear + 1}-03-31`);
    }
  };

  const fetchReport = useCallback(async () => {
    if (!companyId) {
      setError("Please select a company first.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const apiBase = import.meta.env.VITE_API_URL || "";
      const params = new URLSearchParams({
        company_id: String(companyId),
        accountScope,
        includeContra: includeContra ? "true" : "false",
      });
      if (ownerType) params.set("owner_type", ownerType);
      if (ownerId) params.set("owner_id", ownerId);
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);

      const res = await fetch(`${apiBase}/api/receipt-payment-account?${params.toString()}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || `Failed to load report (${res.status})`);
      }

      const data = await res.json();
      setSummary(data.summary || EMPTY_SUMMARY);
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      setReceipts(Array.isArray(data.receipts) ? data.receipts : []);
      setPayments(Array.isArray(data.payments) ? data.payments : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load Receipt & Payment data";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [companyId, ownerType, ownerId, fromDate, toDate, accountScope, includeContra]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const filterList = useCallback(
    (list: ReceiptPaymentEntry[]) => {
      const term = searchTerm.trim().toLowerCase();
      return list.filter((item) => {
        if (voucherTypeFilter !== "all" && item.voucherType !== voucherTypeFilter) {
          return false;
        }
        if (!term) return true;
        return (
          item.particulars.toLowerCase().includes(term) ||
          item.voucherNo.toLowerCase().includes(term) ||
          item.head.toLowerCase().includes(term) ||
          item.voucherType.toLowerCase().includes(term) ||
          (item.narration || "").toLowerCase().includes(term)
        );
      });
    },
    [searchTerm, voucherTypeFilter]
  );

  const filteredReceipts = useMemo(() => filterList(receipts), [filterList, receipts]);
  const filteredPayments = useMemo(() => filterList(payments), [filterList, payments]);

  const filteredReceiptsTotal = useMemo(
    () => filteredReceipts.reduce((acc, r) => acc + r.amount, 0),
    [filteredReceipts]
  );
  const filteredPaymentsTotal = useMemo(
    () => filteredPayments.reduce((acc, p) => acc + p.amount, 0),
    [filteredPayments]
  );

  const isSubFiltered = searchTerm.trim() !== "" || voucherTypeFilter !== "all";

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    const receiptRows = [
      {
        Date: fromDate || "Opening",
        "Voucher No": "-",
        "Voucher Type": "Opening Balance",
        Particulars: `Opening Cash (${fmtMoney(summary.openingCash)}) + Bank (${fmtMoney(summary.openingBank)})`,
        "Cash/Bank A/c": "Opening",
        "Amount (₹)": summary.openingTotal,
      },
      ...filteredReceipts.map((r) => ({
        Date: fmtDate(r.date),
        "Voucher No": r.voucherNo,
        "Voucher Type": VOUCHER_BADGE_MAP[r.voucherType]?.label || r.voucherType,
        Particulars: r.particulars,
        "Cash/Bank A/c": r.head,
        "Amount (₹)": r.amount,
      })),
      {
        Date: "",
        "Voucher No": "",
        "Voucher Type": "",
        Particulars: "Total Receipts (Excl. Opening)",
        "Cash/Bank A/c": "",
        "Amount (₹)": filteredReceiptsTotal,
      },
      {
        Date: "",
        "Voucher No": "",
        "Voucher Type": "",
        Particulars: "Grand Total (Opening + Receipts)",
        "Cash/Bank A/c": "",
        "Amount (₹)": summary.openingTotal + filteredReceiptsTotal,
      },
    ];

    const paymentRows = [
      ...filteredPayments.map((p) => ({
        Date: fmtDate(p.date),
        "Voucher No": p.voucherNo,
        "Voucher Type": VOUCHER_BADGE_MAP[p.voucherType]?.label || p.voucherType,
        Particulars: p.particulars,
        "Cash/Bank A/c": p.head,
        "Amount (₹)": p.amount,
      })),
      {
        Date: toDate || "Closing",
        "Voucher No": "-",
        "Voucher Type": "Closing Balance",
        Particulars: `Closing Cash (${fmtMoney(summary.closingCash)}) + Bank (${fmtMoney(summary.closingBank)})`,
        "Cash/Bank A/c": "Closing",
        "Amount (₹)": summary.closingTotal,
      },
      {
        Date: "",
        "Voucher No": "",
        "Voucher Type": "",
        Particulars: "Total Payments (Excl. Closing)",
        "Cash/Bank A/c": "",
        "Amount (₹)": filteredPaymentsTotal,
      },
      {
        Date: "",
        "Voucher No": "",
        "Voucher Type": "",
        Particulars: "Grand Total (Payments + Closing)",
        "Cash/Bank A/c": "",
        "Amount (₹)": filteredPaymentsTotal + summary.closingTotal,
      },
    ];

    const acctRows = accounts.map((a) => ({
      "Account Name": a.name,
      Type: a.kind === "cash" ? "Cash-in-Hand" : "Bank Account",
      "Opening Balance (₹)": a.opening,
      "Receipts (₹)": a.receipts,
      "Payments (₹)": a.payments,
      "Closing Balance (₹)": a.closing,
    }));

    const wsReceipts = XLSX.utils.json_to_sheet(receiptRows);
    const wsPayments = XLSX.utils.json_to_sheet(paymentRows);
    const wsAccounts = XLSX.utils.json_to_sheet(acctRows);

    XLSX.utils.book_append_sheet(wb, wsReceipts, "Receipts");
    XLSX.utils.book_append_sheet(wb, wsPayments, "Payments");
    XLSX.utils.book_append_sheet(wb, wsAccounts, "Cash & Bank Balances");

    XLSX.writeFile(wb, `Receipt_Payment_Account_${fromDate || "all"}_to_${toDate || "latest"}.xlsx`);
  };

  return (
    <div
      className={`pt-[56px] px-4 min-h-[calc(100vh-64px)] pb-12 ${
        isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-800"
      }`}
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pt-2 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => navigate("/app/reports")}
            title="Back to Reports"
            className={`p-2 rounded-lg mr-3 transition-colors ${
              isDark
                ? "bg-gray-800 hover:bg-gray-700 text-white border border-gray-700"
                : "bg-white hover:bg-gray-100 text-gray-700 border shadow-sm"
            }`}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
              <FileText className="text-blue-600 dark:text-blue-400" size={26} />
              Receipt and Payment Account
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Cash &amp; Bank basis summary linking Receipt, Payment, Cash Sales, Cash Purchase &amp; Bank/Cash vouchers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchReport}
            disabled={loading}
            className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1.5"
          >
            <Printer size={15} /> Print
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Download size={15} /> Export Excel
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div
        className={`p-3.5 rounded-xl border mb-5 flex flex-wrap items-center gap-3 ${
          isDark ? "bg-gray-800/80 border-gray-700" : "bg-white border-gray-200 shadow-sm"
        }`}
      >
        {/* Period Mode */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-900 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => handlePeriodPreset("all")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              periodMode === "all"
                ? "bg-blue-600 text-white"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
            }`}
          >
            All Time
          </button>
          <button
            type="button"
            onClick={() => handlePeriodPreset("fy")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              periodMode === "fy"
                ? "bg-blue-600 text-white"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
            }`}
          >
            FY {fyStartYear}-{String(fyStartYear + 1).slice(-2)}
          </button>
          <button
            type="button"
            onClick={() => handlePeriodPreset("custom")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              periodMode === "custom"
                ? "bg-blue-600 text-white"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
            }`}
          >
            Custom
          </button>
        </div>

        {/* Date Inputs */}
        <div className="flex items-center gap-2 text-xs">
          <Calendar size={14} className="text-gray-400" />
          <input
            type="date"
            aria-label="From Date"
            value={fromDate}
            onChange={(e) => {
              setPeriodMode("custom");
              setFromDate(e.target.value);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            aria-label="To Date"
            value={toDate}
            onChange={(e) => {
              setPeriodMode("custom");
              setToDate(e.target.value);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs"
          />
        </div>

        {/* Account Scope Selector */}
        <div className="flex items-center gap-1.5 text-xs">
          <Landmark size={14} className="text-gray-400" />
          <select
            aria-label="Cash or Bank Scope"
            value={accountScope}
            onChange={(e) => setAccountScope(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-medium"
          >
            <option value="all">All Cash &amp; Bank Accounts</option>
            <option value="cash">Only Cash-in-Hand</option>
            <option value="bank">Only Bank Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={`ledger:${a.id}`}>
                {a.kind === "cash" ? "💵" : "🏦"} {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Contra Toggle (only relevant for All Cash & Bank) */}
        {accountScope === "all" && (
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700">
            <input
              type="checkbox"
              checked={includeContra}
              onChange={(e) => setIncludeContra(e.target.checked)}
              className="rounded text-blue-600"
            />
            <span>Include Contra Transfers</span>
          </label>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-5 p-4 rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-900 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* 4 Summary Cards: Opening | Receipts | Payments | Closing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <div
          className={`p-4 rounded-xl border ${
            isDark
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span className="font-semibold uppercase tracking-wider">Opening Balance</span>
            <Wallet size={15} className="text-blue-500" />
          </div>
          <div className="text-2xl font-extrabold mt-1.5 text-gray-900 dark:text-white">
            {fmtMoney(summary.openingTotal)}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
            Cash: {fmtMoney(summary.openingCash)} • Bank: {fmtMoney(summary.openingBank)}
          </div>
        </div>

        <div
          className={`p-4 rounded-xl border ${
            isDark
              ? "bg-gradient-to-r from-green-950/40 to-gray-800 border-green-900/60"
              : "bg-gradient-to-r from-green-50 to-white border-green-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-400">
              Total Receipts (Inflow)
            </span>
            <span className="text-[11px] text-gray-500">{receipts.length} entries</span>
          </div>
          <div className="text-2xl font-extrabold text-green-600 dark:text-green-400 mt-1.5">
            {fmtMoney(summary.totalReceipts)}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
            Left Total (Op + Rec): {fmtMoney(summary.leftGrandTotal)}
          </div>
        </div>

        <div
          className={`p-4 rounded-xl border ${
            isDark
              ? "bg-gradient-to-r from-red-950/40 to-gray-800 border-red-900/60"
              : "bg-gradient-to-r from-red-50 to-white border-red-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
              Total Payments (Outflow)
            </span>
            <span className="text-[11px] text-gray-500">{payments.length} entries</span>
          </div>
          <div className="text-2xl font-extrabold text-red-600 dark:text-red-400 mt-1.5">
            {fmtMoney(summary.totalPayments)}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
            Right Total (Pay + Cl): {fmtMoney(summary.rightGrandTotal)}
          </div>
        </div>

        <div
          className={`p-4 rounded-xl border ${
            isDark
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span className="font-semibold uppercase tracking-wider">Closing Balance</span>
            <Landmark size={15} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold mt-1.5 text-emerald-600 dark:text-emerald-400">
            {fmtMoney(summary.closingTotal)}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
            Cash: {fmtMoney(summary.closingCash)} • Bank: {fmtMoney(summary.closingBank)}
          </div>
        </div>
      </div>

      {/* Info note when Contra is excluded in combined view */}
      {accountScope === "all" && !includeContra && summary.contraExcludedCount > 0 && (
        <div
          className={`mb-5 px-3.5 py-2.5 rounded-lg border text-xs flex items-center gap-2 ${
            isDark
              ? "bg-purple-950/30 border-purple-900/60 text-purple-200"
              : "bg-purple-50 border-purple-200 text-purple-800"
          }`}
        >
          <Info size={15} className="shrink-0" />
          <span>
            {summary.contraExcludedCount} internal Contra transfer(s) totaling{" "}
            <strong>{fmtMoney(summary.contraExcludedAmount)}</strong> between Cash &amp; Bank are hidden
            because they net to zero in combined Cash+Bank view. Enable{" "}
            <strong>Include Contra Transfers</strong> or filter by a single Cash/Bank account to view them.
          </span>
        </div>
      )}

      {/* Account-wise Cash & Bank Balance Breakdown */}
      {accounts.length > 0 && (
        <div
          className={`mb-5 border rounded-xl overflow-hidden ${
            isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <button
            type="button"
            onClick={() => setShowAccountsTable((prev) => !prev)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider bg-gray-100/80 dark:bg-gray-900/70 border-b border-gray-200 dark:border-gray-700"
          >
            <span>Cash &amp; Bank Account-wise Balances ({accounts.length})</span>
            {showAccountsTable ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showAccountsTable && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-2">Ledger Name</th>
                    <th className="px-4 py-2">Group</th>
                    <th className="px-4 py-2 text-right">Opening</th>
                    <th className="px-4 py-2 text-right">Receipts (+)</th>
                    <th className="px-4 py-2 text-right">Payments (-)</th>
                    <th className="px-4 py-2 text-right">Closing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {accounts.map((a) => (
                    <tr
                      key={a.id}
                      onClick={() => setAccountScope(`ledger:${a.id}`)}
                      className="cursor-pointer hover:bg-blue-50/40 dark:hover:bg-gray-700/40"
                    >
                      <td className="px-4 py-2 font-semibold">{a.name}</td>
                      <td className="px-4 py-2 text-gray-500">
                        {a.kind === "cash" ? "Cash-in-Hand" : "Bank Accounts"}
                      </td>
                      <td className="px-4 py-2 text-right">{fmtMoney(a.opening)}</td>
                      <td className="px-4 py-2 text-right text-green-600 dark:text-green-400">
                        {fmtMoney(a.receipts)}
                      </td>
                      <td className="px-4 py-2 text-right text-red-600 dark:text-red-400">
                        {fmtMoney(a.payments)}
                      </td>
                      <td className="px-4 py-2 text-right font-bold">{fmtMoney(a.closing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Search + Voucher Type Pills */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", "receipt", "payment", "sales", "purchase", "contra", "journal"] as const).map(
            (vt) => (
              <button
                key={vt}
                type="button"
                onClick={() => setVoucherTypeFilter(vt)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  voucherTypeFilter === vt
                    ? "bg-blue-600 text-white border-blue-600"
                    : isDark
                    ? "bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                }`}
              >
                {vt === "all" ? "All Vouchers" : VOUCHER_BADGE_MAP[vt].label}
              </button>
            )
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search party, voucher, A/c..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 w-full border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">
            Receipts: {filteredReceipts.length} | Payments: {filteredPayments.length}
          </span>
        </div>
      </div>

      {/* 50% - 50% Split Tally T-Account Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Partition (50%): Receipts Side */}
        <div
          className={`border rounded-xl overflow-hidden flex flex-col ${
            isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <div className="p-3.5 bg-green-50 dark:bg-green-950/50 border-b border-green-200 dark:border-green-900 flex items-center justify-between">
            <span className="font-bold text-sm text-green-900 dark:text-green-200">
              📥 Receipts (Dr — Inward Cash / Bank)
            </span>
            <span className="text-xs font-semibold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/60 px-2 py-0.5 rounded">
              {fmtMoney(filteredReceiptsTotal)}
            </span>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Voucher</th>
                  <th className="px-3 py-2.5">Particulars / Cash-Bank A/c</th>
                  <th className="px-3 py-2.5 text-right font-bold">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {/* Opening Balance Row */}
                {!isSubFiltered && (
                  <tr className="bg-blue-50/60 dark:bg-blue-950/20 font-semibold">
                    <td className="px-3 py-2.5 text-gray-500">{fromDate ? fmtDate(fromDate) : "Opening"}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-blue-700 dark:text-blue-300">
                      OP-BAL
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-gray-900 dark:text-white">To Opening Balance</div>
                      <div className="text-[11px] font-normal text-gray-500">
                        Cash: {fmtMoney(summary.openingCash)} | Bank: {fmtMoney(summary.openingBank)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-blue-700 dark:text-blue-300">
                      {fmtMoney(summary.openingTotal)}
                    </td>
                  </tr>
                )}

                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      Loading receipt entries...
                    </td>
                  </tr>
                ) : filteredReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No receipt entries found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredReceipts.map((r) => {
                    const badge = VOUCHER_BADGE_MAP[r.voucherType] || VOUCHER_BADGE_MAP.receipt;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => r.editPath && navigate(r.editPath)}
                        className={`hover:bg-green-50/40 dark:hover:bg-gray-700/50 ${
                          r.editPath ? "cursor-pointer" : ""
                        }`}
                      >
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                          {fmtDate(r.date)}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="font-mono font-medium flex items-center gap-1">
                            {r.voucherNo}
                            {r.editPath && <ExternalLink size={11} className="text-gray-400" />}
                          </div>
                          <span
                            className={`inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-gray-900 dark:text-gray-100">
                            {r.particulars}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            A/c: {r.head}
                            {r.narration ? ` • ${r.narration}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-green-600 dark:text-green-400 whitespace-nowrap">
                          {fmtMoney(r.amount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-gray-100 dark:bg-gray-900 border-t-2 border-gray-300 dark:border-gray-600 font-bold">
                <tr>
                  <td colSpan={3} className="px-3 py-2.5 text-right">
                    {isSubFiltered
                      ? "Filtered Receipts Total"
                      : "Total (Opening Balance + Receipts)"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-green-700 dark:text-green-300">
                    {fmtMoney(
                      isSubFiltered ? filteredReceiptsTotal : summary.leftGrandTotal
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Right Partition (50%): Payments Side */}
        <div
          className={`border rounded-xl overflow-hidden flex flex-col ${
            isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <div className="p-3.5 bg-red-50 dark:bg-red-950/50 border-b border-red-200 dark:border-red-900 flex items-center justify-between">
            <span className="font-bold text-sm text-red-900 dark:text-red-200">
              📤 Payments (Cr — Outward Cash / Bank)
            </span>
            <span className="text-xs font-semibold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/60 px-2 py-0.5 rounded">
              {fmtMoney(filteredPaymentsTotal)}
            </span>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Voucher</th>
                  <th className="px-3 py-2.5">Particulars / Cash-Bank A/c</th>
                  <th className="px-3 py-2.5 text-right font-bold">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      Loading payment entries...
                    </td>
                  </tr>
                ) : filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No payment entries found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((p) => {
                    const badge = VOUCHER_BADGE_MAP[p.voucherType] || VOUCHER_BADGE_MAP.payment;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => p.editPath && navigate(p.editPath)}
                        className={`hover:bg-red-50/40 dark:hover:bg-gray-700/50 ${
                          p.editPath ? "cursor-pointer" : ""
                        }`}
                      >
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                          {fmtDate(p.date)}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="font-mono font-medium flex items-center gap-1">
                            {p.voucherNo}
                            {p.editPath && <ExternalLink size={11} className="text-gray-400" />}
                          </div>
                          <span
                            className={`inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-gray-900 dark:text-gray-100">
                            {p.particulars}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            A/c: {p.head}
                            {p.narration ? ` • ${p.narration}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                          {fmtMoney(p.amount)}
                        </td>
                      </tr>
                    );
                  })
                )}

                {/* Closing Balance Row */}
                {!isSubFiltered && (
                  <tr className="bg-emerald-50/60 dark:bg-emerald-950/20 font-semibold">
                    <td className="px-3 py-2.5 text-gray-500">{toDate ? fmtDate(toDate) : "Closing"}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
                      CL-BAL
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-gray-900 dark:text-white">By Closing Balance</div>
                      <div className="text-[11px] font-normal text-gray-500">
                        Cash: {fmtMoney(summary.closingCash)} | Bank: {fmtMoney(summary.closingBank)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-emerald-700 dark:text-emerald-300">
                      {fmtMoney(summary.closingTotal)}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-gray-100 dark:bg-gray-900 border-t-2 border-gray-300 dark:border-gray-600 font-bold">
                <tr>
                  <td colSpan={3} className="px-3 py-2.5 text-right">
                    {isSubFiltered
                      ? "Filtered Payments Total"
                      : "Total (Payments + Closing Balance)"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-red-700 dark:text-red-300">
                    {fmtMoney(
                      isSubFiltered ? filteredPaymentsTotal : summary.rightGrandTotal
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReceiptPaymentAccount;
