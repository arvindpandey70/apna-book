import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ShoppingCart,
  Download,
  Printer,
  Calendar,
  ChevronRight,
  Filter,
} from "lucide-react";
import { useFinancialYear, filterByFinancialYear, getFinancialYearRange } from "../../../hooks/useFinancialYear";

interface VoucherEntryLine {
  id?: string;
  ledgerId?: string | number;
  ledger_id?: string | number;
  amount: number;
  type?: "debit" | "credit";
  narration?: string;
}

interface VoucherEntry {
  id: string;
  number: string;
  type: string;
  date: string;
  referenceNo?: string;
  invoiceDate?: string;
  supplier_invoice_date?: string;
  narration?: string;
  total?: number;
  totalAmount?: number;
  subtotal?: number;
  entries?: VoucherEntryLine[];
  partyId?: string | number;
  party_id?: string | number;
  customerId?: string | number;
  customer_id?: string | number;
  partyName?: string;
  customerName?: string;
  gstin?: string;
  gst_number?: string;
  gstNumber?: string;
  partyGstin?: string;
  party_gstin?: string;
  gstType?: string;
}

interface MonthSummary {
  monthName: string;
  monthIndex: number; // 0-11
  year: number;
  openingBalance: number;
  debit: number;
  credit: number;
  closingBalance: number;
  vouchers: VoucherEntry[];
}

const SalesVoucherReport: React.FC = () => {
  const navigate = useNavigate();
  const { selectedFinYear } = useFinancialYear();

  const [ledgers, setLedgers] = useState<{ id: string; name: string; gstNumber?: string; gstin?: string; gst_no?: string }[]>([]);
  const [vouchers, setVouchers] = useState<VoucherEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [gstFilter, setGstFilter] = useState<"all" | "b2b" | "b2c">("all");

  const companyId = localStorage.getItem("company_id") || "";
  const ownerType = localStorage.getItem("supplier") || "";
  const ownerId =
    localStorage.getItem(
      ownerType === "employee" ? "employee_id" : "user_id"
    ) || "";

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDrCrBalance = (amount: number, forceDisplay: boolean = false): string => {
    if (Math.abs(amount) < 0.001) {
      return forceDisplay ? "₹0.00" : "";
    }
    const formatted = formatCurrency(Math.abs(amount));
    return `${formatted} ${amount > 0 ? "Cr" : "Dr"}`;
  };

  const isVoucherB2B = (v: VoucherEntry): boolean => {
    const directGst =
      v.gstin ||
      v.gst_number ||
      v.gstNumber ||
      v.partyGstin ||
      v.party_gstin;
    if (directGst && String(directGst).trim() !== "" && String(directGst).trim() !== "-") {
      return true;
    }

    if (v.gstType === "b2b") return true;

    const partyId =
      v.partyId ||
      v.party_id ||
      v.customerId ||
      v.customer_id ||
      (v.entries && v.entries.find((e) => e.type === "debit")?.ledgerId);

    if (partyId) {
      const party = ledgers.find((l) => String(l.id) === String(partyId));
      if (party) {
        const partyGst = party.gstNumber || party.gstin || party.gst_no;
        if (partyGst && String(partyGst).trim() !== "" && String(partyGst).trim() !== "-") {
          return true;
        }
      }
    }

    return false;
  };

  const calculateDebitCredit = (voucher: VoucherEntry) => {
    if (voucher.entries && voucher.entries.length > 0) {
      const debit = voucher.entries
        .filter((e) => e.type === "debit")
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const credit = voucher.entries
        .filter((e) => e.type === "credit")
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);

      if (debit > 0 || credit > 0) {
        return { debit, credit };
      }
    }

    const totalAmt = Number(voucher.total || voucher.totalAmount || voucher.subtotal || 0);
    return { debit: totalAmt, credit: totalAmt };
  };

  // Fetch Ledgers
  useEffect(() => {
    const fetchLedgers = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        const data = await res.json();
        const ledgersArray = Array.isArray(data) ? data : data.data;
        setLedgers(ledgersArray || []);
      } catch (err) {
        console.error("Failed to fetch ledgers:", err);
      }
    };

    if (companyId && ownerType && ownerId) {
      fetchLedgers();
    }
  }, [companyId, ownerType, ownerId]);

  // Fetch All Sales Vouchers
  useEffect(() => {
    if (!companyId || !ownerType || !ownerId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(
      `${import.meta.env.VITE_API_URL}/api/sales-vouchers?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
    )
      .then((res) => res.json())
      .then((data) => {
        const rawList = Array.isArray(data) ? data : data.data || [];
        setVouchers(rawList);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load sales vouchers:", err);
        setLoading(false);
      });
  }, [companyId, ownerType, ownerId]);

  const parseVoucherDate = (dateStr: string) => {
    if (!dateStr) return null;
    const cleanDate = dateStr.split("T")[0];
    const parts = cleanDate.split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      return { year: y, monthIndex: m, day: d };
    }
    const dateObj = new Date(dateStr);
    if (isNaN(dateObj.getTime())) return null;
    return {
      year: dateObj.getFullYear(),
      monthIndex: dateObj.getMonth(),
      day: dateObj.getDate(),
    };
  };

  // Filter vouchers by GST Type (All / B2B / B2C)
  const gstFilteredVouchers = useMemo(() => {
    if (gstFilter === "all") return vouchers;
    return vouchers.filter((v) => {
      const isB2B = isVoucherB2B(v);
      return gstFilter === "b2b" ? isB2B : !isB2B;
    });
  }, [vouchers, gstFilter, ledgers]);

  // Process Month-Wise Data for the selected Financial Year
  const { monthlySummaries, grandTotal } = useMemo(() => {
    const yearFilteredVouchers = filterByFinancialYear(gstFilteredVouchers, "date", selectedFinYear);

    const { startDate } = getFinancialYearRange(selectedFinYear || "2024-25");
    const startYear = startDate.getFullYear();

    // 12 Months in April -> March Financial Year Order
    const fyMonthsConfig = [
      { name: "April", monthIndex: 3, yearOffset: 0 },
      { name: "May", monthIndex: 4, yearOffset: 0 },
      { name: "June", monthIndex: 5, yearOffset: 0 },
      { name: "July", monthIndex: 6, yearOffset: 0 },
      { name: "August", monthIndex: 7, yearOffset: 0 },
      { name: "September", monthIndex: 8, yearOffset: 0 },
      { name: "October", monthIndex: 9, yearOffset: 0 },
      { name: "November", monthIndex: 10, yearOffset: 0 },
      { name: "December", monthIndex: 11, yearOffset: 0 },
      { name: "January", monthIndex: 0, yearOffset: 1 },
      { name: "February", monthIndex: 1, yearOffset: 1 },
      { name: "March", monthIndex: 2, yearOffset: 1 },
    ];

    let runningBalance = 0;
    let totalDebitSum = 0;
    let totalCreditSum = 0;

    const summaries: MonthSummary[] = fyMonthsConfig.map((mConfig, index) => {
      const targetYear = startYear + mConfig.yearOffset;
      const targetMonthIndex = mConfig.monthIndex;

      const monthVouchers = yearFilteredVouchers.filter((v) => {
        const parsed = parseVoucherDate(v.date);
        if (!parsed) return false;
        return parsed.year === targetYear && parsed.monthIndex === targetMonthIndex;
      });

      let monthDebit = 0;
      let monthCredit = 0;

      monthVouchers.forEach((v) => {
        const { debit, credit } = calculateDebitCredit(v);
        monthDebit += debit;
        monthCredit += credit;
      });

      const openingBalance = runningBalance;
      const netChange = monthCredit - monthDebit;
      runningBalance = openingBalance + netChange;
      const closingBalance = runningBalance;

      totalDebitSum += monthDebit;
      totalCreditSum += monthCredit;

      return {
        monthName: mConfig.name,
        monthIndex: index,
        year: targetYear,
        openingBalance,
        debit: monthDebit,
        credit: monthCredit,
        closingBalance,
        vouchers: monthVouchers,
      };
    });

    return {
      monthlySummaries: summaries,
      grandTotal: {
        totalDebit: totalDebitSum,
        totalCredit: totalCreditSum,
        finalClosingBalance: runningBalance,
      },
    };
  }, [gstFilteredVouchers, selectedFinYear]);

  const handleExportCSV = () => {
    const csvContent = [
      ["Financial Year", selectedFinYear || "All"],
      ["GST Filter", gstFilter.toUpperCase()],
      ["Month", "Debit Amount", "Credit Amount", "Closing Balance"],
      ...monthlySummaries.map((m) => {
        return [
          m.monthName,
          m.debit > 0 ? m.debit.toString() : "",
          m.credit > 0 ? m.credit.toString() : "",
          formatDrCrBalance(m.closingBalance, true),
        ].join(",");
      }),
      [
        "Grand Total",
        grandTotal.totalDebit.toString(),
        grandTotal.totalCredit.toString(),
        formatDrCrBalance(grandTotal.finalClosingBalance, true),
      ].join(","),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Sales_Voucher_Report_${gstFilter.toUpperCase()}_${selectedFinYear || "All"}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printContent = `
      <html>
        <head>
          <title>Sales Voucher Report (${gstFilter.toUpperCase()})</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .header { text-align: center; margin-bottom: 20px; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Sales Voucher Report (${gstFilter.toUpperCase()})</h2>
            <p>Financial Year: ${selectedFinYear || "All"}</p>
            <p>Generated on: ${new Date().toLocaleString()}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th class="text-right">Debit</th>
                <th class="text-right">Credit</th>
                <th class="text-right">Closing Balance</th>
              </tr>
            </thead>
            <tbody>
              ${monthlySummaries
                .map(
                  (m) => `
                <tr>
                  <td>${m.monthName}</td>
                  <td class="text-right">${m.debit > 0 ? formatCurrency(m.debit) : ""}</td>
                  <td class="text-right">${m.credit > 0 ? formatCurrency(m.credit) : ""}</td>
                  <td class="text-right">${formatDrCrBalance(m.closingBalance, true)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
            <tfoot>
              <tr class="font-bold">
                <td>Grand Total</td>
                <td class="text-right">${formatCurrency(grandTotal.totalDebit)}</td>
                <td class="text-right">${formatCurrency(grandTotal.totalCredit)}</td>
                <td class="text-right">${formatDrCrBalance(grandTotal.finalClosingBalance, true)}</td>
              </tr>
            </tfoot>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  if (loading) {
    return (
      <div className="pt-[56px] px-4 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="pt-[56px] px-4 min-h-screen pb-12">
      {/* Top Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center">
          <button
            onClick={() => navigate("/app/reports")}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors mr-3"
            title="Back to Reports"
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <ShoppingCart className="text-blue-600" size={28} />
              Sales Voucher Report
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Financial Year: <span className="font-semibold text-gray-700">{selectedFinYear || "All"}</span>
            </p>
          </div>
        </div>

        {/* Action Controls & GST Filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* GST Filter Selector */}
          <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200 text-sm">
            <Filter size={15} className="text-gray-500 ml-2 mr-1" />
            <button
              onClick={() => setGstFilter("all")}
              className={`px-3 py-1 rounded-md font-medium text-xs transition-colors ${
                gstFilter === "all"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              All Sales
            </button>
            <button
              onClick={() => setGstFilter("b2b")}
              className={`px-3 py-1 rounded-md font-medium text-xs transition-colors ${
                gstFilter === "b2b"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              B2B Only
            </button>
            <button
              onClick={() => setGstFilter("b2c")}
              className={`px-3 py-1 rounded-md font-medium text-xs transition-colors ${
                gstFilter === "b2c"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              B2C Only
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center shadow-sm text-sm font-medium"
            title="Export to CSV"
          >
            <Download size={16} className="mr-2" />
            Export CSV
          </button>
          <button
            onClick={handlePrint}
            className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-lg transition-colors flex items-center shadow-sm text-sm font-medium"
            title="Print Report"
          >
            <Printer size={16} className="mr-2" />
            Print
          </button>
        </div>
      </div>

      {/* Month-Wise Summary Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Calendar className="text-blue-600" size={20} />
            Financial Year Monthly Breakdown ({gstFilter.toUpperCase()} - April → March)
          </h2>
          <span className="text-xs text-gray-500">
            Click any month to open its detailed register page
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-3.5 text-left font-semibold">Month</th>
                <th className="px-6 py-3.5 text-right font-semibold">Debit</th>
                <th className="px-6 py-3.5 text-right font-semibold">Credit</th>
                <th className="px-6 py-3.5 text-right font-semibold">Closing Balance</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {monthlySummaries.map((mSummary) => {
                const hasTransactions = mSummary.debit > 0 || mSummary.credit > 0;
                const isBalanceNonZero = Math.abs(mSummary.closingBalance) >= 0.001;

                return (
                  <tr
                    key={mSummary.monthName}
                    onClick={() =>
                      navigate(
                        `/app/reports/voucher/sales/detail/${mSummary.monthName}?gstType=${gstFilter}`
                      )
                    }
                    className="cursor-pointer hover:bg-blue-50/70 transition-colors group"
                  >
                    <td className="px-6 py-3.5 whitespace-nowrap text-sm text-gray-900 flex items-center justify-between">
                      <span className="font-medium text-blue-700 group-hover:underline flex items-center gap-1.5">
                        {mSummary.monthName}
                      </span>
                      <ChevronRight size={16} className="text-gray-400 group-hover:text-blue-600 transition-colors" />
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-sm text-right font-medium text-gray-800">
                      {mSummary.debit > 0 ? formatCurrency(mSummary.debit) : ""}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-sm text-right font-medium text-gray-800">
                      {mSummary.credit > 0 ? formatCurrency(mSummary.credit) : ""}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                      {hasTransactions || isBalanceNonZero
                        ? formatDrCrBalance(mSummary.closingBalance, true)
                        : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Grand Total Row */}
            <tfoot className="bg-gray-100 border-t-2 border-gray-300 font-bold">
              <tr>
                <td className="px-6 py-4 text-sm text-gray-900 font-bold">
                  Grand Total
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-blue-700 font-bold">
                  {formatCurrency(grandTotal.totalDebit)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-700 font-bold">
                  {formatCurrency(grandTotal.totalCredit)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-bold">
                  {formatDrCrBalance(grandTotal.finalClosingBalance, true)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SalesVoucherReport;
