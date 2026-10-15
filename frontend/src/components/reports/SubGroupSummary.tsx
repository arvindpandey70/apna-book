import React, { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAppContext } from "../../context/AppContext";
import { ArrowLeft } from "lucide-react";
import { allSystemGroups as baseGroups } from "../../constants/ledgerGroups";



interface Ledger {
  id: number;
  name: string;
  group_id: number;
  openingBalance: number;
  balanceType: "debit" | "credit";
  closingBalance: number;
  groupName?: string;
}

interface Group {
  id: number;
  name: string;
  parent: number | null;
}

interface DebitCreditData {
  [ledgerId: number]: { debit: number; credit: number };
}

interface BaseGroup {
  id: number;
  name: string;
  nature: string;
}



// group name

const SubGroupSummary: React.FC = () => {
  const { theme } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const { groupId } = useParams<{ groupId: string }>();
  console.log('groupid', groupId)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subGroups, setSubGroups] = useState<Group[]>([]);
  const [allFetchedGroups, setAllFetchedGroups] = useState<Group[]>([]);
  const groupIds = [Number(groupId)];
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [debitCreditData, setDebitCreditData] = useState<DebitCreditData>({});
  const [groupName, setGroupName] = useState<string>(
    location.state?.groupName || `Group ${groupId}`
  );


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


  useEffect(() => {
    const fetchGroupDataRecursive = async () => {
      setLoading(true);
      setError(null);
      try {
        let allSubGroups: Group[] = [];
        let allLedgers: Ledger[] = [];
        const fetchedIds = new Set<number>();
        const queue: number[] = [Number(groupId)];

        while (queue.length > 0) {
          const gId = queue.shift()!;
          if (fetchedIds.has(gId)) continue;
          fetchedIds.add(gId);

          const url = `${import.meta.env.VITE_API_URL}/api/balance-sheet/group?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&id=${gId}`;

          const res = await fetch(url);
          if (!res.ok) throw new Error(`Failed to load data for group ${gId}`);
          const data = await res.json();

          if (data.success) {
            // Normalize groups
            const normalizedFetchedGroups = (data.groups || []).map((g: any) => ({
              id: Number(g.id),
              name: g.name,
              parent: g.parent ? Number(g.parent) : null
            }));

            // Normalize ledgers - CRITICAL to check both group_id and groupId
            const rawLedgers = data.ledgers || [];
            const normalizedLedgers = rawLedgers.map((l: any) => {
              const gid = Number(l.group_id || l.groupId);
              const bg = baseGroups.find((g) => g.id === gid);
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
                group_id: gid,
                openingBalance: rawOpening,
                balanceType: l.balance_type || l.balanceType || "debit",
                closingBalance: closingBalance,
                groupName: l.group_name || l.groupName || bg?.name || "",
              };
            });

            allLedgers = [...allLedgers, ...normalizedLedgers];
            allSubGroups = [...allSubGroups, ...normalizedFetchedGroups];

            // Add new database subgroups to queue
            normalizedFetchedGroups.forEach((g: Group) => {
              if (!fetchedIds.has(g.id)) {
                queue.push(g.id);
              }
            });

            // Add system subgroups matching this parent to queue
            const systemChildren = baseGroups.filter(bg => Number(bg.parent) === gId);
            systemChildren.forEach(sc => {
              if (!fetchedIds.has(sc.id)) {
                queue.push(sc.id);
                // Also add to allSubGroups if not present
                if (!allSubGroups.some(ug => ug.id === sc.id)) {
                  allSubGroups.push({ id: sc.id, name: sc.name, parent: sc.parent });
                }
              }
            });
          }
        }

        // Deduplicate ledgers and subgroups by ID
        const uniqueLedgers = allLedgers.reduce((acc: Ledger[], current) => {
          if (!acc.find(l => l.id === current.id)) {
            acc.push(current);
          }
          return acc;
        }, []);

        const uniqueSubGroups = allSubGroups.reduce((acc: Group[], current) => {
          if (!acc.find(g => g.id === current.id)) {
            acc.push(current);
          }
          return acc;
        }, []);

        const currentUrlGroupId = Number(groupId);
        const filteredGroups = uniqueSubGroups.filter(g => Number(g.parent) === currentUrlGroupId);

        setSubGroups(filteredGroups);
        setAllFetchedGroups(uniqueSubGroups);
        setLedgers(uniqueLedgers);
      } catch (err: any) {
        setError(err.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    if (groupId) {
      fetchGroupDataRecursive();
    }
  }, [groupId, companyId, ownerType, ownerId]);

  // Fetch debit/credit data for all ledgers
  useEffect(() => {
    const fetchDebitCreditData = async () => {
      if (!companyId || !ownerType || !ownerId || ledgers.length === 0) {
        return;
      }

      try {
        const ledgerIds = ledgers.map((l) => l.id).join(",");
        const url =
          `${import.meta.env.VITE_API_URL}/api/group` +
          `?company_id=${companyId}` +
          `&owner_type=${ownerType}` +
          `&owner_id=${ownerId}` +
          `&ledgerIds=${ledgerIds}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load debit/credit data");
        const data = await res.json();

        if (data.success && data.data) {
          setDebitCreditData(data.data);
        }
      } catch (err) {
        console.error("Error fetching debit/credit data:", err);
      }
    };

    fetchDebitCreditData();
  }, [ledgers, companyId, ownerType, ownerId]);


  //group name 
  useEffect(() => {
    if (!groupId) return;

    // 1️⃣ Agar navigation se name aaya hai
    if (location.state?.groupName) {
      setGroupName(location.state.groupName);
      return;
    }

    // 2️⃣ baseGroups se match karo
    const baseGroup = baseGroups.find(
      (g) => g.id === Number(groupId)
    );

    if (baseGroup) {
      setGroupName(baseGroup.name);
    } else {
      setGroupName(`Group ${groupId}`);
    }
  }, [groupId, location.state]);


  // 1. Data Processing & Scoping
  // Group ledgers by group_id
  const ledgersByGroup: { [key: number]: Ledger[] } = {};
  ledgers.forEach((ledger) => {
    if (!ledgersByGroup[ledger.group_id]) {
      ledgersByGroup[ledger.group_id] = [];
    }
    ledgersByGroup[ledger.group_id].push(ledger);
  });

  // Get direct ledgers (ledgers directly under the CURRENT group)
  const directLedgers = ledgers.filter((l) =>
    groupIds.includes(Number(l.group_id))
  );

  const isStockInHandLedger = (l: Ledger) => {
    if (Number(groupId) === -108) return true;
    if (Number(l.group_id) === -108) return true;

    const gName = (l.groupName || "").toLowerCase().replace(/[\s-_]/g, "");
    if (gName === "stockinhand" || gName.includes("stockinhand")) return true;

    const bg = baseGroups.find((g) => g.id === Number(l.group_id));
    if (bg) {
      const bgName = bg.name.toLowerCase().replace(/[\s-_]/g, "");
      if (bg.id === -108 || bgName === "stockinhand" || bgName.includes("stockinhand")) return true;
    }

    const isDescendant = (grpId: number, visited = new Set<number>()): boolean => {
      if (visited.has(grpId)) return false;
      visited.add(grpId);
      if (grpId === -108) return true;
      const grp =
        allFetchedGroups.find((g) => g.id === grpId) ||
        baseGroups.find((g) => g.id === grpId);
      if (grp) {
        const cleanName = (grp.name || "").toLowerCase().replace(/[\s-_]/g, "");
        if (cleanName === "stockinhand" || cleanName.includes("stockinhand")) return true;
        if (grp.parent !== null && grp.parent !== undefined) {
          return isDescendant(Number(grp.parent), visited);
        }
      }
      return false;
    };

    return isDescendant(Number(l.group_id));
  };

  // 2. Calculation Functions
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
    if (Math.abs(amount) < 0.01) return "";
    return `${Math.abs(amount).toLocaleString()} ${amount > 0 ? "Dr" : "Cr"}`;
  };

  const calculateGrandTotal = () => {
    let opening = 0;
    let debit = 0;
    let credit = 0;
    let closing = 0;

    directLedgers.forEach((ledger) => {
      const b = getLedgerBalances(ledger);
      opening += b.openingSigned;
      debit += b.debit;
      credit += b.credit;
      closing += b.closingSigned;
    });

    return { opening, debit, credit, closing };
  };

  const calculateSubGroupGrandTotal = () => {
    let opening = 0;
    let debit = 0;
    let credit = 0;
    let closing = 0;

    subGroups.forEach((group) => {
      const groupLedgers = ledgersByGroup[group.id] || [];
      groupLedgers.forEach((ledger) => {
        const b = getLedgerBalances(ledger);
        opening += b.openingSigned;
        debit += b.debit;
        credit += b.credit;
        closing += b.closingSigned;
      });
    });

    return { opening, debit, credit, closing };
  };

  const getGroupTotals = (targetGroupId: number, allGroups: Group[]) => {
    // Find all recursive child groups in the current data
    const findAllChildren = (id: number): number[] => {
      let results = [id];
      allGroups.filter(g => Number(g.parent) === Number(id)).forEach(child => {
        results = [...results, ...findAllChildren(Number(child.id))];
      });
      return results;
    };

    const targetGroupIds = findAllChildren(targetGroupId);

    // Ledgers belonging to any of these IDs
    const relevantLedgers = ledgers.filter(l => targetGroupIds.includes(Number(l.group_id)));

    let opening = 0;
    let debit = 0;
    let credit = 0;
    let closing = 0;

    relevantLedgers.forEach((ledger) => {
      const b = getLedgerBalances(ledger);
      opening += b.openingSigned;
      debit += b.debit;
      credit += b.credit;
      closing += b.closingSigned;
    });

    return { opening, debit, credit, closing };
  };

  // 3. Handlers

  return (
    <div className="pt-[56px] px-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/app/reports/balance-sheet")}
            className={`p-2 rounded-full ${theme === "dark"
              ? "hover:bg-gray-700"
              : "hover:bg-gray-200"
              }`}
            title="Back to Balance Sheet"
          >
            <ArrowLeft size={20} />
          </button>

          <h1 className="text-2xl font-bold">{groupName}</h1>
        </div>



      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && (
        <>
          {/* Direct Ledgers Section */}
          {/* Direct Ledgers Section */}
          {directLedgers.length > 0 && (
            <div
              className={`mb-8 p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
                }`}
            >
              <h2 className="text-xl font-semibold mb-4 text-blue-600">
                Ledgers
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b dark:border-gray-700">
                      <th className="py-3 px-4 font-semibold">Ledger Name</th>
                      <th className="py-3 px-4 text-right">Opening Balance</th>
                      <th className="py-3 px-4 text-right">Debit</th>
                      <th className="py-3 px-4 text-right">Credit</th>
                      <th className="py-3 px-4 text-right">Closing Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Group ledgers by group_id first */}
                    {Object.entries(ledgersByGroup)
                      .filter(([id]) => groupIds.includes(Number(id))) // only direct groups
                      .map(([grpId, groupLedgers], idx, arr) => (
                        <React.Fragment key={grpId}>
                          {groupLedgers.map((ledger) => {
                            const b = getLedgerBalances(ledger);
                            const trimmedName = ledger.name.trim().toLowerCase();
                            const isCashLedger =
                              trimmedName === "cash" ||
                              trimmedName === "cash a/c" ||
                              trimmedName === "cash account" ||
                              trimmedName.startsWith("cash a/c") ||
                              trimmedName.startsWith("cash ");
                            const isCreditBalance = b.closingSigned < -0.001;
                            const isRedClosingBalance = isCashLedger && isCreditBalance;
                            const isStock = isStockInHandLedger(ledger);

                            return (
                              <tr
                                key={ledger.id}
                                onClick={() =>
                                  navigate(`/app/reports/ledger/${ledger.id}`)
                                }
                                className={`border-b cursor-pointer transition-colors ${
                                  theme === "dark"
                                    ? "border-gray-700 hover:bg-gray-700"
                                    : "border-gray-200 hover:bg-gray-50"
                                }`}
                              >
                                <td className="py-3 px-4 text-blue-600 font-medium ">
                                  {ledger.name}
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-sm">
                                  {isStock ? "" : formatBalance(b.openingSigned)}
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-sm">
                                  {isStock ? "" : (b.debit > 0 ? b.debit.toLocaleString() : "")}
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-sm">
                                  {isStock ? "" : (b.credit > 0 ? b.credit.toLocaleString() : "")}
                                </td>
                                <td className={`py-3 px-4 text-right font-mono text-sm font-semibold ${
                                  isRedClosingBalance ? "text-red-600 dark:text-red-400 font-bold" : ""
                                }`}>
                                  {formatBalance(b.closingSigned) || (isStock ? `0.00 ${ledger.balanceType === "credit" ? "Cr" : "Dr"}` : "")}
                                </td>
                              </tr>
                            );
                          })}

                          {/* Add a blank row for spacing between different group_ids */}
                          {idx < arr.length - 1 && (
                            <tr className="h-4"><td colSpan={5}></td></tr>
                          )}
                        </React.Fragment>
                      ))}
                  </tbody>

                  {/* Grand Total Row */}
                  {(() => {
                    const total = calculateGrandTotal();
                    const isCurrentGroupStock = Number(groupId) === -108;

                    return (
                      <tr
                        className={`font-bold border-t-2 ${theme === "dark"
                          ? "border-gray-600 bg-gray-700"
                          : "border-gray-300 bg-gray-100"
                          }`}
                      >
                        <td className="py-3 px-4 text-right">Grand Total</td>
                        <td className="py-3 px-4 text-right font-mono">
                          {isCurrentGroupStock ? "" : formatBalance(total.opening)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {isCurrentGroupStock ? "" : (total.debit > 0 ? total.debit.toLocaleString() : "")}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {isCurrentGroupStock ? "" : (total.credit > 0 ? total.credit.toLocaleString() : "")}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {formatBalance(total.closing) || (isCurrentGroupStock ? "0.00 Dr" : "")}
                        </td>
                      </tr>
                    );
                  })()}
                </table>
              </div>
            </div>
          )}


          {/* Subgroups Section - Summary View */}
          {subGroups.length > 0 && (
            <div
              className={`mb-8 p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
                }`}
            >
              <h2 className="text-xl font-semibold mb-4 text-blue-600">
                Sub-Groups
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 dark:border-gray-700 border-gray-400">
                      <th className="py-3 px-4 font-semibold">Group Name</th>
                      <th className="py-3 px-4 text-right font-semibold">
                        Opening Balance
                      </th>
                      <th className="py-3 px-4 text-right font-semibold">
                        Debit
                      </th>
                      <th className="py-3 px-4 text-right font-semibold">
                        Credit
                      </th>
                      <th className="py-3 px-4 text-right font-semibold">
                        Closing Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {subGroups.map((group) => {
                      const totals = getGroupTotals(
                        group.id,
                        allFetchedGroups
                      );
                      const groupLedgers = ledgersByGroup[group.id] || [];

                      return (
                        <tr
                          key={group.id}
                          onClick={() =>
                            navigate(
                              `/app/reports/sub-group-summary/${group.id}`,
                              { state: { groupName: group.name } }
                            )
                          }
                          className={`border-b cursor-pointer transition-colors ${theme === "dark"
                            ? "border-gray-700 hover:bg-gray-700"
                            : "border-gray-200 hover:bg-gray-50"
                            }`}
                        >
                          <td className="py-3 px-4 text-blue-600 font-medium ">
                            {group.name}
                            {groupLedgers.length === 0 && (
                              <span className="text-gray-500 text-xs ml-2">
                                (No ledgers)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-sm">
                            {Number(groupId) === -108 ? "" : formatBalance(totals.opening)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold">
                            {Number(groupId) === -108 ? "" : (totals.debit > 0 ? totals.debit.toLocaleString() : "")}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold">
                            {Number(groupId) === -108 ? "" : (totals.credit > 0 ? totals.credit.toLocaleString() : "")}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-sm">
                            {formatBalance(totals.closing) || (Number(groupId) === -108 ? "0.00 Dr" : "")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const total = calculateSubGroupGrandTotal();
                      const isCurrentGroupStock = Number(groupId) === -108;

                      return (
                        <tr
                          className={`font-bold border-t-2 ${theme === "dark"
                            ? "border-gray-600 bg-gray-700"
                            : "border-gray-300 bg-gray-100"
                            }`}
                        >
                          <td className="py-3 px-4 text-right">Grand Total</td>
                          <td className="py-3 px-4 text-right font-mono">
                            {isCurrentGroupStock ? "" : formatBalance(total.opening)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {isCurrentGroupStock ? "" : (total.debit > 0 ? total.debit.toLocaleString() : "")}
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {isCurrentGroupStock ? "" : (total.credit > 0 ? total.credit.toLocaleString() : "")}
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {formatBalance(total.closing) || (isCurrentGroupStock ? "0.00 Dr" : "")}
                          </td>
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {subGroups.length === 0 && directLedgers.length === 0 && (
            <div
              className={`p-6 rounded-lg text-center ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
                }`}
            >
              <p className="opacity-75 italic py-10">
                No subgroups or ledgers found in this group.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SubGroupSummary;
