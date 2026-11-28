import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Clock,
  ShieldCheck,
  FileText,
  BarChart2,
  PieChart,
  BookOpen,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx-js-style";
import Swal from "sweetalert2";
import {
  type ReportType,
  type ReportImportMetadata,
  REPORT_META_MAP,
  saveReportData,
  getReportData,
  downloadReportTemplate,
} from "../../../services/reportImportService";
import {
  parseForm26AsPdf,
  PdfPasswordRequiredError,
} from "../../../utils/parse26AsPdf";
import type { Parsed26AsResult } from "../../../utils/parse26AsLines";

interface ReportImportSectionProps {
  initialReportType?: ReportType | string;
  theme?: string;
  /** When true, uses neutral (non-red) styling — used by Form 26AS import */
  neutralTheme?: boolean;
  /** When set, only this report type is shown (no multi-card picker) */
  focusedOnly?: boolean;
  /** Enables direct PDF parsing & upload (used by Form 26AS import) */
  allowPdf?: boolean;
  /** Hides template download buttons & column hints (used when files come externally) */
  hideTemplateDownload?: boolean;
}

const REPORT_ICONS: Record<string, React.ReactNode> = {
  "26as": <ShieldCheck className="text-slate-600 dark:text-slate-300" size={20} />,
  "gstr1-vs-gstr3b": <BarChart2 className="text-red-600 dark:text-red-400" size={20} />,
  "gstr2a-vs-gstr2b": <PieChart className="text-red-600 dark:text-red-400" size={20} />,
  "books-vs-2a": <BookOpen className="text-red-600 dark:text-red-400" size={20} />,
  "books-vs-gstr3b": <FileText className="text-red-600 dark:text-red-400" size={20} />,
  "books-vs-2b": <BookOpen className="text-red-600 dark:text-red-400" size={20} />,
};

export const ReportImportSection: React.FC<ReportImportSectionProps> = ({
  initialReportType,
  theme = "light",
  neutralTheme = false,
  focusedOnly = false,
  allowPdf = false,
  hideTemplateDownload = false,
}) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reportTypesList: ReportType[] = [
    "26as",
    "gstr1-vs-gstr3b",
    "gstr2a-vs-gstr2b",
    "books-vs-2a",
    "books-vs-gstr3b",
    "books-vs-2b",
  ];

  const isValidReportType = (t?: string): t is ReportType =>
    reportTypesList.includes(t as ReportType);

  const [selectedReport, setSelectedReport] = useState<ReportType>(
    isValidReportType(initialReportType)
      ? (initialReportType as ReportType)
      : "26as"
  );

  useEffect(() => {
    if (isValidReportType(initialReportType)) {
      setSelectedReport(initialReportType as ReportType);
    }
  }, [initialReportType]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importedRows, setImportedRows] = useState<Record<string, any>[]>([]);
  const [parsed26As, setParsed26As] = useState<Parsed26AsResult | null>(null);
  const [pdfPasswordNeeded, setPdfPasswordNeeded] = useState(false);
  const [pdfPassword, setPdfPassword] = useState("");
  const [pdfPasswordError, setPdfPasswordError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [importStatusMap, setImportStatusMap] = useState<Record<string, boolean>>({});

  const pdfEnabled = allowPdf || selectedReport === "26as";

  // Check existing import status on load
  useEffect(() => {
    const status: Record<string, boolean> = {};
    reportTypesList.forEach((rt) => {
      const data = getReportData(rt);
      status[rt] = !!(data && data.rows && data.rows.length > 0);
    });
    setImportStatusMap(status);
  }, []);

  const meta = REPORT_META_MAP[selectedReport];

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
    const validSpreadsheetTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    const isSpreadsheet =
      validSpreadsheetTypes.includes(file.type) ||
      lowerName.endsWith(".csv") ||
      lowerName.endsWith(".xlsx") ||
      lowerName.endsWith(".xls");

    if (isPdf && !pdfEnabled) {
      Swal.fire("Error", "PDF import is only supported for ATS 168.", "error");
      return;
    }

    if (!isSpreadsheet && !(pdfEnabled && isPdf)) {
      Swal.fire(
        "Error",
        pdfEnabled
          ? "Please select a valid PDF (.pdf), Excel (.xlsx, .xls), or CSV file"
          : "Please select a valid Excel (.xlsx, .xls) or CSV file",
        "error"
      );
      return;
    }

    setSelectedFile(file);
    setParsed26As(null);
    setPdfPasswordNeeded(false);
    setPdfPassword("");
    setPdfPasswordError("");
    processFile(file);
  };

  const processPdf26As = async (file: File, password?: string) => {
    setIsProcessing(true);
    setPdfPasswordError("");
    try {
      const parsed = await parseForm26AsPdf(file, password);
      setPdfPasswordNeeded(false);
      setParsed26As(parsed);

      if (parsed.entries.length === 0) {
        setImportedRows([]);
        Swal.fire(
          "No Transactions Found",
          "PDF parsed, lekin Part I / Part II / Part VI me koi TDS/TCS transaction rows nahi mili.",
          "warning"
        );
        return;
      }

      const mappedRows = parsed.entries.map((entry) => ({
        "S.No.": entry.slNo || "-",
        "Deductor TAN": entry.deductorTan,
        "Deductor PAN": entry.deductorPan || "-",
        "Deductor Name": entry.deductorName,
        Section: entry.sectionCode,
        "Section Description": entry.sectionDescription || "-",
        "Transaction Date": entry.transactionDate || entry.transactionDateRaw,
        "Booking Date": entry.bookingDate || "-",
        "Booking Status": entry.bookingStatus,
        "Total Amount Paid": entry.amountPaid,
        "TDS Deducted": entry.tdsDeducted,
        "TDS Deposited": entry.tdsDeposited,
        Remarks: entry.remarks || "-",
        Part: entry.partCode,
      }));

      setImportedRows(mappedRows);
    } catch (err: any) {
      if (err instanceof PdfPasswordRequiredError) {
        setPdfPasswordNeeded(true);
        setPdfPasswordError(err.message);
        setImportedRows([]);
        return;
      }
      console.error("ATS 168 PDF Parse Error:", err);
      Swal.fire("PDF Parse Error", err?.message || "Failed to parse ATS 168 PDF", "error");
      setImportedRows([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const processFile = async (file: File) => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (isPdf && pdfEnabled) {
      await processPdf26As(file);
      return;
    }

    setIsProcessing(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
        defval: "",
      });

      if (!jsonData || jsonData.length === 0) {
        Swal.fire("Warning", "The uploaded file contains no data rows.", "warning");
        setImportedRows([]);
        return;
      }

      setImportedRows(jsonData);
    } catch (err) {
      console.error("File Read Error:", err);
      Swal.fire("Error", "Failed to parse Excel file!", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveData = async () => {
    if (importedRows.length === 0) {
      Swal.fire("Warning", "No data to import. Please upload a file first.", "warning");
      return;
    }

    setIsSaving(true);
    try {
      const metadata: ReportImportMetadata | undefined = parsed26As
        ? {
            pan: parsed26As.metadata.pan,
            panStatus: parsed26As.metadata.panStatus,
            taxYear: parsed26As.metadata.taxYear,
            assesseeName: parsed26As.metadata.assesseeName,
            fileName: selectedFile?.name,
            summaryTds: parsed26As.metadata.summaryTds,
            summaryTcs: parsed26As.metadata.summaryTcs,
            totalAmountPaid: parsed26As.calculatedAmountPaid,
            totalTdsDeducted: parsed26As.calculatedTdsDeducted,
            totalTdsDeposited: parsed26As.calculatedTdsDeposited,
            totalsMatch: parsed26As.totalsMatch,
          }
        : selectedFile
        ? { fileName: selectedFile.name }
        : undefined;

      const result = await saveReportData(selectedReport, importedRows, undefined, metadata);
      if (result.success) {
        setImportStatusMap((prev) => ({ ...prev, [selectedReport]: true }));
        Swal.fire({
          icon: "success",
          title: "Import Successful!",
          text: `${meta.name} data saved (${importedRows.length} rows${
            result.savedToDb ? " in Database" : " locally"
          }). You can now view the Books vs ATS 168 report.`,
          showCancelButton: true,
          confirmButtonText: "View Generated Report",
          cancelButtonText: "Close",
          confirmButtonColor: "#2563EB",
        }).then((res) => {
          if (res.isConfirmed) {
            navigate(meta.reportPath);
          }
        });
      }
    } catch (err) {
      console.error("Save error", err);
      Swal.fire("Error", "Failed to save report data", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const currentReportData = getReportData(selectedReport);
  const isNeutral = neutralTheme || selectedReport === "26as";
  const showTemplateControls = !hideTemplateDownload && selectedReport !== "26as";

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div
        className={`p-4 sm:p-6 rounded-xl border ${
          isNeutral
            ? theme === "dark"
              ? "bg-gray-800 border-gray-700 text-gray-200"
              : "bg-slate-50 border-slate-200 text-gray-800"
            : theme === "dark"
            ? "bg-red-950/20 border-red-900/50 text-gray-200"
            : "bg-red-50 border-red-200 text-gray-800"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            {!isNeutral && (
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-full bg-red-600 text-white shadow-sm flex items-center gap-1">
                  <Clock size={12} className="animate-pulse" /> Pending Implementation / Data Import
                </span>
              </div>
            )}
            <h2
              className={`text-xl font-bold ${
                isNeutral ? "text-slate-800 dark:text-slate-100" : "text-red-700 dark:text-red-400"
              }`}
            >
              {isNeutral ? meta.name : "Report Data Import Workflows"}
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
              {isNeutral
                ? meta.description
                : (
                  <>
                    Import required data here for pending report items. Once imported, the corresponding report under{" "}
                    <span className="font-semibold">/app/reports</span> will be automatically generated.
                  </>
                )}
            </p>
          </div>

          {showTemplateControls && (
            <button
              onClick={() => downloadReportTemplate(selectedReport)}
              className={`px-3.5 py-2 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm shrink-0 ${
                isNeutral ? "bg-slate-700 hover:bg-slate-800" : "bg-red-600 hover:bg-red-700"
              }`}
            >
              <Download size={16} />
              Download Template ({meta.name})
            </button>
          )}
        </div>
      </div>

      {/* Grid of Report Selection Cards — hidden in focused/neutral 26AS mode */}
      {!focusedOnly && !isNeutral && (
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Select Report Feature to Import Data For:
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {reportTypesList.map((typeKey) => {
            const reportMeta = REPORT_META_MAP[typeKey];
            const isSelected = selectedReport === typeKey;
            const isImported = importStatusMap[typeKey];

            return (
              <button
                key={typeKey}
                type="button"
                onClick={() => {
                  setSelectedReport(typeKey);
                  setSelectedFile(null);
                  setImportedRows([]);
                }}
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                  isSelected
                    ? "border-red-600 bg-red-50/70 dark:bg-red-950/40 ring-2 ring-red-500/50 shadow-md"
                    : "border-red-200 dark:border-red-900/40 bg-white dark:bg-gray-800 hover:bg-red-50/30 dark:hover:bg-gray-750"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-lg bg-red-100 dark:bg-red-950/60">
                      {REPORT_ICONS[typeKey]}
                    </div>
                    {isImported ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 flex items-center gap-1">
                        <CheckCircle size={10} /> Data Ready
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 flex items-center gap-1 border border-red-300 dark:border-red-800">
                        <Clock size={10} /> Pending
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 leading-snug">
                    {reportMeta.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    {reportMeta.description}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-red-100 dark:border-red-950 flex items-center justify-between text-xs font-semibold text-red-600 dark:text-red-400">
                  <span>{isSelected ? "Selected" : "Select to Import"}</span>
                  <ArrowRight size={14} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* Import Form & File Dropzone */}
      <div
        className={`p-6 rounded-xl border ${
          theme === "dark"
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200 shadow-sm"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-gray-700 mb-6">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
              {REPORT_ICONS[selectedReport]}
              {meta.name} - Data Import
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {meta.description}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {showTemplateControls && (
              <button
                onClick={() => downloadReportTemplate(selectedReport)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5"
              >
                <Download size={14} /> Download Excel Format
              </button>
            )}
            {currentReportData && (
              <button
                onClick={() => navigate(meta.reportPath)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                View Generated Report <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Expected Fields Info */}
        {showTemplateControls && (
          <div className="mb-6 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
              Required Excel / CSV Columns:
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {meta.fields.map((f, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded bg-white dark:bg-gray-800 text-xs font-medium text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Upload Zone */}
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
            dragActive
              ? isNeutral
                ? "border-slate-500 bg-slate-50/80 dark:bg-slate-800/40"
                : "border-red-500 bg-red-50/50 dark:bg-red-950/20"
              : isNeutral
              ? "border-gray-300 dark:border-gray-700 hover:border-slate-400 dark:hover:border-slate-500"
              : "border-gray-300 dark:border-gray-700 hover:border-red-400 dark:hover:border-red-600"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload
            className={`h-10 w-10 mx-auto mb-3 ${
              isNeutral ? "text-slate-500 dark:text-slate-400" : "text-red-500 dark:text-red-400"
            }`}
          />
          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {pdfEnabled
              ? "Click to choose ATS 168 PDF / Excel / CSV or drag & drop here"
              : "Click to choose file or drag & drop Excel / CSV here"}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {pdfEnabled
              ? `Supports TRACES .pdf, .xlsx, .xls, and .csv format for ${meta.name}`
              : `Supports .xlsx, .xls, and .csv format for ${meta.name}`}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={pdfEnabled ? ".pdf,.xlsx,.xls,.csv" : ".xlsx,.xls,.csv"}
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
          />
        </div>

        {/* File Selected & Processing State */}
        {selectedFile && (
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 border rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {selectedFile.name.toLowerCase().endsWith(".pdf") ? (
                <FileText className="h-6 w-6 text-blue-600" />
              ) : (
                <FileSpreadsheet className="h-6 w-6 text-green-600" />
              )}
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {selectedFile.name}
                </div>
                <div className="text-xs text-gray-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB • {importedRows.length} rows loaded
                </div>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
                setImportedRows([]);
                setParsed26As(null);
                setPdfPasswordNeeded(false);
                setPdfPassword("");
                setPdfPasswordError("");
              }}
              className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1"
            >
              Clear File
            </button>
          </div>
        )}

        {/* Password Prompt for Encrypted TRACES PDF */}
        {pdfPasswordNeeded && selectedFile && (
          <div className="mt-4 p-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 space-y-2">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
              <AlertTriangle size={14} />
              {pdfPasswordError || "This PDF is password protected."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                value={pdfPassword}
                onChange={(e) => setPdfPassword(e.target.value)}
                placeholder="Enter PDF password (e.g. DDMMYYYY)"
                className="px-3 py-1.5 text-xs rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-64"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && selectedFile) {
                    processPdf26As(selectedFile, pdfPassword);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => selectedFile && processPdf26As(selectedFile, pdfPassword)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg"
              >
                Unlock &amp; Parse PDF
              </button>
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded-lg flex items-center gap-3">
            <RefreshCw className="animate-spin" size={18} />
            <span className="text-sm">
              {selectedFile?.name.toLowerCase().endsWith(".pdf")
                ? "Extracting ATS 168 tables & TDS values from PDF..."
                : "Reading Excel content..."}
            </span>
          </div>
        )}

        {/* Extracted 26AS PDF Summary Banner */}
        {parsed26As && importedRows.length > 0 && (
          <div className="mt-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {parsed26As.metadata.assesseeName && (
                  <span className="font-bold text-slate-900 dark:text-white">
                    {parsed26As.metadata.assesseeName}
                  </span>
                )}
                {parsed26As.metadata.pan && (
                  <span className="px-2 py-0.5 rounded bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700 font-mono text-[11px]">
                    PAN: {parsed26As.metadata.pan}
                  </span>
                )}
                {parsed26As.metadata.taxYear && (
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 font-semibold text-[11px]">
                    TY: {parsed26As.metadata.taxYear}
                  </span>
                )}
              </div>

              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1 ${
                  parsed26As.totalsMatch
                    ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                }`}
              >
                {parsed26As.totalsMatch ? (
                  <>
                    <CheckCircle size={12} /> Totals Verified with ATS 168 Summary
                  </>
                ) : (
                  <>
                    <AlertTriangle size={12} /> Check Summary Total (PDF Summary: ₹
                    {parsed26As.metadata.summaryTds.toLocaleString("en-IN", { minimumFractionDigits: 2 })})
                  </>
                )}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] text-gray-500 uppercase">Deductors / Entries</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {parsed26As.deductorsCount} / {parsed26As.entries.length}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] text-gray-500 uppercase">Amount Paid / Credited</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  ₹{parsed26As.calculatedAmountPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] text-gray-500 uppercase">Total Tax Deducted</div>
                <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
                  ₹{parsed26As.calculatedTdsDeducted.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] text-gray-500 uppercase">Total TDS Deposited</div>
                <div className="text-sm font-bold text-green-600 dark:text-green-400">
                  ₹{parsed26As.calculatedTdsDeposited.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Data Preview Table */}
        {importedRows.length > 0 && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <CheckCircle className="text-green-500" size={16} />
                Preview Imported Rows ({importedRows.length})
              </h4>
              <button
                onClick={handleSaveData}
                disabled={isSaving}
                className={`px-4 py-2 disabled:bg-gray-400 text-white font-medium text-sm rounded-lg shadow-sm transition-colors flex items-center gap-2 ${
                  isNeutral ? "bg-slate-700 hover:bg-slate-800" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="animate-spin" size={16} /> Saving...
                  </>
                ) : (
                  <>
                    Save & Generate Report <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>

            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto max-h-80">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100 dark:bg-gray-750 text-gray-700 dark:text-gray-300 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 border-b">#</th>
                    {Object.keys(importedRows[0]).map((key) => (
                      <th key={key} className="px-3 py-2 border-b font-semibold whitespace-nowrap">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {importedRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                      <td className="px-3 py-2 text-gray-500">{rIdx + 1}</td>
                      {Object.keys(importedRows[0]).map((key, cIdx) => (
                        <td key={cIdx} className="px-3 py-2 whitespace-nowrap text-gray-800 dark:text-gray-200">
                          {row[key] !== undefined && row[key] !== null ? String(row[key]) : "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportImportSection;
