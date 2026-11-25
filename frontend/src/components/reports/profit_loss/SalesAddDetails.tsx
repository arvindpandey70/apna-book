import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const SalesAddDetails: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const ledgerName = searchParams.get("ledger");
  const groupId = Number(searchParams.get("groupId"));

  const companyId = localStorage.getItem("company_id");
  const ownerType = localStorage.getItem("supplier");
  const ownerId =
    localStorage.getItem(
      ownerType === "employee" ? "employee_id" : "user_id"
    ) || "";

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
  const [monthData, setMonthData] = useState<any[]>([]);

  /* ================= FETCH MONTH DATA ================= */
  useEffect(() => {
    const fetchSalesMonthData = async () => {
      try {
        if (!groupId) return;

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/sales/${groupId}?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );

        const data = await res.json();
        if (data.success) {
          setMonthData(data.data);
        }
      } catch (error) {
        console.error("Sales Month API Error:", error);
      }
    };

    fetchSalesMonthData();
  }, [companyId, ownerId, ownerType, groupId]);

  /* ===================== MONTH SUMMARY + RUNNING TOTAL ===================== */
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
      const data = monthData.find((d: any) => d.monthNo === mysqlMonth);
      const credit = data ? Number(data.total) : 0;
      const debit = 0;
      runningTotal += credit - debit;

      return {
        month: monthName,
        debit,
        credit,
        closing: runningTotal,
      };
    });
  }, [monthData]);

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
      {/* ================= HEADER ================= */}
      <div className="bg-gray-100 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-gray-200 transition"
        >
          <ArrowLeft size={20} />
        </button>

        <div>
          <div className="text-lg font-semibold">Sales Account</div>
          <div className="text-sm text-gray-600">{ledgerName}</div>
        </div>
      </div>

      {/* ================= MONTH SUMMARY ================= */}
      <div className="w-full mt-2">
        {/* Table Head */}
        <div className="grid grid-cols-4 font-semibold bg-gray-50 py-2 border-b">
          <div className="px-3">Month</div>
          <div className="px-3 text-center">Debit</div>
          <div className="px-3 text-center">Credit</div>
          <div className="px-3 text-center">Closing Balance</div>
        </div>

        {/* Table Rows */}
        {monthSummary.map((row: any) => (
          <div
            key={row.month}
            onClick={() => handleMonthClick(row.month)}
            className="
                grid grid-cols-4 py-2 border-b border-gray-100
                cursor-pointer
                hover:bg-blue-300
                transition-colors duration-150
              "
          >
            <div className="px-3">{row.month}</div>

            <div className="px-3 text-center font-mono">
              {row.debit !== 0 ? row.debit.toLocaleString() : ""}
            </div>

            <div className="px-3 text-center font-mono">
              {row.credit !== 0 ? row.credit.toLocaleString() : ""}
            </div>

            <div className="px-3 text-center font-mono">
              {row.closing !== 0 ? row.closing.toLocaleString() : ""}
            </div>
          </div>
        ))}

        {/* ================= GRAND TOTAL ================= */}
        <div className="grid grid-cols-4 font-bold bg-gray-100 py-3 border-t">
          <div className="px-3 text-lg">Grand Total</div>
          <div className="px-3 text-center font-mono">
            {monthSummary.reduce((sum: number, r: any) => sum + r.debit, 0) || ""}
          </div>
          <div className="px-3 text-center font-mono text-lg">
            {monthSummary
              .reduce((sum: number, r: any) => sum + r.credit, 0)
              .toLocaleString()}
          </div>
          <div className="px-3 text-center font-mono text-lg">
            {monthSummary.length
              ? monthSummary[
                monthSummary.length - 1
              ].closing.toLocaleString()
              : ""}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesAddDetails;
