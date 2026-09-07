import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Receipt,
  Download,
  Printer,
  FileCode2,
  Edit,
  Trash2,
  Search,
  Calendar,
  Layers,
} from "lucide-react";
import Swal from "sweetalert2";
import { useFinancialYear, filterByFinancialYear, getFinancialYearRange } from "../../../hooks/useFinancialYear";
import { useCompany } from "../../../context/CompanyContext";
import { generateReceiptXmlContent } from "../../voucherRegister/receiptXmlGenerator";

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
  entries: VoucherEntryLine[];
}

const ReceiptVoucherReportDetail: React.FC = () => {
  const { month } = useParams<{ month: string }>();
  const navigate = useNavigate();
  const { selectedFinYear } = useFinancialYear();
  const { activeCompany } = useCompany();

  const [ledgers, setLedgers] = useState<{ id: string; name: string }[]>([]);
  const [vouchers, setVouchers] = useState<VoucherEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [previewXml, setPreviewXml] = useState<{ content: string; filename: string } | null>(null);

  const companyId = localStorage.getItem("company_id") || "";
  const ownerType = localStorage.getItem("supplier") || "";
  const ownerId =
    localStorage.getItem(
      ownerType === "employee" ? "employee_id" : "user_id"
    ) || "";

  // Helper date formatting
  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = date.getFullYear();
    return `${day}-${m}-${y}`;
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDrCrBalance = (amount: number, forceDisplay: boolean = true): string => {
    if (Math.abs(amount) < 0.001) {
      return forceDisplay ? "₹0.00" : "";
    }
    const formatted = formatCurrency(Math.abs(amount));
    return `${formatted} ${amount > 0 ? "Cr" : "Dr"}`;
  };

  const calculateDebitCredit = (voucher: VoucherEntry) => {
    const debit = (voucher.entries || [])
      .filter((e) => e.type === "debit")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const credit = (voucher.entries || [])
      .filter((e) => e.type === "credit")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    return { debit, credit };
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

  // Fetch All Receipt Vouchers
  useEffect(() => {
    if (!companyId || !ownerType || !ownerId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(
      `${import.meta.env.VITE_API_URL}/api/vouchers?companyId=${companyId}&ownerType=${ownerType}&ownerId=${ownerId}&voucherType=receipt`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setVouchers(data.data);
        else if (Array.isArray(data)) setVouchers(data);
        else setVouchers([]);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load receipt vouchers:", err);
        setLoading(false);
      });
  }, [companyId, ownerType, ownerId]);

  const getLedgerName = (ledgerId?: number | string) => {
    if (!ledgerId) return "Unknown Ledger (-)";
    const ledger = ledgers.find((l) => String(l.id) === String(ledgerId));
    return ledger ? ledger.name : `Unknown Ledger (${ledgerId})`;
  };

  const getParticulars = (voucher: VoucherEntry): string => {
    if (!voucher.entries || voucher.entries.length === 0) return "-";
    return voucher.entries
      .map((entry) => getLedgerName(entry.ledger_id ?? entry.ledgerId))
      .join(", ");
  };

  const getVoucherStatus = (voucher: VoucherEntry): string => {
    if (!voucher.referenceNo) return "draft";
    const totalAmount = (voucher.entries || []).reduce(
      (sum, entry) => sum + entry.amount,
      0
    );
    if (totalAmount > 5000) return "approved";
    return "pending";
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "approved":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "draft":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

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

  // Process data for the selected month in the selected Financial Year
  const { monthData, monthVouchers, yearDisplay } = useMemo(() => {
    const yearFilteredVouchers = filterByFinancialYear(vouchers, "date", selectedFinYear);
    const { startDate } = getFinancialYearRange(selectedFinYear || "2024-25");
    const startYear = startDate.getFullYear();

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

    const targetMonthName = month ? month.trim().toLowerCase() : "";
    const targetConfigIndex = fyMonthsConfig.findIndex(
      (m) => m.name.toLowerCase() === targetMonthName
    );

    let runningBalance = 0;
    let selectedMonthOpening = 0;
    let selectedMonthDebit = 0;
    let selectedMonthCredit = 0;
    let selectedMonthClosing = 0;
    let selectedMonthYear = startYear;
    let selectedVouchers: VoucherEntry[] = [];

    fyMonthsConfig.forEach((mConfig, index) => {
      const targetYear = startYear + mConfig.yearOffset;
      const targetMonthIndex = mConfig.monthIndex;

      const mIndexVouchers = yearFilteredVouchers.filter((v) => {
        const parsed = parseVoucherDate(v.date);
        if (!parsed) return false;
        return parsed.year === targetYear && parsed.monthIndex === targetMonthIndex;
      });

      let mDebit = 0;
      let mCredit = 0;
      mIndexVouchers.forEach((v) => {
        const { debit, credit } = calculateDebitCredit(v);
        mDebit += debit;
        mCredit += credit;
      });

      const opening = runningBalance;
      const netChange = mCredit - mDebit;
      runningBalance = opening + netChange;
      const closing = runningBalance;

      if (index === (targetConfigIndex >= 0 ? targetConfigIndex : 0)) {
        selectedMonthOpening = opening;
        selectedMonthDebit = mDebit;
        selectedMonthCredit = mCredit;
        selectedMonthClosing = closing;
        selectedMonthYear = targetYear;
        selectedVouchers = mIndexVouchers;
      }
    });

    const activeMonthName =
      targetConfigIndex >= 0 ? fyMonthsConfig[targetConfigIndex].name : month || "Month";

    return {
      monthData: {
        monthName: activeMonthName,
        year: selectedMonthYear,
        openingBalance: selectedMonthOpening,
        debit: selectedMonthDebit,
        credit: selectedMonthCredit,
        closingBalance: selectedMonthClosing,
      },
      monthVouchers: selectedVouchers,
      yearDisplay: selectedMonthYear,
    };
  }, [vouchers, selectedFinYear, month]);

  // Filter vouchers by search term
  const filteredVouchers = useMemo(() => {
    if (!searchTerm.trim()) return monthVouchers;
    const term = searchTerm.toLowerCase();

    return monthVouchers.filter((v) => {
      const matchNo = v.number.toLowerCase().includes(term);
      const matchNarration = v.narration && v.narration.toLowerCase().includes(term);
      const matchParticulars = getParticulars(v).toLowerCase().includes(term);
      const matchRef = v.referenceNo && v.referenceNo.toLowerCase().includes(term);
      return matchNo || matchNarration || matchParticulars || matchRef;
    });
  }, [monthVouchers, searchTerm, ledgers]);

  // Voucher Action Handlers
  const deleteHandler = async (id: string) => {
    if (!id) return;
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "Do you really want to delete this receipt voucher?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/vouchers/${id}?ownerType=${ownerType}&ownerId=${ownerId}&voucherType=receipt`,
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error("Delete request failed");

      Swal.fire({
        icon: "success",
        title: "Deleted!",
        text: "Receipt voucher has been deleted successfully.",
      });

      setVouchers((prev) => prev.filter((v) => v.id !== id));
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to delete voucher.",
      });
    }
  };

  const handleGenerateXml = async (voucher: VoucherEntry) => {
    try {
      Swal.fire({
        title: "Generating XML...",
        text: "Fetching details, please wait.",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/vouchers/${voucher.id}?companyId=${companyId}&ownerType=${ownerType}&ownerId=${ownerId}&voucherType=receipt`
      );
      if (!response.ok) throw new Error("Failed to fetch full voucher details");

      const resData = await response.json();
      const fullVoucher = resData.data || resData;

      let dbLedgers = ledgers;
      try {
        const ledgersRes = await fetch(
          `${import.meta.env.VITE_API_URL}/api/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        if (ledgersRes.ok) {
          dbLedgers = await ledgersRes.json();
        }
      } catch (err) {
        console.error("Failed to fetch ledgers", err);
      }

      const companyName = activeCompany?.name || "M P Traders";
      const xmlContent = generateReceiptXmlContent(fullVoucher, companyName, dbLedgers);

      Swal.close();
      setPreviewXml({
        content: xmlContent,
        filename: `ReceiptVoucher_${voucher.number || voucher.id}.xml`,
      });
    } catch (error) {
      console.error("XML Generation Error", error);
      Swal.close();
      Swal.fire("Error", "Failed to generate XML", "error");
    }
  };

  const handleExportCSV = () => {
    const csvContent = [
      ["Month", `${monthData.monthName} ${monthData.year}`],
      ["Financial Year", selectedFinYear || "All"],
      ["Opening Balance", formatDrCrBalance(monthData.openingBalance)],
      ["Total Debit", monthData.debit.toString()],
      ["Total Credit", monthData.credit.toString()],
      ["Closing Balance", formatDrCrBalance(monthData.closingBalance)],
      [],
      ["Date", "Voucher No", "Type", "Particulars", "Debit Amount", "Credit Amount", "Status"],
      ...filteredVouchers.map((v) => {
        const { debit, credit } = calculateDebitCredit(v);
        return [
          v.date,
          v.number,
          "RECEIPT",
          `"${getParticulars(v)}"`,
          debit > 0 ? debit.toString() : "",
          credit > 0 ? credit.toString() : "",
          getVoucherStatus(v),
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Receipt_Register_${monthData.monthName}_${monthData.year}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printContent = `
      <html>
        <head>
          <title>Receipt Voucher Register - ${monthData.monthName} ${monthData.year}</title>
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
            <h2>Receipt Voucher Register</h2>
            <h3>${monthData.monthName} ${monthData.year} (FY: ${selectedFinYear || "All"})</h3>
            <p>Opening Balance: ${formatDrCrBalance(monthData.openingBalance)} | Closing Balance: ${formatDrCrBalance(monthData.closingBalance)}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher No</th>
                <th>Particulars</th>
                <th class="text-right">Debit</th>
                <th class="text-right">Credit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredVouchers
                .map((v) => {
                  const { debit, credit } = calculateDebitCredit(v);
                  return `
                <tr>
                  <td>${formatDate(v.date)}</td>
                  <td>${v.number}</td>
                  <td>${getParticulars(v)}</td>
                  <td class="text-right">${debit > 0 ? formatCurrency(debit) : ""}</td>
                  <td class="text-right">${credit > 0 ? formatCurrency(credit) : ""}</td>
                  <td>${getVoucherStatus(v)}</td>
                </tr>`;
                })
                .join("")}
            </tbody>
            <tfoot>
              <tr class="font-bold">
                <td colspan="3">Total</td>
                <td class="text-right">${formatCurrency(monthData.debit)}</td>
                <td class="text-right">${formatCurrency(monthData.credit)}</td>
                <td></td>
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="pt-[56px] px-4 min-h-screen pb-12">
      {/* Top Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center">
          <button
            onClick={() => navigate("/app/reports/voucher/receipt")}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors mr-3"
            title="Back to Receipt Report"
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <Receipt className="text-green-600" size={28} />
              Receipt Register - {monthData.monthName} {yearDisplay}
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

      {/* Summary Cards for Selected Month */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50/60 border border-blue-200 p-4 rounded-xl shadow-sm">
          <span className="text-xs font-semibold uppercase text-blue-600 tracking-wider">
            Opening Balance
          </span>
          <p className="text-2xl font-bold text-blue-950 mt-1">
            {formatDrCrBalance(monthData.openingBalance)}
          </p>
        </div>

        <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
          <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">
            Total Debit
          </span>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {formatCurrency(monthData.debit)}
          </p>
        </div>

        <div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
          <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">
            Total Credit
          </span>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {formatCurrency(monthData.credit)}
          </p>
        </div>

        <div className="bg-emerald-50/60 border border-emerald-200 p-4 rounded-xl shadow-sm">
          <span className="text-xs font-semibold uppercase text-emerald-700 tracking-wider">
            Closing Balance
          </span>
          <p className="text-2xl font-bold text-emerald-950 mt-1">
            {formatDrCrBalance(monthData.closingBalance)}
          </p>
        </div>
      </div>

      {/* Main Ledger Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Layers className="text-green-600" size={22} />
              Voucher Entries for {monthData.monthName} {yearDisplay}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Displaying all receipt vouchers recorded in {monthData.monthName}.
            </p>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search vouchers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {/* Detailed Ledger Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold">Date</th>
                  <th className="px-6 py-3 text-left font-semibold">Voucher No</th>
                  <th className="px-6 py-3 text-left font-semibold">Type</th>
                  <th className="px-6 py-3 text-left font-semibold">Supplier Date</th>
                  <th className="px-6 py-3 text-left font-semibold">Particulars</th>
                  <th className="px-6 py-3 text-right font-semibold">Debit Amount</th>
                  <th className="px-6 py-3 text-right font-semibold">Credit Amount</th>
                  <th className="px-6 py-3 text-left font-semibold">Status</th>
                  <th className="px-6 py-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredVouchers.map((v) => {
                  const status = getVoucherStatus(v);
                  const { debit, credit } = calculateDebitCredit(v);
                  const particulars = getParticulars(v);

                  return (
                    <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3.5 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(v.date)}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {v.number}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-sm text-gray-500">
                        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          RECEIPT
                        </span>
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(v.supplier_invoice_date || v.date)}
                      </td>
                      <td
                        className="px-6 py-3.5 text-sm text-gray-600 max-w-xs truncate"
                        title={particulars}
                      >
                        {particulars}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                        {debit > 0 ? formatCurrency(debit) : "-"}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                        {credit > 0 ? formatCurrency(credit) : "-"}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusColor(
                            status
                          )}`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap text-sm font-medium text-center">
                        <div className="flex items-center justify-center space-x-3">
                          <button
                            onClick={() => navigate(`/app/vouchers/receipt/edit/${v.id}`)}
                            className="text-indigo-600 hover:text-indigo-900 transition-colors"
                            title="Edit voucher"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleGenerateXml(v)}
                            className="text-orange-600 hover:text-orange-900 transition-colors"
                            title="Generate XML"
                          >
                            <FileCode2 size={16} />
                          </button>
                          <button
                            onClick={() => deleteHandler(v.id)}
                            className="text-red-600 hover:text-red-900 transition-colors"
                            title="Delete voucher"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredVouchers.length === 0 && (
            <div className="text-center py-10 bg-gray-50">
              <p className="text-gray-500 text-base">
                No receipt vouchers found for {monthData.monthName} {yearDisplay}.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* XML Preview Modal */}
      {previewXml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-11/12 max-w-4xl flex flex-col h-[80vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">
                XML Preview: {previewXml.filename}
              </h3>
              <button
                onClick={() => setPreviewXml(null)}
                className="text-gray-500 hover:text-gray-700 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 p-6 overflow-auto bg-gray-50">
              <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono">
                {previewXml.content}
              </pre>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-white rounded-b-xl">
              <button
                onClick={() => setPreviewXml(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([previewXml.content], { type: "application/xml" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = previewXml.filename;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  setPreviewXml(null);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-2"
              >
                Download XML
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptVoucherReportDetail;
