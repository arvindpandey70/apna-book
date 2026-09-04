import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useAppContext } from "../../../context/AppContext";
import { allSystemGroups } from "../../../constants/ledgerGroups";
import Swal from "sweetalert2";
import type { Ledger } from "../../../types";

const OpeningBalance: React.FC = () => {
  const { theme } = useAppContext();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [selectedSubGroupFilter, setSelectedSubGroupFilter] = useState<string>("all");
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({});

  const toggleGroupExpand = (groupId: number) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const companyId = localStorage.getItem("company_id");
        const ownerType = localStorage.getItem("supplier");
        const userType = localStorage.getItem("userType");

        let fetchOwnerType = ownerType;
        let fetchOwnerId = ownerType === "employee"
          ? localStorage.getItem("employee_id")
          : localStorage.getItem("user_id");

        if (userType === "ca_employee") {
          fetchOwnerType = "employee";
          fetchOwnerId = localStorage.getItem("employee_id");
        }

        if (!companyId || !fetchOwnerType || !fetchOwnerId) {
          setGroups([...allSystemGroups]);
          return;
        }

        // Fetch groups
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/ledger-groups?company_id=${companyId}&owner_type=${fetchOwnerType}&owner_id=${fetchOwnerId}`
        );
        const data = await res.json();
        const userGroups = Array.isArray(data) ? data : [];
        setGroups([...allSystemGroups, ...userGroups]);

        // Fetch ledgers
        const ledgerRes = await fetch(
          `${import.meta.env.VITE_API_URL}/api/ledger?company_id=${companyId}&owner_type=${fetchOwnerType}&owner_id=${fetchOwnerId}`
        );
        const ledgerData = await ledgerRes.json();
        setLedgers(Array.isArray(ledgerData) ? ledgerData : []);
      } catch (err) {
        console.error("Failed to load data", err);
        setGroups([...allSystemGroups]);
      }
    };

    fetchData();
  }, []);

  const findSubGroups = (targetGroupId: number, allGroups: any[]): number[] => {
    const visited = new Set<number>();
    const results: number[] = [];

    const traverse = (currentId: number) => {
      if (visited.has(currentId)) return;
      visited.add(currentId);
      results.push(currentId);

      const currentGroup = allGroups.find((g) => Number(g.id) === currentId);
      const currentGroupName = currentGroup ? String(currentGroup.name || "").toLowerCase() : "";

      const childGroups = allGroups.filter((g) => {
        if (visited.has(Number(g.id))) return false;

        const rawParent =
          g.parent !== undefined && g.parent !== null
            ? g.parent
            : g.parent_id !== undefined && g.parent_id !== null
            ? g.parent_id
            : g.under;

        if (rawParent === undefined || rawParent === null || rawParent === "") return false;

        // 1. Compare by numeric ID
        if (!isNaN(Number(rawParent)) && Number(rawParent) === currentId) {
          return true;
        }

        // 2. Compare by Name if rawParent is string
        if (currentGroupName && typeof rawParent === "string" && rawParent.toLowerCase() === currentGroupName) {
          return true;
        }

        return false;
      });

      childGroups.forEach((c) => {
        traverse(Number(c.id));
      });
    };

    traverse(targetGroupId);
    return results;
  };

  const getGroupedLedgersForGroup = (selectedGroupId: number) => {
    const allSubGroupIds = findSubGroups(selectedGroupId, groups);
    const seenLedgerIds = new Set<number | string>();

    interface GroupBucket {
      groupId: number;
      groupName: string;
      isDirect: boolean;
      ledgers: Ledger[];
    }

    const buckets: GroupBucket[] = [];

    allSubGroupIds.forEach((gId) => {
      const groupObj = groups.find((g) => Number(g.id) === gId);
      const groupName = groupObj
        ? String(groupObj.name || "")
        : gId === selectedGroupId
        ? "Direct Ledgers"
        : `Group ${gId}`;
      const groupNameLower = groupName.toLowerCase();
      const isDirect = gId === selectedGroupId;

      const groupLedgers = ledgers.filter((ledger) => {
        if (seenLedgerIds.has(ledger.id)) return false;

        const lGroupId =
          ledger.groupId !== undefined && ledger.groupId !== null
            ? ledger.groupId
            : (ledger as any).group_id;
        const lGroupName = (ledger as any).group_name || (ledger as any).group;

        let isMatch = false;
        if (lGroupId !== undefined && lGroupId !== null && !isNaN(Number(lGroupId))) {
          if (Number(lGroupId) === gId) isMatch = true;
        }

        if (
          !isMatch &&
          lGroupId &&
          typeof lGroupId === "string" &&
          lGroupId.toLowerCase() === groupNameLower
        ) {
          isMatch = true;
        }

        if (
          !isMatch &&
          lGroupName &&
          typeof lGroupName === "string" &&
          lGroupName.toLowerCase() === groupNameLower
        ) {
          isMatch = true;
        }

        if (isMatch) {
          seenLedgerIds.add(ledger.id);
          return true;
        }
        return false;
      });

      if (groupLedgers.length > 0) {
        buckets.push({
          groupId: gId,
          groupName,
          isDirect,
          ledgers: groupLedgers,
        });
      }
    });

    const remainingLedgers = ledgers.filter((ledger) => {
      if (seenLedgerIds.has(ledger.id)) return false;
      const lGroupId =
        ledger.groupId !== undefined && ledger.groupId !== null
          ? ledger.groupId
          : (ledger as any).group_id;
      if (lGroupId !== undefined && lGroupId !== null && allSubGroupIds.includes(Number(lGroupId))) {
        seenLedgerIds.add(ledger.id);
        return true;
      }
      return false;
    });

    if (remainingLedgers.length > 0) {
      buckets.push({
        groupId: -999,
        groupName: "Other Ledgers",
        isDirect: false,
        ledgers: remainingLedgers,
      });
    }

    return buckets;
  };

  const getLedgersForGroup = (groupId: number) => {
    return getGroupedLedgersForGroup(groupId).flatMap((b) => b.ledgers);
  };

  const handleLedgerChange = (ledgerId: number, field: string, value: string | number) => {
    setLedgers(prev => prev.map(l => l.id === ledgerId ? { ...l, [field]: value } : l));
  };

  const handleSaveLedger = async (ledger: Ledger) => {
    try {
      const companyId = localStorage.getItem("company_id");
      const ownerType = localStorage.getItem("supplier");
      const ownerId = localStorage.getItem(ownerType === "employee" ? "employee_id" : "user_id");
      
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/ledger/${ledger.id}?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(ledger),
        }
      );
      
      if (res.ok) {
        Swal.fire({
          icon: "success",
          title: "Saved!",
          text: "Opening balance updated.",
          timer: 1500,
          showConfirmButton: false,
        });
      } else {
        const errData = await res.json();
        Swal.fire("Error", errData.message || "Failed to update ledger", "error");
      }
    } catch (err) {
      console.error("Update error", err);
      Swal.fire("Error", "Network error occurred", "error");
    }
  };

  return (
    <div className="p-4 sm:p-6 pt-8 sm:pt-12 max-w-7xl mx-auto mt-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            title="Back"
            onClick={() => selectedGroup ? setSelectedGroup(null) : navigate("/app/masters/ledger")}
            className={`p-2 rounded-full transition-colors ${
              theme === "dark" ? "hover:bg-gray-700 text-gray-200" : "hover:bg-gray-200 text-gray-700"
            }`}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1
              className={`text-2xl font-bold ${
                theme === "dark" ? "text-gray-100" : "text-gray-900"
              }`}
            >
              {selectedGroup ? `Opening Balance - ${selectedGroup.name}` : "Opening Balance Entry"}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {selectedGroup ? `Set opening balances for ledgers under ${selectedGroup.name}` : "Select a group to manage ledger opening balances"}
            </p>
          </div>
        </div>
      </div>

      {!selectedGroup ? (
        <div className="flex flex-col md:flex-row gap-6 mb-6">
          {/* Liabilities Column */}
          <div className={`p-6 rounded-lg w-full md:w-1/2 ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"}`}>
            <h2 className="mb-4 text-xl font-bold text-center border-b pb-2 text-red-600 dark:text-red-400 border-gray-200 dark:border-gray-700">
              Liabilities
            </h2>
            <div className="grid grid-cols-2 gap-2 pb-2 border-b-2 border-gray-400 font-semibold text-sm mb-2">
              <div>Group Particulars</div>
              <div className="text-right">Ledgers Count</div>
            </div>
            <div className="space-y-1">
              {["Capital Account", "Loan(Liability)", "Current Liabilities", "TDS Payables"].map((groupName) => {
                const group = groups.find(g => g.name.toLowerCase() === groupName.toLowerCase());
                if (!group) return null;
                const groupLedgers = getLedgersForGroup(group.id);
                
                return (
                  <div 
                    key={group.id}
                    onClick={() => {
                      setSelectedGroup(group);
                      setSelectedSubGroupFilter("all");
                    }}
                    className={`grid grid-cols-2 gap-2 py-2.5 px-2 border-b border-gray-200 dark:border-gray-700 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded`}
                  >
                    <span className="text-blue-600 font-semibold hover:underline flex items-center gap-1.5">
                      {group.name}
                    </span>
                    <div className="text-right">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full inline-block ${
                        groupLedgers.length > 0 
                          ? (theme === "dark" ? "bg-red-900/50 text-red-300" : "bg-red-100 text-red-800")
                          : (theme === "dark" ? "bg-gray-700 text-gray-400" : "bg-gray-200 text-gray-600")
                      }`}>
                        {groupLedgers.length} {groupLedgers.length === 1 ? "Ledger" : "Ledgers"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Assets Column */}
          <div className={`p-6 rounded-lg w-full md:w-1/2 ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"}`}>
            <h2 className="mb-4 text-xl font-bold text-center border-b pb-2 text-green-600 dark:text-green-400 border-gray-200 dark:border-gray-700">
              Assets
            </h2>
            <div className="grid grid-cols-2 gap-2 pb-2 border-b-2 border-gray-400 font-semibold text-sm mb-2">
              <div>Group Particulars</div>
              <div className="text-right">Ledgers Count</div>
            </div>
            <div className="space-y-1">
              {["Fixed Assets", "Current Assets"].map((groupName) => {
                const group = groups.find(g => g.name.toLowerCase() === groupName.toLowerCase());
                if (!group) return null;
                const groupLedgers = getLedgersForGroup(group.id);
                
                return (
                  <div 
                    key={group.id}
                    onClick={() => {
                      setSelectedGroup(group);
                      setSelectedSubGroupFilter("all");
                    }}
                    className={`grid grid-cols-2 gap-2 py-2.5 px-2 border-b border-gray-200 dark:border-gray-700 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded`}
                  >
                    <span className="text-blue-600 font-semibold hover:underline flex items-center gap-1.5">
                      {group.name}
                    </span>
                    <div className="text-right">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full inline-block ${
                        groupLedgers.length > 0 
                          ? (theme === "dark" ? "bg-green-900/50 text-green-300" : "bg-green-100 text-green-800")
                          : (theme === "dark" ? "bg-gray-700 text-gray-400" : "bg-gray-200 text-gray-600")
                      }`}>
                        {groupLedgers.length} {groupLedgers.length === 1 ? "Ledger" : "Ledgers"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className={`p-6 rounded-lg ${theme === "dark" ? "bg-gray-800 text-white" : "bg-white shadow"}`}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b pb-4 border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-xl font-bold">Ledgers in {selectedGroup.name}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Enter opening balance values and select Debit or Credit balance type for each ledger
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
              {/* Subgroup Filter Dropdown */}
              {(() => {
                const buckets = getGroupedLedgersForGroup(selectedGroup.id);
                if (buckets.length <= 1) return null;

                return (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      Filter Subgroup:
                    </label>
                    <select
                      value={selectedSubGroupFilter}
                      onChange={(e) => setSelectedSubGroupFilter(e.target.value)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded border outline-none transition-colors ${
                        theme === "dark"
                          ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500"
                          : "bg-white border-gray-300 text-gray-800 focus:border-blue-500"
                      }`}
                    >
                      <option value="all">All Subgroups ({getLedgersForGroup(selectedGroup.id).length} ledgers)</option>
                      {buckets.map((b) => (
                        <option key={b.groupId} value={b.groupId.toString()}>
                          {b.isDirect ? `Direct Ledgers (${selectedGroup.name})` : b.groupName} ({b.ledgers.length})
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              <button
                onClick={() => {
                  setSelectedGroup(null);
                  setSelectedSubGroupFilter("all");
                }}
                className={`text-xs font-semibold px-3 py-1.5 rounded border transition-colors ${
                  theme === "dark" ? "border-gray-600 hover:bg-gray-700 text-gray-300" : "border-gray-300 hover:bg-gray-100 text-gray-700"
                }`}
              >
                ← Choose Another Group
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 dark:border-gray-700 border-gray-400">
                  <th className="py-3 px-4 font-semibold text-sm">Ledger Name</th>
                  <th className="py-3 px-4 font-semibold text-sm">GST Number</th>
                  <th className="py-3 px-4 text-right font-semibold text-sm">Opening Balance</th>
                  <th className="py-3 px-4 text-center font-semibold text-sm">Type</th>
                  <th className="py-3 px-4 text-center font-semibold text-sm">Action</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const buckets = getGroupedLedgersForGroup(selectedGroup.id);
                  const displayLedgers = selectedSubGroupFilter === "all"
                    ? getLedgersForGroup(selectedGroup.id)
                    : (buckets.find(b => b.groupId.toString() === selectedSubGroupFilter)?.ledgers || []);

                  if (displayLedgers.length === 0) {
                    return (
                      <tr>
                        <td colSpan={5} className="py-8 px-4 text-center opacity-70 italic">
                          No ledgers found in this subgroup selection.
                        </td>
                      </tr>
                    );
                  }

                  return displayLedgers.map((ledger) => (
                    <tr
                      key={ledger.id}
                      className={`border-b transition-colors ${
                        theme === "dark"
                          ? "border-gray-700 hover:bg-gray-700/40"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <td className="py-3 px-4 text-blue-600 font-medium">
                        {ledger.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-sm opacity-80">{ledger.gstNumber || "-"}</td>
                      <td className="py-3 px-4 text-right font-mono">
                        <input
                          type="number"
                          value={ledger.openingBalance || ""}
                          onChange={(e) => handleLedgerChange(ledger.id, "openingBalance", e.target.value)}
                          className={`w-36 px-3 py-1.5 text-right font-mono text-sm border rounded outline-none transition-colors ${
                            theme === "dark"
                              ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              : "bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          }`}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <select
                          value={ledger.balanceType || ""}
                          onChange={(e) => handleLedgerChange(ledger.id, "balanceType", e.target.value)}
                          className={`w-28 px-2 py-1.5 text-sm border rounded outline-none transition-colors ${
                            theme === "dark"
                              ? "bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              : "bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          }`}
                        >
                          <option value="">Select</option>
                          <option value="debit">DEBIT</option>
                          <option value="credit">CREDIT</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleSaveLedger(ledger)}
                          className={`p-2 rounded-lg transition-colors flex items-center justify-center mx-auto ${
                            theme === "dark"
                              ? "bg-blue-600 hover:bg-blue-700 text-white"
                              : "bg-blue-600 hover:bg-blue-700 text-white"
                          }`}
                          title="Save Opening Balance"
                        >
                          <Save size={16} />
                        </button>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpeningBalance;
