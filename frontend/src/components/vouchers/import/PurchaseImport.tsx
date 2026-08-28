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
    Layers,
    Grid,
    List,
    X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "../../../context/CompanyContext";
import * as XLSX from "xlsx-js-style";
import axios from "axios";
import Swal from "sweetalert2";

// Item entry matching Manual Purchase Voucher structure
interface ManualItemRow {
    srNo: number | string;
    itemName: string;
    hsnCode: string;
    quantity: number;
    unit: string;
    rate: number;
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
    _matchedItemId?: string | number;
    _matchedHsnId?: string | number;
    itemFound: boolean;
    hsnFound: boolean;
    unitFound: boolean;
    cgstLedgerFound: boolean;
    sgstLedgerFound: boolean;
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
    purchaseLedger: string;
    status: "pending" | "importing" | "imported" | "error";
    errorMessage?: string;
    partyMatch: boolean; // Party Found / Not Found
    isBalanceMatched: boolean; // Debit === Credit
    _matchedLedgerId?: string | number;
    _matchedPurchaseLedgerId?: string | number;
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

    const companyId = localStorage.getItem("company_id") || "";
    const ownerType = localStorage.getItem("supplier") || "";
    const ownerId = localStorage.getItem(ownerType === "employee" ? "employee_id" : "user_id") || "";

    const fetchLedgersAndItems = async () => {
        if (!companyId || !ownerId || !ownerType) return;
        try {
            const [ledgerRes, itemRes, unitRes] = await Promise.all([
                axios.get(`${import.meta.env.VITE_API_URL}/api/ledger`, {
                    params: { company_id: companyId, owner_type: ownerType, owner_id: ownerId }
                }),
                axios.get(`${import.meta.env.VITE_API_URL}/api/stock-items`, {
                    params: { company_id: companyId, owner_type: ownerType, owner_id: ownerId }
                }),
                axios.get(`${import.meta.env.VITE_API_URL}/api/stock-units`, {
                    params: { company_id: companyId, owner_type: ownerType, owner_id: ownerId }
                }).catch(() => ({ data: [] }))
            ]);
            setLedgers(Array.isArray(ledgerRes.data) ? ledgerRes.data : []);
            const fetchedItems = (itemRes.data as any)?.data || itemRes.data;
            setItems(Array.isArray(fetchedItems) ? fetchedItems : []);
            const fetchedUnits = (unitRes.data as any)?.data || unitRes.data;
            setStockUnits(Array.isArray(fetchedUnits) ? fetchedUnits : []);
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

    // Helper: Tax Ledger Resolution (matches e.g. "18% CGST", "9% CGST", "CGST 18%", "CGST")
    const resolveTaxLedger = (taxType: 'CGST' | 'SGST' | 'IGST', rateVal: number, ledgersList: any[]) => {
        if (!rateVal || rateVal <= 0) return true;
        const targetType = taxType.toLowerCase();
        const rateStr = String(rateVal);

        const matched = ledgersList.find(l => {
            const lName = (l.name || "").toLowerCase().replace(/\s+/g, " ").trim();
            const isCorrectType = lName.includes(targetType);
            if (!isCorrectType) return false;

            return lName.includes(`${rateStr}%`) ||
                lName.includes(` ${rateStr} `) ||
                lName.endsWith(` ${rateStr}`) ||
                lName.startsWith(`${rateStr} `) ||
                lName.includes(`${rateStr}percent`);
        }) || ledgersList.find(l => {
            const lName = (l.name || "").toLowerCase().replace(/\s+/g, " ").trim();
            return lName === targetType || lName === `input ${targetType}` || lName === `output ${targetType}` || lName.includes(targetType);
        });

        return !!matched;
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

            if (isBlockLayout) {
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
                                let cgstRate = parseTaxRate(row[12]);
                                let sgstRate = parseTaxRate(row[13]);
                                let igstRate = parseTaxRate(row[14]);
                                const discount = parseTaxRate(row[15] || 0);

                                if (cgstRate > 0 && cgstRate === sgstRate && [5, 12, 18, 28].includes(cgstRate)) {
                                    cgstRate = cgstRate / 2;
                                    sgstRate = sgstRate / 2;
                                } else if (cgstRate + sgstRate > 28 && cgstRate === sgstRate) {
                                    cgstRate = cgstRate / 2;
                                    sgstRate = sgstRate / 2;
                                }

                                if (igstRate > 0) {
                                    cgstRate = 0;
                                    sgstRate = 0;
                                }

                                currentGroup.items.push({
                                    srNo: currentGroup.items.length + 1,
                                    itemName,
                                    hsnCode: String(row[8] || row[2] || "").trim(),
                                    quantity: qty,
                                    unit: String(row[10] || row[4] || "PCS").trim(),
                                    rate,
                                    discount,
                                    sgstRate,
                                    cgstRate,
                                    igstRate,
                                    taxableValue: taxableVal,
                                    godown: String(row[17] || row[16] || "Main Location").trim(),
                                    purchaseLedger: String(row[18] || row[17] || "18% Purchase Account").trim(),
                                });
                            }
                        } else {
                            const ledgerName = String(row[0] || row[1] || "").trim();
                            const amount = Number(row[1] || row[2] || 0);
                            const typeStr = String(row[2] || row[3] || "Debit").trim();
                            const type: "Credit" | "Debit" = typeStr.toLowerCase().startsWith("c") ? "Credit" : "Debit";

                            if (ledgerName && ledgerName !== "Ledger" && !ledgerName.toLowerCase().includes("amount")) {
                                currentGroup.accountingEntries.push({
                                    srNo: currentGroup.accountingEntries.length + 1,
                                    ledgerName,
                                    amount,
                                    type,
                                });
                            }
                        }
                    }
                }
            } else {
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
                    let mode = selectedMode;
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

                    if (selectedMode === "Item Invoice" || mode === "Item Invoice") {
                        const itemName = String(row["Item"] || row["Item Name"] || "").trim();
                        const qty = Number(row["Quantity"] || row["Qty"] || 0);
                        const rate = Number(row["Rate"] || row["Item Rate (₹)"] || 0);
                        const taxableVal = Number(row["Taxable"] || row["Taxable Value (₹)"] || (qty * rate));
                        const discount = parseTaxRate(row["Discount"] || row["Discount (₹)"] || row["Discount (%)"] || 0);
                        if (itemName || taxableVal > 0) {
                            let cgstRate = parseTaxRate(row["CGST (%)"] || row["CGST"] || row["Central Tax (₹)"]);
                            let sgstRate = parseTaxRate(row["SGST (%)"] || row["SGST"] || row["State/UT tax (₹)"]);
                            let igstRate = parseTaxRate(row["IGST (%)"] || row["IGST"] || row["Integrated Tax (₹)"]);

                            if (cgstRate > 0 && cgstRate === sgstRate && [5, 12, 18, 28].includes(cgstRate)) {
                                cgstRate = cgstRate / 2;
                                sgstRate = sgstRate / 2;
                            } else if (cgstRate + sgstRate > 28 && cgstRate === sgstRate) {
                                cgstRate = cgstRate / 2;
                                sgstRate = sgstRate / 2;
                            }

                            if (igstRate > 0) {
                                cgstRate = 0;
                                sgstRate = 0;
                            }

                            rawGroups[groupKey].items.push({
                                srNo: rawGroups[groupKey].items.length + 1,
                                itemName: itemName || "Item",
                                hsnCode: String(row["HSN/SAC"] || "").trim(),
                                quantity: qty,
                                unit: String(row["Unit"] || "PCS").trim(),
                                rate,
                                discount,
                                sgstRate,
                                cgstRate,
                                igstRate,
                                taxableValue: taxableVal,
                                godown: String(row["Godown"] || "Main Location").trim(),
                                purchaseLedger: String(row["Purchase-Ledger"] || "18% Purchase Account").trim(),
                            });
                        }
                    } else {
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
                });
            }

            // Fetch starting Voucher Number from manual Purchase Voucher API logic
            const startingVoucherNum = await fetchStartingVoucherNumber(firstVoucherDate);

            // Validate Each Voucher & Assign Auto Voucher Number
            const groupList = Object.values(rawGroups);
            const validatedVouchers: ManualGroupedVoucher[] = [];

            groupList.forEach((group, idx) => {
                const autoVoucherNo = getNextVoucherNumberInSequence(startingVoucherNum, idx);
                let errors: string[] = [];

                // 1. Party / Supplier Name Resolution & Validation against Ledgers Master
                const partyName = group.partyName;
                const cleanPartyName = partyName.toLowerCase().replace(/\s+/g, " ").trim();

                const matchedPartyLedger = partyName
                    ? ledgers.find(l => {
                        const lName = (l.name || "").toLowerCase().replace(/\s+/g, " ").trim();
                        return lName === cleanPartyName;
                    }) || ledgers.find(l => {
                        const lGst = (l.gst_number || l.gstNumber || "").toUpperCase().replace(/\s+/g, "").trim();
                        return lGst && lGst === partyName.toUpperCase().replace(/\s+/g, "").trim();
                    })
                    : null;

                const partyMatch = !!matchedPartyLedger;

                if (!partyMatch) {
                    errors.push(`Party / Supplier Name '${partyName}' Not Found in Ledger Master`);
                }

                // 2. Validate Items, HSN/SAC, Unit, Tax Rates & Purchase-Ledger (Item Invoice Mode)
                let itemsValidated: ManualItemRow[] = [];
                let totalDebit = 0;
                let totalCredit = 0;

                if (group.mode === "Item Invoice") {
                    group.items.forEach((it: any) => {
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

                        // CGST, SGST & IGST Tax Ledgers Matching
                        const cgstLedgerFound = resolveTaxLedger('CGST', it.cgstRate, ledgers);
                        const sgstLedgerFound = resolveTaxLedger('SGST', it.sgstRate, ledgers);
                        const igstLedgerFound = resolveTaxLedger('IGST', it.igstRate, ledgers);

                        if (!itemFound) errors.push(`Stock Item '${it.itemName}' Not Found in Stock Item Master`);
                        else {
                            if (!hsnFound) errors.push(`HSN/SAC '${it.hsnCode}' Mismatch for Item '${it.itemName}'`);
                            if (!unitFound) errors.push(`Unit '${it.unit}' Mismatch for Item '${it.itemName}'`);
                        }
                        if (!purchaseLedgerFound) errors.push(`Purchase-Ledger '${it.purchaseLedger}' Not Found in Ledger Master`);
                        if (!cgstLedgerFound) errors.push(`${it.cgstRate}% CGST Tax Ledger Not Found in Ledger Master`);
                        if (!sgstLedgerFound) errors.push(`${it.sgstRate}% SGST Tax Ledger Not Found in Ledger Master`);
                        if (!igstLedgerFound) errors.push(`${it.igstRate}% IGST Tax Ledger Not Found in Ledger Master`);

                        // Validate mutual exclusion between IGST and CGST/SGST
                        if (it.igstRate > 0 && (it.cgstRate > 0 || it.sgstRate > 0)) {
                            errors.push(`Cannot specify both IGST and CGST/SGST on Item '${it.itemName}' (Sr No ${it.srNo}). Please use either CGST+SGST or IGST.`);
                        }

                        // Calculate Exact Tax Amounts from Percentage Rates
                        const isInter = it.igstRate > 0;
                        const taxableValue = Number((it.quantity * it.rate).toFixed(2));
                        const discountAmt = Number(it.discount || 0);
                        const sgstAmount = !isInter ? Number(((taxableValue * (it.sgstRate || 0)) / 100).toFixed(2)) : 0;
                        const cgstAmount = !isInter ? Number(((taxableValue * (it.cgstRate || 0)) / 100).toFixed(2)) : 0;
                        const igstAmount = isInter ? Number(((taxableValue * (it.igstRate || 0)) / 100).toFixed(2)) : 0;
                        const itemTotal = Math.max(0, taxableValue + sgstAmount + cgstAmount + igstAmount - discountAmt);

                        itemsValidated.push({
                            ...it,
                            taxableValue,
                            discount: discountAmt,
                            sgstAmount,
                            cgstAmount,
                            igstAmount,
                            itemTotal,
                            gstRate: it.cgstRate + it.sgstRate + it.igstRate,
                            itemFound,
                            hsnFound,
                            unitFound,
                            cgstLedgerFound,
                            sgstLedgerFound,
                            igstLedgerFound,
                            purchaseLedgerFound,
                            _matchedItemId: matchedItem?.id,
                        });

                        totalDebit += itemTotal;
                    });

                    // In Item Invoice mode, Party is Credited for total invoice value
                    totalCredit = totalDebit;
                } else {
                    // Accounting Invoice Mode Validation
                    let accEntriesValidated: ManualAccountingRow[] = [];
                    group.accountingEntries.forEach((ae: any) => {
                        const cleanLName = (ae.ledgerName || "").toLowerCase().replace(/\s+/g, " ").trim();
                        const matchedLedger = ledgers.find(l => (l.name || "").toLowerCase().replace(/\s+/g, " ").trim() === cleanLName);
                        const ledgerFound = !!matchedLedger;
                        if (!ledgerFound) errors.push(`Ledger '${ae.ledgerName}' Not Found in Ledger Master`);

                        accEntriesValidated.push({
                            ...ae,
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

                // 3. Debit = Credit Balance Validation
                const isBalanceMatched = Math.abs(totalDebit - totalCredit) < 0.05 && totalDebit > 0;
                if (!isBalanceMatched && group.mode === "Accounting Invoice") {
                    errors.push(`Balance Mismatch: Total Debit (₹${totalDebit}) != Total Credit (₹${totalCredit})`);
                }

                const status = errors.length === 0 ? "pending" : "error";
                const discountTotal = itemsValidated.reduce((sum, item) => sum + Number(item.discount || 0), 0);

                validatedVouchers.push({
                    id: group.id,
                    voucherDate: group.voucherDate,
                    voucherNo: autoVoucherNo, // Sequential Voucher No from API
                    supplierInvoice: group.supplierInvoice,
                    invoiceDate: group.invoiceDate,
                    partyName: matchedPartyLedger?.name || group.partyName,
                    mode: group.mode,
                    godownTracking: group.godownTracking,
                    gstin: matchedPartyLedger?.gst_number || matchedPartyLedger?.gstNumber || "",
                    pos: matchedPartyLedger?.state || "",
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
                html: `<p><b>${invalidVouchers.length}</b> voucher(s) failed master or balance validations and cannot be posted.</p>`,
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

    // Download Excel Templates in Single Horizontal Header Row Format
    const downloadTemplate = (mode: 'Item Invoice' | 'Accounting Invoice') => {
        if (mode === 'Item Invoice') {
            const sheetData = [
                // SINGLE HORIZONTAL HEADER ROW
                [
                    "Voucher Date", "Supplier Invoice", "Invoice Date", "Party / Supplier Name",
                    "Transaction Mode", "Godown Tracking", "Sr No", "Item", "HSN/SAC",
                    "Quantity", "Unit", "Rate", "CGST (%)", "SGST (%)", "IGST (%)", "Discount", "Taxable", "Godown", "Purchase-Ledger"
                ],
                // SAMPLE DATA ROWS
                ["2026-02-16", "MSL/25-26/14420", "2026-02-16", "MONGIA STEEL LIMITED", "Item Invoice", "Enabled (Yes)", 1, "Biscute", "5555", 100, "PCS", 4000, 9, 9, 0, 100, 400000, "Main Location", "18% intra state purchase"],
                ["", "", "", "", "", "", 2, "Steel Bar", "7214", 50, "KG", 1200, 9, 9, 0, 0, 60000, "Main Location", "18% intra state purchase"],
                ["2026-02-20", "MSL/25-26/14425", "2026-02-20", "MONGIA STEEL LIMITED", "Item Invoice", "Enabled (Yes)", 1, "Cement", "2523", 200, "BAG", 350, 0, 0, 18, 50, 70000, "Main Location", "18% Inter State Purchase"]
            ];

            const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
            worksheet['!cols'] = [
                { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 28 },
                { wch: 18 }, { wch: 18 }, { wch: 8 }, { wch: 20 },
                { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
                { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
                { wch: 14 }, { wch: 16 }, { wch: 26 }
            ];

            worksheet['!rows'] = [{ hpt: 26 }]; // Header row height

            const headerStyle = {
                font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
                fill: { fgColor: { rgb: "1E3A8A" } },
                alignment: { horizontal: "center", vertical: "center", wrapText: true },
                border: {
                    top: { style: "medium", color: { rgb: "0F172A" } },
                    bottom: { style: "medium", color: { rgb: "0F172A" } },
                    left: { style: "thin", color: { rgb: "334155" } },
                    right: { style: "thin", color: { rgb: "334155" } }
                }
            };

            for (let c = 0; c < 19; c++) {
                const cellRef = XLSX.utils.encode_cell({ r: 0, c });
                if (worksheet[cellRef]) worksheet[cellRef].s = headerStyle;
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Item_Invoice_Template");
            XLSX.writeFile(workbook, `Purchase_Item_Invoice_Template.xlsx`);
        } else {
            const sheetData = [
                // SINGLE HORIZONTAL HEADER ROW
                [
                    "Voucher Date", "Supplier Invoice", "Invoice Date", "Party / Supplier Name",
                    "Transaction Mode", "Godown Tracking", "Ledger", "Amount", "Type", "Action"
                ],
                // SAMPLE DATA ROWS
                ["2026-03-30", "INV-123", "2026-03-30", "nuvoico trader", "Accounting Invoice", "Disabled (No)", "18% Intra State Purchase", 10000, "Debit", ""],
                ["2026-03-30", "INV-123", "2026-03-30", "nuvoico trader", "Accounting Invoice", "Disabled (No)", "CGST", 900, "Debit", ""],
                ["2026-03-30", "INV-123", "2026-03-30", "nuvoico trader", "Accounting Invoice", "Disabled (No)", "SGST", 900, "Debit", ""],
                ["2026-03-30", "INV-123", "2026-03-30", "nuvoico trader", "Accounting Invoice", "Disabled (No)", "nuvoico trader", 11800, "Credit", ""]
            ];

            const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
            worksheet['!cols'] = [
                { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 28 },
                { wch: 18 }, { wch: 18 }, { wch: 28 }, { wch: 14 },
                { wch: 12 }, { wch: 12 }
            ];

            worksheet['!rows'] = [{ hpt: 26 }]; // Header row height

            const headerStyle = {
                font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
                fill: { fgColor: { rgb: "312E81" } },
                alignment: { horizontal: "center", vertical: "center", wrapText: true },
                border: {
                    top: { style: "medium", color: { rgb: "1E1B4B" } },
                    bottom: { style: "medium", color: { rgb: "1E1B4B" } },
                    left: { style: "thin", color: { rgb: "3730A3" } },
                    right: { style: "thin", color: { rgb: "3730A3" } }
                }
            };

            for (let c = 0; c < 10; c++) {
                const cellRef = XLSX.utils.encode_cell({ r: 0, c });
                if (worksheet[cellRef]) worksheet[cellRef].s = headerStyle;
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Accounting_Invoice_Template");
            XLSX.writeFile(workbook, `Purchase_Accounting_Invoice_Template.xlsx`);
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
                            <p className="text-xs text-gray-500 mb-6 max-w-md mx-auto">
                                Excel headers: Voucher Date, Supplier Invoice, Invoice Date, Party Name, Mode, Godown Tracking (Voucher No. is auto-generated).
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
                                    Green badges indicate master matches. Invalid vouchers with missing masters or balance mismatch are blocked.
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
                                                ) : (
                                                    <span className="inline-flex items-center text-green-700 text-xs font-bold bg-green-100 px-3 py-1 rounded-full">
                                                        <CheckCircle size={14} className="mr-1" /> All Validations Passed — Ready for Import
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* SECTION 1: HEADER BLOCK WITH DYNAMICALLY EXTRACTED SUPPLIER */}
                                        <div className="p-4 mb-6 rounded-xl border border-gray-200 bg-gray-50/70 space-y-4">
                                            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800 border-b border-gray-200 pb-1 flex items-center justify-between">
                                                <span>Voucher Header (Auto Sequence Generated)</span>
                                                {voucher.isBalanceMatched ? (
                                                    <span className="text-green-700 bg-green-100 px-2 py-0.5 rounded text-[10px] font-bold">
                                                        ✓ Balanced (Debit = Credit = ₹{voucher.invoiceValue.toLocaleString()})
                                                    </span>
                                                ) : (
                                                    <span className="text-red-700 bg-red-100 px-2 py-0.5 rounded text-[10px] font-bold">
                                                        ✗ Balance Mismatch (Debit: ₹{voucher.totalDebit} | Credit: ₹{voucher.totalCredit})
                                                    </span>
                                                )}
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
                                                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-gray-500">Party / Supplier Name</label>
                                                    <div className="p-2 bg-white rounded border border-gray-300 text-xs font-bold flex items-center justify-between">
                                                        <span>{voucher.partyName}</span>
                                                        {voucher.partyMatch ? (
                                                            <span className="text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded font-bold">✓ Found</span>
                                                        ) : (
                                                            <span className="text-[10px] text-red-700 bg-red-50 px-2 py-0.5 rounded font-bold">✗ Not Found</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-gray-500">Transaction Mode</label>
                                                    <div className="p-2 bg-white rounded border border-gray-300 text-xs font-medium">{voucher.mode}</div>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-gray-500">Godown Tracking</label>
                                                    <div className="p-2 bg-white rounded border border-gray-300 text-xs font-medium">{voucher.godownTracking}</div>
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
                                                                <th className="px-3 py-2 text-right">SGST (%)</th>
                                                                <th className="px-3 py-2 text-right">CGST (%)</th>
                                                                <th className="px-3 py-2 text-right">IGST (%)</th>
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
                                                                    {/* SGST % & Amount */}
                                                                    <td className="px-3 py-2 text-right">
                                                                        <div className="flex flex-col items-end">
                                                                            <span className="font-semibold text-gray-800">{item.sgstRate}%</span>
                                                                            <span className="text-[10px] text-gray-500">(₹{item.sgstAmount.toLocaleString()})</span>
                                                                            {item.sgstLedgerFound ? (
                                                                                <span className="text-[9px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-bold mt-0.5">✓ Found</span>
                                                                            ) : (
                                                                                <span className="text-[9px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-bold mt-0.5">✗ Not Found</span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    {/* CGST % & Amount */}
                                                                    <td className="px-3 py-2 text-right">
                                                                        <div className="flex flex-col items-end">
                                                                            <span className="font-semibold text-gray-800">{item.cgstRate}%</span>
                                                                            <span className="text-[10px] text-gray-500">(₹{item.cgstAmount.toLocaleString()})</span>
                                                                            {item.cgstLedgerFound ? (
                                                                                <span className="text-[9px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-bold mt-0.5">✓ Found</span>
                                                                            ) : (
                                                                                <span className="text-[9px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-bold mt-0.5">✗ Not Found</span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    {/* IGST % & Amount */}
                                                                    <td className="px-3 py-2 text-right">
                                                                        <div className="flex flex-col items-end">
                                                                            <span className="font-semibold text-gray-800">{item.igstRate}%</span>
                                                                            <span className="text-[10px] text-gray-500">(₹{item.igstAmount.toLocaleString()})</span>
                                                                            {item.igstLedgerFound ? (
                                                                                <span className="text-[9px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-bold mt-0.5">✓ Found</span>
                                                                            ) : (
                                                                                <span className="text-[9px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-bold mt-0.5">✗ Not Found</span>
                                                                            )}
                                                                        </div>
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
                                                                <td colSpan={9} className="px-3 py-2 text-right">Total Invoice Value:</td>
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
                            /* COMPACT TABLE VIEW */
                            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-sm">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-gray-100 border-b border-gray-300 font-bold uppercase tracking-wider text-gray-600">
                                        <tr>
                                            <th className="px-3 py-2.5">Voucher Date</th>
                                            <th className="px-3 py-2.5">Auto Voucher No.</th>
                                            <th className="px-3 py-2.5">Supplier Invoice</th>
                                            <th className="px-3 py-2.5">Party / Supplier Name</th>
                                            <th className="px-3 py-2.5">Transaction Mode</th>
                                            <th className="px-3 py-2.5 text-right">Invoice Value</th>
                                            <th className="px-3 py-2.5 text-center">Validation Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {groupedVouchers.map((v) => (
                                            <tr key={v.id} className="hover:bg-gray-50">
                                                <td className="px-3 py-2.5 font-medium">{v.voucherDate}</td>
                                                <td className="px-3 py-2.5 font-mono font-bold text-blue-700">{v.voucherNo}</td>
                                                <td className="px-3 py-2.5">{v.supplierInvoice}</td>
                                                <td className="px-3 py-2.5 font-bold">
                                                    {v.partyName} {v.partyMatch ? <span className="text-green-700 text-[10px]"> (✓ Found)</span> : <span className="text-red-700 text-[10px]"> (✗ Not Found)</span>}
                                                </td>
                                                <td className="px-3 py-2.5">{v.mode}</td>
                                                <td className="px-3 py-2.5 text-right font-bold text-blue-700">₹{v.invoiceValue.toLocaleString()}</td>
                                                <td className="px-3 py-2.5 text-center font-bold">
                                                    {v.status === "imported" ? (
                                                        <span className="text-green-600">Saved</span>
                                                    ) : v.status === "error" ? (
                                                        <span className="text-red-600">{v.errorMessage || "Import Blocked"}</span>
                                                    ) : (
                                                        <span className="text-green-600">✓ All Validations Passed</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 3: DOWNLOAD EXCEL TEMPLATES (WITHOUT VOUCHER NO COLUMN) */}
                {activeTab === "templates" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
                        {/* Item Invoice Card */}
                        <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                                    <ShoppingCart size={24} />
                                </div>
                                <div>
                                    <h4 className="text-lg font-bold text-gray-900">Item Invoice Excel Template</h4>
                                    <span className="text-xs text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded">
                                        SGST/CGST Percentage Numeric Format
                                    </span>
                                </div>
                            </div>
                            <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                                <strong>Single Header Row:</strong> Voucher Date, Supplier Invoice, Invoice Date, Party Name, Mode, Godown Tracking, Sr No, Item, HSN/SAC, Quantity, Unit, Rate, CGST (%), SGST (%), IGST (%), Discount, Taxable, Godown, Purchase-Ledger.<br />
                                <span className="text-blue-700 font-medium">Tip: Specify either CGST+SGST (Intra-State) or IGST (Inter-State) on each item. Do not specify both together.</span>
                            </p>
                            <button
                                onClick={() => downloadTemplate('Item Invoice')}
                                className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold transition-all shadow-md active:scale-95"
                            >
                                <Download size={18} />
                                <span>Download Item Invoice Template (.xlsx)</span>
                            </button>
                        </div>

                        {/* Accounting Invoice Card */}
                        <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                                    <Layers size={24} />
                                </div>
                                <div>
                                    <h4 className="text-lg font-bold text-gray-900">Accounting Invoice Excel Template</h4>
                                    <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded">
                                        Debit/Credit Ledger Structure
                                    </span>
                                </div>
                            </div>
                            <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                                <strong>Single Header Row:</strong> Voucher Date, Supplier Invoice, Invoice Date, Party Name, Mode, Godown Tracking, Ledger, Amount, Type (Debit/Credit), Action.<br />
                                <span className="text-indigo-700 font-medium">Tip: Voucher-level fields only need to be filled on the first row of each voucher.</span>
                            </p>
                            <button
                                onClick={() => downloadTemplate('Accounting Invoice')}
                                className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold transition-all shadow-md active:scale-95"
                            >
                                <Download size={18} />
                                <span>Download Accounting Invoice Template (.xlsx)</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PurchaseImport;
