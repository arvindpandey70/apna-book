import React from "react";
import { useAppContext } from "../../context/AppContext";
import { useAuth } from "../../home/context/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  DollarSign,
  ArrowRightCircle,
  ArrowLeftCircle,
  FileText,
  ShoppingCart,
  ShoppingBag,
  FileMinus,
  FilePlus,
  Truck,
  Clipboard,
  Package,
  ImportIcon,
  Lock,
  FileSpreadsheet,
  ShieldCheck,
  AlertTriangle,
  BarChart2,
  PieChart,
  BookOpen,
  Clock,
} from "lucide-react";

interface VoucherType {
  id: string;
  icon: React.ReactNode;
  name: string;
  path: string;
  color: string;
  iconBg: string;
  description: string;
  category: "accounting" | "trading" | "inventory" | "import";
  isPendingItem?: boolean;
}

interface VoucherSection {
  title: string;
  description: string;
  icon: React.ReactNode;
  vouchers: VoucherType[];
  isPendingSection?: boolean;
}

const VouchersIndex: React.FC = () => {
  const { theme, vouchers, ledgers } = useAppContext();
  const { checkPermission } = useAuth();
  const navigate = useNavigate();

  // Safe fallbacks with proper typing
  const safeVouchers = vouchers || [];
  const safeLedgers = ledgers || [];

  // Helper function to get party name with better error handling
  const getPartyName = (partyId: string | undefined): string => {
    if (!partyId) return "No Party";
    const party = safeLedgers.find((l) => l.id === partyId);
    return party?.name || "Unknown Party";
  };

  // Helper function to handle voucher navigation
  const handleVoucherClick = (voucher: VoucherType) => {
    navigate(voucher.path);
  };

  // Helper function to format date consistently
  const formatDate = (date: string | Date): string => {
    try {
      return new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "Invalid Date";
    }
  };

  // Well-structured voucher sections configuration
  const voucherSections: VoucherSection[] = [
    {
      title: "Accounting Vouchers",
      description: "Cash, Bank & Journal Entries",
      icon: <DollarSign size={20} />,
      vouchers: [
        {
          id: "payment",
          icon: <DollarSign size={20} />,
          name: "Payment",
          path: "/app/vouchers/payment/create",
          color:
            theme === "dark"
              ? "bg-red-900/50 hover:bg-red-800/50"
              : "bg-red-50 hover:bg-red-100",
          iconBg: theme === "dark" ? "bg-red-800/70" : "bg-red-100",
          description: "Record cash/bank payments",
          category: "accounting",
        },
        {
          id: "receipt",
          icon: <ArrowRightCircle size={20} />,
          name: "Receipt",
          path: "/app/vouchers/receipt/create",
          color:
            theme === "dark"
              ? "bg-green-900/50 hover:bg-green-800/50"
              : "bg-green-50 hover:bg-green-100",
          iconBg: theme === "dark" ? "bg-green-800/70" : "bg-green-100",
          description: "Record cash/bank receipts",
          category: "accounting",
        },
        {
          id: "contra",
          icon: <ArrowLeftCircle size={20} />,
          name: "Contra",
          path: "/app/vouchers/contra/create",
          color:
            theme === "dark"
              ? "bg-purple-900/50 hover:bg-purple-800/50"
              : "bg-purple-50 hover:bg-purple-100",
          iconBg: theme === "dark" ? "bg-purple-800/70" : "bg-purple-100",
          description: "Transfer between accounts",
          category: "accounting",
        },
        {
          id: "journal",
          icon: <FileText size={20} />,
          name: "Journal",
          path: "/app/vouchers/journal/create",
          color:
            theme === "dark"
              ? "bg-amber-900/50 hover:bg-amber-800/50"
              : "bg-amber-50 hover:bg-amber-100",
          iconBg: theme === "dark" ? "bg-amber-800/70" : "bg-amber-100",
          description: "General journal entries",
          category: "accounting",
        },
      ],
    },
    {
      title: "Trading Vouchers",
      description: "Sales, Purchase & Orders",
      icon: <ShoppingCart size={20} />,
      vouchers: [
        {
          id: "sales",
          icon: <ShoppingCart size={20} />,
          name: "Sales",
          path: "/app/vouchers/sales/create",
          color:
            theme === "dark"
              ? "bg-blue-900/50 hover:bg-blue-800/50"
              : "bg-blue-50 hover:bg-blue-100",
          iconBg: theme === "dark" ? "bg-blue-800/70" : "bg-blue-100",
          description: "Sales invoices",
          category: "trading",
        },
        {
          id: "purchase",
          icon: <ShoppingBag size={20} />,
          name: "Purchase",
          path: "/app/vouchers/purchase/create",
          color:
            theme === "dark"
              ? "bg-indigo-900/50 hover:bg-indigo-800/50"
              : "bg-indigo-50 hover:bg-indigo-100",
          iconBg: theme === "dark" ? "bg-indigo-800/70" : "bg-indigo-100",
          description: "Purchase invoices",
          category: "trading",
        },
        {
          id: "sales-order",
          icon: <Clipboard size={20} />,
          name: "Sales Order",
          path: "/app/vouchers/sales-order/create",
          color:
            theme === "dark"
              ? "bg-sky-900/50 hover:bg-sky-800/50"
              : "bg-sky-50 hover:bg-sky-100",
          iconBg: theme === "dark" ? "bg-sky-800/70" : "bg-sky-100",
          description: "Sales orders",
          category: "trading",
        },
        {
          id: "purchase-order",
          icon: <Package size={20} />,
          name: "Purchase Order",
          path: "/app/vouchers/purchase-order/create",
          color:
            theme === "dark"
              ? "bg-cyan-900/50 hover:bg-cyan-800/50"
              : "bg-cyan-50 hover:bg-cyan-100",
          iconBg: theme === "dark" ? "bg-cyan-800/70" : "bg-cyan-100",
          description: "Purchase orders",
          category: "trading",
        },
        {
          id: "quotation",
          icon: <FileText size={20} />,
          name: "Quotation",
          path: "/app/vouchers/quotation/list",
          color:
            theme === "dark"
              ? "bg-violet-900/50 hover:bg-violet-800/50"
              : "bg-violet-50 hover:bg-violet-100",
          iconBg: theme === "dark" ? "bg-violet-800/70" : "bg-violet-100",
          description: "Price quotations",
          category: "trading",
        },
      ],
    },
    {
      title: "Credit/Debit Notes",
      description: "Adjustments & Returns",
      icon: <FilePlus size={20} />,
      vouchers: [
        {
          id: "debit-note",
          icon: <FilePlus size={20} />,
          name: "Debit Note",
          path: "/app/vouchers/debit-note/create",
          color:
            theme === "dark"
              ? "bg-rose-900/50 hover:bg-rose-800/50"
              : "bg-rose-50 hover:bg-rose-100",
          iconBg: theme === "dark" ? "bg-rose-800/70" : "bg-rose-100",
          description: "Debit adjustments",
          category: "trading",
        },
        {
          id: "credit-note",
          icon: <FileMinus size={20} />,
          name: "Credit Note",
          path: "/app/vouchers/credit-note/create",
          color:
            theme === "dark"
              ? "bg-teal-900/50 hover:bg-teal-800/50"
              : "bg-teal-50 hover:bg-teal-100",
          iconBg: theme === "dark" ? "bg-teal-800/70" : "bg-teal-100",
          description: "Credit adjustments",
          category: "trading",
        },

        // {
        //   id: 'sales-return',
        //   icon: <RotateCcw size={20} />,
        //   name: 'Sales Return',
        //   path: '/app/vouchers/sales-return/create',
        //   color: theme === 'dark' ? 'bg-orange-900/50 hover:bg-orange-800/50' : 'bg-orange-50 hover:bg-orange-100',
        //   iconBg: theme === 'dark' ? 'bg-orange-800/70' : 'bg-orange-100',
        //   description: 'Sales returns',
        //   category: 'trading'
        // },
        // {
        //   id: 'purchase-return',
        //   icon: <RefreshCcw size={20} />,
        //   name: 'Purchase Return',
        //   path: '/app/vouchers/purchase-return/create',
        //   color: theme === 'dark' ? 'bg-emerald-900/50 hover:bg-emerald-800/50' : 'bg-emerald-50 hover:bg-emerald-100',
        //   iconBg: theme === 'dark' ? 'bg-emerald-800/70' : 'bg-emerald-100',
        //   description: 'Purchase returns',
        //   category: 'trading'
        // }
      ],
    },
    {
      title: "Inventory Vouchers",
      description: "Stock & Delivery Management",
      icon: <Package size={20} />,
      vouchers: [
        {
          id: "stock-journal",
          icon: <Package size={20} />,
          name: "Stock Journal",
          path: "/app/vouchers/stock-journal/create",
          color:
            theme === "dark"
              ? "bg-yellow-900/50 hover:bg-yellow-800/50"
              : "bg-yellow-50 hover:bg-yellow-100",
          iconBg: theme === "dark" ? "bg-yellow-800/70" : "bg-yellow-100",
          description: "Stock adjustments",
          category: "inventory",
        },
        {
          id: "delivery-note",
          icon: <Truck size={20} />,
          name: "Delivery Note",
          path: "/app/vouchers/delivery-note/create",
          color:
            theme === "dark"
              ? "bg-cyan-900/50 hover:bg-cyan-800/50"
              : "bg-cyan-50 hover:bg-cyan-100",
          iconBg: theme === "dark" ? "bg-cyan-800/70" : "bg-cyan-100",
          description: "Delivery notes",
          category: "inventory",
        },
      ],
    },
    {
      title: "Import Vouchers",
      description: "Import vouchers from Excel/CSV files",
      icon: <ImportIcon size={20} />,
      vouchers: [
        {
          id: "import-vouchers",
          icon: <ImportIcon size={20} />,
          name: "Import Vouchers",
          path: "/app/vouchers/import",
          color:
            theme === "dark"
              ? "bg-teal-900/50 hover:bg-teal-800/50"
              : "bg-teal-50 hover:bg-teal-100",
          iconBg: theme === "dark" ? "bg-teal-800/70" : "bg-teal-100",
          description: "Import from Excel/CSV files",
          category: "import",
        },
        {
          id: "bank-statement-import",
          icon: <FileSpreadsheet size={20} />,
          name: "Bank Statement",
          path: "/app/vouchers/bank-statement-import",
          color:
            theme === "dark"
              ? "bg-emerald-900/50 hover:bg-emerald-800/50"
              : "bg-emerald-50 hover:bg-emerald-100",
          iconBg: theme === "dark" ? "bg-emerald-800/70" : "bg-emerald-100",
          description: "Import Bank Statements",
          category: "import",
        },
        {
          id: "purchase-import",
          icon: <ShoppingCart size={20} />,
          name: "Purchase Import",
          path: "/app/vouchers/purchase-import",
          color:
            theme === "dark"
              ? "bg-blue-900/50 hover:bg-blue-800/50"
              : "bg-blue-50 hover:bg-blue-100",
          iconBg: theme === "dark" ? "bg-blue-800/70" : "bg-blue-100",
          description: "Import Purchase GST Summary",
          category: "import",
        },
        {
          id: "sales-import",
          icon: <ShoppingCart size={20} />,
          name: "Sales Import",
          path: "/app/vouchers/sales-import",
          color:
            theme === "dark"
              ? "bg-sky-900/50 hover:bg-sky-800/50"
              : "bg-sky-50 hover:bg-sky-100",
          iconBg: theme === "dark" ? "bg-sky-800/70" : "bg-sky-100",
          description: "Import Sales GST Summary",
          category: "import",
        },
        {
          id: "credit-debit-import",
          icon: <FileText size={20} />,
          name: "Credit Note Import",
          path: "/app/vouchers/import?type=credit-note",
          color:
            theme === "dark"
              ? "bg-amber-900/50 hover:bg-amber-800/50"
              : "bg-amber-50 hover:bg-amber-100",
          iconBg: theme === "dark" ? "bg-amber-800/70" : "bg-amber-100",
          description: "Import Credit Notes",
          category: "import",
        },
        {
          id: "debit-note-import",
          icon: <FileText size={20} />,
          name: "Debit Note Import",
          path: "/app/vouchers/import?type=debit-note",
          color:
            theme === "dark"
              ? "bg-amber-900/50 hover:bg-amber-800/50"
              : "bg-amber-50 hover:bg-amber-100",
          iconBg: theme === "dark" ? "bg-amber-800/70" : "bg-amber-100",
          description: "Import Debit Notes",
          category: "import",
        },
      ],
    },
    {
      title: "Report Data Imports (Pending Features)",
      description: "Perform data import / creation for pending report items",
      icon: <Clock size={20} className="text-red-600 dark:text-red-400" />,
      isPendingSection: true,
      vouchers: [
        {
          id: "26as-import",
          icon: <ShieldCheck size={20} className="text-red-600 dark:text-red-400" />,
          name: "26AS",
          path: "/app/vouchers/import/26as",
          color:
            theme === "dark"
              ? "bg-red-950/30 border border-red-800/60 hover:bg-red-900/40 text-red-300"
              : "bg-red-50 border border-red-200 hover:bg-red-100 text-red-700",
          iconBg: theme === "dark" ? "bg-red-900/60 text-red-300" : "bg-red-100 text-red-600",
          description: "Import Form 26AS TDS statement data",
          category: "import",
          isPendingItem: true,
        },
        {
          id: "ais-import",
          icon: <FileText size={20} className="text-red-600 dark:text-red-400" />,
          name: "AIS",
          path: "/app/vouchers/import/books-vs-ais",
          color:
            theme === "dark"
              ? "bg-red-950/30 border border-red-800/60 hover:bg-red-900/40 text-red-300"
              : "bg-red-50 border border-red-200 hover:bg-red-100 text-red-700",
          iconBg: theme === "dark" ? "bg-red-900/60 text-red-300" : "bg-red-100 text-red-600",
          description: "Import AIS statement data",
          category: "import",
          isPendingItem: true,
        },
        {
          id: "gstr1-import",
          icon: <BarChart2 size={20} />,
          name: "GSTR1",
          path: "/app/vouchers/import/books-vs-gstr1",
          color:
            theme === "dark"
              ? "bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-200"
              : "bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-800",
          iconBg: theme === "dark" ? "bg-gray-700 text-gray-200" : "bg-gray-100 text-gray-600",
          description: "Import GSTR-1 outward return JSON",
          category: "import",
        },
        {
          id: "gstr3b-import",
          icon: <BarChart2 size={20} className="text-red-600 dark:text-red-400" />,
          name: "GSTR3B",
          path: "/app/vouchers/import/gstr1-vs-gstr3b",
          color:
            theme === "dark"
              ? "bg-red-950/30 border border-red-800/60 hover:bg-red-900/40 text-red-300"
              : "bg-red-50 border border-red-200 hover:bg-red-100 text-red-700",
          iconBg: theme === "dark" ? "bg-red-900/60 text-red-300" : "bg-red-100 text-red-600",
          description: "Import GSTR-3B return data",
          category: "import",
          isPendingItem: true,
        },
        {
          id: "gstr2a-import",
          icon: <PieChart size={20} className="text-red-600 dark:text-red-400" />,
          name: "GSTR2A",
          path: "/app/vouchers/import/books-vs-2a",
          color:
            theme === "dark"
              ? "bg-red-950/30 border border-red-800/60 hover:bg-red-900/40 text-red-300"
              : "bg-red-50 border border-red-200 hover:bg-red-100 text-red-700",
          iconBg: theme === "dark" ? "bg-red-900/60 text-red-300" : "bg-red-100 text-red-600",
          description: "Import GSTR-2A data",
          category: "import",
          isPendingItem: true,
        },
        {
          id: "gstr2b-import",
          icon: <PieChart size={20} />,
          name: "GSTR2B",
          path: "/app/vouchers/import/gstr2a-vs-gstr2b",
          color:
            theme === "dark"
              ? "bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-200"
              : "bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-800",
          iconBg: theme === "dark" ? "bg-gray-700 text-gray-200" : "bg-gray-100 text-gray-600",
          description: "Import GSTR-2B data",
          category: "import",
        },
      ],
    },
  ];

  return (
    <div className="pt-[56px] px-4 min-h-screen">
      {/* Header Section */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Voucher Management</h1>
        <p
          className={`text-sm ${
            theme === "dark" ? "text-gray-400" : "text-gray-600"
          }`}
        >
          Create, manage, and track all your vouchers in one place
        </p>
      </div>

      {/* Voucher Types by Section */}
      <div className="space-y-6 mb-6">
        {voucherSections.map((section, sectionIndex) => (
          <div
            key={sectionIndex}
            className={`p-6 rounded-lg ${
              theme === "dark"
                ? "bg-gray-800 border border-gray-700"
                : "bg-white shadow-sm border border-gray-200"
            }`}
          >
            <div className="flex items-center mb-4">
              <div
                className={`p-2 rounded-lg mr-3 ${
                  theme === "dark" ? "bg-gray-700" : "bg-gray-100"
                }`}
              >
                {section.icon}
              </div>
              <div>
                <h2 className="text-lg font-semibold">{section.title}</h2>
                <p
                  className={`text-sm ${
                    theme === "dark" ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {section.description}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-4">
              {section.vouchers.map((voucher) => {
                const isAllowed = checkPermission(voucher.id);

                return (
                  <button
                    key={voucher.id}
                    onClick={() => isAllowed && handleVoucherClick(voucher)}
                    disabled={!isAllowed}
                    className={`p-4 rounded-lg flex flex-col items-center text-center transition-all duration-200 transform ${
                      isAllowed
                        ? "hover:scale-105 hover:shadow-lg translate-y-0 active:scale-95 cursor-pointer"
                        : "opacity-50 grayscale cursor-not-allowed scale-100"
                    } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      voucher.color
                    } group relative`}
                    aria-label={`Create ${voucher.name} voucher - ${voucher.description}`}
                    title={
                      isAllowed
                        ? voucher.description
                        : "You don't have permission to access this module"
                    }
                  >
                    {!isAllowed && (
                      <div className="absolute top-2 right-2 text-red-500 bg-white/80 rounded-full p-1 shadow-sm">
                        <Lock size={12} />
                      </div>
                    )}
                    {voucher.isPendingItem && (
                      <div className="absolute top-2 right-2 text-[10px] font-bold text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-950/80 border border-red-300 dark:border-red-800 px-1.5 py-0.5 rounded flex items-center gap-1 shadow-xs">
                        <Clock size={10} /> Pending
                      </div>
                    )}
                    <div
                      className={`p-3 rounded-full mb-3 transition-colors ${
                        isAllowed ? "group-hover:scale-110" : ""
                      } ${voucher.iconBg}`}
                    >
                      {voucher.icon}
                    </div>
                    <span className="font-medium text-sm leading-tight">
                      {voucher.name}
                    </span>
                    <span
                      className={`text-xs mt-1 opacity-70 ${
                        theme === "dark" ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      {voucher.category}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VouchersIndex;
