import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "../../context/CompanyContext";
import type { VoucherEntry } from "../../types";
import { ArrowLeft, Download, Settings, Copy, Edit2, Trash2, FileCode2 } from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import PrintOptions from "../vouchers/sales/PrintOptions";
import SalesInvoiceDownloadModal from "../vouchers/sales/SalesInvoiceDownloadModal";
import {
  useFinancialYear,
  filterByFinancialYear,
} from "../../hooks/useFinancialYear";
import Swal from "sweetalert2";

interface VoucherRegisterBaseProps {
  title: string;
  voucherType: string;
  icon?: React.ReactElement;
  color?: string;
  description?: string;
  onAdd?: () => void;
  onEdit?: (voucher: VoucherEntry) => void;
  onDelete?: (id: string) => void;
  onView?: (voucher: VoucherEntry) => void;
  onCopy?: (voucher: VoucherEntry) => void;
  onExport?: (data: any) => void;
  onGenerateXml?: (voucher: VoucherEntry) => void;
  onGenerateAllXml?: (vouchers: VoucherEntry[]) => void;
  itemsPerPage?: number;
}

interface PurchaseVoucher {
  id: number;
  date: string;
  number: string;
  partyId: number;
  supplierInvoiceDate: string;
  referenceNo: string;
  subtotal: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  total: string;
}

// Mock role-based access control
const hasPermission = (action: string): boolean => {
  // Mock implementation - in real app, this would check user permissions
  const userRole = "admin"; // This would come from auth context
  const permissions = {
    admin: ["add", "edit", "delete", "view", "export", "print"],
    user: ["view", "export"],
    viewer: ["view"],
  };
  return (
    permissions[userRole as keyof typeof permissions]?.includes(action) || false
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

// Helper for consistent table cell formatting
const formatTableAmount = (val: any) => {
  const n = Number(val);
  if (!n || n === 0) return "";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const fixVoucherNumber = (num: string) => {
  if (!num) return "";
  // Fix for older vouchers that were saved as {prefix}//{suffix}/{number}
  // Example: b2c//26-27/1 -> b2c/1/26-27
  const match = String(num).match(/^(.*)\/\/(.*)\/(\d+)$/);
  if (match) {
    const prefix = match[1];
    const suffix = match[2];
    const nextNo = match[3];
    return `${prefix}/${nextNo}/${suffix}`;
  }
  return String(num);
};

const formatInvoiceNumber = (referenceNo: string, voucherNo: string) => {
  const val = referenceNo || voucherNo || "";
  if (!val || val === "-") return "-";
  const parts = String(val).split("/");
  if (parts.length >= 2) {
    // Try to find a purely numeric part (usually the middle one for prefix/number/suffix)
    const match = parts.find((p) => /^\d+$/.test(p));
    if (match) return match;
  }
  return val;
};

const VoucherRegisterBase: React.FC<VoucherRegisterBaseProps> = ({
  title,
  voucherType,
  onAdd,
  onEdit,
  onDelete,
  onView,
  onCopy,
  onExport,
  onGenerateXml,
  onGenerateAllXml,
  itemsPerPage: itemsPerPageProp = 10,
}) => {
  const navigate = useNavigate();
  const { theme } = useAppContext();
  const { ledgers } = useAppContext();

  const [vouchers, setVouchers] = useState<PurchaseVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [gstFilter, setGstFilter] = useState<"all" | "b2b" | "b2c" | "rcm">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(itemsPerPageProp);
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<Set<string>>(new Set());
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<VoucherEntry | null>(
    null
  );
  const [ledgerList, setLedgerList] = useState<any[]>([]);
  const [stockItemList, setStockItemList] = useState<any[]>([]);
  // State for inline invoice download (sales only)
  const [downloadVoucherId, setDownloadVoucherId] = useState<string | null>(null);
  const [serverTotalCount, setServerTotalCount] = useState(0);

  const { selectedFinYear } = useFinancialYear();

  const [groupBy, setGroupBy] = useState<"none" | "party" | "gst">("none");
  const [selectedGroupValue, setSelectedGroupValue] = useState<string | null>(null);

  // New state for Change View functionality
  const [viewType, setViewType] = useState<
    "Daily" | "Monthly" | "Quarterly" | "Custom Date"
  >("Daily");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedQuarter, setSelectedQuarter] = useState<string>("");
  const [showMonthList, setShowMonthList] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const { activeCompanyId } = useCompany();
  const companyId = activeCompanyId ?? localStorage.getItem("company_id") ?? "";
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
  // Initialize mock data

  const getLedgerNameById = (ledgerId?: number | string) => {
    if (!ledgerId) return "-";

    if (voucherType === "stock_journal" || voucherType === "stock-journal") {
      const item = stockItemList?.find((i: any) => String(i.id) === String(ledgerId));
      if (item) return item.name;
    }

    const ledger = ledgerList.find((l) => String(l.id) === String(ledgerId));

    return ledger ? ledger.name : `Unknown (${ledgerId})`;
  };

  const isFilterActive = !!(
    searchTerm ||
    dateFilter ||
    statusFilter ||
    (gstFilter !== "all") ||
    (groupBy !== "none") ||
    (viewType !== "Daily" && viewType !== "Custom Date") ||
    (viewType === "Custom Date" && customStartDate && customEndDate) ||
    (selectedFinYear && selectedFinYear !== "All-Years" && selectedFinYear !== "All Years")
  );

  // Reset page to 1 when any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    dateFilter,
    statusFilter,
    gstFilter,
    groupBy,
    viewType,
    selectedMonth,
    selectedQuarter,
    customStartDate,
    customEndDate,
    selectedFinYear
  ]);

  const lastFetchedWithFilterRef = React.useRef(false);

  const getLedgerName = (ledgerId?: number | string) => {
    if (!ledgerId) return "Unknown (-)";

    if (voucherType === "stock_journal" || voucherType === "stock-journal") {
      const item = stockItemList?.find((i: any) => String(i.id) === String(ledgerId));
      if (item) return item.name;
    }

    // Try finding in locally fetched ledgerList first (most up-to-date)
    let ledger = ledgerList?.find(
      (l: any) => String(l.id) === String(ledgerId)
    );

    // Fallback to context ledgers
    if (!ledger) {
      ledger = ledgers?.find((l: any) => String(l.id) === String(ledgerId));
    }

    return ledger ? ledger.name : `Unknown (${ledgerId})`;
  };
  const getParticulars = (voucher: VoucherEntry): string => {
    return voucher.entries
      .map((entry: any) => getLedgerName(entry.ledgerId ?? entry.ledger_id))
      .join(", ");
  };

  useEffect(() => {
    const handler = (e: any) => {
      const deletedId = e.detail.id;

      setVouchers((prev) =>
        prev.filter((v) => String(v.id) !== String(deletedId))
      );
    };

    window.addEventListener("voucher-deleted", handler);

    return () => window.removeEventListener("voucher-deleted", handler);
  }, []);

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
      text: `Do you really want to delete ${selectedVoucherIds.size} selected vouchers?`,
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
            voucherType,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Bulk delete request failed");
      }

      Swal.fire({
        icon: "success",
        title: "Deleted!",
        text: `${selectedVoucherIds.size} vouchers have been deleted successfully.`,
      });

      const deletedIds = new Set(selectedVoucherIds);
      setVouchers((prev) => prev.filter((v) => !deletedIds.has(String(v.id))));
      setSelectedVoucherIds(new Set());
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to delete vouchers.",
      });
      console.error("Bulk delete error:", error);
    }
  };

  const handleDeleteAll = async () => {
    if (filteredVouchers.length === 0) return;

    const result = await Swal.fire({
      title: "Delete ALL matching vouchers?",
      text: `This will delete ALL ${filteredVouchers.length} vouchers matching your current filters. This action cannot be undone!`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete ALL",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#d33",
    });

    if (!result.isConfirmed) return;

    try {
      const idsToDelete = filteredVouchers.map(v => v.id);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/vouchers/bulk-delete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ids: idsToDelete,
            ownerType,
            ownerId,
            companyId,
            voucherType,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Bulk delete request failed");
      }

      Swal.fire({
        icon: "success",
        title: "Deleted!",
        text: `All matching ${idsToDelete.length} vouchers have been deleted successfully.`,
      });

      const deletedIdsSet = new Set(idsToDelete);
      setVouchers((prev) => prev.filter((v) => !deletedIdsSet.has(String(v.id))));
      setSelectedVoucherIds(new Set());
    } catch (error) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to delete vouchers.",
      });
      console.error("Bulk delete error:", error);
    }
  };

  // Helper function to calculate debit and credit amounts from entries
  const calculateDebitCredit = (
    voucher: VoucherEntry
  ): { debit: number; credit: number } => {
    const debit = voucher.entries
      .filter((entry) => entry.type === "debit")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const credit = voucher.entries
      .filter((entry) => entry.type === "credit")
      .reduce((sum, entry) => sum + entry.amount, 0);
    return { debit, credit };
  };

  // Helper function to get available months from vouchers
  const getAvailableMonths = (): { value: string; label: string }[] => {
    const months = [
      { value: "04", label: "April" },
      { value: "05", label: "May" },
      { value: "06", label: "June" },
      { value: "07", label: "July" },
      { value: "08", label: "August" },
      { value: "09", label: "September" },
      { value: "10", label: "October" },
      { value: "11", label: "November" },
      { value: "12", label: "December" },
      { value: "01", label: "January" },
      { value: "02", label: "February" },
      { value: "03", label: "March" },
    ];
    return months;
  };

  // Helper function to filter vouchers by date range based on view type
  const filterVouchersByView = (vouchers: VoucherEntry[]): VoucherEntry[] => {
    if (!viewType || viewType === "Daily") return vouchers;

    const today = new Date();
    let startDate: Date;

    switch (viewType) {
      case "Monthly": {
        if (selectedMonth) {
          // Filter by selected month
          return vouchers.filter((voucher) => {
            const voucherMonth = new Date(voucher.date).getMonth() + 1;

            return String(voucherMonth).padStart(2, "0") === selectedMonth;
          });
        } else {
          // Show current month by default
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        }
        break;
      }
      case "Quarterly": {
        if (selectedQuarter) {
          return vouchers.filter((voucher) => {
            const voucherDate = new Date(voucher.date);
            const month = voucherDate.getMonth() + 1; // 1-12
            if (selectedQuarter === "Q1") return month >= 4 && month <= 6;
            if (selectedQuarter === "Q2") return month >= 7 && month <= 9;
            if (selectedQuarter === "Q3") return month >= 10 && month <= 12;
            if (selectedQuarter === "Q4") return month >= 1 && month <= 3;
            return true;
          });
        } else {
          const currentQuarter = Math.floor(today.getMonth() / 3);
          startDate = new Date(today.getFullYear(), currentQuarter * 3, 1);
        }
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

    if ((viewType !== "Monthly" || !selectedMonth) && (viewType !== "Quarterly" || !selectedQuarter) && viewType !== "Custom Date") {
      return vouchers.filter((voucher) => {
        const voucherDate = new Date(voucher.date);
        return voucherDate >= startDate;
      });
    }

    return vouchers;
  };
  console.log("voucher", voucherType);

  // Filter vouchers based on search, filters, and view type
  const convertToVoucherEntry = (p: any): VoucherEntry & any => {
    // ---------------------- PURCHASE ----------------------
    if (voucherType === "purchase") {
      return {
        id: String(p.id),
        date: p.date,
        number: fixVoucherNumber(p.number),
        referenceNo: p.referenceNo || "",
        type: "purchase",

        supplierInvoiceDate: p.supplierInvoiceDate || "",
        subtotal: Number(p.subtotal || 0),
        cgstTotal: Number(p.cgstTotal || 0),
        sgstTotal: Number(p.sgstTotal || 0),
        igstTotal: Number(p.igstTotal || 0),
        discountTotal: Number(p.discountTotal || 0),
        discountAmount: Number(p.discountAmount || 0),
        total: Number(p.total || 0),

        entries: [
          {
            ledgerId: "Purchase",
            type: "debit",
            amount: Number(p.total || 0),
          },
          {
            ledgerId: String(p.partyId),
            type: "credit",
            amount: Number(p.total || 0),
          },
        ],
      };
    }

    // ---------------------- SALES ----------------------
    if (voucherType === "sales") {
      const partyId =
        p.partyId || p.customerId || p.party_id || p.customer_id || null;

      const supplierInvoiceDate =
        p.invoiceDate ||
        p.invoice_date ||
        p.billDate ||
        p.bill_date ||
        p.date ||
        "";

      const referenceNo =
        p.referenceNo ||
        p.reference_no ||
        p.invoiceNo ||
        p.invoice_no ||
        p.refNo ||
        "";

      const subtotal =
        Number(p.subtotal) ||
        Number(p.sub_total) ||
        Number(p.beforeTax) ||
        Number(p.totalAmount) -
        (Number(p.cgstTotal || 0) +
          Number(p.sgstTotal || 0) +
          Number(p.igstTotal || 0)) ||
        0;

      const cgst = Number(p.cgstTotal || p.cgst || 0);
      const sgst = Number(p.sgstTotal || p.sgst || 0);
      const igst = Number(p.igstTotal || p.igst || 0);
      const discountTotal = Number(p.discountTotal || 0);
      const total = subtotal + cgst + sgst + igst - discountTotal;

      return {
        id: String(p.id),
        date: p.date,
        number: fixVoucherNumber(p.number),
        referenceNo,
        type: "sales",

        supplierInvoiceDate,
        subtotal,
        cgstTotal: cgst,
        sgstTotal: sgst,
        igstTotal: igst,
        discountTotal,
        overallDiscountAmount: Number(p.overallDiscountAmount || p.discountAmount || 0),
        total,

        entries: [
          {
            ledgerId: partyId,
            type: "debit",
            amount: total,
          },
          {
            ledgerId: p.salesLedgerId || p.salesLedger || "Sales A/c",
            type: "credit",
            amount: total,
          },
        ],
      };
    }

    // ---------------------- QUOTATION ----------------------
    if (voucherType === "quotation") {
      const partyId =
        p.partyId || p.customerId || p.party_id || p.customer_id || null;

      const supplierInvoiceDate =
        p.invoiceDate ||
        p.invoice_date ||
        p.billDate ||
        p.bill_date ||
        p.supplierInvoiceDate ||
        p.date ||
        "";

      const referenceNo =
        p.referenceNo ||
        p.reference_no ||
        p.invoiceNo ||
        p.invoice_no ||
        p.refNo ||
        p.bill_no ||
        "";

      const subtotal =
        Number(p.subtotal) ||
        Number(p.sub_total) ||
        Number(p.beforeTax) ||
        Number(p.totalAmount) -
        (Number(p.cgstTotal || 0) +
          Number(p.sgstTotal || 0) +
          Number(p.igstTotal || 0)) ||
        0;

      const cgst = Number(p.cgstTotal || p.cgst || 0);
      const sgst = Number(p.sgstTotal || p.sgst || 0);
      const igst = Number(p.igstTotal || p.igst || 0);
      const total = subtotal + cgst + sgst + igst;

      return {
        id: String(p.id),
        date: p.date,
        number: fixVoucherNumber(p.number),
        referenceNo,
        narration: p.narration || "",
        type: "quotation",
        isQuotation: p.isQuotation || true,

        supplierInvoiceDate,
        subtotal,
        cgstTotal: cgst,
        sgstTotal: sgst,
        igstTotal: igst,
        total,
        profit: Number(p.profit || 0),
        dispatchDetails:
          p.dispatchDocNo || p.dispatchThrough || p.destination
            ? {
              docNo: p.dispatchDocNo || "",
              through: p.dispatchThrough || "",
              destination: p.destination || "",
            }
            : undefined,

        entries: [
          {
            ledgerId: partyId,
            type: "debit",
            amount: total,
          },
          {
            ledgerId: p.salesLedgerId || p.salesLedger || "Sales A/c",
            type: "credit",
            amount: total,
          },
        ],
      };
    }

    // ---------------------- SALES ORDER ----------------------
    if (voucherType === "sales_order") {
      const partyId =
        p.partyId || p.customerId || p.party_id || p.customer_id || null;

      const supplierInvoiceDate =
        p.invoiceDate ||
        p.orderDate ||
        p.date || // ✅ fallback
        "";

      const referenceNo =
        p.referenceNo ||
        p.reference_no ||
        p.orderNo ||
        p.order_no ||
        p.number ||
        "";

      const total = Number(p.totalAmount || 0);

      return {
        id: String(p.id),
        date: p.date,
        number: fixVoucherNumber(p.number),
        referenceNo,
        type: "sales_order",

        supplierInvoiceDate,
        subtotal: total,
        cgstTotal: 0,
        sgstTotal: 0,
        igstTotal: 0,
        total,

        entries: [
          {
            ledgerId: partyId,
            type: "debit",
            amount: total,
          },
          {
            ledgerId: p.salesLedgerId || p.salesLedger || null,
            type: "credit",
            amount: total,
          },
        ],
      };
    }

    // ---------------------- PURCHASE ORDER ----------------------
    if (voucherType === "purchase_order") {
      const partyId =
        p.partyId || p.supplierId || p.party_id || p.supplier_id || null;

      const orderDate = p.orderDate || p.date || "";

      const referenceNo =
        p.referenceNo ||
        p.reference_no ||
        p.orderNo ||
        p.order_no ||
        p.number ||
        "";

      const total = Number(p.totalAmount || p.total || 0);

      return {
        id: String(p.id),
        date: orderDate,
        number: fixVoucherNumber(p.number),
        referenceNo: referenceNo || null,
        type: "purchase_order",

        supplierInvoiceDate: orderDate,
        subtotal: total,
        cgstTotal: 0,
        sgstTotal: 0,
        igstTotal: 0,
        total,

        entries: [
          {
            ledgerId: partyId, // Supplier
            type: "credit",
            amount: total,
          },
          {
            ledgerId: "Purchase Order",
            type: "debit",
            amount: total,
          },
        ],
      };
    }

    // ---------------------- RECEIPT ----------------------
    if (voucherType === "receipt") {
      return {
        id: String(p.id),
        date: p.date,
        number: fixVoucherNumber(p.number || p.voucher_number) || "",
        referenceNo: p.referenceNo || p.reference_no || "",
        narration: p.narration || "",
        type: "receipt",

        supplierInvoiceDate: p.supplier_invoice_date || "",
        subtotal: 0,
        cgstTotal: 0,
        sgstTotal: 0,
        igstTotal: 0,

        entries: (p.entries || []).map((e: any) => ({
          ledgerId: String(e.ledger_id || ""),
          amount: Number(e.amount || 0),
          type: e.type || e.entry_type,
          narration: e.narration || "",
        })),

        total: (p.entries || []).reduce(
          (sum: number, e: any) => sum + Number(e.amount || 0),
          0
        ),
      };
    }

    // ---------------------- CONTRA ----------------------
    if (voucherType === "contra") {
      return {
        id: String(p.id),
        date: p.date,
        number: fixVoucherNumber(p.number || p.voucher_number) || "",
        referenceNo: p.referenceNo || p.reference_no || "",
        narration: p.narration || "",
        type: "contra",

        supplierInvoiceDate: p.supplier_invoice_date || "",
        subtotal: 0,
        cgstTotal: 0,
        sgstTotal: 0,
        igstTotal: 0,

        entries: (p.entries || []).map((e: any) => ({
          ledgerId: String(e.ledger_id || ""),
          amount: Number(e.amount || 0),
          type: e.type || e.entry_type,
          narration: e.narration || "",
        })),

        total: (p.entries || []).reduce(
          (sum: number, e: any) => sum + Number(e.amount || 0),
          0
        ),
      };
    }

    // ---------------------- JOURNAL & STOCK JOURNAL ----------------------
    if (voucherType === "journal" || voucherType === "stock_journal" || voucherType === "stock-journal") {
      return {
        id: String(p.id),
        date: p.date,
        number: fixVoucherNumber(p.number || p.voucher_number) || "",
        referenceNo: p.referenceNo || p.reference_no || "",
        narration: p.narration || "",
        type: voucherType === "journal" ? "journal" : "stock-journal",

        supplierInvoiceDate: p.supplier_invoice_date || "",
        subtotal: 0,
        cgstTotal: 0,
        sgstTotal: 0,
        igstTotal: 0,

        entries: (p.entries || []).map((e: any) => ({
          ledgerId: String(e.ledgerId || e.ledger_id || ""),
          amount: Number(e.amount || 0),
          type: e.type || e.entry_type,
          narration: e.narration || "",
        })),

        total: (p.entries || []).reduce(
          (sum: number, e: any) => sum + Number(e.amount || 0),
          0
        ),
      };
    }

    return p;
  };

  // --- Safe Date Parser ---
  const normalizeDate = (dateStr: string) => {
    if (!dateStr) return null;

    // Handle DD-MM-YYYY
    if (dateStr.includes("-") && dateStr.split("-")[0].length === 2) {
      const [d, m, y] = dateStr.split("-");
      return new Date(`${y}-${m}-${d}`);
    }

    // Handle ISO YYYY-MM-DD
    return new Date(dateStr);
  };

  const getVoucherClassification = (voucher: any): "rcm" | "b2b" | "b2c" => {
    const isRcm = Boolean(
      voucher.isRcm ||
      voucher.rcmApplicable ||
      voucher.taxType === "RCM" ||
      voucher.rcm ||
      voucher.voucherMode === "rcm" ||
      (voucher.number && String(voucher.number).toUpperCase().startsWith("RCM"))
    );
    if (isRcm) return "rcm";

    const partyEntryType = voucherType === "sales" || voucherType === "quotation" ? "debit" : "credit";
    const partyId =
      voucher.partyId ||
      voucher.entries?.find((e: any) => e.type === partyEntryType)?.ledgerId ||
      voucher.entries?.[0]?.ledgerId;

    const party = ledgerList.find((l: any) => String(l.id) === String(partyId));
    const hasGst = party && Boolean(party.gstNumber || party.gst_number || party.gstin || party.gst_no);

    return hasGst ? "b2b" : "b2c";
  };

  // ---- FINAL FILTERING LOGIC ----
  const { filteredVouchers, groupOptions } = (() => {
    try {
      // Convert raw data → VoucherEntry
      const converted = vouchers.map((v) => {
        const entry = convertToVoucherEntry(v);
        return {
          ...entry,
          safeDate: normalizeDate(v.date), // safe date object
        };
      });

      // Apply Financial Year filter
      const finYearFiltered = filterByFinancialYear(
        converted,
        "date",
        selectedFinYear
      );

      // Apply View Type filter
      const viewFiltered = filterVouchersByView(finYearFiltered);

      // Apply Search, Date, Status filters
      let baseFilteredList = viewFiltered.filter((voucher) => {
        const safeNumber = (voucher.number || "").toLowerCase();
        const safeRef = (voucher.referenceNo || "").toLowerCase();

        // Search filter
        const searchMatch =
          !searchTerm ||
          safeNumber.includes(searchTerm.toLowerCase()) ||
          safeRef.includes(searchTerm.toLowerCase());

        // Date filter
        const formattedVoucherDate = voucher.safeDate
          ? `${voucher.safeDate.getFullYear()}-${String(voucher.safeDate.getMonth() + 1).padStart(2, "0")}-${String(voucher.safeDate.getDate()).padStart(2, "0")}`
          : "";
        const dateMatch = !dateFilter || formattedVoucherDate === dateFilter;

        // Status filter
        const status = getVoucherStatus(voucher);
        const statusMatch = !statusFilter || status === statusFilter;

        // GST Filter (B2B/B2C/RCM)
        let gstMatch = true;
        if (gstFilter !== "all" && (voucherType === "sales" || voucherType === "purchase" || voucherType === "quotation")) {
          const classification = getVoucherClassification(voucher);
          gstMatch = classification === gstFilter;
        }

        // Period filter logic
        return searchMatch && dateMatch && statusMatch && gstMatch;
      });

      // Calculate groups
      let gOptions: { value: string; count: number }[] = [];
      if (voucherType === "sales" && groupBy !== "none") {
        const counts = new Map<string, number>();
        baseFilteredList.forEach((voucher) => {
          const debitEntry = voucher.entries.find((e: any) => e.type === "debit");
          const partyId = debitEntry?.ledgerId;
          const party = ledgerList.find((l) => String(l.id) === String(partyId));
          
          let key = "";
          if (groupBy === "party") {
            key = party ? party.name : `Unknown (${partyId})`;
          } else if (groupBy === "gst") {
            key = party && (party.gstNumber || party.gst_number || party.gstin || party.gst_no) 
              ? (party.gstNumber || party.gst_number || party.gstin || party.gst_no) 
              : "Unregistered";
          }
          if (key) {
             counts.set(key, (counts.get(key) || 0) + 1);
          }
        });
        
        gOptions = Array.from(counts.entries()).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
      }

      // Apply group filter
      let finalList = baseFilteredList.filter((voucher) => {
        if (voucherType !== "sales" || groupBy === "none" || !selectedGroupValue) return true;
        
        const debitEntry = voucher.entries.find((e: any) => e.type === "debit");
        const partyId = debitEntry?.ledgerId;
        const party = ledgerList.find((l) => String(l.id) === String(partyId));
        
        let key = "";
        if (groupBy === "party") {
          key = party ? party.name : `Unknown (${partyId})`;
        } else if (groupBy === "gst") {
          key = party && (party.gstNumber || party.gst_number || party.gstin || party.gst_no) 
            ? (party.gstNumber || party.gst_number || party.gstin || party.gst_no) 
            : "Unregistered";
        }
        return key === selectedGroupValue;
      });

      finalList.sort((a, b) => {
        const da = a.safeDate ? a.safeDate.getTime() : 0;
        const db = b.safeDate ? b.safeDate.getTime() : 0;
        if (da !== db) return da - db;
        return Number(a.id) - Number(b.id);
      });

      return { filteredVouchers: finalList, groupOptions: gOptions };
    } catch (err) {
      console.error("Filter Error:", err);
      return { filteredVouchers: [], groupOptions: [] };
    }
  })();

  // Pagination
  const isServerPaginated = serverTotalCount > 0;
  const totalItemsForPagination = isServerPaginated ? serverTotalCount : filteredVouchers.length;

  const totalPages = Math.max(
    1,
    Math.ceil(totalItemsForPagination / itemsPerPage)
  );
  const startIndex = Math.max(0, (currentPage - 1) * itemsPerPage);
  const endIndex = Math.min(startIndex + itemsPerPage, totalItemsForPagination);

  // Reset to first page if current page is out of bounds
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  // Calculate summary statistics
  const totalDebit = filteredVouchers.reduce(
    (sum, voucher) => sum + calculateDebitCredit(voucher).debit,
    0
  );
  const totalCredit = filteredVouchers.reduce(
    (sum, voucher) => sum + calculateDebitCredit(voucher).credit,
    0
  );
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

    try {
      if (filteredVouchers.length === 0) {
        alert("No data to export");
        return;
      }

      let csvContent = "";

      if (voucherType === "sales" || voucherType === "purchase") {
        csvContent = [
          [
            "Date",
            voucherType === "sales" ? "Invoice No" : "Voucher No",
            "Party",
            "Supplier Invoice Date",
            voucherType === "sales" ? "Voucher No" : "Invoice No",
            "Taxable Value",
            "IGST",
            "CGST",
            "SGST",
            "Total GST",
            "Discount",
            "Overall Discount",
            "Invoice Value"
          ].join(","),
          ...filteredVouchers.map((voucher, index) => {
            const partyEntryType = voucherType === "sales" ? "debit" : "credit";
            const partyLedgerId = voucher.entries.find((e: any) => e.type === partyEntryType)?.ledgerId;
            const partyName = getLedgerName(partyLedgerId).replace(/"/g, '""');
            const totalGST = (Number(voucher.igstTotal || 0) + Number(voucher.cgstTotal || 0) + Number(voucher.sgstTotal || 0));
            return [
              formatDate(voucher.date),
              voucherType === "sales" ? index + 1 : voucher.number,
              `"${partyName}"`,
              voucher.supplierInvoiceDate ? formatDate(voucher.supplierInvoiceDate) : "",
              voucherType === "sales" ? voucher.number : formatInvoiceNumber(voucher.referenceNo, voucher.number),
              Number(voucher.subtotal || 0).toFixed(2),
              Number(voucher.igstTotal || 0).toFixed(2),
              Number(voucher.cgstTotal || 0).toFixed(2),
              Number(voucher.sgstTotal || 0).toFixed(2),
              totalGST.toFixed(2),
              Number(voucher.discountTotal || 0).toFixed(2),
              Number(voucher.overallDiscountAmount || voucher.discountAmount || 0).toFixed(2),
              Number(voucher.total || 0).toFixed(2)
            ].join(",");
          })
        ].join("\n");
      } else {
        csvContent = [
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
            const particulars = getParticulars(voucher).replace(/"/g, '""');
            const status = getVoucherStatus(voucher);

            return [
              formatDate(voucher.date),
              voucher.number,
              voucher.type.toUpperCase(),
              `"${particulars}"`,
              debit.toFixed(2),
              credit.toFixed(2),
              status,
            ].join(",");
          }),
        ].join("\n");
      }

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting data:", error);
      alert("Error occurred while exporting data");
    }
  };

  const handlePrint = () => {
    if (!hasPermission("print")) {
      alert("You do not have permission to print");
      return;
    }

    try {
      if (filteredVouchers.length === 0) {
        alert("No data to print");
        return;
      }

      const selectedMonthName = selectedMonth
        ? getAvailableMonths().find((m) => m.value === selectedMonth)?.label ||
        "Unknown Month"
        : "";      const printContent = `
        <html>
          <head>
            <title>${title}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; font-weight: bold; }
              .header { text-align: center; margin-bottom: 20px; }
              .text-right { text-align: right; }
              .font-bold { font-weight: bold; }
              .text-center { text-align: center; }
              @media print {
                body { margin: 0; }
                .no-print { display: none; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${title}</h1>
              <p>Generated on: ${new Date().toLocaleString()}</p>
              <p>View Type: ${viewType}${selectedMonth ? ` - ${selectedMonthName}` : ""}</p>
              <p>Total Records: ${filteredVouchers.length}</p>
            </div>
            <table>
              <thead>
                ${voucherType === "sales" || voucherType === "purchase" ? `
                <tr>
                  <th>Date</th>
                  <th>${voucherType === "sales" ? "Invoice No" : "Voucher No"}</th>
                  <th>Party</th>
                  <th>Supplier Invoice Date</th>
                  <th>${voucherType === "sales" ? "Voucher No" : "Invoice No"}</th>
                  <th class="text-right">Taxable Value</th>
                  <th class="text-right">IGST</th>
                  <th class="text-right">CGST</th>
                  <th class="text-right">SGST</th>
                  <th class="text-right">Total GST</th>
                  <th class="text-right">Discount</th>
                  <th class="text-right">Overall Discount</th>
                  <th class="text-right">Invoice Value</th>
                </tr>
                ` : `
                <tr>
                  <th>Date</th>
                  <th>Voucher No</th>
                  <th>Voucher Type</th>
                  <th>Particulars</th>
                  <th class="text-right">Debit Amount</th>
                  <th class="text-right">Credit Amount</th>
                  <th class="text-center">Status</th>
                </tr>
                `}
              </thead>
              <tbody>
                ${filteredVouchers
          .map((voucher, index) => {
            const { debit, credit } = calculateDebitCredit(voucher);
            const particulars = getParticulars(voucher);
            if (voucherType === "sales" || voucherType === "purchase") {
              const partyEntryType = voucherType === "sales" ? "debit" : "credit";
              const partyLedgerId = voucher.entries.find((e: any) => e.type === partyEntryType)?.ledgerId;
              const partyName = getLedgerName(partyLedgerId);
              const totalGST = (Number(voucher.igstTotal || 0) + Number(voucher.cgstTotal || 0) + Number(voucher.sgstTotal || 0));
              return `
                    <tr>
                      <td>${formatDate(voucher.date)}</td>
                      <td>${voucherType === "sales" ? index + 1 : voucher.number}</td>
                      <td>${partyName}</td>
                      <td>${voucher.supplierInvoiceDate ? formatDate(voucher.supplierInvoiceDate) : ""}</td>
                      <td>${voucherType === "sales" ? voucher.number : formatInvoiceNumber(voucher.referenceNo, voucher.number)}</td>
                      <td class="text-right">${formatCurrency(Number(voucher.subtotal || 0))}</td>
                      <td class="text-right">${formatCurrency(Number(voucher.igstTotal || 0))}</td>
                      <td class="text-right">${formatCurrency(Number(voucher.cgstTotal || 0))}</td>
                      <td class="text-right">${formatCurrency(Number(voucher.sgstTotal || 0))}</td>
                      <td class="text-right">${formatCurrency(totalGST)}</td>
                      <td class="text-right">${formatCurrency(Number(voucher.discountTotal || 0))}</td>
                      <td class="text-right">${formatCurrency(Number(voucher.overallDiscountAmount || voucher.discountAmount || 0))}</td>
                      <td class="text-right">${formatCurrency(Number(voucher.total || 0))}</td>
                    </tr>`;
            } else {
              return `
                    <tr>
                      <td>${formatDate(voucher.date)}</td>
                      <td>${voucher.number}</td>
                      <td>${voucher.type.toUpperCase()}</td>
                      <td>${particulars}</td>
                      <td class="text-right">${debit > 0 ? formatCurrency(debit) : "-"}</td>
                      <td class="text-right">${credit > 0 ? formatCurrency(credit) : "-"}</td>
                      <td class="text-center">${getVoucherStatus(voucher)}</td>
                    </tr>`;
            }
          })
          .join("")}
              </tbody>
              <tfoot>
                ${voucherType === "sales" || voucherType === "purchase" ? `
                <tr class="font-bold">
                  <td colspan="4" class="text-right">Total (${filteredVouchers.length} vouchers)</td>
                  <td class="text-right">${formatCurrency(filteredVouchers.reduce((s, v) => s + Number(v.subtotal || 0), 0))}</td>
                  <td class="text-right">${formatCurrency(filteredVouchers.reduce((s, v) => s + Number(v.igstTotal || 0), 0))}</td>
                  <td class="text-right">${formatCurrency(filteredVouchers.reduce((s, v) => s + Number(v.cgstTotal || 0), 0))}</td>
                  <td class="text-right">${formatCurrency(filteredVouchers.reduce((s, v) => s + Number(v.sgstTotal || 0), 0))}</td>
                  <td class="text-right">${formatCurrency(filteredVouchers.reduce((s, v) => s + (Number(v.igstTotal || 0) + Number(v.cgstTotal || 0) + Number(v.sgstTotal || 0)), 0))}</td>
                  <td class="text-right">${formatCurrency(filteredVouchers.reduce((s, v) => s + Number(v.discountTotal || 0), 0))}</td>
                  <td class="text-right">${formatCurrency(filteredVouchers.reduce((s, v) => s + Number(v.overallDiscountAmount || v.discountAmount || 0), 0))}</td>
                  <td class="text-right">${formatCurrency(filteredVouchers.reduce((s, v) => s + Number(v.total || 0), 0))}</td>
                </tr>
                ` : `
                <tr class="font-bold">
                  <td colspan="4" class="text-right">Total (${filteredVouchers.length} vouchers)</td>
                  <td class="text-right">${formatCurrency(totalDebit)}</td>
                  <td class="text-right">${["sales", "purchase"].includes(voucherType) ? "-" : formatCurrency(totalCredit)}</td>
                  <td></td>
                </tr>
                `}
              </tfoot>
            </table>
          </body>
        </html>
      `;  

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      } else {
        alert("Please allow pop-ups to print the report");
      }
    } catch (error) {
      console.error("Error printing data:", error);
      alert("Error occurred while printing data");
    }
  };

  const closePrintOptions = () => {
    setShowPrintOptions(false);
    setSelectedVoucher(null);
  };

  // ledger name get using id
  useEffect(() => {
    const fetchLedgers = async () => {
      try {
        const ledgerRes = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );

        const ledgerData = await ledgerRes.json();

        // IMPORTANT: handle different response formats
        if (ledgerData.data) {
          setLedgerList(ledgerData.data);
        } else if (Array.isArray(ledgerData)) {
          setLedgerList(ledgerData);
        } else {
          setLedgerList([]);
        }
      } catch (error) {
        console.error("Failed to fetch ledger:", error);
      }
    };

    const fetchStockItems = async () => {
      try {
        const params = new URLSearchParams({
          company_id: companyId,
          owner_type: ownerType,
          owner_id: ownerId,
        });
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/stock-items?${params.toString()}`);
        const json = await res.json();
        let items: any[] = [];
        if (Array.isArray(json)) {
          items = json;
        } else if (json && Array.isArray(json.data)) {
          items = json.data;
        } else {
          const arr = Object.values(json || {}).find(v => Array.isArray(v));
          if (Array.isArray(arr)) items = arr;
        }
        setStockItemList(items);
      } catch (error) {
        console.error("Failed to fetch stock items in register:", error);
      }
    };

    if (companyId && ownerType && ownerId) {
      fetchLedgers();
      fetchStockItems();
    }
  }, [companyId, ownerType, ownerId]);

  useEffect(() => {
    const loadVouchers = async () => {
      try {
        if (isFilterActive && lastFetchedWithFilterRef.current) {
          // We already have all data, and we are still filtering. No need to refetch on page change.
          setLoading(false);
          return;
        }

        let url = "";
        const paginationParams = isFilterActive ? "" : `&page=${currentPage}&limit=${itemsPerPage}`;

        // --- SALES VOUCHERS ---
        if (voucherType === "sales") {
          url = `${import.meta.env.VITE_API_URL
            }/api/sales-vouchers?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}${paginationParams}`;
        }

        // --- QUOTATIONS ---
        else if (voucherType === "quotation") {
          url = `${import.meta.env.VITE_API_URL
            }/api/sales-vouchers?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&isQuotation=1${paginationParams}`;
        }

        // --- PURCHASE VOUCHERS ---
        else if (voucherType === "purchase") {
          url = `${import.meta.env.VITE_API_URL
            }/api/purchase-vouchers?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}${paginationParams}`;
        } else if (voucherType === "sales_order") {
          url = `${import.meta.env.VITE_API_URL
            }/api/sales-orders?companyId=${companyId}&ownerType=${ownerType}&ownerId=${ownerId}${paginationParams}`;
        } else if (voucherType === "purchase_order") {
          url = `${import.meta.env.VITE_API_URL
            }/api/purchase-orders?companyId=${companyId}&ownerType=${ownerType}&ownerId=${ownerId}${paginationParams}`;
        } else if (voucherType === "receipt") {
          url = `${import.meta.env.VITE_API_URL
            }/api/vouchers?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&voucherType=receipt${paginationParams}`;
        } else if (voucherType === "contra") {
          url = `${import.meta.env.VITE_API_URL
            }/api/vouchers?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&voucherType=contra${paginationParams}`;
        } else if (voucherType === "journal") {
          url = `${import.meta.env.VITE_API_URL
            }/api/vouchers?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&voucherType=journal${paginationParams}`;
        } else if (voucherType === "stock_journal" || voucherType === "stock-journal") {
          url = `${import.meta.env.VITE_API_URL
            }/api/StockJournal?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}${paginationParams}`;
        } else {
          console.warn("Unknown voucherType:", voucherType);
          return;
        }

        const res = await fetch(url);
        const json = await res.json();
        console.log("data", json.data);

        // -- Handle different API response formats --
        if (json.total !== undefined) {
          setServerTotalCount(json.total);
          if (json.data) setVouchers(json.data);
        } else if (json.pagination && json.pagination.total !== undefined) {
          setServerTotalCount(json.pagination.total);
          if (json.data) setVouchers(json.data);
        } else {
          setServerTotalCount(0);
          if (json.data) setVouchers(json.data);
          else if (json.vouchers) setVouchers(json.vouchers);
          else if (Array.isArray(json)) setVouchers(json);
          else if (json.purchaseOrders) setVouchers(json.purchaseOrders);
          else setVouchers([]);
        }
        lastFetchedWithFilterRef.current = isFilterActive;
      } catch (err) {
        console.error("Failed to fetch vouchers:", err);
      } finally {
        setLoading(false);
      }
    };

    loadVouchers();
  }, [voucherType, companyId, ownerType, ownerId, currentPage, itemsPerPage, isFilterActive]);

  const printSingleVoucher = (voucher: VoucherEntry) => {
    try {
      const { debit, credit } = calculateDebitCredit(voucher);
      const particulars = getParticulars(voucher);
      const content = `
        <html>
          <head>
            <title>Invoice ${voucher.number}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 24px; }
              h1 { margin: 0 0 8px 0; }
              .muted { color: #666; }
              table { width: 100%; border-collapse: collapse; margin-top: 16px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background: #f7f7f7; }
              .right { text-align: right; }
            </style>
          </head>
          <body>
            <h1>Invoice</h1>
            <div class="muted">Voucher No: ${voucher.number
        } | Date: ${formatDate(
          voucher.date
        )} | Type: ${voucher.type.toUpperCase()}</div>
            <div>Particulars: ${particulars}</div>
            <table>
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Ledger/Item</th>
                  <th class="right">Debit</th>
                  <th class="right">Credit</th>
                  <th>Narration</th>
                </tr>
              </thead>
              <tbody>
                ${voucher.entries
          .map(
            (e, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${e.ledgerId || e.itemId || "-"}</td>
                    <td class="right">${e.type === "debit" ? e.amount.toFixed(2) : "-"
              }</td>
                    <td class="right">${e.type === "credit" ? e.amount.toFixed(2) : "-"
              }</td>
                    <td>${e.narration || ""}</td>
                  </tr>`
          )
          .join("")}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2" class="right"><strong>Totals</strong></td>
                  <td class="right"><strong>${debit.toFixed(2)}</strong></td>
                  <td class="right"><strong>${credit.toFixed(2)}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </body>
        </html>`;

      const w = window.open("", "_blank");
      if (!w) {
        alert("Please allow pop-ups to print the invoice.");
        return false;
      }
      w.document.write(content);
      w.document.close();
      w.focus();
      w.print();
      return true;
    } catch (err) {
      console.error("Error printing voucher:", err);
      alert("Failed to print invoice");
      return false;
    }
  };

  const handleGenerateEWayBill = (voucher: VoucherEntry) => {
    // Placeholder: integrate real E-Way Bill modal/API here
    // console.log("E-Way Bill generation started for", voucher.number);
    alert(`E-Way Bill generated (mock) for ${voucher.number}`);
  };

  const handleGenerateEInvoice = (voucher: VoucherEntry) => {
    // Placeholder: integrate real E-Invoice (IRN) API/print here
    // console.log("E-Invoice generation started for", voucher.number);
    alert(`E-Invoice generated (mock) for ${voucher.number}`);
  };

  const onGenerateInvoice = () => {
    if (!selectedVoucher) return;
    const ok = printSingleVoucher(selectedVoucher);
    // Auto-run E-Way Bill then E-Invoice after invoice generation
    if (ok) {
      setTimeout(() => handleGenerateEWayBill(selectedVoucher), 300);
      setTimeout(() => handleGenerateEInvoice(selectedVoucher), 800);
    }
  };

  const onGenerateEWayBillClick = () => {
    if (!selectedVoucher) return;
    handleGenerateEWayBill(selectedVoucher);
  };

  const onGenerateEInvoiceClick = () => {
    if (!selectedVoucher) return;
    handleGenerateEInvoice(selectedVoucher);
  };

  const onSendToEmail = () => {
    if (!selectedVoucher) return;
    // Placeholder email hook
    alert(`Invoice ${selectedVoucher.number} queued for email (mock).`);
  };

  const onSendToWhatsApp = () => {
    if (!selectedVoucher) return;
    // Placeholder WhatsApp hook
    alert(`Invoice ${selectedVoucher.number} shared to WhatsApp (mock).`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="pt-[56px] px-4 min-h-screen w-full max-w-full overflow-x-hidden box-border">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">

          {/* LEFT SIDE */}
          <div className="flex items-center">
            <button
              onClick={() => navigate("/app/voucher-register")}
              className="flex items-center text-gray-600 hover:text-gray-900 transition-colors mr-3"
              title="Back to Voucher Register"
            >
              <ArrowLeft size={24} />
            </button>

            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          </div>

          {/* RIGHT SIDE */}
          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
            {onGenerateAllXml && (
              <button
                onClick={() => onGenerateAllXml(filteredVouchers as VoucherEntry[])}
                className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center shadow-sm text-sm font-medium"
                title="Generate XML for all visible vouchers"
              >
                <FileCode2 className="mr-2" size={16} />
                Export All XML
              </button>
            )}

            {voucherType === "sales" && (
              <div className="flex items-center gap-2">
                <select
                  value={groupBy}
                  onChange={(e) => {
                    setGroupBy(e.target.value as any);
                    setSelectedGroupValue(null);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm cursor-pointer hover:border-gray-400 transition-colors"
                  title="Group By"
                >
                  <option value="none">Party Wise (None)</option>
                  <option value="party">Party Name</option>
                  <option value="gst">GST Number</option>
                </select>

                {groupBy !== "none" && (
                  <select
                    value={selectedGroupValue || ""}
                    onChange={(e) => {
                      setSelectedGroupValue(e.target.value || null);
                      setCurrentPage(1);
                    }}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm cursor-pointer hover:border-gray-400 transition-colors max-w-[200px]"
                    title={`Select ${groupBy === "party" ? "Party" : "GST Number"}`}
                  >
                    <option value="">All</option>
                    {groupOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.value} ({opt.count})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

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

            {(voucherType === "sales" || voucherType === "purchase" || voucherType === "quotation") && (
              <div className="flex items-center">
                <select
                  id="gst-filter"
                  value={gstFilter}
                  onChange={(e) => setGstFilter(e.target.value as any)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm cursor-pointer hover:border-gray-400 transition-colors"
                  title="Filter by GST Type"
                >
                  <option value="all">All Vouchers</option>
                  <option value="b2b">B2B</option>
                  <option value="b2c">B2C</option>
                  <option value="rcm">RCM</option>
                </select>
              </div>
            )}
            <button
              onClick={() => setShowActions(!showActions)}
              className={`p-2 rounded-lg transition-colors ${showActions
                ? "bg-blue-100 text-blue-600"
                : "text-gray-500 hover:bg-gray-100"
                }`}
              title="Toggle Action Mode"
            >
              <Settings size={20} />
            </button>

            {hasPermission("add") && onAdd && (
              <button
                onClick={onAdd}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors text-sm font-semibold shadow-md"
                title={`Add new ${voucherType} voucher`}
              >
                Add New
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
        {voucherType === "sales" ? (
          <div className="bg-white p-4 rounded-lg shadow border">
            <h3 className="text-sm font-medium text-gray-500">
              Total Sales Amount
            </h3>
            <p className="text-2xl font-bold text-blue-600">
              {formatCurrency(totalDebit)}
            </p>
          </div>
        ) : (
          <>
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-sm font-medium text-gray-500">Total Debit</h3>
              <p className="text-2xl font-bold text-blue-600">
                {formatCurrency(totalDebit)}
              </p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow border">
              <h3 className="text-sm font-medium text-gray-500">
                Total Credit
              </h3>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(totalCredit)}
              </p>
            </div>
          </>
        )}
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
                  setSelectedQuarter("");
                } else if (newViewType === "Quarterly") {
                  setShowMonthList(false);
                  setSelectedMonth("");
                } else {
                  setShowMonthList(false);
                  setSelectedMonth("");
                  setSelectedQuarter("");
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
          {viewType === "Quarterly" && (
            <div>
              <label
                htmlFor="quarter-select"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Select Quarter
              </label>
              <select
                id="quarter-select"
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Current Quarter</option>
                <option value="Q1">Apr - Jun</option>
                <option value="Q2">Jul - Sep</option>
                <option value="Q3">Oct - Dec</option>
                <option value="Q4">Jan - Mar</option>
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
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md transition-colors"
                title="Export vouchers to Excel"
              >
                Export
              </button>
            )}
            {hasPermission("print") && (
              <button
                onClick={handlePrint}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md transition-colors"
                title="Print voucher register"
              >
                Print
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Vouchers Table */}
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
                  {voucherType === "sales" ? "Invoice No" : "Voucher No"}
                </th>
                {["receipt", "contra", "journal", "stock_journal", "stock-journal"].includes(voucherType) ? (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Voucher Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Voucher Supplier Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Particulars
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
                  </>
                ) : (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Party
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Supplier Invoice Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {voucherType === "sales" ? "Voucher No" : "Invoice No"}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Taxable Value
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      IGST
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      CGST
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      SGST
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total GST
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Discount
                    </th>
                    {voucherType === "sales" && (
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Overall Discount
                      </th>
                    )}
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice Value
                    </th>
                  </>
                )}
                {showActions && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {(isServerPaginated ? filteredVouchers : (filteredVouchers as VoucherEntry[]).slice(startIndex, endIndex)).map((voucher: any, index: number) => {
                if (!voucher || !voucher.entries) return null; // Safety
                const isSelected = selectedVoucherIds.has(voucher.id);
                const debitEntry = voucher.entries.find(
                  (e) => e.type === "debit"
                );
                const creditEntry = voucher.entries.find(
                  (e) => e.type === "credit"
                );

                const subtotal = Number(voucher.subtotal) || 0;
                const cgst = Number(voucher.cgstTotal) || 0;
                const sgst = Number(voucher.sgstTotal) || 0;
                const igst = Number(voucher.igstTotal) || 0;
                const discountTotal = Number(voucher.discountTotal) || 0;
                const total = Number(voucher.total) || 0;

                return (
                  <tr
                    key={voucher.id}
                    className={`hover:bg-gray-50 transition-colors ${isSelected ? "bg-blue-50" : ""
                      }`}
                  >
                    {showActions && (
                      <td className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(voucher.id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </td>
                    )}
                    {/* Date */}
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {voucher.date ? formatDate(voucher.date) : "-"}
                    </td>

                    {/* Voucher Number / Invoice Number */}
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {voucherType === "sales" 
                        ? startIndex + index + 1 
                        : (voucher.number ?? "-")}
                    </td>

                    {["receipt", "contra", "journal", "stock_journal", "stock-journal"].includes(voucherType) ? (
                      <>
                        {/* Voucher Type */}
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {voucher.type?.toUpperCase() ?? "-"}
                        </td>
                        {/* Voucher Supplier Date */}
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {voucher.supplierInvoiceDate
                            ? formatDate(voucher.supplierInvoiceDate)
                            : "-"}
                        </td>
                        {/* Particulars */}
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {getParticulars(voucher)}
                        </td>
                        {/* Debit Amount */}
                        <td className="px-6 py-4 text-sm text-gray-900 text-right">
                          {calculateDebitCredit(voucher).debit > 0
                            ? calculateDebitCredit(
                              voucher
                            ).debit.toLocaleString()
                            : "-"}
                        </td>
                        {/* Credit Amount */}
                        <td className="px-6 py-4 text-sm text-gray-900 text-right">
                          {calculateDebitCredit(voucher).credit > 0
                            ? calculateDebitCredit(
                              voucher
                            ).credit.toLocaleString()
                            : "-"}
                        </td>
                        {/* Status */}
                        <td className="px-6 py-4 text-sm text-gray-500">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                              getVoucherStatus(voucher)
                            )}`}
                          >
                            {getVoucherStatus(voucher)}
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        {/* Party */}
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {voucherType === "debit_note"
                            ? getLedgerName(
                              voucher.entries.find((e) => e.type === "credit")
                                ?.ledgerId
                            )
                            : voucherType === "sales"
                              ? getLedgerName(debitEntry?.ledgerId)
                              : getLedgerName(creditEntry?.ledgerId)}
                        </td>

                        {/* Supplier Invoice Date */}
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {voucher.supplierInvoiceDate
                            ? formatDate(voucher.supplierInvoiceDate)
                            : "-"}
                        </td>

                        {/* Invoice No / Voucher No */}
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {voucherType === "sales" 
                            ? (voucher.number ?? "-") 
                            : formatInvoiceNumber(voucher.referenceNo, voucher.number)}
                        </td>

                        {/* Taxable Value */}
                        <td className="px-6 py-4 text-sm text-gray-900 text-right">
                          {formatTableAmount(subtotal)}
                        </td>

                        {/* IGST */}
                        <td className="px-6 py-4 text-sm text-gray-900 text-right">
                          {formatTableAmount(igst)}
                        </td>

                        {/* CGST */}
                        <td className="px-6 py-4 text-sm text-gray-900 text-right">
                          {formatTableAmount(cgst)}
                        </td>

                        {/* SGST */}
                        <td className="px-6 py-4 text-sm text-gray-900 text-right">
                          {formatTableAmount(sgst)}
                        </td>

                        {/* GST Total */}
                        <td className="px-6 py-4 text-sm text-gray-900 text-right">
                          {formatTableAmount(cgst + sgst + igst)}
                        </td>

                        {/* Discount */}
                        <td className="px-6 py-4 text-sm text-red-600 text-right">
                          {voucherType === "sales"
                            ? formatTableAmount(Math.max(0, discountTotal - (Number(voucher.overallDiscountAmount) || 0)))
                            : formatTableAmount(discountTotal)
                          }
                        </td>

                        {/* Overall Discount */}
                        {voucherType === "sales" && (
                          <td className="px-6 py-4 text-sm text-red-600 text-right">
                            {formatTableAmount(Number(voucher.overallDiscountAmount) || 0)}
                          </td>
                        )}

                        {/* Total */}
                        <td className="px-6 py-4 text-sm text-gray-900 font-bold text-right">
                          {formatTableAmount(total)}
                        </td>
                      </>
                    )}

                    {showActions && (
                      <td className="px-6 py-4 text-sm font-medium space-x-3 min-w-[150px]">
                        <div className="flex items-center space-x-3 animate-in fade-in slide-in-from-left-1">
                          {onCopy && (
                            <button
                              onClick={() => onCopy(voucher)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Copy"
                            >
                              <Copy size={16} />
                            </button>
                          )}

                          {onEdit && (
                            <button
                              onClick={() => onEdit(voucher)}
                              className="text-indigo-600 hover:text-indigo-900"
                              title="Edit"
                            >
                              <Edit2 size={16} />
                            </button>
                          )}

                          {onGenerateXml && (
                            <button
                              onClick={() => onGenerateXml(voucher)}
                              className="text-orange-500 hover:text-orange-700"
                              title="Generate XML"
                            >
                              <FileCode2 size={16} />
                            </button>
                          )}

                          {onDelete && (
                            <button
                              onClick={() => onDelete(String(voucher.id))}
                              className="text-red-600 hover:text-red-900"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}

                          {voucherType === "sales" && (
                            <button
                              title="Download / Print Invoice"
                              onClick={() => setDownloadVoucherId(String(voucher.id))}
                              className="text-green-600 hover:text-green-900 transition-colors"
                            >
                              <Download className="w-4 h-4" />
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
            <tfoot className="bg-gray-100 font-bold">
              <tr>
                {["sales", "purchase", "quotation", "debit_note", "credit_note"].includes(voucherType) ? (
                  <>
                    <td colSpan={showActions ? 4 : 3} className="px-6 py-4 text-sm text-gray-900">
                      Total ({filteredVouchers.length} vouchers)
                    </td>
                    <td className="px-6 py-4"></td> {/* Blank for Supplier Invoice Date */}
                    <td className="px-6 py-4"></td> {/* Blank for Reference No */}
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">
                      {/* Subtotal Total (Taxable Value) */}
                      {formatTableAmount(filteredVouchers.reduce((s, v) => s + (Number(v.subtotal) || 0), 0))}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">
                      {/* IGST Total */}
                      {formatTableAmount(filteredVouchers.reduce((s, v) => s + (Number(v.igstTotal) || 0), 0))}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">
                      {/* CGST Total */}
                      {formatTableAmount(filteredVouchers.reduce((s, v) => s + (Number(v.cgstTotal) || 0), 0))}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">
                      {/* SGST Total */}
                      {formatTableAmount(filteredVouchers.reduce((s, v) => s + (Number(v.sgstTotal) || 0), 0))}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">
                      {/* Tax Total */}
                      {formatTableAmount(filteredVouchers.reduce((s, v) => s + (Number(v.cgstTotal || 0) + Number(v.sgstTotal || 0) + Number(v.igstTotal || 0)), 0))}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">
                      {/* Discount Total */}
                      {voucherType === "sales"
                        ? formatTableAmount(filteredVouchers.reduce((s, v) => s + Math.max(0, (Number(v.discountTotal) || 0) - (Number(v.overallDiscountAmount) || 0)), 0))
                        : formatTableAmount(filteredVouchers.reduce((s, v) => s + (Number(v.discountTotal) || 0), 0))
                      }
                    </td>
                    {voucherType === "sales" && (
                      <td className="px-6 py-4 text-sm text-gray-900 text-right">
                        {/* Overall Discount Total */}
                        {formatTableAmount(filteredVouchers.reduce((s, v) => s + (Number(v.overallDiscountAmount) || 0), 0))}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 text-right">
                      {formatTableAmount(
                        filteredVouchers.reduce(
                          (sum: number, v: VoucherEntry) => {
                            const { debit, credit } = calculateDebitCredit(v);
                            if (["sales", "quotation", "credit_note"].includes(voucherType)) return sum + debit;
                            return sum + credit;
                          },
                          0
                        )
                      )}
                    </td>
                    {showActions && <td className="px-6 py-4"></td>}
                  </>
                ) : (
                  <>
                    <td colSpan={showActions ? 5 : 4} className="px-6 py-4 text-sm text-gray-900">
                      Total ({filteredVouchers.length} vouchers)
                    </td>
                    <td className="px-6 py-4"></td> {/* Blank for Particulars */}
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">
                      {formatCurrency(
                        filteredVouchers.reduce(
                          (sum: number, v: VoucherEntry) =>
                            sum + calculateDebitCredit(v).debit,
                          0
                        )
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right">
                      {formatCurrency(
                        filteredVouchers.reduce(
                          (sum: number, v: VoucherEntry) =>
                            sum + calculateDebitCredit(v).credit,
                          0
                        )
                      )}
                    </td>
                    <td className="px-6 py-4"></td> {/* Blank for Status */}
                    {showActions && <td className="px-6 py-4"></td>}
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {
        totalPages > 1 && (
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
                  to <span className="font-medium">{endIndex}</span> of{" "}
                  <span className="font-medium">{totalItemsForPagination}</span>{" "}
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
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (page) => (
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
                    )
                  )}
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
        )
      }
      {/* Print Options Modal */}
      <PrintOptions
        theme={theme}
        showPrintOptions={showPrintOptions}
        onClose={closePrintOptions}
        onGenerateInvoice={onGenerateInvoice}
        onGenerateEWayBill={onGenerateEWayBillClick}
        onGenerateEInvoice={onGenerateEInvoiceClick}
        onSendToEmail={onSendToEmail}
        onSendToWhatsApp={onSendToWhatsApp}
      />

      {/* Sales Invoice Download Modal */}
      {downloadVoucherId && (
        <SalesInvoiceDownloadModal
          voucherId={downloadVoucherId as any}
          onClose={() => setDownloadVoucherId(null)}
        />
      )}

      {filteredVouchers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            No vouchers found matching your criteria.
          </p>
        </div>
      )}
    </div>
  );
};

export default VoucherRegisterBase;
