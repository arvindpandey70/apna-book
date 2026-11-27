import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";
import { useCompany } from "../../context/CompanyContext";
import {
  ArrowLeft,
  Printer,
  Download,
  Filter,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Loader2,
  Info,
  FileSpreadsheet,
  LayoutGrid,
  Columns2,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  MinusCircle,
} from "lucide-react";
import domtoimage from "dom-to-image-more";
import jsPDF from "jspdf";
import { allSystemGroups } from "../../constants/ledgerGroups";
import {
  buildAllGroups,
  getFinancialYearRange,
  getGroupParent,
  isDescendant,
  isUnderPurchaseAccounts,
  isUnderSalesAccounts,
  type PlGroup,
} from "../../utils/plGroupHelpers";

interface RawLedger {
  id: number;
  name: string;
  groupId: number;
  openingBalance: number;
  balanceType: "debit" | "credit";
  closingBalance: number;
  groupName: string;
  groupType: string | null;
}

interface ApiLedgerRow {
  id: number | string;
  name: string;
  group_id?: number | string;
  groupId?: number | string;
  opening_balance?: number | string;
  openingBalance?: number | string;
  balance_type?: "debit" | "credit";
  balanceType?: "debit" | "credit";
  closing_balance?: number | string | null;
  closingBalance?: number | string | null;
  group_name?: string;
  groupName?: string;
  group_type?: string | null;
  groupType?: string | null;
}

interface StockBatchRecord {
  batchQuantity?: number | string;
  openingRate?: number | string;
}

interface StockItemRecord {
  name: string;
  openingBalance?: number | string;
  quantity?: number | string;
  openingRate?: number | string;
  rate?: number | string;
  batches?: StockBatchRecord[];
}

interface PurchaseHistoryRecord {
  date?: string;
  voucherDate?: string;
  itemName?: string;
  purchaseQuantity?: number | string;
  rate?: number | string;
  purchaseRate?: number | string;
}

interface SalesHistoryRecord {
  date?: string;
  voucherDate?: string;
  itemName?: string;
  qtyChange?: number | string;
}

interface ExtendedCompanyFields {
  companyName?: string;
  company_name?: string;
  gst_number?: string;
  phone_number?: string;
}

type HealthStatus = "healthy" | "warning" | "critical" | "neutral";

interface RatioItem {
  id: string;
  name: string;
  category: "Liquidity" | "Solvency" | "Profitability" | "Efficiency";
  displayValue: string;
  numericValue: number | null;
  formula: string;
  numeratorLabel: string;
  numeratorValue: number;
  denominatorLabel: string;
  denominatorValue: number;
  idealText: string;
  status: HealthStatus;
  interpretation: string;
}

interface PrincipalGroupRow {
  id: string;
  label: string;
  subLabel?: string;
  value: number | null;
  formattedValue: string;
  isRatio?: boolean;
  isHighlight?: boolean;
  route?: string;
  groupId?: number;
}

const normalizeName = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const formatINR = (amount: number, showDecimals = false) => {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-IN", {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  });
  return `${amount < 0 ? "-" : ""}₹${formatted}`;
};

const formatDrCr = (signedAmount: number) => {
  if (Math.abs(signedAmount) < 0.01) return "₹0";
  const abs = Math.abs(signedAmount).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `₹${abs} ${signedAmount > 0 ? "Dr" : "Cr"}`;
};

const RatioAnalysis: React.FC = () => {
  const { theme, ledgerGroups: contextGroups } = useAppContext();
  const { companyInfo, companies, activeCompanyId } = useCompany();
  const navigate = useNavigate();

  const isDark = theme === "dark";
  const reportRef = useRef<HTMLDivElement>(null);

  const companyId =
    localStorage.getItem("company_id") ||
    localStorage.getItem("active_company_id") ||
    "";
  const rawOwnerType = localStorage.getItem("supplier") || "";
  const employeeId = localStorage.getItem("employee_id");
  const userId = localStorage.getItem("user_id") || "";

  const ownerType =
    rawOwnerType === "ca" ||
    rawOwnerType === "ca_employee" ||
    rawOwnerType === "new_ca" ||
    rawOwnerType === "employee" ||
    employeeId
      ? "employee"
      : rawOwnerType || "employee";

  const ownerId =
    rawOwnerType === "ca" ||
    rawOwnerType === "ca_employee" ||
    rawOwnerType === "new_ca" ||
    rawOwnerType === "employee" ||
    employeeId
      ? employeeId || userId
      : userId;

  const activeCompany = useMemo(() => {
    return companies?.find(
      (c) => String(c.id) === String(activeCompanyId || companyId)
    );
  }, [companies, activeCompanyId, companyId]);

  const extCompany = companyInfo as (typeof companyInfo & ExtendedCompanyFields) | null;

  const companyName =
    companyInfo?.name ||
    extCompany?.companyName ||
    extCompany?.company_name ||
    activeCompany?.name ||
    "Company";

  const companyAddress = companyInfo?.address || activeCompany?.address || "";
  const companyCityStatePin = [
    companyInfo?.state || activeCompany?.state,
    companyInfo?.pin || activeCompany?.pin,
  ]
    .filter(Boolean)
    .join(" - ");
  const companyGst =
    companyInfo?.gstNumber ||
    extCompany?.gst_number ||
    activeCompany?.gstNumber ||
    "";
  const companyPhone =
    companyInfo?.phoneNumber ||
    extCompany?.phone_number ||
    activeCompany?.phoneNumber ||
    "";

  // UI & Filter States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [viewMode, setViewMode] = useState<"split" | "cards">("split");
  const [selectedRatioId, setSelectedRatioId] = useState<string | null>("current-ratio");

  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // Raw Financial Data States
  const [ledgers, setLedgers] = useState<RawLedger[]>([]);
  const [mergedGroups, setMergedGroups] = useState<PlGroup[]>([]);
  const [debitCreditData, setDebitCreditData] = useState<
    Record<number, { debit: number; credit: number }>
  >({});
  const [stockItems, setStockItems] = useState<StockItemRecord[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryRecord[]>([]);
  const [salesHistory, setSalesHistory] = useState<SalesHistoryRecord[]>([]);

  const fetchRatioData = useCallback(async () => {
    if (!companyId || !ownerType || !ownerId) {
      setError("Company information not found. Please select a company.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const baseUrl = import.meta.env.VITE_API_URL;
      const tenantQs = `company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;

      const [bsRes, stockRes, purRes, saleRes] = await Promise.all([
        fetch(`${baseUrl}/api/balance-sheet?${tenantQs}`),
        fetch(`${baseUrl}/api/stock-items?${tenantQs}`),
        fetch(`${baseUrl}/api/purchase-vouchers/purchase-history?${tenantQs}`),
        fetch(`${baseUrl}/api/sales-vouchers/sale-history?${tenantQs}`),
      ]);

      if (!bsRes.ok) {
        throw new Error("Failed to load accounting data for Ratio Analysis");
      }

      const bsJson = await bsRes.json();
      const stockJson = stockRes.ok ? await stockRes.json() : { data: [] };
      const purJson = purRes.ok ? await purRes.json() : { data: [] };
      const saleJson = saleRes.ok ? await saleRes.json() : { data: [] };

      const rawLedgers: ApiLedgerRow[] = bsJson.ledgers || [];
      const normalizedLedgers: RawLedger[] = rawLedgers.map((l) => {
        const gid = Number(l.group_id || l.groupId);
        const bg = allSystemGroups.find((g) => g.id === gid);
        const rawClosing =
          l.closing_balance !== undefined && l.closing_balance !== null
            ? parseFloat(String(l.closing_balance))
            : l.closingBalance !== undefined && l.closingBalance !== null
              ? parseFloat(String(l.closingBalance))
              : NaN;
        const rawOpening = parseFloat(String(l.opening_balance || l.openingBalance || 0)) || 0;
        const closingBalance =
          !isNaN(rawClosing) && rawClosing !== 0
            ? rawClosing
            : !isNaN(rawClosing) && rawClosing === 0 && rawOpening !== 0
              ? rawOpening
              : !isNaN(rawClosing)
                ? rawClosing
                : rawOpening;

        return {
          id: Number(l.id),
          name: l.name,
          groupId: gid,
          openingBalance: rawOpening,
          balanceType: l.balance_type || l.balanceType || "debit",
          closingBalance,
          groupName: l.group_name || l.groupName || bg?.name || "",
          groupType: l.group_type || l.groupType || null,
        };
      });

      const allGroups = buildAllGroups(
        bsJson.ledgerGroups || [],
        contextGroups || []
      );

      setLedgers(normalizedLedgers);
      setMergedGroups(allGroups);
      setStockItems(stockJson.data || []);
      setPurchaseHistory(purJson.data || []);
      setSalesHistory(saleJson.data || []);

      if (normalizedLedgers.length > 0) {
        const ledgerIds = normalizedLedgers.map((l) => l.id).join(",");
        const periodParams = new URLSearchParams();
        if (fromDate) periodParams.set("fromDate", fromDate);
        if (toDate) periodParams.set("toDate", toDate);
        const periodQs = periodParams.toString() ? `&${periodParams.toString()}` : "";

        const groupRes = await fetch(
          `${baseUrl}/api/group?${tenantQs}&ledgerIds=${ledgerIds}${periodQs}`
        );
        if (groupRes.ok) {
          const groupJson = await groupRes.json();
          if (groupJson.success && groupJson.data) {
            setDebitCreditData(groupJson.data);
          }
        }
      } else {
        setDebitCreditData({});
      }
    } catch (err: unknown) {
      console.error("Ratio Analysis fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load Ratio Analysis data");
    } finally {
      setLoading(false);
    }
  }, [companyId, ownerType, ownerId, contextGroups, fromDate, toDate]);

  useEffect(() => {
    fetchRatioData();
  }, [fetchRatioData]);

  // Period days calculation for turnover ratios
  const periodDays = useMemo(() => {
    if (fromDate && toDate) {
      const start = new Date(fromDate);
      const end = new Date(toDate);
      const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (!isNaN(diff) && diff > 0) return diff;
    }
    return 365;
  }, [fromDate, toDate]);

  // Helper: check if ledger/group belongs to target system group ID or name (handles company-local copies)
  const isUnderGroup = useCallback(
    (
      groupId: number,
      targetSystemId: number,
      targetNames: string[] = []
    ): boolean => {
      if (isDescendant(mergedGroups, groupId, targetSystemId)) return true;
      const normalizedTargets = targetNames.map(normalizeName);
      if (normalizedTargets.length === 0) return false;

      let curId: number | null = groupId;
      const visited = new Set<number>();
      while (curId !== null && !visited.has(curId)) {
        visited.add(curId);
        if (curId === targetSystemId) return true;
        const grp = mergedGroups.find((g) => Number(g.id) === Number(curId));
        if (!grp) break;
        if (normalizedTargets.includes(normalizeName(grp.name || ""))) {
          return true;
        }
        curId = getGroupParent(grp);
      }
      return false;
    },
    [mergedGroups]
  );

  const isStockInHandLedger = useCallback(
    (ledger: RawLedger) => {
      if (Number(ledger.groupId) === -108) return true;
      const gName = normalizeName(ledger.groupName);
      if (gName.includes("stockinhand") || gName === "stock") return true;
      return isUnderGroup(Number(ledger.groupId), -108, ["Stock-In-Hand", "Stock in Hand"]);
    },
    [isUnderGroup]
  );

  const getLedgerSignedClosing = useCallback(
    (ledger: RawLedger) => {
      if (isStockInHandLedger(ledger)) {
        const rawClosing = Number(ledger.closingBalance);
        const rawOpening = Number(ledger.openingBalance);
        const closingVal =
          !isNaN(rawClosing) && rawClosing !== 0
            ? rawClosing
            : !isNaN(rawOpening)
              ? rawOpening
              : 0;
        return ledger.balanceType === "credit" ? -closingVal : closingVal;
      }

      const opening = Number(ledger.openingBalance) || 0;
      const debit = debitCreditData[ledger.id]?.debit || 0;
      const credit = debitCreditData[ledger.id]?.credit || 0;
      const openingSigned = ledger.balanceType === "debit" ? opening : -opening;
      return openingSigned + debit - credit;
    },
    [debitCreditData, isStockInHandLedger]
  );

  // Sum Dr-based signed closing balances for a group & its descendants
  const calculateGroupClosingSigned = useCallback(
    (targetSystemId: number, targetNames: string[] = []): number => {
      return ledgers.reduce((sum, ledger) => {
        if (isUnderGroup(Number(ledger.groupId), targetSystemId, targetNames)) {
          return sum + getLedgerSignedClosing(ledger);
        }
        return sum;
      }, 0);
    },
    [ledgers, isUnderGroup, getLedgerSignedClosing]
  );

  // Inventory (Item-wise Weighted Avg, matching ProfitLoss.tsx & useProfitLossSync.ts)
  const inventoryStats = useMemo(() => {
    const itemMap: Record<
      string,
      { openingQty: number; openingValue: number; inwardQty: number; inwardValue: number; outwardQty: number }
    > = {};

    stockItems.forEach((item: StockItemRecord) => {
      const itemName = item.name;
      if (!itemMap[itemName]) {
        itemMap[itemName] = {
          openingQty: 0,
          openingValue: 0,
          inwardQty: 0,
          inwardValue: 0,
          outwardQty: 0,
        };
      }
      if (item.batches && item.batches.length > 0) {
        item.batches.forEach((b: StockBatchRecord) => {
          const q = Number(b.batchQuantity || 0);
          const r = Number(b.openingRate || 0);
          itemMap[itemName].openingQty += q;
          itemMap[itemName].openingValue += q * r;
        });
      } else {
        const q = Number(item.openingBalance || item.quantity || 0);
        const r = Number(item.openingRate || item.rate || 0);
        itemMap[itemName].openingQty += q;
        itemMap[itemName].openingValue += q * r;
      }
    });

    const inPeriod = (dateStr?: string) => {
      if (!fromDate && !toDate) return true;
      if (!dateStr) return true;
      const d = String(dateStr).slice(0, 10);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    };

    purchaseHistory.forEach((p: PurchaseHistoryRecord) => {
      if (!inPeriod(p.date || p.voucherDate)) return;
      const itemName = p.itemName;
      if (!itemName) return;
      if (!itemMap[itemName]) {
        itemMap[itemName] = {
          openingQty: 0,
          openingValue: 0,
          inwardQty: 0,
          inwardValue: 0,
          outwardQty: 0,
        };
      }
      const q = Number(p.purchaseQuantity || 0);
      const v = q * Number(p.rate || p.purchaseRate || 0);
      itemMap[itemName].inwardQty += q;
      itemMap[itemName].inwardValue += v;
    });

    salesHistory.forEach((s: SalesHistoryRecord) => {
      if (!inPeriod(s.date || s.voucherDate)) return;
      const itemName = s.itemName;
      if (!itemName || !itemMap[itemName]) return;
      const q = Math.abs(Number(s.qtyChange || 0));
      itemMap[itemName].outwardQty += q;
    });

    let totalOpeningValue = 0;
    let totalClosingValue = 0;
    Object.values(itemMap).forEach((item) => {
      const totalInQty = item.openingQty + item.inwardQty;
      const totalInValue = item.openingValue + item.inwardValue;
      const avgRate = totalInQty > 0 ? totalInValue / totalInQty : 0;
      const closingQty = totalInQty - item.outwardQty;
      const closingValue = closingQty * avgRate;
      totalOpeningValue += item.openingValue;
      totalClosingValue += Math.max(0, closingValue);
    });

    return { totalOpeningValue, totalClosingValue };
  }, [stockItems, purchaseHistory, salesHistory, fromDate, toDate]);

  // Core Financial Metrics (aligned with BalanceSheet.tsx & ProfitLoss.tsx)
  const metrics = useMemo(() => {
    const showItemWise = localStorage.getItem("PL_SHOW_ITEM_WISE") === "true";

    const stockLedgers = ledgers.filter((l) => isStockInHandLedger(l));
    const stockLedgerOpening = stockLedgers.reduce(
      (sum, l) => sum + (Number(l.openingBalance) || 0),
      0
    );
    const stockLedgerClosing = stockLedgers.reduce(
      (sum, l) => sum + Math.max(0, getLedgerSignedClosing(l)),
      0
    );

    const salesLedgers = ledgers.filter((l) =>
      isUnderSalesAccounts(mergedGroups, l.groupId)
    );
    const purchaseLedgers = ledgers.filter((l) =>
      isUnderPurchaseAccounts(mergedGroups, l.groupId)
    );
    const directExpLedgers = ledgers.filter((l) =>
      isUnderGroup(l.groupId, -7, ["Direct Expenses", "Direct Expense"])
    );
    const directIncLedgers = ledgers.filter((l) =>
      isUnderGroup(l.groupId, -8, ["Direct Income", "Direct Incomes"])
    );
    const indirectExpLedgers = ledgers.filter((l) =>
      isUnderGroup(l.groupId, -10, ["Indirect Expenses", "Indirect Expense"])
    );
    const indirectIncLedgers = ledgers.filter((l) =>
      isUnderGroup(l.groupId, -11, ["Indirect Income", "Indirect Incomes"])
    );

    const sumCrMinusDr = (list: RawLedger[]) =>
      list.reduce(
        (sum, l) =>
          sum +
          ((debitCreditData[l.id]?.credit || 0) -
            (debitCreditData[l.id]?.debit || 0)),
        0
      );

    const sumDrMinusCr = (list: RawLedger[]) =>
      list.reduce(
        (sum, l) =>
          sum +
          ((debitCreditData[l.id]?.debit || 0) -
            (debitCreditData[l.id]?.credit || 0)),
        0
      );

    const salesAccounts = sumCrMinusDr(salesLedgers);
    const purchaseAccounts = sumDrMinusCr(purchaseLedgers);
    const directExpenses = sumDrMinusCr(directExpLedgers);
    const directIncome = sumCrMinusDr(directIncLedgers);
    const indirectExpenses = sumDrMinusCr(indirectExpLedgers);
    const indirectIncome = sumCrMinusDr(indirectIncLedgers);

    const openingStock =
      showItemWise && stockItems.length > 0
        ? inventoryStats.totalOpeningValue
        : stockLedgerOpening;

    const closingStock =
      showItemWise && stockItems.length > 0
        ? inventoryStats.totalClosingValue
        : openingStock === 0 && purchaseAccounts === 0 && salesAccounts === 0
          ? 0
          : stockLedgerClosing;

    const tradingDebit = openingStock + purchaseAccounts + directExpenses;
    const tradingCredit = salesAccounts + directIncome + closingStock;
    const grossProfit = tradingCredit - tradingDebit;

    const netProfit = grossProfit + indirectIncome - indirectExpenses;
    const operatingCost =
      openingStock + purchaseAccounts + directExpenses + indirectExpenses - closingStock;

    // Balance Sheet Groups
    const rawCurrentAssets = calculateGroupClosingSigned(-5, ["Current Assets"]);
    const currentAssets =
      showItemWise && stockItems.length > 0
        ? rawCurrentAssets - stockLedgerClosing + closingStock
        : rawCurrentAssets;

    const currentLiabilitiesBase = -calculateGroupClosingSigned(-6, [
      "Current Liabilities",
    ]);
    const tdsPayables = -calculateGroupClosingSigned(-19, ["TDS Payables", "TDS Payable"]);
    const currentLiabilities = currentLiabilitiesBase + tdsPayables;

    const workingCapital = currentAssets - currentLiabilities;
    const cashInHand = calculateGroupClosingSigned(-112, ["Cash-in-Hand", "Cash in Hand"]);
    const bankAccounts = calculateGroupClosingSigned(-113, ["Bank Accounts", "Bank Account"]);
    const bankOD = -calculateGroupClosingSigned(-114, ["Bank OD A/c", "Bank OD", "Bank OCC A/c"]);
    const sundryDebtors = calculateGroupClosingSigned(-110, ["Sundry Debtors"]);
    const sundryCreditors = -calculateGroupClosingSigned(-109, ["Sundry Creditors"]);
    const fixedAssets = calculateGroupClosingSigned(-9, ["Fixed Assets"]);
    const investments = calculateGroupClosingSigned(-12, ["Investments"]);
    const capitalAccount = -calculateGroupClosingSigned(-4, ["Capital Account"]);
    const loansLiability = -calculateGroupClosingSigned(-13, ["Loan(Liability)", "Loans (Liability)"]);

    const quickAssets = currentAssets - closingStock;
    const totalEquity = capitalAccount + netProfit;

    return {
      workingCapital,
      currentAssets,
      currentLiabilities,
      cashInHand,
      bankAccounts,
      bankOD,
      sundryDebtors,
      sundryCreditors,
      salesAccounts,
      purchaseAccounts,
      openingStock,
      closingStock,
      directExpenses,
      directIncome,
      indirectExpenses,
      indirectIncome,
      grossProfit,
      netProfit,
      operatingCost,
      fixedAssets,
      investments,
      capitalAccount,
      loansLiability,
      quickAssets,
      totalEquity,
    };
  }, [
    ledgers,
    mergedGroups,
    debitCreditData,
    stockItems,
    inventoryStats,
    isStockInHandLedger,
    getLedgerSignedClosing,
    isUnderGroup,
    calculateGroupClosingSigned,
  ]);

  // Principal Groups Rows (Left Side - Tally Classic Order)
  const principalGroups: PrincipalGroupRow[] = useMemo(() => {
    const wcTurnover =
      metrics.workingCapital > 0
        ? metrics.salesAccounts / metrics.workingCapital
        : null;
    const invTurnover =
      metrics.closingStock > 0
        ? metrics.salesAccounts / metrics.closingStock
        : null;

    return [
      {
        id: "working-capital",
        label: "Working Capital",
        subLabel: "Current Assets − Current Liabilities",
        value: metrics.workingCapital,
        formattedValue: formatINR(metrics.workingCapital),
        isHighlight: true,
        route: "/app/reports/balance-sheet",
      },
      {
        id: "cash-in-hand",
        label: "Cash-in-Hand",
        value: metrics.cashInHand,
        formattedValue: formatDrCr(metrics.cashInHand),
        groupId: -112,
      },
      {
        id: "bank-accounts",
        label: "Bank Accounts",
        value: metrics.bankAccounts,
        formattedValue: formatDrCr(metrics.bankAccounts),
        groupId: -113,
      },
      {
        id: "bank-od",
        label: "Bank OD A/c",
        value: metrics.bankOD,
        formattedValue: formatDrCr(-metrics.bankOD),
        groupId: -114,
      },
      {
        id: "sundry-debtors",
        label: "Sundry Debtors",
        value: metrics.sundryDebtors,
        formattedValue: formatDrCr(metrics.sundryDebtors),
        groupId: -110,
      },
      {
        id: "sundry-creditors",
        label: "Sundry Creditors",
        value: metrics.sundryCreditors,
        formattedValue: formatDrCr(-metrics.sundryCreditors),
        groupId: -109,
      },
      {
        id: "sales-accounts",
        label: "Sales Accounts",
        value: metrics.salesAccounts,
        formattedValue: formatINR(metrics.salesAccounts),
        groupId: -16,
      },
      {
        id: "purchase-accounts",
        label: "Purchase Accounts",
        value: metrics.purchaseAccounts,
        formattedValue: formatINR(metrics.purchaseAccounts),
        groupId: -15,
      },
      {
        id: "stock-in-hand",
        label: "Stock-in-Hand (Closing)",
        value: metrics.closingStock,
        formattedValue: formatINR(metrics.closingStock),
        route: "/app/reports/stock-summary",
      },
      {
        id: "net-profit",
        label: metrics.netProfit >= 0 ? "Net Profit" : "Net Loss",
        value: metrics.netProfit,
        formattedValue: formatINR(Math.abs(metrics.netProfit)),
        isHighlight: true,
        route: "/app/reports/profit-loss",
      },
      {
        id: "wkg-capital-turnover",
        label: "Wkg. Capital Turnover",
        subLabel: "Sales / Working Capital",
        value: wcTurnover,
        formattedValue: wcTurnover !== null ? `${wcTurnover.toFixed(2)} times` : "N/A",
        isRatio: true,
      },
      {
        id: "inventory-turnover",
        label: "Inventory Turnover",
        subLabel: "Sales / Closing Stock",
        value: invTurnover,
        formattedValue: invTurnover !== null ? `${invTurnover.toFixed(2)} times` : "N/A",
        isRatio: true,
      },
    ];
  }, [metrics]);

  // Principal Ratios (Right Side - Tally Classic Ratios + Key Health Benchmarks)
  const principalRatios: RatioItem[] = useMemo(() => {
    const safeDiv = (num: number, den: number) =>
      Math.abs(den) > 0.0001 ? num / den : null;

    // 1. Current Ratio
    const currentRatio =
      metrics.currentLiabilities > 0
        ? safeDiv(metrics.currentAssets, metrics.currentLiabilities)
        : null;
    const currentStatus: HealthStatus =
      currentRatio === null
        ? "neutral"
        : currentRatio >= 1.5
          ? "healthy"
          : currentRatio >= 1.0
            ? "warning"
            : "critical";

    // 2. Quick Ratio
    const quickRatio =
      metrics.currentLiabilities > 0
        ? safeDiv(metrics.quickAssets, metrics.currentLiabilities)
        : null;
    const quickStatus: HealthStatus =
      quickRatio === null
        ? "neutral"
        : quickRatio >= 1.0
          ? "healthy"
          : quickRatio >= 0.7
            ? "warning"
            : "critical";

    // 3. Debt / Equity Ratio
    const debtEquity =
      metrics.totalEquity > 0
        ? safeDiv(metrics.loansLiability, metrics.totalEquity)
        : null;
    const debtStatus: HealthStatus =
      debtEquity === null
        ? "neutral"
        : debtEquity <= 1.0
          ? "healthy"
          : debtEquity <= 2.0
            ? "warning"
            : "critical";

    // 4. Gross Profit %
    const gpPct =
      metrics.salesAccounts > 0
        ? safeDiv(metrics.grossProfit * 100, metrics.salesAccounts)
        : null;
    const gpStatus: HealthStatus =
      gpPct === null
        ? "neutral"
        : gpPct >= 20
          ? "healthy"
          : gpPct >= 5
            ? "warning"
            : "critical";

    // 5. Net Profit %
    const npPct =
      metrics.salesAccounts > 0
        ? safeDiv(metrics.netProfit * 100, metrics.salesAccounts)
        : null;
    const npStatus: HealthStatus =
      npPct === null
        ? "neutral"
        : npPct >= 10
          ? "healthy"
          : npPct > 0
            ? "warning"
            : "critical";

    // 6. Operating Cost %
    const opCostPct =
      metrics.salesAccounts > 0
        ? safeDiv(metrics.operatingCost * 100, metrics.salesAccounts)
        : null;
    const opCostStatus: HealthStatus =
      opCostPct === null
        ? "neutral"
        : opCostPct <= 85
          ? "healthy"
          : opCostPct <= 100
            ? "warning"
            : "critical";

    // 7. Receivable Turnover in Days
    const recvDays =
      metrics.salesAccounts > 0
        ? safeDiv(metrics.sundryDebtors * periodDays, metrics.salesAccounts)
        : null;
    const recvStatus: HealthStatus =
      recvDays === null
        ? "neutral"
        : recvDays <= 45
          ? "healthy"
          : recvDays <= 90
            ? "warning"
            : "critical";

    // 8. Payable Turnover in Days
    const payDays =
      metrics.purchaseAccounts > 0
        ? safeDiv(metrics.sundryCreditors * periodDays, metrics.purchaseAccounts)
        : null;
    const payStatus: HealthStatus =
      payDays === null
        ? "neutral"
        : payDays <= 60
          ? "healthy"
          : payDays <= 120
            ? "warning"
            : "critical";

    // 9. Return on Investment %
    const roiPct =
      metrics.totalEquity > 0
        ? safeDiv(metrics.netProfit * 100, metrics.totalEquity)
        : null;
    const roiStatus: HealthStatus =
      roiPct === null
        ? "neutral"
        : roiPct >= 15
          ? "healthy"
          : roiPct > 0
            ? "warning"
            : "critical";

    // 10. Return on Working Capital %
    const rowcPct =
      metrics.workingCapital > 0
        ? safeDiv(metrics.netProfit * 100, metrics.workingCapital)
        : null;
    const rowcStatus: HealthStatus =
      rowcPct === null
        ? "neutral"
        : rowcPct >= 15
          ? "healthy"
          : rowcPct > 0
            ? "warning"
            : "critical";

    return [
      {
        id: "current-ratio",
        name: "Current Ratio",
        category: "Liquidity",
        displayValue: currentRatio !== null ? `${currentRatio.toFixed(2)} : 1` : "N/A",
        numericValue: currentRatio,
        formula: "Current Assets / Current Liabilities",
        numeratorLabel: "Current Assets",
        numeratorValue: metrics.currentAssets,
        denominatorLabel: "Current Liabilities",
        denominatorValue: metrics.currentLiabilities,
        idealText: "Ideal: 1.50 : 1 to 2.00 : 1",
        status: currentStatus,
        interpretation:
          "Measures short-term liquidity — your ability to meet liabilities due within a year using current assets.",
      },
      {
        id: "quick-ratio",
        name: "Quick Ratio",
        category: "Liquidity",
        displayValue: quickRatio !== null ? `${quickRatio.toFixed(2)} : 1` : "N/A",
        numericValue: quickRatio,
        formula: "(Current Assets − Closing Stock) / Current Liabilities",
        numeratorLabel: "Quick Assets (excl. Stock)",
        numeratorValue: metrics.quickAssets,
        denominatorLabel: "Current Liabilities",
        denominatorValue: metrics.currentLiabilities,
        idealText: "Ideal: ≥ 1.00 : 1",
        status: quickStatus,
        interpretation:
          "Acid-test ratio showing immediate payment capacity without relying on selling inventory.",
      },
      {
        id: "debt-equity",
        name: "Debt / Equity Ratio",
        category: "Solvency",
        displayValue: debtEquity !== null ? `${debtEquity.toFixed(2)} : 1` : "N/A",
        numericValue: debtEquity,
        formula: "Loans (Liability) / (Capital Account + Net Profit)",
        numeratorLabel: "Loans (Liability)",
        numeratorValue: metrics.loansLiability,
        denominatorLabel: "Owner's Equity (Capital + Profit)",
        denominatorValue: metrics.totalEquity,
        idealText: "Ideal: ≤ 1.00 : 1 (Max 2 : 1)",
        status: debtStatus,
        interpretation:
          "Indicates financial leverage — how much external debt the business carries relative to owner's equity.",
      },
      {
        id: "gross-profit-pct",
        name: "Gross Profit %",
        category: "Profitability",
        displayValue: gpPct !== null ? `${gpPct.toFixed(2)} %` : "N/A",
        numericValue: gpPct,
        formula: "(Gross Profit / Sales Accounts) × 100",
        numeratorLabel: "Gross Profit",
        numeratorValue: metrics.grossProfit,
        denominatorLabel: "Sales Accounts",
        denominatorValue: metrics.salesAccounts,
        idealText: "Higher is better",
        status: gpStatus,
        interpretation:
          "Percentage of sales revenue retained after deducting direct cost of goods sold and direct expenses.",
      },
      {
        id: "net-profit-pct",
        name: "Net Profit %",
        category: "Profitability",
        displayValue: npPct !== null ? `${npPct.toFixed(2)} %` : "N/A",
        numericValue: npPct,
        formula: "(Net Profit / Sales Accounts) × 100",
        numeratorLabel: "Net Profit",
        numeratorValue: metrics.netProfit,
        denominatorLabel: "Sales Accounts",
        denominatorValue: metrics.salesAccounts,
        idealText: "Ideal: ≥ 10%",
        status: npStatus,
        interpretation:
          "Final bottom-line profit margin earned on total sales after all direct and indirect expenses.",
      },
      {
        id: "operating-cost-pct",
        name: "Operating Cost %",
        category: "Efficiency",
        displayValue: opCostPct !== null ? `${opCostPct.toFixed(2)} %` : "N/A",
        numericValue: opCostPct,
        formula:
          "((Opening Stock + Purchases + Direct + Indirect Exp − Closing Stock) / Sales) × 100",
        numeratorLabel: "Total Operating Cost",
        numeratorValue: metrics.operatingCost,
        denominatorLabel: "Sales Accounts",
        denominatorValue: metrics.salesAccounts,
        idealText: "Lower is better (< 85%)",
        status: opCostStatus,
        interpretation:
          "Share of sales consumed by purchases and operating expenses. Lower percentage indicates stronger cost control.",
      },
      {
        id: "receivable-turnover",
        name: "Receivable Turnover in Days",
        category: "Efficiency",
        displayValue:
          recvDays !== null ? `${Math.round(recvDays)} Days` : "N/A",
        numericValue: recvDays,
        formula: `(Sundry Debtors / Sales Accounts) × ${periodDays}`,
        numeratorLabel: "Sundry Debtors",
        numeratorValue: metrics.sundryDebtors,
        denominatorLabel: "Sales Accounts",
        denominatorValue: metrics.salesAccounts,
        idealText: "Ideal: ≤ 45 Days",
        status: recvStatus,
        interpretation:
          "Average number of days it takes to collect payment from customers after making a credit sale.",
      },
      {
        id: "payable-turnover",
        name: "Payable Turnover in Days",
        category: "Efficiency",
        displayValue:
          payDays !== null ? `${Math.round(payDays)} Days` : "N/A",
        numericValue: payDays,
        formula: `(Sundry Creditors / Purchase Accounts) × ${periodDays}`,
        numeratorLabel: "Sundry Creditors",
        numeratorValue: metrics.sundryCreditors,
        denominatorLabel: "Purchase Accounts",
        denominatorValue: metrics.purchaseAccounts,
        idealText: "Benchmark: 30–60 Days",
        status: payStatus,
        interpretation:
          "Average number of days taken to pay suppliers for purchases.",
      },
      {
        id: "roi-pct",
        name: "Return on Investment %",
        category: "Profitability",
        displayValue: roiPct !== null ? `${roiPct.toFixed(2)} %` : "N/A",
        numericValue: roiPct,
        formula: "(Net Profit / (Capital Account + Net Profit)) × 100",
        numeratorLabel: "Net Profit",
        numeratorValue: metrics.netProfit,
        denominatorLabel: "Capital + Net Profit",
        denominatorValue: metrics.totalEquity,
        idealText: "Ideal: ≥ 15%",
        status: roiStatus,
        interpretation:
          "Measures return generated on the owner's capital invested in the business.",
      },
      {
        id: "rowc-pct",
        name: "Return on Working Capital %",
        category: "Profitability",
        displayValue: rowcPct !== null ? `${rowcPct.toFixed(2)} %` : "N/A",
        numericValue: rowcPct,
        formula: "(Net Profit / Working Capital) × 100",
        numeratorLabel: "Net Profit",
        numeratorValue: metrics.netProfit,
        denominatorLabel: "Working Capital",
        denominatorValue: metrics.workingCapital,
        idealText: "Higher is better",
        status: rowcStatus,
        interpretation:
          "Shows how effectively working capital is being deployed to generate net profits.",
      },
    ];
  }, [metrics, periodDays]);

  const selectedRatio = useMemo(
    () =>
      principalRatios.find((r) => r.id === selectedRatioId) ||
      principalRatios[0],
    [principalRatios, selectedRatioId]
  );

  // Quick FY presets
  const applyPresetFY = (offset: number) => {
    const ref = new Date();
    ref.setFullYear(ref.getFullYear() + offset);
    const fy = getFinancialYearRange(ref);
    setFromDate(fy.fromDate);
    setToDate(fy.toDate);
  };

  const resetPeriod = () => {
    setFromDate("");
    setToDate("");
  };

  const handleGroupNavigation = (row: PrincipalGroupRow) => {
    if (row.route) {
      navigate(row.route);
    } else if (row.groupId !== undefined) {
      navigate(`/app/reports/sub-group-summary/${row.groupId}`, {
        state: { groupName: row.label },
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current || isDownloading) return;
    setIsDownloading(true);

    const element = reportRef.current;
    const width = element.offsetWidth || 1200;
    const scale = 2;

    const wrapper = document.createElement("div");
    wrapper.style.cssText = `position: fixed; left: -99999px; top: 0; width: ${width}px; z-index: -9999; pointer-events: none; opacity: 1;`;

    try {
      const clone = element.cloneNode(true) as HTMLElement;
      clone.style.width = `${width}px`;

      const cloneHeader = clone.querySelector(
        "#ratio-analysis-company-header"
      ) as HTMLElement;
      if (cloneHeader) {
        cloneHeader.style.display = "block";
        cloneHeader.classList.remove("hidden");
      }

      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      const height = clone.offsetHeight;
      const imgData = await domtoimage.toPng(clone, {
        bgcolor: isDark ? "#111827" : "#ffffff",
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

      const sanitizedName = (companyName || "Company").replace(
        /[^a-zA-Z0-9]/g,
        "_"
      );
      pdf.save(`Ratio_Analysis_${sanitizedName}.pdf`);
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

  const handleExportCSV = () => {
    const lines: string[] = [
      `"${companyName} - Ratio Analysis"`,
      `"Period","${fromDate && toDate ? `${fromDate} to ${toDate}` : "All Time (Current Books)"}"`,
      "",
      `"PRINCIPAL GROUPS","VALUE","","PRINCIPAL RATIOS","VALUE","FORMULA","IDEAL"`,
    ];

    const maxLen = Math.max(principalGroups.length, principalRatios.length);
    for (let i = 0; i < maxLen; i++) {
      const g = principalGroups[i];
      const r = principalRatios[i];
      const row = [
        g ? `"${g.label}"` : '""',
        g ? `"${g.formattedValue}"` : '""',
        '""',
        r ? `"${r.name}"` : '""',
        r ? `"${r.displayValue}"` : '""',
        r ? `"${r.formula}"` : '""',
        r ? `"${r.idealText}"` : '""',
      ];
      lines.push(row.join(","));
    }

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Ratio_Analysis_${companyName.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: HealthStatus) => {
    switch (status) {
      case "healthy":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <CheckCircle2 size={11} /> Healthy
          </span>
        );
      case "warning":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            <AlertCircle size={11} /> Moderate
          </span>
        );
      case "critical":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
            <TrendingDown size={11} /> Attention
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            <MinusCircle size={11} /> N/A
          </span>
        );
    }
  };

  const currentRatioItem = principalRatios.find((r) => r.id === "current-ratio");
  const gpRatioItem = principalRatios.find((r) => r.id === "gross-profit-pct");
  const npRatioItem = principalRatios.find((r) => r.id === "net-profit-pct");

  return (
    <div
      className={`pt-[56px] px-4 min-h-[calc(100vh-64px)] pb-12 ${
        isDark ? "bg-gray-900 text-gray-100" : "bg-gray-50 text-gray-800"
      }`}
    >
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

      {/* Top Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pt-2 border-b border-gray-200 dark:border-gray-800 pb-4 print:hidden">
        <div className="flex items-center">
          <button
            type="button"
            title="Back to Reports"
            onClick={() => navigate("/app/reports")}
            className={`mr-3 p-2 rounded-lg transition-colors ${
              isDark
                ? "bg-gray-800 hover:bg-gray-700 text-white border border-gray-700"
                : "bg-white hover:bg-gray-100 text-gray-700 border shadow-sm"
            }`}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="text-blue-600 dark:text-blue-400" size={26} />
              Ratio Analysis
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {companyName} •{" "}
              {fromDate && toDate
                ? `Period: ${fromDate} to ${toDate}`
                : "Current Books (All Vouchers & Balances)"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Switcher */}
          <div
            className={`inline-flex rounded-lg p-1 border ${
              isDark
                ? "bg-gray-800 border-gray-700"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <button
              type="button"
              onClick={() => setViewMode("split")}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === "split"
                  ? "bg-blue-600 text-white"
                  : isDark
                    ? "text-gray-300 hover:bg-gray-700"
                    : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Columns2 size={14} /> Tally Split
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === "cards"
                  ? "bg-blue-600 text-white"
                  : isDark
                    ? "text-gray-300 hover:bg-gray-700"
                    : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <LayoutGrid size={14} /> Insights
            </button>
          </div>

          <button
            type="button"
            title="Period Filter"
            onClick={() => setShowFilterPanel((v) => !v)}
            className={`px-3 py-2 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              showFilterPanel || (fromDate && toDate)
                ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-300"
                : isDark
                  ? "bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-200"
                  : "bg-white border-gray-300 hover:bg-gray-100 text-gray-700 shadow-sm"
            }`}
          >
            <Filter size={15} /> Period
          </button>

          <button
            type="button"
            title="Refresh Data"
            onClick={fetchRatioData}
            disabled={loading}
            className={`p-2 rounded-lg border transition-colors ${
              isDark
                ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                : "bg-white border-gray-300 hover:bg-gray-100 shadow-sm"
            }`}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>

          <button
            type="button"
            title="Export CSV"
            onClick={handleExportCSV}
            className={`px-3 py-2 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
              isDark
                ? "bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-200"
                : "bg-white border-gray-300 hover:bg-gray-100 text-gray-700 shadow-sm"
            }`}
          >
            <FileSpreadsheet size={15} /> CSV
          </button>

          <button
            type="button"
            title="Print Report"
            onClick={handlePrint}
            className={`p-2 rounded-lg border transition-colors ${
              isDark
                ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                : "bg-white border-gray-300 hover:bg-gray-100 shadow-sm"
            }`}
          >
            <Printer size={16} />
          </button>

          <button
            type="button"
            title="Download PDF"
            disabled={isDownloading}
            onClick={handleDownloadPDF}
            className={`px-3 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 transition-colors shadow-sm ${
              isDownloading ? "opacity-60 cursor-not-allowed" : ""
            }`}
          >
            {isDownloading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Download size={15} />
            )}
            PDF
          </button>
        </div>
      </div>

      {/* Period Filter Panel */}
      {showFilterPanel && (
        <div
          className={`p-4 mb-6 rounded-xl border print:hidden ${
            isDark
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 max-w-xl">
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">
                  From Date
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    isDark
                      ? "bg-gray-700 border-gray-600 text-white"
                      : "bg-white border-gray-300 text-gray-800"
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">
                  To Date
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    isDark
                      ? "bg-gray-700 border-gray-600 text-white"
                      : "bg-white border-gray-300 text-gray-800"
                  }`}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => applyPresetFY(-1)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border ${
                  isDark
                    ? "border-gray-600 hover:bg-gray-700"
                    : "border-gray-300 hover:bg-gray-100"
                }`}
              >
                Prev FY
              </button>
              <button
                type="button"
                onClick={() => applyPresetFY(0)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border ${
                  isDark
                    ? "border-gray-600 hover:bg-gray-700"
                    : "border-gray-300 hover:bg-gray-100"
                }`}
              >
                Current FY
              </button>
              <button
                type="button"
                onClick={resetPeriod}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                All Time
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading & Error */}
      {loading && (
        <div
          className={`p-10 rounded-xl border flex flex-col items-center justify-center gap-3 ${
            isDark
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <Loader2 size={28} className="animate-spin text-blue-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Calculating financial groups and ratios...
          </p>
        </div>
      )}

      {!loading && error && (
        <div className="p-5 rounded-xl border border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle size={18} /> {error}
          </div>
          <button
            type="button"
            onClick={fetchRatioData}
            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Report Area */}
      {!loading && !error && (
        <div ref={reportRef} id="ratio-analysis-report-area" className="space-y-6">
          {/* Print / PDF Only Company Header */}
          <div
            id="ratio-analysis-company-header"
            className={`hidden print:block mb-6 p-6 rounded-lg text-center ${
              isDark ? "bg-gray-800" : "bg-white shadow"
            }`}
          >
            <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wide">
              {companyName}
            </h1>
            {companyAddress && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
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
            <hr className="my-4 border-t-2 border-gray-300 dark:border-gray-600" />
            <h2 className="text-lg font-bold">Ratio Analysis</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {fromDate && toDate
                ? `Period: ${fromDate} to ${toDate}`
                : `As on ${new Date().toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}`}
            </p>
          </div>

          {/* Top 4 KPI Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              className={`p-4 rounded-xl border ${
                isDark
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-medium">
                <span>Working Capital</span>
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-[10px] font-bold">
                  CA − CL
                </span>
              </div>
              <div
                className={`text-2xl font-bold font-mono mt-2 ${
                  metrics.workingCapital >= 0
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {formatINR(metrics.workingCapital)}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                CA: {formatINR(metrics.currentAssets)} | CL:{" "}
                {formatINR(metrics.currentLiabilities)}
              </p>
            </div>

            <div
              className={`p-4 rounded-xl border ${
                isDark
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-medium">
                <span>Current Ratio</span>
                {currentRatioItem && getStatusBadge(currentRatioItem.status)}
              </div>
              <div className="text-2xl font-bold font-mono mt-2">
                {currentRatioItem?.displayValue || "N/A"}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                {currentRatioItem?.idealText}
              </p>
            </div>

            <div
              className={`p-4 rounded-xl border ${
                isDark
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-medium">
                <span>Gross Profit %</span>
                {gpRatioItem && getStatusBadge(gpRatioItem.status)}
              </div>
              <div className="text-2xl font-bold font-mono mt-2">
                {gpRatioItem?.displayValue || "N/A"}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                Gross Profit: {formatINR(metrics.grossProfit)}
              </p>
            </div>

            <div
              className={`p-4 rounded-xl border ${
                isDark
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-medium">
                <span>Net Profit %</span>
                {npRatioItem && getStatusBadge(npRatioItem.status)}
              </div>
              <div
                className={`text-2xl font-bold font-mono mt-2 ${
                  metrics.netProfit >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {npRatioItem?.displayValue || "N/A"}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                {metrics.netProfit >= 0 ? "Net Profit" : "Net Loss"}:{" "}
                {formatINR(Math.abs(metrics.netProfit))}
              </p>
            </div>
          </div>

          {viewMode === "split" ? (
            <>
              {/* Classic Tally 50% - 50% Split Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Side: Principal Groups */}
                <div
                  className={`rounded-xl border overflow-hidden ${
                    isDark
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-200 shadow-sm"
                  }`}
                >
                  <div
                    className={`px-5 py-3.5 border-b flex items-center justify-between ${
                      isDark
                        ? "bg-gray-800/80 border-gray-700"
                        : "bg-blue-50/70 border-gray-200"
                    }`}
                  >
                    <div>
                      <h2 className="text-base font-bold text-blue-700 dark:text-blue-400">
                        Principal Groups
                      </h2>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Click any group to drill down into detailed ledger summary
                      </p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Amount / Ratio
                    </span>
                  </div>

                  <div className="divide-y divide-gray-200 dark:divide-gray-700/70">
                    {principalGroups.map((row) => {
                      const clickable = Boolean(row.route || row.groupId !== undefined);
                      return (
                        <div
                          key={row.id}
                          onClick={() => clickable && handleGroupNavigation(row)}
                          className={`px-5 py-3 flex items-center justify-between transition-colors ${
                            row.isHighlight
                              ? isDark
                                ? "bg-gray-750/60"
                                : "bg-slate-50/80"
                              : ""
                          } ${
                            clickable
                              ? isDark
                                ? "cursor-pointer hover:bg-blue-900/30"
                                : "cursor-pointer hover:bg-blue-50"
                              : ""
                          }`}
                        >
                          <div className="min-w-0 pr-3">
                            <div
                              className={`text-sm flex items-center gap-1.5 ${
                                row.isHighlight ? "font-bold" : "font-medium"
                              } ${
                                clickable
                                  ? "text-blue-600 dark:text-blue-400"
                                  : ""
                              }`}
                            >
                              <span>{row.label}</span>
                              {clickable && (
                                <ChevronRight
                                  size={14}
                                  className="opacity-50 print:hidden"
                                />
                              )}
                            </div>
                            {row.subLabel && (
                              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                {row.subLabel}
                              </div>
                            )}
                          </div>

                          <div
                            className={`text-right font-mono text-sm whitespace-nowrap ${
                              row.isHighlight ? "font-bold" : "font-semibold"
                            }`}
                          >
                            {row.formattedValue}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Side: Principal Ratios */}
                <div
                  className={`rounded-xl border overflow-hidden ${
                    isDark
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-200 shadow-sm"
                  }`}
                >
                  <div
                    className={`px-5 py-3.5 border-b flex items-center justify-between ${
                      isDark
                        ? "bg-gray-800/80 border-gray-700"
                        : "bg-emerald-50/70 border-gray-200"
                    }`}
                  >
                    <div>
                      <h2 className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                        Principal Ratios
                      </h2>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Click any ratio to inspect formula &amp; calculation breakdown
                      </p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Value
                    </span>
                  </div>

                  <div className="divide-y divide-gray-200 dark:divide-gray-700/70">
                    {principalRatios.map((ratio) => {
                      const isSelected = selectedRatio?.id === ratio.id;
                      return (
                        <div
                          key={ratio.id}
                          onClick={() => setSelectedRatioId(ratio.id)}
                          className={`px-5 py-3 flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected
                              ? isDark
                                ? "bg-emerald-950/50 border-l-4 border-l-emerald-500"
                                : "bg-emerald-50/90 border-l-4 border-l-emerald-600"
                              : isDark
                                ? "hover:bg-gray-700/60"
                                : "hover:bg-gray-50"
                          }`}
                        >
                          <div className="min-w-0 pr-3">
                            <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                              <span>{ratio.name}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 font-medium">
                                {ratio.category}
                              </span>
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                              {ratio.idealText}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="hidden sm:block print:hidden">
                              {getStatusBadge(ratio.status)}
                            </div>
                            <span className="font-mono font-bold text-sm min-w-[78px] text-right">
                              {ratio.displayValue}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Formula & Calculation Breakdown Panel */}
              {selectedRatio && (
                <div
                  className={`p-5 rounded-xl border print:hidden ${
                    isDark
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-200 shadow-sm"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <Info
                        size={18}
                        className="text-blue-600 dark:text-blue-400 shrink-0"
                      />
                      <h3 className="font-bold text-base">
                        {selectedRatio.name} — Calculation Breakdown
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(selectedRatio.status)}
                      <span className="font-mono font-bold text-base text-blue-600 dark:text-blue-400">
                        {selectedRatio.displayValue}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div
                      className={`p-3.5 rounded-lg border ${
                        isDark
                          ? "bg-gray-900/50 border-gray-700"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                        Formula
                      </div>
                      <div className="text-xs sm:text-sm font-mono font-semibold mt-1">
                        {selectedRatio.formula}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
                        {selectedRatio.idealText}
                      </div>
                    </div>

                    <div
                      className={`p-3.5 rounded-lg border ${
                        isDark
                          ? "bg-gray-900/50 border-gray-700"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                        Inputs from Your Books
                      </div>
                      <div className="mt-1.5 space-y-1 text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-600 dark:text-gray-300">
                            {selectedRatio.numeratorLabel}:
                          </span>
                          <span className="font-mono font-bold">
                            {formatINR(selectedRatio.numeratorValue)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-600 dark:text-gray-300">
                            {selectedRatio.denominatorLabel}:
                          </span>
                          <span className="font-mono font-bold">
                            {formatINR(selectedRatio.denominatorValue)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`p-3.5 rounded-lg border ${
                        isDark
                          ? "bg-gray-900/50 border-gray-700"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                        Meaning &amp; Insights
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                        {selectedRatio.interpretation}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Insights Card Grid Mode */
            <div className="space-y-6">
              {(["Liquidity", "Solvency", "Profitability", "Efficiency"] as const).map(
                (category) => {
                  const items = principalRatios.filter(
                    (r) => r.category === category
                  );
                  return (
                    <div key={category} className="space-y-3">
                      <h2 className="text-lg font-bold flex items-center gap-2">
                        <span className="w-2 h-5 rounded-full bg-blue-600 inline-block" />
                        {category} Ratios
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {items.map((ratio) => (
                          <div
                            key={ratio.id}
                            className={`p-5 rounded-xl border flex flex-col justify-between ${
                              isDark
                                ? "bg-gray-800 border-gray-700"
                                : "bg-white border-gray-200 shadow-sm"
                            }`}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="font-bold text-base">
                                  {ratio.name}
                                </h3>
                                {getStatusBadge(ratio.status)}
                              </div>
                              <div className="text-3xl font-extrabold font-mono mt-3 text-blue-600 dark:text-blue-400">
                                {ratio.displayValue}
                              </div>
                              <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-1.5">
                                {ratio.formula}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                                {ratio.interpretation}
                              </p>
                            </div>

                            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs space-y-1">
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">
                                  {ratio.numeratorLabel}
                                </span>
                                <span className="font-mono font-semibold">
                                  {formatINR(ratio.numeratorValue)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">
                                  {ratio.denominatorLabel}
                                </span>
                                <span className="font-mono font-semibold">
                                  {formatINR(ratio.denominatorValue)}
                                </span>
                              </div>
                              <div className="text-[11px] text-gray-500 dark:text-gray-400 pt-1">
                                {ratio.idealText}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}

          {/* Supporting Balance Sheet & P&L Summary Footer */}
          <div
            className={`p-4 rounded-xl border text-xs grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 ${
              isDark
                ? "bg-gray-800/70 border-gray-700"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <div>
              <span className="text-gray-500 dark:text-gray-400 block">
                Capital Account
              </span>
              <span className="font-mono font-bold text-sm">
                {formatINR(metrics.capitalAccount)}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400 block">
                Loans (Liability)
              </span>
              <span className="font-mono font-bold text-sm">
                {formatINR(metrics.loansLiability)}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400 block">
                Fixed Assets
              </span>
              <span className="font-mono font-bold text-sm">
                {formatINR(metrics.fixedAssets)}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400 block">
                Current Assets
              </span>
              <span className="font-mono font-bold text-sm">
                {formatINR(metrics.currentAssets)}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400 block">
                Current Liabilities
              </span>
              <span className="font-mono font-bold text-sm">
                {formatINR(metrics.currentLiabilities)}
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400 block">
                Gross Profit
              </span>
              <span className="font-mono font-bold text-sm">
                {formatINR(metrics.grossProfit)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RatioAnalysis;
