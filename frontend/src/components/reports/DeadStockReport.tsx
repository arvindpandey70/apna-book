import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import {
  ArrowLeft,
  Printer,
  Download,
  Filter,
  RefreshCw,
  AlertTriangle,
  PackageX,
  TrendingDown,
  Clock,
  Search,
  ShoppingCart,
  FileSpreadsheet,
} from 'lucide-react';

export interface DeadStockItem {
  id: number;
  name: string;
  unit: string;
  hsnCode: string;
  stockGroupId: string | number | null;
  stockGroupName: string;
  categoryId: string | number | null;
  categoryName: string;
  godownId: number | null;
  godownName: string;
  openingQty: number;
  inwardQty: number;
  outwardQty: number;
  closingQty: number;
  valuationRate: number;
  blockedValue: number;
  lastSaleDate: string | null;
  lastPurchaseDate: string | null;
  daysInactive: number;
  neverSold: boolean;
  status: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface DeadStockSummary {
  totalDeadItems: number;
  totalDeadQty: number;
  totalBlockedValue: number;
  criticalCount: number;
  neverSoldCount: number;
}

const DeadStockReport: React.FC = () => {
  const { theme } = useAppContext();
  const navigate = useNavigate();

  // Tenant / Company Info
  const companyId = localStorage.getItem('company_id') || '';
  const ownerType = localStorage.getItem('supplier') || localStorage.getItem('userType') || 'employee';
  const ownerId =
    localStorage.getItem(ownerType === 'employee' ? 'employee_id' : 'user_id') || '';

  // Filter States
  const [asOnDate, setAsOnDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [thresholdDays, setThresholdDays] = useState<number>(90);
  const [customDays, setCustomDays] = useState<string>('90');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [selectedGodown, setSelectedGodown] = useState<string>('');

  // Dropdown options
  const [stockGroups, setStockGroups] = useState<{ id: string; name: string }[]>([]);
  const [godowns, setGodowns] = useState<{ id: string; name: string }[]>([]);

  // Data States
  const [items, setItems] = useState<DeadStockItem[]>([]);
  const [summary, setSummary] = useState<DeadStockSummary>({
    totalDeadItems: 0,
    totalDeadQty: 0,
    totalBlockedValue: 0,
    criticalCount: 0,
    neverSoldCount: 0,
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Sorting
  const [sortField, setSortField] = useState<'name' | 'closingQty' | 'blockedValue' | 'daysInactive'>('blockedValue');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Fetch filter dropdown options (groups & godowns)
  useEffect(() => {
    async function fetchOptions() {
      if (!companyId) return;
      try {
        const [groupsRes, godownsRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/api/stock-groups/list?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`),
          fetch(`${import.meta.env.VITE_API_URL}/api/godowns?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`),
        ]);

        if (groupsRes.ok) {
          const gJson = await groupsRes.json();
          const gList = Array.isArray(gJson) ? gJson : (Array.isArray(gJson?.data) ? gJson.data : []);
          setStockGroups(gList.map((g: any) => ({ id: String(g.id), name: g.name })));
        }

        if (godownsRes.ok) {
          const gdJson = await godownsRes.json();
          const gdList = gdJson.success && gdJson.data ? gdJson.data : (Array.isArray(gdJson) ? gdJson : []);
          setGodowns(gdList.map((g: any) => ({ id: String(g.id), name: g.name })));
        }
      } catch (err) {
        console.error('Error fetching filter options:', err);
      }
    }
    fetchOptions();
  }, [companyId, ownerType, ownerId]);

  // Fetch Dead Stock Report Data
  const fetchData = async () => {
    if (!companyId) {
      setError('Please select a company to view the Dead Stock report.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        company_id: companyId,
        owner_type: ownerType,
        owner_id: ownerId,
        asOnDate,
        thresholdDays: String(thresholdDays),
        filterType: 'all',
      });

      if (selectedGroup) params.append('stockGroupId', selectedGroup);
      if (selectedGodown) params.append('godownId', selectedGodown);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/dead-stock?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load Dead Stock data (Status: ${res.status})`);
      }

      const json = await res.json();
      if (json.success) {
        setItems(json.data || []);
        setSummary(json.summary || {
          totalDeadItems: 0,
          totalDeadQty: 0,
          totalBlockedValue: 0,
          criticalCount: 0,
          neverSoldCount: 0,
        });
      } else {
        throw new Error(json.error || 'Failed to fetch report');
      }
    } catch (err: any) {
      console.error('Dead Stock API error:', err);
      setError(err.message || 'Error occurred while loading data.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [asOnDate, thresholdDays, selectedGroup, selectedGodown]);

  // Handle Search on Enter or debounce
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  // Sorting items
  const sortedItems = useMemo(() => {
    const list = [...items];
    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
    return list;
  }, [items, sortField, sortOrder]);

  const handleSort = (field: 'name' | 'closingQty' | 'blockedValue' | 'daysInactive') => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (items.length === 0) return;

    const headers = [
      'S.No',
      'Stock Item Name',
      'HSN Code',
      'Stock Group',
      'Godown',
      'Closing Quantity',
      'Unit',
      'Valuation Rate',
      'Blocked Value (Rs)',
      'Last Sale Date',
      'Days Inactive',
      'Never Sold',
      'Status',
    ];

    const rows = sortedItems.map((item, index) => [
      index + 1,
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.hsnCode}"`,
      `"${item.stockGroupName || ''}"`,
      `"${item.godownName || ''}"`,
      item.closingQty,
      `"${item.unit}"`,
      item.valuationRate,
      item.blockedValue,
      item.lastSaleDate || 'Never Sold',
      item.daysInactive,
      item.neverSold ? 'Yes' : 'No',
      `"${item.status}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Dead_Stock_Report_${asOnDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print Report
  const handlePrint = () => {
    window.print();
  };

  // Theme styling helpers
  const isDark = theme === 'dark';
  const bgColor = isDark ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-800';
  const cardBg = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const tableHeaderBg = isDark ? 'bg-gray-700/60 text-gray-200' : 'bg-gray-100 text-gray-700';
  const tableRowHover = isDark ? 'hover:bg-gray-700/40' : 'hover:bg-blue-50/50';
  const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';
  const inputBg = isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900';

  return (
    <div className={`p-4 md:p-6 min-h-screen ${bgColor} print:p-0 print:bg-white print:text-black`}>
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 print:hidden">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => navigate('/app/reports')}
            title="Back to Reports"
            className={`p-2 rounded-lg border ${cardBg} hover:opacity-80 transition`}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center space-x-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">Dead Stock Report</h1>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                Non-Moving Inventory
              </span>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                FIFO
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              FIFO: first in, first out — oldest stock is sold first. Dead stock = remaining old unsold layers (age ≥ threshold).
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-sm rounded-lg border ${cardBg} hover:opacity-80 transition`}
          >
            <Filter size={16} />
            <span>Filters</span>
          </button>
          <button
            onClick={fetchData}
            title="Refresh Report"
            className={`p-2 rounded-lg border ${cardBg} hover:opacity-80 transition`}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleExportCSV}
            title="Export to CSV"
            className="flex items-center space-x-1.5 px-3 py-1.5 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition font-medium"
          >
            <Download size={16} />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={handlePrint}
            title="Print Report"
            className="flex items-center space-x-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition font-medium"
          >
            <Printer size={16} />
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      {/* Printable Heading (Only visible in Print) */}
      <div className="hidden print:block mb-6 text-center border-b pb-4">
        <h1 className="text-2xl font-bold">DEAD STOCK / NON-MOVING STOCK REPORT</h1>
        <p className="text-sm text-gray-600">As on Date: {asOnDate} | Inactive Threshold: {thresholdDays} Days</p>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
        {/* Total Dead Items */}
        <div className={`px-3 py-2 rounded-lg border ${cardBg} shadow-sm`}>
          <div className="flex justify-between items-center gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 leading-tight">Total Dead Items</p>
              <h3 className="text-lg font-bold leading-tight">{summary.totalDeadItems}</h3>
              <p className="text-[10px] text-gray-400 leading-tight">Items without sales</p>
            </div>
            <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-500 shrink-0">
              <PackageX size={16} />
            </div>
          </div>
        </div>

        {/* Total Dead Quantity */}
        <div className={`px-3 py-2 rounded-lg border ${cardBg} shadow-sm`}>
          <div className="flex justify-between items-center gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 leading-tight">Total Dead Stock Qty</p>
              <h3 className="text-lg font-bold leading-tight">{summary.totalDeadQty.toLocaleString()}</h3>
              <p className="text-[10px] text-gray-400 leading-tight">Unsold units in warehouse</p>
            </div>
            <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-500 shrink-0">
              <TrendingDown size={16} />
            </div>
          </div>
        </div>

        {/* Blocked Working Capital */}
        <div className={`px-3 py-2 rounded-lg border ${cardBg} shadow-sm border-l-[3px] border-l-red-500`}>
          <div className="flex justify-between items-center gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 leading-tight">Blocked Working Capital</p>
              <h3 className="text-lg font-bold leading-tight text-red-600 dark:text-red-400">
                ₹{summary.totalBlockedValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </h3>
              <p className="text-[10px] text-gray-400 leading-tight">Capital stuck in stock</p>
            </div>
            <div className="p-1.5 rounded-md bg-red-500/10 text-red-500 shrink-0">
              <AlertTriangle size={16} />
            </div>
          </div>
        </div>

        {/* Critical & Never Sold */}
        <div className={`px-3 py-2 rounded-lg border ${cardBg} shadow-sm`}>
          <div className="flex justify-between items-center gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 leading-tight">Critical / Never Sold</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-red-500 leading-tight">{summary.criticalCount}</span>
                <span className="text-[10px] text-gray-400">critical (&gt;180d)</span>
              </div>
              <p className="text-[10px] text-amber-500 leading-tight">{summary.neverSoldCount} items never sold</p>
            </div>
            <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-500 shrink-0">
              <Clock size={16} />
            </div>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className={`p-4 rounded-xl border ${cardBg} mb-6 shadow-sm print:hidden`}>
          <div className="pb-3 border-b dark:border-gray-700">
            {/* Inactive Threshold Presets */}
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mr-1">
                Inactive Period:
              </span>
              {[
                { label: '> 30 Days', val: 30 },
                { label: '> 60 Days', val: 60 },
                { label: '> 90 Days (Standard)', val: 90 },
                { label: '> 180 Days (Critical)', val: 180 },
                { label: '> 365 Days (1 Yr+)', val: 365 },
              ].map((preset) => (
                <button
                  key={preset.val}
                  type="button"
                  onClick={() => {
                    setThresholdDays(preset.val);
                    setCustomDays(String(preset.val));
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition ${
                    thresholdDays === preset.val
                      ? 'bg-blue-600 text-white font-semibold shadow-sm'
                      : isDark
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}

              {/* Custom Days Input */}
              <div className="flex items-center space-x-1 ml-1">
                <input
                  type="number"
                  min="1"
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                  onBlur={() => {
                    const parsed = parseInt(customDays, 10);
                    if (!isNaN(parsed) && parsed > 0) setThresholdDays(parsed);
                  }}
                  className={`w-16 px-2 py-0.5 text-xs rounded border text-center ${inputBg}`}
                  placeholder="Days"
                />
                <span className="text-xs text-gray-400">days</span>
              </div>
            </div>
          </div>

          {/* Secondary Controls: As On Date, Stock Group, Godown, Search */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                As On Date (Cutoff)
              </label>
              <input
                type="date"
                value={asOnDate}
                onChange={(e) => setAsOnDate(e.target.value)}
                className={`w-full px-3 py-1.5 text-sm rounded-lg border ${inputBg}`}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Stock Group
              </label>
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className={`w-full px-3 py-1.5 text-sm rounded-lg border ${inputBg}`}
              >
                <option value="">All Stock Groups</option>
                {stockGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Godown / Location
              </label>
              <select
                value={selectedGodown}
                onChange={(e) => setSelectedGodown(e.target.value)}
                className={`w-full px-3 py-1.5 text-sm rounded-lg border ${inputBg}`}
              >
                <option value="">All Godowns</option>
                {godowns.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Search Item Name / HSN
              </label>
              <form onSubmit={handleSearchSubmit} className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search item or HSN..."
                  className={`w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border ${inputBg}`}
                />
                <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Loading & Error States */}
      {loading && (
        <div className={`p-12 text-center rounded-xl border ${cardBg}`}>
          <RefreshCw size={28} className="animate-spin mx-auto text-blue-500 mb-2" />
          <p className="text-sm text-gray-500">Analyzing inventory transactions and identifying dead stock...</p>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 mb-6 rounded-xl bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300 text-sm flex items-center space-x-2">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Main Dead Stock Table */}
      {!loading && !error && (
        <div className={`rounded-xl border ${borderColor} overflow-hidden shadow-sm ${cardBg}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-xs border-collapse whitespace-nowrap">
              <thead>
                <tr className={`${tableHeaderBg} border-b ${borderColor} font-semibold text-gray-700 dark:text-gray-200`}>
                  <th className="py-2.5 px-3 text-center w-10">#</th>
                  <th
                    className="py-2.5 px-3 cursor-pointer select-none"
                    onClick={() => handleSort('name')}
                  >
                    Stock Item Name{sortField === 'name' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th className="py-2.5 px-3">Group / Category</th>
                  <th className="py-2.5 px-3">Godown</th>
                  <th
                    className="py-2.5 px-3 text-right cursor-pointer select-none"
                    onClick={() => handleSort('closingQty')}
                  >
                    Closing Qty{sortField === 'closingQty' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th className="py-2.5 px-3 text-right">FIFO Cost Rate</th>
                  <th
                    className="py-2.5 px-3 text-right cursor-pointer select-none"
                    onClick={() => handleSort('blockedValue')}
                  >
                    Blocked Value{sortField === 'blockedValue' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th className="py-2.5 px-3 text-center">Last Sale Date</th>
                  <th
                    className="py-2.5 px-3 text-center cursor-pointer select-none"
                    onClick={() => handleSort('daysInactive')}
                  >
                    Inactive Days{sortField === 'daysInactive' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th className="py-2.5 px-3 text-center">Risk / Status</th>
                  <th className="py-2.5 px-3 text-center print:hidden">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700/60 font-mono text-xs">
                {sortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-gray-500 dark:text-gray-400 whitespace-normal">
                      <div className="flex flex-col items-center justify-center">
                        <PackageX size={36} className="text-gray-400 mb-2" />
                        <p className="font-semibold text-sm">No Dead Stock Found!</p>
                        <p className="text-xs text-gray-400 mt-1 max-w-sm">
                          All items are actively moving within {thresholdDays} days or there is currently no unsold
                          stock for this period. Try reducing the inactive days threshold.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedItems.map((item, idx) => {
                    const isCritical = item.riskLevel === 'critical';
                    const isDead = item.riskLevel === 'high';
                    const isSlow = item.riskLevel === 'medium';
                    const groupCat = [item.stockGroupName, item.categoryName]
                      .filter((v) => v && v !== '-')
                      .join(' / ');

                    return (
                      <tr key={item.id} className={`${tableRowHover} transition-colors`}>
                        <td className="py-2 px-3 text-center text-gray-400">{idx + 1}</td>
                        <td className="py-2 px-3 font-sans font-medium text-gray-900 dark:text-gray-100">
                          {item.name}
                          {item.hsnCode ? (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 font-normal">
                              HSN: {item.hsnCode}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 px-3 font-sans text-gray-600 dark:text-gray-300">
                          {groupCat || '—'}
                        </td>
                        <td className="py-2 px-3 font-sans text-gray-600 dark:text-gray-300">
                          {item.godownName || '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold">
                          {item.closingQty.toLocaleString()}
                          {item.unit ? (
                            <span className="ml-1 text-[10px] font-normal text-gray-400">{item.unit}</span>
                          ) : null}
                        </td>
                        <td className="py-2 px-3 text-right">
                          ₹{item.valuationRate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-red-600 dark:text-red-400">
                          ₹{item.blockedValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {item.neverSold ? (
                            <span className="inline-block px-2 py-0.5 text-[11px] font-sans font-semibold rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                              Never Sold
                            </span>
                          ) : (
                            item.lastSaleDate || '—'
                          )}
                        </td>
                        <td
                          className={`py-2 px-3 text-center font-semibold ${
                            isCritical
                              ? 'text-red-600 dark:text-red-400 font-bold'
                              : isDead
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {item.daysInactive} d
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 text-[11px] font-sans font-semibold rounded-full ${
                              isCritical
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                                : isDead
                                ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300'
                                : isSlow
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                                : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center print:hidden">
                          <div className="inline-flex items-center justify-center gap-1">
                            <button
                              onClick={() => navigate('/app/vouchers/sales/create')}
                              title="Create Clearance Sale Voucher"
                              className="p-1 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-100 transition"
                            >
                              <ShoppingCart size={14} />
                            </button>
                            <button
                              onClick={() => navigate('/app/vouchers/stock-journal/create')}
                              title="Write Off in Stock Journal"
                              className="p-1 rounded bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-amber-100 transition"
                            >
                              <FileSpreadsheet size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {sortedItems.length > 0 && (
                <tfoot>
                  <tr className={`${tableHeaderBg} border-t-2 ${borderColor} font-bold text-xs`}>
                    <td colSpan={4} className="py-2.5 px-4 font-sans text-right">
                      Grand Total ({sortedItems.length} items):
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {summary.totalDeadQty.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                    <td className="py-2.5 px-3 text-right text-red-600 dark:text-red-400">
                      ₹{summary.totalBlockedValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td colSpan={4} className="py-2.5 px-3 print:hidden"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeadStockReport;
