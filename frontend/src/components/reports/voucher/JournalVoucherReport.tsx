import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Download,
  Printer,
  Calendar,
  ChevronRight,
} from "lucide-react";
import { useFinancialYear, filterByFinancialYear, getFinancialYearRange } from "../../../hooks/useFinancialYear";

interface VoucherEntryLine {
  id: string;
  ledgerId?: string | number;
  ledger_id?: string | number;
  amount: number;
  type: "debit" | "credit";
  narration?: string;
}

interface VoucherEntry {
  id: string;
  number: string;
  type: string;
  date: string;
  referenceNo?: string;
  supplier_invoice_date?: string;
  narration?: string;
  amount?: number;
  totalAmount?: number;
  total?: number;
  entries: VoucherEntryLine[];
}

interface MonthSummary {
  monthName: string;
  monthIndex: number; // 0-11
  year: number;
  count: number;
  startVoucherNumber: number | null;
  endVoucherNumber: number | null;
  voucherNumberRange: string;
  totalValue: number;
  vouchers: VoucherEntry[];
}

const JournalVoucherReport: React.FC = () => {
  const navigate = useNavigate();
  const { selectedFinYear } = useFinancialYear();

  const [vouchers, setVouchers] = useState<VoucherEntry[]>([]);
  const [loading, setLoading] = useState(true);

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

  const getVoucherAmount = (voucher: VoucherEntry): number => {
    if (voucher.amount !== undefined && voucher.amount !== null && !isNaN(Number(voucher.amount))) {
      return Number(voucher.amount);
    }
    if (voucher.totalAmount !== undefined && voucher.totalAmount !== null && !isNaN(Number(voucher.totalAmount))) {
      return Number(voucher.totalAmount);
    }
    if (voucher.total !== undefined && voucher.total !== null && !isNaN(Number(voucher.total))) {
      return Number(voucher.total);
    }
    const debit = (voucher.entries || [])
      .filter((e) => e.type === "debit")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const credit = (voucher.entries || [])
      .filter((e) => e.type === "credit")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    return debit > 0 ? debit : credit;
  };

  // Fetch All Journal Vouchers
  useEffect(() => {
    if (!companyId || !ownerType || !ownerId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(
      `${import.meta.env.VITE_API_URL}/api/vouchers?companyId=${companyId}&ownerType=${ownerType}&ownerId=${ownerId}&voucherType=journal`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setVouchers(data.data);
        else if (Array.isArray(data)) setVouchers(data);
        else setVouchers([]);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load journal vouchers:", err);
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

  // Process Month-Wise Data for the selected Financial Year
  const { monthlySummaries, grandTotal } = useMemo(() => {
    const yearFilteredVouchers = filterByFinancialYear(vouchers, "date", selectedFinYear);

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

    let runningSeq = 0;
    let totalCountSum = 0;
    let totalValueSum = 0;

    const summaries: MonthSummary[] = fyMonthsConfig.map((mConfig, index) => {
      const targetYear = startYear + mConfig.yearOffset;
      const targetMonthIndex = mConfig.monthIndex;

      const monthVouchers = yearFilteredVouchers
        .filter((v) => {
          const parsed = parseVoucherDate(v.date);
          if (!parsed) return false;
          return parsed.year === targetYear && parsed.monthIndex === targetMonthIndex;
        })
        .sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          if (dateA !== dateB) return dateA - dateB;
          return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
        });

      const monthCount = monthVouchers.length;
      let monthTotalValue = 0;
      monthVouchers.forEach((v) => {
        monthTotalValue += getVoucherAmount(v);
      });

      let startSeq: number | null = null;
      let endSeq: number | null = null;
      let rangeStr = "—";

      if (monthCount > 0) {
        startSeq = runningSeq + 1;
        endSeq = runningSeq + monthCount;
        runningSeq = endSeq;
        rangeStr = startSeq === endSeq ? `${startSeq}` : `${startSeq}–${endSeq}`;
      }

      totalCountSum += monthCount;
      totalValueSum += monthTotalValue;

      return {
        monthName: mConfig.name,
        monthIndex: index,
        year: targetYear,
        count: monthCount,
        startVoucherNumber: startSeq,
        endVoucherNumber: endSeq,
        voucherNumberRange: rangeStr,
        totalValue: monthTotalValue,
        vouchers: monthVouchers,
      };
    });

    const overallRange = totalCountSum > 0 ? (totalCountSum === 1 ? "1" : `1–${totalCountSum}`) : "—";

    return {
      monthlySummaries: summaries,
      grandTotal: {
        totalCount: totalCountSum,
        overallRange,
        totalValue: totalValueSum,
      },
    };
  }, [vouchers, selectedFinYear]);

  const handleExportCSV = () => {
    const csvContent = [
      ["Financial Year", selectedFinYear || "All"],
      ["Month", "Voucher Count", "Voucher Numbers", "Total Value"],
      ...monthlySummaries.map((m) => {
        return [
          m.monthName,
          m.count.toString(),
          m.voucherNumberRange,
          `"${formatCurrency(m.totalValue)}"`,
        ].join(",");
      }),
      [
        "Grand Total",
        grandTotal.totalCount.toString(),
        grandTotal.overallRange,
        `"${formatCurrency(grandTotal.totalValue)}"`,
      ].join(","),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Journal_Voucher_Report_${selectedFinYear || "All"}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printContent = `
      <html>
        <head>
          <title>Journal Voucher Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .header { text-align: center; margin-bottom: 20px; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .font-bold { font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Journal Voucher Report</h2>
            <p>Financial Year: ${selectedFinYear || "All"}</p>
            <p>Generated on: ${new Date().toLocaleString()}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th class="text-right">Voucher Count</th>
                <th class="text-center">Voucher Numbers</th>
                <th class="text-right">Total Value</th>
              </tr>
            </thead>
            <tbody>
              ${monthlySummaries
                .map(
                  (m) => `
                <tr>
                  <td>${m.monthName}</td>
                  <td class="text-right">${m.count}</td>
                  <td class="text-center">${m.voucherNumberRange}</td>
                  <td class="text-right">${formatCurrency(m.totalValue)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
            <tfoot>
              <tr class="font-bold">
                <td>Grand Total</td>
                <td class="text-right">${grandTotal.totalCount}</td>
                <td class="text-center">${grandTotal.overallRange}</td>
                <td class="text-right">${formatCurrency(grandTotal.totalValue)}</td>
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
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
              <BookOpen className="text-indigo-600" size={28} />
              Journal Voucher Report
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Financial Year: <span className="font-semibold text-gray-700">{selectedFinYear || "All"}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
            <Calendar className="text-indigo-600" size={20} />
            Financial Year Monthly Breakdown (April → March)
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
                <th className="px-6 py-3.5 text-right font-semibold">Voucher Count</th>
                <th className="px-6 py-3.5 text-center font-semibold">Voucher Numbers</th>
                <th className="px-6 py-3.5 text-right font-semibold">Total Value</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {monthlySummaries.map((mSummary) => {
                return (
                  <tr
                    key={mSummary.monthName}
                    onClick={() => navigate(`/app/reports/voucher/journal/detail/${mSummary.monthName}`)}
                    className="cursor-pointer hover:bg-indigo-50/70 transition-colors group"
                  >
                    <td className="px-6 py-3.5 whitespace-nowrap text-sm text-gray-900 flex items-center justify-between">
                      <span className="font-medium text-indigo-700 group-hover:underline flex items-center gap-1.5">
                        {mSummary.monthName}
                      </span>
                      <ChevronRight size={16} className="text-gray-400 group-hover:text-indigo-600 transition-colors" />
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-sm text-right font-medium text-gray-800">
                      {mSummary.count}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-sm text-center font-medium text-gray-800">
                      {mSummary.voucherNumberRange}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-sm text-right font-semibold text-gray-900">
                      {formatCurrency(mSummary.totalValue)}
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
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-indigo-700 font-bold">
                  {grandTotal.totalCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-800 font-bold">
                  {grandTotal.overallRange}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-bold">
                  {formatCurrency(grandTotal.totalValue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default JournalVoucherReport;
