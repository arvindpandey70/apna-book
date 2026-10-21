import React, { useState, useEffect, useMemo } from "react";
import { TrendingUp, ArrowDownRight, ArrowUpRight, Layers, ListTree, RefreshCw, AlertCircle } from "lucide-react";

export interface TradingRow {
  gstRate: number;
  openingStock: number;
  openingStockByGroup?: Record<string, number>;
  openingStockByItem?: Record<string, number>;
  grossPurchase?: number;
  purchase: number;
  purchaseIntra?: number;
  purchaseInter?: number;
  debitNote?: number;
  totalStockPlusPurchase?: number;
  directExpense: number;
  totalDebitBeforeGP?: number;
  grossProfit: number;
  totalDebitSide: number;
  grossSales?: number;
  sales: number;
  salesIntra?: number;
  salesInter?: number;
  creditNote?: number;
  closingStock: number;
  closingStockByGroup?: Record<string, number>;
  closingStockByItem?: Record<string, number>;
  totalCreditSide: number;
}

const GSTTradingAccount: React.FC = () => {
  const company_id = localStorage.getItem("company_id");
  const raw_owner_type = localStorage.getItem("supplier");
  const employee_id = localStorage.getItem("employee_id");
  const user_id = localStorage.getItem("user_id") || "";

  const owner_type = (raw_owner_type === "ca" || raw_owner_type === "ca_employee" || raw_owner_type === "new_ca" || raw_owner_type === "employee" || employee_id)
    ? "employee"
    : (raw_owner_type || "employee");

  const owner_id = (raw_owner_type === "ca" || raw_owner_type === "ca_employee" || raw_owner_type === "new_ca" || raw_owner_type === "employee" || employee_id)
    ? (employee_id || user_id)
    : user_id;

  const [data, setData] = useState<TradingRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Toggles for user display preferences
  const [showItemWise, setShowItemWise] = useState<boolean>(false);
  const [showDetailed, setShowDetailed] = useState<boolean>(false);

  // Fetch Trading Account from backend
  const fetchTradingAccount = async () => {
    if (!company_id || !owner_type || !owner_id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/gst-assessment/trading-account?company_id=${company_id}&owner_type=${owner_type}&owner_id=${owner_id}`
      );
      const json = await res.json();

      if (json.success) {
        const rows: TradingRow[] = Array.isArray(json.data) ? json.data : (json.data?.rows || []);
        setData(rows);
      } else {
        setError(json.message || "Failed to load Trading Account data");
      }
    } catch (err: any) {
      console.error("Trading Account Fetch Error:", err);
      setError("Failed to connect to server. Please check your network connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTradingAccount();
  }, [company_id, owner_type, owner_id]);

  // Format currency in Indian Rupees
  const formatINR = (amount: number) => {
    const val = Number(amount || 0);
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  // Distinct groups & items for Item-wise mode
  const groupNames = useMemo(() => {
    return Array.from(
      new Set(
        data.flatMap((row) => [
          ...Object.keys(row.openingStockByGroup || {}),
          ...Object.keys(row.closingStockByGroup || {}),
        ])
      )
    ).filter((name) => name !== "Primary").sort();
  }, [data]);

  const itemNames = useMemo(() => {
    return Array.from(
      new Set(
        data.flatMap((row) => [
          ...Object.keys(row.openingStockByItem || {}),
          ...Object.keys(row.closingStockByItem || {}),
        ])
      )
    ).sort();
  }, [data]);

  // Aggregate Total Column
  const totalOpeningStock = useMemo(() => data.reduce((sum, r) => sum + (r.openingStock || 0), 0), [data]);
  const totalGrossPurchase = useMemo(() => data.reduce((sum, r) => sum + (r.grossPurchase || r.purchase || 0), 0), [data]);
  const totalPurchaseIntra = useMemo(() => data.reduce((sum, r) => sum + (r.purchaseIntra || 0), 0), [data]);
  const totalPurchaseInter = useMemo(() => data.reduce((sum, r) => sum + (r.purchaseInter || 0), 0), [data]);
  const totalDebitNote = useMemo(() => data.reduce((sum, r) => sum + (r.debitNote || 0), 0), [data]);
  const totalPurchase = useMemo(() => data.reduce((sum, r) => sum + (r.purchase || 0), 0), [data]);

  const totalStockPlusPurchase = totalOpeningStock + totalPurchase;
  const totalDirectExpense = useMemo(() => data.reduce((sum, r) => sum + (r.directExpense || 0), 0), [data]);
  const totalDebitBeforeGP = totalStockPlusPurchase + totalDirectExpense;

  const totalGrossSales = useMemo(() => data.reduce((sum, r) => sum + (r.grossSales || r.sales || 0), 0), [data]);
  const totalSalesIntra = useMemo(() => data.reduce((sum, r) => sum + (r.salesIntra || 0), 0), [data]);
  const totalSalesInter = useMemo(() => data.reduce((sum, r) => sum + (r.salesInter || 0), 0), [data]);
  const totalCreditNote = useMemo(() => data.reduce((sum, r) => sum + (r.creditNote || 0), 0), [data]);
  const totalSales = useMemo(() => data.reduce((sum, r) => sum + (r.sales || 0), 0), [data]);

  const totalClosingStock = useMemo(() => data.reduce((sum, r) => sum + (r.closingStock || 0), 0), [data]);
  const totalCreditBeforeBalancing = totalSales + totalClosingStock;

  const totalGrossProfit = totalCreditBeforeBalancing - totalDebitBeforeGP;
  const totalDebitSide = totalGrossProfit >= 0 ? totalDebitBeforeGP + totalGrossProfit : totalDebitBeforeGP;
  const totalCreditSide = totalGrossProfit >= 0 ? totalCreditBeforeBalancing : totalCreditBeforeBalancing + Math.abs(totalGrossProfit);

  const isBalanced = Math.abs(totalDebitSide - totalCreditSide) < 0.05;

  const tdClass = "py-3 px-4 border border-gray-200 text-left";
  const tdCenterClass = "py-3 px-4 border border-gray-200 text-center font-mono";
  const tdTotalClass = "py-3 px-4 border border-gray-200 text-right font-mono font-bold bg-gray-50/80";

  if (loading) {
    return (
      <div className="mt-8 bg-white rounded-2xl shadow-xl border border-gray-100 p-12 text-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-800 border-t-transparent mb-3"></div>
        <p className="text-gray-600 font-medium">Calculating GST Rate-wise Trading Account...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 bg-white rounded-2xl shadow-xl border border-red-200 p-8 text-center">
        <AlertCircle size={36} className="text-red-500 mx-auto mb-2" />
        <h3 className="text-lg font-bold text-gray-800 mb-1">Failed to Load Trading Account</h3>
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchTradingAccount}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition"
        >
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="mt-8 bg-white rounded-2xl shadow-xl border border-gray-100 p-10 text-center">
        <TrendingUp size={36} className="text-gray-400 mx-auto mb-2" />
        <p className="text-gray-600 font-medium">No trading account records found for this company.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden print:shadow-none print:border-none">
      
      {/* Header section */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-5 text-white flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg">
            <TrendingUp size={22} className="text-yellow-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Trading Account (GST Rate-wise)</h2>
            <p className="text-xs text-gray-300">Dynamically classified across GST slabs with double-entry reconciliation</p>
          </div>
        </div>
        
        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          {/* Detailed Sub-heads Toggle */}
          <button
            title="Toggle Intra/Inter & Notes Breakdown"
            onClick={() => setShowDetailed(!showDetailed)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs font-medium border ${
              showDetailed
                ? "bg-amber-600 text-white border-amber-500 shadow-sm"
                : "bg-white/10 text-gray-200 border-gray-600 hover:bg-white/20"
            }`}
          >
            <ListTree size={14} />
            Sub-heads
          </button>

          {/* Item Wise Toggle */}
          <button
            title="Toggle Item-wise Mode"
            onClick={() => setShowItemWise(!showItemWise)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all text-xs font-medium border ${
              showItemWise
                ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                : "bg-white/10 text-gray-200 border-gray-600 hover:bg-white/20"
            }`}
          >
            <Layers size={14} />
            Item-wise
          </button>

          {/* Refresh Button */}
          <button
            title="Refresh Data"
            onClick={fetchTradingAccount}
            className="p-1.5 bg-white/10 hover:bg-white/20 text-gray-200 rounded-md transition border border-gray-600"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto p-6">
        <table className="w-full border-collapse border border-gray-200 text-sm">
          
          {/* Header Row */}
          <thead>
            <tr className="bg-gray-100 text-gray-800 font-bold border-b border-gray-200">
              <th className="py-4 px-4 text-left border border-gray-200 min-w-[240px]">
                Particulars
              </th>
              {data.map((row) => (
                <th key={row.gstRate} className="py-4 px-3 text-center border border-gray-200 min-w-[110px]">
                  {row.gstRate}%
                </th>
              ))}
              <th className="py-4 px-4 text-right border border-gray-200 min-w-[140px] bg-gray-200 text-gray-900 font-bold">
                Total
              </th>
            </tr>
          </thead>

          <tbody className="text-gray-700 font-medium">
            
            {/* 1. Opening Stock */}
            <tr className="hover:bg-gray-50/80 transition-colors">
              <td className={tdClass}>Opening Stock</td>
              {data.map((row) => (
                <td key={row.gstRate} className={tdCenterClass}>
                  {formatINR(row.openingStock)}
                </td>
              ))}
              <td className={tdTotalClass}>{formatINR(totalOpeningStock)}</td>
            </tr>

            {/* Opening Stock Breakdown by Group (Item-wise mode) */}
            {showItemWise && groupNames.map((groupName) => {
              const rowTotal = data.reduce((acc, r) => acc + (r.openingStockByGroup?.[groupName] || 0), 0);
              if (rowTotal === 0) return null;
              return (
                <tr key={`op-grp-${groupName}`} className="bg-gray-50/40 text-xs italic">
                  <td className={`${tdClass} pl-8 text-gray-600`}>↳ Group: {groupName}</td>
                  {data.map((row) => (
                    <td key={row.gstRate} className={tdCenterClass}>
                      {formatINR(row.openingStockByGroup?.[groupName] || 0)}
                    </td>
                  ))}
                  <td className={tdTotalClass}>{formatINR(rowTotal)}</td>
                </tr>
              );
            })}

            {/* Opening Stock Breakdown by Item (Item-wise mode) */}
            {showItemWise && itemNames.map((itemName) => {
              const rowTotal = data.reduce((acc, r) => acc + (r.openingStockByItem?.[itemName] || 0), 0);
              if (rowTotal === 0) return null;
              return (
                <tr key={`op-item-${itemName}`} className="bg-gray-50/20 text-xs">
                  <td className={`${tdClass} pl-12 text-gray-500`}>• {itemName}</td>
                  {data.map((row) => (
                    <td key={row.gstRate} className={tdCenterClass}>
                      {formatINR(row.openingStockByItem?.[itemName] || 0)}
                    </td>
                  ))}
                  <td className={tdTotalClass}>{formatINR(rowTotal)}</td>
                </tr>
              );
            })}

            {/* 2. Purchase */}
            <tr className="hover:bg-gray-50/80 transition-colors">
              <td className={tdClass}>Purchase</td>
              {data.map((row) => (
                <td key={row.gstRate} className={tdCenterClass}>
                  {formatINR(row.purchase)}
                </td>
              ))}
              <td className={tdTotalClass}>{formatINR(totalPurchase)}</td>
            </tr>

            {/* Purchase Sub-heads: Intra, Inter, Less Debit Notes */}
            {showDetailed && (
              <>
                <tr className="bg-amber-50/30 text-xs">
                  <td className={`${tdClass} pl-8 text-gray-600`}>↳ Purchase (Intra State)</td>
                  {data.map((row) => (
                    <td key={row.gstRate} className={tdCenterClass}>
                      {formatINR(row.purchaseIntra || 0)}
                    </td>
                  ))}
                  <td className={tdTotalClass}>{formatINR(totalPurchaseIntra)}</td>
                </tr>
                <tr className="bg-amber-50/30 text-xs">
                  <td className={`${tdClass} pl-8 text-gray-600`}>↳ Purchase (Inter State)</td>
                  {data.map((row) => (
                    <td key={row.gstRate} className={tdCenterClass}>
                      {formatINR(row.purchaseInter || 0)}
                    </td>
                  ))}
                  <td className={tdTotalClass}>{formatINR(totalPurchaseInter)}</td>
                </tr>
                {totalDebitNote > 0 && (
                  <tr className="bg-red-50/30 text-xs text-red-700">
                    <td className={`${tdClass} pl-8`}>↳ Less: Debit Notes (Returns)</td>
                    {data.map((row) => (
                      <td key={row.gstRate} className={tdCenterClass}>
                        -{formatINR(row.debitNote || 0)}
                      </td>
                    ))}
                    <td className={`${tdTotalClass} text-red-700`}>-{formatINR(totalDebitNote)}</td>
                  </tr>
                )}
              </>
            )}

            {/* 3. TOTAL (Stock + Purchase) */}
            <tr className="bg-gray-50 font-semibold text-gray-800 italic">
              <td className={tdClass}>TOTAL (Stock + Purchase)</td>
              {data.map((row) => (
                <td key={row.gstRate} className={`${tdCenterClass} font-bold text-gray-900`}>
                  {formatINR(row.totalStockPlusPurchase ?? (row.openingStock + row.purchase))}
                </td>
              ))}
              <td className={tdTotalClass}>{formatINR(totalStockPlusPurchase)}</td>
            </tr>

            {/* 4. Direct Expenses */}
            <tr className="hover:bg-gray-50/80 transition-colors">
              <td className={tdClass}>Direct Expenses</td>
              {data.map((row) => (
                <td key={row.gstRate} className={tdCenterClass}>
                  {formatINR(row.directExpense)}
                </td>
              ))}
              <td className={tdTotalClass}>{formatINR(totalDirectExpense)}</td>
            </tr>

            {/* 5. TOTAL (Debit Side Before GP) */}
            <tr className="bg-gray-50 font-semibold text-gray-800 italic">
              <td className={tdClass}>TOTAL (Debit Side Before GP)</td>
              {data.map((row) => (
                <td key={row.gstRate} className={`${tdCenterClass} font-bold text-gray-900`}>
                  {formatINR(row.totalDebitBeforeGP ?? (row.openingStock + row.purchase + row.directExpense))}
                </td>
              ))}
              <td className={tdTotalClass}>{formatINR(totalDebitBeforeGP)}</td>
            </tr>

            {/* 6. Gross Profit */}
            <tr className="bg-emerald-50/30 hover:bg-emerald-50/50 transition-colors font-semibold">
              <td className={`${tdClass} flex items-center gap-1.5`}>
                {totalGrossProfit >= 0 ? (
                  <ArrowUpRight size={16} className="text-emerald-600" />
                ) : (
                  <ArrowDownRight size={16} className="text-red-600" />
                )}
                <span className={totalGrossProfit >= 0 ? "text-emerald-800" : "text-red-700"}>
                  Gross Profit
                </span>
              </td>
              {data.map((row) => {
                const isPos = row.grossProfit >= 0;
                return (
                  <td
                    key={row.gstRate}
                    className={`${tdCenterClass} font-bold ${
                      isPos ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {formatINR(row.grossProfit)}
                  </td>
                );
              })}
              <td
                className={`${tdTotalClass} ${
                  totalGrossProfit >= 0 ? "text-emerald-800" : "text-red-600"
                }`}
              >
                {formatINR(totalGrossProfit)}
              </td>
            </tr>

            {/* 7. Total (Debit Side) */}
            <tr className="bg-gray-800 text-white border-t-2 border-gray-900 font-bold">
              <td className="py-3.5 px-4 border border-gray-700 uppercase tracking-wider text-yellow-400 font-bold">
                Total (Debit Side)
              </td>
              {data.map((row) => (
                <td key={row.gstRate} className="py-3.5 px-3 border border-gray-700 text-center font-mono text-yellow-300 font-bold">
                  {formatINR(row.totalDebitSide)}
                </td>
              ))}
              <td className="py-3.5 px-4 border border-gray-700 text-right font-mono text-yellow-400 font-bold bg-gray-900">
                {formatINR(totalDebitSide)}
              </td>
            </tr>

            {/* 8. Sales */}
            <tr className="hover:bg-gray-50/80 transition-colors mt-2">
              <td className={tdClass}>Sales</td>
              {data.map((row) => (
                <td key={row.gstRate} className={tdCenterClass}>
                  {formatINR(row.sales)}
                </td>
              ))}
              <td className={tdTotalClass}>{formatINR(totalSales)}</td>
            </tr>

            {/* Sales Sub-heads: Intra, Inter, Less Credit Notes */}
            {showDetailed && (
              <>
                <tr className="bg-amber-50/30 text-xs">
                  <td className={`${tdClass} pl-8 text-gray-600`}>↳ Sales (Intra State)</td>
                  {data.map((row) => (
                    <td key={row.gstRate} className={tdCenterClass}>
                      {formatINR(row.salesIntra || 0)}
                    </td>
                  ))}
                  <td className={tdTotalClass}>{formatINR(totalSalesIntra)}</td>
                </tr>
                <tr className="bg-amber-50/30 text-xs">
                  <td className={`${tdClass} pl-8 text-gray-600`}>↳ Sales (Inter State)</td>
                  {data.map((row) => (
                    <td key={row.gstRate} className={tdCenterClass}>
                      {formatINR(row.salesInter || 0)}
                    </td>
                  ))}
                  <td className={tdTotalClass}>{formatINR(totalSalesInter)}</td>
                </tr>
                {totalCreditNote > 0 && (
                  <tr className="bg-red-50/30 text-xs text-red-700">
                    <td className={`${tdClass} pl-8`}>↳ Less: Credit Notes (Returns)</td>
                    {data.map((row) => (
                      <td key={row.gstRate} className={tdCenterClass}>
                        -{formatINR(row.creditNote || 0)}
                      </td>
                    ))}
                    <td className={`${tdTotalClass} text-red-700`}>-{formatINR(totalCreditNote)}</td>
                  </tr>
                )}
              </>
            )}

            {/* 9. Closing Stock (Total) */}
            <tr className="hover:bg-gray-50/80 transition-colors">
              <td className={tdClass}>Closing Stock (Total)</td>
              {data.map((row) => (
                <td key={row.gstRate} className={tdCenterClass}>
                  {formatINR(row.closingStock)}
                </td>
              ))}
              <td className={tdTotalClass}>{formatINR(totalClosingStock)}</td>
            </tr>

            {/* Closing Stock Breakdown by Group (Item-wise mode) */}
            {showItemWise && groupNames.map((groupName) => {
              const rowTotal = data.reduce((acc, r) => acc + (r.closingStockByGroup?.[groupName] || 0), 0);
              if (rowTotal === 0) return null;
              return (
                <tr key={`cl-grp-${groupName}`} className="bg-gray-50/40 text-xs italic">
                  <td className={`${tdClass} pl-8 text-gray-600`}>↳ Group: {groupName}</td>
                  {data.map((row) => (
                    <td key={row.gstRate} className={tdCenterClass}>
                      {formatINR(row.closingStockByGroup?.[groupName] || 0)}
                    </td>
                  ))}
                  <td className={tdTotalClass}>{formatINR(rowTotal)}</td>
                </tr>
              );
            })}

            {/* Closing Stock Breakdown by Item (Item-wise mode) */}
            {showItemWise && itemNames.map((itemName) => {
              const rowTotal = data.reduce((acc, r) => acc + (r.closingStockByItem?.[itemName] || 0), 0);
              if (rowTotal === 0) return null;
              return (
                <tr key={`cl-item-${itemName}`} className="bg-gray-50/20 text-xs">
                  <td className={`${tdClass} pl-12 text-gray-500`}>• {itemName}</td>
                  {data.map((row) => (
                    <td key={row.gstRate} className={tdCenterClass}>
                      {formatINR(row.closingStockByItem?.[itemName] || 0)}
                    </td>
                  ))}
                  <td className={tdTotalClass}>{formatINR(rowTotal)}</td>
                </tr>
              );
            })}

            {/* 10. Total (Credit Side) */}
            <tr className="bg-gray-800 text-white border-t-2 border-gray-900 font-bold">
              <td className="py-3.5 px-4 border border-gray-700 uppercase tracking-wider text-yellow-400 font-bold">
                Total (Credit Side)
              </td>
              {data.map((row) => (
                <td key={row.gstRate} className="py-3.5 px-3 border border-gray-700 text-center font-mono text-yellow-300 font-bold">
                  {formatINR(row.totalCreditSide)}
                </td>
              ))}
              <td className="py-3.5 px-4 border border-gray-700 text-right font-mono text-yellow-400 font-bold bg-gray-900">
                {formatINR(totalCreditSide)}
              </td>
            </tr>
            
          </tbody>
        </table>
      </div>
      
      {/* Footer balance verification status */}
      <div className="bg-gray-50 px-6 py-3.5 border-t border-gray-200 flex flex-wrap items-center justify-between text-sm print:hidden gap-3">
        {isBalanced ? (
          <>
            <div className="flex items-center gap-2 text-emerald-700 font-bold">
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></div>
              <span>Double-Entry Balance Verified</span>
            </div>
            <div className="font-semibold text-gray-700">
              Debit Total (<span className="text-gray-900 font-mono font-bold">{formatINR(totalDebitSide)}</span>) = Credit Total (<span className="text-gray-900 font-mono font-bold">{formatINR(totalCreditSide)}</span>)
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-red-600 font-bold">
              <AlertCircle size={18} />
              <span>Double-Entry Discrepancy Detected</span>
            </div>
            <div className="text-red-700 font-semibold font-mono">
              Difference: {formatINR(Math.abs(totalDebitSide - totalCreditSide))}
            </div>
          </>
        )}
      </div>

    </div>
  );
};

export default GSTTradingAccount;
