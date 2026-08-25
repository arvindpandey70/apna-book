import React, { useState, useEffect, useMemo } from "react";
import { useAppContext } from "../../context/AppContext";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Printer,
  Download,
  Filter,
  Calendar,
  Eye,
  Sparkles,
  Edit,
  ChevronDown,
  X,
} from "lucide-react";
import { useCompany } from "../../context/CompanyContext";
import * as XLSX from "xlsx";
import BillMatchModal from "./BillMatchModal";

interface DayBookEntry {
  id: string;
  date: string;
  voucherType: string;
  voucherNo: string;
  particulars: string;
  ledgerName: string;
  debit: number;
  credit: number;
  voucherId: string;
  narration?: string;
  itemId?: string;
  quantity?: number;
  rate?: number;
  hsnCode?: string;
  isParty?: boolean; // Added for modal
  isChild?: boolean; // Added for modal
  amount?: number; // Added for modal
}

interface VoucherDetail {
  id: string;
  voucherNo: string;
  voucherType: string;
  date: string;
  entries: DayBookEntry[]; // Changed from simple fields to entries array
  narration?: string;
  amount: number; // Keep for compatibility or remove if unused 
  totalDebit?: number;
  totalCredit?: number;
  reference?: string;
  particulars?: string; // Keep for compatibility
}

interface LedgerTransaction {
  id: string;
  date: string;
  particulars: string;
  voucherType: string;
  voucherNo: string;
  debit: number;
  credit: number;
  balance: number;
  runningBalance?: number;
  narration?: string;
  reference?: string;
  isOpening?: boolean;
  isClosing?: boolean;
  isQuotation?: boolean;
}
interface LedgerApiResponse {
  success: boolean;
  ledger: Ledger;
  message?: string;
  transactions: LedgerTransaction[];
  transactionCount: number;
  summary: {
    openingBalance: number;
    closingBalance: number;
    totalDebit: number;
    totalCredit: number;
    transactionCount: number;
  };
}



interface VoucherDetail {
  id: string;
  voucherNo: string;
  voucherType: string;
  date: string;
  amount: number;
  particulars: string;
  narration: string;
  reference?: string;
}

const LedgerReport: React.FC = () => {
  const { theme, ledgerGroups } = useAppContext();
  const { companyInfo } = useCompany();
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  // Financial Year Months (April → March)
  const financialMonths = [
    { key: "04", name: "April" },
    { key: "05", name: "May" },
    { key: "06", name: "June" },
    { key: "07", name: "July" },
    { key: "08", name: "August" },
    { key: "09", name: "September" },
    { key: "10", name: "October" },
    { key: "11", name: "November" },
    { key: "12", name: "December" },
    { key: "01", name: "January" },
    { key: "02", name: "February" },
    { key: "03", name: "March" },
  ];

  const [showFilterPanel, setShowFilterPanel] = useState(true);
  const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);
  const [viewMode, setViewMode] = useState<"detailed" | "monthly" | "daily">(
    "detailed"
  );
  // Calculate Default Date
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Current Month range
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).toISOString().split("T")[0];
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).toISOString().split("T")[0];

  // Financial Year range (April - March)
  const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const fyStartDate = `${fyStartYear}-04-01`;
  const fyEndDate = `${fyStartYear + 1}-03-31`;

  const [selectedDateRange, setSelectedDateRange] = useState(searchParams.get("fromDate") ? "custom" : "current-year");
  const [selectedQuarter, setSelectedQuarter] = useState<string>("");
  const [fromDate, setFromDate] = useState(searchParams.get("fromDate") || fyStartDate);
  const [toDate, setToDate] = useState(searchParams.get("toDate") || fyEndDate);
  const [showClosingBalances, setShowClosingBalances] = useState(true);
  const [selectedVoucher, setSelectedVoucher] = useState<VoucherDetail | null>(
    null
  );
  const [includeOpening] = useState(true);
  const [includeClosing] = useState(true);
  // To drive output
  const [, setLoading] = useState<boolean>(false);
  const [ledgerData, setLedgerData] = useState<LedgerApiResponse | null>(null);
  const [, setError] = useState<string | null>(null);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [ledgerId, setLedgerId] = useState(id || ""); // default
  const [isBillMatchModalOpen, setIsBillMatchModalOpen] = useState(false);
  const [dailyBreakupMonth, setDailyBreakupMonth] = useState<string>(
    String(new Date().getMonth() + 1).padStart(2, "0")
  );
  const [dailyBreakupYear, setDailyBreakupYear] = useState<number>(
    new Date().getFullYear()
  );
  const companyId = localStorage.getItem("company_id");
  const ownerType = localStorage.getItem("supplier");
  const ownerId = localStorage.getItem(
    ownerType === "employee" ? "employee_id" : "user_id"
  );

  // Initialize from URL params
  useEffect(() => {
    if (id) {
      setLedgerId(id);
    }
  }, [id]);

  const [ledgerSearchTerm, setLedgerSearchTerm] = useState<string>("");
  const [isLedgerDropdownOpen, setIsLedgerDropdownOpen] = useState<boolean>(false);
  const [ledgerHighlightedIndex, setLedgerHighlightedIndex] = useState<number>(0);
  const ledgerComboboxRef = React.useRef<HTMLDivElement>(null);

  const selectedLedgerObj = useMemo(() => {
    return ledgers.find((l) => String(l.id) === String(ledgerId));
  }, [ledgers, ledgerId]);

  // Sync input text when selected ledger ID changes
  useEffect(() => {
    if (selectedLedgerObj) {
      setLedgerSearchTerm(selectedLedgerObj.name);
    } else if (!ledgerId) {
      setLedgerSearchTerm("");
    }
  }, [ledgerId, selectedLedgerObj]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        ledgerComboboxRef.current &&
        !ledgerComboboxRef.current.contains(event.target as Node)
      ) {
        setIsLedgerDropdownOpen(false);
        if (selectedLedgerObj) {
          setLedgerSearchTerm(selectedLedgerObj.name);
        } else {
          setLedgerSearchTerm("");
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectedLedgerObj]);

  // Dynamic filter for ledgers
  const filteredLedgers = useMemo(() => {
    if (!ledgerSearchTerm) return ledgers;

    if (
      selectedLedgerObj &&
      ledgerSearchTerm.trim().toLowerCase() === selectedLedgerObj.name.trim().toLowerCase()
    ) {
      return ledgers;
    }

    const term = ledgerSearchTerm.toLowerCase().trim();
    return ledgers.filter((l) => {
      const nameMatch = l.name ? l.name.toLowerCase().includes(term) : false;
      const aliasMatch = (l as any).alias ? (l as any).alias.toLowerCase().includes(term) : false;
      return nameMatch || aliasMatch;
    });
  }, [ledgers, ledgerSearchTerm, selectedLedgerObj]);

  const handleSelectLedger = (l: Ledger) => {
    setLedgerId(String(l.id));
    setLedgerSearchTerm(l.name);
    setIsLedgerDropdownOpen(false);
    navigate(`/app/reports/ledger/${l.id}`);
  };

  const handleLedgerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isLedgerDropdownOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsLedgerDropdownOpen(true);
        return;
      }
    }

    const totalOptions = filteredLedgers.length;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setLedgerHighlightedIndex((prev) => (prev + 1) % (totalOptions || 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setLedgerHighlightedIndex((prev) => (prev - 1 + totalOptions) % (totalOptions || 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (ledgerHighlightedIndex >= 0 && ledgerHighlightedIndex < filteredLedgers.length) {
        handleSelectLedger(filteredLedgers[ledgerHighlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsLedgerDropdownOpen(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    setShowDownloadDropdown(!showDownloadDropdown);
  };

  const exportToExcel = () => {
    if (!ledgerTransactions || ledgerTransactions.length === 0) return;

    const wsData: any[][] = [];

    // Company Heading
    wsData.push([companyInfo?.name || ""]);
    wsData.push([companyInfo?.address || ""]);
    wsData.push([]);
    
    // Report Title
    wsData.push(["Ledger Report"]);
    wsData.push([`Ledger: ${selectedLedgerData?.name || ""}`]);
    wsData.push([`Address: ${selectedLedgerData?.address || ""}`]);
    wsData.push([`Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`]);
    wsData.push([]);

    // Headers
    wsData.push(["Date", "Particulars", "Vch Type", "Vch No.", "Debit", "Credit"]);

    // Opening Balance
    if (summaryTotals.openingBalance !== 0) {
      let debit = ((summaryTotals.openingBalance > 0 && isDebitLedger) || (summaryTotals.openingBalance < 0 && !isDebitLedger)) ? Math.abs(summaryTotals.openingBalance) : '';
      let credit = ((summaryTotals.openingBalance < 0 && isDebitLedger) || (summaryTotals.openingBalance > 0 && !isDebitLedger)) ? Math.abs(summaryTotals.openingBalance) : '';
      wsData.push(["", "Opening Balance", "", "", debit, credit]);
    }

    // Transactions
    const filteredTxns = ledgerTransactions.filter(t => !t.isOpening && !t.isClosing);
    filteredTxns.forEach(txn => {
      wsData.push([
        formatDate(txn.date),
        ledgerIdNameMap[String(txn.particulars)] || txn.particulars,
        txn.isQuotation ? "Quotation" : txn.voucherType,
        txn.voucherNo,
        txn.debit > 0 ? txn.debit : '',
        txn.credit > 0 ? txn.credit : ''
      ]);
    });

    // Sub Totals
    wsData.push(["", "", "", "", summaryTotals.totalDebit, summaryTotals.totalCredit]);

    // Closing Balance
    if (Math.abs(summaryTotals.totalDebit - summaryTotals.totalCredit) > 0) {
      let debit = summaryTotals.totalCredit > summaryTotals.totalDebit ? Math.abs(summaryTotals.totalDebit - summaryTotals.totalCredit) : '';
      let credit = summaryTotals.totalDebit > summaryTotals.totalCredit ? Math.abs(summaryTotals.totalDebit - summaryTotals.totalCredit) : '';
      wsData.push(["", "Closing Balance", "", "", debit, credit]);
    }

    // Grand Totals
    const grandTotal = Math.max(summaryTotals.totalDebit, summaryTotals.totalCredit);
    wsData.push(["", "", "", "", grandTotal, grandTotal]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger Report");
    XLSX.writeFile(
      wb,
      `Ledger_Report_${selectedLedgerData?.name || "Report"}_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const handleDateRangeChange = (range: string) => {
    setSelectedDateRange(range);
    const today = new Date();
    const currentYear = today.getFullYear();

    switch (range) {
      case "current-month": {
        setFromDate(
          `${currentYear}-${String(today.getMonth() + 1).padStart(2, "0")}-01`
        );
        setToDate(today.toISOString().split("T")[0]);
        break;
      }
      case "previous-month": {
        const prevMonth = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
        const prevYear = today.getMonth() === 0 ? currentYear - 1 : currentYear;
        setFromDate(`${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-01`);
        setToDate(
          `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${new Date(
            prevYear,
            prevMonth + 1,
            0
          ).getDate()}`
        );
        break;
      }

      case "current-year": {
        const startYear = today.getMonth() >= 3 ? currentYear : currentYear - 1;
        setFromDate(`${startYear}-04-01`);
        setToDate(`${startYear + 1}-03-31`);
        break;
      }
      default:
        break;
    }
  };

  const handleQuarterChange = (q: string) => {
    setSelectedQuarter(q);
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;

    switch (q) {
      case "Q1":
        setFromDate(`${fyStartYear}-04-01`);
        setToDate(`${fyStartYear}-06-30`);
        break;
      case "Q2":
        setFromDate(`${fyStartYear}-07-01`);
        setToDate(`${fyStartYear}-09-30`);
        break;
      case "Q3":
        setFromDate(`${fyStartYear}-10-01`);
        setToDate(`${fyStartYear}-12-31`);
        break;
      case "Q4":
        setFromDate(`${fyStartYear + 1}-01-01`);
        setToDate(`${fyStartYear + 1}-03-31`);
        break;
      default:
        break;
    }
  };

  const handleMonthClick = (monthKey: string) => {
    // Determine the year based on the current fromDate
    const currentFromDate = new Date(fromDate);
    const startYear = currentFromDate.getFullYear();
    const startMonth = currentFromDate.getMonth() + 1;

    let year = startYear;
    // If the selected month (e.g., Jan=1) is less than the start month (e.g., Apr=4),
    // it belongs to the next calendar year in the financial period.
    if (parseInt(monthKey) < startMonth) {
      year++;
    }

    const firstDay = `${year}-${monthKey.padStart(2, "0")}-01`;
    const lastDayDate = new Date(year, parseInt(monthKey), 0);
    const lastDay = `${year}-${monthKey.padStart(2, "0")}-${String(
      lastDayDate.getDate()
    ).padStart(2, "0")}`;

    setDailyBreakupMonth(monthKey);
    setDailyBreakupYear(year);
    setViewMode("daily");
  };

  const handleDayClick = (dateStr: string) => {
    setFromDate(dateStr);
    setToDate(dateStr);
    setSelectedDateRange("custom");
    setViewMode("detailed");
  };

  useEffect(() => {
    if (viewMode === "daily") {
      const firstDay = `${dailyBreakupYear}-${dailyBreakupMonth}-01`;
      const lastDayDate = new Date(dailyBreakupYear, parseInt(dailyBreakupMonth), 0);
      const lastDay = `${dailyBreakupYear}-${dailyBreakupMonth}-${String(
        lastDayDate.getDate()
      ).padStart(2, "0")}`;
      setFromDate(firstDay);
      setToDate(lastDay);
      setSelectedDateRange("custom");
    }
  }, [dailyBreakupMonth, dailyBreakupYear, viewMode]);


  useEffect(() => {
    const fetchLedgers = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        const data: Ledger[] = await res.json();

        setLedgers(data);
      } catch (err) {
        console.error("Failed to load ledgers", err);
      }
    };

    fetchLedgers();
  }, []);
  // Fetch when ledger or date range changes
  const ledgerIdNameMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    ledgers.forEach((l) => {
      map[String(l.id)] = l.name;
    });
    return map;
  }, [ledgers]);



  // Derive selectedLedgerData from ledgerId, NOT selectedLedger
  const selectedLedgerData = ledgers.find(
    (l) => Number(l.id) === Number(ledgerId)
  );
  const selectedLedgerGroup = selectedLedgerData
    ? ledgerGroups.find((g) => g.id === selectedLedgerData.groupId)
    : null;

  const isDebitLedger = ledgerData?.ledger?.balance_type === "debit";

  // ledger transactions from API response remain the same
  const ledgerTransactions = useMemo(() => {
    if (!ledgerData) return [];

    let balance = ledgerData.summary.openingBalance || 0;
    const isDebitLedger = ledgerData.ledger?.balance_type === "debit";

    // Normalize transactions: some backends return `amount` + `entry_type` instead of explicit debit/credit.
    const normalized = (ledgerData.transactions || []).map((txn) => {
      let d = Number(txn.debit ?? 0);
      let c = Number(txn.credit ?? 0);

      // Fallback: use amount + entry_type
      const amt = Number(txn.amount ?? 0);
      const entryType = (txn.entry_type || txn.entryType || "").toString().toLowerCase();
      if ((d === 0 && c === 0) && amt && entryType) {
        if (entryType === "debit") d = amt;
        else if (entryType === "credit") c = amt;
      }

      return {
        ...txn,
        debit: d,
        credit: c,
      } as any;
    });

    return normalized.map((txn) => {
      if (isDebitLedger) {
        balance += (txn.debit - txn.credit);
      } else {
        balance += (txn.credit - txn.debit);
      }

      return {
        ...txn,
        runningBalance: balance,
      };
    });
  }, [ledgerData]);

  // filtring and show only one time
  const groupedByVoucher = useMemo<LedgerTransaction[][]>(() => {
    const map: Record<string, LedgerTransaction[]> = {};

    ledgerTransactions.forEach((txn) => {
      const key = `${txn.date}_${txn.voucherNo}_${txn.voucherType}`;
      if (!map[key]) map[key] = [];
      map[key].push(txn);
    });

    return Object.values(map);
  }, [ledgerTransactions]);

  // Use effect to fetch data on ledgerId or filters change
  useEffect(() => {
    if (!ledgerId) return;

    setLoading(true);
    setError(null);

    fetch(
      `${import.meta.env.VITE_API_URL
      }/api/ledger-report/report?ledgerId=${ledgerId}&fromDate=${fromDate}&toDate=${toDate}&includeOpening=${includeOpening}&includeClosing=${includeClosing}`
    )
      .then((res) => res.json())
      .then((data: LedgerApiResponse) => {
        if (data.success) {
          setLedgerData(data);
        } else {
          setError(data.message || "Error loading ledger data");
        }
      })
      .catch((err) => setError(err.message || "Network error"))
      .finally(() => setLoading(false));
  }, [ledgerId, fromDate, toDate, includeOpening, includeClosing]);

  interface MonthlyEntry {
    debit: number;
    credit: number;
    closing: number;
  }

  type MonthlySummary = Record<string, MonthlyEntry>;

  // Group transactions by month for monthly view
  const getMonthlySummary = (transactions: LedgerTransaction[]): MonthlySummary => {
    const monthly: MonthlySummary = {};

    let runningBalance = ledgerData?.summary.openingBalance || 0;
    const isDebitLedger = ledgerData?.ledger?.balance_type === "debit";

    // Date wise sort
    const sorted = [...transactions].sort(
      (a, b) =>
        new Date(a.date).getTime() -
        new Date(b.date).getTime()
    );

    sorted.forEach((txn) => {
      if (txn.isOpening || txn.isClosing) return;

      const month = txn.date.split("-")[1]; // MM

      if (!monthly[month]) {
        monthly[month] = {
          debit: 0,
          credit: 0,
          closing: 0,
        };
      }

      monthly[month].debit += txn.debit;
      monthly[month].credit += txn.credit;

      if (isDebitLedger) {
        runningBalance += (txn.debit - txn.credit);
      } else {
        runningBalance += (txn.credit - txn.debit);
      }

      monthly[month].closing = runningBalance;
    });

    return monthly;
  };



  const monthlySummary = useMemo(() => {
    return getMonthlySummary(ledgerTransactions);
  }, [ledgerTransactions]);
  const summaryTotals = useMemo<{
    openingBalance: number;
    totalDebit: number;
    totalCredit: number;
    closingBalance: number;
    transactionCount: number;
  }>(
    () =>
      ledgerData
        ? ledgerData.summary
        : {
          openingBalance: 0,
          totalDebit: 0,
          totalCredit: 0,
          closingBalance: 0,
          transactionCount: 0,
        },
    [ledgerData]
  );

  const grandTotal = useMemo<{ debit: number; credit: number; closing: number }>(() => {
    let debit = 0;
    let credit = 0;
    let closing = 0;

    Object.values(monthlySummary).forEach((m) => {
      debit += m.debit;
      credit += m.credit;
      closing = m.closing;
    });

    return { debit, credit, closing };
  }, [monthlySummary]);

  const dailySummary = useMemo(() => {
    if (!ledgerData) return [];

    const daysInMonth = new Date(
      dailyBreakupYear,
      parseInt(dailyBreakupMonth),
      0
    ).getDate();

    const daily: { date: string; debit: number; credit: number; balance: number }[] = [];

    // We need the balance up to the beginning of the selected month
    let runningBalance = ledgerData.summary.openingBalance || 0;
    const isDebitLedger = ledgerData.ledger?.balance_type === "debit";

    // Use transactions from ledgerData
    const transactions = ledgerData.transactions || [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${dailyBreakupYear}-${dailyBreakupMonth}-${String(day).padStart(2, "0")}`;

      const dayTxns = transactions.filter((txn) => {
        if (!txn.date) return false;
        // Robust date extraction to YYYY-MM-DD
        const d = new Date(txn.date);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dayNum = String(d.getDate()).padStart(2, "0");
        const tDate = `${y}-${m}-${dayNum}`;
        return tDate === dateStr;
      });

      let dayDebit = 0;
      let dayCredit = 0;

      dayTxns.forEach((txn) => {
        dayDebit += txn.debit;
        dayCredit += txn.credit;
      });

      if (isDebitLedger) {
        runningBalance += dayDebit - dayCredit;
      } else {
        runningBalance += dayCredit - dayDebit;
      }

      daily.push({
        date: dateStr,
        debit: dayDebit,
        credit: dayCredit,
        balance: runningBalance,
      });
    }

    return daily;
  }, [ledgerData, dailyBreakupMonth, dailyBreakupYear]);


  const handleViewVoucher = async (txn: LedgerTransaction) => {
    let id = txn.id;
    const type = txn.voucherType.toLowerCase();

    if (type === "purchase") {
      id = txn.id.startsWith("PUR-") ? txn.id : `PUR-${txn.id}`;
    } else if (type === "sales") {
      id = txn.id.startsWith("SAL-") ? txn.id : `SAL-${txn.id}`;
    } else if (["payment", "receipt", "contra", "journal"].includes(type)) {
      id = txn.id.startsWith("ACC-") ? txn.id : `ACC-${txn.id}`;
    }

    // DN and CN often have prefixes like DN-123-456, so we might need to handle it.
    // Based on backend logic:
    // "DN-" prefixed IDs already include the ID. 
    // If txn.id is "DN-123-456", then id is correct.

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/voucher-detail/${id}?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
      );
      const data = await res.json();

      if (res.ok) {
        if (data) {
          setSelectedVoucher({
            ...data,
            voucherNo: txn.voucherNo || "",
            voucherType: txn.voucherType || "",
            date: txn.date || "",
            amount: data.total || 0,
          });
        }
      } else {
        console.error("Failed to fetch voucher details");
      }
    } catch (err) {
      console.error("Error fetching voucher details", err);
    }
  };

  return (
    <>
    <div className="pt-[56px] px-4 print:hidden">
      <div className="flex items-center mb-6">
        <button
          type="button"
          title="Back to Reports"
          onClick={() => navigate("/app/reports")}
          className={`mr-4 p-2 rounded-full ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
            }`}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">Ledger Report</h1>
        <div className="ml-auto flex space-x-2">
          <button
            title="Toggle Filters"
            type="button"
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
              } ${showFilterPanel ? "bg-blue-100 dark:bg-blue-900" : ""}`}
          >
            <Filter size={18} />
          </button>
          <button
            title="Print Report"
            type="button"
            onClick={handlePrint}
            className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
              }`}
          >
            <Printer size={18} />
          </button>
          <div className="relative">
            <button
              type="button"
              title="Download Report"
              onClick={handleDownload}
              className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
                }`}
            >
              <Download size={18} />
            </button>
            {showDownloadDropdown && (
              <div
                className={`absolute right-0 mt-2 w-48 rounded-md shadow-lg z-10 ${
                  theme === "dark" ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"
                }`}
              >
                <div className="py-1">
                  <button
                    onClick={() => {
                      setShowDownloadDropdown(false);
                      exportToExcel();
                    }}
                    className={`block w-full text-left px-4 py-2 text-sm ${
                      theme === "dark" ? "hover:bg-gray-700 text-gray-200" : "hover:bg-gray-100 text-gray-700"
                    }`}
                  >
                    Download as Excel
                  </button>
                  <button
                    onClick={() => {
                      setShowDownloadDropdown(false);
                      handlePrint();
                    }}
                    className={`block w-full text-left px-4 py-2 text-sm ${
                      theme === "dark" ? "hover:bg-gray-700 text-gray-200" : "hover:bg-gray-100 text-gray-700"
                    }`}
                  >
                    Download as PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showFilterPanel && (
        <div
          className={`p-4 mb-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
            }`}
        >
          <h3 className="font-semibold mb-4">Filters & Options</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div ref={ledgerComboboxRef} className="relative">
              <label className="block text-sm font-medium mb-1">
                Select Ledger
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="selectLedgerInput"
                  name="selectLedgerInput"
                  autoComplete="off"
                  value={ledgerSearchTerm}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLedgerSearchTerm(val);
                    setIsLedgerDropdownOpen(true);
                    setLedgerHighlightedIndex(0);
                    if (!val) {
                      setLedgerId("");
                      navigate(`/app/reports/ledger`);
                    }
                  }}
                  onFocus={() => setIsLedgerDropdownOpen(true)}
                  onClick={() => setIsLedgerDropdownOpen(true)}
                  onKeyDown={handleLedgerKeyDown}
                  placeholder="-- Select or Search Ledger --"
                  className={`w-full p-2 pr-14 rounded border outline-none transition-colors ${
                    theme === "dark"
                      ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                      : "bg-white border-gray-300 text-gray-800 focus:border-blue-500"
                  }`}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-gray-400">
                  {ledgerSearchTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setLedgerSearchTerm("");
                        setLedgerId("");
                        setIsLedgerDropdownOpen(true);
                        navigate(`/app/reports/ledger`);
                      }}
                      className="p-1 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                      title="Clear"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsLedgerDropdownOpen(!isLedgerDropdownOpen)}
                    className="p-1 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    title="Toggle Dropdown"
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${
                        isLedgerDropdownOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Dropdown Menu */}
              {isLedgerDropdownOpen && (
                <div
                  className={`absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border shadow-lg ${
                    theme === "dark"
                      ? "bg-gray-800 border-gray-700 text-gray-100"
                      : "bg-white border-gray-200 text-gray-800"
                  }`}
                >
                  {filteredLedgers.length === 0 ? (
                    <div className="p-3 text-sm opacity-60 text-center">
                      No matching ledgers found
                    </div>
                  ) : (
                    filteredLedgers.map((l, index) => {
                      const isSelected = String(l.id) === String(ledgerId);
                      const isHighlighted = index === ledgerHighlightedIndex;

                      return (
                        <div
                          key={l.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectLedger(l);
                          }}
                          onMouseEnter={() => setLedgerHighlightedIndex(index)}
                          className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between transition-colors ${
                            isSelected
                              ? theme === "dark"
                                ? "bg-blue-950/60 text-blue-400 font-semibold"
                                : "bg-blue-50 text-blue-700 font-semibold"
                              : isHighlighted
                              ? theme === "dark"
                                ? "bg-gray-700 text-white"
                                : "bg-gray-100 text-gray-900"
                              : ""
                          }`}
                        >
                          <span className="font-medium">{l.name}</span>
                          {isSelected && (
                            <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">
                              Selected
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                View Mode
              </label>
              <select
                title="Select View Mode"
                value={viewMode}
                onChange={(e) =>
                  setViewMode(
                    e.target.value as "detailed" | "monthly"
                  )
                }
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600"
                  : "bg-white border-gray-300"
                  }`}
              >
                <option value="detailed">Detailed View</option>
                <option value="monthly">Monthly View</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Date Range
              </label>
              <select
                title="Select Date Range"
                value={selectedDateRange}
                onChange={(e) => {
                  handleDateRangeChange(e.target.value);
                  if (e.target.value !== "quarterly") {
                    setSelectedQuarter("");
                  }
                }}
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600"
                  : "bg-white border-gray-300"
                  }`}
              >
                <option value="current-month">Current Month</option>
                <option value="previous-month">Previous Month</option>
                <option value="quarterly">Quarterly</option>
                <option value="current-year">Current Financial Year</option>
                <option value="custom">Custom Period</option>
              </select>
            </div>
            {selectedDateRange === "quarterly" && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Select Quarter
                </label>
                <select
                  title="Select Quarter"
                  value={selectedQuarter}
                  onChange={(e) => handleQuarterChange(e.target.value)}
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600"
                    : "bg-white border-gray-300"
                    }`}
                >
                  <option value="">Select...</option>
                  <option value="Q1">Apr - Jun</option>
                  <option value="Q2">Jul - Sep</option>
                  <option value="Q3">Oct - Dec</option>
                  <option value="Q4">Jan - Mar</option>
                </select>
              </div>
            )}
            <div className="flex items-center pt-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showClosingBalances}
                  onChange={(e) => setShowClosingBalances(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">Show Closing Balances</span>
              </label>
            </div>
          </div>

          {selectedDateRange === "custom" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  title="From Date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600"
                    : "bg-white border-gray-300"
                    }`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  title="To Date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600"
                    : "bg-white border-gray-300"
                    }`}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {!ledgerId ? (
        <div
          className={`p-8 text-center rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
            }`}
        >
          <Calendar size={48} className="mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium mb-2">Select a Ledger</h3>
          <p className="text-gray-500">
            Choose a ledger from the filter panel to view its report
          </p>
        </div>
      ) : (
        <>
          {/* Ledger Header */}
          <div
            className={`p-4 mb-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
              }`}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center mb-1">
                  <h2 className="text-xl font-bold">
                    {selectedLedgerData?.name}
                  </h2>
                  <button 
                    onClick={() => setIsBillMatchModalOpen(true)}
                    className="ml-12 px-4 py-1.5 text-sm font-semibold bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-md shadow-md hover:shadow-lg hover:from-blue-700 hover:to-purple-700 transition-all flex items-center gap-1.5 border border-purple-400"
                  >
                    <Sparkles size={16} className="animate-pulse" />
                    AI Ledger Match
                  </button>
                </div>
                <p className="text-sm text-gray-500">
                  Address: {selectedLedgerData?.address || "N/A"} | Period:{" "}
                  {formatDate(fromDate)} to {formatDate(toDate)}
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">Opening Balance</div>
                <div
                  className={`text-lg font-bold ${summaryTotals.openingBalance >= 0
                    ? "text-green-600"
                    : "text-red-600"
                    }`}
                >
                  {formatCurrency(Math.abs(summaryTotals.openingBalance))}
                  {summaryTotals.openingBalance > 0
                    ? isDebitLedger ? " Dr" : " Cr"
                    : summaryTotals.openingBalance < 0
                      ? isDebitLedger ? " Cr" : " Dr"
                      : ""}
                </div>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div
              className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
                }`}
            >
              <div className="text-sm text-gray-500">Total Debit</div>
              <div className="text-xl font-bold text-blue-600">
                {formatCurrency(summaryTotals.totalDebit)}
              </div>
            </div>
            <div
              className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
                }`}
            >
              <div className="text-sm text-gray-500">Total Credit</div>
              <div className="text-xl font-bold text-purple-600">
                {formatCurrency(summaryTotals.totalCredit)}
              </div>
            </div>
            <div
              className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
                }`}
            >
              <div className="text-sm text-gray-500">Net Balance</div>
              <div
                className={`text-xl font-bold ${summaryTotals.closingBalance >= 0
                  ? "text-green-600"
                  : "text-red-600"
                  }`}
              >
                {formatCurrency(Math.abs(summaryTotals.closingBalance))}
                {summaryTotals.closingBalance > 0
                  ? isDebitLedger ? " Dr" : " Cr"
                  : summaryTotals.closingBalance < 0
                    ? isDebitLedger ? " Cr" : " Dr"
                    : ""}
              </div>
            </div>
            <div
              className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
                }`}
            >
              <div className="text-sm text-gray-500">Transactions</div>
              <div className="text-xl font-bold text-gray-600">
                {summaryTotals.transactionCount}
              </div>
            </div>
          </div>

          {/* View Mode Tabs */}
          <div className="flex space-x-1 mb-4">
            {["detailed", "monthly", "daily"].map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  if (mode === "monthly" && fromDate === toDate) {
                    handleDateRangeChange("current-year");
                  }
                  setViewMode(mode as "detailed" | "monthly" | "daily")
                }}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium ${viewMode === mode
                  ? theme === "dark"
                    ? "bg-gray-800 text-white"
                    : "bg-white text-blue-600 shadow"
                  : theme === "dark"
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
              >
                {mode === "daily" ? "Daily Breakup" : mode.charAt(0).toUpperCase() + mode.slice(1) + " View"}
              </button>
            ))}
          </div>

          {viewMode === "daily" && (
            <div className={`p-4 mb-4 rounded-lg flex items-center space-x-4 ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"}`}>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium">Month:</label>
                <select
                  value={dailyBreakupMonth}
                  onChange={(e) => setDailyBreakupMonth(e.target.value)}
                  className={`p-2 rounded border ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"}`}
                >
                  {financialMonths.map((m) => (
                    <option key={m.key} value={m.key}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium">Year:</label>
                <select
                  value={dailyBreakupYear}
                  onChange={(e) => setDailyBreakupYear(parseInt(e.target.value))}
                  className={`p-2 rounded border ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"}`}
                >
                  {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Transaction Table */}
          <div
            className={`rounded-lg overflow-hidden ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
              }`}
          >
            {viewMode === "detailed" && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">

                  {/* Header */}
                  <thead
                    className={`${theme === "dark"
                      ? "bg-gray-700 text-gray-200"
                      : "bg-gray-50 text-gray-700"
                      }`}
                  >
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                        Date
                      </th>

                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                        Particulars
                      </th>

                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                        Voucher Type
                      </th>

                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                        Voucher No
                      </th>

                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">
                        Debit
                      </th>

                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">
                        Credit
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">
                        Closing Balance
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>

                  {/* Body */}
                  <tbody>
                    {groupedByVoucher.map((voucherGroup: LedgerTransaction[]) => {
                      const first = voucherGroup[0];

                      const voucherKey = `${first.date}_${first.voucherNo}_${first.voucherType}`;

                      return (
                        <React.Fragment key={voucherKey}>
                          {voucherGroup.map((txn, i) => (
                            <tr
                              key={txn.id}
                              className={`${theme === "dark"
                                ? "hover:bg-gray-700"
                                : "hover:bg-gray-50"
                                } transition`}
                            >
                              {/* Date */}
                              <td className="px-4 py-3 text-sm">{formatDate(txn.date)}</td>

                              {/* Particulars */}
                              <td className="px-4 py-3 text-sm">
                                {ledgerIdNameMap[String(txn.particulars)] || txn.particulars}
                              </td>

                              {/* Voucher Type */}
                              <td className="px-4 py-3 text-sm">{txn.isQuotation ? "Quotation" : txn.voucherType}</td>

                              {/* Voucher No */}
                              <td className="px-4 py-3 text-sm font-mono">{txn.voucherNo}</td>

                              {/* Debit */}
                              <td className="px-4 py-3 text-sm text-right font-mono">
                                {txn.debit > 0
                                  ? formatCurrency(txn.debit)
                                  : ""}
                              </td>

                              {/* Credit */}
                              <td className="px-4 py-3 text-sm text-right font-mono">
                                {txn.credit > 0
                                  ? formatCurrency(txn.credit)
                                  : ""}
                              </td>

                              {/* Closing Balance */}
                              <td className="px-4 py-3 text-sm text-right font-mono font-medium">
                                {formatCurrency(Math.abs(txn.runningBalance || 0))}
                                {(txn.runningBalance || 0) > 0
                                  ? isDebitLedger ? " Dr" : " Cr"
                                  : (txn.runningBalance || 0) < 0
                                    ? isDebitLedger ? " Cr" : " Dr"
                                    : ""}
                              </td>

                              <td className="px-4 py-3 flex items-center justify-center space-x-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewVoucher(first);
                                  }}
                                  className={`p-1 rounded ${theme === "dark"
                                    ? "hover:bg-gray-600"
                                    : "hover:bg-gray-200"
                                    }`}
                                  title="View Details"
                                >
                                  <Eye size={16} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const vType = (txn.isQuotation ? "quotation" : txn.voucherType).toLowerCase().replace(/\s+/g, '-');
                                    const rawId = txn.id.includes('-') ? txn.id.split('-').pop() : txn.id;
                                    navigate(`/app/vouchers/${vType}/edit/${rawId}?returnUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`);
                                  }}
                                  className={`p-1 rounded text-blue-600 ${theme === "dark"
                                    ? "hover:bg-gray-600 text-blue-400"
                                    : "hover:bg-gray-200"
                                    }`}
                                  title="Edit Voucher"
                                >
                                  <Edit size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}

                    {groupedByVoucher.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center border-b border-gray-200 dark:border-gray-700">
                          <p className="text-gray-500 mb-2">
                            No transactions found for the selected period ({formatDate(fromDate)} to {formatDate(toDate)}).
                          </p>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              handleDateRangeChange("current-year");
                            }}
                            className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-sm"
                          >
                            View Current Financial Year
                          </button>
                        </td>
                      </tr>
                    )}
                    
                    {/* ================= Grand Total ================= */}
                    <tr
                      className={`border-t font-semibold ${theme === "dark"
                        ? "bg-gray-700 text-white"
                        : "bg-gray-100 text-gray-800"
                        }`}
                    >
                      <td className="px-4 py-4" colSpan={4}>
                        Grand Total
                      </td>

                      <td className="px-4 py-4 text-right font-mono">
                        {formatCurrency(summaryTotals.totalDebit)}
                      </td>

                      <td className="px-4 py-4 text-right font-mono">
                        {formatCurrency(summaryTotals.totalCredit)}
                      </td>

                      <td className="px-4 py-4 text-right font-mono">
                        {formatCurrency(Math.abs(summaryTotals.closingBalance))}
                        {summaryTotals.closingBalance > 0
                          ? isDebitLedger ? " Dr" : " Cr"
                          : summaryTotals.closingBalance < 0
                            ? isDebitLedger ? " Cr" : " Dr"
                            : ""}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}


            {viewMode === "monthly" && (
              <div className="overflow-x-auto rounded-lg shadow-sm">
                <table className="w-full border-collapse">

                  {/* Header */}
                  <thead
                    className={`${theme === "dark"
                      ? "bg-gray-800 text-gray-200"
                      : "bg-gray-100 text-gray-700"
                      }`}
                  >
                    <tr>
                      <th className="px-4 py-4 text-left text-base font-semibold">
                        Month
                      </th>
                      <th className="px-4 py-4 text-right text-base font-semibold">
                        Debit
                      </th>
                      <th className="px-4 py-4 text-right text-base font-semibold">
                        Credit
                      </th>
                      <th className="px-4 py-4 text-right text-base font-semibold">
                        Closing Balance
                      </th>
                    </tr>
                  </thead>

                  {/* Body */}
                  <tbody>
                    {financialMonths.map((m: { key: string; name: string }) => {
                      const data = monthlySummary[m.key];

                      const hasData =
                        data &&
                        (data.debit !== 0 ||
                          data.credit !== 0 ||
                          data.closing !== 0);

                      return (
                        <tr
                          key={m.key}
                          onClick={() => handleMonthClick(m.key)}
                          className={`cursor-pointer ${theme === "dark"
                            ? "hover:bg-gray-700"
                            : "hover:bg-gray-50"
                            } transition`}
                        >
                          {/* Month */}
                          <td className="px-4 py-3 font-medium text-sm">
                            {m.name}
                          </td>

                          {/* Debit */}
                          <td className="px-4 py-3 text-right text-sm">
                            {hasData && data?.debit
                              ? formatCurrency(data.debit)
                              : ""}
                          </td>

                          {/* Credit */}
                          <td className="px-4 py-3 text-right text-sm">
                            {hasData && data?.credit
                              ? formatCurrency(data.credit)
                              : ""}
                          </td>

                          {/* Closing */}
                          <td
                            className={`px-4 py-3 text-right text-sm font-medium ${hasData && data?.closing >= 0
                              ? "text-green-600"
                              : hasData && data?.closing < 0
                                ? "text-red-600"
                                : ""
                              }`}
                          >
                            {hasData ? (
                              <>
                                {formatCurrency(Math.abs(data.closing))}
                                {data.closing > 0
                                  ? isDebitLedger ? " Dr" : " Cr"
                                  : data.closing < 0
                                    ? isDebitLedger ? " Cr" : " Dr"
                                    : ""}
                              </>
                            ) : ""}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Grand Total */}
                    <tr
                      className={`${theme === "dark"
                        ? "bg-gray-700 text-white"
                        : "bg-gray-200 text-gray-800"
                        } font-semibold`}
                    >
                      <td className="px-4 py-4">
                        Grand Total
                      </td>

                      <td className="px-4 py-4 text-right">
                        {grandTotal.debit
                          ? formatCurrency(grandTotal.debit)
                          : ""}
                      </td>

                      <td className="px-4 py-4 text-right">
                        {grandTotal.credit
                          ? formatCurrency(grandTotal.credit)
                          : ""}
                      </td>

                      <td
                        className={`px-4 py-4 text-right ${grandTotal.closing >= 0
                          ? "text-green-600"
                          : "text-red-600"
                          }`}
                      >
                        {grandTotal.closing !== 0 ? (
                          <>
                            {formatCurrency(Math.abs(grandTotal.closing))}
                            {grandTotal.closing > 0
                              ? isDebitLedger ? " Dr" : " Cr"
                              : grandTotal.closing < 0
                                ? isDebitLedger ? " Cr" : " Dr"
                                : ""}
                          </>
                        ) : formatCurrency(0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {viewMode === "daily" && (
              <div className="overflow-x-auto rounded-lg shadow-sm">
                <table className="w-full border-collapse">
                  <thead className={`${theme === "dark" ? "bg-gray-800 text-gray-200" : "bg-gray-100 text-gray-700"}`}>
                    <tr>
                      <th className="px-4 py-4 text-left text-base font-semibold">Date</th>
                      <th className="px-4 py-4 text-right text-base font-semibold">Debit</th>
                      <th className="px-4 py-4 text-right text-base font-semibold">Credit</th>
                      <th className="px-4 py-4 text-right text-base font-semibold">Closing Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailySummary.map((day, idx) => (
                      <tr
                        key={idx}
                        onClick={() => handleDayClick(day.date)}
                        className={`cursor-pointer ${theme === "dark" ? "hover:bg-gray-700 border-b border-gray-700" : "hover:bg-gray-50 border-b border-gray-100"} transition`}
                      >
                        <td className="px-4 py-3 font-medium text-sm">{formatDate(day.date)}</td>
                        <td className="px-4 py-3 text-right text-sm font-mono">{day.debit > 0 ? formatCurrency(day.debit) : ""}</td>
                        <td className="px-4 py-3 text-right text-sm font-mono">{day.credit > 0 ? formatCurrency(day.credit) : ""}</td>
                        <td className={`px-4 py-3 text-right text-sm font-medium font-mono ${day.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(Math.abs(day.balance))}
                          {day.balance > 0
                            ? isDebitLedger ? " Dr" : " Cr"
                            : day.balance < 0
                              ? isDebitLedger ? " Cr" : " Dr"
                              : ""}
                        </td>
                      </tr>
                    ))}
                    {/* Daily Breakup Total */}
                    <tr className={`${theme === "dark" ? "bg-gray-700 text-white" : "bg-gray-200 text-gray-800"} font-semibold`}>
                      <td className="px-4 py-4">Total for Month</td>
                      <td className="px-4 py-4 text-right font-mono">
                        {formatCurrency(dailySummary.reduce((sum, day) => sum + day.debit, 0))}
                      </td>
                      <td className="px-4 py-4 text-right font-mono">
                        {formatCurrency(dailySummary.reduce((sum, day) => sum + day.credit, 0))}
                      </td>
                      <td className={`px-4 py-4 text-right font-mono ${dailySummary.length > 0 && dailySummary[dailySummary.length - 1].balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {dailySummary.length > 0 && dailySummary[dailySummary.length - 1].balance !== 0 ? (
                          <>
                            {formatCurrency(Math.abs(dailySummary[dailySummary.length - 1].balance))}
                            {dailySummary[dailySummary.length - 1].balance > 0
                              ? isDebitLedger ? " Dr" : " Cr"
                              : dailySummary[dailySummary.length - 1].balance < 0
                                ? isDebitLedger ? " Cr" : " Dr"
                                : ""}
                          </>
                        ) : formatCurrency(0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </>
      )
      }

      {/* Voucher Detail Modal */}
      {selectedVoucher && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4 backdrop-blur-sm bg-black/50">
          <div className={`w-full max-w-4xl max-h-[90vh] rounded-lg overflow-hidden flex flex-col ${theme === "dark" ? "bg-gray-800" : "bg-white"}`}>
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Voucher Details - {selectedVoucher.voucherNo}</h3>
                <button
                  onClick={() => setSelectedVoucher(null)}
                  className={`p-2 text-3xl bg-gray-300 rounded-full ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-500"}`}
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Voucher No</label>
                  <div className="font-mono">{selectedVoucher.voucherNo}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Voucher Type</label>
                  <div className="capitalize">{selectedVoucher.voucherType}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <div>{formatDate(selectedVoucher.date)}</div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Voucher Entries</label>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-100"}`}>
                      <tr>
                        <th className="px-3 py-2 text-left">Item / Ledger</th>
                        <th className="px-3 py-2 text-right">Debit</th>
                        <th className="px-3 py-2 text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVoucher.entries && selectedVoucher.entries.map((entr, idx) => (
                        <tr key={idx} className="border-t border-gray-200 dark:border-gray-600">
                          <td className={`px-3 py-2 ${entr.isChild ? "pl-10 text-gray-600" : ""}`}>
                            {entr.ledgerName || entr.ledger_name}
                            {entr.narration && <div className="text-xs text-gray-400">{entr.narration}</div>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {entr.entry_type === "debit" || (entr.debit > 0) ? formatCurrency(entr.amount || entr.debit || 0) : "-"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {entr.entry_type === "credit" || (entr.credit > 0) ? formatCurrency(entr.amount || entr.credit || 0) : "-"}
                          </td>
                        </tr>
                      ))}
                      {/* Grand Total Row */}
                      {selectedVoucher.entries && selectedVoucher.entries.length > 0 && (
                        <tr className={`border-t-2 font-bold ${theme === "dark" ? "border-gray-500 bg-gray-700/50" : "border-gray-300 bg-gray-50"}`}>
                          <td className="px-3 py-3">
                            Grand Total
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-blue-600 dark:text-blue-400">
                            {formatCurrency(
                              selectedVoucher.entries.reduce((sum: number, entr: any) => 
                                sum + (entr.entry_type === "debit" || (entr.debit > 0) ? Number(entr.amount || entr.debit || 0) : 0)
                              , 0)
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-purple-600 dark:text-purple-400">
                            {formatCurrency(
                              selectedVoucher.entries.reduce((sum: number, entr: any) => 
                                sum + (entr.entry_type === "credit" || (entr.credit > 0) ? Number(entr.amount || entr.credit || 0) : 0)
                              , 0)
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedVoucher.narration && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Narration</label>
                  <div className="text-gray-600 dark:text-gray-400">{selectedVoucher.narration}</div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setSelectedVoucher(null)}
                  className={`px-4 py-2 rounded ${theme === "dark" ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}
                >
                  Close
                </button>

              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={`mt-6 p-4 rounded ${theme === "dark" ? "bg-gray-800" : "bg-blue-50"
          }`}
      >
        <p className="text-sm">
          <span className="font-semibold">Pro Tip:</span> Click on any
          transaction to view voucher details. Use F7 to quickly open ledger, F5
          to refresh.
        </p>
      </div>
    </div>

      {/* Print Only UI */}
      {ledgerId && ledgerData && (
        <div className="hidden print:block w-full text-black bg-white font-sans text-sm print:px-6 print:py-4">
          <style type="text/css" media="print">
            {`
              body { -webkit-print-color-adjust: exact; }
              @page { size: auto; margin: 5mm; }
            `}
          </style>
          <div className="text-center font-bold text-lg leading-tight uppercase mt-4">
            {companyInfo?.name || "M P TRADERS"}
          </div>
          <div className="text-center text-sm leading-tight uppercase whitespace-pre-wrap">
            {companyInfo?.address || ""}
          </div>
          <div className="text-center font-bold mt-4 text-base leading-tight uppercase">
            {ledgerData?.ledger?.name || selectedLedgerData?.name}
          </div>
          <div className="text-center text-sm leading-tight whitespace-pre-wrap uppercase mt-1">
            {[
              ledgerData?.ledger?.address || selectedLedgerData?.address,
              ledgerData?.ledger?.district || selectedLedgerData?.district,
              ledgerData?.ledger?.state || selectedLedgerData?.state,
              ledgerData?.ledger?.pinCode || selectedLedgerData?.pinCode
            ].filter(Boolean).join(", ") || "Ledger Account"}
          </div>
          <div className="text-center text-sm mt-1">
            {formatDate(fromDate)} to {formatDate(toDate)}
          </div>
          <div className="text-right text-xs mt-2">
            Page 1
          </div>

          <table className="w-full mt-1 border-collapse text-sm">
            <thead>
              <tr className="border-t border-b border-black">
                <th className="py-0.5 px-1 text-left font-normal w-24">Date</th>
                <th className="py-0.5 px-1 text-left font-normal">Particulars</th>
                <th className="py-0.5 px-1 text-left font-normal w-32">Vch Type</th>
                <th className="py-0.5 px-1 text-left font-normal w-28">Vch No.</th>
                <th className="py-0.5 px-1 text-right font-bold w-32">Debit</th>
                <th className="py-0.5 px-1 text-right font-bold w-32">Credit</th>
              </tr>
            </thead>
            <tbody>
              {/* Opening Balance */}
              {summaryTotals.openingBalance !== 0 && (
                <tr className="align-top">
                  <td className="py-0.5 px-1"></td>
                  <td className="py-0.5 px-1">
                    <span className="inline-block w-8 font-medium"></span>
                    <span className="font-bold">Opening Balance</span>
                  </td>
                  <td className="py-0.5 px-1"></td>
                  <td className="py-0.5 px-1"></td>
                  <td className="py-0.5 px-1 text-right font-mono">
                    {((summaryTotals.openingBalance > 0 && isDebitLedger) || (summaryTotals.openingBalance < 0 && !isDebitLedger)) 
                      ? new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(Math.abs(summaryTotals.openingBalance)) 
                      : ''}
                  </td>
                  <td className="py-0.5 px-1 text-right font-mono">
                    {((summaryTotals.openingBalance < 0 && isDebitLedger) || (summaryTotals.openingBalance > 0 && !isDebitLedger)) 
                      ? new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(Math.abs(summaryTotals.openingBalance)) 
                      : ''}
                  </td>
                </tr>
              )}

              {/* Transactions */}
              {ledgerTransactions.filter(t => !t.isOpening && !t.isClosing).map((txn, idx) => (
                <tr key={idx} className="align-top">
                  <td className="py-0.5 px-1 whitespace-nowrap">{formatDate(txn.date)}</td>
                  <td className="py-0.5 px-1 align-top">
                    <span className="float-left w-8 font-medium">{txn.debit > 0 ? 'Cr' : 'Dr'}</span>
                    <span className="block ml-8 font-bold">{ledgerIdNameMap[String(txn.particulars)] || txn.particulars}</span>
                  </td>
                  <td className="py-0.5 px-1 uppercase">{txn.isQuotation ? "Quotation" : txn.voucherType}</td>
                  <td className="py-0.5 px-1 whitespace-nowrap">{txn.voucherNo}</td>
                  <td className="py-0.5 px-1 text-right font-mono">
                    {txn.debit > 0 ? new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(txn.debit) : ''}
                  </td>
                  <td className="py-0.5 px-1 text-right font-mono">
                    {txn.credit > 0 ? new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(txn.credit) : ''}
                  </td>
                </tr>
              ))}

              {/* Sub Totals */}
              <tr className="border-t border-black">
                <td colSpan={4}></td>
                <td className="py-0.5 px-1 text-right font-mono">
                  {new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(summaryTotals.totalDebit)}
                </td>
                <td className="py-0.5 px-1 text-right font-mono">
                  {new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(summaryTotals.totalCredit)}
                </td>
              </tr>

              {/* Closing Balance */}
              {Math.abs(summaryTotals.totalDebit - summaryTotals.totalCredit) > 0 && (
                <tr className="align-top">
                  <td colSpan={1}></td>
                  <td colSpan={3} className="py-0.5 px-1">
                    <span className="inline-block w-8 font-medium">
                      {summaryTotals.totalCredit > summaryTotals.totalDebit ? 'Cr' : 'Dr'}
                    </span>
                    <span className="font-bold">Closing Balance</span>
                  </td>
                  <td className="py-0.5 px-1 text-right font-mono">
                    {summaryTotals.totalCredit > summaryTotals.totalDebit 
                      ? new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(Math.abs(summaryTotals.totalDebit - summaryTotals.totalCredit)) 
                      : ''}
                  </td>
                  <td className="py-0.5 px-1 text-right font-mono">
                    {summaryTotals.totalDebit > summaryTotals.totalCredit 
                      ? new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(Math.abs(summaryTotals.totalDebit - summaryTotals.totalCredit)) 
                      : ''}
                  </td>
                </tr>
              )}

              {/* Grand Totals */}
              <tr className="border-t border-b border-black font-bold">
                <td colSpan={4}></td>
                <td className="py-0.5 px-1 text-right font-mono">
                  {new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(Math.max(summaryTotals.totalDebit, summaryTotals.totalCredit))}
                </td>
                <td className="py-0.5 px-1 text-right font-mono">
                  {new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(Math.max(summaryTotals.totalDebit, summaryTotals.totalCredit))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {ledgerData?.transactions && selectedLedgerData && (
        <BillMatchModal
          isOpen={isBillMatchModalOpen}
          onClose={() => setIsBillMatchModalOpen(false)}
          ledgerName={selectedLedgerData.name}
          ledgerTransactions={ledgerData.transactions}
        />
      )}
    </>
  );
};

export default LedgerReport;

