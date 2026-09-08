import React, { useState, useMemo, useEffect } from "react";
import { useAppContext } from "../../context/AppContext";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Filter,
  Search,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  RefreshCw,
  AlertCircle,
  PieChart,
  LayoutGrid,
  ListFilter,
  ArrowLeftCircle,
  ShoppingCart
} from "lucide-react";
import * as XLSX from "xlsx";
import "./reports.css";

interface FilterState {
  dateRange: string;
  fromDate: string;
  toDate: string;
  businessFilter: string;
  typeFilter: string;
}

// Full-color vibrant themes for HSN Cards
const CARD_COLOR_PALETTES = [
  {
    name: "Blue",
    cardBg: "bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white border-blue-400 shadow-blue-500/25",
    badgeBg: "bg-white/20 text-white backdrop-blur-sm border border-white/30",
    totalLabel: "text-blue-100",
    totalAmount: "text-amber-300 font-mono font-black text-xl",
    divider: "border-white/20",
  },
  {
    name: "Emerald",
    cardBg: "bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-800 text-white border-emerald-400 shadow-emerald-500/25",
    badgeBg: "bg-white/20 text-white backdrop-blur-sm border border-white/30",
    totalLabel: "text-emerald-100",
    totalAmount: "text-yellow-300 font-mono font-black text-xl",
    divider: "border-white/20",
  },
  {
    name: "Purple",
    cardBg: "bg-gradient-to-br from-purple-600 via-purple-700 to-violet-900 text-white border-purple-400 shadow-purple-500/25",
    badgeBg: "bg-white/20 text-white backdrop-blur-sm border border-white/30",
    totalLabel: "text-purple-100",
    totalAmount: "text-emerald-300 font-mono font-black text-xl",
    divider: "border-white/20",
  },
  {
    name: "Orange",
    cardBg: "bg-gradient-to-br from-amber-500 via-orange-600 to-red-600 text-white border-amber-400 shadow-orange-500/25",
    badgeBg: "bg-white/20 text-white backdrop-blur-sm border border-white/30",
    totalLabel: "text-amber-100",
    totalAmount: "text-white font-mono font-black text-xl",
    divider: "border-white/20",
  },
  {
    name: "Rose",
    cardBg: "bg-gradient-to-br from-rose-600 via-pink-600 to-rose-800 text-white border-rose-400 shadow-rose-500/25",
    badgeBg: "bg-white/20 text-white backdrop-blur-sm border border-white/30",
    totalLabel: "text-rose-100",
    totalAmount: "text-amber-300 font-mono font-black text-xl",
    divider: "border-white/20",
  },
  {
    name: "Cyan",
    cardBg: "bg-gradient-to-br from-cyan-600 via-sky-600 to-blue-800 text-white border-cyan-400 shadow-cyan-500/25",
    badgeBg: "bg-white/20 text-white backdrop-blur-sm border border-white/30",
    totalLabel: "text-cyan-100",
    totalAmount: "text-yellow-300 font-mono font-black text-xl",
    divider: "border-white/20",
  },
  {
    name: "Indigo",
    cardBg: "bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-900 text-white border-indigo-400 shadow-indigo-500/25",
    badgeBg: "bg-white/20 text-white backdrop-blur-sm border border-white/30",
    totalLabel: "text-indigo-100",
    totalAmount: "text-emerald-300 font-mono font-black text-xl",
    divider: "border-white/20",
  },
  {
    name: "Teal",
    cardBg: "bg-gradient-to-br from-teal-600 via-emerald-700 to-cyan-900 text-white border-teal-400 shadow-teal-500/25",
    badgeBg: "bg-white/20 text-white backdrop-blur-sm border border-white/30",
    totalLabel: "text-teal-100",
    totalAmount: "text-amber-300 font-mono font-black text-xl",
    divider: "border-white/20",
  }
];

const AllHsnPurachase: React.FC = () => {
  const { theme } = useAppContext();
  const navigate = useNavigate();

  const companyId = localStorage.getItem("company_id") || "";
  const ownerType = localStorage.getItem("supplier") || "";
  const ownerId =
    localStorage.getItem(
      ownerType === "employee" ? "employee_id" : "user_id"
    ) || "";

  // Active Tab State: "dashboard" | "details"
  const [activeTab, setActiveTab] = useState<"dashboard" | "details">("dashboard");

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    dateRange: "this-year",
    fromDate: new Date(new Date().getFullYear(), 0, 1)
      .toISOString()
      .split("T")[0],
    toDate: new Date().toISOString().split("T")[0],
    businessFilter: "",
    typeFilter: "",
  });

  const [purchaseData, setPurchaseData] = useState<any[]>([]);
  const [partyIds, setPartyIds] = useState<number[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([]);
  const [matchedPurchases, setMatchedPurchases] = useState<any[]>([]);

  // Selection, Search, Sort & Pagination
  const [selectedHsnCode, setSelectedHsnCode] = useState<string | null>(null);
  const [dashboardHsnSearch, setDashboardHsnSearch] = useState("");
  const [detailSearchQuery, setDetailSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleDateRangeChange = (range: string) => {
    const today = new Date();
    let fromDate = new Date();
    let toDate = new Date();

    switch (range) {
      case "today":
        fromDate = toDate = today;
        break;
      case "this-week":
        fromDate = new Date(
          today.getTime() - today.getDay() * 24 * 60 * 60 * 1000
        );
        break;
      case "this-month":
        fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case "this-quarter": {
        const quarterStart = Math.floor(today.getMonth() / 3) * 3;
        fromDate = new Date(today.getFullYear(), quarterStart, 1);
        break;
      }
      case "this-year":
        fromDate = new Date(today.getFullYear(), 0, 1);
        break;
    }

    setFilters((prev) => ({
      ...prev,
      dateRange: range,
      fromDate: fromDate.toISOString().split("T")[0],
      toDate: toDate.toISOString().split("T")[0],
    }));
    setCurrentPage(1);
  };

  // Fetch Purchase Vouchers, Ledgers, & History in parallel
  const fetchData = async () => {
    if (!companyId || !ownerType || !ownerId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const purchaseUrl = `${import.meta.env.VITE_API_URL}/api/purchase-vouchers?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
      const ledgerUrl = `${import.meta.env.VITE_API_URL}/api/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
      const historyUrl = `${import.meta.env.VITE_API_URL}/api/purchase-vouchers/purchase-history?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;

      const [purchaseRes, ledgerRes, historyRes] = await Promise.all([
        fetch(purchaseUrl),
        fetch(ledgerUrl),
        fetch(historyUrl)
      ]);

      const purchaseJson = await purchaseRes.json();
      const ledgerJson = await ledgerRes.json();
      const historyJson = await historyRes.json();

      const vouchers = Array.isArray(purchaseJson?.data)
        ? purchaseJson.data
        : Array.isArray(purchaseJson)
        ? purchaseJson
        : [];

      const ledgersList = Array.isArray(ledgerJson?.data)
        ? ledgerJson.data
        : Array.isArray(ledgerJson)
        ? ledgerJson
        : [];

      const historyRows = Array.isArray(historyJson?.data)
        ? historyJson.data
        : Array.isArray(historyJson)
        ? historyJson
        : [];

      const allPartyIds = vouchers
        .map((v: any) => v.partyId)
        .filter((id: any) => id !== null && id !== undefined);

      setPurchaseData(vouchers);
      setPartyIds(allPartyIds);
      setLedger(ledgersList);
      setPurchaseHistory(historyRows);
    } catch (err: any) {
      console.error("Failed to load Purchase HSN Report data:", err);
      setError(err?.message || "Failed to load report data from server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [companyId, ownerType, ownerId]);

  // Match Purchases with Ledgers
  useEffect(() => {
    if (!partyIds.length || !ledger.length || !purchaseData.length) {
      setMatchedPurchases(purchaseData);
      return;
    }

    const partyIdSet = new Set(partyIds);
    const relevantLedgers = ledger.filter((l: any) => partyIdSet.has(l.id));
    const relevantLedgerIdSet = new Set(relevantLedgers.map((l: any) => l.id));

    const filteredPurchases = purchaseData.filter((s: any) =>
      relevantLedgerIdSet.has(s.partyId)
    );

    setMatchedPurchases(filteredPurchases);
  }, [partyIds, ledger, purchaseData]);

  // Ledger Lookup Map
  const ledgerMap = useMemo(() => {
    const map = new Map<number, any>();
    ledger.forEach((l: any) => {
      map.set(l.id, l);
    });
    return map;
  }, [ledger]);

  // Purchase History Lookup Map by Voucher Number
  const purchaseHistoryMap = useMemo(() => {
    return new Map(purchaseHistory.map((h: any) => [h.voucherNumber, h]));
  }, [purchaseHistory]);

  const getHsnByVoucher = (voucherNo: string) => {
    const rawHsn = purchaseHistoryMap.get(voucherNo)?.hsnCode;
    if (!rawHsn || String(rawHsn).trim() === "" || rawHsn === "-") {
      return "N/A";
    }
    return String(rawHsn).trim().toUpperCase();
  };

  const getQtyByVoucher = (voucherNo: string) => {
    const qty = purchaseHistoryMap.get(voucherNo)?.qtyChange;
    return qty ? Math.abs(qty) : 0;
  };

  const getQtyWithUnitByVoucher = (voucherNo: string) => {
    const hRecord = purchaseHistoryMap.get(voucherNo);
    if (!hRecord) return "-";
    const qty = hRecord.qtyChange ? Math.abs(hRecord.qtyChange) : 0;
    if (qty === 0) return "-";
    const unitSymbol = hRecord.unit;
    return `${qty} ${unitSymbol ? unitSymbol.toLowerCase() : ""}`.trim();
  };

  const getRateByVoucher = (voucherNo: string) => {
    return purchaseHistoryMap.get(voucherNo)?.rate || 0;
  };

  const getItemNameByVoucher = (voucherNo: string) => {
    return purchaseHistoryMap.get(voucherNo)?.itemName || "General Item";
  };

  const getBatchByVoucher = (voucherNo: string) => {
    return purchaseHistoryMap.get(voucherNo)?.batchNumber || null;
  };

  // Filter transactions based on date range, business filter, & type filter
  const filteredPurchases = useMemo(() => {
    return matchedPurchases.filter((purchase: any) => {
      // Date Filter
      const transactionDate = new Date(purchase.date);
      const fromDate = new Date(filters.fromDate);
      fromDate.setHours(0, 0, 0, 0);
      const toDate = new Date(filters.toDate);
      toDate.setHours(23, 59, 59, 999);

      const dateInRange = transactionDate >= fromDate && transactionDate <= toDate;
      if (!dateInRange) return false;

      // Business/Party Filter
      const party = ledgerMap.get(purchase.partyId);
      const partyName = party?.name || "";
      if (
        filters.businessFilter &&
        !partyName.toLowerCase().includes(filters.businessFilter.toLowerCase())
      ) {
        return false;
      }

      // Type Filter (B2B vs B2C)
      if (filters.typeFilter) {
        const isB2B = party?.gstNumber && String(party.gstNumber).trim() !== "";
        const type = isB2B ? "B2B" : "B2C";
        if (type !== filters.typeFilter) return false;
      }

      return true;
    });
  }, [matchedPurchases, filters, ledgerMap]);

  // Derive HSN Dashboard Summary Cards
  const hsnSummaryList = useMemo(() => {
    const map = new Map<string, any>();

    filteredPurchases.forEach((purchase: any) => {
      const hsn = getHsnByVoucher(purchase.number);
      const party = ledgerMap.get(purchase.partyId);
      const isB2B = party?.gstNumber && String(party.gstNumber).trim() !== "";
      const qty = Number(getQtyByVoucher(purchase.number)) || 0;
      const subtotal = Number(purchase.subtotal || 0);
      const cgst = Number(purchase.cgstTotal || 0);
      const sgst = Number(purchase.sgstTotal || 0);
      const igst = Number(purchase.igstTotal || 0);
      const tax = cgst + sgst + igst;
      const total = Number(purchase.total || 0);
      const itemName = getItemNameByVoucher(purchase.number);
      const unit = purchaseHistoryMap.get(purchase.number)?.unit || "";
      const batchNum = getBatchByVoucher(purchase.number);

      if (!map.has(hsn)) {
        map.set(hsn, {
          hsnCode: hsn,
          batchName: batchNum || "Batch 1",
          transactionCount: 0,
          totalQty: 0,
          units: new Set<string>(),
          totalTaxableValue: 0,
          totalCgst: 0,
          totalSgst: 0,
          totalIgst: 0,
          totalTax: 0,
          totalValue: 0,
          b2bCount: 0,
          b2cCount: 0,
          itemNames: new Set<string>()
        });
      }

      const item = map.get(hsn);
      item.transactionCount += 1;
      item.totalQty += qty;
      if (unit) item.units.add(unit.toLowerCase());
      item.totalTaxableValue += subtotal;
      item.totalCgst += cgst;
      item.totalSgst += sgst;
      item.totalIgst += igst;
      item.totalTax += tax;
      item.totalValue += total;
      if (isB2B) item.b2bCount += 1;
      else item.b2cCount += 1;
      if (itemName) item.itemNames.add(itemName);
      if (batchNum && (!item.batchName || item.batchName === "Batch 1")) {
        item.batchName = batchNum;
      }
    });

    const result = Array.from(map.values()).map((hsnObj) => {
      const mainUnit = Array.from(hsnObj.units)[0] || "";
      return {
        ...hsnObj,
        mainUnit,
        itemNamesList: Array.from(hsnObj.itemNames)
      };
    });

    result.sort((a, b) => b.totalValue - a.totalValue);
    return result;
  }, [filteredPurchases, ledgerMap, purchaseHistoryMap]);

  // Filtered HSN List for Dashboard (with assigned color themes)
  const dashboardFilteredHsns = useMemo(() => {
    return hsnSummaryList
      .map((item, index) => ({
        ...item,
        colorTheme: CARD_COLOR_PALETTES[index % CARD_COLOR_PALETTES.length]
      }))
      .filter((item) => {
        if (!dashboardHsnSearch.trim()) return true;
        const query = dashboardHsnSearch.toLowerCase().trim();
        return (
          item.hsnCode.toLowerCase().includes(query) ||
          item.itemNamesList.some((name: string) =>
            name.toLowerCase().includes(query)
          )
        );
      });
  }, [hsnSummaryList, dashboardHsnSearch]);

  // HSN Click Action: Set selected HSN & switch automatically to Details tab!
  const handleHsnCardClick = (hsnCode: string) => {
    setSelectedHsnCode(hsnCode);
    setActiveTab("details");
  };

  // Filtered transactions for Details Tab (STRICTLY selected HSN records)
  const selectedHsnPurchases = useMemo(() => {
    if (!selectedHsnCode) return filteredPurchases;
    return filteredPurchases.filter(
      (purchase) => getHsnByVoucher(purchase.number) === selectedHsnCode
    );
  }, [filteredPurchases, selectedHsnCode, purchaseHistoryMap]);

  // Search inside Details Tab (supplier name or voucher number)
  const searchedDetailPurchases = useMemo(() => {
    if (!detailSearchQuery.trim()) return selectedHsnPurchases;
    const q = detailSearchQuery.toLowerCase().trim();
    return selectedHsnPurchases.filter((purchase) => {
      const partyLedger = ledgerMap.get(purchase.partyId);
      const supplierName = (partyLedger?.name || "").toLowerCase();
      const voucherNo = (purchase.number || "").toLowerCase();
      const gstNo = (partyLedger?.gstNumber || "").toLowerCase();
      return supplierName.includes(q) || voucherNo.includes(q) || gstNo.includes(q);
    });
  }, [selectedHsnPurchases, detailSearchQuery, ledgerMap]);

  // Sort Detail Purchases
  const sortedDetailPurchases = useMemo(() => {
    return [...searchedDetailPurchases].sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      switch (sortField) {
        case "hsn":
          valA = getHsnByVoucher(a.number);
          valB = getHsnByVoucher(b.number);
          break;
        case "date":
          valA = new Date(a.date).getTime();
          valB = new Date(b.date).getTime();
          break;
        case "voucherNo":
          valA = a.number || "";
          valB = b.number || "";
          break;
        case "customer":
        case "supplier":
          valA = ledgerMap.get(a.partyId)?.name || "";
          valB = ledgerMap.get(b.partyId)?.name || "";
          break;
        case "qty":
          valA = getQtyByVoucher(a.number);
          valB = getQtyByVoucher(b.number);
          break;
        case "amount":
          valA = Number(a.subtotal || 0);
          valB = Number(b.subtotal || 0);
          break;
        case "totalAmount":
          valA = Number(a.total || 0);
          valB = Number(b.total || 0);
          break;
        default:
          valA = new Date(a.date).getTime();
          valB = new Date(b.date).getTime();
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [searchedDetailPurchases, sortField, sortDirection, ledgerMap, purchaseHistoryMap]);

  // Paginated Detail Purchases
  const totalPages = Math.ceil(sortedDetailPurchases.length / pageSize) || 1;
  const paginatedDetailPurchases = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedDetailPurchases.slice(start, start + pageSize);
  }, [sortedDetailPurchases, currentPage, pageSize]);

  // Reset pagination when filter or selection changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedHsnCode, detailSearchQuery, pageSize]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // DYNAMIC GRAND TOTAL Calculation for Details Tab
  const detailsGrandTotals = useMemo(() => {
    return sortedDetailPurchases.reduce(
      (acc: any, purchase: any) => {
        acc.qty += Number(getQtyByVoucher(purchase.number)) || 0;
        acc.amount += Number(purchase.subtotal || 0);
        acc.taxValue +=
          Number(purchase.igstTotal || 0) +
          Number(purchase.cgstTotal || 0) +
          Number(purchase.sgstTotal || 0);
        acc.igst += Number(purchase.igstTotal || 0);
        acc.cgst += Number(purchase.cgstTotal || 0);
        acc.sgst += Number(purchase.sgstTotal || 0);
        acc.total += Number(purchase.total || 0);
        return acc;
      },
      { qty: 0, amount: 0, taxValue: 0, igst: 0, cgst: 0, sgst: 0, total: 0 }
    );
  }, [sortedDetailPurchases, purchaseHistoryMap]);

  // Export Details Data to Excel
  const handleExportDetails = () => {
    const exportData = sortedDetailPurchases.map((purchase: any) => {
      const partyLedger = ledgerMap.get(purchase.partyId);
      const taxValue =
        Number(purchase.igstTotal || 0) +
        Number(purchase.cgstTotal || 0) +
        Number(purchase.sgstTotal || 0);

      return {
        HSN: getHsnByVoucher(purchase.number),
        Supplier: partyLedger?.name || "Unknown Party",
        "Voucher No": purchase.number,
        QTY: getQtyByVoucher(purchase.number),
        Rate: getRateByVoucher(purchase.number),
        Amount: Number(purchase.subtotal || 0),
        "Tax Value": taxValue,
        IGST: Number(purchase.igstTotal || 0),
        CGST: Number(purchase.cgstTotal || 0),
        SGST: Number(purchase.sgstTotal || 0),
        "Total Amount": Number(purchase.total || 0),
        Date: new Date(purchase.date).toLocaleDateString("en-IN"),
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    const sheetName = selectedHsnCode ? `HSN_${selectedHsnCode}` : "All_Purchase_HSN_Details";
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(
      wb,
      `${sheetName}_Report_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="pt-[56px] px-4 min-h-screen pb-12 transition-colors">
      {/* Header & Main Page Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center">
          <button
            onClick={() => navigate("/app/reports")}
            title="Back to Reports"
            className={`p-2.5 rounded-xl mr-3 transition-colors ${
              theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700"
                : "bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 shadow-sm"
            }`}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="text-blue-600 dark:text-blue-400" size={28} />
              All Purchase HSN Report
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              Batch-wise dashboard selection and detailed filtered line-item analytics
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            title="Toggle Filters"
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
              showFilterPanel
                ? "bg-blue-600 text-white shadow-md"
                : theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700"
                : "bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 shadow-sm"
            }`}
          >
            <Filter size={16} />
            <span>Filters</span>
          </button>

          <button
            onClick={handleExportDetails}
            title="Export Data to Excel"
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
              theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700"
                : "bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 shadow-sm"
            }`}
          >
            <Download size={16} />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Global Filter Bar */}
      {showFilterPanel && (
        <div
          className={`p-5 rounded-2xl mb-6 transition-all border ${
            theme === "dark"
              ? "bg-gray-800 border-gray-700 text-white shadow-lg"
              : "bg-white border-gray-200 text-gray-900 shadow-md"
          }`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                Date Range
              </label>
              <select
                value={filters.dateRange}
                onChange={(e) => handleDateRangeChange(e.target.value)}
                className={`w-full p-2.5 text-sm rounded-xl border ${
                  theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-white"
                    : "bg-gray-50 border-gray-300 text-black"
                } outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value="today">Today</option>
                <option value="this-week">This Week</option>
                <option value="this-month">This Month</option>
                <option value="this-quarter">This Quarter</option>
                <option value="this-year">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {filters.dateRange === "custom" && (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={filters.fromDate}
                    onChange={(e) => handleFilterChange("fromDate", e.target.value)}
                    className={`w-full p-2.5 text-sm rounded-xl border ${
                      theme === "dark"
                        ? "bg-gray-700 border-gray-600 text-white"
                        : "bg-gray-50 border-gray-300 text-black"
                    } outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={filters.toDate}
                    onChange={(e) => handleFilterChange("toDate", e.target.value)}
                    className={`w-full p-2.5 text-sm rounded-xl border ${
                      theme === "dark"
                        ? "bg-gray-700 border-gray-600 text-white"
                        : "bg-gray-50 border-gray-300 text-black"
                    } outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                Supplier / Business Name
              </label>
              <input
                type="text"
                placeholder="Search party..."
                value={filters.businessFilter}
                onChange={(e) =>
                  handleFilterChange("businessFilter", e.target.value)
                }
                className={`w-full p-2.5 text-sm rounded-xl border ${
                  theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                    : "bg-gray-50 border-gray-300 text-black placeholder-gray-400"
                } outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                Type
              </label>
              <select
                value={filters.typeFilter}
                onChange={(e) =>
                  handleFilterChange("typeFilter", e.target.value)
                }
                className={`w-full p-2.5 text-sm rounded-xl border ${
                  theme === "dark"
                    ? "bg-gray-700 border-gray-600 text-white"
                    : "bg-gray-50 border-gray-300 text-black"
                } outline-none focus:ring-2 focus:ring-blue-500`}
              >
                <option value="">All Types (B2B + B2C)</option>
                <option value="B2B">B2B Only</option>
                <option value="B2C">B2C Only</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* TOP TAB NAVIGATION BAR */}
      <div className="flex items-center space-x-2 border-b border-gray-200 dark:border-gray-700 mb-6 pb-2">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeTab === "dashboard"
              ? "bg-blue-600 text-white shadow-md"
              : theme === "dark"
              ? "bg-gray-800 text-gray-400 hover:text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <LayoutGrid size={18} />
          <span>Dashboard</span>
          <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-white/20">
            {hsnSummaryList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("details")}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeTab === "details"
              ? "bg-blue-600 text-white shadow-md"
              : theme === "dark"
              ? "bg-gray-800 text-gray-400 hover:text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <ListFilter size={18} />
          <span>Details</span>
          {selectedHsnCode && (
            <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-blue-500 text-white font-mono">
              HSN: {selectedHsnCode}
            </span>
          )}
        </button>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="flex flex-col items-center justify-center p-16 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50">
          <RefreshCw className="animate-spin text-blue-600 mb-4" size={36} />
          <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
            Loading Purchase HSN Report Data...
          </p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="p-6 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 flex flex-col items-center text-center">
          <AlertCircle className="text-rose-600 mb-2" size={36} />
          <h3 className="text-lg font-bold text-rose-800 dark:text-rose-300">
            Failed to Load Report
          </h3>
          <p className="text-sm text-rose-600 dark:text-rose-400 mt-1 max-w-md">
            {error}
          </p>
          <button
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-rose-600 text-white text-sm font-medium rounded-xl hover:bg-rose-700 transition-colors shadow-sm"
          >
            Retry Loading
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 1: DASHBOARD TAB CONTENT                                        */}
      {/* =================================================================== */}
      {!loading && !error && activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* Dashboard Filter & Header Bar */}
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              theme === "dark"
                ? "bg-gray-800/90 border-gray-700"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <div className="flex items-center gap-2">
              <PieChart className="text-blue-600 dark:text-blue-400" size={20} />
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                Purchase HSN Overview
              </h2>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                (Click any HSN card to view filtered Details)
              </span>
            </div>

            {/* HSN Quick Search */}
            <div className="relative w-full sm:w-72">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search HSN code or item..."
                value={dashboardHsnSearch}
                onChange={(e) => setDashboardHsnSearch(e.target.value)}
                className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border ${
                  theme === "dark"
                    ? "bg-gray-700/80 border-gray-600 text-white placeholder-gray-400"
                    : "bg-gray-50 border-gray-200 text-black placeholder-gray-400"
                } outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>
          </div>

          {/* Direct 3-Column HSN Cards Grid (Without Batch Headers) */}
          {dashboardFilteredHsns.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400 text-sm">
              No Purchase HSN data found for the selected criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {dashboardFilteredHsns.map((item) => {
                const isSelected = selectedHsnCode === item.hsnCode;
                const themeStyle = item.colorTheme;

                return (
                  <div
                    key={item.hsnCode}
                    onClick={() => handleHsnCardClick(item.hsnCode)}
                    className={`p-5 rounded-2xl cursor-pointer transition-all duration-300 ${
                      themeStyle.cardBg
                    } ${
                      isSelected
                        ? "ring-4 ring-white/90 shadow-2xl scale-[1.02]"
                        : "shadow-md"
                    } transform hover:-translate-y-1.5 hover:shadow-2xl flex flex-col justify-between space-y-4`}
                  >
                    {/* Header: Large HSN Number */}
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider block opacity-85 text-white">
                          HSN CODE
                        </span>
                        <h3 className="text-3xl font-black font-mono tracking-tight text-white mt-0.5">
                          {item.hsnCode}
                        </h3>
                      </div>
                      <span
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl ${themeStyle.badgeBg}`}
                      >
                        Details →
                      </span>
                    </div>

                    {/* Footer: Total Invoice */}
                    <div className={`pt-3 border-t ${themeStyle.divider} flex items-center justify-between`}>
                      <span className={`text-xs font-semibold ${themeStyle.totalLabel}`}>
                        Total Invoice
                      </span>
                      <span className={themeStyle.totalAmount}>
                        {formatCurrency(item.totalValue)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: DETAILS TAB CONTENT (FILTERED DATA)                          */}
      {/* =================================================================== */}
      {!loading && !error && activeTab === "details" && (
        <div className="space-y-5">
          {/* Details Header & Selected HSN Filter Banner */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              theme === "dark"
                ? "bg-gray-800/90 border-gray-700 shadow-md"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Purchase HSN Details Report
                  </h2>
                  {selectedHsnCode ? (
                    <span className="px-3 py-1 text-xs font-mono font-bold rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800">
                      Selected HSN: {selectedHsnCode}
                    </span>
                  ) : (
                    <span className="px-3 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      All Purchase HSN Records
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-2">
                  {selectedHsnCode && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      Filter: HSN = {selectedHsnCode}
                    </span>
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Showing {sortedDetailPurchases.length} filtered transaction records
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                {selectedHsnCode && (
                  <button
                    onClick={() => {
                      setSelectedHsnCode(null);
                      setActiveTab("dashboard");
                    }}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
                      theme === "dark"
                        ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                    }`}
                  >
                    <ArrowLeftCircle size={15} />
                    <span>Clear Filter / Back to Dashboard</span>
                  </button>
                )}

                <button
                  onClick={handleExportDetails}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-all"
                >
                  <Download size={14} />
                  <span>Export Excel</span>
                </button>
              </div>
            </div>
          </div>

          {/* Details Table Card */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              theme === "dark"
                ? "bg-gray-800/90 border-gray-700 shadow-md"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            {/* Search Box inside Details Table */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Filtered Transactions Table
              </h3>

              <div className="relative w-full sm:w-64">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder="Search supplier, voucher..."
                  value={detailSearchQuery}
                  onChange={(e) => setDetailSearchQuery(e.target.value)}
                  className={`w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border ${
                    theme === "dark"
                      ? "bg-gray-700/80 border-gray-600 text-white placeholder-gray-400"
                      : "bg-gray-50 border-gray-200 text-black placeholder-gray-400"
                  } outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>
            </div>

            {/* Scrollable Table Container */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-xs text-left border-collapse">
                <thead
                  className={`${
                    theme === "dark"
                      ? "bg-gray-700/80 text-gray-200"
                      : "bg-gray-50 text-gray-700"
                  } font-semibold uppercase tracking-wider select-none`}
                >
                  <tr>
                    <th
                      className="p-3 cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-600/50"
                      onClick={() => handleSort("hsn")}
                    >
                      <div className="flex items-center gap-1">
                        HSN
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-600/50"
                      onClick={() => handleSort("supplier")}
                    >
                      <div className="flex items-center gap-1">
                        Supplier / Party
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-600/50"
                      onClick={() => handleSort("voucherNo")}
                    >
                      <div className="flex items-center gap-1">
                        Voucher No
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                    <th
                      className="p-3 text-right cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-600/50"
                      onClick={() => handleSort("qty")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        QTY
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                    <th className="p-3 text-right">Rate</th>
                    <th
                      className="p-3 text-right cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-600/50"
                      onClick={() => handleSort("amount")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Amount
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                    <th className="p-3 text-right">Tax Value</th>
                    <th className="p-3 text-right">IGST</th>
                    <th className="p-3 text-right">CGST</th>
                    <th className="p-3 text-right">SGST</th>
                    <th
                      className="p-3 text-right cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-600/50"
                      onClick={() => handleSort("totalAmount")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Total Amount
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                    <th
                      className="p-3 cursor-pointer hover:bg-gray-200/50 dark:hover:bg-gray-600/50"
                      onClick={() => handleSort("date")}
                    >
                      <div className="flex items-center gap-1">
                        Date
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedDetailPurchases.length === 0 ? (
                    <tr>
                      <td
                        colSpan={12}
                        className="text-center p-8 text-gray-500 dark:text-gray-400"
                      >
                        No records found for the selected HSN or search query.
                      </td>
                    </tr>
                  ) : (
                    paginatedDetailPurchases.map((purchase: any, index: number) => {
                      const partyLedger = ledgerMap.get(purchase.partyId);
                      const hsn = getHsnByVoucher(purchase.number);
                      const taxValue =
                        Number(purchase.igstTotal || 0) +
                        Number(purchase.cgstTotal || 0) +
                        Number(purchase.sgstTotal || 0);

                      return (
                        <tr
                          key={purchase.id || index}
                          className={`transition-colors ${
                            theme === "dark"
                              ? "hover:bg-gray-700/50"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                            {hsn}
                          </td>

                          <td className="p-3 font-medium text-gray-900 dark:text-white max-w-[180px] truncate">
                            {partyLedger?.name || "Unknown Party"}
                          </td>

                          <td className="p-3 font-mono font-medium text-gray-800 dark:text-gray-200">
                            {purchase.number}
                          </td>

                          <td className="p-3 text-right font-medium">
                            {getQtyWithUnitByVoucher(purchase.number)}
                          </td>

                          <td className="p-3 text-right font-mono text-gray-600 dark:text-gray-300">
                            ₹{Number(getRateByVoucher(purchase.number)).toFixed(2)}
                          </td>

                          <td className="p-3 text-right font-medium text-gray-900 dark:text-white">
                            ₹{Number(purchase.subtotal || 0).toFixed(2)}
                          </td>

                          <td className="p-3 text-right font-medium text-gray-800 dark:text-gray-200">
                            ₹{taxValue.toFixed(2)}
                          </td>

                          <td className="p-3 text-right text-gray-500 dark:text-gray-400">
                            ₹{Number(purchase.igstTotal || 0).toFixed(2)}
                          </td>

                          <td className="p-3 text-right text-gray-500 dark:text-gray-400">
                            ₹{Number(purchase.cgstTotal || 0).toFixed(2)}
                          </td>

                          <td className="p-3 text-right text-gray-500 dark:text-gray-400">
                            ₹{Number(purchase.sgstTotal || 0).toFixed(2)}
                          </td>

                          <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                            ₹{Number(purchase.total || 0).toFixed(2)}
                          </td>

                          <td className="p-3 whitespace-nowrap text-gray-600 dark:text-gray-300">
                            {new Date(purchase.date).toLocaleDateString("en-IN")}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* DYNAMIC GRAND TOTAL FOOTER ROW */}
                <tfoot
                  className={`font-bold border-t-2 ${
                    theme === "dark"
                      ? "bg-gray-700/90 text-white border-gray-600"
                      : "bg-gray-100 text-gray-900 border-gray-300"
                  }`}
                >
                  <tr>
                    <td className="p-3" colSpan={3}>
                      Grand Total ({sortedDetailPurchases.length} Records)
                    </td>
                    <td className="p-3 text-right font-mono">
                      {detailsGrandTotals.qty}
                    </td>
                    <td className="p-3 text-right"></td>
                    <td className="p-3 text-right">
                      ₹{detailsGrandTotals.amount.toFixed(2)}
                    </td>
                    <td className="p-3 text-right">
                      ₹{detailsGrandTotals.taxValue.toFixed(2)}
                    </td>
                    <td className="p-3 text-right">
                      ₹{detailsGrandTotals.igst.toFixed(2)}
                    </td>
                    <td className="p-3 text-right">
                      ₹{detailsGrandTotals.cgst.toFixed(2)}
                    </td>
                    <td className="p-3 text-right">
                      ₹{detailsGrandTotals.sgst.toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      ₹{detailsGrandTotals.total.toFixed(2)}
                    </td>
                    <td className="p-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pagination Controls */}
            {sortedDetailPurchases.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className={`px-2 py-1 rounded-lg border ${
                      theme === "dark"
                        ? "bg-gray-700 border-gray-600 text-white"
                        : "bg-gray-50 border-gray-300 text-black"
                    } outline-none`}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>entries per page</span>
                </div>

                <div className="text-gray-600 dark:text-gray-300">
                  Showing{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {(currentPage - 1) * pageSize + 1}
                  </span>{" "}
                  to{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {Math.min(currentPage * pageSize, sortedDetailPurchases.length)}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {sortedDetailPurchases.length}
                  </span>{" "}
                  entries
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <ChevronsLeft size={14} />
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="px-3 py-1 font-medium text-gray-900 dark:text-white">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(p + 1, totalPages))
                    }
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <ChevronRight size={14} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <ChevronsRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AllHsnPurachase;