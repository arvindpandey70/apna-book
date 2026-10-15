import React, { useEffect, useState, type ReactNode } from "react";
import { useAppContext } from "../../context/AppContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Building } from "lucide-react";
import { allSystemGroups as baseGroups } from "../../constants/ledgerGroups";
interface GroupType {
  id: number;
  name: string;
  nature?: string;
  description: string;
  icon: ReactNode;
  color: string;
  parent_id?: number | null;
}

const GroupSummaryIndex: React.FC = () => {
  const { theme } = useAppContext();
  const navigate = useNavigate();
  const [groupTypes, setGroupTypes] = useState<GroupType[]>([]);
  const [, setLoading] = useState(true);
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

  const [selectedNature, setSelectedNature] = useState<string | null>(null);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [taxData, setTaxData] = useState<Record<number, { debit: number; credit: number }>>({});


  //fixed ui

  const Assets = [
    {
      name: "Assets",
      type: "Assets",
      description: "View all asset accounts",
      icon: <Building size={24} />,
      color: "bg-green-500",
    },
    {
      name: "Liabilities",
      type: "Liabilities",
      description: "View all liability accounts",
      icon: <Building size={24} />,
      color: "bg-red-500",
    },
    {
      name: "Expenses",
      type: "Expenses",
      description: "View all expense accounts",
      icon: <Building size={24} />,
      color: "bg-yellow-500",
    },
    {
      name: "Income",
      type: "Income",
      description: "View all income accounts",
      icon: <Building size={24} />,
      color: "bg-blue-500",
    },
  ];

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/group-summary?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );

        const data = await res.json();
        console.log("Fetched groups data:", data);

        const backendGroups = (data.ledgerGroups || []).map((g: any) => ({
          id: g.id,
          type: g.id,
          name: g.name,
          nature: g.nature,
          parent_id: g.parent_id,
          description: `View ${g.name} accounts summary`,
          icon: <Building size={24} />,
          color: "bg-blue-500",
        }));

        const baseGroupMapped = baseGroups.map((g: any) => ({
          id: g.id,
          // type: `base-${Math.abs(g.id)}`,
          type: g.id,
          name: g.name,
          nature: g.nature,
          description: `View ${g.name} accounts summary`,
          icon: <Building size={24} />,
          color: "bg-green-500",
        }));

        // marge backed or baseGroup data
        const mergedGroups = [...baseGroupMapped, ...backendGroups];

        setGroupTypes(mergedGroups);
        setLedgers(data.ledgers || []);
      } catch (err) {
        console.error("Failed to fetch groups:", err);
        setGroupTypes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, [companyId, ownerType, ownerId]);

  useEffect(() => {
    const fetchTaxData = async () => {
      if (!companyId || !ownerType || !ownerId || !ledgers.length) {
        return;
      }

      try {
        const ledgerIds = ledgers.map((l) => l.id).join(",");
        const url = `${import.meta.env.VITE_API_URL
          }/api/group?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&ledgerIds=${ledgerIds}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("API Failed");
        const data = await res.json();

        const normalizedData: Record<number, { debit: number; credit: number }> =
          {};
        if (data.data) {
          Object.keys(data.data).forEach((key) => {
            const entry = data.data[key];
            normalizedData[Number(key)] = {
              debit: Number(entry.debit) || 0,
              credit: Number(entry.credit) || 0,
            };
          });
        }
        setTaxData(normalizedData);
      } catch (err) {
        console.error("API Error:", err);
      }
    };

    fetchTaxData();
  }, [companyId, ownerType, ownerId, ledgers]);

  const calculateGroupBalance = (groupIdOrNature: number | string) => {
    // Collect all ledgers belonging to this group OR its children
    const getGroupLedgers = (idOrNature: number | string): any[] => {
      if (typeof idOrNature === "string") {
        return ledgers.filter((l) => (l.nature || l.group_nature) === idOrNature);
      }

      const directLedgers = ledgers.filter(
        (l) => Number(l.groupId || l.group_id) === Number(idOrNature)
      );

      // Also include ledgers from subgroups
      const childGroups = groupTypes.filter(
        (g) => Number(g.parent_id) === Number(idOrNature)
      );
      let allLedgers = [...directLedgers];
      childGroups.forEach((cg) => {
        allLedgers = [...allLedgers, ...getGroupLedgers(cg.id)];
      });

      return allLedgers;
    };

    const groupLedgers = getGroupLedgers(groupIdOrNature);

    let netBalance = 0; // positive for debit, negative for credit (arbitrary)

    groupLedgers.forEach((ledger) => {
      const gid = Number(ledger.groupId || ledger.group_id);
      const gname = String(ledger.groupName || ledger.group_name || "").toLowerCase().replace(/[\s-_]/g, "");
      const isStock = gid === -108 || gname === "stockinhand" || gname.includes("stockinhand");

      if (isStock) {
        const rawClosing = ledger.closingBalance !== undefined && ledger.closingBalance !== null
          ? parseFloat(ledger.closingBalance)
          : (ledger.closing_balance !== undefined && ledger.closing_balance !== null ? parseFloat(ledger.closing_balance) : NaN);
        const rawOpening = parseFloat(ledger.opening_balance || ledger.openingBalance) || 0;
        const val = !isNaN(rawClosing) && rawClosing !== 0 ? rawClosing : (!isNaN(rawOpening) ? rawOpening : 0);
        const type = (ledger.balance_type || ledger.balanceType || "debit").toLowerCase();
        const signed = (type === "credit" || type === "cr") ? -val : val;
        netBalance += signed;
        return;
      }

      const opening =
        Number(ledger.opening_balance || ledger.openingBalance) || 0;
      const tData = taxData[Number(ledger.id)] || { debit: 0, credit: 0 };
      const debit = tData.debit;
      const credit = tData.credit;
      const type = (
        ledger.balance_type ||
        ledger.balanceType ||
        "debit"
      ).toLowerCase();

      let closing = 0;
      if (type === "debit" || type === "dr") {
        closing = opening + debit - credit;
        netBalance += closing;
      } else {
        closing = opening + credit - debit;
        netBalance -= closing; // credit reduces the "debit" netBalance
      }
    });

    if (netBalance >= 0) {
      return `₹ ${Math.abs(netBalance).toLocaleString()} Dr`;
    } else {
      return `₹ ${Math.abs(netBalance).toLocaleString()} Cr`;
    }
  };


  const handleBackClick = () => {
    navigate("/app/reports");
  };

  const filteredGroups = selectedNature
    ? groupTypes.filter((g) => g.nature === selectedNature && !g.parent_id)
    : [];

  return (
    <div className="pt-[56px] px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <button
            onClick={handleBackClick}
            title="Go back to Reports"
            className={`p-2 rounded-lg mr-3 ${theme === "dark"
              ? "bg-gray-700 hover:bg-gray-600 text-white"
              : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold">Group Summary</h1>
        </div>
      </div>

      {/* Description */}
      <div
        className={`p-4 rounded-lg mb-6 ${theme === "dark" ? "bg-gray-800" : "bg-blue-50"
          }`}
      >
        <p className="text-sm">
          <span className="font-semibold">Group Summary</span> shows the
          summarized view of ledger accounts grouped by their category. Select a
          group type below to view detailed summary of accounts under that
          category.
        </p>
      </div>

      {selectedNature && (
        <button
          onClick={() => setSelectedNature(null)}
          className="mb-6 px-4 py-2 rounded bg-blue-200 hover:bg-blue-300"
        >
          ← Back to Categories
        </button>
      )}

      {/* GroupType Assest */}
      {!selectedNature && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {Assets.map((group, index) => (
            <div
              key={index}
              onClick={() => setSelectedNature(group.type)}
              className={`p-6 rounded-lg cursor-pointer transition-all duration-200 transform hover:scale-105 ${theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700"
                : "bg-white hover:bg-gray-50 shadow-md hover:shadow-lg"
                }`}
            >
              <div className="flex items-start space-x-4">
                <div className={`p-3 rounded-lg text-white ${group.color}`}>
                  {group.icon}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h3 className="text-lg font-semibold mb-2">{group.name}</h3>
                    <span className={`text-sm font-bold ${theme === "dark" ? "text-blue-400" : "text-blue-600"
                      }`}>
                      {calculateGroupBalance(group.type)}
                    </span>
                  </div>
                  <p
                    className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"
                      }`}
                  >
                    {group.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Group Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
        {Array.isArray(groupTypes) &&
          filteredGroups.map((group, index) => (
            <div
              key={index}
              onClick={() => navigate(`/app/reports/group-summary/${group.id}`)}
              className={`p-6 rounded-lg cursor-pointer transition-all duration-200 transform hover:scale-105 ${theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700"
                : "bg-white hover:bg-gray-50 shadow-md hover:shadow-lg"
                }`}
            >
              <div className="flex items-start space-x-4">
                <div className={`p-3 rounded-lg text-white ${group.color}`}>
                  {group.icon}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h3 className="text-lg font-semibold mb-2">{group.name}</h3>
                    <span className={`text-sm font-bold ${theme === "dark" ? "text-blue-400" : "text-blue-600"
                      }`}>
                      {calculateGroupBalance(group.id)}
                    </span>
                  </div>
                  <p
                    className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"
                      }`}
                  >
                    {group.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Pro Tip */}
      <div
        className={`mt-6 p-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-gray-50"
          }`}
      >
        <p className="text-sm">
          <span className="font-semibold">Pro Tip:</span> Click on any group
          type above to view detailed ledger-wise summary. You can drill down
          further by clicking on individual ledgers in the summary.
        </p>
      </div>
    </div>
  );
};

export default GroupSummaryIndex;
