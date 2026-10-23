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
  REPORT_META_MAP,
  saveReportData,
  getReportData,
  downloadReportTemplate,
} from "../../../services/reportImportService";

interface ReportImportSectionProps {
  initialReportType?: ReportType | string;
  theme?: string;
}

const REPORT_ICONS: Record<string, React.ReactNode> = {
  "26as": <ShieldCheck className="text-red-600 dark:text-red-400" size={20} />,
  "gstr1-vs-gstr3b": <BarChart2 className="text-red-600 dark:text-red-400" size={20} />,
  "gstr2a-vs-gstr2b": <PieChart className="text-red-600 dark:text-red-400" size={20} />,
  "books-vs-2a": <BookOpen className="text-red-600 dark:text-red-400" size={20} />,
  "books-vs-gstr3b": <FileText className="text-red-600 dark:text-red-400" size={20} />,
  "books-vs-2b": <BookOpen className="text-red-600 dark:text-red-400" size={20} />,
};

export const ReportImportSection: React.FC<ReportImportSectionProps> = ({
  initialReportType,
  theme = "light",
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [importStatusMap, setImportStatusMap] = useState<Record<string, boolean>>({});

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
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file) return;
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];

    if (!validTypes.includes(file.type) && !file.name.endsWith(".csv") && !file.name.endsWith(".xlsx")) {
      Swal.fire("Error", "Please select a valid Excel (.xlsx, .xls) or CSV file", "error");
      return;
    }

    setSelectedFile(file);
    processFile(file);
  };

  const processFile = async (file: File) => {
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
      const result = await saveReportData(selectedReport, importedRows);
      if (result.success) {
        setImportStatusMap((prev) => ({ ...prev, [selectedReport]: true }));
        Swal.fire({
          icon: "success",
          title: "Import Successful!",
          text: `${meta.name} data imported successfully (${importedRows.length} rows). You can now view the generated report.`,
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

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div
        className={`p-4 sm:p-6 rounded-xl border ${
          theme === "dark"
            ? "bg-red-950/20 border-red-900/50 text-gray-200"
            : "bg-red-50 border-red-200 text-gray-800"
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-full bg-red-600 text-white shadow-sm flex items-center gap-1">
                <Clock size={12} className="animate-pulse" /> Pending Implementation / Data Import
              </span>
            </div>
            <h2 className="text-xl font-bold text-red-700 dark:text-red-400">
              Report Data Import Workflows
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
              Import required data here for pending report items. Once imported, the corresponding report under <span className="font-semibold">/app/reports</span> will be automatically generated.
            </p>
          </div>

          <button
            onClick={() => downloadReportTemplate(selectedReport)}
            className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm shrink-0"
          >
            <Download size={16} />
            Download Template ({meta.name})
          </button>
        </div>
      </div>

      {/* Grid of Report Selection Cards (Pending Indicator visually Red) */}
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
            <button
              onClick={() => downloadReportTemplate(selectedReport)}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5"
            >
              <Download size={14} /> Download Excel Format
            </button>
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

        {/* Upload Zone */}
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
            dragActive
              ? "border-red-500 bg-red-50/50 dark:bg-red-950/20"
              : "border-gray-300 dark:border-gray-700 hover:border-red-400 dark:hover:border-red-600"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-10 w-10 mx-auto text-red-500 dark:text-red-400 mb-3" />
          <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Click to choose file or drag & drop Excel / CSV here
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Supports .xlsx, .xls, and .csv format for {meta.name}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
          />
        </div>

        {/* File Selected & Processing State */}
        {selectedFile && (
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 border rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileSpreadsheet className="h-6 w-6 text-green-600" />
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
              }}
              className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1"
            >
              Clear File
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded-lg flex items-center gap-3">
            <RefreshCw className="animate-spin" size={18} />
            <span className="text-sm">Reading Excel content...</span>
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
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-medium text-sm rounded-lg shadow-sm transition-colors flex items-center gap-2"
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
