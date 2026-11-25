import React, { useEffect, useState } from "react";
import { useAppContext } from "../../../context/AppContext";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Download } from "lucide-react";
import {
  buildAllGroups,
  isUnderSalesAccounts,
} from "../../../utils/plGroupHelpers";

const SalesDetail: React.FC = () => {
  const { theme, ledgerGroups } = useAppContext();
  const navigate = useNavigate();

  const companyId = localStorage.getItem("company_id");
  const ownerType = localStorage.getItem("supplier");
  const ownerId =
    localStorage.getItem(
      ownerType === "employee" ? "employee_id" : "user_id"
    ) || "";

  /* ===================== SALES LEDGERS ===================== */
  const [salesLedgers, setSalesLedgers] = useState<any[]>([]);
  const [salesIds, setSalesIds] = useState<number[]>([]);
  const [salesTotals, setSalesTotals] = useState<Record<number, string>>({});
  const [ledgerBalances, setLedgerBalances] = useState<
    Record<number, { debit: number; credit: number }>
  >({});

  useEffect(() => {
    fetch(
      `${import.meta.env.VITE_API_URL}/api/group-summary?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
    )
      .then((res) => res.json())
      .then((data) => {
        const ledgers = data.ledgers || [];
        const allGroups = buildAllGroups(data.ledgerGroups || [], ledgerGroups || []);

        const sales = ledgers
          .filter((l: any) => isUnderSalesAccounts(allGroups, l.group_id))
          .map((l: any) => ({
            id: l.id,
            name: l.name,
            opening_balance: Number(l.opening_balance) || 0,
            closing_balance: Number(l.closing_balance) || 0,
            balance_type: l.balance_type,
            group_id: l.group_id,
          }));

        setSalesLedgers(sales);
        setSalesIds(sales.map((s: any) => Number(s.id)));
      })
      .catch(() => setSalesLedgers([]));
  }, [companyId, ownerId, ownerType, ledgerGroups]);

  useEffect(() => {
    const fetchSalesData = async () => {
      try {
        if (salesIds.length === 0) return;

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/sales?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&ids=${salesIds.join(",")}`
        );

        const data = await res.json();

        if (data.success) {
          setSalesTotals(data.data);
        }
      } catch (error) {
        console.error("Sales API Error:", error);
      }
    };

    fetchSalesData();
  }, [companyId, ownerId, ownerType, salesIds]);

  useEffect(() => {
    const fetchBalances = async () => {
      try {
        if (salesIds.length === 0) return;

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/group?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&ledgerIds=${salesIds.join(",")}`
        );
        const data = await res.json();
        if (data.success) {
          setLedgerBalances(data.data || {});
        }
      } catch (error) {
        console.error("Ledger balances fetch error:", error);
      }
    };

    fetchBalances();
  }, [companyId, ownerId, ownerType, salesIds]);

  /* ===================== ROW DATA ===================== */
  const getSalesAccountRows = () => {
    return salesLedgers.map((l: any) => {
      const apiAmount = salesTotals[l.id as number];
      const amount = apiAmount ? Number(apiAmount) : 0;

      const bal = ledgerBalances[l.id];
      // Sales nature: credit - debit
      let closingNet = 0;
      if (bal) {
        closingNet = (bal.credit || 0) - (bal.debit || 0);
      } else if (l.closing_balance) {
        closingNet =
          String(l.balance_type).toLowerCase() === "debit"
            ? -Math.abs(Number(l.closing_balance))
            : Math.abs(Number(l.closing_balance));
      } else {
        closingNet = amount;
      }

      return {
        name: l.name,
        groupId: Number(l.id),
        debit: amount < 0 ? Math.abs(amount) : "",
        credit: amount >= 0 ? amount : "",
        closing: Math.abs(closingNet),
        closingType: closingNet >= 0 ? "Cr" : "Dr",
      };
    });
  };

  /* ===================== ROW CLICK HANDLER ===================== */
  const handleRowClick = (ledgerName: string, groupId: number) => {
    navigate(
      `/app/reports/profit-loss/sales/alldetails?ledger=${encodeURIComponent(
        ledgerName
      )}&groupId=${groupId}`
    );
  };

  const formatAmount = (val: number | string) => {
    if (val === "" || val === null || val === undefined) return "";
    return Number(val).toLocaleString();
  };

  /* ===================== UI ===================== */
  return (
    <div className="pt-[56px] px-4">
      {/* Top Bar */}
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate(-1)}
          className={`mr-4 p-2 rounded-full ${
            theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
          }`}
        >
          <ArrowLeft size={20} />
        </button>

        <h1 className="text-2xl font-bold">Sales Account</h1>

        <div className="ml-auto flex gap-2">
          <button className="p-2 rounded-md hover:bg-gray-200">
            <Printer size={18} />
          </button>
          <button className="p-2 rounded-md hover:bg-gray-200">
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="w-full border border-gray-300 rounded-md overflow-hidden">
        <div className="bg-gray-100 border-b border-gray-300">
          <div className="py-3 text-center">
            <div className="text-lg font-semibold">Sales Account</div>
            <div className="text-xs text-gray-500">
              For the year ended {new Date().getFullYear()}
            </div>
          </div>

          <div className="grid grid-cols-4 text-sm font-semibold border-t border-gray-300">
            <div className="px-3 py-2 text-center border-r border-gray-300">
              Particulars
            </div>
            <div className="px-3 py-2 text-center border-r border-gray-300">
              Debit
            </div>
            <div className="px-3 py-2 text-center border-r border-gray-300">
              Credit
            </div>
            <div className="px-3 py-2 text-center">Closing</div>
          </div>
        </div>

        {getSalesAccountRows().map((row, index) => (
          <div
            key={index}
            onClick={() => handleRowClick(row.name, row.groupId)}
            className="grid grid-cols-4 text-sm border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
          >
            <div className="px-3 py-2 text-center border-r border-gray-300 text-blue-600">
              {row.name}
            </div>

            <div className="px-3 py-2 text-center font-mono border-r border-gray-300">
              {formatAmount(row.debit)}
            </div>

            <div className="px-3 py-2 text-center font-mono border-r border-gray-300">
              {formatAmount(row.credit)}
            </div>

            <div className="px-3 py-2 text-center font-mono">
              {row.closing
                ? `${row.closing.toLocaleString()} ${row.closingType}`
                : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SalesDetail;
