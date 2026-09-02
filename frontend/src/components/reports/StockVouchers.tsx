import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Swal from "sweetalert2";
import { useAppContext } from "../../context/AppContext";

const StockVouchers = () => {
  const { theme, units } = useAppContext();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const itemName = params.get("item");
  const batchName = params.get("batch");
  const monthLabel = params.get("month");

  const [rows, setRows] = useState<any[]>([]);

  const handleVoucherClick = (row: any) => {
    if (!row || row.isOpening) return;

    const targetVoucherId = row.voucherId || row.vchNo;

    if (!targetVoucherId || String(targetVoucherId).startsWith("imported") || targetVoucherId === "Imported") {
      Swal.fire({
        icon: "info",
        title: "Imported / Opening Entry",
        text: "This entry is from opening stock or imported item data and does not have an editable voucher record.",
      });
      return;
    }

    const encodedId = encodeURIComponent(String(targetVoucherId));
    const typeLower = (row.type || "").toLowerCase();
    if (typeLower.includes("purchase")) {
      navigate(`/app/vouchers/purchase/edit/${encodedId}`);
    } else if (typeLower.includes("sale")) {
      navigate(`/app/vouchers/sales/edit/${encodedId}`);
    }
  };
  const [loading, setLoading] = useState(false);
  const [accumulatedQty, setAccumulatedQty] = useState(0);
  const [accumulatedValue, setAccumulatedValue] = useState(0);
  const [unitName, setUnitName] = useState("");

  const company_id = localStorage.getItem("company_id") || "";
  const owner_type = localStorage.getItem("owner_type") || "employee";
  const owner_id =
    localStorage.getItem(
      owner_type === "employee" ? "employee_id" : "user_id"
    ) || "";

  useEffect(() => {
    if (!itemName || !monthLabel) return;
    loadVouchers();
  }, [itemName, batchName, monthLabel]);

  /* 🔹 Month → date range */
  const getMonthRange = (label: string) => {
    const [monthName, year] = label.split(" ");
    const start = new Date(`${monthName} 1, ${year}`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    return { start, end };
  };

  /* ✅ SAFE Voucher Number Resolver */
  const getVoucherNumber = (v: any) => {
    return v.voucherNo || v.number || v.id;
  };

  /* 🔹 Load vouchers */
  const loadVouchers = async () => {
    setLoading(true);

    const { start, end } = getMonthRange(monthLabel!);

    const params = new URLSearchParams({
      company_id,
      owner_type,
      owner_id,
    });

    const [purchaseRes, salesRes, stockItemRes, allPvRes, allSvRes] = await Promise.all([
      fetch(`${import.meta.env.VITE_API_URL}/api/purchase-vouchers/purchase-history?${params}`),
      fetch(`${import.meta.env.VITE_API_URL}/api/sales-vouchers/sale-history?${params}`),
      fetch(`${import.meta.env.VITE_API_URL}/api/stock-items?${params}`),
      fetch(`${import.meta.env.VITE_API_URL}/api/purchase-vouchers?${params}`),
      fetch(`${import.meta.env.VITE_API_URL}/api/sales-vouchers?${params}`),
    ]);

    const purchases = (await purchaseRes.json()).data || [];
    const sales = (await salesRes.json()).data || [];
    const stockItemsData = (await stockItemRes.json()).data || [];

    let allPv: any[] = [];
    try {
      const pvJson = await allPvRes.json();
      allPv = pvJson.data || (Array.isArray(pvJson) ? pvJson : []);
    } catch (e) {}

    let allSv: any[] = [];
    try {
      const svJson = await allSvRes.json();
      allSv = svJson.data || (Array.isArray(svJson) ? svJson : []);
    } catch (e) {}

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

    const isAllBatches = !batchName || batchName === "null" || batchName === "undefined" || batchName === "All" || batchName === "";
    const isDefaultBatch = isAllBatches || batchName.toLowerCase() === "default";

    // 🔹 Match Logic Helper (Consistent with ItemMonthlySummary)
    const isMatch = (itemBatch: string | null | undefined) => {
      if (isAllBatches || isDefaultBatch) return true;
      if (!itemBatch) return false;
      return itemBatch.toLowerCase() === batchName.toLowerCase();
    };

    // Backfill imported purchases from stock items batches
    if (itemData && itemData.batches && Array.isArray(itemData.batches)) {
      itemData.batches.forEach((b: any) => {
        if (b.mode === "purchase") {
          const bName = b.batchName || "Default";
          const matchBatch = isMatch(bName);
          if (matchBatch) {
            const alreadyExists = purchases.some((p: any) => {
              const pBatch = p.batchNumber || "Default";
              const pName = p.itemName ? p.itemName.toLowerCase().trim() : "";
              return pBatch.toLowerCase() === bName.toLowerCase() && pName === matchedMasterNameNormalized;
            });

            if (!alreadyExists) {
              purchases.push({
                id: `imported-${b.id || b.batchName}`,
                itemName: matchedMasterName,
                hsnCode: itemData.hsnCode || "",
                batchNumber: bName,
                purchaseQuantity: Number(b.batchQuantity || 0),
                rate: Number(b.openingRate || 0),
                purchaseDate: itemData.createdAt ? itemData.createdAt.split(" ")[0] : new Date().toISOString().split("T")[0],
                partyName: "Imported Purchase",
                voucherNumber: "Imported",
              });
            }
          }
        } else if (b.mode === "sales") {
          const bName = b.batchName || "Default";
          const matchBatch = isMatch(bName);
          if (matchBatch) {
            const alreadyExists = sales.some((s: any) => {
              const sBatch = s.batchNumber || "Default";
              const sName = s.itemName ? s.itemName.toLowerCase().trim() : "";
              return sBatch.toLowerCase() === bName.toLowerCase() && sName === matchedMasterNameNormalized;
            });

            if (!alreadyExists) {
              sales.push({
                id: `imported-${b.id || b.batchName}`,
                itemName: matchedMasterName,
                hsnCode: itemData.hsnCode || "",
                batchNumber: bName,
                qtyChange: -Math.abs(Number(b.batchQuantity || 0)),
                rate: Number(b.openingRate || 0),
                movementDate: itemData.createdAt ? itemData.createdAt.split(" ")[0] : new Date().toISOString().split("T")[0],
                partyName: "Imported Sales",
                voucherNumber: "Imported",
              });
            }
          }
        }
      });
    }

    /* ------------------------------------------------------------------
     * 1. Calculate Opening Balance (Forward Calculation)
     *    Use Master Opening Balance as the true starting point.
     * ------------------------------------------------------------------ */

    let openingQty = 0;
    let openingValue = 0;

    if (itemData) {
      if (isDefaultBatch) {
        // 1. Default to Item Level Opening Balance
        openingQty = Number(itemData.openingBalance || 0);
        openingValue = openingQty * Number(itemData.openingRate || 0);
      }

      // 2. Check Batches (Validation/Override)
      if (itemData.batches && Array.isArray(itemData.batches)) {
        const matchingBatches = itemData.batches.filter((b: any) =>
          b.batchName === batchName ||
          (isDefaultBatch && (!b.batchName || b.batchName === "Default"))
        );

        let batchQtySum = 0;
        let batchValSum = 0;
        let hasOpeningBatch = false;

        matchingBatches.forEach((b: any) => {
          if (b.mode === 'opening') {
            batchQtySum += Number(b.batchQuantity || 0);
            batchValSum += Number(b.batchQuantity || 0) * Number(b.openingRate || 0);
            hasOpeningBatch = true;
          }
        });

        if (hasOpeningBatch) {
          openingQty = batchQtySum;
          openingValue = batchValSum;
        }
      }
    }

    // Handle small precision errors
    if (Math.abs(openingQty) < 0.001) openingQty = 0;
    if (Math.abs(openingValue) < 0.01) openingValue = 0;

    /* ------------------------------------------------------------------
     * 2. Build Voucher Rows (Current Month)
     * ------------------------------------------------------------------ */
    const tempRows: any[] = [];

    purchases.forEach((p: any) => {
      const d = new Date(p.purchaseDate);
      const pName = p.itemName ? p.itemName.toLowerCase().trim() : "";
      if (
        pName === matchedMasterNameNormalized &&
        isMatch(p.batchNumber) &&
        d >= start &&
        d <= end
      ) {
        const matchedPv = allPv.find((v: any) => 
          String(v.number || "").trim().toLowerCase() === String(p.voucherNumber || "").trim().toLowerCase()
        );
        const resolvedVoucherId = p.voucherId || p.voucher_id || (matchedPv ? matchedPv.id : p.voucherNumber);

        tempRows.push({
          id: p.id,
          voucherId: resolvedVoucherId,
          date: d,
          party: p.partyName || p.ledgerName || "-",
          type: "Purchase",
          vchNo: p.voucherNumber,
          inQty: Number(p.purchaseQuantity || 0),
          inValue: Number(p.purchaseQuantity || 0) * Number(p.rate || 0),
          outQty: 0,
          outValue: 0,
        });
      }
    });

    sales.forEach((s: any) => {
      const d = new Date(s.movementDate || s.date);
      const sName = s.itemName ? s.itemName.toLowerCase().trim() : "";
      if (
        sName === matchedMasterNameNormalized &&
        isMatch(s.batchNumber) &&
        d >= start &&
        d <= end
      ) {
        const matchedSv = allSv.find((v: any) => 
          String(v.number || "").trim().toLowerCase() === String(s.voucherNumber || "").trim().toLowerCase()
        );
        const resolvedVoucherId = s.voucherId || s.voucher_id || (matchedSv ? matchedSv.id : s.voucherNumber);

        const qty = Math.abs(Number(s.qtyChange || 0));
        tempRows.push({
          id: s.id,
          voucherId: resolvedVoucherId,
          date: d,
          party: s.partyName || s.ledgerName || "-",
          type: "Sales",
          vchNo: s.voucherNumber,
          inQty: 0,
          inValue: 0,
          outQty: qty,
          outValue: qty * Number(s.rate || 0),
        });
      }
    });

    tempRows.sort((a, b) => {
      const timeDiff = a.date.getTime() - b.date.getTime();
      if (timeDiff !== 0) return timeDiff;

      // Extract numeric IDs if possible, else compare as strings/fallbacks
      const idA = typeof a.id === "string" && a.id.startsWith("imported") ? 0 : Number(a.id || 0);
      const idB = typeof b.id === "string" && b.id.startsWith("imported") ? 0 : Number(b.id || 0);

      if (idA !== idB) return idA - idB;

      // Secondary fallback (Purchase before Sales)
      if (a.type !== b.type) {
        return a.type === "Purchase" ? -1 : 1;
      }
      return 0;
    });

    // 🔹 Accumulated opening (before month)
    let accumulatedQty = openingQty;
    let accumulatedValue = openingValue;

    purchases.forEach((p: any) => {
      const d = new Date(p.purchaseDate);
      const pName = p.itemName ? p.itemName.toLowerCase().trim() : "";
      if (
        pName === matchedMasterNameNormalized &&
        isMatch(p.batchNumber) &&
        d < start
      ) {
        accumulatedQty += Number(p.purchaseQuantity || 0);
        accumulatedValue += Number(p.purchaseQuantity || 0) * Number(p.rate || 0);
      }
    });

    sales.forEach((s: any) => {
      const d = new Date(s.movementDate || s.date);
      const sName = s.itemName ? s.itemName.toLowerCase().trim() : "";
      if (
        sName === matchedMasterNameNormalized &&
        isMatch(s.batchNumber) &&
        d < start
      ) {
        const qty = Math.abs(Number(s.qtyChange || 0));
        accumulatedQty -= qty;
        accumulatedValue -= qty * Number(s.rate || 0);
      }
    });

    // 🔹 Running closing
    let currentQty = accumulatedQty;
    let currentValue = accumulatedValue;
    const finalRows: any[] = [];

    // Add Opening Row if there is a balance brought forward
    if (Math.abs(accumulatedQty) > 0.001 || Math.abs(accumulatedValue) > 0.01) {
      const opRate = accumulatedQty > 0 ? accumulatedValue / accumulatedQty : 0;
      finalRows.push({
        isOpening: true,
        date: start, // First day of month
        openingQty: accumulatedQty,
        openingValue: accumulatedValue,
        openingRate: opRate,
        inQty: 0,
        inValue: 0,
        inRate: 0,
        outQty: 0,
        outValue: 0,
        outRate: 0,
        closingQty: accumulatedQty,
        closingValue: accumulatedValue,
        closingRate: opRate
      });
    }

    tempRows.forEach((r) => {
      const opQty = currentQty;
      const opValue = currentValue;
      const opRate = opQty > 0 ? opValue / opQty : 0;

      const inQty = r.inQty;
      const inValue = r.inValue;
      const inRate = inQty > 0 ? inValue / inQty : 0;

      const outQty = r.outQty;
      const outValue = r.outValue;
      const outRate = outQty > 0 ? outValue / outQty : 0;

      currentQty += inQty - outQty;
      currentValue += inValue - outValue;

      // Precision adjustment
      if (Math.abs(currentQty) < 0.001) currentQty = 0;
      if (Math.abs(currentValue) < 0.01) currentValue = 0;

      const clQty = currentQty;
      const clValue = currentValue;
      const clRate = clQty > 0 ? clValue / clQty : 0;

      finalRows.push({
        ...r,
        openingQty: opQty,
        openingValue: opValue,
        openingRate: opRate,
        inQty,
        inValue,
        inRate,
        outQty,
        outValue,
        outRate,
        closingQty: clQty,
        closingValue: clValue,
        closingRate: clRate
      });
    });

    setAccumulatedQty(accumulatedQty);
    setAccumulatedValue(accumulatedValue);
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
  const totalOpeningQty = accumulatedQty;
  const totalOpeningValue = accumulatedValue;
  const totalOpeningRate = totalOpeningQty > 0 ? totalOpeningValue / totalOpeningQty : 0;

  const totalInQty = rows.filter(r => !r.isOpening).reduce((sum, r) => sum + Number(r.inQty || 0), 0);
  const totalInValue = rows.filter(r => !r.isOpening).reduce((sum, r) => sum + Number(r.inValue || 0), 0);
  const totalInRate = totalInQty > 0 ? totalInValue / totalInQty : 0;

  const totalOutQty = rows.filter(r => !r.isOpening).reduce((sum, r) => sum + Number(r.outQty || 0), 0);
  const totalOutValue = rows.filter(r => !r.isOpening).reduce((sum, r) => sum + Number(r.outValue || 0), 0);
  const totalOutRate = totalOutQty > 0 ? totalOutValue / totalOutQty : 0;

  const totalClosingQty = accumulatedQty + totalInQty - totalOutQty;
  const totalClosingValue = accumulatedValue + totalInValue - totalOutValue;
  const totalClosingRate = totalClosingQty > 0 ? totalClosingValue / totalClosingQty : 0;

  /* ================= UI (UNCHANGED) ================= */

  return (
    <div className="pt-[56px] px-4">
      {/* Header */}
      <div className="flex items-center mb-6">
        <button onClick={() => navigate(-1)} className="mr-4 p-2 rounded-full">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">Stock Vouchers</h1>
      </div>

      {/* Content Card */}
      <div className="p-6 rounded bg-white shadow">
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold">Stock Vouchers</h2>

          <p className="text-center mb-4 font-semibold">
            {itemName} — {batchName} ({monthLabel})
          </p>

          {loading ? (
            <p className="text-center">Loading...</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className={theme === "dark" ? "bg-gray-700 text-white" : "bg-gray-200 text-black"}>
                  <th rowSpan={2} className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center font-semibold`}>Date</th>
                  <th rowSpan={2} className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center font-semibold`}>Particulars</th>
                  <th rowSpan={2} className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center font-semibold`}>Vch Type</th>
                  <th rowSpan={2} className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-center font-semibold`}>Vch No</th>
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
                    onClick={() => !r.isOpening && handleVoucherClick(r)}
                    className={
                      r.isOpening
                        ? `${theme === "dark" ? "bg-gray-800 text-white font-bold" : "bg-gray-100 font-bold text-black"}`
                        : `cursor-pointer transition-colors ${
                            theme === "dark"
                              ? "text-white hover:bg-gray-700"
                              : "text-black hover:bg-yellow-50 bg-white"
                          }`
                    }
                  >
                    {r.isOpening ? (
                      <>
                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center font-medium`}>
                          {r.date.toLocaleDateString("en-GB")}
                        </td>

                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-left font-bold`}>
                          Opening Balance
                        </td>

                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}></td>
                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}></td>

                        {/* Opening */}
                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatQty(r.openingQty)}</td>
                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatAmount(r.openingRate)}</td>
                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatAmount(r.openingValue)}</td>

                        {/* Inwards */}
                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}></td>
                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}></td>
                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}></td>

                        {/* Outwards */}
                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}></td>
                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}></td>
                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}></td>

                        {/* Closing */}
                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatQty(r.closingQty)}</td>
                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatAmount(r.closingRate)}</td>
                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{formatAmount(r.closingValue)}</td>
                      </>
                    ) : (
                      <>
                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>
                          {r.date.toLocaleDateString("en-GB")}
                        </td>

                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-left font-medium text-gray-700 ${theme === "dark" ? "text-gray-300" : ""}`}>
                          {r.party || "Particulars"}
                        </td>

                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center`}>{r.type}</td>

                        <td className={`border ${theme === "dark" ? "border-gray-700" : "border-gray-200"} p-1 text-center font-semibold`}>
                          {r.vchNo && r.vchNo !== "Imported" ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleVoucherClick(r);
                              }}
                              className="cursor-pointer font-bold inline-block"
                              title="Click to edit voucher"
                            >
                              {r.vchNo}
                            </button>
                          ) : (
                            r.vchNo || "-"
                          )}
                        </td>

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
                      </>
                    )}
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className={`font-bold ${theme === "dark" ? "bg-gray-800 text-white" : "bg-gray-100 text-black"}`}>
                  <td className={`border ${theme === "dark" ? "border-gray-600" : "border-gray-300"} p-1 text-left`} colSpan={4}>Grand Total</td>
                  
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

export default StockVouchers;
