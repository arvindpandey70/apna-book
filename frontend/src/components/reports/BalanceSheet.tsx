import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";
import { ArrowLeft, Printer, Download, Settings } from "lucide-react";
import { useProfitLossSync } from "../../hooks/useProfitLossSync";
import { allSystemGroups } from "../../constants/ledgerGroups";

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

const BalanceSheet: React.FC = () => {
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

  const companyId = localStorage.getItem("company_id") || "";
  const ownerType = localStorage.getItem("supplier") || "";
  const ownerId =
    localStorage.getItem(
      ownerType === "employee" ? "employee_id" : "user_id"
    ) || "";

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

        const normalizedLedgers = data.ledgers.map((l: any) => ({
          id: l.id,
          name: l.name,
          groupId: Number(l.group_id || l.groupId),
          openingBalance: parseFloat(l.opening_balance || l.openingBalance) || 0,
          balanceType: l.balance_type || l.balanceType,
          closingBalance: parseFloat(l.closing_balance || l.closingBalance) || 0,
          groupName: l.group_name || l.groupName,
          groupType: l.group_type || l.groupType,
        }));
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

  const getLedgerBalances = (ledger: Ledger) => {
    const o = Number(ledger.openingBalance) || 0;
    const debit = debitCreditData[ledger.id]?.debit || 0;
    const credit = debitCreditData[ledger.id]?.credit || 0;

    // Signed value (Relative to Debit)
    const openingSigned = ledger.balanceType === "debit" ? o : -o;

    let closingSigned;
    if (ledger.groupName?.toLowerCase() === "stock-in-hand") {
      // Use synced closing stock for stock-in-hand
      const stockLedgers = ledgers.filter(l => l.groupName?.toLowerCase() === "stock-in-hand");
      const dbTotal = stockLedgers.reduce((sum, l) => sum + (Number(l.closingBalance) || 0), 0);

      if (dbTotal !== 0) {
        closingSigned = (Number(ledger.closingBalance) / dbTotal) * closingStock;
      } else {
        // If DB is 0, we can't distribute by proportion.
        // Assign total to first ledger only to avoid duplication.
        closingSigned = stockLedgers[0]?.id === ledger.id ? closingStock : 0;
      }
    } else {
      closingSigned = openingSigned + debit - credit;
    }

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

  return (
    <div className="pt-[56px] px-4">
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
        <div className="ml-auto flex space-x-2">
          <button
            title="Toggle Detailed Mode"
            type="button"
            onClick={() => setIsDetailedView(!isDetailedView)}
            className={`p-2 rounded-md transition-all ${isDetailedView ? "bg-indigo-600 text-white shadow-lg" : theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}
          >
            <Settings size={18} className={isDetailedView ? "animate-spin-slow text-white" : ""} />
          </button>
          <button title="Print" className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}><Printer size={18} /></button>
          <button title="Download" className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}><Download size={18} /></button>
        </div>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
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
      )}
    </div>
  );
};

export default BalanceSheet;
