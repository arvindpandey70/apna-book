import React, { useState, useEffect } from "react";
import { useAppContext } from "../../context/AppContext";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Printer,
  Download,
  Filter,
  Calendar,
  Eye,
  Edit,
} from "lucide-react";
import { useFinancialYear, filterByFinancialYear } from "../../hooks/useFinancialYear";

interface DayBookEntry {
  id: string;
  date: string;
  voucherType: string;
  voucherNo: string;
  particulars: string;
  ledgerName: string;
  debit: number;
  credit: number;
  voucherId: string;
  narration?: string;


  itemId?: string;
  quantity?: number;
  rate?: number;
  hsnCode?: string;


  isParty?: boolean;
  isChild?: boolean;
  amount?: number;
}


interface VoucherGroup {
  voucherId: string;
  voucherNo: string;
  voucherType: string;
  date: string;
  totalDebit: number;
  totalCredit: number;
  entries: DayBookEntry[];
  narration?: string;
  entriesCount: number;
  supplier_invoice_date: Date;
}

const DayBook: React.FC = () => {
  const { theme, stockItems } = useAppContext();
  const navigate = useNavigate();
  const { selectedFinYear } = useFinancialYear();

  const getItemName = (itemId: string | undefined) => {
    if (!itemId) return "";
    return stockItems.find((item) => item.id === itemId)?.name || "";
  };

  const getItemHSN = (itemId: string | undefined) => {
    if (!itemId) return "";
    return stockItems.find((item) => item.id === itemId)?.hsnCode || "";
  };
  const [totals, setTotals] = useState({
    totalDebit: 0,
    totalCredit: 0,
    netDifference: 0,
    vouchersCount: 0,
  });

  const [, setDaybookTotals] = useState({
    totalDebit: 0,
    totalCredit: 0,
    netDifference: 0,
    vouchersCount: 0,
    supplier_invoice_date: 0,
  });
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedDateRange, setSelectedDateRange] = useState("Daily");
  const [selectedMonth, setSelectedMonth] = useState("Select Month");
  const [selectedVoucherType, setSelectedVoucherType] = useState("");
  const [viewMode, setViewMode] = useState<"detailed" | "grouped" | "monthly">("grouped");
  const [selectedVoucher, setSelectedVoucher] = useState<VoucherGroup | null>(
    null
  );
  const [hoveredVoucherId, setHoveredVoucherId] = useState<string | null>(null);
  const [activeVoucherId, setActiveVoucherId] = useState<string | null>(null);

  const [groupedVouchers, setGroupedVouchers] = useState<VoucherGroup[]>([]);
  const [processedEntries, setProcessedEntries] = useState<DayBookEntry[]>([]);
  const [allGroupedVouchers, setAllGroupedVouchers] = useState<VoucherGroup[]>(
    []
  );
  const [allProcessedEntries, setAllProcessedEntries] = useState<
    DayBookEntry[]
  >([]);

  //  const [entries, setEntries] = useState([]);
  //  const [entries, setEntries] = useState<DayBookEntry[]>([]);

  const allowEntryByVoucherType = (
    voucherType: string,
    entryType: "debit" | "credit"
  ) => {
    if (voucherType === "payment") return entryType === "debit";
    if (voucherType === "receipt") return entryType === "credit";
    if (voucherType === "contra") return entryType === "debit";
    if (voucherType === "journal") return entryType === "debit";
    return true; // sales, purchase etc
  };

  const [rawVoucherEntries, setRawVoucherEntries] = useState<
    Record<string, DayBookEntry[]>
  >({});

  useEffect(() => {
    const company_id = localStorage.getItem("company_id");
    const owner_type = localStorage.getItem("supplier");
    const userType = localStorage.getItem("userType");

    let fetchOwnerType = owner_type;
    let fetchOwnerId = owner_type === "employee"
      ? localStorage.getItem("employee_id")
      : localStorage.getItem("user_id");

    if (userType === "ca_employee") {
      fetchOwnerType = "employee";
      fetchOwnerId = localStorage.getItem("employee_id");
    }

    if (!company_id || !fetchOwnerType || !fetchOwnerId) return;

    fetch(
      `${import.meta.env.VITE_API_URL
      }/api/daybookTable2?company_id=${company_id}&owner_type=${fetchOwnerType}&owner_id=${fetchOwnerId}`
    )
      .then((res) => res.json())
      .then((rawData) => {
        const data = filterByFinancialYear(rawData, "date", selectedFinYear);
        const grouped: Record<string, VoucherGroup> = {};
        console.log("this is data", data);
        // 🔹 RAW entries for Detailed view
        const allDetailedEntriesRaw: DayBookEntry[] = [];

        // 🔹 RAW entries voucher-wise (for modal)
        const voucherWiseRawEntries: Record<string, DayBookEntry[]> = {};

        data.forEach((voucher: any) => {
          const id = voucher.id;

          if (!grouped[id]) {
            grouped[id] = {
              voucherId: id,
              voucherNo: voucher.voucher_number,
              voucherType: voucher.voucher_type,
              date: voucher.date,
              totalDebit: 0,
              totalCredit: 0,
              entries: [],
              narration: voucher.narration,
              entriesCount: 0,
              supplier_invoice_date: voucher.supplier_invoice_date,
            };
          }

          voucher.entries.forEach((entry: any) => {
            const amount = parseFloat(entry.amount || 0);
            const isDebit = entry.entry_type === "debit";
            const isCredit = entry.entry_type === "credit";

            /* ==========================
             🔹 RAW DATA (NO FILTER)
          ========================== */

            const rawEntry: DayBookEntry = {
              id: entry.id,
              date: voucher.date,
              voucherType: voucher.voucher_type,
              voucherNo: voucher.voucher_number,
              particulars: voucher.reference_no || "—",

              // ✅ GST / SUBTOTAL NAME FIX
              ledgerName:
                entry.ledger_name ||
                entry.ledgerName ||
                entry.narration ||
                "",

              debit: isDebit ? amount : 0,
              credit: isCredit ? amount : 0,

              voucherId: id,
              narration: entry.entry_narration || entry.narration,
              itemId: entry.item_id,

              isParty: !!entry.isParty,
              isChild: !!entry.isChild,
              amount: amount,
            };

            allDetailedEntriesRaw.push(rawEntry);

            if (!voucherWiseRawEntries[id]) {
              voucherWiseRawEntries[id] = [];
            }
            voucherWiseRawEntries[id].push(rawEntry);

            /* ==========================
             🔹 GROUPED DATA (FILTERED)
          ========================== */

            if (
              isDebit &&
              allowEntryByVoucherType(voucher.voucher_type, "debit")
            ) {
              grouped[id].totalDebit += amount;
            }

            if (
              isCredit &&
              allowEntryByVoucherType(voucher.voucher_type, "credit")
            ) {
              grouped[id].totalCredit += amount;
            }

            grouped[id].entries.push({
              ...rawEntry,
              debit:
                isDebit &&
                  allowEntryByVoucherType(voucher.voucher_type, "debit")
                  ? amount
                  : 0,
              credit:
                isCredit &&
                  allowEntryByVoucherType(voucher.voucher_type, "credit")
                  ? amount
                  : 0,
            });

            if (
              allowEntryByVoucherType(voucher.voucher_type, entry.entry_type)
            ) {
              grouped[id].entriesCount++;
            }
          });
        });

        /* ==========================
         🔹 GROUPED STATE
      ========================== */
        const groupedArray = Object.values(grouped).sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          if (dateA !== dateB) return dateA - dateB;
          return a.voucherNo.localeCompare(b.voucherNo);
        });
        setGroupedVouchers(groupedArray);
        setAllGroupedVouchers(groupedArray);

        /* ==========================
         🔹 DETAILED VIEW (ROWSPAN)
      ========================== */
        const entryGroups: DayBookEntry[][] = [];
        const groupMap = new Map<string, number>();

        // Sort RAW entries by date ascending before grouping
        allDetailedEntriesRaw.sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          if (dateA !== dateB) return dateA - dateB;
          return a.voucherNo.localeCompare(b.voucherNo);
        });

        allDetailedEntriesRaw.forEach((entry) => {
          const key = `${entry.date}|${entry.voucherType}|${entry.voucherNo}|${entry.particulars}`;
          if (!groupMap.has(key)) {
            groupMap.set(key, entryGroups.length);
            entryGroups.push([]);
          }
          entryGroups[groupMap.get(key)!].push(entry);
        });

        const processedWithRowspan: (DayBookEntry & {
          rowspan?: number;
          isFirstInGroup?: boolean;
        })[] = [];

        entryGroups.forEach((group) => {
          // Group entries within this voucher by ledgerName
          const aggregated: DayBookEntry[] = [];
          group.forEach((entry) => {
            const existing = aggregated.find(
              (e) => e.ledgerName === entry.ledgerName
            );
            if (existing) {
              existing.debit += entry.debit;
              existing.credit += entry.credit;
              existing.isChild = existing.isChild || entry.isChild;
            } else {
              aggregated.push({ ...entry });
            }
          });

          aggregated.forEach((entry, index) => {
            processedWithRowspan.push({
              ...entry,
              rowspan: index === 0 ? aggregated.length : 0,
              isFirstInGroup: index === 0,
            });
          });
        });

        setProcessedEntries(processedWithRowspan);
        setAllProcessedEntries(processedWithRowspan);

        /* ==========================
         🔹 MODAL RAW DATA
      ========================== */
        setRawVoucherEntries(voucherWiseRawEntries);

        /* ==========================
         🔹 TOTALS
      ========================== */
        const totalDebit = groupedArray.reduce(
          (sum, v) => sum + getGroupedAmounts(v).debit,
          0
        );
        const totalCredit = groupedArray.reduce(
          (sum, v) => sum + getGroupedAmounts(v).credit,
          0
        );

        setTotals({
          totalDebit,
          totalCredit,
          vouchersCount: groupedArray.length,
          netDifference: totalDebit - totalCredit,
        });
      })
      .catch((err) => console.error("DayBook Error:", err));
  }, [selectedFinYear]);

  const getLocalDate = (dateStr: string) => {
    const d = new Date(dateStr);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`; // yyyy-mm-dd
  };

  useEffect(() => {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    let filteredGrouped = [...allGroupedVouchers];
    let filteredEntries = [...allProcessedEntries];

    // 1. Filter by Voucher Type
    if (selectedVoucherType) {
      filteredGrouped = filteredGrouped.filter(
        (v) => v.voucherType.toLowerCase() === selectedVoucherType.toLowerCase()
      );
      filteredEntries = filteredEntries.filter(
        (e) => e.voucherType.toLowerCase() === selectedVoucherType.toLowerCase()
      );
    }

    // 2. Filter by Date Range or Specific Month
    const referenceDate = selectedDate ? new Date(selectedDate) : new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (selectedMonth !== "Select Month") {
      const year = referenceDate.getFullYear();
      let monthIndex = -1;

      if (selectedMonth === "Current") {
        monthIndex = new Date().getMonth();
      } else {
        monthIndex = months.indexOf(selectedMonth);
      }

      if (monthIndex !== -1) {
        startDate = new Date(year, monthIndex, 1);
        endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
      }
    } else {
      switch (selectedDateRange) {
        case "Daily":
          if (selectedDate) {
            startDate = new Date(selectedDate);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(selectedDate);
            endDate.setHours(23, 59, 59, 999);
          } else {
            // If no date selected for Daily, maybe show all or just today
            // For now, let's keep it as is (show all if no date)
          }
          break;
        case "Weekly":
          // Start of week (Sunday)
          startDate = new Date(referenceDate);
          startDate.setDate(referenceDate.getDate() - referenceDate.getDay());
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
          break;
        case "Fortnightly":
          // 14 days starting from reference date
          startDate = new Date(referenceDate);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 13);
          endDate.setHours(23, 59, 59, 999);
          break;
        case "Monthly":
          startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
          endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999);
          break;
        case "Quarterly":
          const quarter = Math.floor(referenceDate.getMonth() / 3);
          startDate = new Date(referenceDate.getFullYear(), quarter * 3, 1);
          endDate = new Date(referenceDate.getFullYear(), (quarter + 1) * 3, 0, 23, 59, 59, 999);
          break;
        case "Half-Yearly":
          const half = referenceDate.getMonth() < 6 ? 0 : 6;
          startDate = new Date(referenceDate.getFullYear(), half, 1);
          endDate = new Date(referenceDate.getFullYear(), half + 6, 0, 23, 59, 59, 999);
          break;
        default:
          break;
      }
    }

    if (startDate && endDate) {
      const startTime = startDate.getTime();
      const endTime = endDate.getTime();

      filteredGrouped = filteredGrouped.filter((v) => {
        const d = new Date(v.date).getTime();
        return d >= startTime && d <= endTime;
      });

      filteredEntries = filteredEntries.filter((e) => {
        const d = new Date(e.date).getTime();
        return d >= startTime && d <= endTime;
      });
    } else if (selectedDate && selectedDateRange === "Daily") {
       // Handled above, but if somehow fell through
       filteredGrouped = filteredGrouped.filter(
        (voucher) => getLocalDate(voucher.date) === selectedDate
      );
      filteredEntries = filteredEntries.filter(
        (entry) => getLocalDate(entry.date) === selectedDate
      );
    }

    setGroupedVouchers(filteredGrouped);
    setProcessedEntries(filteredEntries);

    const totalDebit = filteredGrouped.reduce(
      (sum, v) => sum + getGroupedAmounts(v).debit,
      0
    );

    const totalCredit = filteredGrouped.reduce(
      (sum, v) => sum + getGroupedAmounts(v).credit,
      0
    );

    setTotals({
      totalDebit,
      totalCredit,
      netDifference: totalDebit - totalCredit,
      vouchersCount: filteredGrouped.length,
    });
  }, [selectedDate, selectedDateRange, selectedMonth, selectedVoucherType, allGroupedVouchers, allProcessedEntries]);

  const getGroupedAmounts = (voucher: VoucherGroup) => {
    const type = voucher.voucherType.toLowerCase();

    // 🟡 PURCHASE → ONLY CREDIT (NO ADDING)
    if (type.includes("purchase")) {
      return {
        debit: 0,
        credit: voucher.totalCredit, // ✅ ONLY CREDIT
      };
    }

    // 🟢 SALES → ONLY DEBIT
    if (type.includes("sales")) {
      return {
        debit: voucher.totalDebit,
        credit: 0,
      };
    }

    // 🔵 DEBIT NOTE
    if (type.includes("debit")) {
      return {
        debit: voucher.totalDebit,
        credit: 0,
      };
    }

    // 🟣 CREDIT NOTE
    if (type.includes("credit")) {
      return {
        debit: 0,
        credit: voucher.totalCredit,
      };
    }

    // ⚪ DEFAULT
    return {
      debit: voucher.totalDebit,
      credit: voucher.totalCredit,
    };
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const handleVoucherClick = (voucher: VoucherGroup) => {
    setSelectedVoucher(voucher);
  };

  const handleDateRangeChange = (range: string) => {
    setSelectedDateRange(range);
    setSelectedMonth("Select Month");
  };

  return (
    <div className="pt-[56px] px-4 ">
      <div className="flex items-center mb-6">
        <button
          type="button"
          title="Back to Reports"
          onClick={() => navigate("/app/reports")}
          className={`mr-4 p-2 rounded-full ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
            }`}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">Day Book</h1>
        <div className="ml-auto flex space-x-2">
          <button
            title="Toggle Filters"
            type="button"
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
              }`}
          >
            <Filter size={18} />
          </button>
          <button
            title="Print Report"
            className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
              }`}
          >
            <Printer size={18} />
          </button>
          <button
            title="Download Report"
            type="button"
            className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
              }`}
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {showFilterPanel && (
        <div
          className={`p-4 mb-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
            }`}
        >
          <h3 className="font-semibold mb-4">Filters & Options</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Date Range
              </label>
              <select
                title="Select Date Range"
                value={selectedDateRange}
                onChange={(e) => handleDateRangeChange(e.target.value)}
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600"
                  : "bg-white border-gray-300"
                  }`}
              >
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Fortnightly">Fortnightly</option>
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
                <option value="Half-Yearly">Half-Yearly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Select Month
              </label>
              <select
                title="Select Month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600"
                  : "bg-white border-gray-300"
                  }`}
              >
                <option value="Select Month">Select Month</option>
                <option value="Current">Current</option>
                <option value="January">January</option>
                <option value="February">February</option>
                <option value="March">March</option>
                <option value="April">April</option>
                <option value="May">May</option>
                <option value="June">June</option>
                <option value="July">July</option>
                <option value="August">August</option>
                <option value="September">September</option>
                <option value="October">October</option>
                <option value="November">November</option>
                <option value="December">December</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Voucher Type
              </label>
              <select
                title="Select Voucher Type"
                value={selectedVoucherType}
                onChange={(e) => setSelectedVoucherType(e.target.value)}
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600"
                  : "bg-white border-gray-300"
                  }`}
              >
                <option value="">All Types</option>
                <option value="payment">Payment</option>
                <option value="receipt">Receipt</option>
                <option value="journal">Journal</option>
                <option value="sales">Sales</option>
                <option value="purchase">Purchase</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                View Mode
              </label>
              <select
                title="Select View Mode"
                value={viewMode}
                onChange={(e) =>
                  setViewMode(e.target.value as "detailed" | "grouped" | "monthly")
                }
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600"
                  : "bg-white border-gray-300"
                  }`}
              >
                <option value="grouped">Grouped by Voucher</option>
                <option value="detailed">Detailed Entries</option>
                <option value="monthly">Month Wise</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
             <label className="block text-sm font-medium mb-1">
                Select Date
              </label>
              <input
                type="date"
                title="Select Date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className={`w-full md:w-1/4 p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600"
                  : "bg-white border-gray-300"
                  }`}
              />
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div
          className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
            }`}
        >
          <div className="text-sm text-gray-500">Total Debit</div>
          <div className="text-xl font-bold text-blue-600">
            {formatCurrency(totals.totalDebit)}
          </div>
        </div>
        <div
          className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
            }`}
        >
          <div className="text-sm text-gray-500">Total Credit</div>
          <div className="text-xl font-bold text-purple-600">
            {formatCurrency(totals.totalCredit)}
          </div>
        </div>
        <div
          className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
            }`}
        >
          <div className="text-sm text-gray-500">Net Difference</div>
          <div
            className={`text-xl font-bold ${totals.totalDebit - totals.totalCredit >= 0
              ? "text-green-600"
              : "text-red-600"
              }`}
          >
            {formatCurrency(Math.abs(totals.totalDebit - totals.totalCredit))}
          </div>
        </div>
        <div
          className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
            }`}
        >
          <div className="text-sm text-gray-500">Vouchers</div>
          <div className="text-xl font-bold text-gray-600">
            {totals.vouchersCount}
            {/* {viewMode === 'grouped' ? groupedVouchers.length : processedEntries.length} */}
          </div>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="flex space-x-1 mb-4">
        {["grouped", "detailed", "monthly"].map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode as "detailed" | "grouped" | "monthly")}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium ${viewMode === mode
              ? theme === "dark"
                ? "bg-gray-800 text-white"
                : "bg-white text-blue-600 shadow"
              : theme === "dark"
                ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
          >
            {mode === "grouped" ? "Grouped by Voucher" : mode === "detailed" ? "Detailed Entries" : "Month Wise"}
          </button>
        ))}
      </div>

      <div
        className={`p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
          }`}
      >
        <div className="mb-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">Day Book</h2>
            <p className="text-sm opacity-75">
              {selectedMonth !== "Select Month"
                ? `For ${selectedMonth === "Current" ? "Current Month" : selectedMonth}`
                : selectedDateRange === "Daily" && selectedDate
                  ? `For ${formatDate(selectedDate)}`
                  : `For ${selectedDateRange}`}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Calendar size={16} className="text-gray-500" />

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedDateRange("Daily");
                setSelectedMonth("Select Month");
              }}
              className={`text-sm px-2 py-1 rounded border outline-none ${theme === "dark"
                ? "bg-gray-700 border-gray-600 text-white"
                : "bg-white border-gray-300 text-gray-700"
                }`}
            />

            {(selectedDate || selectedMonth !== "Select Month") && (
              <button
                onClick={() => {
                  setSelectedDate("");
                  setSelectedDateRange("Daily");
                  setSelectedMonth("Select Month");
                }}
                className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          {viewMode === "grouped" ? (
            <table className="w-full">
              <thead>
                <tr
                  className={`${theme === "dark"
                    ? "border-b border-gray-700"
                    : "border-b-2 border-gray-300"
                    }`}
                >
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Particulars</th>
                  <th className="px-4 py-3 text-left">Voucher Type</th>
                  <th className="px-4 py-3 text-left">Voucher No.</th>
                  <th className="px-4 py-3 text-left">Entries</th>
                  <th className="px-4 py-3 text-right">Total Debit</th>
                  <th className="px-4 py-3 text-right">Total Credit</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {!Array.isArray(groupedVouchers) ||
                  groupedVouchers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center opacity-70"
                    >
                      No vouchers found for the selected criteria
                    </td>
                  </tr>
                ) : (
                  groupedVouchers.map((voucher) => (
                    <tr
                      key={voucher.voucherId}
                      onMouseEnter={() => setHoveredVoucherId(voucher.voucherId)}
                      onMouseLeave={() => setHoveredVoucherId(null)}
                      onDoubleClick={() => setActiveVoucherId(activeVoucherId === voucher.voucherId ? null : voucher.voucherId)}
                      className={`transition-all duration-150 cursor-pointer ${theme === "dark"
                        ? `border-b border-gray-700 ${hoveredVoucherId === voucher.voucherId || activeVoucherId === voucher.voucherId ? "bg-blue-600 text-white font-bold" : "hover:bg-blue-600 hover:text-white"}`
                        : `border-b border-gray-200 ${hoveredVoucherId === voucher.voucherId || activeVoucherId === voucher.voucherId ? "bg-blue-600 text-white font-bold" : "hover:bg-blue-600 hover:text-white font-bold"}`
                        }`}
                      onClick={() => handleVoucherClick(voucher)}
                    >
                      <td className="px-4 py-3">
                        {voucher.date ? formatDate(String(voucher.date)) : "—"}
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {(() => {
                            const amt = getGroupedAmounts(voucher);
                            // Find the entry that corresponds to the displayed side
                            const primaryEntry = voucher.entries.find(e => 
                              (amt.debit > 0 && e.debit > 0) || (amt.credit > 0 && e.credit > 0)
                            ) || voucher.entries[0];
                            
                            return primaryEntry?.itemId 
                              ? getItemName(primaryEntry.itemId)
                              : primaryEntry?.ledgerName || "—";
                          })()}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${voucher.voucherType === "sales"
                            ? "bg-green-100 text-green-800"
                            : voucher.voucherType === "purchase"
                              ? "bg-blue-100 text-blue-800"
                              : voucher.voucherType === "receipt"
                                ? "bg-purple-100 text-purple-800"
                                : voucher.voucherType === "payment"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-800"
                            }`}
                        >
                          {voucher.voucherType.charAt(0).toUpperCase() +
                            voucher.voucherType.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {voucher.voucherNo}
                      </td>
                      <td className="px-4 py-3">
                        {voucher.entriesCount} entries
                      </td>
                      {(() => {
                        const amt = getGroupedAmounts(voucher);
                        return (
                          <>
                            <td className="px-4 py-3 text-right font-mono">
                              {amt.debit > 0 ? formatCurrency(amt.debit) : "-"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {amt.credit > 0
                                ? formatCurrency(amt.credit)
                                : "-"}
                            </td>
                          </>
                        );
                      })()}

                      <td className="px-4 py-3 flex items-center justify-center space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVoucherClick(voucher);
                          }}
                          className={`p-1 rounded ${theme === "dark"
                            ? "hover:bg-gray-600"
                            : "hover:bg-gray-200"
                            }`}
                          title="View Details"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // voucherType might have spaces or cases depending on data, but usually lower case works if matched in routes
                            // we remove spaces and convert to lowercase just in case
                            const vType = voucher.voucherType.toLowerCase().replace(/\s+/g, '');
                            const rawId = voucher.voucherId.includes('-') ? voucher.voucherId.split('-').pop() : voucher.voucherId;
                            navigate(`/app/vouchers/${vType}/edit/${rawId}?returnUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`);
                          }}
                          className={`p-1 rounded text-blue-600 ${theme === "dark"
                            ? "hover:bg-gray-600 text-blue-400"
                            : "hover:bg-gray-200"
                            }`}
                          title="Edit Voucher"
                        >
                          <Edit size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {groupedVouchers?.length > 0 && (
                <tfoot>
                  <tr
                    className={`${theme === "dark"
                      ? "border-t-2 border-gray-600 bg-gray-700"
                      : "border-t-2 border-gray-400 bg-gray-50"
                      }`}
                  >
                    <td colSpan={5} className="px-4 py-3 font-bold text-center">
                      Total:
                    </td>
                    <td className="px-4 py-3 text-right font-bold font-mono">
                      {formatCurrency(totals.totalDebit)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold font-mono">
                      {formatCurrency(totals.totalCredit)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          ) : viewMode === "detailed" ? (
            <table className="w-full">
              <thead>
                <tr
                  className={`${theme === "dark"
                    ? "border-b border-gray-700"
                    : "border-b-2 border-gray-300"
                    }`}
                >
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Particulars</th>
                  <th className="px-4 py-3 text-left">Voucher Type</th>
                  <th className="px-4 py-3 text-left">Voucher No.</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {processedEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center opacity-70"
                    >
                      No entries found
                    </td>
                  </tr>
                ) : (
                  processedEntries.map((entry, index) => {
                    const entryWithRowspan = entry as DayBookEntry & {
                      rowspan?: number;
                      isFirstInGroup?: boolean;
                    };

                    const showCommon = entryWithRowspan.isFirstInGroup;
                    const rowspan =
                      entryWithRowspan.rowspan && entryWithRowspan.rowspan > 1
                        ? entryWithRowspan.rowspan
                        : undefined;

                    return (
                      <tr
                        key={`${entry.id}-${index}`}
                        onMouseEnter={() => setHoveredVoucherId(entry.voucherId)}
                        onMouseLeave={() => setHoveredVoucherId(null)}
                        onDoubleClick={() => setActiveVoucherId(activeVoucherId === entry.voucherId ? null : entry.voucherId)}
                        className={`transition-all duration-150 ${theme === "dark"
                          ? `border-b border-gray-700 ${hoveredVoucherId === entry.voucherId || activeVoucherId === entry.voucherId ? "bg-blue-600 text-white font-bold" : "hover:bg-blue-600 hover:text-white"}`
                          : `border-b border-gray-200 ${hoveredVoucherId === entry.voucherId || activeVoucherId === entry.voucherId ? "bg-blue-600 text-white font-bold" : "hover:bg-blue-600 hover:text-white font-bold"}`
                          }`}
                      >
                        {/* DATE */}
                        {showCommon && (
                          <td rowSpan={rowspan} className="px-4 py-3 align-top">
                            {formatDate(entry.date)}
                          </td>
                        )}

                        {/* PARTICULARS (LEDGER / ITEM NAME) */}
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium">
                            {entry.ledgerName}
                          </div>

                          {entry.narration && (
                            <div className="text-xs text-gray-400 mt-1">
                              {entry.narration}
                            </div>
                          )}
                        </td>

                        {/* VOUCHER TYPE */}
                        {showCommon && (
                          <td
                            rowSpan={rowspan}
                            className="px-4 py-3 capitalize align-top"
                          >
                            {entry.voucherType}
                          </td>
                        )}

                        {/* VOUCHER NO */}
                        {showCommon && (
                          <td rowSpan={rowspan} className="px-4 py-3 font-mono align-top">
                            {entry.voucherNo}
                          </td>
                        )}

                        {/* DEBIT */}
                        <td className="px-4 py-3 text-right font-mono align-top">
                          {entry.debit > 0 ? formatCurrency(entry.debit) : "-"}
                        </td>

                        {/* CREDIT */}
                        <td className="px-4 py-3 text-right font-mono align-top">
                          {entry.credit > 0
                            ? formatCurrency(entry.credit)
                            : "-"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {processedEntries.length > 0 && (
                <tfoot>
                  <tr
                    className={`font-bold ${theme === "dark"
                      ? "border-t-2 border-gray-600 bg-gray-700"
                      : "border-t-2 border-gray-400 bg-gray-50"
                      }`}
                  >
                    <td colSpan={4} className="px-4 py-3">
                      Total:
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatCurrency(
                        processedEntries.reduce((sum, e) => sum + e.debit, 0)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatCurrency(
                        processedEntries.reduce((sum, e) => sum + e.credit, 0)
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          ) : viewMode === "monthly" ? (
            <table className="w-full">
              <thead>
                <tr
                  className={`${theme === "dark"
                    ? "border-b border-gray-700"
                    : "border-b-2 border-gray-300"
                    }`}
                >
                  <th className="px-4 py-3 text-left">Month</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                  <th className="px-4 py-3 text-right">Closing Balance</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const monthsOrder = [
                    "April", "May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March"
                  ];
                
                  let entries = [...allProcessedEntries];
                  if (selectedVoucherType) {
                    entries = entries.filter((e) => e.voucherType.toLowerCase() === selectedVoucherType.toLowerCase());
                  }
                
                  const monthlyTotals: Record<string, { debit: number; credit: number }> = {};
                  monthsOrder.forEach(m => monthlyTotals[m] = { debit: 0, credit: 0 });
                
                  entries.forEach(entry => {
                    const d = new Date(entry.date);
                    const monthName = d.toLocaleString('en-US', { month: 'long' });
                    if (monthlyTotals[monthName]) {
                      monthlyTotals[monthName].debit += entry.debit || 0;
                      monthlyTotals[monthName].credit += entry.credit || 0;
                    }
                  });
                
                  let runningBalance = 0;
                  let totalDebit = 0;
                  let totalCredit = 0;
                  
                  const monthlyData = monthsOrder.map(month => {
                    const debit = monthlyTotals[month].debit;
                    const credit = monthlyTotals[month].credit;
                    totalDebit += debit;
                    totalCredit += credit;
                    runningBalance += (debit - credit);
                    return {
                      month,
                      debit,
                      credit,
                      closingBalance: Math.abs(runningBalance),
                      closingBalanceType: runningBalance >= 0 ? 'Dr' : 'Cr'
                    };
                  });

                  return (
                    <>
                      {monthlyData.map((data, index) => (
                        <tr
                          key={data.month}
                          onClick={() => {
                            setSelectedMonth(data.month);
                            setViewMode("grouped");
                          }}
                          className={`cursor-pointer transition-all duration-150 ${theme === "dark"
                            ? "border-b border-gray-700 hover:bg-blue-600 hover:text-white"
                            : "border-b border-gray-200 hover:bg-blue-600 hover:text-white font-bold"
                            }`}
                        >
                          <td className="px-4 py-3 font-medium">{data.month}</td>
                          <td className="px-4 py-3 text-right font-mono">
                            {data.debit > 0 ? formatCurrency(data.debit) : ""}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {data.credit > 0 ? formatCurrency(data.credit) : ""}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {data.closingBalance > 0 ? `${formatCurrency(data.closingBalance)} ${data.closingBalanceType}` : ""}
                          </td>
                        </tr>
                      ))}
                      <tr
                        className={`font-bold ${theme === "dark"
                          ? "border-t-2 border-gray-600 bg-gray-700"
                          : "border-t-2 border-gray-400 bg-gray-50"
                          }`}
                      >
                        <td className="px-4 py-3">Grand Total</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {totalDebit > 0 ? formatCurrency(totalDebit) : ""}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {totalCredit > 0 ? formatCurrency(totalCredit) : ""}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {Math.abs(totalDebit - totalCredit) > 0 ? `${formatCurrency(Math.abs(totalDebit - totalCredit))} ${totalDebit - totalCredit >= 0 ? 'Dr' : 'Cr'}` : ""}
                        </td>
                      </tr>
                    </>
                  );
                })()}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>

      {/* Voucher Detail Modal */}
      {selectedVoucher && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4 backdrop-blur-sm bg-black/50">
          <div
            className={`w-full max-w-4xl max-h-[90vh] rounded-lg overflow-hidden flex flex-col ${theme === "dark" ? "bg-gray-800" : "bg-white"
              }`}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  Voucher Details - {selectedVoucher.voucherNo}
                </h3>

                <button
                  onClick={() => setSelectedVoucher(null)}
                  className={`p-2 rounded-full ${theme === "dark"
                    ? "hover:bg-gray-700"
                    : "hover:bg-gray-100"
                    }`}
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Voucher No
                  </label>
                  <div className="font-mono">
                    {selectedVoucher.voucherNo}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Voucher Type
                  </label>
                  <div className="capitalize">
                    {selectedVoucher.voucherType}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Date
                  </label>
                  <div>{formatDate(selectedVoucher.date)}</div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Entries
                  </label>
                  <div>
                    {selectedVoucher.entries?.length || 0} entries
                  </div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Voucher Entries
                </label>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead
                      className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-100"
                        }`}
                    >
                      <tr>
                        <th className="px-3 py-2 text-left">
                          Item / Ledger
                        </th>
                        <th className="px-3 py-2 text-right">
                          Voucher No.
                        </th>
                        <th className="px-3 py-2 text-right">
                          Voucher Type
                        </th>
                        <th className="px-3 py-2 text-right">
                          Debit
                        </th>
                        <th className="px-3 py-2 text-right">
                          Credit
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {(() => {
                        const entries =
                          rawVoucherEntries[selectedVoucher.voucherId] ??
                          [];

                        const partyEntry = entries.find(
                          (e) => e.isParty
                        );

                        const otherEntries = entries.filter(
                          (e) => !e.isParty
                        );

                        return (
                          <>
                            {/* PARTY ROW */}
                            {partyEntry && (
                              <tr className="border-t border-gray-200 dark:border-gray-600">
                                <td className="px-3 py-2">
                                  {partyEntry.ledgerName}
                                </td>

                                <td className="px-3 py-2 text-right font-mono">
                                  {selectedVoucher.voucherNo}
                                </td>

                                <td className="px-3 py-2 text-right capitalize">
                                  {selectedVoucher.voucherType}
                                </td>

                                <td className="px-3 py-2 text-right font-mono">
                                  {partyEntry.debit > 0
                                    ? formatCurrency(partyEntry.debit)
                                    : "-"}
                                </td>

                                <td className="px-3 py-2 text-right font-mono">
                                  {partyEntry.credit > 0
                                    ? formatCurrency(partyEntry.credit)
                                    : "-"}
                                </td>
                              </tr>
                            )}

                            {/* SUBTOTAL + GST ROWS */}
                            {(() => {
                              const groupedOtherEntries: DayBookEntry[] = [];
                              otherEntries.forEach(entry => {
                                const existing = groupedOtherEntries.find(e => e.ledgerName === entry.ledgerName);
                                if (existing) {
                                  existing.debit += entry.debit;
                                  existing.credit += entry.credit;
                                  existing.isChild = existing.isChild || entry.isChild;
                                } else {
                                  groupedOtherEntries.push({ ...entry });
                                }
                              });

                              // ✅ Sort entries: purchase/subtotal first → GST → discount last
                              groupedOtherEntries.sort((a, b) => {
                                const getSortPriority = (e: DayBookEntry) => {
                                  const name = (e.ledgerName || "").toLowerCase();
                                  if (name.includes("discount") || name.includes("rebate")) return 3; // bottom
                                  if (name.includes("cgst") || name.includes("sgst") || name.includes("igst") || name.includes("gst")) return 2; // middle
                                  return 1; // top
                                };
                                return getSortPriority(a) - getSortPriority(b);
                              });

                              return groupedOtherEntries.map((entry, index) => (
                                <tr
                                  key={index}
                                  className="border-t border-gray-200 dark:border-gray-600"
                                >
                                  {/* Particulars */}
                                  <td
                                    className={`px-3 py-2 ${entry.isChild
                                      ? "pl-10 text-gray-600"
                                      : ""
                                      }`}
                                  >
                                    {entry.ledgerName}
                                  </td>

                                  <td></td>
                                  <td></td>

                                  {/* Debit */}
                                  <td
                                    className={`px-3 py-2 text-right font-mono ${entry.isChild
                                      ? "text-sm text-gray-600"
                                      : ""
                                      }`}
                                  >
                                    {entry.debit > 0
                                      ? formatCurrency(entry.debit)
                                      : "-"}
                                  </td>

                                  {/* Credit */}
                                  <td
                                    className={`px-3 py-2 text-right font-mono ${entry.isChild
                                      ? "text-sm text-gray-600"
                                      : ""
                                      }`}
                                  >
                                    {entry.credit > 0
                                      ? formatCurrency(entry.credit)
                                      : "-"}
                                  </td>
                                </tr>
                              ));
                            })()}
                          </>
                        );
                      })()}
                      {/* Grand Total Row */}
                      {selectedVoucher.entries && rawVoucherEntries[selectedVoucher.voucherId] && (
                        <tr className={`border-t-2 font-bold ${theme === "dark" ? "border-gray-500 bg-gray-700/50" : "border-gray-300 bg-gray-50"}`}>
                          <td className="px-3 py-3" colSpan={3}>
                            Grand Total
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-blue-600 dark:text-blue-400">
                            {formatCurrency(
                              (rawVoucherEntries[selectedVoucher.voucherId] || []).reduce((sum, e) => sum + (e.debit > 0 ? e.debit : 0), 0)
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-purple-600 dark:text-purple-400">
                            {formatCurrency(
                              (rawVoucherEntries[selectedVoucher.voucherId] || []).reduce((sum, e) => sum + (e.credit > 0 ? e.credit : 0), 0)
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Narration */}
              {selectedVoucher.narration && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">
                    Narration
                  </label>

                  <div className="text-gray-600 dark:text-gray-400">
                    {selectedVoucher.narration}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setSelectedVoucher(null)}
                  className={`px-4 py-2 rounded ${theme === "dark"
                    ? "bg-gray-700 hover:bg-gray-600"
                    : "bg-gray-100 hover:bg-gray-200"
                    }`}
                >
                  Close
                </button>

              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={`mt-6 p-4 rounded ${theme === "dark" ? "bg-gray-800" : "bg-blue-50"
          }`}
      >
        <p className="text-sm">
          <span className="font-semibold">Pro Tip:</span> Press F5 to refresh,
          F12 to configure display options.
        </p>
      </div>
    </div>
  );
};

export default DayBook;
