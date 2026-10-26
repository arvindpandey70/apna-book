import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAppContext } from "../../context/AppContext";
import { useCompany } from "../../context/CompanyContext";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart2,
  Upload,
  Search,
  Download,
  RefreshCw,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronLeft,
  ChevronRight,
  Filter,
  Columns,
  Eye,
  X,
  FileSpreadsheet,
  Building2,
} from "lucide-react";
import * as XLSX from "xlsx-js-style";
import {
  fetchLatestGstr1FromDatabase,
  fetchGstr1Invoices,
  fetchGstr1Periods,
  saveGstr1ToDatabase,
} from "../../services/gstr1ImportService";
import type {
  GstB2bInvoiceRow,
  GstB2cSummaryRow,
  ParsedGstr1Data,
} from "./gst-scanner/GstJsonScanner";
import { getReportData, type StoredReportData } from "../../services/reportImportService";

interface Gstr3bSummary {
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  totalTax: number;
  section: string;
}

const Gstr1VsGstr3bReport: React.FC = () => {
  const { theme } = useAppContext();
  const { companyInfo, activeCompanyId } = useCompany();
  const navigate = useNavigate();

  // Company ID resolution
  const targetCompanyId = useMemo(() => {
    return (
      activeCompanyId ||
      companyInfo?.id ||
      localStorage.getItem("company_id") ||
      "1"
    );
  }, [activeCompanyId, companyInfo]);

  // Data States
  const [gstr1Invoices, setGstr1Invoices] = useState<GstB2bInvoiceRow[]>([]);
  const [gstr1B2cSummaries, setGstr1B2cSummaries] = useState<GstB2cSummaryRow[]>([]);
  const [gstr1Metadata, setGstr1Metadata] = useState<{
    gstin?: string;
    fp?: string;
    filing_typ?: string;
    fil_dt?: string;
    fileName?: string;
  } | null>(null);

  const [gstr3bRows, setGstr3bRows] = useState<Gstr3bSummary[]>([]);
  const [reportDataFallback, setReportDataFallback] = useState<StoredReportData | null>(null);

  // Loading & Error States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Controls
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("all");
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"b2b" | "b2c">("b2b");
  const [viewMode, setViewMode] = useState<"split" | "gstr1-full" | "gstr3b-full">("split");

  // Pagination for GSTR-1 Invoices
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Currency Formatter
  const formatCurrency = (val: number | string | undefined | null): string => {
    const num = typeof val === "number" ? val : parseFloat(String(val || 0));
    if (isNaN(num)) return "₹0.00";
    return `₹${num.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Date Formatter (DD-MM-YYYY)
  const formatDate = (dateStr: string | undefined | null): string => {
    if (!dateStr) return "-";
    const str = String(dateStr).trim();
    const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (dmyMatch) {
      return `${dmyMatch[1].padStart(2, "0")}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[3]}`;
    }
    const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (isoMatch) {
      return `${isoMatch[3].padStart(2, "0")}-${isoMatch[2].padStart(2, "0")}-${isoMatch[1]}`;
    }
    return str;
  };

  // Convert return period (e.g. "092026") to human label ("Sep 2026")
  const formatPeriodLabel = (fp: string | undefined | null): string => {
    if (!fp) return "All Return Periods";
    const s = String(fp).trim();
    if (s.length === 6 && /^\d{6}$/.test(s)) {
      const monthNum = parseInt(s.slice(0, 2), 10);
      const year = s.slice(2);
      const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];
      if (monthNum >= 1 && monthNum <= 12) {
        return `${monthNames[monthNum - 1]} ${year} (${s})`;
      }
    }
    return fp;
  };

  /**
   * Load GSTR-1 Data from MySQL DB
   */
  const loadGstr1Data = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Fetch available periods
      const periods = await fetchGstr1Periods(targetCompanyId);
      const uniquePeriods = Array.from(
        new Set(periods.map((p) => p.return_period).filter(Boolean))
      );
      setAvailablePeriods(uniquePeriods);

      // 2. Fetch latest GSTR-1 metadata & summary
      const latestData = await fetchLatestGstr1FromDatabase(
        targetCompanyId,
        selectedPeriod !== "all" ? selectedPeriod : undefined
      );

      if (latestData) {
        setGstr1Metadata({
          gstin: latestData.metadata?.gstin,
          fp: latestData.metadata?.fp,
          filing_typ: latestData.metadata?.filing_typ,
          fil_dt: latestData.metadata?.fil_dt,
          fileName: latestData.fileName,
        });
        setGstr1B2cSummaries(latestData.b2cSummaries || []);
      }

      // 3. Fetch all GSTR-1 B2B Invoices
      const invoices = await fetchGstr1Invoices(
        targetCompanyId,
        selectedPeriod !== "all" ? selectedPeriod : undefined
      );

      if (invoices.length > 0) {
        setGstr1Invoices(invoices);
      } else if (latestData?.b2bInvoices && latestData.b2bInvoices.length > 0) {
        setGstr1Invoices(latestData.b2bInvoices);
      } else {
        setGstr1Invoices([]);
      }
    } catch (err: any) {
      console.error("Error loading GSTR-1 data:", err);
      setError(err?.message || "Failed to load GSTR-1 return records");
    } finally {
      setIsLoading(false);
    }
  }, [targetCompanyId, selectedPeriod]);

  /**
   * Load GSTR-3B Data from backend API
   */
  const loadGstr3bData = useCallback(async () => {
    try {
      const ownerType = localStorage.getItem("supplier") || "employee";
      const ownerId =
        localStorage.getItem(
          ownerType === "employee" ? "employee_id" : "user_id"
        ) || "1";

      const apiBase = import.meta.env.VITE_API_URL || "";
      const url = `${apiBase}/api/gstr3b?company_id=${targetCompanyId}&owner_type=${ownerType}&owner_id=${ownerId}`;

      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const a = json?.a;
        const b = json?.b;
        const c = json?.c;

        const rows: Gstr3bSummary[] = [];

        if (a && (a.taxable_value || a.integrated_tax || a.central_tax || a.state_tax)) {
          const igst = Number(a.integrated_tax || 0);
          const cgst = Number(a.central_tax || 0);
          const sgst = Number(a.state_tax || 0);
          rows.push({
            section: "3.1(a) Outward Taxable Supplies (other than zero, nil, exempt)",
            taxableValue: Number(a.taxable_value || 0),
            igst,
            cgst,
            sgst,
            totalTax: igst + cgst + sgst,
          });
        }

        if (b && (b.total || (Array.isArray(b.byVoucher) && b.byVoucher.length > 0))) {
          rows.push({
            section: "3.1(b) Outward Supplies (Zero Rated)",
            taxableValue: Number(b.total || 0),
            igst: 0,
            cgst: 0,
            sgst: 0,
            totalTax: 0,
          });
        }

        if (c && c.total) {
          rows.push({
            section: "3.1(c) Other Outward Supplies (Nil Rated, Exempted)",
            taxableValue: Number(c.total || 0),
            igst: 0,
            cgst: 0,
            sgst: 0,
            totalTax: 0,
          });
        }

        setGstr3bRows(rows);
      }
    } catch (err) {
      console.warn("GSTR-3B API fetch failed, checking fallback:", err);
    }
  }, [targetCompanyId]);

  // Initial Load
  useEffect(() => {
    loadGstr1Data();
    loadGstr3bData();
    const fallback = getReportData("gstr1-vs-gstr3b");
    setReportDataFallback(fallback);
  }, [loadGstr1Data, loadGstr3bData]);

  // Reset page when search or period changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedPeriod, activeTab]);

  // Filtered GSTR-1 B2B Invoices
  const filteredB2bInvoices = useMemo(() => {
    if (!searchTerm.trim()) return gstr1Invoices;
    const term = searchTerm.toLowerCase().trim();
    return gstr1Invoices.filter((r) => {
      return (
        r.ctin?.toLowerCase().includes(term) ||
        r.inum?.toLowerCase().includes(term) ||
        r.idt?.toLowerCase().includes(term) ||
        String(r.txval || "").includes(term) ||
        String(r.val || "").includes(term)
      );
    });
  }, [gstr1Invoices, searchTerm]);

  // Filtered GSTR-1 B2C Summaries
  const filteredB2cSummaries = useMemo(() => {
    if (!searchTerm.trim()) return gstr1B2cSummaries;
    const term = searchTerm.toLowerCase().trim();
    return gstr1B2cSummaries.filter((r) => {
      return (
        r.pos?.toLowerCase().includes(term) ||
        r.sply_ty?.toLowerCase().includes(term) ||
        r.typ?.toLowerCase().includes(term) ||
        String(r.txval || "").includes(term)
      );
    });
  }, [gstr1B2cSummaries, searchTerm]);

  // Paginated Invoices
  const paginatedInvoices = useMemo(() => {
    if (pageSize >= 1000) return filteredB2bInvoices;
    const startIndex = (currentPage - 1) * pageSize;
    return filteredB2bInvoices.slice(startIndex, startIndex + pageSize);
  }, [filteredB2bInvoices, currentPage, pageSize]);

  const totalPages = useMemo(() => {
    if (pageSize >= 1000) return 1;
    return Math.max(1, Math.ceil(filteredB2bInvoices.length / pageSize));
  }, [filteredB2bInvoices.length, pageSize]);

  // GSTR-1 Invoices Totals (Calculated from filtered rows)
  const gstr1Totals = useMemo(() => {
    return filteredB2bInvoices.reduce(
      (acc, r) => {
        const txval = Number(r.txval || 0);
        const camt = Number(r.camt || 0);
        const samt = Number(r.samt || 0);
        const iamt = Number(r.iamt || 0);
        const val = r.val !== null && r.val !== undefined ? Number(r.val) : txval + camt + samt + iamt;

        acc.txval += txval;
        acc.camt += camt;
        acc.samt += samt;
        acc.iamt += iamt;
        acc.tax += camt + samt + iamt;
        acc.val += val;
        return acc;
      },
      { txval: 0, camt: 0, samt: 0, iamt: 0, tax: 0, val: 0 }
    );
  }, [filteredB2bInvoices]);

  // GSTR-3B Totals
  const gstr3bTotals = useMemo(() => {
    if (gstr3bRows.length > 0) {
      return gstr3bRows.reduce(
        (acc, r) => {
          acc.txval += r.taxableValue;
          acc.igst += r.igst;
          acc.cgst += r.cgst;
          acc.sgst += r.sgst;
          acc.tax += r.totalTax;
          return acc;
        },
        { txval: 0, igst: 0, cgst: 0, sgst: 0, tax: 0 }
      );
    }
    // Fallback from reportDataFallback
    const fbRows = reportDataFallback?.rows || [];
    return fbRows.reduce(
      (acc, r) => {
        acc.txval += parseFloat(r["GSTR3B Taxable Value"] || r.gstr3bTaxable || 0) || 0;
        acc.igst += parseFloat(r["GSTR3B IGST"] || 0) || 0;
        acc.cgst += parseFloat(r["GSTR3B CGST"] || 0) || 0;
        acc.sgst += parseFloat(r["GSTR3B SGST"] || 0) || 0;
        acc.tax += (parseFloat(r["GSTR3B IGST"] || 0) || 0) + (parseFloat(r["GSTR3B CGST"] || 0) || 0) + (parseFloat(r["GSTR3B SGST"] || 0) || 0);
        return acc;
      },
      { txval: 0, igst: 0, cgst: 0, sgst: 0, tax: 0 }
    );
  }, [gstr3bRows, reportDataFallback]);

  // Variances
  const varianceTaxable = gstr1Totals.txval - gstr3bTotals.txval;
  const varianceTax = gstr1Totals.tax - gstr3bTotals.tax;
  const isVarianceZero = Math.abs(varianceTaxable) < 1 && Math.abs(varianceTax) < 1;

  /**
   * Export GSTR-1 Invoices table to Excel (.xlsx) with exact requested headers
   */
  const exportToExcel = () => {
    if (filteredB2bInvoices.length === 0) {
      alert("No GSTR-1 invoices available to export.");
      return;
    }

    const exportRows = filteredB2bInvoices.map((inv, idx) => ({
      "#": idx + 1,
      "Customer GSTIN (ctin)": inv.ctin || "-",
      "Invoice No (inum)": inv.inum || "-",
      "Date (idt)": formatDate(inv.idt),
      "Taxable Value (txval)": Number(inv.txval || 0),
      "CGST (camt)": Number(inv.camt || 0),
      "SGST (samt)": Number(inv.samt || 0),
      "IGST (iamt)": Number(inv.iamt || 0),
      "Invoice Val (val)":
        inv.val !== null && inv.val !== undefined
          ? Number(inv.val)
          : Number(inv.txval || 0) + Number(inv.camt || 0) + Number(inv.samt || 0) + Number(inv.iamt || 0),
    }));

    // Add totals row
    exportRows.push({
      "#": "" as any,
      "Customer GSTIN (ctin)": "TOTAL" as any,
      "Invoice No (inum)": `${filteredB2bInvoices.length} Invoices` as any,
      "Date (idt)": "" as any,
      "Taxable Value (txval)": gstr1Totals.txval,
      "CGST (camt)": gstr1Totals.camt,
      "SGST (samt)": gstr1Totals.samt,
      "IGST (iamt)": gstr1Totals.iamt,
      "Invoice Val (val)": gstr1Totals.val,
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "GSTR-1 Invoices");

    const fileName = `GSTR1_Invoices_${gstr1Metadata?.fp || "all"}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  /**
   * Quick JSON Return File Upload Handler
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const parsedInvoices: GstB2bInvoiceRow[] = [];
      const parsedB2c: GstB2cSummaryRow[] = [];

      // Extract B2B
      const b2bList = Array.isArray(json?.b2b) ? json.b2b : Array.isArray(json?.data?.b2b) ? json.data.b2b : [];
      let snoCounter = 1;
      for (const group of b2bList) {
        const ctin = String(group.ctin || "").trim();
        const invList = Array.isArray(group.inv) ? group.inv : [];
        for (const inv of invList) {
          const inum = String(inv.inum || "").trim();
          const idt = String(inv.idt || "").trim();
          const inv_typ = String(inv.inv_typ || "R").trim();
          const pos = String(inv.pos || "").trim();
          const val = inv.val !== undefined && inv.val !== null ? Number(inv.val) : null;

          let txvalSum = 0;
          let camtSum = 0;
          let samtSum = 0;
          let iamtSum = 0;
          let csamtSum = 0;
          let rtVal = "";

          const itms = Array.isArray(inv.itms) ? inv.itms : [];
          for (const itm of itms) {
            const idet = itm.itm_det || itm;
            txvalSum += Number(idet.txval || 0);
            camtSum += Number(idet.camt || 0);
            samtSum += Number(idet.samt || 0);
            iamtSum += Number(idet.iamt || 0);
            csamtSum += Number(idet.csamt || 0);
            if (!rtVal && idet.rt !== undefined) {
              rtVal = `${idet.rt}%`;
            }
          }

          parsedInvoices.push({
            sno: snoCounter++,
            ctin,
            inum,
            idt,
            inv_typ,
            pos,
            rt: rtVal || "-",
            txval: txvalSum,
            camt: camtSum,
            samt: samtSum,
            iamt: iamtSum,
            csamt: csamtSum,
            val,
          });
        }
      }

      // Extract B2C summaries
      const b2csList = Array.isArray(json?.b2cs) ? json.b2cs : Array.isArray(json?.data?.b2cs) ? json.data.b2cs : [];
      let b2cSno = 1;
      for (const item of b2csList) {
        parsedB2c.push({
          sno: b2cSno++,
          pos: String(item.pos || "-"),
          sply_ty: String(item.sply_ty || "-"),
          typ: String(item.typ || "-"),
          rt: item.rt !== undefined ? `${item.rt}%` : "-",
          txval: Number(item.txval || 0),
          camt: Number(item.camt || 0),
          samt: Number(item.samt || 0),
          iamt: Number(item.iamt || 0),
          csamt: Number(item.csamt || 0),
          flag: String(item.flag || "-"),
        });
      }

      const totalB2bTaxable = parsedInvoices.reduce((acc, r) => acc + r.txval, 0);
      const totalB2bTax = parsedInvoices.reduce((acc, r) => acc + r.camt + r.samt + r.iamt, 0);
      const totalB2bVal = parsedInvoices.reduce(
        (acc, r) => acc + (r.val !== null ? r.val : r.txval + r.camt + r.samt + r.iamt),
        0
      );

      const parsedPayload: ParsedGstr1Data = {
        metadata: {
          gstin: json.gstin || json?.data?.gstin || "",
          fp: json.fp || json?.data?.fp || "",
          filing_typ: json.filing_typ || "",
          fil_dt: json.fil_dt || "",
          gt: Number(json.gt || 0),
          cur_gt: Number(json.cur_gt || 0),
          version: json.version || "",
          hash: json.hash || "",
        },
        b2bInvoices: parsedInvoices,
        b2cSummaries: parsedB2c,
        totalB2bTaxable,
        totalB2bTax,
        totalB2bVal,
        totalB2cTaxable: parsedB2c.reduce((acc, r) => acc + r.txval, 0),
        totalB2cTax: parsedB2c.reduce((acc, r) => acc + r.camt + r.samt + r.iamt, 0),
        fileName: file.name,
        fileSizeBytes: file.size,
        scannedAt: new Date().toLocaleTimeString(),
      };

      // Save to database
      await saveGstr1ToDatabase(parsedPayload, targetCompanyId);

      setIsUploadModalOpen(false);
      await loadGstr1Data();
    } catch (err: any) {
      console.error("Failed to parse/upload GSTR-1 file:", err);
      setUploadError(err?.message || "Invalid GSTR-1 JSON file structure");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className={`pt-[56px] px-4 min-h-[calc(100vh-64px)] pb-12 ${
        theme === "dark" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-800"
      }`}
    >
      {/* Header */}
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
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="text-red-600 dark:text-red-400" size={28} />
              GSTR1 vs GSTR3B Report
            </h1>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              <span>GSTR-1 Outward Supply Invoices vs GSTR-3B Summary Comparison</span>
              {gstr1Metadata?.gstin && (
                <span className="font-mono bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold">
                  GSTIN: {gstr1Metadata.gstin}
                </span>
              )}
              {gstr1Metadata?.fp && (
                <span className="bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded font-bold">
                  Period: {formatPeriodLabel(gstr1Metadata.fp)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={loadGstr1Data}
            title="Refresh GSTR-1 Invoices"
            className={`p-2 rounded-lg border text-sm font-medium transition-colors ${
              theme === "dark"
                ? "bg-gray-800 hover:bg-gray-750 border-gray-700 text-gray-300"
                : "bg-white hover:bg-gray-100 border-gray-300 text-gray-700 shadow-xs"
            }`}
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          </button>

          <button
            onClick={exportToExcel}
            title="Export GSTR-1 Invoices to Excel"
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Download size={15} />
            Export Excel
          </button>

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Upload size={15} />
            Quick Upload JSON
          </button>

          <button
            onClick={() => navigate("/app/vouchers/import?type=gstr1-vs-gstr3b")}
            className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Upload size={15} />
            Import Center
          </button>
        </div>
      </div>

      {/* Top 3 Summary Cards: GSTR-1 | GSTR-3B | Variance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Card 1: GSTR-1 Summary */}
        <div
          className={`p-5 rounded-xl border relative overflow-hidden transition-all ${
            theme === "dark"
              ? "bg-gradient-to-r from-blue-950/40 to-gray-800 border-blue-900/60"
              : "bg-gradient-to-r from-blue-50 to-white border-blue-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950">
              GSTR-1 Outward Return
            </span>
            <span className="text-xs font-semibold text-gray-500">
              {filteredB2bInvoices.length} Invoices
            </span>
          </div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Taxable Value (txval)
          </h3>
          <div className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">
            {formatCurrency(gstr1Totals.txval)}
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500 mt-3 pt-2.5 border-t border-gray-200 dark:border-gray-700">
            <span>
              Total Tax: <b className="text-gray-800 dark:text-gray-200">{formatCurrency(gstr1Totals.tax)}</b>
            </span>
            <span>
              Invoice Val: <b className="text-blue-700 dark:text-blue-300">{formatCurrency(gstr1Totals.val)}</b>
            </span>
          </div>
        </div>

        {/* Card 2: GSTR-3B Summary */}
        <div
          className={`p-5 rounded-xl border relative overflow-hidden transition-all ${
            theme === "dark"
              ? "bg-gradient-to-r from-indigo-950/40 to-gray-800 border-indigo-900/60"
              : "bg-gradient-to-r from-indigo-50 to-white border-indigo-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950">
              GSTR-3B Summary Return
            </span>
            <span className="text-xs font-semibold text-gray-500">Sec 3.1 Supplies</span>
          </div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Taxable Value
          </h3>
          <div className="text-2xl sm:text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
            {formatCurrency(gstr3bTotals.txval)}
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500 mt-3 pt-2.5 border-t border-gray-200 dark:border-gray-700">
            <span>
              Total Tax: <b className="text-gray-800 dark:text-gray-200">{formatCurrency(gstr3bTotals.tax)}</b>
            </span>
            <span>
              CGST: <b>{formatCurrency(gstr3bTotals.cgst)}</b> | SGST: <b>{formatCurrency(gstr3bTotals.sgst)}</b>
            </span>
          </div>
        </div>

        {/* Card 3: Reconciliation Variance */}
        <div
          className={`p-5 rounded-xl border relative overflow-hidden transition-all ${
            theme === "dark"
              ? isVarianceZero
                ? "bg-gradient-to-r from-green-950/40 to-gray-800 border-green-900/60"
                : "bg-gradient-to-r from-amber-950/40 to-gray-800 border-amber-900/60"
              : isVarianceZero
              ? "bg-gradient-to-r from-green-50 to-white border-green-200 shadow-sm"
              : "bg-gradient-to-r from-amber-50 to-white border-amber-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                isVarianceZero
                  ? "text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-950"
                  : "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950"
              }`}
            >
              Net Variance (GSTR1 - 3B)
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isVarianceZero
                  ? "bg-green-200 dark:bg-green-800 text-green-900 dark:text-green-100"
                  : "bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100"
              }`}
            >
              {isVarianceZero ? "Matched" : "Variance Detected"}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Taxable Difference
          </h3>
          <div
            className={`text-2xl sm:text-3xl font-extrabold mt-1 ${
              isVarianceZero
                ? "text-green-600 dark:text-green-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {formatCurrency(varianceTaxable)}
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500 mt-3 pt-2.5 border-t border-gray-200 dark:border-gray-700">
            <span>
              Tax Difference:{" "}
              <b className={isVarianceZero ? "text-green-600" : "text-amber-600"}>
                {formatCurrency(varianceTax)}
              </b>
            </span>
            <span>
              {filteredB2bInvoices.length > 0 ? "Data Loaded" : "No Records"}
            </span>
          </div>
        </div>
      </div>

      {/* Control & Filter Toolbar */}
      <div
        className={`p-3.5 rounded-xl border mb-6 flex flex-wrap items-center justify-between gap-3 ${
          theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
        }`}
      >
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 max-w-sm">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search Customer GSTIN, Invoice No, Date..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors ${
                theme === "dark"
                  ? "bg-gray-900 border-gray-700 text-white placeholder-gray-500"
                  : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400"
              }`}
            />
          </div>

          {/* Period Selector */}
          {availablePeriods.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-500">Period:</span>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  theme === "dark"
                    ? "bg-gray-900 border-gray-700 text-white"
                    : "bg-gray-50 border-gray-300 text-gray-800"
                }`}
              >
                <option value="all">All Available Periods</option>
                {availablePeriods.map((p) => (
                  <option key={p} value={p}>
                    {formatPeriodLabel(p)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Active Tab Toggle: B2B Invoices vs B2C */}
          <div className="flex items-center border rounded-lg p-0.5 text-xs bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700">
            <button
              onClick={() => setActiveTab("b2b")}
              className={`px-3 py-1 rounded-md font-semibold transition-all ${
                activeTab === "b2b"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
              }`}
            >
              B2B Invoices ({filteredB2bInvoices.length})
            </button>
            {gstr1B2cSummaries.length > 0 && (
              <button
                onClick={() => setActiveTab("b2c")}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  activeTab === "b2c"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
                }`}
              >
                B2C Summaries ({filteredB2cSummaries.length})
              </button>
            )}
          </div>
        </div>

        {/* View Mode Switcher (Split 50% vs GSTR-1 Full Table) */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 hidden sm:inline">View Mode:</span>
          <div className="flex items-center border rounded-lg p-0.5 text-xs bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700">
            <button
              onClick={() => setViewMode("split")}
              title="50% - 50% Side-by-Side Comparison Partition"
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                viewMode === "split"
                  ? "bg-red-600 text-white shadow-xs font-semibold"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
              }`}
            >
              50% - 50% Split
            </button>
            <button
              onClick={() => setViewMode("gstr1-full")}
              title="Maximize GSTR-1 Invoices Table to Full Width"
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                viewMode === "gstr1-full"
                  ? "bg-red-600 text-white shadow-xs font-semibold"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
              }`}
            >
              GSTR-1 Full Table
            </button>
            <button
              onClick={() => setViewMode("gstr3b-full")}
              title="View GSTR-3B Summary Only"
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                viewMode === "gstr3b-full"
                  ? "bg-red-600 text-white shadow-xs font-semibold"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
              }`}
            >
              GSTR-3B Only
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Layout based on viewMode */}
      <div
        className={`grid gap-6 ${
          viewMode === "split"
            ? "grid-cols-1 lg:grid-cols-2"
            : "grid-cols-1"
        }`}
      >
        {/* ========================================================
            PARTITION 1: GSTR-1 DATA TABLE
            ======================================================== */}
        {viewMode !== "gstr3b-full" && (
          <div
            className={`border rounded-xl overflow-hidden flex flex-col ${
              theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            {/* Partition Header */}
            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/50 border-b border-blue-200 dark:border-blue-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-blue-900 dark:text-blue-200 flex items-center gap-2">
                  📊 GSTR-1 Return Data
                </span>
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-2 py-0.5 rounded">
                  {activeTab === "b2b" ? "B2B Invoices" : "B2C Summaries"}
                </span>
              </div>
              <span className="text-xs font-medium text-gray-500">
                Total: {activeTab === "b2b" ? filteredB2bInvoices.length : filteredB2cSummaries.length} Records
              </span>
            </div>

            {/* B2B INVOICES TABLE (EXACT REQUESTED COLUMNS) */}
            {activeTab === "b2b" ? (
              <div className="overflow-x-auto flex-1 min-h-[360px]">
                {filteredB2bInvoices.length === 0 ? (
                  <div className="py-16 text-center text-gray-500 dark:text-gray-400">
                    <FileText className="mx-auto mb-2 text-gray-400" size={36} />
                    <p className="font-semibold text-sm">No GSTR-1 B2B Invoices Found</p>
                    <p className="text-xs mt-1 max-w-sm mx-auto">
                      {searchTerm
                        ? `No invoices match "${searchTerm}". Clear search to view all.`
                        : "No GSTR-1 return data found for this company in the database. Use 'Quick Upload JSON' or 'Import Center' to import your return."}
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-xs text-left whitespace-nowrap">
                    <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-2.5 py-2.5 font-semibold text-center w-10">#</th>
                        <th className="px-3 py-2.5 font-semibold">Customer GSTIN (ctin)</th>
                        <th className="px-3 py-2.5 font-semibold">Invoice No (inum)</th>
                        <th className="px-3 py-2.5 font-semibold">Date (idt)</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Taxable Value (txval)</th>
                        <th className="px-3 py-2.5 font-semibold text-right">CGST (camt)</th>
                        <th className="px-3 py-2.5 font-semibold text-right">SGST (samt)</th>
                        <th className="px-3 py-2.5 font-semibold text-right">IGST (iamt)</th>
                        <th className="px-3 py-2.5 font-semibold text-right bg-blue-50/60 dark:bg-blue-950/40">
                          Invoice Val (val)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {paginatedInvoices.map((inv, idx) => {
                        const globalIndex = (currentPage - 1) * pageSize + idx + 1;
                        const invVal =
                          inv.val !== null && inv.val !== undefined
                            ? Number(inv.val)
                            : Number(inv.txval || 0) + Number(inv.camt || 0) + Number(inv.samt || 0) + Number(inv.iamt || 0);

                        return (
                          <tr
                            key={`${inv.ctin}-${inv.inum}-${idx}`}
                            className="hover:bg-blue-50/40 dark:hover:bg-gray-750 transition-colors"
                          >
                            <td className="px-2.5 py-2 text-center text-gray-500 font-mono">
                              {inv.sno || globalIndex}
                            </td>
                            <td className="px-3 py-2 font-mono font-semibold text-gray-900 dark:text-gray-100">
                              {inv.ctin || "-"}
                            </td>
                            <td className="px-3 py-2 font-mono font-medium text-blue-600 dark:text-blue-400">
                              {inv.inum || "-"}
                            </td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                              {formatDate(inv.idt)}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                              {formatCurrency(inv.txval)}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                              {formatCurrency(inv.camt)}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                              {formatCurrency(inv.samt)}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                              {formatCurrency(inv.iamt)}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-blue-700 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-950/20">
                              {formatCurrency(invVal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* Sticky Table Footer with Column Totals */}
                    <tfoot className="bg-gray-100 dark:bg-gray-900 font-bold border-t-2 border-gray-300 dark:border-gray-700 sticky bottom-0 z-10">
                      <tr>
                        <td colSpan={4} className="px-3 py-2.5 text-gray-800 dark:text-gray-200">
                          Total ({filteredB2bInvoices.length} invoices)
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-900 dark:text-gray-100">
                          {formatCurrency(gstr1Totals.txval)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">
                          {formatCurrency(gstr1Totals.camt)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">
                          {formatCurrency(gstr1Totals.samt)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">
                          {formatCurrency(gstr1Totals.iamt)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-extrabold text-blue-700 dark:text-blue-400 bg-blue-100/60 dark:bg-blue-950/60">
                          {formatCurrency(gstr1Totals.val)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            ) : (
              /* B2C SUMMARIES TABLE */
              <div className="overflow-x-auto flex-1 min-h-[360px]">
                <table className="w-full text-xs text-left whitespace-nowrap">
                  <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">#</th>
                      <th className="px-3 py-2.5 font-semibold">Place of Supply (pos)</th>
                      <th className="px-3 py-2.5 font-semibold">Supply Type (sply_ty)</th>
                      <th className="px-3 py-2.5 font-semibold">Type (typ)</th>
                      <th className="px-3 py-2.5 font-semibold">Rate (rt)</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Taxable Value (txval)</th>
                      <th className="px-3 py-2.5 font-semibold text-right">CGST (camt)</th>
                      <th className="px-3 py-2.5 font-semibold text-right">SGST (samt)</th>
                      <th className="px-3 py-2.5 font-semibold text-right">IGST (iamt)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredB2cSummaries.map((b2c, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/40 dark:hover:bg-gray-750">
                        <td className="px-3 py-2 text-gray-500 font-mono">{idx + 1}</td>
                        <td className="px-3 py-2 font-mono font-medium">{b2c.pos}</td>
                        <td className="px-3 py-2">{b2c.sply_ty}</td>
                        <td className="px-3 py-2">{b2c.typ}</td>
                        <td className="px-3 py-2">{b2c.rt}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(b2c.txval)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(b2c.camt)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(b2c.samt)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(b2c.iamt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {activeTab === "b2b" && filteredB2bInvoices.length > pageSize && (
              <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-gray-500">
                  <span>Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className={`px-2 py-1 rounded border text-xs ${
                      theme === "dark"
                        ? "bg-gray-900 border-gray-700 text-white"
                        : "bg-white border-gray-300 text-gray-800"
                    }`}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={10000}>All ({filteredB2bInvoices.length})</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-gray-500">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded border disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded border disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================
            PARTITION 2: GSTR-3B SUMMARY DATA
            ======================================================== */}
        {viewMode !== "gstr1-full" && (
          <div
            className={`border rounded-xl overflow-hidden flex flex-col ${
              theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            {/* Partition Header */}
            <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/50 border-b border-indigo-200 dark:border-indigo-900 flex items-center justify-between">
              <span className="font-bold text-sm text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                📑 GSTR-3B Summary Data
              </span>
              <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded">
                Section 3.1 Supplies
              </span>
            </div>

            <div className="overflow-x-auto flex-1 min-h-[360px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Return Section / Supply Nature</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Taxable Value</th>
                    <th className="px-3 py-2.5 font-semibold text-right">IGST</th>
                    <th className="px-3 py-2.5 font-semibold text-right">CGST</th>
                    <th className="px-3 py-2.5 font-semibold text-right">SGST</th>
                    <th className="px-3 py-2.5 font-semibold text-right bg-indigo-50/60 dark:bg-indigo-950/40">Total Tax</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {gstr3bRows.length === 0 ? (
                    reportDataFallback?.rows && reportDataFallback.rows.length > 0 ? (
                      reportDataFallback.rows.map((r, i) => (
                        <tr key={i} className="hover:bg-indigo-50/40 dark:hover:bg-gray-750">
                          <td className="px-3 py-2.5 font-medium">{r["Return Period"] || r.returnPeriod || "3.1(a) Outward Taxable"}</td>
                          <td className="px-3 py-2.5 text-right font-medium text-indigo-600 dark:text-indigo-400">
                            {formatCurrency(r["GSTR3B Taxable Value"] || r.gstr3bTaxable)}
                          </td>
                          <td className="px-3 py-2.5 text-right">{formatCurrency(r["GSTR3B IGST"])}</td>
                          <td className="px-3 py-2.5 text-right">{formatCurrency(r["GSTR3B CGST"])}</td>
                          <td className="px-3 py-2.5 text-right">{formatCurrency(r["GSTR3B SGST"])}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20">
                            {formatCurrency(
                              (parseFloat(r["GSTR3B IGST"] || 0) || 0) +
                                (parseFloat(r["GSTR3B CGST"] || 0) || 0) +
                                (parseFloat(r["GSTR3B SGST"] || 0) || 0)
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-16 text-center text-gray-500">
                          <Layers className="mx-auto mb-2 text-gray-400" size={32} />
                          No filed GSTR-3B records found in system.
                        </td>
                      </tr>
                    )
                  ) : (
                    gstr3bRows.map((r, i) => (
                      <tr key={i} className="hover:bg-indigo-50/40 dark:hover:bg-gray-750">
                        <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-gray-100">
                          {r.section}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-indigo-600 dark:text-indigo-400">
                          {formatCurrency(r.taxableValue)}
                        </td>
                        <td className="px-3 py-2.5 text-right">{formatCurrency(r.igst)}</td>
                        <td className="px-3 py-2.5 text-right">{formatCurrency(r.cgst)}</td>
                        <td className="px-3 py-2.5 text-right">{formatCurrency(r.sgst)}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20">
                          {formatCurrency(r.totalTax)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {/* GSTR-3B Footer */}
                <tfoot className="bg-gray-100 dark:bg-gray-900 font-bold border-t-2 border-gray-300 dark:border-gray-700 sticky bottom-0 z-10">
                  <tr>
                    <td className="px-3 py-2.5 text-gray-800 dark:text-gray-200">
                      Total GSTR-3B Outward
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-900 dark:text-gray-100">
                      {formatCurrency(gstr3bTotals.txval)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">
                      {formatCurrency(gstr3bTotals.igst)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">
                      {formatCurrency(gstr3bTotals.cgst)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">
                      {formatCurrency(gstr3bTotals.sgst)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-extrabold text-indigo-700 dark:text-indigo-400 bg-indigo-100/60 dark:bg-indigo-950/60">
                      {formatCurrency(gstr3bTotals.tax)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Reconciliation Variance Summary Box */}
            <div className="p-4 bg-gray-50 dark:bg-gray-850 border-t border-gray-200 dark:border-gray-700 text-xs">
              <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-1.5">
                <Columns size={15} />
                Variance Comparison Analysis:
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 text-[11px]">Taxable Value Difference:</span>
                  <div
                    className={`font-bold text-sm ${
                      isVarianceZero
                        ? "text-green-600 dark:text-green-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {formatCurrency(varianceTaxable)}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 text-[11px]">Total Tax Difference:</span>
                  <div
                    className={`font-bold text-sm ${
                      isVarianceZero
                        ? "text-green-600 dark:text-green-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {formatCurrency(varianceTax)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* QUICK JSON UPLOAD MODAL */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div
            className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl relative ${
              theme === "dark" ? "bg-gray-850 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-900"
            }`}
          >
            <button
              onClick={() => setIsUploadModalOpen(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-blue-100 dark:bg-blue-900/50 rounded-xl text-blue-600 dark:text-blue-400">
                <Upload size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold">Upload GSTR-1 Return JSON</h3>
                <p className="text-xs text-gray-500">
                  Import official GST Portal offline JSON return for active company
                </p>
              </div>
            </div>

            {uploadError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>{uploadError}</span>
              </div>
            )}

            <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center hover:border-blue-500 transition-colors">
              <FileSpreadsheet className="mx-auto mb-3 text-blue-500" size={44} />
              <p className="font-semibold text-sm mb-1">Select GSTR-1 JSON Return File</p>
              <p className="text-xs text-gray-500 mb-4">
                Accepts returns_*.json downloaded from the GST portal
              </p>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer shadow-xs transition-colors">
                <Upload size={14} />
                Browse File
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
              {isUploading && (
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-blue-600 font-semibold">
                  <RefreshCw size={14} className="animate-spin" />
                  Parsing and persisting invoices to database...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Gstr1VsGstr3bReport;
