import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAppContext } from "../../context/AppContext";
import { useCompany } from "../../context/CompanyContext";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Printer,
  Download,
  Search,
  Filter,
  Calendar,
  ChevronDown,
  Building,
  User,
  Phone,
  Mail,
  FileText,
  Clock,
  AlertTriangle,
  RefreshCw,
  Share2,
  CheckCircle2,
  IndianRupee,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  TrendingUp,
  FileSpreadsheet
} from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import type { Ledger } from "../../types";

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
}

// Statement Entry Interface
export interface StatementTransaction {
  id: string;
  date: string;
  particulars: string;
  voucherType: "Purchase" | "Payment" | "Debit Note" | "Journal";
  voucherNo: string;
  refNo: string;
  dueDate: string;
  debit: number; // Payment / Return (Dr)
  credit: number; // Purchase / Bill (Cr)
  balance: number; // Running balance
  balanceType: "Cr" | "Dr";
  narration?: string;
  status: "Paid" | "Partially Paid" | "Unpaid" | "Adjusted";
}

// Pending Bill Interface for Ageing
export interface PendingBill {
  billNo: string;
  billDate: string;
  dueDate: string;
  originalAmount: number;
  pendingAmount: number;
  daysOverdue: number;
  ageBracket: "0-30" | "31-60" | "61-90" | "90+";
}

// Comprehensive realistic initial suppliers/creditors
const DEFAULT_CREDITORS: CreditorInfo[] = [
  {
    id: "cred-1",
    name: "ABC Suppliers & Industrial Spares Pvt Ltd",
    alias: "ABC Supplies",
    contactPerson: "Rajesh Sharma",
    phone: "+91 98201 44521",
    email: "accounts@abcsuppliers.com",
    address: "Plot 42, MIDC Industrial Area, Andheri East",
    city: "Mumbai",
    state: "Maharashtra (27)",
    gstNumber: "27AABCA1234F1Z5",
    panNumber: "AABCA1234F",
    creditPeriodDays: 30,
    creditLimit: 500000,
    openingBalance: 45000,
    openingBalanceType: "Cr"
  },
  {
    id: "cred-2",
    name: "National Steel & Hardware Mart",
    alias: "National Steel",
    contactPerson: "Virender Mohan",
    phone: "+91 98110 99882",
    email: "billing@nationalsteel.in",
    address: "Shop 12-14, Iron Market, Loha Mandi, Naraina",
    city: "New Delhi",
    state: "Delhi (07)",
    gstNumber: "07AABCN5678Q1ZD",
    panNumber: "AABCN5678Q",
    creditPeriodDays: 45,
    creditLimit: 750000,
    openingBalance: 125000,
    openingBalanceType: "Cr"
  },
  {
    id: "cred-3",
    name: "Apex Technologies & Electronic Parts",
    alias: "Apex Tech",
    contactPerson: "Kavita Rao",
    phone: "+91 94480 33210",
    email: "sales@apextechnologies.biz",
    address: "Phase 2, Electronic City, Hosur Road",
    city: "Bengaluru",
    state: "Karnataka (29)",
    gstNumber: "29AABCA9012K1ZG",
    panNumber: "AABCA9012K",
    creditPeriodDays: 30,
    creditLimit: 400000,
    openingBalance: 28500,
    openingBalanceType: "Cr"
  },
  {
    id: "cred-4",
    name: "Supreme Packaging & Corrugated Boxes",
    alias: "Supreme Pack",
    contactPerson: "Amit Patel",
    phone: "+91 98250 88761",
    email: "finance@supremepack.co.in",
    address: "Block B-18, GIDC Industrial Estate, Vatva",
    city: "Ahmedabad",
    state: "Gujarat (24)",
    gstNumber: "24AABCS4321P1ZM",
    panNumber: "AABCS4321P",
    creditPeriodDays: 21,
    creditLimit: 300000,
    openingBalance: 18000,
    openingBalanceType: "Cr"
  },
  {
    id: "cred-5",
    name: "Prime Logistics & Office Supplies",
    alias: "Prime Logistics",
    contactPerson: "Debanjan Sen",
    phone: "+91 98300 77123",
    email: "helpdesk@primelogistics.org",
    address: "15 Brabourne Road, Dalhousie Area",
    city: "Kolkata",
    state: "West Bengal (19)",
    gstNumber: "19AABCP8765M1ZR",
    panNumber: "AABCP8765M",
    creditPeriodDays: 15,
    creditLimit: 200000,
    openingBalance: 9200,
    openingBalanceType: "Cr"
  }
];

// Mock Transaction generator for any creditor
const generateCreditorTransactions = (creditor: CreditorInfo): StatementTransaction[] => {
  const transactions: StatementTransaction[] = [];
  let currentBalance = creditor.openingBalance;

  // Standard transaction templates per creditor
  const baseEntries = [
    {
      date: "2025-04-08",
      voucherType: "Purchase" as const,
      voucherNo: `PUR/25-26/014`,
      refNo: `INV-${creditor.name.slice(0, 3).toUpperCase()}-1042`,
      particulars: "To Purchase A/c (Raw Materials Batch A)",
      credit: 68500,
      debit: 0,
      dueDate: "2025-05-08",
      narration: "Material received in good condition against PO #108"
    },
    {
      date: "2025-04-25",
      voucherType: "Payment" as const,
      voucherNo: `PAY/25-26/009`,
      refNo: `NEFT/HDFC/98371`,
      particulars: "By Bank Payment (HDFC Current A/c - RTGS)",
      credit: 0,
      debit: 45000,
      dueDate: "-",
      narration: "Cleared Opening Balance settlement via RTGS"
    },
    {
      date: "2025-05-12",
      voucherType: "Purchase" as const,
      voucherNo: `PUR/25-26/048`,
      refNo: `INV-${creditor.name.slice(0, 3).toUpperCase()}-1189`,
      particulars: "To Purchase A/c (Spare Parts & Assemblies)",
      credit: 92400,
      debit: 0,
      dueDate: "2025-06-11",
      narration: "Consignment dispatched via Safexpress"
    },
    {
      date: "2025-05-20",
      voucherType: "Debit Note" as const,
      voucherNo: `DN/25-26/003`,
      refNo: `DN-REF-201`,
      particulars: "By Debit Note (Goods Return - Damaged during transit)",
      credit: 0,
      debit: 7400,
      dueDate: "-",
      narration: "3 boxes returned with inspection report"
    },
    {
      date: "2025-06-05",
      voucherType: "Payment" as const,
      voucherNo: `PAY/25-26/032`,
      refNo: `CHQ-449102`,
      particulars: "By Bank Payment (ICICI Current A/c - Cheque #449102)",
      credit: 0,
      debit: 61100,
      dueDate: "-",
      narration: "Payment towards Bill INV-1042 balance adjusted"
    },
    {
      date: "2025-07-15",
      voucherType: "Purchase" as const,
      voucherNo: `PUR/25-26/092`,
      refNo: `INV-${creditor.name.slice(0, 3).toUpperCase()}-1344`,
      particulars: "To Purchase A/c (Quarterly Stock Replenishment)",
      credit: 115000,
      debit: 0,
      dueDate: "2025-08-14",
      narration: "GST invoice uploaded to GSTR-2B"
    },
    {
      date: "2025-08-18",
      voucherType: "Payment" as const,
      voucherNo: `PAY/25-26/068`,
      refNo: `IMPS/09218209`,
      particulars: "By Bank Payment (State Bank of India - IMPS)",
      credit: 0,
      debit: 85000,
      dueDate: "-",
      narration: "Part payment towards Invoice #1189"
    },
    {
      date: "2025-09-02",
      voucherType: "Journal" as const,
      voucherNo: `JRN/25-26/011`,
      refNo: `JV-ADJ-09`,
      particulars: "By Discount Received / Rate Difference Adjustment",
      credit: 0,
      debit: 2500,
      dueDate: "-",
      narration: "Volume discount credited per annual agreement"
    },
    {
      date: "2025-10-10",
      voucherType: "Purchase" as const,
      voucherNo: `PUR/25-26/138`,
      refNo: `INV-${creditor.name.slice(0, 3).toUpperCase()}-1520`,
      particulars: "To Purchase A/c (Special Festive Batch Deliveries)",
      credit: 78900,
      debit: 0,
      dueDate: "2025-11-09",
      narration: "Supplied against PO 188 with E-Way Bill 44102981"
    }
  ];

  baseEntries.forEach((item, index) => {
    // In Sundry Creditors ledger (Liability):
    // Credit increases liability (balance goes up Cr)
    // Debit decreases liability (balance goes down Cr)
    currentBalance = currentBalance + item.credit - item.debit;
    const isCr = currentBalance >= 0;

    let status: StatementTransaction["status"] = "Unpaid";
    if (item.voucherType === "Payment") status = "Paid";
    else if (item.voucherType === "Debit Note" || item.voucherType === "Journal") status = "Adjusted";
    else if (index < 2) status = "Paid";
    else if (index < 4) status = "Partially Paid";

    transactions.push({
      id: `tx-${creditor.id}-${index + 1}`,
      date: item.date,
      particulars: item.particulars,
      voucherType: item.voucherType,
      voucherNo: item.voucherNo,
      refNo: item.refNo,
      dueDate: item.dueDate,
      debit: item.debit,
      credit: item.credit,
      balance: Math.abs(currentBalance),
      balanceType: isCr ? "Cr" : "Dr",
      narration: item.narration,
      status
    });
  });

  return transactions;
};

// Generate Ageing Bills for selected Creditor
const generatePendingBills = (creditor: CreditorInfo): PendingBill[] => {
  return [
    {
      billNo: `INV-${creditor.name.slice(0, 3).toUpperCase()}-1189`,
      billDate: "2025-05-12",
      dueDate: "2025-06-11",
      originalAmount: 92400,
      pendingAmount: 7400,
      daysOverdue: 139,
      ageBracket: "90+"
    },
    {
      billNo: `INV-${creditor.name.slice(0, 3).toUpperCase()}-1344`,
      billDate: "2025-07-15",
      dueDate: "2025-08-14",
      originalAmount: 115000,
      pendingAmount: 30000,
      daysOverdue: 75,
      ageBracket: "61-90"
    },
    {
      billNo: `INV-${creditor.name.slice(0, 3).toUpperCase()}-1520`,
      billDate: "2025-10-10",
      dueDate: "2025-11-09",
      originalAmount: 78900,
      pendingAmount: 78900,
      daysOverdue: 0,
      ageBracket: "0-30"
    }
  ];
};

const CreditorsStatement: React.FC = () => {
  const { theme, ledgers = [] } = useAppContext();
  const { companyInfo } = useCompany();
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active Tab: "statement" | "overview" | "ageing"
  const [activeTab, setActiveTab] = useState<"statement" | "overview" | "ageing">("statement");

  // Creditors list combining defaults + system Sundry Creditors
  const [creditorsList, setCreditorsList] = useState<CreditorInfo[]>(DEFAULT_CREDITORS);

  // Selected Creditor state
  const initialCreditorId = id || searchParams.get("creditorId") || DEFAULT_CREDITORS[0].id;
  const [selectedCreditorId, setSelectedCreditorId] = useState<string>(initialCreditorId);

  // Dropdown combobox state
  const [isCreditorDropdownOpen, setIsCreditorDropdownOpen] = useState(false);
  const [creditorSearchQuery, setCreditorSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Date Filters
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed, 3 is April
  const fyStart = currentMonth >= 3 ? currentYear : currentYear - 1;

  const [dateRangePreset, setDateRangePreset] = useState<string>("full-fy");
  const [fromDate, setFromDate] = useState<string>(`${fyStart}-04-01`);
  const [toDate, setToDate] = useState<string>(`${fyStart + 1}-03-31`);

  // Table filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedVoucherType, setSelectedVoucherType] = useState<string>("all");

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Load system ledgers if available and merge
  useEffect(() => {
    if (ledgers && ledgers.length > 0) {
      // Find ledgers that look like Sundry Creditors
      const systemCreditors: CreditorInfo[] = ledgers
        .filter((l: Ledger) => {
          const isCreditorType = l.type === "sundry-creditors" || l.groupId === "14";
          const isCreditorName = (l.name || "").toLowerCase().includes("supplier") || (l.name || "").toLowerCase().includes("creditor");
          return isCreditorType || isCreditorName;
        })
        .map((l: Ledger) => ({
          id: String(l.id),
          name: l.name,
          alias: (l as any).alias || "",
          contactPerson: (l as any).contactPerson || "Accounts Dept",
          phone: l.phone || "-",
          email: l.email || "-",
          address: l.address || "-",
          city: (l as any).district || l.state || "India",
          state: l.state || "Maharashtra",
          gstNumber: l.gstNumber || "-",
          panNumber: l.panNumber || "-",
          creditPeriodDays: 30,
          creditLimit: 500000,
          openingBalance: Number(l.openingBalance) || 0,
          openingBalanceType: l.balanceType === "debit" ? "Dr" : "Cr"
        }));

      if (systemCreditors.length > 0) {
        // Merge system creditors with defaults, avoiding duplicates
        const combined = [...systemCreditors];
        DEFAULT_CREDITORS.forEach((dc) => {
          if (!combined.some((sc) => sc.name.toLowerCase() === dc.name.toLowerCase())) {
            combined.push(dc);
          }
        });
        setCreditorsList(combined);
      }
    }
  }, [ledgers]);

  // Sync selected creditor from URL
  useEffect(() => {
    if (id) {
      setSelectedCreditorId(id);
    } else if (searchParams.get("creditorId")) {
      setSelectedCreditorId(searchParams.get("creditorId") || "");
    }
  }, [id, searchParams]);

  // Find currently selected creditor
  const currentCreditor = useMemo(() => {
    return (
      creditorsList.find((c) => c.id === selectedCreditorId) ||
      creditorsList[0] ||
      DEFAULT_CREDITORS[0]
    );
  }, [creditorsList, selectedCreditorId]);

  // Handle outside click for combobox
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsCreditorDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Preset Date range changes
  const handleDatePresetChange = (preset: string) => {
    setDateRangePreset(preset);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (preset === "this-month") {
      const first = new Date(y, m, 1).toISOString().split("T")[0];
      const last = new Date(y, m + 1, 0).toISOString().split("T")[0];
      setFromDate(first);
      setToDate(last);
    } else if (preset === "last-month") {
      const first = new Date(y, m - 1, 1).toISOString().split("T")[0];
      const last = new Date(y, m, 0).toISOString().split("T")[0];
      setFromDate(first);
      setToDate(last);
    } else if (preset === "this-quarter") {
      const q = Math.floor(m / 3);
      const first = new Date(y, q * 3, 1).toISOString().split("T")[0];
      const last = new Date(y, q * 3 + 3, 0).toISOString().split("T")[0];
      setFromDate(first);
      setToDate(last);
    } else if (preset === "full-fy") {
      setFromDate(`${fyStart}-04-01`);
      setToDate(`${fyStart + 1}-03-31`);
    }
  };

  // Switch Creditor handler
  const handleSelectCreditor = (cred: CreditorInfo) => {
    setSelectedCreditorId(cred.id);
    setIsCreditorDropdownOpen(false);
    setCreditorSearchQuery("");
    setSearchParams({ creditorId: cred.id });
  };

  // Generate / Filter transactions for current creditor
  const allTransactions = useMemo(() => {
    return generateCreditorTransactions(currentCreditor);
  }, [currentCreditor]);

  // Filtered transactions by date, voucher type, and search keyword
  const filteredTransactions = useMemo(() => {
    return allTransactions.filter((tx) => {
      // Date filter
      if (fromDate && tx.date < fromDate) return false;
      if (toDate && tx.date > toDate) return false;

      // Voucher filter
      if (selectedVoucherType !== "all" && tx.voucherType !== selectedVoucherType) {
        return false;
      }

      // Search keyword
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesParticulars = tx.particulars.toLowerCase().includes(q);
        const matchesVoucher = tx.voucherNo.toLowerCase().includes(q);
        const matchesRef = tx.refNo.toLowerCase().includes(q);
        const matchesNarration = (tx.narration || "").toLowerCase().includes(q);
        if (!matchesParticulars && !matchesVoucher && !matchesRef && !matchesNarration) {
          return false;
        }
      }

      return true;
    });
  }, [allTransactions, fromDate, toDate, selectedVoucherType, searchTerm]);

  // Calculate totals and statistics for selected creditor
  const statementSummary = useMemo(() => {
    const totalPurchases = filteredTransactions
      .filter((t) => t.voucherType === "Purchase")
      .reduce((sum, t) => sum + t.credit, 0);

    const totalPayments = filteredTransactions
      .filter((t) => t.voucherType === "Payment")
      .reduce((sum, t) => sum + t.debit, 0);

    const totalDebitNotes = filteredTransactions
      .filter((t) => t.voucherType === "Debit Note" || t.voucherType === "Journal")
      .reduce((sum, t) => sum + t.debit, 0);

    const totalDebits = filteredTransactions.reduce((sum, t) => sum + t.debit, 0);
    const totalCredits = filteredTransactions.reduce((sum, t) => sum + t.credit, 0);

    // Closing balance
    const closingNet = currentCreditor.openingBalance + totalCredits - totalDebits;
    const closingBalanceType = closingNet >= 0 ? "Cr" : "Dr";

    return {
      openingBalance: currentCreditor.openingBalance,
      openingBalanceType: currentCreditor.openingBalanceType,
      totalPurchases,
      totalPayments,
      totalDebitNotes,
      totalDebits,
      totalCredits,
      closingBalance: Math.abs(closingNet),
      closingBalanceType,
      transactionCount: filteredTransactions.length
    };
  }, [currentCreditor, filteredTransactions]);

  // Pending Bills for Ageing
  const pendingBills = useMemo(() => {
    return generatePendingBills(currentCreditor);
  }, [currentCreditor]);

  // Ageing buckets calculation
  const ageingBreakdown = useMemo(() => {
    let b0_30 = 0;
    let b31_60 = 0;
    let b61_90 = 0;
    let b90_plus = 0;

    pendingBills.forEach((b) => {
      if (b.ageBracket === "0-30") b0_30 += b.pendingAmount;
      else if (b.ageBracket === "31-60") b31_60 += b.pendingAmount;
      else if (b.ageBracket === "61-90") b61_90 += b.pendingAmount;
      else if (b.ageBracket === "90+") b90_plus += b.pendingAmount;
    });

    const totalPending = b0_30 + b31_60 + b61_90 + b90_plus;
    return { b0_30, b31_60, b61_90, b90_plus, totalPending };
  }, [pendingBills]);

  // All Creditors Summary Overview data
  const allCreditorsOverview = useMemo(() => {
    return creditorsList.map((cred) => {
      const txs = generateCreditorTransactions(cred);
      const purchases = txs
        .filter((t) => t.voucherType === "Purchase")
        .reduce((sum, t) => sum + t.credit, 0);
      const payments = txs
        .filter((t) => t.voucherType === "Payment")
        .reduce((sum, t) => sum + t.debit, 0);
      const adjustments = txs
        .filter((t) => t.voucherType === "Debit Note" || t.voucherType === "Journal")
        .reduce((sum, t) => sum + t.debit, 0);

      const netClosing = cred.openingBalance + purchases - payments - adjustments;
      const closingType = netClosing >= 0 ? "Cr" : "Dr";

      return {
        ...cred,
        totalPurchases: purchases,
        totalPayments: payments,
        totalAdjustments: adjustments,
        closingBalance: Math.abs(netClosing),
        closingType,
        bills: generatePendingBills(cred)
      };
    });
  }, [creditorsList]);

  // Aggregate totals across all creditors
  const grandOverviewTotals = useMemo(() => {
    const totalPayables = allCreditorsOverview.reduce((sum, c) => sum + c.closingBalance, 0);
    const totalPurchases = allCreditorsOverview.reduce((sum, c) => sum + c.totalPurchases, 0);
    const totalPayments = allCreditorsOverview.reduce((sum, c) => sum + c.totalPayments, 0);
    const totalOverdue = allCreditorsOverview.reduce((sum, c) => {
      const over = c.bills
        .filter((b) => b.daysOverdue > 0)
        .reduce((bSum, b) => bSum + b.pendingAmount, 0);
      return sum + over;
    }, 0);

    return {
      totalCreditorsCount: allCreditorsOverview.length,
      totalPayables,
      totalPurchases,
      totalPayments,
      totalOverdue
    };
  }, [allCreditorsOverview]);

  // Currency Formatter
  const formatINR = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    }).format(val);
  };

  // Print Handler
  const handlePrint = () => {
    window.print();
  };

  // Export to Excel
  const handleExportExcel = () => {
    try {
      const rows: any[] = [];

      // Company and Party header lines
      rows.push(["CREDITORS STATEMENT OF ACCOUNT"]);
      rows.push([
        `Company: ${companyInfo?.name || "Tally Business Ltd"}`,
        `GSTIN: ${companyInfo?.gstin || "27ABCDE1234F1Z5"}`
      ]);
      rows.push([
        `Creditor / Supplier: ${currentCreditor.name}`,
        `GSTIN: ${currentCreditor.gstNumber || "-"}`
      ]);
      rows.push([`Period: ${fromDate} to ${toDate}`, `Printed On: ${new Date().toLocaleDateString("en-IN")}`]);
      rows.push([]);

      // Table Header
      rows.push([
        "Date",
        "Particulars",
        "Voucher Type",
        "Voucher No",
        "Ref / Bill No",
        "Due Date",
        "Debit (₹)",
        "Credit (₹)",
        "Balance (₹)",
        "Type",
        "Narration"
      ]);

      // Opening Balance Row
      rows.push([
        fromDate,
        "Opening Balance b/f",
        "-",
        "-",
        "-",
        "-",
        0,
        0,
        statementSummary.openingBalance,
        statementSummary.openingBalanceType,
        "Balance brought forward"
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
        toDate,
        "Closing Balance c/d",
        "Totals",
        "",
        "",
        "",
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
    if (!printAreaRef.current) return;
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
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Creditors Statement</h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                Sundry Creditors
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
              Accounting Reports &bull; Statement of Account, Payables & Ageing Analysis
            </p>
          </div>
        </div>

        {/* View Mode Switcher + Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tab Selector */}
          <div
            className={`p-1 rounded-lg flex items-center border ${
              theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <button
              onClick={() => setActiveTab("statement")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === "statement"
                  ? "bg-blue-600 text-white shadow-sm"
                  : theme === "dark"
                  ? "text-gray-300 hover:text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <FileText size={14} />
              Statement of Account
            </button>
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === "overview"
                  ? "bg-blue-600 text-white shadow-sm"
                  : theme === "dark"
                  ? "text-gray-300 hover:text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Layers size={14} />
              All Creditors Summary
            </button>
            <button
              onClick={() => setActiveTab("ageing")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === "ageing"
                  ? "bg-blue-600 text-white shadow-sm"
                  : theme === "dark"
                  ? "text-gray-300 hover:text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Clock size={14} />
              Ageing & Pending Bills
            </button>
          </div>

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

      {/* 🔍 Global Controls Bar: Creditor Selector & Date Presets */}
      <div
        className={`p-4 rounded-xl border mb-6 no-print ${
          theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
        }`}
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* Creditor Selector (Combobox) */}
          <div className="md:col-span-5 relative" ref={dropdownRef}>
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
                  <span className="font-semibold block truncate">{currentCreditor.name}</span>
                  <span className={`text-xs block ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
                    GSTIN: {currentCreditor.gstNumber || "N/A"} &bull; {currentCreditor.city || ""}
                  </span>
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
                    const isSelected = cred.id === currentCreditor.id;
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
                            GST: {cred.gstNumber || "Unregistered"} | {cred.city}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                            {formatINR(cred.openingBalance)} {cred.openingBalanceType}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {filteredDropdownCreditors.length === 0 && (
                    <div className="p-3 text-center text-xs text-gray-500">No creditors match your search.</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Date Presets */}
          <div className="md:col-span-3">
            <label className={`block text-xs font-medium mb-1.5 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
              Period Preset:
            </label>
            <div className="flex gap-1">
              {[
                { id: "full-fy", label: `FY ${fyStart}-${(fyStart + 1) % 100}` },
                { id: "this-quarter", label: "This Qtr" },
                { id: "this-month", label: "This Month" },
                { id: "last-month", label: "Last Month" }
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleDatePresetChange(p.id)}
                  className={`flex-1 py-2 text-[11px] font-medium rounded-lg border transition-all ${
                    dateRangePreset === p.id
                      ? "bg-blue-600 text-white border-blue-600"
                      : theme === "dark"
                      ? "bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range Inputs */}
          <div className="md:col-span-4 flex items-center gap-2">
            <div className="flex-1">
              <label className={`block text-xs font-medium mb-1.5 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                From Date:
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setDateRangePreset("custom");
                }}
                className={`w-full px-3 py-1.5 text-xs rounded-lg border focus:outline-none ${
                  theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                    : "bg-white border-gray-300 text-gray-800 focus:border-blue-500"
                }`}
              />
            </div>
            <div className="flex-1">
              <label className={`block text-xs font-medium mb-1.5 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                To Date:
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setDateRangePreset("custom");
                }}
                className={`w-full px-3 py-1.5 text-xs rounded-lg border focus:outline-none ${
                  theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                    : "bg-white border-gray-300 text-gray-800 focus:border-blue-500"
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 📊 KPI Cards Section */}
      {activeTab === "statement" && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6 no-print">
          {/* Card 1: Opening Balance */}
          <div
            className={`p-4 rounded-xl border ${
              theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Opening Balance</span>
              <Calendar size={14} className="text-blue-500" />
            </div>
            <div className="text-lg font-bold">
              {formatINR(statementSummary.openingBalance)}{" "}
              <span className="text-xs font-medium text-amber-500">{statementSummary.openingBalanceType}</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">As on {fromDate}</p>
          </div>

          {/* Card 2: Total Billed / Purchases */}
          <div
            className={`p-4 rounded-xl border ${
              theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Purchases (Cr)</span>
              <ArrowDownLeft size={14} className="text-indigo-500" />
            </div>
            <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
              {formatINR(statementSummary.totalPurchases)}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">Bills Invoiced in period</p>
          </div>

          {/* Card 3: Payments Made */}
          <div
            className={`p-4 rounded-xl border ${
              theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Payments Made (Dr)</span>
              <ArrowUpRight size={14} className="text-emerald-500" />
            </div>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {formatINR(statementSummary.totalPayments)}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">Disbursements made</p>
          </div>

          {/* Card 4: Debit Notes & Adjustments */}
          <div
            className={`p-4 rounded-xl border ${
              theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Returns / Adjustments</span>
              <TrendingUp size={14} className="text-amber-500" />
            </div>
            <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
              {formatINR(statementSummary.totalDebitNotes)}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">Debit Notes & discounts</p>
          </div>

          {/* Card 5: Net Closing Payable */}
          <div
            className={`p-4 rounded-xl border col-span-2 md:col-span-1 ${
              theme === "dark"
                ? "bg-rose-950/20 border-rose-800/60"
                : "bg-rose-50/70 border-rose-200"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-rose-600 dark:text-rose-400 mb-1">
              <span className="font-semibold">Closing Outstanding</span>
              <AlertTriangle size={14} />
            </div>
            <div className="text-lg font-bold text-rose-700 dark:text-rose-300">
              {formatINR(statementSummary.closingBalance)}{" "}
              <span className="text-xs font-bold">{statementSummary.closingBalanceType}</span>
            </div>
            <p className="text-[11px] text-rose-500/80 mt-0.5">Net amount payable</p>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 1: STATEMENT OF ACCOUNT (Detailed Ledger Statement)
      ========================================================================= */}
      {activeTab === "statement" && (
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
                  {companyInfo?.name || "Tally Prime Business Solutions Ltd."}
                </h2>
                <div className={`text-xs mt-1 space-y-0.5 ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}>
                  <p>{companyInfo?.address || "Unit 401, Technopolis Hub, Sector 5, Salt Lake"}</p>
                  <p>
                    <span className="font-medium">GSTIN:</span> {companyInfo?.gstin || "27ABCDE1234F1Z5"} &bull;{" "}
                    <span className="font-medium">PAN:</span> {companyInfo?.pan || "ABCDE1234F"}
                  </p>
                  <p>
                    <span className="font-medium">Email:</span> {companyInfo?.email || "finance@tallybiz.com"} &bull;{" "}
                    <span className="font-medium">Tel:</span> +91 22 4001 8800
                  </p>
                </div>
              </div>

              {/* Right: Creditor Details */}
              <div
                className={`p-3.5 rounded-lg border text-right sm:max-w-xs ${
                  theme === "dark" ? "bg-gray-750 border-gray-700" : "bg-gray-50 border-gray-200"
                }`}
              >
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400">
                  Creditor / Supplier
                </span>
                <h3 className="text-sm font-bold truncate mt-0.5">{currentCreditor.name}</h3>
                <div className={`text-[11px] mt-1 space-y-0.5 ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}>
                  <p className="truncate">{currentCreditor.address}</p>
                  <p>
                    <span className="font-medium">GSTIN:</span> {currentCreditor.gstNumber || "-"}
                  </p>
                  <p>
                    <span className="font-medium">Contact:</span> {currentCreditor.contactPerson} ({currentCreditor.phone})
                  </p>
                  <p>
                    <span className="font-medium">Terms:</span> {currentCreditor.creditPeriodDays} Days Credit
                  </p>
                </div>
              </div>
            </div>

            {/* Statement Metadata Bar */}
            <div className="mt-4 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-blue-600 dark:text-blue-400">STATEMENT OF ACCOUNT</span>
                <span className="text-gray-400">&bull;</span>
                <span className={theme === "dark" ? "text-gray-300" : "text-gray-600"}>
                  Period: <span className="font-semibold">{fromDate}</span> to <span className="font-semibold">{toDate}</span>
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
                  <th className="py-2.5 px-3 text-right">Debit (₹)</th>
                  <th className="py-2.5 px-3 text-right">Credit (₹)</th>
                  <th className="py-2.5 px-3 text-right">Balance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {/* 1. Opening Balance Row */}
                <tr className={theme === "dark" ? "bg-gray-800/80 font-medium" : "bg-blue-50/40 font-medium"}>
                  <td className="py-2.5 px-3">{fromDate}</td>
                  <td className="py-2.5 px-3" colSpan={5}>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Opening Balance b/f</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                        Initial
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                  <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                  <td className="py-2.5 px-3 text-right font-bold">
                    {formatINR(statementSummary.openingBalance)}{" "}
                    <span className="text-[10px] text-amber-500">{statementSummary.openingBalanceType}</span>
                  </td>
                </tr>

                {/* 2. Transaction Rows */}
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
                      className={`hover:bg-gray-50/70 dark:hover:bg-gray-750/70 transition-colors`}
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
                        {tx.refNo}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-gray-500">
                        {tx.dueDate}
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

                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-500">
                      No statement transactions found for the selected period and filters.
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
                  <td className="py-3 px-3 text-right text-emerald-600 dark:text-emerald-400">
                    {formatINR(statementSummary.totalDebits)}
                  </td>
                  <td className="py-3 px-3 text-right text-indigo-600 dark:text-indigo-400">
                    {formatINR(statementSummary.totalCredits)}
                  </td>
                  <td className="py-3 px-3 text-right text-gray-400">-</td>
                </tr>
                <tr className={theme === "dark" ? "bg-gray-800 text-white" : "bg-gray-200 text-gray-900"}>
                  <td colSpan={6} className="py-3 px-3 text-right uppercase tracking-wider text-xs font-bold">
                    Closing Outstanding Balance c/d (Payable):
                  </td>
                  <td colSpan={3} className="py-3 px-3 text-right text-sm font-extrabold text-rose-600 dark:text-rose-400">
                    {formatINR(statementSummary.closingBalance)}{" "}
                    <span className="text-xs font-bold">{statementSummary.closingBalanceType}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Signatures & Certification Box for Print */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center text-xs">
            <div>
              <div className="h-14 border-b border-dashed border-gray-300 dark:border-gray-600 mb-2"></div>
              <p className="font-semibold text-gray-700 dark:text-gray-300">Prepared By</p>
              <p className="text-[10px] text-gray-400">Accounts Executive</p>
            </div>
            <div>
              <div className="h-14 border-b border-dashed border-gray-300 dark:border-gray-600 mb-2"></div>
              <p className="font-semibold text-gray-700 dark:text-gray-300">Checked & Verified</p>
              <p className="text-[10px] text-gray-400">Senior Accountant</p>
            </div>
            <div>
              <div className="h-14 border-b border-dashed border-gray-300 dark:border-gray-600 mb-2"></div>
              <p className="font-semibold text-gray-700 dark:text-gray-300">Authorised Signatory</p>
              <p className="text-[10px] text-gray-400">For {companyInfo?.name || "Company"}</p>
            </div>
            <div>
              <div className="h-14 border-b border-dashed border-gray-300 dark:border-gray-600 mb-2"></div>
              <p className="font-semibold text-gray-700 dark:text-gray-300">Supplier Confirmation</p>
              <p className="text-[10px] text-gray-400">Signature & Seal</p>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: ALL CREDITORS SUMMARY (Register of Sundry Creditors)
      ========================================================================= */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Overview Aggregates */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div
              className={`p-4 rounded-xl border ${
                theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <span className="text-xs text-gray-400 block mb-1">Total Suppliers</span>
              <span className="text-2xl font-bold">{grandOverviewTotals.totalCreditorsCount}</span>
              <span className="text-xs text-emerald-500 block mt-1">Active Accounts</span>
            </div>
            <div
              className={`p-4 rounded-xl border ${
                theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <span className="text-xs text-gray-400 block mb-1">Total Outstanding Payables</span>
              <span className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                {formatINR(grandOverviewTotals.totalPayables)}
              </span>
              <span className="text-xs text-rose-500 block mt-1">Net Cr Liability</span>
            </div>
            <div
              className={`p-4 rounded-xl border ${
                theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <span className="text-xs text-gray-400 block mb-1">Total Purchases Billed</span>
              <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {formatINR(grandOverviewTotals.totalPurchases)}
              </span>
              <span className="text-xs text-gray-400 block mt-1">In selected range</span>
            </div>
            <div
              className={`p-4 rounded-xl border ${
                theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <span className="text-xs text-gray-400 block mb-1">Overdue Amount</span>
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {formatINR(grandOverviewTotals.totalOverdue)}
              </span>
              <span className="text-xs text-amber-500 block mt-1">Requires Payment</span>
            </div>
          </div>

          {/* All Creditors Table */}
          <div
            className={`rounded-xl border p-5 ${
              theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">Sundry Creditors Master Summary</h2>
                <p className="text-xs text-gray-500">Comprehensive list of all registered vendor & supplier accounts</p>
              </div>
              <button
                onClick={() => {
                  const ws = XLSX.utils.json_to_sheet(
                    allCreditorsOverview.map((c) => ({
                      Name: c.name,
                      City: c.city,
                      GSTIN: c.gstNumber,
                      "Opening Balance": c.openingBalance,
                      "Purchases (Cr)": c.totalPurchases,
                      "Payments (Dr)": c.totalPayments,
                      "Adjustments (Dr)": c.totalAdjustments,
                      "Closing Balance": c.closingBalance,
                      Type: c.closingType
                    }))
                  );
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, "All_Creditors");
                  XLSX.writeFile(wb, "All_Creditors_Summary.xlsx");
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  theme === "dark"
                    ? "bg-gray-750 hover:bg-gray-700 border-gray-600 text-gray-200"
                    : "bg-white hover:bg-gray-50 border-gray-200 text-gray-700 shadow-sm"
                }`}
              >
                <Download size={14} /> Export Summary
              </button>
            </div>

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
                    <th className="py-2.5 px-3">Supplier Name</th>
                    <th className="py-2.5 px-3">GSTIN / City</th>
                    <th className="py-2.5 px-3 text-right">Opening (₹)</th>
                    <th className="py-2.5 px-3 text-right">Purchases (₹)</th>
                    <th className="py-2.5 px-3 text-right">Payments (₹)</th>
                    <th className="py-2.5 px-3 text-right">Adjustments (₹)</th>
                    <th className="py-2.5 px-3 text-right">Closing Balance (₹)</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {allCreditorsOverview.map((cred) => (
                    <tr
                      key={cred.id}
                      className="hover:bg-gray-50/70 dark:hover:bg-gray-750/70 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-gray-900 dark:text-gray-100">{cred.name}</div>
                        <div className="text-[11px] text-gray-500">{cred.contactPerson} &bull; {cred.phone}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-mono text-gray-700 dark:text-gray-300">{cred.gstNumber || "-"}</div>
                        <div className="text-[11px] text-gray-500">{cred.city}, {cred.state}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        {formatINR(cred.openingBalance)} {cred.openingBalanceType}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-indigo-600 dark:text-indigo-400">
                        {formatINR(cred.totalPurchases)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                        {formatINR(cred.totalPayments)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-amber-600 dark:text-amber-400">
                        {formatINR(cred.totalAdjustments)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                        {formatINR(cred.closingBalance)} {cred.closingType}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => {
                            setSelectedCreditorId(cred.id);
                            setActiveTab("statement");
                            setSearchParams({ creditorId: cred.id });
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300 transition-colors"
                        >
                          View Statement
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: AGEING & PENDING BILLS BREAKDOWN
      ========================================================================= */}
      {activeTab === "ageing" && (
        <div className="space-y-6">
          {/* Ageing Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div
              className={`p-4 rounded-xl border ${
                theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <span className="text-xs text-gray-500 block mb-1">Total Pending</span>
              <span className="text-xl font-bold">{formatINR(ageingBreakdown.totalPending)}</span>
              <p className="text-[11px] text-gray-400 mt-1">Across all pending bills</p>
            </div>
            <div
              className={`p-4 rounded-xl border ${
                theme === "dark" ? "bg-emerald-950/20 border-emerald-800/60" : "bg-emerald-50 border-emerald-200 shadow-sm"
              }`}
            >
              <span className="text-xs text-emerald-600 dark:text-emerald-400 block mb-1">0 - 30 Days (Current)</span>
              <span className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                {formatINR(ageingBreakdown.b0_30)}
              </span>
              <p className="text-[11px] text-emerald-600/80 mt-1">Within normal credit period</p>
            </div>
            <div
              className={`p-4 rounded-xl border ${
                theme === "dark" ? "bg-blue-950/20 border-blue-800/60" : "bg-blue-50 border-blue-200 shadow-sm"
              }`}
            >
              <span className="text-xs text-blue-600 dark:text-blue-400 block mb-1">31 - 60 Days</span>
              <span className="text-xl font-bold text-blue-700 dark:text-blue-300">
                {formatINR(ageingBreakdown.b31_60)}
              </span>
              <p className="text-[11px] text-blue-600/80 mt-1">Due for immediate payment</p>
            </div>
            <div
              className={`p-4 rounded-xl border ${
                theme === "dark" ? "bg-amber-950/20 border-amber-800/60" : "bg-amber-50 border-amber-200 shadow-sm"
              }`}
            >
              <span className="text-xs text-amber-600 dark:text-amber-400 block mb-1">61 - 90 Days</span>
              <span className="text-xl font-bold text-amber-700 dark:text-amber-300">
                {formatINR(ageingBreakdown.b61_90)}
              </span>
              <p className="text-[11px] text-amber-600/80 mt-1">Overdue alert</p>
            </div>
            <div
              className={`p-4 rounded-xl border ${
                theme === "dark" ? "bg-rose-950/20 border-rose-800/60" : "bg-rose-50 border-rose-200 shadow-sm"
              }`}
            >
              <span className="text-xs text-rose-600 dark:text-rose-400 block mb-1">&gt; 90 Days (Critical)</span>
              <span className="text-xl font-bold text-rose-700 dark:text-rose-300">
                {formatINR(ageingBreakdown.b90_plus)}
              </span>
              <p className="text-[11px] text-rose-600/80 mt-1">High risk delayed bills</p>
            </div>
          </div>

          {/* Pending Bills Detail Table for Selected Creditor */}
          <div
            className={`rounded-xl border p-5 ${
              theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">Unpaid Invoices for {currentCreditor.name}</h2>
                <p className="text-xs text-gray-500">Bill-wise tracking of pending supplier payables and ageing</p>
              </div>
            </div>

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
                    <th className="py-2.5 px-3">Bill / Inv No.</th>
                    <th className="py-2.5 px-3">Bill Date</th>
                    <th className="py-2.5 px-3">Due Date</th>
                    <th className="py-2.5 px-3 text-right">Original Amount (₹)</th>
                    <th className="py-2.5 px-3 text-right">Pending Amount (₹)</th>
                    <th className="py-2.5 px-3 text-center">Overdue Days</th>
                    <th className="py-2.5 px-3 text-center">Ageing Bracket</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {pendingBills.map((bill, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/70 dark:hover:bg-gray-750/70 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {bill.billNo}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600 dark:text-gray-300 font-mono">{bill.billDate}</td>
                      <td className="py-2.5 px-3 text-gray-600 dark:text-gray-300 font-mono">{bill.dueDate}</td>
                      <td className="py-2.5 px-3 text-right font-medium">{formatINR(bill.originalAmount)}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                        {formatINR(bill.pendingAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-semibold">
                        {bill.daysOverdue > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400">{bill.daysOverdue} days overdue</span>
                        ) : (
                          <span className="text-emerald-600">On Schedule</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                            bill.ageBracket === "0-30"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                              : bill.ageBracket === "31-60"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300"
                              : bill.ageBracket === "61-90"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300"
                              : "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300"
                          }`}
                        >
                          {bill.ageBracket} Days
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 💡 Help & Pro Tips Bar */}
      <div
        className={`mt-8 p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${
          theme === "dark" ? "bg-gray-800/60 border-gray-700 text-gray-300" : "bg-blue-50/70 border-blue-200 text-blue-900"
        }`}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-blue-500 shrink-0" />
          <span>
            <strong className="font-semibold">Accounting Tip:</strong> Credit balances on Sundry Creditors represent
            unsettled vendor obligations. Regularly match supplier invoices with GSTR-2B before authorizing bank transfers.
          </span>
        </div>
        <button
          onClick={() => navigate("/app/reports/ledger-confirmation")}
          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
        >
          Send Confirmation Notice &rarr;
        </button>
      </div>
    </div>
  );
};

export default CreditorsStatement;
