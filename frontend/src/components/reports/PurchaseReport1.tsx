import React, { useEffect, useState, useMemo, useRef } from "react";
import { useAppContext } from "../../context/AppContext";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Printer,
  Download,
  Filter,
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
import { formatAggregatedQuantities } from "../../utils/formatQuantity";
import { allSystemGroups as baseGroups } from "../../constants/ledgerGroups";

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
  tdsAmount?: number;
  cessAmount: number;
  totalTaxAmount: number;
  netAmount: number;
  items?: {
    id: number;
    voucherId: number;
    purchaseLedgerId: number;
    purchaseLedgerName: string;
    purchaseLedgerGroupId: number;
    purchaseLedgerGroupName: string;
    cgstLedgerName?: string;
    sgstLedgerName?: string;
    igstLedgerName?: string;
    tdsLedgerName?: string;
    itemName?: string;
    quantity?: number;
    rate?: number;
    amount?: number;
  }[];
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

//base group


const GROUP_NAMES: Record<number, string> = {
  [-16]: "Purchase Account",
  [-6]: "Current Liability",
  [-11]: "Indirect Income",
};

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

const getMonthDateRange = (monthName: string) => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;

  const monthMap: Record<string, { monthIndex: number; isNextYear: boolean }> = {
    April: { monthIndex: 3, isNextYear: false },
    May: { monthIndex: 4, isNextYear: false },
    June: { monthIndex: 5, isNextYear: false },
    July: { monthIndex: 6, isNextYear: false },
    August: { monthIndex: 7, isNextYear: false },
    September: { monthIndex: 8, isNextYear: false },
    October: { monthIndex: 9, isNextYear: false },
    November: { monthIndex: 10, isNextYear: false },
    December: { monthIndex: 11, isNextYear: false },
    January: { monthIndex: 0, isNextYear: true },
    February: { monthIndex: 1, isNextYear: true },
    March: { monthIndex: 2, isNextYear: true },
  };

  const info = monthMap[monthName];
  if (!info) return { fromDate: "", toDate: "" };

  const year = info.isNextYear ? fyStartYear + 1 : fyStartYear;
  const startMonthStr = String(info.monthIndex + 1).padStart(2, "0");
  const fromDate = `${year}-${startMonthStr}-01`;

  const lastDay = new Date(year, info.monthIndex + 1, 0).getDate();
  const lastDayStr = String(lastDay).padStart(2, "0");
  const toDate = `${year}-${startMonthStr}-${lastDayStr}`;

  return { fromDate, toDate };
};

const QUARTERS = [
  { key: "Q1", label: "Apr - Jun" },
  { key: "Q2", label: "Jul - Sep" },
  { key: "Q3", label: "Oct - Dec" },
  { key: "Q4", label: "Jan - Mar" },
];

const getCurrentQuarterKey = () => {
  const m = new Date().getMonth();
  if (m >= 3 && m <= 5) return "Q1";
  if (m >= 6 && m <= 8) return "Q2";
  if (m >= 9 && m <= 11) return "Q3";
  return "Q4";
};

const getQuarterDateRange = (quarterKey: string) => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;

  switch (quarterKey) {
    case "Q1":
      return {
        fromDate: `${fyStartYear}-04-01`,
        toDate: `${fyStartYear}-06-30`,
      };
    case "Q2":
      return {
        fromDate: `${fyStartYear}-07-01`,
        toDate: `${fyStartYear}-09-30`,
      };
    case "Q3":
      return {
        fromDate: `${fyStartYear}-10-01`,
        toDate: `${fyStartYear}-12-31`,
      };
    case "Q4":
      return {
        fromDate: `${fyStartYear + 1}-01-01`,
        toDate: `${fyStartYear + 1}-03-31`,
      };
    default:
      return { fromDate: "", toDate: "" };
  }
};

const PurchaseReport1: React.FC = () => {
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
  const initialMonthName = monthIndexToName[new Date().getMonth()] || "April";
  const initialDates = getMonthDateRange(initialMonthName);
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>(initialMonthName);
  const [selectedQuarterFilter, setSelectedQuarterFilter] = useState<string>(getCurrentQuarterKey());

  const [filters, setFilters] = useState<FilterState>({
    dateRange: "all",
    fromDate: "",
    toDate: "",
    partyFilter: "",
    itemFilter: "",
    voucherTypeFilter: "",
    statusFilter: "",
    amountRangeMin: "",
    amountRangeMax: "",
  });

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedParty, setSelectedParty] = useState<string | null>(null);
  const [columnarDrillDown, setColumnarDrillDown] = useState<string | null>(null); // New state for drill-down
  const [salesVouchers, setSalesVouchers] = useState<any[]>([]);
  const [ledgerReportData, setLedgerReportData] = useState<any>(null);

  const [sortConfig, setSortConfig] = useState<{
    key: keyof SalesData;
    direction: "asc" | "desc";
  }>({ key: "date", direction: "asc" });

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
  }, [salesVouchers, selectedMonth, selectedParty, sortConfig]);

  const detailedTotals = useMemo(() => {
    return filteredVouchers.reduce(
      (acc, row) => ({
        taxable: acc.taxable + (Number(row.taxableAmount) || 0),
        cgst: acc.cgst + (Number(row.cgstAmount) || 0),
        sgst: acc.sgst + (Number(row.sgstAmount) || 0),
        igst: acc.igst + (Number(row.igstAmount) || 0),
        net: acc.net + (Number(row.netAmount) || 0),
      }),
      { taxable: 0, cgst: 0, sgst: 0, igst: 0, net: 0 }
    );
  }, [filteredVouchers]);

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
      // 1️⃣ PARTY SIDE (Credit / Liability)
      const groupName = voucher.groupName || voucher.group_name || "Current Liabilities";
      const partyAmount = Number(voucher.netAmount || voucher.total || 0);

      if (!groups[groupName]) {
        groups[groupName] = {
          totalDebit: 0,
          totalCredit: 0,
          transactions: [],
        };
      }

      groups[groupName].totalCredit += partyAmount;

      const partyName = voucher.partyName || "Unknown Party";
      const existingParty = groups[groupName].transactions.find(t => t.name === partyName);

      if (existingParty) {
        existingParty.credit += partyAmount;
      } else {
        groups[groupName].transactions.push({
          name: partyName,
          debit: 0,
          credit: partyAmount,
        });
      }

      // 2️⃣ PURCHASE SIDE (Debit / Expense) via Items
      const seenTaxInItems = { cgst: false, sgst: false, igst: false };

      if (voucher.items && voucher.items.length > 0) {
        voucher.items.forEach((item) => {
          const lName = (item.purchaseLedgerName || "").toLowerCase();
          const gName = (item.purchaseLedgerGroupName || "").toLowerCase();
          
          let itemGroupName = item.purchaseLedgerGroupName || "Purchase Account";
          
          const isTax = gName.includes("duties") || gName.includes("tax") || 
                        lName.includes("cgst") || lName.includes("sgst") || lName.includes("igst") || lName.includes("utgst");
          
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
          groups[itemGroupName].totalDebit += itemAmount;

          const ledgerName = item.purchaseLedgerName || "Unknown Purchase Ledger";
          const existingItem = groups[itemGroupName].transactions.find(t => t.name === ledgerName);

          if (existingItem) {
            existingItem.debit += itemAmount;
          } else {
            groups[itemGroupName].transactions.push({
              name: ledgerName,
              debit: itemAmount,
              credit: 0,
            });
          }
        });
      }

      // 3️⃣ DUTIES & TAXES (Debit / Asset or Liability Redn)
      const taxGroupName = "Duties & Taxes";

      // Extract Unique Tax Ledger Names from Items
      const cgstLedgers = new Set<string>();
      const sgstLedgers = new Set<string>();
      const igstLedgers = new Set<string>();

      if (voucher.items) {
        voucher.items.forEach((i: any) => {
          let cgstName = i.cgstLedgerName;
          let sgstName = i.sgstLedgerName;
          let igstName = i.igstLedgerName;

          // 🔹 ENHANCEMENT: If gstRate is available but not in name, append it for better clarity
          if (i.gstRate && Number(i.gstRate) > 0) {
            const totalRate = Number(i.gstRate);
            const halfRate = totalRate / 2;

            if (cgstName && !cgstName.includes("%") && !cgstName.includes("@")) {
              cgstName = `${cgstName} ${halfRate}%`;
            }
            if (sgstName && !sgstName.includes("%") && !sgstName.includes("@")) {
              sgstName = `${sgstName} ${halfRate}%`;
            }
            if (igstName && !igstName.includes("%") && !igstName.includes("@")) {
              igstName = `${igstName} ${totalRate}%`;
            }
          }

          if (cgstName) cgstLedgers.add(cgstName);
          if (sgstName) sgstLedgers.add(sgstName);
          if (igstName) igstLedgers.add(igstName);
        });
      }

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

        const addTaxTransaction = (amount: number, ledgers: Set<string>, defaultName: string) => {
          if (amount <= 0) return;

          const name = Array.from(ledgers).sort().join(", ") || defaultName;
          groups[taxGroupName].totalDebit += amount;

          const existingTax = groups[taxGroupName].transactions.find(t => t.name === name);

          if (existingTax) {
            existingTax.debit += amount;
          } else {
            groups[taxGroupName].transactions.push({
              name,
              debit: amount,
              credit: 0,
            });
          }
        };

        let cgstName = "Input CGST";
        let sgstName = "Input SGST";
        let igstName = "Input IGST";

        if (voucher.items && voucher.items.length > 0) {
          const cItem = voucher.items.find((i: any) => i.cgstLedgerName);
          if (cItem) cgstName = cItem.cgstLedgerName;
          
          const sItem = voucher.items.find((i: any) => i.sgstLedgerName);
          if (sItem) sgstName = sItem.sgstLedgerName;
          
          const iItem = voucher.items.find((i: any) => i.igstLedgerName);
          if (iItem) igstName = iItem.igstLedgerName;
        }

        addTaxTransaction(cgst, cgstLedgers, cgstName);
        addTaxTransaction(sgst, sgstLedgers, sgstName);
        addTaxTransaction(igst, igstLedgers, igstName);
      }

      // 4️⃣ TDS (Credit / Liability)
      const tdsAmount = Number(voucher.tdsAmount || 0);
      if (tdsAmount > 0) {
        // Find distinct TDS ledger names from items
        const tdsLedgers = new Set<string>();
        if (voucher.items) {
          voucher.items.forEach(i => {
            if (i.tdsLedgerName) tdsLedgers.add(i.tdsLedgerName);
          });
        }

        const tdsGroupName = "TDS Payable"; // Or derive group if possible
        if (!groups[tdsGroupName]) {
          groups[tdsGroupName] = {
            totalDebit: 0,
            totalCredit: 0,
            transactions: [],
          };
        }

        const name = Array.from(tdsLedgers).sort().join(", ") || "TDS Ledger";
        groups[tdsGroupName].totalCredit += tdsAmount;

        const existingTds = groups[tdsGroupName].transactions.find(t => t.name === name);

        if (existingTds) {
          existingTds.credit += tdsAmount;
        } else {
          groups[tdsGroupName].transactions.push({
            name,
            debit: 0,
            credit: tdsAmount,
          });
        }
      }

      // 5️⃣ INDIRECT INCOME (Credit / Income - Discount Received)
      const incGroupName = "Indirect Income";
      let totalVoucherDiscountSeen = 0;

      // Check item level discounts
      if (voucher.items && voucher.items.length > 0) {
        voucher.items.forEach((item: any) => {
          const discountAmt = Number(item.discount || 0);
          if (discountAmt > 0) {
            totalVoucherDiscountSeen += discountAmt;
            const ledgerName = item.discountLedgerName || "Rebate & Discount 20%";

            if (!groups[incGroupName]) {
              groups[incGroupName] = { totalDebit: 0, totalCredit: 0, transactions: [] };
            }
            groups[incGroupName].totalCredit += discountAmt;

            const existingInc = groups[incGroupName].transactions.find(t => t.name === ledgerName);
            if (existingInc) {
              existingInc.credit += discountAmt;
            } else {
              groups[incGroupName].transactions.push({ name: ledgerName, debit: 0, credit: discountAmt });
            }
          }
        });
      }

      // Check voucher level global discount (if it wasn't already covered by items)
      const globalDiscount = Number(voucher.discountTotal || 0);
      if (globalDiscount > totalVoucherDiscountSeen) {
        const remainingDiscount = globalDiscount - totalVoucherDiscountSeen;

        let globalDiscountLedgerName = null;
        if (voucher.items && voucher.items.length > 0) {
          const itemWithDiscountLedger = voucher.items.find((i: any) => i.discountLedgerName);
          if (itemWithDiscountLedger) {
            globalDiscountLedgerName = itemWithDiscountLedger.discountLedgerName;
          }
        }

        const ledgerName = globalDiscountLedgerName || "Rebate & Discount 20%";

        if (!groups[incGroupName]) {
          groups[incGroupName] = { totalDebit: 0, totalCredit: 0, transactions: [] };
        }
        groups[incGroupName].totalCredit += remainingDiscount;

        const existingInc = groups[incGroupName].transactions.find(t => t.name === ledgerName);
        if (existingInc) {
          existingInc.credit += remainingDiscount;
        } else {
          groups[incGroupName].transactions.push({ name: ledgerName, debit: 0, credit: remainingDiscount });
        }
      }
    });

    return groups;
  }, [filteredVouchers]);

  // 🔹 COLUMNAR DATA PREPARATION
  const columnarData = useMemo(() => {
    // Apply Drill-Down Filter if active
    let vouchersToProcess = filteredVouchers;
    if (columnarDrillDown) {
      vouchersToProcess = filteredVouchers.filter(v => {
        // Check Party Name
        if ((v.partyName || "Unknown Party") === columnarDrillDown) return true;

        // Check Items for Ledgers (Purchase, Tax, TDS, Discount)
        if (v.items) {
          const itemMatched = v.items.some((item: any) =>
            (item.purchaseLedgerName === columnarDrillDown) ||
            (item.cgstLedgerName === columnarDrillDown) ||
            (item.sgstLedgerName === columnarDrillDown) ||
            (item.igstLedgerName === columnarDrillDown) ||
            (item.tdsLedgerName === columnarDrillDown) ||
            (item.discountLedgerName === columnarDrillDown) ||
            (Number(item.discount) > 0 && "Rebate & Discount 20%" === columnarDrillDown && !item.discountLedgerName)
          );
          if (itemMatched) return true;
        }

        // Check global discount
        let globalDiscountLedgerName = null;
        if (v.items && v.items.length > 0) {
          const itemWithDiscountLedger = v.items.find((i: any) => i.discountLedgerName);
          if (itemWithDiscountLedger) {
            globalDiscountLedgerName = itemWithDiscountLedger.discountLedgerName;
          }
        }
        const globalLedgerName = globalDiscountLedgerName || "Rebate & Discount 20%";
        const globalDiscount = Number(v.discountTotal || 0);
        if (globalDiscount > 0 && globalLedgerName === columnarDrillDown) {
          return true;
        }
        return false;
      });
    }

    const purchaseColumns = new Set<string>();
    const taxColumns = new Set<string>();
    const tdsColumns = new Set<string>();
    const discountColumns = new Set<string>();

    // 1. Collect all unique Ledger Names for Headers
    vouchersToProcess.forEach(voucher => {
      // Purchase Ledgers & Tax/Discount Ledgers from items
      if (voucher.items) {
        voucher.items.forEach(item => {
          if (item.purchaseLedgerName) purchaseColumns.add(item.purchaseLedgerName);

          let cgstName = item.cgstLedgerName;
          let sgstName = item.sgstLedgerName;
          let igstName = item.igstLedgerName;

          if (item.gstRate && Number(item.gstRate) > 0) {
            const totalRate = Number(item.gstRate);
            const halfRate = totalRate / 2;
            if (cgstName && !cgstName.includes("%") && !cgstName.includes("@")) cgstName = `${cgstName} ${halfRate}%`;
            if (sgstName && !sgstName.includes("%") && !sgstName.includes("@")) sgstName = `${sgstName} ${halfRate}%`;
            if (igstName && !igstName.includes("%") && !igstName.includes("@")) igstName = `${igstName} ${totalRate}%`;
          }

          if (cgstName) taxColumns.add(cgstName);
          if (sgstName) taxColumns.add(sgstName);
          if (igstName) taxColumns.add(igstName);

          if (item.tdsLedgerName) tdsColumns.add(item.tdsLedgerName);
          if (Number(item.discount) > 0) {
            discountColumns.add(item.discountLedgerName || "Rebate & Discount 20%");
          }
        });
      }
      // Global discount column
      const gDiscount = Number(voucher.discountTotal || 0);
      if (gDiscount > 0) {
        let globalName = null;
        if (voucher.items && voucher.items.length > 0) {
          const dItem = voucher.items.find((i: any) => i.discountLedgerName);
          if (dItem) globalName = dItem.discountLedgerName;
        }
        discountColumns.add(globalName || "Rebate & Discount 20%");
      }
    });

    const sortedPurchaseCols = Array.from(purchaseColumns).sort();
    const sortedTaxCols = Array.from(taxColumns).sort();
    const sortedTdsCols = Array.from(tdsColumns).sort();
    const sortedDiscountCols = Array.from(discountColumns).sort();

    const allDynamicCols = [...sortedPurchaseCols, ...sortedTaxCols, ...sortedTdsCols, ...sortedDiscountCols];

    // 2. Prepare Row Data
    const rows = vouchersToProcess.map(voucher => {
      const row: any = {
        id: voucher.id,
        date: voucher.date,
        partyName: voucher.partyName,
        voucherNo: voucher.voucherNo,
        voucherType: "Purchase", // Static for now
        total: Number(voucher.netAmount || voucher.total || 0),
        quantity: 0,
        rate: 0,
        items: voucher.items,
      };

      // Sum Quantity and determine Rate
      let totalQty = 0;
      let consistentRate = -1; // -1 indicates not set
      let isMixedRate = false;

      if (voucher.items) {
        voucher.items.forEach(i => {
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
          // Purchase Amount
          if (item.purchaseLedgerName) {
            row[item.purchaseLedgerName] = (row[item.purchaseLedgerName] || 0) + Number(item.amount || 0);
          }
        });

        // Taxes: Start by creating a set of ledgers present in this voucher
        const vCgstLedgers = new Set<string>();
        const vSgstLedgers = new Set<string>();
        const vIgstLedgers = new Set<string>();
        const vTdsLedgers = new Set<string>();

        voucher.items.forEach((item: any) => {
          let cgstName = item.cgstLedgerName;
          let sgstName = item.sgstLedgerName;
          let igstName = item.igstLedgerName;

          if (item.gstRate && Number(item.gstRate) > 0) {
            const totalRate = Number(item.gstRate);
            const halfRate = totalRate / 2;
            if (cgstName && !cgstName.includes("%") && !cgstName.includes("@")) cgstName = `${cgstName} ${halfRate}%`;
            if (sgstName && !sgstName.includes("%") && !sgstName.includes("@")) sgstName = `${sgstName} ${halfRate}%`;
            if (igstName && !igstName.includes("%") && !igstName.includes("@")) igstName = `${igstName} ${totalRate}%`;
          }

          if (cgstName) vCgstLedgers.add(cgstName);
          if (sgstName) vSgstLedgers.add(sgstName);
          if (igstName) vIgstLedgers.add(igstName);
          if (item.tdsLedgerName) vTdsLedgers.add(item.tdsLedgerName);
        });

        // Distribute Voucher Tax Totals to the FIRST found ledger of that type
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
        if (vTdsLedgers.size > 0) {
          const first = Array.from(vTdsLedgers)[0];
          row[first] = (row[first] || 0) + Number(voucher.tdsAmount || 0);
        }

        // Discounts
        voucher.items.forEach((item: any) => {
          const disc = Number(item.discount || 0);
          if (disc > 0) {
            totalDiscSeen += disc;
            const dName = item.discountLedgerName || "Rebate & Discount 20%";
            row[dName] = (row[dName] || 0) + disc;
          }
        });
      }

      const gDiscount = Number(voucher.discountTotal || 0);
      if (gDiscount > totalDiscSeen) {
        const diff = gDiscount - totalDiscSeen;
        let globalName = null;
        if (voucher.items && voucher.items.length > 0) {
          const dItem = voucher.items.find((i: any) => i.discountLedgerName);
          if (dItem) globalName = dItem.discountLedgerName;
        }
        const finalName = globalName || "Rebate & Discount 20%";
        row[finalName] = (row[finalName] || 0) + diff;
      }

      return row;
    });

    rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return { headers: allDynamicCols, rows };
  }, [filteredVouchers, columnarDrillDown]);

  // 🔹 PARTY WISE DATA PREPARATION
  const partyWiseData = useMemo(() => {
    const parties: Record<string, {
      partyName: string;
      groupName: string;
      gstin: string;
      totalAmount: number;
      count: number;
    }> = {};

    salesVouchers.forEach(v => {
      const partyName = v.partyName || "Unknown Party";
      if (!parties[partyName]) {
        parties[partyName] = {
          partyName: partyName,
          groupName: v.groupName || v.group_name || "Sundry Creditors",
          gstin: v.partyGSTIN || "N/A",
          totalAmount: 0,
          count: 0
        };
      }
      parties[partyName].totalAmount += Number(v.netAmount || v.total || 0);
      parties[partyName].count += 1;
    });

    return Object.values(parties).sort((a, b) => a.partyName.localeCompare(b.partyName));
  }, [salesVouchers]);




  const handleSort = (key: keyof SalesData) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleDateRangeChange = (range: string) => {
    const today = new Date();
    let fromDate = "";
    let toDate = "";

    switch (range) {
      case "all": {
        fromDate = "";
        toDate = "";
        break;
      }
      case "month": {
        const monthName = selectedMonthFilter || monthIndexToName[today.getMonth()] || "April";
        const res = getMonthDateRange(monthName);
        fromDate = res.fromDate;
        toDate = res.toDate;
        break;
      }
      case "quarter": {
        const qKey = selectedQuarterFilter || getCurrentQuarterKey();
        const res = getQuarterDateRange(qKey);
        fromDate = res.fromDate;
        toDate = res.toDate;
        break;
      }
      case "custom": {
        fromDate = filters.fromDate;
        toDate = filters.toDate;
        break;
      }
      default:
        break;
    }

    setFilters((prev) => ({
      ...prev,
      dateRange: range,
      fromDate,
      toDate,
    }));
  };

  const handleMonthSelect = (monthName: string) => {
    setSelectedMonthFilter(monthName);
    const { fromDate, toDate } = getMonthDateRange(monthName);
    setFilters((prev) => ({
      ...prev,
      fromDate,
      toDate,
    }));
  };

  const handleQuarterSelect = (quarterKey: string) => {
    setSelectedQuarterFilter(quarterKey);
    const { fromDate, toDate } = getQuarterDateRange(quarterKey);
    setFilters((prev) => ({
      ...prev,
      fromDate,
      toDate,
    }));
  };

  //sales repost month wise




  const monthDataMap = useMemo(() => {
    // 1️⃣ initialize all months with 0
    const map: Record<string, { debit: number; credit: number; closingBalance: number }> = {};
    MONTHS.forEach((m) => {
      map[m] = { debit: 0, credit: 0, closingBalance: 0 };
    });

    // 2️⃣ aggregate API sales data
    salesVouchers.forEach((row) => {
      if (!row.date || !row.total) return;

      const d = new Date(row.date);
      const monthName = monthIndexToName[d.getMonth()];
      const amount = Number(row.total) || 0;

      if (map[monthName]) {
        map[monthName].debit += amount;
      }
    });

    // 3️⃣ calculate cumulative closing balance
    let runningTotal = 0;
    MONTHS.forEach((m) => {
      runningTotal += map[m].debit - map[m].credit;
      map[m].closingBalance = runningTotal;
    });

    return map;
  }, [salesVouchers]);

  useEffect(() => {
    if (!companyId || !ownerType || !ownerId) return;

    let url = `${import.meta.env.VITE_API_URL}/api/purchase-report?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;

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

  /*
  useEffect(() => {
    if (selectedView === "extract" && !ledgerReportData && companyId && ownerType && ownerId) {
      const url = `${import.meta.env.VITE_API_URL
        }/api/purchase-report/ledger-report?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
  
      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setLedgerReportData(data.data);
          }
        })
        .catch((err) => {
          console.error("Ledger report fetch error:", err);
        });
    }
  }, [selectedView, companyId, ownerType, ownerId, ledgerReportData]);
  */

  // calculate total sales
  const totalSales = useMemo(() => {
    return salesVouchers.reduce((sum, row) => {
      return sum + (Number(row.total) || 0);
    }, 0);
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
              <h1 className="text-2xl font-bold">Purchase Report</h1>
              <p className="text-sm opacity-70">
                Comprehensive purchase analysis and reporting
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
            { key: "columnar", label: "Columnar", icon: <ListFilter size={16} /> },
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
                  | "itemwise"
                  | "partywise"
                  | "billwise"
                  | "billwiseprofit"
                  | "columnar"
                );
                if (view.key !== "detailed" && view.key !== "extract" && view.key !== "columnar") {
                  setSelectedMonth(null);
                  setSelectedParty(null);
                }
                // Clear drill-down filter when manually switching tabs
                setColumnarDrillDown(null);
                if (view.key !== "detailed") {
                  setSelectedParty(null);
                }
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
                <option value="all">All</option>
                <option value="month">Month</option>
                <option value="quarter">Quarter</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {/* From Date / Month Select / Quarter Select */}
            {filters.dateRange === "month" ? (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Select Month
                </label>
                <select
                  title="Select Month"
                  value={selectedMonthFilter}
                  onChange={(e) => handleMonthSelect(e.target.value)}
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                    : "bg-white border-gray-300 focus:border-blue-500"
                    } outline-none`}
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            ) : filters.dateRange === "quarter" ? (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Select Quarter
                </label>
                <select
                  title="Select Quarter"
                  value={selectedQuarterFilter}
                  onChange={(e) => handleQuarterSelect(e.target.value)}
                  className={`w-full p-2 rounded border ${theme === "dark"
                    ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                    : "bg-white border-gray-300 focus:border-blue-500"
                    } outline-none`}
                >
                  {QUARTERS.map((q) => (
                    <option key={q.key} value={q.key}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : filters.dateRange === "custom" ? (
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
            ) : null}

            {/* To Date */}
            {filters.dateRange === "custom" && (
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
            )}

            {/* Clear Filters */}
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFilters({
                    dateRange: "all",
                    fromDate: "",
                    toDate: "",
                    partyFilter: "",
                    itemFilter: "",
                    voucherTypeFilter: "",
                    statusFilter: "",
                    amountRangeMin: "",
                    amountRangeMax: "",
                  });
                }}
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
                  debit: 0,
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

                    {/* Debit */}
                    <div className="text-right font-mono">
                      {row.debit ? row.debit.toLocaleString("en-IN") : ""}
                    </div>

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
                  <div className="text-right font-mono">
                    {totalSales.toLocaleString("en-IN")}
                  </div>
                  <div className="text-right opacity-40">—</div>
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
              <div className="p-2 flex flex-col md:flex-row gap-2 justify-between items-center bg-blue-50 dark:bg-blue-900/20 mb-2 rounded">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Month Filter */}
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-sm">Month:</span>
                    <select
                      value={selectedMonth || ""}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className={`cursor-pointer p-1 pr-8 text-sm rounded border outline-none ${theme === "dark"
                        ? "bg-gray-700 border-gray-600 text-white"
                        : "bg-white border-gray-300 text-black"
                        }`}
                    >
                      <option value="">All Months</option>
                      {MONTHS.map((month) => (
                        <option key={month} value={month}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Party Filter */}
                  {selectedParty && (
                    <div className="flex items-center space-x-2 bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded">
                      <span className="text-sm font-medium">Party: <span className="font-bold">{selectedParty}</span></span>
                      <button 
                        onClick={() => setSelectedParty(null)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 font-bold ml-1"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2">
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
              </div>
            )}

            {selectedView === "detailed" && (
              <table className="w-full">
                <thead className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-50"}`}>
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
                        <td className="px-4 py-3 text-sm">
                          Purchase
                        </td>

                        {/* Voucher Number */}
                        <td className="px-4 py-3 text-sm">
                          {voucher.voucherNo}
                        </td>

                        {/* Debit */}
                        <td className="px-4 py-3 text-sm text-right font-mono">
                          -
                        </td>

                        {/* Credit */}
                        <td className="px-4 py-3 text-sm text-right font-mono">
                          {voucher.netAmount?.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center opacity-50">
                        No transactions found for the selected period.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Footer Totals */}
                <tfoot className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-100"}`}>
                  <tr className="font-semibold">
                    <td colSpan={4} className="px-4 py-3">
                      Total
                    </td>

                    <td className="px-4 py-3 text-right font-mono">
                      {/* Debit Total Empty */}
                    </td>

                    <td className="px-4 py-3 text-right font-mono">
                      {filteredVouchers
                        .reduce((sum, v) => sum + (Number(v.netAmount) || 0), 0)
                        .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}


            {/* Extract View */}
            {selectedView === "extract" && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-50"}`}>
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
                    {Object.entries(groupedExtractData).map(([groupName, group]) => (
                      <React.Fragment key={groupName}>
                        {/* 🔹 Group Header */}
                        <tr className={`${theme === "dark" ? "bg-gray-800" : "bg-gray-50"} font-bold`}>
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
                    ))}

                    {/* No Data */}
                    {Object.keys(groupedExtractData).length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center opacity-50">
                          No transactions found.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {/* 🔹 Grand Total */}
                  <tfoot className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-100"}`}>
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
                  <thead className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-50"}`}>
                    <tr>
                      <th className="px-2 py-3 text-left font-medium min-w-[100px]">Date</th>
                      <th className="px-2 py-3 text-left font-medium min-w-[200px]">Particulars</th>
                      <th className="px-2 py-3 text-left font-medium">Vch No.</th>
                      <th className="px-2 py-3 text-right font-medium">Quantity</th>
                      <th className="px-2 py-3 text-right font-medium">Rate</th>
                      <th className="px-2 py-3 text-right font-medium">Total</th>
                      {columnarData.headers.map((col) => (
                        <th key={col} className="px-2 py-3 text-right font-medium whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {columnarData.rows.map((row, index) => (
                      <tr
                        key={row.id || index}
                        className={`hover:bg-opacity-50 ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-50"}`}
                      >
                        <td className="px-2 py-2">
                          {new Date(row.date).toLocaleDateString("en-IN")}
                        </td>
                        <td className="px-2 py-2 text-right font-medium">{row.partyName}</td>
                        <td className="px-2 py-2">{row.voucherNo}</td>
                        <td className="px-2 py-2 text-right">{formatAggregatedQuantities(row.items, units)}</td>
                        <td className="px-2 py-2 text-right">
                          {row.rate > 0 ? row.rate.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "-"}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold">
                          {row.total?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        {/* Dynamic Columns */}
                        {columnarData.headers.map((col) => (
                          <td key={col} className="px-2 py-2 text-right text-xs">
                            {row[col]
                              ? Number(row[col]).toLocaleString("en-IN", { minimumFractionDigits: 2 })
                              : "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {columnarData.rows.length === 0 && (
                      <tr>
                        <td colSpan={5 + columnarData.headers.length} className="px-4 py-8 text-center opacity-50">
                          No transactions found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-100"}`}>
                    <tr className="font-semibold">
                      <td colSpan={3} className="px-2 py-3 text-right">Total</td>
                      <td className="px-2 py-3 text-right">
                        {columnarData.rows.reduce((sum, r) => sum + (r.quantity || 0), 0)}
                      </td>
                      <td className="px-2 py-3 text-right">
                        {columnarData.rows.reduce((sum, r) => sum + r.rate, 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-3 text-right">
                        {columnarData.rows.reduce((sum, r) => sum + r.total, 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      {columnarData.headers.map(col => (
                        <td key={col} className="px-2 py-3 text-right">
                          {columnarData.rows.reduce((sum, r) => sum + (r[col] || 0), 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}


            {selectedView === "partywise" && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead
                    className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
                      }`}
                  >
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">
                        Party Name
                      </th>
                      <th className="px-4 py-3 text-left font-medium">GSTIN</th>
                      <th className="px-4 py-3 text-right font-medium">
                        Transactions
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Total Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
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
                        <td className="px-4 py-3 text-sm text-right">{party.count}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono font-semibold">
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
                  <tfoot className={`${theme === "dark" ? "bg-gray-700" : "bg-gray-100"}`}>
                    <tr className="font-bold">
                      <td colSpan={3} className="px-4 py-3 text-right">Grand Total</td>
                      <td className="px-4 py-3 text-right font-mono">
                        {partyWiseData.reduce((sum, p) => sum + p.totalAmount, 0).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
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

export default PurchaseReport1;
