import React, { useEffect, useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useCompany } from '../../context/CompanyContext';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  buildAllGroups,
  isDescendant as isGroupDescendant,
  isUnderPurchaseAccounts,
  isUnderSalesAccounts,
} from '../../utils/plGroupHelpers';

interface LedgerItem {
  id: number;
  name: string;
  group_id: number;
  groupName?: string;
  groupType?: string;
  opening_balance?: number;
}

interface GroupNode {
  id: number | string;
  name: string;
  totalAmount: number;
  subgroups: GroupNode[];
  ledgers: { id: number; name: string; amount: number }[];
}

const ProfitLoss3CD: React.FC = () => {
  const { theme, ledgerGroups: contextLedgerGroups } = useAppContext();
  const { activeCompanyId } = useCompany();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<LedgerItem[]>([]);
  const [ledgerBalances, setLedgerBalances] = useState<Record<number, { debit: number; credit: number }>>({});

  const [stockLedgers, setStockLedgers] = useState<any[]>([]);
  const [purchaseLedgers, setPurchaseLedgers] = useState<any[]>([]);
  const [salesLedgers, setSalesLedgers] = useState<any[]>([]);
  const [directExpenseLedgers, setDirectExpenseLedgers] = useState<any[]>([]);
  const [directIncomeLedgers, setDirectIncomeLedgers] = useState<any[]>([]);

  // State for Trading Account heads (collapsed by default)
  const [expandedTradingHeads, setExpandedTradingHeads] = useState<Record<string, boolean>>({});

  // State for P&L Account groups
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleTradingHead = (id: string) => {
    setExpandedTradingHeads(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleGroup = (id: string) => {
    setCollapsedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const companyId = activeCompanyId || localStorage.getItem('company_id') || localStorage.getItem('active_company_id') || '';
  const rawOwnerType = localStorage.getItem('supplier') || '';
  const employeeId = localStorage.getItem('employee_id');
  const userId = localStorage.getItem('user_id') || '';

  const ownerType = (rawOwnerType === 'ca' || rawOwnerType === 'ca_employee' || rawOwnerType === 'new_ca' || rawOwnerType === 'employee' || employeeId)
    ? 'employee'
    : (rawOwnerType || 'employee');

  const ownerId = (rawOwnerType === 'ca' || rawOwnerType === 'ca_employee' || rawOwnerType === 'new_ca' || rawOwnerType === 'employee' || employeeId)
    ? (employeeId || userId)
    : userId;

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!companyId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Fetch groups
        const groupsRes = await fetch(`${import.meta.env.VITE_API_URL}/api/ledger-groups?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`);
        let fetchedGroups: any[] = [];
        if (groupsRes.ok) {
          fetchedGroups = await groupsRes.json();
        }

        const mergedGroups = buildAllGroups(fetchedGroups || [], contextLedgerGroups || []);
        if (isMounted) setAllGroups(mergedGroups);

        // Fetch group-summary for ledgers
        const summaryRes = await fetch(`${import.meta.env.VITE_API_URL}/api/group-summary?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`);
        if (!summaryRes.ok) throw new Error('Failed to fetch group summary');
        const summaryData = await summaryRes.json();
        const fetchedLedgers: LedgerItem[] = summaryData.ledgers || [];

        if (isMounted) setLedgers(fetchedLedgers);

        // Categorize ledgers for Trading Account calculations
        const purLeds = fetchedLedgers.filter(l => isUnderPurchaseAccounts(mergedGroups, l.group_id));
        const saleLeds = fetchedLedgers.filter(l => isUnderSalesAccounts(mergedGroups, l.group_id));
        const dirExpLeds = fetchedLedgers.filter(l => {
          const gid = String(l.group_id);
          const gtype = (l.groupType || "").toLowerCase();
          return isGroupDescendant(mergedGroups, gid, -7) || gtype.includes("direct-expense");
        });
        const dirIncLeds = fetchedLedgers.filter(l => {
          const gid = String(l.group_id);
          const gtype = (l.groupType || "").toLowerCase();
          return isGroupDescendant(mergedGroups, gid, -8) || gtype.includes("direct-income");
        });

        const normalizeStr = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, '');
        const stockLeds = fetchedLedgers.filter(l => {
          const gid = String(l.group_id);
          const gname = normalizeStr(l.groupName || "");
          return gid === "-108" || gname.includes("stock");
        });

        if (isMounted) {
          setPurchaseLedgers(purLeds);
          setSalesLedgers(saleLeds);
          setDirectExpenseLedgers(dirExpLeds);
          setDirectIncomeLedgers(dirIncLeds);
          setStockLedgers(stockLeds);
        }

        // Fetch balances for all ledgers
        const ledgerIds = fetchedLedgers.map(l => l.id).join(',');
        if (ledgerIds) {
          const balRes = await fetch(`${import.meta.env.VITE_API_URL}/api/group?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&ledgerIds=${ledgerIds}`);
          if (balRes.ok) {
            const balData = await balRes.json();
            if (balData.success && isMounted) {
              setLedgerBalances(balData.data || {});
            }
          }
        }
      } catch (err: any) {
        console.error('Error fetching 3CD P&L data:', err);
        if (isMounted) setError(err.message || 'Failed to load P&L data');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, [companyId, ownerType, ownerId, contextLedgerGroups]);

  // Trading Account Totals
  const openingStock = useMemo(() => {
    return stockLedgers.reduce((sum, l) => sum + Number(l.opening_balance || 0), 0);
  }, [stockLedgers]);

  const closingStock = useMemo(() => {
    const purTotal = purchaseLedgers.reduce((sum, l) => sum + ((ledgerBalances[l.id]?.debit || 0) - (ledgerBalances[l.id]?.credit || 0)), 0);
    const saleTotal = salesLedgers.reduce((sum, l) => sum + ((ledgerBalances[l.id]?.credit || 0) - (ledgerBalances[l.id]?.debit || 0)), 0);
    if (openingStock === 0 && purTotal === 0 && saleTotal === 0) return 0;
    return stockLedgers.reduce((sum, l) => sum + Number((l as any).closing_balance || l.opening_balance || 0), 0);
  }, [stockLedgers, purchaseLedgers, salesLedgers, ledgerBalances, openingStock]);

  const purchaseTotal = useMemo(() => {
    return purchaseLedgers.reduce((sum, l) => sum + ((ledgerBalances[l.id]?.debit || 0) - (ledgerBalances[l.id]?.credit || 0)), 0);
  }, [purchaseLedgers, ledgerBalances]);

  const salesTotal = useMemo(() => {
    return salesLedgers.reduce((sum, l) => sum + ((ledgerBalances[l.id]?.credit || 0) - (ledgerBalances[l.id]?.debit || 0)), 0);
  }, [salesLedgers, ledgerBalances]);

  const directExpensesTotal = useMemo(() => {
    return directExpenseLedgers.reduce((sum, l) => sum + ((ledgerBalances[l.id]?.debit || 0) - (ledgerBalances[l.id]?.credit || 0)), 0);
  }, [directExpenseLedgers, ledgerBalances]);

  const directIncomeTotal = useMemo(() => {
    return directIncomeLedgers.reduce((sum, l) => sum + ((ledgerBalances[l.id]?.credit || 0) - (ledgerBalances[l.id]?.debit || 0)), 0);
  }, [directIncomeLedgers, ledgerBalances]);

  const tradingDebitTotal = openingStock + purchaseTotal + directExpensesTotal;
  const tradingCreditTotal = salesTotal + directIncomeTotal + closingStock;

  const grossProfit = tradingCreditTotal - tradingDebitTotal;

  const tradingTotal = Math.max(
    tradingDebitTotal + (grossProfit > 0 ? grossProfit : 0),
    tradingCreditTotal + (grossProfit < 0 ? Math.abs(grossProfit) : 0)
  );

  // Helper to build hierarchy trees for Indirect Expenses & Indirect Income
  const buildTreeForCategory = (rootGroupId: number, targetType: string, isExpense: boolean): GroupNode[] => {
    const isDescendantGroup = (gid: number | string): boolean => {
      if (String(gid) === String(rootGroupId)) return true;
      const g = allGroups.find(x => String(x.id) === String(gid));
      if (!g) return false;
      const parentId = g.parent_id ?? g.parent;
      if (parentId !== undefined && parentId !== null) {
        return isDescendantGroup(parentId);
      }
      return false;
    };

    const categoryGroups = allGroups.filter(g =>
      isDescendantGroup(g.id) ||
      (g.type && g.type.toLowerCase().includes(targetType))
    );

    const categoryGroupIds = new Set(categoryGroups.map(g => String(g.id)));
    categoryGroupIds.add(String(rootGroupId));

    const buildNode = (groupId: number | string, name: string): GroupNode => {
      const childGroups = allGroups.filter(g => String(g.parent_id ?? g.parent) === String(groupId));
      
      const childLedgers = ledgers
        .filter(l => String(l.group_id) === String(groupId))
        .map(l => {
          const b = ledgerBalances[l.id] || { debit: 0, credit: 0 };
          const amount = isExpense ? (b.debit - b.credit) : (b.credit - b.debit);
          return { id: l.id, name: l.name, amount };
        });

      const subgroups = childGroups.map(cg => buildNode(cg.id, cg.name));

      const ledgersTotal = childLedgers.reduce((sum, l) => sum + l.amount, 0);
      const subgroupsTotal = subgroups.reduce((sum, sg) => sum + sg.totalAmount, 0);
      const totalAmount = ledgersTotal + subgroupsTotal;

      return {
        id: groupId,
        name,
        totalAmount,
        subgroups,
        ledgers: childLedgers
      };
    };

    const rootName = rootGroupId === -10 ? "Indirect Expenses" : "Indirect Income";
    const rootNode = buildNode(rootGroupId, rootName);

    // Unattached ledgers that match group type or belong directly to category
    const unattachedLedgers = ledgers.filter(l => {
      if (String(l.group_id) === String(rootGroupId)) return false;
      const g = allGroups.find(x => String(x.id) === String(l.group_id));
      const gtype = (g?.type || l.groupType || "").toLowerCase();
      return (gtype.includes(targetType)) && !categoryGroupIds.has(String(l.group_id));
    });

    if (unattachedLedgers.length > 0) {
      unattachedLedgers.forEach(l => {
        const b = ledgerBalances[l.id] || { debit: 0, credit: 0 };
        const amount = isExpense ? (b.debit - b.credit) : (b.credit - b.debit);
        rootNode.ledgers.push({ id: l.id, name: l.name, amount });
        rootNode.totalAmount += amount;
      });
    }

    return [rootNode];
  };

  const indirectExpensesTree = useMemo(() => {
    return buildTreeForCategory(-10, 'indirect-expense', true);
  }, [allGroups, ledgers, ledgerBalances]);

  const indirectIncomeTree = useMemo(() => {
    return buildTreeForCategory(-11, 'indirect-income', false);
  }, [allGroups, ledgers, ledgerBalances]);

  // Totals & Net Profit / Loss
  const totalIndirectExpenses = useMemo(() => {
    return indirectExpensesTree.reduce((sum, node) => sum + node.totalAmount, 0);
  }, [indirectExpensesTree]);

  const totalIndirectIncome = useMemo(() => {
    return indirectIncomeTree.reduce((sum, node) => sum + node.totalAmount, 0);
  }, [indirectIncomeTree]);

  const grossLossValue = grossProfit < 0 ? Math.abs(grossProfit) : 0;
  const grossProfitValue = grossProfit > 0 ? grossProfit : 0;

  const debitSumBeforeNetProfit = grossLossValue + totalIndirectExpenses;
  const creditSumBeforeNetLoss = grossProfitValue + totalIndirectIncome;

  const netProfit = creditSumBeforeNetLoss - debitSumBeforeNetProfit;

  const finalTotalDebit = netProfit > 0 ? debitSumBeforeNetProfit + netProfit : debitSumBeforeNetProfit;
  const finalTotalCredit = netProfit < 0 ? creditSumBeforeNetLoss + Math.abs(netProfit) : creditSumBeforeNetLoss;

  const formatAmount = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val || 0);
  };

  // Recursive Tree Component Renderer for P&L
  const RenderGroupNode: React.FC<{
    node: GroupNode;
    depth: number;
    prefix: string; // "To " or "By "
  }> = ({ node, depth, prefix }) => {
    const nodeKey = String(node.id);
    const isCollapsed = collapsedGroups[nodeKey] || false;
    const hasChildren = node.subgroups.length > 0 || node.ledgers.length > 0;

    return (
      <div className="w-full">
        {/* Group Header Row */}
        <div
          onClick={() => hasChildren && toggleGroup(nodeKey)}
          className={`flex justify-between items-center py-1.5 px-2 rounded cursor-pointer transition-colors ${
            depth === 0
              ? 'font-bold text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700/60'
              : depth === 1
              ? 'font-semibold text-gray-800 dark:text-gray-200'
              : 'font-medium text-gray-700 dark:text-gray-300'
          }`}
          style={{ paddingLeft: `${Math.max(8, depth * 16)}px` }}
        >
          <div className="flex items-center space-x-1.5 overflow-hidden">
            {hasChildren ? (
              isCollapsed ? <ChevronRight size={14} className="shrink-0" /> : <ChevronDown size={14} className="shrink-0" />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <span className="truncate">
              {depth === 0 ? `${prefix}${node.name}` : node.name}
            </span>
          </div>
          <span className="font-mono text-sm shrink-0 ml-2 font-semibold">
            {formatAmount(node.totalAmount)}
          </span>
        </div>

        {/* Children (Subgroups & Ledgers) */}
        {!isCollapsed && (
          <div className="space-y-0.5">
            {/* Render Subgroups */}
            {node.subgroups.map(subnode => (
              <RenderGroupNode key={subnode.id} node={subnode} depth={depth + 1} prefix={prefix} />
            ))}

            {/* Render Ledgers */}
            {node.ledgers.map(ledger => (
              <div
                key={ledger.id}
                className="flex justify-between items-center py-1 px-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                style={{ paddingLeft: `${(depth + 1) * 16 + 12}px` }}
              >
                <span className="truncate">
                  {prefix}{ledger.name}
                </span>
                <span className="font-mono shrink-0 ml-2">
                  {formatAmount(ledger.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`p-8 rounded-xl border ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} flex flex-col items-center justify-center min-h-[300px]`}>
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading Trading & Profit & Loss Statement for Form 3CD...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 rounded-xl border ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-red-400' : 'bg-white border-gray-200 text-red-600'}`}>
        <p className="font-semibold text-base mb-1">Error Loading Statement</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. TRADING ACCOUNT SECTION */}
      <div className={`rounded-xl border shadow-sm p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="text-center mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold tracking-wide text-gray-900 dark:text-white uppercase">
            TRADING ACCOUNT
          </h2>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-1">
            FOR THE PERIOD / YEAR ENDED
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
          {/* Trading Account DEBIT */}
          <div className="flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-850">
            <div>
              <div className="grid grid-cols-12 bg-gray-100 dark:bg-gray-700 px-3 py-2 text-xs font-bold text-gray-800 dark:text-gray-200 border-b border-gray-300 dark:border-gray-600 tracking-wider">
                <div className="col-span-8">PARTICULARS (Dr.)</div>
                <div className="col-span-4 text-right">AMOUNT</div>
              </div>

              <div className="p-2 space-y-1">
                {/* Opening Stock Head (Collapsed by default) */}
                <div className="w-full">
                  <div
                    onClick={() => stockLedgers.length > 0 && toggleTradingHead('t_open_stock')}
                    className={`flex justify-between items-center py-1.5 px-2 rounded cursor-pointer transition-colors ${stockLedgers.length > 0 ? 'hover:bg-gray-100 dark:hover:bg-gray-700/60' : ''}`}
                  >
                    <div className="flex items-center space-x-1.5 font-bold text-gray-800 dark:text-gray-200 text-sm">
                      {stockLedgers.length > 0 ? (
                        expandedTradingHeads['t_open_stock'] ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />
                      ) : <span className="w-3.5 shrink-0" />}
                      <span>To Opening Stock</span>
                    </div>
                    <span className="font-mono text-sm font-semibold">{formatAmount(openingStock)}</span>
                  </div>

                  {expandedTradingHeads['t_open_stock'] && stockLedgers.length > 0 && (
                    <div className="space-y-0.5 mt-0.5">
                      {stockLedgers.map(l => (
                        <div key={l.id} className="flex justify-between items-center py-1 px-2 text-sm text-gray-700 dark:text-gray-300 pl-8 hover:bg-gray-50 dark:hover:bg-gray-750">
                          <span className="truncate">To {l.name}</span>
                          <span className="font-mono shrink-0 ml-2">{formatAmount(Number(l.opening_balance || 0))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Purchase Accounts Head (Collapsed by default) */}
                <div className="w-full">
                  <div
                    onClick={() => purchaseLedgers.length > 0 && toggleTradingHead('t_purchase')}
                    className={`flex justify-between items-center py-1.5 px-2 rounded cursor-pointer transition-colors ${purchaseLedgers.length > 0 ? 'hover:bg-gray-100 dark:hover:bg-gray-700/60' : ''}`}
                  >
                    <div className="flex items-center space-x-1.5 font-bold text-gray-800 dark:text-gray-200 text-sm">
                      {purchaseLedgers.length > 0 ? (
                        expandedTradingHeads['t_purchase'] ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />
                      ) : <span className="w-3.5 shrink-0" />}
                      <span>To Purchase Accounts</span>
                    </div>
                    <span className="font-mono text-sm font-semibold">{formatAmount(purchaseTotal)}</span>
                  </div>

                  {expandedTradingHeads['t_purchase'] && purchaseLedgers.length > 0 && (
                    <div className="space-y-0.5 mt-0.5">
                      {purchaseLedgers.map(l => (
                        <div key={l.id} className="flex justify-between items-center py-1 px-2 text-sm text-gray-700 dark:text-gray-300 pl-8 hover:bg-gray-50 dark:hover:bg-gray-750">
                          <span className="truncate">To {l.name}</span>
                          <span className="font-mono shrink-0 ml-2">
                            {formatAmount((ledgerBalances[l.id]?.debit || 0) - (ledgerBalances[l.id]?.credit || 0))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Direct Expenses Head (Collapsed by default) */}
                <div className="w-full">
                  <div
                    onClick={() => directExpenseLedgers.length > 0 && toggleTradingHead('t_dir_exp')}
                    className={`flex justify-between items-center py-1.5 px-2 rounded cursor-pointer transition-colors ${directExpenseLedgers.length > 0 ? 'hover:bg-gray-100 dark:hover:bg-gray-700/60' : ''}`}
                  >
                    <div className="flex items-center space-x-1.5 font-bold text-gray-800 dark:text-gray-200 text-sm">
                      {directExpenseLedgers.length > 0 ? (
                        expandedTradingHeads['t_dir_exp'] ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />
                      ) : <span className="w-3.5 shrink-0" />}
                      <span>To Direct Expenses</span>
                    </div>
                    <span className="font-mono text-sm font-semibold">{formatAmount(directExpensesTotal)}</span>
                  </div>

                  {expandedTradingHeads['t_dir_exp'] && directExpenseLedgers.length > 0 && (
                    <div className="space-y-0.5 mt-0.5">
                      {directExpenseLedgers.map(l => (
                        <div key={l.id} className="flex justify-between items-center py-1 px-2 text-sm text-gray-700 dark:text-gray-300 pl-8 hover:bg-gray-50 dark:hover:bg-gray-750">
                          <span className="truncate">To {l.name}</span>
                          <span className="font-mono shrink-0 ml-2">
                            {formatAmount((ledgerBalances[l.id]?.debit || 0) - (ledgerBalances[l.id]?.credit || 0))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Gross Profit c/d if applicable */}
                {grossProfit > 0 && (
                  <div className="flex justify-between items-center py-2 px-2 text-sm font-bold text-green-600 dark:text-green-400 border-t border-b border-gray-300 dark:border-gray-600 mt-2">
                    <span>To Gross Profit c/d</span>
                    <span className="font-mono">{formatAmount(grossProfit)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-12 px-3 py-2.5 font-bold text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border-t-2 border-gray-400 dark:border-gray-500">
              <div className="col-span-8 uppercase tracking-wider">Total</div>
              <div className="col-span-4 text-right font-mono text-base">{formatAmount(tradingTotal)}</div>
            </div>
          </div>

          {/* Trading Account CREDIT */}
          <div className="flex flex-col justify-between bg-white dark:bg-gray-850">
            <div>
              <div className="grid grid-cols-12 bg-gray-100 dark:bg-gray-700 px-3 py-2 text-xs font-bold text-gray-800 dark:text-gray-200 border-b border-gray-300 dark:border-gray-600 tracking-wider">
                <div className="col-span-8">PARTICULARS (Cr.)</div>
                <div className="col-span-4 text-right">AMOUNT</div>
              </div>

              <div className="p-2 space-y-1">
                {/* Sales Accounts Head (Collapsed by default) */}
                <div className="w-full">
                  <div
                    onClick={() => salesLedgers.length > 0 && toggleTradingHead('t_sales')}
                    className={`flex justify-between items-center py-1.5 px-2 rounded cursor-pointer transition-colors ${salesLedgers.length > 0 ? 'hover:bg-gray-100 dark:hover:bg-gray-700/60' : ''}`}
                  >
                    <div className="flex items-center space-x-1.5 font-bold text-gray-800 dark:text-gray-200 text-sm">
                      {salesLedgers.length > 0 ? (
                        expandedTradingHeads['t_sales'] ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />
                      ) : <span className="w-3.5 shrink-0" />}
                      <span>By Sales Accounts</span>
                    </div>
                    <span className="font-mono text-sm font-semibold">{formatAmount(salesTotal)}</span>
                  </div>

                  {expandedTradingHeads['t_sales'] && salesLedgers.length > 0 && (
                    <div className="space-y-0.5 mt-0.5">
                      {salesLedgers.map(l => (
                        <div key={l.id} className="flex justify-between items-center py-1 px-2 text-sm text-gray-700 dark:text-gray-300 pl-8 hover:bg-gray-50 dark:hover:bg-gray-750">
                          <span className="truncate">By {l.name}</span>
                          <span className="font-mono shrink-0 ml-2">
                            {formatAmount((ledgerBalances[l.id]?.credit || 0) - (ledgerBalances[l.id]?.debit || 0))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Direct Income Head (Collapsed by default) */}
                <div className="w-full">
                  <div
                    onClick={() => directIncomeLedgers.length > 0 && toggleTradingHead('t_dir_inc')}
                    className={`flex justify-between items-center py-1.5 px-2 rounded cursor-pointer transition-colors ${directIncomeLedgers.length > 0 ? 'hover:bg-gray-100 dark:hover:bg-gray-700/60' : ''}`}
                  >
                    <div className="flex items-center space-x-1.5 font-bold text-gray-800 dark:text-gray-200 text-sm">
                      {directIncomeLedgers.length > 0 ? (
                        expandedTradingHeads['t_dir_inc'] ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />
                      ) : <span className="w-3.5 shrink-0" />}
                      <span>By Direct Income</span>
                    </div>
                    <span className="font-mono text-sm font-semibold">{formatAmount(directIncomeTotal)}</span>
                  </div>

                  {expandedTradingHeads['t_dir_inc'] && directIncomeLedgers.length > 0 && (
                    <div className="space-y-0.5 mt-0.5">
                      {directIncomeLedgers.map(l => (
                        <div key={l.id} className="flex justify-between items-center py-1 px-2 text-sm text-gray-700 dark:text-gray-300 pl-8 hover:bg-gray-50 dark:hover:bg-gray-750">
                          <span className="truncate">By {l.name}</span>
                          <span className="font-mono shrink-0 ml-2">
                            {formatAmount((ledgerBalances[l.id]?.credit || 0) - (ledgerBalances[l.id]?.debit || 0))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Closing Stock Head (Collapsed by default) */}
                <div className="w-full">
                  <div
                    onClick={() => stockLedgers.length > 0 && toggleTradingHead('t_close_stock')}
                    className={`flex justify-between items-center py-1.5 px-2 rounded cursor-pointer transition-colors ${stockLedgers.length > 0 ? 'hover:bg-gray-100 dark:hover:bg-gray-700/60' : ''}`}
                  >
                    <div className="flex items-center space-x-1.5 font-bold text-gray-800 dark:text-gray-200 text-sm">
                      {stockLedgers.length > 0 ? (
                        expandedTradingHeads['t_close_stock'] ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />
                      ) : <span className="w-3.5 shrink-0" />}
                      <span>By Closing Stock</span>
                    </div>
                    <span className="font-mono text-sm font-semibold">{formatAmount(closingStock)}</span>
                  </div>

                  {expandedTradingHeads['t_close_stock'] && stockLedgers.length > 0 && (
                    <div className="space-y-0.5 mt-0.5">
                      {stockLedgers.map(l => (
                        <div key={l.id} className="flex justify-between items-center py-1 px-2 text-sm text-gray-700 dark:text-gray-300 pl-8 hover:bg-gray-50 dark:hover:bg-gray-750">
                          <span className="truncate">By {l.name}</span>
                          <span className="font-mono shrink-0 ml-2">
                            {formatAmount(Number((l as any).closing_balance || l.opening_balance || 0))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Gross Loss c/d if applicable */}
                {grossProfit < 0 && (
                  <div className="flex justify-between items-center py-2 px-2 text-sm font-bold text-red-600 dark:text-red-400 border-t border-b border-gray-300 dark:border-gray-600 mt-2">
                    <span>By Gross Loss c/d</span>
                    <span className="font-mono">{formatAmount(Math.abs(grossProfit))}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-12 px-3 py-2.5 font-bold text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border-t-2 border-gray-400 dark:border-gray-500">
              <div className="col-span-8 uppercase tracking-wider">Total</div>
              <div className="col-span-4 text-right font-mono text-base">{formatAmount(tradingTotal)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. PROFIT & LOSS ACCOUNT SECTION */}
      <div className={`rounded-xl border shadow-sm p-6 ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="text-center mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold tracking-wide text-gray-900 dark:text-white uppercase">
            PROFIT & LOSS ACCOUNT
          </h2>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-1">
            FOR THE PERIOD / YEAR ENDED
          </p>
        </div>

        {/* Two-Column Accounting Table Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
          
          {/* LEFT SIDE: DEBIT */}
          <div className="flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-850">
            <div>
              {/* Header */}
              <div className="grid grid-cols-12 bg-gray-100 dark:bg-gray-700 px-3 py-2 text-xs font-bold text-gray-800 dark:text-gray-200 border-b border-gray-300 dark:border-gray-600 tracking-wider">
                <div className="col-span-8">PARTICULARS (Dr.)</div>
                <div className="col-span-4 text-right">AMOUNT</div>
              </div>

              {/* Debit Content */}
              <div className="p-2 space-y-1.5">
                {/* Gross Loss b/f if applicable */}
                {grossProfit < 0 && (
                  <div className="flex justify-between items-center py-1.5 px-2 text-sm font-semibold text-red-600 dark:text-red-400 border-b border-gray-200 dark:border-gray-700">
                    <span>To Gross Loss b/f</span>
                    <span className="font-mono">{formatAmount(grossLossValue)}</span>
                  </div>
                )}

                {/* Indirect Expenses Tree */}
                {indirectExpensesTree.map(node => (
                  <RenderGroupNode key={node.id} node={node} depth={0} prefix="To " />
                ))}

                {/* Net Profit if applicable */}
                {netProfit > 0 && (
                  <div className="flex justify-between items-center py-2 px-2 text-sm font-bold text-green-600 dark:text-green-400 border-t border-b border-gray-300 dark:border-gray-600 mt-2">
                    <span>To Net Profit</span>
                    <span className="font-mono">{formatAmount(netProfit)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Debit Total Row */}
            <div className="grid grid-cols-12 px-3 py-2.5 font-bold text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border-t-2 border-gray-400 dark:border-gray-500">
              <div className="col-span-8 uppercase tracking-wider">Total</div>
              <div className="col-span-4 text-right font-mono text-base">{formatAmount(finalTotalDebit)}</div>
            </div>
          </div>

          {/* RIGHT SIDE: CREDIT */}
          <div className="flex flex-col justify-between bg-white dark:bg-gray-850">
            <div>
              {/* Header */}
              <div className="grid grid-cols-12 bg-gray-100 dark:bg-gray-700 px-3 py-2 text-xs font-bold text-gray-800 dark:text-gray-200 border-b border-gray-300 dark:border-gray-600 tracking-wider">
                <div className="col-span-8">PARTICULARS (Cr.)</div>
                <div className="col-span-4 text-right">AMOUNT</div>
              </div>

              {/* Credit Content */}
              <div className="p-2 space-y-1.5">
                {/* Gross Profit b/f if applicable */}
                {grossProfit > 0 && (
                  <div className="flex justify-between items-center py-1.5 px-2 text-sm font-semibold text-green-600 dark:text-green-400 border-b border-gray-200 dark:border-gray-700">
                    <span>By Gross Profit b/f</span>
                    <span className="font-mono">{formatAmount(grossProfitValue)}</span>
                  </div>
                )}

                {/* Indirect Income Tree */}
                {indirectIncomeTree.map(node => (
                  <RenderGroupNode key={node.id} node={node} depth={0} prefix="By " />
                ))}

                {/* Net Loss if applicable */}
                {netProfit < 0 && (
                  <div className="flex justify-between items-center py-2 px-2 text-sm font-bold text-red-600 dark:text-red-400 border-t border-b border-gray-300 dark:border-gray-600 mt-2">
                    <span>By Net Loss</span>
                    <span className="font-mono">{formatAmount(Math.abs(netProfit))}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Credit Total Row */}
            <div className="grid grid-cols-12 px-3 py-2.5 font-bold text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border-t-2 border-gray-400 dark:border-gray-500">
              <div className="col-span-8 uppercase tracking-wider">Total</div>
              <div className="col-span-4 text-right font-mono text-base">{formatAmount(finalTotalCredit)}</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ProfitLoss3CD;
