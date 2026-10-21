import React, { useState, useEffect, useMemo } from "react";
import { useAppContext } from "../../context/AppContext";
import { useCompany } from "../../context/CompanyContext";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Printer,
  Download,
  Filter,
  Calendar,
  Search,
  FileText,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  ChevronDown
} from "lucide-react";
import * as XLSX from "xlsx";

interface ItemDetail {
  itemName: string;
  quantity: number;
  rate: number;
  amount: number;
  discount: number;
}

interface LedgerTransaction {
  id: string;
  date: string;
  voucherType: string;
  voucherNo: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
  narration?: string;
  taxableValue?: number;
  discount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  totalValue?: number;
  items?: ItemDetail[];
}

interface LedgerApiResponse {
  success: boolean;
  ledger: {
    id: number;
    name: string;
    balance_type?: string;
  };
  transactions: LedgerTransaction[];
  summary: {
    openingBalance: number;
    closingBalance: number;
    totalDebit: number;
    totalCredit: number;
    transactionCount: number;
  };
  message?: string;
}

interface Ledger {
  id: string | number;
  name: string;
  groupId?: number | string;
  group_name?: string;
}

// 8 Required Badge Voucher Types
const VOUCHER_TYPES = [
  { key: "Payment", label: "Payment", color: "bg-blue-500" },
  { key: "Receipt", label: "Receipt", color: "bg-emerald-500" },
  { key: "Contra", label: "Contra", color: "bg-purple-500" },
  { key: "Journal", label: "Journal", color: "bg-amber-500" },
  { key: "Sales", label: "Sales", color: "bg-indigo-500" },
  { key: "Purchase", label: "Purchase", color: "bg-orange-500" },
  { key: "Debit Note", label: "Debit Note", color: "bg-rose-500" },
  { key: "Credit Note", label: "Credit Note", color: "bg-teal-500" },
];

const QUARTERS = [
  { key: "Q1", label: "Q1 (Apr - Jun)" },
  { key: "Q2", label: "Q2 (Jul - Sep)" },
  { key: "Q3", label: "Q3 (Oct - Dec)" },
  { key: "Q4", label: "Q4 (Jan - Mar)" },
];

const getCurrentQuarterKey = () => {
  const m = new Date().getMonth();
  if (m >= 3 && m <= 5) return "Q1";
  if (m >= 6 && m <= 8) return "Q2";
  if (m >= 9 && m <= 11) return "Q3";
  return "Q4";
};

const getQuarterDateRange = (quarterKey: string, baseYear?: number) => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const defaultFyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const fyStartYear = baseYear !== undefined ? baseYear : defaultFyStartYear;

  switch (quarterKey) {
    case "Q1":
      return {
        fromDate: `${fyStartYear}-04-01`,
        toDate: `${fyStartYear}-06-30`,
      };
    case "Q2":
      return {
        fromDate: `${fyStartYear}-07-01`,
        toDate: `${fyStartYear}-09-30`,
      };
    case "Q3":
      return {
        fromDate: `${fyStartYear}-10-01`,
        toDate: `${fyStartYear}-12-31`,
      };
    case "Q4":
      return {
        fromDate: `${fyStartYear + 1}-01-01`,
        toDate: `${fyStartYear + 1}-03-31`,
      };
    default:
      return {
        fromDate: `${fyStartYear}-04-01`,
        toDate: `${fyStartYear}-06-30`,
      };
  }
};

const AccountSummary: React.FC = () => {
  const { theme } = useAppContext();
  const { companyInfo } = useCompany();
  const navigate = useNavigate();

  // Owners parameters
  const companyId = localStorage.getItem("company_id") || "";
  const ownerType = localStorage.getItem("supplier") || "";
  const ownerId = localStorage.getItem(
    ownerType === "employee" ? "employee_id" : "user_id"
  ) || "";

  // Date Range Defaults (Current FY)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const fyStartDate = `${fyStartYear}-04-01`;
  const fyEndDate = `${fyStartYear + 1}-03-31`;

  const [selectedDateRange, setSelectedDateRange] = useState("current-year");
  const [selectedQuarter, setSelectedQuarter] = useState<string>(() => getCurrentQuarterKey());
  const [fromDate, setFromDate] = useState(fyStartDate);
  const [toDate, setToDate] = useState(fyEndDate);

  // Ledger & Filter States
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [selectedLedgerId, setSelectedLedgerId] = useState<string>("");
  const [ledgerSearchTerm, setLedgerSearchTerm] = useState<string>("");
  const [selectedVoucherBadge, setSelectedVoucherBadge] = useState<string | null>(null);

  // API Data States
  const [loadingLedgers, setLoadingLedgers] = useState<boolean>(true);
  const [loadingTxns, setLoadingTxns] = useState<boolean>(false);
  const [reportData, setReportData] = useState<LedgerApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch Ledgers List
  useEffect(() => {
    const fetchLedgers = async () => {
      if (!companyId) return;
      setLoadingLedgers(true);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        if (res.ok) {
          const data: Ledger[] = await res.json();
          setLedgers(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to fetch ledgers list:", err);
      } finally {
        setLoadingLedgers(false);
      }
    };

    fetchLedgers();
  }, [companyId, ownerType, ownerId]);

  // Fetch Ledger Transactions Report when ledgerId or Date Range changes
  useEffect(() => {
    setSelectedVoucherBadge(null); // Reset detail selection by default

    if (!selectedLedgerId) {
      setReportData(null);
      return;
    }

    setLoadingTxns(true);
    setError(null);

    fetch(
      `${import.meta.env.VITE_API_URL}/api/ledger-caraction/report?ledgerId=${selectedLedgerId}&fromDate=${fromDate}&toDate=${toDate}`
    )
      .then((res) => res.json())
      .then((data: LedgerApiResponse) => {
        if (data.success) {
          setReportData(data);
        } else {
          setError(data.message || "Error loading transaction data");
        }
      })
      .catch((err) => {
        setError(err.message || "Network error fetching transactions");
      })
      .finally(() => {
        setLoadingTxns(false);
      });
  }, [selectedLedgerId, fromDate, toDate]);

  // Helper Date Formatter
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Helper Currency Formatter
  const formatCurrency = (amount: number) => {
    const validAmt = isNaN(amount) ? 0 : amount;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(validAmt);
  };

  // Helper to extract financial year start year
  const getBaseFyYear = () => {
    if (fromDate) {
      const parts = fromDate.split("-");
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && !isNaN(m)) {
          return m >= 3 ? y : y - 1;
        }
      }
    }
    const today = new Date();
    return today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  };

  // Handle Date Range Presets
  const handleDateRangeChange = (range: string) => {
    setSelectedDateRange(range);
    const today = new Date();
    const cYear = today.getFullYear();

    switch (range) {
      case "current-month": {
        const start = `${cYear}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
        setFromDate(start);
        setToDate(today.toISOString().split("T")[0]);
        break;
      }
      case "previous-month": {
        const prevMonth = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
        const prevYear = today.getMonth() === 0 ? cYear - 1 : cYear;
        const start = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-01`;
        const lastDay = new Date(prevYear, prevMonth + 1, 0).getDate();
        const end = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        setFromDate(start);
        setToDate(end);
        break;
      }
      case "current-year": {
        const startYear = today.getMonth() >= 3 ? cYear : cYear - 1;
        setFromDate(`${startYear}-04-01`);
        setToDate(`${startYear + 1}-03-31`);
        break;
      }
      case "quarter": {
        const baseYear = getBaseFyYear();
        const qKey = selectedQuarter || getCurrentQuarterKey();
        const { fromDate: qFrom, toDate: qTo } = getQuarterDateRange(qKey, baseYear);
        setFromDate(qFrom);
        setToDate(qTo);
        break;
      }
      default:
        break;
    }
  };

  // Handle Quarter Change
  const handleQuarterChange = (qKey: string) => {
    setSelectedQuarter(qKey);
    const baseYear = getBaseFyYear();
    const { fromDate: qFrom, toDate: qTo } = getQuarterDateRange(qKey, baseYear);
    setFromDate(qFrom);
    setToDate(qTo);
  };

  // Filtered Ledgers based on search term
  const filteredLedgers = useMemo(() => {
    if (!ledgerSearchTerm.trim()) return ledgers;
    const term = ledgerSearchTerm.toLowerCase();
    return ledgers.filter((l) => l.name.toLowerCase().includes(term));
  }, [ledgers, ledgerSearchTerm]);

  // Selected Ledger Details
  const selectedLedger = useMemo(() => {
    return ledgers.find((l) => String(l.id) === String(selectedLedgerId));
  }, [ledgers, selectedLedgerId]);

  // All Transactions normalized
  const allTransactions = useMemo(() => {
    return reportData?.transactions || [];
  }, [reportData]);

  // Count per voucher type
  const voucherCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Payment: 0,
      Receipt: 0,
      Contra: 0,
      Journal: 0,
      Sales: 0,
      Purchase: 0,
      "Debit Note": 0,
      "Credit Note": 0,
    };

    allTransactions.forEach((txn) => {
      const type = (txn.voucherType || "").trim();
      const typeLower = type.toLowerCase();

      if (typeLower === "payment") counts["Payment"]++;
      else if (typeLower === "receipt") counts["Receipt"]++;
      else if (typeLower === "contra") counts["Contra"]++;
      else if (typeLower === "journal") counts["Journal"]++;
      else if (typeLower === "sales" || typeLower === "sale") counts["Sales"]++;
      else if (typeLower === "purchase") counts["Purchase"]++;
      else if (typeLower.includes("debit note") || typeLower === "debitnote") counts["Debit Note"]++;
      else if (typeLower.includes("credit note") || typeLower === "creditnote") counts["Credit Note"]++;
    });

    return counts;
  }, [allTransactions]);

  // Summary Table Data per Voucher Type (Type, Entry, Taxable Value, Total Value)
  const voucherTypeSummary = useMemo(() => {
    return VOUCHER_TYPES.map((vType) => {
      const target = vType.key.toLowerCase();
      const txns = allTransactions.filter((txn) => {
        const type = (txn.voucherType || "").trim().toLowerCase();
        if (target === "payment") return type === "payment";
        if (target === "receipt") return type === "receipt";
        if (target === "contra") return type === "contra";
        if (target === "journal") return type === "journal";
        if (target === "sales") return type === "sales" || type === "sale";
        if (target === "purchase") return type === "purchase";
        if (target === "debit note") return type.includes("debit note") || type === "debitnote";
        if (target === "credit note") return type.includes("credit note") || type === "creditnote";
        return type === target;
      });

      let taxableValue = 0;
      let totalValue = 0;

      txns.forEach((t) => {
        taxableValue += Number(t.taxableValue || t.debit || t.credit || 0);
        totalValue += Number(t.totalValue || t.debit || t.credit || 0);
      });

      return {
        key: vType.key,
        label: vType.label,
        entry: txns.length,
        taxableValue,
        totalValue,
        color: vType.color,
      };
    }).filter((item) => item.entry > 0);
  }, [allTransactions]);

  // Transactions filtered by active Badge
  const filteredTransactions = useMemo(() => {
    if (!selectedVoucherBadge) return [];
    const targetBadge = selectedVoucherBadge.toLowerCase();

    return allTransactions.filter((txn) => {
      const type = (txn.voucherType || "").trim().toLowerCase();

      if (targetBadge === "payment") return type === "payment";
      if (targetBadge === "receipt") return type === "receipt";
      if (targetBadge === "contra") return type === "contra";
      if (targetBadge === "journal") return type === "journal";
      if (targetBadge === "sales") return type === "sales" || type === "sale";
      if (targetBadge === "purchase") return type === "purchase";
      if (targetBadge === "debit note") return type.includes("debit note") || type === "debitnote";
      if (targetBadge === "credit note") return type.includes("credit note") || type === "creditnote";

      return type === targetBadge;
    });
  }, [allTransactions, selectedVoucherBadge]);

  // Totals for filtered transactions
  const totals = useMemo(() => {
    let totalQty = 0;
    let totalTaxable = 0;
    let totalDiscount = 0;
    let totalIgst = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalValue = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    let totalAmount = 0;

    filteredTransactions.forEach((t) => {
      const hasItems = t.items && t.items.length > 0;
      if (hasItems) {
        totalQty += t.items!.reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);
      }
      totalTaxable += Number(t.taxableValue || t.debit || t.credit || 0);
      totalDiscount += Number(t.discount || 0);
      totalIgst += Number(t.igst || 0);
      totalCgst += Number(t.cgst || 0);
      totalSgst += Number(t.sgst || 0);
      totalValue += Number(t.totalValue || t.debit || t.credit || 0);
      totalDebit += Number(t.debit || 0);
      totalCredit += Number(t.credit || 0);
      totalAmount += Number(t.debit || t.credit || 0);
    });

    return {
      totalQty,
      totalTaxable,
      totalDiscount,
      totalIgst,
      totalCgst,
      totalSgst,
      totalValue,
      totalDebit,
      totalCredit,
      totalAmount,
    };
  }, [filteredTransactions]);

  // Export to Excel
  const exportToExcel = () => {
    if (!filteredTransactions || filteredTransactions.length === 0) return;

    const wsData: any[][] = [];
    wsData.push([companyInfo?.name || "Company Name"]);
    wsData.push([companyInfo?.address || ""]);
    wsData.push([]);
    wsData.push([`Account Summary - ${selectedVoucherBadge}`]);
    wsData.push([`Ledger: ${selectedLedger?.name || ""}`]);
    wsData.push([`Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`]);
    wsData.push([]);

    // Headers according to badge
    if (selectedVoucherBadge === "Sales" || selectedVoucherBadge === "Purchase") {
      wsData.push([
        "Voucher No",
        "Date",
        selectedVoucherBadge === "Sales" ? "Customer" : "Supplier",
        "Item / Details",
        "Qty",
        "Rate",
        "Taxable Value",
        "Discount",
        "IGST",
        "CGST",
        "SGST",
        "Total Value",
        "Narration",
      ]);

      filteredTransactions.forEach((t) => {
        const hasItems = t.items && t.items.length > 0;
        const itemNames = hasItems ? t.items!.map((i) => i.itemName).join(", ") : "-";
        const qtySum = hasItems ? t.items!.reduce((s, i) => s + (i.quantity || 0), 0) : "-";
        const avgRate = hasItems ? (t.items![0]?.rate || 0) : "-";

        wsData.push([
          t.voucherNo || "",
          formatDate(t.date),
          t.particulars || "",
          itemNames,
          qtySum,
          avgRate,
          t.taxableValue || t.debit || t.credit || 0,
          t.discount || 0,
          t.igst || 0,
          t.cgst || 0,
          t.sgst || 0,
          t.totalValue || t.debit || t.credit || 0,
          t.narration || "",
        ]);
      });
    } else if (selectedVoucherBadge === "Journal" || selectedVoucherBadge === "Debit Note" || selectedVoucherBadge === "Credit Note") {
      wsData.push(["Voucher No", "Date", "Particulars / Account", "Debit", "Credit", "Narration"]);
      filteredTransactions.forEach((t) => {
        wsData.push([
          t.voucherNo || "",
          formatDate(t.date),
          t.particulars || "",
          t.debit || 0,
          t.credit || 0,
          t.narration || "",
        ]);
      });
    } else {
      // Payment, Receipt, Contra
      wsData.push(["Voucher No", "Date", "Particulars / Account", "Amount", "Narration"]);
      filteredTransactions.forEach((t) => {
        const amt = t.debit || t.credit || 0;
        wsData.push([
          t.voucherNo || "",
          formatDate(t.date),
          t.particulars || "",
          amt,
          t.narration || "",
        ]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${selectedVoucherBadge} Summary`);
    XLSX.writeFile(
      wb,
      `Account_Summary_${selectedVoucherBadge}_${selectedLedger?.name || "Report"}_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className={`min-h-screen p-4 sm:p-6 space-y-6 ${
        theme === "dark"
          ? "bg-slate-900 text-slate-100"
          : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* Top Action Bar / Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition"
            title="Go Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Layers className="w-6 h-6 text-indigo-500" />
              Account Summary
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Select any ledger to view voucher-type breakdown & tax details
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print</span>
          </button>
          <button
            onClick={exportToExcel}
            disabled={!filteredTransactions || filteredTransactions.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Download className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Date Filter & Ledger Selector Panel */}
      <div
        className={`p-4 rounded-xl border ${
          theme === "dark"
            ? "bg-slate-800/80 border-slate-700"
            : "bg-white border-slate-200 shadow-sm"
        } space-y-4`}
      >
        <div className={`grid grid-cols-1 ${selectedDateRange === "quarter" ? "md:grid-cols-3" : "md:grid-cols-4"} gap-4`}>
          {/* Preset Date Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Date Period
            </label>
            <div className="relative">
              <select
                value={selectedDateRange}
                onChange={(e) => handleDateRangeChange(e.target.value)}
                className={`w-full p-2.5 rounded-lg border text-sm appearance-none ${
                  theme === "dark"
                    ? "bg-slate-900 border-slate-700 text-slate-100"
                    : "bg-slate-50 border-slate-300 text-slate-900"
                }`}
              >
                <option value="current-year">Current Financial Year</option>
                <option value="current-month">Current Month</option>
                <option value="previous-month">Previous Month</option>
                <option value="quarter">Quarter</option>
                <option value="custom">Custom Date Range</option>
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-3 pointer-events-none opacity-50" />
            </div>
          </div>

          {/* Quarter Dropdown Selector */}
          {selectedDateRange === "quarter" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Select Quarter
              </label>
              <div className="relative">
                <select
                  value={selectedQuarter}
                  onChange={(e) => handleQuarterChange(e.target.value)}
                  className={`w-full p-2.5 rounded-lg border text-sm appearance-none font-medium ${
                    theme === "dark"
                      ? "bg-slate-900 border-slate-700 text-slate-100 focus:border-indigo-500"
                      : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
                  }`}
                >
                  {QUARTERS.map((q) => (
                    <option key={q.key} value={q.key}>
                      {q.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3 top-3 pointer-events-none opacity-50" />
              </div>
            </div>
          )}

          {/* From Date & To Date (Hidden when Quarter is selected) */}
          {selectedDateRange !== "quarter" && (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setSelectedDateRange("custom");
                  }}
                  className={`w-full p-2.5 rounded-lg border text-sm ${
                    theme === "dark"
                      ? "bg-slate-900 border-slate-700 text-slate-100"
                      : "bg-slate-50 border-slate-300 text-slate-900"
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setSelectedDateRange("custom");
                  }}
                  className={`w-full p-2.5 rounded-lg border text-sm ${
                    theme === "dark"
                      ? "bg-slate-900 border-slate-700 text-slate-100"
                      : "bg-slate-50 border-slate-300 text-slate-900"
                  }`}
                />
              </div>
            </>
          )}

          {/* Select Ledger Dropdown / Searchable Select */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Select Ledger *
            </label>
            {loadingLedgers ? (
              <div className="p-2.5 rounded-lg border text-sm bg-slate-100 dark:bg-slate-800 text-slate-400">
                Loading ledgers...
              </div>
            ) : (
              <select
                value={selectedLedgerId}
                onChange={(e) => setSelectedLedgerId(e.target.value)}
                className={`w-full p-2.5 rounded-lg border text-sm font-medium ${
                  theme === "dark"
                    ? "bg-slate-900 border-slate-700 text-slate-100 focus:border-indigo-500"
                    : "bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500"
                }`}
              >
                <option value="">-- Choose a Ledger --</option>
                {filteredLedgers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Selected Ledger Info Banner */}
        {selectedLedger && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/60 text-xs">
            <div className="flex items-center gap-2 font-medium">
              <span className="text-slate-500 dark:text-slate-400">Active Ledger:</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                {selectedLedger.name}
              </span>
            </div>
            {reportData?.summary && (
              <div className="flex items-center gap-4 text-slate-600 dark:text-slate-300 font-medium">
                <span>Total Transactions: <strong className="text-slate-900 dark:text-slate-100">{reportData.summary.transactionCount}</strong></span>
                <span>Opening: <strong className="text-slate-900 dark:text-slate-100">{formatCurrency(reportData.summary.openingBalance)}</strong></span>
                <span>Closing: <strong className="text-slate-900 dark:text-slate-100">{formatCurrency(reportData.summary.closingBalance)}</strong></span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Voucher Type Summary Table (Interactive Selector) */}
      {selectedLedgerId && voucherTypeSummary.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Voucher Type Summary (Click any row to view details below)
            </label>
            <span className="text-xs text-indigo-500 font-semibold">
              Selected View: {selectedVoucherBadge}
            </span>
          </div>

          <div
            className={`rounded-xl border ${
              theme === "dark"
                ? "bg-slate-800/80 border-slate-700"
                : "bg-white border-slate-200 shadow-sm"
            } overflow-hidden`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr
                    className={`border-b font-extrabold text-xs uppercase tracking-wider ${
                      theme === "dark"
                        ? "bg-slate-900/90 text-slate-200 border-slate-700"
                        : "bg-slate-200/80 text-slate-800 border-slate-300"
                    }`}
                  >
                    <th className="p-3.5">Type</th>
                    <th className="p-3.5 text-center">Entry</th>
                    <th className="p-3.5 text-right">Taxable Value</th>
                    <th className="p-3.5 text-right">Total Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50">
                  {voucherTypeSummary.map((row) => {
                    const isSelected = selectedVoucherBadge === row.key;
                    return (
                      <tr
                        key={row.key}
                        onClick={() => setSelectedVoucherBadge(isSelected ? null : row.key)}
                        className={`cursor-pointer transition-all duration-150 ${
                          isSelected
                            ? theme === "dark"
                              ? "bg-indigo-950/80 font-bold border-l-4 border-l-indigo-500 text-slate-100"
                              : "bg-indigo-100/80 font-bold border-l-4 border-l-indigo-600 text-slate-900"
                            : "hover:bg-slate-100 dark:hover:bg-slate-700/40 text-slate-800 dark:text-slate-200"
                        }`}
                      >
                        <td className="p-3.5 font-extrabold text-sm flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${row.color}`}></span>
                          <span>{row.label}</span>
                          {isSelected && (
                            <span className="ml-1 text-[10px] uppercase font-black px-2 py-0.5 rounded bg-indigo-600 text-white">
                              Selected
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center font-mono">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${
                              row.entry > 0
                                ? "bg-indigo-100 dark:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                            }`}
                          >
                            {row.entry}
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-mono font-extrabold text-sm text-slate-900 dark:text-slate-100">
                          {formatCurrency(row.taxableValue)}
                        </td>
                        <td className="p-3.5 text-right font-mono font-black text-base text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(row.totalValue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Result Section */}
      <div
        className={`rounded-xl border ${
          theme === "dark"
            ? "bg-slate-800/80 border-slate-700"
            : "bg-white border-slate-200 shadow-sm"
        } overflow-hidden`}
      >
        {/* Loading State */}
        {loadingTxns && (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-8 h-8 mx-auto animate-spin text-indigo-500" />
            <p className="text-sm font-medium text-slate-500">
              Loading transaction data for {selectedLedger?.name || "selected ledger"}...
            </p>
          </div>
        )}

        {/* Error State */}
        {!loadingTxns && error && (
          <div className="p-8 text-center space-y-2">
            <AlertCircle className="w-10 h-10 mx-auto text-rose-500" />
            <p className="text-base font-semibold text-rose-600">{error}</p>
            <p className="text-xs text-slate-400">Please try again or select another ledger.</p>
          </div>
        )}

        {/* Prompt state when no ledger selected */}
        {!loadingTxns && !error && !selectedLedgerId && (
          <div className="p-12 text-center space-y-3">
            <FileText className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
              No Ledger Selected
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Please select a ledger from the dropdown above to view its transaction summary.
            </p>
          </div>
        )}

        {/* Prompt state when ledger selected but no voucher type row clicked yet */}
        {!loadingTxns && !error && selectedLedgerId && !selectedVoucherBadge && (
          <div className="p-10 text-center space-y-2">
            <Layers className="w-10 h-10 mx-auto text-indigo-400 dark:text-indigo-500" />
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">
              Click a Voucher Type to View Details
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Select any row from the summary table above to view detailed transaction breakdown.
            </p>
          </div>
        )}

        {/* Empty state when voucher type clicked but 0 transactions */}
        {!loadingTxns && !error && selectedLedgerId && selectedVoucherBadge && filteredTransactions.length === 0 && (
          <div className="p-12 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">
              No {selectedVoucherBadge} Transactions Found
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No {selectedVoucherBadge} vouchers exist for <strong>{selectedLedger?.name}</strong> in the period ({formatDate(fromDate)} to {formatDate(toDate)}).
            </p>
          </div>
        )}

        {/* Table Display */}
        {!loadingTxns && !error && selectedLedgerId && filteredTransactions.length > 0 && (
          <div className="overflow-x-auto">
            {/* Sales & Purchase Specific Table */}
            {(selectedVoucherBadge === "Sales" || selectedVoucherBadge === "Purchase") ? (
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr
                    className={`border-b font-extrabold text-xs uppercase tracking-wider ${
                      theme === "dark"
                        ? "bg-slate-900/90 text-slate-200 border-slate-700"
                        : "bg-slate-200/80 text-slate-800 border-slate-300"
                    }`}
                  >
                    <th className="p-3.5">Voucher No</th>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5">{selectedVoucherBadge === "Sales" ? "Customer" : "Supplier"}</th>
                    <th className="p-3.5">Item / Product</th>
                    <th className="p-3.5 text-right">Qty</th>
                    <th className="p-3.5 text-right">Rate</th>
                    <th className="p-3.5 text-right">Taxable Value</th>
                    <th className="p-3.5 text-right">Discount</th>
                    <th className="p-3.5 text-right">IGST</th>
                    <th className="p-3.5 text-right">CGST</th>
                    <th className="p-3.5 text-right">SGST</th>
                    <th className="p-3.5 text-right">Total Value</th>
                    <th className="p-3.5">Narration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50">
                  {filteredTransactions.map((t, index) => {
                    const hasItems = t.items && t.items.length > 0;
                    const itemNames = hasItems
                      ? t.items!.map((i) => i.itemName).join(", ")
                      : "General Goods/Services";
                    const totalQty = hasItems
                      ? t.items!.reduce((acc, curr) => acc + Number(curr.quantity || 0), 0)
                      : "-";
                    const avgRate = hasItems
                      ? formatCurrency(t.items![0]?.rate || 0)
                      : "-";

                    return (
                      <tr
                        key={t.id || index}
                        className={`hover:bg-slate-100/70 dark:hover:bg-slate-700/40 transition ${
                          index % 2 === 0 ? "" : theme === "dark" ? "bg-slate-800/40" : "bg-slate-50/50"
                        }`}
                      >
                        <td className="p-3.5 font-extrabold text-indigo-600 dark:text-indigo-400">
                          {t.voucherNo || "-"}
                        </td>
                        <td className="p-3.5 text-slate-700 dark:text-slate-300 font-semibold whitespace-nowrap">
                          {formatDate(t.date)}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                          {t.particulars || "-"}
                        </td>
                        <td className="p-3.5 text-slate-800 dark:text-slate-200 font-medium max-w-xs truncate" title={itemNames}>
                          {itemNames}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold">{totalQty}</td>
                        <td className="p-3.5 text-right font-mono font-bold">{avgRate}</td>
                        <td className="p-3.5 text-right font-mono font-extrabold">
                          {formatCurrency(t.taxableValue || t.debit || t.credit || 0)}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-500">
                          {formatCurrency(t.discount || 0)}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-500">
                          {formatCurrency(t.igst || 0)}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-500">
                          {formatCurrency(t.cgst || 0)}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-slate-500">
                          {formatCurrency(t.sgst || 0)}
                        </td>
                        <td className="p-3.5 text-right font-black font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                          {formatCurrency(t.totalValue || t.debit || t.credit || 0)}
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-400 max-w-xs truncate" title={t.narration}>
                          {t.narration || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr
                    className={`border-t-2 border-b-2 text-sm sm:text-base font-black tracking-wide ${
                      theme === "dark"
                        ? "bg-slate-900 text-amber-400 border-indigo-500"
                        : "bg-slate-200 text-slate-900 border-indigo-600 shadow-inner"
                    }`}
                  >
                    <td className="p-4 text-indigo-600 dark:text-indigo-400 font-black" colSpan={4}>TOTAL</td>
                    <td className="p-4 text-right font-mono font-black">{totals.totalQty > 0 ? totals.totalQty : "-"}</td>
                    <td className="p-4 text-right font-mono font-black">-</td>
                    <td className="p-4 text-right font-mono font-black">{formatCurrency(totals.totalTaxable)}</td>
                    <td className="p-4 text-right font-mono font-black">{formatCurrency(totals.totalDiscount)}</td>
                    <td className="p-4 text-right font-mono font-black">{formatCurrency(totals.totalIgst)}</td>
                    <td className="p-4 text-right font-mono font-black">{formatCurrency(totals.totalCgst)}</td>
                    <td className="p-4 text-right font-mono font-black">{formatCurrency(totals.totalSgst)}</td>
                    <td className="p-4 text-right font-mono font-black text-emerald-600 dark:text-emerald-400 text-base sm:text-lg">
                      {formatCurrency(totals.totalValue)}
                    </td>
                    <td className="p-4"></td>
                  </tr>
                </tfoot>
              </table>
            ) : (selectedVoucherBadge === "Journal" || selectedVoucherBadge === "Debit Note" || selectedVoucherBadge === "Credit Note") ? (
              /* Journal, Debit Note, Credit Note Table */
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr
                    className={`border-b font-extrabold text-xs uppercase tracking-wider ${
                      theme === "dark"
                        ? "bg-slate-900/90 text-slate-200 border-slate-700"
                        : "bg-slate-200/80 text-slate-800 border-slate-300"
                    }`}
                  >
                    <th className="p-3.5">Voucher No</th>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5">Particulars / Account</th>
                    <th className="p-3.5 text-right">Debit</th>
                    <th className="p-3.5 text-right">Credit</th>
                    <th className="p-3.5">Narration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50">
                  {filteredTransactions.map((t, index) => (
                    <tr
                      key={t.id || index}
                      className={`hover:bg-slate-100/70 dark:hover:bg-slate-700/40 transition ${
                        index % 2 === 0 ? "" : theme === "dark" ? "bg-slate-800/40" : "bg-slate-50/50"
                      }`}
                    >
                      <td className="p-3.5 font-extrabold text-indigo-600 dark:text-indigo-400">
                        {t.voucherNo || "-"}
                      </td>
                      <td className="p-3.5 text-slate-700 dark:text-slate-300 font-semibold whitespace-nowrap">
                        {formatDate(t.date)}
                      </td>
                      <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                        {t.particulars || "-"}
                      </td>
                      <td className="p-3.5 text-right font-mono font-extrabold text-rose-600 dark:text-rose-400">
                        {t.debit > 0 ? formatCurrency(t.debit) : "-"}
                      </td>
                      <td className="p-3.5 text-right font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                        {t.credit > 0 ? formatCurrency(t.credit) : "-"}
                      </td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-400 max-w-sm truncate" title={t.narration}>
                        {t.narration || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    className={`border-t-2 border-b-2 text-sm sm:text-base font-black tracking-wide ${
                      theme === "dark"
                        ? "bg-slate-900 text-amber-400 border-indigo-500"
                        : "bg-slate-200 text-slate-900 border-indigo-600 shadow-inner"
                    }`}
                  >
                    <td className="p-4 text-indigo-600 dark:text-indigo-400 font-black" colSpan={3}>TOTAL</td>
                    <td className="p-4 text-right font-mono font-black text-rose-600 dark:text-rose-400 text-base sm:text-lg">
                      {formatCurrency(totals.totalDebit)}
                    </td>
                    <td className="p-4 text-right font-mono font-black text-emerald-600 dark:text-emerald-400 text-base sm:text-lg">
                      {formatCurrency(totals.totalCredit)}
                    </td>
                    <td className="p-4"></td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              /* Payment, Receipt, Contra Table */
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr
                    className={`border-b font-extrabold text-xs uppercase tracking-wider ${
                      theme === "dark"
                        ? "bg-slate-900/90 text-slate-200 border-slate-700"
                        : "bg-slate-200/80 text-slate-800 border-slate-300"
                    }`}
                  >
                    <th className="p-3.5">Voucher No</th>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5">Particulars / Account</th>
                    <th className="p-3.5 text-right">Amount</th>
                    <th className="p-3.5">Narration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50">
                  {filteredTransactions.map((t, index) => {
                    const amt = t.debit || t.credit || 0;
                    return (
                      <tr
                        key={t.id || index}
                        className={`hover:bg-slate-100/70 dark:hover:bg-slate-700/40 transition ${
                          index % 2 === 0 ? "" : theme === "dark" ? "bg-slate-800/40" : "bg-slate-50/50"
                        }`}
                      >
                        <td className="p-3.5 font-extrabold text-indigo-600 dark:text-indigo-400">
                          {t.voucherNo || "-"}
                        </td>
                        <td className="p-3.5 text-slate-700 dark:text-slate-300 font-semibold whitespace-nowrap">
                          {formatDate(t.date)}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                          {t.particulars || "-"}
                        </td>
                        <td className="p-3.5 text-right font-mono font-black text-slate-900 dark:text-slate-100 text-sm">
                          {formatCurrency(amt)}
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-400 max-w-sm truncate" title={t.narration}>
                          {t.narration || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr
                    className={`border-t-2 border-b-2 text-sm sm:text-base font-black tracking-wide ${
                      theme === "dark"
                        ? "bg-slate-900 text-amber-400 border-indigo-500"
                        : "bg-slate-200 text-slate-900 border-indigo-600 shadow-inner"
                    }`}
                  >
                    <td className="p-4 text-indigo-600 dark:text-indigo-400 font-black" colSpan={3}>TOTAL</td>
                    <td className="p-4 text-right font-mono font-black text-slate-900 dark:text-slate-100 text-base sm:text-lg">
                      {formatCurrency(totals.totalAmount)}
                    </td>
                    <td className="p-4"></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountSummary;
