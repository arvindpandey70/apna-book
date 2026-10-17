import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Download, Settings, X, Loader2 } from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import { useCompany } from "../../context/CompanyContext";
import { useProfitLossSync } from "../../hooks/useProfitLossSync";
import { systemPrimaryGroups as trialGroups, allSystemGroups } from "../../constants/ledgerGroups";
import domtoimage from "dom-to-image-more";
import jsPDF from "jspdf";

interface Ledger {
  id: number;
  name: string;
  groupId: number;
  group_id: number;
  openingBalance: number;
  balanceType: "debit" | "credit";
  groupName: string;
  groupType: string | null;
}

interface LedgerGroup {
  id: number;
  name: string;
  type: string | null;
  parent: number | null;
}

const TrialBalance: React.FC = () => {
  const { theme } = useAppContext();
  const navigate = useNavigate();

  // Sync Profit & Loss Data headlessly in background
  const { closingStock } = useProfitLossSync();

  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [ledgerGroups, setLedgerGroups] = useState<LedgerGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDetailedView, setIsDetailedView] = useState(false);
  const [showOpening, setShowOpening] = useState(false);
  const [showDebit, setShowDebit] = useState(false);
  const [showCredit, setShowCredit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [debitCreditData, setDebitCreditData] = useState<
    Record<number, { debit: number; credit: number }>
  >({});

  const companyId = localStorage.getItem("company_id") || localStorage.getItem("active_company_id") || "";
  const rawOwnerType = localStorage.getItem("supplier") || "";
  const employeeId = localStorage.getItem("employee_id");
  const userId = localStorage.getItem("user_id") || "";

  const ownerType = (rawOwnerType === "ca" || rawOwnerType === "ca_employee" || rawOwnerType === "new_ca" || rawOwnerType === "employee" || employeeId)
    ? "employee"
    : (rawOwnerType || "employee");

  const ownerId = (rawOwnerType === "ca" || rawOwnerType === "ca_employee" || rawOwnerType === "new_ca" || rawOwnerType === "employee" || employeeId)
    ? (employeeId || userId)
    : userId;

  const { companyInfo, companies, activeCompanyId } = useCompany();
  const reportRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const activeCompany = useMemo(() => {
    return companies?.find(
      (c) => String(c.id) === String(activeCompanyId || companyId)
    );
  }, [companies, activeCompanyId, companyId]);

  const companyName =
    companyInfo?.name ||
    (companyInfo as any)?.companyName ||
    (companyInfo as any)?.company_name ||
    activeCompany?.name ||
    "ApnoTax solutions";

  const companyAddress =
    companyInfo?.address ||
    activeCompany?.address ||
    "vigyan vihar colony near hawai adda dhanbad";

  const companyCityStatePin = [
    companyInfo?.state || activeCompany?.state,
    companyInfo?.pin || activeCompany?.pin,
  ]
    .filter(Boolean)
    .join(" - ");

  const companyGst =
    companyInfo?.gstNumber ||
    (companyInfo as any)?.gst_number ||
    activeCompany?.gstNumber ||
    "";

  const companyPhone =
    companyInfo?.phoneNumber ||
    (companyInfo as any)?.phone_number ||
    activeCompany?.phoneNumber ||
    "";

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current || isDownloading) return;
    setIsDownloading(true);

    const element = reportRef.current;
    const width = element.offsetWidth || 1200;
    const scale = 2;

    // Create an off-screen wrapper so the screen NEVER shows the company header
    const wrapper = document.createElement("div");
    wrapper.style.cssText = `position: fixed; left: -99999px; top: 0; width: ${width}px; z-index: -9999; pointer-events: none; opacity: 1;`;

    try {
      const clone = element.cloneNode(true) as HTMLElement;
      clone.style.width = `${width}px`;

      // Enable the company header ONLY on the off-screen clone
      const cloneHeader = clone.querySelector("#trial-balance-company-header") as HTMLElement;
      if (cloneHeader) {
        cloneHeader.style.display = "block";
        cloneHeader.classList.remove("hidden");
      }

      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      const height = clone.offsetHeight;

      const imgData = await domtoimage.toPng(clone, {
        bgcolor: theme === "dark" ? "#1f2937" : "#ffffff",
        width: width * scale,
        height: height * scale,
        style: {
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: `${width}px`,
          height: `${height}px`,
        },
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pdfWidth;
      const imgHeight = (height * pdfWidth) / width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 3) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const sanitizedName = (companyName || "Company").replace(/[^a-zA-Z0-9]/g, "_");
      pdf.save(`Trial_Balance_${sanitizedName}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("Failed to download PDF. Please try again.");
    } finally {
      if (wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) return;
      setLoading(true);
      setError(null);
      try {
        const url = `${import.meta.env.VITE_API_URL}/api/balance-sheet?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load data");
        const data = await res.json();

        const normalizedLedgers = data.ledgers.map((l: any) => ({
          id: l.id,
          name: l.name,
          groupId: Number(l.group_id || l.groupId),
          group_id: Number(l.group_id || l.groupId),
          openingBalance: parseFloat(l.opening_balance || l.openingBalance) || 0,
          closingBalance: parseFloat(l.closing_balance || l.closingBalance) || 0,
          balanceType: l.balance_type || l.balanceType,
          groupName: l.group_name || l.groupName,
          groupType: l.group_type || l.groupType,
        }));
        setLedgers(normalizedLedgers);

        const normalizedGroups = data.ledgerGroups.map((g: any) => ({
          ...g,
          parent: g.parent ? Number(g.parent) : null
        }));

        const systemGroupsMapped = allSystemGroups.map(g => ({
          id: g.id,
          name: g.name,
          parent: g.parent || null,
          type: g.nature?.toLowerCase().replace(' ', '-') || null
        }));

        const combinedGroups = [...systemGroupsMapped, ...normalizedGroups];
        const uniqueGroups = combinedGroups.reduce((acc: LedgerGroup[], current) => {
          if (!acc.find(g => g.id === current.id)) {
            acc.push(current);
          }
          return acc;
        }, []);

        setLedgerGroups(uniqueGroups);
      } catch (err: any) {
        setError(err.message || "Unknown error occurred");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [companyId, ownerType, ownerId]);



  useEffect(() => {
    const fetchDebitCreditData = async () => {
      if (!companyId || !ownerType || !ownerId || ledgers.length === 0) return;

      try {
        const ledgerIds = ledgers.map((l) => l.id).join(",");
        const url = `${import.meta.env.VITE_API_URL}/api/group?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&ledgerIds=${ledgerIds}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load debit/credit data");
        const data = await res.json();
        if (data.success && data.data) setDebitCreditData(data.data);
      } catch (err) {
        console.error("Error fetching debit/credit data:", err);
      }
    };
    fetchDebitCreditData();
  }, [ledgers, companyId, ownerType, ownerId]);



  const calculateGroupTotals = (groupId: number) => {
    const findSubGroups = (id: number): number[] => {
      let results = [id];
      ledgerGroups.filter(g => Number(g.parent) === Number(id)).forEach(c => {
        results = [...results, ...findSubGroups(Number(c.id))];
      });
      return results;
    };
    const allGroupIds = findSubGroups(groupId);
    const recursiveLedgers = ledgers.filter(l => allGroupIds.includes(Number(l.groupId)));

    let totalOpDr = 0;
    let totalOpCr = 0;
    let totalTransDr = 0;
    let totalTransCr = 0;

    recursiveLedgers.forEach(ledger => {
      // Opening
      const op = Number(ledger.openingBalance) || 0;
      if (ledger.balanceType === 'debit') totalOpDr += op;
      else totalOpCr += op;

      // Transactions
      totalTransDr += Number(debitCreditData[ledger.id]?.debit) || 0;
      totalTransCr += Number(debitCreditData[ledger.id]?.credit) || 0;
    });

    const netOpening = totalOpDr - totalOpCr;
    let netClosing = (totalOpDr + totalTransDr) - (totalOpCr + totalTransCr);

    // Sync stock-in-hand
    const isStockGroup = groupId === -108 || ledgerGroups.find(g => g.id === groupId)?.name?.toLowerCase() === "stock-in-hand";
    if (isStockGroup) {
      const stockManualClosing = recursiveLedgers.reduce((sum, l) => {
        const rawClosing = parseFloat(l.closingBalance || l.closing_balance);
        const rawOpening = parseFloat(l.openingBalance || l.opening_balance) || 0;
        const val = !isNaN(rawClosing) && rawClosing !== 0 ? rawClosing : rawOpening;
        return sum + (l.balanceType === 'credit' ? -val : val);
      }, 0);
      netClosing = stockManualClosing !== 0 ? stockManualClosing : closingStock;
      return {
        opening: 0,
        debit: 0,
        credit: 0,
        closing: netClosing
      };
    }

    return {
      opening: netOpening, // +ve is Dr
      debit: totalTransDr,
      credit: totalTransCr,
      closing: netClosing // +ve is Dr
    };
  };



  const renderGroupRows = (groupId: number, level: number = 0) => {
    const subGroups = ledgerGroups.filter(g => Number(g.parent) === Number(groupId));
    const directLedgers = ledgers.filter(l => Number(l.groupId) === groupId);

    return (
      <>
        {subGroups.map(group => {
          const totals = calculateGroupTotals(group.id);
          const hasBalance = totals.opening !== 0 || totals.debit !== 0 || totals.credit !== 0 || totals.closing !== 0;
          if (!hasBalance && !isDetailedView) return null;

          return (
            <React.Fragment key={group.id}>
              <tr
                className={`cursor-pointer text-sm transition-all duration-150 ${theme === 'dark' ? 'hover:bg-blue-600 hover:text-white' : 'hover:bg-blue-600 hover:text-white font-bold'}`}
                onClick={() => navigate(`/app/reports/sub-group-summary/${group.id}`)}
              >
                <td className="py-2 px-4" style={{ paddingLeft: `${(level + 1) * 1.5}rem` }}>
                  <span className="italic font-semibold">{group.name}</span>
                </td>
                {showOpening && (
                  <td className="py-2 px-4 text-right font-mono text-xs">
                    {totals.opening !== 0 ? `${Math.abs(totals.opening).toLocaleString()} ${totals.opening > 0 ? "Dr" : "Cr"}` : ""}
                  </td>
                )}
                {showDebit && (
                  <td className="py-2 px-4 text-right font-mono text-xs">{totals.debit > 0 ? totals.debit.toLocaleString() : ""}</td>
                )}
                {showCredit && (
                  <td className="py-2 px-4 text-right font-mono text-xs">{totals.credit > 0 ? totals.credit.toLocaleString() : ""}</td>
                )}
                <td className="py-2 px-4 text-right font-mono text-xs">
                  {totals.closing !== 0 ? `${Math.abs(totals.closing).toLocaleString()} ${totals.closing > 0 ? "Dr" : "Cr"}` : ""}
                </td>
              </tr>
              {isDetailedView && renderGroupRows(group.id, level + 1)}
            </React.Fragment>
          );
        })}

        {directLedgers.map(ledger => {
          // Opening
          const op = Number(ledger.openingBalance) || 0;
          const opDr = ledger.balanceType === 'debit' ? op : 0;
          const opCr = ledger.balanceType === 'credit' ? op : 0;
          const netOp = opDr - opCr;

          // Trans
          const d = Number(debitCreditData[ledger.id]?.debit) || 0;
          const c = Number(debitCreditData[ledger.id]?.credit) || 0;

          // Closing
          const netClose = (opDr + d) - (opCr + c);

          if (netOp === 0 && d === 0 && c === 0 && netClose === 0 && !isDetailedView) return null;

          return (
            <tr
              key={ledger.id}
              className={`cursor-pointer text-xs font-semibold transition-all duration-150 ${theme === 'dark' ? 'hover:bg-blue-600 hover:text-white' : 'hover:bg-blue-600 hover:text-white font-bold'}`}
              onClick={() => navigate(`/app/reports/ledger/${ledger.id}`)}
            >
              <td className="py-1 px-4" style={{ paddingLeft: `${(level + 1) * 1.5}rem` }}>
                {ledger.name}
              </td>
              {showOpening && (
                <td className="py-1 px-4 text-right font-mono">
                  {netOp !== 0 ? `${Math.abs(netOp).toLocaleString()} ${netOp > 0 ? "Dr" : "Cr"}` : ""}
                </td>
              )}
              {showDebit && (
                <td className="py-1 px-4 text-right font-mono">{d > 0 ? d.toLocaleString() : ""}</td>
              )}
              {showCredit && (
                <td className="py-1 px-4 text-right font-mono">{c > 0 ? c.toLocaleString() : ""}</td>
              )}
              <td className="py-1 px-4 text-right font-mono">
                {netClose !== 0 ? `${Math.abs(netClose).toLocaleString()} ${netClose > 0 ? "Dr" : "Cr"}` : ""}
              </td>
            </tr>
          );
        })}
      </>
    );
  };

  const grandTotals = useMemo(() => {
    let d = 0;
    let c = 0;
    let opDr = 0;
    let opCr = 0;
    let clDr = 0;
    let clCr = 0;

    trialGroups.forEach((tg) => {
      const totals = calculateGroupTotals(tg.id);
      d += totals.debit;
      c += totals.credit;
      if (totals.opening > 0) opDr += totals.opening; else opCr += Math.abs(totals.opening);
      if (totals.closing > 0) clDr += totals.closing; else clCr += Math.abs(totals.closing);
    });
    return { debit: d, credit: c, openingDr: opDr, openingCr: opCr, closingDr: clDr, closingCr: clCr };
  }, [ledgers, debitCreditData, trialGroups, closingStock]);



  return (
    <div className="pt-[56px] px-4">
      <style>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background-color: #ffffff !important;
            color: #000000 !important;
          }
          .print\\:hidden, button, nav, header {
            display: none !important;
          }
          .print\\:block {
            display: block !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>

      <div className="flex items-center mb-6 print:hidden">
        <button
          onClick={() => navigate("/app/reports")}
          className={`mr-4 p-2 rounded-full ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">Trial Balance</h1>
        <div className="ml-auto relative">
          <div className="flex space-x-2">
            <button
              onClick={() => setIsDetailedView(!isDetailedView)}
              className={`p-2 rounded-md transition-all ${isDetailedView ? "bg-indigo-600 text-white shadow-lg" : theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}
            >
              <Settings size={18} className={isDetailedView ? "animate-spin-slow" : ""} />
            </button>
            <button
              title="Print"
              type="button"
              onClick={handlePrint}
              className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}
            >
              <Printer size={18} />
            </button>
            <button
              title="Download"
              type="button"
              disabled={isDownloading}
              onClick={handleDownloadPDF}
              className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"} ${isDownloading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {isDownloading ? (
                <Loader2 size={18} className="animate-spin text-blue-500" />
              ) : (
                <Download size={18} />
              )}
            </button>
          </div>

          {isDetailedView && (
            <div className={`absolute right-0 mt-2 w-48 p-3 rounded bg-white shadow-lg ${theme === 'dark' ? 'bg-gray-800 text-white' : ''}`}>
              <div className="text-sm font-semibold mb-2">Show Columns</div>
              <label className="flex items-center justify-between mb-2">
                <span>Opening</span>
                <input type="checkbox" checked={showOpening} onChange={(e) => setShowOpening(e.target.checked)} />
              </label>
              <label className="flex items-center justify-between mb-2">
                <span>Debit</span>
                <input type="checkbox" checked={showDebit} onChange={(e) => setShowDebit(e.target.checked)} />
              </label>
              <label className="flex items-center justify-between mb-2">
                <span>Credit</span>
                <input type="checkbox" checked={showCredit} onChange={(e) => setShowCredit(e.target.checked)} />
              </label>
              <hr className="my-2 border-t" />
              <label className="flex items-center justify-between">
                <span>Show Details</span>
                <input type="checkbox" checked={isDetailedView} onChange={(e) => setIsDetailedView(e.target.checked)} />
              </label>
            </div>
          )}
        </div>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div ref={reportRef} id="trial-balance-report-area" className="w-full">
          {/* Company Details Header - Only visible on Print & Download */}
          <div
            id="trial-balance-company-header"
            className={`hidden print:block mb-6 p-6 rounded-lg text-center ${
              theme === "dark" ? "bg-gray-800" : "bg-white shadow"
            }`}
          >
            <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wide text-gray-900 dark:text-gray-100">
              {companyName}
            </h1>
            {companyAddress && (
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-line font-medium">
                {companyAddress}
                {companyCityStatePin ? `, ${companyCityStatePin}` : ""}
              </p>
            )}
            {(companyGst || companyPhone) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {companyGst && <span>GSTIN: {companyGst}</span>}
                {companyGst && companyPhone && <span className="mx-2">•</span>}
                {companyPhone && <span>Phone: {companyPhone}</span>}
              </p>
            )}
            <hr
              className="my-4 border-t-2 border-gray-300 dark:border-gray-600"
              style={{ borderTop: "2px solid #cbd5e1" }}
            />
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200">
              Trial Balance
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              As on {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          </div>

          <div className={`p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"}`}>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-400 font-bold text-sm">
                <th className="py-3 px-4">Particulars</th>
                {showOpening && <th className="py-3 px-4 text-right">Opening Balance</th>}
                {showDebit && <th className="py-3 px-4 text-right">Debit</th>}
                {showCredit && <th className="py-3 px-4 text-right">Credit</th>}
                <th className="py-3 px-4 text-right">Closing Balance</th>
              </tr>
            </thead>
            <tbody>
              {trialGroups.map(tg => {
                const alwaysShowGroups = [
                  "Capital Account",
                  "Loan(Liability)",
                  "Current Liabilities",
                  "Current Assets",
                  "Sales Accounts",
                  "Purchase Accounts",
                  "Indirect Income",
                  "Indirect Expenses"
                ];
                const isAlwaysShow = alwaysShowGroups.includes(tg.name);
                
                const totals = calculateGroupTotals(tg.id);
                if (totals.opening === 0 && totals.debit === 0 && totals.credit === 0 && totals.closing === 0 && !isDetailedView && !isAlwaysShow) return null;

                return (
                  <React.Fragment key={tg.id}>
                    <tr
                      className={`border-b border-gray-300 font-semibold cursor-pointer transition-all duration-150 group ${theme === 'dark' ? 'hover:bg-blue-600 hover:text-white' : 'hover:bg-blue-600 hover:text-white font-bold'}`}
                      onClick={() => navigate(`/app/reports/sub-group-summary/${tg.id}`)}
                    >
                      <td className="py-3 px-4 text-blue-600 group-hover:text-white">{tg.name}</td>
                      {showOpening && (
                        <td className="py-3 px-4 text-right font-mono">
                          {totals.opening !== 0 ? `${Math.abs(totals.opening).toLocaleString()} ${totals.opening > 0 ? "Dr" : "Cr"}` : (isAlwaysShow ? "0" : "")}
                        </td>
                      )}
                      {showDebit && (
                        <td className="py-3 px-4 text-right font-mono">{totals.debit > 0 ? totals.debit.toLocaleString() : (isAlwaysShow ? "0" : "")}</td>
                      )}
                      {showCredit && (
                        <td className="py-3 px-4 text-right font-mono">{totals.credit > 0 ? totals.credit.toLocaleString() : (isAlwaysShow ? "0" : "")}</td>
                      )}
                      <td className="py-3 px-4 text-right font-mono">
                        {totals.closing !== 0 ? `${Math.abs(totals.closing).toLocaleString()} ${totals.closing > 0 ? "Dr" : "Cr"}` : (isAlwaysShow ? "0" : "")}
                      </td>
                    </tr>
                    {isDetailedView && renderGroupRows(tg.id)}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className={`font-bold text-lg border-t-2 border-gray-400 cursor-pointer transition-all duration-150 ${theme === 'dark' ? 'hover:bg-blue-600 hover:text-white' : 'hover:bg-blue-600 hover:text-white'}`} onClick={() => setIsDetailedView(true)}>
                <td className="py-3 px-4 font-bold">Grand Total</td>
                {showOpening && (
                  <td className="py-3 px-4 text-right text-indigo-600 font-mono text-sm">
                    {grandTotals.openingDr > 0 || grandTotals.openingCr > 0 ? (
                      <>
                        {grandTotals.openingDr > grandTotals.openingCr
                          ? `${(grandTotals.openingDr - grandTotals.openingCr).toLocaleString()} Dr`
                          : `${(grandTotals.openingCr - grandTotals.openingDr).toLocaleString()} Cr`}
                      </>
                    ) : "-"}
                  </td>
                )}
                {showDebit && (
                  <td className="py-3 px-4 text-right text-indigo-600 font-mono">{grandTotals.debit.toLocaleString()}</td>
                )}
                {showCredit && (
                  <td className="py-3 px-4 text-right text-indigo-600 font-mono">{grandTotals.credit.toLocaleString()}</td>
                )}
                <td className="py-3 px-4 text-right text-indigo-600 font-mono text-sm">
                  {grandTotals.closingDr > 0 || grandTotals.closingCr > 0 ? (
                    <>
                      {grandTotals.closingDr > grandTotals.closingCr
                        ? `${(grandTotals.closingDr - grandTotals.closingCr).toLocaleString()} Dr`
                        : `${(grandTotals.closingCr - grandTotals.closingDr).toLocaleString()} Cr`}
                    </>
                  ) : "-"}
                </td>
              </tr>
              <tr 
                className={`font-bold border-t-2 border-red-300 transition-opacity ${theme === 'dark' ? 'bg-red-900/20 text-red-400' : 'bg-red-50 text-red-600'}`}
              >
                <td className="py-4 px-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] uppercase tracking-wide">Difference</span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${theme === 'dark' ? 'bg-red-800/50 text-red-200' : 'bg-red-200/60 text-red-800'}`}>
                      Total Dr: {grandTotals.closingDr.toLocaleString()} &nbsp;|&nbsp; Total Cr: {grandTotals.closingCr.toLocaleString()}
                    </span>
                  </div>
                </td>
                {showOpening && (
                  <td className="py-4 px-4 text-right font-mono text-sm">
                    {Math.abs(grandTotals.openingDr - grandTotals.openingCr).toLocaleString()} {grandTotals.openingDr > grandTotals.openingCr ? "Dr" : grandTotals.openingDr < grandTotals.openingCr ? "Cr" : ""}
                  </td>
                )}
                {showDebit && (
                  <td className="py-4 px-4 text-right font-mono">
                    {Math.abs(grandTotals.debit - grandTotals.credit).toLocaleString()}
                  </td>
                )}
                {showCredit && (
                  <td className="py-4 px-4 text-right font-mono">
                    {Math.abs(grandTotals.debit - grandTotals.credit).toLocaleString()}
                  </td>
                )}
                <td className="py-4 px-4 text-right font-mono text-[15px]">
                  {Math.abs(grandTotals.closingDr - grandTotals.closingCr).toLocaleString()} {grandTotals.closingDr > grandTotals.closingCr ? "Dr" : grandTotals.closingDr < grandTotals.closingCr ? "Cr" : ""}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        </div>
      )}


    </div>
  );
};

export default TrialBalance;
