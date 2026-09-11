import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Download, Printer, Trash2, Settings, Edit } from "lucide-react";
import Swal from "sweetalert2";

// Types - keeping everything in this file as requested
interface VoucherEntryLine {
  id: string;
  ledgerId?: string | number;
  ledger_id?: string | number; // Add this line!
  amount: number;
  type: "debit" | "credit";
  narration?: string;
}

interface VoucherEntry {
  id: string;
  number: string;
  type: string;
  date: string;
  mode?: string;
  referenceNo?: string;
  narration?: string;
  entries: VoucherEntryLine[];
}

const DebitNoteRegiser: React.FC = () => {
  const navigate = useNavigate();
  const [ledgers, setLedgers] = useState<{ id: string; name: string }[]>([]);

  const [vouchers, setVouchers] = useState<VoucherEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // New state for Change View functionality
  const [viewType, setViewType] = useState<
    "Daily" | "Monthly" | "Quarterly" | "Custom Date"
  >("Daily");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<Set<string>>(new Set());
  const [showActions, setShowActions] = useState(false);
  const [showMonthList, setShowMonthList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const companyId = localStorage.getItem("company_id") || "";
  const ownerType = localStorage.getItem("supplier") || "";
  const ownerId =
    localStorage.getItem(
      ownerType === "employee" ? "employee_id" : "user_id"
    ) || "";

  // const [isLoading, setIsLoading] = useState(true);
  // Helper function for date formatting
  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0"); // Month 0 se start hota hai
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };
  // // Generate mock payment vouchers - self-contained data
  // const generateMockPaymentVouchers = (): VoucherEntry[] => {
  //   const mockData: VoucherEntry[] = [];
  //   for (let i = 1; i <= 25; i++) {
  //     const lines: VoucherEntryLine[] = [
  //       {
  //         id: `line-${i}-1`,
  //         ledgerId: `cash-${i}`,
  //         amount: 1000 + (i * 150),
  //         type: 'credit',
  //         narration: `Cash payment ${i}`,
  //       },
  //       {
  //         id: `line-${i}-2`,
  //         ledgerId: `expense-${i}`,
  //         amount: 1000 + (i * 150),
  //         type: 'debit',
  //         narration: `Expense account ${i}`,
  //       }
  //     ];

  //     mockData.push({
  //       id: `payment-${i}`,
  //       number: `PMT-${String(i).padStart(4, '0')}`,
  //       type: 'payment',
  //       date: `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
  //       referenceNo: i % 3 === 0 ? `REF-PMT-${i}` : undefined,
  //       narration: `Payment voucher ${i} - Office expenses`,
  //       entries: lines
  //     });
  //   }
  //   return mockData;
  // };

  // Helper functions - all self-contained
  const hasPermission = (action: string): boolean => {
    const userRole = "admin";
    const permissions = {
      admin: ["add", "edit", "delete", "view", "export", "print"],
      user: ["view", "export"],
      viewer: ["view"],
    };
    return (
      permissions[userRole as keyof typeof permissions]?.includes(action) ||
      false
    );
  };

  const getVoucherStatus = (voucher: VoucherEntry): string => {
    if (!voucher.referenceNo) return "draft";
    const totalAmount = voucher.entries.reduce(
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

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Calculate debit and credit amounts from entries
  const calculateDebitCredit = (voucher: VoucherEntry) => {
    const debit = voucher.entries
      .filter((e) => e.type === "debit")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const credit = voucher.entries
      .filter((e) => e.type === "credit")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    return { debit, credit };
  };

  useEffect(() => {
    const fetchLedgers = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        const data = await res.json();

        // Agar API seedha array bhejti hai:
        const ledgersArray = Array.isArray(data) ? data : data.data;

        setLedgers(ledgersArray || []);
      } catch (err) {
        console.error("Failed to fetch ledgers:", err);
      }
    };

    fetchLedgers();
  }, []);

  const getLedgerName = (ledgerId?: number | string) => {
    if (!ledgerId) return "Unknown Ledger (-)";

    const ledger = ledgers.find((l) => String(l.id) === String(ledgerId));

    return ledger ? ledger.name : `Unknown Ledger (${ledgerId})`;
  };
  const getParticulars = (voucher: VoucherEntry): string => {
    return voucher.entries
      .map((entry) => getLedgerName(entry.ledger_id ?? entry.ledgerId))
      .join(", ");
  };

  // Get particulars (ledger details) from entries
  // const getParticulars = (voucher: VoucherEntry): string => {
  //   const ledgerNames = voucher.entries.map(entry => {
  //     const ledgerType = entry.ledgerId?.split('-')[0] || 'Unknown';
  //     const ledgerNumber = entry.ledgerId?.split('-')[1] || '0';
  //     return `${ledgerType.charAt(0).toUpperCase() + ledgerType.slice(1)} A/c ${ledgerNumber}`;
  //   });
  //   return ledgerNames.join(', ');
  // };

  // // Get available months
  const getAvailableMonths = (): { value: string; label: string }[] => {
    return [
      { value: "01", label: "January" },
      { value: "02", label: "February" },
      { value: "03", label: "March" },
      { value: "04", label: "April" },
      { value: "05", label: "May" },
      { value: "06", label: "June" },
      { value: "07", label: "July" },
      { value: "08", label: "August" },
      { value: "09", label: "September" },
      { value: "10", label: "October" },
      { value: "11", label: "November" },
      { value: "12", label: "December" },
    ];
  };

  // Filter vouchers by date range based on view type
  const filterVouchersByView = (vouchers: VoucherEntry[]): VoucherEntry[] => {
    if (!viewType || viewType === "Daily") return vouchers;

    const today = new Date();
    let startDate: Date;

    switch (viewType) {
      case "Weekly":
        startDate = new Date(today.setDate(today.getDate() - 7));
        break;
      case "Fortnightly":
        startDate = new Date(today.setDate(today.getDate() - 14));
        break;
      case "Monthly": {
        if (selectedMonth) {
          return vouchers.filter((voucher) => {
            const voucherMonth = voucher.date.split("-")[1];
            return voucherMonth === selectedMonth;
          });
        } else {
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        }
        break;
      }
      case "Quarterly": {
        const currentQuarter = Math.floor(today.getMonth() / 3);
        startDate = new Date(today.getFullYear(), currentQuarter * 3, 1);
        break;
      }
      case "Custom Date": {
        if (customStartDate && customEndDate) {
          return vouchers.filter((voucher) => {
            const voucherDate = new Date(voucher.date);
            const start = new Date(customStartDate);
            const end = new Date(customEndDate);
            return voucherDate >= start && voucherDate <= end;
          });
        }
        return vouchers;
      }
      default:
        return vouchers;
    }

    if ((viewType !== "Monthly" || !selectedMonth) && viewType !== "Custom Date") {
      return vouchers.filter((voucher) => {
        const voucherDate = new Date(voucher.date);
        return voucherDate >= startDate;
      });
    }

    return vouchers;
  };
  // Get tenant info from localStorage

  useEffect(() => {
    if (!companyId || !ownerType || !ownerId) {
      console.error("Missing tenant information");
      setLoading(false);
      return;
    }

    fetch(
      `${import.meta.env.VITE_API_URL
      }/api/DebitNoteVoucher?companyId=${companyId}&ownerType=${ownerType}&ownerId=${ownerId}&voucherType=payment`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.data) {
          setVouchers(data.data);
        } else {
          setError("Invalid response from server");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load vouchers");
        setLoading(false);
      });
  }, [companyId, ownerType, ownerId]);

  const formatMode = (mode?: string) => {
    if (!mode) return "-";

    switch (mode) {
      case "accounting-invoice":
        return "Accounting Invoice";
      case "cash":
        return "Cash";
      case "bank":
        return "Bank";
      default:
        return mode;
    }
  };

  // Filter vouchers based on search, filters, and view type
  const filteredVouchers = (() => {
    const viewFilteredVouchers = filterVouchersByView(vouchers);

    return viewFilteredVouchers.filter((voucher) => {
      const matchesSearch =
        voucher.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (voucher.narration &&
          voucher.narration.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (voucher.referenceNo &&
          voucher.referenceNo.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesDate =
        !dateFilter || formatDate(voucher.date) === formatDate(dateFilter);

      const voucherStatus = getVoucherStatus(voucher);
      const matchesStatus = !statusFilter || voucherStatus === statusFilter;

      return matchesSearch && matchesDate && matchesStatus;
    });
  })();

  // Reset page to 1 when any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    dateFilter,
    statusFilter,
    viewType,
    selectedMonth,
    customStartDate,
    customEndDate,
  ]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredVouchers.length / itemsPerPage));

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedVouchers = filteredVouchers.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  // Calculate summary statistics
  const totalDebit = filteredVouchers.reduce(
    (sum, voucher) => sum + calculateDebitCredit(voucher).debit,
    0
  );
  const totalCredit = filteredVouchers.reduce(
    (sum, voucher) => sum + calculateDebitCredit(voucher).credit,
    0
  );

  //delete handler

  const deleteHandler = async (id: string) => {
    if (!id) {
      Swal.fire({
        icon: "error",
        title: "Invalid ID",
        text: "Voucher ID missing",
      });
      return;
    }

    const result = await Swal.fire({
      title: "Are you sure?",
      text: "Do you really want to delete this Debit Note?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL
        }/api/DebitNoteVoucher/${id}?companyId=${companyId}&ownerType=${ownerType}&ownerId=${ownerId}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Delete failed");
      }

      Swal.fire({
        icon: "success",
        title: "Deleted!",
        text: "Debit Note deleted successfully.",
      });

      // ✅ UI se bhi remove
      setVouchers((prev) => prev.filter((v) => v.id !== id));
    } catch (error) {
      console.error("Delete error:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to delete Debit Note.",
      });
    }
  };

  // Edit Handler

  const editHandler = (id: string) => {
    if (!id) {
      Swal.fire({
        icon: "error",
        title: "Invalid ID",
        text: "Voucher ID missing",
      });
      return;
    }

    navigate(`/app/vouchers/debit-note/edit/${id}`);
  };

  const toggleSelect = (id: string) => {
    setSelectedVoucherIds((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedVoucherIds.size === filteredVouchers.length) {
      setSelectedVoucherIds(new Set());
    } else {
      setSelectedVoucherIds(new Set(filteredVouchers.map((v) => v.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedVoucherIds.size === 0) return;

    const result = await Swal.fire({
      title: "Are you sure?",
      text: `Do you really want to delete ${selectedVoucherIds.size} selected Debit Notes?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete them",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/vouchers/bulk-delete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ids: Array.from(selectedVoucherIds),
            ownerType,
            ownerId,
            companyId,
            voucherType: "debit_note",
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Bulk delete request failed");
      }

      Swal.fire({
        icon: "success",
        title: "Deleted!",
        text: `${selectedVoucherIds.size} Debit Notes deleted successfully.`,
      });

      const deletedIds = new Set(selectedVoucherIds);
      setVouchers((prev) => prev.filter((v) => !deletedIds.has(v.id)));
      setSelectedVoucherIds(new Set());
    } catch (error) {
      console.error("Bulk delete error:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to delete Debit Notes.",
      });
    }
  };

  const statusCounts = filteredVouchers.reduce((acc, voucher) => {
    const status = getVoucherStatus(voucher);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleExport = () => {
    if (!hasPermission("export")) {
      alert("You do not have permission to export data");
      return;
    }

    const csvContent = [
      [
        "Date",
        "Voucher Number",
        "Voucher Type",
        "Particulars",
        "Debit Amount",
        "Credit Amount",
        "Status",
      ].join(","),
      ...filteredVouchers.map((voucher) => {
        const { debit, credit } = calculateDebitCredit(voucher);
        const particulars = getParticulars(voucher);
        return [
          voucher.date,
          voucher.number,
          voucher.type.toUpperCase(),
          `"${particulars}"`,
          debit.toString(),
          credit.toString(),
          getVoucherStatus(voucher),
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Payment_Register_${new Date().toISOString().split("T")[0]
      }.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!hasPermission("print")) {
      alert("You do not have permission to print");
      return;
    }

    const printContent = `
      <html>
        <head>
          <title>Payment Register</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .header { text-align: center; margin-bottom: 20px; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Payment Register</h1>
            <p>Generated on: ${new Date().toLocaleString()}</p>
            <p>View Type: ${viewType}${selectedMonth
        ? ` - ${getAvailableMonths().find((m) => m.value === selectedMonth)
          ?.label || "Unknown Month"
        }`
        : ""
      }</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher No</th>
                <th>Voucher Type</th>
                <th>Particulars</th>
                <th class="text-right">Debit Amount</th>
                <th class="text-right">Credit Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredVouchers
        .map((voucher) => {
          const { debit, credit } = calculateDebitCredit(voucher);
          const particulars = getParticulars(voucher);
          return `
                <tr>
                  <td>${formatDate(voucher.date)}</td>
                  <td>${voucher.number}</td>
                  <td>${voucher.type.toUpperCase()}</td>
                  <td>${particulars}</td>
                  <td class="text-right">${debit > 0 ? formatCurrency(debit) : "-"
            }</td>
                  <td class="text-right">${credit > 0 ? formatCurrency(credit) : "-"
            }</td>
                  <td>${getVoucherStatus(voucher)}</td>
                </tr>`;
        })
        .join("")}
            </tbody>
            <tfoot>
              <tr class="font-bold">
                <td colspan="4">Total (${filteredVouchers.length} vouchers)</td>
                <td class="text-right">${formatCurrency(totalDebit)}</td>
                <td class="text-right">${formatCurrency(totalCredit)}</td>
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="pt-[56px] px-4 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <button
              onClick={() => navigate("/app/voucher-register")}
              className="flex items-center text-gray-600 hover:text-gray-900 transition-colors mr-3"
              title="Back to Voucher Register"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <CreditCard className="mr-3 text-red-600" size={28} />
              Debit Note Register
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowActions(!showActions)}
              className={`p-2 rounded-lg transition-colors ${
                showActions
                  ? "bg-blue-100 text-blue-600"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
              title={showActions ? "Disable Action Mode" : "Enable Action Mode"}
            >
              <Settings size={24} className={showActions ? "animate-spin-slow" : ""} />
            </button>
            {showActions && selectedVoucherIds.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center shadow-md text-sm font-semibold"
                title="Delete selected vouchers"
              >
                <Trash2 className="mr-2" size={18} />
                Delete Selected ({selectedVoucherIds.size})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow border">
          <h3 className="text-sm font-medium text-gray-500">Total Vouchers</h3>
          <p className="text-2xl font-bold text-gray-900">
            {filteredVouchers.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border">
          <h3 className="text-sm font-medium text-gray-500">Total Debit</h3>
          <p className="text-2xl font-bold text-blue-600">
            {formatCurrency(totalDebit)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border">
          <h3 className="text-sm font-medium text-gray-500">Total Credit</h3>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(totalCredit)}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border">
          <h3 className="text-sm font-medium text-gray-500">Approved</h3>
          <p className="text-2xl font-bold text-green-600">
            {statusCounts.approved || 0}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border">
          <h3 className="text-sm font-medium text-gray-500">Pending</h3>
          <p className="text-2xl font-bold text-yellow-600">
            {statusCounts.pending || 0}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow border mb-6">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label
              htmlFor="search"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Search
            </label>
            <input
              id="search"
              type="text"
              placeholder="Search vouchers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label
              htmlFor="change-view"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Change View
            </label>
            <select
              id="change-view"
              value={viewType}
              onChange={(e) => {
                const newViewType = e.target.value as typeof viewType;
                setViewType(newViewType);
                if (newViewType === "Monthly") {
                  setShowMonthList(true);
                } else {
                  setShowMonthList(false);
                  setSelectedMonth("");
                }
                if (newViewType !== "Custom Date") {
                  setCustomStartDate("");
                  setCustomEndDate("");
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Daily">Daily</option>
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Custom Date">Custom Date</option>
            </select>
          </div>
          {viewType === "Monthly" && showMonthList && (
            <div>
              <label
                htmlFor="month-select"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Select Month
              </label>
              <select
                id="month-select"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Current Month</option>
                {getAvailableMonths().map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {viewType === "Custom Date" && (
            <>
              <div>
                <label
                  htmlFor="custom-start-date"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Start Date
                </label>
                <input
                  id="custom-start-date"
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="custom-end-date"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  End Date
                </label>
                <input
                  id="custom-end-date"
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}
          {viewType === "Daily" && (
            <div>
            <label
              htmlFor="date-filter"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Date Filter
            </label>
            <input
              id="date-filter"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          )}
          <div>
            <label
              htmlFor="status-filter"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Status Filter
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Filter vouchers by status"
            >
              <option value="">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="draft">Draft</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            {hasPermission("export") && (
              <button
                onClick={handleExport}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md transition-colors flex items-center"
                title="Export vouchers to Excel"
              >
                <Download size={16} className="mr-1" />
                Export
              </button>
            )}
            {hasPermission("print") && (
              <button
                onClick={handlePrint}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md transition-colors flex items-center"
                title="Print voucher register"
              >
                <Printer size={16} className="mr-1" />
                Print
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Vouchers Table - Tally Style */}
      <div className="bg-white rounded-lg shadow border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {showActions && (
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={
                        filteredVouchers.length > 0 &&
                        selectedVoucherIds.size === filteredVouchers.length
                      }
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Voucher No
                </th>

                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Particulars
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mode
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Debit Amount
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Credit Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                {showActions && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedVouchers.map((voucher) => {
                const status = getVoucherStatus(voucher);
                const { debit, credit } = calculateDebitCredit(voucher);
                const particulars = getParticulars(voucher);
                return (
                  <tr
                    key={voucher.id}
                    className={`${
                      selectedVoucherIds.has(voucher.id) ? "bg-blue-50" : ""
                    } hover:bg-gray-50`}
                  >
                    {showActions && (
                      <td className="px-4 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedVoucherIds.has(voucher.id)}
                          onChange={() => toggleSelect(voucher.id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(voucher.date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {voucher.number}
                    </td>

                    <td
                      className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate"
                      title={particulars}
                    >
                      {particulars}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {formatMode(voucher.mode)}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {debit > 0 ? formatCurrency(debit) : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {credit > 0 ? formatCurrency(credit) : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                          status
                        )}`}
                      >
                        {status}
                      </span>
                    </td>
                    {showActions && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">

                          {hasPermission("edit") && (
                            <button
                              onClick={() => editHandler(voucher.id)}
                              className="text-indigo-600 hover:text-indigo-900"
                              title="Edit voucher"
                            >
                              <Edit size={18} />
                            </button>
                          )}
                          {hasPermission("delete") && (
                            <button
                              onClick={() => deleteHandler(voucher.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Delete voucher"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {/* Summary Row */}
            <tfoot className="bg-gray-50 font-bold">
              <tr>
                <td colSpan={showActions ? 5 : 4} className="px-6 py-4 text-right text-sm text-gray-900">
                  Total ({filteredVouchers.length} vouchers)
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                  {formatCurrency(totalDebit)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                  {formatCurrency(totalCredit)}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() =>
                  setCurrentPage(Math.min(totalPages, currentPage + 1))
                }
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{startIndex + 1}</span>{" "}
                  to{" "}
                  <span className="font-medium">
                    {Math.min(
                      startIndex + itemsPerPage,
                      filteredVouchers.length
                    )}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium">{filteredVouchers.length}</span>{" "}
                  results
                </p>
              </div>
              <div>
                <nav
                  className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                  aria-label="Pagination"
                >
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const page = i + 1;
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${page === currentPage
                            ? "z-10 bg-blue-50 border-blue-500 text-blue-600"
                            : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                          }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    onClick={() =>
                      setCurrentPage(Math.min(totalPages, currentPage + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {filteredVouchers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            No payment vouchers found matching your criteria.
          </p>
          <p className="text-gray-400 text-sm mt-2">
            Try adjusting your filters or change the view type.
          </p>
        </div>
      )}
    </div>
  );
};

export default DebitNoteRegiser;
function setError(_arg0: string) {
  throw new Error("Function not implemented.");
}
