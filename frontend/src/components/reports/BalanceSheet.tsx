import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";
import { useCompany } from "../../context/CompanyContext";
import { ArrowLeft, Printer, Download, Settings, Loader2 } from "lucide-react";
import { useProfitLossSync } from "../../hooks/useProfitLossSync";
import { allSystemGroups } from "../../constants/ledgerGroups";
import domtoimage from "dom-to-image-more";
import jsPDF from "jspdf";

// Interfaces copied from your structure
interface Ledger {
  id: number;
  name: string;
  groupId: number;
  openingBalance: number;
  balanceType: "debit" | "credit";
  closingBalance: number;
  groupName: string;
  groupType: string | null;
}

interface LedgerGroup {
  id: number;
  name: string;
  type: string | null;
  parent: number | null;
}

interface BalanceSheetProps {
  showHeader?: boolean;
  isYearWise?: boolean;
}

const BalanceSheet: React.FC<BalanceSheetProps> = ({ showHeader = true, isYearWise = false }) => {
  const { theme } = useAppContext();
  const navigate = useNavigate();

  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [ledgerGroups, setLedgerGroups] = useState<LedgerGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDetailedView, setIsDetailedView] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { netProfit: syncedNetProfit, closingStock, openingStock } = useProfitLossSync();
  const [netProfit, setNetProfit] = useState<number>(0);
  const [netLoss, setNetLoss] = useState<number>(0);
  const [transferredProfit, setTransferredProfit] = useState<number>(0);
  const [transferredLoss, setTransferredLoss] = useState<number>(0);

  const [debitCreditData, setDebitCreditData] = useState<
    Record<number, { debit: number; credit: number }>
  >({});

  const [yearwiseData, setYearwiseData] = useState<{
    years: number[];
    particulars: Record<string, { name: string; amount: number; isLiability: boolean; [year: number]: any }>;
  } | null>(null);

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
      const cloneHeader = clone.querySelector("#balance-sheet-company-header") as HTMLElement;
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
      pdf.save(`Balance_Sheet_${sanitizedName}.pdf`);
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
        if (!res.ok) throw new Error("Failed to load balance sheet data");
        const data = await res.json();

        const normalizedLedgers = data.ledgers.map((l: any) => {
          const gid = Number(l.group_id || l.groupId);
          const bg = allSystemGroups.find((g) => g.id === gid);
          const rawClosing = l.closing_balance !== undefined && l.closing_balance !== null
            ? parseFloat(l.closing_balance)
            : (l.closingBalance !== undefined && l.closingBalance !== null ? parseFloat(l.closingBalance) : NaN);
          const rawOpening = parseFloat(l.opening_balance || l.openingBalance) || 0;
          const closingBalance = !isNaN(rawClosing) && rawClosing !== 0
            ? rawClosing
            : (!isNaN(rawClosing) && rawClosing === 0 && rawOpening !== 0 ? rawOpening : (!isNaN(rawClosing) ? rawClosing : rawOpening));

          return {
            id: l.id,
            name: l.name,
            groupId: gid,
            openingBalance: rawOpening,
            balanceType: l.balance_type || l.balanceType || "debit",
            closingBalance: closingBalance,
            groupName: l.group_name || l.groupName || bg?.name || "",
            groupType: l.group_type || l.groupType,
          };
        });
        setLedgers(normalizedLedgers);

        const normalizedGroups = data.ledgerGroups.map((g: any) => ({
          ...g,
          parent: g.parent ? Number(g.parent) : null
        }));

        // Merge with system groups for hierarchical resolution
        const systemGroupsMapped = allSystemGroups.map(g => ({
          id: g.id,
          name: g.name,
          parent: g.parent || null,
          type: g.nature?.toLowerCase().replace(' ', '-') || null
        }));

        setLedgerGroups([...systemGroupsMapped, ...normalizedGroups]);
        setTransferredProfit(data.transferredProfit || 0);
        setTransferredLoss(data.transferredLoss || 0);
      } catch (err: any) {
        setError(err.message || "Unknown error occurred");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [companyId, ownerType, ownerId]);

  useEffect(() => {
    const fetchYearwise = async () => {
      if (!companyId) return;
      try {
        const url = `${import.meta.env.VITE_API_URL}/api/balance-sheet/yearwise?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setYearwiseData(data);
          }
        }
      } catch (err) {
        console.error("Yearwise fetch error:", err);
      }
    };
    fetchYearwise();
  }, [companyId, ownerType, ownerId]);

  useEffect(() => {
    if (companyId) {
      const profit = Number(
        localStorage.getItem(`NET_PROFIT_${companyId}`) || 0
      );
      const loss = Number(
        localStorage.getItem(`NET_LOSS_${companyId}`) || 0
      );
      setNetProfit(profit);
      setNetLoss(loss);
    }
  }, [companyId]);

  // Sync Profit & Loss Data headlessly

  useEffect(() => {
    if (syncedNetProfit !== undefined) {
      if (syncedNetProfit > 0) {
        setNetProfit(syncedNetProfit);
        setNetLoss(0);
      } else {
        setNetProfit(0);
        setNetLoss(Math.abs(syncedNetProfit));
      }
    }
  }, [syncedNetProfit]);

  const [calculatedTotal, setCalculatedTotal] = useState({
    CapitalAccount: 0,
    Loans: 0,
    CurrentLiabilities: 0,
    FixedAssets: 0,
    CurrentAssets: 0,
    TDSPayable: 0,
    ProfitAndLossGroup: 0,
    LaiblityTotal: 0,
    AssetTotal: 0,
  });

  useEffect(() => {
    const capitalTotal = calculateGroupTotal(-4);
    const loanLability = calculateGroupTotal(-13);
    const currentLiability = calculateGroupTotal(-6);
    const fixedAssets = calculateGroupTotal(-9);
    const CurrentAssets = calculateGroupTotal(-5);
    const tdsPayable = calculateGroupTotal(-19);
    const pnlGroupTotal = calculateGroupTotal(-18);

    // Liabilities are typically Credit (Negative in our Dr-based signed math)
    // Assets are typically Debit (Positive)
    const liabSum =
      (-capitalTotal) +
      (-loanLability) +
      (-currentLiability) +
      (-tdsPayable);

    const assetSum =
      (fixedAssets) +
      (CurrentAssets);

    const pnlSigned = -(netProfit - netLoss - (transferredProfit - transferredLoss) - pnlGroupTotal); // Profit is Credit (-)

    setCalculatedTotal({
      CapitalAccount: capitalTotal,
      Loans: loanLability,
      CurrentLiabilities: currentLiability,
      FixedAssets: fixedAssets,
      CurrentAssets: CurrentAssets,
      TDSPayable: tdsPayable,
      ProfitAndLossGroup: pnlGroupTotal,
      LaiblityTotal: liabSum - pnlSigned,
      AssetTotal: assetSum,
    });
  }, [ledgers, debitCreditData, ledgerGroups, netProfit, netLoss, transferredProfit, transferredLoss, closingStock]);

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

  const isStockInHandLedger = (ledger: Ledger) => {
    if (Number(ledger.groupId) === -108) return true;
    const gName = (ledger.groupName || "").toLowerCase().replace(/[\s-_]/g, "");
    if (gName === "stockinhand" || gName.includes("stockinhand")) return true;

    const isDescendant = (grpId: number, visited = new Set<number>()): boolean => {
      if (visited.has(grpId)) return false;
      visited.add(grpId);
      if (grpId === -108) return true;
      const grp = ledgerGroups.find((g) => Number(g.id) === grpId);
      if (grp) {
        const cleanName = (grp.name || "").toLowerCase().replace(/[\s-_]/g, "");
        if (cleanName === "stockinhand" || cleanName.includes("stockinhand")) return true;
        if (grp.parent !== null && grp.parent !== undefined) {
          return isDescendant(Number(grp.parent), visited);
        }
      }
      return false;
    };
    return isDescendant(Number(ledger.groupId));
  };

  const getLedgerBalances = (ledger: Ledger) => {
    const isStock = isStockInHandLedger(ledger);

    if (isStock) {
      const rawClosing = Number(ledger.closingBalance);
      const rawOpening = Number(ledger.openingBalance);
      const closingVal = !isNaN(rawClosing) && rawClosing !== 0
        ? rawClosing
        : (!isNaN(rawOpening) ? rawOpening : 0);
      const closingSigned = ledger.balanceType === "credit" ? -closingVal : closingVal;

      return {
        openingSigned: 0,
        debit: 0,
        credit: 0,
        closingSigned,
      };
    }

    const o = Number(ledger.openingBalance) || 0;
    const debit = debitCreditData[ledger.id]?.debit || 0;
    const credit = debitCreditData[ledger.id]?.credit || 0;

    // Signed value (Relative to Debit)
    const openingSigned = ledger.balanceType === "debit" ? o : -o;
    const closingSigned = openingSigned + debit - credit;

    return { openingSigned, debit, credit, closingSigned };
  };

  const formatBalance = (amount: number) => {
    if (Math.abs(amount) < 0.01) return "0";
    return `${Math.abs(amount).toLocaleString()} ${amount > 0 ? "Dr" : "Cr"}`;
  };

  const calculateGroupTotal = (groupId: number): number => {
    const findSubGroups = (id: number): number[] => {
      let results = [id];
      ledgerGroups
        .filter((g) => Number(g.parent) === Number(id))
        .forEach((c) => {
          results = [...results, ...findSubGroups(Number(c.id))];
        });
      return results;
    };
    const allGroupIds = findSubGroups(groupId);
    const recursiveLedgers = ledgers.filter((l) =>
      allGroupIds.includes(Number(l.groupId))
    );

    // Sum signed closing balances
    return recursiveLedgers.reduce((sum, ledger) => {
      const b = getLedgerBalances(ledger);
      return sum + b.closingSigned;
    }, 0);
  };

  const handleGroupClick = (groupId: number, additionalGroupId?: number) => {
    const groupIds = additionalGroupId ? [groupId, additionalGroupId] : [groupId];
    navigate(`/app/reports/sub-group-summary/${groupId}`, { state: { groupIds } });
  };

  const renderDetailedGroupItems = (parentGroupId: number, level: number = 1) => {
    const subGroups = ledgerGroups.filter(g => Number(g.parent) === Number(parentGroupId));
    const directLedgers = ledgers.filter(l => Number(l.groupId) === parentGroupId);

    return (
      <div className="mt-1 space-y-1">
        {subGroups.map(group => {
          const total = calculateGroupTotal(group.id);
          return (
            <div key={group.id}>
              <div
                className={`grid grid-cols-2 gap-2 py-1 text-sm cursor-pointer transition-all duration-150 group rounded px-2 ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                style={{ paddingLeft: `${level * 1.5}rem` }}
                onClick={() =>
                  navigate(`/app/reports/sub-group-summary/${group.id}`)
                }
              >
                <span className="italic font-semibold text-blue-500 group-hover:text-white">
                  {group.name}
                </span>
                <span className="text-right font-mono text-xs">
                  {formatBalance(total)}
                </span>
              </div>
              {renderDetailedGroupItems(group.id, level + 1)}
            </div>
          );
        })}

        {directLedgers.map(ledger => {
          const b = getLedgerBalances(ledger);
          return (
            <div
              key={ledger.id}
              className={`grid grid-cols-2 gap-2 py-1 text-xs text-gray-500 font-semibold dark:text-gray-400 cursor-pointer transition-all duration-150 rounded px-2 ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
              style={{ paddingLeft: `${level * 1.5}rem` }}
              onClick={() => navigate(`/app/reports/ledger/${ledger.id}`)}
            >
              <span>{ledger.name}</span>
              <span className="text-right font-mono">
                {formatBalance(b.closingSigned)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const displayYears = yearwiseData?.years || [2024, 2025, 2026, 2027];

  const formatVal = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return "₹0";
    return `₹${Math.abs(val).toLocaleString("en-IN")}`;
  };

  const particularRows = [
    {
      key: "CapitalAccount",
      name: "Capital Account",
      groupId: -4,
      amount: Math.abs(calculatedTotal.CapitalAccount),
      yearValues: displayYears.map(
        (y) => yearwiseData?.particulars?.CapitalAccount?.[y] ?? calculatedTotal.CapitalAccount
      ),
    },
    {
      key: "LoanLiability",
      name: "Loan (Liability)",
      groupId: -13,
      amount: Math.abs(calculatedTotal.Loans),
      yearValues: displayYears.map(
        (y) => yearwiseData?.particulars?.LoanLiability?.[y] ?? calculatedTotal.Loans
      ),
    },
    {
      key: "CurrentLiability",
      name: "Current Liability",
      groupId: -6,
      amount: Math.abs(calculatedTotal.CurrentLiabilities),
      yearValues: displayYears.map(
        (y) => yearwiseData?.particulars?.CurrentLiability?.[y] ?? calculatedTotal.CurrentLiabilities
      ),
    },
    {
      key: "FixedAssets",
      name: "Fixed Assets",
      groupId: -9,
      amount: Math.abs(calculatedTotal.FixedAssets),
      yearValues: displayYears.map(
        (y) => yearwiseData?.particulars?.FixedAssets?.[y] ?? calculatedTotal.FixedAssets
      ),
    },
    {
      key: "CurrentAssets",
      name: "Current Assets",
      groupId: -5,
      amount: Math.abs(calculatedTotal.CurrentAssets),
      yearValues: displayYears.map(
        (y) => yearwiseData?.particulars?.CurrentAssets?.[y] ?? calculatedTotal.CurrentAssets
      ),
    },
  ];

  if (isYearWise || !showHeader) {
    return (
      <div className={showHeader ? "pt-[56px] px-4" : ""}>
        {showHeader && (
          <div className="flex items-center mb-6">
            <button
              title="Back to Reports"
              type="button"
              onClick={() => navigate("/app/reports")}
              className={`mr-4 p-2 rounded-full ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}
              disabled={loading}
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-2xl font-bold">Balance Sheet</h1>
          </div>
        )}

        {loading && <p className="p-4 text-gray-500">Loading Balance Sheet data...</p>}
        {error && <p className="p-4 text-red-600">{error}</p>}

        {!loading && !error && (
          <div className={`p-6 rounded-xl border ${theme === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow"}`}>
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h2 className="text-xl font-bold text-blue-600 dark:text-blue-400">Section E - Balance Sheet</h2>
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 font-medium">
                Year-Wise Closing Balance
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className={`border-b text-xs font-semibold uppercase tracking-wider ${theme === "dark" ? "bg-gray-700 text-gray-300 border-gray-600" : "bg-gray-100 text-gray-700 border-gray-300"}`}>
                    <th className="py-3 px-4 text-left">Particular</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    {displayYears.map((y) => (
                      <th key={y} className="py-3 px-4 text-right">{y}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y ${theme === "dark" ? "divide-gray-700 text-gray-200" : "divide-gray-200 text-gray-800"}`}>
                  {particularRows.map((row) => (
                    <tr
                      key={row.key}
                      onClick={() => handleGroupClick(row.groupId)}
                      className={`cursor-pointer transition-colors duration-150 ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-blue-50"}`}
                    >
                      <td className="py-3.5 px-4 font-semibold text-blue-600 dark:text-blue-400">
                        {row.name}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold">
                        {formatVal(row.amount)}
                      </td>
                      {row.yearValues.map((val, idx) => (
                        <td key={displayYears[idx]} className="py-3.5 px-4 text-right font-mono">
                          {formatVal(val)}
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
    );
  }

  return (
    <div className={showHeader ? "pt-[56px] px-4" : ""}>
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

      {showHeader && (
        <div className="flex items-center mb-6 print:hidden">
          <button
            title="Back to Reports"
            type="button"
            onClick={() => navigate("/app/reports")}
            className={`mr-4 p-2 rounded-full ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}
            disabled={loading}
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold">Balance Sheet</h1>
          <div className="ml-auto flex space-x-2">
            <button
              title="Toggle Detailed Mode"
              type="button"
              onClick={() => setIsDetailedView(!isDetailedView)}
              className={`p-2 rounded-md transition-all ${isDetailedView ? "bg-indigo-600 text-white shadow-lg" : theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}
            >
              <Settings size={18} className={isDetailedView ? "animate-spin-slow text-white" : ""} />
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
        </div>
      )}

      {!showHeader && (
        <div className="flex items-center justify-between mb-4 print:hidden">
          <h2 className="text-xl font-bold">Balance Sheet</h2>
          <div className="flex space-x-2">
            <button
              title="Toggle Detailed Mode"
              type="button"
              onClick={() => setIsDetailedView(!isDetailedView)}
              className={`p-2 rounded-md transition-all text-xs flex items-center gap-1.5 border font-medium ${isDetailedView ? "bg-indigo-600 text-white border-indigo-600 shadow" : theme === "dark" ? "hover:bg-gray-700 border-gray-700 text-gray-300" : "hover:bg-gray-100 border-gray-300 text-gray-700"}`}
            >
              <Settings size={14} className={isDetailedView ? "animate-spin-slow text-white" : ""} />
              <span>{isDetailedView ? "Detailed View" : "Condensed View"}</span>
            </button>
          </div>
        </div>
      )}

      {loading && <p>Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div ref={reportRef} id="balance-sheet-report-area" className="w-full">
          {/* Company Details Header - Only visible on Print & Download */}
          <div
            id="balance-sheet-company-header"
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
              Balance Sheet
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              As on {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          </div>

          <div className="flex flex-col gap-6">
          <div className="flex gap-5">
            {/* Liabilities */}
            <div className={`p-6 rounded-lg w-1/2 ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"}`}>
              <h2 className="mb-4 text-xl font-bold text-center border-b pb-2">Liabilities</h2>
              <div className="grid grid-cols-2 gap-2 pb-2 border-b-2 border-gray-400 font-semibold text-sm">
                <div>Particulars</div>
                <div className="text-right">Amount</div>
              </div>

              <div className="space-y-2 mt-3">
                {/* Capital Account */}
                <div>
                  <div
                    className={`grid grid-cols-2 gap-2 py-2 border-b border-gray-300 cursor-pointer transition-all duration-150 group rounded px-2 ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                    onClick={() => handleGroupClick(-4)}
                  >
                    <span className="text-blue-600 font-semibold group-hover:text-white">
                      Capital Account
                    </span>
                    <span className="text-right font-mono font-bold">
                      {formatBalance(calculatedTotal.CapitalAccount)}
                    </span>
                  </div>
                  {isDetailedView && renderDetailedGroupItems(-4)}
                </div>

                {/* Loans */}
                <div>
                  <div
                    className={`grid grid-cols-2 gap-2 py-2 border-b border-gray-300 cursor-pointer transition-all duration-150 group rounded px-2 ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                    onClick={() => handleGroupClick(-13)}
                  >
                    <span className="text-blue-600 font-semibold group-hover:text-white">
                      Loans (Liability)
                    </span>
                    <span className="text-right font-mono font-bold">
                      {formatBalance(calculatedTotal.Loans)}
                    </span>
                  </div>
                  {isDetailedView && renderDetailedGroupItems(-13)}
                </div>

                {/* Current Liabilities */}
                <div>
                  <div
                    className={`grid grid-cols-2 gap-2 py-2 border-b border-gray-300 cursor-pointer transition-all duration-150 group rounded px-2 ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                    onClick={() => handleGroupClick(-6)}
                  >
                    <span className="text-blue-600 font-semibold group-hover:text-white">
                      Current Liabilities
                    </span>
                    <span className="text-right font-mono font-bold">
                      {formatBalance(calculatedTotal.CurrentLiabilities)}
                    </span>
                  </div>
                  {isDetailedView && renderDetailedGroupItems(-6)}
                </div>

                {/* TDS Payable */}
                <div>
                  <div
                    className={`grid grid-cols-2 gap-2 py-2 border-b border-gray-300 cursor-pointer transition-all duration-150 group rounded px-2 ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                    onClick={() => handleGroupClick(-19)}
                  >
                    <span className="text-blue-600 font-semibold group-hover:text-white">
                      TDS Payable
                    </span>
                    <span className="text-right font-mono font-bold">
                      {formatBalance(calculatedTotal.TDSPayable)}
                    </span>
                  </div>
                  {isDetailedView && renderDetailedGroupItems(-19)}
                </div>



                {/* Profit & Loss */}
                <div className="border-b border-gray-300 pb-2">
                  <div
                    className={`grid grid-cols-2 gap-2 py-2 cursor-pointer transition-all duration-150 group rounded px-2 ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                    onClick={() => navigate("/app/reports/profit-loss")}
                  >
                    <span className="text-blue-600 font-semibold group-hover:text-white">
                      Profit & Loss
                    </span>
                    <span className="text-right font-mono font-bold">
                      {formatBalance(-(netProfit - netLoss - (transferredProfit - transferredLoss + calculatedTotal.ProfitAndLossGroup)))}
                    </span>
                  </div>

                  {/* Breakdown */}
                  <div className="ml-4 text-sm space-y-1 mt-1">
                    <div className="grid grid-cols-2">
                      <span className="opacity-75">Current Period</span>
                      <span className="text-right font-mono">
                        {formatBalance(-(netProfit - netLoss))}
                      </span>
                    </div>

                    <div className="grid grid-cols-2">
                      <span className="opacity-75">Less Transferred</span>
                      <span className="text-right font-mono ">
                        {formatBalance(-(transferredProfit - transferredLoss + calculatedTotal.ProfitAndLossGroup))}
                      </span>
                    </div>
                  </div>
                </div>


                <div className="flex justify-between font-bold text-lg border-t-2 border-gray-400 mt-4 pt-2">
                  <span>Total Liabilities</span>
                  <span className="text-indigo-600">{Math.abs(calculatedTotal.LaiblityTotal).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Assets */}
            <div className={`p-6 rounded-lg w-1/2 ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"}`}>
              <h2 className="mb-4 text-xl font-bold text-center border-b pb-2">Assets</h2>
              <div className="grid grid-cols-2 gap-2 pb-2 border-b-2 border-gray-400 font-semibold text-sm">
                <div>Particulars</div>
                <div className="text-right">Amount</div>
              </div>

              <div className="space-y-2 mt-3">
                {/* Fixed Assets */}
                <div>
                  <div
                    className={`grid grid-cols-2 gap-2 py-2 border-b border-gray-300 cursor-pointer transition-all duration-150 group rounded px-2 ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                    onClick={() => handleGroupClick(-9)}
                  >
                    <span className="text-blue-600 font-semibold group-hover:text-white">
                      Fixed Assets
                    </span>
                    <span className="text-right font-mono font-bold">
                      {formatBalance(calculatedTotal.FixedAssets)}
                    </span>
                  </div>
                  {isDetailedView && renderDetailedGroupItems(-9)}
                </div>



                {/* Current Assets */}
                <div>
                  <div
                    className={`grid grid-cols-2 gap-2 py-2 border-b border-gray-300 cursor-pointer transition-all duration-150 group rounded px-2 ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                    onClick={() => handleGroupClick(-5)}
                  >
                    <span className="text-blue-600 font-semibold group-hover:text-white">
                      Current Assets
                    </span>
                    <span className="text-right font-mono font-bold">
                      {formatBalance(calculatedTotal.CurrentAssets)}
                    </span>
                  </div>
                  {isDetailedView && renderDetailedGroupItems(-5)}
                </div>

                <div className="flex justify-between font-bold text-lg border-t-2 border-gray-400 mt-4 pt-2">
                  <span>Total Assets</span>
                  <span className="text-indigo-600">{Math.abs(calculatedTotal.AssetTotal).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Verification */}
          <div className={`p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"}`}>
            <h2 className="mb-4 text-xl font-bold text-center">Verification</h2>
            <div className="grid grid-cols-3 text-center gap-4">
              <div><p className="opacity-75">Assets</p><p className="text-xl font-bold">₹{Math.abs(calculatedTotal.AssetTotal).toLocaleString()}</p></div>
              <div><p className="opacity-75">Liabilities</p><p className="text-xl font-bold">₹{Math.abs(calculatedTotal.LaiblityTotal).toLocaleString()}</p></div>
              <div>
                <p className="opacity-75">Difference</p>
                <p className={`text-xl font-bold ${Math.abs(calculatedTotal.AssetTotal - calculatedTotal.LaiblityTotal) > 1 ? 'text-red-500' : 'text-green-500'}`}>
                  ₹{(calculatedTotal.AssetTotal - calculatedTotal.LaiblityTotal).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}
    </div>
  );
};

export default BalanceSheet;
