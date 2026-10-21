import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";
import { useAuth } from "../../home/context/AuthContext";
import { useFinancialYear, getFinancialYearRange, getAvailableFinYears } from "../../hooks/useFinancialYear";
import { ArrowLeft, Printer, Download, BookCopy, FileText, RefreshCw } from "lucide-react";
import { allSystemGroups } from "../../constants/ledgerGroups";

interface FixedAssetRow {
  srNo: number;
  ledgerId: number;
  name: string;
  openingBalance: number;
  additionBefore: number;
  additionAfter: number;
  salesBefore: number;
  salesAfter: number;
  depreciationRate: number;
  depreciationAmount: number;
  voucherDepreciation: number;
  netBlock: number;
}

const formatINR = (value: number) => {
  if (value === undefined || value === null || isNaN(value)) return "0.00";
  return Math.abs(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

interface FixedAssetsScheduleProps {
  embedded?: boolean;
}

const FixedAssetsSchedule: React.FC<FixedAssetsScheduleProps> = ({ embedded = false }) => {
  const { theme, companyInfo } = useAppContext();
  const { user } = useAuth();
  const { selectedFinYear, setSelectedFinYear } = useFinancialYear();
  const navigate = useNavigate();

  const isDark = theme === "dark";

  const companyId = localStorage.getItem("company_id") || localStorage.getItem("active_company_id") || "";
  const rawOwnerType = localStorage.getItem("supplier") || "";
  const employeeId = localStorage.getItem("employee_id");
  const userId = localStorage.getItem("user_id") || "";

  const ownerType =
    rawOwnerType === "ca" ||
    rawOwnerType === "ca_employee" ||
    rawOwnerType === "new_ca" ||
    rawOwnerType === "employee" ||
    employeeId
      ? "employee"
      : rawOwnerType || "employee";

  const ownerId =
    rawOwnerType === "ca" ||
    rawOwnerType === "ca_employee" ||
    rawOwnerType === "new_ca" ||
    rawOwnerType === "employee" ||
    employeeId
      ? employeeId || userId
      : userId;

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rowsData, setRowsData] = useState<FixedAssetRow[]>([]);
  const [customRates, setCustomRates] = useState<Record<number, number>>({});
  const [customDepAmounts, setCustomDepAmounts] = useState<Record<number, number>>({});

  // Calculate financial year date strings
  const finYearDates = useMemo(() => {
    const { startDate, endDate } = getFinancialYearRange(selectedFinYear);
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();

    const formatDateStr = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    };

    const cutoffDate = new Date(startYear, 8, 30); // 30-09-YYYY

    return {
      startDate,
      endDate,
      startDateStr: formatDateStr(startDate),
      endDateStr: formatDateStr(endDate),
      cutoffDateStr: formatDateStr(cutoffDate),
      startYear,
      endYear,
    };
  }, [selectedFinYear]);

  // Load stored custom rates for company
  useEffect(() => {
    if (!companyId) return;
    try {
      const storedRates = localStorage.getItem(`FIXED_ASSET_RATES_${companyId}`);
      if (storedRates) {
        setCustomRates(JSON.parse(storedRates));
      }
      const storedAmounts = localStorage.getItem(`FIXED_ASSET_DEP_AMOUNTS_${companyId}`);
      if (storedAmounts) {
        setCustomDepAmounts(JSON.parse(storedAmounts));
      }
    } catch (e) {
      console.error("Failed to load saved rates:", e);
    }
  }, [companyId]);

  // Fetch data
  const fetchData = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);

    try {
      const formatYYYYMMDD = (d: Date) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      };

      const startStr = formatYYYYMMDD(finYearDates.startDate);
      const endStr = formatYYYYMMDD(finYearDates.endDate);

      // Call API endpoint
      const apiUrl = `${import.meta.env.VITE_API_URL}/api/fixed-assets-schedule?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&startDate=${startStr}&endDate=${endStr}`;
      const res = await fetch(apiUrl);

      if (!res.ok) {
        throw new Error("Failed to fetch fixed assets schedule data");
      }

      const data = await res.json();
      const rawSchedule = data.scheduleData || [];

      // Map to rows with calculated depreciation & net block
      const processedRows: FixedAssetRow[] = rawSchedule.map((item: any, idx: number) => {
        const ledgerId = item.ledgerId;
        const rate = customRates[ledgerId] !== undefined ? customRates[ledgerId] : item.depreciationRate || 0;

        const opBal = item.openingBalance || 0;
        const addBefore = item.additionBefore || 0;
        const addAfter = item.additionAfter || 0;
        const salesBefore = item.salesBefore || 0;
        const salesAfter = item.salesAfter || 0;
        const voucherDep = item.voucherDepreciation || 0;

        // Companies Act 2013 180-day depreciation formula
        const netBaseBefore = opBal + addBefore - salesBefore;
        const netBaseAfter = addAfter - salesAfter;

        let depAmt = 0;
        if (customDepAmounts[ledgerId] !== undefined) {
          depAmt = customDepAmounts[ledgerId];
        } else {
          const depBefore = rate > 0 ? (Math.max(0, netBaseBefore) * rate) / 100 : 0;
          const depAfter = rate > 0 ? (Math.max(0, netBaseAfter) * (rate / 2)) / 100 : 0;
          depAmt = voucherDep + depBefore + depAfter;
        }

        const totalAdditions = addBefore + addAfter;
        const totalSales = salesBefore + salesAfter;
        const netBlock = opBal + totalAdditions - totalSales - depAmt;

        return {
          srNo: idx + 1,
          ledgerId,
          name: item.name,
          openingBalance: opBal,
          additionBefore: addBefore,
          additionAfter: addAfter,
          salesBefore: salesBefore,
          salesAfter: salesAfter,
          depreciationRate: rate,
          depreciationAmount: depAmt,
          voucherDepreciation: voucherDep,
          netBlock,
        };
      });

      setRowsData(processedRows);
    } catch (err: any) {
      console.error("Fixed Assets Schedule fetch error:", err);
      // Fallback: Fetch directly via /api/ledger if specialized route fails
      try {
        const fallbackRes = await fetch(
          `${import.meta.env.VITE_API_URL}/api/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        if (fallbackRes.ok) {
          const ledgersData = await fallbackRes.json();
          const faLedgers = ledgersData.filter((l: any) => {
            const gName = String(l.groupName || l.group_name || "").toLowerCase();
            const gId = Number(l.groupId || l.group_id);
            return gId === -9 || gName.includes("fixed asset") || l.name.toLowerCase().includes("fixed asset");
          });

          const fallbackRows: FixedAssetRow[] = faLedgers.map((l: any, idx: number) => {
            const ledgerId = l.id;
            const rate = customRates[ledgerId] !== undefined ? customRates[ledgerId] : parseFloat(l.depreciationRate || l.depreciation_rate || 0);
            const opBal = parseFloat(l.openingBalance || l.opening_balance) || 0;
            const depAmt = customDepAmounts[ledgerId] || (opBal * rate) / 100;

            return {
              srNo: idx + 1,
              ledgerId,
              name: l.name,
              openingBalance: opBal,
              additionBefore: 0,
              additionAfter: 0,
              salesBefore: 0,
              salesAfter: 0,
              depreciationRate: rate,
              depreciationAmount: depAmt,
              netBlock: opBal - depAmt,
            };
          });

          setRowsData(fallbackRows);
          setError(null);
        } else {
          setError(err.message || "Unable to load Fixed Assets Schedule");
        }
      } catch (fbErr: any) {
        setError(fbErr.message || "Unable to load Fixed Assets Schedule");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [companyId, ownerType, ownerId, selectedFinYear]);

  // Handle Depreciation Rate change
  const handleRateChange = (ledgerId: number, newRate: number) => {
    const updatedRates = { ...customRates, [ledgerId]: newRate };
    setCustomRates(updatedRates);

    // Clear custom manual amount override when rate is changed so rate calculation takes effect
    const updatedAmounts = { ...customDepAmounts };
    delete updatedAmounts[ledgerId];
    setCustomDepAmounts(updatedAmounts);

    try {
      localStorage.setItem(`FIXED_ASSET_RATES_${companyId}`, JSON.stringify(updatedRates));
      localStorage.setItem(`FIXED_ASSET_DEP_AMOUNTS_${companyId}`, JSON.stringify(updatedAmounts));
    } catch (e) {
      console.error("Error saving rates:", e);
    }

    // Recalculate row (Voucher Dep + Full rate for Before cutoff + Half rate for After cutoff)
    setRowsData((prev) =>
      prev.map((row) => {
        if (row.ledgerId === ledgerId) {
          const netBaseBefore = row.openingBalance + row.additionBefore - row.salesBefore;
          const netBaseAfter = row.additionAfter - row.salesAfter;

          const depBefore = newRate > 0 ? (Math.max(0, netBaseBefore) * newRate) / 100 : 0;
          const depAfter = newRate > 0 ? (Math.max(0, netBaseAfter) * (newRate / 2)) / 100 : 0;
          const voucherDep = row.voucherDepreciation || 0;
          const newDepAmt = voucherDep + depBefore + depAfter;

          const newNetBlock =
            row.openingBalance + row.additionBefore + row.additionAfter - (row.salesBefore + row.salesAfter) - newDepAmt;

          return {
            ...row,
            depreciationRate: newRate,
            depreciationAmount: newDepAmt,
            netBlock: newNetBlock,
          };
        }
        return row;
      })
    );
  };

  // Handle Depreciation Amount manual edit
  const handleDepAmountChange = (ledgerId: number, newAmt: number) => {
    const updatedAmounts = { ...customDepAmounts, [ledgerId]: newAmt };
    setCustomDepAmounts(updatedAmounts);
    try {
      localStorage.setItem(`FIXED_ASSET_DEP_AMOUNTS_${companyId}`, JSON.stringify(updatedAmounts));
    } catch (e) {
      console.error("Error saving amounts:", e);
    }

    setRowsData((prev) =>
      prev.map((row) => {
        if (row.ledgerId === ledgerId) {
          const newNetBlock =
            row.openingBalance + row.additionBefore + row.additionAfter - (row.salesBefore + row.salesAfter) - newAmt;
          return {
            ...row,
            depreciationAmount: newAmt,
            netBlock: newNetBlock,
          };
        }
        return row;
      })
    );
  };

  // Compute Totals
  const totals = useMemo(() => {
    return rowsData.reduce(
      (acc, row) => {
        const calcDep = Math.max(0, row.depreciationAmount - (row.voucherDepreciation || 0));
        return {
          openingBalance: acc.openingBalance + row.openingBalance,
          additionBefore: acc.additionBefore + row.additionBefore,
          additionAfter: acc.additionAfter + row.additionAfter,
          salesBefore: acc.salesBefore + row.salesBefore,
          salesAfter: acc.salesAfter + row.salesAfter,
          depreciationAmount: acc.depreciationAmount + row.depreciationAmount,
          calculatedDep: acc.calculatedDep + calcDep,
          netBlock: acc.netBlock + row.netBlock,
        };
      },
      {
        openingBalance: 0,
        additionBefore: 0,
        additionAfter: 0,
        salesBefore: 0,
        salesAfter: 0,
        depreciationAmount: 0,
        calculatedDep: 0,
        netBlock: 0,
      }
    );
  }, [rowsData]);

  // CSV Export handler
  const handleExportCSV = () => {
    const headers = [
      "SR. NO.",
      "NAME OF ASSETS",
      `BALANCE AS ON ${finYearDates.startDateStr}`,
      `ADDITION BEFORE ${finYearDates.cutoffDateStr}`,
      `ADDITION AFTER ${finYearDates.cutoffDateStr}`,
      `SALES BEFORE ${finYearDates.cutoffDateStr}`,
      `SALES AFTER ${finYearDates.cutoffDateStr}`,
      "Ds & PL Account",
      "RATE OF DEPRECIATION (%)",
      "AMOUNT OF DEP.",
      `NET BLOCK AS ON ${finYearDates.endDateStr}`,
    ];

    const rows = rowsData.map((r) => {
      const calcDep = Math.max(0, r.depreciationAmount - (r.voucherDepreciation || 0));
      return [
        r.srNo,
        `"${r.name.replace(/"/g, '""')}"`,
        r.openingBalance.toFixed(2),
        r.additionBefore.toFixed(2),
        r.additionAfter.toFixed(2),
        r.salesBefore.toFixed(2),
        r.salesAfter.toFixed(2),
        calcDep.toFixed(2),
        `${r.depreciationRate}%`,
        r.depreciationAmount.toFixed(2),
        r.netBlock.toFixed(2),
      ];
    });

    const totalRow = [
      "",
      "TOTAL",
      totals.openingBalance.toFixed(2),
      totals.additionBefore.toFixed(2),
      totals.additionAfter.toFixed(2),
      totals.salesBefore.toFixed(2),
      totals.salesAfter.toFixed(2),
      totals.calculatedDep.toFixed(2),
      "",
      totals.depreciationAmount.toFixed(2),
      totals.netBlock.toFixed(2),
    ];

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(",")), totalRow.join(",")].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Schedule_of_Fixed_Assets_${selectedFinYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentCompanyName = companyInfo?.companyName || companyInfo?.name || "ABC";

  return (
    <div className={embedded ? "w-full mt-6" : `pt-[56px] px-4 min-h-screen ${isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"}`}>
      {/* TOP HEADER CONTROLS BAR (Hidden when embedded in Consolidation) */}
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 print:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/app/reports")}
              className={`p-2 rounded-lg transition-colors ${
                isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-white hover:bg-gray-100 text-gray-700 shadow-sm border"
              }`}
              title="Back to Reports"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Schedule of Fixed Assets</h1>
              <p className="text-xs text-gray-500">As per Companies Act, 2013</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/app/reports/consolidation")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                isDark
                  ? "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm"
              }`}
            >
              <BookCopy size={14} />
              Consolidation
            </button>
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                isDark
                  ? "bg-blue-600 border-blue-500 text-white shadow"
                  : "bg-blue-600 border-blue-600 text-white shadow-sm"
              }`}
            >
              <FileText size={14} />
              Schedule of Fixed Assets
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              title="Refresh Data"
              className={`p-2 rounded-lg border transition-colors ${
                isDark ? "bg-gray-800 border-gray-700 hover:bg-gray-700" : "bg-white border-gray-300 hover:bg-gray-50 shadow-sm"
              }`}
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      )}

      {embedded && (
        <div className="mb-3">
          <h2 className="text-lg font-bold">Schedule of Fixed Assets</h2>
        </div>
      )}

      {/* ERROR MESSAGE IF ANY */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-100 border border-red-300 text-red-800 text-xs">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* REPORT CONTAINER PRINTABLE & RESPONSIVE */}
      <div
        className={`p-6 rounded-lg border shadow-sm ${
          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
        }`}
      >

        {/* LOADING STATE */}
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500">
            <RefreshCw className="animate-spin inline-block mr-2" size={18} />
            Loading Fixed Assets Schedule data...
          </div>
        ) : (
          /* TABULAR SCHEDULE OF FIXED ASSETS */
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-400 dark:border-gray-600 text-xs text-left">
              <thead>
                {/* HEADER ROW 1 */}
                <tr className={`${isDark ? "bg-gray-700 text-gray-200" : "bg-gray-100 text-gray-800"} uppercase font-bold text-center`}>
                  <th rowSpan={2} className="border border-gray-400 dark:border-gray-600 p-2 w-12">
                    SR. NO.
                  </th>
                  <th rowSpan={2} className="border border-gray-400 dark:border-gray-600 p-2 min-w-[180px] text-left">
                    NAME OF ASSETS
                  </th>
                  <th rowSpan={2} className="border border-gray-400 dark:border-gray-600 p-2 min-w-[130px]">
                    BALANCE AS ON <br /> {finYearDates.startDateStr}
                  </th>
                  <th colSpan={2} className="border border-gray-400 dark:border-gray-600 p-1">
                    ADDITION
                  </th>
                  <th colSpan={2} className="border border-gray-400 dark:border-gray-600 p-1">
                    SALES
                  </th>
                  <th rowSpan={2} className="border border-red-400 dark:border-red-600 p-2 min-w-[110px] text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20 font-bold">
                    Ds & PL Account
                  </th>
                  <th rowSpan={2} className="border border-red-400 dark:border-red-600 p-2 w-28 text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20 font-bold">
                    RATE OF DEPRECIATION
                  </th>
                  <th rowSpan={2} className="border border-gray-400 dark:border-gray-600 p-2 min-w-[110px]">
                    AMOUNT OF DEP.
                  </th>
                  <th rowSpan={2} className="border border-gray-400 dark:border-gray-600 p-2 min-w-[130px]">
                    NET BLOCK AS ON <br /> {finYearDates.endDateStr}
                  </th>
                </tr>

                {/* HEADER ROW 2 (SUB-COLUMNS FOR ADDITION & SALES) */}
                <tr className={`${isDark ? "bg-gray-700 text-gray-200" : "bg-gray-100 text-gray-800"} uppercase font-bold text-center`}>
                  <th className="border border-gray-400 dark:border-gray-600 p-1 min-w-[110px]">
                    BEFORE <br /> {finYearDates.cutoffDateStr}
                  </th>
                  <th className="border border-gray-400 dark:border-gray-600 p-1 min-w-[110px]">
                    AFTER <br /> {finYearDates.cutoffDateStr}
                  </th>
                  <th className="border border-gray-400 dark:border-gray-600 p-1 min-w-[110px]">
                    BEFORE <br /> {finYearDates.cutoffDateStr}
                  </th>
                  <th className="border border-gray-400 dark:border-gray-600 p-1 min-w-[110px]">
                    AFTER <br /> {finYearDates.cutoffDateStr}
                  </th>
                </tr>
              </thead>

              <tbody>
                {rowsData.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-6 text-center text-gray-500 italic border border-gray-400 dark:border-gray-600">
                      No Fixed Assets ledgers found for this company.
                    </td>
                  </tr>
                ) : (
                  rowsData.map((row) => {
                    const calcVal = Math.max(0, row.depreciationAmount - (row.voucherDepreciation || 0));
                    return (
                      <tr
                        key={row.ledgerId}
                        className={`hover:bg-blue-50/50 dark:hover:bg-gray-700/50 ${
                          isDark ? "border-gray-700" : "border-gray-300"
                        }`}
                      >
                        {/* SR NO */}
                        <td className="border border-gray-400 dark:border-gray-600 p-2 text-center font-mono">
                          {row.srNo}
                        </td>

                        {/* NAME OF ASSETS */}
                        <td className="border border-gray-400 dark:border-gray-600 p-2 font-semibold tracking-wide uppercase">
                          {row.name}
                        </td>

                        {/* BALANCE AS ON START */}
                        <td className="border border-gray-400 dark:border-gray-600 p-2 text-right font-mono">
                          {row.openingBalance !== 0 ? formatINR(row.openingBalance) : "-"}
                        </td>

                        {/* ADDITION BEFORE CUTOFF */}
                        <td className="border border-gray-400 dark:border-gray-600 p-2 text-right font-mono">
                          {row.additionBefore !== 0 ? formatINR(row.additionBefore) : "-"}
                        </td>

                        {/* ADDITION AFTER CUTOFF */}
                        <td className="border border-gray-400 dark:border-gray-600 p-2 text-right font-mono">
                          {row.additionAfter !== 0 ? formatINR(row.additionAfter) : "-"}
                        </td>

                        {/* SALES BEFORE CUTOFF */}
                        <td className="border border-gray-400 dark:border-gray-600 p-2 text-right font-mono">
                          {row.salesBefore !== 0 ? formatINR(row.salesBefore) : "-"}
                        </td>

                        {/* SALES AFTER CUTOFF */}
                        <td className="border border-gray-400 dark:border-gray-600 p-2 text-right font-mono">
                          {row.salesAfter !== 0 ? formatINR(row.salesAfter) : "-"}
                        </td>

                        {/* DS & PL ACCOUNT (CALC VALUE) */}
                        <td className="border border-red-400 dark:border-red-600 p-2 text-right font-mono font-semibold text-red-600 dark:text-red-400 bg-red-50/40 dark:bg-red-950/20">
                          {formatINR(calcVal)}
                        </td>

                        {/* RATE OF DEPRECIATION */}
                        <td className="border border-red-400 dark:border-red-600 p-2 text-center font-mono font-bold text-red-600 dark:text-red-400 bg-red-50/40 dark:bg-red-950/20">
                          {row.depreciationRate ? `${row.depreciationRate}%` : "0%"}
                        </td>

                        {/* AMOUNT OF DEP. */}
                        <td className="border border-gray-400 dark:border-gray-600 p-2 text-right font-mono">
                          <p>{formatINR(row.depreciationAmount)}</p>
                        </td>

                        {/* NET BLOCK AS ON END */}
                        <td className="border border-gray-400 dark:border-gray-600 p-2 text-right font-mono font-semibold">
                          {formatINR(row.netBlock)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* DYNAMIC TOTALS ROW */}
              <tfoot>
                <tr className={`${isDark ? "bg-gray-700 text-gray-100" : "bg-gray-100 text-gray-900"} font-bold border-t-2 border-gray-400 dark:border-gray-500`}>
                  <td colSpan={2} className="border border-gray-400 dark:border-gray-600 p-2 text-left uppercase tracking-wider">
                    TOTAL
                  </td>
                  <td className="border border-gray-400 dark:border-gray-600 p-2 text-right font-mono">
                    {totals.openingBalance !== 0 ? formatINR(totals.openingBalance) : "-"}
                  </td>
                  <td className="border border-gray-400 dark:border-gray-600 p-2 text-right font-mono">
                    {totals.additionBefore !== 0 ? formatINR(totals.additionBefore) : "-"}
                  </td>
                  <td className="border border-gray-400 dark:border-gray-600 p-2 text-right font-mono">
                    {totals.additionAfter !== 0 ? formatINR(totals.additionAfter) : "-"}
                  </td>
                  <td className="border border-gray-400 dark:border-gray-600 p-2 text-right font-mono">
                    {totals.salesBefore !== 0 ? formatINR(totals.salesBefore) : "-"}
                  </td>
                  <td className="border border-gray-400 dark:border-gray-600 p-2 text-right font-mono">
                    {totals.salesAfter !== 0 ? formatINR(totals.salesAfter) : "-"}
                  </td>
                  {/* DS & PL ACCOUNT TOTAL */}
                  <td className="border border-red-400 dark:border-red-600 p-2 text-right font-mono font-bold text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20">
                    {formatINR(totals.calculatedDep)}
                  </td>
                  {/* RATE OF DEPRECIATION TOTAL */}
                  <td className="border border-red-400 dark:border-red-600 p-2 text-center font-bold text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20">
                    —
                  </td>
                  <td className="border border-gray-400 dark:border-gray-600 p-2 text-right font-mono">
                    {formatINR(totals.depreciationAmount)}
                  </td>
                  <td className="border border-gray-400 dark:border-gray-600 p-2 text-right font-mono">
                    {formatINR(totals.netBlock)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default FixedAssetsSchedule;
