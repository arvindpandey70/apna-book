import React, { useEffect, useState, useMemo, useRef } from "react";
import { useAppContext } from "../../context/AppContext";
import { useNavigate } from "react-router-dom";
import { formatSingleQuantity, formatAggregatedQuantities } from "../../utils/formatQuantity";
import {
  ArrowLeft,
  Printer,
  Download,
  Filter,
  Eye,
  FileText,
  BarChart3,
  TrendingUp,
  DollarSign,
  Package,
  User,
  Grid3X3,
  ListFilter,
} from "lucide-react";
import * as XLSX from "xlsx";
import Swal from "sweetalert2";

interface SalesData {
  id: string;
  voucherNo: string;
  voucherType: string;
  date: string;
  partyName: string;
  partyGSTIN?: string;
  billAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  totalTaxAmount: number;
  netAmount: number;
  itemDetails: {
    itemName: string;
    hsnCode: string;
    quantity: number;
    rate: number;
    amount: number;
    discount?: number;
  }[];
  paymentTerms?: string;
  dueDate?: string;
  status: "Paid" | "Unpaid" | "Partially Paid" | "Overdue";
  reference?: string;
  narration?: string;
  items?: {
    id: number;
    voucherId: number;
    salesLedgerId: number;
    salesLedgerName: string;
    salesLedgerGroupId: number;
    salesLedgerGroupName: string;
    cgstLedgerName?: string;
    sgstLedgerName?: string;
    igstLedgerName?: string;
    tdsLedgerName?: string;
    itemName?: string;
    quantity?: number;
    rate?: number;
    amount?: number;
  }[];
  groupName?: string;
  groupId?: number;
}

interface FilterState {
  dateRange: string;
  fromDate: string;
  toDate: string;
  partyFilter: string;
  itemFilter: string;
  voucherTypeFilter: string;
  statusFilter: string;
  amountRangeMin: string;
  amountRangeMax: string;
}

const SalesReport: React.FC = () => {
  const { theme, units } = useAppContext();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);

  const companyId = localStorage.getItem("company_id") || "";
  const ownerType = localStorage.getItem("supplier") || "";
  const ownerId =
    localStorage.getItem(
      ownerType === "employee" ? "employee_id" : "user_id"
    ) || "";

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedView, setSelectedView] = useState<
    | "summary"
    | "detailed"
    | "extract"
    | "columnar"
    | "itemwise"
    | "partywise"
    | "billwise"
    | "billwiseprofit"
  >("summary");
  const [filters, setFilters] = useState<FilterState>({
    dateRange: "this-year",
    fromDate: new Date(new Date().getFullYear(), 0, 1)
      .toISOString()
      .split("T")[0],
    toDate: new Date().toISOString().split("T")[0],
    partyFilter: "",
    itemFilter: "",
    voucherTypeFilter: "",
    statusFilter: "",
    amountRangeMin: "",
    amountRangeMax: "",
  });

  const [sortConfig, setSortConfig] = useState<{
    key: keyof SalesData;
    direction: "asc" | "desc";
  }>({ key: "date", direction: "desc" });

  const handleSort = (key: keyof SalesData) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  //sales repost month wise
  const [salesVouchers, setSalesVouchers] = useState<any[]>([]);
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

  const monthIndexToName: Record<number, string> = {
    0: "January",
    1: "February",
    2: "March",
    3: "April",
    4: "May",
    5: "June",
    6: "July",
    7: "August",
    8: "September",
    9: "October",
    10: "November",
    11: "December",
  };

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedParty, setSelectedParty] = useState<string | null>(null);
  const [columnarDrillDown, setColumnarDrillDown] = useState<string | null>(null); // New state for drill-down

  const filteredVouchers = useMemo(() => {
    let data = [...salesVouchers];

    // Filter by Selected Month
    if (selectedMonth) {
      data = data.filter((item) => {
        if (!item.date) return false;
        const d = new Date(item.date);
        const monthName = monthIndexToName[d.getMonth()];
        return monthName === selectedMonth;
      });
    } else {
      // Filter by Date Range (From/To) if no specific month is selected
      if (filters.fromDate) {
        data = data.filter((item) => item.date >= filters.fromDate);
      }
      if (filters.toDate) {
        data = data.filter((item) => item.date <= filters.toDate);
      }
    }

    // Filter by Selected Party (Drill-down)
    if (selectedParty) {
      data = data.filter((item) => (item.partyName || "Unknown Party") === selectedParty);
    }

    // Sort
    if (sortConfig.key) {
      data.sort((a, b) => {
        const aValue = a[sortConfig.key] ?? "";
        const bValue = b[sortConfig.key] ?? "";
        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    } else {
      // Default Sort By date
      data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    return data;
  }, [salesVouchers, selectedMonth, selectedParty, sortConfig, filters.fromDate, filters.toDate]);

  const groupedExtractData = useMemo(() => {
    const groups: Record<
      string,
      {
        totalDebit: number;
        totalCredit: number;
        transactions: {
          name: string;
          debit: number;
          credit: number;
        }[];
      }
    > = {};

    filteredVouchers.forEach((voucher) => {
      let voucherDebit = 0;
      let voucherCredit = 0;

      // 1️⃣ PARTY SIDE (Debit / Asset - Sundry Debtors)
      const groupName = voucher.groupName || "Sundry Debtors";
      const partyAmount = Number(voucher.netAmount || voucher.total || 0);
      voucherDebit += partyAmount;

      if (!groups[groupName]) {
        groups[groupName] = {
          totalDebit: 0,
          totalCredit: 0,
          transactions: [],
        };
      }

      groups[groupName].totalDebit += partyAmount;

      const existingParty = groups[groupName].transactions.find(
        (t) => t.name.toLowerCase() === (voucher.partyName || "Unknown Party").toLowerCase()
      );

      if (existingParty) {
        existingParty.debit += partyAmount;
      } else {
        groups[groupName].transactions.push({
          name: voucher.partyName || "Unknown Party",
          debit: partyAmount,
          credit: 0,
        });
      }

      // 2️⃣ SALES & TAXES SIDE (Credit / Income) via Items
      const seenTaxInItems = { cgst: false, sgst: false, igst: false };

      if (voucher.items && voucher.items.length > 0) {
        voucher.items.forEach((item: any) => {
          if (item.salesLedgerName === voucher.partyName) return;
          const lName = (item.salesLedgerName || "").toLowerCase();
          const gName = (item.salesLedgerGroupName || "").toLowerCase();

          // Determine the correct group for this item
          let itemGroupName = item.salesLedgerGroupName || "Sales Account";

          const isTax = gName.includes("duties") || gName.includes("tax") || 
            item.salesLedgerGroupId === -103 ||
            ((gName === "" || gName.includes("sales account")) && (lName.includes("cgst") || lName.includes("sgst") || lName.includes("igst") || lName.includes("utgst")) && !lName.includes("sales"));

          if (isTax) {
            itemGroupName = "Duties & Taxes";
            if (lName.includes("cgst")) seenTaxInItems.cgst = true;
            if (lName.includes("sgst") || lName.includes("utgst")) seenTaxInItems.sgst = true;
            if (lName.includes("igst")) seenTaxInItems.igst = true;
          }

          if (!groups[itemGroupName]) {
            groups[itemGroupName] = {
              totalDebit: 0,
              totalCredit: 0,
              transactions: [],
            };
          }

          const itemAmount = Number(item.amount || 0);
          const isDebit = item.type === "debit";

          if (isDebit) {
            groups[itemGroupName].totalDebit += itemAmount;
            voucherDebit += itemAmount;
          } else {
            groups[itemGroupName].totalCredit += itemAmount;
            voucherCredit += itemAmount;
          }

          const ledgerName = item.salesLedgerName || "Unknown Sales Ledger";
          const existingItem = groups[itemGroupName].transactions.find(
            (t) => t.name.toLowerCase() === ledgerName.toLowerCase()
          );

          if (existingItem) {
            if (isDebit) {
              existingItem.debit += itemAmount;
            } else {
              existingItem.credit += itemAmount;
            }
          } else {
            groups[itemGroupName].transactions.push({
              name: ledgerName,
              debit: isDebit ? itemAmount : 0,
              credit: isDebit ? 0 : itemAmount,
            });
          }
        });
      }

      // 3️⃣ ADDITIONAL TAXES (Only if not already in items)
      const taxGroupName = "Duties & Taxes";

      const cgst = seenTaxInItems.cgst ? 0 : Number(voucher.cgstAmount || 0);
      const sgst = seenTaxInItems.sgst ? 0 : Number(voucher.sgstAmount || 0);
      const igst = seenTaxInItems.igst ? 0 : Number(voucher.igstAmount || 0);

      if (cgst > 0 || sgst > 0 || igst > 0) {
        if (!groups[taxGroupName]) {
          groups[taxGroupName] = {
            totalDebit: 0,
            totalCredit: 0,
            transactions: [],
          };
        }

        const addTaxTransaction = (
          amount: number,
          defaultName: string
        ) => {
          if (amount > 0) {
            groups[taxGroupName].totalCredit += amount;
            voucherCredit += amount;

            const existingTax = groups[taxGroupName].transactions.find(
              (t) => t.name.toLowerCase() === defaultName.toLowerCase()
            );

            if (existingTax) {
              existingTax.credit += amount;
            } else {
              groups[taxGroupName].transactions.push({
                name: defaultName,
                debit: 0,
                credit: amount,
              });
            }
          }
        };

        let cgstName = "Output CGST";
        let sgstName = "Output SGST";
        let igstName = "Output IGST";

        if (voucher.items && voucher.items.length > 0) {
          const cItem = voucher.items.find((i: any) => i.cgstLedgerName && i.cgstLedgerName !== voucher.partyName);
          if (cItem) cgstName = cItem.cgstLedgerName;

          const sItem = voucher.items.find((i: any) => i.sgstLedgerName && i.sgstLedgerName !== voucher.partyName);
          if (sItem) sgstName = sItem.sgstLedgerName;

          const iItem = voucher.items.find((i: any) => i.igstLedgerName && i.igstLedgerName !== voucher.partyName);
          if (iItem) igstName = iItem.igstLedgerName;
        }

        addTaxTransaction(cgst, cgstName);
        addTaxTransaction(sgst, sgstName);
        addTaxTransaction(igst, igstName);
      }

      // 4️⃣ INDIRECT EXPENSES (Debit / Expense - Discount Allowed)
      const expGroupName = "Indirect Expenses";
      let totalVoucherDiscountSeen = 0;

      // Check item level discounts
      if (voucher.items && voucher.items.length > 0) {
        voucher.items.forEach((item: any) => {
          const discountAmt = Number(item.discount || 0);
          if (discountAmt > 0) {
            totalVoucherDiscountSeen += discountAmt;
            voucherDebit += discountAmt;
            const ledgerName = item.discountLedgerName || "Discount to Customer 1%";

            if (!groups[expGroupName]) {
              groups[expGroupName] = { totalDebit: 0, totalCredit: 0, transactions: [] };
            }
            groups[expGroupName].totalDebit += discountAmt;

            const existingExp = groups[expGroupName].transactions.find(
              (t) => t.name.toLowerCase() === ledgerName.toLowerCase()
            );
            if (existingExp) {
              existingExp.debit += discountAmt;
            } else {
              groups[expGroupName].transactions.push({ name: ledgerName, debit: discountAmt, credit: 0 });
            }
          }
        });
      }

      // Check voucher level overall discount
      const globalDiscount = Number(voucher.overallDiscount || voucher.discountTotal || 0);
      if (globalDiscount > 0) {
        voucherDebit += globalDiscount;
        const ledgerName = voucher.overallDiscountLedgerName || "Discount to Customer 1%";

        if (!groups[expGroupName]) {
          groups[expGroupName] = { totalDebit: 0, totalCredit: 0, transactions: [] };
        }
        groups[expGroupName].totalDebit += globalDiscount;

        const existingExp = groups[expGroupName].transactions.find(
          (t) => t.name.toLowerCase() === ledgerName.toLowerCase()
        );
        if (existingExp) {
          existingExp.debit += globalDiscount;
        } else {
          groups[expGroupName].transactions.push({ name: ledgerName, debit: globalDiscount, credit: 0 });
        }
      }

      // 5️⃣ AUTO-BALANCING ROUNDING CHECK (per voucher)
      const diff = voucherCredit - voucherDebit;
      if (Math.abs(diff) > 0.01) {
        const roundGroupName = "Indirect Expenses";
        const roundLedgerName = "Rounding Off";

        if (!groups[roundGroupName]) {
          groups[roundGroupName] = { totalDebit: 0, totalCredit: 0, transactions: [] };
        }

        if (diff > 0) {
          // More Credit than Debit -> Add to Debit
          groups[roundGroupName].totalDebit += diff;
          const existing = groups[roundGroupName].transactions.find(
            (t) => t.name.toLowerCase() === roundLedgerName.toLowerCase()
          );
          if (existing) {
            existing.debit += diff;
          } else {
            groups[roundGroupName].transactions.push({
              name: roundLedgerName,
              debit: diff,
              credit: 0,
            });
          }
        } else {
          // More Debit than Credit -> Add to Credit
          const absDiff = Math.abs(diff);
          groups[roundGroupName].totalCredit += absDiff;
          const existing = groups[roundGroupName].transactions.find(
            (t) => t.name.toLowerCase() === roundLedgerName.toLowerCase()
          );
          if (existing) {
            existing.credit += absDiff;
          } else {
            groups[roundGroupName].transactions.push({
              name: roundLedgerName,
              debit: 0,
              credit: absDiff,
            });
          }
        }
      }
    });

    return groups;
  }, [filteredVouchers]);

  // 🔹 COLUMNAR DATA PREPARATION
  const columnarData = useMemo(() => {
    // Helper to calculate rounding difference
    const getVoucherRoundingDiff = (v: any) => {
      let vDebit = Number(v.netAmount || v.total || 0);
      let vCredit = 0;

      if (v.items && v.items.length > 0) {
        v.items.forEach((item: any) => {
          if (item.salesLedgerName === v.partyName) return;
          const itemAmount = Number(item.amount || 0);
          const isDebit = item.type === "debit";
          if (isDebit) {
            vDebit += itemAmount;
          } else {
            vCredit += itemAmount;
          }
        });
      }

      const seenTax = { cgst: false, sgst: false, igst: false };
      if (v.items && v.items.length > 0) {
        v.items.forEach((item: any) => {
          const lName = (item.salesLedgerName || "").toLowerCase();
          const gName = (item.salesLedgerGroupName || "").toLowerCase();
          const isTax = gName.includes("duties") || gName.includes("tax") || item.salesLedgerGroupId === -103;
          if (isTax) {
            if (lName.includes("cgst")) seenTax.cgst = true;
            if (lName.includes("sgst") || lName.includes("utgst")) seenTax.sgst = true;
            if (lName.includes("igst")) seenTax.igst = true;
          }
        });
      }

      const cgst = seenTax.cgst ? 0 : Number(v.cgstAmount || 0);
      const sgst = seenTax.sgst ? 0 : Number(v.sgstAmount || 0);
      const igst = seenTax.igst ? 0 : Number(v.igstAmount || 0);
      vCredit += cgst + sgst + igst;

      if (v.items && v.items.length > 0) {
        v.items.forEach((item: any) => {
          const discountAmt = Number(item.discount || 0);
          if (discountAmt > 0) {
            vDebit += discountAmt;
          }
        });
      }

      const globalDiscount = Number(v.overallDiscount || v.discountTotal || 0);
      if (globalDiscount > 0) {
        vDebit += globalDiscount;
      }

      return vCredit - vDebit;
    };

    // Apply Drill-Down Filter if active
    let vouchersToProcess = filteredVouchers;
    if (columnarDrillDown) {
      vouchersToProcess = filteredVouchers.filter(v => {
        // Special check for Rounding Off
        if (columnarDrillDown.toLowerCase() === "rounding off") {
          return Math.abs(getVoucherRoundingDiff(v)) > 0.01;
        }

        // Check Party Name
        if ((v.partyName || "Unknown Party") === columnarDrillDown) return true;

        // Check Items for Ledgers (Sales, Tax, Discount)
        if (v.items) {
          const itemMatched = v.items.some((item: any) =>
            (item.salesLedgerName === columnarDrillDown) ||
            (item.cgstLedgerName === columnarDrillDown) ||
            (item.sgstLedgerName === columnarDrillDown) ||
            (item.igstLedgerName === columnarDrillDown) ||
            (item.discountLedgerName === columnarDrillDown) ||
            (Number(item.discount) > 0 && "Discount to Customer 1%" === columnarDrillDown && !item.discountLedgerName)
          );
          if (itemMatched) return true;
        }

        // Check global discount
        const globalDiscount = Number(v.overallDiscount || v.discountTotal || 0);
        const globalLedgerName = v.overallDiscountLedgerName || "Discount to Customer 1%";
        if (globalDiscount > 0 && globalLedgerName === columnarDrillDown) {
          return true;
        }
        return false;
      });
    }

    const salesColumns = new Set<string>();
    const taxColumns = new Set<string>();
    const tdsColumns = new Set<string>(); // If needed
    const discountColumns = new Set<string>();

    // 1. Collect all unique Ledger Names for Headers
    vouchersToProcess.forEach((voucher) => {
      if (voucher.items) {
        voucher.items.forEach((item: any) => {
          if (item.salesLedgerName) salesColumns.add(item.salesLedgerName);
          if (item.cgstLedgerName) taxColumns.add(item.cgstLedgerName);
          if (item.sgstLedgerName) taxColumns.add(item.sgstLedgerName);
          if (item.igstLedgerName) taxColumns.add(item.igstLedgerName);
          if (Number(item.discount) > 0) {
            discountColumns.add(item.discountLedgerName || "Discount to Customer 1%");
          }
        });
      }
      // Global discount column
      const gDiscount = Number(voucher.overallDiscount || voucher.discountTotal || 0);
      if (gDiscount > 0) {
        discountColumns.add(voucher.overallDiscountLedgerName || "Discount to Customer 1%");
      }
      // Rounding Off column
      if (Math.abs(getVoucherRoundingDiff(voucher)) > 0.01) {
        discountColumns.add("Rounding Off");
      }
    });

    const sortedSalesCols = Array.from(salesColumns).sort();
    const sortedTaxCols = Array.from(taxColumns).sort();
    const sortedDiscountCols = Array.from(discountColumns).sort();
    const allDynamicCols = [...sortedSalesCols, ...sortedTaxCols, ...sortedDiscountCols];

    // 2. Prepare Row Data
    const rows = vouchersToProcess.map((voucher) => {
      const row: any = {
        id: voucher.id,
        date: voucher.date,
        partyName: voucher.partyName,
        voucherNo: voucher.voucherNo,
        voucherType: "Sales",
        total: Number(voucher.netAmount || voucher.total || 0),
        quantity: 0,
        rate: 0,
        items: voucher.items,
        overallDiscount: Number(voucher.overallDiscount || 0),
      };

      // Sum Quantity and determine Rate
      let totalQty = 0;
      let consistentRate = -1;
      let isMixedRate = false;

      if (voucher.items) {
        voucher.items.forEach((i: any) => {
          const qty = Number(i.quantity || 0);
          const rate = Number(i.rate || 0);
          totalQty += qty;

          if (consistentRate === -1) {
            consistentRate = rate;
          } else if (consistentRate !== rate) {
            isMixedRate = true;
          }
        });
      }
      row.quantity = totalQty;
      row.rate = isMixedRate ? 0 : (consistentRate === -1 ? 0 : consistentRate);

      // Map Amounts to Columns
      let totalDiscSeen = 0;
      if (voucher.items) {
        voucher.items.forEach((item: any) => {
          // Sales Ledger Amount
          if (item.salesLedgerName) {
            row[item.salesLedgerName] =
              (row[item.salesLedgerName] || 0) + Number(item.amount || 0);
          }
        });

        // Taxes
        const vCgstLedgers = new Set<string>();
        const vSgstLedgers = new Set<string>();
        const vIgstLedgers = new Set<string>();

        voucher.items.forEach((item: any) => {
          if (item.cgstLedgerName) vCgstLedgers.add(item.cgstLedgerName);
          if (item.sgstLedgerName) vSgstLedgers.add(item.sgstLedgerName);
          if (item.igstLedgerName) vIgstLedgers.add(item.igstLedgerName);
        });

        // Distribute Voucher Tax Totals to the FIRST found ledger
        if (vCgstLedgers.size > 0) {
          const first = Array.from(vCgstLedgers)[0];
          row[first] = (row[first] || 0) + Number(voucher.cgstAmount || 0);
        }
        if (vSgstLedgers.size > 0) {
          const first = Array.from(vSgstLedgers)[0];
          row[first] = (row[first] || 0) + Number(voucher.sgstAmount || 0);
        }
        if (vIgstLedgers.size > 0) {
          const first = Array.from(vIgstLedgers)[0];
          row[first] = (row[first] || 0) + Number(voucher.igstAmount || 0);
        }

        // Discounts
        voucher.items.forEach((item: any) => {
          const disc = Number(item.discount || 0);
          if (disc > 0) {
            totalDiscSeen += disc;
            const dName = item.discountLedgerName || "Discount to Customer 1%";
            row[dName] = (row[dName] || 0) + disc;
          }
        });
      }

      const gDiscount = Number(voucher.overallDiscount || voucher.discountTotal || 0);
      if (gDiscount > 0) {
        const finalName = voucher.overallDiscountLedgerName || "Discount to Customer 1%";
        row[finalName] = (row[finalName] || 0) + gDiscount;
      }

      // Map Rounding Off amount to column
      const roundDiff = getVoucherRoundingDiff(voucher);
      if (Math.abs(roundDiff) > 0.01) {
        row["Rounding Off"] = roundDiff;
      }

      return row;
    });

    rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return { headers: allDynamicCols, rows };
  }, [filteredVouchers, columnarDrillDown]);

  const handleDateRangeChange = (range: string) => {
    const today = new Date();
    let fromDate = "";
    let toDate = today.toISOString().split("T")[0];

    switch (range) {
      case "today":
        fromDate = toDate;
        break;
      case "yesterday": {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        fromDate = toDate = yesterday.toISOString().split("T")[0];
        break;
      }
      case "this-week": {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        fromDate = weekStart.toISOString().split("T")[0];
        break;
      }
      case "this-month": {
        fromDate = new Date(today.getFullYear(), today.getMonth(), 1)
          .toISOString()
          .split("T")[0];
        break;
      }
      case "this-quarter": {
        const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
        fromDate = new Date(today.getFullYear(), quarterStartMonth, 1)
          .toISOString()
          .split("T")[0];
        break;
      }
      case "this-year": {
        fromDate = new Date(today.getFullYear(), 0, 1)
          .toISOString()
          .split("T")[0];
        break;
      }
      default:
        return;
    }

    setFilters((prev) => ({
      ...prev,
      dateRange: range,
      fromDate,
      toDate,
    }));
  };



  const monthDataMap = useMemo(() => {
    // 1️⃣ initialize all months with 0
    const map: Record<string, { credit: number; closingBalance: number }> = {};
    MONTHS.forEach((m) => {
      map[m] = { credit: 0, closingBalance: 0 };
    });

    // 2️⃣ aggregate API sales data

    salesVouchers.forEach((row) => {
      if (!row.date || !row.total) return;

      const d = new Date(row.date);
      const monthName = monthIndexToName[d.getMonth()];
      const amount = Number(row.total) || 0;

      if (map[monthName]) {
        map[monthName].credit += amount;
      }
    });

    // 3️⃣ calculate cumulative closing balance
    let runningTotal = 0;
    MONTHS.forEach((m) => {
      runningTotal += map[m].credit;
      map[m].closingBalance = runningTotal;
    });

    return map;
  }, [salesVouchers]);

  useEffect(() => {
    if (!companyId || !ownerType || !ownerId) return;

    let url = `${import.meta.env.VITE_API_URL}/api/sales-report?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;

    if (filters.fromDate && filters.toDate) {
      url += `&from_date=${filters.fromDate}&to_date=${filters.toDate}`;
    }

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        // safe handling
        if (Array.isArray(data)) {
          console.log("data", data);
          setSalesVouchers(data);
        } else if (Array.isArray(data?.data)) {
          setSalesVouchers(data.data);
        } else {
          setSalesVouchers([]);
        }
      })
      .catch((err) => {
        console.error("Sales voucher fetch error:", err);
        setSalesVouchers([]);
      });
  }, [companyId, ownerType, ownerId, filters.fromDate, filters.toDate]);

  // calculate total sales
  const totalSales = useMemo(() => {
    return salesVouchers.reduce((sum, row) => {
      return sum + (Number(row.total) || 0);
    }, 0);
  }, [salesVouchers]);

  // 🔹 PARTY WISE DATA PREPARATION
  const partyWiseData = useMemo(() => {
    const parties: Record<string, {
      partyName: string;
      gstin: string;
      totalAmount: number;
      totalTax: number;
      count: number;
    }> = {};

    salesVouchers.forEach(v => {
      const partyName = v.partyName || "Unknown Party";
      if (!parties[partyName]) {
        parties[partyName] = {
          partyName: partyName,
          gstin: v.partyGSTIN || "N/A",
          totalAmount: 0,
          totalTax: 0,
          count: 0
        };
      }
      parties[partyName].totalAmount += Number(v.netAmount || v.total || 0);
      parties[partyName].totalTax += Number(v.totalTaxAmount || 0);
      parties[partyName].count += 1;
    });

    return Object.values(parties).sort((a, b) => a.partyName.localeCompare(b.partyName));
  }, [salesVouchers]);

  return (
    <div
      className={`min-h-screen pt-[56px] ${theme === "dark" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"
        }`}
    >
      {/* Header */}
      <div
        className={`p-4 border-b ${theme === "dark"
          ? "border-gray-700 bg-gray-800"
          : "border-gray-200 bg-white"
          }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/app/reports")}
              className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
                }`}
              title="Go back to reports"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Sales Report</h1>
              <p className="text-sm opacity-70">
                Comprehensive sales analysis and reporting
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
                }`}
              title="Filters"
            >
              <Filter size={18} />
            </button>
            <button
              className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
                }`}
              title="Export to Excel"
            >
              <Download size={18} />
            </button>
            <button
              onClick={() => window.print()}
              className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
                }`}
              title="Print"
            >
              <Printer size={18} />
            </button>
          </div>
        </div>

        {/* View Selection Tabs */}
        <div className="flex space-x-1 mt-4">
          {[
            { key: "summary", label: "Summary", icon: <BarChart3 size={16} /> },
            {
              key: "detailed",
              label: "Detailed",
              icon: <FileText size={16} />,
            },
            {
              key: "extract",
              label: "Extract",
              icon: <ListFilter size={16} />,
            },
            {
              key: "columnar",
              label: "Columnar",
              icon: <ListFilter size={16} />,
            },
            {
              key: "billwise",
              label: "Bill-wise",
              icon: <Grid3X3 size={16} />,
            },
            {
              key: "billwiseprofit",
              label: "Bill Wise Profit",
              icon: <TrendingUp size={16} />,
            },
            {
              key: "itemwise",
              label: "Item-wise",
              icon: <Package size={16} />,
            },
            { key: "partywise", label: "Party-wise", icon: <User size={16} /> },
          ].map((view) => (
            <button
              key={view.key}
              onClick={() => {
                setSelectedView(
                  view.key as
                  | "summary"
                  | "detailed"
                  | "extract"
                  | "columnar"
                  | "itemwise"
                  | "partywise"
                  | "billwise"
                  | "billwiseprofit"
                );
                if (view.key !== "detailed") {
                  setSelectedMonth(null);
                  setSelectedParty(null);
                }
                // Clear drill-down filter when manually switching tabs
                setColumnarDrillDown(null);
              }}
              className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors ${selectedView === view.key
                ? theme === "dark"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-500 text-white"
                : theme === "dark"
                  ? "bg-gray-700 hover:bg-gray-600"
                  : "bg-gray-200 hover:bg-gray-300"
                }`}
            >
              {view.icon}
              <span>{view.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilterPanel && (
        <div
          className={`p-4 border-b ${theme === "dark"
            ? "border-gray-700 bg-gray-800"
            : "border-gray-200 bg-white"
            }`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Date Range
              </label>
              <select
                title="Select Date Range"
                value={filters.dateRange}
                onChange={(e) => handleDateRangeChange(e.target.value)}
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                  : "bg-white border-gray-300 focus:border-blue-500"
                  } outline-none`}
              >
                <option value="today">Today</option>
                <option value="this-quarter">This Quarter</option>
                <option value="this-year">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {/* From Date */}
            <div>
              <label className="block text-sm font-medium mb-1">
                From Date
              </label>
              <input
                type="date"
                title="Select From Date"
                value={filters.fromDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, fromDate: e.target.value }))
                }
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                  : "bg-white border-gray-300 focus:border-blue-500"
                  } outline-none`}
              />
            </div>

            {/* To Date */}
            <div>
              <label className="block text-sm font-medium mb-1">To Date</label>
              <input
                type="date"
                title="Select To Date"
                value={filters.toDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, toDate: e.target.value }))
                }
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                  : "bg-white border-gray-300 focus:border-blue-500"
                  } outline-none`}
              />
            </div>

            {/* Clear Filters */}
            <div className="flex items-end">
              <button
                onClick={() =>
                  setFilters({
                    dateRange: "this-year",
                    fromDate: new Date(
                      new Date().getFullYear(),
                      0,
                      1
                    )
                      .toISOString()
                      .split("T")[0],
                    toDate: new Date().toISOString().split("T")[0],
                    partyFilter: "",
                    itemFilter: "",
                    voucherTypeFilter: "",
                    statusFilter: "",
                    amountRangeMin: "",
                    amountRangeMax: "",
                  })
                }
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-600 hover:bg-gray-500 border-gray-600"
                  : "bg-gray-100 hover:bg-gray-200 border-gray-300"
                  } transition-colors`}
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="p-4" ref={printRef}>
        {/* Summary Statistics */}
        {selectedView === "summary" && (
          <div
            className={`rounded-lg overflow-hidden ${theme === "dark"
              ? "bg-gray-800 text-white"
              : "bg-white text-black"
              }`}
          >
            {/* 🔹 TOP BORDER */}
            <div className="border-t border-b border-gray-400">
              {/* Header */}
              <div className="grid grid-cols-4 px-4 py-2 font-semibold border-b border-gray-400">
                <div>Particulars</div>
                <div className="text-right">Debit</div>
                <div className="text-right">Credit</div>
                <div className="text-right">Closing</div>
              </div>

              {/* Month Rows */}
              {MONTHS.map((month) => {
                const row = monthDataMap[month] || {
                  credit: 0,
                  closingBalance: 0,
                };

                return (
                  <div
                    key={month}
                    onClick={() => {
                      setSelectedMonth(month);
                      setSelectedView("detailed");
                    }}
                    className="grid grid-cols-4 px-4 py-2 text-sm cursor-pointer hover:bg-gray-100"
                  >
                    <div className="font-medium">{month}</div>

                    {/* Debit blank */}
                    <div className="text-right opacity-40"></div>

                    {/* Credit */}
                    <div className="text-right font-mono">
                      {row.credit ? row.credit.toLocaleString("en-IN") : ""}
                    </div>

                    {/* Closing */}
                    <div className="text-right font-mono">
                      {row.closingBalance
                        ? row.closingBalance.toLocaleString("en-IN")
                        : ""}
                    </div>
                  </div>
                );
              })}

              {/* 🔹 BOTTOM BORDER + GRAND TOTAL */}
              <div className="border-t border-gray-400">
                <div className="grid grid-cols-4 px-4 py-3 font-bold">
                  <div>Grand Total</div>
                  <div className="text-right opacity-40">—</div>
                  <div className="text-right font-mono">
                    {totalSales.toLocaleString("en-IN")}
                  </div>
                  <div className="text-right font-mono">
                    {totalSales.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Data Table */}
        <div
          className={`rounded-lg overflow-hidden ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
            }`}
        >
          <div className="overflow-x-auto">
            {selectedView === "detailed" && (
              <>
                <div className="p-2 flex justify-between items-center bg-blue-50 dark:bg-blue-900/20 mb-2 rounded">
                  <div className="flex flex-wrap items-center gap-2 px-2">
                    <span className="font-medium mr-2">
                      Filtered by:
                    </span>
                    <select
                      value={selectedMonth || ""}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className={`cursor-pointer p-1 pr-8 rounded border outline-none ${theme === "dark"
                        ? "bg-gray-700 border-gray-600 text-white"
                        : "bg-white border-gray-300 text-black"
                        }`}
                    >
                      <option value="" disabled>
                        Select Month
                      </option>
                      {MONTHS.map((month) => (
                        <option key={month} value={month}>
                          {month}
                        </option>
                      ))}
                    </select>

                    {selectedParty && (
                      <div className={`px-2 py-1 rounded text-sm flex items-center ${theme === 'dark' ? 'bg-blue-900/60 text-blue-200' : 'bg-white text-blue-700 border border-blue-200'}`}>
                        <span className="font-medium">Party: {selectedParty}</span>
                        <button onClick={() => setSelectedParty(null)} className="ml-2 hover:text-red-500 font-bold">×</button>
                      </div>
                    )}
                  </div>
                  {(selectedMonth || selectedParty) && (
                    <button
                      onClick={() => {
                        setSelectedMonth(null);
                        setSelectedParty(null);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 px-3 py-1 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>

                <table className="w-full">
                  <thead
                    className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
                      }`}
                  >
                    <tr>
                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer"
                        onClick={() => handleSort("date")}
                      >
                        Date{" "}
                        {sortConfig.key === "date" &&
                          (sortConfig.direction === "asc" ? "↑" : "↓")}
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Particular
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Voucher Type
                      </th>

                      <th
                        className="px-4 py-3 text-left font-medium cursor-pointer"
                        onClick={() => handleSort("voucherNo")}
                      >
                        Voucher Number{" "}
                        {sortConfig.key === "voucherNo" &&
                          (sortConfig.direction === "asc" ? "↑" : "↓")}
                      </th>

                      <th className="px-4 py-3 text-right font-medium">
                        Debit
                      </th>

                      <th className="px-4 py-3 text-right font-medium">
                        Credit
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-200">
                    {filteredVouchers.length > 0 ? (
                      filteredVouchers.map((voucher, index) => (
                        <tr
                          key={voucher.id || index}
                          className={`hover:bg-opacity-50 ${theme === "dark"
                            ? "hover:bg-gray-700"
                            : "hover:bg-gray-50"
                            }`}
                        >
                          {/* Date */}
                          <td className="px-4 py-3 text-sm">
                            {new Date(voucher.date).toLocaleDateString("en-IN")}
                          </td>

                          {/* Particular */}
                          <td className="px-4 py-3 text-sm font-medium">
                            {voucher.partyName}
                          </td>

                          {/* Voucher Type */}
                          <td className="px-4 py-3 text-sm">Sales</td>

                          {/* Voucher Number */}
                          <td className="px-4 py-3 text-sm">
                            {voucher.voucherNo}
                          </td>

                          {/* Debit */}
                          <td className="px-4 py-3 text-sm text-right font-mono">
                            {voucher.netAmount?.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </td>

                          {/* Credit */}
                          <td className="px-4 py-3 text-sm text-right font-mono">
                            -
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center opacity-50"
                        >
                          No transactions found for the selected period.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {/* Footer Totals */}
                  <tfoot
                    className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-100"
                      }`}
                  >
                    <tr className="font-semibold">
                      <td colSpan={4} className="px-4 py-3">
                        Total
                      </td>

                      <td className="px-4 py-3 text-right font-mono">
                        {filteredVouchers
                          .reduce(
                            (sum, v) => sum + (Number(v.netAmount) || 0),
                            0
                          )
                          .toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                      </td>

                      <td className="px-4 py-3 text-right font-mono">
                        {/* Credit Total Empty */}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </>
            )}

            {/* Extract View */}
            {selectedView === "extract" && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead
                    className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
                      }`}
                  >
                    <tr>
                      <th className="px-4 py-3 text-left font-medium w-1/2">
                        Particulars
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Debit
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Credit
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-200">
                    {/* Render Grouped Data */}
                    {Object.entries(groupedExtractData).map(
                      ([groupName, group]) => (
                        <React.Fragment key={groupName}>
                          {/* 🔹 Group Header */}
                          <tr
                            className={`${theme === "dark" ? "bg-gray-800" : "bg-gray-50"
                              } font-bold`}
                          >
                            <td className="px-4 py-3 text-left text-blue-600">
                              {groupName}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {group.totalDebit > 0
                                ? group.totalDebit.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })
                                : "-"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono">
                              {group.totalCredit > 0
                                ? group.totalCredit.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })
                                : "-"}
                            </td>
                          </tr>

                          {/* 🔹 Transactions Under Group */}
                          {group.transactions.map((txn, index) => (
                            <tr
                              key={`${groupName}-${index}`}
                              className={`hover:bg-opacity-50 ${theme === "dark"
                                ? "hover:bg-gray-700"
                                : "hover:bg-gray-50"
                                }`}
                            >
                              <td
                                className="px-4 py-2 pl-8 text-sm italic cursor-pointer text-blue-600 hover:underline"
                                onClick={() => {
                                  setColumnarDrillDown(txn.name);
                                  setSelectedView("columnar");
                                }}
                              >
                                {txn.name}
                              </td>

                              <td className="px-4 py-2 text-right text-sm font-mono">
                                {txn.debit > 0
                                  ? txn.debit.toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                  })
                                  : "-"}
                              </td>

                              <td className="px-4 py-2 text-right text-sm font-mono">
                                {txn.credit > 0
                                  ? txn.credit.toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                  })
                                  : "-"}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      )
                    )}

                    {/* No Data */}
                    {Object.keys(groupedExtractData).length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-8 text-center opacity-50"
                        >
                          No transactions found.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {/* 🔹 Grand Total */}
                  <tfoot
                    className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-100"
                      }`}
                  >
                    <tr className="font-semibold">
                      <td className="px-4 py-3">Grand Total</td>

                      <td className="px-4 py-3 text-right font-mono">
                        {Object.values(groupedExtractData)
                          .reduce((sum, group) => sum + group.totalDebit, 0)
                          .toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                      </td>

                      <td className="px-4 py-3 text-right font-mono">
                        {Object.values(groupedExtractData)
                          .reduce((sum, group) => sum + group.totalCredit, 0)
                          .toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Columnar View */}
            {selectedView === "columnar" && (
              <div className="overflow-x-auto">
                {/* Drill-down Reset Header */}
                {columnarDrillDown && (
                  <div className="p-2 mb-2 bg-blue-50 dark:bg-blue-900/20 rounded flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Filtered by: <span className="font-bold">{columnarDrillDown}</span>
                    </span>
                    <button
                      onClick={() => setColumnarDrillDown(null)}
                      className="text-xs px-2 py-1 bg-white dark:bg-gray-800 border rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Clear Filter
                    </button>
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead
                    className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
                      }`}
                  >
                    <tr>
                      <th className="px-2 py-3 text-left font-medium min-w-[100px]">
                        Date
                      </th>
                      <th className="px-2 py-3 text-left font-medium min-w-[200px]">
                        Particulars
                      </th>
                      <th className="px-2 py-3 text-left font-medium">
                        Vch No.
                      </th>
                      <th className="px-2 py-3 text-right font-medium">
                        Quantity
                      </th>
                      <th className="px-2 py-3 text-right font-medium">Rate</th>
                      <th className="px-2 py-3 text-right font-medium">
                        Overall Discount
                      </th>
                      <th className="px-2 py-3 text-right font-medium">
                        Total
                      </th>
                      {columnarData.headers.map((col) => (
                        <th
                          key={col}
                          className="px-2 py-3 text-right font-medium whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {columnarData.rows.map((row, index) => (
                      <tr
                        key={row.id || index}
                        className={`hover:bg-opacity-50 ${theme === "dark"
                          ? "hover:bg-gray-700"
                          : "hover:bg-gray-50"
                          }`}
                      >
                        <td className="px-2 py-2">
                          {new Date(row.date).toLocaleDateString("en-IN")}
                        </td>
                        <td className="px-2 py-2 font-medium">
                          {row.partyName}
                        </td>
                        <td className="px-2 py-2">{row.voucherNo}</td>
                        <td className="px-2 py-2 text-right">{formatAggregatedQuantities(row.items, units)}</td>
                        <td className="px-2 py-2 text-right">
                          {row.rate > 0
                            ? row.rate.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })
                            : "-"}
                        </td>
                        <td className="px-2 py-2 text-right text-red-600 font-medium">
                          {row.overallDiscount > 0
                            ? row.overallDiscount.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })
                            : "-"}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold">
                          {row.total?.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        {/* Dynamic Columns */}
                        {columnarData.headers.map((col) => (
                          <td
                            key={col}
                            className="px-2 py-2 text-right text-xs"
                          >
                            {row[col]
                              ? Number(row[col]).toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                              })
                              : "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {columnarData.rows.length === 0 && (
                      <tr>
                        <td
                          colSpan={6 + columnarData.headers.length}
                          className="px-4 py-8 text-center opacity-50"
                        >
                          No transactions found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot
                    className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-100"
                      }`}
                  >
                    <tr className="font-semibold">
                      <td colSpan={3} className="px-2 py-3 text-right">
                        Total
                      </td>
                      <td className="px-2 py-3 text-right">
                        {columnarData.rows.reduce(
                          (sum, r) => sum + r.quantity,
                          0
                        )}
                      </td>
                      <td className="px-2 py-3 text-right">
                        {columnarData.rows
                          .reduce((sum, r) => sum + r.rate, 0)
                          .toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                      </td>
                      <td className="px-2 py-3 text-right text-red-600">
                        {columnarData.rows
                          .reduce((sum, r) => sum + r.overallDiscount, 0)
                          .toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                      </td>
                      <td className="px-2 py-3 text-right">
                        {columnarData.rows
                          .reduce((sum, r) => sum + r.total, 0)
                          .toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                      </td>
                      {columnarData.headers.map((col) => (
                        <td key={col} className="px-2 py-3 text-right">
                          {columnarData.rows
                            .reduce((sum, r) => sum + (r[col] || 0), 0)
                            .toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {selectedView === "partywise" && (
              <table className="w-full">
                <thead
                  className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
                    }`}
                >
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Party Name</th>
                    <th className="px-4 py-3 text-left font-medium">GSTIN</th>
                    <th className="px-4 py-3 text-center font-medium">Transactions</th>
                    <th className="px-4 py-3 text-right font-medium">Total Amount</th>
                  </tr>
                </thead>

                <tbody>
                  {partyWiseData.map((party, index) => (
                    <tr
                      key={index}
                      className={`hover:bg-opacity-50 ${theme === "dark"
                          ? "hover:bg-gray-700"
                          : "hover:bg-gray-50"
                        }`}
                    >
                      <td
                        className="px-4 py-3 text-sm font-medium text-blue-600 cursor-pointer hover:underline"
                        onClick={() => {
                          setColumnarDrillDown(party.partyName);
                          setSelectedView("columnar");
                        }}
                      >
                        {party.partyName}
                      </td>

                      <td className="px-4 py-3 text-sm">{party.gstin}</td>

                      <td className="px-4 py-3 text-sm text-center">
                        {party.count}
                      </td>

                      <td className="px-4 py-3 text-sm text-right font-mono">
                        {party.totalAmount.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}

                  {partyWiseData.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center opacity-50">
                        No party data found.
                      </td>
                    </tr>
                  )}
                </tbody>

                <tfoot
                  className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-100"
                    }`}
                >
                  <tr className="font-bold">
                    <td colSpan={2} className="px-4 py-3 text-right">
                      Grand Total
                    </td>

                    <td className="px-4 py-3 text-center">
                      {partyWiseData.reduce((sum, p) => sum + p.count, 0)}
                    </td>

                    <td className="px-4 py-3 text-right font-mono">
                      {partyWiseData
                        .reduce((sum, p) => sum + p.totalAmount, 0)
                        .toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}

            {selectedView === "itemwise" && (
              <table className="w-full">
                <thead
                  className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
                    }`}
                >
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">
                      Item Name
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      HSN Code
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Total Quantity
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Average Rate
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Total Amount
                    </th>
                    <th className="px-4 py-3 text-center font-medium">
                      Transactions
                    </th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            )}

            {/* Bill-wise Sales View */}
            {selectedView === "billwise" && (
              <div className="space-y-4">
                <div
                  className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-700" : "bg-blue-50"
                    }`}
                >
                  <h3 className="text-lg font-semibold mb-2 flex items-center">
                    <Grid3X3 size={20} className="mr-2" />
                    Bill-wise Sales Summary
                  </h3>
                  <p className="text-sm opacity-75">
                    Comprehensive view of all sales bills with individual bill
                    analysis
                  </p>
                </div>

                {/* Bill-wise Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div
                    className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-700" : "bg-white shadow"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium opacity-75">
                          Total Bills
                        </p>
                        <p className="text-2xl font-bold"></p>
                      </div>
                      <div
                        className={`p-3 rounded-full ${theme === "dark" ? "bg-gray-600" : "bg-blue-100"
                          }`}
                      >
                        <FileText size={24} className="text-blue-600" />
                      </div>
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-700" : "bg-white shadow"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium opacity-75">
                          Avg Bill Value
                        </p>
                        <p className="text-2xl font-bold"></p>
                      </div>
                      <div
                        className={`p-3 rounded-full ${theme === "dark" ? "bg-gray-600" : "bg-green-100"
                          }`}
                      >
                        <TrendingUp size={24} className="text-green-600" />
                      </div>
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-700" : "bg-white shadow"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium opacity-75">
                          Paid Bills
                        </p>
                        <p className="text-2xl font-bold text-green-600"></p>
                      </div>
                      <div
                        className={`p-3 rounded-full ${theme === "dark" ? "bg-gray-600" : "bg-green-100"
                          }`}
                      >
                        <DollarSign size={24} className="text-green-600" />
                      </div>
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-700" : "bg-white shadow"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium opacity-75">
                          Pending Bills
                        </p>
                        <p className="text-2xl font-bold text-red-600"></p>
                      </div>
                      <div
                        className={`p-3 rounded-full ${theme === "dark" ? "bg-gray-600" : "bg-red-100"
                          }`}
                      >
                        <FileText size={24} className="text-red-600" />
                      </div>
                    </div>
                  </div>
                </div>

                <table className="w-full">
                  <thead
                    className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
                      }`}
                  >
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">
                        Bill No.
                      </th>
                      <th className="px-4 py-3 text-left font-medium">Date</th>
                      <th className="px-4 py-3 text-left font-medium">
                        Party Name
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        Items
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Taxable Amount
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        GST Amount
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Net Amount
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        Status
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody></tbody>
                </table>
              </div>
            )}

            {/* Bill Wise Profit View */}
            {selectedView === "billwiseprofit" && (
              <div className="space-y-4">
                <div
                  className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-700" : "bg-blue-50"
                    }`}
                >
                  <h3 className="text-lg font-semibold mb-2 flex items-center">
                    <TrendingUp size={20} className="mr-2" />
                    Bill Wise Profit Analysis
                  </h3>
                  <p className="text-sm opacity-75">
                    Detailed profit analysis for each sales bill including cost
                    analysis and margin calculations
                  </p>
                </div>

                {/* Profit Analysis Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div
                    className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-700" : "bg-white shadow"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium opacity-75">
                          Total Sales
                        </p>
                        <p className="text-2xl font-bold"></p>
                      </div>
                      <div
                        className={`p-3 rounded-full ${theme === "dark" ? "bg-gray-600" : "bg-blue-100"
                          }`}
                      >
                        <DollarSign size={24} className="text-blue-600" />
                      </div>
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-700" : "bg-white shadow"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium opacity-75">
                          Total Cost
                        </p>
                        <p className="text-2xl font-bold text-red-600"></p>
                      </div>
                      <div
                        className={`p-3 rounded-full ${theme === "dark" ? "bg-gray-600" : "bg-red-100"
                          }`}
                      >
                        <Package size={24} className="text-red-600" />
                      </div>
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-700" : "bg-white shadow"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium opacity-75">
                          Gross Profit
                        </p>
                        <p className="text-2xl font-bold text-green-600"></p>
                      </div>
                      <div
                        className={`p-3 rounded-full ${theme === "dark" ? "bg-gray-600" : "bg-green-100"
                          }`}
                      >
                        <TrendingUp size={24} className="text-green-600" />
                      </div>
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-lg ${theme === "dark" ? "bg-gray-700" : "bg-white shadow"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium opacity-75">
                          Avg Profit %
                        </p>
                        <p className="text-2xl font-bold text-green-600"></p>
                      </div>
                      <div
                        className={`p-3 rounded-full ${theme === "dark" ? "bg-gray-600" : "bg-green-100"
                          }`}
                      >
                        <BarChart3 size={24} className="text-green-600" />
                      </div>
                    </div>
                  </div>
                </div>

                <table className="w-full">
                  <thead
                    className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
                      }`}
                  >
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">
                        Bill No.
                      </th>
                      <th className="px-4 py-3 text-left font-medium">Date</th>
                      <th className="px-4 py-3 text-left font-medium">
                        Party Name
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Sales Amount
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Cost Amount
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Gross Profit
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Profit %
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        Status
                      </th>
                      <th className="px-4 py-3 text-center font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Results Summary */}
        <div
          className={`mt-4 p-3 rounded ${theme === "dark" ? "bg-gray-800" : "bg-gray-100"
            }`}
        >
          <p className="text-sm text-center opacity-70">
            Showing sales transactions
            {filters.dateRange !== "custom" &&
              ` for ${filters.dateRange.replace("-", " ")}`}
          </p>
        </div>
      </div>
    </div>
  );
};

export default SalesReport;
