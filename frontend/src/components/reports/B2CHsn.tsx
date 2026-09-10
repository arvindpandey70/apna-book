import React, { useState, useMemo, useEffect } from "react";
import { useAppContext } from "../../context/AppContext";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Filter,
  User,
  Search,
  PieChart,
  TableProperties,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import "./reports.css";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface FilterState {
  dateRange: string;
  fromDate: string;
  toDate: string;
}

type ActiveTab = "dashboard" | "details";

// ─────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
const B2CHsn: React.FC = () => {
  const { theme } = useAppContext();
  const navigate = useNavigate();

  const company_id = localStorage.getItem("company_id") || "";
  const owner_type =
    localStorage.getItem("userType") ||
    localStorage.getItem("supplier") ||
    localStorage.getItem("owner_type") ||
    "";
  const owner_id =
    localStorage.getItem("employee_id") ||
    localStorage.getItem("user_id") ||
    "";

  // ── Data States ──────────────────────────────
  const [saleData, setSaleData] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [rawMatchedSales, setRawMatchedSales] = useState<any[]>([]);
  const [partyIds, setPartyIds] = useState<number[]>([]);

  // ── UI States ────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>("dashboard");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [dashboardHsnSearch, setDashboardHsnSearch] = useState("");
  const [selectedHsnCode, setSelectedHsnCode] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    dateRange: "this-year",
    fromDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0],
    toDate: new Date().toISOString().split("T")[0],
  });

  // ── Fetch Sales Vouchers ─────────────────────
  useEffect(() => {
    if (!company_id || !owner_type || !owner_id) return;
    const load = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/sales-vouchers?company_id=${company_id}&owner_type=${owner_type}&owner_id=${owner_id}`
        );
        const json = await res.json();
        const vouchers = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json)
          ? json
          : [];
        setSaleData(vouchers);
        setPartyIds(
          vouchers.map((v: any) => v.partyId).filter((id: any) => id != null)
        );
      } catch {
        setSaleData([]);
        setPartyIds([]);
      }
    };
    load();
  }, [company_id, owner_type, owner_id]);

  // ── Fetch Ledger ─────────────────────────────
  useEffect(() => {
    if (!company_id || !owner_type || !owner_id) return;
    const load = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/ledger?company_id=${company_id}&owner_type=${owner_type}&owner_id=${owner_id}`
        );
        const json = await res.json();
        setLedger(Array.isArray(json) ? json : []);
      } catch {
        setLedger([]);
      }
    };
    load();
  }, [company_id, owner_type, owner_id]);

  // ── Fetch Sales History (HSN) ────────────────
  useEffect(() => {
    if (!company_id || !owner_type || !owner_id) return;
    const load = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/sales-vouchers/sale-history?company_id=${company_id}&owner_type=${owner_type}&owner_id=${owner_id}`
        );
        const json = await res.json();
        const rows = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json)
          ? json
          : [];
        setSalesHistory(rows);
      } catch {
        setSalesHistory([]);
      }
    };
    load();
  }, [company_id, owner_type, owner_id]);

  // ── Match B2C Sales (party must NOT have GSTIN) ──
  useEffect(() => {
    if (!partyIds.length || !ledger.length || !saleData.length) return;
    const partyIdSet = new Set(partyIds);
    // B2C = ledgers WITHOUT gst number
    const noGstLedgers = ledger.filter(
      (l: any) =>
        partyIdSet.has(l.id) && (!l.gstNumber || String(l.gstNumber).trim() === "")
    );
    const noGstLedgerIds = new Set(noGstLedgers.map((l: any) => l.id));
    setRawMatchedSales(saleData.filter((s: any) => noGstLedgerIds.has(s.partyId)));
  }, [partyIds, ledger, saleData]);

  // ── Lookup Maps ──────────────────────────────
  const ledgerMap = useMemo(() => {
    const m = new Map<number, any>();
    ledger.forEach((l: any) => m.set(l.id, l));
    return m;
  }, [ledger]);

  const salesHistoryMap = useMemo(
    () => new Map(salesHistory.map((h: any) => [h.voucherNumber, h])),
    [salesHistory]
  );

  // ── Date-filtered matched sales ──────────────
  const matchedSales = useMemo(() => {
    return rawMatchedSales.filter((s: any) => {
      if (!s.date) return false;
      const d = new Date(s.date);
      d.setHours(0, 0, 0, 0);
      const from = new Date(filters.fromDate);
      from.setHours(0, 0, 0, 0);
      const to = new Date(filters.toDate);
      to.setHours(23, 59, 59, 999);
      return d >= from && d <= to;
    });
  }, [rawMatchedSales, filters]);

  // ── HSN Summary (Dashboard) ──────────────────
  const hsnSummaryList = useMemo(() => {
    const map = new Map<
      string,
      {
        hsnCode: string;
        totalTaxableValue: number;
        totalIgst: number;
        totalCgst: number;
        totalSgst: number;
        totalTax: number;
        totalValue: number;
        transactionCount: number;
      }
    >();

    matchedSales.forEach((sale: any) => {
      const hsn = salesHistoryMap.get(sale.number)?.hsnCode || "N/A";
      if (!map.has(hsn)) {
        map.set(hsn, {
          hsnCode: hsn,
          totalTaxableValue: 0,
          totalIgst: 0,
          totalCgst: 0,
          totalSgst: 0,
          totalTax: 0,
          totalValue: 0,
          transactionCount: 0,
        });
      }
      const item = map.get(hsn)!;
      const igst = Number(sale.igstTotal || 0);
      const cgst = Number(sale.cgstTotal || 0);
      const sgst = Number(sale.sgstTotal || 0);
      item.totalTaxableValue += Number(sale.subtotal || 0);
      item.totalIgst += igst;
      item.totalCgst += cgst;
      item.totalSgst += sgst;
      item.totalTax += igst + cgst + sgst;
      item.totalValue += Number(sale.total || 0);
      item.transactionCount += 1;
    });

    return Array.from(map.values()).sort((a, b) => b.totalValue - a.totalValue);
  }, [matchedSales, salesHistoryMap]);

  // ── Dashboard filtered (search) ──────────────
  const dashboardFilteredHsns = useMemo(() => {
    if (!dashboardHsnSearch.trim()) return hsnSummaryList;
    const q = dashboardHsnSearch.trim().toLowerCase();
    return hsnSummaryList.filter((h) => h.hsnCode.toLowerCase().includes(q));
  }, [hsnSummaryList, dashboardHsnSearch]);

  // ── Details: voucher rows filtered by HSN ────
  const detailRows = useMemo(() => {
    return matchedSales.filter((sale: any) => {
      const hsn = salesHistoryMap.get(sale.number)?.hsnCode || "N/A";
      if (!selectedHsnCode) return true;
      return hsn === selectedHsnCode;
    });
  }, [matchedSales, selectedHsnCode, salesHistoryMap]);

  // ── Handlers ─────────────────────────────────
  const handleHsnRowClick = (hsnCode: string) => {
    setSelectedHsnCode(hsnCode);
    setActiveTab("details");
  };

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleDateRangeChange = (range: string) => {
    if (range === "custom") {
      setFilters((prev) => ({ ...prev, dateRange: range }));
      return;
    }
    const today = new Date();
    let fromDate = new Date();
    let toDate = new Date();
    switch (range) {
      case "today":
        fromDate = toDate = today;
        break;
      case "this-week":
        fromDate = new Date(today.getTime() - today.getDay() * 86400000);
        break;
      case "this-month":
        fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case "this-quarter": {
        const qs = Math.floor(today.getMonth() / 3) * 3;
        fromDate = new Date(today.getFullYear(), qs, 1);
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
  };

  // ── Export ───────────────────────────────────
  const handleExport = () => {
    const data =
      activeTab === "dashboard"
        ? dashboardFilteredHsns.map((h) => ({
            "HSN Code": h.hsnCode,
            "Taxable Value": h.totalTaxableValue.toFixed(2),
            IGST: h.totalIgst.toFixed(2),
            CGST: h.totalCgst.toFixed(2),
            SGST: h.totalSgst.toFixed(2),
            "Total Tax": h.totalTax.toFixed(2),
            "Total Invoice": h.totalValue.toFixed(2),
            Transactions: h.transactionCount,
          }))
        : detailRows.map((sale: any) => {
            const ledgerEntry = ledgerMap.get(sale.partyId);
            const hist = salesHistoryMap.get(sale.number);
            return {
              HSN: hist?.hsnCode || "N/A",
              Customer: ledgerEntry?.name || "Unknown",
              "Voucher No": sale.number,
              QTY: hist?.qtyChange ? Math.abs(hist.qtyChange) : 0,
              Rate: hist?.rate || 0,
              "Taxable Amount": Number(sale.subtotal || 0).toFixed(2),
              IGST: Number(sale.igstTotal || 0).toFixed(2),
              CGST: Number(sale.cgstTotal || 0).toFixed(2),
              SGST: Number(sale.sgstTotal || 0).toFixed(2),
              "Total Amount": Number(sale.total || 0).toFixed(2),
              Date: new Date(sale.date).toLocaleDateString("en-IN"),
            };
          });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      ws,
      activeTab === "dashboard" ? "HSN Summary" : "HSN Details"
    );
    XLSX.writeFile(
      wb,
      `B2C_HSN_${activeTab}_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  const isDark = theme === "dark";

  return (
    <div className="pt-[56px] px-4 pb-8">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/app/reports")}
            title="Back to Reports"
            className={`p-2 rounded-lg ${
              isDark
                ? "bg-gray-700 hover:bg-gray-600 text-white"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <User className="text-purple-600" size={24} />
              B2C HSN Sales Report
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Business-to-Consumer · Ledgers without GSTIN · HSN-wise Summary
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            title="Toggle Filters"
            className={`p-2 rounded-lg ${
              showFilterPanel
                ? "bg-purple-500 text-white"
                : isDark
                ? "bg-gray-700 hover:bg-gray-600 text-white"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
          >
            <Filter size={16} />
          </button>
          <button
            onClick={handleExport}
            title="Export to Excel"
            className={`p-2 rounded-lg ${
              isDark
                ? "bg-gray-700 hover:bg-gray-600 text-white"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* ── Filter Panel ── */}
      {showFilterPanel && (
        <div
          className={`p-4 rounded-xl border mb-4 ${
            isDark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"
          }`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-300">
                Date Range
              </label>
              <select
                value={filters.dateRange}
                onChange={(e) => handleDateRangeChange(e.target.value)}
                className={`w-full p-2 rounded-lg border text-xs ${
                  isDark
                    ? "bg-gray-700 border-gray-600 text-white"
                    : "bg-white border-gray-300 text-black"
                } outline-none`}
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
                  <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-300">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={filters.fromDate}
                    onChange={(e) => handleFilterChange("fromDate", e.target.value)}
                    className={`w-full p-2 rounded-lg border text-xs ${
                      isDark
                        ? "bg-gray-700 border-gray-600 text-white"
                        : "bg-white border-gray-300 text-black"
                    } outline-none`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-300">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={filters.toDate}
                    onChange={(e) => handleFilterChange("toDate", e.target.value)}
                    className={`w-full p-2 rounded-lg border text-xs ${
                      isDark
                        ? "bg-gray-700 border-gray-600 text-white"
                        : "bg-white border-gray-300 text-black"
                    } outline-none`}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div
        className={`flex rounded-xl border mb-4 overflow-hidden ${
          isDark ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white shadow-sm"
        }`}
      >
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "dashboard"
              ? "bg-purple-600 text-white"
              : isDark
              ? "text-gray-300 hover:bg-gray-700"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <PieChart size={15} />
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab("details")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "details"
              ? "bg-purple-600 text-white"
              : isDark
              ? "text-gray-300 hover:bg-gray-700"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <TableProperties size={15} />
          Details
          {selectedHsnCode && (
            <span className="ml-1 px-2 py-0.5 text-[10px] rounded-full bg-white/20 dark:bg-purple-800/60 text-white dark:text-purple-200 border border-white/30">
              {selectedHsnCode}
            </span>
          )}
        </button>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* TAB 1: DASHBOARD                            */}
      {/* ═══════════════════════════════════════════ */}
      {activeTab === "dashboard" && (
        <div className="space-y-4">
          {/* Header Bar */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isDark
                ? "bg-gray-800/90 border-gray-700"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <div className="flex items-center gap-2">
              <PieChart className="text-purple-600 dark:text-purple-400" size={18} />
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                HSN Summary
              </h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({dashboardFilteredHsns.length} HSN codes) — Click a row to view Details
              </span>
            </div>
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
                  isDark
                    ? "bg-gray-700/80 border-gray-600 text-white placeholder-gray-400"
                    : "bg-gray-50 border-gray-200 text-black placeholder-gray-400"
                } outline-none focus:ring-2 focus:ring-purple-500`}
              />
            </div>
          </div>

          {/* Excel-Style Table */}
          {dashboardFilteredHsns.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400 text-sm">
              No B2C HSN data found for the selected criteria.
            </div>
          ) : (
            <div
              className={`rounded-xl border overflow-hidden ${
                isDark ? "border-gray-700" : "border-gray-300"
              }`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr
                      className={
                        isDark
                          ? "bg-purple-900/60 text-purple-100"
                          : "bg-purple-600 text-white"
                      }
                    >
                      <th className="px-5 py-3.5 text-left font-bold border-r border-white/20 dark:border-purple-700 w-8">
                        #
                      </th>
                      <th className="px-5 py-3.5 text-left font-bold border-r border-white/20 dark:border-purple-700">
                        HSN Code
                      </th>
                      <th className="px-5 py-3.5 text-right font-bold border-r border-white/20 dark:border-purple-700">
                        Taxable Value
                      </th>
                      <th className="px-5 py-3.5 text-right font-bold border-r border-white/20 dark:border-purple-700">
                        IGST
                      </th>
                      <th className="px-5 py-3.5 text-right font-bold border-r border-white/20 dark:border-purple-700">
                        CGST
                      </th>
                      <th className="px-5 py-3.5 text-right font-bold border-r border-white/20 dark:border-purple-700">
                        SGST
                      </th>
                      <th className="px-5 py-3.5 text-right font-bold border-r border-white/20 dark:border-purple-700">
                        Total Tax
                      </th>
                      <th className="px-5 py-3.5 text-right font-bold border-r border-white/20 dark:border-purple-700">
                        Total Invoice
                      </th>
                      <th className="px-5 py-3.5 text-center font-bold border-r border-white/20 dark:border-purple-700">
                        Txns
                      </th>
                      <th className="px-5 py-3.5 text-center font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardFilteredHsns.map((item, idx) => {
                      const isSelected = selectedHsnCode === item.hsnCode;
                      return (
                        <tr
                          key={item.hsnCode}
                          onClick={() => handleHsnRowClick(item.hsnCode)}
                          className={`cursor-pointer border-b transition-colors ${
                            isSelected
                              ? isDark
                                ? "bg-purple-900/40 border-purple-700"
                                : "bg-purple-50 border-purple-200"
                              : idx % 2 === 0
                              ? isDark
                                ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                                : "bg-white border-gray-200 hover:bg-purple-50/40"
                              : isDark
                              ? "bg-gray-800/60 border-gray-700 hover:bg-gray-700"
                              : "bg-gray-50/70 border-gray-200 hover:bg-purple-50/40"
                          }`}
                        >
                          <td
                            className={`px-4 py-2 text-center font-medium border-r ${
                              isDark
                                ? "border-gray-700 text-gray-400"
                                : "border-gray-200 text-gray-500"
                            }`}
                          >
                            {idx + 1}
                          </td>
                          <td
                            className={`px-4 py-2 border-r font-bold font-mono ${
                              isDark
                                ? "border-gray-700 text-purple-400"
                                : "border-gray-200 text-purple-700"
                            }`}
                          >
                            {item.hsnCode}
                          </td>
                          <td
                            className={`px-4 py-2 text-right border-r ${
                              isDark
                                ? "border-gray-700 text-gray-200"
                                : "border-gray-200 text-gray-800"
                            }`}
                          >
                            ₹{fmt(item.totalTaxableValue)}
                          </td>
                          <td
                            className={`px-4 py-2 text-right border-r ${
                              isDark
                                ? "border-gray-700 text-gray-300"
                                : "border-gray-200 text-gray-700"
                            }`}
                          >
                            ₹{fmt(item.totalIgst)}
                          </td>
                          <td
                            className={`px-4 py-2 text-right border-r ${
                              isDark
                                ? "border-gray-700 text-gray-300"
                                : "border-gray-200 text-gray-700"
                            }`}
                          >
                            ₹{fmt(item.totalCgst)}
                          </td>
                          <td
                            className={`px-4 py-2 text-right border-r ${
                              isDark
                                ? "border-gray-700 text-gray-300"
                                : "border-gray-200 text-gray-700"
                            }`}
                          >
                            ₹{fmt(item.totalSgst)}
                          </td>
                          <td
                            className={`px-4 py-2 text-right border-r ${
                              isDark
                                ? "border-gray-700 text-gray-300"
                                : "border-gray-200 text-gray-700"
                            }`}
                          >
                            ₹{fmt(item.totalTax)}
                          </td>
                          <td
                            className={`px-4 py-2 text-right border-r font-bold ${
                              isDark
                                ? "border-gray-700 text-emerald-400"
                                : "border-gray-200 text-emerald-700"
                            }`}
                          >
                            ₹{fmt(item.totalValue)}
                          </td>
                          <td
                            className={`px-4 py-2 text-center border-r ${
                              isDark
                                ? "border-gray-700 text-gray-400"
                                : "border-gray-200 text-gray-500"
                            }`}
                          >
                            {item.transactionCount}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-md ${
                                isDark
                                  ? "bg-purple-800/60 text-purple-300 border border-purple-700"
                                  : "bg-purple-100 text-purple-700 border border-purple-200"
                              }`}
                            >
                              View →
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr
                      className={`font-bold border-t-2 ${
                        isDark
                          ? "bg-gray-700/80 text-white border-gray-500"
                          : "bg-gray-100 text-gray-900 border-gray-400"
                      }`}
                    >
                      <td
                        className={`px-4 py-2 border-r ${
                          isDark ? "border-gray-600" : "border-gray-300"
                        }`}
                      ></td>
                      <td
                        className={`px-4 py-2 border-r ${
                          isDark ? "border-gray-600" : "border-gray-300"
                        }`}
                      >
                        Grand Total ({dashboardFilteredHsns.length})
                      </td>
                      <td
                        className={`px-4 py-2 text-right border-r ${
                          isDark ? "border-gray-600" : "border-gray-300"
                        }`}
                      >
                        ₹{fmt(dashboardFilteredHsns.reduce((s, i) => s + i.totalTaxableValue, 0))}
                      </td>
                      <td
                        className={`px-4 py-2 text-right border-r ${
                          isDark ? "border-gray-600" : "border-gray-300"
                        }`}
                      >
                        ₹{fmt(dashboardFilteredHsns.reduce((s, i) => s + i.totalIgst, 0))}
                      </td>
                      <td
                        className={`px-4 py-2 text-right border-r ${
                          isDark ? "border-gray-600" : "border-gray-300"
                        }`}
                      >
                        ₹{fmt(dashboardFilteredHsns.reduce((s, i) => s + i.totalCgst, 0))}
                      </td>
                      <td
                        className={`px-4 py-2 text-right border-r ${
                          isDark ? "border-gray-600" : "border-gray-300"
                        }`}
                      >
                        ₹{fmt(dashboardFilteredHsns.reduce((s, i) => s + i.totalSgst, 0))}
                      </td>
                      <td
                        className={`px-4 py-2 text-right border-r ${
                          isDark ? "border-gray-600" : "border-gray-300"
                        }`}
                      >
                        ₹{fmt(dashboardFilteredHsns.reduce((s, i) => s + i.totalTax, 0))}
                      </td>
                      <td
                        className={`px-4 py-2 text-right border-r font-bold ${
                          isDark
                            ? "border-gray-600 text-emerald-400"
                            : "border-gray-300 text-emerald-700"
                        }`}
                      >
                        ₹{fmt(dashboardFilteredHsns.reduce((s, i) => s + i.totalValue, 0))}
                      </td>
                      <td
                        className={`px-4 py-2 text-center border-r ${
                          isDark ? "border-gray-600" : "border-gray-300"
                        }`}
                      >
                        {dashboardFilteredHsns.reduce((s, i) => s + i.transactionCount, 0)}
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

      {/* ═══════════════════════════════════════════ */}
      {/* TAB 2: DETAILS                              */}
      {/* ═══════════════════════════════════════════ */}
      {activeTab === "details" && (
        <div className="space-y-4">
          {/* Details Header */}
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isDark
                ? "bg-gray-800/90 border-gray-700 shadow-md"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <TableProperties
                className="text-purple-600 dark:text-purple-400"
                size={18}
              />
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                HSN Details
              </h2>
              {selectedHsnCode ? (
                <span className="px-3 py-1 text-xs font-mono font-bold rounded-lg bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-800">
                  HSN: {selectedHsnCode}
                </span>
              ) : (
                <span className="px-3 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-semibold">
                  All HSN Records
                </span>
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({detailRows.length} vouchers)
              </span>
            </div>
            <div className="flex gap-2">
              {selectedHsnCode && (
                <button
                  onClick={() => {
                    setSelectedHsnCode(null);
                    setActiveTab("dashboard");
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    isDark
                      ? "border-gray-600 text-gray-300 hover:bg-gray-700"
                      : "border-gray-300 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <X size={12} /> Clear Filter
                </button>
              )}
            </div>
          </div>

          {/* Details Table */}
          {detailRows.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400 text-sm">
              No vouchers found{selectedHsnCode ? ` for HSN: ${selectedHsnCode}` : ""}.
            </div>
          ) : (
            <div
              className={`rounded-xl border overflow-hidden ${
                isDark ? "border-gray-700" : "border-gray-300"
              }`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr
                      className={
                        isDark
                          ? "bg-purple-900/60 text-purple-100"
                          : "bg-purple-600 text-white"
                      }
                    >
                      {[
                        "#",
                        "HSN",
                        "Customer",
                        "Voucher No",
                        "QTY",
                        "Rate",
                        "Taxable Amt",
                        "IGST",
                        "CGST",
                        "SGST",
                        "Total Amt",
                        "Date",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-5 py-3.5 text-left font-bold border-r border-white/20 dark:border-purple-700 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.map((sale: any, idx: number) => {
                      const partyLedger = ledgerMap.get(sale.partyId);
                      const hist = salesHistoryMap.get(sale.number);
                      const hsn = hist?.hsnCode || "N/A";
                      const qty = hist?.qtyChange ? Math.abs(hist.qtyChange) : 0;
                      const unit = hist?.unit ? hist.unit.toLowerCase() : "";

                      return (
                        <tr
                          key={sale.id || idx}
                          className={`border-b transition-colors ${
                            idx % 2 === 0
                              ? isDark
                                ? "bg-gray-800 border-gray-700"
                                : "bg-white border-gray-200"
                              : isDark
                              ? "bg-gray-800/60 border-gray-700"
                              : "bg-gray-50/70 border-gray-200"
                          }`}
                        >
                          <td
                            className={`px-3 py-2 border-r ${
                              isDark
                                ? "border-gray-700 text-gray-400"
                                : "border-gray-200 text-gray-500"
                            }`}
                          >
                            {idx + 1}
                          </td>
                          <td
                            className={`px-3 py-2 border-r font-bold font-mono ${
                              isDark
                                ? "border-gray-700 text-purple-400"
                                : "border-gray-200 text-purple-700"
                            }`}
                          >
                            {hsn}
                          </td>
                          <td
                            className={`px-3 py-2 border-r ${
                              isDark
                                ? "border-gray-700 text-gray-200"
                                : "border-gray-200 text-gray-800"
                            }`}
                          >
                            {partyLedger?.name || "Unknown"}
                          </td>
                          <td
                            className={`px-3 py-2 border-r font-mono ${
                              isDark
                                ? "border-gray-700 text-gray-300"
                                : "border-gray-200 text-gray-700"
                            }`}
                          >
                            {sale.number}
                          </td>
                          <td
                            className={`px-3 py-2 border-r ${
                              isDark
                                ? "border-gray-700 text-gray-300"
                                : "border-gray-200 text-gray-700"
                            }`}
                          >
                            {qty > 0 ? `${qty}${unit}` : "-"}
                          </td>
                          <td
                            className={`px-3 py-2 border-r ${
                              isDark
                                ? "border-gray-700 text-gray-300"
                                : "border-gray-200 text-gray-700"
                            }`}
                          >
                            {hist?.rate || "-"}
                          </td>
                          <td
                            className={`px-3 py-2 border-r text-right ${
                              isDark
                                ? "border-gray-700 text-gray-200"
                                : "border-gray-200 text-gray-800"
                            }`}
                          >
                            ₹{fmt(Number(sale.subtotal || 0))}
                          </td>
                          <td
                            className={`px-3 py-2 border-r text-right ${
                              isDark
                                ? "border-gray-700 text-gray-300"
                                : "border-gray-200 text-gray-700"
                            }`}
                          >
                            ₹{fmt(Number(sale.igstTotal || 0))}
                          </td>
                          <td
                            className={`px-3 py-2 border-r text-right ${
                              isDark
                                ? "border-gray-700 text-gray-300"
                                : "border-gray-200 text-gray-700"
                            }`}
                          >
                            ₹{fmt(Number(sale.cgstTotal || 0))}
                          </td>
                          <td
                            className={`px-3 py-2 border-r text-right ${
                              isDark
                                ? "border-gray-700 text-gray-300"
                                : "border-gray-200 text-gray-700"
                            }`}
                          >
                            ₹{fmt(Number(sale.sgstTotal || 0))}
                          </td>
                          <td
                            className={`px-3 py-2 border-r text-right font-bold ${
                              isDark
                                ? "border-gray-700 text-emerald-400"
                                : "border-gray-200 text-emerald-700"
                            }`}
                          >
                            ₹{fmt(Number(sale.total || 0))}
                          </td>
                          <td
                            className={`px-3 py-2 border-r ${
                              isDark
                                ? "border-gray-700 text-gray-400"
                                : "border-gray-200 text-gray-600"
                            }`}
                          >
                            {new Date(sale.date).toLocaleDateString("en-IN")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Grand Total */}
                  <tfoot>
                    <tr
                      className={`font-bold border-t-2 ${
                        isDark
                          ? "bg-gray-700/80 text-white border-gray-500"
                          : "bg-gray-100 text-gray-900 border-gray-400"
                      }`}
                    >
                      <td
                        colSpan={6}
                        className={`px-3 py-2 border-r ${
                          isDark ? "border-gray-600" : "border-gray-300"
                        }`}
                      >
                        Grand Total ({detailRows.length} vouchers)
                      </td>
                      <td
                        className={`px-3 py-2 text-right border-r ${
                          isDark ? "border-gray-600" : "border-gray-300"
                        }`}
                      >
                        ₹{fmt(detailRows.reduce((s: number, r: any) => s + Number(r.subtotal || 0), 0))}
                      </td>
                      <td
                        className={`px-3 py-2 text-right border-r ${
                          isDark ? "border-gray-600" : "border-gray-300"
                        }`}
                      >
                        ₹{fmt(detailRows.reduce((s: number, r: any) => s + Number(r.igstTotal || 0), 0))}
                      </td>
                      <td
                        className={`px-3 py-2 text-right border-r ${
                          isDark ? "border-gray-600" : "border-gray-300"
                        }`}
                      >
                        ₹{fmt(detailRows.reduce((s: number, r: any) => s + Number(r.cgstTotal || 0), 0))}
                      </td>
                      <td
                        className={`px-3 py-2 text-right border-r ${
                          isDark ? "border-gray-600" : "border-gray-300"
                        }`}
                      >
                        ₹{fmt(detailRows.reduce((s: number, r: any) => s + Number(r.sgstTotal || 0), 0))}
                      </td>
                      <td
                        className={`px-3 py-2 text-right border-r font-bold ${
                          isDark
                            ? "border-gray-600 text-emerald-400"
                            : "border-gray-300 text-emerald-700"
                        }`}
                      >
                        ₹{fmt(detailRows.reduce((s: number, r: any) => s + Number(r.total || 0), 0))}
                      </td>
                      <td
                        className={`px-3 py-2 ${
                          isDark ? "text-gray-400" : "text-gray-500"
                        }`}
                      ></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default B2CHsn;
