import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ShoppingCart,
  Download,
  Printer,
  FileCode2,
  Edit,
  Trash2,
  Search,
  Calendar,
  Filter,
  Eye,
} from "lucide-react";
import Swal from "sweetalert2";
import { useFinancialYear, filterByFinancialYear, getFinancialYearRange } from "../../../hooks/useFinancialYear";
import { useCompany } from "../../../context/CompanyContext";
import { generateSalesXmlContent, generateBulkSalesXmlContent } from "../../voucherRegister/salesVoucherRegister/salesXmlGenerator";

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
  mode?: string;
}

const SalesVoucherReportDetail: React.FC = () => {
  const { month } = useParams<{ month: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialGstFilter = (searchParams.get("gstType") as "all" | "b2b" | "b2c") || "all";

  const navigate = useNavigate();
  const { selectedFinYear } = useFinancialYear();
  const { activeCompany } = useCompany();

  const [ledgers, setLedgers] = useState<{ id: string; name: string; gstNumber?: string; gstin?: string; gst_no?: string }[]>([]);
  const [vouchers, setVouchers] = useState<VoucherEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [gstFilter, setGstFilter] = useState<"all" | "b2b" | "b2c">(initialGstFilter);
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

  // Fetch Sales Vouchers
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

  const getLedgerName = (ledgerId?: string | number) => {
    if (!ledgerId) return "Cash/Party";
    const found = ledgers.find((l) => String(l.id) === String(ledgerId));
    return found ? found.name : `Ledger #${ledgerId}`;
  };

  // Filter vouchers by selected Financial Year, target Month, and GST filter
  const monthVouchers = useMemo(() => {
    const yearFiltered = filterByFinancialYear(vouchers, "date", selectedFinYear);
    const { startDate } = getFinancialYearRange(selectedFinYear || "2024-25");
    const startYear = startDate.getFullYear();

    const monthMap: Record<string, { monthIndex: number; yearOffset: number }> = {
      april: { monthIndex: 3, yearOffset: 0 },
      may: { monthIndex: 4, yearOffset: 0 },
      june: { monthIndex: 5, yearOffset: 0 },
      july: { monthIndex: 6, yearOffset: 0 },
      august: { monthIndex: 7, yearOffset: 0 },
      september: { monthIndex: 8, yearOffset: 0 },
      october: { monthIndex: 9, yearOffset: 0 },
      november: { monthIndex: 10, yearOffset: 0 },
      december: { monthIndex: 11, yearOffset: 0 },
      january: { monthIndex: 0, yearOffset: 1 },
      february: { monthIndex: 1, yearOffset: 1 },
      march: { monthIndex: 2, yearOffset: 1 },
    };

    const targetMonthKey = (month || "").toLowerCase();
    const config = monthMap[targetMonthKey];

    if (!config) return [];

    const targetYear = startYear + config.yearOffset;
    const targetMonthIndex = config.monthIndex;

    let filtered = yearFiltered.filter((v) => {
      const parsed = parseVoucherDate(v.date);
      if (!parsed) return false;
      return parsed.year === targetYear && parsed.monthIndex === targetMonthIndex;
    });

    // Apply GST Filter (All / B2B / B2C)
    if (gstFilter !== "all") {
      filtered = filtered.filter((v) => {
        const isB2B = isVoucherB2B(v);
        return gstFilter === "b2b" ? isB2B : !isB2B;
      });
    }

    return filtered;
  }, [vouchers, selectedFinYear, month, gstFilter, ledgers]);

  // Apply Search Term Filter
  const filteredVouchers = useMemo(() => {
    if (!searchTerm.trim()) return monthVouchers;
    const term = searchTerm.toLowerCase();
    return monthVouchers.filter((v) => {
      const vNum = (v.number || "").toLowerCase();
      const refNum = (v.referenceNo || "").toLowerCase();
      const party = (v.partyName || v.customerName || getLedgerName(v.partyId || v.customerId)).toLowerCase();
      const narration = (v.narration || "").toLowerCase();
      return (
        vNum.includes(term) ||
        refNum.includes(term) ||
        party.includes(term) ||
        narration.includes(term)
      );
    });
  }, [monthVouchers, searchTerm, ledgers]);

  // Calculations for totals
  const totals = useMemo(() => {
    let debitSum = 0;
    let creditSum = 0;

    filteredVouchers.forEach((v) => {
      const { debit, credit } = calculateDebitCredit(v);
      debitSum += debit;
      creditSum += credit;
    });

    const netClosing = creditSum - debitSum;

    return {
      totalDebit: debitSum,
      totalCredit: creditSum,
      netClosing,
    };
  }, [filteredVouchers]);

  // Handle XML Generation for Single Voucher
  const handleGenerateXml = async (voucher: VoucherEntry) => {
    try {
      Swal.fire({
        title: "Generating XML...",
        text: "Please wait...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/sales-vouchers/${voucher.id}?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch full voucher details");
      }
      const fullVoucher = await response.json();
      const companyName = activeCompany?.name || "M P Traders";

      const xmlContent = generateSalesXmlContent(fullVoucher, companyName, ledgers);
      Swal.close();

      setPreviewXml({
        content: xmlContent,
        filename: `SalesVoucher_${voucher.number || voucher.id}.xml`,
      });
    } catch (err) {
      console.error("XML error:", err);
      Swal.close();
      Swal.fire("Error", "Failed to generate XML for this voucher", "error");
    }
  };

  // Handle Bulk XML Generation
  const handleGenerateAllXml = async () => {
    if (filteredVouchers.length === 0) {
      Swal.fire("Info", "No vouchers available to export.", "info");
      return;
    }

    try {
      Swal.fire({
        title: "Generating XML...",
        text: `Fetching details for ${filteredVouchers.length} vouchers...`,
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const fetchPromises = filteredVouchers.map((voucher) =>
        fetch(
          `${import.meta.env.VITE_API_URL}/api/sales-vouchers/${voucher.id}?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        ).then((res) => {
          if (!res.ok) throw new Error("Failed to fetch voucher details");
          return res.json();
        })
      );

      const fullVouchers = await Promise.all(fetchPromises);
      const companyName = activeCompany?.name || "M P Traders";

      const xmlContent = generateBulkSalesXmlContent(fullVouchers, companyName, ledgers);
      Swal.close();

      setPreviewXml({
        content: xmlContent,
        filename: `SalesVouchers_${month}_${gstFilter.toUpperCase()}_${selectedFinYear || "All"}.xml`,
      });
    } catch (err) {
      console.error("Bulk XML error:", err);
      Swal.close();
      Swal.fire("Error", "Failed to generate XML for vouchers.", "error");
    }
  };

  // Delete Voucher
  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "This sales voucher will be permanently deleted!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/sales-vouchers/${id}?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete voucher");

      setVouchers((prev) => prev.filter((v) => v.id !== id));
      Swal.fire("Deleted!", "Sales voucher has been deleted.", "success");
    } catch (err) {
      console.error("Delete error:", err);
      Swal.fire("Error", "Failed to delete sales voucher", "error");
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const csvContent = [
      ["Date", "Voucher No", "Ref No", "Particulars / Party", "GST Type", "Debit Amount", "Credit Amount"],
      ...filteredVouchers.map((v) => {
        const { debit, credit } = calculateDebitCredit(v);
        const party = v.partyName || v.customerName || getLedgerName(v.partyId || v.customerId);
        const b2b = isVoucherB2B(v) ? "B2B" : "B2C";
        return [
          formatDate(v.date),
          `"${v.number || v.id}"`,
          `"${v.referenceNo || ""}"`,
          `"${party}"`,
          b2b,
          debit > 0 ? debit.toString() : "",
          credit > 0 ? credit.toString() : "",
        ].join(",");
      }),
      [
        "Total",
        "",
        "",
        "",
        "",
        totals.totalDebit.toString(),
        totals.totalCredit.toString(),
      ].join(","),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Sales_Voucher_Report_${month}_${gstFilter.toUpperCase()}_${selectedFinYear || "All"}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Print
  const handlePrint = () => {
    const printContent = `
      <html>
        <head>
          <title>Sales Voucher Register - ${month} (${gstFilter.toUpperCase()})</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #f2f2f2; }
            .header { text-align: center; margin-bottom: 20px; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Sales Voucher Register - ${month} (${gstFilter.toUpperCase()})</h2>
            <p>Financial Year: ${selectedFinYear || "All"}</p>
            <p>Generated on: ${new Date().toLocaleString()}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher No</th>
                <th>Ref No</th>
                <th>Particulars</th>
                <th>Type</th>
                <th class="text-right">Debit (₹)</th>
                <th class="text-right">Credit (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${filteredVouchers
                .map((v) => {
                  const { debit, credit } = calculateDebitCredit(v);
                  const party = v.partyName || v.customerName || getLedgerName(v.partyId || v.customerId);
                  const b2b = isVoucherB2B(v) ? "B2B" : "B2C";
                  return `
                  <tr>
                    <td>${formatDate(v.date)}</td>
                    <td>${v.number || v.id}</td>
                    <td>${v.referenceNo || "-"}</td>
                    <td>${party}</td>
                    <td>${b2b}</td>
                    <td class="text-right">${debit > 0 ? formatCurrency(debit) : ""}</td>
                    <td class="text-right">${credit > 0 ? formatCurrency(credit) : ""}</td>
                  </tr>`;
                })
                .join("")}
            </tbody>
            <tfoot>
              <tr class="font-bold">
                <td colspan="5">Total</td>
                <td class="text-right">${formatCurrency(totals.totalDebit)}</td>
                <td class="text-right">${formatCurrency(totals.totalCredit)}</td>
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

  const handleGstFilterChange = (filter: "all" | "b2b" | "b2c") => {
    setGstFilter(filter);
    setSearchParams({ gstType: filter });
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
      {/* Top Navigation & Title */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center">
          <button
            onClick={() => navigate("/app/reports/voucher/sales")}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors mr-3"
            title="Back to Sales Voucher Report"
          >
            <ArrowLeft size={22} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <ShoppingCart className="text-blue-600" size={28} />
              Sales Voucher Register - <span className="capitalize text-blue-600">{month}</span>
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Financial Year: <span className="font-semibold text-gray-700">{selectedFinYear || "All"}</span>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* GST Filter Toggle */}
          <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200 text-sm mr-2">
            <Filter size={15} className="text-gray-500 ml-2 mr-1" />
            <button
              onClick={() => handleGstFilterChange("all")}
              className={`px-3 py-1 rounded-md font-medium text-xs transition-colors ${
                gstFilter === "all"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              All
            </button>
            <button
              onClick={() => handleGstFilterChange("b2b")}
              className={`px-3 py-1 rounded-md font-medium text-xs transition-colors ${
                gstFilter === "b2b"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              B2B
            </button>
            <button
              onClick={() => handleGstFilterChange("b2c")}
              className={`px-3 py-1 rounded-md font-medium text-xs transition-colors ${
                gstFilter === "b2c"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              B2C
            </button>
          </div>

          <button
            onClick={handleGenerateAllXml}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg transition-colors flex items-center shadow-sm text-sm font-medium"
            title="Export All to Tally XML"
          >
            <FileCode2 size={16} className="mr-1.5" />
            Export Tally XML
          </button>
          <button
            onClick={handleExportCSV}
            className="bg-green-600 hover:bg-green-700 text-white px-3.5 py-2 rounded-lg transition-colors flex items-center shadow-sm text-sm font-medium"
            title="Export CSV"
          >
            <Download size={16} className="mr-1.5" />
            Export CSV
          </button>
          <button
            onClick={handlePrint}
            className="bg-gray-700 hover:bg-gray-800 text-white px-3.5 py-2 rounded-lg transition-colors flex items-center shadow-sm text-sm font-medium"
            title="Print"
          >
            <Printer size={16} className="mr-1.5" />
            Print
          </button>
        </div>
      </div>

      {/* Summary Header Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">Total Vouchers</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{filteredVouchers.length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">Total Debit Amount</p>
          <p className="text-xl font-bold text-blue-600 mt-1">{formatCurrency(totals.totalDebit)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">Total Credit Amount</p>
          <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(totals.totalCredit)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 font-medium">Month Closing Balance</p>
          <p className="text-xl font-bold text-gray-900 mt-1">
            {formatDrCrBalance(totals.netClosing, true)}
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search voucher no, party, reference..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="text-xs text-gray-500">
          Showing <span className="font-semibold text-gray-700">{filteredVouchers.length}</span> of {monthVouchers.length} vouchers ({gstFilter.toUpperCase()})
        </div>
      </div>

      {/* Detailed Vouchers Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs tracking-wider">
              <tr>
                <th className="px-5 py-3.5 text-left font-semibold">Date</th>
                <th className="px-5 py-3.5 text-left font-semibold">Voucher No</th>
                <th className="px-5 py-3.5 text-left font-semibold">Ref No</th>
                <th className="px-5 py-3.5 text-left font-semibold">Particulars</th>
                <th className="px-4 py-3.5 text-center font-semibold">Type</th>
                <th className="px-5 py-3.5 text-right font-semibold">Debit (₹)</th>
                <th className="px-5 py-3.5 text-right font-semibold">Credit (₹)</th>
                <th className="px-5 py-3.5 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredVouchers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No sales vouchers found for {month} ({gstFilter.toUpperCase()}).
                  </td>
                </tr>
              ) : (
                filteredVouchers.map((voucher) => {
                  const { debit, credit } = calculateDebitCredit(voucher);
                  const partyName = voucher.partyName || voucher.customerName || getLedgerName(voucher.partyId || voucher.customerId);
                  const isB2B = isVoucherB2B(voucher);

                  return (
                    <React.Fragment key={voucher.id}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-700">
                          {formatDate(voucher.date)}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-sm font-semibold text-blue-600">
                          {voucher.number || voucher.id}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-500">
                          {voucher.referenceNo || "-"}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-900 font-medium">
                          <div>{partyName}</div>
                          {voucher.narration && (
                            <div className="text-xs text-gray-400 italic mt-0.5">
                              {voucher.narration}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <span
                            className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                              isB2B
                                ? "bg-purple-100 text-purple-800"
                                : "bg-teal-100 text-teal-800"
                            }`}
                          >
                            {isB2B ? "B2B" : "B2C"}
                          </span>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-sm text-right font-medium text-blue-700">
                          {debit > 0 ? formatCurrency(debit) : ""}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-sm text-right font-medium text-green-700">
                          {credit > 0 ? formatCurrency(credit) : ""}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-center text-sm">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => navigate(`/app/vouchers/sales/view/${voucher.id}`)}
                              className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="View Voucher"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => handleGenerateXml(voucher)}
                              className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors"
                              title="Tally XML"
                            >
                              <FileCode2 size={16} />
                            </button>
                            <button
                              onClick={() => navigate(`/app/vouchers/sales/edit/${voucher.id}`)}
                              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(voucher.id)}
                              className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Render entries breakdown if present */}
                      {voucher.entries && voucher.entries.length > 0 && (
                        <tr className="bg-gray-50/50">
                          <td></td>
                          <td colSpan={7} className="px-5 py-2">
                            <div className="text-xs text-gray-500 pl-4 border-l-2 border-blue-300 space-y-1">
                              {voucher.entries.map((entry, idx) => (
                                <div key={idx} className="flex justify-between max-w-md">
                                  <span>
                                    {getLedgerName(entry.ledgerId || entry.ledger_id)} ({entry.type})
                                  </span>
                                  <span className="font-mono">
                                    {formatCurrency(Number(entry.amount || 0))}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {/* Table Footer Totals */}
            <tfoot className="bg-gray-100 border-t-2 border-gray-300 font-bold">
              <tr>
                <td colSpan={5} className="px-5 py-3.5 text-sm text-gray-900 font-bold">
                  Total
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-sm text-right text-blue-700 font-bold">
                  {formatCurrency(totals.totalDebit)}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-sm text-right text-green-700 font-bold">
                  {formatCurrency(totals.totalCredit)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* XML Preview Modal */}
      {previewXml && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-xl">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <FileCode2 className="text-indigo-600" size={20} />
                Tally XML Preview - {previewXml.filename}
              </h3>
              <button
                onClick={() => setPreviewXml(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>
            <div className="p-4 overflow-y-auto font-mono text-xs bg-gray-900 text-green-400 rounded-b-none flex-1">
              <pre className="whitespace-pre-wrap break-all">{previewXml.content}</pre>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => {
                  const blob = new Blob([previewXml.content], { type: "text/xml" });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = previewXml.filename;
                  a.click();
                  window.URL.revokeObjectURL(url);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <Download size={16} /> Download XML
              </button>
              <button
                onClick={() => setPreviewXml(null)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesVoucherReportDetail;
