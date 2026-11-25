import React, { useEffect, useState, useMemo } from "react";
import { useAppContext } from "../../../context/AppContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Printer, Download, Filter } from "lucide-react";

const PurchaseAddDetails: React.FC = () => {
  const { theme } = useAppContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const ledgerName = searchParams.get("ledger");
  console.log('ledgerName', ledgerName)
  const groupId = Number(searchParams.get("groupId"));
  console.log('id', groupId)

  const companyId = localStorage.getItem("company_id");
  const ownerType = localStorage.getItem("supplier");
  const ownerId =
    localStorage.getItem(
      ownerType === "employee" ? "employee_id" : "user_id"
    ) || "";

  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const MONTHS = [
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
    "January",
    "February",
    "March",
  ];

  /* ===================== STATES ===================== */
  /* ===================== MONTH WISE + RUNNING CLOSING ===================== */
  const [monthData, setMonthData] = useState<any[]>([]);

  /* ================= FETCH MONTH DATA ================= */
  useEffect(() => {
    const fetchPurchaseData = async () => {
      try {
        if (!groupId) return;

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/purchase/${groupId}?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );

        const data = await res.json();

        if (data.success) {
          setMonthData(data.data);
        }

        console.log("Month API:", data);
      } catch (error) {
        console.error("Purchase API Error:", error);
      }
    };

    fetchPurchaseData();
  }, [companyId, ownerId, ownerType, groupId]);

  const monthSummary = useMemo(() => {
    let runningTotal = 0;
    const mysqlMonthMap: Record<string, number> = {
      April: 4,
      May: 5,
      June: 6,
      July: 7,
      August: 8,
      September: 9,
      October: 10,
      November: 11,
      December: 12,
      January: 1,
      February: 2,
      March: 3,
    };

    return MONTHS.map((monthName) => {
      const mysqlMonth = mysqlMonthMap[monthName];
      // Backend returns rows with monthNo (1-12)
      const data = monthData.find((d: any) => d.monthNo === mysqlMonth);
      const debit = data ? Number(data.total) : 0;
      const credit = 0;
      runningTotal += debit - credit;

      return {
        month: monthName,
        debit,
        credit,
        closing: runningTotal,
      };
    });
  }, [monthData, MONTHS]);

  const handleMonthClick = (monthName: string) => {
    const mysqlMonthMap: Record<string, number> = {
      April: 4,
      May: 5,
      June: 6,
      July: 7,
      August: 8,
      September: 9,
      October: 10,
      November: 11,
      December: 12,
      January: 1,
      February: 2,
      March: 3,
    };

    const monthNo = mysqlMonthMap[monthName];
    // Current financial year (Apr–Mar), not hardcoded year
    const now = new Date();
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const year = monthNo >= 4 ? fyStartYear : fyStartYear + 1;

    const firstDay = `${year}-${String(monthNo).padStart(2, "0")}-01`;
    const lastDayDate = new Date(year, monthNo, 0);
    const lastDay = `${year}-${String(monthNo).padStart(2, "0")}-${String(
      lastDayDate.getDate()
    ).padStart(2, "0")}`;

    navigate(`/app/reports/ledger/${groupId}?fromDate=${firstDay}&toDate=${lastDay}`);
  };

  /* ===================== UI ===================== */
  return (
    <div className="pt-[56px] px-4">
      {/* Header */}
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate(-1)}
          className={`mr-4 p-2 rounded-full ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
            }`}
        >
          <ArrowLeft size={20} />
        </button>

        <h1 className="text-2xl font-bold">Purchase Account:-  {ledgerName}</h1>

        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className="p-2 rounded hover:bg-gray-200"
          >
            <Filter size={18} />
          </button>
          <button className="p-2 rounded hover:bg-gray-200">
            <Printer size={18} />
          </button>
          <button className="p-2 rounded hover:bg-gray-200">
            <Download size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 py-2 px-2 font-semibold text-gray-600 border-b bg-gray-100">
        <div>Month</div>
        <div className="text-center">Debit</div>
        <div className="text-center">Credit</div>
        <div className="text-center">Closing</div>
      </div>

      {monthSummary.map((row: any) => {
        return (
          <div
            key={row.month}
            onClick={() => handleMonthClick(row.month)}
            className="grid grid-cols-4 py-2 px-2 cursor-pointer hover:bg-blue-300 transition-colors border-b border-gray-100"
          >
            {/* Month */}
            <div className="text-lg font-medium">
              {row.month}
            </div>

            {/* Debit */}
            <div className="text-center font-mono text-lg">
              {row.debit > 0 ? row.debit.toLocaleString() : ""}
            </div>

            {/* Credit */}
            <div className="text-center text-lg text-gray-400">
              {row.debit > 0 ? "0" : ""}
            </div>

            {/* Closing */}
            <div className="text-center font-mono text-lg">
              {row.closing !== 0 ? row.closing.toLocaleString() : ""}
            </div>
          </div>
        );
      })}

      {/* ================= GRAND TOTAL ================= */}
      <div className="grid grid-cols-4 mt-3 pt-2 border-t text-lg font-semibold bg-gray-50">
        <div className="px-2">Grand Total</div>
        <div className="text-center font-mono">
          {monthSummary
            .reduce((sum: number, r: any) => sum + r.debit, 0)
            .toLocaleString()}
        </div>

        <div className="text-center text-gray-400">0</div>

        <div className="text-center font-mono">
          {monthSummary.length
            ? monthSummary[monthSummary.length - 1].closing.toLocaleString()
            : ""}
        </div>

      </div>


    </div>
  );
};

export default PurchaseAddDetails;
