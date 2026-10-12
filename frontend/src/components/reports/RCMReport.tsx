import React, { useState, useMemo, useEffect } from "react";
import { useAppContext } from "../../context/AppContext";
import { useCompany } from "../../context/CompanyContext";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  ShoppingBag,
  TrendingDown,
  Briefcase,
  Download,
  Printer,
  Search,
  Loader2,
} from "lucide-react";

export interface RCMEntry {
  id: string;
  date: string;
  voucherNo: string;
  partyName: string;
  partyGstin: string;
  particulars: string;
  category: "purchase" | "direct_expense" | "indirect_expense";
  taxableAmount: number;
  rcmRate: number;
  igst: number;
  cgst: number;
  sgst: number;
  totalRcmTax: number;
  itcEligibility: "Eligible" | "Ineligible" | "Blocked";
  gstType: "b2b" | "b2c";
}

const RCMReport: React.FC = () => {
  const { theme, vouchers = [], ledgers = [] } = useAppContext();
  const { activeCompanyId } = useCompany();
  const navigate = useNavigate();

  const companyId = activeCompanyId ?? localStorage.getItem("company_id") ?? "";
  const ownerType = localStorage.getItem("supplier") || "";
  const ownerId =
    localStorage.getItem(
      ownerType === "employee" ? "employee_id" : "user_id"
    ) || "";

  const [dbPurchaseVouchers, setDbPurchaseVouchers] = useState<any[]>([]);
  const [dbGeneralVouchers, setDbGeneralVouchers] = useState<any[]>([]);
  const [dbLedgers, setDbLedgers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"all" | "purchase" | "direct_expense" | "indirect_expense">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [gstFilter, setGstFilter] = useState<"all" | "b2b" | "b2c" | "rcm">("all");

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return dateStr;
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!companyId || !ownerType || !ownerId) return;
      setLoading(true);
      try {
        const query = `company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;

        // 1. Fetch ledgers
        const ledgerRes = await fetch(`${import.meta.env.VITE_API_URL}/api/ledger?${query}`);
        if (ledgerRes.ok) {
          const lData = await ledgerRes.json();
          if (isMounted) {
            setDbLedgers(lData.data || (Array.isArray(lData) ? lData : []));
          }
        }

        // 2. Fetch purchase vouchers
        const purchaseRes = await fetch(`${import.meta.env.VITE_API_URL}/api/purchase-vouchers?${query}`);
        if (purchaseRes.ok) {
          const pData = await purchaseRes.json();
          if (isMounted) {
            setDbPurchaseVouchers(pData.data || (Array.isArray(pData) ? pData : []));
          }
        }

        // 3. Fetch general vouchers (for expense/journal/payment RCM)
        try {
          const vouchersRes = await fetch(`${import.meta.env.VITE_API_URL}/api/vouchers?${query}`);
          if (vouchersRes.ok) {
            const vData = await vouchersRes.json();
            if (isMounted) {
              setDbGeneralVouchers(vData.data || (Array.isArray(vData) ? vData : []));
            }
          }
        } catch {
          // ignore optional endpoint error
        }
      } catch (err) {
        console.error("Failed to load RCM report data:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [companyId, ownerType, ownerId]);

  const allLedgers = useMemo(() => {
    return [...dbLedgers, ...ledgers];
  }, [dbLedgers, ledgers]);

  // Map real vouchers from backend + AppContext if RCM flag or voucher type is set
  const realRcmData: RCMEntry[] = useMemo(() => {
    const list: RCMEntry[] = [];
    const combinedVouchers = [
      ...dbPurchaseVouchers.map((v) => ({ ...v, voucherType: "purchase" })),
      ...dbGeneralVouchers,
      ...vouchers,
    ];

    const seen = new Set<string>();

    combinedVouchers.forEach((v: any) => {
      const vId = String(v.id || v._id || Math.random());
      if (seen.has(vId)) return;
      seen.add(vId);

      const voucherNumberStr = String(v.number || v.voucherNo || v.voucherNumber || "");
      const isRcm = Boolean(
        v.isRcm ||
        v.rcmApplicable ||
        v.taxType === "RCM" ||
        v.rcm ||
        v.voucherMode === "rcm" ||
        voucherNumberStr.toUpperCase().startsWith("RCM")
      );
      if (!isRcm) return;

      const partyId = v.partyId || v.partyLedgerId;
      const party = allLedgers.find(
        (l: any) =>
          (partyId && String(l.id) === String(partyId)) ||
          (l.name && (l.name === v.partyName || l.name === v.party))
      );
      const partyName = party?.name || v.partyName || v.party || `Party (${partyId || "Unknown"})`;
      const rawGstin =
        party?.gstNumber ||
        party?.gst_number ||
        party?.gstin ||
        party?.gst_no ||
        v.partyGstin ||
        v.gstin ||
        "";
      const hasGstin = Boolean(
        rawGstin &&
        String(rawGstin).trim() &&
        String(rawGstin).trim().toUpperCase() !== "UNREGISTERED"
      );
      const partyGstin = hasGstin ? String(rawGstin).trim() : "Unregistered";
      const gstType: "b2b" | "b2c" = hasGstin ? "b2b" : "b2c";

      let category: "purchase" | "direct_expense" | "indirect_expense" = "purchase";
      const vType = (v.voucherType || v.type || "").toLowerCase();
      if (
        vType === "purchase" ||
        v.purchaseLedgerId ||
        v.supplierInvoiceDate ||
        v.mode?.includes("invoice")
      ) {
        category = "purchase";
      } else if (
        v.expenseCategory === "direct" ||
        v.particulars?.toLowerCase().includes("freight") ||
        v.particulars?.toLowerCase().includes("labour")
      ) {
        category = "direct_expense";
      } else {
        category = "indirect_expense";
      }

      const taxableAmount = parseFloat(v.taxableAmount || v.subtotal || v.amount || 0) || 0;
      const igst = parseFloat(v.igst || v.igstTotal || 0) || 0;
      const cgst = parseFloat(v.cgst || v.cgstTotal || 0) || 0;
      const sgst = parseFloat(v.sgst || v.sgstTotal || 0) || 0;
      const totalRcmTax =
        parseFloat(v.totalRcmTax || 0) ||
        (igst + cgst + sgst > 0 ? igst + cgst + sgst : (taxableAmount * 18) / 100);

      const rcmRate =
        taxableAmount > 0 && totalRcmTax > 0
          ? Math.round((totalRcmTax / taxableAmount) * 100)
          : parseFloat(v.rcmRate || v.gstRate || 18) || 18;

      list.push({
        id: vId,
        date: v.date || new Date().toISOString().split("T")[0],
        voucherNo: voucherNumberStr || "RCM-001",
        partyName,
        partyGstin,
        particulars:
          v.particulars ||
          v.narration ||
          `${category.replace("_", " ").toUpperCase()} RCM Entry`,
        category,
        taxableAmount,
        rcmRate,
        igst,
        cgst,
        sgst,
        totalRcmTax,
        itcEligibility: v.itcEligibility || "Eligible",
        gstType,
      });
    });

    return list;
  }, [dbPurchaseVouchers, dbGeneralVouchers, vouchers, allLedgers]);

  // Apply GST Filter across categories
  const purchaseEntries = useMemo(
    () =>
      realRcmData.filter(
        (d) =>
          d.category === "purchase" &&
          (gstFilter === "all" || gstFilter === "rcm" || d.gstType === gstFilter)
      ),
    [realRcmData, gstFilter]
  );
  const directExpenseEntries = useMemo(
    () =>
      realRcmData.filter(
        (d) =>
          d.category === "direct_expense" &&
          (gstFilter === "all" || gstFilter === "rcm" || d.gstType === gstFilter)
      ),
    [realRcmData, gstFilter]
  );
  const indirectExpenseEntries = useMemo(
    () =>
      realRcmData.filter(
        (d) =>
          d.category === "indirect_expense" &&
          (gstFilter === "all" || gstFilter === "rcm" || d.gstType === gstFilter)
      ),
    [realRcmData, gstFilter]
  );

  const calcTotalTax = (entries: RCMEntry[]) =>
    entries.reduce((sum, item) => sum + item.totalRcmTax, 0);
  const calcTotalTaxable = (entries: RCMEntry[]) =>
    entries.reduce((sum, item) => sum + item.taxableAmount, 0);

  const totalPurchaseTax = calcTotalTax(purchaseEntries);
  const totalDirectTax = calcTotalTax(directExpenseEntries);
  const totalIndirectTax = calcTotalTax(indirectExpenseEntries);
  const grandTotalRcmTax = totalPurchaseTax + totalDirectTax + totalIndirectTax;

  const filterEntries = (entries: RCMEntry[]) => {
    if (!searchTerm) return entries;
    const term = searchTerm.toLowerCase();
    return entries.filter(
      (e) =>
        e.partyName.toLowerCase().includes(term) ||
        e.particulars.toLowerCase().includes(term) ||
        e.voucherNo.toLowerCase().includes(term) ||
        e.partyGstin.toLowerCase().includes(term)
    );
  };

  const handleExport = () => {
    const currentList = (
      activeTab === "all"
        ? [...purchaseEntries, ...directExpenseEntries, ...indirectExpenseEntries]
        : activeTab === "purchase"
        ? purchaseEntries
        : activeTab === "direct_expense"
        ? directExpenseEntries
        : indirectExpenseEntries
    );

    const filtered = filterEntries(currentList);
    if (filtered.length === 0) {
      alert("No data to export");
      return;
    }

    const headers = [
      "Date",
      "Voucher No",
      "GST Type",
      "Party / Vendor Name",
      "GSTIN / Status",
      "Partition / Category",
      "Particulars",
      "Taxable Amt",
      "RCM %",
      "IGST",
      "CGST",
      "SGST",
      "Total RCM Tax",
      "ITC Credit",
    ];

    const rows = filtered.map((r) => [
      `"${formatDate(r.date)}"`,
      `"${r.voucherNo}"`,
      `"${r.gstType.toUpperCase()}"`,
      `"${r.partyName.replace(/"/g, '""')}"`,
      `"${r.partyGstin}"`,
      `"${r.category}"`,
      `"${r.particulars.replace(/"/g, '""')}"`,
      r.taxableAmount.toFixed(2),
      r.rcmRate,
      r.igst.toFixed(2),
      r.cgst.toFixed(2),
      r.sgst.toFixed(2),
      r.totalRcmTax.toFixed(2),
      `"${r.itcEligibility}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `RCM_Report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderRcmTable = (entries: RCMEntry[], partitionTitle: string, themeColor: string) => {
    const list = filterEntries(entries);
    const partitionTaxable = calcTotalTaxable(list);
    const partitionTax = calcTotalTax(list);

    return (
      <div
        className={`border rounded-xl overflow-hidden mb-8 ${
          theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
        }`}
      >
        {/* Partition Header */}
        <div
          className={`p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            theme === "dark" ? "bg-gray-850 border-gray-700" : `${themeColor} border-gray-200`
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-red-600 inline-block"></span>
            <h3 className="font-bold text-base text-gray-900 dark:text-white">
              {partitionTitle}
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-900">
              {list.length} Vouchers
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold">
            <div className="text-gray-600 dark:text-gray-300">
              Taxable: <span className="font-bold text-gray-900 dark:text-white">₹{partitionTaxable.toLocaleString("en-IN")}</span>
            </div>
            <div className="text-red-600 dark:text-red-400">
              RCM Tax: <span className="font-bold text-lg">₹{partitionTax.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>

        {/* Partition Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-b">
              <tr>
                <th className="px-3.5 py-3">Date</th>
                <th className="px-3.5 py-3">Voucher No</th>
                <th className="px-3.5 py-3">Party / Vendor Name</th>
                <th className="px-3.5 py-3">GSTIN / Status</th>
                <th className="px-3.5 py-3">Particulars / Head</th>
                <th className="px-3.5 py-3 text-right">Taxable Amt (₹)</th>
                <th className="px-3.5 py-3 text-center">RCM %</th>
                <th className="px-3.5 py-3 text-right">IGST (₹)</th>
                <th className="px-3.5 py-3 text-right">CGST (₹)</th>
                <th className="px-3.5 py-3 text-right">SGST (₹)</th>
                <th className="px-3.5 py-3 text-right font-bold">Total RCM Tax (₹)</th>
                <th className="px-3.5 py-3 text-center">ITC Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {list.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="animate-spin text-red-600" size={18} />
                        <span>Loading RCM vouchers...</span>
                      </div>
                    ) : (
                      `No RCM vouchers found in ${partitionTitle}.`
                    )}
                  </td>
                </tr>
              ) : (
                list.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                    <td className="px-3.5 py-3 font-medium text-gray-500">{formatDate(r.date)}</td>
                    <td className="px-3.5 py-3 font-mono font-bold text-blue-600 dark:text-blue-400">{r.voucherNo}</td>
                    <td className="px-3.5 py-3 font-bold text-gray-900 dark:text-gray-100">{r.partyName}</td>
                    <td className="px-3.5 py-3 font-mono text-gray-600 dark:text-gray-400">{r.partyGstin}</td>
                    <td className="px-3.5 py-3 text-gray-700 dark:text-gray-300 font-medium">{r.particulars}</td>
                    <td className="px-3.5 py-3 text-right font-medium">₹{r.taxableAmount.toLocaleString("en-IN")}</td>
                    <td className="px-3.5 py-3 text-center font-bold text-red-600 dark:text-red-400">{r.rcmRate}%</td>
                    <td className="px-3.5 py-3 text-right">₹{r.igst.toLocaleString("en-IN")}</td>
                    <td className="px-3.5 py-3 text-right">₹{r.cgst.toLocaleString("en-IN")}</td>
                    <td className="px-3.5 py-3 text-right">₹{r.sgst.toLocaleString("en-IN")}</td>
                    <td className="px-3.5 py-3 text-right font-extrabold text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20">
                      ₹{r.totalRcmTax.toLocaleString("en-IN")}
                    </td>
                    <td className="px-3.5 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300">
                        {r.itcEligibility}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Partition Total Footer */}
            <tfoot className="bg-gray-50 dark:bg-gray-900/80 font-bold border-t">
              <tr>
                <td colSpan={5} className="px-3.5 py-3 text-gray-900 dark:text-white uppercase tracking-wider">
                  Sub-Total for {partitionTitle}
                </td>
                <td className="px-3.5 py-3 text-right">₹{partitionTaxable.toLocaleString("en-IN")}</td>
                <td></td>
                <td className="px-3.5 py-3 text-right">₹{list.reduce((a, b) => a + b.igst, 0).toLocaleString("en-IN")}</td>
                <td className="px-3.5 py-3 text-right">₹{list.reduce((a, b) => a + b.cgst, 0).toLocaleString("en-IN")}</td>
                <td className="px-3.5 py-3 text-right">₹{list.reduce((a, b) => a + b.sgst, 0).toLocaleString("en-IN")}</td>
                <td className="px-3.5 py-3 text-right text-red-600 dark:text-red-400 font-extrabold text-sm">
                  ₹{partitionTax.toLocaleString("en-IN")}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`pt-[56px] px-4 min-h-[calc(100vh-64px)] pb-12 ${
        theme === "dark" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-800"
      }`}
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-2 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div className="flex items-center">
          <button
            onClick={() => navigate("/app/reports")}
            title="Back to Reports"
            className={`p-2 rounded-lg mr-3 transition-colors ${
              theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700 text-white border border-gray-700"
                : "bg-white hover:bg-gray-100 text-gray-700 border shadow-sm"
            }`}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
              <FileText className="text-red-600 dark:text-red-400" size={28} />
              RCM Report (Reverse Charge Mechanism)
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              GST Tax Liability under RCM • Categorized into 3 Partitions: Purchase, Direct Expense & Indirect Expense
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Corner GST Type Filter Dropdown */}
          <div className="flex items-center">
            <select
              id="gst-filter"
              value={gstFilter}
              onChange={(e) => setGstFilter(e.target.value as "all" | "b2b" | "b2c" | "rcm")}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 shadow-sm cursor-pointer hover:border-gray-400 transition-colors"
              title="Filter by GST Type"
            >
              <option value="all">All Vouchers</option>
              <option value="b2b">B2B</option>
              <option value="b2c">B2C</option>
              <option value="rcm">RCM</option>
            </select>
          </div>

          <button
            onClick={() => window.print()}
            className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1.5"
          >
            <Printer size={15} /> Print
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Download size={15} /> Export Report
          </button>
        </div>
      </div>

      {/* 3 Summary Partitions Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Part 1 Card: RCM on Purchase */}
        <div
          onClick={() => setActiveTab("purchase")}
          className={`p-5 rounded-xl border cursor-pointer transition-all ${
            activeTab === "purchase"
              ? "ring-2 ring-blue-500 border-blue-500 bg-blue-50/50 dark:bg-blue-950/30"
              : theme === "dark"
              ? "bg-gray-800 border-gray-700 hover:bg-gray-750"
              : "bg-white border-gray-200 shadow-sm hover:bg-blue-50/20"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950">
              Part 1
            </span>
            <ShoppingBag className="text-blue-600 dark:text-blue-400" size={20} />
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">RCM on Purchase</h3>
          <p className="text-xs text-gray-500 mt-0.5">GTA & Unregistered Purchase Vouchers</p>
          <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-3">
            ₹{totalPurchaseTax.toLocaleString("en-IN")}
          </div>
        </div>

        {/* Part 2 Card: RCM on Direct Expense */}
        <div
          onClick={() => setActiveTab("direct_expense")}
          className={`p-5 rounded-xl border cursor-pointer transition-all ${
            activeTab === "direct_expense"
              ? "ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30"
              : theme === "dark"
              ? "bg-gray-800 border-gray-700 hover:bg-gray-750"
              : "bg-white border-gray-200 shadow-sm hover:bg-indigo-50/20"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950">
              Part 2
            </span>
            <TrendingDown className="text-indigo-600 dark:text-indigo-400" size={20} />
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">RCM on Direct Expense</h3>
          <p className="text-xs text-gray-500 mt-0.5">Freight, Direct Labour & Carriage RCM</p>
          <div className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-3">
            ₹{totalDirectTax.toLocaleString("en-IN")}
          </div>
        </div>

        {/* Part 3 Card: RCM on Indirect Expense */}
        <div
          onClick={() => setActiveTab("indirect_expense")}
          className={`p-5 rounded-xl border cursor-pointer transition-all ${
            activeTab === "indirect_expense"
              ? "ring-2 ring-purple-500 border-purple-500 bg-purple-50/50 dark:bg-purple-950/30"
              : theme === "dark"
              ? "bg-gray-800 border-gray-700 hover:bg-gray-750"
              : "bg-white border-gray-200 shadow-sm hover:bg-purple-50/20"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950">
              Part 3
            </span>
            <Briefcase className="text-purple-600 dark:text-purple-400" size={20} />
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">RCM on Indirect Expense</h3>
          <p className="text-xs text-gray-500 mt-0.5">Legal, Director Remuneration & Security RCM</p>
          <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-3">
            ₹{totalIndirectTax.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* Filter / Partition Selector Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        {/* Partition Tabs */}
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "all"
                ? "bg-red-600 text-white shadow-md"
                : theme === "dark"
                ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                : "bg-white text-gray-700 border hover:bg-gray-100"
            }`}
          >
            View All 3 Partitions (₹{grandTotalRcmTax.toLocaleString("en-IN")})
          </button>
          <button
            onClick={() => setActiveTab("purchase")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "purchase"
                ? "bg-blue-600 text-white shadow-md"
                : theme === "dark"
                ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                : "bg-white text-gray-700 border hover:bg-gray-100"
            }`}
          >
            1. RCM on Purchase ({purchaseEntries.length})
          </button>
          <button
            onClick={() => setActiveTab("direct_expense")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "direct_expense"
                ? "bg-indigo-600 text-white shadow-md"
                : theme === "dark"
                ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                : "bg-white text-gray-700 border hover:bg-gray-100"
            }`}
          >
            2. RCM on Direct Expense ({directExpenseEntries.length})
          </button>
          <button
            onClick={() => setActiveTab("indirect_expense")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "indirect_expense"
                ? "bg-purple-600 text-white shadow-md"
                : theme === "dark"
                ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                : "bg-white text-gray-700 border hover:bg-gray-100"
            }`}
          >
            3. RCM on Indirect Expense ({indirectExpenseEntries.length})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search party, GSTIN, voucher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-3.5 py-2 w-full border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      {/* Partition Content Views */}
      {(activeTab === "all" || activeTab === "purchase") &&
        renderRcmTable(purchaseEntries, "Part 1: RCM on Purchase", "bg-blue-50/70 dark:bg-blue-950/30")}

      {(activeTab === "all" || activeTab === "direct_expense") &&
        renderRcmTable(directExpenseEntries, "Part 2: RCM on Direct Expense", "bg-indigo-50/70 dark:bg-indigo-950/30")}

      {(activeTab === "all" || activeTab === "indirect_expense") &&
        renderRcmTable(indirectExpenseEntries, "Part 3: RCM on Indirect Expense", "bg-purple-50/70 dark:bg-purple-950/30")}
    </div>
  );
};

export default RCMReport;
