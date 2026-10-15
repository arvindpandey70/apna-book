import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer, Download, Filter, Settings } from "lucide-react";
import { allSystemGroups as baseGroups } from "../../constants/ledgerGroups";

interface Ledger {
  id: number;
  name: string;
  group_id: number;
  balanceType: "debit" | "credit";
  groupName: string | null;
  groupType: string | null;
  groupNature: string | null;
  createdAt?: string;
  closingBalance?: number;
  address?: string;
  email?: string;
  phone?: string;
  gstNumber?: string;
  panNumber?: string;
  groupId?: number;
  debit?: number;
  credit?: number;

}

const GroupSummary: React.FC = () => {
  const navigate = useNavigate();
  const { groupType } = useParams<{ groupType: string }>();
  const groupIdFromUrl = Number(groupType);

  const [ledgers, setLedgers] = useState<any[]>([]);
  const [allLedgers, setAllLedgers] = useState<any[]>([]);
  const [taxData, setTaxData] = useState<Record<number, { debit: number; credit: number }>>({});
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [, setLoading] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"consolidated" | "monthly" | "particular">(
    "consolidated"
  );
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState({
    opening: true,
    debit: true,
    credit: true,
    closing: true
  });
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

  // Base groups as per original logic

  // Fetch ledger groups and ledgers filtered by groupType (optional)
  const [resolvedGroupName, setResolvedGroupName] = useState<string>("");

  //get groupName
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    const fetchLedgerGroups = async () => {
      if (!companyId || !ownerType || !ownerId) {
        setGroups([]);
        return;
      }

      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/ledger-groups?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );

        if (!res.ok) {
          throw new Error("Failed to fetch ledger groups");
        }

        const data = await res.json();
        // console.log("this is ledger groups data", data);
        setGroups(data || []);
      } catch (err) {
        console.error("Failed to load ledger groups", err);
        setGroups([]);
      }
    };

    fetchLedgerGroups();
  }, [companyId, ownerType, ownerId]);

  //get all ledger
  useEffect(() => {
    async function fetchGroupSummary() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );

        if (!res.ok) {
          throw new Error("Failed to load group summary data");
        }

        const data = await res.json();
        const allLedgersData = data || [];
        setAllLedgers(allLedgersData);

        const groupIdFromUrl = Number(groupType);
        let resolvedName = "Unknown Group";
        let targetType = "";

        if (groupIdFromUrl < 0) {
          const matchedBaseGroup = baseGroups.find((g) => g.id === groupIdFromUrl);
          if (matchedBaseGroup) {
            resolvedName = matchedBaseGroup.name;
            // Map common types for better matching
            if (resolvedName === "Indirect Income") targetType = "indirect-income";
            else if (resolvedName === "Indirect Expenses") targetType = "indirect-expenses";
            else if (resolvedName === "Direct Income") targetType = "direct-income";
            else if (resolvedName === "Direct Expenses") targetType = "direct-expenses";
            else if (resolvedName === "Sales Accounts") targetType = "sales";
            else if (resolvedName === "Purchase Accounts") targetType = "purchase";
          }
        }

        if (groupIdFromUrl > 0) {
          const matchedLedgerGroup = groups.find((g) => Number(g.id) === groupIdFromUrl);
          if (matchedLedgerGroup) {
            resolvedName = matchedLedgerGroup.name;
            targetType = matchedLedgerGroup.type;
          }
        }

        setResolvedGroupName(resolvedName);

        // Find the "real" database group ID(s) that match this base group by name OR type
        const realGroupIds = groups
          .filter(g =>
            (targetType && String(g.type || "").toLowerCase() === targetType.toLowerCase()) ||
            String(g.name || "").toLowerCase() === resolvedName.toLowerCase()
          )
          .map(g => Number(g.id));

        // Child groups: they point to the negative ID OR the real DB ID
        const childGroups = [
          ...groups.filter((g) =>
            Number(g.parent) === groupIdFromUrl ||
            (realGroupIds.length > 0 && realGroupIds.includes(Number(g.parent)))
          ).map(g => ({ ...g, isGroup: true })),
          ...baseGroups.filter(bg =>
            Number(bg.parent) === groupIdFromUrl
          ).map(bg => ({ ...bg, isGroup: true, id: bg.id }))
        ];

        // Deduplicate by name or ID to avoid showing same system/custom group twice if somehow duplicated
        const uniqueChildGroups = childGroups.filter((v, i, a) =>
          a.findIndex(t => (t.id === v.id || t.name === v.name)) === i
        );

        // Direct ledgers: they point to the negative ID OR the real DB ID OR match the type
        const directLedgers = allLedgersData.filter((item: any) => {
          const itemGid = Number(item.groupId || item.group_id);
          const itemGtype = String(item.groupType || item.group_type || "").toLowerCase();

          return itemGid === groupIdFromUrl ||
            (realGroupIds.length > 0 && realGroupIds.includes(itemGid)) ||
            (targetType && itemGtype === targetType.toLowerCase());
        });

        // We'll calculate balances later after taxData is loaded
        // For now, let's just combine them as placeholders
        const combined = [
          ...uniqueChildGroups,
          ...directLedgers.map(l => ({ ...l, isGroup: false }))
        ];

        setLedgers(combined);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Unexpected error");
        setLedgers([]);
      } finally {
        setLoading(false);
      }
    }

    fetchGroupSummary();
  }, [groupType, companyId, ownerType, ownerId, groups]);



  useEffect(() => {

    const fetchTaxData = async () => {

      if (!companyId || !ownerType || !ownerId || !allLedgers.length) {
        return;
      }

      try {
        const ledgerIds = allLedgers.map(item => item.id).join(",");

        const url =
          `${import.meta.env.VITE_API_URL}/api/group` +
          `?company_id=${companyId}` +
          `&owner_type=${ownerType}` +
          `&owner_id=${ownerId}` +
          `&ledgerIds=${ledgerIds}`;

        const res = await fetch(url);

        if (!res.ok) {
          throw new Error("API Failed");
        }

        const data = await res.json();


        // ✅ Normalize keys and ensure values are numbers
        const normalizedData: Record<number, { debit: number; credit: number }> = {};
        if (data.data) {
          Object.keys(data.data).forEach((key) => {
            const entry = data.data[key];
            normalizedData[Number(key)] = {
              debit: Number(entry.debit) || 0,
              credit: Number(entry.credit) || 0
            };
          });
        }
        setTaxData(normalizedData);

      } catch (err) {

        console.error("API Error:", err);

      }
    };

    fetchTaxData();

  }, [companyId, ownerType, ownerId, allLedgers]);

  // Resolve `groupType` param to a numeric group id.
  const resolveGroupId = (param?: string | null): number | null => {
    if (!param) return null;
    const trimmed = param.trim();

    // If param is numeric (handles negative base ids)
    if (/^-?\d+$/.test(trimmed)) return Number(trimmed);

    // Try match with baseGroups by name (case-insensitive)
    const base = baseGroups.find(
      (b) => b.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (base) return base.id;

    // Try match with fetched ledgerGroups by name
    const found = groups.find(
      (g) => g.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (found) return found.id;

    return null;
  };

  const resolvedGroupId = resolveGroupId(groupType || null);

  // Filter ledgers belonging to the resolved group id
  const groupLedgers =
    resolvedGroupId !== null
      ? ledgers.filter(
        (ledger) => Number(ledger.groupId || ledger.group_id) === Number(resolvedGroupId)
      )
      : [];





  // Generate monthly-wise data based on creation date
  const generateMonthlyData = (ledger: any) => {
    const months = [
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
      "Jan",
      "Feb",
      "Mar",
    ];

    const opening = Number(ledger.openingBalance || ledger.opening_balance) || 0;
    const balanceType = ledger.balanceType || "debit";
    const ledgerTax = taxData[Number(ledger.id)] || { debit: 0, credit: 0 };
    let creationMonthIndex = 0;

    if (ledger.createdAt) {
      const createdDate = new Date(ledger.createdAt);
      const createdMonth = createdDate.getMonth(); // 0-11 (Jan-Dec)

      if (createdMonth >= 3) {
        creationMonthIndex = createdMonth - 3;
      } else {
        creationMonthIndex = createdMonth + 9;
      }
    }

    let runningOpening = opening;

    return months.map((month, index) => {
      const isCreationMonth = index === creationMonthIndex;
      const isJanFallback = index === 9 && !ledger.createdAt;
      const shouldShow = isCreationMonth || isJanFallback;

      const monthDebit = shouldShow ? ledgerTax.debit : 0;
      const monthCredit = shouldShow ? ledgerTax.credit : 0;
      const monthOpening = index === 0 ? opening : runningOpening;

      // Calculate closing based on user formula
      let monthClosing = 0;
      if (balanceType === "debit") {
        monthClosing = (monthOpening + monthDebit) - monthCredit;
      } else {
        monthClosing = (monthOpening + monthCredit) - monthDebit;
      }

      // For the next month, the current month's closing is the opening
      // However, since we currently only have total data in one month (heuristic),
      // we just update runningOpening for consistency in this mock-up logic.
      runningOpening = monthClosing;

      return {
        month,
        opening: monthOpening,
        debit: monthDebit,
        credit: monthCredit,
        closing: monthClosing,
        balanceType: balanceType
      };
    });
  };

  const isStockInHand = (idOrName: any) => {
    if (idOrName === -108 || idOrName === "-108" || Number(idOrName) === -108) return true;
    const str = String(idOrName || "").toLowerCase().replace(/[\s-_]/g, "");
    return str === "stockinhand" || str.includes("stockinhand");
  };

  // Recursive Balance Calculation
  const calculateRecursiveBalance = (groupId: number) => {
    const isTargetStock = isStockInHand(groupId);

    const getGroupLedgers = (gid: number): any[] => {
      const direct = allLedgers.filter((l) => Number(l.groupId || l.group_id) === Number(gid));
      const children = groups.filter((g) => Number(g.parent) === Number(gid));
      let total = [...direct];
      children.forEach((c) => {
        total = [...total, ...getGroupLedgers(Number(c.id))];
      });
      return total;
    };

    const targetLedgers = getGroupLedgers(groupId);
    let opening = 0;
    let debit = 0;
    let credit = 0;
    let netBalance = 0;

    targetLedgers.forEach((l) => {
      const isStock = isTargetStock || isStockInHand(l.groupId || l.group_id) || isStockInHand(l.groupName);
      if (isStock) {
        const rawClosing = l.closingBalance !== undefined && l.closingBalance !== null
          ? parseFloat(l.closingBalance)
          : (l.closing_balance !== undefined && l.closing_balance !== null ? parseFloat(l.closing_balance) : NaN);
        const rawOpening = parseFloat(l.openingBalance || l.opening_balance) || 0;
        const val = !isNaN(rawClosing) && rawClosing !== 0
          ? rawClosing
          : (!isNaN(rawOpening) ? rawOpening : 0);
        const type = (l.balanceType || l.balance_type || "debit").toLowerCase();
        const signed = (type === "credit" || type === "cr") ? -val : val;
        netBalance += signed;
        return;
      }

      const op = Number(l.openingBalance || l.opening_balance) || 0;
      const td = taxData[Number(l.id)] || { debit: 0, credit: 0 };
      const type = (l.balanceType || l.balance_type || "debit").toLowerCase();

      opening += op;
      debit += td.debit;
      credit += td.credit;

      if (type === "debit" || type === "dr") {
        netBalance += (op + td.debit - td.credit);
      } else {
        netBalance -= (op + td.credit - td.debit);
      }
    });

    return { opening, debit, credit, netBalance, isStock: isTargetStock };
  };

  const totals = ledgers.reduce(
    (acc, item) => {
      let b: { opening: number; debit: number; credit: number; netBalance: number; isStock?: boolean };
      if (item.isGroup) {
        b = calculateRecursiveBalance(item.id);
      } else {
        const isStock = isStockInHand(groupIdFromUrl) || isStockInHand(item.groupId || item.group_id) || isStockInHand(item.groupName);
        if (isStock) {
          const rawClosing = item.closingBalance !== undefined && item.closingBalance !== null
            ? parseFloat(item.closingBalance)
            : (item.closing_balance !== undefined && item.closing_balance !== null ? parseFloat(item.closing_balance) : NaN);
          const rawOpening = parseFloat(item.openingBalance || item.opening_balance) || 0;
          const val = !isNaN(rawClosing) && rawClosing !== 0 ? rawClosing : (!isNaN(rawOpening) ? rawOpening : 0);
          const type = (item.balanceType || item.balance_type || "debit").toLowerCase();
          const net = (type === "credit" || type === "cr") ? -val : val;
          b = { opening: 0, debit: 0, credit: 0, netBalance: net, isStock: true };
        } else {
          const op = Number(item.openingBalance || item.opening_balance) || 0;
          const td = taxData[Number(item.id)] || { debit: 0, credit: 0 };
          const type = (item.balanceType || item.balance_type || "debit").toLowerCase();
          let net = 0;
          if (type === "debit" || type === "dr") {
            net = (op + td.debit - td.credit);
          } else {
            net = -(op + td.credit - td.debit);
          }
          b = { opening: op, debit: td.debit, credit: td.credit, netBalance: net, isStock: false };
        }
      }

      acc.opening += b.opening;
      acc.debit += b.debit;
      acc.credit += b.credit;
      acc.netBalance += b.netBalance;
      return acc;
    },
    { opening: 0, debit: 0, credit: 0, netBalance: 0 }
  );

  const totalOpening = totals.opening;
  const totalDebit = totals.debit;
  const totalCredit = totals.credit;
  const totalClosingStr = totals.netBalance >= 0
    ? `₹ ${Math.abs(totals.netBalance).toLocaleString()} Dr`
    : `₹ ${Math.abs(totals.netBalance).toLocaleString()} Cr`;
  const totalClosing = Math.abs(totals.netBalance);

  // You can replace this with your actual theme logic or context
  const [theme] = useState<"light" | "dark">("light");

  return (
    <div className="pt-[56px] px-4">
      <div className="flex items-center mb-6">
        <button
          title="Back to Group Summary"
          type="button"
          onClick={() => navigate("/app/reports/group-summary")}
          className={`mr-4 p-2 rounded-full ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
            }`}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">
          {resolvedGroupName || `Group ${groupType}`}
          <span className="ml-3 text-blue-600">({totalClosingStr})</span>
        </h1>
        <div className="ml-auto flex space-x-2">
          <button
            title="Toggle Filters"
            type="button"
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
              }`}
          >
            <Filter size={18} />
          </button>
          <button
            title="Print Report"
            type="button"
            className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
              }`}
          >
            <Printer size={18} />
          </button>
          <button
            title="Download Report"
            type="button"
            className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
              }`}
          >
            <Download size={18} />
          </button>

          <div className="relative">
            <button
              title="Column Settings"
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
                } ${showSettings ? 'bg-blue-100 text-blue-600' : ''}`}
            >
              <Settings size={18} />
            </button>

            {showSettings && (
              <div className={`absolute right-0 mt-2 w-48 rounded-md shadow-lg z-50 ${theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                }`}>
                <div className="p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase opacity-50 mb-2">Show Columns</p>
                  <label className="flex items-center space-x-2 cursor-pointer hover:opacity-80">
                    <input
                      type="checkbox"
                      checked={columnVisibility.opening}
                      onChange={() => setColumnVisibility(prev => ({ ...prev, opening: !prev.opening }))}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm">Opening Balance</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer hover:opacity-80">
                    <input
                      type="checkbox"
                      checked={columnVisibility.debit}
                      onChange={() => setColumnVisibility(prev => ({ ...prev, debit: !prev.debit }))}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm">Debit</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer hover:opacity-80">
                    <input
                      type="checkbox"
                      checked={columnVisibility.credit}
                      onChange={() => setColumnVisibility(prev => ({ ...prev, credit: !prev.credit }))}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm">Credit</span>
                  </label>
                  <label className="flex items-center space-x-2 opacity-50">
                    <input type="checkbox" checked disabled className="rounded" />
                    <span className="text-sm">Closing Balance</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showFilterPanel && (
        <div
          className={`p-4 mb-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
            }`}
        >
          <h3 className="font-semibold mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                As on Date
              </label>
              <input
                title="Select Date"
                type="date"
                defaultValue={new Date().toISOString().split("T")[0]}
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600"
                  : "bg-white border-gray-300"
                  }`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Period</label>
              <select
                title="Select Period"
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600"
                  : "bg-white border-gray-300"
                  }`}
              >
                <option value="current-year">Current Financial Year</option>
                <option value="previous-year">Previous Financial Year</option>
                <option value="custom">Custom Period</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* View Mode Controls */}
      <div
        className={`mb-6 flex items-center justify-between p-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
          }`}
      >
        <div className="flex items-center space-x-4">
          <span className="font-semibold">View Mode:</span>
          <div className="flex space-x-2">
            <button
              onClick={() => setViewMode("consolidated")}
              className={`px-4 py-2 rounded-md transition-colors ${viewMode === "consolidated"
                ? theme === "dark"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-600 text-white"
                : theme === "dark"
                  ? "bg-gray-700 hover:bg-gray-600"
                  : "bg-gray-200 hover:bg-gray-300"
                }`}
            >
              Without Monthly-wise
            </button>
            <button
              onClick={() => setViewMode("monthly")}
              className={`px-4 py-2 rounded-md transition-colors ${viewMode === "monthly"
                ? theme === "dark"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-600 text-white"
                : theme === "dark"
                  ? "bg-gray-700 hover:bg-gray-600"
                  : "bg-gray-200 hover:bg-gray-300"
                }`}
            >
              Month-wise
            </button>
            <button
              onClick={() => {
                if (selectedMonth === null) setSelectedMonth(9); // Default to Jan if nothing selected
                setViewMode("particular");
              }}
              className={`px-4 py-2 rounded-md transition-colors ${viewMode === "particular"
                ? theme === "dark"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-600 text-white"
                : theme === "dark"
                  ? "bg-gray-700 hover:bg-gray-600"
                  : "bg-gray-200 hover:bg-gray-300"
                }`}
            >
              Particular
            </button>
          </div>
        </div>
        <div className="text-sm opacity-75">
          {viewMode === "consolidated"
            ? "Showing consolidated view"
            : viewMode === "monthly"
              ? "Showing monthly summary"
              : "Showing ledger breakdown for selected month"}
        </div>
      </div>

      {/* Group Summary Table */}
      <div
        className={`p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
          }`}
      >
        <div className="mb-4">
          <h2 className="text-xl font-bold mb-2">
            {" "}
            {resolvedGroupName || `Group ${groupType}`}
          </h2>
          <p className="text-sm opacity-75">
            As of {new Date().toLocaleDateString()}
          </p>
        </div>

        <div className="overflow-x-auto">
          {viewMode === "consolidated" ? (
            // Consolidated View (existing table)
            <table className="w-full">
              <thead>
                <tr
                  className={`${theme === "dark"
                    ? "border-b border-gray-700"
                    : "border-b-2 border-gray-300"
                    }`}
                >
                  <th className="px-4 py-3 text-left">Ledger Name</th>
                  <th className="px-4 py-3 text-left">Group</th>
                  {columnVisibility.opening && <th className="px-4 py-3 text-right">Opening Balance</th>}
                  {columnVisibility.debit && <th className="px-4 py-3 text-right">Debit</th>}
                  {columnVisibility.credit && <th className="px-4 py-3 text-right">Credit</th>}
                  {columnVisibility.closing && <th className="px-4 py-3 text-right">Closing Balance</th>}
                </tr>
              </thead>
              <tbody>
                {ledgers.map((item) => {
                  const isGroup = item.isGroup;
                  const isStock = isGroup
                    ? isStockInHand(item.id) || isStockInHand(item.name)
                    : (isStockInHand(groupIdFromUrl) || isStockInHand(item.groupId || item.group_id) || isStockInHand(item.groupName));

                  const balance = isGroup
                    ? calculateRecursiveBalance(item.id)
                    : {
                      opening: Number(item.openingBalance || item.opening_balance) || 0,
                      debit: taxData[Number(item.id)]?.debit || 0,
                      credit: taxData[Number(item.id)]?.credit || 0,
                      type: (item.balanceType || item.balance_type || 'debit').toLowerCase()
                    };

                  let netClosing = 0;
                  if (!isGroup) {
                    if (isStock) {
                      const rawClosing = item.closingBalance !== undefined && item.closingBalance !== null
                        ? parseFloat(item.closingBalance)
                        : (item.closing_balance !== undefined && item.closing_balance !== null ? parseFloat(item.closing_balance) : NaN);
                      const rawOpening = parseFloat(item.openingBalance || item.opening_balance) || 0;
                      const val = !isNaN(rawClosing) && rawClosing !== 0 ? rawClosing : (!isNaN(rawOpening) ? rawOpening : 0);
                      const type = (item.balanceType || item.balance_type || "debit").toLowerCase();
                      netClosing = (type === "credit" || type === "cr") ? -val : val;
                    } else if (balance.type === 'debit' || balance.type === 'dr') {
                      netClosing = (balance.opening + balance.debit) - balance.credit;
                    } else {
                      netClosing = (balance.opening + balance.credit) - balance.debit;
                    }
                  } else {
                    netClosing = balance.netBalance;
                  }

                  const navigateTo = isGroup
                    ? `/app/reports/group-summary/${item.id}`
                    : `/app/reports/ledger/${item.id}`;

                  return (
                    <tr
                      key={isGroup ? `group-${item.id}` : `ledger-${item.id}`}
                      onClick={() => navigate(navigateTo)}
                      className="border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                    >
                      {/* Name */}
                      <td className="px-4 py-3 font-medium flex items-center">
                        {isGroup && <span className="mr-2 text-blue-500">📁</span>}
                        {item.name}
                      </td>

                      {/* Group */}
                      <td className="px-4 py-3 font-medium">
                        {resolvedGroupName || `Group ${groupType}`}
                      </td>

                      {/* Opening */}
                      {columnVisibility.opening && (
                        <td className="px-4 py-3 text-right font-mono">
                          {isStock ? "" : `₹ ${Math.abs(balance.opening).toLocaleString()} ${(!isGroup ? balance.type : (balance.opening >= 0 ? 'Dr' : 'Cr')) === 'debit' ? 'Dr' : 'Cr'}`}
                        </td>
                      )}

                      {columnVisibility.debit && (
                        <td className="px-4 py-3 text-right font-mono text-green-600">
                          {isStock || balance.debit === 0 ? "" : `₹ ${balance.debit.toLocaleString()}`}
                        </td>
                      )}

                      {columnVisibility.credit && (
                        <td className="px-4 py-3 text-right font-mono text-red-600">
                          {isStock || balance.credit === 0 ? "" : `₹ ${balance.credit.toLocaleString()}`}
                        </td>
                      )}

                      {/* Closing */}
                      {columnVisibility.closing && (
                        <td className="px-4 py-3 text-right font-mono font-semibold">
                          ₹ {Math.abs(netClosing).toLocaleString()} {netClosing >= 0 ? (isGroup ? 'Dr' : (balance.type === 'debit' ? 'Dr' : 'Cr')) : (isGroup ? 'Cr' : (balance.type === 'debit' ? 'Cr' : 'Dr'))}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr
                  className={`font-bold ${theme === "dark"
                    ? "border-t-2 border-gray-600"
                    : "border-t-2 border-gray-300"
                    }`}
                >
                  <td className="px-4 py-3" colSpan={2}>Total</td>
                  {columnVisibility.opening && (
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      ₹ {totalOpening.toLocaleString()}
                    </td>
                  )}
                  {columnVisibility.debit && (
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      ₹ {totalDebit.toLocaleString()}
                    </td>
                  )}
                  {columnVisibility.credit && (
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      ₹ {totalCredit.toLocaleString()}
                    </td>
                  )}
                  {columnVisibility.closing && (
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      {totalClosingStr}
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          ) : viewMode === "monthly" ? (
            // Monthly View - Aggregated for the whole group
            <div className={`border rounded-lg p-4 w-full ${theme === 'dark' ? 'bg-gray-800' : 'bg-white shadow'}`}>
              <h3 className="font-bold mb-3 text-blue-600 dark:text-blue-400 text-center">
                {resolvedGroupName || `Group ${groupType}`} Monthly Summary
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-100"}`}>
                      <th className="px-3 py-2 text-left">Month</th>
                      {columnVisibility.opening && <th className="px-3 py-2 text-right">Opening</th>}
                      {columnVisibility.debit && <th className="px-3 py-2 text-right">Debit</th>}
                      {columnVisibility.credit && <th className="px-3 py-2 text-right">Credit</th>}
                      {columnVisibility.closing && <th className="px-3 py-2 text-right">Closing</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
                      const aggregatedData = months.map((month, idx) => {
                        let totalMonthOpening = 0;
                        let totalDebit = 0;
                        let totalCredit = 0;
                        let totalClosing = 0;

                        ledgers.forEach((ledger) => {
                          const monthlyData = generateMonthlyData(ledger);
                          const m = monthlyData[idx];
                          totalMonthOpening += Math.abs(m.opening);
                          totalDebit += m.debit;
                          totalCredit += m.credit;
                          totalClosing += Math.abs(m.closing);
                        });
                        return {
                          month,
                          opening: totalMonthOpening,
                          debit: totalDebit,
                          credit: totalCredit,
                          closing: totalClosing
                        };
                      });

                      return aggregatedData.map((monthData, index) => (
                        <tr
                          key={index}
                          onClick={() => {
                            setSelectedMonth(index);
                            setViewMode("particular");
                          }}
                          className={`${theme === "dark"
                            ? "border-b border-gray-700 hover:bg-gray-800"
                            : "border-b border-gray-200 hover:bg-blue-50"
                            } cursor-pointer transition-colors`}
                        >
                          <td className="px-3 py-2 flex items-center font-medium">
                            <span className="mr-2 text-blue-500 text-[10px]">▶</span>
                            {monthData.month}
                          </td>
                          {columnVisibility.opening && <td className="px-3 py-2 text-right font-mono">₹ {monthData.opening.toLocaleString()}</td>}
                          {columnVisibility.debit && <td className="px-3 py-2 text-right font-mono">₹ {monthData.debit.toLocaleString()}</td>}
                          {columnVisibility.credit && <td className="px-3 py-2 text-right font-mono">₹ {monthData.credit.toLocaleString()}</td>}
                          {columnVisibility.closing && <td className="px-3 py-2 text-right font-mono">₹ {monthData.closing.toLocaleString()}</td>}
                        </tr>
                      ));
                    })()}
                  </tbody>
                  <tfoot className={`font-bold ${theme === "dark" ? "bg-gray-700" : "bg-gray-50"}`}>
                    <tr className="border-t-2 border-gray-300">
                      <td className="px-3 py-2">Total</td>
                      {columnVisibility.opening && <td className="px-3 py-2 text-right font-mono font-bold">₹ {totalOpening.toLocaleString()}</td>}
                      {columnVisibility.debit && <td className="px-3 py-2 text-right font-mono font-bold">₹ {totalDebit.toLocaleString()}</td>}
                      {columnVisibility.credit && <td className="px-3 py-2 text-right font-mono font-bold">₹ {totalCredit.toLocaleString()}</td>}
                      {columnVisibility.closing && <td className="px-3 py-2 text-right font-mono font-bold">{totalClosingStr}</td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            // Particular View (Drill-down for a month)
            <div className="p-4 border rounded bg-white">

              {/* Header */}
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-semibold text-lg">
                  Particulars - {[
                    "Apr", "May", "Jun", "Jul", "Aug", "Sep",
                    "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"
                  ][selectedMonth ?? 0]}
                </h4>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedMonth ?? 0}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="border px-2 py-1 text-sm rounded"
                  >
                    {[
                      "Apr", "May", "Jun", "Jul", "Aug", "Sep",
                      "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"
                    ].map((m, i) => (
                      <option key={m} value={i}>{m}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => setViewMode("monthly")}
                    className="border px-3 py-1 text-sm rounded hover:bg-gray-100"
                  >
                    Back
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-300">

                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left">Ledger</th>
                      <th className="px-3 py-2 text-left">Group</th>
                      {columnVisibility.opening && <th className="px-3 py-2 text-right">Opening</th>}
                      {columnVisibility.debit && <th className="px-3 py-2 text-right">Debit</th>}
                      {columnVisibility.credit && <th className="px-3 py-2 text-right">Credit</th>}
                      {columnVisibility.closing && <th className="px-3 py-2 text-right">Closing</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {(() => {

                      const idx = selectedMonth ?? 0;

                      const activeLedgers = ledgers.filter((ledger) => {
                        const data = generateMonthlyData(ledger)[idx];
                        return data.opening !== 0 || data.debit !== 0 || data.credit !== 0;
                      });

                      if (activeLedgers.length === 0) {
                        return (
                          <tr>
                            <td colSpan={5} className="text-center py-6 text-gray-500">
                              No data for this month
                            </td>
                          </tr>
                        );
                      }

                      return activeLedgers.map((ledger) => {

                        const mData = generateMonthlyData(ledger)[idx];

                        return (
                          <tr
                            key={ledger.id}
                            className="border-b hover:bg-gray-50 cursor-pointer"
                            onClick={() =>
                              navigate(`/app/reports/ledger/${ledger.id}`)
                            }
                          >
                            <td className="px-3 py-2">{ledger.name}</td>

                            <td className="px-3 py-2">
                              {resolvedGroupName}
                            </td>

                            {columnVisibility.opening && (
                              <td className="px-3 py-2 text-right font-mono">
                                ₹ {mData.opening.toLocaleString()} {mData.balanceType === 'debit' ? 'Dr' : 'Cr'}
                              </td>
                            )}

                            {columnVisibility.debit && (
                              <td className="px-3 py-2 text-right font-mono">
                                ₹ {mData.debit.toLocaleString()}
                              </td>
                            )}

                            {columnVisibility.credit && (
                              <td className="px-3 py-2 text-right font-mono">
                                ₹ {mData.credit.toLocaleString()}
                              </td>
                            )}

                            {columnVisibility.closing && (
                              <td className="px-3 py-2 text-right font-medium font-mono">
                                ₹ {Math.abs(mData.closing).toLocaleString()} {mData.closing >= 0 ? (mData.balanceType === 'debit' ? 'Dr' : 'Cr') : (mData.balanceType === 'debit' ? 'Cr' : 'Dr')}
                              </td>
                            )}
                          </tr>
                        );
                      });

                    })()}
                  </tbody>

                  {/* Footer */}
                  {(() => {

                    const idx = selectedMonth ?? 0;

                    const entries = ledgers.map(
                      (l) => generateMonthlyData(l)[idx]
                    );

                    const tOpening = entries.reduce((s, e) => s + Math.abs(e.opening), 0);
                    const tDebit = entries.reduce((s, e) => s + e.debit, 0);
                    const tCredit = entries.reduce((s, e) => s + e.credit, 0);
                    const tClosing = entries.reduce((s, e) => s + Math.abs(e.closing), 0);

                    if (tOpening === 0 && tDebit === 0 && tCredit === 0) return null;

                    return (
                      <tfoot className="bg-gray-100 border-t font-semibold">
                        <tr className="font-bold border-t-2 border-gray-300">
                          <td colSpan={2} className="px-3 py-2">
                            Total
                          </td>

                          {columnVisibility.opening && (
                            <td className="px-3 py-2 text-right font-mono">
                              ₹ {tOpening.toLocaleString()}
                            </td>
                          )}

                          {columnVisibility.debit && (
                            <td className="px-3 py-2 text-right font-mono">
                              ₹ {tDebit.toLocaleString()}
                            </td>
                          )}

                          {columnVisibility.credit && (
                            <td className="px-3 py-2 text-right font-mono">
                              ₹ {tCredit.toLocaleString()}
                            </td>
                          )}

                          {columnVisibility.closing && (
                            <td className="px-3 py-2 text-right font-mono font-bold">
                              ₹ {tClosing.toLocaleString()}
                            </td>
                          )}
                        </tr>
                      </tfoot>
                    );
                  })()}

                </table>
              </div>

            </div>
          )}


        </div>
      </div>

      {/* Group Totals Summary */}
      <div
        className={`mt-6 p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
          }`}
      >
        <div className="flex justify-between">
          <h2 className="text-xl font-bold mb-4">Group Summary</h2>
          <div>
            <p className="text-sm opacity-75">Opening Balance</p>
            <p className="text-xl font-bold">₹ {totalOpening.toLocaleString()}</p>
          </div>

          <div>
            <p className="text-sm opacity-75">Total Debit</p>
            <p className="text-xl font-bold">₹ {totalDebit.toLocaleString()}</p>
          </div>

          <div>
            <p className="text-sm opacity-75">Total Credit</p>
            <p className="text-xl font-bold">₹ {totalCredit.toLocaleString()}</p>
          </div>

          <div>
            <p className="text-sm opacity-75">Closing Balance</p>
            <p className="text-xl font-bold">
              ₹ {totalClosing.toLocaleString()}
            </p>
          </div>
          <div className="mt-4">
            <p className="text-sm opacity-75">
              Number of Ledgers: {ledgers.length}
            </p>
          </div>
        </div>
      </div>

      <div
        className={`mt-6 p-4 rounded ${theme === "dark" ? "bg-gray-800" : "bg-blue-50"
          }`}
      >
        <p className="text-sm">
          <span className="font-semibold">Pro Tip:</span> Click on any ledger to
          view detailed ledger report. Use view mode buttons to switch between
          consolidated and monthly-wise views. Press F5 to refresh, F12 to
          configure display options.
        </p>
      </div>
    </div>
  );
};

export default GroupSummary;
