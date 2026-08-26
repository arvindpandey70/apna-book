/**
 * SalesInvoiceDownloadModal
 *
 * A self-contained modal that fetches all required data for a sales voucher
 * and renders it through the existing InvoicePrint component — giving the
 * user the *exact same* invoice layout as the one inside SalesVoucher1,
 * but accessible directly from the Sales Register action column.
 */
import React, { useEffect, useState } from "react";
import InvoicePrint from "./InvoicePrint";
import { useAppContext } from "../../../context/AppContext";

// ─── helpers ────────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL;

// ─── types ──────────────────────────────────────────────────────────────────

interface Props {
  /** The sales voucher ID to preview / download */
  voucherId: string | number;
  onClose: () => void;
}

// ─── component ──────────────────────────────────────────────────────────────

const SalesInvoiceDownloadModal: React.FC<Props> = ({ voucherId, onClose }) => {
  const { theme, companyInfo: ctxCompanyInfo } = useAppContext();

  const companyId = localStorage.getItem("company_id") ?? "";
  const ownerType = localStorage.getItem("supplier") ?? "";
  const ownerId =
    localStorage.getItem(ownerType === "employee" ? "employee_id" : "user_id") ??
    "";

  // ── data state ─────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [voucherData, setVoucherData] = useState<any>(null);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [companyInfo, setCompanyInfo] = useState<any>(ctxCompanyInfo ?? null);

  // ── fetch everything in parallel ───────────────────────────────────────────
  useEffect(() => {
    if (!voucherId) return;

    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const [vRes, sRes, lRes, uRes, cRes] = await Promise.all([
          fetch(`${API}/api/sales-vouchers/${voucherId}`),
          fetch(
            `${API}/api/stock-items?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
          ),
          fetch(
            `${API}/api/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
          ),
          fetch(
            `${API}/api/stock-units?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
          ),
          companyId
            ? fetch(`${API}/api/company/company/${companyId}`)
            : Promise.resolve(null),
        ]);

        const [vJson, sJson, lJson, uJson] = await Promise.all([
          vRes.json(),
          sRes.json(),
          lRes.json(),
          uRes.json(),
        ]);

        // ── voucher ───────────────────────────────────────────────────────
        if (!vJson || (!vJson.success && !vJson.id)) {
          throw new Error("Voucher not found");
        }
        const v = vJson;

        // ── ledgers ───────────────────────────────────────────────────────
        const deduplicateLedgers = (list: any[]) => {
          if (!Array.isArray(list)) return [];
          const seen = new Set();
          return list.filter((l) => {
            if (!l) return false;
            const key = l.id != null ? String(l.id) : l.name?.trim().toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        };
        const rawLedgers: any[] = deduplicateLedgers(
          Array.isArray(lJson) ? lJson : lJson?.data ?? []
        );
        setLedgers(rawLedgers);

        // Helper to extract numeric GST % from ledger name e.g. "CGST 9%" → 9
        const extractGst = (ledgerId: any) => {
          if (!ledgerId) return 0;
          const l = rawLedgers.find((x: any) => String(x.id) === String(ledgerId));
          if (l && l.name) {
            const m = l.name.match(/(\d+(\.\d+)?)/);
            return m ? Number(m[1]) : 0;
          }
          return 0;
        };

        // Map entries the same way SalesVoucher1 does in edit mode
        const mappedEntries = (v.entries || []).map((e: any, i: number) => {
          const cgstLedgerId = e.cgstRate ? String(Math.round(Number(e.cgstRate))) : "";
          const sgstLedgerId = e.sgstRate ? String(Math.round(Number(e.sgstRate))) : "";
          const igstLedgerId = e.igstRate ? String(Math.round(Number(e.igstRate))) : "";

          return {
            id: `e${i}`,
            itemId: e.itemId || "",
            quantity: Number(e.quantity) || 0,
            rate: Number(e.rate) || 0,
            discount: Number(e.discount) || 0,
            amount: Number(e.amount) || 0,
            type: e.type || "debit",
            cgstLedgerId,
            sgstLedgerId,
            igstLedgerId,
            cgstRate: extractGst(cgstLedgerId),
            sgstRate: extractGst(sgstLedgerId),
            igstRate: extractGst(igstLedgerId),
            godownId: e.godownId || "",
            salesLedgerId: e.salesLedgerId?.toString() || "",
            hsnCode: e.hsnCode || "",
            batchNumber: e.batchNumber || "",
            discountLedgerId: e.discountLedgerId || "",
            ledgerId: e.ledgerId?.toString() || "",
            narration: e.narration || "",
          };
        });

        setVoucherData({
          date: v.date?.split("T")[0] || "",
          number: v.number || "",
          referenceNo: v.referenceNo || "",
          partyId: String(v.partyId || ""),
          mode: v.mode || "item-invoice",
          salesLedgerId: String(v.salesLedgerId || ""),
          narration: v.narration || "",
          type: "sales",
          dispatchDetails: {
            docNo: v.dispatchDocNo || "",
            through: v.dispatchThrough || "",
            destination: v.destination || "",
            approxDistance: v.approxDistance || "",
          },
          entries: mappedEntries,
        });

        // ── stock items ───────────────────────────────────────────────────
        const rawItems: any[] = Array.isArray(sJson)
          ? sJson
          : sJson?.data ?? sJson?.items ?? [];
        setStockItems(rawItems);

        // ── units ─────────────────────────────────────────────────────────
        const rawUnits: any[] = Array.isArray(uJson) ? uJson : uJson?.data ?? [];
        setUnits(rawUnits);

        // ── company info ──────────────────────────────────────────────────
        if (cRes) {
          const cJson = await cRes.json();
          if (cJson) setCompanyInfo(cJson);
        }
      } catch (err: any) {
        console.error("SalesInvoiceDownloadModal fetch error:", err);
        setError(err?.message || "Failed to load invoice data");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [voucherId, companyId, ownerType, ownerId]);

  // ── helpers that mirror SalesVoucher1 ──────────────────────────────────────

  const allUnits = units;

  const getItemDetails = (itemId: string) => {
    const item = stockItems.find((i: any) => String(i.id) === String(itemId));
    if (!item)
      return { name: "-", hsnCode: "", unit: "-", unitId: "", unitLabel: "", gstRate: 0, rate: 0, batches: [], attributes: [] };

    const rawUnit = item.unitId ?? item.unit_id ?? item.unit ?? item.unitName ?? null;
    const matchedUnit =
      allUnits.find((u: any) => String(u.id) === String(rawUnit)) ||
      allUnits.find(
        (u: any) =>
          u.name?.toLowerCase() === String(rawUnit).toLowerCase() ||
          u.symbol?.toLowerCase() === String(rawUnit).toLowerCase()
      );

    const unitIdResult = matchedUnit?.id ?? rawUnit ?? "";
    const unitLabelResult =
      matchedUnit?.symbol || matchedUnit?.name || String(rawUnit || "");

    // Parse attributes: array of { name, value } from backend
    let parsedAttributes: { name: string; value: string }[] = [];
    if (Array.isArray(item.attributes)) {
      parsedAttributes = item.attributes
        .filter((a: any) => a.name && a.value)
        .map((a: any) => ({ name: String(a.name), value: String(a.value) }));
    }

    return {
      name: item.name,
      hsnCode: item.hsnCode || (item as any).hsn_code || "",
      barcode: item.barcode || (item as any).bar_code || (item as any).Barcode || (item as any).barcode_number || (item as any).item_barcode || "",
      unit: unitLabelResult,
      unitId: unitIdResult,
      unitLabel: unitLabelResult,
      gstRate: Number(item.gstRate) || 0,
      rate: Number(
        item.standardSaleRate ||
          item.sellingRate ||
          item.sellingPrice ||
          item.saleRate ||
          item.rate ||
          item.mrp ||
          0
      ),
      batches: (() => {
        if (!item.batches) return [];
        try {
          return typeof item.batches === "string"
            ? JSON.parse(item.batches)
            : item.batches;
        } catch {
          return [];
        }
      })(),
      attributes: parsedAttributes,
    };
  };

  const calculateTotals = () => {
    if (!voucherData) return { subtotal: 0, cgstTotal: 0, sgstTotal: 0, igstTotal: 0, discountTotal: 0, total: 0 };

    if (voucherData.mode === "item-invoice") {
      let subtotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0, discountTotal = 0;
      voucherData.entries.forEach((entry: any) => {
        const qty = entry.quantity || 0;
        const rate = entry.rate || 0;
        const discount = entry.discount || 0;
        const baseAmount = qty * rate;
        subtotal += baseAmount;
        discountTotal += discount;
        cgstTotal += (baseAmount * (entry.cgstRate || 0)) / 100;
        sgstTotal += (baseAmount * (entry.sgstRate || 0)) / 100;
        igstTotal += (baseAmount * (entry.igstRate || 0)) / 100;
      });
      return {
        subtotal,
        cgstTotal,
        sgstTotal,
        igstTotal,
        discountTotal,
        total: subtotal + cgstTotal + sgstTotal + igstTotal - discountTotal,
      };
    }

    // accounting-invoice fallback
    const debitTotal = voucherData.entries
      .filter((e: any) => e.type === "debit")
      .reduce((s: number, e: any) => s + (e.amount ?? 0), 0);
    return { subtotal: debitTotal, cgstTotal: 0, sgstTotal: 0, igstTotal: 0, discountTotal: 0, total: debitTotal };
  };

  const getGstRateInfo = () => {
    if (!voucherData) return { totalItems: 0, uniqueGstRatesCount: 0, gstRatesUsed: [], breakdown: {} };
    const selectedItems = voucherData.entries.filter(
      (e: any) => e.itemId && e.itemId !== "" && e.itemId !== "select"
    );
    const gstRates = new Set<number>();
    const breakdown: Record<string, { count: number; gstAmount: number }> = {};

    selectedItems.forEach((entry: any) => {
      const itemDetails = getItemDetails(entry.itemId || "");
      const gstRate = Number(itemDetails.gstRate || 0);
      const baseAmount = (entry.quantity || 0) * (entry.rate || 0);
      const gstAmount = (baseAmount * gstRate) / 100;
      gstRates.add(gstRate);
      if (!breakdown[gstRate]) breakdown[gstRate] = { count: 0, gstAmount: 0 };
      breakdown[gstRate].count += 1;
      breakdown[gstRate].gstAmount += gstAmount;
    });

    return {
      totalItems: selectedItems.length,
      uniqueGstRatesCount: gstRates.size,
      gstRatesUsed: Array.from(gstRates).sort((a, b) => a - b),
      breakdown,
    };
  };

  const safeCompanyInfo = companyInfo || {
    name: "Your Company Name",
    address: "",
    gstNumber: "N/A",
    panNumber: "N/A",
    state: "",
  };

  // ── render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 flex flex-col items-center gap-4 shadow-2xl">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-600 font-medium">Loading invoice…</p>
        </div>
      </div>
    );
  }

  if (error || !voucherData) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 flex flex-col items-center gap-4 shadow-2xl max-w-sm">
          <p className="text-red-600 font-semibold text-center">
            {error || "Could not load invoice data."}
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <InvoicePrint
      theme={theme as "light" | "dark"}
      voucherData={voucherData}
      isQuotation={false}
      onClose={onClose}
      getItemDetails={getItemDetails}
      calculateTotals={calculateTotals}
      getGstRateInfo={getGstRateInfo}
      companyInfo={safeCompanyInfo}
      ledgers={ledgers}
    />
  );
};

export default SalesInvoiceDownloadModal;
