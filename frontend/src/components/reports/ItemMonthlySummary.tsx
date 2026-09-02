import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAppContext } from "../../context/AppContext";

const ItemMonthlySummary = () => {
  const { theme, units } = useAppContext();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const itemName = params.get("item");
  const rawBatch = params.get("batch");
  // Handle cases where batch is string "null" or "undefined" from URL
  const batchName = (rawBatch === "null" || rawBatch === "undefined" || !rawBatch) ? "Default" : rawBatch;

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [unitName, setUnitName] = useState("");

  const company_id = localStorage.getItem("company_id") || "";
  const owner_type = localStorage.getItem("owner_type") || "employee";
  const owner_id =
    localStorage.getItem(
      owner_type === "employee" ? "employee_id" : "user_id"
    ) || "";

  useEffect(() => {
    if (!itemName || !batchName) return;
    loadMonthlySummary();
  }, [itemName, batchName]);

  const getFinancialMonths = () => {
    return [
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
      "January",
      "February",
      "March",
    ];
  };


  const loadMonthlySummary = async () => {
    setLoading(true);

    const params = new URLSearchParams({
      company_id,
      owner_type,
      owner_id,
    });

    const [purchaseRes, salesRes, stockItemRes] = await Promise.all([
      fetch(
        `${import.meta.env.VITE_API_URL
        }/api/purchase-vouchers/purchase-history?${params}`
      ),
      fetch(
        `${import.meta.env.VITE_API_URL
        }/api/sales-vouchers/sale-history?${params}`
      ),
      fetch(
        `${import.meta.env.VITE_API_URL
        }/api/stock-items?${params}`
      ),
    ]);

    const purchaseData = (await purchaseRes.json()).data || [];
    const salesData = (await salesRes.json()).data || [];
    const stockItemsData = (await stockItemRes.json()).data || [];

    // ✅ Get Opening Balance (Forward Calculation)
    const normalizedItemName = itemName ? itemName.toLowerCase().trim() : "";
    const itemData = stockItemsData.find((i: any) => i.name && i.name.toLowerCase().trim() === normalizedItemName);
    const matchedMasterName = itemData ? itemData.name : itemName;
    const matchedMasterNameNormalized = matchedMasterName ? matchedMasterName.toLowerCase().trim() : "";

    let matchedUnitName = "";
    if (itemData) {
      matchedUnitName = itemData.unitName || "";
      if (!matchedUnitName && Array.isArray(units)) {
        const matchedUnit = units.find((u: any) => String(u.id) === String(itemData.unit));
        if (matchedUnit && matchedUnit.name) {
          matchedUnitName = matchedUnit.name;
        } else if (itemData.unit && isNaN(Number(itemData.unit))) {
          matchedUnitName = itemData.unit;
        }
      }
    }
    setUnitName(matchedUnitName);

    const isAllBatches = !rawBatch || rawBatch === "null" || rawBatch === "undefined" || rawBatch === "All";
    const batchName = isAllBatches ? "" : rawBatch;
    const isDefaultBatch = !isAllBatches && batchName.toLowerCase() === "default";

    let openingQty = 0;
    let openingRate = 0;
    let openingValue = 0;

    if (itemData) {
      if (isAllBatches || isDefaultBatch) {
        // 1. Default to Item Level Opening Balance
        openingQty = Number(itemData.openingBalance || 0);
        openingRate = Number(itemData.openingRate || 0);
        openingValue = openingQty * openingRate;
      }

      // 2. Check Batches (Validation/Override)
      if (itemData.batches && Array.isArray(itemData.batches)) {
        const matchingBatches = itemData.batches.filter((b: any) => {
          if (isAllBatches) return true;
          const bName = b.batchName || "Default";
          return bName.toLowerCase() === batchName.toLowerCase() ||
                 (isDefaultBatch && bName.toLowerCase() === "default");
        });

        let batchQtySum = 0;
        let batchValSum = 0;
        let hasOpeningBatch = false;

        matchingBatches.forEach((b: any) => {
          if (b.mode === 'opening' || (b.opening && b.opening.qty)) {
            const qty = Number(b.opening?.qty || b.batchQuantity || 0);
            const rate = Number(b.opening?.rate || b.openingRate || 0);
            const val = Number(b.opening?.value || (qty * rate) || 0);
            batchQtySum += qty;
            batchValSum += val;
            hasOpeningBatch = true;
          }
        });

        if (hasOpeningBatch) {
          if (isAllBatches) {
            if (batchQtySum > 0) {
              openingQty = batchQtySum;
              openingValue = batchValSum;
            }
          } else {
            openingQty = batchQtySum;
            openingValue = batchValSum;
          }
          openingRate = openingQty > 0 ? openingValue / openingQty : 0;
        }
      }
    }

    // Handle small precision errors
    if (Math.abs(openingQty) < 0.001) openingQty = 0;
    if (Math.abs(openingValue) < 0.01) openingValue = 0;

    // ✅ Filter Transactions
    const purchases = purchaseData.filter((p: any) => {
      const pName = p.itemName ? p.itemName.toLowerCase().trim() : "";
      if (pName !== matchedMasterNameNormalized) return false;
      if (isAllBatches) return true;
      const pBatch = p.batchNumber || "Default";
      if (pBatch.toLowerCase() === batchName.toLowerCase()) return true;
      if (isDefaultBatch && (!p.batchNumber || p.batchNumber === "default" || p.batchNumber === "Default")) return true;
      return false;
    });

    const sales = salesData.filter((s: any) => {
      const sName = s.itemName ? s.itemName.toLowerCase().trim() : "";
      if (sName !== matchedMasterNameNormalized) return false;
      if (isAllBatches) return true;
      const sBatch = s.batchNumber || "Default";
      if (sBatch.toLowerCase() === batchName.toLowerCase()) return true;
      if (isDefaultBatch && (!s.batchNumber || s.batchNumber === "default" || s.batchNumber === "Default")) return true;
      return false;
    });

    // Backfill imported purchases from stock items batches
    if (itemData && itemData.batches && Array.isArray(itemData.batches)) {
      itemData.batches.forEach((b: any) => {
        const bName = b.batchName || "Default";
        const matchBatch = isAllBatches || bName.toLowerCase() === batchName.toLowerCase();
        if (b.mode === "purchase" && matchBatch) {
          const alreadyExists = purchases.some((p: any) => {
            const pBatch = p.batchNumber || "Default";
            return pBatch.toLowerCase() === bName.toLowerCase();
          });

          if (!alreadyExists) {
            purchases.push({
              itemName: matchedMasterName,
              hsnCode: itemData.hsnCode || "",
              batchNumber: bName,
              purchaseQuantity: Number(b.batchQuantity || 0),
              rate: Number(b.openingRate || 0),
              purchaseDate: itemData.createdAt ? itemData.createdAt.split(" ")[0] : new Date().toISOString().split("T")[0],
            });
          }
        } else if (b.mode === "sales" && matchBatch) {
          const alreadyExists = sales.some((s: any) => {
            const sBatch = s.batchNumber || "Default";
            return sBatch.toLowerCase() === bName.toLowerCase();
          });

          if (!alreadyExists) {
            sales.push({
              itemName: matchedMasterName,
              hsnCode: itemData.hsnCode || "",
              batchNumber: bName,
              qtyChange: -Math.abs(Number(b.batchQuantity || 0)),
              rate: Number(b.openingRate || 0),
              movementDate: itemData.createdAt ? itemData.createdAt.split(" ")[0] : new Date().toISOString().split("T")[0],
            });
          }
        }
      });
    }

    // ✅ Group by Month
    const monthMap: Record<string, any> = {};
    const months = getFinancialMonths();

    // pick year dynamically from data
    const baseYear =
      purchases[0]?.purchaseDate ||
      sales[0]?.movementDate ||
      new Date().toISOString();

    const fyStartYear =
      new Date(baseYear).getMonth() >= 3
        ? new Date(baseYear).getFullYear()
        : new Date(baseYear).getFullYear() - 1;

    // Initialize all months with zero
    months.forEach((m, index) => {
      const year = index <= 8 ? fyStartYear : fyStartYear + 1;
      const key = `${m} ${year}`;
      monthMap[key] = { inQty: 0, inValue: 0, outQty: 0, outValue: 0 };
    });

    const getMonthKey = (date: string) => {
      const d = new Date(date);
      const month = d.toLocaleString("en-IN", { month: "long" });
      const year = d.getFullYear();
      return `${month} ${year}`;
    };

    purchases.forEach((p: any) => {
      const key = getMonthKey(p.purchaseDate);
      if (!monthMap[key]) return;

      monthMap[key].inQty += Number(p.purchaseQuantity || 0);
      monthMap[key].inValue +=
        Number(p.purchaseQuantity || 0) * Number(p.rate || 0);
    });

    sales.forEach((s: any) => {
      const key = getMonthKey(s.movementDate);
      if (!monthMap[key]) return;

      const qty = Math.abs(Number(s.qtyChange || 0));
      monthMap[key].outQty += qty;
      monthMap[key].outValue += qty * Number(s.rate || 0);
    });


    // ✅ Running closing (Tally logic)
    let runningQty = openingQty;
    let runningValue = openingValue;

    let startMonthIndex = 0; // Default to April

    let isOpeningMode = false;
    if (openingQty > 0) {
      isOpeningMode = true;
    } else if (itemData && itemData.batches && Array.isArray(itemData.batches)) {
      isOpeningMode = itemData.batches.some((b: any) => {
        const bName = b.batchName || "Default";
        const matchBatch = isAllBatches || bName.toLowerCase() === batchName.toLowerCase();
        return matchBatch && (b.mode === 'opening' || (b.opening && b.opening.qty));
      });
    }

    if (!isOpeningMode) {
      // Reset opening values for non-opening batches
      openingQty = 0;
      openingValue = 0;

      // Find earliest transaction date
      let earliestDate: Date | null = null;

      purchases.forEach((p: any) => {
        const d = new Date(p.purchaseDate);
        if (!earliestDate || d < earliestDate) earliestDate = d;
      });

      // Sales usually happen after purchase, but check just in case
      sales.forEach((s: any) => {
        const d = new Date(s.movementDate || s.date);
        if (!earliestDate || d < earliestDate) earliestDate = d;
      });

      if (earliestDate) {
        // Calculate month index relative to Financial Year start (April)
        // FY Start Year is calculated above as 'fyStartYear'
        // format: April msg = index 0.

        const ed = earliestDate as Date;
        const month = ed.getMonth(); // 0-11
        const year = ed.getFullYear();

        // Convert to financial month index (0 = April, 11 = March)
        // April (3) -> 0. March (2) -> 11.
        // If year == fyStartYear
        // month >= 3 (April) -> index = month - 3
        // If year == fyStartYear + 1
        // month < 3 (Jan-Mar) -> index = month + 9

        let fIndex = 0;
        if (year === fyStartYear) {
          if (month >= 3) fIndex = month - 3;
          else {
            // Should not happen if fyStartYear is correct for the data
            // If data is earlier than fyStartYear, default to 0
            fIndex = 0;
          }
        } else if (year > fyStartYear) {
          // Assume next year Jan-Mar
          fIndex = month + 9;
        }

        startMonthIndex = fIndex;
      }
    }


    const finalRows = Object.entries(monthMap).map(([month, v]: any, index) => {
      // 1. Monthly Opening Balance is the state before any transactions this month
      const currentOpeningQty = runningQty;
      const currentOpeningValue = runningValue;
      const currentOpeningRate = currentOpeningQty > 0 ? currentOpeningValue / currentOpeningQty : 0;

      // 2. Inwards / Outwards Qty, Value, and Rate
      const inQty = v.inQty;
      const inValue = v.inValue;
      const inRate = inQty > 0 ? inValue / inQty : 0;

      const outQty = v.outQty;
      const outValue = v.outValue;
      const outRate = outQty > 0 ? outValue / outQty : 0;

      // 3. Update running totals for the end of the month
      runningQty = runningQty + inQty - outQty;
      runningValue = runningValue + inValue - outValue;

      // Precision adjustment to avoid -0.00 or floating point noise
      if (Math.abs(runningQty) < 0.001) runningQty = 0;
      if (Math.abs(runningValue) < 0.01) runningValue = 0;

      const currentClosingQty = runningQty;
      const currentClosingValue = runningValue;
      const currentClosingRate = currentClosingQty > 0 ? currentClosingValue / currentClosingQty : 0;

      // Determine if we should SHOW the values (same hiding logic as before)
      const showValues = index >= startMonthIndex;

      return {
        month,
        // Opening
        openingQty: showValues ? currentOpeningQty : "",
        openingValue: showValues ? currentOpeningValue : "",
        openingRate: showValues ? currentOpeningRate : "",
        // Inwards
        inQty,
        inValue,
        inRate,
        // Outwards
        outQty,
        outValue,
        outRate,
        // Closing
        closingQty: showValues ? currentClosingQty : "",
        closingValue: showValues ? currentClosingValue : "",
        closingRate: showValues ? currentClosingRate : "",
      };
    });

    setRows(finalRows);
    setLoading(false);
  };

  const formatQty = (val: any) => {
    if (val === "" || val === null || val === undefined || Number(val) === 0) return "";
    return `${Number(val)} ${unitName}`.trim();
  };

  const formatAmount = (val: any) => {
    if (val === "" || val === null || val === undefined || Number(val) === 0) return "";
    return Number(val).toFixed(2);
  };

  // Calculate Grand Totals
  const totalOpeningQty = (rows.length > 0 && typeof rows[0].openingQty === "number") ? rows[0].openingQty : 0;
  const totalOpeningValue = (rows.length > 0 && typeof rows[0].openingValue === "number") ? rows[0].openingValue : 0;
  const totalOpeningRate = totalOpeningQty > 0 ? totalOpeningValue / totalOpeningQty : 0;

  const totalInQty = rows.reduce((sum, r) => sum + Number(r.inQty || 0), 0);
  const totalInValue = rows.reduce((sum, r) => sum + Number(r.inValue || 0), 0);
  const totalInRate = totalInQty > 0 ? totalInValue / totalInQty : 0;

  const totalOutQty = rows.reduce((sum, r) => sum + Number(r.outQty || 0), 0);
  const totalOutValue = rows.reduce((sum, r) => sum + Number(r.outValue || 0), 0);
  const totalOutRate = totalOutQty > 0 ? totalOutValue / totalOutQty : 0;

  const totalClosingQty = (rows.length > 0 && typeof rows[rows.length - 1].closingQty === "number") ? rows[rows.length - 1].closingQty : 0;
  const totalClosingValue = (rows.length > 0 && typeof rows[rows.length - 1].closingValue === "number") ? rows[rows.length - 1].closingValue : 0;
  const totalClosingRate = totalClosingQty > 0 ? totalClosingValue / totalClosingQty : 0;

  return (
    <div className="pt-[56px] px-4">
      {/* <div className="flex items-center mb-4">
        <button onClick={() => navigate(-1)} className="mr-4 p-2 rounded-full">
          <ArrowLeft size={20} />
        </button>
        <h2 className="mx-auto font-bold">Item Monthly Summary</h2>
      </div> */}

      <div className="flex items-center mb-6">
        <button onClick={() => navigate(-1)} className="mr-4 p-2 rounded-full">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">Item Monthly Summary</h1>

        <div className="ml-auto flex space-x-2 relative">
          {/* <button
            onClick={() => setShowSettings((p) => !p)}
            className="p-2 rounded-md hover:bg-gray-200"
            title="Settings"
          > */}
          {/* <Settings size={18} />
          </button> */}

          {/* <button onClick={() => window.print()} className="p-2 rounded-md">
            <Printer size={18} />
          </button> */}

          {/* <button onClick={handleExport} className="p-2 rounded-md">
            <Download size={18} />
          </button> */}

          {/* 🔽 Dropdown */}
          {/* {showSettings && (
            <div className="absolute right-0 top-10 w-64 bg-white border shadow rounded z-50">
              <div className="p-3 border-b font-semibold text-sm">
                Inventory Settings
              </div>

              <div className="p-3 space-y-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={integrate === "integrated"}
                    onChange={() => {
                      setIntegrate("integrated");
                      setShowSettings(false);
                    }}
                  />
                  Integrated account with inventory
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={integrate === "new"}
                    onChange={() => {
                      setIntegrate("new");
                      setShowSettings(false);
                    }}
                  />
                  Create new
                </label>
              </div>
            </div>
          )} */}
        </div>
      </div>

      <div className="p-6 rounded bg-white shadow">
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold">Item Monthly Summary</h2>

          <p className="text-center mb-4 font-semibold">
            {itemName} — {batchName}
          </p>

          {loading ? (
            <p className="text-center">Loading...</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className={theme === "dark" ? "bg-gray-700 text-white" : "bg-gray-200 text-black"}>
                  <th rowSpan={2} className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center font-semibold`}>Month</th>
                  <th colSpan={3} className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center font-semibold`}>Opening Balance</th>
                  <th colSpan={3} className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center font-semibold`}>Inwards</th>
                  <th colSpan={3} className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center font-semibold`}>Outwards</th>
                  <th colSpan={3} className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center font-semibold`}>Closing Balance</th>
                </tr>
                <tr className={theme === "dark" ? "bg-gray-700 text-white" : "bg-gray-200 text-black"}>
                  {/* Opening */}
                  <th className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>Quantity</th>
                  <th className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>Rate</th>
                  <th className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>Value</th>
                  {/* Inwards */}
                  <th className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>Quantity</th>
                  <th className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>Rate</th>
                  <th className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>Value</th>
                  {/* Outwards */}
                  <th className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>Quantity</th>
                  <th className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>Rate</th>
                  <th className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>Value</th>
                  {/* Closing */}
                  <th className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>Quantity</th>
                  <th className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>Rate</th>
                  <th className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    className={`cursor-pointer hover:bg-yellow-100 ${theme === "dark" ? "text-white hover:bg-gray-800" : "text-black hover:bg-yellow-50 bg-white"}`}
                    onClick={() => {
                      navigate(
                        `/app/reports/stock-vouchers?item=${itemName}&batch=${batchName}&month=${r.month}`
                      );
                    }}
                  >
                    <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-left font-medium`}>{r.month}</td>

                    {/* Opening */}
                    <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatQty(r.openingQty)}</td>
                    <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatAmount(r.openingRate)}</td>
                    <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatAmount(r.openingValue)}</td>

                    {/* Inwards */}
                    <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatQty(r.inQty)}</td>
                    <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatAmount(r.inRate)}</td>
                    <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatAmount(r.inValue)}</td>

                    {/* Outwards */}
                    <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatQty(r.outQty)}</td>
                    <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatAmount(r.outRate)}</td>
                    <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatAmount(r.outValue)}</td>

                    {/* Closing */}
                    <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatQty(r.closingQty)}</td>
                    <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatAmount(r.closingRate)}</td>
                    <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatAmount(r.closingValue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={`font-bold ${theme === "dark" ? "bg-gray-800 text-white" : "bg-gray-100 text-black"}`}>
                  <td className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-left`}>Grand Total</td>
                  
                  {/* Opening */}
                  <td className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>{formatQty(totalOpeningQty)}</td>
                  <td className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>{formatAmount(totalOpeningRate)}</td>
                  <td className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>{formatAmount(totalOpeningValue)}</td>

                  {/* Inwards */}
                  <td className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>{formatQty(totalInQty)}</td>
                  <td className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>{formatAmount(totalInRate)}</td>
                  <td className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>{formatAmount(totalInValue)}</td>

                  {/* Outwards */}
                  <td className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>{formatQty(totalOutQty)}</td>
                  <td className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>{formatAmount(totalOutRate)}</td>
                  <td className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>{formatAmount(totalOutValue)}</td>

                  {/* Closing */}
                  <td className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>{formatQty(totalClosingQty)}</td>
                  <td className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>{formatAmount(totalClosingRate)}</td>
                  <td className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center`}>{formatAmount(totalClosingValue)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ItemMonthlySummary;
