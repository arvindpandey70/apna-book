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
    <div className="pt-[56px] px-4 pb-8">
      <div className="flex items-center mb-6">
        <button
          title="Back"
          onClick={() => selectedGroup ? setSelectedGroup(null) : navigate("/app/masters/ledger")}
          className={`mr-4 p-2 rounded-full ${
            theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
          }`}
        >
          <ArrowLeft size={20} />
        </button>
        <h1
          className={`text-2xl font-bold ${
            theme === "dark" ? "text-gray-100" : "text-gray-900"
          }`}
        >
          {selectedGroup ? `Opening Balance - ${selectedGroup.name}` : "Opening Balance"}
        </h1>
      </div>

      <div
        className={`p-6 rounded-lg ${
          theme === "dark" ? "bg-gray-800 text-white" : "bg-white shadow"
        }`}
      >
        {!selectedGroup ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Liabilities Column */}
              <div>
                <h2 className={`text-xl font-bold mb-4 border-b-2 pb-2 ${theme === "dark" ? "border-red-900/50 text-red-400" : "border-red-200 text-red-600"}`}>
                  Liabilities
                </h2>
                <div className="flex flex-col space-y-3">
                  {["Capital Account", "Loan(Liability)", "Current Liabilities", "TDS Payables"].map((groupName) => {
                    const group = groups.find(g => g.name.toLowerCase() === groupName.toLowerCase());
                    if (!group) return null;
                    const groupLedgers = getLedgersForGroup(group.id);
                    
                    return (
                      <div 
                        key={group.id}
                        onClick={() => setSelectedGroup(group)}
                        className={`p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md ${
                          theme === "dark" 
                            ? "border-gray-700 bg-gray-900/50 hover:border-red-500/50" 
                            : "border-gray-200 bg-gray-50 hover:border-red-300 hover:bg-red-50/30"
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <h3 className="font-semibold text-lg">{group.name}</h3>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                            groupLedgers.length > 0 
                              ? (theme === "dark" ? "bg-red-900/50 text-red-300" : "bg-red-100 text-red-800")
                              : (theme === "dark" ? "bg-gray-700 text-gray-400" : "bg-gray-200 text-gray-600")
                          }`}>
                            {groupLedgers.length} Ledgers
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Assets Column */}
              <div>
                <h2 className={`text-xl font-bold mb-4 border-b-2 pb-2 ${theme === "dark" ? "border-green-900/50 text-green-400" : "border-green-200 text-green-600"}`}>
                  Assets
                </h2>
                <div className="flex flex-col space-y-3">
                  {["Fixed Assets", "Current Assets"].map((groupName) => {
                    const group = groups.find(g => g.name.toLowerCase() === groupName.toLowerCase());
                    if (!group) return null;
                    const groupLedgers = getLedgersForGroup(group.id);
                    
                    return (
                      <div 
                        key={group.id}
                        onClick={() => setSelectedGroup(group)}
                        className={`p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md ${
                          theme === "dark" 
                            ? "border-gray-700 bg-gray-900/50 hover:border-green-500/50" 
                            : "border-gray-200 bg-gray-50 hover:border-green-300 hover:bg-green-50/30"
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <h3 className="font-semibold text-lg">{group.name}</h3>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                            groupLedgers.length > 0 
                              ? (theme === "dark" ? "bg-green-900/50 text-green-300" : "bg-green-100 text-green-800")
                              : (theme === "dark" ? "bg-gray-700 text-gray-400" : "bg-gray-200 text-gray-600")
                          }`}>
                            {groupLedgers.length} Ledgers
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-center mb-6 border-b pb-3">
              <h2 className="text-xl font-semibold">Ledgers in {selectedGroup.name}</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={theme === "dark" ? "bg-indigo-900/50 text-indigo-200" : "bg-indigo-100 text-indigo-800"}>
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold rounded-tl-lg">Ledger Name</th>
                    <th className="px-4 py-3 text-left font-semibold">GST Number</th>
                    <th className="px-4 py-3 text-right font-semibold">Opening Balance</th>
                    <th className="px-4 py-3 text-center font-semibold">Type</th>
                    <th className="px-4 py-3 text-center font-semibold rounded-tr-lg">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {getGroupedLedgersForGroup(selectedGroup.id).length > 0 ? (
                    getGroupedLedgersForGroup(selectedGroup.id).map((bucket) => {
                      const isExpanded = !!expandedGroups[bucket.groupId];
                      return (
                        <React.Fragment key={bucket.groupId}>
                          <tr
                            onClick={() => toggleGroupExpand(bucket.groupId)}
                            className={`cursor-pointer transition-colors select-none ${
                              theme === "dark"
                                ? "bg-gray-700/90 hover:bg-gray-700 text-indigo-300 font-semibold border-b border-gray-600"
                                : "bg-indigo-50/90 hover:bg-indigo-100/90 text-indigo-900 font-semibold border-b border-indigo-200"
                            }`}
                          >
                            <td colSpan={5} className="px-4 py-2.5 text-sm">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <span className="text-gray-500 dark:text-gray-400 font-mono text-xs w-4">
                                    {isExpanded ? "▼" : "▶"}
                                  </span>
                                  <span className="text-base">{bucket.isDirect ? "📌" : "📁"}</span>
                                  <span className="font-bold">
                                    {bucket.isDirect
                                      ? `Direct Ledgers in ${selectedGroup.name}`
                                      : `Subgroup: ${bucket.groupName}`}
                                  </span>
                                  <span className="text-xs font-normal opacity-75">
                                    ({bucket.ledgers.length} {bucket.ledgers.length === 1 ? "ledger" : "ledgers"})
                                  </span>
                                </div>
                                <span className="text-xs font-normal opacity-60">
                                  {isExpanded ? "Click to collapse" : "Click to expand"}
                                </span>
                              </div>
                            </td>
                          </tr>
                          {isExpanded &&
                            bucket.ledgers.map((ledger) => (
                              <tr
                                key={ledger.id}
                                className={`transition-colors ${
                                  theme === "dark"
                                    ? "border-b border-gray-700 hover:bg-indigo-900/30"
                                    : "border-b border-gray-200 hover:bg-indigo-50/80"
                                }`}
                              >
                                <td className="px-4 py-3 font-medium text-indigo-600 dark:text-indigo-400 pl-10">
                                  <span className="text-gray-400 dark:text-gray-500 mr-2">└─</span>
                                  {ledger.name}
                                </td>
                                <td className="px-4 py-3">{ledger.gstNumber || "-"}</td>
                                <td className="px-4 py-3 text-right font-mono">
                                  <input
                                    type="number"
                                    value={ledger.openingBalance || ""}
                                    onChange={(e) => handleLedgerChange(ledger.id, "openingBalance", e.target.value)}
                                    className={`w-32 px-2 py-1 text-right border rounded ${
                                      theme === "dark"
                                        ? "bg-gray-800 border-gray-600 text-white focus:border-indigo-500"
                                        : "bg-white border-gray-300 focus:border-indigo-500"
                                    } outline-none focus:ring-1 focus:ring-indigo-500`}
                                  />
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <select
                                    value={ledger.balanceType || ""}
                                    onChange={(e) => handleLedgerChange(ledger.id, "balanceType", e.target.value)}
                                    className={`w-28 px-2 py-1 border rounded ${
                                      theme === "dark"
                                        ? "bg-gray-800 border-gray-600 text-white focus:border-indigo-500"
                                        : "bg-white border-gray-300 focus:border-indigo-500"
                                    } outline-none focus:ring-1 focus:ring-indigo-500`}
                                  >
                                    <option value="">Select</option>
                                    <option value="debit">DEBIT</option>
                                    <option value="credit">CREDIT</option>
                                  </select>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => handleSaveLedger(ledger)}
                                    className={`p-1.5 rounded-full transition-colors ${
                                      theme === "dark"
                                        ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                                        : "bg-indigo-100 hover:bg-indigo-200 text-indigo-700"
                                    }`}
                                    title="Save"
                                  >
                                    <Save size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center opacity-70">
                        No ledgers found in this group.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OpeningBalance;

