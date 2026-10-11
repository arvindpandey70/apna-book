import React, { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  Upload,
  Download,
  CheckCircle,
  Clock,
  FileSpreadsheet,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  BarChart2,
  PieChart,
  BookOpen,
  FileText,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import * as XLSX from "xlsx-js-style";
import Swal from "sweetalert2";
import { useAppContext } from "../../../context/AppContext";
import {
  type ReportType,
  REPORT_META_MAP,
  saveReportData,
  getReportData,
  downloadReportTemplate,
} from "../../../services/reportImportService";

interface SingleReportImportPageProps {
  reportType?: ReportType;
}

const REPORT_ICONS: Record<string, React.ReactNode> = {
  "26as": <ShieldCheck className="text-red-600 dark:text-red-400" size={28} />,
  "gstr1-vs-gstr3b": <BarChart2 className="text-red-600 dark:text-red-400" size={28} />,
  "gstr2a-vs-gstr2b": <PieChart className="text-red-600 dark:text-red-400" size={28} />,
  "books-vs-2a": <BookOpen className="text-red-600 dark:text-red-400" size={28} />,
  "books-vs-gstr1": <FileText className="text-red-600 dark:text-red-400" size={28} />,
  "books-vs-gstr3b": <FileText className="text-red-600 dark:text-red-400" size={28} />,
  "books-vs-2b": <BookOpen className="text-red-600 dark:text-red-400" size={28} />,
};

const SingleReportImportPage: React.FC<SingleReportImportPageProps> = ({
  reportType: propReportType,
}) => {
  const navigate = useNavigate();
  const params = useParams<{ reportType?: string }>();
  const { theme } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeReportType = (propReportType || params.reportType || "26as") as ReportType;
  const meta = REPORT_META_MAP[activeReportType] || REPORT_META_MAP["26as"];

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importedRows, setImportedRows] = useState<Record<string, any>[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [existingData, setExistingData] = useState<any>(null);

  useEffect(() => {
    const stored = getReportData(activeReportType);
    setExistingData(stored);
  }, [activeReportType]);

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
      const result = await saveReportData(activeReportType, importedRows);
      if (result.success) {
        setExistingData(getReportData(activeReportType));
        Swal.fire({
          icon: "success",
          title: "Import Successful!",
          text: `${meta.name} data imported successfully (${importedRows.length} rows). You can now view the generated report.`,
          showCancelButton: true,
          confirmButtonText: "View Generated Report",
          cancelButtonText: "Close",
          confirmButtonColor: "#DC2626",
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

  return (
    <div
      className={`pt-[56px] px-4 min-h-[calc(100vh-64px)] ${
        theme === "dark" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-800"
      }`}
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-2 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div className="flex items-center">
          <button
            onClick={() => navigate("/app/vouchers")}
            title="Back to Vouchers"
            className={`p-2 rounded-lg mr-3 transition-colors ${
              theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700 text-white border border-gray-700"
                : "bg-white hover:bg-gray-100 text-gray-700 border shadow-sm"
            }`}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider rounded-full bg-red-600 text-white shadow-sm flex items-center gap-1">
                <Clock size={12} className="animate-pulse" /> Pending Implementation / Coming Soon
              </span>
            </div>
            <h1 className="text-2xl font-bold flex items-center gap-2.5 text-gray-900 dark:text-white">
              {REPORT_ICONS[activeReportType]}
              {meta.name} - Data Import
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {meta.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadReportTemplate(activeReportType)}
            className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm"
          >
            <Download size={16} /> Download Excel Format
          </button>
          {existingData && existingData.rows && existingData.rows.length > 0 && (
            <button
              onClick={() => navigate(meta.reportPath)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            >
              View Generated Report <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Main Dedicated Import Card */}
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        {/* Red Banner / Coming Soon Notice */}
        <div
          className={`p-5 rounded-xl border-2 border-red-300 dark:border-red-900/80 ${
            theme === "dark" ? "bg-red-950/30 text-red-200" : "bg-red-50 text-red-900"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-300 shrink-0">
              <Clock size={24} className="animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base text-red-700 dark:text-red-400">
                {meta.name} - Pending Implementation / Work
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                This feature is currently in pending status. You can perform the data import/creation workflow below. Imported data will be linked and reflected on the report page at <span className="font-mono text-red-600 dark:text-red-400 font-semibold">{meta.reportPath}</span>.
              </p>
            </div>
          </div>
        </div>

        {/* Requirements Box */}
        <div
          className={`p-5 rounded-xl border ${
            theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
            Required Excel / CSV Columns for {meta.name}:
          </h4>
          <div className="flex flex-wrap gap-2">
            {meta.fields.map((field, idx) => (
              <span
                key={idx}
                className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-900 text-xs font-semibold text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700"
              >
                {field}
              </span>
            ))}
          </div>
        </div>

        {/* Upload Dropzone */}
        <div
          className={`p-6 sm:p-10 rounded-xl border-2 border-dashed text-center transition-all cursor-pointer ${
            dragActive
              ? "border-red-500 bg-red-50/50 dark:bg-red-950/30"
              : "border-gray-300 dark:border-gray-700 hover:border-red-500 dark:hover:border-red-500 bg-white dark:bg-gray-800 shadow-sm"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-12 w-12 mx-auto text-red-500 dark:text-red-400 mb-4" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Click to upload or drag & drop Excel / CSV file here
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Supports .xlsx, .xls, and .csv files up to 10MB
          </p>
          <button
            type="button"
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium text-xs sm:text-sm rounded-lg shadow-sm transition-colors"
          >
            Select File from Computer
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
          />
        </div>

        {/* Selected File Card */}
        {selectedFile && (
          <div className="p-4 bg-gray-100 dark:bg-gray-800 border rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileSpreadsheet className="h-7 w-7 text-green-600" />
              <div>
                <div className="text-sm font-bold text-gray-900 dark:text-white">
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
              className="text-xs text-red-600 hover:text-red-800 font-bold px-3 py-1"
            >
              Clear File
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="p-4 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded-xl flex items-center gap-3">
            <RefreshCw className="animate-spin" size={20} />
            <span className="text-sm font-medium">Processing file contents...</span>
          </div>
        )}

        {/* Data Preview Table */}
        {importedRows.length > 0 && (
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <CheckCircle className="text-green-500" size={18} />
                Preview File Rows ({importedRows.length})
              </h4>
              <button
                onClick={handleSaveData}
                disabled={isSaving}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-bold text-sm rounded-lg shadow-md transition-colors flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="animate-spin" size={16} /> Saving...
                  </>
                ) : (
                  <>
                    Save Data & Link to Report <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>

            <div
              className={`border rounded-xl overflow-x-auto max-h-96 ${
                theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 sticky top-0 border-b">
                  <tr>
                    <th className="px-3 py-2.5 font-bold">#</th>
                    {Object.keys(importedRows[0]).map((key) => (
                      <th key={key} className="px-3 py-2.5 font-bold whitespace-nowrap">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {importedRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                      <td className="px-3 py-2 text-gray-500 font-mono">{rIdx + 1}</td>
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

export default SingleReportImportPage;
