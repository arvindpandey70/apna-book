import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Edit, Trash2, Plus, Search, ArrowLeft, Download, FileCode2, Copy } from "lucide-react";
import { useAppContext } from "../../../context/AppContext";
import type { Ledger, LedgerGroup } from "../../../types";
import { formatGSTNumber } from "../../../utils/ledgerUtils";
import Swal from "sweetalert2";
import { allSystemGroups as baseGroups } from "../../../constants/ledgerGroups";

const LedgerList: React.FC = () => {
  const { theme, companyInfo } = useAppContext();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "b2b" | "b2c">(
    "all"
  );
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("all");
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [ledgerGroups, setLedgerGroups] = useState<LedgerGroup[]>([]);
  const [showExportPopup, setShowExportPopup] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const companyId =
        localStorage.getItem("company_id") ||
        localStorage.getItem("company_id");
      const ownerType = localStorage.getItem("supplier");
      const userType = localStorage.getItem("userType");

      // For CA employees, we want to see the owner's data
      let fetchOwnerType = ownerType;
      let fetchOwnerId = ownerType === "employee"
        ? localStorage.getItem("employee_id")
        : localStorage.getItem("user_id");

      if (userType === "ca_employee") {
        fetchOwnerType = "employee";
        fetchOwnerId = localStorage.getItem("employee_id");
      }

      if (!companyId || !fetchOwnerType || !fetchOwnerId) {
        console.error("Missing required identifiers for ledger GET");
        setLedgers([]);
        return;
      }

      // Fetch ledgers scoped to company & owner
      const ledgerRes = await fetch(
        `${import.meta.env.VITE_API_URL
        }/api/ledger?company_id=${companyId}&owner_type=${fetchOwnerType}&owner_id=${fetchOwnerId}`
      );
      const ledgerData = await ledgerRes.json();

      if (ledgerRes.ok) {
        setLedgers(Array.isArray(ledgerData) ? ledgerData : []);
      } else {
        console.error(ledgerData.message || "Failed to fetch ledgers");
        setLedgers([]);
      }

      // Fetch ledger groups
      const groupRes = await fetch(
        `${import.meta.env.VITE_API_URL
        }/api/ledger-groups?company_id=${companyId}&owner_type=${fetchOwnerType}&owner_id=${fetchOwnerId}`
      );
      const groupData = await groupRes.json();
      setLedgerGroups(Array.isArray(groupData) ? groupData : []);
    } catch (err) {
      console.error("Failed to load data", err);
      setLedgers([]);
      setLedgerGroups([]);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleImportAdminLedger = async () => {
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
        Swal.fire("Error", "Missing required user identifiers for import", "error");
        return;
      }

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/ledger/import-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId,
          ownerType: fetchOwnerType,
          ownerId: fetchOwnerId,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        Swal.fire({
          icon: "success",
          title: "Import Successful",
          text: data.message,
          timer: 2000,
          showConfirmButton: false,
        });
        await fetchData();
      } else {
        Swal.fire("Import Failed", data.message || "Failed to import admin ledgers", "error");
      }
    } catch (err) {
      console.error("Error importing admin ledgers:", err);
      Swal.fire("Error", "Failed to connect to server", "error");
    }
  };

  const resolveGroup = (groupId: number, normalGroups: any[]) => {
    // 🔹 negative id → baseGroups se uthao
    if (groupId < 0) {
      return baseGroups.find((g) => g.id === groupId) || null;
    }

    // 🔹 positive id → normal groups jaise ke waise
    return normalGroups.find((g) => g.id === groupId) || null;
  };

  const getGroupName = (groupId: number | string) => {
    const gid = Number(groupId); // 🔥 VERY IMPORTANT

    if (isNaN(gid)) return "—";

    const group = resolveGroup(gid, ledgerGroups);
    return group ? group.name : "—";
  };

  const userLedgers = useMemo(() => {
    if (!Array.isArray(ledgers)) return [];
    // Only display user-owned ledgers (filter out live reference admin ledgers with ownerId === 0)
    return ledgers.filter((l) => l.ownerId !== 0);
  }, [ledgers]);

  const availableGroups = useMemo(() => {
    const map = new Map<string, string>();

    // Add base groups
    baseGroups.forEach((g) => map.set(String(g.id), g.name));

    // Add user custom groups
    ledgerGroups.forEach((g) => map.set(String(g.id), g.name));

    // Collect any additional groups present directly on user ledgers
    userLedgers.forEach((l) => {
      if (l.groupId !== undefined && l.groupId !== null) {
        const idStr = String(l.groupId);
        if (!map.has(idStr)) {
          const resolvedName = getGroupName(l.groupId);
          map.set(idStr, resolvedName !== "—" ? resolvedName : idStr);
        }
      }
    });

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ledgerGroups, userLedgers]);

  const filteredLedgers = Array.isArray(userLedgers)
    ? userLedgers.filter((ledger) => {
      const searchLower = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !searchLower ||
        ledger.name?.toLowerCase().includes(searchLower) ||
        ledger.gstNumber?.toLowerCase().includes(searchLower);
      const matchesCategory =
        categoryFilter === "all" ||
        (categoryFilter === "b2b" &&
          ledger.gstNumber &&
          ledger.gstNumber.trim().length > 0) ||
        (categoryFilter === "b2c" &&
          (!ledger.gstNumber || ledger.gstNumber.trim().length === 0));

      let matchesGroup = true;
      if (selectedGroupFilter !== "all") {
        const selectedGroupObj = availableGroups.find((g) => g.id === selectedGroupFilter);
        const selectedGroupName = selectedGroupObj ? selectedGroupObj.name.toLowerCase() : "";

        const ledgerGroupIdStr = String(ledger.groupId);
        const ledgerGroupName = getGroupName(ledger.groupId).toLowerCase();

        matchesGroup =
          ledgerGroupIdStr === selectedGroupFilter ||
          Number(ledger.groupId) === Number(selectedGroupFilter) ||
          (selectedGroupName !== "" && ledgerGroupName === selectedGroupName);
      }

      return matchesSearch && matchesCategory && matchesGroup;
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    : [];

  const handleDelete = async (id: string | number) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "This ledger will be permanently deleted!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, Delete",
    });

    if (!result.isConfirmed) return;

    try {
      const companyId = localStorage.getItem("company_id");
      const ownerType = localStorage.getItem("supplier");
      const ownerId = localStorage.getItem(
        ownerType === "employee" ? "employee_id" : "user_id"
      );

      const res = await fetch(
        `${import.meta.env.VITE_API_URL
        }/api/ledger/${id}?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`,
        { method: "DELETE" }
      );

      const data = await res.json();

      if (res.ok) {
        Swal.fire({
          icon: "success",
          title: "Deleted!",
          text: data.message,
          timer: 1600,
          showConfirmButton: false,
        });

        setLedgers((prev) => prev.filter((l) => l.id !== id));
      } else {
        Swal.fire({
          icon: "warning",
          title: "Ledger cannot be deleted",
          text: data.message || "This ledger is already used in transactions.",
        });
      }
    } catch (err) {
      Swal.fire("Network Error", "Unable to connect to server", "error");
      console.error("Delete error:", err);
    }
  };

  //total debit or total cradit
  const totalDebit = filteredLedgers.reduce((sum, ledger) => {
    if (ledger.balanceType === "debit") {
      return sum + Number(ledger.openingBalance || 0);
    }
    return sum;
  }, 0);

  const totalCredit = filteredLedgers.reduce((sum, ledger) => {
    if (ledger.balanceType === "credit") {
      return sum + Number(ledger.openingBalance || 0);
    }
    return sum;
  }, 0);

  const handleExport = useCallback(async () => {
    try {
      const XLSX = await import("xlsx");
      const exportData = filteredLedgers.map((row) => ({
        "Name": row.name || "",
        "Under Group": getGroupName(row.groupId),
        "GST Number": row.gstNumber || "",
        "State": row.state || "",
        "Address": row.address || "",
        "Pincode": row.pinCode || "",
        "Opening Balance": row.openingBalance || 0,
        "Type": row.balanceType?.toUpperCase() || "N/A",
        "GST/Category": row.gstNumber ? "B2B" : "B2C",
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Ledgers");

      XLSX.writeFile(workbook, "ledger_list.xlsx");
    } catch (error) {
      console.error("Export error", error);
      Swal.fire("Error", "Failed to export Excel file", "error");
    }
  }, [filteredLedgers, ledgerGroups]);

  const companyName = companyInfo?.name || localStorage.getItem("companyName") || "Company Name";

  const generatedXML = useMemo(() => {
    let xmlString = `<ENVELOPE>\n`;
    xmlString += `  <HEADER>\n`;
    xmlString += `    <TALLYREQUEST>Import Data</TALLYREQUEST>\n`;
    xmlString += `  </HEADER>\n`;
    xmlString += `  <BODY>\n`;
    xmlString += `    <IMPORTDATA>\n`;
    xmlString += `      <REQUESTDESC>\n`;
    xmlString += `        <REPORTNAME>All Masters</REPORTNAME>\n`;
    xmlString += `        <STATICVARIABLES>\n`;
    xmlString += `          <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>\n`;
    xmlString += `        </STATICVARIABLES>\n`;
    xmlString += `      </REQUESTDESC>\n`;
    xmlString += `      <REQUESTDATA>\n`;
    
    filteredLedgers.forEach((ledger) => {
      const groupName = getGroupName(ledger.groupId);
      xmlString += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
      xmlString += `         <LEDGER NAME="${ledger.name}" RESERVEDNAME="${ledger.name}">\n`;
      xmlString += `          <NAME.LIST>\n`;
      xmlString += `            <NAME>${ledger.name}</NAME>\n`;
      xmlString += `          </NAME.LIST>\n`;
      xmlString += `          <PARENT>${groupName}</PARENT>\n`;
      xmlString += `          <ISDEEMEDPOSITIVE>${ledger.balanceType === "debit" ? "Yes" : "No"}</ISDEEMEDPOSITIVE>\n`;
      xmlString += `          <ISSUBLEDGER>No</ISSUBLEDGER>\n`;
      xmlString += `          <ISREVENUE>Yes</ISREVENUE>\n`;
      xmlString += `          <AFFECTSGROSSPROFIT>Yes</AFFECTSGROSSPROFIT>\n`;
      xmlString += `          <TRACKNEGATIVEBALANCES>No</TRACKNEGATIVEBALANCES>\n`;
      xmlString += `          <ISBILLWISEON>No</ISBILLWISEON>\n`;
      xmlString += `          <ISCOSTCENTRESON>Yes</ISCOSTCENTRESON>\n`;
      xmlString += `          <AFFECTSSTOCK>No</AFFECTSSTOCK>\n`;
      xmlString += `          <ISCONDENSED>No</ISCONDENSED>\n`;
      xmlString += `          <ISADDABLE>No</ISADDABLE>\n`;
      xmlString += `          <SORTPOSITION> 260</SORTPOSITION>\n`;
      if (ledger.openingBalance) {
        xmlString += `          <OPENINGBALANCE>${ledger.balanceType === "debit" ? "-" : ""}${ledger.openingBalance}</OPENINGBALANCE>\n`;
      }
      xmlString += `         </LEDGER>\n`;
      xmlString += `        </TALLYMESSAGE>\n`;
    });
  
    xmlString += `      </REQUESTDATA>\n`;
    xmlString += `    </IMPORTDATA>\n`;
    xmlString += `  </BODY>\n`;
    xmlString += `</ENVELOPE>`;
    
    return xmlString;
  }, [filteredLedgers, ledgerGroups]);

  const handleDownloadXML = () => {
    const blob = new Blob([generatedXML], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ledgers.xml";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setShowExportPopup(false);
  };

  const renderLedgerRow = (ledger: Ledger) => (
    <tr
      key={ledger.id}
      className={`hover:bg-opacity-10 hover:bg-blue-500 transition-colors ${
        ledger.ownerId === 0
          ? theme === "dark"
            ? "bg-blue-900/10 border-b border-blue-900/30"
            : "bg-blue-50/40 border-b border-blue-100"
          : theme === "dark"
            ? "border-b border-gray-700"
            : "border-b border-gray-200"
      }`}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={ledger.ownerId === 0 ? "font-semibold text-blue-600 dark:text-blue-400" : ""}>
            {ledger.name}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        {getGroupName(ledger.groupId)}
      </td>

      <td className="px-4 py-3">{ledger.gstNumber}</td>
      <td className="px-4 py-3 text-right font-mono">
        {ledger.openingBalance}
      </td>
      <td className="px-4 py-3 text-center">
        <span
          className={`px-2 py-1 rounded text-xs ${ledger.balanceType === "debit"
            ? theme === "dark"
              ? "bg-red-900 text-red-200"
              : "bg-red-100 text-red-800"
            : theme === "dark"
              ? "bg-green-900 text-green-200"
              : "bg-green-100 text-green-800"
            }`}
        >
          {ledger.balanceType?.toUpperCase() || "N/A"}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        {ledger.gstNumber ? (
          <>
            <span
              className={`${theme === "dark"
                ? "bg-blue-900 text-blue-200"
                : "bg-blue-100 text-blue-800"
                } px-2 py-1 rounded text-xs font-medium`}
            >
              B2B
            </span>
            <div className="text-xs text-gray-500 font-mono">
              {formatGSTNumber(ledger.gstNumber)}
            </div>
          </>
        ) : (
          <span
            className={`${theme === "dark"
              ? "bg-purple-900 text-purple-200"
              : "bg-purple-100 text-purple-800"
              } px-2 py-1 rounded text-xs font-medium`}
          >
            B2C
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-center items-center space-x-2">
          {ledger.ownerId === 0 ? (
            <>
              <span className={`px-2 py-1 text-xs font-bold rounded uppercase tracking-wider ${
                theme === 'dark' 
                  ? 'bg-blue-900/50 text-blue-300 border border-blue-800' 
                  : 'bg-blue-100 text-blue-700 border border-blue-200'
              }`}>
                Admin
              </span>
              <button
                title="Edit Ledger"
                onClick={() => navigate(`/app/masters/ledger/edit/${ledger.id}`)}
                className={`p-1 rounded transition-all ml-2 ${
                  theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <Edit size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                title="Edit Ledger"
                onClick={() => navigate(`/app/masters/ledger/edit/${ledger.id}`)}
                className={`p-1 rounded transition-all ${
                  theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <Edit size={16} />
              </button>
              <button
                title="Delete Ledger"
                onClick={() => handleDelete(ledger.id)}
                className={`p-1 rounded transition-all ${
                  theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <>
      <div className="pt-[56px] px-4 ">
        {/* header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center mb-6">
            <button
              title="Back to Group List"
              onClick={() => navigate("/app/masters")}
              className={`mr-4 p-2 rounded-full ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
                }`}
            >
              <ArrowLeft size={20} />
            </button>
            <h1
              className={`text-2xl font-bold ${theme === "dark" ? "text-gray-100" : "text-gray-900"
                }`}
            >
              Ledger List
            </h1>
          </div>

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={() => navigate("/app/masters/ledger/opn")}
              className={`flex items-center px-4 py-2 rounded ${theme === "dark"
                ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
            >
              Opening Balance
            </button>
            <button
              type="button"
              onClick={handleImportAdminLedger}
              className={`flex items-center px-4 py-2 rounded ${theme === "dark"
                ? "bg-teal-600 hover:bg-teal-700 text-white"
                : "bg-teal-600 hover:bg-teal-700 text-white"
                }`}
            >
              Import Admin Ledger
            </button>
            <button
              type="button"
              onClick={handleExport}
              className={`flex items-center px-4 py-2 rounded ${theme === "dark"
                ? "bg-purple-600 hover:bg-purple-700 text-white"
                : "bg-purple-600 hover:bg-purple-700 text-white"
                }`}
            >
              <Download size={18} className="mr-1" />
              Export
            </button>
            <button
              type="button"
              onClick={() => navigate("/app/masters/ledger/bulk-create")}
              className={`flex items-center px-4 py-2 rounded ${theme === "dark"
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-green-600 hover:bg-green-700 text-white"
                }`}
            >
              <Plus size={18} className="mr-1" />
              Bulk Create
            </button>
            <button
              type="button"
              onClick={() => navigate("/app/masters/ledger/create")}
              className={`flex items-center px-4 py-2 rounded ${theme === "dark"
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
            >
              <Plus size={18} className="mr-1" />
              Create Ledger
            </button>
            <button
              type="button"
              title="Export XML"
              onClick={() => setShowExportPopup(true)}
              className={`flex items-center px-4 py-2 rounded text-sm font-medium ${theme === "dark"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"
                }`}
            >
              <FileCode2 size={18} className="mr-1" />
              Export XML
            </button>
          </div>
        </div>

        {/* table */}
        <div
          className={`p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
            }`}
        >
          <div className="flex items-center justify-between mb-4">
            {/* filters */}
            <div className="flex items-center space-x-4">
              <div
                className={`flex items-center max-w-md px-3 py-2 rounded-md ${theme === "dark" ? "bg-gray-700" : "bg-gray-100"
                  }`}
              >
                <Search size={18} className="mr-2 opacity-70" />
                <input
                  type="text"
                  placeholder="Search by name or GST number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full bg-transparent border-none outline-none ${theme === "dark"
                    ? "placeholder-gray-500"
                    : "placeholder-gray-400"
                    }`}
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value as "all" | "b2b" | "b2c")
                }
                className={`px-3 py-2 rounded-md border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600 text-white"
                  : "bg-white border-gray-300 text-gray-900"
                  }`}
              >
                <option value="all">All Ledgers</option>
                <option value="b2b">B2B (With GST)</option>
                <option value="b2c">B2C (Without GST)</option>
              </select>

              <select
                value={selectedGroupFilter}
                onChange={(e) => setSelectedGroupFilter(e.target.value)}
                className={`px-3 py-2 rounded-md border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600 text-white"
                  : "bg-white border-gray-300 text-gray-900"
                  }`}
              >
                <option value="all">All Groups</option>
                {availableGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            {/* stats */}
            <div className="flex items-center space-x-4 text-sm">
              <span
                className={`${theme === "dark"
                  ? "bg-blue-900 text-blue-200"
                  : "bg-blue-100 text-blue-800"
                  } px-2 py-1 rounded`}
              >
                B2B:{" "}
                {
                  userLedgers.filter(
                    (l) => l.gstNumber && l.gstNumber.trim().length > 0
                  ).length
                }
              </span>
              <span
                className={`${theme === "dark"
                  ? "bg-purple-900 text-purple-200"
                  : "bg-purple-100 text-purple-800"
                  } px-2 py-1 rounded`}
              >
                B2C:{" "}
                {
                  userLedgers.filter(
                    (l) => !l.gstNumber || l.gstNumber.trim().length === 0
                  ).length
                }
              </span>
            </div>
          </div>

          {/* list */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr
                  className={
                    theme === "dark"
                      ? "border-b border-gray-700"
                      : "border-b border-gray-200"
                  }
                >
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Under Group</th>
                  <th className="px-4 py-3 text-left">GST Number</th>
                  <th className="px-4 py-3 text-right">Opening Balance</th>
                  <th className="px-4 py-3 text-center">Type</th>
                  <th className="px-4 py-3 text-center">GST/Category</th>

                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedgers.length > 0 && (
                  <>
                    {filteredLedgers.map(renderLedgerRow)}
                  </>
                )}
              </tbody>
              <tfoot>
                {/* TOTAL DEBIT */}
                <tr className="font-semibold">
                  <td></td>
                  <td></td>
                  <td className="px-4 py-3 text-right">Total Debit</td>

                  <td className="px-4 py-3 text-right font-mono text-blue-800">
                    {totalDebit.toFixed(2)}
                  </td>

                  <td></td>
                  <td></td>
                  <td></td>
                </tr>

                {/* TOTAL CREDIT */}
                <tr className="font-semibold">
                  <td></td>
                  <td></td>
                  <td className="px-4 py-3 text-right">Total Credit</td>

                  <td className="px-4 py-3 text-right font-mono text-green-800">
                    {totalCredit.toFixed(2)}
                  </td>

                  <td></td>
                  <td></td>
                  <td></td>
                </tr>

                {/* TOTAL DIFFERENCE */}
                <tr className="font-semibold">
                  <td></td>
                  <td></td>
                  <td className="px-4 py-3 text-right">Total Difference</td>

                  <td className="px-4 py-3 text-right font-mono text-red-800">
                    {(totalCredit - totalDebit).toFixed(2)}
                  </td>

                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {filteredLedgers.length === 0 && (
            <div className="text-center py-8">
              <p className="opacity-70">
                No ledgers found matching your search.
              </p>
            </div>
          )}
        </div>
      </div>

      {showExportPopup && (
        <div className="fixed inset-0 bg-white/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`p-6 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl ${theme === "dark" ? "bg-gray-800 text-white" : "bg-white text-gray-900"}`}>
            <h3 className="text-xl font-semibold mb-4">Export to Tally (XML) Preview</h3>
            
            <div className={`flex-1 overflow-auto p-4 rounded-md mb-6 border ${theme === "dark" ? "bg-gray-900 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
              <pre className="text-sm whitespace-pre-wrap font-mono">
                {generatedXML}
              </pre>
            </div>
            
            <div className="flex justify-between items-center mt-auto">
              <p className="opacity-80 text-sm">Review the XML format before downloading.</p>
              <div className="flex space-x-3">
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(generatedXML);
                      Swal.fire({
                        icon: 'success',
                        title: 'Copied!',
                        text: 'XML copied to clipboard',
                        timer: 1500,
                        showConfirmButton: false,
                      });
                    } catch (err) {
                      console.error("Failed to copy", err);
                    }
                  }}
                  className={`px-4 py-2 rounded flex items-center ${theme === "dark" ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-blue-500 hover:bg-blue-600 text-white"}`}
                >
                  <Copy size={18} className="mr-2" />
                  Copy XML
                </button>
                <button
                  onClick={() => setShowExportPopup(false)}
                  className={`px-4 py-2 rounded ${theme === "dark" ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-200 hover:bg-gray-300"}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDownloadXML}
                  className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-700 text-white flex items-center"
                >
                  <Download size={18} className="mr-2" />
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LedgerList;
