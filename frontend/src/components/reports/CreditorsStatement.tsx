import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAppContext } from "../../context/AppContext";
import { useCompany } from "../../context/CompanyContext";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Printer,
  Download,
  Search,
  Filter,
  ChevronDown,
  Building,
  FileText,
  RefreshCw,
  FileSpreadsheet,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Check,
  Calendar
} from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";

// Creditor Details Interface
export interface CreditorInfo {
  id: string;
  name: string;
  alias?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  gstNumber?: string;
  panNumber?: string;
  creditPeriodDays?: number;
  creditLimit?: number;
  openingBalance: number;
  openingBalanceType: "Cr" | "Dr";
  totalPurchases: number;
  totalPayments: number;
  totalAdjustments: number;
  closingBalance: number;
  closingBalanceType: "Cr" | "Dr";
  isMultiCompanySynced?: boolean;
  linkedCompanyName?: string | null;
  linkedCompanyGst?: string | null;
}

// Statement Entry Interface
export interface StatementTransaction {
  id: string;
  voucherId?: number;
  date: string;
  particulars: string;
  voucherType: "Purchase" | "Payment" | "Debit Note" | "Journal";
  voucherNo: string;
  refNo: string;
  dueDate: string;
  igst?: number;
  cgst?: number;
  sgst?: number;
  debit: number;
  credit: number;
  balance: number;
  balanceType: "Cr" | "Dr";
  narration?: string;
  status: "Paid" | "Partially Paid" | "Unpaid" | "Adjusted";
}

const CreditorsStatement: React.FC = () => {
  const { theme } = useAppContext();
  const { companyInfo } = useCompany();
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  // Loading & Error States
  const [loading, setLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Active Company ID resolution
  const activeCompanyId = useMemo(() => {
    return (
      localStorage.getItem("company_id") ||
      (companyInfo as any)?.id ||
      "1"
    );
  }, [companyInfo]);

  // Creditors list from live backend
  const [creditorsList, setCreditorsList] = useState<CreditorInfo[]>([]);
  const [selectedCreditorId, setSelectedCreditorId] = useState<string>(id || searchParams.get("creditorId") || "");
  const [currentCreditor, setCurrentCreditor] = useState<CreditorInfo | null>(null);

  // Live Statement Data
  const [statementTransactions, setStatementTransactions] = useState<StatementTransaction[]>([]);

  const [statementSummary, setStatementSummary] = useState({
    openingBalance: 0,
    openingBalanceType: "Cr",
    totalPurchases: 0,
    totalPayments: 0,
    totalDebitNotes: 0,
    totalDebits: 0,
    totalCredits: 0,
    totalIgst: 0,
    totalCgst: 0,
    totalSgst: 0,
    closingBalance: 0,
    closingBalanceType: "Cr",
    transactionCount: 0
  });

  // Dropdown combobox state
  const [isCreditorDropdownOpen, setIsCreditorDropdownOpen] = useState(false);
  const [creditorSearchQuery, setCreditorSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Financial Year & Period Filtering (All Records, Quarter, Month)
  const currentMonthNum = new Date().getMonth();
  const currentYearNum = new Date().getFullYear();
  const defaultFyYear = currentMonthNum >= 3 ? currentYearNum : currentYearNum - 1;

  const [fyYear, setFyYear] = useState<number>(defaultFyYear);
  const [selectedQuarter, setSelectedQuarter] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [periodPreset, setPeriodPreset] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const [isQuarterOpen, setIsQuarterOpen] = useState<boolean>(false);
  const [isMonthOpen, setIsMonthOpen] = useState<boolean>(false);
  const quarterRef = useRef<HTMLDivElement>(null);
  const monthRef = useRef<HTMLDivElement>(null);

  // 4 Quarters definition for selected FY
  const quartersList = useMemo(() => {
    const nextYear = fyYear + 1;
    return [
      {
        id: "Q1",
        label: "Q1 (Apr – Jun)",
        monthsLabel: "Apr – Jun",
        from: `${fyYear}-04-01`,
        to: `${fyYear}-06-30`,
      },
      {
        id: "Q2",
        label: "Q2 (Jul – Sep)",
        monthsLabel: "Jul – Sep",
        from: `${fyYear}-07-01`,
        to: `${fyYear}-09-30`,
      },
      {
        id: "Q3",
        label: "Q3 (Oct – Dec)",
        monthsLabel: "Oct – Dec",
        from: `${fyYear}-10-01`,
        to: `${fyYear}-12-31`,
      },
      {
        id: "Q4",
        label: "Q4 (Jan – Mar)",
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

  // Table filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedVoucherType, setSelectedVoucherType] = useState<string>("all");

  const printAreaRef = useRef<HTMLDivElement>(null);
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";

  // Fetch Live Data from Backend
  const fetchStatementData = useCallback(async (forcedCreditorId?: string) => {
    setLoading(true);
    setApiError(null);
    try {
      const cId = forcedCreditorId || selectedCreditorId;
      let url = `${apiUrl}/api/creditors-statement?company_id=${activeCompanyId}`;
      if (fromDate) url += `&fromDate=${fromDate}`;
      if (toDate) url += `&toDate=${toDate}`;
      if (cId) {
        url += `&creditorId=${cId}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "Failed to load statement data");
      }

      const fetchedCreditors: CreditorInfo[] = data.creditors || [];
      setCreditorsList(fetchedCreditors);

      if (data.selectedCreditor) {
        setCurrentCreditor(data.selectedCreditor);
        setSelectedCreditorId(data.selectedCreditor.id);
      } else if (fetchedCreditors.length > 0) {
        setCurrentCreditor(fetchedCreditors[0]);
        setSelectedCreditorId(fetchedCreditors[0].id);
      } else {
        setCurrentCreditor(null);
      }

      setStatementTransactions(data.statementTransactions || []);

      if (data.statementSummary) {
        setStatementSummary(data.statementSummary);
      }
    } catch (err: any) {
      console.error("Error fetching creditors statement:", err);
      setApiError(err.message || "Failed to connect to backend server");
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, fromDate, toDate, selectedCreditorId, apiUrl]);

  // Initial & Dependency Fetch
  useEffect(() => {
    fetchStatementData();
  }, [activeCompanyId, fromDate, toDate]);

  // Sync selected creditor from URL
  useEffect(() => {
    const paramId = id || searchParams.get("creditorId");
    if (paramId && paramId !== selectedCreditorId) {
      setSelectedCreditorId(paramId);
      fetchStatementData(paramId);
    }
  }, [id, searchParams]);

  // Handle outside click for combobox and period popovers
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsCreditorDropdownOpen(false);
      }
      if (quarterRef.current && !quarterRef.current.contains(e.target as Node)) {
        setIsQuarterOpen(false);
      }
      if (monthRef.current && !monthRef.current.contains(e.target as Node)) {
        setIsMonthOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

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

  // All Records handler
  const handleAllRecords = () => {
    setPeriodPreset("all");
    setSelectedQuarter("");
    setSelectedMonth("");
    setFromDate("");
    setToDate("");
    setIsQuarterOpen(false);
    setIsMonthOpen(false);
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
      const target = mDefs[selectedMonth];
      if (target) {
        const lastDay = new Date(target.yr, target.mNum, 0).getDate();
        const mm = String(target.mNum).padStart(2, "0");
        const dd = String(lastDay).padStart(2, "0");
        setFromDate(`${target.yr}-${mm}-01`);
        setToDate(`${target.yr}-${mm}-${dd}`);
      }
    }
  };

  // Switch Creditor handler
  const handleSelectCreditor = (cred: CreditorInfo) => {
    setSelectedCreditorId(cred.id);
    setCurrentCreditor(cred);
    setIsCreditorDropdownOpen(false);
    setCreditorSearchQuery("");
    setSearchParams({ creditorId: cred.id });
    fetchStatementData(cred.id);
  };

  // Filtered transactions by voucher type and search keyword
  const filteredTransactions = useMemo(() => {
    return statementTransactions.filter((tx) => {
      // Voucher filter
      if (selectedVoucherType !== "all" && tx.voucherType !== selectedVoucherType) {
        return false;
      }

      // Search keyword
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesParticulars = (tx.particulars || "").toLowerCase().includes(q);
        const matchesVoucher = (tx.voucherNo || "").toLowerCase().includes(q);
        const matchesRef = (tx.refNo || "").toLowerCase().includes(q);
        const matchesNarration = (tx.narration || "").toLowerCase().includes(q);
        if (!matchesParticulars && !matchesVoucher && !matchesRef && !matchesNarration) {
          return false;
        }
      }

      return true;
    });
  }, [statementTransactions, selectedVoucherType, searchTerm]);

  // Currency Formatter
  const formatINR = (val: number | undefined) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    }).format(Number(val) || 0);
  };

  // Print Handler
  const handlePrint = () => {
    window.print();
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (!currentCreditor) return;
    try {
      const rows: any[] = [];

      // Company and Party header lines
      rows.push(["CREDITORS STATEMENT OF ACCOUNT"]);
      rows.push([
        `Company: ${companyInfo?.name || "Company"}`,
        `GSTIN: ${companyInfo?.gstin || "-"}`
      ]);
      rows.push([
        `Creditor / Supplier: ${currentCreditor.name}`,
        `GSTIN: ${currentCreditor.gstNumber || "-"}`
      ]);
      rows.push([
        `Period: ${fromDate && toDate ? `${fromDate} to ${toDate}` : "All Records"}`,
        `Printed On: ${new Date().toLocaleDateString("en-IN")}`
      ]);
      rows.push([]);

      // Table Header
      rows.push([
        "Date",
        "Particulars",
        "Voucher Type",
        "Voucher No",
        "Ref / Bill No",
        "Due Date",
        "IGST (₹)",
        "CGST (₹)",
        "SGST (₹)",
        "Debit (₹)",
        "Credit (₹)",
        "Balance (₹)",
        "Type",
        "Narration"
      ]);

      // Transaction Rows
      filteredTransactions.forEach((tx) => {
        rows.push([
          tx.date,
          tx.particulars,
          tx.voucherType,
          tx.voucherNo,
          tx.refNo,
          tx.dueDate,
          tx.igst || 0,
          tx.cgst || 0,
          tx.sgst || 0,
          tx.debit,
          tx.credit,
          tx.balance,
          tx.balanceType,
          tx.narration || ""
        ]);
      });

      // Closing Total Row
      rows.push([]);
      rows.push([
        toDate || new Date().toISOString().split("T")[0],
        "Closing Balance c/d",
        "Totals",
        "",
        "",
        "",
        statementSummary.totalIgst || 0,
        statementSummary.totalCgst || 0,
        statementSummary.totalSgst || 0,
        statementSummary.totalDebits,
        statementSummary.totalCredits,
        statementSummary.closingBalance,
        statementSummary.closingBalanceType,
        "Net Outstanding Payable"
      ]);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Creditors_Statement");

      const cleanName = currentCreditor.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 25);
      XLSX.writeFile(wb, `Creditors_Statement_${cleanName}_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (err) {
      console.error("Excel export error:", err);
      alert("Failed to export Excel file.");
    }
  };

  // Export to PDF
  const handleExportPDF = async () => {
    if (!printAreaRef.current || !currentCreditor) return;
    try {
      const element = printAreaRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff"
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const cleanName = currentCreditor.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 25);
      pdf.save(`Creditors_Statement_${cleanName}.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
      alert("Failed to generate PDF.");
    }
  };

  // Filtered Creditors for Dropdown Search
  const filteredDropdownCreditors = useMemo(() => {
    if (!creditorSearchQuery.trim()) return creditorsList;
    const q = creditorSearchQuery.toLowerCase();
    return creditorsList.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.alias && c.alias.toLowerCase().includes(q)) ||
        (c.gstNumber && c.gstNumber.toLowerCase().includes(q)) ||
        (c.city && c.city.toLowerCase().includes(q))
    );
  }, [creditorsList, creditorSearchQuery]);

  return (
    <div
      className={`min-h-[calc(100vh-64px)] pt-[56px] px-4 pb-12 transition-colors ${
        theme === "dark" ? "bg-gray-900 text-gray-100" : "bg-gray-50 text-gray-800"
      }`}
    >
      {/* Print-specific style block */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #creditors-statement-print-area, #creditors-statement-print-area * {
            visibility: visible !important;
          }
          #creditors-statement-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 16px !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* 🧭 Top Navigation & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pt-2 border-b border-gray-200 dark:border-gray-800 pb-4 no-print">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/app/reports")}
            title="Back to Reports"
            className={`p-2.5 rounded-lg border transition-all ${
              theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700 hover:border-gray-600"
                : "bg-white hover:bg-gray-100 text-gray-700 border-gray-200 shadow-sm"
            }`}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Creditors Statement</h1>
            <p className={`text-xs mt-0.5 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
              Detailed Supplier Statement of Account & Transaction Ledger
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Refresh Action */}
          <button
            onClick={() => fetchStatementData()}
            disabled={loading}
            title="Refresh Data"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
              theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700"
                : "bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm"
            }`}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Export & Print actions */}
          <button
            onClick={handlePrint}
            title="Print Statement (Ctrl+P)"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
              theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700"
                : "bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm"
            }`}
          >
            <Printer size={15} />
            <span className="hidden sm:inline">Print</span>
          </button>

          <button
            onClick={handleExportExcel}
            title="Export Excel (.xlsx)"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
              theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700 text-emerald-400 border-gray-700"
                : "bg-white hover:bg-gray-50 text-emerald-700 border-gray-200 shadow-sm"
            }`}
          >
            <FileSpreadsheet size={15} />
            <span className="hidden sm:inline">Excel</span>
          </button>

          <button
            onClick={handleExportPDF}
            title="Download PDF"
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow transition-colors"
          >
            <Download size={15} />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* API Error Notification */}
      {apiError && (
        <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 dark:bg-rose-950/70 dark:border-rose-700 dark:text-rose-200 text-xs flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span>{apiError}</span>
          </div>
          <button onClick={() => fetchStatementData()} className="px-2 py-1 rounded bg-rose-200 text-rose-800 hover:bg-rose-300 text-[11px] font-semibold">
            Retry
          </button>
        </div>
      )}

      {/* 🔍 Global Controls Bar: Creditor Selector & Period Filters */}
      <div
        className={`p-4 rounded-xl border mb-6 no-print ${
          theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          {/* Left: Creditor Selector (Combobox) */}
          <div className="w-full lg:max-w-md relative" ref={dropdownRef}>
            <label className={`block text-xs font-medium mb-1.5 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
              Select Creditor / Supplier:
            </label>
            <button
              type="button"
              onClick={() => setIsCreditorDropdownOpen(!isCreditorDropdownOpen)}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg border text-left transition-all ${
                theme === "dark"
                  ? "bg-gray-700 border-gray-600 text-white hover:border-gray-500"
                  : "bg-white border-gray-300 text-gray-900 hover:border-blue-400 shadow-sm"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <Building size={16} className="text-blue-500 shrink-0" />
                <div className="truncate">
                  {currentCreditor ? (
                    <>
                      <div className="font-semibold truncate">{currentCreditor.name}</div>
                      <span className={`text-xs block ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                        GSTIN: {currentCreditor.gstNumber || "N/A"} {currentCreditor.city ? `• ${currentCreditor.city}` : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-400">No creditors found for this company</span>
                  )}
                </div>
              </div>
              <ChevronDown size={16} className={`shrink-0 transition-transform ${isCreditorDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown Menu */}
            {isCreditorDropdownOpen && (
              <div
                className={`absolute left-0 right-0 mt-1 z-50 rounded-lg border shadow-xl max-h-80 overflow-y-auto ${
                  theme === "dark" ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-900"
                }`}
              >
                <div className="p-2 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-inherit">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search vendor name, GSTIN, city..."
                      value={creditorSearchQuery}
                      onChange={(e) => setCreditorSearchQuery(e.target.value)}
                      className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-md border focus:outline-none ${
                        theme === "dark"
                          ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                          : "bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500"
                      }`}
                      autoFocus
                    />
                  </div>
                </div>

                <div className="py-1">
                  {filteredDropdownCreditors.map((cred) => {
                    const isSelected = cred.id === currentCreditor?.id;
                    return (
                      <button
                        key={cred.id}
                        onClick={() => handleSelectCreditor(cred)}
                        className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition-colors ${
                          isSelected
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-semibold"
                            : theme === "dark"
                            ? "hover:bg-gray-700 text-gray-200"
                            : "hover:bg-gray-100 text-gray-800"
                        }`}
                      >
                        <div className="truncate mr-2">
                          <p className="font-medium truncate">{cred.name}</p>
                          <p className={`text-[11px] ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                            GST: {cred.gstNumber || "Unregistered"} {cred.city ? `| ${cred.city}` : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                            {formatINR(cred.closingBalance)} {cred.closingBalanceType}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {filteredDropdownCreditors.length === 0 && (
                    <div className="p-4 text-center text-xs text-gray-500">
                      No matching creditors found.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: Period Filtering (All Records, Quarter, Month) + From/To Date Pickers */}
          <div className="flex flex-wrap items-end gap-3">
            {/* Period Filter Buttons */}
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                Period:
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {/* 1. All Records Button */}
                <button
                  type="button"
                  onClick={handleAllRecords}
                  className={`px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                    periodPreset === "all"
                      ? "bg-blue-600 text-white shadow-sm"
                      : theme === "dark"
                      ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  }`}
                >
                  All Records
                </button>

                {/* 2. Quarter Dropdown */}
                <div className="relative" ref={quarterRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsQuarterOpen((prev) => !prev);
                      setIsMonthOpen(false);
                    }}
                    className={`px-3 py-2 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                      periodPreset.startsWith("quarter-")
                        ? "bg-blue-600 text-white shadow-sm"
                        : theme === "dark"
                        ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    }`}
                  >
                    <span>
                      {selectedQuarter ? `Quarter: ${selectedQuarter}` : "Quarter"}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${
                        isQuarterOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isQuarterOpen && (
                    <div
                      className={`absolute left-0 lg:right-0 lg:left-auto top-full mt-1.5 w-64 rounded-xl shadow-xl border p-2.5 z-40 animate-in fade-in-50 zoom-in-95 ${
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
                            <ChevronLeft size={12} />
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
                            <ChevronRight size={12} />
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
                                  ? "bg-blue-600 text-white shadow-sm"
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

                {/* 3. Month Dropdown */}
                <div className="relative" ref={monthRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMonthOpen((prev) => !prev);
                      setIsQuarterOpen(false);
                    }}
                    className={`px-3 py-2 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                      periodPreset.startsWith("month-")
                        ? "bg-blue-600 text-white shadow-sm"
                        : theme === "dark"
                        ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    }`}
                  >
                    <span>
                      {selectedMonth ? `Month: ${selectedMonth}` : "Month"}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${
                        isMonthOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isMonthOpen && (
                    <div
                      className={`absolute left-0 lg:right-0 lg:left-auto top-full mt-1.5 w-72 rounded-xl shadow-xl border p-2.5 z-40 animate-in fade-in-50 zoom-in-95 ${
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
                            <ChevronLeft size={12} />
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
                            <ChevronRight size={12} />
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
                                  ? "bg-blue-600 text-white shadow-sm font-bold"
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
            </div>

            {/* From Date & To Date pickers */}
            <div className="flex items-center gap-2">
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                  From Date:
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setSelectedQuarter("");
                    setSelectedMonth("");
                    setPeriodPreset("custom");
                  }}
                  className={`w-36 px-2.5 py-1.5 text-xs rounded-lg border focus:outline-none ${
                    theme === "dark"
                      ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                      : "bg-white border-gray-300 text-gray-800 focus:border-blue-500"
                  }`}
                />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                  To Date:
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setSelectedQuarter("");
                    setSelectedMonth("");
                    setPeriodPreset("custom");
                  }}
                  className={`w-36 px-2.5 py-1.5 text-xs rounded-lg border focus:outline-none ${
                    theme === "dark"
                      ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                      : "bg-white border-gray-300 text-gray-800 focus:border-blue-500"
                  }`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          STATEMENT OF ACCOUNT (Detailed Ledger Statement)
      ========================================================================= */}
      <div
        ref={printAreaRef}
        id="creditors-statement-print-area"
        className={`rounded-xl border p-6 transition-all ${
          theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
        }`}
      >
        {/* Printable Header: Company & Supplier Info */}
        <div className="border-b border-gray-200 dark:border-gray-700 pb-6 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            {/* Left: Company Details */}
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400">
                Business Entity
              </span>
              <h2 className="text-xl font-bold tracking-tight mt-0.5">
                {companyInfo?.name || "Company"}
              </h2>
              <div className={`text-xs mt-1 space-y-0.5 ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}>
                <p>{companyInfo?.address || "Registered Business Address"}</p>
                <p>
                  <span className="font-medium">GSTIN:</span> {companyInfo?.gstin || "N/A"} &bull;{" "}
                  <span className="font-medium">State:</span> {companyInfo?.state || "India"}
                </p>
                <p>
                  <span className="font-medium">Email:</span> {companyInfo?.email || "-"} &bull;{" "}
                  <span className="font-medium">Phone:</span> {companyInfo?.phone_number || "-"}
                </p>
              </div>
            </div>

            {/* Right: Creditor Details */}
            {currentCreditor ? (
              <div
                className={`p-3.5 rounded-lg border text-right sm:max-w-xs ${
                  theme === "dark" ? "bg-gray-750 border-gray-700" : "bg-gray-50 border-gray-200"
                }`}
              >
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400 block">
                  Creditor / Supplier
                </span>
                <h3 className="text-sm font-bold truncate mt-0.5">{currentCreditor.name}</h3>
                <div className={`text-[11px] mt-1 space-y-0.5 ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}>
                  <p className="truncate">{currentCreditor.address || "-"}</p>
                  <p>
                    <span className="font-medium">GSTIN:</span> {currentCreditor.gstNumber || "-"}
                  </p>
                  {currentCreditor.contactPerson && (
                    <p>
                      <span className="font-medium">Contact:</span> {currentCreditor.contactPerson}{" "}
                      {currentCreditor.phone ? `(${currentCreditor.phone})` : ""}
                    </p>
                  )}
                  {currentCreditor.creditPeriodDays ? (
                    <p>
                      <span className="font-medium">Terms:</span> {currentCreditor.creditPeriodDays} Days Credit
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="p-3 text-xs text-gray-400">No Creditor Selected</div>
            )}
          </div>

          {/* Statement Metadata Bar */}
          <div className="mt-4 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-blue-600 dark:text-blue-400">STATEMENT OF ACCOUNT</span>
              <span className="text-gray-400">&bull;</span>
              <span className={theme === "dark" ? "text-gray-300" : "text-gray-600"}>
                Period:{" "}
                {fromDate && toDate ? (
                  <>
                    <span className="font-semibold">{fromDate}</span> to{" "}
                    <span className="font-semibold">{toDate}</span>
                  </>
                ) : fromDate ? (
                  <>
                    From <span className="font-semibold">{fromDate}</span>
                  </>
                ) : toDate ? (
                  <>
                    Up to <span className="font-semibold">{toDate}</span>
                  </>
                ) : (
                  <span className="font-semibold">All Records</span>
                )}
              </span>
            </div>
            <div className={theme === "dark" ? "text-gray-400" : "text-gray-500"}>
              All amounts in Indian Rupees (INR)
            </div>
          </div>
        </div>

        {/* Table Filters (Search & Voucher Type) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 no-print">
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search transaction, bill no, voucher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none ${
                theme === "dark"
                  ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                  : "bg-white border-gray-300 text-gray-800 focus:border-blue-500"
              }`}
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={14} className="text-gray-400" />
            <select
              value={selectedVoucherType}
              onChange={(e) => setSelectedVoucherType(e.target.value)}
              className={`px-3 py-1.5 text-xs rounded-lg border focus:outline-none ${
                theme === "dark"
                  ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                  : "bg-white border-gray-300 text-gray-800 focus:border-blue-500"
              }`}
            >
              <option value="all">All Voucher Types</option>
              <option value="Purchase">Purchases (Cr)</option>
              <option value="Payment">Payments (Dr)</option>
              <option value="Debit Note">Debit Notes (Dr)</option>
              <option value="Journal">Journal Adjustments</option>
            </select>
          </div>
        </div>

        {/* Statement Transaction Table */}
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="w-full text-xs text-left">
            <thead
              className={`uppercase tracking-wider font-semibold border-b ${
                theme === "dark"
                  ? "bg-gray-750 text-gray-300 border-gray-700"
                  : "bg-gray-100 text-gray-700 border-gray-300"
              }`}
            >
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Particulars / Account Head</th>
                <th className="py-2.5 px-3">Vch Type</th>
                <th className="py-2.5 px-3">Vch No.</th>
                <th className="py-2.5 px-3">Ref / Inv No.</th>
                <th className="py-2.5 px-3">Due Date</th>
                <th className="py-2.5 px-3 text-right">IGST (₹)</th>
                <th className="py-2.5 px-3 text-right">CGST (₹)</th>
                <th className="py-2.5 px-3 text-right">SGST (₹)</th>
                <th className="py-2.5 px-3 text-right">Debit (₹)</th>
                <th className="py-2.5 px-3 text-right">Credit (₹)</th>
                <th className="py-2.5 px-3 text-right">Balance (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {/* Live Transaction Rows */}
              {filteredTransactions.map((tx) => {
                let badgeColor =
                  tx.voucherType === "Purchase"
                    ? "bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300"
                    : tx.voucherType === "Payment"
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                    : tx.voucherType === "Debit Note"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                    : "bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300";

                return (
                  <tr
                    key={tx.id}
                    className="hover:bg-gray-50/70 dark:hover:bg-gray-750/70 transition-colors"
                  >
                    <td className="py-2.5 px-3 whitespace-nowrap text-gray-600 dark:text-gray-300 font-mono">
                      {tx.date}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{tx.particulars}</div>
                      {tx.narration && (
                        <div className={`text-[11px] italic mt-0.5 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                          Narration: {tx.narration}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded ${badgeColor}`}>
                        {tx.voucherType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {tx.voucherNo}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-gray-500 whitespace-nowrap">
                      {tx.refNo || "-"}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-gray-500">
                      {tx.dueDate}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-gray-700 dark:text-gray-300">
                      {(tx.igst || 0) > 0 ? formatINR(tx.igst) : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-gray-700 dark:text-gray-300">
                      {(tx.cgst || 0) > 0 ? formatINR(tx.cgst) : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-gray-700 dark:text-gray-300">
                      {(tx.sgst || 0) > 0 ? formatINR(tx.sgst) : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                      {tx.debit > 0 ? formatINR(tx.debit) : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-indigo-600 dark:text-indigo-400">
                      {tx.credit > 0 ? formatINR(tx.credit) : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold whitespace-nowrap">
                      {formatINR(tx.balance)}{" "}
                      <span
                        className={`text-[10px] ${
                          tx.balanceType === "Cr" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600"
                        }`}
                      >
                        {tx.balanceType}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {filteredTransactions.length === 0 && !loading && (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-gray-500">
                    <div className="max-w-md mx-auto space-y-2">
                      <FileText size={28} className="mx-auto text-gray-400 opacity-60" />
                      <p className="font-semibold text-gray-700 dark:text-gray-300">
                        No transactions found for the selected period.
                      </p>
                      <p className="text-xs text-gray-400">
                        Try selecting a different date range or creditor account.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>

            {/* Total & Closing Summary Footer */}
            <tfoot
              className={`font-semibold border-t-2 ${
                theme === "dark"
                  ? "bg-gray-750 text-gray-200 border-gray-600"
                  : "bg-gray-100 text-gray-900 border-gray-300"
              }`}
            >
              <tr>
                <td colSpan={6} className="py-3 px-3 text-right uppercase tracking-wider text-xs">
                  Period Totals:
                </td>
                <td className="py-3 px-3 text-right text-gray-700 dark:text-gray-300">
                  {statementSummary.totalIgst > 0 ? formatINR(statementSummary.totalIgst) : "-"}
                </td>
                <td className="py-3 px-3 text-right text-gray-700 dark:text-gray-300">
                  {statementSummary.totalCgst > 0 ? formatINR(statementSummary.totalCgst) : "-"}
                </td>
                <td className="py-3 px-3 text-right text-gray-700 dark:text-gray-300">
                  {statementSummary.totalSgst > 0 ? formatINR(statementSummary.totalSgst) : "-"}
                </td>
                <td className="py-3 px-3 text-right text-emerald-600 dark:text-emerald-400">
                  {formatINR(statementSummary.totalDebits)}
                </td>
                <td className="py-3 px-3 text-right text-indigo-600 dark:text-indigo-400">
                  {formatINR(statementSummary.totalCredits)}
                </td>
                <td className="py-3 px-3 text-right text-gray-400">-</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CreditorsStatement;
