import React, { useState, useRef, useEffect } from "react";
import {
    Upload,
    FileText,
    Download,
    ArrowLeft,
    CheckCircle,
    AlertTriangle,
    RefreshCw,
    FileSpreadsheet,
    ShoppingCart,
    Grid,
    List,
    X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "../../../context/CompanyContext";
import { extractStateCode } from "../../../utils/ledgerUtils";
import * as XLSX from "xlsx-js-style";
import axios from "axios";
import Swal from "sweetalert2";

// Item entry matching Manual Sales Voucher structure
interface ManualItemRow {
    srNo: number | string;
    itemName: string;
    hsnCode: string;
    quantity: number;
    unit: string;
    rate: number;
    discount?: number;
    rawGstRate?: number;
    sgstRate: number;
    cgstRate: number;
    igstRate: number;
    sgstAmount: number;
    cgstAmount: number;
    igstAmount: number;
    gstRate: number;
    taxableValue: number;
    itemTotal: number;
    godown: string;
    salesLedger: string;
    slabLine?: boolean;
    namedOnSheet?: boolean;
    taxKind?: "exempt" | "inter" | "intra";
    _matchedItemId?: string | number;
    _matchedHsnId?: string | number;
    itemFound: boolean;
    hsnFound: boolean;
    unitFound: boolean;
    cgstLedgerFound: boolean;
    sgstLedgerFound: boolean;
    igstLedgerFound: boolean;
    matchedCgstLedgerName?: string;
    matchedSgstLedgerName?: string;
    matchedIgstLedgerName?: string;
    salesLedgerFound: boolean;
    calculationWarning?: string;
}

// Accounting entry matching Manual Sales Voucher structure
interface ManualAccountingRow {
    srNo: number | string;
    ledgerName: string;
    amount: number;
    type: "Credit" | "Debit" | "credit" | "debit";
    action?: string;
    gstRate?: number;
    igst?: number;
    cgst?: number;
    sgst?: number;
    ledgerFound: boolean;
    _matchedLedgerId?: string | number;
    _isParty?: boolean;
    _isDiscount?: boolean;
    sheetColumn?: string;
}

// Grouped Voucher object containing Common Header + Rows + Validation Results
interface ManualGroupedVoucher {
    id: string;
    voucherDate: string;
    voucherNo: string; // Auto-generated from manual sales voucher sequence
    supplierInvoice: string; // Customer Invoice / Ref No
    invoiceDate: string;
    partyName: string; // Formatted: GST Number - Trader Name (if GST) or Trader Name (if no GST)
    rawPartyName: string; // Original Trader Name
    mode: "Item Invoice" | "Accounting Invoice" | "item-invoice" | "accounting-invoice";
    godownTracking: "Enabled (Yes)" | "Disabled (No)" | "yes" | "no";
    gstin: string;
    hasGst: boolean; // B2B (true) vs B2C (false)
    salesTypeCategory: "B2B" | "B2C";
    pos: string;
    totalDebit: number;
    totalCredit: number;
    invoiceValue: number;
    discountTotal?: number;
    salesLedger: string;
    overallDiscountLedger?: string;
    overallDiscountPct?: number;
    overallDiscountAmt?: number;
    overallDiscountLedgerFound?: boolean;
    status: "pending" | "importing" | "imported" | "error";
    errorMessage?: string;
    partyMatch: boolean; // Party Found / Not Found
    isBalanceMatched: boolean; // Debit === Credit
    _matchedLedgerId?: string | number;
    _matchedSalesLedgerId?: string | number;
    gstType: "same-state" | "different-state" | "unknown";
    companyStateCode: string;
    companyStateName: string;
    partyStateCode: string;
    partyStateName: string;
    items: ManualItemRow[];
    accountingEntries: ManualAccountingRow[];
}

// Helper: Normalize tax inputs (e.g. 18, "18%", 0.18 -> 18)
const parseTaxRate = (val: any): number => {
    if (val === undefined || val === null || val === "") return 0;
    if (typeof val === "number") {
        if (val > 0 && val < 1) return Number((val * 100).toFixed(2));
        return val;
    }
    const str = String(val).replace(/%/g, "").trim();
    const parsed = parseFloat(str);
    if (isNaN(parsed)) return 0;
    if (parsed > 0 && parsed < 1) return Number((parsed * 100).toFixed(2));
    return parsed;
};

// Helper: Display Format for Customer/Party — "GST Number - Trader Name" or "Trader Name"
const formatPartyDisplayName = (traderName: string, gstin?: string): { displayName: string; hasGst: boolean; cleanGstin: string } => {
    const cleanGst = gstin ? String(gstin).toUpperCase().replace(/\s+/g, "").trim() : "";
    const isValidGst = Boolean(cleanGst && cleanGst !== "NULL" && cleanGst !== "UNDEFINED" && cleanGst !== "NAN");
    const cleanName = (traderName || "").trim();

    if (isValidGst) {
        if (cleanName.toLowerCase().startsWith(cleanGst.toLowerCase())) {
            return { displayName: cleanName, hasGst: true, cleanGstin: cleanGst };
        }
        return { displayName: `${cleanGst} - ${cleanName}`, hasGst: true, cleanGstin: cleanGst };
    }
    return { displayName: cleanName, hasGst: false, cleanGstin: "" };
};

const SALES_SLABS: { purchase: string; kind: "exempt" | "inter" | "intra"; rate: number; tax?: string; cgst?: string; sgst?: string }[] = [
    { purchase: "exempt sales", kind: "exempt", rate: 0 },
    { purchase: "3% inter state sales", kind: "inter", rate: 3, tax: "igst3%" },
    { purchase: "3% intra state sales", kind: "intra", rate: 3, cgst: "cgst1.5%", sgst: "sgst1.5%" },
    { purchase: "5% inter state sales", kind: "inter", rate: 5, tax: "igst5%" },
    { purchase: "5% intra state sales", kind: "intra", rate: 5, cgst: "cgst2.5%", sgst: "sgst2.5%" },
    { purchase: "18% inter state sales", kind: "inter", rate: 18, tax: "igst18%" },
    { purchase: "18% intra state sales", kind: "intra", rate: 18, cgst: "cgst9%", sgst: "sgst9%" },
    { purchase: "28% inter state sales", kind: "inter", rate: 28, tax: "igst28%" },
    { purchase: "28% intra state sales", kind: "intra", rate: 28, cgst: "cgst14%", sgst: "sgst14%" },
];

const SALES_SLAB_HEADERS = [
    "Exempt sales", "3% inter state sales", "Igst3%", "3% intra state sales", "cgst1.5%", "sgst1.5%",
    "5% inter state sales", "Igst5%", "5% intra state sales", "cgst2.5%", "sgst2.5%",
    "18% inter state sales", "Igst18%", "18% intra state sales", "cgst9%", "sgst9%",
    "28% inter state sales", "Igst28%", "28% intra state sales", "cgst14%", "sgst14%",
    "Discount",
];

const SALES_ACCOUNTING_HEADERS = [
    "GSTIN of supplier", "SupplierName", "Invoice number", "Invoice Date", "Invoice Value (₹)",
    "Place of supply", "Supply Attract Reverse Charge",
    ...SALES_SLAB_HEADERS,
];

const SALES_ITEM_HEADERS = [
    "GSTIN of supplier", "SupplierName", "Invoice number", "Invoice Date", "Invoice Value (₹)",
    "Place of supply", "Supply Attract Reverse Charge", "Item Name", "Quantity", "Rate",
    ...SALES_SLAB_HEADERS,
];

const SALES_SAMPLE: Record<string, string> = {
    "GSTIN of supplier": "20AABCM4621M1ZR",
    "SupplierName": "ABC CUSTOMER CORP",
    "Invoice number": "EXAMPLE-001",
    "Invoice Date": "2026-11-19",
    "Place of supply": "Jharkhand",
    "Supply Attract Reverse Charge": "N",
    "Item Name": "MS Plate",
    "Quantity": "1",
    "Rate": "10000",
    "18% intra state sales": "10000",
    "cgst9%": "900",
    "sgst9%": "900",
    "Invoice Value (₹)": "11800",
};

const cellNumber = (val: any): number => {
    if (val === undefined || val === null || val === "") return 0;
    const parsed = parseFloat(String(val).replace(/,/g, "").replace(/%/g, "").trim());
    return isNaN(parsed) ? 0 : parsed;
};

const cellText = (value: any): string => {
    if (value === undefined || value === null) return "";
    const text = String(value).replace(/\s+/g, " ").trim();
    return text.toLowerCase() === "undefined" ? "" : text;
};

const SalesImport: React.FC = () => {
    const navigate = useNavigate();
    const { companyInfo } = useCompany();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [ledgers, setLedgers] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [stockUnits, setStockUnits] = useState<any[]>([]);
    const [salesTypes, setSalesTypes] = useState<any[]>([]);
    const [groupedVouchers, setGroupedVouchers] = useState<ManualGroupedVoucher[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [activeTab, setActiveTab] = useState<"import" | "preview" | "templates">("import");
    const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 });
    const [selectedMode, setSelectedMode] = useState<"Item Invoice" | "Accounting Invoice">("Item Invoice");
    const [viewLayout, setViewLayout] = useState<"card" | "table">("card");

    const companyId = localStorage.getItem("company_id") || "";
    const ownerType = localStorage.getItem("supplier") || "";
    const ownerId = localStorage.getItem(ownerType === "employee" ? "employee_id" : "user_id") || "";

    const fetchLedgersAndItems = async () => {
        if (!companyId || !ownerId || !ownerType) return;
        try {
            const [ledgerRes, itemRes, unitRes, salesTypesRes] = await Promise.all([
                axios.get(`${import.meta.env.VITE_API_URL}/api/ledger`, {
                    params: { company_id: companyId, owner_type: ownerType, owner_id: ownerId }
                }),
                axios.get(`${import.meta.env.VITE_API_URL}/api/stock-items`, {
                    params: { company_id: companyId, owner_type: ownerType, owner_id: ownerId }
                }),
                axios.get(`${import.meta.env.VITE_API_URL}/api/stock-units`, {
                    params: { company_id: companyId, owner_type: ownerType, owner_id: ownerId }
                }).catch(() => ({ data: [] })),
                axios.get(`${import.meta.env.VITE_API_URL}/api/sales-types`, {
                    params: { company_id: companyId, owner_type: ownerType, owner_id: ownerId }
                }).catch(() => ({ data: { data: [] } }))
            ]);
            setLedgers(Array.isArray(ledgerRes.data) ? ledgerRes.data : []);
            const fetchedItems = (itemRes.data as any)?.data || itemRes.data;
            setItems(Array.isArray(fetchedItems) ? fetchedItems : []);
            const fetchedUnits = (unitRes.data as any)?.data || unitRes.data;
            setStockUnits(Array.isArray(fetchedUnits) ? fetchedUnits : []);

            const fetchedTypes = (salesTypesRes.data as any)?.data || salesTypesRes.data;
            setSalesTypes(Array.isArray(fetchedTypes) ? fetchedTypes : []);
        } catch (err) {
            console.error("Error fetching masters:", err);
        }
    };

    useEffect(() => {
        fetchLedgersAndItems();
    }, [companyId, ownerType, ownerId]);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    };

    const handleFileSelect = (file: File) => {
        if (!file) return;
        const validTypes = [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "text/csv",
        ];
        if (!validTypes.includes(file.type)) {
            alert("Please select a valid Excel (.xlsx, .xls) or CSV file");
            return;
        }
        processFile(file);
    };

    const formatDate = (dateValue: any): string => {
        if (!dateValue) return "";
        try {
            if (typeof dateValue === "number") {
                const date = new Date((dateValue - 25569) * 86400 * 1000);
                return date.toISOString().split("T")[0];
            }
            if (typeof dateValue === "string") {
                const cleanDate = dateValue.trim();
                const dmyMatch = cleanDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
                if (dmyMatch) {
                    const day = dmyMatch[1].padStart(2, '0');
                    const month = dmyMatch[2].padStart(2, '0');
                    const year = dmyMatch[3];
                    return `${year}-${month}-${day}`;
                }
                const ymdMatch = cleanDate.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
                if (ymdMatch) {
                    const year = ymdMatch[1];
                    const month = ymdMatch[2].padStart(2, '0');
                    const day = ymdMatch[3].padStart(2, '0');
                    return `${year}-${month}-${day}`;
                }
            }
            const d = new Date(dateValue);
            if (isNaN(d.getTime())) {
                return new Date().toISOString().split("T")[0];
            }
            return d.toISOString().split("T")[0];
        } catch {
            return new Date().toISOString().split("T")[0];
        }
    };

    // Helper: Fetch starting Voucher Number from manual Sales Voucher API logic
    const fetchStartingVoucherNumber = async (date: string): Promise<string> => {
        try {
            const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/sales-vouchers/next-number`, {
                params: {
                    company_id: companyId,
                    owner_type: ownerType,
                    owner_id: ownerId,
                    voucherType: 'sales',
                    date
                }
            });
            if (res.data?.success && res.data?.voucherNumber) {
                return res.data.voucherNumber;
            }
        } catch (err) {
            console.error("Error fetching starting sales voucher number:", err);
        }
        return "SAL/26-27/000001";
    };

    // Helper: Increment voucher number string
    const getNextVoucherNumberInSequence = (baseNum: string, index: number): string => {
        if (!baseNum) return `SAL/26-27/${String(index + 1).padStart(6, '0')}`;
        const parts = baseNum.split("/");
        const lastPart = parts[parts.length - 1];
        const numVal = parseInt(lastPart, 10);
        if (!isNaN(numVal)) {
            const nextVal = numVal + index;
            parts[parts.length - 1] = String(nextVal).padStart(lastPart.length, '0');
            return parts.join("/");
        }
        return `${baseNum}-${index + 1}`;
    };

    // Helper: Flexible Ledger Resolution
    const matchLedgerFlexibly = (ledgerNameInput: string, ledgersList: any[]): any => {
        if (!ledgerNameInput) return null;
        const rawInput = ledgerNameInput.trim();
        if (!rawInput) return null;

        // 1. Direct exact match (lowercase, single space normalized)
        const cleanInput = rawInput.toLowerCase().replace(/\s+/g, " ").trim();
        let found = ledgersList.find(l => {
            const lName = (l.name || l.ledger_name || "").toLowerCase().replace(/\s+/g, " ").trim();
            return lName === cleanInput;
        });
        if (found) return found;

        // 2. No-whitespace match
        const noSpaceInput = rawInput.toLowerCase().replace(/[\s_]+/g, "");
        found = ledgersList.find(l => {
            const lNoSpace = (l.name || l.ledger_name || "").toLowerCase().replace(/[\s_]+/g, "");
            return lNoSpace === noSpaceInput;
        });
        if (found) return found;

        // 3. Special Tax Ledger matching: If input contains tax keywords ("cgst", "sgst", "igst", "gst")
        const lowerInput = rawInput.toLowerCase();
        const taxTypeMatch = lowerInput.match(/(cgst|sgst|igst|gst)/i);
        const numMatch = lowerInput.match(/(\d+(?:\.\d+)?)/);

        if (taxTypeMatch) {
            const taxType = taxTypeMatch[1].toLowerCase();
            const taxRate = numMatch ? numMatch[1] : "";

            found = ledgersList.find(l => {
                const lName = (l.name || l.ledger_name || "").toLowerCase();
                const lNoSpace = lName.replace(/[\s_]+/g, "");
                const hasTaxType = lName.includes(taxType);
                if (!hasTaxType) return false;

                if (taxRate) {
                    const lNumMatch = lName.match(/(\d+(?:\.\d+)?)/);
                    if (lNumMatch && lNumMatch[1] === taxRate) return true;
                    if (lName.includes(`${taxRate}%`) || lNoSpace.includes(`${taxRate}%`)) return true;
                    return false;
                }
                return true;
            });

            if (found) return found;

            found = ledgersList.find(l => {
                const lName = (l.name || l.ledger_name || "").toLowerCase();
                return lName === taxType || lName === `output ${taxType}` || lName === `input ${taxType}` || lName.includes(taxType);
            });
            if (found) return found;
        }

        // 4. Substring / Alias fallback. Empty or very short names must not match every ledger.
        found = ledgersList.find(l => {
            const lName = (l.name || l.ledger_name || "").toLowerCase().replace(/\s+/g, " ").trim();
            if (!lName || lName.length < 3 || cleanInput.length < 3) return false;
            return lName.includes(cleanInput) || cleanInput.includes(lName);
        });

        return found || null;
    };

    // Helper: Dynamic B2B / B2C Sales Ledger Resolution using configured Sales Types & Ledgers Master
    const resolveB2BOrB2CSalesLedger = (
        hasGst: boolean,
        itemGstRate: number,
        isSameState: boolean,
        ledgersList: any[],
        salesTypesList: any[],
        excelLedgerInput?: string
    ): { matchedLedger: any | null; error: string | null } => {
        // If Excel explicitly passed a sales ledger and it exists in master, validate if it matches B2B/B2C requirement
        const inputClean = (excelLedgerInput || "").trim().toLowerCase();
        let matched = inputClean ? matchLedgerFlexibly(inputClean, ledgersList) : null;

        // Dynamic B2B vs B2C keywords
        const categoryKeyword = hasGst ? "b2b" : "b2c";
        const secondaryKeywords = hasGst
            ? ["b2b", "regular", "business", "tax"]
            : ["b2c", "retail", "consumer", "unregistered", "cash"];

        // 1. Check if configured Sales Types define a ledger or type for B2B/B2C
        const configuredSalesType = salesTypesList.find(st => {
            const stName = (st.sales_type || st.name || "").toLowerCase();
            return stName.includes(categoryKeyword);
        }) || salesTypesList.find(st => {
            const stName = (st.sales_type || st.name || "").toLowerCase();
            return secondaryKeywords.some(kw => stName.includes(kw));
        });

        // 2. Search for Sales Ledger in Ledgers Master based on B2B / B2C classification & Rate/State
        if (!matched) {
            const rateStr = itemGstRate > 0 ? `${itemGstRate}%` : "";
            const stateStr = isSameState ? "intra" : "inter";

            // Try exact B2B/B2C + Rate + State match (e.g., "18% B2B Intra State Sales" or "18% B2C Local Sales")
            matched = ledgersList.find(l => {
                const lName = (l.name || "").toLowerCase();
                if (!lName.includes("sale")) return false;
                if (!lName.includes(categoryKeyword)) return false;
                if (rateStr && !lName.includes(rateStr)) return false;
                if (stateStr && !lName.includes(stateStr) && !lName.includes(isSameState ? "local" : "igst")) return false;
                return true;
            });

            // Fallback: Match any B2B / B2C sales ledger
            if (!matched) {
                matched = ledgersList.find(l => {
                    const lName = (l.name || "").toLowerCase();
                    return lName.includes("sale") && lName.includes(categoryKeyword);
                });
            }

            // Fallback: Match by Rate & State (if explicit B2B/B2C word not present in ledger name)
            if (!matched) {
                matched = ledgersList.find(l => {
                    const lName = (l.name || "").toLowerCase();
                    if (!lName.includes("sale")) return false;
                    if (rateStr && !lName.includes(rateStr)) return false;
                    if (stateStr && !lName.includes(stateStr) && !lName.includes(isSameState ? "local" : "igst")) return false;
                    return true;
                });
            }

            // Fallback: Generic Sales Account
            if (!matched) {
                matched = ledgersList.find(l => {
                    const lName = (l.name || "").toLowerCase();
                    return lName.includes("sales account") || lName === "sales" || lName === "sales account";
                });
            }
        }

        // Enforce Validation Rule: Do not silently fallback if B2B/B2C is strictly required
        if (hasGst) {
            // Customer HAS GST -> Must be B2B
            if (!matched) {
                return { matchedLedger: null, error: "B2B Sales Ledger is not configured." };
            }
        } else {
            // Customer DOES NOT HAVE GST -> Must be B2C
            if (!matched) {
                return { matchedLedger: null, error: "B2C Sales Ledger is not configured." };
            }
        }

        return { matchedLedger: matched, error: null };
    };

    // Helper: Tax Ledger Resolution using flexible matching
    const resolveTaxLedger = (taxType: 'CGST' | 'SGST' | 'IGST', rateVal: number, ledgersList: any[]): { found: boolean; ledgerName: string } => {
        if (!rateVal || rateVal <= 0) return { found: true, ledgerName: "" };
        const queryStr = `${rateVal}% ${taxType}`;
        const matched = matchLedgerFlexibly(queryStr, ledgersList) || matchLedgerFlexibly(`${taxType} ${rateVal}%`, ledgersList) || matchLedgerFlexibly(taxType, ledgersList);
        return { found: !!matched, ledgerName: matched ? (matched.name || matched.ledger_name || "") : "" };
    };

    // Helper: Flexible Unit Resolution with stock-units API & aliases
    const resolveUnit = (inputUnit: string, matchedItem: any, unitsList: any[]): boolean => {
        if (!inputUnit) return true;
        const cleanInput = inputUnit.toLowerCase().replace(/\s+/g, "").trim();
        if (!cleanInput) return true;

        const itemUnitRaw = matchedItem?.unit || matchedItem?.unit_name || matchedItem?.unitSymbol || "";
        const cleanItemUnit = String(itemUnitRaw).toLowerCase().replace(/\s+/g, "").trim();

        const matchedUnitObj = unitsList.find(u =>
            String(u.id) === String(itemUnitRaw) ||
            (u.symbol || "").toLowerCase().trim() === cleanInput ||
            (u.name || "").toLowerCase().trim() === cleanInput
        );

        if (matchedUnitObj) {
            const uSymbol = (matchedUnitObj.symbol || "").toLowerCase().replace(/\s+/g, "").trim();
            const uName = (matchedUnitObj.name || "").toLowerCase().replace(/\s+/g, "").trim();
            if (cleanInput === uSymbol || cleanInput === uName || uSymbol.includes(cleanInput) || cleanInput.includes(uSymbol)) {
                return true;
            }
        }

        if (cleanItemUnit && (cleanInput === cleanItemUnit || cleanItemUnit.includes(cleanInput) || cleanInput.includes(cleanItemUnit))) {
            return true;
        }

        const unitAliasGroups: { [key: string]: string[] } = {
            kg: ['kg', 'kgs', 'kilogram', 'kilograms', 'k.g.'],
            pcs: ['pc', 'pcs', 'piece', 'pieces', 'no', 'nos', 'number', 'numbers'],
            bag: ['bag', 'bags', 'bg'],
            box: ['box', 'boxes', 'bxs', 'bx'],
            mtr: ['mtr', 'mtrs', 'meter', 'meters', 'm'],
        };

        for (const group of Object.values(unitAliasGroups)) {
            const inputInGroup = group.includes(cleanInput);
            const itemUnitInGroup = group.includes(cleanItemUnit);
            const matchedUnitSymbolInGroup = matchedUnitObj ? group.includes((matchedUnitObj.symbol || "").toLowerCase()) : false;
            if (inputInGroup && (itemUnitInGroup || matchedUnitSymbolInGroup)) {
                return true;
            }
        }

        if (matchedItem) return true;
        return false;
    };

    // Process Excel File with Auto Voucher Numbering, Master Validations, B2B/B2C Mapping & Double-Entry Check
    const processFile = async (file: File) => {
        setIsProcessing(true);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

            if (!rawRows || !rawRows.length) {
                alert("The Excel file is empty!");
                setIsProcessing(false);
                return;
            }

            const rawGroups: { [key: string]: any } = {};

            // Check if sheet uses 2-Section Block Layout
            let isBlockLayout = false;
            for (let r = 0; r < Math.min(10, rawRows.length); r++) {
                const rowStr = (rawRows[r] || []).map(c => String(c || "").toLowerCase()).join(" ");
                if (
                    rowStr.includes("voucher date") &&
                    (rowStr.includes("party") || rowStr.includes("customer") || rowStr.includes("invoice")) &&
                    !rowStr.includes("item") && !rowStr.includes("sr no") && !rowStr.includes("ledger")
                ) {
                    isBlockLayout = true;
                    break;
                }
            }

            const headerRow = rawRows.find((row) => (row || []).some((cell) => String(cell || "").toLowerCase().includes("voucher date"))) || [];
            const headerNames = headerRow.map((cell) => String(cell || "").toLowerCase().trim());
            const sheetHasItemColumns = headerNames.some((name) => name === "item" || name === "item name" || name === "quantity" || name === "qty" || name === "rate");
            const sheetHasLedgerTypeColumns = headerNames.some((name) => /^ledger(?:\s+\d+)?$/.test(name) || /^type(?:\s+\d+)?$/.test(name));
            const sheetStyle: "item" | "ledger" | "accounting" = sheetHasItemColumns ? "item" : sheetHasLedgerTypeColumns ? "ledger" : "accounting";

            let firstVoucherDate = new Date().toISOString().split("T")[0];

            const rowText = (row: any[]) => (row || []).map((cell) => String(cell || "").toLowerCase().trim());
            const slabHeaderIndex = rawRows.findIndex((row) => {
                const cells = rowText(row);
                return cells.some((cell) => cell.includes("gstin of supplier") || cell.includes("gstin of customer"))
                    && cells.some((cell) => cell.includes("exempt purchase") || cell.includes("exempt sales"));
            });
            const useSlabLayout = slabHeaderIndex !== -1;

            if (useSlabLayout) {
                const header = rowText(rawRows[slabHeaderIndex]);
                const rawHeader = (rawRows[slabHeaderIndex] || []).map((cell) => String(cell || "").trim());
                const colAlias = (name: string) => {
                    const aliases = new Set([
                        name,
                        name.replace(/purchase/g, "sales"),
                        name.replace(/sales/g, "purchase"),
                        name.replace(/supplier/g, "customer"),
                        name.replace(/customer/g, "supplier"),
                    ]);
                    return header.findIndex((cell) => aliases.has(cell));
                };
                const headerLabel = (name: string) => {
                    const index = colAlias(name);
                    return index >= 0 ? (rawHeader[index] || name) : name;
                };
                const slabIsItem = header.some((cell) => cell === "item name" || cell === "quantity" || cell === "rate");
                const gstinCol = colAlias("gstin of supplier");
                const partyCol = header.findIndex((cell) => ["suppliername", "supplier name", "customername", "customer name"].includes(cell));
                const invoiceCol = header.findIndex((cell) => cell === "invoice number" || cell === "supplier invoice");
                const invoiceDateCol = colAlias("invoice date");
                const posCol = colAlias("place of supply");
                const itemNameCol = colAlias("item name");
                const qtyCol = colAlias("quantity");
                const rateCol = colAlias("rate");
                const discountCol = colAlias("discount");

                const salesLedgerForSlab = (label: string, rate: number, kind: "exempt" | "inter" | "intra", gstin: string) => {
                    const salesLabel = label.replace(/purchase/ig, "sales");
                    const exact = ledgers.find((ledger) => (ledger.name || ledger.ledger_name || "").toLowerCase().replace(/\s+/g, " ").trim() === salesLabel.toLowerCase());
                    if (exact) return exact.name || exact.ledger_name;
                    const hasCustomerGst = Boolean(gstin && !["NULL", "UNDEFINED", "NAN"].includes(gstin.toUpperCase()));
                    const resolved = resolveB2BOrB2CSalesLedger(hasCustomerGst, rate, kind !== "inter", ledgers, salesTypes, "");
                    return resolved.matchedLedger?.name || resolved.matchedLedger?.ledger_name || salesLabel;
                };
                const outputTaxName = (taxType: "CGST" | "SGST" | "IGST", rate: number, fallback: string) => {
                    const resolved = resolveTaxLedger(taxType, rate, ledgers);
                    return resolved.found && resolved.ledgerName ? resolved.ledgerName : fallback;
                };

                for (let r = slabHeaderIndex + 1; r < rawRows.length; r++) {
                    const row = rawRows[r] || [];
                    const partyName = cellText(partyCol >= 0 ? row[partyCol] : "");
                    const invoiceNo = cellText(invoiceCol >= 0 ? row[invoiceCol] : "");
                    const gstin = cellText(gstinCol >= 0 ? row[gstinCol] : "").toUpperCase().replace(/\s+/g, "");
                    if (!partyName && !invoiceNo && !gstin) continue;
                    if (["invoice number", "suppliername", "customername", "gstin of supplier", "gstin of customer"].includes(partyName.toLowerCase())) continue;

                    const invoiceDate = formatDate(invoiceDateCol >= 0 ? row[invoiceDateCol] : "") || new Date().toISOString().split("T")[0];
                    if (Object.keys(rawGroups).length === 0) firstVoucherDate = invoiceDate;
                    const groupKey = `${invoiceDate}-${invoiceNo || gstin}-${partyName || gstin}`;
                    const sheetItemName = itemNameCol >= 0 ? cellText(row[itemNameCol]) : "";
                    const sheetQty = qtyCol >= 0 ? cellNumber(row[qtyCol]) : 0;
                    const sheetRate = rateCol >= 0 ? cellNumber(row[rateCol]) : 0;
                    const discount = discountCol >= 0 ? cellNumber(row[discountCol]) : 0;
                    const filledSlabs = SALES_SLABS.filter((slab) => {
                        const index = colAlias(slab.purchase);
                        return index >= 0 && cellNumber(row[index]) > 0;
                    });
                    if (filledSlabs.length === 0) continue;

                    if (!rawGroups[groupKey]) {
                        rawGroups[groupKey] = {
                            id: `v-${r}`,
                            voucherDate: invoiceDate,
                            supplierInvoice: invoiceNo || `INV-${Object.keys(rawGroups).length + 1}`,
                            invoiceDate,
                            partyName: partyName || gstin || "Customer",
                            rawGstin: gstin,
                            pos: cellText(posCol >= 0 ? row[posCol] : ""),
                            mode: slabIsItem ? "Item Invoice" : "Accounting Invoice",
                            godownTracking: "Enabled (Yes)",
                            items: [],
                            accountingLines: [],
                            accountingEntries: [],
                            overallDiscountLedger: "",
                            overallDiscountPct: 0,
                            overallDiscountAmt: 0,
                            salesLedger: "",
                        };
                    }

                    let discountAssigned = rawGroups[groupKey].items.some((it: any) => Number(it.discount) > 0) || rawGroups[groupKey].accountingEntries.some((entry: any) => entry._isDiscount);
                    let creditTotal = 0;
                    const pushAccounting = (ledgerName: string, amount: number, type: "Debit" | "Credit", extra: any = {}) => {
                        if (!ledgerName || amount <= 0) return;
                        rawGroups[groupKey].accountingEntries.push({
                            srNo: rawGroups[groupKey].accountingEntries.length + 1,
                            ledgerName,
                            amount,
                            type,
                            ...extra,
                        });
                    };

                    filledSlabs.forEach((slab) => {
                        const amountCol = colAlias(slab.purchase);
                        const taxable = cellNumber(row[amountCol]);
                        let cgstAmount = 0;
                        let sgstAmount = 0;
                        let igstAmount = 0;
                        if (slab.kind === "inter" && slab.tax) {
                            const taxCol = colAlias(slab.tax);
                            const cached = taxCol >= 0 ? cellNumber(row[taxCol]) : 0;
                            igstAmount = cached > 0 ? cached : Number(((taxable * slab.rate) / 100).toFixed(2));
                        } else if (slab.kind === "intra" && slab.cgst && slab.sgst) {
                            const cachedCgst = colAlias(slab.cgst) >= 0 ? cellNumber(row[colAlias(slab.cgst)]) : 0;
                            const cachedSgst = colAlias(slab.sgst) >= 0 ? cellNumber(row[colAlias(slab.sgst)]) : 0;
                            const half = Number(((taxable * (slab.rate / 2)) / 100).toFixed(2));
                            cgstAmount = cachedCgst > 0 ? cachedCgst : half;
                            sgstAmount = cachedSgst > 0 ? cachedSgst : half;
                        }

                        const salesLedger = salesLedgerForSlab(headerLabel(slab.purchase), slab.rate, slab.kind, gstin);
                        if (!rawGroups[groupKey].salesLedger) rawGroups[groupKey].salesLedger = salesLedger;

                        if (!slabIsItem) {
                            pushAccounting(salesLedger, taxable, "Credit", { sheetColumn: slab.purchase });
                            creditTotal += taxable;
                            if (igstAmount > 0 && slab.tax) {
                                pushAccounting(outputTaxName("IGST", slab.rate, headerLabel(slab.tax)), igstAmount, "Credit", { sheetColumn: slab.tax });
                                creditTotal += igstAmount;
                            }
                            if (cgstAmount > 0 && slab.cgst) {
                                pushAccounting(outputTaxName("CGST", slab.rate / 2, headerLabel(slab.cgst)), cgstAmount, "Credit", { sheetColumn: slab.cgst });
                                creditTotal += cgstAmount;
                            }
                            if (sgstAmount > 0 && slab.sgst) {
                                pushAccounting(outputTaxName("SGST", slab.rate / 2, headerLabel(slab.sgst)), sgstAmount, "Credit", { sheetColumn: slab.sgst });
                                creditTotal += sgstAmount;
                            }
                            return;
                        }

                        const quantity = sheetQty > 0 ? sheetQty : 1;
                        const rate = sheetRate > 0 && filledSlabs.length === 1 ? sheetRate : Number((taxable / quantity).toFixed(2));
                        const lineDiscount = !discountAssigned ? discount : 0;
                        rawGroups[groupKey].items.push({
                            srNo: rawGroups[groupKey].items.length + 1,
                            itemName: sheetItemName || salesLedger,
                            hsnCode: "",
                            quantity,
                            unit: "PCS",
                            rate,
                            discount: lineDiscount,
                            rawGstRate: slab.rate,
                            gstRate: slab.rate,
                            sgstRate: slab.kind === "intra" ? slab.rate / 2 : 0,
                            cgstRate: slab.kind === "intra" ? slab.rate / 2 : 0,
                            igstRate: slab.kind === "inter" ? slab.rate : 0,
                            sgstAmount,
                            cgstAmount,
                            igstAmount,
                            taxableValue: taxable,
                            itemTotal: taxable + cgstAmount + sgstAmount + igstAmount,
                            godown: "Main Location",
                            salesLedger,
                            slabLine: true,
                            namedOnSheet: !!sheetItemName,
                            taxKind: slab.kind,
                        });
                        if (discount > 0) discountAssigned = true;
                    });

                    if (!slabIsItem && creditTotal > 0) {
                        const rowDiscount = discountAssigned ? 0 : discount;
                        if (rowDiscount > 0) pushAccounting(headerLabel("discount"), rowDiscount, "Debit", { _isDiscount: true, sheetColumn: "discount" });
                        pushAccounting(partyName || gstin || rawGroups[groupKey].partyName || "Customer", Math.max(0, Number((creditTotal - rowDiscount).toFixed(2))), "Debit", { _isParty: true, sheetColumn: "customer" });
                    }
                }
            }

            if (!useSlabLayout && isBlockLayout) {
                let currentGroup: any = null;
                for (let r = 0; r < rawRows.length; r++) {
                    const row = rawRows[r] || [];
                    const rowStr = row.map(c => String(c || "").trim()).join(" | ");
                    const lowerRowStr = rowStr.toLowerCase();

                    if (lowerRowStr.includes("voucher date") && (lowerRowStr.includes("invoice") || lowerRowStr.includes("customer") || lowerRowStr.includes("party"))) {
                        const lowerHeaderRow = row.map(c => String(c || "").toLowerCase().trim());
                        let vDateCol = lowerHeaderRow.findIndex(c => c.includes("voucher date") || (c.includes("date") && !c.includes("invoice")));
                        let suppInvCol = lowerHeaderRow.findIndex(c => c.includes("invoice number") || c.includes("invoice no") || c.includes("inv no") || c.includes("reference no") || c.includes("ref no"));
                        let invDateCol = lowerHeaderRow.findIndex(c => c.includes("invoice date"));
                        let partyCol = lowerHeaderRow.findIndex(c => (c.includes("party") || c.includes("customer") || c.includes("trade/legal")) && !c.includes("invoice"));
                        let modeCol = lowerHeaderRow.findIndex(c => c.includes("mode") || c.includes("transaction"));
                        let godownCol = lowerHeaderRow.findIndex(c => c.includes("godown"));
                        let gstinCol = lowerHeaderRow.findIndex(c => c.includes("gstin") || c.includes("gst"));

                        if (vDateCol === -1) vDateCol = 0;
                        if (suppInvCol === -1) suppInvCol = 1;
                        if (invDateCol === -1) invDateCol = 2;
                        if (partyCol === -1) partyCol = 3;
                        if (modeCol === -1) modeCol = 4;
                        if (godownCol === -1) godownCol = 5;

                        const valRow = rawRows[r + 1] || [];
                        const vDate = formatDate(valRow[vDateCol]);
                        const suppInv = String(valRow[suppInvCol] || "").trim();
                        const invDate = formatDate(valRow[invDateCol] || vDate);
                        const partyName = cellText(valRow[partyCol]);
                        const rawGstin = gstinCol !== -1 ? cellText(valRow[gstinCol]) : "";
                        const modeStr = String(valRow[modeCol] || selectedMode).trim();
                        const godownTrkStr = String(valRow[godownCol] || "Enabled (Yes)").trim();

                        const mode: "Item Invoice" | "Accounting Invoice" = modeStr.toLowerCase().includes("accounting") ? "Accounting Invoice" : "Item Invoice";
                        const groupKey = `${vDate}-${suppInv}-${partyName}`;

                        if (vDate && !firstVoucherDate) firstVoucherDate = vDate;

                        currentGroup = {
                            id: `v-${r}`,
                            voucherDate: vDate || new Date().toISOString().split("T")[0],
                            supplierInvoice: suppInv || `INV-${Object.keys(rawGroups).length + 1}`,
                            invoiceDate: invDate || vDate || new Date().toISOString().split("T")[0],
                            partyName: partyName || "Customer",
                            rawGstin,
                            mode,
                            godownTracking: godownTrkStr.toLowerCase().includes("no") ? "Disabled (No)" : "Enabled (Yes)",
                            items: [],
                            accountingLines: [],
                            accountingEntries: [],
                            overallDiscountLedger: "",
                            overallDiscountPct: 0,
                            overallDiscountAmt: 0
                        };
                        rawGroups[groupKey] = currentGroup;
                        setSelectedMode(mode);
                        r++;
                        continue;
                    }

                    if (currentGroup) {
                        if (currentGroup.mode === "Item Invoice") {
                            const itemName = String(row[1] || row[0] || "").trim();
                            const qty = Number(row[3] || row[2] || 0);
                            const rate = Number(row[5] || row[4] || 0);
                            const rawTaxable = row[8] !== undefined ? row[8] : (qty * rate);
                            const taxableVal = Number(rawTaxable || 0);

                            if (itemName && itemName !== "Item" && !itemName.toLowerCase().includes("sr no")) {
                                const singleGst = parseTaxRate(row[12] !== undefined ? row[12] : (row[13] !== undefined ? row[13] : row[14]));
                                const discount = parseTaxRate(row[13] !== undefined && row[12] !== undefined ? row[13] : (row[15] || 0));

                                currentGroup.items.push({
                                    srNo: currentGroup.items.length + 1,
                                    itemName,
                                    hsnCode: String(row[8] || row[2] || "").trim(),
                                    quantity: qty,
                                    unit: String(row[10] || row[4] || "PCS").trim(),
                                    rate,
                                    discount,
                                    rawGstRate: singleGst,
                                    gstRate: singleGst,
                                    sgstRate: 0,
                                    cgstRate: 0,
                                    igstRate: 0,
                                    sgstAmount: 0,
                                    cgstAmount: 0,
                                    igstAmount: 0,
                                    taxableValue: taxableVal,
                                    itemTotal: taxableVal,
                                    godown: String(row[15] || row[16] || row[17] || "Main Location").trim(),
                                    salesLedger: String(row[16] || row[17] || row[18] || "18% Sales Account").trim(),
                                });
                            }
                        } else {
                            let addedEntries = false;
                            for (let c = 0; c < row.length; c += 3) {
                                const ledgerName = String(row[c] || "").trim();
                                const amount = Number(row[c + 1] || 0);
                                const typeStr = String(row[c + 2] || "Debit").trim();
                                const type: "Credit" | "Debit" = typeStr.toLowerCase().startsWith("c") ? "Credit" : "Debit";

                                if (ledgerName && ledgerName !== "Ledger" && !ledgerName.toLowerCase().includes("amount") && !ledgerName.toLowerCase().includes("voucher date")) {
                                    currentGroup.accountingEntries.push({
                                        srNo: currentGroup.accountingEntries.length + 1,
                                        ledgerName,
                                        amount,
                                        type,
                                    });
                                    addedEntries = true;
                                }
                            }
                        }
                    }
                }
            } else if (!useSlabLayout) {
                // Tabular sheet parsing
                const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
                let lastHeader: any = null;

                jsonData.forEach((row, index) => {
                    const rawVDate = row["Voucher Date"] || row["Date"] || row["Invoice Date"];
                    const rawSuppInv = cellText(row["Invoice number"] || row["Invoice No"] || row["Customer Invoice"] || row["Ref No"] || row["Reference No"] || row["Supplier Invoice"]);
                    const rawPartyName = cellText(row["Trade/Legal name of the Customer"] || row["Party / Customer Name"] || row["Customer Name"] || row["Party Name"] || row["Trade/Legal name of the Supplier"]);
                    const rawGstin = cellText(row["GSTIN of Customer"] || row["GSTIN of customer"] || row["GSTIN"] || row["GSTIN of supplier"] || "");
                    const rawMode = row["Transaction Mode"] || row["Mode"];
                    const rawGodownTrk = row["Godown Tracking"];

                    const rawOvDiscLedger = cellText(row["Overall Discount Ledger"] || row["Discount Ledger"] || row["Overall Discount Ledger Name"] || (lastHeader ? lastHeader.ovDiscLedger : "") || "");
                    const rawOvDiscPct = parseTaxRate(row["Overall Discount (%)"] || row["Overall Discount %"] || (lastHeader ? lastHeader.ovDiscPct : 0));
                    const rawOvDiscAmt = Number(row["Overall Discount (₹)"] || row["Overall Discount Amount"] || row["Overall all Discount (₹)"] || row["Overall Discount"] || (lastHeader ? lastHeader.ovDiscAmt : 0) || 0);

                    const hasExplicitHeader = Boolean(
                        (rawVDate !== undefined && String(rawVDate).trim() !== "") ||
                        (rawSuppInv !== undefined && String(rawSuppInv).trim() !== "") ||
                        (rawPartyName !== undefined && String(rawPartyName).trim() !== "")
                    );

                    let vDate = "";
                    let suppInv = "";
                    let invDate = "";
                    let partyName = "";
                    let godownTrk = "Enabled (Yes)";
                    let mode = selectedMode;
                    let groupKey = "";

                    if (hasExplicitHeader || !lastHeader) {
                        vDate = formatDate(rawVDate || (lastHeader ? lastHeader.vDate : ""));
                        suppInv = String(rawSuppInv || (lastHeader ? lastHeader.suppInv : "")).trim();
                        invDate = formatDate(row["Invoice Date"] || vDate || (lastHeader ? lastHeader.invDate : ""));
                        partyName = String(rawPartyName || (lastHeader ? lastHeader.partyName : "")).replace(/\s+/g, " ").trim();
                        godownTrk = String(rawGodownTrk || (lastHeader ? lastHeader.godownTrk : "Enabled (Yes)")).trim();
                        if (sheetStyle === "item") {
                            mode = "Item Invoice";
                        } else if (sheetStyle === "accounting" || sheetStyle === "ledger") {
                            mode = "Accounting Invoice";
                        } else if (rawMode) {
                            mode = String(rawMode).toLowerCase().includes("accounting") ? "Accounting Invoice" : "Item Invoice";
                        }

                        const resolvedVDate = vDate || new Date().toISOString().split("T")[0];
                        const resolvedSuppInv = suppInv || `INV-${index + 1}`;
                        const resolvedPartyName = partyName || "Customer";

                        groupKey = `${resolvedVDate}-${resolvedSuppInv}-${resolvedPartyName}`;
                        lastHeader = {
                            vDate: resolvedVDate,
                            suppInv: resolvedSuppInv,
                            invDate: invDate || resolvedVDate,
                            partyName: resolvedPartyName,
                            rawGstin,
                            godownTrk,
                            mode,
                            groupKey,
                            ovDiscLedger: rawOvDiscLedger,
                            ovDiscPct: rawOvDiscPct,
                            ovDiscAmt: rawOvDiscAmt
                        };
                    } else {
                        vDate = lastHeader.vDate;
                        suppInv = lastHeader.suppInv;
                        invDate = lastHeader.invDate;
                        partyName = lastHeader.partyName;
                        godownTrk = lastHeader.godownTrk;
                        mode = lastHeader.mode;
                        groupKey = lastHeader.groupKey;
                    }

                    if (vDate && !firstVoucherDate) firstVoucherDate = vDate;

                    if (!rawGroups[groupKey]) {
                        rawGroups[groupKey] = {
                            id: `v-${index}`,
                            voucherDate: vDate || new Date().toISOString().split("T")[0],
                            supplierInvoice: suppInv || `INV-${index + 1}`,
                            invoiceDate: invDate || vDate || new Date().toISOString().split("T")[0],
                            partyName: partyName || "Customer",
                            rawGstin: rawGstin || (lastHeader ? lastHeader.rawGstin : ""),
                            mode,
                            godownTracking: godownTrk.toLowerCase().includes("no") ? "Disabled (No)" : "Enabled (Yes)",
                            items: [],
                            accountingLines: [],
                            accountingEntries: [],
                            overallDiscountLedger: rawOvDiscLedger,
                            overallDiscountPct: rawOvDiscPct,
                            overallDiscountAmt: rawOvDiscAmt
                        };
                    }

                    if (mode === "Item Invoice") {
                        const itemName = cellText(row["Item"] || row["Item Name"] || "");
                        const qty = Number(row["Quantity"] || row["Qty"] || 0);
                        const rate = Number(row["Rate"] || row["Item Rate (₹)"] || 0);
                        const taxableVal = Number(row["Taxable"] || row["Taxable Value (₹)"] || (qty * rate));
                        const discount = parseTaxRate(row["Discount"] || row["Discount (₹)"] || row["Discount (%)"] || 0);
                        
                        const singleGst = parseTaxRate(
                            row["GST"] !== undefined ? row["GST"] :
                            row["GST (%)"] !== undefined ? row["GST (%)"] :
                            row["GST Rate"] !== undefined ? row["GST Rate"] :
                            row["GST Rate (%)"] !== undefined ? row["GST Rate (%)"] :
                            row["Rate (%)"] !== undefined ? row["Rate (%)"] :
                            (parseTaxRate(row["CGST (%)"] || row["CGST"] || 0) + parseTaxRate(row["SGST (%)"] || row["SGST"] || 0) || parseTaxRate(row["IGST (%)"] || row["IGST"] || 0))
                        );

                        if (itemName || taxableVal > 0) {
                            rawGroups[groupKey].items.push({
                                srNo: rawGroups[groupKey].items.length + 1,
                                itemName: itemName || "Item",
                                hsnCode: cellText(row["HSN/SAC"] || row["HSN Code"] || ""),
                                quantity: qty,
                                unit: cellText(row["Unit"] || "PCS") || "PCS",
                                rate,
                                discount,
                                rawGstRate: singleGst,
                                gstRate: singleGst,
                                sgstRate: 0,
                                cgstRate: 0,
                                igstRate: 0,
                                sgstAmount: 0,
                                cgstAmount: 0,
                                igstAmount: 0,
                                taxableValue: taxableVal,
                                itemTotal: taxableVal,
                                godown: cellText(row["Godown"] || row["Batch No"] || "Main Location") || "Main Location",
                                salesLedger: cellText(row["Sales-Ledger"] || row["Sales Ledger"] || ""),
                            });
                        }
                    } else if (sheetStyle === "accounting") {
                        const taxableVal = Number(row["Taxable"] || row["Taxable Value (₹)"] || 0);
                        const discount = parseTaxRate(row["Discount"] || row["Discount (₹)"] || row["Discount (%)"] || 0);
                        const singleGst = parseTaxRate(
                            row["GST"] !== undefined ? row["GST"] :
                            row["GST (%)"] !== undefined ? row["GST (%)"] :
                            row["GST Rate"] !== undefined ? row["GST Rate"] :
                            row["GST Rate (%)"] !== undefined ? row["GST Rate (%)"] :
                            row["Rate (%)"] !== undefined ? row["Rate (%)"] :
                            (parseTaxRate(row["CGST (%)"] || row["CGST"] || 0) + parseTaxRate(row["SGST (%)"] || row["SGST"] || 0) || parseTaxRate(row["IGST (%)"] || row["IGST"] || 0))
                        );
                        const salesLedger = cellText(row["Sales-Ledger"] || row["Sales Ledger"] || "");
                        if (taxableVal > 0 || salesLedger) {
                            rawGroups[groupKey].accountingLines.push({
                                taxable: taxableVal,
                                discount,
                                gstRate: singleGst,
                                salesLedger,
                            });
                        }
                    } else {
                        // Older accounting sheets that still use Ledger / Amount / Type columns
                        let hasHorizontalKeys = false;
                        for (let k = 1; k <= 10; k++) {
                            if (row[`Ledger ${k}`] || row[`Ledger_${k}`] || row[`Particulars ${k}`]) {
                                hasHorizontalKeys = true;
                                break;
                            }
                        }

                        if (hasHorizontalKeys) {
                            for (let k = 1; k <= 15; k++) {
                                const ledgerName = cellText(
                                    row[`Ledger ${k}`] || row[`Ledger_${k}`] || row[`Particulars ${k}`] || ""
                                );
                                const amount = Number(
                                    row[`Amount ${k}`] || row[`Amount_${k}`] || row[`Amount (₹) ${k}`] || 0
                                );
                                const typeStr = String(
                                    row[`Type ${k}`] || row[`Type_${k}`] || row[`Debit/Credit ${k}`] || "Debit"
                                ).trim();
                                const type: "Credit" | "Debit" = typeStr.toLowerCase().startsWith("c") ? "Credit" : "Debit";

                                if ((ledgerName || amount > 0) && ledgerName.toLowerCase() !== "ledger" && !ledgerName.toLowerCase().includes("amount")) {
                                    rawGroups[groupKey].accountingEntries.push({
                                        srNo: rawGroups[groupKey].accountingEntries.length + 1,
                                        ledgerName,
                                        amount,
                                        type
                                    });
                                }
                            }
                        } else {
                            // Vertical multi-row fallback
                            const ledgerName = cellText(row["Ledger"] || row["Particulars (Ledger Name)"] || row["Particulars"] || "");
                            const amount = Number(row["Amount"] || row["Amount (₹)"] || 0);
                            const typeStr = String(row["Type"] || "Debit").trim();
                            const type: "Credit" | "Debit" = typeStr.toLowerCase().startsWith("c") ? "Credit" : "Debit";
                            if (ledgerName || amount > 0) {
                                rawGroups[groupKey].accountingEntries.push({
                                    srNo: rawGroups[groupKey].accountingEntries.length + 1,
                                    ledgerName,
                                    amount,
                                    type
                                });
                            }
                        }
                    }
                });
            }

            // Fetch starting Voucher Number from manual Sales Voucher API logic
            const startingVoucherNum = await fetchStartingVoucherNumber(firstVoucherDate);

            // Validate Each Voucher & Assign Auto Voucher Number
            const groupList = Object.values(rawGroups).filter((group: any) => (group.items || []).length > 0 || (group.accountingEntries || []).length > 0 || (group.accountingLines || []).length > 0);
            if (groupList[0]?.mode === "Item Invoice" || groupList[0]?.mode === "Accounting Invoice") {
                setSelectedMode(groupList[0].mode);
            }
            const validatedVouchers: ManualGroupedVoucher[] = [];

            groupList.forEach((group, idx) => {
                const autoVoucherNo = getNextVoucherNumberInSequence(startingVoucherNum, idx);
                let errors: string[] = [];

                // 1. Party / Customer Name Resolution & Validation against Ledgers Master
                let rawPartyName = cellText(group.partyName);
                if (rawPartyName.toLowerCase() === "customer") rawPartyName = "";
                if (group.mode === "Accounting Invoice" && !rawPartyName) {
                    const debitEntry = group.accountingEntries.find((e: any) => String(e.type).toLowerCase() === "debit");
                    if (debitEntry) rawPartyName = cellText(debitEntry.ledgerName);
                }
                const cleanPartyName = rawPartyName.toLowerCase().replace(/\s+/g, " ").trim();
                const sheetGstin = cellText(group.rawGstin || group.gstin).toUpperCase().replace(/\s+/g, "");
                const cleanGstin = ["", "NULL", "UNDEFINED", "NAN"].includes(sheetGstin) ? "" : sheetGstin;

                const matchedPartyLedger = (rawPartyName || cleanGstin)
                    ? ledgers.find(l => {
                        const lName = (l.name || "").toLowerCase().replace(/\s+/g, " ").trim();
                        return cleanPartyName && lName === cleanPartyName;
                    }) || ledgers.find(l => {
                        const lGst = (l.gst_number || l.gstNumber || "").toUpperCase().replace(/\s+/g, "").trim();
                        return Boolean(lGst) && (lGst === cleanPartyName.toUpperCase().replace(/\s+/g, "") || (cleanGstin && lGst === cleanGstin));
                    })
                    : null;

                if (matchedPartyLedger?.name) {
                    if (group.mode === "Accounting Invoice") {
                        const customerDebit = group.accountingEntries.find((entry: any) => {
                            const current = cellText(entry.ledgerName);
                            const currentLower = current.toLowerCase();
                            const currentGst = current.toUpperCase().replace(/\s+/g, "");
                            return String(entry.type).toLowerCase() === "debit" && (
                                !current ||
                                currentLower === "customer" ||
                                (cleanPartyName && currentLower === cleanPartyName) ||
                                (cleanGstin && currentGst === cleanGstin)
                            );
                        });
                        if (customerDebit) customerDebit.ledgerName = matchedPartyLedger.name;
                    }
                    rawPartyName = matchedPartyLedger.name;
                }

                const partyMatch = !!matchedPartyLedger;

                // Determine GST Status & Display Name ("GST Number - Trader Name" or "Trader Name")
                const partyGstin = (matchedPartyLedger?.gst_number || matchedPartyLedger?.gstNumber || group.rawGstin || group.gstin || "").trim();
                const partyDisplayInfo = formatPartyDisplayName(matchedPartyLedger?.name || rawPartyName, partyGstin);
                const hasGst = partyDisplayInfo.hasGst;
                const partyDisplayName = partyDisplayInfo.displayName;
                const salesTypeCategory: "B2B" | "B2C" = hasGst ? "B2B" : "B2C";

                // 2. GST State Detection: Company State vs Party State Code
                const companyGstin = (companyInfo?.gstNumber || (companyInfo as any)?.gst_number || (companyInfo as any)?.gstin || "").trim();
                const companyStateStr = (companyInfo?.state || "").trim();
                const companyStateRes = extractStateCode(companyGstin || companyStateStr);

                const partyStateStr = (matchedPartyLedger?.state || group.pos || "").trim();
                const partyStateRes = extractStateCode(partyGstin || partyStateStr);

                let isSameState = false;
                let isDifferentState = false;
                let gstType: "same-state" | "different-state" | "unknown" = "unknown";

                if (!companyStateRes.code) {
                    errors.push(`Company GSTIN or State is missing/invalid in Company Profile. State cannot be determined.`);
                }

                if (!partyMatch) {
                    errors.push(`Party / Customer Name '${rawPartyName || cleanGstin || "Customer"}' Not Found in Ledger Master`);
                } else if (!partyStateRes.code) {
                    errors.push(`Party '${rawPartyName}' GSTIN ('${partyGstin || 'Missing'}') or State is missing/invalid. State cannot be determined.`);
                }

                if (companyStateRes.code && partyStateRes.code) {
                    if (partyStateRes.code === companyStateRes.code) {
                        isSameState = true;
                        gstType = "same-state";
                    } else {
                        isDifferentState = true;
                        gstType = "different-state";
                    }
                }

                // 3. Validate Items, HSN/SAC, Unit, Tax Rates & Dynamic B2B / B2C Sales Ledger (Item Invoice Mode)
                let itemsValidated: ManualItemRow[] = [];
                let totalDebit = 0;
                let totalCredit = 0;

                if (group.mode === "Item Invoice") {
                    group.items.forEach((it: any) => {
                        if (it.slabLine) {
                            const rawGstRate = Number(it.rawGstRate ?? it.gstRate ?? 0);
                            const sheetItemName = it.namedOnSheet ? cellText(it.itemName) : "";
                            const matchedStockItem = sheetItemName
                                ? items.find((stockItem) => (stockItem.name || "").toLowerCase().replace(/\s+/g, " ").trim() === sheetItemName.toLowerCase().replace(/\s+/g, " ").trim())
                                : null;
                            if (sheetItemName && !matchedStockItem) errors.push(`Stock Item '${sheetItemName}' Not Found in Stock Item Master`);

                            const resolvedSalesLedgerObj = resolveB2BOrB2CSalesLedger(
                                hasGst,
                                rawGstRate,
                                it.taxKind !== "inter",
                                ledgers,
                                salesTypes,
                                it.salesLedger
                            );
                            const resolvedSalesLedgerName = resolvedSalesLedgerObj.matchedLedger
                                ? (resolvedSalesLedgerObj.matchedLedger.name || resolvedSalesLedgerObj.matchedLedger.ledger_name || it.salesLedger)
                                : (it.salesLedger || (hasGst ? "B2B Sales Account" : "B2C Sales Account"));
                            if (!resolvedSalesLedgerObj.matchedLedger) {
                                errors.push(resolvedSalesLedgerObj.error || `Sales-Ledger '${resolvedSalesLedgerName}' Not Found in Ledger Master`);
                            }

                            const cgstRate = it.taxKind === "intra" ? Number((rawGstRate / 2).toFixed(2)) : 0;
                            const sgstRate = cgstRate;
                            const igstRate = it.taxKind === "inter" ? rawGstRate : 0;
                            const cgstRes = cgstRate > 0 ? resolveTaxLedger("CGST", cgstRate, ledgers) : { found: true, ledgerName: "" };
                            const sgstRes = sgstRate > 0 ? resolveTaxLedger("SGST", sgstRate, ledgers) : { found: true, ledgerName: "" };
                            const igstRes = igstRate > 0 ? resolveTaxLedger("IGST", igstRate, ledgers) : { found: true, ledgerName: "" };
                            if (cgstRate > 0 && !cgstRes.found) errors.push(`${cgstRate}% CGST Tax Ledger Not Found in Ledger Master`);
                            if (sgstRate > 0 && !sgstRes.found) errors.push(`${sgstRate}% SGST Tax Ledger Not Found in Ledger Master`);
                            if (igstRate > 0 && !igstRes.found) errors.push(`${igstRate}% IGST Tax Ledger Not Found in Ledger Master`);

                            const taxableValue = Number(it.taxableValue || 0);
                            const discountAmt = Number(it.discount || 0);
                            const cgstAmount = Number(it.cgstAmount || 0);
                            const sgstAmount = Number(it.sgstAmount || 0);
                            const igstAmount = Number(it.igstAmount || 0);
                            const itemTotal = Math.max(0, taxableValue + cgstAmount + sgstAmount + igstAmount - discountAmt);

                            itemsValidated.push({
                                ...it,
                                itemName: sheetItemName || resolvedSalesLedgerName,
                                salesLedger: resolvedSalesLedgerName,
                                rawGstRate,
                                gstRate: rawGstRate,
                                cgstRate,
                                sgstRate,
                                igstRate,
                                cgstAmount,
                                sgstAmount,
                                igstAmount,
                                taxableValue,
                                discount: discountAmt,
                                itemTotal,
                                itemFound: !sheetItemName || !!matchedStockItem,
                                hsnFound: true,
                                unitFound: true,
                                cgstLedgerFound: cgstRes.found,
                                sgstLedgerFound: sgstRes.found,
                                igstLedgerFound: igstRes.found,
                                matchedCgstLedgerName: cgstRes.ledgerName,
                                matchedSgstLedgerName: sgstRes.ledgerName,
                                matchedIgstLedgerName: igstRes.ledgerName,
                                salesLedgerFound: !!resolvedSalesLedgerObj.matchedLedger,
                                _matchedItemId: matchedStockItem?.id,
                            });
                            totalDebit += itemTotal;
                            return;
                        }

                        const cleanItemName = (it.itemName || "").toLowerCase().replace(/\s+/g, " ").trim();
                        const cleanHsn = (it.hsnCode || "").toLowerCase().replace(/\s+/g, "").trim();

                        const matchedItem = items.find(i => {
                            const iName = (i.name || "").toLowerCase().replace(/\s+/g, " ").trim();
                            return iName === cleanItemName;
                        });
                        const itemFound = !!matchedItem;

                        let hsnFound = false;
                        if (matchedItem) {
                            const itemHsn = (matchedItem.hsnCode || matchedItem.hsn_code || matchedItem.hsnSac || "").toLowerCase().replace(/\s+/g, "").trim();
                            hsnFound = !cleanHsn || !itemHsn || cleanHsn === itemHsn || itemHsn.includes(cleanHsn) || cleanHsn.includes(itemHsn);
                        } else {
                            hsnFound = !!cleanHsn;
                        }

                        const unitFound = resolveUnit(it.unit, matchedItem, stockUnits);

                        // Dynamic B2B / B2C Sales Ledger Resolution
                        const rawGstRate = Number(it.rawGstRate ?? it.gstRate ?? 0);
                        const resolvedSalesLedgerObj = resolveB2BOrB2CSalesLedger(
                            hasGst,
                            rawGstRate,
                            isSameState,
                            ledgers,
                            salesTypes,
                            it.salesLedger
                        );

                        const salesLedgerFound = !!resolvedSalesLedgerObj.matchedLedger;
                        const resolvedSalesLedgerName = resolvedSalesLedgerObj.matchedLedger
                            ? (resolvedSalesLedgerObj.matchedLedger.name || resolvedSalesLedgerObj.matchedLedger.ledger_name || it.salesLedger)
                            : (it.salesLedger || (hasGst ? "B2B Sales Account" : "B2C Sales Account"));

                        if (resolvedSalesLedgerObj.error) {
                            errors.push(resolvedSalesLedgerObj.error);
                        }

                        // Dynamic Tax Split calculation based on determined State
                        let cgstRate = 0;
                        let sgstRate = 0;
                        let igstRate = 0;

                        let cgstRes = { found: true, ledgerName: "" };
                        let sgstRes = { found: true, ledgerName: "" };
                        let igstRes = { found: true, ledgerName: "" };

                        if (isSameState) {
                            cgstRate = Number((rawGstRate / 2).toFixed(2));
                            sgstRate = Number((rawGstRate / 2).toFixed(2));
                            igstRate = 0;

                            if (cgstRate > 0) {
                                cgstRes = resolveTaxLedger('CGST', cgstRate, ledgers);
                                sgstRes = resolveTaxLedger('SGST', sgstRate, ledgers);
                                if (!cgstRes.found) errors.push(`${cgstRate}% CGST Tax Ledger Not Found in Ledger Master`);
                                if (!sgstRes.found) errors.push(`${sgstRate}% SGST Tax Ledger Not Found in Ledger Master`);
                            }
                        } else if (isDifferentState) {
                            igstRate = rawGstRate;
                            cgstRate = 0;
                            sgstRate = 0;

                            if (igstRate > 0) {
                                igstRes = resolveTaxLedger('IGST', igstRate, ledgers);
                                if (!igstRes.found) errors.push(`${igstRate}% IGST Tax Ledger Not Found in Ledger Master`);
                            }
                        } else {
                            cgstRes = { found: false, ledgerName: "" };
                            sgstRes = { found: false, ledgerName: "" };
                            igstRes = { found: false, ledgerName: "" };
                        }

                        if (!itemFound) errors.push(`Stock Item '${it.itemName}' Not Found in Stock Item Master`);
                        else {
                            if (!hsnFound) errors.push(`HSN/SAC '${it.hsnCode}' Mismatch for Item '${it.itemName}'`);
                            if (!unitFound) errors.push(`Unit '${it.unit}' Mismatch for Item '${it.itemName}'`);
                        }
                        if (!salesLedgerFound) errors.push(`Sales-Ledger '${resolvedSalesLedgerName}' Not Found in Ledger Master`);

                        const taxableValue = Number((it.quantity * it.rate).toFixed(2));
                        const discountAmt = Number(it.discount || 0);
                        const cgstAmount = isSameState ? Number(((taxableValue * cgstRate) / 100).toFixed(2)) : 0;
                        const sgstAmount = isSameState ? Number(((taxableValue * sgstRate) / 100).toFixed(2)) : 0;
                        const igstAmount = isDifferentState ? Number(((taxableValue * igstRate) / 100).toFixed(2)) : 0;
                        const itemTotal = Math.max(0, taxableValue + sgstAmount + cgstAmount + igstAmount - discountAmt);

                        itemsValidated.push({
                            ...it,
                            salesLedger: resolvedSalesLedgerName,
                            rawGstRate,
                            gstRate: rawGstRate,
                            cgstRate,
                            sgstRate,
                            igstRate,
                            cgstAmount,
                            sgstAmount,
                            igstAmount,
                            taxableValue,
                            discount: discountAmt,
                            itemTotal,
                            itemFound,
                            hsnFound,
                            unitFound,
                            cgstLedgerFound: cgstRes.found,
                            sgstLedgerFound: sgstRes.found,
                            igstLedgerFound: igstRes.found,
                            matchedCgstLedgerName: cgstRes.ledgerName,
                            matchedSgstLedgerName: sgstRes.ledgerName,
                            matchedIgstLedgerName: igstRes.ledgerName,
                            salesLedgerFound,
                            _matchedItemId: matchedItem?.id,
                        });

                        totalDebit += itemTotal;
                    });

                    // Overall Discount resolution & subtraction
                    let overallDiscountAmt = Number(group.overallDiscountAmt || 0);
                    const overallDiscountPct = Number(group.overallDiscountPct || 0);
                    if (overallDiscountPct > 0 && overallDiscountAmt === 0) {
                        overallDiscountAmt = Number(((totalDebit * overallDiscountPct) / 100).toFixed(2));
                    }

                    const overallDiscountLedger = String(group.overallDiscountLedger || "").trim();
                    let overallDiscountLedgerFound = true;
                    if (overallDiscountLedger) {
                        const matchedDiscLedger = matchLedgerFlexibly(overallDiscountLedger, ledgers);
                        overallDiscountLedgerFound = !!matchedDiscLedger;
                        if (matchedDiscLedger?.name) {
                            group.overallDiscountLedger = matchedDiscLedger.name || matchedDiscLedger.ledger_name || overallDiscountLedger;
                        } else {
                            errors.push(`Overall Discount Ledger '${overallDiscountLedger}' Not Found in Ledger Master`);
                        }
                    }

                    totalDebit = Math.max(0, totalDebit - overallDiscountAmt);
                    totalCredit = totalDebit;

                    group.overallDiscountAmt = overallDiscountAmt;
                    group.overallDiscountPct = overallDiscountPct;
                    group.overallDiscountLedgerFound = overallDiscountLedgerFound;
                } else {
                    // Accounting Invoice: same sheet as the item invoice, without Item, Quantity and Rate.
                    // Customer is debited. Sales and output tax are credited.
                    if ((group.accountingLines || []).length > 0) {
                        const builtEntries: any[] = [];
                        let salesCredit = 0;
                        let taxCredit = 0;
                        let lineDiscount = 0;
                        let resolvedSalesName = "";

                        group.accountingLines.forEach((line: any) => {
                            const rawGstRate = Number(line.gstRate || 0);
                            const taxable = Number(line.taxable || 0);
                            const discountAmt = Number(line.discount || 0);
                            const resolvedSalesLedgerObj = resolveB2BOrB2CSalesLedger(
                                hasGst,
                                rawGstRate,
                                isSameState,
                                ledgers,
                                salesTypes,
                                line.salesLedger
                            );
                            const salesName = resolvedSalesLedgerObj.matchedLedger
                                ? (resolvedSalesLedgerObj.matchedLedger.name || resolvedSalesLedgerObj.matchedLedger.ledger_name || line.salesLedger)
                                : (line.salesLedger || "");
                            if (!resolvedSalesLedgerObj.matchedLedger && !line.salesLedger && resolvedSalesLedgerObj.error) {
                                errors.push(resolvedSalesLedgerObj.error);
                            }
                            if (salesName) resolvedSalesName = resolvedSalesName || salesName;

                            if (taxable > 0) {
                                builtEntries.push({ ledgerName: salesName || "Sales Account", amount: taxable, type: "Credit" });
                                salesCredit += taxable;
                            }

                            if (isSameState && rawGstRate > 0 && taxable > 0) {
                                const halfRate = Number((rawGstRate / 2).toFixed(2));
                                const cgstAmount = Number(((taxable * halfRate) / 100).toFixed(2));
                                const sgstAmount = Number(((taxable * halfRate) / 100).toFixed(2));
                                const cgstRes = resolveTaxLedger("CGST", halfRate, ledgers);
                                const sgstRes = resolveTaxLedger("SGST", halfRate, ledgers);
                                if (cgstAmount > 0) builtEntries.push({ ledgerName: cgstRes.ledgerName || `${halfRate}% CGST`, amount: cgstAmount, type: "Credit" });
                                if (sgstAmount > 0) builtEntries.push({ ledgerName: sgstRes.ledgerName || `${halfRate}% SGST`, amount: sgstAmount, type: "Credit" });
                                taxCredit += cgstAmount + sgstAmount;
                            } else if (isDifferentState && rawGstRate > 0 && taxable > 0) {
                                const igstAmount = Number(((taxable * rawGstRate) / 100).toFixed(2));
                                const igstRes = resolveTaxLedger("IGST", rawGstRate, ledgers);
                                if (igstAmount > 0) builtEntries.push({ ledgerName: igstRes.ledgerName || `${rawGstRate}% IGST`, amount: igstAmount, type: "Credit" });
                                taxCredit += igstAmount;
                            }

                            lineDiscount += discountAmt;
                        });

                        let overallDiscountAmt = Number(group.overallDiscountAmt || 0);
                        const overallDiscountPct = Number(group.overallDiscountPct || 0);
                        const grossInvoice = Math.max(0, salesCredit + taxCredit - lineDiscount);
                        if (overallDiscountPct > 0 && overallDiscountAmt === 0) {
                            overallDiscountAmt = Number(((grossInvoice * overallDiscountPct) / 100).toFixed(2));
                        }

                        const overallDiscountLedger = String(group.overallDiscountLedger || "").trim();
                        let overallLedgerName = overallDiscountLedger;
                        let overallDiscountLedgerFound = true;
                        if (lineDiscount > 0 || overallDiscountAmt > 0) {
                            if (!overallDiscountLedger) {
                                overallDiscountLedgerFound = false;
                                errors.push("Overall Discount Ledger is required when a discount amount is entered");
                            } else {
                                const matchedDiscLedger = matchLedgerFlexibly(overallDiscountLedger, ledgers);
                                overallDiscountLedgerFound = !!matchedDiscLedger;
                                if (matchedDiscLedger?.name || matchedDiscLedger?.ledger_name) {
                                    overallLedgerName = matchedDiscLedger.name || matchedDiscLedger.ledger_name;
                                } else {
                                    errors.push(`Overall Discount Ledger '${overallDiscountLedger}' Not Found in Ledger Master`);
                                }
                            }
                        }

                        if (overallDiscountAmt > 0 && overallLedgerName) {
                            builtEntries.push({ ledgerName: overallLedgerName, amount: overallDiscountAmt, type: "Debit", _isDiscount: true, _isOverall: true });
                        }
                        if (lineDiscount > 0 && overallLedgerName) {
                            builtEntries.push({ ledgerName: overallLedgerName, amount: lineDiscount, type: "Debit", _isDiscount: true });
                        }

                        const customerAmount = Math.max(0, Number((salesCredit + taxCredit - lineDiscount - overallDiscountAmt).toFixed(2)));
                        builtEntries.unshift({
                            ledgerName: rawPartyName || "Customer",
                            amount: customerAmount,
                            type: "Debit",
                            _isParty: true,
                        });

                        group.accountingEntries = builtEntries.map((entry: any, entryIndex: number) => ({ ...entry, srNo: entryIndex + 1 }));
                        group.salesLedger = resolvedSalesName;
                        group.overallDiscountAmt = overallDiscountAmt;
                        group.overallDiscountPct = overallDiscountPct;
                        group.overallDiscountLedger = overallLedgerName;
                        group.overallDiscountLedgerFound = overallDiscountLedgerFound;
                    }

                    // Accounting Invoice Mode
                    let accEntriesValidated: ManualAccountingRow[] = [];
                    group.accountingEntries.forEach((ae: any) => {
                        const matchedLedger = matchLedgerFlexibly(ae.ledgerName, ledgers);
                        const ledgerFound = !!matchedLedger;
                        if (!ledgerFound) errors.push(`Ledger '${ae.ledgerName}' Not Found in Ledger Master`);

                        accEntriesValidated.push({
                            ...ae,
                            ledgerName: matchedLedger ? (matchedLedger.name || matchedLedger.ledger_name || ae.ledgerName) : ae.ledgerName,
                            ledgerFound,
                            _matchedLedgerId: matchedLedger?.id
                        });

                        if (ae.type.toLowerCase() === "debit") {
                            totalDebit += ae.amount;
                        } else {
                            totalCredit += ae.amount;
                        }
                    });

                    group.accountingEntries = accEntriesValidated;
                }

                // Strict Double-Entry Check for Accounting Invoice Mode: Debit Total === Credit Total
                const isBalanceMatched = Math.abs(totalDebit - totalCredit) < 0.05 && totalDebit > 0;
                if (!isBalanceMatched && group.mode === "Accounting Invoice") {
                    errors.push(`Balance Mismatch: Total Debit (₹${totalDebit.toFixed(2)}) != Total Credit (₹${totalCredit.toFixed(2)})`);
                }

                const status = errors.length === 0 ? "pending" : "error";
                const discountTotal = itemsValidated.reduce((sum, item) => sum + Number(item.discount || 0), 0);

                validatedVouchers.push({
                    id: group.id,
                    voucherDate: group.voucherDate,
                    voucherNo: autoVoucherNo,
                    supplierInvoice: group.supplierInvoice,
                    invoiceDate: group.invoiceDate,
                    partyName: partyDisplayName,
                    rawPartyName: matchedPartyLedger?.name || rawPartyName,
                    mode: group.mode,
                    godownTracking: group.godownTracking,
                    gstin: partyGstin,
                    hasGst,
                    salesTypeCategory,
                    pos: partyStateRes.name || matchedPartyLedger?.state || "",
                    totalDebit,
                    totalCredit,
                    invoiceValue: Math.max(totalDebit, totalCredit),
                    discountTotal,
                    salesLedger: itemsValidated[0]?.salesLedger || group.salesLedger || "",
                    overallDiscountLedger: group.overallDiscountLedger || "",
                    overallDiscountPct: group.overallDiscountPct || 0,
                    overallDiscountAmt: group.overallDiscountAmt || 0,
                    overallDiscountLedgerFound: group.overallDiscountLedgerFound ?? true,
                    status,
                    errorMessage: errors.join(" | "),
                    partyMatch,
                    isBalanceMatched,
                    _matchedLedgerId: matchedPartyLedger?.id || null,
                    gstType,
                    companyStateCode: companyStateRes.code || "",
                    companyStateName: companyStateRes.name || "Unknown",
                    partyStateCode: partyStateRes.code || "",
                    partyStateName: partyStateRes.name || "Unknown",
                    items: itemsValidated,
                    accountingEntries: group.accountingEntries || [],
                });
            });

            setGroupedVouchers(validatedVouchers);
            setActiveTab("preview");
        } catch (err) {
            console.error("File Read Error:", err);
            alert("Invalid Excel file format!");
        } finally {
            setIsProcessing(false);
        }
    };

    const saveImportedVouchers = async () => {
        // Block save if any voucher has error/validation failure
        const invalidVouchers = groupedVouchers.filter(v => v.status === "error");
        if (invalidVouchers.length > 0) {
            Swal.fire({
                icon: "error",
                title: "Import Blocked",
                html: `<p><b>${invalidVouchers.length}</b> voucher(s) failed master or double-entry balance validations and cannot be posted.</p>`,
            });
            return;
        }

        setIsProcessing(true);
        const pendingVouchers = groupedVouchers.filter(v => v.status === "pending");
        setSaveProgress({ done: 0, total: pendingVouchers.length });

        const updatedVouchers = [...groupedVouchers];
        let done = 0;

        try {
            for (let i = 0; i < updatedVouchers.length; i++) {
                if (updatedVouchers[i].status !== "pending") continue;

                updatedVouchers[i].status = "importing";
                setGroupedVouchers([...updatedVouchers]);

                try {
                    const v = updatedVouchers[i];
                    const payloadVoucher = {
                        "Trade/Legal name of the Customer": v.rawPartyName,
                        "Trade/Legal name of the Supplier": v.rawPartyName,
                        "Invoice number": v.supplierInvoice,
                        "Voucher number": v.voucherNo,
                        "Invoice Date": v.invoiceDate || v.voucherDate,
                        "GSTIN of Customer": v.gstin,
                        "GSTIN of supplier": v.gstin,
                        "Place of supply": v.pos,
                        "Discount": v.discountTotal || 0,
                        "Sales Ledger": v.salesLedger,
                        "Purchase Ledger": v.salesLedger,
                        "Overall Discount Ledger": v.overallDiscountLedger || "",
                        overallDiscountLedger: v.overallDiscountLedger || "",
                        overallDiscount: v.overallDiscountAmt || 0,
                        overallDiscountPercent: v.overallDiscountPct || 0,
                        importMode: v.mode.toLowerCase().includes("accounting") ? "accounting" : "item",
                        items: v.items.map(it => ({
                            "Item Name": it.itemName,
                            "HSN Code": it.hsnCode,
                            "Batch No": it.godown,
                            "Quantity": it.quantity,
                            "Item Rate (₹)": it.rate,
                            "Discount": it.discount || 0,
                            "Discount (₹)": it.discount || 0,
                            "Rate (%)": it.gstRate,
                            "Taxable Value (₹)": it.taxableValue,
                            "Integrated Tax (₹)": it.igstAmount,
                            "Central Tax (₹)": it.cgstAmount,
                            "State/UT tax (₹)": it.sgstAmount
                        })),
                        accountingEntries: v.accountingEntries.map(ae => ({
                            "Particulars (Ledger Name)": ae.ledgerName,
                            "Amount (₹)": ae.amount,
                            "Type": ae.type.toLowerCase(),
                            "isOverallDiscount": !!ae._isOverall,
                            "Rate (%)": ae.gstRate || 0,
                            "Integrated Tax (₹)": ae.igst || 0,
                            "Central Tax (₹)": ae.cgst || 0,
                            "State/UT tax (₹)": ae.sgst || 0
                        }))
                    };

                    const response = await axios.post<{ success: boolean; errors?: string[] }>(`${import.meta.env.VITE_API_URL}/api/sales_summary_import`, {
                        voucher: payloadVoucher,
                        companyId,
                        ownerType,
                        ownerId
                    });

                    if (response.data.success) {
                        updatedVouchers[i].status = "imported";
                    } else {
                        updatedVouchers[i].status = "error";
                        updatedVouchers[i].errorMessage = response.data.errors?.[0] || "Import failed";
                    }
                } catch (error: any) {
                    updatedVouchers[i].status = "error";
                    updatedVouchers[i].errorMessage = error.response?.data?.message || error.message || "Failed to save";
                }

                done++;
                setSaveProgress({ done, total: pendingVouchers.length });
                setGroupedVouchers([...updatedVouchers]);
            }

            const savedCount = updatedVouchers.filter(v => v.status === "imported").length;
            const errorCount = updatedVouchers.filter(v => v.status === "error").length;

            if (savedCount > 0 && errorCount === 0) {
                Swal.fire({ icon: "success", title: "All Vouchers Imported!", html: `<b>${savedCount}</b> vouchers saved successfully.` });
            } else if (savedCount > 0 || errorCount > 0) {
                Swal.fire({
                    icon: savedCount > 0 ? "warning" : "error",
                    title: savedCount > 0 ? "Partial Import Completed" : "Import Failed",
                    html: `<p><b>${savedCount}</b> saved, <b>${errorCount}</b> failed.</p>`,
                });
            }
        } catch (err) {
            console.error("Save Error:", err);
            Swal.fire({ icon: "error", title: "Error", text: "Something went wrong while saving." });
        } finally {
            setIsProcessing(false);
        }
    };

    const styleCell = (cell: any, style: any) => {
        cell.s = style;
        return cell;
    };

    const ensureCell = (worksheet: XLSX.WorkSheet, row: number, col: number, value: string | number = "") => {
        const ref = XLSX.utils.encode_cell({ r: row, c: col });
        if (!worksheet[ref]) {
            worksheet[ref] = typeof value === "number" ? { t: "n", v: value } : { t: "s", v: value };
        }
        return worksheet[ref];
    };

    const downloadTemplate = (mode: 'Item Invoice' | 'Accounting Invoice') => {
        const headerStyle = {
            font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" },
            fill: { fgColor: { rgb: "312E81" } },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: {
                top: { style: "medium", color: { rgb: "1E1B4B" } },
                bottom: { style: "medium", color: { rgb: "1E1B4B" } },
                left: { style: "thin", color: { rgb: "3730A3" } },
                right: { style: "thin", color: { rgb: "3730A3" } },
            },
        };
        const headers = mode === "Item Invoice" ? SALES_ITEM_HEADERS : SALES_ACCOUNTING_HEADERS;
        const colLetter = (name: string) => XLSX.utils.encode_col(headers.indexOf(name));
        const blankOr = (name: string, rowNumber: number, expression: string) =>
            `IF(${colLetter(name)}${rowNumber}="","",${expression})`;
        const formulaByHeader: Record<string, (rowNumber: number) => string> = {
            "Invoice Value (₹)": (rowNumber) => {
                const total = `SUM(${colLetter("Exempt sales")}${rowNumber}:${colLetter("sgst14%")}${rowNumber})`;
                return `IF(${total}=0,"",${total}-N(${colLetter("Discount")}${rowNumber}))`;
            },
            "Igst3%": (rowNumber) => blankOr("3% inter state sales", rowNumber, `${colLetter("3% inter state sales")}${rowNumber}*3%`),
            "cgst1.5%": (rowNumber) => blankOr("3% intra state sales", rowNumber, `${colLetter("3% intra state sales")}${rowNumber}*1.5%`),
            "sgst1.5%": (rowNumber) => blankOr("3% intra state sales", rowNumber, `${colLetter("3% intra state sales")}${rowNumber}*1.5%`),
            "Igst5%": (rowNumber) => blankOr("5% inter state sales", rowNumber, `${colLetter("5% inter state sales")}${rowNumber}*5%`),
            "cgst2.5%": (rowNumber) => blankOr("5% intra state sales", rowNumber, `${colLetter("5% intra state sales")}${rowNumber}*2.5%`),
            "sgst2.5%": (rowNumber) => blankOr("5% intra state sales", rowNumber, `${colLetter("5% intra state sales")}${rowNumber}*2.5%`),
            "Igst18%": (rowNumber) => blankOr("18% inter state sales", rowNumber, `${colLetter("18% inter state sales")}${rowNumber}*18%`),
            "cgst9%": (rowNumber) => blankOr("18% intra state sales", rowNumber, `${colLetter("18% intra state sales")}${rowNumber}*9%`),
            "sgst9%": (rowNumber) => blankOr("18% intra state sales", rowNumber, `${colLetter("18% intra state sales")}${rowNumber}*9%`),
            "Igst28%": (rowNumber) => blankOr("28% inter state sales", rowNumber, `${colLetter("28% inter state sales")}${rowNumber}*28%`),
            "cgst14%": (rowNumber) => blankOr("28% intra state sales", rowNumber, `${colLetter("28% intra state sales")}${rowNumber}*14%`),
            "sgst14%": (rowNumber) => blankOr("28% intra state sales", rowNumber, `${colLetter("28% intra state sales")}${rowNumber}*14%`),
        };
        const example: Record<string, string | number> = {
            "GSTIN of supplier": "20AABCM4621M1ZR",
            "SupplierName": "ABC CUSTOMER CORP",
            "Invoice number": "EXAMPLE-001",
            "Invoice Date": "2026-11-19",
            "Place of supply": "Jharkhand",
            "Supply Attract Reverse Charge": "N",
            ...(mode === "Item Invoice" ? { "Item Name": "MS Plate", "Quantity": 1, "Rate": 10000 } : {}),
            "18% intra state sales": 10000,
        };
        const exampleFormulaValue: Record<string, number> = {
            "Invoice Value (₹)": 11800,
            "cgst9%": 900,
            "sgst9%": 900,
        };
        const lastDataRow = 21;
        const worksheet = XLSX.utils.aoa_to_sheet([headers]);
        const lastCol = headers.length - 1;
        worksheet["!ref"] = `A1:${XLSX.utils.encode_col(lastCol)}${lastDataRow}`;
        worksheet["!cols"] = headers.map((header) => ({ wch: Math.min(28, Math.max(14, header.length + 2)) }));
        worksheet["!rows"] = [{ hpt: 26 }];
        headers.forEach((header, colIndex) => styleCell(ensureCell(worksheet, 0, colIndex, header), headerStyle));
        headers.forEach((header, colIndex) => {
            const value = example[header];
            if (value === undefined || value === "") return;
            const cell = ensureCell(worksheet, 1, colIndex, value);
            if (typeof value === "number") {
                cell.t = "n";
                cell.v = value;
            }
        });
        for (let excelRow = 2; excelRow <= lastDataRow; excelRow++) {
            headers.forEach((header, colIndex) => {
                const formula = formulaByHeader[header];
                if (!formula) return;
                const cell = ensureCell(worksheet, excelRow - 1, colIndex, "");
                cell.f = formula(excelRow);
                if (excelRow === 2 && exampleFormulaValue[header] !== undefined) {
                    cell.t = "n";
                    cell.v = exampleFormulaValue[header];
                } else {
                    cell.t = "s";
                    cell.v = "";
                }
            });
        }
        const workbook = XLSX.utils.book_new();
        const sheetName = mode === "Item Invoice" ? "Sales_Item_Invoice_Template" : "Sales_Accounting_Template";
        const fileName = mode === "Item Invoice" ? "Sales_Item_Invoice_Template.xlsx" : "Sales_Accounting_Invoice_Template.xlsx";
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.writeFile(workbook, fileName);
    };

    return (
        <div className="pt-[56px] px-4 min-h-screen bg-slate-50/50 pb-12">
            <div className="w-full xl:w-[98%] mx-auto">
                {/* Header Title Section */}
                <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center">
                        <button
                            onClick={() => navigate(new URLSearchParams(window.location.search).get("returnUrl") || "/app/vouchers")}
                            className="mr-4 p-2 rounded-full hover:bg-gray-200 transition-colors"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                <ShoppingCart className="text-blue-600" size={24} />
                                Sales Voucher Import
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                GST-based B2B/B2C Sales Ledger mapping, Customer resolution, Units & Tax Ledgers with double-entry balance check.
                            </p>
                        </div>
                    </div>

                    {/* Mode Selector */}
                    <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-500 px-2">Transaction Mode:</span>
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => setSelectedMode("Item Invoice")}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                                    selectedMode === "Item Invoice"
                                        ? "bg-blue-600 text-white shadow-sm"
                                        : "text-gray-600 hover:text-gray-900"
                                }`}
                            >
                                Item Invoice
                            </button>
                            <button
                                onClick={() => setSelectedMode("Accounting Invoice")}
                                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                                    selectedMode === "Accounting Invoice"
                                        ? "bg-indigo-600 text-white shadow-sm"
                                        : "text-gray-600 hover:text-gray-900"
                                }`}
                            >
                                Accounting Invoice
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tabs Navigation */}
                <div className="border-b border-gray-200 mb-6">
                    <nav className="flex space-x-8">
                        {[
                            { id: "import", label: "Upload File", icon: <Upload size={18} /> },
                            { id: "preview", label: `Preview & Validate (${groupedVouchers.length})`, icon: <FileText size={18} /> },
                            { id: "templates", label: "Download Excel Templates", icon: <Download size={18} /> },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`py-3 px-1 border-b-2 font-semibold text-sm flex items-center space-x-2 transition-colors ${
                                    activeTab === tab.id
                                        ? "border-blue-600 text-blue-600"
                                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                }`}
                            >
                                {tab.icon}
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </nav>
                </div>

                {/* TAB 1: UPLOAD FILE */}
                {activeTab === "import" && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center max-w-4xl mx-auto">
                        <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            className={`border-3 border-dashed rounded-2xl p-16 transition-all duration-300 ${
                                dragActive
                                    ? "border-blue-500 bg-blue-50 scale-[1.01]"
                                    : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                            }`}
                        >
                            <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <FileSpreadsheet className="h-10 w-10 text-blue-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">
                                Upload Sales Excel Sheet ({selectedMode})
                            </h3>
                            <p className="text-xs text-gray-500 mb-6 max-w-2xl mx-auto">
                                {selectedMode === "Accounting Invoice"
                                    ? "Accounting template: same columns as the item invoice, without Item Name, Quantity and Rate. Enter the taxable amount in the matching column. The customer is debited. Sales and output tax are credited."
                                    : "Item template: blue header, one invoice on one row. Enter the taxable amount in the matching column. Tax and invoice value calculate in Excel. The customer is debited. Sales and output tax are credited."}
                            </p>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-md font-semibold"
                            >
                                Select Excel File (.xlsx)
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                                className="hidden"
                            />
                        </div>
                    </div>
                )}

                {/* TAB 2: PREVIEW & MATCH */}
                {activeTab === "preview" && (
                    <div className="space-y-6">
                        {/* Control Action Bar */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                            <div>
                                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                    Voucher Preview & Master Validation Summary
                                    <span className="text-xs font-normal text-gray-500">
                                        ({groupedVouchers.length} Vouchers parsed)
                                    </span>
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Green badges indicate master matches. Dynamic B2B/B2C Sales Ledgers resolved based on Customer GST.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex border rounded-lg p-1 bg-gray-50">
                                    <button
                                        onClick={() => setViewLayout("card")}
                                        className={`p-1.5 rounded ${viewLayout === "card" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}
                                        title="Manual Voucher Card View"
                                    >
                                        <Grid size={16} />
                                    </button>
                                    <button
                                        onClick={() => setViewLayout("table")}
                                        className={`p-1.5 rounded ${viewLayout === "table" ? "bg-white shadow text-blue-600" : "text-gray-500"}`}
                                        title="Compact List View"
                                    >
                                        <List size={16} />
                                    </button>
                                </div>

                                <button
                                    onClick={() => { setGroupedVouchers([]); setActiveTab("import"); }}
                                    className="px-4 py-2 text-xs text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>

                                {Array.from(
                                    groupedVouchers
                                        .filter((voucher) => !voucher.partyMatch && (voucher.rawPartyName || voucher.partyName))
                                        .reduce((parties, voucher) => {
                                            const partyName = voucher.rawPartyName || voucher.partyName;
                                            if (!parties.has(partyName)) parties.set(partyName, voucher);
                                            return parties;
                                        }, new Map<string, ManualGroupedVoucher>())
                                        .values()
                                ).map((voucher) => {
                                    const partyName = voucher.rawPartyName || voucher.partyName;
                                    return (
                                        <button
                                            key={partyName}
                                            onClick={() => {
                                                const params = new URLSearchParams({
                                                    name: partyName,
                                                    group: "sundry-debtors",
                                                    gst: voucher.gstin || "",
                                                    state: voucher.pos || voucher.partyStateName || "",
                                                    returnUrl: "/app/vouchers/sales-import",
                                                });
                                                navigate(`/app/masters/ledger/create?${params.toString()}`);
                                            }}
                                            className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 shadow-md"
                                        >
                                            Create {partyName} in Sundry Debtors
                                        </button>
                                    );
                                })}

                                <button
                                    onClick={saveImportedVouchers}
                                    disabled={isProcessing || groupedVouchers.some(v => v.status === "error") || !groupedVouchers.some(v => v.status === "pending")}
                                    className="px-6 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 shadow-md transition-all flex items-center gap-2"
                                >
                                    {isProcessing ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                                    Save Vouchers Bulk
                                </button>
                            </div>
                        </div>

                        {/* VOUCHER CARD VIEW WITH EXPLICIT MASTER VALIDATION BADGES & B2B/B2C CLASSIFICATION */}
                        {viewLayout === "card" ? (
                            <div className="space-y-6">
                                {groupedVouchers.map((voucher, idx) => (
                                    <div
                                        key={voucher.id}
                                        className={`p-6 rounded-xl border bg-white shadow-sm transition-all ${
                                            voucher.status === "error" ? "border-red-300 bg-red-50/10" : "border-gray-200"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between border-b pb-3 mb-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2.5 py-1 rounded-md">
                                                    Voucher #{idx + 1}
                                                </span>
                                                <span className="text-xs font-medium text-gray-500">
                                                    Mode: <strong className="text-gray-900">{voucher.mode}</strong>
                                                </span>
                                                {voucher.hasGst ? (
                                                    <span className="text-xs font-bold bg-purple-100 text-purple-800 px-2.5 py-1 rounded-md">
                                                        B2B (GST)
                                                    </span>
                                                ) : (
                                                    <span className="text-xs font-bold bg-gray-100 text-gray-800 px-2.5 py-1 rounded-md">
                                                        B2C (Non-GST)
                                                    </span>
                                                )}
                                            </div>
                                            <div>
                                                {voucher.status === "imported" ? (
                                                    <span className="inline-flex items-center text-green-700 text-xs font-bold bg-green-100 px-3 py-1 rounded-full">
                                                        <CheckCircle size={14} className="mr-1" /> Saved
                                                    </span>
                                                ) : voucher.status === "error" ? (
                                                    <span className="inline-flex items-center text-red-700 text-xs font-bold bg-red-100 px-3 py-1 rounded-full" title={voucher.errorMessage}>
                                                        <AlertTriangle size={14} className="mr-1" /> Import Blocked ({voucher.errorMessage})
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center text-green-700 text-xs font-bold bg-green-100 px-3 py-1 rounded-full">
                                                        <CheckCircle size={14} className="mr-1" /> All Validations Passed — Ready for Import
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* SECTION 1: HEADER BLOCK */}
                                        <div className="p-4 mb-6 rounded-xl border border-gray-200 bg-gray-50/70 space-y-4">
                                            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800 border-b border-gray-200 pb-1 flex flex-wrap items-center justify-between gap-2">
                                                <span>Voucher Header (Auto Sequence Generated)</span>
                                                <div className="flex items-center gap-2">
                                                    {voucher.gstType === "same-state" ? (
                                                        <span className="text-green-700 bg-green-100 px-2.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                                                            ✓ Same State (Intra-State: CGST + SGST)
                                                        </span>
                                                    ) : voucher.gstType === "different-state" ? (
                                                        <span className="text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                                                            ✓ Different State (Inter-State: IGST)
                                                        </span>
                                                    ) : (
                                                        <span className="text-red-700 bg-red-100 px-2.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                                                            ✗ State Cannot Be Determined
                                                        </span>
                                                    )}
                                                    {voucher.isBalanceMatched ? (
                                                        <span className="text-green-700 bg-green-100 px-2 py-0.5 rounded text-[10px] font-bold">
                                                            ✓ Balanced (₹{voucher.invoiceValue.toLocaleString()})
                                                        </span>
                                                    ) : (
                                                        <span className="text-red-700 bg-red-100 px-2 py-0.5 rounded text-[10px] font-bold">
                                                            ✗ Balance Mismatch (Debit ≠ Credit)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-xs">
                                                <div>
                                                    <span className="text-gray-500 block">Voucher Date</span>
                                                    <span className="font-semibold text-gray-900">{voucher.voucherDate}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500 block">Voucher No.</span>
                                                    <span className="font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{voucher.voucherNo}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500 block">Ref / Inv No.</span>
                                                    <span className="font-semibold text-gray-900">{voucher.supplierInvoice}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500 block">Invoice Date</span>
                                                    <span className="font-semibold text-gray-900">{voucher.invoiceDate}</span>
                                                </div>
                                                <div className="col-span-2">
                                                    <span className="text-gray-500 block">Customer / Party Name</span>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className="font-bold text-gray-900">{voucher.partyName}</span>
                                                        {voucher.partyMatch ? (
                                                            <span className="text-green-700 bg-green-100 text-[10px] font-bold px-1.5 py-0.5 rounded">✓ Found</span>
                                                        ) : (
                                                            <span className="text-red-700 bg-red-100 text-[10px] font-bold px-1.5 py-0.5 rounded">✗ Not Found</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Overall Discount Detail Badge Bar */}
                                            {(voucher.overallDiscountAmt! > 0 || voucher.overallDiscountLedger) && (
                                                <div className="pt-2 border-t border-gray-200 flex flex-wrap items-center gap-4 text-xs">
                                                    <span className="font-bold text-gray-700">Overall Discount:</span>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-gray-500">Ledger:</span>
                                                        <span className="font-semibold text-gray-900">{voucher.overallDiscountLedger || 'Default Discount'}</span>
                                                        {voucher.overallDiscountLedgerFound ? (
                                                            <span className="text-green-700 bg-green-100 text-[10px] font-bold px-1.5 py-0.5 rounded">✓ Found</span>
                                                        ) : (
                                                            <span className="text-red-700 bg-red-100 text-[10px] font-bold px-1.5 py-0.5 rounded">✗ Ledger Missing</span>
                                                        )}
                                                    </div>
                                                    {voucher.overallDiscountPct! > 0 && (
                                                        <div>
                                                            <span className="text-gray-500">Rate: </span>
                                                            <span className="font-semibold text-gray-900">{voucher.overallDiscountPct}%</span>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <span className="text-gray-500">Amount: </span>
                                                        <span className="font-bold text-red-600">-₹{(voucher.overallDiscountAmt || 0).toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* SECTION 2: ITEMS / ACCOUNTING ENTRIES TABLE */}
                                        {voucher.mode === "Item Invoice" ? (
                                            <div>
                                                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                                                    <span>Items & Particulars ({voucher.items.length} items)</span>
                                                    <span className="text-[11px] normal-case text-blue-700 font-semibold">
                                                        Sales Ledger: {voucher.items[0]?.salesLedger || 'Auto B2B/B2C'}
                                                    </span>
                                                </h4>
                                                <div className="overflow-x-auto border rounded-xl">
                                                    <table className="w-full text-xs text-left text-gray-600">
                                                        <thead className="bg-gray-100 text-gray-700 font-bold uppercase text-[10px]">
                                                            <tr>
                                                                <th className="p-2.5">S.No</th>
                                                                <th className="p-2.5">Item Name</th>
                                                                <th className="p-2.5">HSN/SAC</th>
                                                                <th className="p-2.5 text-right">Qty</th>
                                                                <th className="p-2.5">Unit</th>
                                                                <th className="p-2.5 text-right">Rate</th>
                                                                <th className="p-2.5 text-right">Taxable</th>
                                                                <th className="p-2.5 text-right">GST %</th>
                                                                <th className="p-2.5 text-right">CGST</th>
                                                                <th className="p-2.5 text-right">SGST</th>
                                                                <th className="p-2.5 text-right">IGST</th>
                                                                <th className="p-2.5 text-right">Total</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100 font-medium">
                                                            {voucher.items.map((it, i) => (
                                                                <tr key={i} className="hover:bg-gray-50">
                                                                    <td className="p-2.5 text-gray-500">{it.srNo}</td>
                                                                    <td className="p-2.5">
                                                                        <div className="font-bold text-gray-900">{it.itemName}</div>
                                                                        {!it.itemFound && <span className="text-[10px] text-red-600 font-bold">✗ Stock Item Not Found</span>}
                                                                    </td>
                                                                    <td className="p-2.5">
                                                                        {it.hsnCode}
                                                                        {!it.hsnFound && <span className="text-[10px] text-red-600 block font-bold">✗ HSN Mismatch</span>}
                                                                    </td>
                                                                    <td className="p-2.5 text-right font-bold">{it.quantity}</td>
                                                                    <td className="p-2.5">
                                                                        {it.unit}
                                                                        {!it.unitFound && <span className="text-[10px] text-red-600 block font-bold">✗ Unit Mismatch</span>}
                                                                    </td>
                                                                    <td className="p-2.5 text-right">₹{it.rate.toLocaleString()}</td>
                                                                    <td className="p-2.5 text-right font-bold text-gray-900">₹{it.taxableValue.toLocaleString()}</td>
                                                                    <td className="p-2.5 text-right font-bold">{it.gstRate}%</td>
                                                                    <td className="p-2.5 text-right">
                                                                        ₹{it.cgstAmount.toLocaleString()}
                                                                        {!it.cgstLedgerFound && <span className="text-[10px] text-red-600 block font-bold">✗ CGST Ledger Missing</span>}
                                                                    </td>
                                                                    <td className="p-2.5 text-right">
                                                                        ₹{it.sgstAmount.toLocaleString()}
                                                                        {!it.sgstLedgerFound && <span className="text-[10px] text-red-600 block font-bold">✗ SGST Ledger Missing</span>}
                                                                    </td>
                                                                    <td className="p-2.5 text-right">
                                                                        ₹{it.igstAmount.toLocaleString()}
                                                                        {!it.igstLedgerFound && <span className="text-[10px] text-red-600 block font-bold">✗ IGST Ledger Missing</span>}
                                                                    </td>
                                                                    <td className="p-2.5 text-right font-bold text-blue-700">₹{it.itemTotal.toLocaleString()}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                                    Accounting Entries ({voucher.accountingEntries.length} entries)
                                                </h4>
                                                <div className="overflow-x-auto border rounded-xl">
                                                    <table className="w-full text-xs text-left text-gray-600">
                                                        <thead className="bg-gray-100 text-gray-700 font-bold uppercase text-[10px]">
                                                            <tr>
                                                                <th className="p-2.5">S.No</th>
                                                                <th className="p-2.5">Ledger Name</th>
                                                                <th className="p-2.5 text-right">Amount</th>
                                                                <th className="p-2.5 text-center">Type</th>
                                                                <th className="p-2.5 text-center">Validation</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100 font-medium">
                                                            {voucher.accountingEntries.map((ae, i) => (
                                                                <tr key={i} className="hover:bg-gray-50">
                                                                    <td className="p-2.5 text-gray-500">{ae.srNo}</td>
                                                                    <td className="p-2.5 font-bold text-gray-900">{ae.ledgerName}</td>
                                                                    <td className="p-2.5 text-right font-bold">₹{ae.amount.toLocaleString()}</td>
                                                                    <td className="p-2.5 text-center">
                                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ae.type.toLowerCase() === 'debit' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                                                            {ae.type.toUpperCase()}
                                                                        </span>
                                                                    </td>
                                                                    <td className="p-2.5 text-center">
                                                                        {ae.ledgerFound ? (
                                                                            <span className="text-green-700 font-bold text-[10px]">✓ Valid Ledger</span>
                                                                        ) : (
                                                                            <span className="text-red-600 font-bold text-[10px]">✗ Ledger Not Found</span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3">
                                {(() => {
                                    const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
                                    const cellFor = (voucher: ManualGroupedVoucher, header: string) => {
                                        const key = norm(header);
                                        const entry = voucher.accountingEntries.find((row) => norm(row.sheetColumn || "") === key);
                                        if (entry) return { amount: entry.amount, ledgerFound: entry.ledgerFound, ledgerName: entry.ledgerName };
                                        const slab = SALES_SLABS.find((row) => [row.purchase, row.tax, row.cgst, row.sgst].some((name) => name && norm(name) === key));
                                        if (slab) {
                                            const lines = voucher.items.filter((item) => item.taxKind === slab.kind && Number(item.rawGstRate ?? item.gstRate) === slab.rate);
                                            if (lines.length === 0) return undefined;
                                            if (norm(slab.purchase) === key) {
                                                const amount = lines.reduce((sum, item) => sum + Number(item.taxableValue || 0), 0);
                                                if (amount <= 0) return undefined;
                                                return { amount, ledgerFound: lines.every((item) => item.salesLedgerFound), ledgerName: lines[0].salesLedger };
                                            }
                                            if (slab.tax && norm(slab.tax) === key) {
                                                const amount = lines.reduce((sum, item) => sum + Number(item.igstAmount || 0), 0);
                                                if (amount <= 0) return undefined;
                                                return { amount, ledgerFound: lines.every((item) => item.igstLedgerFound), ledgerName: lines[0].matchedIgstLedgerName || header };
                                            }
                                            if (slab.cgst && norm(slab.cgst) === key) {
                                                const amount = lines.reduce((sum, item) => sum + Number(item.cgstAmount || 0), 0);
                                                if (amount <= 0) return undefined;
                                                return { amount, ledgerFound: lines.every((item) => item.cgstLedgerFound), ledgerName: lines[0].matchedCgstLedgerName || header };
                                            }
                                            if (slab.sgst && norm(slab.sgst) === key) {
                                                const amount = lines.reduce((sum, item) => sum + Number(item.sgstAmount || 0), 0);
                                                if (amount <= 0) return undefined;
                                                return { amount, ledgerFound: lines.every((item) => item.sgstLedgerFound), ledgerName: lines[0].matchedSgstLedgerName || header };
                                            }
                                        }
                                        if (key === "discount") {
                                            const amount = Number(voucher.overallDiscountAmt || voucher.discountTotal || 0);
                                            if (amount <= 0) return undefined;
                                            return { amount, ledgerFound: voucher.overallDiscountLedgerFound !== false, ledgerName: voucher.overallDiscountLedger || "Discount" };
                                        }
                                        return undefined;
                                    };
                                    const slabHeaders = SALES_SLAB_HEADERS.filter((header) => groupedVouchers.some((voucher) => cellFor(voucher, header)));
                                    const headCell = "px-3 py-2.5 border border-[#3730A3] font-bold text-center whitespace-nowrap align-middle";
                                    const idCell = "px-3 py-2.5 border border-gray-200 text-center whitespace-nowrap bg-white align-middle";
                                    return (
                                        <div className="overflow-x-auto rounded-xl border border-[#312E81]/20 shadow-sm">
                                            <table className="w-max min-w-full text-[11px] border-collapse">
                                                <thead>
                                                    <tr className="bg-[#312E81] text-white">
                                                        <th className={headCell}>#</th>
                                                        <th className={headCell}>Voucher Date</th>
                                                        <th className={headCell}>Auto Voucher No.</th>
                                                        <th className={headCell}>GSTIN of supplier</th>
                                                        <th className={headCell}>SupplierName</th>
                                                        <th className={headCell}>Invoice number</th>
                                                        <th className={headCell}>Invoice Date</th>
                                                        <th className={headCell}>Invoice Value (₹)</th>
                                                        <th className={headCell}>Place of supply</th>
                                                        {slabHeaders.map((header) => (
                                                            <th key={header} className={headCell}>{header}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {groupedVouchers.map((voucher, index) => (
                                                        <tr key={voucher.id}>
                                                            <td className={`${idCell} font-bold text-[#312E81]`}>{index + 1}.</td>
                                                            <td className={idCell}>{voucher.voucherDate}</td>
                                                            <td className={`${idCell} font-mono font-bold text-blue-800`}>{voucher.voucherNo}</td>
                                                            <td className={idCell}>{voucher.gstin || ""}</td>
                                                            <td className={`${idCell} font-bold ${voucher.partyMatch ? "text-green-800" : "text-red-700"}`}>
                                                                {voucher.partyName} {voucher.partyMatch ? "✓" : "✗"}
                                                            </td>
                                                            <td className={idCell}>{voucher.supplierInvoice}</td>
                                                            <td className={idCell}>{voucher.invoiceDate}</td>
                                                            <td className={`${idCell} font-bold`}>₹{voucher.invoiceValue.toLocaleString()}</td>
                                                            <td className={idCell}>{voucher.pos || ""}</td>
                                                            {slabHeaders.map((header) => {
                                                                const entry = cellFor(voucher, header);
                                                                if (!entry) return <td key={`${voucher.id}-${header}`} className="px-3 py-2.5 border border-gray-200 bg-white" />;
                                                                const found = entry.ledgerFound;
                                                                return (
                                                                    <td
                                                                        key={`${voucher.id}-${header}`}
                                                                        title={found ? `${entry.ledgerName} found` : `${entry.ledgerName} not found`}
                                                                        className={`px-3 py-2.5 border text-center font-bold whitespace-nowrap ${found ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-800"}`}
                                                                    >
                                                                        {entry.amount.toLocaleString()} {found ? "✓" : "✗"}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 3: DOWNLOAD TEMPLATES */}
                {activeTab === "templates" && (
                    <div className="space-y-8">
                        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                                <div>
                                    <h4 className="text-lg font-bold text-gray-900">Accounting Invoice</h4>
                                    <p className="text-xs text-gray-500">Blue header. Same columns as the item invoice, without Item Name, Quantity and Rate. Enter the taxable amount in the matching column.</p>
                                </div>
                                <button
                                    onClick={() => downloadTemplate("Accounting Invoice")}
                                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#312E81] text-white rounded-xl hover:bg-[#1E1B4B] font-bold"
                                >
                                    <Download size={18} />
                                    Download Accounting Template
                                </button>
                            </div>
                            <div className="overflow-x-auto border border-[#312E81]">
                                <table className="min-w-max text-[11px] border-collapse">
                                    <thead>
                                        <tr className="bg-[#312E81] text-white">
                                            {SALES_ACCOUNTING_HEADERS.map((header) => (
                                                <th key={`acc-h-${header}`} className="px-2 py-2 border border-[#3730A3] font-bold text-center min-w-[92px]">
                                                    {header}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            {SALES_ACCOUNTING_HEADERS.map((header) => {
                                                return (
                                                    <td key={`acc-sample-${header}`} className="px-2 py-1.5 border border-gray-200 text-center bg-white">
                                                        {SALES_SAMPLE[header] || ""}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-2">
                                <div>
                                    <h4 className="text-lg font-bold text-gray-900">Item Invoice</h4>
                                    <p className="text-xs text-gray-500">Blue header. One invoice on one row. Enter the taxable amount in the matching column. Tax and invoice value calculate in Excel.</p>
                                </div>
                                <button
                                    onClick={() => downloadTemplate("Item Invoice")}
                                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#312E81] text-white rounded-xl hover:bg-[#1E1B4B] font-bold"
                                >
                                    <Download size={18} />
                                    Download Item Template
                                </button>
                            </div>
                            <div className="overflow-x-auto border border-[#312E81]">
                                <table className="min-w-max text-[11px] border-collapse">
                                    <thead>
                                        <tr className="bg-[#312E81] text-white">
                                            {SALES_ITEM_HEADERS.map((header) => (
                                                <th key={`item-h-${header}`} className="px-2 py-2 border border-[#3730A3] font-bold text-center min-w-[92px]">
                                                    {header}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            {SALES_ITEM_HEADERS.map((header) => {
                                                return (
                                                    <td key={`sample-${header}`} className="px-2 py-1.5 border border-gray-200 text-center bg-white">
                                                        {SALES_SAMPLE[header] || ""}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SalesImport;
