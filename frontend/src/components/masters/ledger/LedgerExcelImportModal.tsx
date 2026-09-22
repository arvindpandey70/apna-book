import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Upload, Download, X, CheckCircle2, AlertCircle, FileSpreadsheet, Trash2 } from "lucide-react";
import Swal from "sweetalert2";
import { useAppContext } from "../../../context/AppContext";
import { allSystemGroups as baseGroups } from "../../../constants/ledgerGroups";
import type { Ledger, LedgerGroup } from "../../../types";

interface LedgerExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingLedgers: Ledger[];
  ledgerGroups: LedgerGroup[];
}

interface ParsedLedgerRow {
  rowNum: number;
  name: string;
  groupId: number | null;
  groupName: string;
  openingBalance: number;
  balanceType: "debit" | "credit";
  gstNumber: string;
  panNumber: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  pinCode: string;
  isValid: boolean;
  error: string;
}

export const LedgerExcelImportModal: React.FC<LedgerExcelImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingLedgers,
  ledgerGroups,
}) => {
  const { theme } = useAppContext();
  const [previewData, setPreviewData] = useState<ParsedLedgerRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "Ledger Name": "Acme Traders",
        "Group Name": "Sundry Debtors",
        "Opening Balance": 15000,
        "Dr/Cr": "Dr",
        "GST Number": "27AAAAA0000A1Z5",
        "PAN Number": "AAAAA0000A",
        "Phone": "9876543210",
        "Email": "info@acmetraders.com",
        "Address": "123 Business Park",
        "State": "Maharashtra",
        "Pincode": "400001",
      },
      {
        "Ledger Name": "Global Supplies",
        "Group Name": "Sundry Creditors",
        "Opening Balance": 25000,
        "Dr/Cr": "Cr",
        "GST Number": "27BBBBB1111B2Z6",
        "PAN Number": "BBBBB1111B",
        "Phone": "9822001122",
        "Email": "sales@globalsupplies.com",
        "Address": "45 Industrial Area",
        "State": "Gujarat",
        "Pincode": "380001",
      },
      {
        "Ledger Name": "HDFC Bank A/c",
        "Group Name": "Bank Accounts",
        "Opening Balance": 100000,
        "Dr/Cr": "Dr",
        "GST Number": "",
        "PAN Number": "",
        "Phone": "02228889999",
        "Email": "support@hdfcbank.com",
        "Address": "Main Branch",
        "State": "Maharashtra",
        "Pincode": "400001",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws["!cols"] = [
      { wch: 25 },
      { wch: 20 },
      { wch: 16 },
      { wch: 8 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 25 },
      { wch: 30 },
      { wch: 15 },
      { wch: 10 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledgers");
    XLSX.writeFile(wb, "Ledger_Import_Template.xlsx");
  };

  const parseExcel = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

        if (!data || data.length === 0) {
          Swal.fire("Error", "The uploaded Excel file is empty", "error");
          setPreviewData([]);
          return;
        }

        const allGroups = [...baseGroups, ...ledgerGroups];

        const parsedRecords: ParsedLedgerRow[] = data.map((row: any, idx: number) => {
          const getVal = (keys: string[]) => {
            const key = Object.keys(row).find((k) =>
              keys.some((alias) => k.trim().toLowerCase() === alias.toLowerCase())
            );
            return key ? String(row[key]).trim() : "";
          };

          const name = getVal(["ledger name", "name", "ledger", "ledgername"]);
          const groupStr = getVal(["group name", "group", "under group", "under", "groupname"]);
          const balanceStr = getVal(["opening balance", "balance", "opening_balance", "amount"]);
          const drCrStr = getVal(["dr/cr", "dr_cr", "balance type", "debit/credit", "type", "drcr"]);
          const gstNumber = getVal(["gst number", "gstin", "gst_number", "gst"]);
          const panNumber = getVal(["pan number", "pan_number", "pan"]);
          const phone = getVal(["phone", "mobile", "contact", "phone number"]);
          const email = getVal(["email", "email id", "emailid"]);
          const address = getVal(["address"]);
          const state = getVal(["state"]);
          const pinCode = getVal(["pincode", "pin code", "pin_code", "zip"]);

          // Match Group Name
          let matchedGroup = allGroups.find(
            (g) => g.name.trim().toLowerCase() === groupStr.toLowerCase()
          );

          if (!matchedGroup && groupStr) {
            matchedGroup = allGroups.find(
              (g) =>
                g.name.trim().toLowerCase().includes(groupStr.toLowerCase()) ||
                groupStr.toLowerCase().includes(g.name.trim().toLowerCase())
            );
          }

          const groupId = matchedGroup ? matchedGroup.id : null;
          const groupName = matchedGroup ? matchedGroup.name : groupStr || "Unmapped";

          const openingBalance = parseFloat(balanceStr) || 0;

          let hasValidDrCr = false;
          let balanceType: "debit" | "credit" = "debit";

          if (drCrStr) {
            const normalized = drCrStr.trim().toLowerCase();
            if (normalized.includes("dr") || normalized.includes("debit")) {
              balanceType = "debit";
              hasValidDrCr = true;
            } else if (normalized.includes("cr") || normalized.includes("credit")) {
              balanceType = "credit";
              hasValidDrCr = true;
            }
          }

          let error = "";
          if (!name) {
            error = "Name is required";
          } else if (!groupStr) {
            error = "Group Name is required";
          } else if (!groupId) {
            error = `Group "${groupStr}" not found`;
          } else if (!drCrStr) {
            error = "DR/CR is required";
          } else if (!hasValidDrCr) {
            error = `Invalid DR/CR "${drCrStr}" (must be Dr or Cr)`;
          } else {
            const isDuplicate = existingLedgers.some(
              (l) => l.name.trim().toLowerCase() === name.toLowerCase()
            );
            if (isDuplicate) {
              error = "Ledger name already exists";
            }
          }

          return {
            rowNum: idx + 2,
            name,
            groupId,
            groupName,
            openingBalance,
            balanceType,
            gstNumber,
            panNumber,
            phone,
            email,
            address,
            state,
            pinCode,
            isValid: !error,
            error,
          };
        });

        setPreviewData(parsedRecords);
      } catch (err) {
        console.error("Excel parse error:", err);
        Swal.fire("Error", "Failed to parse Excel file. Please upload a valid .xlsx or .xls file.", "error");
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseExcel(file);
    }
  };

  const handleRemoveRow = (index: number) => {
    setPreviewData((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    const validRecords = previewData.filter((r) => r.isValid);
    if (validRecords.length === 0) {
      Swal.fire("No Valid Data", "There are no valid records to import.", "warning");
      return;
    }

    setLoading(true);
    try {
      const companyId = localStorage.getItem("company_id");
      const ownerType = localStorage.getItem("supplier");
      const userType = localStorage.getItem("userType");

      let fetchOwnerType = ownerType;
      let fetchOwnerId =
        ownerType === "employee"
          ? localStorage.getItem("employee_id")
          : localStorage.getItem("user_id");

      if (userType === "ca_employee") {
        fetchOwnerType = "employee";
        fetchOwnerId = localStorage.getItem("employee_id");
      }

      const payload = {
        companyId,
        ownerType: fetchOwnerType,
        ownerId: fetchOwnerId,
        ledgers: validRecords.map((r) => ({
          name: r.name,
          groupId: r.groupId,
          openingBalance: r.openingBalance,
          balanceType: r.balanceType,
          address: r.address,
          email: r.email,
          phone: r.phone,
          gstNumber: r.gstNumber,
          panNumber: r.panNumber,
          state: r.state,
          pinCode: r.pinCode,
        })),
      };

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/ledger/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (res.ok) {
        Swal.fire({
          icon: "success",
          title: "Import Successful",
          text: `Successfully imported ${validRecords.length} ledger(s)!`,
          timer: 2000,
          showConfirmButton: false,
        });
        onSuccess();
        onClose();
      } else {
        Swal.fire("Import Failed", result.message || "Failed to import ledgers", "error");
      }
    } catch (err) {
      console.error("Import error:", err);
      Swal.fire("Error", "Failed to connect to server during import", "error");
    } finally {
      setLoading(false);
    }
  };

  const validCount = previewData.filter((r) => r.isValid).length;
  const invalidCount = previewData.length - validCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div
        className={`w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden ${
          theme === "dark" ? "bg-gray-800 text-gray-100 border border-gray-700" : "bg-white text-gray-800"
        }`}
      >
        {/* Modal Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            theme === "dark" ? "border-gray-700 bg-gray-900/50" : "border-gray-200 bg-gray-50"
          }`}
        >
          <div className="flex items-center space-x-3">
            <FileSpreadsheet className="w-6 h-6 text-emerald-500" />
            <h2 className="text-xl font-bold">Import Ledgers from Excel</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              theme === "dark" ? "hover:bg-gray-700 text-gray-400 hover:text-gray-200" : "hover:bg-gray-200 text-gray-500 hover:text-gray-700"
            }`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Action Bar: Download Sample & Upload Button */}
          <div
            className={`p-4 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4 border ${
              theme === "dark" ? "bg-gray-900/40 border-gray-700" : "bg-emerald-50/50 border-emerald-200"
            }`}
          >
            <div className="space-y-1 text-center sm:text-left">
              <p className="font-semibold text-sm">Need an Excel format template?</p>
              <p className="text-xs opacity-80">
                <span className="font-semibold text-amber-600 dark:text-amber-400">Mandatory:</span> Name, Group Name, Dr/Cr. <span className="opacity-75">All other fields (Opening Balance, GSTIN, etc.) are optional.</span>
              </p>
            </div>
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shrink-0 shadow-xs"
            >
              <Download size={16} className="mr-2" />
              Download Template (.xlsx)
            </button>
          </div>

          {/* File Upload Box */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              previewData.length > 0
                ? theme === "dark"
                  ? "border-emerald-500/50 bg-emerald-950/10"
                  : "border-emerald-400 bg-emerald-50/30"
                : theme === "dark"
                ? "border-gray-600 hover:border-emerald-500 bg-gray-900/30"
                : "border-gray-300 hover:border-emerald-500 bg-gray-50"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />
            <Upload className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
            <p className="text-base font-semibold">
              {fileName ? fileName : "Click or drag & drop Excel file here"}
            </p>
            <p className="text-xs opacity-60 mt-1">Supports .xlsx, .xls, .csv</p>
          </div>

          {/* Preview Table */}
          {previewData.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-md flex items-center gap-2">
                  Preview Data ({previewData.length} rows)
                </h3>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="flex items-center gap-1 text-emerald-500">
                    <CheckCircle2 size={14} /> {validCount} Valid
                  </span>
                  {invalidCount > 0 && (
                    <span className="flex items-center gap-1 text-red-500">
                      <AlertCircle size={14} /> {invalidCount} Invalid/Duplicate
                    </span>
                  )}
                </div>
              </div>

              <div
                className={`overflow-x-auto rounded-lg border max-h-72 ${
                  theme === "dark" ? "border-gray-700" : "border-gray-200"
                }`}
              >
                <table className="w-full text-xs text-left border-collapse">
                  <thead
                    className={`sticky top-0 ${
                      theme === "dark" ? "bg-gray-900 text-gray-300" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    <tr>
                      <th className="p-2.5">Row</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Ledger Name <span className="text-red-500">*</span></th>
                      <th className="p-2.5">Under Group <span className="text-red-500">*</span></th>
                      <th className="p-2.5 text-right">Opening Bal</th>
                      <th className="p-2.5">Dr/Cr <span className="text-red-500">*</span></th>
                      <th className="p-2.5">GSTIN</th>
                      <th className="p-2.5">State</th>
                      <th className="p-2.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {previewData.map((row, idx) => (
                      <tr
                        key={idx}
                        className={`${
                          !row.isValid
                            ? theme === "dark"
                              ? "bg-red-950/30"
                              : "bg-red-50"
                            : theme === "dark"
                            ? "hover:bg-gray-750"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <td className="p-2.5 font-mono">{row.rowNum}</td>
                        <td className="p-2.5">
                          {row.isValid ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                              <CheckCircle2 size={12} /> Valid
                            </span>
                          ) : (
                            <span
                              title={row.error}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
                            >
                              <AlertCircle size={12} /> {row.error}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 font-semibold">{row.name || "—"}</td>
                        <td className="p-2.5">{row.groupName}</td>
                        <td className="p-2.5 text-right font-mono">
                          {row.openingBalance.toLocaleString("en-IN")}
                        </td>
                        <td className="p-2.5 uppercase font-medium">{row.balanceType}</td>
                        <td className="p-2.5 font-mono">{row.gstNumber || "—"}</td>
                        <td className="p-2.5">{row.state || "—"}</td>
                        <td className="p-2.5 text-center">
                          <button
                            onClick={() => handleRemoveRow(idx)}
                            className="p-1 hover:text-red-500 rounded transition-colors"
                            title="Remove row"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-t ${
            theme === "dark" ? "border-gray-700 bg-gray-900/50" : "border-gray-200 bg-gray-50"
          }`}
        >
          <p className="text-xs opacity-70">
            {previewData.length > 0
              ? `Only valid records (${validCount}) will be imported.`
              : "Upload an Excel file to preview data."}
          </p>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className={`px-4 py-2 text-sm rounded-lg border font-medium transition-colors ${
                theme === "dark"
                  ? "border-gray-600 hover:bg-gray-700 text-gray-300"
                  : "border-gray-300 hover:bg-gray-100 text-gray-700"
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={validCount === 0 || loading}
              className="flex items-center px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors shadow-xs"
            >
              {loading ? "Importing..." : `Import (${validCount}) Ledgers`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
