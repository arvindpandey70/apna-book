import React, { useState } from "react";
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, RefreshCw, BarChart2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../../context/AppContext";
import { useCompany } from "../../../context/CompanyContext";
import { saveGstr1ToDatabase } from "../../../services/gstr1ImportService";
import type { GstB2bInvoiceRow, GstB2cSummaryRow, ParsedGstr1Data } from "../../reports/gst-scanner/GstJsonScanner";

const Gstr1VsGstr3bImportPage: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useAppContext();
  const { activeCompanyId, companyInfo } = useCompany();

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const targetCompanyId = activeCompanyId || companyInfo?.id || localStorage.getItem("company_id") || "1";

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const parsedInvoices: GstB2bInvoiceRow[] = [];
      const parsedB2c: GstB2cSummaryRow[] = [];

      const b2bList = Array.isArray(json?.b2b) ? json.b2b : Array.isArray(json?.data?.b2b) ? json.data.b2b : [];
      let sno = 1;
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
            sno: sno++,
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

      await saveGstr1ToDatabase(parsedPayload, targetCompanyId);
      setSuccessMessage(`Successfully imported ${parsedInvoices.length} B2B invoices and ${parsedB2c.length} B2C summaries from ${file.name}.`);
    } catch (err: any) {
      console.error("GSTR-1 upload failed:", err);
      setErrorMessage(err?.message || "Failed to process GSTR-1 JSON file");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main className={`pt-[56px] px-4 min-h-[calc(100vh-64px)] pb-12 ${theme === "dark" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-800"}`}>
      <section className="max-w-4xl mx-auto py-8">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate("/app/reports/gstr1-vs-gstr3b")}
            className={`p-2 rounded-lg border transition-colors ${
              theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
                : "bg-white hover:bg-gray-100 text-gray-700 border-gray-300 shadow-xs"
            }`}
            aria-label="Back to GSTR-1 vs GSTR-3B Report"
          >
            <ArrowLeft size={20} />
          </button>
          <button
            onClick={() => navigate("/app/reports/gstr1-vs-gstr3b")}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
          >
            <BarChart2 size={16} />
            View GSTR-1 vs GSTR-3B Report
          </button>
        </div>

        <div className="p-8 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
          <div className="text-center max-w-xl mx-auto mb-8">
            <div className="inline-flex p-3 rounded-2xl bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 mb-3">
              <Upload size={32} />
            </div>
            <h1 className="text-2xl font-bold">Import GSTR-1 Return Data</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Upload the official offline GSTR-1 JSON file downloaded from the GST Portal to update all outward supply invoices.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-900 rounded-xl text-xs text-green-700 dark:text-green-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} />
                <span>{successMessage}</span>
              </div>
              <button
                onClick={() => navigate("/app/reports/gstr1-vs-gstr3b")}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-xs"
              >
                Go to Report &rarr;
              </button>
            </div>
          )}

          <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-10 text-center hover:border-red-500 transition-colors">
            <FileSpreadsheet className="mx-auto mb-4 text-red-500" size={54} />
            <p className="font-bold text-base mb-1">Select GSTR-1 Return File (JSON)</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
              File format: returns_*.json containing B2B invoices and B2C summaries
            </p>
            <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm transition-colors">
              <Upload size={16} />
              Select File & Import
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
              />
            </label>
            {isUploading && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-red-600 font-semibold">
                <RefreshCw size={14} className="animate-spin" />
                Processing and saving GSTR-1 return data...
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
};

export default Gstr1VsGstr3bImportPage;
