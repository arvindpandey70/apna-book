import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  Upload,
  FileJson,
  X,
  AlertCircle,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Calendar,
  Layers,
  FileText,
} from "lucide-react";
import { useAppContext } from "../../../context/AppContext";

export interface GstReturnMetadata {
  gstin?: string;
  fp?: string;
  filing_typ?: string;
  fil_dt?: string;
  gt?: number;
  cur_gt?: number;
  version?: string;
  hash?: string;
}

export interface GstB2bInvoiceRow {
  sno: number;
  ctin: string;
  inum: string;
  idt: string;
  inv_typ: string;
  pos: string;
  rt: string;
  txval: number;
  camt: number;
  samt: number;
  iamt: number;
  csamt: number;
  val: number | null;
}

export interface GstB2cSummaryRow {
  sno: number;
  pos: string;
  sply_ty: string;
  typ: string;
  rt: string | number;
  txval: number;
  camt: number;
  samt: number;
  iamt: number;
  csamt: number;
  flag: string;
}

export interface ParsedGstr1Data {
  metadata: GstReturnMetadata;
  b2bInvoices: GstB2bInvoiceRow[];
  b2cSummaries: GstB2cSummaryRow[];
  totalB2bTaxable: number;
  totalB2bTax: number;
  totalB2bVal: number;
  totalB2cTaxable: number;
  totalB2cTax: number;
  fileName: string;
  fileSizeBytes: number;
  scannedAt: string;
  warning?: string;
}

export interface GstJsonScannerProps {
  onDataLoaded?: (data: ParsedGstr1Data | null) => void;
  fromDate?: string;
  toDate?: string;
  searchTerm?: string;
}

// Normalizes date strings (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, ISO timestamps) to "YYYY-MM-DD"
export const normalizeToIsoDate = (
  dateStr: string | null | undefined
): string | null => {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s || s === "-") return null;

  // Case 1: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, "0");
    const d = isoMatch[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Case 2: DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, "0");
    const m = dmyMatch[2].padStart(2, "0");
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  // Fallback to JS Date
  try {
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  } catch {
    // Ignore
  }
  return null;
};

// Check if a record date is within [fromDate, toDate]
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

// Check if a GSTR-1 return filing period (fp or fil_dt) overlaps with [fromDate, toDate]
export const isPeriodInRange = (
  fp?: string | null,
  filDt?: string | null,
  fromDate?: string | null,
  toDate?: string | null
): boolean => {
  if (!fromDate && !toDate) return true;

  const from = normalizeToIsoDate(fromDate);
  const to = normalizeToIsoDate(toDate);

  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  if (fp && fp.length === 6 && /^\d{6}$/.test(fp)) {
    const month = parseInt(fp.slice(0, 2), 10);
    const year = parseInt(fp.slice(2), 10);
    if (!isNaN(month) && !isNaN(year)) {
      const lastDay = new Date(year, month, 0).getDate();
      periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
      periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }
  } else if (filDt) {
    const norm = normalizeToIsoDate(filDt);
    if (norm) {
      periodStart = norm;
      periodEnd = norm;
    }
  }

  if (!periodStart || !periodEnd) return true;

  if (from && periodEnd < from) return false;
  if (to && periodStart > to) return false;
  return true;
};

export const formatIndianCurrency = (
  val: number | string | null | undefined
): string => {
  if (val === null || val === undefined || val === "") return "-";
  const num = typeof val === "number" ? val : parseFloat(String(val));
  if (isNaN(num)) return "-";
  return `₹${num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const formatDisplayDate = (
  dateStr: string | null | undefined
): string => {
  if (!dateStr) return "-";
  const clean = String(dateStr).trim();
  const ddmmyyyyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyyMatch) {
    const [, d, m, y] = ddmmyyyyMatch;
    return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
  }
  try {
    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    }
  } catch {
    // fallback
  }
  return clean;
};

export const formatPeriod = (fp: string | null | undefined): string => {
  if (!fp) return "-";
  const str = String(fp).trim();
  if (str.length === 6 && /^\d{6}$/.test(str)) {
    const monthNum = parseInt(str.slice(0, 2), 10);
    const year = str.slice(2);
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const monthName = monthNames[monthNum - 1] || str.slice(0, 2);
    return `${monthName} ${year} (${str.slice(0, 2)}/${year})`;
  }
  return str;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export const parseGstr1Json = (
  jsonText: string
): {
  metadata: GstReturnMetadata;
  b2bInvoices: GstB2bInvoiceRow[];
  b2cSummaries: GstB2cSummaryRow[];
  warning?: string;
} => {
  let root: any;
  try {
    root = JSON.parse(jsonText);
  } catch (err: any) {
    throw new Error(`Invalid JSON syntax: ${err?.message || "Malformed file"}`);
  }

  if (!root || typeof root !== "object") {
    throw new Error("Invalid GST Return JSON: Root element is not an object.");
  }

  // Handle both { data: { ... } } and direct root { gstin: ..., b2b: ... }
  const data = root.data && typeof root.data === "object" ? root.data : root;

  // Metadata: only pick available fields
  const metadata: GstReturnMetadata = {};
  if (data.gstin || root.gstin) metadata.gstin = String(data.gstin || root.gstin);
  if (data.fp || root.fp) metadata.fp = String(data.fp || root.fp);
  if (data.filing_typ || root.filing_typ)
    metadata.filing_typ = String(data.filing_typ || root.filing_typ);
  if (data.fil_dt || root.fil_dt)
    metadata.fil_dt = String(data.fil_dt || root.fil_dt);
  if (data.gt !== undefined || root.gt !== undefined)
    metadata.gt = Number(data.gt ?? root.gt);
  if (data.cur_gt !== undefined || root.cur_gt !== undefined)
    metadata.cur_gt = Number(data.cur_gt ?? root.cur_gt);
  if (data.version || root.version)
    metadata.version = String(data.version || root.version);
  if (data.hash || root.hash) metadata.hash = String(data.hash || root.hash);

  const b2bRaw = Array.isArray(data.b2b)
    ? data.b2b
    : Array.isArray(root.b2b)
    ? root.b2b
    : [];
  const b2csRaw = Array.isArray(data.b2cs)
    ? data.b2cs
    : Array.isArray(root.b2cs)
    ? root.b2cs
    : [];

  let warning: string | undefined;
  if (!metadata.gstin && b2bRaw.length === 0 && b2csRaw.length === 0) {
    warning =
      "No standard GSTR-1 sections (gstin, b2b, or b2cs) were found in this JSON file.";
  }

  // Flatten B2B customer groups into individual invoices
  const b2bInvoices: GstB2bInvoiceRow[] = [];
  let b2bSno = 1;

  for (const cust of b2bRaw) {
    if (!cust || typeof cust !== "object") continue;
    const ctin = String(cust.ctin || cust.gstin || "-").trim();
    const invArray = Array.isArray(cust.inv) ? cust.inv : [];

    for (const inv of invArray) {
      if (!inv || typeof inv !== "object") continue;
      const inum = String(inv.inum || inv.inv_no || "-").trim();
      const idt = String(inv.idt || inv.inv_dt || "-").trim();
      const inv_typ = String(inv.inv_typ || inv.inv_type || "R").trim();
      const pos =
        inv.pos !== undefined && inv.pos !== null
          ? String(inv.pos).trim()
          : "-";

      // Keep invoice-level 'val'
      const val =
        inv.val !== undefined && inv.val !== null ? Number(inv.val) : null;

      // Item tax accumulation
      let txvalSum = 0;
      let camtSum = 0;
      let samtSum = 0;
      let iamtSum = 0;
      let csamtSum = 0;
      const rates = new Set<number>();

      const itms = Array.isArray(inv.itms) ? inv.itms : [];
      for (const item of itms) {
        if (!item || typeof item !== "object") continue;
        const det = item.itm_det || item;
        if (det.txval !== undefined && det.txval !== null)
          txvalSum += Number(det.txval);
        if (det.camt !== undefined && det.camt !== null)
          camtSum += Number(det.camt);
        if (det.samt !== undefined && det.samt !== null)
          samtSum += Number(det.samt);
        if (det.iamt !== undefined && det.iamt !== null)
          iamtSum += Number(det.iamt);
        if (det.csamt !== undefined && det.csamt !== null)
          csamtSum += Number(det.csamt);
        if (det.rt !== undefined && det.rt !== null && det.rt !== "") {
          const numRt = Number(det.rt);
          if (!isNaN(numRt)) rates.add(numRt);
        }
      }

      const rtDisplay =
        rates.size > 0
          ? Array.from(rates)
              .sort((a, b) => a - b)
              .map((r) => `${r}%`)
              .join(", ")
          : "-";

      b2bInvoices.push({
        sno: b2bSno++,
        ctin,
        inum,
        idt,
        inv_typ,
        pos,
        rt: rtDisplay,
        txval: txvalSum,
        camt: camtSum,
        samt: samtSum,
        iamt: iamtSum,
        csamt: csamtSum,
        val,
      });
    }
  }

  // Flatten B2C summary records
  const b2cSummaries: GstB2cSummaryRow[] = [];
  let b2cSno = 1;

  for (const b2c of b2csRaw) {
    if (!b2c || typeof b2c !== "object") continue;
    const pos =
      b2c.pos !== undefined && b2c.pos !== null ? String(b2c.pos).trim() : "-";
    const sply_ty = String(b2c.sply_ty || b2c.supply_type || "-").trim();
    const typ = String(b2c.typ || b2c.type || "-").trim();
    const rt =
      b2c.rt !== undefined && b2c.rt !== null && b2c.rt !== ""
        ? `${b2c.rt}%`
        : "-";
    const txval =
      b2c.txval !== undefined && b2c.txval !== null ? Number(b2c.txval) : 0;
    const camt =
      b2c.camt !== undefined && b2c.camt !== null ? Number(b2c.camt) : 0;
    const samt =
      b2c.samt !== undefined && b2c.samt !== null ? Number(b2c.samt) : 0;
    const iamt =
      b2c.iamt !== undefined && b2c.iamt !== null ? Number(b2c.iamt) : 0;
    const csamt =
      b2c.csamt !== undefined && b2c.csamt !== null ? Number(b2c.csamt) : 0;
    const flag =
      b2c.flag !== undefined && b2c.flag !== null
        ? String(b2c.flag).trim()
        : "-";

    b2cSummaries.push({
      sno: b2cSno++,
      pos,
      sply_ty,
      typ,
      rt,
      txval,
      camt,
      samt,
      iamt,
      csamt,
      flag,
    });
  }

  return { metadata, b2bInvoices, b2cSummaries, warning };
};

export const GstJsonScanner: React.FC<GstJsonScannerProps> = ({
  onDataLoaded,
  fromDate,
  toDate,
  searchTerm: parentSearchTerm,
}) => {
  const { theme } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset pagination when date filters or parent search change
  useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, toDate, parentSearchTerm]);

  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);

  // Parsed State
  const [parsedData, setParsedData] = useState<ParsedGstr1Data | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<"b2b" | "b2c">("b2b");
  const [b2bSearchTerm, setB2bSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Direct parser and scanner function called immediately on file selection
  const processAndScanFile = (file: File) => {
    setIsScanning(true);
    setScanError(null);
    setScanSuccess(null);

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text || !text.trim()) {
          throw new Error("The file content is empty.");
        }

        const { metadata, b2bInvoices, b2cSummaries, warning } =
          parseGstr1Json(text);

        // Aggregate Totals
        const totalB2bTaxable = b2bInvoices.reduce((a, b) => a + b.txval, 0);
        const totalB2bTax = b2bInvoices.reduce(
          (a, b) => a + b.camt + b.samt + b.iamt + b.csamt,
          0
        );
        const totalB2bVal = b2bInvoices.reduce(
          (a, b) => a + (b.val !== null ? b.val : b.txval),
          0
        );

        const totalB2cTaxable = b2cSummaries.reduce((a, b) => a + b.txval, 0);
        const totalB2cTax = b2cSummaries.reduce(
          (a, b) => a + b.camt + b.samt + b.iamt + b.csamt,
          0
        );

        const result: ParsedGstr1Data = {
          metadata,
          b2bInvoices,
          b2cSummaries,
          totalB2bTaxable,
          totalB2bTax,
          totalB2bVal,
          totalB2cTaxable,
          totalB2cTax,
          fileName: file.name,
          fileSizeBytes: file.size,
          scannedAt: new Date().toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          warning,
        };

        setParsedData(result);
        setCurrentPage(1);
        if (b2bInvoices.length === 0 && b2cSummaries.length > 0) {
          setActiveTab("b2c");
        } else {
          setActiveTab("b2b");
        }

        if (onDataLoaded) {
          onDataLoaded(result);
        }
      } catch (err: any) {
        setScanError(
          err?.message || "Failed to parse JSON. Please check file structure."
        );
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

  // Handle file selection (click or drag-drop) - triggers direct scan
  const handleFileChange = (file: File | null) => {
    setScanError(null);
    setScanSuccess(null);
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
    setScanSuccess(null);
    setParsedData(null);
    setB2bSearchTerm("");
    setCurrentPage(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (onDataLoaded) onDataLoaded(null);
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

  // Filter B2B invoices by date range and search term
  const filteredB2bInvoices = useMemo(() => {
    if (!parsedData) return [];
    let list = parsedData.b2bInvoices;

    // Filter by Date Range (fromDate / toDate)
    if (fromDate || toDate) {
      list = list.filter((r) => isDateInRange(r.idt, fromDate, toDate));
    }

    // Filter by search term (local table search or parent search)
    const effectiveSearch = (b2bSearchTerm || parentSearchTerm || "")
      .toLowerCase()
      .trim();
    if (!effectiveSearch) return list;

    return list.filter(
      (r) =>
        r.ctin.toLowerCase().includes(effectiveSearch) ||
        r.inum.toLowerCase().includes(effectiveSearch) ||
        r.idt.toLowerCase().includes(effectiveSearch) ||
        r.txval.toString().includes(effectiveSearch)
    );
  }, [parsedData, fromDate, toDate, b2bSearchTerm, parentSearchTerm]);

  // Filter B2C summaries by return period overlapping date range
  const filteredB2cSummaries = useMemo(() => {
    if (!parsedData) return [];
    let list = parsedData.b2cSummaries;

    if (fromDate || toDate) {
      const inRange = isPeriodInRange(
        parsedData.metadata.fp,
        parsedData.metadata.fil_dt,
        fromDate,
        toDate
      );
      if (!inRange) return [];
    }

    return list;
  }, [parsedData, fromDate, toDate]);

  // Paginated B2B
  const paginatedB2b = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredB2bInvoices.slice(start, start + pageSize);
  }, [filteredB2bInvoices, currentPage, pageSize]);

  // Paginated B2C
  const paginatedB2c = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredB2cSummaries.slice(start, start + pageSize);
  }, [filteredB2cSummaries, currentPage, pageSize]);

  // Current active records total count for pagination
  const activeTotalRecords =
    activeTab === "b2b"
      ? filteredB2bInvoices.length
      : filteredB2cSummaries.length;
  const totalPages = Math.max(1, Math.ceil(activeTotalRecords / pageSize));

  // Filtered B2B totals for footer
  const filteredB2bTotals = useMemo(() => {
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

  // B2C totals for footer
  const b2cTotals = useMemo(() => {
    return filteredB2cSummaries.reduce(
      (acc, r) => {
        acc.txval += r.txval;
        acc.camt += r.camt;
        acc.samt += r.samt;
        acc.iamt += r.iamt;
        acc.csamt += r.csamt;
        return acc;
      },
      { txval: 0, camt: 0, samt: 0, iamt: 0, csamt: 0 }
    );
  }, [filteredB2cSummaries]);

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Upload and Scan Control Card - Shown only before scanning */}
      {!parsedData && (
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
                  GST Return JSON Scanner
                </h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Upload official GSTR-1 offline JSON file to view B2B & B2C
                </p>
              </div>
            </div>
          </div>

          {/* Dropzone & Direct Scan */}
          {isScanning ? (
            <div className="flex flex-col items-center justify-center p-8 space-y-2">
              <span className="animate-spin inline-block w-8 h-8 border-3 border-green-600 border-t-transparent rounded-full" />
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Scanning & Parsing GST JSON...
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
                  e.g., returns_22102026_R1_20ACKPK7923N1ZC_offline_others_0.json
                </p>
              </div>
            </div>
          )}

          {/* Validation Error Message */}
          {scanError && (
            <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
              <div className="flex-1">
                <span className="font-semibold">Validation Error:</span>{" "}
                {scanError}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top-Level Return Information Banner (Only fields available in JSON) */}
      {parsedData && (
        <div
          className={`p-3.5 rounded-xl border ${
            theme === "dark"
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between pb-2 mb-2.5 border-b border-gray-100 dark:border-gray-700/60 gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-green-700 dark:text-green-400 flex items-center gap-1.5">
                <ShieldCheck size={14} /> GSTR-1 Return Information
              </span>
              <span className="text-[10px] text-gray-400 font-mono">
                • Scanned at {parsedData.scannedAt}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="text-[10px] text-gray-600 dark:text-gray-300 font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 truncate max-w-[200px]"
                title={parsedData.fileName}
              >
                {parsedData.fileName}
              </span>
              <button
                onClick={handleClearFile}
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-1.5 transition-colors font-medium cursor-pointer"
                title="Upload another JSON file"
              >
                <Upload size={12} />
                <span>Upload New JSON</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {parsedData.metadata.gstin && (
              <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-700/50">
                <span className="text-[10px] text-gray-500 uppercase font-semibold block">
                  GSTIN
                </span>
                <span className="font-bold font-mono text-gray-900 dark:text-gray-100">
                  {parsedData.metadata.gstin}
                </span>
              </div>
            )}

            {parsedData.metadata.fp && (
              <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-700/50">
                <span className="text-[10px] text-gray-500 uppercase font-semibold block flex items-center gap-1">
                  <Calendar size={10} /> Return Period (fp)
                </span>
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  {formatPeriod(parsedData.metadata.fp)}
                </span>
              </div>
            )}

            {parsedData.metadata.filing_typ && (
              <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-700/50">
                <span className="text-[10px] text-gray-500 uppercase font-semibold block">
                  Filing Type
                </span>
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  {parsedData.metadata.filing_typ}
                </span>
              </div>
            )}

            {parsedData.metadata.fil_dt && (
              <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-700/50">
                <span className="text-[10px] text-gray-500 uppercase font-semibold block">
                  Filing Date
                </span>
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  {formatDisplayDate(parsedData.metadata.fil_dt)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tables Section (B2B & B2C) */}
      {parsedData && (
        <div
          className={`border rounded-xl overflow-hidden flex flex-col flex-1 min-h-[460px] ${
            theme === "dark"
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          {/* Header Bar with Tabs & Search */}
          <div className="p-3 bg-gray-50 dark:bg-gray-900/70 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
            {/* Tabs */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setActiveTab("b2b");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
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
                  setActiveTab("b2c");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === "b2c"
                    ? "bg-green-600 text-white shadow-xs"
                    : theme === "dark"
                    ? "bg-gray-750 text-gray-300 hover:bg-gray-700"
                    : "bg-white text-gray-700 border hover:bg-gray-100"
                }`}
              >
                <Layers size={14} />
                B2C Summary
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    activeTab === "b2c"
                      ? "bg-white/20 text-white"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300"
                  }`}
                >
                  {filteredB2cSummaries.length}
                </span>
              </button>
            </div>

            {/* B2B Live Search */}
            {activeTab === "b2b" && (
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder="Search GSTIN or Invoice No..."
                  value={b2bSearchTerm}
                  onChange={(e) => {
                    setB2bSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-8 pr-3 py-1 border border-gray-300 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-900 w-52 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            )}
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
                    {b2bSearchTerm
                      ? `No invoice matched "${b2bSearchTerm}". Try clearing your search.`
                      : "The uploaded GSTR-1 file contains no B2B records in data.b2b."}
                  </p>
                </div>
              ) : (
                <table className="w-full text-xs text-left whitespace-nowrap">
                  <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
                    <tr>
                      <th className="px-2.5 py-2.5 font-semibold text-center w-10">
                        #
                      </th>
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
                        <td className="px-2.5 py-2 text-center text-gray-500 font-mono">
                          {inv.sno}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold text-gray-900 dark:text-gray-100">
                          {inv.ctin}
                        </td>
                        <td className="px-3 py-2 font-mono font-medium text-blue-600 dark:text-blue-400">
                          {inv.inum}
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                          {formatDisplayDate(inv.idt)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                          {formatIndianCurrency(inv.txval)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                          {formatIndianCurrency(inv.camt)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                          {formatIndianCurrency(inv.samt)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                          {formatIndianCurrency(inv.iamt)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-green-700 dark:text-green-400 bg-green-50/40 dark:bg-green-950/20">
                          {inv.val !== null
                            ? formatIndianCurrency(inv.val)
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100 dark:bg-gray-900 font-bold border-t border-gray-300 dark:border-gray-700 sticky bottom-0 z-10">
                    <tr>
                      <td colSpan={4} className="px-3 py-2.5 text-gray-800 dark:text-gray-200">
                        Total ({filteredB2bInvoices.length} invoices)
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-900 dark:text-gray-100">
                        {formatIndianCurrency(filteredB2bTotals.txval)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">
                        {formatIndianCurrency(filteredB2bTotals.camt)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">
                        {formatIndianCurrency(filteredB2bTotals.samt)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">
                        {formatIndianCurrency(filteredB2bTotals.iamt)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-extrabold text-green-700 dark:text-green-400 bg-green-100/60 dark:bg-green-950/60">
                        {formatIndianCurrency(filteredB2bTotals.val)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )
            ) : (
              /* ================== B2C TABLE ================== */
              filteredB2cSummaries.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-14 text-center text-gray-500">
                  <Layers size={36} className="text-gray-400 mb-2" />
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    No B2C Summary Records Found
                  </p>
                  <p className="text-xs text-gray-400 mt-1 max-w-sm">
                    {fromDate || toDate
                      ? "No B2C records found within the selected date range."
                      : "The uploaded GSTR-1 file contains no B2C records in data.b2cs."}
                  </p>
                </div>
              ) : (
                <table className="w-full text-xs text-left whitespace-nowrap">
                  <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
                    <tr>
                      <th className="px-2.5 py-2.5 font-semibold text-center w-10">
                        #
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-center">
                        POS
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-center">
                        Supply Type (sply_ty)
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-center">
                        Category (typ)
                      </th>
                      <th className="px-3 py-2.5 font-semibold text-center">
                        GST Rate (rt)
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
                      <th className="px-2.5 py-2.5 font-semibold text-center">
                        Flag
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {paginatedB2c.map((b2c) => (
                      <tr
                        key={`b2c-${b2c.sno}`}
                        className="hover:bg-blue-50/30 dark:hover:bg-gray-750 transition-colors"
                      >
                        <td className="px-2.5 py-2 text-center text-gray-500 font-mono">
                          {b2c.sno}
                        </td>
                        <td className="px-3 py-2 text-center font-mono font-medium text-gray-800 dark:text-gray-200">
                          {b2c.pos}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                            {b2c.sply_ty}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center font-medium text-gray-700 dark:text-gray-300">
                          {b2c.typ}
                        </td>
                        <td className="px-3 py-2 text-center font-semibold text-green-700 dark:text-green-400">
                          {b2c.rt}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                          {formatIndianCurrency(b2c.txval)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                          {formatIndianCurrency(b2c.camt)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                          {formatIndianCurrency(b2c.samt)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                          {formatIndianCurrency(b2c.iamt)}
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                            {b2c.flag}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100 dark:bg-gray-900 font-bold border-t border-gray-300 dark:border-gray-700 sticky bottom-0 z-10">
                    <tr>
                      <td colSpan={5} className="px-3 py-2.5 text-gray-800 dark:text-gray-200">
                        Total ({filteredB2cSummaries.length} records)
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-900 dark:text-gray-100">
                        {formatIndianCurrency(b2cTotals.txval)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">
                        {formatIndianCurrency(b2cTotals.camt)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">
                        {formatIndianCurrency(b2cTotals.samt)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300">
                        {formatIndianCurrency(b2cTotals.iamt)}
                      </td>
                      <td className="px-2.5 py-2.5 text-center text-gray-400">-</td>
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
                  {Math.min(
                    (currentPage - 1) * pageSize + 1,
                    activeTotalRecords
                  )}{" "}
                  - {Math.min(currentPage * pageSize, activeTotalRecords)} of{" "}
                  {activeTotalRecords}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="px-2 text-xs">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  className="p-1 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-200 dark:hover:bg-gray-700"
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

export default GstJsonScanner;
