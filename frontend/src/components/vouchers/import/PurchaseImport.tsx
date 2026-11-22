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
import { allSystemGroups as baseGroups } from "../../../constants/ledgerGroups";

// Item entry matching Manual Purchase Voucher structure
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
    purchaseLedger: string;
    slabLine?: boolean;
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
    purchaseLedgerFound: boolean;
    calculationWarning?: string;
}

// Accounting entry matching Manual Purchase Voucher structure
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
    voucherNo: string; // Auto-generated from manual purchase voucher sequence
    supplierInvoice: string;
    invoiceDate: string;
    partyName: string;
    mode: "Item Invoice" | "Accounting Invoice" | "item-invoice" | "accounting-invoice";
    godownTracking: "Enabled (Yes)" | "Disabled (No)" | "yes" | "no";
    gstin: string;
    pos: string;
    totalDebit: number;
    totalCredit: number;
    invoiceValue: number;
    discountTotal?: number;
    purchaseLedger: string;
    status: "pending" | "importing" | "imported" | "error";
    errorMessage?: string;
    partyMatch: boolean; // Party Found / Not Found
    isBalanceMatched: boolean; // Debit === Credit
    _matchedLedgerId?: string | number;
    _matchedPurchaseLedgerId?: string | number;
    gstType: "same-state" | "different-state" | "unknown";
    companyStateCode: string;
    companyStateName: string;
    partyStateCode: string;
    partyStateName: string;
    items: ManualItemRow[];
    accountingEntries: ManualAccountingRow[];
    slabImport?: boolean;
}

// Helper: Normalize tax inputs (e.g. 18, "18%", 0.18 -> 18)
const ITEM_SLABS: { purchase: string; kind: "exempt" | "inter" | "intra"; rate: number; tax?: string; cgst?: string; sgst?: string }[] = [
    { purchase: "exempt purchase", kind: "exempt", rate: 0 },
    { purchase: "3% inter state purchase", kind: "inter", rate: 3, tax: "igst3%" },
    { purchase: "3% intra state purchase", kind: "intra", rate: 3, cgst: "cgst1.5%", sgst: "sgst1.5%" },
    { purchase: "5% inter state purchase", kind: "inter", rate: 5, tax: "igst5%" },
    { purchase: "5% intra state purchase", kind: "intra", rate: 5, cgst: "cgst2.5%", sgst: "sgst2.5%" },
    { purchase: "18% inter state purchase", kind: "inter", rate: 18, tax: "igst18%" },
    { purchase: "18% intra state purchase", kind: "intra", rate: 18, cgst: "cgst9%", sgst: "sgst9%" },
    { purchase: "28% inter state purchase", kind: "inter", rate: 28, tax: "igst28%" },
    { purchase: "28% intra state purchase", kind: "intra", rate: 28, cgst: "cgst14%", sgst: "sgst14%" },
];

const SLAB_AMOUNT_HEADERS = [
    "Exempt purchase", "3% inter state purchase", "Igst3%", "3% intra state purchase", "cgst1.5%", "sgst1.5%",
    "5% inter state purchase", "Igst5%", "5% intra state purchase", "cgst2.5%", "sgst2.5%",
    "18% inter state purchase", "Igst18%", "18% intra state purchase", "cgst9%", "sgst9%",
    "28% inter state purchase", "Igst28%", "28% intra state purchase", "cgst14%", "sgst14%",
    "Discount",
];

const ACCOUNTING_HEADERS = [
    "GSTIN of supplier", "SupplierName", "Invoice number", "Invoice Date", "Invoice Value (₹)",
    "Place of supply", "Supply Attract Reverse Charge",
    ...SLAB_AMOUNT_HEADERS,
];

const ITEM_TEMPLATE_HEADERS = [
    "GSTIN of supplier", "SupplierName", "Invoice number", "Invoice Date", "Invoice Value (₹)",
    "Place of supply", "Supply Attract Reverse Charge", "", "Item Name", "Quantity", "Rate",
    ...SLAB_AMOUNT_HEADERS,
];

const cellNumber = (val: any): number => {
    if (val === undefined || val === null || val === "") return 0;
    const parsed = parseFloat(String(val).replace(/,/g, "").replace(/%/g, "").trim());
    return isNaN(parsed) ? 0 : parsed;
};

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

const PurchaseImport: React.FC = () => {
    const navigate = useNavigate();
    const { companyInfo } = useCompany();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [ledgers, setLedgers] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [stockUnits, setStockUnits] = useState<any[]>([]);
    const [groupedVouchers, setGroupedVouchers] = useState<ManualGroupedVoucher[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [activeTab, setActiveTab] = useState<"import" | "preview" | "templates">("import");
    const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 });
    const [selectedMode, setSelectedMode] = useState<"Item Invoice" | "Accounting Invoice">("Item Invoice");
    const [viewLayout, setViewLayout] = useState<"card" | "table">("card");
    const [sundryGroupId, setSundryGroupId] = useState<number | string>(-109);

    const companyId = localStorage.getItem("company_id") || "";
    const ownerType = localStorage.getItem("supplier") || "";
    const ownerId = localStorage.getItem(ownerType === "employee" ? "employee_id" : "user_id") || "";

    const fetchLedgersAndItems = async () => {
        if (!companyId || !ownerId || !ownerType) return;
        try {
            const [ledgerRes, itemRes, unitRes, groupRes] = await Promise.all([
                axios.get(`${import.meta.env.VITE_API_URL}/api/ledger`, {
                    params: { company_id: companyId, owner_type: ownerType, owner_id: ownerId }
                }),
                axios.get(`${import.meta.env.VITE_API_URL}/api/stock-items`, {
                    params: { company_id: companyId, owner_type: ownerType, owner_id: ownerId }
                }),
                axios.get(`${import.meta.env.VITE_API_URL}/api/stock-units`, {
                    params: { company_id: companyId, owner_type: ownerType, owner_id: ownerId }
                }).catch(() => ({ data: [] })),
                axios.get(`${import.meta.env.VITE_API_URL}/api/ledger-groups`, {
                    params: { company_id: companyId, owner_type: ownerType, owner_id: ownerId }
                }).catch(() => ({ data: [] }))
            ]);
            setLedgers(Array.isArray(ledgerRes.data) ? ledgerRes.data : []);
            const fetchedItems = (itemRes.data as any)?.data || itemRes.data;
            setItems(Array.isArray(fetchedItems) ? fetchedItems : []);
            const fetchedUnits = (unitRes.data as any)?.data || unitRes.data;
            setStockUnits(Array.isArray(fetchedUnits) ? fetchedUnits : []);

            const allGroups = [...(Array.isArray(groupRes.data) ? groupRes.data : []), ...baseGroups];
            const matchedGroup = allGroups.find(
                (g: any) => String(g.name || "").toLowerCase().trim() === "sundry creditors"
            );
            if (matchedGroup) {
                setSundryGroupId(matchedGroup.id);
            }
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

    // Helper: Fetch starting Voucher Number from manual Purchase Voucher API logic
    const fetchStartingVoucherNumber = async (date: string): Promise<string> => {
        try {
            const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/purchase-vouchers/next-number`, {
                params: {
                    company_id: companyId,
                    owner_type: ownerType,
                    owner_id: ownerId,
                    voucherType: 'PRV',
                    date
                }
            });
            if (res.data?.success && res.data?.voucherNumber) {
                return res.data.voucherNumber;
            }
        } catch (err) {
            console.error("Error fetching starting voucher number:", err);
        }
        return "PRV/26-27/000001";
    };

    // Helper: Increment voucher number string (e.g. PRV/26-27/000001 -> PRV/26-27/000002)
    const getNextVoucherNumberInSequence = (baseNum: string, index: number): string => {
        if (!baseNum) return `PRV/26-27/${String(index + 1).padStart(6, '0')}`;
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

    // Helper: Flexible Ledger Resolution (handles case & space variations like "9% CGST", "9 % sgst", "9% Cgst", "9 % Sgst", etc.)
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

        // 2. No-whitespace match (e.g. "9 % sgst" -> "9%sgst" vs "9%sgst")
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

            // Fallback: match any ledger containing taxType (e.g. "CGST" or "Input CGST")
            found = ledgersList.find(l => {
                const lName = (l.name || l.ledger_name || "").toLowerCase();
                return lName === taxType || lName === `input ${taxType}` || lName === `output ${taxType}` || lName.includes(taxType);
            });
            if (found) return found;
        }

        // 4. Substring / Alias fallback
        found = ledgersList.find(l => {
            const lName = (l.name || l.ledger_name || "").toLowerCase().replace(/\s+/g, " ").trim();
            return lName.includes(cleanInput) || cleanInput.includes(lName);
        });

        return found || null;
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

    // Process Excel File with Auto Voucher Numbering, Master Validations, & Tax Calculations
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

            const rowText = (row: any[]) => (row || []).map(c => String(c || "").toLowerCase().trim());
            const slabHeaderIndex = rawRows.findIndex(row => {
                const cells = rowText(row);
                return cells.some(c => c.includes("gstin of supplier")) && cells.some(c => c.includes("exempt purchase"));
            });
            const accountingHeaderIndex = rawRows.findIndex(row => {
                const cells = rowText(row);
                return cells.some(c => c.includes("ledger 1")) && cells.some(c => c.includes("voucher date") || c === "voucher date");
            });

            let activeMode = selectedMode;
            const slabHeader = slabHeaderIndex !== -1 ? rowText(rawRows[slabHeaderIndex]) : [];
            const slabIsItem = slabHeader.some(cell => cell === "item name" || cell === "quantity" || cell === "rate");
            const useSlabLayout = slabHeaderIndex !== -1 && (accountingHeaderIndex === -1 || slabHeaderIndex < accountingHeaderIndex);
            if (useSlabLayout) activeMode = slabIsItem ? "Item Invoice" : "Accounting Invoice";
            else if (accountingHeaderIndex !== -1) activeMode = "Accounting Invoice";
            if (activeMode !== selectedMode) setSelectedMode(activeMode);

            if (useSlabLayout) {
                const header = slabHeader;
                const rawHeader = (rawRows[slabHeaderIndex] || []).map(cell => String(cell || "").trim());
                const col = (name: string) => header.findIndex(c => c === name);
                const headerLabel = (name: string) => rawHeader[col(name)] || name;
                const gstinCol = col("gstin of supplier");
                const supplierCol = header.findIndex(c => c === "suppliername" || c === "supplier name" || c === "party / supplier name");
                const invoiceCol = header.findIndex(c => c === "invoice number" || c === "supplier invoice");
                const invoiceDateCol = col("invoice date");
                const posCol = col("place of supply");
                const itemNameCol = col("item name");
                const qtyCol = col("quantity");
                const rateCol = col("rate");
                const discountCol = col("discount");

                const cellText = (value: any) => {
                    if (value === undefined || value === null) return "";
                    const text = String(value).replace(/\s+/g, " ").trim();
                    return text.toLowerCase() === "undefined" ? "" : text;
                };

                for (let r = slabHeaderIndex + 1; r < rawRows.length; r++) {
                    const row = rawRows[r] || [];
                    const supplierName = cellText(supplierCol >= 0 ? row[supplierCol] : "");
                    const invoiceNo = cellText(invoiceCol >= 0 ? row[invoiceCol] : "");
                    const gstin = cellText(gstinCol >= 0 ? row[gstinCol] : "");
                    if (!supplierName && !invoiceNo && !gstin) continue;
                    if (["invoice number", "suppliername", "gstin of supplier"].includes(supplierName.toLowerCase())) continue;

                    const invoiceDate = formatDate(invoiceDateCol >= 0 ? row[invoiceDateCol] : "") || new Date().toISOString().split("T")[0];
                    const groupKey = `${invoiceDate}-${invoiceNo || gstin}-${supplierName || gstin}`;
                    if (!rawGroups[groupKey]) {
                        rawGroups[groupKey] = {
                            id: `v-${r}`,
                            voucherDate: invoiceDate,
                            supplierInvoice: invoiceNo || `INV-${Object.keys(rawGroups).length + 1}`,
                            invoiceDate,
                            partyName: supplierName || gstin || "Supplier",
                            gstin,
                            pos: String(posCol >= 0 ? row[posCol] : "").trim(),
                            mode: slabIsItem ? "Item Invoice" : "Accounting Invoice",
                            godownTracking: "Enabled (Yes)",
                            slabImport: slabIsItem,
                            items: [],
                            accountingEntries: []
                        };
                    }

                    const sheetItemName = itemNameCol >= 0 ? String(row[itemNameCol] || "").trim() : "";
                    const sheetQty = qtyCol >= 0 ? cellNumber(row[qtyCol]) : 0;
                    const sheetRate = rateCol >= 0 ? cellNumber(row[rateCol]) : 0;
                    const discount = discountCol >= 0 ? cellNumber(row[discountCol]) : 0;
                    let discountAssigned = rawGroups[groupKey].items.some((it: any) => Number(it.discount) > 0);
                    let accountingDebit = 0;

                    const pushAccounting = (ledgerName: string, amount: number, type: "Debit" | "Credit", isParty = false, sheetColumn = "") => {
                        if (!ledgerName || amount <= 0) return;
                        rawGroups[groupKey].accountingEntries.push({
                            srNo: rawGroups[groupKey].accountingEntries.length + 1,
                            ledgerName,
                            amount,
                            type,
                            _isParty: isParty,
                            sheetColumn,
                        });
                    };

                    ITEM_SLABS.forEach(slab => {
                        const purchaseCol = col(slab.purchase);
                        if (purchaseCol < 0) return;
                        const taxable = cellNumber(row[purchaseCol]);
                        if (taxable <= 0) return;

                        let cgstAmount = 0;
                        let sgstAmount = 0;
                        let igstAmount = 0;
                        if (slab.kind === "inter" && slab.tax) {
                            const taxCol = col(slab.tax);
                            const cached = taxCol >= 0 ? cellNumber(row[taxCol]) : 0;
                            igstAmount = cached > 0 ? cached : Number(((taxable * slab.rate) / 100).toFixed(2));
                        } else if (slab.kind === "intra" && slab.cgst && slab.sgst) {
                            const cgstCol = col(slab.cgst);
                            const sgstCol = col(slab.sgst);
                            const cachedCgst = cgstCol >= 0 ? cellNumber(row[cgstCol]) : 0;
                            const cachedSgst = sgstCol >= 0 ? cellNumber(row[sgstCol]) : 0;
                            const half = Number(((taxable * (slab.rate / 2)) / 100).toFixed(2));
                            cgstAmount = cachedCgst > 0 ? cachedCgst : half;
                            sgstAmount = cachedSgst > 0 ? cachedSgst : half;
                        }

                        if (!slabIsItem) {
                            pushAccounting(headerLabel(slab.purchase), taxable, "Debit", false, slab.purchase);
                            accountingDebit += taxable;
                            if (igstAmount > 0 && slab.tax) {
                                pushAccounting(headerLabel(slab.tax), igstAmount, "Debit", false, slab.tax);
                                accountingDebit += igstAmount;
                            }
                            if (cgstAmount > 0 && slab.cgst) {
                                pushAccounting(headerLabel(slab.cgst), cgstAmount, "Debit", false, slab.cgst);
                                accountingDebit += cgstAmount;
                            }
                            if (sgstAmount > 0 && slab.sgst) {
                                pushAccounting(headerLabel(slab.sgst), sgstAmount, "Debit", false, slab.sgst);
                                accountingDebit += sgstAmount;
                            }
                            return;
                        }

                        const quantity = sheetQty > 0 ? sheetQty : 1;
                        const rate = sheetRate > 0 && ITEM_SLABS.filter(s => {
                            const idx = col(s.purchase);
                            return idx >= 0 && cellNumber(row[idx]) > 0;
                        }).length === 1
                            ? sheetRate
                            : Number((taxable / quantity).toFixed(2));

                        rawGroups[groupKey].items.push({
                            srNo: rawGroups[groupKey].items.length + 1,
                            itemName: sheetItemName || slab.purchase.replace(/\b\w/g, (ch: string) => ch.toUpperCase()),
                            hsnCode: "",
                            quantity,
                            unit: "",
                            rate,
                            discount: !discountAssigned ? discount : 0,
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
                            purchaseLedger: slab.purchase.replace(/\b\w/g, (ch: string) => ch.toUpperCase()),
                            slabLine: true,
                            namedOnSheet: !!sheetItemName,
                            taxKind: slab.kind,
                        });
                        if (discount > 0) discountAssigned = true;
                    });

                    if (!slabIsItem && accountingDebit > 0) {
                        if (discount > 0) pushAccounting(headerLabel("discount"), discount, "Credit", false, "discount");
                        const partyCreditName = supplierName || gstin || rawGroups[groupKey].partyName || "Supplier";
                        pushAccounting(partyCreditName, Math.max(0, Number((accountingDebit - discount).toFixed(2))), "Credit", true, "supplier");
                    }
                }
            }

            // Check if sheet uses 2-Section Block Layout (where header block and item/accounting details are in separate rows)
            let isBlockLayout = false;
            for (let r = 0; r < Math.min(10, rawRows.length); r++) {
                const rowStr = (rawRows[r] || []).map(c => String(c || "").toLowerCase()).join(" ");
                if (
                    rowStr.includes("voucher date") &&
                    (rowStr.includes("party / supplier") || rowStr.includes("supplier invoice") || rowStr.includes("party name")) &&
                    !rowStr.includes("item") && !rowStr.includes("sr no") && !rowStr.includes("ledger")
                ) {
                    isBlockLayout = true;
                    break;
                }
            }

            let firstVoucherDate = new Date().toISOString().split("T")[0];

            if (!useSlabLayout && isBlockLayout) {
                let currentGroup: any = null;
                for (let r = 0; r < rawRows.length; r++) {
                    const row = rawRows[r] || [];
                    const rowStr = row.map(c => String(c || "").trim()).join(" | ");
                    const lowerRowStr = rowStr.toLowerCase();

                    if (lowerRowStr.includes("voucher date") && (lowerRowStr.includes("supplier invoice") || lowerRowStr.includes("supplier") || lowerRowStr.includes("party"))) {
                        // Dynamically resolve header column indices from Row r
                        const lowerHeaderRow = row.map(c => String(c || "").toLowerCase().trim());
                        let vDateCol = lowerHeaderRow.findIndex(c => c.includes("voucher date") || (c.includes("date") && !c.includes("invoice")));
                        let suppInvCol = lowerHeaderRow.findIndex(c => c.includes("supplier invoice") || c.includes("invoice number") || c.includes("invoice no") || c.includes("inv no") || c.includes("supplier inv"));
                        let invDateCol = lowerHeaderRow.findIndex(c => c.includes("invoice date"));
                        // Explicitly exclude "invoice" so "supplier invoice" doesn't match as party column
                        let partyCol = lowerHeaderRow.findIndex(c => (c.includes("party") || c.includes("supplier") || c.includes("vendor") || c.includes("trade/legal")) && !c.includes("invoice"));
                        let modeCol = lowerHeaderRow.findIndex(c => c.includes("mode") || c.includes("transaction"));
                        let godownCol = lowerHeaderRow.findIndex(c => c.includes("godown"));

                        if (vDateCol === -1) vDateCol = 0;
                        if (suppInvCol === -1) suppInvCol = 1;
                        if (invDateCol === -1) invDateCol = 2;
                        if (partyCol === -1) partyCol = 3;
                        if (modeCol === -1) modeCol = 4;
                        if (godownCol === -1) godownCol = 5;

                        // Row r+1 contains actual header values
                        const valRow = rawRows[r + 1] || [];
                        const vDate = formatDate(valRow[vDateCol]);
                        const suppInv = String(valRow[suppInvCol] || "").trim();
                        const invDate = formatDate(valRow[invDateCol] || vDate);
                        const partyName = String(valRow[partyCol] || "").replace(/\s+/g, " ").trim();
                        const modeStr = String(valRow[modeCol] || activeMode).trim();
                        const godownTrkStr = String(valRow[godownCol] || "Enabled (Yes)").trim();

                        const mode: "Item Invoice" | "Accounting Invoice" = modeStr.toLowerCase().includes("accounting") ? "Accounting Invoice" : "Item Invoice";
                        const groupKey = `${vDate}-${suppInv}-${partyName}`;

                        if (vDate && !firstVoucherDate) firstVoucherDate = vDate;

                        currentGroup = {
                            id: `v-${r}`,
                            voucherDate: vDate || new Date().toISOString().split("T")[0],
                            supplierInvoice: suppInv || `INV-${Object.keys(rawGroups).length + 1}`,
                            invoiceDate: invDate || vDate || new Date().toISOString().split("T")[0],
                            partyName: partyName || "Supplier",
                            mode,
                            godownTracking: godownTrkStr.toLowerCase().includes("no") ? "Disabled (No)" : "Enabled (Yes)",
                            items: [],
                            accountingEntries: []
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
                                    purchaseLedger: String(row[16] || row[17] || row[18] || "18% Purchase Account").trim(),
                                });
                            }
                        } else {
                            // Support horizontal entries on a single row (or vertical fallback)
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
                // Fallback Tabular sheet parsing (Single-row header format with multi-item inheritance)
                const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
                let lastHeader: any = null;

                jsonData.forEach((row, index) => {
                    const rawVDate = row["Voucher Date"] || row["Date"] || row["Invoice Date"];
                    const rawSuppInv = row["Supplier Invoice"] || row["Supplier Invoice #"] || row["Invoice number"] || row["Invoice No"];
                    const rawPartyName = row["Party / Supplier Name"] || row["Party Name"] || row["Supplier Name"] || row["Trade/Legal name of the Supplier"];
                    const rawMode = row["Transaction Mode"] || row["Mode"];
                    const rawGodownTrk = row["Godown Tracking"];

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
                    const dateProbe = String(rawVDate || "").toLowerCase();
                    const invoiceProbe = String(rawSuppInv || "").toLowerCase();
                    const typeProbe = String(row["Type 1"] || "").toLowerCase();
                    const modeProbe = String(rawMode || "").toLowerCase();
                    const looksLikeAccountingRow = modeProbe.includes("accounting") || typeProbe.startsWith("d") || typeProbe.startsWith("c") || row["Ledger"] || row["Particulars (Ledger Name)"];
                    if (
                        dateProbe.includes("gstin") ||
                        dateProbe.includes("suppliername") ||
                        dateProbe.includes("column map") ||
                        invoiceProbe === "invoice number" ||
                        invoiceProbe.includes("column map") ||
                        (activeMode === "Accounting Invoice" && !looksLikeAccountingRow)
                    ) {
                        return;
                    }

                    let mode = activeMode;
                    let groupKey = "";

                    if (hasExplicitHeader || !lastHeader) {
                        vDate = formatDate(rawVDate || (lastHeader ? lastHeader.vDate : ""));
                        suppInv = String(rawSuppInv || (lastHeader ? lastHeader.suppInv : "")).trim();
                        invDate = formatDate(row["Invoice Date"] || row["supplierInvoiceDate"] || vDate || (lastHeader ? lastHeader.invDate : ""));
                        partyName = String(rawPartyName || (lastHeader ? lastHeader.partyName : "")).replace(/\s+/g, " ").trim();
                        godownTrk = String(rawGodownTrk || (lastHeader ? lastHeader.godownTrk : "Enabled (Yes)")).trim();
                        if (rawMode) {
                            mode = String(rawMode).toLowerCase().includes("accounting") ? "Accounting Invoice" : "Item Invoice";
                        }

                        const resolvedVDate = vDate || new Date().toISOString().split("T")[0];
                        const resolvedSuppInv = suppInv || `INV-${index + 1}`;
                        const resolvedPartyName = partyName || "Supplier";

                        groupKey = `${resolvedVDate}-${resolvedSuppInv}-${resolvedPartyName}`;
                        lastHeader = {
                            vDate: resolvedVDate,
                            suppInv: resolvedSuppInv,
                            invDate: invDate || resolvedVDate,
                            partyName: resolvedPartyName,
                            godownTrk,
                            mode,
                            groupKey
                        };
                    } else {
                        // Inherit voucher header from previous row for multi-item vouchers
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
                            partyName: partyName || "Supplier",
                            mode,
                            godownTracking: godownTrk.toLowerCase().includes("no") ? "Disabled (No)" : "Enabled (Yes)",
                            items: [],
                            accountingEntries: []
                        };
                    }

                    if (activeMode === "Item Invoice" || mode === "Item Invoice") {
                        const itemName = String(row["Item"] || row["Item Name"] || "").trim();
                        const qty = Number(row["Quantity"] || row["Qty"] || 0);
                        const rate = Number(row["Rate"] || row["Item Rate (₹)"] || 0);
                        const taxableVal = Number(row["Taxable"] || row["Taxable Value (₹)"] || (qty * rate));
                        const discount = parseTaxRate(row["Discount"] || row["Discount (₹)"] || row["Discount (%)"] || 0);
                        
                        // Read single GST column (GST, GST (%), GST Rate, Rate (%), or fallback to sum)
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
                                hsnCode: String(row["HSN/SAC"] || "").trim(),
                                quantity: qty,
                                unit: String(row["Unit"] || "PCS").trim(),
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
                                godown: String(row["Godown"] || "Main Location").trim(),
                                purchaseLedger: String(row["Purchase-Ledger"] || "18% Purchase Account").trim(),
                            });
                        }
                    } else {
                        // Support horizontal single-row Accounting Invoice entries (Ledger 1, Amount 1, Type 1...)
                        let hasHorizontalKeys = false;
                        for (let k = 1; k <= 10; k++) {
                            if (row[`Ledger ${k}`] || row[`Ledger_${k}`] || row[`Particulars ${k}`]) {
                                hasHorizontalKeys = true;
                                break;
                            }
                        }

                        if (hasHorizontalKeys) {
                            for (let k = 1; k <= 15; k++) {
                                const ledgerName = String(
                                    row[`Ledger ${k}`] || row[`Ledger_${k}`] || row[`Particulars ${k}`] || ""
                                ).trim();
                                const amount = Number(
                                    row[`Amount ${k}`] || row[`Amount_${k}`] || row[`Amount (₹) ${k}`] || 0
                                );
                                const typeStr = String(
                                    row[`Type ${k}`] || row[`Type_${k}`] || row[`Debit/Credit ${k}`] || "Debit"
                                ).trim();
                                const type: "Credit" | "Debit" = typeStr.toLowerCase().startsWith("c") ? "Credit" : "Debit";

                                if (ledgerName && ledgerName !== "Ledger" && !ledgerName.toLowerCase().includes("amount")) {
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
                            const ledgerName = String(row["Ledger"] || row["Particulars (Ledger Name)"] || "").trim();
                            const amount = Number(row["Amount"] || row["Amount (₹)"] || 0);
                            const typeStr = String(row["Type"] || "Debit").trim();
                            const type: "Credit" | "Debit" = typeStr.toLowerCase().startsWith("c") ? "Credit" : "Debit";
                            if (ledgerName || amount > 0) {
                                rawGroups[groupKey].accountingEntries.push({
                                    srNo: rawGroups[groupKey].accountingEntries.length + 1,
                                    ledgerName: ledgerName || "Purchase Account",
                                    amount,
                                    type
                                });
                            }
                        }
                    }
                });
            }

            // Validate Each Voucher & Assign Auto Voucher Number
            const groupList = Object.values(rawGroups).filter((group: any) => (group.items || []).length > 0 || (group.accountingEntries || []).length > 0);
            const slabDate = (groupList.find((group: any) => group.voucherDate) as any)?.voucherDate;
            if (useSlabLayout && slabDate) firstVoucherDate = slabDate;

            // Fetch starting Voucher Number from manual Purchase Voucher API logic
            const startingVoucherNum = await fetchStartingVoucherNumber(firstVoucherDate);
            const validatedVouchers: ManualGroupedVoucher[] = [];

            groupList.forEach((group, idx) => {
                const autoVoucherNo = getNextVoucherNumberInSequence(startingVoucherNum, idx);
                let errors: string[] = [];

                // 1. Party / Supplier Name Resolution & Validation against Ledgers Master
                let partyName = group.partyName;
                if (group.mode === "Accounting Invoice" && (!partyName || partyName === "Supplier")) {
                    const creditEntry = group.accountingEntries.find(e => e.type === "Credit");
                    if (creditEntry) {
                        partyName = creditEntry.ledgerName;
                    }
                }
                const cleanPartyName = partyName.toLowerCase().replace(/\s+/g, " ").trim();

                const sheetGstin = String(group.gstin || "").toUpperCase().replace(/\s+/g, "").trim();
                const matchedPartyLedger = partyName || sheetGstin
                    ? ledgers.find(l => {
                        const lName = (l.name || "").toLowerCase().replace(/\s+/g, " ").trim();
                        return cleanPartyName && lName === cleanPartyName;
                    }) || ledgers.find(l => {
                        const lGst = (l.gst_number || l.gstNumber || "").toUpperCase().replace(/\s+/g, "").trim();
                        return lGst && (lGst === partyName.toUpperCase().replace(/\s+/g, "").trim() || (sheetGstin && lGst === sheetGstin));
                    })
                    : null;
                if (matchedPartyLedger?.name) partyName = matchedPartyLedger.name;

                if (group.mode === "Accounting Invoice" && matchedPartyLedger?.name) {
                    group.accountingEntries.forEach((entry: any) => {
                        if (entry._isParty || !entry.ledgerName || String(entry.ledgerName).toLowerCase() === "undefined") {
                            entry.ledgerName = matchedPartyLedger.name;
                        }
                    });
                }

                const partyMatch = !!matchedPartyLedger;

                // 2. GST State Detection: Company State vs Party State Code
                const companyGstin = (companyInfo?.gstNumber || (companyInfo as any)?.gst_number || (companyInfo as any)?.gstin || "").trim();
                const companyStateStr = (companyInfo?.state || "").trim();
                const companyStateRes = extractStateCode(companyGstin || companyStateStr);

                const partyGstin = (matchedPartyLedger?.gst_number || matchedPartyLedger?.gstNumber || group.gstin || "").trim();
                const partyStateStr = (matchedPartyLedger?.state || group.pos || "").trim();
                const partyStateRes = extractStateCode(partyGstin || partyStateStr);

                let isSameState = false;
                let isDifferentState = false;
                let gstType: "same-state" | "different-state" | "unknown" = "unknown";

                if (!group.slabImport && !companyStateRes.code) {
                    errors.push(`Company GSTIN or State is missing/invalid in Company Profile. State cannot be determined.`);
                }

                if (!partyMatch) {
                    errors.push(`Party / Supplier Name '${partyName}' Not Found in Ledger Master`);
                } else if (!group.slabImport && !partyStateRes.code) {
                    errors.push(`Party '${partyName}' GSTIN ('${partyGstin || 'Missing'}') or State is missing/invalid. State cannot be determined.`);
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

                // 3. Validate Items, HSN/SAC, Unit, Tax Rates & Purchase-Ledger (Item Invoice Mode)
                let itemsValidated: ManualItemRow[] = [];
                let totalDebit = 0;
                let totalCredit = 0;

                if (group.mode === "Item Invoice") {
                    group.items.forEach((it: any) => {
                        if (it.slabLine) {
                            const cleanPLedger = (it.purchaseLedger || "").toLowerCase().replace(/\s+/g, " ").trim();
                            const matchedPL = cleanPLedger
                                ? ledgers.find(l => (l.name || "").toLowerCase().replace(/\s+/g, " ").trim() === cleanPLedger)
                                    || matchLedgerFlexibly(it.purchaseLedger, ledgers)
                                : null;
                            const purchaseLedgerFound = !!matchedPL;
                            if (!purchaseLedgerFound) errors.push(`Purchase-Ledger '${it.purchaseLedger}' Not Found in Ledger Master`);

                            const rawGstRate = Number(it.rawGstRate ?? it.gstRate ?? 0);
                            const cgstRate = it.taxKind === "intra" ? Number((rawGstRate / 2).toFixed(2)) : 0;
                            const sgstRate = cgstRate;
                            const igstRate = it.taxKind === "inter" ? rawGstRate : 0;
                            const cgstRes = cgstRate > 0 ? resolveTaxLedger("CGST", cgstRate, ledgers) : { found: true, ledgerName: "" };
                            const sgstRes = sgstRate > 0 ? resolveTaxLedger("SGST", sgstRate, ledgers) : { found: true, ledgerName: "" };
                            const igstRes = igstRate > 0 ? resolveTaxLedger("IGST", igstRate, ledgers) : { found: true, ledgerName: "" };
                            const taxableValue = Number(it.taxableValue || 0);
                            const discountAmt = Number(it.discount || 0);
                            const cgstAmount = Number(it.cgstAmount || 0);
                            const sgstAmount = Number(it.sgstAmount || 0);
                            const igstAmount = Number(it.igstAmount || 0);
                            const itemTotal = Math.max(0, taxableValue + sgstAmount + cgstAmount + igstAmount - discountAmt);

                            const sheetItemName = it.namedOnSheet ? it.itemName : "";
                            const matchedStockItem = sheetItemName
                                ? items.find(i => (i.name || "").toLowerCase().replace(/\s+/g, " ").trim() === sheetItemName.toLowerCase().replace(/\s+/g, " ").trim())
                                : null;
                            if (sheetItemName && !matchedStockItem) errors.push(`Stock Item '${sheetItemName}' Not Found in Stock Item Master`);
                            if (cgstRate > 0 && !cgstRes.found) errors.push(`${cgstRate}% CGST Tax Ledger Not Found in Ledger Master`);
                            if (sgstRate > 0 && !sgstRes.found) errors.push(`${sgstRate}% SGST Tax Ledger Not Found in Ledger Master`);
                            if (igstRate > 0 && !igstRes.found) errors.push(`${igstRate}% IGST Tax Ledger Not Found in Ledger Master`);

                            itemsValidated.push({
                                ...it,
                                itemName: sheetItemName || matchedPL?.name || it.purchaseLedger,
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
                                _matchedItemId: matchedStockItem?.id,
                                hsnFound: true,
                                unitFound: true,
                                cgstLedgerFound: cgstRes.found,
                                sgstLedgerFound: sgstRes.found,
                                igstLedgerFound: igstRes.found,
                                matchedCgstLedgerName: cgstRes.ledgerName,
                                matchedSgstLedgerName: sgstRes.ledgerName,
                                matchedIgstLedgerName: igstRes.ledgerName,
                                purchaseLedgerFound,
                                purchaseLedger: matchedPL?.name || it.purchaseLedger,
                                slabLine: true,
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

                        const cleanPLedger = (it.purchaseLedger || "").toLowerCase().replace(/\s+/g, " ").trim();
                        const matchedPL = cleanPLedger
                            ? ledgers.find(l => (l.name || "").toLowerCase().replace(/\s+/g, " ").trim() === cleanPLedger)
                            : null;
                        const purchaseLedgerFound = !!matchedPL;

                        // Dynamic Tax Split calculation based on determined State
                        const rawGstRate = Number(it.rawGstRate ?? it.gstRate ?? 0);
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
                            // Cannot determine state due to missing/invalid GSTIN
                            cgstRes = { found: false, ledgerName: "" };
                            sgstRes = { found: false, ledgerName: "" };
                            igstRes = { found: false, ledgerName: "" };
                        }

                        if (!itemFound) errors.push(`Stock Item '${it.itemName}' Not Found in Stock Item Master`);
                        else {
                            if (!hsnFound) errors.push(`HSN/SAC '${it.hsnCode}' Mismatch for Item '${it.itemName}'`);
                            if (!unitFound) errors.push(`Unit '${it.unit}' Mismatch for Item '${it.itemName}'`);
                        }
                        if (!purchaseLedgerFound) errors.push(`Purchase-Ledger '${it.purchaseLedger}' Not Found in Ledger Master`);

                        const taxableValue = Number((it.quantity * it.rate).toFixed(2));
                        const discountAmt = Number(it.discount || 0);
                        const cgstAmount = isSameState ? Number(((taxableValue * cgstRate) / 100).toFixed(2)) : 0;
                        const sgstAmount = isSameState ? Number(((taxableValue * sgstRate) / 100).toFixed(2)) : 0;
                        const igstAmount = isDifferentState ? Number(((taxableValue * igstRate) / 100).toFixed(2)) : 0;
                        const itemTotal = Math.max(0, taxableValue + sgstAmount + cgstAmount + igstAmount - discountAmt);

                        itemsValidated.push({
                            ...it,
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
                            purchaseLedgerFound,
                            _matchedItemId: matchedItem?.id,
                        });

                        totalDebit += itemTotal;
                    });

                    totalCredit = totalDebit;
                    if (group.slabImport) {
                        const hasIgst = itemsValidated.some(item => Number(item.igstAmount) > 0);
                        const hasLocalTax = itemsValidated.some(item => Number(item.cgstAmount) > 0 || Number(item.sgstAmount) > 0);
                        if (hasIgst && !hasLocalTax) gstType = "different-state";
                        else if (hasLocalTax) gstType = "same-state";
                        else gstType = "same-state";
                    }
                } else {
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

                const isBalanceMatched = Math.abs(totalDebit - totalCredit) < 0.05 && totalDebit > 0;
                if (!isBalanceMatched && group.mode === "Accounting Invoice") {
                    errors.push(`Balance Mismatch: Total Debit (₹${totalDebit}) != Total Credit (₹${totalCredit})`);
                }

                const nonPartyErrors = errors.filter(e => !e.startsWith("Party / Supplier Name"));
                const status = nonPartyErrors.length === 0 ? "pending" : "error";
                const discountTotal = itemsValidated.reduce((sum, item) => sum + Number(item.discount || 0), 0);

                validatedVouchers.push({
                    id: group.id,
                    voucherDate: group.voucherDate,
                    voucherNo: autoVoucherNo,
                    supplierInvoice: group.supplierInvoice,
                    invoiceDate: group.invoiceDate,
                    partyName: matchedPartyLedger?.name || partyName || group.partyName,
                    mode: group.mode,
                    godownTracking: group.godownTracking,
                    gstin: partyGstin,
                    pos: partyStateRes.name || matchedPartyLedger?.state || "",
                    totalDebit,
                    totalCredit,
                    invoiceValue: Math.max(totalDebit, totalCredit),
                    discountTotal,
                    purchaseLedger: itemsValidated[0]?.purchaseLedger || "",
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
                    slabImport: !!group.slabImport,
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
                html: `<p><b>${invalidVouchers.length}</b> voucher(s) failed master or balance validations and cannot be posted.</p>`,
            });
            return;
        }

        setIsProcessing(true);
        const updatedVouchers = [...groupedVouchers];

        try {
            // STEP 1: Auto-create missing traders in Sundry Creditors in bulk
            const missingPartiesMap = new Map<string, any>();
            updatedVouchers.forEach(v => {
                const pName = (v.partyName || "").trim();
                if (pName && !v.partyMatch && !missingPartiesMap.has(pName.toLowerCase())) {
                    missingPartiesMap.set(pName.toLowerCase(), {
                        name: pName,
                        groupId: sundryGroupId || -109,
                        gstNumber: (v.gstin || "").trim(),
                        state: (v.pos || v.partyStateName || "").trim(),
                        openingBalance: 0,
                        balanceType: "credit"
                    });
                }
            });

            const missingParties = Array.from(missingPartiesMap.values());

            if (missingParties.length > 0) {
                const token = localStorage.getItem("token");
                await axios.post(`${import.meta.env.VITE_API_URL}/api/ledger/bulk`, {
                    ledgers: missingParties,
                    companyId,
                    ownerType,
                    ownerId
                }, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });

                // Fetch fresh ledgers
                const ledgerRes = await axios.get(`${import.meta.env.VITE_API_URL}/api/ledger`, {
                    params: { company_id: companyId, owner_type: ownerType, owner_id: ownerId }
                });
                const freshLedgers = Array.isArray(ledgerRes.data) ? ledgerRes.data : [];
                setLedgers(freshLedgers);

                // Update updatedVouchers partyMatch and accountingEntries
                updatedVouchers.forEach(v => {
                    const matched = freshLedgers.find((l: any) => 
                        (l.name || "").toLowerCase().trim() === (v.partyName || "").toLowerCase().trim()
                    );
                    if (matched) {
                        v.partyMatch = true;
                        v._matchedLedgerId = matched.id;
                        if (v.mode === "Accounting Invoice") {
                            v.accountingEntries.forEach((ae: any) => {
                                if (ae._isParty || !ae.ledgerName || String(ae.ledgerName).toLowerCase() === "undefined") {
                                    ae.ledgerName = matched.name;
                                }
                            });
                        }
                    }
                });
                setGroupedVouchers([...updatedVouchers]);
            }

            const pendingVouchers = updatedVouchers.filter(v => v.status === "pending");
            setSaveProgress({ done: 0, total: pendingVouchers.length });
            let done = 0;

            for (let i = 0; i < updatedVouchers.length; i++) {
                if (updatedVouchers[i].status !== "pending") continue;

                updatedVouchers[i].status = "importing";
                setGroupedVouchers([...updatedVouchers]);

                try {
                    const v = updatedVouchers[i];
                    const payloadVoucher = {
                        "Trade/Legal name of the Supplier": v.partyName,
                        "Invoice number": v.supplierInvoice,
                        "Voucher number": v.voucherNo,
                        "Invoice Date": v.invoiceDate || v.voucherDate,
                        "GSTIN of supplier": v.gstin,
                        "Place of supply": v.pos,
                        "Discount": v.discountTotal || 0,
                        "Purchase Ledger": v.purchaseLedger,
                        importMode: v.mode.toLowerCase().includes("accounting") ? "accounting" : "item",
                        items: v.items.map(it => ({
                            "Item Name": it.itemName,
                            "HSN Code": it.hsnCode,
                            "Batch No": it.godown,
                            "Quantity": it.quantity,
                            "Item Rate (₹)": it.rate,
                            "Discount": it.discount || 0,
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
                            "Rate (%)": ae.gstRate || 0,
                            "Integrated Tax (₹)": ae.igst || 0,
                            "Central Tax (₹)": ae.cgst || 0,
                            "State/UT tax (₹)": ae.sgst || 0
                        }))
                    };

                    const response = await axios.post<{ success: boolean; errors?: string[] }>(`${import.meta.env.VITE_API_URL}/api/purchase_summary_import`, {
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
                const autoCreatedMsg = missingParties.length > 0 
                    ? `<br/><span class="text-xs text-gray-500">(${missingParties.length} missing trader(s) auto-created in Sundry Creditors)</span>` 
                    : "";
                Swal.fire({ 
                    icon: "success", 
                    title: "All Vouchers Imported!", 
                    html: `<b>${savedCount}</b> vouchers saved successfully.${autoCreatedMsg}` 
                });
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
            worksheet[ref] = typeof value === "number"
                ? { t: "n", v: value }
                : { t: "s", v: value };
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

        if (mode === 'Item Invoice' || mode === 'Accounting Invoice') {
            const headers = mode === 'Item Invoice' ? ITEM_TEMPLATE_HEADERS : ACCOUNTING_HEADERS;
            const colLetter = (name: string) => XLSX.utils.encode_col(headers.indexOf(name));
            const blankOr = (name: string, rowNumber: number, expression: string) =>
                `IF(${colLetter(name)}${rowNumber}="","",${expression})`;
            const formulaByHeader: Record<string, (rowNumber: number) => string> = {
                "Invoice Value (₹)": (rowNumber) => {
                    const total = `SUM(${colLetter("Exempt purchase")}${rowNumber}:${colLetter("sgst14%")}${rowNumber})`;
                    return `IF(${total}=0,"",${total}-N(${colLetter("Discount")}${rowNumber}))`;
                },
                "Igst3%": (rowNumber) => blankOr("3% inter state purchase", rowNumber, `${colLetter("3% inter state purchase")}${rowNumber}*3%`),
                "cgst1.5%": (rowNumber) => blankOr("3% intra state purchase", rowNumber, `${colLetter("3% intra state purchase")}${rowNumber}*1.5%`),
                "sgst1.5%": (rowNumber) => blankOr("3% intra state purchase", rowNumber, `${colLetter("3% intra state purchase")}${rowNumber}*1.5%`),
                "Igst5%": (rowNumber) => blankOr("5% inter state purchase", rowNumber, `${colLetter("5% inter state purchase")}${rowNumber}*5%`),
                "cgst2.5%": (rowNumber) => blankOr("5% intra state purchase", rowNumber, `${colLetter("5% intra state purchase")}${rowNumber}*2.5%`),
                "sgst2.5%": (rowNumber) => blankOr("5% intra state purchase", rowNumber, `${colLetter("5% intra state purchase")}${rowNumber}*2.5%`),
                "Igst18%": (rowNumber) => blankOr("18% inter state purchase", rowNumber, `${colLetter("18% inter state purchase")}${rowNumber}*18%`),
                "cgst9%": (rowNumber) => blankOr("18% intra state purchase", rowNumber, `${colLetter("18% intra state purchase")}${rowNumber}*9%`),
                "sgst9%": (rowNumber) => blankOr("18% intra state purchase", rowNumber, `${colLetter("18% intra state purchase")}${rowNumber}*9%`),
                "Igst28%": (rowNumber) => blankOr("28% inter state purchase", rowNumber, `${colLetter("28% inter state purchase")}${rowNumber}*28%`),
                "cgst14%": (rowNumber) => blankOr("28% intra state purchase", rowNumber, `${colLetter("28% intra state purchase")}${rowNumber}*14%`),
                "sgst14%": (rowNumber) => blankOr("28% intra state purchase", rowNumber, `${colLetter("28% intra state purchase")}${rowNumber}*14%`),
            };
            const example: Record<string, string | number> = {
                "GSTIN of supplier": "20AABCM4621M1ZR",
                "SupplierName": "MONGIA STEEL LIMITED",
                "Invoice number": "EXAMPLE-001",
                "Invoice Date": "2026-11-19",
                "Place of supply": "Jharkhand",
                "Supply Attract Reverse Charge": "N",
                ...(mode === "Item Invoice" ? { "Item Name": "MS Plate", "Quantity": 1, "Rate": 10000 } : {}),
                "18% intra state purchase": 10000,
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
            worksheet["!cols"] = headers.map((header) => ({
                wch: header ? Math.min(28, Math.max(14, header.length + 2)) : 4,
            }));
            worksheet["!rows"] = [{ hpt: 26 }];

            headers.forEach((header, colIndex) => {
                styleCell(ensureCell(worksheet, 0, colIndex, header), headerStyle);
            });

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
            const sheetName = mode === "Item Invoice" ? "Item_Invoice_Template" : "Accounting_Invoice_Template";
            const fileName = mode === "Item Invoice" ? "Purchase_Item_Invoice_Template.xlsx" : "Purchase_Accounting_Invoice_Template.xlsx";
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
            XLSX.writeFile(workbook, fileName);
        }
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
                                Purchase Voucher Import
                            </h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Master resolution for Party, Items, HSN/SAC, Units & Tax Ledgers with % calculations.
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
                                Upload Purchase Excel Sheet ({selectedMode})
                            </h3>
                            <p className="text-xs text-gray-500 mb-6 max-w-2xl mx-auto">
                                {selectedMode === "Accounting Invoice"
                                    ? "Accounting template: blue header, one invoice on one row. No item, quantity or rate. Enter the taxable amount in the matching purchase column."
                                    : "Item template: blue header, one invoice on one row. Enter the taxable amount in the matching purchase column. Tax and invoice value calculate in Excel."}
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
                                    Green badges indicate master matches. Missing traders are automatically created in Sundry Creditors when saving.
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

                        {/* VOUCHER CARD VIEW WITH EXPLICIT MASTER VALIDATION BADGES */}
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
                                                ) : !voucher.partyMatch ? (
                                                    <span className="inline-flex items-center text-amber-700 text-xs font-bold bg-amber-100 px-3 py-1 rounded-full">
                                                        <CheckCircle size={14} className="mr-1" /> Ready for Import (Party will auto-create)
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center text-green-700 text-xs font-bold bg-green-100 px-3 py-1 rounded-full">
                                                        <CheckCircle size={14} className="mr-1" /> All Validations Passed — Ready for Import
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* SECTION 1: HEADER BLOCK WITH DYNAMICALLY EXTRACTED SUPPLIER & STATE DETECTION */}
                                        <div className="p-4 mb-6 rounded-xl border border-gray-200 bg-gray-50/70 space-y-4">
                                            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800 border-b border-gray-200 pb-1 flex flex-wrap items-center justify-between gap-2">
                                                <span>Voucher Header (Auto Sequence Generated)</span>
                                                <div className="flex items-center gap-2">
                                                    {/* State Detection Badge */}
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
                                                            ✗ Balance Mismatch (Debit: ₹{voucher.totalDebit} | Credit: ₹{voucher.totalCredit})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-gray-500">Voucher Date</label>
                                                    <div className="p-2 bg-white rounded border border-gray-300 text-xs font-semibold">{voucher.voucherDate}</div>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-gray-500">
                                                        Voucher No. <span className="text-blue-600 font-normal">(Auto-Generated)</span>
                                                    </label>
                                                    <div className="p-2 bg-blue-50/80 rounded border border-blue-300 text-xs font-mono font-bold text-blue-900">
                                                        {voucher.voucherNo}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-gray-500">Supplier Invoice #</label>
                                                    <div className="p-2 bg-white rounded border border-gray-300 text-xs font-medium">{voucher.supplierInvoice}</div>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-gray-500">Invoice Date</label>
                                                    <div className="p-2 bg-white rounded border border-gray-300 text-xs font-medium">{voucher.invoiceDate}</div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                                <div className="md:col-span-2">
                                                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-gray-500">
                                                        Party / Supplier Name & State
                                                    </label>
                                                    <div className="p-2 bg-white rounded border border-gray-300 text-xs font-bold flex items-center justify-between">
                                                        <span>
                                                            {voucher.partyName}
                                                            <span className="text-[10px] font-normal text-gray-500 ml-2">
                                                                ({voucher.partyStateName} - {voucher.partyStateCode || 'No Code'})
                                                            </span>
                                                        </span>
                                                        {voucher.partyMatch && (voucher.slabImport || voucher.partyStateCode) ? (
                                                            <span className="text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded font-bold">✓ Party & State Valid</span>
                                                        ) : !voucher.partyMatch ? (
                                                            <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-bold">⚡ Will Auto-Create in Sundry Creditors</span>
                                                        ) : (
                                                            <span className="text-[10px] text-red-700 bg-red-50 px-2 py-0.5 rounded font-bold">✗ State Missing</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-gray-500">Company State</label>
                                                    <div className="p-2 bg-white rounded border border-gray-300 text-xs font-medium flex items-center justify-between">
                                                        <span>{voucher.companyStateName} ({voucher.companyStateCode || 'N/A'})</span>
                                                        {voucher.companyStateCode ? (
                                                            <span className="text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-bold">✓ Configured</span>
                                                        ) : (
                                                            <span className="text-[10px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-bold">✗ Missing</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-gray-500">Transaction Mode</label>
                                                    <div className="p-2 bg-white rounded border border-gray-300 text-xs font-medium">{voucher.mode}</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* SECTION 2: REPEATING ITEM DETAILS WITH Explicit 7-MASTER BADGES */}
                                        <div className="space-y-2">
                                            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                                                {voucher.mode.toLowerCase().includes("item") ? "Repeating Item Entries" : "Repeating Accounting Entries"}
                                            </div>
                                            {voucher.mode.toLowerCase().includes("item") ? (
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left text-xs border-collapse">
                                                        <thead>
                                                            <tr className="bg-gray-100 border-b border-gray-300 text-gray-700 font-bold">
                                                                <th className="px-3 py-2 text-center">Sr No</th>
                                                                <th className="px-3 py-2">Item</th>
                                                                <th className="px-3 py-2">HSN/SAC</th>
                                                                <th className="px-3 py-2 text-right">Qty</th>
                                                                <th className="px-3 py-2">Unit</th>
                                                                <th className="px-3 py-2 text-right">Rate</th>
                                                                <th className="px-3 py-2 text-right">GST (%)</th>
                                                                <th className="px-3 py-2">Tax Split & Ledger Mapping</th>
                                                                <th className="px-3 py-2 text-right">Taxable</th>
                                                                <th className="px-3 py-2 text-right">Item Total</th>
                                                                <th className="px-3 py-2">Purchase-Ledger</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-200">
                                                            {voucher.items.map((item, i) => (
                                                                <tr key={i} className="hover:bg-blue-50/30">
                                                                    <td className="px-3 py-2 text-center text-gray-500">{i + 1}</td>
                                                                    <td className="px-3 py-2">
                                                                        <div className="flex flex-col">
                                                                            <span className="font-bold text-gray-900">{item.itemName}</span>
                                                                            {item.itemFound ? (
                                                                                <span className="text-[9px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-bold w-fit mt-0.5">✓ Found</span>
                                                                            ) : (
                                                                                <span className="text-[9px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-bold w-fit mt-0.5">✗ Not Found</span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-gray-700">{item.hsnCode || "-"}</span>
                                                                            {item.hsnFound ? (
                                                                                <span className="text-[9px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-bold w-fit mt-0.5">✓ Found</span>
                                                                            ) : (
                                                                                <span className="text-[9px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-bold w-fit mt-0.5">✗ Not Found</span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-3 py-2 text-right font-medium">{item.quantity}</td>
                                                                    <td className="px-3 py-2">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-gray-700">{item.unit || "PCS"}</span>
                                                                            {item.unitFound ? (
                                                                                <span className="text-[9px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-bold w-fit mt-0.5">✓ Found</span>
                                                                            ) : (
                                                                                <span className="text-[9px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-bold w-fit mt-0.5">✗ Not Found</span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-3 py-2 text-right">₹{item.rate.toLocaleString()}</td>
                                                                    <td className="px-3 py-2 text-right font-bold text-blue-800">{item.gstRate}%</td>
                                                                    {/* Tax Split & Ledger Mapping with Green Tick */}
                                                                    <td className="px-3 py-2 min-w-[200px]">
                                                                        {(item.taxKind === "intra" || (!item.slabLine && voucher.gstType === "same-state")) ? (
                                                                            <div className="flex flex-col gap-1 text-[11px]">
                                                                                <div className="flex items-center justify-between gap-2">
                                                                                    <span className="font-semibold text-gray-700">CGST {item.cgstRate}% (₹{item.cgstAmount.toLocaleString()})</span>
                                                                                    {item.cgstLedgerFound ? (
                                                                                        <span className="text-[9px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5" title={item.matchedCgstLedgerName}>
                                                                                            <CheckCircle size={10} /> Mapped ({item.matchedCgstLedgerName || 'CGST'})
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-[9px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-bold" title="CGST Ledger Not Found">
                                                                                            ✗ Ledger Missing
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <div className="flex items-center justify-between gap-2">
                                                                                    <span className="font-semibold text-gray-700">SGST {item.sgstRate}% (₹{item.sgstAmount.toLocaleString()})</span>
                                                                                    {item.sgstLedgerFound ? (
                                                                                        <span className="text-[9px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5" title={item.matchedSgstLedgerName}>
                                                                                            <CheckCircle size={10} /> Mapped ({item.matchedSgstLedgerName || 'SGST'})
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-[9px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-bold" title="SGST Ledger Not Found">
                                                                                            ✗ Ledger Missing
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ) : (item.taxKind === "inter" || (!item.slabLine && voucher.gstType === "different-state")) ? (
                                                                            <div className="flex flex-col gap-1 text-[11px]">
                                                                                <div className="flex items-center justify-between gap-2">
                                                                                    <span className="font-semibold text-gray-700">IGST {item.igstRate}% (₹{item.igstAmount.toLocaleString()})</span>
                                                                                    {item.igstLedgerFound ? (
                                                                                        <span className="text-[9px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5" title={item.matchedIgstLedgerName}>
                                                                                            <CheckCircle size={10} /> Mapped ({item.matchedIgstLedgerName || 'IGST'})
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-[9px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-bold" title="IGST Ledger Not Found">
                                                                                            ✗ Ledger Missing
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded font-bold">
                                                                                {item.taxKind === "exempt" || item.gstRate === 0 ? "Exempt" : "✗ State Detection Failed"}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-right font-bold">₹{item.taxableValue.toLocaleString()}</td>
                                                                    <td className="px-3 py-2 text-right font-bold text-blue-700">₹{item.itemTotal.toLocaleString()}</td>
                                                                    <td className="px-3 py-2">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-gray-800 font-medium">{item.purchaseLedger}</span>
                                                                            {item.purchaseLedgerFound ? (
                                                                                <span className="text-[9px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-bold w-fit mt-0.5">✓ Found</span>
                                                                            ) : (
                                                                                <span className="text-[9px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-bold w-fit mt-0.5">✗ Not Found</span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                        <tfoot className="bg-gray-50 font-bold border-t border-gray-300">
                                                            <tr>
                                                                <td colSpan={8} className="px-3 py-2 text-right">Total Invoice Value:</td>
                                                                <td className="px-3 py-2 text-right text-blue-700 text-sm">₹{voucher.invoiceValue.toLocaleString()}</td>
                                                                <td colSpan={2}></td>
                                                            </tr>
                                                        </tfoot>
                                                    </table>
                                                </div>
                                            ) : (
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left text-xs border-collapse">
                                                        <thead>
                                                            <tr className="bg-gray-100 border-b border-gray-300 text-gray-700 font-bold">
                                                                <th className="px-4 py-2">Ledger</th>
                                                                <th className="px-4 py-2">Validation</th>
                                                                <th className="px-4 py-2 text-right">Amount</th>
                                                                <th className="px-4 py-2 text-center">Type</th>
                                                                <th className="px-4 py-2 text-center">Action</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-200">
                                                            {voucher.accountingEntries.map((entry, i) => (
                                                                <tr key={i} className="hover:bg-blue-50/30">
                                                                    <td className="px-4 py-2 font-bold text-gray-900">{entry.ledgerName}</td>
                                                                    <td className="px-4 py-2">
                                                                        {entry.ledgerFound ? (
                                                                            <span className="text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded font-bold">✓ Found</span>
                                                                        ) : (
                                                                            <span className="text-[10px] text-red-700 bg-red-50 px-2 py-0.5 rounded font-bold">✗ Not Found</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-2 text-right font-bold">₹{entry.amount.toLocaleString()}</td>
                                                                    <td className="px-4 py-2 text-center">
                                                                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                                                                            entry.type.toLowerCase() === "debit"
                                                                                ? "bg-blue-100 text-blue-800"
                                                                                : "bg-green-100 text-green-800"
                                                                        }`}>
                                                                            {entry.type}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-2 text-center text-gray-400">-</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                        <tfoot className="bg-gray-50 font-bold border-t border-gray-300">
                                                            <tr>
                                                                <td className="px-4 py-2 text-right">Total Debit:</td>
                                                                <td className="px-4 py-2 text-right text-blue-700 text-sm font-bold">₹{voucher.totalDebit.toLocaleString()}</td>
                                                                <td className="px-4 py-2 text-right">Total Credit:</td>
                                                                <td className="px-4 py-2 text-right text-green-700 text-sm font-bold">₹{voucher.totalCredit.toLocaleString()}</td>
                                                                <td></td>
                                                            </tr>
                                                        </tfoot>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            /* COLUMNAR VIEW — one row per accounting/item line */
                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3">
                                {groupedVouchers.length > 0 && groupedVouchers.every((v) => String(v.mode).toLowerCase().includes("item")) ? (
                                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                                    <table className="w-full text-left text-xs border-collapse min-w-[1400px]">
                                        <thead className="bg-gray-100 border-b border-gray-300 font-bold uppercase tracking-wider text-gray-600">
                                            <tr>
                                                <th className="px-3 py-2.5 text-center">#</th>
                                                <th className="px-3 py-2.5">Voucher Date</th>
                                                <th className="px-3 py-2.5">Auto Voucher No.</th>
                                                <th className="px-3 py-2.5">Supplier Invoice</th>
                                                <th className="px-3 py-2.5">Invoice Date</th>
                                                <th className="px-3 py-2.5">Party / Supplier Name</th>
                                                <th className="px-3 py-2.5">Transaction Mode</th>
                                                <th className="px-3 py-2.5 text-right">Invoice Value</th>
                                                <th className="px-3 py-2.5">Item</th>
                                                <th className="px-3 py-2.5">HSN/SAC</th>
                                                <th className="px-3 py-2.5 text-right">Qty</th>
                                                <th className="px-3 py-2.5">Unit</th>
                                                <th className="px-3 py-2.5 text-right">Rate</th>
                                                <th className="px-3 py-2.5 text-right">GST (%)</th>
                                                <th className="px-3 py-2.5 text-right">Taxable</th>
                                                <th className="px-3 py-2.5 text-right">Item Total</th>
                                                <th className="px-3 py-2.5">Purchase-Ledger</th>
                                                <th className="px-3 py-2.5 text-center">Validation</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {groupedVouchers.map((v, voucherIndex) => {
                                                const lines = v.items.length > 0 ? v.items : [null];
                                                const span = lines.length;
                                                return lines.map((item, i) => (
                                                    <tr key={`${v.id}-item-${i}`} className="border-b border-gray-200 hover:bg-gray-50 align-top">
                                                        {i === 0 && (
                                                            <>
                                                                <td rowSpan={span} className="px-3 py-2.5 text-center font-bold text-[#312E81] border-r border-gray-100">{voucherIndex + 1}.</td>
                                                                <td rowSpan={span} className="px-3 py-2.5 font-medium border-r border-gray-100">{v.voucherDate}</td>
                                                                <td rowSpan={span} className="px-3 py-2.5 font-mono font-bold text-blue-700 border-r border-gray-100">{v.voucherNo}</td>
                                                                <td rowSpan={span} className="px-3 py-2.5 border-r border-gray-100">{v.supplierInvoice}</td>
                                                                <td rowSpan={span} className="px-3 py-2.5 border-r border-gray-100">{v.invoiceDate}</td>
                                                                <td rowSpan={span} className="px-3 py-2.5 font-bold border-r border-gray-100">
                                                                    {v.partyName} {v.partyMatch ? <span className="text-green-700 text-[10px]"> (✓ Found)</span> : <span className="text-amber-700 text-[10px]"> (⚡ Auto-Create)</span>}
                                                                </td>
                                                                <td rowSpan={span} className="px-3 py-2.5 border-r border-gray-100">{v.mode}</td>
                                                                <td rowSpan={span} className="px-3 py-2.5 text-right font-bold text-blue-700 border-r border-gray-100">₹{v.invoiceValue.toLocaleString()}</td>
                                                            </>
                                                        )}
                                                        <td className="px-3 py-2.5 font-bold text-gray-900">{item?.itemName || "-"}</td>
                                                        <td className="px-3 py-2.5">{item?.hsnCode || "-"}</td>
                                                        <td className="px-3 py-2.5 text-right">{item ? item.quantity : "-"}</td>
                                                        <td className="px-3 py-2.5">{item?.unit || "-"}</td>
                                                        <td className="px-3 py-2.5 text-right">{item ? `₹${item.rate.toLocaleString()}` : "-"}</td>
                                                        <td className="px-3 py-2.5 text-right">{item ? `${item.gstRate}%` : "-"}</td>
                                                        <td className="px-3 py-2.5 text-right font-bold">{item ? `₹${item.taxableValue.toLocaleString()}` : "-"}</td>
                                                        <td className="px-3 py-2.5 text-right font-bold text-blue-700">{item ? `₹${item.itemTotal.toLocaleString()}` : "-"}</td>
                                                        <td className="px-3 py-2.5">
                                                            {item ? (
                                                                <div className="flex flex-col">
                                                                    <span>{item.purchaseLedger}</span>
                                                                    {item.purchaseLedgerFound ? (
                                                                        <span className="text-[9px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-bold w-fit mt-0.5">✓ Found</span>
                                                                    ) : (
                                                                        <span className="text-[9px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-bold w-fit mt-0.5">✗ Not Found</span>
                                                                    )}
                                                                </div>
                                                            ) : "-"}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center">
                                                            {item ? (
                                                                item.itemFound && item.hsnFound && item.unitFound ? (
                                                                    <span className="text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded font-bold">✓ Found</span>
                                                                ) : (
                                                                    <span className="text-[10px] text-red-700 bg-red-50 px-2 py-0.5 rounded font-bold">✗ Not Found</span>
                                                                )
                                                            ) : (
                                                                <span className="text-red-600 font-bold">{v.errorMessage || "No lines"}</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ));
                                            })}
                                        </tbody>
                                    </table>
                                    </div>
                                ) : (
                                    (() => {
                                        const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
                                        const entryFor = (voucher: ManualGroupedVoucher, header: string) =>
                                            voucher.accountingEntries.find((entry) => norm(entry.sheetColumn || "") === norm(header));
                                        const slabHeaders = SLAB_AMOUNT_HEADERS.filter((header) =>
                                            groupedVouchers.some((voucher) => entryFor(voucher, header))
                                        );
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
                                                            <td className={`${idCell} font-bold ${voucher.partyMatch ? "text-green-800" : "text-amber-700"}`}>
                                                                {voucher.partyName} {voucher.partyMatch ? "✓" : "⚡"}
                                                            </td>
                                                            <td className={idCell}>{voucher.supplierInvoice}</td>
                                                            <td className={idCell}>{voucher.invoiceDate}</td>
                                                            <td className={`${idCell} font-bold`}>₹{voucher.invoiceValue.toLocaleString()}</td>
                                                            <td className={idCell}>{voucher.pos || ""}</td>
                                                            {slabHeaders.map((header) => {
                                                                const entry = entryFor(voucher, header);
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
                                    })()
                                )}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "templates" && (
                    <div className="space-y-8">
                        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                                <div>
                                    <h4 className="text-lg font-bold text-gray-900">Accounting Invoice</h4>
                                    <p className="text-xs text-gray-500">Blue header. One invoice on one row. Same purchase columns as the item sheet, without Item Name, Quantity and Rate.</p>
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
                                            {ACCOUNTING_HEADERS.filter(Boolean).map((header) => (
                                                <th key={`acc-h-${header}`} className="px-2 py-2 border border-[#3730A3] font-bold text-center min-w-[92px]">
                                                    {header}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            {ACCOUNTING_HEADERS.filter(Boolean).map((header) => {
                                                const sampleValues: Record<string, string> = {
                                                    "GSTIN of supplier": "20AABCM4621M1ZR",
                                                    "SupplierName": "MONGIA STEEL LIMITED",
                                                    "Invoice number": "EXAMPLE-001",
                                                    "Invoice Date": "2026-11-19",
                                                    "Place of supply": "Jharkhand",
                                                    "Supply Attract Reverse Charge": "N",
                                                    "18% intra state purchase": "10000",
                                                    "cgst9%": "900",
                                                    "sgst9%": "900",
                                                    "Invoice Value (₹)": "11800",
                                                };
                                                return (
                                                    <td key={`acc-sample-${header}`} className="px-2 py-1.5 border border-gray-200 text-center bg-white">
                                                        {sampleValues[header] || ""}
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
                                    <p className="text-xs text-gray-500">Blue header. One invoice on one row. Enter the taxable amount in the matching purchase column.</p>
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
                                            {ITEM_TEMPLATE_HEADERS.filter(Boolean).map((header) => (
                                                <th key={`item-h-${header}`} className="px-2 py-2 border border-[#3730A3] font-bold text-center min-w-[92px]">
                                                    {header}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            {ITEM_TEMPLATE_HEADERS.filter(Boolean).map((header) => {
                                                const sampleValues: Record<string, string> = {
                                                    "GSTIN of supplier": "20AABCM4621M1ZR",
                                                    "SupplierName": "MONGIA STEEL LIMITED",
                                                    "Invoice number": "EXAMPLE-001",
                                                    "Invoice Date": "2026-11-19",
                                                    "Place of supply": "Jharkhand",
                                                    "Supply Attract Reverse Charge": "N",
                                                    "Item Name": "MS Plate",
                                                    "Quantity": "1",
                                                    "Rate": "10000",
                                                    "18% intra state purchase": "10000",
                                                    "cgst9%": "900",
                                                    "sgst9%": "900",
                                                    "Invoice Value (₹)": "11800",
                                                };
                                                return (
                                                    <td key={`sample-${header}`} className="px-2 py-1.5 border border-gray-200 text-center bg-white">
                                                        {sampleValues[header] || ""}
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

export default PurchaseImport;
