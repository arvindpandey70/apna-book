import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  Upload,
  FileJson,
  X,
  AlertCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Calendar,
  Layers,
  FileText,
  BadgeAlert,
} from "lucide-react";
import { useAppContext } from "../../../../context/AppContext";
import type {
  Gstr2bReturnMetadata,
  Gstr2bB2bInvoiceRow,
  Gstr2bCdnrNoteRow,
  ParsedGstr2bData,
} from "../../../../services/gstr2bImportService";

export interface Gstr2bJsonScannerProps {
  onDataLoaded?: (data: ParsedGstr2bData | null, rawJsonText?: string) => void;
  fromDate?: string;
  toDate?: string;
  searchTerm?: string;
  initialData?: ParsedGstr2bData | null;
  isLoadingInitial?: boolean;
  onClearFile?: () => void;
  isSavedInDb?: boolean;
}

// Helpers
export const normalizeToIsoDate = (dateStr: string | null | undefined): string | null => {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s || s === "-") return null;

  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  try {
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 10);
    }
  } catch {
    // ignore
  }
  return null;
};

export const isDateInRange = (
  dateStr: string | null | undefined,
  fromDate?: string | null,
  toDate?: string | null
): boolean => {
  if (!fromDate && !toDate) return true;
  const target = normalizeToIsoDate(dateStr);
  if (!target) return false;

  const from = normalizeToIsoDate(fromDate);
  const to = normalizeToIsoDate(toDate);

  if (from && target < from) return false;
  if (to && target > to) return false;
  return true;
};

export const formatIndianCurrency = (val: number | string | null | undefined): string => {
  if (val === null || val === undefined || val === "") return "-";
  const num = typeof val === "number" ? val : parseFloat(String(val));
  if (isNaN(num)) return "-";
  return `₹${num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const formatDisplayDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "-";
  const clean = String(dateStr).trim();
  const ddmmyyyyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyyMatch) {
    const [, d, m, y] = ddmmyyyyMatch;
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
  }
  const iso = normalizeToIsoDate(clean);
  if (iso) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  return clean;
};

export const formatPeriod = (rtnprd: string | null | undefined): string => {
  if (!rtnprd) return "-";
  const str = String(rtnprd).trim();
  if (str.length === 6 && /^\d{6}$/.test(str)) {
    const monthNum = parseInt(str.slice(0, 2), 10);
    const year = str.slice(2);
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
    const monthName = monthNames[monthNum - 1] || str.slice(0, 2);
    return `${monthName} ${year} (${str.slice(0, 2)}/${year})`;
  }
  return str;
};

export const parseGstr2bJson = (jsonText: string): ParsedGstr2bData => {
  let root: any;
  try {
    root = JSON.parse(jsonText);
  } catch (err: any) {
    throw new Error(`Invalid JSON syntax: ${err?.message || "Malformed file"}`);
  }

  if (!root || typeof root !== "object") {
    throw new Error("Invalid GSTR-2B JSON: Root element is not an object.");
  }

  const data = root.data && typeof root.data === "object" ? root.data : root;

  const metadata: Gstr2bReturnMetadata = {
    gstin: String(data.gstin || root.gstin || "").trim(),
    rtnprd: String(data.rtnprd || data.fp || root.rtnprd || "").trim(),
    gendt: String(data.gendt || data.gen_dt || root.gendt || "").trim(),
    version: String(data.version || root.version || "1.0").trim(),
    chksum: String(root.chksum || data.chksum || "").trim(),
    itcsumm: data.itcsumm || root.itcsumm || null,
    cpsumm: data.cpsumm || root.cpsumm || null,
  };

  const docdata = data.docdata || root.docdata || data;
  const b2bRaw = Array.isArray(docdata.b2b) ? docdata.b2b : [];
  const cdnrRaw = Array.isArray(docdata.cdnr) ? docdata.cdnr : [];

  let warning: string | undefined;
  if (!metadata.gstin && b2bRaw.length === 0 && cdnrRaw.length === 0) {
    warning = "No standard GSTR-2B sections (docdata.b2b or docdata.cdnr) were found in this JSON file.";
  }

  // 1. Flatten B2B Invoices
  const b2bInvoices: Gstr2bB2bInvoiceRow[] = [];
  let b2bSno = 1;

  for (const supplier of b2bRaw) {
    if (!supplier || typeof supplier !== "object") continue;
    const ctin = String(supplier.ctin || "").trim();
    const trdnm = String(supplier.trdnm || "").trim();
    const supprd = String(supplier.supprd || "").trim();
    const supfildt = String(supplier.supfildt || "").trim();
    const invList = Array.isArray(supplier.inv) ? supplier.inv : [];

    for (const inv of invList) {
      if (!inv || typeof inv !== "object") continue;
      b2bInvoices.push({
        sno: b2bSno++,
        ctin,
        trdnm,
        inum: String(inv.inum || "").trim(),
        idt: String(inv.dt || inv.idt || "").trim(),
        inv_typ: String(inv.typ || inv.inv_typ || "R").trim(),
        pos: String(inv.pos || "-").trim(),
        rev: String(inv.rev || "N").trim(),
        itcavl: String(inv.itcavl || "Y").trim(),
        rsn: String(inv.rsn || "").trim(),
        ims_status: String(inv.imsStatus || inv.ims_status || "N").trim(),
        txval: Number(inv.txval || 0),
        camt: Number(inv.cgst || inv.camt || 0),
        samt: Number(inv.sgst || inv.samt || 0),
        iamt: Number(inv.igst || inv.iamt || 0),
        csamt: Number(inv.cess || inv.csamt || 0),
        val: inv.val !== undefined && inv.val !== null ? Number(inv.val) : null,
        supprd,
        supfildt,
      });
    }
  }

  // 2. Flatten CDNR Notes
  const cdnrNotes: Gstr2bCdnrNoteRow[] = [];
  let cdnrSno = 1;

  for (const supplier of cdnrRaw) {
    if (!supplier || typeof supplier !== "object") continue;
    const ctin = String(supplier.ctin || "").trim();
    const trdnm = String(supplier.trdnm || "").trim();
    const supprd = String(supplier.supprd || "").trim();
    const supfildt = String(supplier.supfildt || "").trim();
    const ntList = Array.isArray(supplier.nt) ? supplier.nt : [];

    for (const nt of ntList) {
      if (!nt || typeof nt !== "object") continue;
      cdnrNotes.push({
        sno: cdnrSno++,
        ctin,
        trdnm,
        ntnum: String(nt.ntnum || "").trim(),
        dt: String(nt.dt || "").trim(),
        typ: String(nt.typ || "C").trim(),
        suptyp: String(nt.suptyp || "R").trim(),
        pos: String(nt.pos || "-").trim(),
        rev: String(nt.rev || "N").trim(),
        itcavl: String(nt.itcavl || "Y").trim(),
        rsn: String(nt.rsn || "").trim(),
        ims_status: String(nt.imsStatus || nt.ims_status || "N").trim(),
        txval: Number(nt.txval || 0),
        camt: Number(nt.cgst || nt.camt || 0),
        samt: Number(nt.sgst || nt.samt || 0),
        iamt: Number(nt.igst || nt.iamt || 0),
        csamt: Number(nt.cess || nt.csamt || 0),
        val: nt.val !== undefined && nt.val !== null ? Number(nt.val) : null,
        supprd,
        supfildt,
      });
    }
  }

  // Aggregate totals
  const totalB2bTaxable = b2bInvoices.reduce((a, b) => a + b.txval, 0);
  const totalB2bTax = b2bInvoices.reduce((a, b) => a + b.camt + b.samt + b.iamt + b.csamt, 0);
  const totalB2bVal = b2bInvoices.reduce((a, b) => a + (b.val !== null ? b.val : b.txval), 0);

  const totalCdnrTaxable = cdnrNotes.reduce((a, b) => a + b.txval, 0);
  const totalCdnrTax = cdnrNotes.reduce((a, b) => a + b.camt + b.samt + b.iamt + b.csamt, 0);
  const totalCdnrVal = cdnrNotes.reduce((a, b) => a + (b.val !== null ? b.val : b.txval), 0);

  let itcAvailableTax = 0;
  if (data.itcsumm && data.itcsumm.itcavl) {
    const nonrev = data.itcsumm.itcavl.nonrevsup || {};
    const other = data.itcsumm.itcavl.othersup || {};
    itcAvailableTax =
      Number(nonrev.cgst || 0) +
      Number(nonrev.sgst || 0) +
      Number(nonrev.igst || 0) +
      Number(other.cgst || 0) +
      Number(other.sgst || 0) +
      Number(other.igst || 0);
  } else {
    itcAvailableTax = totalB2bTax;
  }

  return {
    metadata,
    b2bInvoices,
    cdnrNotes,
    totalB2bTaxable,
    totalB2bTax,
    totalB2bVal,
    totalCdnrTaxable,
    totalCdnrTax,
    totalCdnrVal,
    itcAvailableTax,
    fileName: "",
    fileSizeBytes: 0,
    scannedAt: new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    warning,
  };
};

export const Gstr2bJsonScanner: React.FC<Gstr2bJsonScannerProps> = ({
  onDataLoaded,
  fromDate,
  toDate,
  searchTerm: parentSearchTerm,
  initialData,
  isLoadingInitial = false,
  onClearFile,
  isSavedInDb = false,
}) => {
  const { theme } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parsed State
  const [parsedData, setParsedData] = useState<ParsedGstr2bData | null>(initialData || null);

  useEffect(() => {
    if (initialData !== undefined) {
      setParsedData(initialData);
      if (initialData) {
        if (initialData.b2bInvoices.length === 0 && initialData.cdnrNotes.length > 0) {
          setActiveTab("cdnr");
        } else {
          setActiveTab("b2b");
        }
        if (onDataLoaded) {
          onDataLoaded(initialData);
        }
      }
    }
  }, [initialData]);

  // File & Scanning States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<"b2b" | "cdnr">("b2b");
  const [tableSearchTerm, setTableSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, toDate, parentSearchTerm, tableSearchTerm]);

  // Process & scan file
  const processAndScanFile = (file: File) => {
    setIsScanning(true);
    setScanError(null);

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text || !text.trim()) {
          throw new Error("The file content is empty.");
        }

        const result = parseGstr2bJson(text);
        result.fileName = file.name;
        result.fileSizeBytes = file.size;

        setParsedData(result);
        setCurrentPage(1);
        if (result.b2bInvoices.length === 0 && result.cdnrNotes.length > 0) {
          setActiveTab("cdnr");
        } else {
          setActiveTab("b2b");
        }

        if (onDataLoaded) {
          onDataLoaded(result, text);
        }
      } catch (err: any) {
        setScanError(err?.message || "Failed to parse GSTR-2B JSON. Please check file structure.");
        setParsedData(null);
        if (onDataLoaded) onDataLoaded(null);
      } finally {
        setIsScanning(false);
      }
    };

    reader.onerror = () => {
      setIsScanning(false);
      setScanError("Failed to read the file. Please try again.");
      if (onDataLoaded) onDataLoaded(null);
    };

    reader.readAsText(file);
  };

  const handleFileChange = (file: File | null) => {
    setScanError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!file.name.toLowerCase().endsWith(".json")) {
      setScanError("Please select a valid GST Return JSON file (.json)");
      setSelectedFile(null);
      return;
    }

    if (file.size === 0) {
      setScanError("The selected file is empty (0 Bytes). Please select a valid file.");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    processAndScanFile(file);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setScanError(null);
    setParsedData(null);
    setTableSearchTerm("");
    setCurrentPage(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (onDataLoaded) onDataLoaded(null);
    if (onClearFile) onClearFile();
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Filter B2B invoices
  const filteredB2bInvoices = useMemo(() => {
    if (!parsedData) return [];
    let list = parsedData.b2bInvoices;

    if (fromDate || toDate) {
      list = list.filter((r) => isDateInRange(r.idt, fromDate, toDate));
    }

    const effectiveSearch = (tableSearchTerm || parentSearchTerm || "").toLowerCase().trim();
    if (effectiveSearch) {
      list = list.filter(
        (r) =>
          r.ctin.toLowerCase().includes(effectiveSearch) ||
          r.trdnm.toLowerCase().includes(effectiveSearch) ||
          r.inum.toLowerCase().includes(effectiveSearch) ||
          r.txval.toString().includes(effectiveSearch)
      );
    }

    return list;
  }, [parsedData, fromDate, toDate, tableSearchTerm, parentSearchTerm]);

  // Filter CDNR notes
  const filteredCdnrNotes = useMemo(() => {
    if (!parsedData) return [];
    let list = parsedData.cdnrNotes;

    if (fromDate || toDate) {
      list = list.filter((r) => isDateInRange(r.dt, fromDate, toDate));
    }

    const effectiveSearch = (tableSearchTerm || parentSearchTerm || "").toLowerCase().trim();
    if (effectiveSearch) {
      list = list.filter(
        (r) =>
          r.ctin.toLowerCase().includes(effectiveSearch) ||
          r.trdnm.toLowerCase().includes(effectiveSearch) ||
          r.ntnum.toLowerCase().includes(effectiveSearch) ||
          r.txval.toString().includes(effectiveSearch)
      );
    }

    return list;
  }, [parsedData, fromDate, toDate, tableSearchTerm, parentSearchTerm]);

  // Paginated data
  const paginatedB2b = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredB2bInvoices.slice(start, start + pageSize);
  }, [filteredB2bInvoices, currentPage, pageSize]);

  const paginatedCdnr = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCdnrNotes.slice(start, start + pageSize);
  }, [filteredCdnrNotes, currentPage, pageSize]);

  const activeTotalRecords =
    activeTab === "b2b" ? filteredB2bInvoices.length : filteredCdnrNotes.length;
  const totalPages = Math.max(1, Math.ceil(activeTotalRecords / pageSize));

  // Footer totals
  const b2bTotals = useMemo(() => {
    return filteredB2bInvoices.reduce(
      (acc, r) => {
        acc.txval += r.txval;
        acc.camt += r.camt;
        acc.samt += r.samt;
        acc.iamt += r.iamt;
        acc.csamt += r.csamt;
        if (r.val !== null) acc.val += r.val;
        return acc;
      },
      { txval: 0, camt: 0, samt: 0, iamt: 0, csamt: 0, val: 0 }
    );
  }, [filteredB2bInvoices]);

  const cdnrTotals = useMemo(() => {
    return filteredCdnrNotes.reduce(
      (acc, r) => {
        acc.txval += r.txval;
        acc.camt += r.camt;
        acc.samt += r.samt;
        acc.iamt += r.iamt;
        acc.csamt += r.csamt;
        if (r.val !== null) acc.val += r.val;
        return acc;
      },
      { txval: 0, camt: 0, samt: 0, iamt: 0, csamt: 0, val: 0 }
    );
  }, [filteredCdnrNotes]);

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Loading state from database */}
      {isLoadingInitial && (
        <div
          className={`p-10 rounded-xl border flex flex-col items-center justify-center space-y-3 ${
            theme === "dark"
              ? "bg-gray-800/90 border-gray-700"
              : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <span className="animate-spin inline-block w-8 h-8 border-3 border-green-600 border-t-transparent rounded-full" />
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Loading saved GSTR-2B records from database...
          </p>
        </div>
      )}

      {/* Upload and Scan Control Card - Shown only before scanning and when not loading initial */}
      {!parsedData && !isLoadingInitial && (
        <div
          className={`p-4 rounded-xl border transition-all ${
            theme === "dark"
              ? "bg-gray-800/90 border-gray-700"
              : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-400">
                <FileJson size={18} />
              </span>
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  GSTR-2B JSON Scanner
                </h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Upload official GSTR-2B offline JSON file to preview B2B invoices & CDNR credit/debit notes
                </p>
              </div>
            </div>
          </div>

          {/* Dropzone & Direct Scan */}
          {isScanning ? (
            <div className="flex flex-col items-center justify-center p-8 space-y-2">
              <span className="animate-spin inline-block w-8 h-8 border-3 border-green-600 border-t-transparent rounded-full" />
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Scanning & Parsing GSTR-2B JSON...
              </p>
              <p className="text-[11px] text-gray-400">{selectedFile?.name}</p>
            </div>
          ) : (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-green-500 bg-green-50/50 dark:bg-green-950/30"
                  : theme === "dark"
                  ? "border-gray-700 hover:border-gray-600 bg-gray-850"
                  : "border-gray-300 hover:border-green-500 bg-gray-50/50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="p-3 bg-green-100 dark:bg-green-950/70 text-green-600 dark:text-green-400 rounded-full">
                  <Upload size={22} />
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-green-600 dark:text-green-400 hover:underline">
                    Click to select JSON file
                  </span>{" "}
                  <span className="text-gray-500">or drag and drop here</span>
                </div>
                <p className="text-[11px] text-gray-400">
                  e.g., returns_24102026_R2B_20ACKPK7923N1ZC_offline.json
                </p>
              </div>
            </div>
          )}

          {/* Validation Error Message */}
          {scanError && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
              <div className="flex-1">
                <span className="font-semibold">Validation Error:</span> {scanError}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tables Section (B2B & CDNR) */}
      {parsedData && (
        <div
          className={`border rounded-xl overflow-hidden flex flex-col flex-1 min-h-[460px] ${
            theme === "dark"
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          {/* Header Bar with Tabs, Status & Search */}
          <div className="p-3 bg-gray-50 dark:bg-gray-900/70 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
            {/* Tabs */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setActiveTab("b2b");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === "b2b"
                    ? "bg-green-600 text-white shadow-xs"
                    : theme === "dark"
                    ? "bg-gray-750 text-gray-300 hover:bg-gray-700"
                    : "bg-white text-gray-700 border hover:bg-gray-100"
                }`}
              >
                <FileText size={14} />
                B2B Invoices
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    activeTab === "b2b"
                      ? "bg-white/20 text-white"
                      : "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300"
                  }`}
                >
                  {filteredB2bInvoices.length}
                </span>
              </button>

              <button
                onClick={() => {
                  setActiveTab("cdnr");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === "cdnr"
                    ? "bg-green-600 text-white shadow-xs"
                    : theme === "dark"
                    ? "bg-gray-750 text-gray-300 hover:bg-gray-700"
                    : "bg-white text-gray-700 border hover:bg-gray-100"
                }`}
              >
                <Layers size={14} />
                Credit / Debit Notes (CDNR)
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    activeTab === "cdnr"
                      ? "bg-white/20 text-white"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300"
                  }`}
                >
                  {filteredCdnrNotes.length}
                </span>
              </button>
            </div>

            {/* Right actions: Status, File Name, Upload New, Search */}
            <div className="flex items-center gap-2 flex-wrap">
              {isSavedInDb ? (
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Saved in DB
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Preview
                </span>
              )}

              {parsedData.fileName && (
                <span
                  className="text-[10px] text-gray-600 dark:text-gray-300 font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 truncate max-w-[140px]"
                  title={parsedData.fileName}
                >
                  {parsedData.fileName}
                </span>
              )}

              <label
                className="text-xs px-2.5 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white flex items-center gap-1.5 transition-colors font-medium cursor-pointer shadow-xs"
                title="Upload another JSON file"
              >
                <Upload size={12} />
                <span>Upload New JSON</span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileChange(e.target.files[0]);
                    }
                    e.target.value = "";
                  }}
                />
              </label>

              {/* Live Search */}
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder={
                    activeTab === "b2b"
                      ? "Search GSTIN, Name, Invoice..."
                      : "Search GSTIN, Name, Note No..."
                  }
                  value={tableSearchTerm}
                  onChange={(e) => {
                    setTableSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-8 pr-3 py-1 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 w-44 sm:w-52 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto flex-1 max-h-[500px]">
            {activeTab === "b2b" ? (
              /* ================== B2B TABLE ================== */
              filteredB2bInvoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-14 text-center text-gray-500">
                  <FileText size={36} className="text-gray-400 mb-2" />
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    No B2B Invoices Found
                  </p>
                  <p className="text-xs text-gray-400 mt-1 max-w-sm">
                    {tableSearchTerm
                      ? `No invoice matched "${tableSearchTerm}". Try clearing your search.`
                      : "The uploaded GSTR-2B file contains no B2B records."}
                  </p>
                </div>
              ) : (
                <table className="w-full text-xs text-left whitespace-nowrap">
                  <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">
                        Customer GSTIN (ctin)
                      </th>
                      <th className="px-3 py-2.5 font-semibold">
                        Invoice No (inum)
                      </th>
                      <th className="px-3 py-2.5 font-semibold">
                        Date (idt)
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-right">
                        Taxable Value (txval)
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-right">
                        CGST (camt)
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-right">
                        SGST (samt)
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-right">
                        IGST (iamt)
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-right bg-green-50/60 dark:bg-green-950/40">
                        Invoice Val (val)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {paginatedB2b.map((inv) => (
                      <tr
                        key={`${inv.ctin}-${inv.inum}-${inv.sno}`}
                        className="hover:bg-green-50/30 dark:hover:bg-gray-750 transition-colors"
                      >
                        <td className="px-3 py-2">
                          <div className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                            {inv.ctin}
                          </div>
                          {inv.trdnm && (
                            <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[150px]" title={inv.trdnm}>
                              {inv.trdnm}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono font-medium text-blue-600 dark:text-blue-400">
                          {inv.inum}
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {formatDisplayDate(inv.idt)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {formatIndianCurrency(inv.txval)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {formatIndianCurrency(inv.camt)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {formatIndianCurrency(inv.samt)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {formatIndianCurrency(inv.iamt)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-green-700 dark:text-green-400 bg-green-50/40 dark:bg-green-950/20 whitespace-nowrap">
                          {inv.val !== null ? formatIndianCurrency(inv.val) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100 dark:bg-gray-900 font-bold border-t border-gray-300 dark:border-gray-700 sticky bottom-0 z-10">
                    <tr>
                      <td colSpan={3} className="px-3 py-2.5 text-gray-800 dark:text-gray-200">
                        Total ({filteredB2bInvoices.length} invoices)
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {formatIndianCurrency(b2bTotals.txval)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatIndianCurrency(b2bTotals.camt)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatIndianCurrency(b2bTotals.samt)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatIndianCurrency(b2bTotals.iamt)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-green-700 dark:text-green-400 bg-green-100/60 dark:bg-green-950/60 whitespace-nowrap">
                        {formatIndianCurrency(b2bTotals.val)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )
            ) : (
              /* ================== CDNR TABLE ================== */
              filteredCdnrNotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-14 text-center text-gray-500">
                  <Layers size={36} className="text-gray-400 mb-2" />
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    No Credit / Debit Notes Found
                  </p>
                  <p className="text-xs text-gray-400 mt-1 max-w-sm">
                    {tableSearchTerm
                      ? `No note matched "${tableSearchTerm}". Try clearing your search.`
                      : "The uploaded GSTR-2B file contains no CDNR records."}
                  </p>
                </div>
              ) : (
                <table className="w-full text-xs text-left whitespace-nowrap">
                  <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">
                        Customer GSTIN (ctin)
                      </th>
                      <th className="px-3 py-2.5 font-semibold">
                        Invoice No (inum)
                      </th>
                      <th className="px-3 py-2.5 font-semibold">
                        Date (idt)
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-right">
                        Taxable Value (txval)
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-right">
                        CGST (camt)
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-right">
                        SGST (samt)
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-right">
                        IGST (iamt)
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-right bg-blue-50/60 dark:bg-blue-950/40">
                        Invoice Val (val)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {paginatedCdnr.map((note) => (
                      <tr
                        key={`${note.ctin}-${note.ntnum}-${note.sno}`}
                        className="hover:bg-blue-50/30 dark:hover:bg-gray-750 transition-colors"
                      >
                        <td className="px-3 py-2">
                          <div className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                            {note.ctin}
                          </div>
                          {note.trdnm && (
                            <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[150px]" title={note.trdnm}>
                              {note.trdnm}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono font-medium text-blue-600 dark:text-blue-400">
                          {note.ntnum}
                          <span
                            className={`ml-1.5 px-1 py-0.2 rounded text-[9px] font-bold ${
                              note.typ === "C"
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300"
                            }`}
                          >
                            {note.typ === "C" ? "Credit" : "Debit"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {formatDisplayDate(note.dt)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {formatIndianCurrency(note.txval)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {formatIndianCurrency(note.camt)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {formatIndianCurrency(note.samt)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {formatIndianCurrency(note.iamt)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-blue-700 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-950/20 whitespace-nowrap">
                          {note.val !== null ? formatIndianCurrency(note.val) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100 dark:bg-gray-900 font-bold border-t border-gray-300 dark:border-gray-700 sticky bottom-0 z-10">
                    <tr>
                      <td colSpan={3} className="px-3 py-2.5 text-gray-800 dark:text-gray-200">
                        Total ({filteredCdnrNotes.length} notes)
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {formatIndianCurrency(cdnrTotals.txval)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatIndianCurrency(cdnrTotals.camt)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatIndianCurrency(cdnrTotals.samt)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatIndianCurrency(cdnrTotals.iamt)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-blue-700 dark:text-blue-400 bg-blue-100/60 dark:bg-blue-950/60 whitespace-nowrap">
                        {formatIndianCurrency(cdnrTotals.val)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )
            )}
          </div>

          {/* Pagination Controls */}
          {activeTotalRecords > 0 && (
            <div className="p-2.5 bg-gray-50 dark:bg-gray-900/70 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between text-xs text-gray-600 dark:text-gray-400 gap-2">
              <div className="flex items-center gap-2">
                <span>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-xs"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-[11px] text-gray-500">
                  Showing{" "}
                  {Math.min((currentPage - 1) * pageSize + 1, activeTotalRecords)} -{" "}
                  {Math.min(currentPage * pageSize, activeTotalRecords)} of {activeTotalRecords}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="px-2 text-xs">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Gstr2bJsonScanner;
