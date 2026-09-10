import React, { useState, useMemo, useEffect } from "react";
import { useAppContext } from "../../context/AppContext";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Filter,
  Layers,
  Search,
  Hash,
  Package,
  IndianRupee,
  FileText,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  Tag,
  Sparkles,
  RefreshCw,
  AlertCircle,
  PieChart,
  LayoutGrid,
  ListFilter,
  X,
  ArrowLeftCircle
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

const AllSaleHsn: React.FC = () => {
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

  const [saleData, setSaleData] = useState<any[]>([]);
  const [partyIds, setPartyIds] = useState<number[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [matchedSales, setMatchedSales] = useState<any[]>([]);

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

  // Fetch Sales Vouchers, Ledgers, & History in parallel
  const fetchData = async () => {
    if (!companyId || !ownerType || !ownerId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const salesUrl = `${import.meta.env.VITE_API_URL}/api/sales-vouchers?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
      const ledgerUrl = `${import.meta.env.VITE_API_URL}/api/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
      const historyUrl = `${import.meta.env.VITE_API_URL}/api/sales-vouchers/sale-history?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;

      const [salesRes, ledgerRes, historyRes] = await Promise.all([
        fetch(salesUrl),
        fetch(ledgerUrl),
        fetch(historyUrl)
      ]);

      const salesJson = await salesRes.json();
      const ledgerJson = await ledgerRes.json();
      const historyJson = await historyRes.json();

      const vouchers = Array.isArray(salesJson?.data)
        ? salesJson.data
        : Array.isArray(salesJson)
        ? salesJson
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

      setSaleData(vouchers);
      setPartyIds(allPartyIds);
      setLedger(ledgersList);
      setSalesHistory(historyRows);
    } catch (err: any) {
      console.error("Failed to load HSN Report data:", err);
      setError(err?.message || "Failed to load report data from server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [companyId, ownerType, ownerId]);

  // Match Sales with Ledgers
  useEffect(() => {
    if (!partyIds.length || !ledger.length || !saleData.length) {
      setMatchedSales(saleData);
      return;
    }

    const partyIdSet = new Set(partyIds);
    const relevantLedgers = ledger.filter((l: any) => partyIdSet.has(l.id));
    const relevantLedgerIdSet = new Set(relevantLedgers.map((l: any) => l.id));

    const filteredSales = saleData.filter((s: any) =>
      relevantLedgerIdSet.has(s.partyId)
    );

    setMatchedSales(filteredSales);
  }, [partyIds, ledger, saleData]);

  // Ledger Lookup Map
  const ledgerMap = useMemo(() => {
    const map = new Map<number, any>();
    ledger.forEach((l: any) => {
      map.set(l.id, l);
    });
    return map;
  }, [ledger]);

  // Sales History Lookup Map by Voucher Number
  const salesHistoryMap = useMemo(() => {
    return new Map(salesHistory.map((h: any) => [h.voucherNumber, h]));
  }, [salesHistory]);

  const getHsnByVoucher = (voucherNo: string) => {
    const rawHsn = salesHistoryMap.get(voucherNo)?.hsnCode;
    if (!rawHsn || String(rawHsn).trim() === "" || rawHsn === "-") {
      return "N/A";
    }
    return String(rawHsn).trim().toUpperCase();
  };

  const getQtyByVoucher = (voucherNo: string) => {
    const qty = salesHistoryMap.get(voucherNo)?.qtyChange;
    return qty ? Math.abs(qty) : 0;
  };

  const getQtyWithUnitByVoucher = (voucherNo: string) => {
    const hRecord = salesHistoryMap.get(voucherNo);
    if (!hRecord) return "-";
    const qty = hRecord.qtyChange ? Math.abs(hRecord.qtyChange) : 0;
    if (qty === 0) return "-";
    const unitSymbol = hRecord.unit;
    return `${qty} ${unitSymbol ? unitSymbol.toLowerCase() : ""}`.trim();
  };

  const getRateByVoucher = (voucherNo: string) => {
    return salesHistoryMap.get(voucherNo)?.rate || 0;
  };

  const getItemNameByVoucher = (voucherNo: string) => {
    return salesHistoryMap.get(voucherNo)?.itemName || "General Item";
  };

  const getBatchByVoucher = (voucherNo: string) => {
    return salesHistoryMap.get(voucherNo)?.batchNumber || null;
  };

  // Filter transactions based on date range, business filter, & type filter
  const filteredSales = useMemo(() => {
    return matchedSales.filter((sale: any) => {
      // Date Filter
      const transactionDate = new Date(sale.date);
      const fromDate = new Date(filters.fromDate);
      fromDate.setHours(0, 0, 0, 0);
      const toDate = new Date(filters.toDate);
      toDate.setHours(23, 59, 59, 999);

      const dateInRange = transactionDate >= fromDate && transactionDate <= toDate;
      if (!dateInRange) return false;

      // Business/Party Filter
      const party = ledgerMap.get(sale.partyId);
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
  }, [matchedSales, filters, ledgerMap]);

  // Derive HSN Dashboard Summary Cards
  const hsnSummaryList = useMemo(() => {
    const map = new Map<string, any>();

    filteredSales.forEach((sale: any) => {
      const hsn = getHsnByVoucher(sale.number);
      const party = ledgerMap.get(sale.partyId);
      const isB2B = party?.gstNumber && String(party.gstNumber).trim() !== "";
      const qty = Number(getQtyByVoucher(sale.number)) || 0;
      const subtotal = Number(sale.subtotal || 0);
      const cgst = Number(sale.cgstTotal || 0);
      const sgst = Number(sale.sgstTotal || 0);
      const igst = Number(sale.igstTotal || 0);
      const tax = cgst + sgst + igst;
      const total = Number(sale.total || 0);
      const itemName = getItemNameByVoucher(sale.number);
      const unit = salesHistoryMap.get(sale.number)?.unit || "";
      const batchNum = getBatchByVoucher(sale.number);

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

    const result = Array.from(map.values()).map((hsnObj, index) => {
      const mainUnit = Array.from(hsnObj.units)[0] || "";
      return {
        ...hsnObj,
        mainUnit,
        itemNamesList: Array.from(hsnObj.itemNames)
      };
    });

    result.sort((a, b) => b.totalValue - a.totalValue);
    return result;
  }, [filteredSales, ledgerMap, salesHistoryMap]);

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
  const selectedHsnSales = useMemo(() => {
    if (!selectedHsnCode) return filteredSales;
    return filteredSales.filter(
      (sale) => getHsnByVoucher(sale.number) === selectedHsnCode
    );
  }, [filteredSales, selectedHsnCode, salesHistoryMap]);

  // Search inside Details Tab (customer name or voucher number)
  const searchedDetailSales = useMemo(() => {
    if (!detailSearchQuery.trim()) return selectedHsnSales;
    const q = detailSearchQuery.toLowerCase().trim();
    return selectedHsnSales.filter((sale) => {
      const partyLedger = ledgerMap.get(sale.partyId);
      const customerName = (partyLedger?.name || "").toLowerCase();
      const voucherNo = (sale.number || "").toLowerCase();
      const gstNo = (partyLedger?.gstNumber || "").toLowerCase();
      return customerName.includes(q) || voucherNo.includes(q) || gstNo.includes(q);
    });
  }, [selectedHsnSales, detailSearchQuery, ledgerMap]);

  // Sort Detail Sales
  const sortedDetailSales = useMemo(() => {
    return [...searchedDetailSales].sort((a, b) => {
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
  }, [searchedDetailSales, sortField, sortDirection, ledgerMap, salesHistoryMap]);

  // Paginated Detail Sales
  const totalPages = Math.ceil(sortedDetailSales.length / pageSize) || 1;
  const paginatedDetailSales = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedDetailSales.slice(start, start + pageSize);
  }, [sortedDetailSales, currentPage, pageSize]);

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
    return sortedDetailSales.reduce(
      (acc: any, sale: any) => {
        acc.qty += Number(getQtyByVoucher(sale.number)) || 0;
        acc.amount += Number(sale.subtotal || 0);
        acc.taxValue +=
          Number(sale.igstTotal || 0) +
          Number(sale.cgstTotal || 0) +
          Number(sale.sgstTotal || 0);
        acc.igst += Number(sale.igstTotal || 0);
        acc.cgst += Number(sale.cgstTotal || 0);
        acc.sgst += Number(sale.sgstTotal || 0);
        acc.total += Number(sale.total || 0);
        return acc;
      },
      { qty: 0, amount: 0, taxValue: 0, igst: 0, cgst: 0, sgst: 0, total: 0 }
    );
  }, [sortedDetailSales, salesHistoryMap]);

  // Export Details Data to Excel
  const handleExportDetails = () => {
    const exportData = sortedDetailSales.map((sale: any) => {
      const partyLedger = ledgerMap.get(sale.partyId);
      const taxValue =
        Number(sale.igstTotal || 0) +
        Number(sale.cgstTotal || 0) +
        Number(sale.sgstTotal || 0);

      return {
        HSN: getHsnByVoucher(sale.number),
        Supplier: partyLedger?.name || "Unknown Party",
        "Voucher No": sale.number,
        QTY: getQtyByVoucher(sale.number),
        Rate: getRateByVoucher(sale.number),
        Amount: Number(sale.subtotal || 0),
        "Tax Value": taxValue,
        IGST: Number(sale.igstTotal || 0),
        CGST: Number(sale.cgstTotal || 0),
        SGST: Number(sale.sgstTotal || 0),
        "Total Amount": Number(sale.total || 0),
        Date: new Date(sale.date).toLocaleDateString("en-IN"),
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    const sheetName = selectedHsnCode ? `HSN_${selectedHsnCode}` : "All_HSN_Details";
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
              <Layers className="text-blue-600 dark:text-blue-400" size={28} />
              All Sale HSN Report
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
            Loading HSN Report Data...
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
        <div className="space-y-4">
          {/* Header Bar */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              theme === "dark"
                ? "bg-gray-800/90 border-gray-700"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <div className="flex items-center gap-2">
              <PieChart className="text-blue-600 dark:text-blue-400" size={18} />
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                HSN Summary
              </h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({dashboardFilteredHsns.length} HSN codes) — Click a row to view Details
              </span>
            </div>

            {/* HSN Quick Search */}
            <div className="relative w-full sm:w-64">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search HSN code..."
                value={dashboardHsnSearch}
                onChange={(e) => setDashboardHsnSearch(e.target.value)}
                className={`w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border ${
                  theme === "dark"
                    ? "bg-gray-700/80 border-gray-600 text-white placeholder-gray-400"
                    : "bg-gray-50 border-gray-200 text-black placeholder-gray-400"
                } outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>
          </div>

          {/* Excel-Style HSN Summary Table */}
          {dashboardFilteredHsns.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400 text-sm">
              No HSN data found for the selected criteria.
            </div>
          ) : (
            <div
              className={`rounded-xl border overflow-hidden ${
                theme === "dark" ? "border-gray-700" : "border-gray-300"
              }`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className={`${
                      theme === "dark"
                        ? "bg-blue-900/60 text-blue-100"
                        : "bg-blue-600 text-white"
                    }`}>
                      <th className="px-5 py-3.5 text-left font-bold border-r border-white/20 dark:border-blue-700 w-8">#</th>
                      <th className="px-5 py-3.5 text-left font-bold border-r border-white/20 dark:border-blue-700">HSN Code</th>
                      <th className="px-5 py-3.5 text-right font-bold border-r border-white/20 dark:border-blue-700">Taxable Value</th>
                      <th className="px-5 py-3.5 text-right font-bold border-r border-white/20 dark:border-blue-700">IGST</th>
                      <th className="px-5 py-3.5 text-right font-bold border-r border-white/20 dark:border-blue-700">CGST</th>
                      <th className="px-5 py-3.5 text-right font-bold border-r border-white/20 dark:border-blue-700">SGST</th>
                      <th className="px-5 py-3.5 text-right font-bold border-r border-white/20 dark:border-blue-700">Total Tax</th>
                      <th className="px-5 py-3.5 text-right font-bold border-r border-white/20 dark:border-blue-700">Total Invoice</th>
                      <th className="px-5 py-3.5 text-center font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardFilteredHsns.map((item, idx) => {
                      const isSelected = selectedHsnCode === item.hsnCode;
                      return (
                        <tr
                          key={item.hsnCode}
                          onClick={() => handleHsnCardClick(item.hsnCode)}
                          className={`cursor-pointer border-b transition-colors ${
                            isSelected
                              ? theme === "dark"
                                ? "bg-blue-900/40 border-blue-700"
                                : "bg-blue-50 border-blue-200"
                              : idx % 2 === 0
                              ? theme === "dark"
                                ? "bg-gray-800 border-gray-700 hover:bg-gray-750"
                                : "bg-white border-gray-200 hover:bg-blue-50/40"
                              : theme === "dark"
                              ? "bg-gray-800/60 border-gray-700 hover:bg-gray-750"
                              : "bg-gray-50/70 border-gray-200 hover:bg-blue-50/40"
                          }`}
                        >
                          <td className={`px-4 py-2 text-center font-medium border-r ${
                            theme === "dark" ? "border-gray-700 text-gray-400" : "border-gray-200 text-gray-500"
                          }`}>{idx + 1}</td>
                          <td className={`px-4 py-2 border-r font-bold font-mono ${
                            theme === "dark" ? "border-gray-700 text-blue-400" : "border-gray-200 text-blue-700"
                          }`}>{item.hsnCode}</td>
                          <td className={`px-4 py-2 text-right border-r ${
                            theme === "dark" ? "border-gray-700 text-gray-200" : "border-gray-200 text-gray-800"
                          }`}>₹{item.totalTaxableValue.toFixed(2)}</td>
                          <td className={`px-4 py-2 text-right border-r ${
                            theme === "dark" ? "border-gray-700 text-gray-300" : "border-gray-200 text-gray-700"
                          }`}>₹{item.totalIgst.toFixed(2)}</td>
                          <td className={`px-4 py-2 text-right border-r ${
                            theme === "dark" ? "border-gray-700 text-gray-300" : "border-gray-200 text-gray-700"
                          }`}>₹{item.totalCgst.toFixed(2)}</td>
                          <td className={`px-4 py-2 text-right border-r ${
                            theme === "dark" ? "border-gray-700 text-gray-300" : "border-gray-200 text-gray-700"
                          }`}>₹{item.totalSgst.toFixed(2)}</td>
                          <td className={`px-4 py-2 text-right border-r ${
                            theme === "dark" ? "border-gray-700 text-gray-300" : "border-gray-200 text-gray-700"
                          }`}>₹{item.totalTax.toFixed(2)}</td>
                          <td className={`px-4 py-2 text-right border-r font-bold ${
                            theme === "dark" ? "border-gray-700 text-emerald-400" : "border-gray-200 text-emerald-700"
                          }`}>₹{item.totalValue.toFixed(2)}</td>
                          <td className="px-5 py-3.5 text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-md ${
                              theme === "dark"
                                ? "bg-blue-800/60 text-blue-300 border border-blue-700"
                                : "bg-blue-100 text-blue-700 border border-blue-200"
                            }`}>View →</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className={`font-bold border-t-2 ${
                      theme === "dark"
                        ? "bg-gray-700/80 text-white border-gray-500"
                        : "bg-gray-100 text-gray-900 border-gray-400"
                    }`}>
                      <td className={`px-4 py-2 border-r ${theme === "dark" ? "border-gray-600" : "border-gray-300"}`}></td>
                      <td className={`px-4 py-2 border-r ${theme === "dark" ? "border-gray-600" : "border-gray-300"}`}>
                        Grand Total ({dashboardFilteredHsns.length})
                      </td>
                      <td className={`px-4 py-2 text-right border-r ${theme === "dark" ? "border-gray-600" : "border-gray-300"}`}>
                        ₹{dashboardFilteredHsns.reduce((s, i) => s + i.totalTaxableValue, 0).toFixed(2)}
                      </td>
                      <td className={`px-4 py-2 text-right border-r ${theme === "dark" ? "border-gray-600" : "border-gray-300"}`}>
                        ₹{dashboardFilteredHsns.reduce((s, i) => s + i.totalIgst, 0).toFixed(2)}
                      </td>
                      <td className={`px-4 py-2 text-right border-r ${theme === "dark" ? "border-gray-600" : "border-gray-300"}`}>
                        ₹{dashboardFilteredHsns.reduce((s, i) => s + i.totalCgst, 0).toFixed(2)}
                      </td>
                      <td className={`px-4 py-2 text-right border-r ${theme === "dark" ? "border-gray-600" : "border-gray-300"}`}>
                        ₹{dashboardFilteredHsns.reduce((s, i) => s + i.totalSgst, 0).toFixed(2)}
                      </td>
                      <td className={`px-4 py-2 text-right border-r ${theme === "dark" ? "border-gray-600" : "border-gray-300"}`}>
                        ₹{dashboardFilteredHsns.reduce((s, i) => s + i.totalTax, 0).toFixed(2)}
                      </td>
                      <td className={`px-4 py-2 text-right border-r font-bold ${
                        theme === "dark" ? "border-gray-600 text-emerald-400" : "border-gray-300 text-emerald-700"
                      }`}>
                        ₹{dashboardFilteredHsns.reduce((s, i) => s + i.totalValue, 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
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
                    HSN Details Report
                  </h2>
                  {selectedHsnCode ? (
                    <span className="px-3 py-1 text-xs font-mono font-bold rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800">
                      Selected HSN: {selectedHsnCode}
                    </span>
                  ) : (
                    <span className="px-3 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      All HSN Records
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
                    Showing {sortedDetailSales.length} filtered transaction records
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
                      onClick={() => handleSort("customer")}
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
                  {paginatedDetailSales.length === 0 ? (
                    <tr>
                      <td
                        colSpan={12}
                        className="text-center p-8 text-gray-500 dark:text-gray-400"
                      >
                        No records found for the selected HSN or search query.
                      </td>
                    </tr>
                  ) : (
                    paginatedDetailSales.map((sale: any, index: number) => {
                      const partyLedger = ledgerMap.get(sale.partyId);
                      const hsn = getHsnByVoucher(sale.number);
                      const taxValue =
                        Number(sale.igstTotal || 0) +
                        Number(sale.cgstTotal || 0) +
                        Number(sale.sgstTotal || 0);

                      return (
                        <tr
                          key={sale.id || index}
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
                            {sale.number}
                          </td>

                          <td className="p-3 text-right font-medium">
                            {getQtyWithUnitByVoucher(sale.number)}
                          </td>

                          <td className="p-3 text-right font-mono text-gray-600 dark:text-gray-300">
                            ₹{Number(getRateByVoucher(sale.number)).toFixed(2)}
                          </td>

                          <td className="p-3 text-right font-medium text-gray-900 dark:text-white">
                            ₹{Number(sale.subtotal || 0).toFixed(2)}
                          </td>

                          <td className="p-3 text-right font-medium text-gray-800 dark:text-gray-200">
                            ₹{taxValue.toFixed(2)}
                          </td>

                          <td className="p-3 text-right text-gray-500 dark:text-gray-400">
                            ₹{Number(sale.igstTotal || 0).toFixed(2)}
                          </td>

                          <td className="p-3 text-right text-gray-500 dark:text-gray-400">
                            ₹{Number(sale.cgstTotal || 0).toFixed(2)}
                          </td>

                          <td className="p-3 text-right text-gray-500 dark:text-gray-400">
                            ₹{Number(sale.sgstTotal || 0).toFixed(2)}
                          </td>

                          <td className="p-3 text-right font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                            ₹{Number(sale.total || 0).toFixed(2)}
                          </td>

                          <td className="p-3 whitespace-nowrap text-gray-600 dark:text-gray-300">
                            {new Date(sale.date).toLocaleDateString("en-IN")}
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
                      Grand Total ({sortedDetailSales.length} Records)
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
            {sortedDetailSales.length > 0 && (
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
                    {Math.min(currentPage * pageSize, sortedDetailSales.length)}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {sortedDetailSales.length}
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

export default AllSaleHsn;
