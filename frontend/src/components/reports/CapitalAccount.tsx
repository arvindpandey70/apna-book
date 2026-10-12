import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";
import { useCompany } from "../../context/CompanyContext";
import { useFinancialYear, getAvailableFinYears } from "../../hooks/useFinancialYear";
import { allSystemGroups } from "../../constants/ledgerGroups";
import {
  ArrowLeft,
  Printer,
  Download,
  Search,
  Plus,
  Edit3,
  Users,
  PieChart,
  RefreshCw,
  Calculator,
  CheckCircle,
  X,
  TrendingUp,
  DollarSign,
  Info,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import * as XLSX from "xlsx-js-style";

export interface PartnerCapitalRow {
  id: string;
  ledgerId: number;
  partnerName: string; // Name of Partner (Real Ledger Name)
  profitShareRatio: number; // Profit Share Ratio (%)
  openingBalance: number; // Opening Capital Balance
  additionalCapital: number; // Additional Capital (Capital Introduced / ******)
  shareOfProfit: number; // Share of profit
  capitalAdjust: number; // Capital Adjust
  capitalDrawings: number; // Capital Drw*** (Drawings)
  closingBalance: number; // Closing Capital Balance
  notes?: string;
}

const formatINR = (val: number): string => {
  if (val === undefined || val === null || isNaN(val)) return "0.00";
  return Number(val).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const CapitalAccount: React.FC = () => {
  const { theme, companyInfo, ledgers: contextLedgers = [] } = useAppContext();
  const { activeCompanyId } = useCompany();
  const { selectedFinYear, setSelectedFinYear } = useFinancialYear();
  const navigate = useNavigate();

  const isDark = theme === "dark";

  // Tenant parameters
  const companyId = activeCompanyId ?? localStorage.getItem("company_id") ?? "";
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

  const storageKey = `CAPITAL_ACCOUNT_CONFIG_${companyId || "default"}_${selectedFinYear}`;

  const [partners, setPartners] = useState<PartnerCapitalRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Edit Modal State
  const [editingPartner, setEditingPartner] = useState<PartnerCapitalRow | null>(null);
  const [formData, setFormData] = useState({
    partnerName: "",
    profitShareRatio: "",
    openingBalance: "",
    additionalCapital: "",
    shareOfProfit: "",
    capitalAdjust: "",
    capitalDrawings: "",
    notes: "",
  });

  // Distribute Profit Modal
  const [isDistributeModalOpen, setIsDistributeModalOpen] = useState(false);
  const [totalFirmProfit, setTotalFirmProfit] = useState<string>("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const calculateClosing = (
    op: number,
    add: number,
    profit: number,
    adj: number,
    drw: number
  ): number => {
    return (op || 0) + (add || 0) + (profit || 0) + (adj || 0) - (drw || 0);
  };

  // Fetch real Capital Account ledgers from Backend
  const fetchCapitalLedgers = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      setPartners([]);
      return;
    }

    setLoading(true);

    try {
      // 1. Fetch Ledger Groups to find Capital Account and all its child groups
      let allGroups: any[] = [];
      try {
        const groupRes = await fetch(
          `${import.meta.env.VITE_API_URL}/api/ledger-groups?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        if (groupRes.ok) {
          allGroups = await groupRes.json();
        }
      } catch (gErr) {
        console.warn("Could not fetch ledger groups, falling back to system groups:", gErr);
      }

      // Merge with system groups
      const mergedGroups = [...allSystemGroups, ...allGroups];

      // Capital Account Group ID is -4 in system groups
      // Find all groups whose name is Capital Account or parent is -4 or type is capital
      const capitalGroupIds = new Set<number>([-4]);
      mergedGroups.forEach((g: any) => {
        const gId = Number(g.id);
        const gParent = Number(g.parent);
        const gName = String(g.name || "").trim().toLowerCase();
        const gType = String(g.type || g.nature || "").trim().toLowerCase();

        if (
          gId === -4 ||
          gParent === -4 ||
          gName === "capital account" ||
          gName.includes("capital") ||
          gType === "capital"
        ) {
          capitalGroupIds.add(gId);
        }
      });

      // Also include any secondary child groups
      mergedGroups.forEach((g: any) => {
        const gParent = Number(g.parent);
        if (capitalGroupIds.has(gParent)) {
          capitalGroupIds.add(Number(g.id));
        }
      });

      // 2. Fetch all Ledgers for this company
      let rawLedgers: any[] = [];
      try {
        const ledgerRes = await fetch(
          `${import.meta.env.VITE_API_URL}/api/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        if (ledgerRes.ok) {
          const lData = await ledgerRes.json();
          rawLedgers = Array.isArray(lData) ? lData : lData.data || [];
        }
      } catch (lErr) {
        console.warn("Ledger API error, checking context:", lErr);
      }

      // Fallback to AppContext ledgers if API returned empty
      if (rawLedgers.length === 0 && contextLedgers.length > 0) {
        rawLedgers = contextLedgers;
      }

      // 3. Filter strictly for ledgers under Capital Account
      const realCapitalLedgers = rawLedgers.filter((l: any) => {
        const gId = Number(l.groupId || l.group_id);
        const gName = String(l.groupName || l.group_name || "").toLowerCase();
        const gType = String(l.groupType || l.group_type || "").toLowerCase();
        return (
          capitalGroupIds.has(gId) ||
          gName === "capital account" ||
          (gName.includes("capital") && !gName.includes("working capital")) ||
          gType === "capital"
        );
      });

      // 4. Fetch real transaction movements (Debit & Credit) for these ledgers
      let debitCreditMap: Record<number, { debit: number; credit: number }> = {};
      if (realCapitalLedgers.length > 0) {
        try {
          const ledgerIds = realCapitalLedgers.map((l: any) => l.id).join(",");
          const transUrl = `${import.meta.env.VITE_API_URL}/api/group?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&ledgerIds=${ledgerIds}`;
          const transRes = await fetch(transUrl);
          if (transRes.ok) {
            const transData = await transRes.json();
            if (transData.success && transData.data) {
              debitCreditMap = transData.data;
            }
          }
        } catch (tErr) {
          console.warn("Could not fetch debit/credit transactions:", tErr);
        }
      }

      // 5. Load user saved config / adjustments for these real ledgers
      let savedConfigs: Record<string, any> = {};
      try {
        const savedStr = localStorage.getItem(storageKey);
        if (savedStr) {
          savedConfigs = JSON.parse(savedStr);
        }
      } catch (sErr) {
        console.warn("Failed to parse saved capital account configs:", sErr);
      }

      // Calculate equal ratio by default if not set
      const defaultRatio =
        realCapitalLedgers.length > 0
          ? Math.round((100 / realCapitalLedgers.length) * 100) / 100
          : 0;

      // 6. Map to PartnerCapitalRow list
      const rows: PartnerCapitalRow[] = realCapitalLedgers.map((l: any, idx: number) => {
        const ledgerId = Number(l.id);
        const saved = savedConfigs[String(ledgerId)] || savedConfigs[l.name] || {};

        const openingBal = parseFloat(l.openingBalance || l.opening_balance || 0) || 0;
        const movementCredit = debitCreditMap[ledgerId]?.credit || 0;
        const movementDebit = debitCreditMap[ledgerId]?.debit || 0;

        const ratio =
          saved.profitShareRatio !== undefined
            ? parseFloat(saved.profitShareRatio)
            : idx === realCapitalLedgers.length - 1
            ? Math.round((100 - defaultRatio * (realCapitalLedgers.length - 1)) * 100) / 100
            : defaultRatio;

        const additionalCapital =
          saved.additionalCapital !== undefined
            ? parseFloat(saved.additionalCapital)
            : movementCredit;

        const shareOfProfit = parseFloat(saved.shareOfProfit || 0) || 0;
        const capitalAdjust = parseFloat(saved.capitalAdjust || 0) || 0;

        const capitalDrawings =
          saved.capitalDrawings !== undefined
            ? parseFloat(saved.capitalDrawings)
            : movementDebit;

        const closingBalance = calculateClosing(
          openingBal,
          additionalCapital,
          shareOfProfit,
          capitalAdjust,
          capitalDrawings
        );

        return {
          id: `real-ledger-${ledgerId}`,
          ledgerId,
          partnerName: l.name,
          profitShareRatio: ratio,
          openingBalance: openingBal,
          additionalCapital,
          shareOfProfit,
          capitalAdjust,
          capitalDrawings,
          closingBalance,
          notes: saved.notes || `Capital Ledger ID: ${ledgerId}`,
        };
      });

      setPartners(rows);
    } catch (err: any) {
      console.error("Error fetching Capital Account ledgers:", err);
      setPartners([]);
      showToast("Error loading ledgers: " + (err.message || "Failed to fetch"));
    } finally {
      setLoading(false);
    }
  }, [companyId, ownerType, ownerId, selectedFinYear, storageKey, contextLedgers]);

  useEffect(() => {
    fetchCapitalLedgers();
  }, [fetchCapitalLedgers]);

  // Save changes for real ledgers
  const savePartnersConfig = (updatedPartners: PartnerCapitalRow[]) => {
    setPartners(updatedPartners);
    try {
      const configMap: Record<string, any> = {};
      updatedPartners.forEach((p) => {
        configMap[String(p.ledgerId)] = {
          profitShareRatio: p.profitShareRatio,
          additionalCapital: p.additionalCapital,
          shareOfProfit: p.shareOfProfit,
          capitalAdjust: p.capitalAdjust,
          capitalDrawings: p.capitalDrawings,
          notes: p.notes,
        };
      });
      localStorage.setItem(storageKey, JSON.stringify(configMap));
    } catch (e) {
      console.error("Failed to save capital configs to localStorage:", e);
    }
  };

  // Open Edit Modal for a real ledger
  const handleOpenEditModal = (partner: PartnerCapitalRow) => {
    setEditingPartner(partner);
    setFormData({
      partnerName: partner.partnerName,
      profitShareRatio: String(partner.profitShareRatio || 0),
      openingBalance: String(partner.openingBalance || 0),
      additionalCapital: String(partner.additionalCapital || 0),
      shareOfProfit: String(partner.shareOfProfit || 0),
      capitalAdjust: String(partner.capitalAdjust || 0),
      capitalDrawings: String(partner.capitalDrawings || 0),
      notes: partner.notes || "",
    });
  };

  // Save Edit Modal
  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPartner) return;

    const op = parseFloat(formData.openingBalance) || 0;
    const add = parseFloat(formData.additionalCapital) || 0;
    const profit = parseFloat(formData.shareOfProfit) || 0;
    const adj = parseFloat(formData.capitalAdjust) || 0;
    const drw = parseFloat(formData.capitalDrawings) || 0;
    const ratio = parseFloat(formData.profitShareRatio) || 0;
    const closing = calculateClosing(op, add, profit, adj, drw);

    const updated = partners.map((p) =>
      p.ledgerId === editingPartner.ledgerId
        ? {
            ...p,
            profitShareRatio: ratio,
            openingBalance: op,
            additionalCapital: add,
            shareOfProfit: profit,
            capitalAdjust: adj,
            capitalDrawings: drw,
            closingBalance: closing,
            notes: formData.notes,
          }
        : p
    );

    savePartnersConfig(updated);
    setEditingPartner(null);
    showToast(`Updated "${editingPartner.partnerName}" successfully!`);
  };

  // Distribute Net Profit by Profit Share Ratio
  const handleDistributeProfit = (e: React.FormEvent) => {
    e.preventDefault();
    const total = parseFloat(totalFirmProfit);
    if (isNaN(total)) {
      showToast("Please enter a valid total profit amount");
      return;
    }

    const totalRatio = partners.reduce((sum, p) => sum + (p.profitShareRatio || 0), 0);
    if (totalRatio === 0) {
      showToast("Total Profit Share Ratio across partners is 0%. Please set ratios first.");
      return;
    }

    const updated = partners.map((p) => {
      const ratio = p.profitShareRatio || 0;
      const allocatedProfit = Math.round((total * (ratio / totalRatio)) * 100) / 100;
      const closing = calculateClosing(
        p.openingBalance,
        p.additionalCapital,
        allocatedProfit,
        p.capitalAdjust,
        p.capitalDrawings
      );
      return {
        ...p,
        shareOfProfit: allocatedProfit,
        closingBalance: closing,
      };
    });

    savePartnersConfig(updated);
    setIsDistributeModalOpen(false);
    showToast(`Distributed ₹${formatINR(total)} profit across capital ledgers!`);
  };

  // Filtered partners
  const filteredPartners = useMemo(() => {
    if (!searchTerm.trim()) return partners;
    const term = searchTerm.toLowerCase();
    return partners.filter((p) => p.partnerName.toLowerCase().includes(term));
  }, [partners, searchTerm]);

  // Totals
  const totals = useMemo(() => {
    return filteredPartners.reduce(
      (acc, p) => ({
        ratio: acc.ratio + (p.profitShareRatio || 0),
        openingBalance: acc.openingBalance + (p.openingBalance || 0),
        additionalCapital: acc.additionalCapital + (p.additionalCapital || 0),
        shareOfProfit: acc.shareOfProfit + (p.shareOfProfit || 0),
        capitalAdjust: acc.capitalAdjust + (p.capitalAdjust || 0),
        capitalDrawings: acc.capitalDrawings + (p.capitalDrawings || 0),
        closingBalance: acc.closingBalance + (p.closingBalance || 0),
      }),
      {
        ratio: 0,
        openingBalance: 0,
        additionalCapital: 0,
        shareOfProfit: 0,
        capitalAdjust: 0,
        capitalDrawings: 0,
        closingBalance: 0,
      }
    );
  }, [filteredPartners]);

  // Export Excel
  const handleExportExcel = () => {
    try {
      const compName = companyInfo?.companyName || companyInfo?.name || "Company";
      const worksheetData = [
        [`${compName} - STATEMENT OF CAPITAL ACCOUNT`],
        [`Financial Year: ${selectedFinYear}`],
        [],
        [
          "SR. NO.",
          "NAME OF PARTNER",
          "PROFIT SHARE RATIO (%)",
          "OPENING CAPITAL BALANCE",
          "ADDITIONAL CAPITAL",
          "SHARE OF PROFIT",
          "CAPITAL ADJUST",
          "CAPITAL DRW (DRAWINGS)",
          "CLOSING CAPITAL BALANCE",
        ],
        ...filteredPartners.map((p, idx) => [
          idx + 1,
          p.partnerName,
          `${p.profitShareRatio}%`,
          p.openingBalance,
          p.additionalCapital,
          p.shareOfProfit,
          p.capitalAdjust,
          p.capitalDrawings,
          p.closingBalance,
        ]),
        [
          "",
          "TOTAL",
          `${totals.ratio}%`,
          totals.openingBalance,
          totals.additionalCapital,
          totals.shareOfProfit,
          totals.capitalAdjust,
          totals.capitalDrawings,
          totals.closingBalance,
        ],
      ];

      const ws = XLSX.utils.aoa_to_sheet(worksheetData);
      ws["!cols"] = [
        { wch: 8 },
        { wch: 32 },
        { wch: 22 },
        { wch: 24 },
        { wch: 24 },
        { wch: 20 },
        { wch: 18 },
        { wch: 22 },
        { wch: 24 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Capital Account");
      XLSX.writeFile(wb, `Capital_Account_${selectedFinYear}.xlsx`);
      showToast("Excel exported successfully!");
    } catch (e) {
      console.error("Export excel error:", e);
      handleExportCSV();
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      "Sr No",
      "Name of Partner",
      "Profit Share Ratio (%)",
      "Opening Capital Balance",
      "Additional Capital",
      "Share of Profit",
      "Capital Adjust",
      "Capital Drawings",
      "Closing Capital Balance",
    ];

    const rows = filteredPartners.map((p, idx) => [
      idx + 1,
      `"${p.partnerName.replace(/"/g, '""')}"`,
      `${p.profitShareRatio}%`,
      p.openingBalance.toFixed(2),
      p.additionalCapital.toFixed(2),
      p.shareOfProfit.toFixed(2),
      p.capitalAdjust.toFixed(2),
      p.capitalDrawings.toFixed(2),
      p.closingBalance.toFixed(2),
    ]);

    const totalRow = [
      "",
      "TOTAL",
      `${totals.ratio}%`,
      totals.openingBalance.toFixed(2),
      totals.additionalCapital.toFixed(2),
      totals.shareOfProfit.toFixed(2),
      totals.capitalAdjust.toFixed(2),
      totals.capitalDrawings.toFixed(2),
      totals.closingBalance.toFixed(2),
    ];

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(",")), totalRow.join(",")].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Capital_Account_${selectedFinYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV exported successfully!");
  };

  const currentCompanyName = companyInfo?.companyName || companyInfo?.name || "Selected Company";

  return (
    <div
      className={`pt-[56px] px-4 min-h-[calc(100vh-64px)] pb-12 transition-colors duration-200 ${
        isDark ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-800"
      }`}
    >
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-16 right-5 z-50 flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-fadeIn">
          <CheckCircle size={18} />
          {toastMessage}
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-3 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div className="flex items-center">
          <button
            onClick={() => navigate("/app/reports")}
            title="Back to Reports"
            className={`p-2 rounded-lg mr-3 transition-colors ${
              isDark
                ? "bg-gray-800 hover:bg-gray-700 text-white border border-gray-700"
                : "bg-white hover:bg-gray-100 text-gray-700 border shadow-sm"
            }`}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                <Users className="text-indigo-600 dark:text-indigo-400" size={28} />
                Statement of Partner's Capital Account
              </h1>
              <span className="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-semibold px-2 py-0.5 rounded">
                Real Ledgers (Capital Account Group -4)
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Capital Account Group ke under open huye sabhi partner ledgers ka real statement
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Financial Year Selector */}
          <div className="flex items-center">
            <select
              value={selectedFinYear}
              onChange={(e) => setSelectedFinYear(e.target.value)}
              className={`text-xs font-medium px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isDark
                  ? "bg-gray-800 border-gray-700 text-gray-200"
                  : "bg-white border-gray-300 text-gray-700 shadow-sm"
              }`}
            >
              {getAvailableFinYears().map((fy) => (
                <option key={fy} value={fy}>
                  FY {fy}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh / Reload Real Data */}
          <button
            onClick={fetchCapitalLedgers}
            disabled={loading}
            title="Reload real ledgers from database"
            className={`px-3 py-2 border rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              isDark
                ? "border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200"
                : "border-gray-300 bg-white hover:bg-gray-100 text-gray-700 shadow-sm"
            }`}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh Ledgers
          </button>

          {/* Distribute Profit Tool */}
          {partners.length > 0 && (
            <button
              onClick={() => setIsDistributeModalOpen(true)}
              title="Distribute firm's net profit across partner ledgers"
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Calculator size={14} /> Distribute Profit
            </button>
          )}

          {/* Create New Capital Ledger link */}
          <button
            onClick={() => navigate("/app/masters/ledger/create")}
            title="Create a new ledger under Capital Account"
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={14} /> Create Capital Ledger
          </button>

          {/* Excel Export */}
          <button
            onClick={handleExportExcel}
            disabled={partners.length === 0}
            className={`px-3 py-2 border rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              isDark
                ? "border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200"
                : "border-gray-300 bg-white hover:bg-gray-100 text-gray-700 shadow-sm"
            }`}
          >
            <Download size={14} /> Excel
          </button>

          {/* Print */}
          <button
            onClick={() => window.print()}
            disabled={partners.length === 0}
            className={`px-3 py-2 border rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              isDark
                ? "border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-200"
                : "border-gray-300 bg-white hover:bg-gray-100 text-gray-700 shadow-sm"
            }`}
          >
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div
          className={`p-3.5 rounded-xl border ${
            isDark ? "bg-gray-800/80 border-gray-700" : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Capital Ledgers</span>
            <Users size={16} className="text-indigo-500" />
          </div>
          <div className="text-lg font-bold mt-1 text-gray-900 dark:text-white">
            {filteredPartners.length}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            Total Ratio: <span className="font-semibold">{totals.ratio}%</span>
          </div>
        </div>

        <div
          className={`p-3.5 rounded-xl border ${
            isDark ? "bg-gray-800/80 border-gray-700" : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Opening Balance</span>
            <DollarSign size={16} className="text-blue-500" />
          </div>
          <div className="text-lg font-bold mt-1 text-gray-900 dark:text-white">
            ₹{formatINR(totals.openingBalance)}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">Real Opening Bal</div>
        </div>

        <div
          className={`p-3.5 rounded-xl border ${
            isDark ? "bg-gray-800/80 border-gray-700" : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Additional Capital</span>
            <TrendingUp size={16} className="text-amber-500" />
          </div>
          <div className="text-lg font-bold mt-1 text-gray-900 dark:text-white">
            ₹{formatINR(totals.additionalCapital)}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">Capital Introduced</div>
        </div>

        <div
          className={`p-3.5 rounded-xl border ${
            isDark ? "bg-gray-800/80 border-gray-700" : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Share of Profit</span>
            <PieChart size={16} className="text-emerald-500" />
          </div>
          <div className="text-lg font-bold mt-1 text-emerald-600 dark:text-emerald-400">
            ₹{formatINR(totals.shareOfProfit)}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">Profit Allocated</div>
        </div>

        <div
          className={`p-3.5 rounded-xl border ${
            isDark ? "bg-gray-800/80 border-gray-700" : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Capital Drw (Drawings)</span>
            <TrendingUp size={16} className="text-rose-500 rotate-180" />
          </div>
          <div className="text-lg font-bold mt-1 text-rose-600 dark:text-rose-400">
            ₹{formatINR(totals.capitalDrawings)}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">Total Drawings</div>
        </div>

        <div
          className={`p-3.5 rounded-xl border ${
            isDark
              ? "bg-indigo-950/40 border-indigo-700/50"
              : "bg-indigo-50/70 border-indigo-200 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-300 font-medium">
            <span>Closing Capital</span>
            <CheckCircle size={16} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="text-lg font-bold mt-1 text-indigo-900 dark:text-indigo-200">
            ₹{formatINR(totals.closingBalance)}
          </div>
          <div className="text-[11px] text-indigo-600/80 dark:text-indigo-400/80 mt-0.5">
            Net Closing Balance
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div
        className={`rounded-xl border overflow-hidden ${
          isDark ? "bg-gray-800/90 border-gray-700" : "bg-white border-gray-200 shadow-sm"
        }`}
      >
        {/* Table Toolbar */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search Capital Account ledger name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isDark
                  ? "bg-gray-900 border-gray-700 text-gray-200 placeholder-gray-500"
                  : "bg-gray-50 border-gray-300 text-gray-800 placeholder-gray-400"
              }`}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">
              Company: {currentCompanyName}
            </span>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="py-20 text-center">
            <RefreshCw size={32} className="animate-spin mx-auto text-indigo-600 mb-3" />
            <p className="text-sm font-semibold">Capital Account Ledgers load ho rahe hain...</p>
            <p className="text-xs text-gray-400 mt-1">Please wait while fetching real ledger balances</p>
          </div>
        ) : filteredPartners.length === 0 ? (
          /* Empty State when NO real ledgers exist */
          <div className="py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4 text-amber-600 dark:text-amber-400">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              Capital Account Group ke andar koi ledger nahi mila
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto leading-relaxed">
              Is company me abhi tak <strong>Capital Account (Group ID: -4)</strong> ke under koi ledger open nahi hua hai.
              Real partner capital dekhne ke liye Masters me jakar Capital Account group ke under Partner Ledger create karein.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                onClick={() => navigate("/app/masters/ledger/create")}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Plus size={15} /> Create Capital Ledger Now
              </button>
              <button
                onClick={() => navigate("/app/masters/ledger")}
                className="px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink size={15} /> View All Ledgers
              </button>
            </div>
          </div>
        ) : (
          /* Real Data Table */
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead
                className={`border-b text-gray-700 dark:text-gray-300 uppercase tracking-wider font-semibold ${
                  isDark ? "bg-gray-900/60 border-gray-700" : "bg-gray-100 border-gray-200"
                }`}
              >
                <tr>
                  <th className="py-3 px-3 text-center w-12">#</th>
                  <th className="py-3 px-4 min-w-[220px]">Name of Partner</th>
                  <th className="py-3 px-3 text-center min-w-[130px]">
                    Profit Share Ratio
                  </th>
                  <th className="py-3 px-4 text-right min-w-[150px]">
                    Opening Capital Balance
                  </th>
                  <th
                    className="py-3 px-4 text-right min-w-[150px]"
                    title="Additional Capital Introduced during the year"
                  >
                    Additional Capital
                    <span className="block text-[10px] font-normal lowercase tracking-normal text-gray-400">
                      (capital introduced)
                    </span>
                  </th>
                  <th className="py-3 px-4 text-right min-w-[140px]">
                    Share of profit
                  </th>
                  <th className="py-3 px-4 text-right min-w-[130px]">
                    Capital Adjust
                  </th>
                  <th
                    className="py-3 px-4 text-right min-w-[130px]"
                    title="Capital Drawings / Withdrawals"
                  >
                    Capital Drw
                    <span className="block text-[10px] font-normal lowercase tracking-normal text-gray-400">
                      (drawings)
                    </span>
                  </th>
                  <th className="py-3 px-4 text-right min-w-[150px] font-bold text-indigo-600 dark:text-indigo-400">
                    Closing Capital Balance
                  </th>
                  <th className="py-3 px-3 text-center w-20">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700/60 font-medium">
                {filteredPartners.map((partner, index) => (
                  <tr
                    key={partner.id}
                    className={`hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors ${
                      index % 2 === 0
                        ? "bg-transparent"
                        : isDark
                        ? "bg-gray-800/40"
                        : "bg-gray-50/50"
                    }`}
                  >
                    <td className="py-3 px-3 text-center text-gray-400">{index + 1}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {partner.partnerName}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        Ledger ID: #{partner.ledgerId}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                        {partner.profitShareRatio}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-800 dark:text-gray-200">
                      ₹{formatINR(partner.openingBalance)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-800 dark:text-gray-200">
                      ₹{formatINR(partner.additionalCapital)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      ₹{formatINR(partner.shareOfProfit)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-800 dark:text-gray-200">
                      {partner.capitalAdjust >= 0 ? "+" : ""}
                      ₹{formatINR(partner.capitalAdjust)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-rose-600 dark:text-rose-400">
                      -₹{formatINR(partner.capitalDrawings)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-indigo-700 dark:text-indigo-300">
                      ₹{formatINR(partner.closingBalance)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => handleOpenEditModal(partner)}
                        title="Edit Partner Ratios & Adjustments"
                        className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-blue-600 dark:text-blue-400 transition-colors"
                      >
                        <Edit3 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Total Footer Row */}
              <tfoot
                className={`border-t-2 font-bold uppercase ${
                  isDark
                    ? "bg-gray-900 border-gray-700 text-gray-200"
                    : "bg-gray-100 border-gray-300 text-gray-800"
                }`}
              >
                <tr>
                  <td className="py-3.5 px-3 text-center"></td>
                  <td className="py-3.5 px-4 font-bold">TOTAL</td>
                  <td className="py-3.5 px-3 text-center text-indigo-600 dark:text-indigo-400 font-mono">
                    {totals.ratio}%
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono">
                    ₹{formatINR(totals.openingBalance)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono">
                    ₹{formatINR(totals.additionalCapital)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400">
                    ₹{formatINR(totals.shareOfProfit)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono">
                    {totals.capitalAdjust >= 0 ? "+" : ""}
                    ₹{formatINR(totals.capitalAdjust)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-rose-600 dark:text-rose-400">
                    -₹{formatINR(totals.capitalDrawings)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-indigo-700 dark:text-indigo-300 font-extrabold">
                    ₹{formatINR(totals.closingBalance)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Bottom Formula Banner */}
        <div className="p-3 bg-gray-50/50 dark:bg-gray-900/30 border-t border-gray-200 dark:border-gray-700 text-[11px] text-gray-500 dark:text-gray-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Info size={14} className="text-indigo-500 shrink-0" />
            <span>
              <strong>Formula:</strong> Closing Capital = Opening Capital + Additional Capital + Share of Profit + Capital Adjust - Capital Drw
            </span>
          </div>
          <div>All figures in Indian Rupees (₹) • As per Capital Account Ledgers</div>
        </div>
      </div>

      {/* Edit Partner Modal */}
      {editingPartner && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div
            className={`w-full max-w-lg rounded-2xl shadow-2xl border p-6 animate-scaleUp overflow-y-auto max-h-[90vh] ${
              isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-900"
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700 mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Edit3 className="text-indigo-600 dark:text-indigo-400" size={20} />
                Edit Capital Details: {editingPartner.partnerName}
              </h2>
              <button
                onClick={() => setEditingPartner(null)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-3.5 text-xs">
              {/* Partner Name Display */}
              <div>
                <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                  Name of Partner (Ledger Name)
                </label>
                <input
                  type="text"
                  disabled
                  value={formData.partnerName}
                  className={`w-full px-3 py-2 rounded-lg border text-xs opacity-70 cursor-not-allowed ${
                    isDark
                      ? "bg-gray-900 border-gray-700 text-gray-300"
                      : "bg-gray-100 border-gray-300 text-gray-700"
                  }`}
                />
              </div>

              {/* Profit Share Ratio & Opening Balance */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Profit Share Ratio (%) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    required
                    placeholder="e.g. 50"
                    value={formData.profitShareRatio}
                    onChange={(e) => setFormData({ ...formData, profitShareRatio: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isDark
                        ? "bg-gray-900 border-gray-700 text-gray-200"
                        : "bg-gray-50 border-gray-300 text-gray-800"
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Opening Capital Balance (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.openingBalance}
                    onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isDark
                        ? "bg-gray-900 border-gray-700 text-gray-200"
                        : "bg-gray-50 border-gray-300 text-gray-800"
                    }`}
                  />
                </div>
              </div>

              {/* Additional Capital & Share of profit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Additional Capital (Introduced) (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.additionalCapital}
                    onChange={(e) => setFormData({ ...formData, additionalCapital: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isDark
                        ? "bg-gray-900 border-gray-700 text-gray-200"
                        : "bg-gray-50 border-gray-300 text-gray-800"
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Share of profit (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.shareOfProfit}
                    onChange={(e) => setFormData({ ...formData, shareOfProfit: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isDark
                        ? "bg-gray-900 border-gray-700 text-gray-200"
                        : "bg-gray-50 border-gray-300 text-gray-800"
                    }`}
                  />
                </div>
              </div>

              {/* Capital Adjust & Capital Drw */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Capital Adjust (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.capitalAdjust}
                    onChange={(e) => setFormData({ ...formData, capitalAdjust: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isDark
                        ? "bg-gray-900 border-gray-700 text-gray-200"
                        : "bg-gray-50 border-gray-300 text-gray-800"
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                    Capital Drw (Drawings) (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.capitalDrawings}
                    onChange={(e) => setFormData({ ...formData, capitalDrawings: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isDark
                        ? "bg-gray-900 border-gray-700 text-gray-200"
                        : "bg-gray-50 border-gray-300 text-gray-800"
                    }`}
                  />
                </div>
              </div>

              {/* Closing Capital Preview */}
              <div
                className={`p-3 rounded-lg border flex items-center justify-between ${
                  isDark ? "bg-gray-900/80 border-gray-700" : "bg-gray-100 border-gray-300"
                }`}
              >
                <span className="font-semibold text-gray-600 dark:text-gray-300">
                  Calculated Closing Capital:
                </span>
                <span className="font-mono font-bold text-sm text-indigo-600 dark:text-indigo-400">
                  ₹
                  {formatINR(
                    calculateClosing(
                      parseFloat(formData.openingBalance) || 0,
                      parseFloat(formData.additionalCapital) || 0,
                      parseFloat(formData.shareOfProfit) || 0,
                      parseFloat(formData.capitalAdjust) || 0,
                      parseFloat(formData.capitalDrawings) || 0
                    )
                  )}
                </span>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setEditingPartner(null)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Distribute Profit Modal */}
      {isDistributeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-2xl shadow-2xl border p-6 animate-scaleUp ${
              isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-900"
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700 mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <Calculator size={20} />
                Distribute Firm Net Profit
              </h2>
              <button
                onClick={() => setIsDistributeModalOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleDistributeProfit} className="space-y-4 text-xs">
              <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
                Enter total net profit of the partnership firm for FY {selectedFinYear}. It will be allocated across all real capital ledgers based on their <strong>Profit Share Ratio (%)</strong>.
              </p>

              <div>
                <label className="block font-semibold mb-1 text-gray-700 dark:text-gray-300">
                  Total Firm Net Profit (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  autoFocus
                  placeholder="e.g. 500000"
                  value={totalFirmProfit}
                  onChange={(e) => setTotalFirmProfit(e.target.value)}
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    isDark
                      ? "bg-gray-900 border-gray-700 text-gray-200"
                      : "bg-gray-50 border-gray-300 text-gray-800"
                  }`}
                />
              </div>

              <div
                className={`p-3 rounded-lg border ${
                  isDark ? "bg-gray-900/60 border-gray-700" : "bg-gray-100 border-gray-300"
                }`}
              >
                <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-2">
                  Preview Allocation Breakdown:
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {partners.map((p) => {
                    const totalP = parseFloat(totalFirmProfit) || 0;
                    const totR = totals.ratio || 100;
                    const alloc = Math.round((totalP * (p.profitShareRatio / totR)) * 100) / 100;
                    return (
                      <div key={p.id} className="flex justify-between items-center text-[11px]">
                        <span className="truncate max-w-[180px]">{p.partnerName} ({p.profitShareRatio}%):</span>
                        <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          ₹{formatINR(alloc)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setIsDistributeModalOpen(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shadow-sm"
                >
                  Distribute Profit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CapitalAccount;
