import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useReactToPrint } from "react-to-print";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { allSystemGroups as baseGroups } from "../../../constants/ledgerGroups";
import { useAppContext } from "../../../context/AppContext";
import type { LedgerWithGroup, VoucherEntry } from "../../../types";
import { Save, Plus, Trash2, ArrowLeft, Printer, Settings, Upload, ChevronDown, X } from "lucide-react";
import Swal from "sweetalert2";
import type { StockItem } from "../../../types";
import { useFinancialYear, getFinancialYearDefaults, useVoucherDateConfig } from "../../../hooks/useFinancialYear";

// DRY Principle - Reusable constants and styles
const TABLE_STYLES = {
  header: "px-4 py-2 text-left",
  headerCenter: "px-4 py-2 text-center",
  headerRight: "px-4 py-2 text-right",
  cell: "px-4 py-2",
  cellCenter: "px-4 py-2 text-center",
  cellRight: "px-4 py-2 text-right",
  input: "w-full p-2 rounded border text-right",
  select: "w-full p-2 rounded border cursor-pointer min-h-[35px] text-xs",
};

const PRINT_STYLES = {
  table: "w-full border-collapse mb-5 border border-black",
  headerCell: "border border-black p-2 text-[10pt] font-bold",
  cell: "border border-black p-2 text-[10pt]",
  cellCenter: "border border-black p-2 text-[10pt] text-center",
  cellRight: "border border-black p-2 text-[10pt] text-right",
};

// DRY Principle - Colspan values for table consistency
const COLSPAN_VALUES = {
  ITEM_TABLE_TOTAL: 8, // Sr No + Item + HSN + Batch + Qty + Unit + Rate + GST = 8 columns before Amount
  PRINT_TABLE_NO_ITEMS: 9, // All columns in print table
  PRINT_TABLE_TERMS: 7, // Columns for terms and conditions
};

// Reusable function to get themed input classes
const getInputClasses = (theme: string, hasError: boolean = false) => {
  const baseClasses =
    "w-full p-2 rounded border outline-none transition-colors";
  const themeClasses =
    theme === "dark"
      ? "bg-gray-700 border-gray-600 focus:border-blue-500"
      : "bg-white border-gray-300 focus:border-blue-500";
  const errorClasses = hasError ? "border-red-500" : "";
  return `${baseClasses} ${themeClasses} ${errorClasses}`;
};

// Reusable function to get themed select classes
const getSelectClasses = (theme: string, hasError: boolean = false) => {
  const baseClasses =
    "w-full p-2 rounded border cursor-pointer min-h-[40px] text-sm outline-none transition-colors";
  const themeClasses =
    theme === "dark"
      ? "bg-gray-700 border-gray-600 focus:border-blue-500"
      : "bg-white border-gray-300 focus:border-blue-500";
  const errorClasses = hasError ? "border-red-500" : "";
  return `${baseClasses} ${themeClasses} ${errorClasses}`;
};

const deduplicateLedgers = <T extends { id?: any; name?: string; ownerId?: any; owner_id?: any }>(list: T[]): T[] => {
  if (!Array.isArray(list)) return [];
  const seenIds = new Map<string, T>();
  const seenNames = new Map<string, T>();

  for (const item of list) {
    if (!item) continue;
    const idKey = item.id != null && item.id !== "" ? String(item.id) : null;
    const nameKey = item.name ? item.name.trim().toLowerCase() : null;

    if (idKey && seenIds.has(idKey)) continue;

    if (nameKey && seenNames.has(nameKey)) {
      const existing = seenNames.get(nameKey)!;
      const existingOwnerId = Number(existing.ownerId ?? existing.owner_id ?? 0);
      const currentOwnerId = Number(item.ownerId ?? item.owner_id ?? 0);
      if (existingOwnerId === 0 && currentOwnerId !== 0) {
        if (existing.id != null) seenIds.delete(String(existing.id));
        seenNames.set(nameKey, item);
        if (idKey) seenIds.set(idKey, item);
      }
      continue;
    }

    if (idKey) seenIds.set(idKey, item);
    if (nameKey) seenNames.set(nameKey, item);
  }

  return Array.from(seenNames.values());
};

// 🔹 Remove (20) from state name
const cleanState = (state: any) =>
  String(state || "").replace(/\(.*?\)/g, "").trim().toLowerCase();

const resolvePurchaseGst = (
  gstRate: number,
  companyState: string,
  supplierState: string
) => {
  const isIntra =
    !cleanState(companyState) ||
    !cleanState(supplierState) ||
    cleanState(companyState) === cleanState(supplierState);

  if (isIntra) {
    return {
      cgstRate: gstRate / 2,
      sgstRate: gstRate / 2,
      igstRate: 0,
      isIntra: true,
    };
  }

  return {
    cgstRate: 0,
    sgstRate: 0,
    igstRate: gstRate,
    isIntra: false,
  };
};

const normalizeGstForSave = (
  entries: any[],
  companyState: string,
  supplierState: string
) => {
  const isIntra =
    cleanState(companyState) &&
    cleanState(supplierState) &&
    cleanState(companyState) === cleanState(supplierState);

  return entries.map((e) => {
    if (!e.itemId) return e;

    const gst = Number(e.gstRate || 0);

    if (isIntra) {
      // ✅ Same State → CGST + SGST only
      return {
        ...e,

        igstRate: 0,
        gstLedgerId: "",

        cgstRate: gst / 2,
        sgstRate: gst / 2,
      };
    } else {
      // ✅ Other State → IGST only
      return {
        ...e,

        cgstRate: 0,
        sgstRate: 0,
        cgstLedgerId: "",
        sgstLedgerId: "",

        igstRate: gst,
      };
    }
  });
};


const calculateEntryValues = (
  quantity: number,
  rate: number,
  gstRate: number,
  companyState: string,
  supplierState: string
) => {

  console.log("CALC ENTRY =>", {
    quantity,
    rate,
    gstRate,
    companyState,
    supplierState,
  });
  const qty = Number(quantity || 0);
  const r = Number(rate || 0);

  const baseAmount = Number((qty * r).toFixed(2));

  const { cgstRate, sgstRate, igstRate } = resolvePurchaseGst(
    gstRate,
    companyState,
    supplierState
  );

  const totalTaxRate = cgstRate + sgstRate + igstRate;
  const gstAmount = Number(((baseAmount * totalTaxRate) / 100).toFixed(2));

  const totalAmount = baseAmount;

  return {
    quantity: qty,
    rate: r,
    baseAmount,
    gstAmount,
    amount: baseAmount,
    cgstRate,
    sgstRate,
    igstRate,
  };
};

// 🔹 Move utility functions here to avoid TDZ errors (used in handleEntryChange)
const getLedgerNameById = (id: any, ledgers: LedgerWithGroup[]) => {
  if (!id) return "-";
  const ledger = ledgers.find((l) => String(l.id) === String(id));
  return ledger?.name || "-";
};

const extractGstPercent = (name = "") => {
  if (!name) return 0;
  const match = name.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : 0;
};

const findTaxLedger = (
  prefix: string,
  rate: number,
  ledgers: LedgerWithGroup[]
) => {
  if (!ledgers || !Array.isArray(ledgers) || rate <= 0) return null;
  return ledgers.find((l) => {
    const name = String(l.name).toLowerCase();
    const groupName = String(l.groupName || "").toLowerCase();
    const isTaxGroup =
      groupName.includes("duties") ||
      groupName.includes("tax") ||
      name.includes("gst");
    if (!isTaxGroup) return false;
    return (
      name.includes(prefix) &&
      (name.includes(`${rate}%`) ||
        name.includes(`${rate} %`) ||
        name.includes(`@${rate}`) ||
        name.includes(`@ ${rate}`) ||
        name.includes(` ${rate}`))
    );
  });
};

const resolveEntryGstRate = (
  entry: any,
  ledgers: LedgerWithGroup[],
  stockItems: StockItem[]
): number => {
  if (!entry) return 0;

  let cgst = Number(entry.cgstRate || 0);
  let sgst = Number(entry.sgstRate || 0);
  let igst = Number(entry.igstRate || 0);

  if (cgst > 40 && entry.cgstLedgerId) cgst = extractGstPercent(getLedgerNameById(entry.cgstLedgerId, ledgers));
  else if (cgst > 40) cgst = 0;

  if (sgst > 40 && entry.sgstLedgerId) sgst = extractGstPercent(getLedgerNameById(entry.sgstLedgerId, ledgers));
  else if (sgst > 40) sgst = 0;

  if (igst > 40 && entry.gstLedgerId) igst = extractGstPercent(getLedgerNameById(entry.gstLedgerId, ledgers));
  else if (igst > 40) igst = 0;

  const explicitSum = cgst + sgst + igst;
  if (explicitSum > 0 && explicitSum <= 100) return explicitSum;

  if (Number(entry.gstRate) > 0 && Number(entry.gstRate) <= 100) return Number(entry.gstRate);

  if (entry.purchaseLedgerId) {
    const purchaseLedgerName = getLedgerNameById(entry.purchaseLedgerId, ledgers);
    const rateFromLedger = extractGstPercent(purchaseLedgerName);
    if (rateFromLedger > 0) return rateFromLedger;
  }

  if (entry.itemId) {
    const item = stockItems.find((i) => String(i.id) === String(entry.itemId));
    const itemGst = Number(item?.gstRate || (item as any)?._doc?.gstRate || 0);
    if (itemGst > 0) return itemGst;

    if (item?.gstLedgerId) {
      const taxLedgerName = getLedgerNameById(item.gstLedgerId, ledgers);
      const taxRate = extractGstPercent(taxLedgerName);
      if (taxRate > 0) return taxRate;
    }
  }

  if (entry.gstLedgerId) {
    const rate = extractGstPercent(getLedgerNameById(entry.gstLedgerId, ledgers));
    if (rate > 0) return rate;
  }
  if (entry.cgstLedgerId && entry.sgstLedgerId) {
    const cRate = extractGstPercent(getLedgerNameById(entry.cgstLedgerId, ledgers));
    const sRate = extractGstPercent(getLedgerNameById(entry.sgstLedgerId, ledgers));
    if (cRate + sRate > 0) return cRate + sRate;
  }

  return 0;
};

const PurchaseVoucher: React.FC = () => {
  const { theme, companyInfo } = useAppContext();

  //get companyInfo
  // 🔹 Get Company State from localStorage
  const companyInfoLS = localStorage.getItem("companyInfo");

  const companyState = companyInfoLS
    ? JSON.parse(companyInfoLS)?.state || ""
    : "";

  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  // Prefer `userType` (set at login) but fall back to legacy `supplier` key
  const companyId = localStorage.getItem("company_id");
  const ownerType = localStorage.getItem("supplier");
  const ownerId = localStorage.getItem(
    ownerType === "employee" ? "employee_id" : "user_id"
  );

  const [ledgers, setLedgers] = useState<LedgerWithGroup[]>([]);
  const [originalEntries, setOriginalEntries] = useState<any[]>([]);
  const partyLedgers = ledgers;



  const tdsLedgers = useMemo(() => ledgers.filter((l) =>
    String(l.name).toUpperCase().includes("TDS")
  ), [ledgers]);

  const discountLedgers = useMemo(() => ledgers.filter((l) => {
    const name = String(l.name || "").toLowerCase();
    return name.includes("discount") || name.includes("rebate");
  }), [ledgers]);



  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const { id } = useParams();
  const location = useLocation();
  const copyId = location.state?.copyId;
  const isEditMode = Boolean(id);

  const [showTableConfig, setShowTableConfig] = useState(false);
  const [supplierState, setSupplierState] = useState("");

  // --- Add Attribute Modal State ---
  const [showAttributeModal, setShowAttributeModal] = useState(false);
  const [masterAttributes, setMasterAttributes] = useState<any[]>([]);
  const [modalFormData, setModalFormData] = useState({
    stock_item_id: "",
    primary_attribute_id: "",
    primary_attribute_value: "",
    sub_attributes: [] as string[],
    sub_attribute_values: {} as any,
    quantity: 0,
    rate: 0,
    total_value: 0,
    entryIndex: -1
  });

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/stock-attributes`)
      .then(res => res.json())
      .then(data => {
        if (data && data.success && Array.isArray(data.data)) {
          setMasterAttributes(data.data);
        }
      })
      .catch(err => console.error("Error fetching master attributes", err));
  }, []);

  const submitAttributeModal = async () => {
    if (!modalFormData.primary_attribute_id) {
      alert("Please select a Primary Attribute");
      return;
    }
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/stock-items/add-tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modalFormData)
      });
      const data = await res.json();
      if (data.success) {
        // Refresh tracking options for this item
        const itemRes = await fetch(`${import.meta.env.VITE_API_URL}/api/stock-items/${modalFormData.stock_item_id}`);
        const itemData = await itemRes.json();
        const trackingRows = itemData?.data?.attributeTrackingRows || itemData?.attributeTrackingRows;
        
        setFormData((prev) => {
          const currentEntries = [...prev.entries];
          const idx = modalFormData.entryIndex;
          if (currentEntries[idx]) {
            currentEntries[idx] = {
              ...currentEntries[idx],
              trackingOptions: trackingRows || [],
              tracking_id: data.tracking_id,
              sub_attributes: { ...modalFormData.sub_attribute_values },
              quantity: modalFormData.quantity > 0 ? modalFormData.quantity : currentEntries[idx].quantity,
              rate: modalFormData.rate > 0 ? modalFormData.rate : currentEntries[idx].rate,
              amount: modalFormData.total_value > 0 ? modalFormData.total_value : currentEntries[idx].amount
            };
          }
          return { ...prev, entries: currentEntries };
        });
        
        setShowAttributeModal(false);
      } else {
        alert("Error: " + data.message);
      }
    } catch (err) {
      console.error(err);
      alert("Error adding tracking");
    }
  };


  const [itemSelectionModal, setItemSelectionModal] = useState<{
    isOpen: boolean;
    index: number | null;
  }>({ isOpen: false, index: null });


  const [visibleColumns, setVisibleColumns] = useState(
    {
      attribute: true,
      hsn: true,
      gst: true,
      batch: true,   // ✅ Default ON — but column only shows when item has batches (hasAnyBatch)
      godown: true,
      showReceiptDetails: false,
      tds: true,
      enableTdsCredit: false,
    }
  );

  const [isReadyToSave, setIsReadyToSave] = useState(false);
  const [voucherMode, setVoucherMode] = useState<"auto" | "custom">("auto");

  // Barcode State
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isBarcodeError, setIsBarcodeError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [unmappedPartyName, setUnmappedPartyName] = useState<string | null>(null);

  // Helper to find stock item details
  const resolveStockItemDetails = (itemId: string) => {
    const item = stockItems.find((i) => String(i.id) === String(itemId));
    if (!item) return {};

    return {
      name: item.name,
      hsnCode: item.hsnCode,
      unit: item.unit,
      gstRate: Number(item.gstRate || 0),
      // For Purchase, we usually use standardPurchaseRate, but fallback to rate/mrp if needed
      standardPurchaseRate: Number(item.standardPurchaseRate || item.purchaseRate || item.rate || 0),
      batches: item.batches,
      attributes: (item as any).attributes || [],
      gstLedgerId: item.gstLedgerId,
      sgstLedgerId: item.sgstLedgerId,
      cgstLedgerId: item.cgstLedgerId,
      igstLedgerId: item.igstLedgerId,
    };
  };

  const performBarcodeLookup = async (code: string) => {
    if (!code.trim()) return;

    try {
      // Using sales-vouchers endpoint as requested by user ("ke jaisa") which implies same logic
      // Assuming backend endpoint is generic enough or we use the sales one for item lookup
      const url = `${import.meta.env.VITE_API_URL}/api/sales-vouchers/item-by-barcode?barcode=${code}&company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.success && json.data) {
        setIsBarcodeError(false);
        const item = json.data;

        // ✅ CHECK directly using formDataRef (reliable — no async batching issue)
        const existingIndex = formDataRef.current.entries.findIndex(
          (e: any) => String(e.itemId) === String(item.id)
        );

        if (existingIndex !== -1) {
          // Item pehle se hai — sirf quantity +1 karo, koi naya row nahi
          setFormData((prev) => {
            const updatedEntries = [...prev.entries];
            const existingEntry = updatedEntries[existingIndex];
            const newQty = Number(existingEntry.quantity || 0) + 1;

            const calculated = calculateEntryValues(
              newQty,
              Number(existingEntry.rate || 0),
              Number(existingEntry.discount || 0),
              Number(existingEntry.gstRate || 0),
              companyState,
              supplierState
            );

            updatedEntries[existingIndex] = {
              ...existingEntry,
              quantity: newQty,
              amount: calculated.amount,
            };

            return { ...prev, entries: updatedEntries };
          });

          Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500, timerProgressBar: true })
            .fire({ icon: 'success', title: `Qty +1: ${item.name}` });
          setBarcodeInput("");
          return;
        }

        // ✅ Naya item — quantity 2 se add karo
        const details = resolveStockItemDetails(item.id);

        setFormData((prev) => {
          const updatedEntries = [...prev.entries];

          const gst = Number(details.gstRate || 0);

          // Calculate amounts using existing helper — quantity 2 default
          const calculated = calculateEntryValues(
            2, // ✅ Default quantity 2 for new barcode items
            Number(details.standardPurchaseRate || 0),
            0, // discount
            gst,
            companyState,
            supplierState
          );

          const { cgstRate, sgstRate, igstRate, isIntra } = resolvePurchaseGst(
            gst,
            companyState,
            supplierState
          );

          // 🔍 Find Purchase Ledger
          let gstToMatch = gst;
          // If GST is 0, try to deduce from GST ledger name (similar to manual entry logic)
          if (gstToMatch === 0 && details.gstLedgerId) {
            const ledger = ledgers.find((l) => String(l.id) === String(details.gstLedgerId));
            if (ledger) {
              const match = ledger.name.match(/(\d+(\.\d+)?)/);
              gstToMatch = match ? Number(match[1]) : 0;
            }
          }

          const matchingPurchaseLedger = purchaseLedgers.find((l) => {
            const name = String(l.name).toLowerCase();
            const gstMatch =
              name.includes(`${gstToMatch}%`) ||
              name.includes(`${gstToMatch} %`) ||
              name.includes(`purchase ${gstToMatch}`) ||
              name.includes(`@${gstToMatch}%`) ||
              name.includes(`@ ${gstToMatch}%`);

            if (!gstMatch) return false;

            if (isIntra) {
              return name.includes("intra");
            } else {
              return name.includes("inter");
            }
          });

          // ⚠️ Warning if not found
          if (!matchingPurchaseLedger && gstToMatch > 0) {
            Swal.fire({
              title: "Purchase Ledger Missing",
              text: `Purchase ${gstToMatch}% Ledger not found. Please create it first.`,
              icon: "warning",
              confirmButtonColor: "#3085d6",
            });
          }

          const newEntry = {
            id: `e${Date.now()}`,
            itemId: String(item.id),
            hsnCode: details.hsnCode || "",
            unitName: details.unit || "",

            quantity: 2, // ✅ Default 2 for new barcode scan items
            rate: calculated.rate,
            amount: calculated.amount,

            gstRate: gst,
            cgstRate: cgstRate,
            sgstRate: sgstRate,
            igstRate: igstRate,

            // Prioritize item master tax ledgers
            gstLedgerId: details.gstLedgerId || "",
            sgstLedgerId: details.sgstLedgerId || "",
            cgstLedgerId: details.cgstLedgerId || "",
            igstLedgerId: details.igstLedgerId || "",

            batches: details.batches || [],
            batchNumber: "",
            godownId: "",
            purchaseLedgerId: matchingPurchaseLedger?.id || prev.purchaseLedgerId || "",

            // Fill other required fields based on Type
            type: "debit",
          };

          const lastIndex = updatedEntries.length - 1;
          // If last row is empty (no item selected), replace it; otherwise add new
          if (lastIndex >= 0 && !updatedEntries[lastIndex].itemId) {
            updatedEntries[lastIndex] = newEntry as any;
          } else {
            updatedEntries.push(newEntry as any);
          }

          return { ...prev, entries: updatedEntries };
        });

        const Toast = Swal.mixin({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 1500,
          timerProgressBar: true,
        });
        Toast.fire({
          icon: 'success',
          title: `Item added: ${item.name}`
        });
      } else {
        if (code) {
          setIsBarcodeError(true);
        }
      }
    } catch (err) {
      console.error("Barcode Fetch Error:", err);
      setIsBarcodeError(true);
    }
  };

  // POS Barcode Scanner Logic (Global Listener)
  const barcodeBuffer = useRef("");
  const lastKeyTime = useRef(0);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if source is common inputs (unless it's barcode specific)
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        // If it's the barcode input itself, let the default handle it or we still buffer? 
        // Most scanners "type" into the focused field.
        // We only want to "auto-detect" if NOT in a critical field or specially handled.
      }

      const currentTime = Date.now();
      const diff = currentTime - lastKeyTime.current;
      lastKeyTime.current = currentTime;

      // Professional scanners usually type very fast (< 50ms per char)
      if (diff < 50) {
        if (e.key === "Enter") {
          if (barcodeBuffer.current.length >= 3) {
            const code = barcodeBuffer.current;
            // ✅ Clear barcodeInput (empty string) — prevents debounce useEffect from firing again
            setBarcodeInput("");
            performBarcodeLookup(code);
            barcodeBuffer.current = "";
          }
        } else if (e.key.length === 1) {
          barcodeBuffer.current += e.key;
        }
      } else {
        // Reset buffer if delay is too long
        if (e.key.length === 1) {
          barcodeBuffer.current = e.key;
        } else {
          barcodeBuffer.current = "";
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [barcodeInput]); // Dependency on barcodeInput to stay updated or performBarcodeLookup

  // Debounced Barcode Lookup (for manual typing)
  useEffect(() => {
    if (!barcodeInput || barcodeInput.length < 3) return;

    const timer = setTimeout(() => {
      performBarcodeLookup(barcodeInput);
    }, 600);

    return () => clearTimeout(timer);
  }, [barcodeInput]);

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    performBarcodeLookup(barcodeInput);
  };

  const [isExtracting, setIsExtracting] = useState(false);

  const handleBillUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    
    try {
      Swal.fire({
        title: 'Extracting Bill Data...',
        text: 'Please wait while AI processes the file.',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      const formDataPayload = new FormData();
      formDataPayload.append('billImage', file);

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/ai/extract-bill`, {
        method: "POST",
        body: formDataPayload
      });

      if (!response.ok) {
         let errorData = null;
         try {
           errorData = await response.json();
         } catch (e) {
           // Ignore JSON parse errors
         }
         throw { 
           isApiError: true, 
           status: response.status, 
           data: errorData,
           message: `API error: ${response.status}` 
         };
      }

      const parsedData = await response.json();
      
      if (parsedData) {
        let missingWarnings: string[] = [];
          
          const fuzzyMatch = (str1: string, str2: string) => {
            if (!str1 || !str2) return false;
            const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
            const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
            return s1.includes(s2) || s2.includes(s1);
          };

          let foundPartyId = "";
          let isPartyMissing = false;
          let localSupplierState = supplierState;

          if (parsedData.supplierName) {
            const match = partyLedgers.find((l: any) => fuzzyMatch(l.name, parsedData.supplierName));
            if (match) {
              foundPartyId = String(match.id);
              setUnmappedPartyName(null);
              localSupplierState = match.state || "";
            } else {
              isPartyMissing = true;
              setUnmappedPartyName(parsedData.supplierName);
              missingWarnings.push(`Ledger not exist: ${parsedData.supplierName}`);
            }
          } else {
            missingWarnings.push(`Ledger not found in bill.`);
            setUnmappedPartyName(null);
          }

          if (isPartyMissing) {
            const result = await Swal.fire({
              title: "Party not exist",
              text: `Party Name: ${parsedData.supplierName} does not exist. Do you want to save it automatically?`,
              icon: "question",
              showCancelButton: true,
              confirmButtonText: "Yes, save it",
              cancelButtonText: "No",
            });
            
            if (result.isConfirmed) {
              try {
                const groupsRes = await fetch(`${import.meta.env.VITE_API_URL}/api/ledger-groups?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`);
                const groupsData = await groupsRes.json();
                const fetchedGroups = Array.isArray(groupsData) ? groupsData : (groupsData.groups || []);
                const groupsArray = [...fetchedGroups, ...baseGroups];
                const sundryCreditorsGroup = groupsArray.find((g: any) => g.name.toLowerCase() === 'sundry creditors');

                if (!sundryCreditorsGroup) {
                  Swal.fire("Error", "Sundry Creditors group not found. Please create it manually.", "error");
                } else {
                  const statesList = [
                    { code: "37", name: "Andhra Pradesh" }, { code: "12", name: "Arunachal Pradesh" },
                    { code: "18", name: "Assam" }, { code: "10", name: "Bihar" },
                    { code: "22", name: "Chhattisgarh" }, { code: "30", name: "Goa" },
                    { code: "24", name: "Gujarat" }, { code: "06", name: "Haryana" },
                    { code: "02", name: "Himachal Pradesh" }, { code: "20", name: "Jharkhand" },
                    { code: "29", name: "Karnataka" }, { code: "32", name: "Kerala" },
                    { code: "23", name: "Madhya Pradesh" }, { code: "27", name: "Maharashtra" },
                    { code: "14", name: "Manipur" }, { code: "17", name: "Meghalaya" },
                    { code: "15", name: "Mizoram" }, { code: "13", name: "Nagaland" },
                    { code: "21", name: "Odisha" }, { code: "03", name: "Punjab" },
                    { code: "08", name: "Rajasthan" }, { code: "11", name: "Sikkim" },
                    { code: "33", name: "Tamil Nadu" }, { code: "36", name: "Telangana" },
                    { code: "16", name: "Tripura" }, { code: "09", name: "Uttar Pradesh" },
                    { code: "05", name: "Uttarakhand" }, { code: "19", name: "West Bengal" },
                    { code: "07", name: "Delhi" }, { code: "01", name: "Jammu and Kashmir" },
                    { code: "38", name: "Ladakh" }
                  ];

                  let resolvedState = "";
                  
                  if (parsedData.supplierGst && parsedData.supplierGst.length >= 2) {
                    const stateCode = parsedData.supplierGst.substring(0, 2);
                    const stateMatch = statesList.find(s => s.code === stateCode);
                    if (stateMatch) {
                      resolvedState = `${stateMatch.name}(${stateMatch.code})`;
                    }
                  }
                  
                  if (!resolvedState && parsedData.supplierState) {
                    const extracted = String(parsedData.supplierState).trim().toLowerCase();
                    const stateMatch = statesList.find(s => 
                      s.name.toLowerCase() === extracted || 
                      s.code === extracted
                    );
                    if (stateMatch) {
                      resolvedState = `${stateMatch.name}(${stateMatch.code})`;
                    } else {
                      resolvedState = parsedData.supplierState;
                    }
                  }
                  const newLedgerPayload = {
                    name: parsedData.supplierName,
                    groupId: sundryCreditorsGroup.id,
                    companyId,
                    ownerType,
                    ownerId,
                    gstNumber: parsedData.supplierGst || "",
                    address: parsedData.supplierAddress || "",
                    state: resolvedState,
                    pinCode: parsedData.supplierPinCode || "",
                    panNumber: parsedData.supplierPan || "",
                    openingBalance: 0,
                    balanceType: "credit"
                  };
                  
                  const createRes = await fetch(`${import.meta.env.VITE_API_URL}/api/ledger`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(newLedgerPayload)
                  });
                  
                  if (createRes.ok) {
                    const createdLedgerData = await createRes.json();
                    const newLedger = createdLedgerData.ledger || createdLedgerData;
                    
                    setLedgers((prev: any) => [...prev, newLedger]);
                    foundPartyId = String(newLedger.id);
                    isPartyMissing = false;
                    missingWarnings = missingWarnings.filter(w => !w.startsWith("Ledger not exist: "));
                    setUnmappedPartyName(null);
                    localSupplierState = resolvedState;
                    
                    await Swal.fire("Success", "Party ledger created successfully!", "success");
                  } else {
                    const errText = await createRes.text();
                    await Swal.fire("Error", `Failed to create party ledger: ${errText}`, "error");
                  }
                }
              } catch (err: any) {
                console.error("Auto ledger creation error:", err);
                await Swal.fire("Error", `An error occurred while creating ledger: ${err.message}`, "error");
              }
            }
          }

          setFormData((prev: any) => {
            const updated = { ...prev };
            if (parsedData.invoiceNumber) updated.referenceNo = parsedData.invoiceNumber;
            if (parsedData.date) updated.supplierInvoiceDate = parsedData.date;
            if (parsedData.tdsAmount) {
              updated.tdsAmount = parsedData.tdsAmount;
            }
            if (parsedData.discountAmount) {
              updated.discountAmount = parsedData.discountAmount;
              if (!updated.discountLedgerId && discountLedgers && discountLedgers.length > 0) {
                const rebL = discountLedgers.find((l) => {
                  const n = String(l.name || "").toLowerCase();
                  return n.includes("rebate") || n.includes("discount");
                });
                if (rebL) updated.discountLedgerId = String(rebL.id);
              }
            }
            
            if (foundPartyId) {
               updated.partyId = foundPartyId;
            }
            return updated;
          });
          
          setSupplierState(localSupplierState);

          // Pre-process items sequentially to allow async Swal popups
          let resolvedItems: any[] = [];
          if (parsedData.items && parsedData.items.length > 0) {
            for (let i = 0; i < parsedData.items.length; i++) {
              const extractedItem = parsedData.items[i];
              let matchItem = stockItems.find((itm: any) => fuzzyMatch(itm.name, extractedItem.name));
              const extractedHsn = extractedItem.hsnSac || extractedItem.hsnCode || "";

              let derivedGst = extractedItem.gstRate || 0;
              if (!derivedGst && extractedItem.igstRate) {
                derivedGst = extractedItem.igstRate;
              } else if (!derivedGst && extractedItem.cgstRate && extractedItem.sgstRate) {
                derivedGst = extractedItem.cgstRate + extractedItem.sgstRate;
              } else if (!derivedGst && extractedItem.cgstAmount && extractedItem.sgstAmount && extractedItem.taxableValue) {
                 derivedGst = Math.round(((extractedItem.cgstAmount + extractedItem.sgstAmount) / extractedItem.taxableValue) * 100);
              } else if (!derivedGst && extractedItem.igstAmount && extractedItem.taxableValue) {
                 derivedGst = Math.round((extractedItem.igstAmount / extractedItem.taxableValue) * 100);
              }
              
              derivedGst = Number(derivedGst) || 0;
              extractedItem.gstRate = derivedGst;

              if (!matchItem) {
                const result = await Swal.fire({
                  title: "Item not exist",
                  text: `Item Name: ${extractedItem.name} does not exist. Do you want to save it automatically?`,
                  icon: "question",
                  showCancelButton: true,
                  confirmButtonText: "Yes, save it",
                  cancelButtonText: "No",
                });

                if (result.isConfirmed) {
                  try {
                    const generatedBarcode = Math.floor(100000000000 + Math.random() * 900000000000).toString();
                    
                    const cSgstRate = derivedGst / 2;
                    let cgstLedgerId = "";
                    let sgstLedgerId = "";
                    let igstLedgerId = "";

                    const findTaxLedger = (prefix: string, rate: number) => {
                      return ledgers.find((l) => {
                        const name = String(l.name).toLowerCase();
                        return name.includes(prefix) && (name.includes(`${rate}%`) || name.includes(`${rate} %`) || name.includes(`@${rate}`) || name.includes(`@ ${rate}`));
                      });
                    };

                    const matchedCgst = findTaxLedger("cgst", cSgstRate);
                    if (matchedCgst) cgstLedgerId = String(matchedCgst.id);

                    const matchedSgst = findTaxLedger("sgst", cSgstRate);
                    if (matchedSgst) sgstLedgerId = String(matchedSgst.id);

                    const matchedIgst = findTaxLedger("igst", derivedGst);
                    if (matchedIgst) igstLedgerId = String(matchedIgst.id);

                    const payload = {
                      name: extractedItem.name,
                      unit: extractedItem.unit || "NOS",
                      taxType: "Taxable",
                      hsnCode: extractedHsn,
                      gstRate: derivedGst,
                      openingBalance: 0,
                      openingValue: 0,
                      standardPurchaseRate: extractedItem.rate || 0,
                      barcode: generatedBarcode,
                      gstLedgerId: igstLedgerId,
                      cgstLedgerId,
                      sgstLedgerId,
                      igstLedgerId,
                      company_id: companyId,
                      owner_type: ownerType,
                      owner_id: ownerId,
                    };

                    const createRes = await fetch(`${import.meta.env.VITE_API_URL}/api/stock-items`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload)
                    });
                    
                    if (createRes.ok) {
                      const resData = await createRes.json();
                      matchItem = {
                        id: resData.insertId || resData.id || Date.now(),
                        name: extractedItem.name,
                        unit: payload.unit,
                        hsnCode: payload.hsnCode,
                        gstRate: payload.gstRate,
                        standardPurchaseRate: payload.standardPurchaseRate,
                        gstLedgerId: payload.gstLedgerId,
                        cgstLedgerId: payload.cgstLedgerId,
                        sgstLedgerId: payload.sgstLedgerId,
                        igstLedgerId: payload.igstLedgerId
                      };
                      setStockItems((prevItems: any) => [...prevItems, matchItem]);
                      missingWarnings = missingWarnings.filter(w => !w.startsWith(`Item not exist: ${extractedItem.name}`));
                      await Swal.fire("Success", `Stock item '${extractedItem.name}' created successfully!`, "success");
                    } else {
                      const errText = await createRes.text();
                      await Swal.fire("Error", `Failed to create item: ${errText}`, "error");
                    }
                  } catch (err: any) {
                    await Swal.fire("Error", `An error occurred while creating item: ${err.message}`, "error");
                  }
                }
              }

              if (!extractedHsn && !matchItem?.hsnCode) {
                missingWarnings.push(`HSN/SAC missing for item: ${extractedItem.name}`);
              }

              if (!matchItem) {
                missingWarnings.push(`Item not exist: ${extractedItem.name}`);
              }

              resolvedItems.push({ extractedItem, matchItem, extractedHsn });
            }
          }

          setFormData((prev: any) => {
            const updated = { ...prev };
            if (resolvedItems.length > 0) {
               const newEntries = [...prev.entries];
               resolvedItems.forEach(({ extractedItem, matchItem, extractedHsn }) => {

                 if (matchItem) {
                    const details = resolveStockItemDetails(String(matchItem.id));
                    const gst = extractedItem.gstRate || Number(details.gstRate || matchItem.gstRate || 0);
                    const qty = extractedItem.quantity || 1;
                    const rate = extractedItem.rate || Number(details.standardPurchaseRate || matchItem.standardPurchaseRate || 0);
                    const discount = extractedItem.discount || 0;
                    
                    const calculated = calculateEntryValues(qty, rate, gst, companyState, localSupplierState);
                    const { cgstRate, sgstRate, igstRate } = resolvePurchaseGst(gst, companyState, localSupplierState);
                    
                    const isIntra = companyState && localSupplierState && cleanState(companyState) === cleanState(localSupplierState);
                    const matchingPurchaseLedger = purchaseLedgers.find((l) => {
                      const name = String(l.name).toLowerCase();
                      const gstMatch = name.includes(`${gst}%`) || name.includes(`${gst} %`) || name.includes(`purchase ${gst}`) || name.includes(`@${gst}%`) || name.includes(`@ ${gst}%`);
                      if (!gstMatch) return false;
                      return isIntra ? name.includes("intra") || name.includes("local") : name.includes("inter") || name.includes("central");
                    });

                    const newEntry = {
                       id: `e${Date.now()}_${Math.random()}`,
                       itemId: String(matchItem.id),
                       hsnCode: extractedHsn || details.hsnCode || matchItem.hsnCode || "",
                       unitName: details.unit || matchItem.unit || extractedItem.unit || "",
                       quantity: qty,
                       rate: rate,
                       discount: discount,
                       amount: Number((extractedItem.taxableValue || calculated.amount).toFixed(2)),
                       gstRate: gst,
                       cgstRate, sgstRate, igstRate,
                       gstLedgerId: details.gstLedgerId || matchItem.gstLedgerId || "",
                       sgstLedgerId: details.sgstLedgerId || matchItem.sgstLedgerId || "",
                       cgstLedgerId: details.cgstLedgerId || matchItem.cgstLedgerId || "",
                       igstLedgerId: details.igstLedgerId || matchItem.igstLedgerId || "",
                       batches: details.batches || [],
                       batchNumber: "",
                       godownId: "",
                       purchaseLedgerId: matchingPurchaseLedger ? String(matchingPurchaseLedger.id) : (prev.purchaseLedgerId || ""),
                       type: "debit",
                    };
                    
                    const lastIndex = newEntries.length - 1;
                    if (lastIndex >= 0 && !newEntries[lastIndex].itemId) {
                      newEntries[lastIndex] = newEntry as any;
                    } else {
                      newEntries.push(newEntry as any);
                    }
                  } else {
                    const newEntry = {
                       id: `e${Date.now()}_${Math.random()}`,
                       itemId: "",
                       hsnCode: extractedHsn || "",
                       unitName: extractedItem.unit || "",
                       quantity: extractedItem.quantity || 1,
                       rate: extractedItem.rate || 0,
                       discount: extractedItem.discount || 0,
                       amount: extractedItem.taxableValue || extractedItem.amount || 0,
                       narration: `Extracted Item: ${extractedItem.name} | IGST: ${extractedItem.igstAmount || 0}`,
                       type: "debit"
                    };
                    newEntries.push(newEntry as any);
                 }
               });
               updated.entries = newEntries;
            }
            return updated;
          });

          if (missingWarnings.length > 0) {
            Swal.fire({
              title: "Data Extracted with Warnings",
              html: `<div class="text-left"><p>Some data could not be fully mapped:</p><ul class="list-disc pl-5 mt-2 text-sm text-red-600">${missingWarnings.map(w => `<li>${w}</li>`).join('')}</ul></div>`,
              icon: "warning"
            });
          } else {
            Swal.fire("Success", "Bill data extracted and filled successfully!", "success");
          }
        } else {
           throw new Error("No extracted data");
        }
      } catch (err: any) {
        console.error("Extraction error:", err);
        
        let errorTitle = "Error";
        let errorMessage = "Failed to extract bill data. Please check the image and try again.";
        
        if (err.isApiError) {
           if (err.status === 429) {
              errorTitle = "Rate Limit Exceeded";
              errorMessage = "The AI service is currently busy or you have exceeded your usage limit (API 429). Please try again after some time.";
           } else if (err.status === 400) {
              errorTitle = "Bad Request";
              errorMessage = "There was an issue with the provided image or request format (API 400). Please make sure the image is clear and try again.";
           } else if (err.status === 401 || err.status === 403) {
              errorTitle = "Authentication Error";
              errorMessage = "Failed to authenticate with the AI service. Please check your API keys.";
           } else if (err.status === 500) {
              errorTitle = "Server Error";
              errorMessage = "The AI service encountered an internal error. Please try again later.";
           } else if (err.status === 503) {
              errorTitle = "Service Unavailable";
              errorMessage = "The AI service is currently unavailable. Please try again later.";
           } else if (err.data && err.data.error) {
              errorMessage = err.data.error;
           } else {
              errorMessage = `An unexpected error occurred (API ${err.status}).`;
           }
        }
        
        Swal.fire({
          title: errorTitle, 
          html: errorMessage, 
          icon: "error"
        });
      } finally {
        setIsExtracting(false);
        if (e.target) e.target.value = "";
      }
  };

  useEffect(() => {
    if (!id && !copyId) return;

    const fetchId = id || copyId;

    const toLocalDateStr = (isoString: string) => {
      if (!isoString) return "";
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return "";
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    fetch(`${import.meta.env.VITE_API_URL}/api/purchase-vouchers/${fetchId}`)
      .then((res) => res.json())
      .then((data) => {
        setOriginalEntries(data.entries || []);
        setFormData((prev) => ({
          ...prev,

          // MAIN FIELDS
          date: id ? (data.date ? toLocalDateStr(data.date) : "") : defaultDate,
          supplierInvoiceDate: data.supplierInvoiceDate
            ? toLocalDateStr(data.supplierInvoiceDate)
            : "",
          referenceNo: data.referenceNo || "",
          partyId: data.partyId || "",
          purchaseLedgerId: data.purchaseLedgerId || "",
          tdsLedgerId: data.tdsLedgerId ? String(data.tdsLedgerId) : "",
          tdsAmount: data.tdsAmount || 0,
          discountLedgerId: (() => {
            if (data.discountLedgerId) return String(data.discountLedgerId);
            const amt = Number(data.discountTotal || data.discountAmount || 0);
            if (amt > 0 && ledgers.length > 0) {
              const rebL = ledgers.find((l) => {
                const n = String(l.name || "").toLowerCase();
                return n.includes("rebate") || n.includes("discount");
              });
              if (rebL) return String(rebL.id);
            }
            return "";
          })(),
          discountAmount: Number(data.discountTotal || data.discountAmount || 0),
          narration: data.narration || "",
          number: id ? (data.number || prev.number) : "", // Clear number for copy
          mode: data.mode || "item-invoice",

          dispatchDetails: {
            docNo: data.dispatchDocNo || "",
            through: data.dispatchThrough || "",
            destination: data.destination || "",
            approxDistance: data.approxDistance || "",
          },

          entries:
            data.entries?.map((e: any, idx: number) => {
              const stockItem = stockItems.find(
                (item) => String(item.id) === String(e.itemId)
              );

              let rawCgst = Number(e.cgstRate) || 0;
              let rawSgst = Number(e.sgstRate) || 0;
              let rawIgst = Number(e.igstRate) || 0;

              let cgstLedgerId = e.cgstLedgerId || "";
              let sgstLedgerId = e.sgstLedgerId || "";
              let gstLedgerId = e.gstLedgerId || "";

              if (rawCgst > 40) {
                if (!cgstLedgerId) cgstLedgerId = Math.round(rawCgst);
                rawCgst = extractGstPercent(getLedgerNameById(cgstLedgerId, ledgers));
              }
              if (rawSgst > 40) {
                if (!sgstLedgerId) sgstLedgerId = Math.round(rawSgst);
                rawSgst = extractGstPercent(getLedgerNameById(sgstLedgerId, ledgers));
              }
              if (rawIgst > 40) {
                if (!gstLedgerId) gstLedgerId = Math.round(rawIgst);
                rawIgst = extractGstPercent(getLedgerNameById(gstLedgerId, ledgers));
              }

              if (rawCgst > 14 && (rawCgst === rawSgst || rawSgst === 0)) {
                rawCgst = rawCgst / 2;
                rawSgst = rawCgst;
              } else if (rawSgst > 14 && rawCgst === 0) {
                rawSgst = rawSgst / 2;
                rawCgst = rawSgst;
              }

              // Calculate total saved GST rate to populate the dropdown/display if needed
              const savedGstRate = rawCgst + rawSgst + rawIgst;

              let itemPLedgerId = e.purchaseLedgerId ? String(e.purchaseLedgerId) : (data.purchaseLedgerId ? String(data.purchaseLedgerId) : "");

              // Fallback resolution if purchaseLedgerId is empty
              if (!itemPLedgerId && ledgers.length > 0) {
                const itemGst = savedGstRate || stockItem?.gstRate || 0;
                const isIntra = !cleanState(companyState) || !cleanState(supplierState) || cleanState(companyState) === cleanState(supplierState);
                const matchedPL = ledgers.find(l => {
                  const lName = String(l.name).toLowerCase();
                  if (!lName.includes("purchase") && !String(l.groupName || "").toLowerCase().includes("purchase")) return false;
                  const pctMatch = lName.includes(`${itemGst}%`) || lName.includes(`${itemGst} %`) || lName.includes(`@${itemGst}%`);
                  if (itemGst > 0 && !pctMatch) return false;
                  return isIntra ? lName.includes("intra") : lName.includes("inter");
                }) || ledgers.find(l => String(l.name).toLowerCase().includes("purchase"));
                if (matchedPL) itemPLedgerId = String(matchedPL.id);
              }

              return {
                id: "e" + (idx + 1),

                itemId: e.itemId || "",
                quantity: Number(e.quantity || 0),
                rate: Number(e.rate || 0),
                amount: Number(e.amount || ((e.quantity || 0) * (e.rate || 0)).toFixed(2)),

                // AUTO FILL: Prioritize saved data, fallback to Item Master if missing
                hsnCode: e.hsnCode || stockItem?.hsnCode || "",
                unitName: stockItem?.unit || "",

                // Use saved GST Rate logic
                gstRate: savedGstRate || stockItem?.gstRate || 0,
                cgstRate: rawCgst,
                sgstRate: rawSgst,
                igstRate: rawIgst,

                // BATCH Auto Fill from Saved Data
                batches: stockItem?.batches || [],
                batchNumber: e.batchNumber || "",
                batchExpiryDate: e.batchExpiryDate || "",
                batchManufacturingDate: e.batchManufacturingDate || "",

                // TAX LEDGERS (Critical for Totals Calculation)
                gstLedgerId: gstLedgerId || stockItem?.gstLedgerId || "",
                sgstLedgerId: sgstLedgerId || stockItem?.sgstLedgerId || "",
                cgstLedgerId: cgstLedgerId || stockItem?.cgstLedgerId || "",

                // Godown
                godownId: e.godownId || "",

                // Discount
                discount: Number(e.discount || 0),
                discountLedgerId: e.discountLedgerId || "",

                // Ledger Mode Support
                ledgerId: e.ledgerId || "",
                purchaseLedgerId: itemPLedgerId,
                type: e.type || "debit",
                narration: e.narration || "",

                // Tracking
                tracking_id: e.tracking_id || "",
                sub_attributes: e.sub_attributes || {},
              };
            }) || [],
        }));

        // Dynamically fetch tracking options for populated items
        const itemIdsToFetch = new Set((data.entries || []).filter((e: any) => e.itemId).map((e: any) => e.itemId));
        itemIdsToFetch.forEach(itemId => {
          fetch(`${import.meta.env.VITE_API_URL}/api/stock-items/${itemId}`)
            .then(res => res.json())
            .then(resData => {
              const trackingRows = resData?.data?.attributeTrackingRows || resData?.attributeTrackingRows;
              if (trackingRows && trackingRows.length > 0) {
                setFormData(prev => {
                  const updatedEntries = prev.entries.map(entry => {
                    if (String(entry.itemId) === String(itemId)) {
                      return { ...entry, trackingOptions: trackingRows };
                    }
                    return entry;
                  });
                  return { ...prev, entries: updatedEntries };
                });
              }
            })
            .catch(err => console.error("Error fetching attribute tracking for hydration", err));
        });

        // 🔹 Auto-detect if TDS was Credit (subtracted) or Debit (added)
        // Re-calculate totals from raw data to check
        let calcSubtotal = 0;
        let calcGst = 0;
        let calcDiscount = 0;

        (data.entries || []).forEach((e: any) => {
          const qty = Number(e.quantity || 0);
          const rate = Number(e.rate || 0);
          const discount = Number(e.discount || 0);
          const base = qty * rate;

          // GST
          const cgst = Number(e.cgstRate || 0);
          const sgst = Number(e.sgstRate || 0);
          const igst = Number(e.igstRate || 0);
          const totalTax = cgst + sgst + igst; // assuming simple sum for estimation

          const gstAmt = (base * totalTax) / 100;

          calcSubtotal += base;
          calcGst += gstAmt;
          calcDiscount += discount;
        });

        // Backend might have saved totals, let's use them if available for better accuracy
        const sTotal = Number(data.subtotal || calcSubtotal);
        const gTotal = Number(data.cgstTotal || 0) + Number(data.sgstTotal || 0) + Number(data.igstTotal || 0); // or use calculated
        const dTotal = Number(data.discountTotal || calcDiscount);

        // This is the TDS amount saved
        const tTotal = Number(data.tdsTotal || 0);

        // Calculate expected Grand Total if Credit (Subtracted)
        const expectedTotalIfCredit = sTotal + gTotal - dTotal - tTotal;

        // actual saved total
        const actualTotal = Number(data.total || 0);

        // Check matching (allow small float diff)
        if (Math.abs(actualTotal - expectedTotalIfCredit) < 1.0) {
          setVisibleColumns(prev => ({ ...prev, enableTdsCredit: true }));
        } else {
          setVisibleColumns(prev => ({ ...prev, enableTdsCredit: false }));
        }

      })
      .catch((err) => console.error("Single voucher fetch error:", err));
  }, [id, copyId, stockItems]); // dependency on copyId added

  useEffect(() => {
    const fetchStockItems = async () => {
      try {
        if (!companyId || !ownerType || !ownerId) {
          console.error("Missing auth params for stock-items", {
            companyId,
            ownerType,
            ownerId,
          });
          setStockItems([]);
          return;
        }

        const params = new URLSearchParams({
          company_id: companyId,
          owner_type: ownerType,
          owner_id: ownerId,
        });

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/stock-items?${params.toString()}`
        );
        const data = await res.json();

        // console.log('this is data', data)

        // Accept multiple response shapes: array, { success, data }, or nested
        let items: any[] = [];
        if (Array.isArray(data)) items = data;
        else if (data && Array.isArray((data as any).data))
          items = (data as any).data;
        else {
          const arr = Object.values(data || {}).find((v) => Array.isArray(v));
          if (Array.isArray(arr)) items = arr as any[];
        }

        const formatted = (items || []).map((item: any) => ({
          ...item,
          // Normalize batches: accept stringified JSON, array of strings or objects
          batches: (() => {
            try {
              if (!item || item.batches === undefined || item.batches === null)
                return [];
              const raw =
                typeof item.batches === "string"
                  ? JSON.parse(item.batches)
                  : item.batches;
              const arr = Array.isArray(raw) ? raw : [];
              return arr.map((b: any) => {
                if (!b) return { batchName: "" };
                if (typeof b === "string") return { batchName: b };
                return {
                  ...b,
                  batchName:
                    b.batchName ??
                    b.name ??
                    b.batch_name ??
                    b.batch_no ??
                    b.batchNo ??
                    String(b.id ?? ""),
                };
              });
            } catch (e) {
              return [];
            }
          })(),
        }));

        setStockItems(formatted);
      } catch (err) {
        console.error("Stock fetch error:", err);
        setStockItems([]);
      }
    };

    fetchStockItems();
  }, []);

  useEffect(() => {
    const fetchLedgers = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        const data = await res.json();
        // console.log('led', data)
        setLedgers(deduplicateLedgers(Array.isArray(data) ? data : []));
      } catch (err) {
        console.error("Failed to fetch ledgers:", err);
      }
    };
    fetchLedgers();
  }, [companyId, ownerType, ownerId]);

  // Safe fallbacks for context data
  const safeStockItems = stockItems;
  // Purchase-specific suppliers (sundry-creditors)
  const safeLedgers = ledgers;

  const discount = safeLedgers.filter(
    (l) =>
      l.groupId === -11 &&
      String(l.name).toLowerCase().includes("discount")
  );

  // 🟢 Backend se aaye final formatted godown list

  const [godowndata, setGodownData] = useState([]);

  // Add Batch modal state
  const [addBatchModal, setAddBatchModal] = useState<{
    visible: boolean;
    index: number | null;
    itemId: string | null;
    fields: {
      batchName: string;
      batchQuantity: number;
      batchRate: number;
      batchExpiryDate: string;
      batchManufacturingDate: string;
    };
  }>({
    visible: false,
    index: null,
    itemId: null,
    fields: {
      batchName: "",
      batchQuantity: 0,
      batchRate: 0,
      batchExpiryDate: "",
      batchManufacturingDate: "",
    },
  });

  // pending batches per entry index — saved when main Save is clicked
  const [pendingBatches, setPendingBatches] = useState<Record<number, any>>({});

  useEffect(() => {
    const companyId = localStorage.getItem("company_id");
    const ownerType = localStorage.getItem("supplier");
    const ownerId = localStorage.getItem(
      ownerType === "employee" ? "employee_id" : "user_id"
    );

    if (!companyId || !ownerType || !ownerId) return;

    fetch(
      `${import.meta.env.VITE_API_URL
      }/api/godowns?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
    )
      .then((res) => res.json())
      .then((result) => {
        if (result.success && Array.isArray(result.data)) {
          setGodownData(result.data);
        } else {
          setGodownData([]);
        }
      })
      .catch(() => setGodownData([]));
  }, []);

  const safeCompanyInfo = companyInfo || {
    name: "Your Company Name",
    address: "Your Company Address",
    gstNumber: "N/A",
    phoneNumber: "N/A",
    state: "Default State",
    panNumber: "N/A",
  };

  const { selectedFinYear } = useFinancialYear();
  const { defaultDate, minDate, maxDate, isDateReadOnly } = useVoucherDateConfig(selectedFinYear);

  const [formData, setFormData] = useState<Omit<VoucherEntry, "id">>({
    date: defaultDate,
    type: "purchase",
    number: "",
    narration: "",
    referenceNo: "",
    supplierInvoiceDate: new Date().toISOString().split("T")[0],
    purchaseLedgerId: "",
    partyId: "",
    mode: "item-invoice",
    tdsLedgerId: "",
    tdsRate: 0,
    tdsAmount: 0,
    discountLedgerId: "",
    discountAmount: 0,
    dispatchDetails: { docNo: "", through: "", destination: "", approxDistance: "" },
    entries: [
      {
        id: "e1",
        itemId: "",
        quantity: 0,
        rate: 0,
        amount: 0,
        type: "debit",
        cgstRate: 0,
        sgstRate: 0,
        igstRate: 0,
        gstLedgerId: "",
        sgstLedgerId: "",
        cgstLedgerId: "",
        godownId: "",
        batchNumber: "",
        batchExpiryDate: "",
        batchManufacturingDate: "",
        batches: [],
        purchaseLedgerId: "",
      },
    ],
  });

  // ✅ Always-fresh ref to formData — prevents stale closure in async barcode lookup
  const formDataRef = useRef<any>(null);
  useEffect(() => { formDataRef.current = formData; }, [formData]);

  const purchaseLedgers = useMemo(() => {
    const activeSelectedIds = new Set(
      formData?.entries?.map((e: any) => String(e.purchaseLedgerId)).filter(Boolean) || []
    );
    if (formData?.purchaseLedgerId) activeSelectedIds.add(String(formData.purchaseLedgerId));

    return ledgers.filter((l) => {
      if (activeSelectedIds.has(String(l.id))) return true;
      const name = String(l.name || "").toLowerCase();
      const groupName = String(l.groupName || "").toLowerCase();
      return (
        name.includes("purchase") ||
        groupName.includes("purchase") ||
        Number(l.groupId) === -11
      );
    });
  }, [ledgers, formData?.entries, formData?.purchaseLedgerId]);



  const [isDuplicateVoucher, setIsDuplicateVoucher] = useState(false);

  // Check duplicate voucher number
  useEffect(() => {
    if (voucherMode === "custom" && formData.number && !isEditMode) {
      const checkDuplicate = async () => {
        try {
          const res = await fetch(
            `${import.meta.env.VITE_API_URL}/api/purchase-vouchers/check-duplicate/${formData.number}?company_id=${companyId}`
          );
          const data = await res.json();
          if (data.exists) {
            setIsDuplicateVoucher(true);
            Swal.fire({
              icon: "warning",
              title: "Duplicate Voucher Number",
              text: `Voucher number "${formData.number}" already exists. Please use a unique number.`,
              toast: true,
              position: "top-end",
              timer: 3000,
              showConfirmButton: false,
            });
          } else {
            setIsDuplicateVoucher(false);
          }
        } catch (err) {
          console.error("Duplicate check error:", err);
        }
      };
      const timer = setTimeout(checkDuplicate, 500);
      return () => clearTimeout(timer);
    } else {
      setIsDuplicateVoucher(false);
    }
  }, [formData.number, voucherMode, companyId, isEditMode]);

  useEffect(() => {
    if (voucherMode === "auto" && !isEditMode && formData.date && !formData.number) {
      const fetchNextNumber = async () => {
        try {
          const res = await fetch(
            `${import.meta.env.VITE_API_URL}/api/purchase-vouchers/next-number?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&voucherType=PRV&date=${formData.date}`
          );
          const data = await res.json();
          if (data.success) {
            setFormData((prev) => ({ ...prev, number: data.voucherNumber }));
          }
        } catch (err) {
          console.error("Next number fetch error:", err);
        }
      };
      fetchNextNumber();
    }
  }, [voucherMode, formData.date, companyId, ownerType, ownerId, isEditMode, formData.number]);

  // Draft Persistence Logic
  const DRAFT_KEY = "PURCHASE_VOUCHER_CREATE_DRAFT";

  // 1. RESTORE DRAFT ON MOUNT (First Priority)
  useEffect(() => {
    // Skip if in Edit Mode or Copy mode
    if (isEditMode || copyId) {
      setIsReadyToSave(true);
      return;
    }

    const savedDraft = localStorage.getItem(DRAFT_KEY);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        // Only restore if the draft has some data
        if (parsed.partyId || (parsed.entries && parsed.entries.some((e: any) => e.itemId))) {
          setFormData(parsed);

          const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true,
          });
          Toast.fire({
            icon: 'info',
            title: 'Draft restored'
          });
        }
      } catch (e) {
        console.error("Failed to restore purchase voucher draft:", e);
      }
    }
    // Delay setting ready to true to allow setFormData to settle
    setIsReadyToSave(true);
  }, [isEditMode]);

  // 2. SAVE DRAFT (Only after restore attempt)
  useEffect(() => {
    if (!isEditMode && isReadyToSave && formData) {
      // Check if there's actual data to save to avoid saving empty defaults
      const hasData = formData.partyId || formData.entries.some(e => e.itemId || e.quantity > 0);
      if (hasData) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
      }
    }
  }, [formData, isEditMode, isReadyToSave]);

  // 3. SYNC SUPPLIER STATE (For restored drafts or party changes)
  useEffect(() => {
    if (formData.partyId && safeLedgers.length > 0) {
      const selected = safeLedgers.find(l => String(l.id) === String(formData.partyId));
      if (selected) {
        const pState = selected.state || selected.state_name || selected.State || "";
        setSupplierState(pState);
      }
    }
  }, [formData.partyId, safeLedgers]);

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);

    setFormData({
      date: defaultDate,
      type: "purchase",
      number: formData.number, // Preserve the number
      narration: "",
      referenceNo: "",
      supplierInvoiceDate: new Date().toISOString().split("T")[0],
      purchaseLedgerId: "",
      partyId: "",
      mode: "item-invoice",
      tdsLedgerId: "",
      tdsRate: 0,
      tdsAmount: 0,
      discountLedgerId: "",
      discountAmount: 0,
      dispatchDetails: { docNo: "", through: "", destination: "", approxDistance: "" },
      entries: [
        {
          id: "e1",
          itemId: "",
          quantity: 0,
          rate: 0,
          amount: 0,
          type: "debit",
          cgstRate: 0,
          sgstRate: 0,
          igstRate: 0,
          gstLedgerId: "",
          sgstLedgerId: "",
          cgstLedgerId: "",

          godownId: "",
          batchNumber: "",
          batchExpiryDate: "",
          batchManufacturingDate: "",
          batches: [],
          purchaseLedgerId: "",
          entryDate: undefined, // ensure no stale data
          ledgerId: "",
        },
      ],
    });

    setSupplierState("");
    setIsReadyToSave(true);
    setShowTableConfig(false);

    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true,
    });
    Toast.fire({
      icon: 'success',
      title: 'Draft Cleared'
    });
  };

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showConfig, setShowConfig] = useState(false);
  const [godownEnabled, setGodownEnabled] = useState<"yes" | "no">("yes");
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      switch (e.key) {
        case "F9":
          e.preventDefault();
          // Form submission handled by form onSubmit
          break;
        case "F12":
          e.preventDefault();
          setShowConfig(true);
          break;
        case "Escape":
          e.preventDefault();
          navigate(new URLSearchParams(window.location.search).get("returnUrl") || "/app/vouchers");
          break;
      }
    },
    [navigate]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
  // Printing
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Purchase_Voucher_${formData.number}`,
    pageStyle: `
      @page {
        size: A4;
        margin: 10mm;
      }
      @media print {
        body { font-size: 12pt; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #000; padding: 5px; }
        .no-print { display: none; }
      }
    `,
  });
  if (!safeStockItems || !safeLedgers) {
    console.warn("Stock items or ledgers are undefined in AppContext");
    return (
      <div
        className={`p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
          }`}
      >
        <h1 className="text-2xl font-bold mb-4">Purchase Voucher</h1>
        <p className="text-red-500">
          Error: Stock items or ledgers are not available. Please configure them
          in the application.
        </p>
      </div>
    );
  }
  const handlePartyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === "add-new") {
      navigate("/app/masters/ledger/create"); // Redirect to ledger creation page
    } else {
      handleChange(e); // normal update
    }
  };

  const handlePurchaseLedgerChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    if (e.target.value === "add-new") {
      navigate("/app/masters/ledger/create"); // Redirect to ledger creation page
    } else {
      handleChange(e);
    }
  };
  // Debug: Check what's in the filtered ledgers for party dropdown
  // const partyLedgers = safeLedgers.filter(l => l.type && ['sundry-creditors', 'cash', 'current-assets'].includes(l.type));
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;

    // Debug: Log form changes

    if (name.startsWith("dispatchDetails.")) {
      const field = name.split(".")[1] as keyof typeof formData.dispatchDetails;
      setFormData((prev) => ({
        ...prev,
        dispatchDetails: {
          ...prev.dispatchDetails,
          docNo: prev.dispatchDetails?.docNo || "",
          through: prev.dispatchDetails?.through || "",
          destination: prev.dispatchDetails?.destination || "",
          [field]: value,
        },
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
      if (name === "mode") {
        setFormData((prev) => ({
          ...prev,
          entries: [
            {
              id: "e1",
              itemId: "",
              ledgerId: "",
              quantity: 0,
              rate: 0,
              amount: 0,
              type: value === "accounting-invoice" ? "credit" : "debit",
              cgstRate: 0,
              sgstRate: 0,
              igstRate: 0,
              godownId: "",
            },
          ],
        }));
      }
    }
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleAttributeValueChange = (itemId: string, attributeId: string, value: string) => {
    setStockItems((prevItems) =>
      prevItems.map((item) => {
        if (String(item.id) === String(itemId)) {
          const updatedAttributes = ((item as any).attributes || []).map((attr: any) => {
            if (String(attr.id) === String(attributeId)) {
              return { ...attr, value };
            }
            return attr;
          });
          return { ...item, attributes: updatedAttributes };
        }
        return item;
      })
    );
  };

  const handleAttributeValueSave = async (attributeId: string, value: string) => {
    try {
      await fetch(
        `${import.meta.env.VITE_API_URL}/api/stock-item-attributes/${attributeId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ attribute_value: value }),
        }
      );
    } catch (err) {
      console.error("Error saving attribute value:", err);
    }
  };

  const handleSubAttributeChange = (entryIndex: number, subAttrId: string, value: string) => {
    setFormData((prev) => {
      const updated = [...prev.entries];
      if (updated[entryIndex]) {
        updated[entryIndex] = {
          ...updated[entryIndex],
          sub_attributes: {
            ...updated[entryIndex].sub_attributes,
            [subAttrId]: value
          }
        };
      }
      return { ...prev, entries: updated };
    });
  };

  const [partySearchTerm, setPartySearchTerm] = useState<string>("");
  const [isPartyDropdownOpen, setIsPartyDropdownOpen] = useState<boolean>(false);
  const [partyHighlightedIndex, setPartyHighlightedIndex] = useState<number>(0);
  const partyComboboxRef = useRef<HTMLDivElement>(null);

  const selectedPartyObj = useMemo(() => {
    return partyLedgers.find((l) => String(l.id) === String(formData.partyId));
  }, [partyLedgers, formData.partyId]);

  // Sync partySearchTerm when formData.partyId changes externally (draft/edit/clear)
  useEffect(() => {
    if (selectedPartyObj) {
      setPartySearchTerm(selectedPartyObj.name);
    } else if (!formData.partyId) {
      setPartySearchTerm("");
    }
  }, [formData.partyId, selectedPartyObj]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        partyComboboxRef.current &&
        !partyComboboxRef.current.contains(event.target as Node)
      ) {
        setIsPartyDropdownOpen(false);
        if (selectedPartyObj) {
          setPartySearchTerm(selectedPartyObj.name);
        } else {
          setPartySearchTerm("");
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectedPartyObj]);

  // Dynamic filter for party ledgers
  const filteredPartyLedgers = useMemo(() => {
    if (!partySearchTerm) return partyLedgers;

    if (
      selectedPartyObj &&
      partySearchTerm.trim().toLowerCase() === selectedPartyObj.name.trim().toLowerCase()
    ) {
      return partyLedgers;
    }

    const term = partySearchTerm.toLowerCase().trim();
    return partyLedgers.filter((l) => {
      const nameMatch = l.name ? l.name.toLowerCase().includes(term) : false;
      const groupName = l.groupName || l.group_name || (l.group && l.group.name) || "";
      const groupMatch = groupName.toLowerCase().includes(term);
      const gstMatch = l.gstNumber ? l.gstNumber.toLowerCase().includes(term) : false;
      return nameMatch || groupMatch || gstMatch;
    });
  }, [partyLedgers, partySearchTerm, selectedPartyObj]);

  const handleSelectParty = (ledger: any) => {
    handlePartyChange({
      target: { name: "partyId", value: String(ledger.id) },
    } as any);
    setUnmappedPartyName(null);
    setPartySearchTerm(ledger.name);
    setIsPartyDropdownOpen(false);
  };

  const handlePartyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isPartyDropdownOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsPartyDropdownOpen(true);
        return;
      }
    }

    const totalOptions = filteredPartyLedgers.length + 1; // +1 for Add New Ledger

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPartyHighlightedIndex((prev) => (prev + 1) % totalOptions);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPartyHighlightedIndex((prev) => (prev - 1 + totalOptions) % totalOptions);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (partyHighlightedIndex >= 0 && partyHighlightedIndex < filteredPartyLedgers.length) {
        handleSelectParty(filteredPartyLedgers[partyHighlightedIndex]);
      } else if (partyHighlightedIndex === filteredPartyLedgers.length) {
        handlePartyChange({ target: { name: "partyId", value: "add-new" } } as any);
        setIsPartyDropdownOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsPartyDropdownOpen(false);
    }
  };

  const handleEntryChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const updatedEntries = [...formData.entries];
    const entry = updatedEntries[index];


    // ⭐ ITEM INVOICE MODE
    if (formData.mode === "item-invoice") {


      // 1️⃣ ITEM CHANGE → auto fill + GST resolve
      if (name === "itemId") {
        const selected = stockItems.find(
          (item) => String(item.id) === String(value)
        );

        let gst = Number(selected?.gstRate || selected?._doc?.gstRate || 0);
        if (gst === 0 && entry.purchaseLedgerId) {
          gst = extractGstPercent(getLedgerNameById(entry.purchaseLedgerId, ledgers));
        }
        if (gst === 0 && selected?.gstLedgerId) {
          const taxLedgerName = getLedgerNameById(selected.gstLedgerId, ledgers);
          gst = extractGstPercent(taxLedgerName);
        }

        const calculated = calculateEntryValues(
          0, // quantity
          Number(selected?.standardPurchaseRate ?? selected?.rate ?? 0),
          gst,
          companyState || "",
          supplierState
        );

        let gstToMatch = gst;
        const isIntra =
          !cleanState(companyState) ||
          !cleanState(supplierState) ||
          cleanState(companyState) === cleanState(supplierState);

        const matchingPurchaseLedger = purchaseLedgers.find((l) => {
          const lName = String(l.name).toLowerCase();
          const gstMatch =
            lName.includes(`${gstToMatch}%`) ||
            lName.includes(`${gstToMatch} %`) ||
            lName.includes(`purchase ${gstToMatch}`) ||
            lName.includes(`@${gstToMatch}%`) ||
            lName.includes(`@ ${gstToMatch}%`);

          if (!gstMatch) return false;

          if (isIntra) {
            return lName.includes("intra");
          } else {
            return lName.includes("inter");
          }
        });

        if (!matchingPurchaseLedger && gstToMatch > 0) {
          Swal.fire({
            title: "Purchase Ledger Missing",
            text: `Purchase ${gstToMatch}% Ledger not found. Please create it first.`,
            icon: "warning",
            confirmButtonColor: "#3085d6",
          });
        }

        let cgstLedgerId = selected?.cgstLedgerId || entry.cgstLedgerId || "";
        let sgstLedgerId = selected?.sgstLedgerId || entry.sgstLedgerId || "";
        let gstLedgerId = selected?.gstLedgerId || entry.gstLedgerId || "";

        if (calculated.cgstRate > 0 && !cgstLedgerId) {
          const matchedCgst = findTaxLedger("cgst", calculated.cgstRate, ledgers);
          if (matchedCgst) cgstLedgerId = String(matchedCgst.id);
        }
        if (calculated.sgstRate > 0 && !sgstLedgerId) {
          const matchedSgst = findTaxLedger("sgst", calculated.sgstRate, ledgers);
          if (matchedSgst) sgstLedgerId = String(matchedSgst.id);
        }
        if (calculated.igstRate > 0 && !gstLedgerId) {
          const matchedIgst = findTaxLedger("igst", calculated.igstRate, ledgers);
          if (matchedIgst) gstLedgerId = String(matchedIgst.id);
        }

        updatedEntries[index] = {
          ...entry,
          itemId: value,
          hsnCode: selected?.hsnCode || "",
          unitName: selected?.unit || "",
          gstRate: gst,

          rate: calculated.rate,
          amount: calculated.amount,
          cgstRate: calculated.cgstRate,
          sgstRate: calculated.sgstRate,
          igstRate: calculated.igstRate,

          purchaseLedgerId: matchingPurchaseLedger?.id || entry.purchaseLedgerId || "",

          // ✅ GST LEDGER IDS
          gstLedgerId,
          sgstLedgerId,
          cgstLedgerId,
          godownId: selected?.godown_id?.toString() || "",
          batches: selected?.batches || [],
          batchNumber: "",
          batchExpiryDate: "",
          batchManufacturingDate: "",
          quantity: 1, // ✅ Fixed: Set to 1 instead of 0 for 'real' feel
          tracking_id: "",
          trackingOptions: [],
          sub_attributes: {}
        };

        setFormData(prev => ({ ...prev, entries: updatedEntries }));

        if (selected?.id) {
          fetch(`${import.meta.env.VITE_API_URL}/api/stock-items/${selected.id}`)
            .then(res => res.json())
            .then(resData => {
              const trackingRows = resData?.data?.attributeTrackingRows || resData?.attributeTrackingRows;
              if (trackingRows && trackingRows.length > 0) {
                setFormData(prev => {
                  const currentEntries = [...prev.entries];
                  if (currentEntries[index] && currentEntries[index].itemId === selected.id.toString()) {
                    currentEntries[index] = {
                      ...currentEntries[index],
                      trackingOptions: trackingRows
                    };
                  }
                  return { ...prev, entries: currentEntries };
                });
              }
            })
            .catch(err => console.error("Error fetching attribute tracking", err));
        }

        return;
      }

      // 1.5️⃣ PURCHASE LEDGER CHANGE
      if (name === "purchaseLedgerId") {
        const ledgerName = getLedgerNameById(value, ledgers);
        const ledgerGst = extractGstPercent(ledgerName);
        const currentEntryWithNewLedger = { ...entry, purchaseLedgerId: value };
        const effectiveGst = ledgerGst > 0 ? ledgerGst : resolveEntryGstRate(currentEntryWithNewLedger, ledgers, stockItems);

        const qty = Number(entry.quantity || 0);
        const r = Number(entry.rate || 0);

        const calculated = calculateEntryValues(
          qty,
          r,
          effectiveGst,
          companyState || "",
          supplierState
        );

        let cgstLedgerId = entry.cgstLedgerId;
        let sgstLedgerId = entry.sgstLedgerId;
        let gstLedgerId = entry.gstLedgerId;

        if (calculated.cgstRate > 0) {
          const matchedCgst = findTaxLedger("cgst", calculated.cgstRate, ledgers);
          if (matchedCgst) cgstLedgerId = String(matchedCgst.id);
        }
        if (calculated.sgstRate > 0) {
          const matchedSgst = findTaxLedger("sgst", calculated.sgstRate, ledgers);
          if (matchedSgst) sgstLedgerId = String(matchedSgst.id);
        }
        if (calculated.igstRate > 0) {
          const matchedIgst = findTaxLedger("igst", calculated.igstRate, ledgers);
          if (matchedIgst) gstLedgerId = String(matchedIgst.id);
        }

        updatedEntries[index] = {
          ...entry,
          purchaseLedgerId: value,
          gstRate: effectiveGst,
          cgstRate: calculated.cgstRate,
          sgstRate: calculated.sgstRate,
          igstRate: calculated.igstRate,
          cgstLedgerId,
          sgstLedgerId,
          gstLedgerId,
          amount: calculated.amount,
        };

        setFormData((prev) => ({ ...prev, entries: updatedEntries }));
        return;
      }

      // 2.5️⃣ TRACKING ID CHANGE
      if (name === "tracking_id") {
        updatedEntries[index] = {
          ...entry,
          tracking_id: value,
          sub_attributes: {}
        };
        setFormData(prev => ({ ...prev, entries: updatedEntries }));
        return;
      }

      // 2️⃣ BATCH CHANGE 
      if (name === "batchNumber") {
        const selectedBatch = (entry.batches || []).find(
          (b: any) =>
            b &&
            String(
              b.batchName ??
              b.name ??
              b.batch_no ??
              b.batchNo ??
              b.id
            ) === String(value)
        );

        const availableQty = Number(
          selectedBatch?.batchQuantity ?? selectedBatch?.quantity ?? 0
        );

        updatedEntries[index] = {
          ...entry,
          batchNumber: value,
          batchBaseQuantity: availableQty,
          batchExpiryDate: selectedBatch?.expiryDate ?? selectedBatch?.batchExpiryDate ?? "",
          batchManufacturingDate: selectedBatch?.manufacturingDate ?? selectedBatch?.batchManufacturingDate ?? "",
        };
        setFormData((prev) => ({ ...prev, entries: updatedEntries }));
        return;
      }

      // 3️⃣ QUANTITY / RATE / AMOUNT CHANGE
      if (["quantity", "rate", "amount"].includes(name)) {
        if (name === "quantity") {
          const item = stockItems.find((i: any) => String(i.id) === String(entry.itemId));
          if (item) {
            const itemUnit = unitss.find((u: any) => u.symbol === item.unit || u.name === item.unit || String(u.id) === String(item.unit));
            if (itemUnit) {
              const maxDecimals = Number(itemUnit.decimalPlaces || 0);
              if (value.includes('.')) {
                if (maxDecimals === 0) {
                  Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'warning',
                    title: `Decimals not allowed for ${itemUnit.symbol}`,
                    showConfirmButton: false,
                    timer: 2000
                  });
                  return;
                }
                const decimals = value.split('.')[1] || "";
                if (decimals.length > maxDecimals) {
                  Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'warning',
                    title: `Only ${maxDecimals} decimal places allowed for ${itemUnit.symbol}`,
                    showConfirmButton: false,
                    timer: 2000
                  });
                  return;
                }
              }
            }
          }
        }
        
        const newVal = name === "quantity" && value.endsWith('.') ? value : Number(value || 0);

        // Prepare inputs for calc
        // @ts-ignore
        let newQty = name === "quantity" ? newVal : Number(entry.quantity || 0);
        let newRate = name === "rate" ? newVal : Number(entry.rate || 0);
        let newAmount = name === "amount" ? newVal : Number(entry.amount || 0);

        // Logic: if user enters amount but not rate, calculate rate
        if (name === "amount" && newQty > 0) {
          newRate = newAmount / newQty;
        }

        const currentEntryForGst = { ...entry, [name]: newVal };
        const gst = resolveEntryGstRate(currentEntryForGst, ledgers, stockItems);

        const calculated = calculateEntryValues(
          newQty,
          newRate,
          gst,
          companyState || "",
          supplierState
        );

        let cgstLedgerId = entry.cgstLedgerId;
        let sgstLedgerId = entry.sgstLedgerId;
        let gstLedgerId = entry.gstLedgerId;

        if (calculated.cgstRate > 0 && !cgstLedgerId) {
          const matchedCgst = findTaxLedger("cgst", calculated.cgstRate, ledgers);
          if (matchedCgst) cgstLedgerId = String(matchedCgst.id);
        }
        if (calculated.sgstRate > 0 && !sgstLedgerId) {
          const matchedSgst = findTaxLedger("sgst", calculated.sgstRate, ledgers);
          if (matchedSgst) sgstLedgerId = String(matchedSgst.id);
        }
        if (calculated.igstRate > 0 && !gstLedgerId) {
          const matchedIgst = findTaxLedger("igst", calculated.igstRate, ledgers);
          if (matchedIgst) gstLedgerId = String(matchedIgst.id);
        }

        updatedEntries[index] = {
          ...entry,
          quantity: newQty,
          rate: calculated.rate,
          amount: name === "amount" ? newAmount : calculated.amount,
          gstRate: gst,
          cgstRate: calculated.cgstRate,
          sgstRate: calculated.sgstRate,
          igstRate: calculated.igstRate,
          cgstLedgerId,
          sgstLedgerId,
          gstLedgerId,
        };

        setFormData((prev) => ({ ...prev, entries: updatedEntries }));
        return;
      }

      // 4️⃣ DEFAULT
      updatedEntries[index] = {
        ...entry,
        [name]: type === "number" ? Number(value) || 0 : value,
      };

      setFormData((prev) => ({ ...prev, entries: updatedEntries }));
    }

    // ⭐ ACCOUNTING MODE
    else {
      if (name === "ledgerId") {
        updatedEntries[index] = {
          ...entry,
          ledgerId: value,
          itemId: undefined,
          unitName: undefined,
          quantity: undefined,
          rate: undefined,
          cgstRate: undefined,
          sgstRate: undefined,
          igstRate: undefined,
        };
      } else if (name === "amount") {
        updatedEntries[index] = {
          ...entry,
          amount: Number(value) || 0,
        };
      } else {
        updatedEntries[index] = {
          ...entry,
          [name]: value,
        };
      }

      setFormData((prev) => ({ ...prev, entries: updatedEntries }));
    }
  };


  useEffect(() => {
    if (!supplierState) return;

    setFormData((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => {
        if (!e.itemId) return e;

        const item = safeStockItems.find(
          (i) => String(i.id) === String(e.itemId)
        );

        const gst = Number(item?.gstRate) || 0;

        return {
          ...e,
          ...resolvePurchaseGst(
            gst,
            companyState || "",
            supplierState
          ),
          amount: (() => {
            const calculated = calculateEntryValues(
              Number(e.quantity || 0),
              Number(e.rate || 0),
              gst,
              companyState || "",
              supplierState
            );
            return calculated.amount;
          })()
        };
      }),
    }));
  }, [supplierState, safeStockItems, companyState]);

  // Auto-hide batch column if no item in entries supports batches
  useEffect(() => {
    if (formData.mode !== "item-invoice") return;

    // Batch column auto-hide has been removed so user can manually control it.
  }, [formData.entries, stockItems, formData.mode]);


  const addEntry = () => {
    setFormData((prev) => {
      const newEntry = {
        id: `e${prev.entries.length + 1}`,
        itemId: "",
        ledgerId: "",
        quantity: 0,
        rate: 0,
        amount: 0,
        type: "debit",
        cgstRate: 0,
        sgstRate: 0,
        igstRate: 0,
        godownId: "",
        batchNumber: "",
        batchExpiryDate: "",
        batchManufacturingDate: "",
        batches: [],
        purchaseLedgerId: "",
      } as any;

      // In accounting mode, insert the new ledger entry just below the first entry
      if (prev.mode === "accounting-invoice") {
        return { ...prev, entries: [...prev.entries, { ...newEntry, type: "debit" }] };
      }

      return { ...prev, entries: [...prev.entries, newEntry] };
    });
  };

  useEffect(() => {
    if (isEditMode || voucherMode === "custom") return; // Skip fetching if in custom mode or edit mode

    const fetchNextVoucherNumber = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/purchase-vouchers/next-number` +
          `?company_id=${companyId}` +
          `&owner_type=${ownerType}` +
          `&owner_id=${ownerId}` +
          `&voucherType=PRV` +
          `&date=${formData.date}`
        );

        const data = await res.json();

        if (data.success && data.voucherNumber) {
          setFormData((prev) => ({
            ...prev,
            number: data.voucherNumber,
          }));
        }
      } catch (err) {
        console.error("Next voucher number error:", err);
      }
    };

    fetchNextVoucherNumber();
  }, [formData.date, voucherMode]);

  const removeEntry = (index: number) => {
    if (formData.entries.length <= 1) return;
    const updatedEntries = [...formData.entries];
    updatedEntries.splice(index, 1);
    setFormData((prev) => ({ ...prev, entries: updatedEntries }));
  };
  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.date) newErrors.date = "Date is required";
    if (!formData.number) newErrors.number = "Voucher number is required";

    // Only validate item-invoice specific fields when mode is item-invoice
    if (formData.mode === "item-invoice") {
      if (!formData.partyId) newErrors.partyId = "Party is required";
      if (!formData.referenceNo)
        newErrors.referenceNo = "Supplier Invoice number is required";
      if (!formData.supplierInvoiceDate)
        newErrors.supplierInvoiceDate = "Supplier Invoice date is required";
    }

    if (formData.mode === "item-invoice") {
      formData.entries.forEach((entry, index) => {
        if (!entry.itemId)
          newErrors[`entry${index}.itemId`] = "Item is required";

        if (!entry.purchaseLedgerId)
          newErrors[`entry${index}.purchaseLedgerId`] = "Purchase Ledger is required";

        if ((entry.quantity ?? 0) <= 0)
          newErrors[`entry${index}.quantity`] =
            "Quantity must be greater than 0";

        // Godown is now optional, so no validation here
      });
    } else {
      formData.entries.forEach((entry, index) => {
        if (!entry.ledgerId)
          newErrors[`entry${index}.ledgerId`] = "Ledger is required";
        if ((entry.amount ?? 0) <= 0)
          newErrors[`entry${index}.amount`] = "Amount must be greater than 0";
      });

      if (formData.mode === "accounting-invoice") {
        const debitTotal = formData.entries
          .filter((e) => e.type === "debit")
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);

        const creditTotal = formData.entries
          .filter((e) => e.type === "credit")
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);

        if (Math.abs(debitTotal - creditTotal) > 0.01) {
          newErrors.entries = "Debit and credit amounts must balance";
        }
      }
    }

    if (!formData.entries.length) {
      newErrors.entries = "At least one entry is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).filter((k) => newErrors[k]).length === 0;
  };


  // 📍 Intra / Inter State Check
  const isIntraState =
    !cleanState(companyState) ||
    !cleanState(supplierState) ||
    cleanState(companyState) === cleanState(supplierState);

  const calculateTotals = () => {
    if (formData.mode === "item-invoice") {
      const totals = formData.entries.reduce(
        (acc, entry) => {
          const qty = Number(entry.quantity || 0);
          const rate = Number(entry.rate || 0);
          const discount = Number(entry.discount || 0);

          const entryGstRate = resolveEntryGstRate(entry, ledgers, stockItems);

          let sgst = Number(entry.sgstRate || 0);
          let cgst = Number(entry.cgstRate || 0);
          let igst = Number(entry.igstRate || 0);

          if (isIntraState) {
            if (sgst > 14 && (cgst === sgst || cgst === 0)) {
              sgst = sgst / 2;
              cgst = sgst;
            } else if (cgst > 14 && sgst === 0) {
              cgst = cgst / 2;
              sgst = cgst;
            }
            if (sgst === 0 && cgst === 0 && entryGstRate > 0) {
              sgst = entryGstRate / 2;
              cgst = entryGstRate / 2;
            }
            igst = 0;
          } else {
            if (igst === 0 && entryGstRate > 0) {
              igst = entryGstRate;
            }
            sgst = 0;
            cgst = 0;
          }

          if (isIntraState && sgst === 0) {
            sgst = extractGstPercent(getLedgerNameById(entry.sgstLedgerId, ledgers));
          }
          if (isIntraState && cgst === 0) {
            cgst = extractGstPercent(getLedgerNameById(entry.cgstLedgerId, ledgers));
          }
          if (!isIntraState && igst === 0) {
            igst = extractGstPercent(getLedgerNameById(entry.gstLedgerId, ledgers));
          }

          const totalGstRate = isIntraState ? (sgst + cgst) : igst;

          const baseAmount = qty * rate;
          const gstAmount = (baseAmount * totalGstRate) / 100;

          return {
            subtotal: acc.subtotal + baseAmount,

            cgstTotal: acc.cgstTotal + (isIntraState ? (baseAmount * cgst) / 100 : 0),
            sgstTotal: acc.sgstTotal + (isIntraState ? (baseAmount * sgst) / 100 : 0),
            igstTotal: acc.igstTotal + (!isIntraState ? (baseAmount * igst) / 100 : 0),

            total: acc.total + baseAmount + gstAmount,
          };
        },
        {
          subtotal: 0,
          cgstTotal: 0,
          sgstTotal: 0,
          igstTotal: 0,
          total: 0,
        }
      );

      const tdsRatePercent = extractGstPercent(
        getLedgerNameById(formData.tdsLedgerId, ledgers)
      );

      const discountRatePercent = extractGstPercent(
        getLedgerNameById(formData.discountLedgerId, ledgers)
      );

      const tdsAmount = (totals.subtotal * tdsRatePercent) / 100;
      const discountAmount = Number(formData.discountAmount || 0);

      return {
        ...totals,
        gstTotal: totals.cgstTotal + totals.sgstTotal + totals.igstTotal,
        tdsAmount,
        tdsTotal: tdsAmount,
        tdsRate: tdsRatePercent,
        discountTotal: discountAmount,
        discountAmount: discountAmount,
        total: (visibleColumns.enableTdsCredit
          ? totals.total - tdsAmount
          : totals.total + tdsAmount) - discountAmount,
      };
    }
    else {
      let debitTotal = 0;
      let creditTotal = 0;
      let cgstTotal = 0;
      let sgstTotal = 0;
      let igstTotal = 0;
      let subtotal = 0;

      formData.entries.forEach((e) => {
        const amt = Number(e.amount || 0);
        if (e.type === "debit") {
          debitTotal += amt;
          const ledger = ledgers.find((l) => String(l.id) === String(e.ledgerId));
          const ledgerName = (ledger?.name || "").toLowerCase();
          const groupName = (ledger?.groupName || "").toLowerCase();

          // Identify if it's a tax ledger
          const isTax = groupName.includes("duties") || groupName.includes("tax") ||
            (ledgerName.includes("gst") && (ledgerName.includes("input") || ledgerName.includes("output") || ledgerName.includes("@")));

          if (isTax) {
            if (ledgerName.includes("cgst")) {
              cgstTotal += amt;
            } else if (ledgerName.includes("sgst")) {
              sgstTotal += amt;
            } else {
              igstTotal += amt;
            }
          } else {
            subtotal += amt;
          }
        } else {
          creditTotal += amt;
        }
      });

      const tdsRatePercent = extractGstPercent(
        getLedgerNameById(formData.tdsLedgerId, ledgers)
      );

      const discountAmount = Number(formData.discountAmount || 0);
      const tdsAmount = (subtotal * tdsRatePercent) / 100;

      return {
        debitTotal,
        creditTotal,
        total: (visibleColumns.enableTdsCredit
          ? debitTotal - tdsAmount
          : debitTotal + tdsAmount) - discountAmount,
        subtotal,
        cgstTotal,
        sgstTotal,
        igstTotal,
        gstTotal: cgstTotal + sgstTotal + igstTotal,
        discountTotal: discountAmount,
        discountAmount: discountAmount,
        tdsTotal: tdsAmount,
        tdsAmount: tdsAmount,
        tdsRate: tdsRatePercent,
      };
    }
  };

  // Update entries GST based on state
  const fixedEntries = formData.entries.map((entry) => {
    if (!entry.itemId) return entry;

    if (isIntraState) {
      // Same State → SGST + CGST only
      return {
        ...entry,
        igstRate: 0,
        gstLedgerId: "",

        // keep SGST + CGST
        sgstRate: entry.sgstRate || 0,
        cgstRate: entry.cgstRate || 0,
      };
    } else {
      // Other State → IGST only
      return {
        ...entry,
        sgstRate: 0,
        cgstRate: 0,
        sgstLedgerId: "",
        cgstLedgerId: "",

        // keep IGST
        igstRate: entry.igstRate || entry.gstRate || 0,
      };
    }
  });


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsReadyToSave(false); // Stop draft saving immediately when starting submission

    if (isDuplicateVoucher) {
      Swal.fire({
        icon: "error",
        title: "Duplicate Voucher Number",
        text: "Please use a unique voucher number before saving.",
      });
      return;
    }

    if (!validateForm()) {
      Swal.fire({
        icon: "warning",
        title: "Godown not selected",
        text: "Please select godown for all items before submitting.",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const totals = calculateTotals();

      // Extract partyId from first credit entry when in accounting mode (In Purchase, Party is Credit)
      let finalPartyId = formData.partyId;
      if (formData.mode === "accounting-invoice" && formData.entries.length > 0) {
        const firstCreditEntry = formData.entries.find(
          (e) => e.type === "credit" && e.ledgerId
        );
        finalPartyId =
          firstCreditEntry?.ledgerId || formData.entries[0]?.ledgerId || "";
      }

      // 🔥 1. Voucher payload
      const payload = {
        ...formData,
        partyId: finalPartyId,
        ...totals,
        // ✅ Map entries to include TDS Ledger ID as tdsRate (as requested by user)
        entries: formData.entries.map(e => ({
          ...e,
          tdsRate: formData.tdsLedgerId || 0
        })),
        companyId,
        ownerType,
        ownerId,
      };

      const url = isEditMode
        ? `${import.meta.env.VITE_API_URL
        }/api/purchase-vouchers/${id}?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        : `${import.meta.env.VITE_API_URL
        }/api/purchase-vouchers?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;

      const method = isEditMode ? "PUT" : "POST";

      // 🔥 2. SAVE VOUCHER FIRST
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.voucherNumber) {
        setFormData((prev) => ({
          ...prev,
          number: data.voucherNumber,
        }));
      }
      if (!res.ok) {
        Swal.fire("Error", data.message || "Voucher save failed", "error");
        return;
      }

      // ✅ CLEAR DRAFT ON SUCCESS
      if (!isEditMode) {
        localStorage.removeItem(DRAFT_KEY);
      }

      const finalVoucherNumber = data.voucherNumber || formData.number;

      // 🔥 3. NOW save Batches
      if (formData.mode === "item-invoice") {
        const patchPromises: Promise<any>[] = [];

        // Group entries by [itemId + batchNumber] to avoid duplicate PATCH calls
        const groupedEntries: Record<string, any> = {};
        formData.entries.forEach(e => {
          if (!e.itemId) return;
          const bName = (e.batchNumber && e.batchNumber.trim() !== "") ? e.batchNumber : "";
          const key = `${e.itemId}_${bName}`;
          if (!groupedEntries[key]) {
            groupedEntries[key] = { ...e, _totalQty: 0, _batchName: bName };
          }
          groupedEntries[key]._totalQty += Number(e.quantity || 0);
        });

        for (const key in groupedEntries) {
          const entry = groupedEntries[key];
          const hasExplicitBatch = entry._batchName !== "";
          const isInlineNewBatch = entry.batchMeta?.isNew === true;

          if (isInlineNewBatch) {
            // ✅ Case A: User explicitly created a new batch inline → POST it with mode=purchase
            patchPromises.push(
              fetch(`${import.meta.env.VITE_API_URL}/api/stock-items/${entry.itemId}/batches`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  batchName: entry.batchMeta.batchName,
                  batchQuantity: entry._totalQty,
                  batchRate: entry.batchMeta.rate ?? entry.rate,
                  batchExpiryDate: entry.batchMeta?.expDate || null,
                  batchManufacturingDate: entry.batchMeta?.mfgDate || null,
                  mrp: entry.batchMeta?.mrp || 0,
                  mode: "purchase",
                  company_id: companyId,
                  owner_type: ownerType,
                  owner_id: ownerId,
                }),
              }).catch(err => console.error(`⚠️ Batch creation failed:`, err))
            );
          } else if (hasExplicitBatch) {
            // ✅ Case B: Existing named batch → PATCH to update quantity
            let diffQuantity = entry._totalQty;

            if (isEditMode && originalEntries.length > 0) {
              const oldQuantity = originalEntries
                .filter(oe => String(oe.itemId) === String(entry.itemId) && (oe.batchNumber || "") === entry._batchName)
                .reduce((sum, oe) => sum + Number(oe.quantity || 0), 0);
              diffQuantity -= oldQuantity;
            }

            if (diffQuantity !== 0) {
              const patchUrl = `${import.meta.env.VITE_API_URL}/api/stock-items/${entry.itemId}/batches?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
              patchPromises.push(
                fetch(patchUrl, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    batchName: entry._batchName,
                    quantity: diffQuantity,
                    mode: "add",
                  }),
                }).catch(err => console.error(`⚠️ Stock update failed:`, err))
              );
            }
          } else {
            // ✅ Case C: No batch item → POST a new purchase batch with batchName=null
            // This creates a mode="purchase" entry in the batches array (visible in Batch Management)
            const postUrl = `${import.meta.env.VITE_API_URL}/api/stock-items/${entry.itemId}/batches`;
            patchPromises.push(
              fetch(postUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  batchName: null,          // no batch name for non-batch items
                  batchQuantity: entry._totalQty,
                  batchRate: entry.rate,
                  batchExpiryDate: null,
                  batchManufacturingDate: null,
                  mrp: 0,
                  mode: "purchase",
                  company_id: companyId,
                  owner_type: ownerType,
                  owner_id: ownerId,
                }),
              }).catch(err => console.error(`⚠️ No-batch purchase save failed:`, err))
            );
          }
        }

        // 2. Process REMOVED entries (were in original, not in form now)
        if (isEditMode && originalEntries.length > 0) {
          for (const oldEntry of originalEntries) {
            if (!oldEntry.itemId) continue;
            const bName = oldEntry.batchNumber || "";

            const stillExists = formData.entries.find(
              e => String(e.itemId) === String(oldEntry.itemId) && (e.batchNumber || "") === bName
            );

            if (!stillExists) {
              const patchUrl = `${import.meta.env.VITE_API_URL}/api/stock-items/${oldEntry.itemId}/batches?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
              patchPromises.push(
                fetch(patchUrl, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    batchName: bName,
                    quantity: -Number(oldEntry.quantity || 0),
                    mode: "add",
                  }),
                }).catch(err => console.error(`⚠️ Revert stock failed:`, err))
              );
            }
          }
        }

        await Promise.all(patchPromises);
      }

      // 🔥 4. Purchase history (updated to include auto-generated batch names)
      if (formData.mode === "item-invoice") {
        const historyData = formData.entries
          .filter((e) => e.itemId && e.quantity > 0)
          .map((e) => ({
            itemName:
              stockItems.find((i) => String(i.id) === String(e.itemId))?.name ||
              "",
            hsnCode: e.hsnCode || "",
            batchNumber: (e.batchNumber && e.batchNumber.trim() !== "") ? e.batchNumber : null,
            purchaseQuantity: Number(e.quantity),
            rate: Number(e.rate),
            purchaseDate: formData.date,

            voucherNumber: finalVoucherNumber,

            godownId: e.godownId ? Number(e.godownId) : null,
            companyId,
            ownerType,
            ownerId,
          }));


        await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/purchase-vouchers/purchase-history`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(historyData),
          }
        );
      }
      if (!isEditMode) {
        localStorage.removeItem(DRAFT_KEY);
      }

      await Swal.fire(
        "Success",
        isEditMode
          ? "Voucher updated successfully!"
          : "Voucher saved successfully!",
        "success"
      );

      navigate(new URLSearchParams(window.location.search).get("returnUrl") || "/app/vouchers");
    } catch (err) {
      console.error("Submit error:", err);
      Swal.fire("Error", "Network or server issue", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const {
    subtotal = 0,
    cgstTotal = 0,
    sgstTotal = 0,
    igstTotal = 0,
    gstTotal = 0,
    discountTotal = 0,
    tdsAmount = 0,
    tdsRate = 0,
    total = 0,
    debitTotal = 0,
    creditTotal = 0,
  } = calculateTotals();

  // Helper functions for print layout
  const getItemDetails = (itemId: string) => {
    const item = safeStockItems.find((item) => String(item.id) === String(itemId));
    if (!item) return { name: "-", hsnCode: "-", unit: "-", gstRate: 0, rate: 0, attributes: [] };
    return {
      ...item,
      attributes: (item as any).attributes || [],
    };
  };

  const getPartyName = (partyId: string) => {
    const party = safeLedgers.find((l) => String(l.id) === String(partyId));
    return party?.name || "Unknown Party";
  };

  const getPurchaseLedgerName = (purchaseLedgerId: string) => {
    const ledger = safeLedgers.find((l) => String(l.id) === String(purchaseLedgerId));
    return ledger?.name || "Unknown Purchase Ledger";
  };

  // Function to get GST rate breakdown and count for invoice
  const getGstRateInfo = () => {
    const selectedItems = formData.entries.filter(
      (entry) =>
        entry.itemId && entry.itemId !== "" && entry.itemId !== "select"
    );
    const gstRates = new Set<number>();
    const gstBreakdown: {
      [key: number]: {
        count: number;
        totalAmount: number;
        gstAmount: number;
        items: string[];
      };
    } = {};

    selectedItems.forEach((entry) => {
      const itemDetails = getItemDetails(entry.itemId || "");
      const gstRate = itemDetails.gstRate || 0;
      const baseAmount = (entry.quantity || 0) * (entry.rate || 0);
      const gstAmount = (baseAmount * gstRate) / 100;

      gstRates.add(gstRate);

      if (!gstBreakdown[gstRate]) {
        gstBreakdown[gstRate] = {
          count: 0,
          totalAmount: 0,
          gstAmount: 0,
          items: [],
        };
      }

      gstBreakdown[gstRate].count += 1;
      gstBreakdown[gstRate].totalAmount += baseAmount;
      gstBreakdown[gstRate].gstAmount += gstAmount;
      gstBreakdown[gstRate].items.push(itemDetails.name);
    });

    return {
      uniqueGstRatesCount: gstRates.size,
      gstRatesUsed: Array.from(gstRates).sort((a, b) => a - b),
      totalItems: selectedItems.length,
      breakdown: gstBreakdown,
    };
  };

  // Add Batch inline helpers
  const handleAddBatchFieldChange = (
    index: number,
    field: string,
    value: any
  ) => {
    setPendingBatches((prev) => ({
      ...prev,
      [index]: {
        ...(prev[index] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveBatch = async () => {
    const index = addBatchModal.index!;
    const entry = formData.entries[index];
    const pb = pendingBatches[index];

    if (!entry || !entry.itemId) {
      Swal.fire("Error", "Select item for the batch", "error");
      return;
    }

    if (!pb || !pb.batchName || String(pb.batchName).trim() === "") {
      Swal.fire("Error", "Batch name is required", "error");
      return;
    }

    // Validate required fields
    if (!formData.referenceNo && !formData.supplierInvoiceDate) {
      Swal.fire("Error", "Supplier invoice is required", "error");
      return;
    }

    if (!formData.partyId) {
      Swal.fire("Error", "Party name is required", "error");
      return;
    }

    if (!entry.purchaseLedgerId) {
      Swal.fire("Error", "Purchase ledger is required", "error");
      return;
    }

    if (!entry.quantity || entry.quantity <= 0) {
      Swal.fire("Error", "Quantity must be greater than 0", "error");
      return;
    }

    if (!entry.rate || entry.rate <= 0) {
      Swal.fire("Error", "Rate must be greater than 0", "error");
      return;
    }

    // Save the batch
    try {
      const url = `${import.meta.env.VITE_API_URL}/api/stock-items/${entry.itemId
        }/batches`;
      const resBatch = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchName: pb.batchName,
          batchQuantity: pb.batchQuantity ?? 0,
          batchRate: pb.batchRate ?? 0,
          batchExpiryDate: pb.batchExpiryDate || null,
          batchManufacturingDate: pb.batchManufacturingDate || null,
          company_id: companyId,
          owner_type: ownerType,
          owner_id: ownerId,
        }),
      });

      const batchData = await resBatch.json();
      if (!resBatch.ok) {
        Swal.fire(
          "Error",
          batchData.message || "Failed to save batch",
          "error"
        );
        return;
      }

      // Append returned batch to stockItems
      setStockItems((prev) =>
        prev.map((it) => {
          if (String(it.id) === String(entry.itemId)) {
            const newBatches = Array.isArray(it.batches)
              ? [...it.batches, batchData.batch]
              : [batchData.batch];
            return { ...it, batches: newBatches } as any;
          }
          return it;
        })
      );

      // Update form entry to select new batch and set meta
      setFormData((prev) => {
        const updated: any = { ...prev };
        const entries = [...updated.entries];
        const ent = { ...entries[index] } as any;
        ent.batches = ent.batches
          ? [...ent.batches, batchData.batch]
          : [batchData.batch];
        ent.batchNumber = batchData.batch.batchName;
        ent.batchExpiryDate = batchData.batch.batchExpiryDate || "";
        ent.batchManufacturingDate =
          batchData.batch.batchManufacturingDate || "";
        ent.rate =
          ent.rate || Number(batchData.batch.batchRate ?? pb.batchRate ?? 0);
        entries[index] = ent;
        updated.entries = entries;
        return updated;
      });

      // Clear pending batch and close modal
      setPendingBatches((prev) => {
        const newPending = { ...prev };
        delete newPending[index];
        return newPending;
      });

      setAddBatchModal({
        visible: false,
        index: null,
        itemId: null,
        fields: {
          batchName: "",
          batchQuantity: 0,
          batchRate: 0,
          batchExpiryDate: "",
          batchManufacturingDate: "",
        },
      });

      Swal.fire("Success", "Batch saved successfully", "success");
    } catch (error) {
      console.error("Save batch error:", error);
      Swal.fire("Error", "Failed to save batch", "error");
    }
  };

  const applyNewBatchToRow = (index: number) => {
    const pb = pendingBatches[index];

    if (!pb || !pb.batchName || pb.batchName.trim() === "") {
      Swal.fire("Error", "Batch name is required", "error");
      return;
    }

    setFormData((prev) => {
      const entries = [...prev.entries];
      const entry = entries[index];
      if (!entry) return prev;

      const qty = pb.batchQuantity ?? entry.quantity ?? 0;
      const rate = pb.batchRate ?? entry.rate ?? 0;

      // 🔒 prevent duplicate batch name in same row
      const alreadyExists = (entry.batches || []).some(
        (b: any) => b.batchName === pb.batchName
      );

      const tempBatch = {
        batchName: pb.batchName,
        batchQuantity: qty,
        batchRate: rate,
        batchMrp: pb.batchMrp,
        batchManufacturingDate: pb.batchManufacturingDate || null,
        batchExpiryDate: pb.batchExpiryDate || null,
        mode: "purchase", // ✅ HARD CODED
      };

      entries[index] = {
        ...entry,

        // ✅ select batch in dropdown
        batchNumber: pb.batchName,

        // ✅ autofill row fields
        quantity: qty,
        rate: rate,

        // ✅ dropdown options (TEMP – UI only)
        batches: alreadyExists
          ? entry.batches
          : [...(entry.batches || []), tempBatch],

        // ✅ hidden meta (FINAL SAVE pe kaam aayega)
        batchMeta: {
          batchName: pb.batchName,
          quantity: qty,
          rate: rate,
          mrp: pb.batchMrp,
          mfgDate: pb.batchManufacturingDate || null,
          expDate: pb.batchExpiryDate || null,
          mode: "purchase", // ✅ HARD CODED
          isNew: true, // 🔥 IMPORTANT FLAG
        },
      };

      return { ...prev, entries };
    });

    // ✅ close modal
    setAddBatchModal({
      visible: false,
      index: null,
      itemId: null,
      fields: {
        batchName: "",
        batchQuantity: 0,
        batchRate: 0,
        batchMrp: 0,
        batchExpiryDate: "",
        batchManufacturingDate: "",
        mode: "purchase", // ✅ HARD CODED
      },
    });

    setPendingBatches((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
  };

  // 🔹 Fetch units from backend
  const [unitss, setUnits] = useState([]);
  useEffect(() => {
    const fetchUnits = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/stock-units?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        const data = await res.json();
        setUnits(data);
      } catch (error) {
        console.error("Failed to fetch units:", error);
      }
    };

    fetchUnits();
  }, []);

  //get Unit Name
  const getUnitName = (unitId: any) => {
    if (!unitId) return "-";

    const unit = unitss.find((u: any) => String(u.id) === String(unitId));

    return unit?.name || "-";
  };

  // 🔹 Selected Party Ledger (Party Name ke liye)
  const selectedPartyLedger = safeLedgers.find(
    (l) => String(l.id) === String(formData.partyId)
  );

  // 🔹 Party State
  const partyState = selectedPartyLedger?.state || selectedPartyLedger?.state_name || selectedPartyLedger?.State || "";

  useEffect(() => {
    if (!formData.partyId) {
      setSupplierState("");
      return;
    }

    const supplier = safeLedgers.find(
      (l) => String(l.id) === String(formData.partyId)
    );

    const state =
      supplier?.state ||
      supplier?.state_name ||
      supplier?.State ||
      "";

    setSupplierState(state);
  }, [formData.partyId, safeLedgers]);






  // 🔹 GST Charge Type
  const isRegularCharge =
    selectedPartyLedger?.gstNumber &&
    String(selectedPartyLedger.gstNumber).trim() !== "";





  // 🔹 Intra / Inter State Check
  // Note: isIntraState is now defined above calculateTotals to avoid ReferenceError

  // ✅ Same as SalesVoucher: auto-show Batch column only when at least one item has batches
  const hasAnyBatch = formData.entries?.some((entry) => {
    if (!entry.itemId) return false;
    const item = stockItems.find((s) => String(s.id) === String(entry.itemId));
    // Show batch column if item has enableBatchTracking OR already has batches in the entry
    return (
      (item as any)?.tracking_type === "batch" ||
      (entry.batches && entry.batches.some((b: any) => b?.batchName))
    );
  });

  const hasAnyAttribute = formData.entries?.some((entry) => {
    if (!entry.itemId) return false;
    const item = stockItems.find((s) => String(s.id) === String(entry.itemId));
    return (
      (item as any)?.tracking_type === "attribute" ||
      (entry.trackingOptions && entry.trackingOptions.length > 0)
    );
  });



  return (
    <div className="pt-[56px] px-4">
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate(new URLSearchParams(window.location.search).get("returnUrl") || "/app/vouchers")}
          className="mr-4 p-2 rounded-full"
        >
          <ArrowLeft size={20} />
        </button>

        <h1 className="text-2xl font-bold">Purchase Voucher</h1>

        <div className="ml-auto flex items-center gap-3">
          <select
            value={voucherMode}
            onChange={(e) => {
              const newMode = e.target.value as "auto" | "custom";
              setVoucherMode(newMode);
              if (newMode === "custom") {
                setFormData((prev) => ({ ...prev, number: "" }));
              }
            }}
            className={`${getSelectClasses(theme)} min-w-[150px] text-sm font-semibold border-2 border-blue-100 dark:border-blue-900 focus:border-blue-500`}
          >
            <option value="auto">Auto Numbering</option>
            <option value="custom">Custom Number</option>
          </select>

          {/* ⚙ SETTINGS BUTTON */}
          <button
            type="button"
            onClick={() => setShowTableConfig(!showTableConfig)}
            className="p-2 rounded-full hover:bg-gray-200"
            title="Table Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>
      {showTableConfig && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]"
          onClick={() => setShowTableConfig(false)} // outside click close
        >
          <div
            className={`p-6 rounded-lg w-[350px] ${theme === "dark" ? "bg-gray-800 text-white" : "bg-white"
              } shadow-xl`}
            onClick={(e) => e.stopPropagation()} // stop outside close
          >
            <h3 className="text-lg font-semibold mb-4">Table Settings</h3>

            {[
              { key: "attribute", label: "Show Attribute Column" },
              { key: "hsn", label: "Show HSN Column" },
              { key: "batch", label: "Show Batch Column" },
              { key: "gst", label: "Show GST Column" },
              { key: "godown", label: "Show Godown Column" },
              { key: "tds", label: "Show TDS Row" },
            ].map(({ key, label }) => (
              <label
                key={key}
                className="flex justify-between items-center mb-3 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              >
                <span className="text-sm font-medium">{label}</span>
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  checked={visibleColumns[key]}
                  onChange={() =>
                    setVisibleColumns((prev) => ({
                      ...prev,
                      [key]: !prev[key],
                    }))
                  }
                />
              </label>
            ))}

            <label className="flex justify-between items-center mb-3 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors border-t border-gray-200 dark:border-gray-600 mt-2 pt-4">
              <span className="text-sm font-semibold">Enable Receipt & Shipping Details</span>
              <input
                type="checkbox"
                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                checked={visibleColumns.showReceiptDetails}
                onChange={() =>
                  setVisibleColumns((prev) => ({
                    ...prev,
                    showReceiptDetails: !prev.showReceiptDetails,
                  }))
                }
              />
            </label>

            <label className="flex justify-between items-center mb-3 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors">
              <span className="text-sm font-semibold">Enable TDS Credit</span>
              <input
                type="checkbox"
                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                checked={visibleColumns.enableTdsCredit}
                onChange={() =>
                  setVisibleColumns((prev) => ({
                    ...prev,
                    enableTdsCredit: !prev.enableTdsCredit,
                  }))
                }
              />
            </label>

            {localStorage.getItem(DRAFT_KEY) && (
              <div className="border-t border-gray-200 dark:border-gray-600 mt-2 pt-2">
                <button
                  type="button"
                  onClick={clearDraft}
                  className="w-full flex items-center justify-between p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                >
                  <span className="text-sm font-semibold">Clear Saved Draft</span>
                  <Trash2 size={16} />
                </button>
              </div>
            )}

            <div className="flex justify-end mt-5">
              <button
                onClick={() => setShowTableConfig(false)}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-lg transition-all"
              >
                Close Settings
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        className={`p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
          }`}
      >
        <form onSubmit={handleSubmit}>
          {/* Header Form Fields - Properly Organized in 4-Column Grid */}
          <div className={`p-5 mb-8 rounded-xl border ${theme === "dark" ? "bg-gray-800/50 border-gray-700" : "bg-gray-50/50 border-gray-200"} space-y-6 shadow-sm`}>
            {/* Row 1: Primary Details */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-60" htmlFor="date">
                  Voucher Date
                </label>
                <input
                  type="date"
                  id="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  required
                  max={maxDate}
                  min={minDate}
                  readOnly={isDateReadOnly}
                  className={`${getInputClasses(theme, !!errors.date)} ${isDateReadOnly ? 'bg-gray-100 cursor-not-allowed opacity-75' : ''}`}
                />
                {errors.date && (
                  <p className="text-red-500 text-xs mt-1">{errors.date}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-60" htmlFor="number">
                  Voucher No.
                </label>
                <input
                  type="text"
                  id="number"
                  name="number"
                  value={formData.number}
                  onChange={handleChange}
                  readOnly={voucherMode === "auto"}
                  placeholder={voucherMode === "auto" ? "Auto-Generated" : "Enter Number"}
                  className={`${getInputClasses(theme, !!errors.number || isDuplicateVoucher)} ${voucherMode === "auto" ? "opacity-70 cursor-not-allowed" : ""
                    } ${isDuplicateVoucher ? "border-red-500 text-red-500" : ""} font-mono font-bold`}
                />
                {isDuplicateVoucher && (
                  <p className="text-red-500 text-[10px] font-bold mt-1 animate-pulse">
                    ⚠️ DUPLICATE VOUCHER NUMBER
                  </p>
                )}
                {errors.number && !isDuplicateVoucher && (
                  <p className="text-red-500 text-xs mt-1">{errors.number}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-60" htmlFor="referenceNo">
                  Supplier Invoice #
                </label>
                <input
                  type="text"
                  id="referenceNo"
                  name="referenceNo"
                  value={formData.referenceNo}
                  onChange={handleChange}
                  required
                  placeholder="Invoice Number"
                  className={getInputClasses(theme, !!errors.referenceNo)}
                />
                {errors.referenceNo && (
                  <p className="text-red-500 text-xs mt-1">{errors.referenceNo}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-60" htmlFor="supplierInvoiceDate">
                  Invoice Date
                </label>
                <input
                  type="date"
                  id="supplierInvoiceDate"
                  name="supplierInvoiceDate"
                  value={formData.supplierInvoiceDate}
                  onChange={handleChange}
                  required
                  className={getInputClasses(theme, !!errors.supplierInvoiceDate)}
                />
                {errors.supplierInvoiceDate && (
                  <p className="text-red-500 text-xs mt-1">{errors.supplierInvoiceDate}</p>
                )}
              </div>
            </div>

            {/* Row 2: Party & Selection */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              {formData.mode !== "accounting-invoice" && (
                <div ref={partyComboboxRef} className="relative md:col-span-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-60" htmlFor="partyId">
                    Party / Supplier Name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      id="partyId"
                      name="partyIdInput"
                      autoComplete="off"
                      value={partySearchTerm}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPartySearchTerm(val);
                        setIsPartyDropdownOpen(true);
                        setPartyHighlightedIndex(0);
                        if (!val) {
                          handlePartyChange({
                            target: { name: "partyId", value: "" },
                          } as any);
                          setUnmappedPartyName(null);
                        }
                      }}
                      onFocus={() => setIsPartyDropdownOpen(true)}
                      onClick={() => setIsPartyDropdownOpen(true)}
                      onKeyDown={handlePartyKeyDown}
                      placeholder="-- Select or Search Party --"
                      className={`${getInputClasses(theme, !!errors.partyId)} font-semibold pr-14`}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-gray-400">
                      {partySearchTerm && (
                        <button
                          type="button"
                          onClick={() => {
                            setPartySearchTerm("");
                            handlePartyChange({
                              target: { name: "partyId", value: "" },
                            } as any);
                            setUnmappedPartyName(null);
                            setIsPartyDropdownOpen(true);
                          }}
                          className="p-1 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                          title="Clear"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsPartyDropdownOpen(!isPartyDropdownOpen)}
                        className="p-1 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                        title="Toggle Dropdown"
                      >
                        <ChevronDown
                          className={`w-4 h-4 transition-transform duration-200 ${
                            isPartyDropdownOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Dropdown Menu */}
                  {isPartyDropdownOpen && (
                    <div
                      className={`absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border shadow-lg ${
                        theme === "dark"
                          ? "bg-gray-800 border-gray-700 text-gray-100"
                          : "bg-white border-gray-200 text-gray-800"
                      }`}
                    >
                      {filteredPartyLedgers.length === 0 ? (
                        <div className="p-3 text-sm opacity-60 text-center">
                          No matching party ledgers found
                        </div>
                      ) : (
                        filteredPartyLedgers.map((ledger, index) => {
                          const isSelected = String(ledger.id) === String(formData.partyId);
                          const isHighlighted = index === partyHighlightedIndex;
                          const groupName =
                            ledger.groupName ||
                            ledger.group_name ||
                            (ledger.group && ledger.group.name);

                          return (
                            <div
                              key={ledger.id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectParty(ledger);
                              }}
                              onMouseEnter={() => setPartyHighlightedIndex(index)}
                              className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between transition-colors ${
                                isSelected
                                  ? theme === "dark"
                                    ? "bg-blue-950/60 text-blue-400 font-semibold"
                                    : "bg-blue-50 text-blue-700 font-semibold"
                                  : isHighlighted
                                  ? theme === "dark"
                                    ? "bg-gray-700 text-white"
                                    : "bg-gray-100 text-gray-900"
                                  : ""
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">{ledger.name}</span>
                                <div className="flex items-center gap-2 text-[11px] opacity-60">
                                  {groupName && <span>{groupName}</span>}
                                  {ledger.gstNumber && <span>• GST: {ledger.gstNumber}</span>}
                                </div>
                              </div>
                              {isSelected && (
                                <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">
                                  Selected
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}

                      {/* + Create New Ledger */}
                      <div
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handlePartyChange({
                            target: { name: "partyId", value: "add-new" },
                          } as any);
                          setIsPartyDropdownOpen(false);
                        }}
                        onMouseEnter={() => setPartyHighlightedIndex(filteredPartyLedgers.length)}
                        className={`px-3 py-2 text-sm cursor-pointer font-bold border-t flex items-center gap-1.5 ${
                          theme === "dark"
                            ? "border-gray-700 text-blue-400 hover:bg-gray-700"
                            : "border-gray-100 text-blue-600 hover:bg-blue-50"
                        } ${
                          partyHighlightedIndex === filteredPartyLedgers.length
                            ? theme === "dark"
                              ? "bg-gray-700"
                              : "bg-blue-50"
                            : ""
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ Create New Ledger</span>
                      </div>
                    </div>
                  )}

                  {unmappedPartyName && (
                    <div className="mt-1 text-xs text-orange-600 font-medium">
                      Extracted Party: <b>{unmappedPartyName}</b> (Not found in masters)
                    </div>
                  )}
                  {selectedPartyLedger && (() => {
                    const partyState = selectedPartyLedger.state || selectedPartyLedger.state_name || selectedPartyLedger.State || "N/A";
                    return (
                      <div className={`mt-1.5 text-[10px] font-bold flex items-center gap-1.5 px-2 py-0.5 rounded-full w-fit ${isRegularCharge ? "bg-green-100 text-green-700 dark:bg-green-900/30" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isRegularCharge ? "bg-green-600" : "bg-orange-600 animate-pulse"}`}></span>
                        {isRegularCharge ? `REGULAR | GSTIN: ${selectedPartyLedger.gstNumber || "N/A"} | ${partyState}` : `REVERSE CHARGE | ${partyState}`}
                      </div>
                    );
                  })()}
                  {errors.partyId && <p className="text-red-500 text-xs mt-1">{errors.partyId}</p>}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-60">
                  Transaction Mode
                </label>
                <select
                  name="mode"
                  value={formData.mode}
                  onChange={handleChange}
                  className={getSelectClasses(theme)}
                >
                  <option value="item-invoice">Item Invoice</option>
                  <option value="accounting-invoice">Accounting Invoice</option>
                </select>
              </div>

              {formData.mode === "item-invoice" && visibleColumns.godown && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-60">
                    Godown Tracking
                  </label>
                  <select
                    value={godownEnabled}
                    onChange={(e) => setGodownEnabled(e.target.value as "yes" | "no")}
                    className={getSelectClasses(theme)}
                  >
                    <option value="yes">Enabled (Yes)</option>
                    <option value="no">Disabled (No)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Row 3: Receipt Details (Conditional with animation) */}
            {visibleColumns.showReceiptDetails && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-dashed border-gray-300 dark:border-gray-700 animate-in fade-in slide-in-from-top-1">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-60">
                    Receipt Doc No.
                  </label>
                  <input
                    type="text"
                    name="dispatchDetails.docNo"
                    value={formData.dispatchDetails?.docNo ?? ""}
                    onChange={handleChange}
                    placeholder="Doc Reference"
                    className={getInputClasses(theme)}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-60">
                    Receipt Through
                  </label>
                  <input
                    type="text"
                    name="dispatchDetails.through"
                    value={formData.dispatchDetails?.through ?? ""}
                    onChange={handleChange}
                    placeholder="E.g. Transport Name"
                    className={getInputClasses(theme)}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 opacity-60">
                    Origin / Source
                  </label>
                  <input
                    type="text"
                    name="dispatchDetails.destination"
                    value={formData.dispatchDetails?.destination ?? ""}
                    onChange={handleChange}
                    placeholder="Place of Origin"
                    className={getInputClasses(theme)}
                  />
                </div>
              </div>
            )}
          </div>

          <div
            className={`p-4 mb-6 rounded ${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
              }`}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">
                {formData.mode === "item-invoice" ? "Items" : "Ledger Entries"}
              </h3>
              <button
                title="Add Entry"
                type="button"
                onClick={addEntry}
                className={`flex items-center text-sm px-2 py-1 rounded ${theme === "dark"
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
              >
                <Plus size={16} className="mr-1" />
                Add {formData.mode === "item-invoice" ? "Item" : "Ledger"}
              </button>
            </div>

            {/* Barcode Input Section */}
            {formData.mode === "item-invoice" && (
              <div className="mb-4 flex gap-2 items-center">
                <form onSubmit={handleBarcodeSubmit} className="relative group max-w-md flex-1">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2z"></path><path d="M7 7h1v10H7z"></path><path d="M10 7h2v10h-2z"></path><path d="M15 7h1v10h-1z"></path><path d="M18 7h1v10h-1z"></path></svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Scan Barcode or Type & Press Enter..."
                    value={barcodeInput}
                    onChange={(e) => {
                      setBarcodeInput(e.target.value);
                      setIsBarcodeError(false);
                    }}
                    className={`w-full pl-10 pr-4 py-2 rounded-lg border-2 transition-all outline-none ${isBarcodeError
                      ? "border-red-500 bg-red-50"
                      : theme === "dark"
                        ? "bg-gray-800 border-gray-700 focus:border-blue-500 text-white"
                        : "bg-white border-gray-200 focus:border-blue-500"
                      }`}
                  />
                </form>
                <div className="flex items-center">
                  <input type="file" id="bill-upload" className="hidden" accept="image/*,application/pdf" onChange={handleBillUpload} disabled={isExtracting} />
                  <label htmlFor="bill-upload" className={`cursor-pointer px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${isExtracting ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'} text-white`}>
                    <Upload size={18} /> {isExtracting ? 'Processing...' : 'Upload Bill'}
                  </label>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              {" "}
              {formData.mode === "item-invoice" ? (
                <table className="w-full mb-4">
                  <thead>
                    <tr
                      className={`${theme === "dark"
                        ? "border-b border-gray-600"
                        : "border-b border-gray-300"
                        }`}
                    >
                      <th className={TABLE_STYLES.headerCenter}>Sr No</th>
                      <th className={TABLE_STYLES.header}>Item</th>
                      {visibleColumns.hsn && <th>HSN/SAC</th>}

                      {/* Batch column */}
                      {visibleColumns.batch && hasAnyBatch && (
                        <th className={TABLE_STYLES.header}>Batch</th>
                      )}

                      {/* Attribute Column */}
                      {visibleColumns.attribute && hasAnyAttribute && (
                        <th className={TABLE_STYLES.header}>Attribute</th>
                      )}

                      <th className={TABLE_STYLES.headerRight}>Quantity</th>

                      <th className={TABLE_STYLES.header}>Unit</th>
                      <th className={TABLE_STYLES.headerRight}>Rate</th>

                      {/* GST Header */}
                      {visibleColumns.gst && isIntraState && (
                        <>
                          <th className={TABLE_STYLES.headerRight}>SGST</th>
                          <th className={TABLE_STYLES.headerRight}>CGST</th>
                        </>
                      )}

                      {visibleColumns.gst && !isIntraState && (
                        <th className={TABLE_STYLES.headerRight}>IGST</th>
                      )}

                      <th className={TABLE_STYLES.headerRight}>Taxable </th>
                      {godownEnabled === "yes" && visibleColumns.godown && (
                        <th className={TABLE_STYLES.header}>Godown</th>
                      )}
                      <th className={TABLE_STYLES.header}>Purchase Ledger</th>
                      <th className={TABLE_STYLES.headerCenter}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.entries.map((entry, index) => {
                      const itemDetails = getItemDetails(entry.itemId || "");
                      const isAddingBatch =
                        addBatchModal.visible && addBatchModal.index === index;

                      return (
                        <tr
                          key={entry.id}
                          className={`${theme === "dark"
                            ? "border-b border-gray-600"
                            : "border-b border-gray-300"
                            }`}
                        >
                          {/* SR */}
                          <td className="px-1 py-2 text-center min-w-[28px] text-xs font-semibold align-top">
                            {index + 1}
                          </td>

                          {/* ITEM */}
                          <td className="px-1 py-2 min-w-[110px] align-top">
                            <div
                              onClick={() =>
                                setItemSelectionModal({ isOpen: true, index })
                              }
                              className={`${TABLE_STYLES.select} text-xs min-w-[110px] cursor-pointer flex items-center min-h-[28px] overflow-hidden whitespace-nowrap`}
                              title={
                                entry.itemId
                                  ? stockItems.find(
                                      (i) =>
                                        String(i.id) === String(entry.itemId)
                                    )?.name || "Item"
                                  : "Item"
                              }
                            >
                              {entry.itemId ? (
                                stockItems.find(
                                  (i) => String(i.id) === String(entry.itemId)
                                )?.name || "Item"
                              ) : (
                                <span className="text-gray-400">
                                  Item
                                </span>
                              )}
                            </div>
                          </td>

                          {/* HSN */}
                          {visibleColumns.hsn && (
                            <td className="px-1 py-2 min-w-[55px] text-center text-xs align-top">
                              <input
                                type="text"
                                name="hsnCode"
                                value={entry.hsnCode || ""}
                                onChange={(e) => handleEntryChange(index, e)}
                                className={`${TABLE_STYLES.input} text-center text-xs`}
                                placeholder="HSN"
                              />
                            </td>
                          )}

                          {/* BATCH */}
                          {visibleColumns.batch && hasAnyBatch && (
                            <td className="px-1 py-2 min-w-[140px] align-top">
                              {itemDetails.tracking_type === "batch" ? (
                                <div className="flex items-center gap-2 w-full">
                                  <select
                                name="batchNumber"
                                value={entry.batchNumber || ""}
                                onChange={(e) => {
                                  if (e.target.value === "__add_new__") {
                                    if (!entry.itemId) {
                                      Swal.fire(
                                        "Select item",
                                        "Please select an item before adding a batch",
                                        "warning"
                                      );
                                      return;
                                    }

                                    setAddBatchModal({
                                      visible: true,
                                      index,
                                      itemId: entry.itemId,
                                      fields: {
                                        batchName: "",
                                        batchQuantity: 0,
                                        batchRate: entry.rate ?? 0,
                                        batchMrp: 0,
                                        batchExpiryDate: "",
                                        batchManufacturingDate: "",
                                      },
                                    });

                                    setPendingBatches((prev) => ({
                                      ...prev,
                                      [index]: {
                                        batchName: "",
                                        batchQuantity: 0,
                                        batchRate: entry.rate ?? 0,
                                        batchMrp: 0,
                                        batchExpiryDate: "",
                                        batchManufacturingDate: "",
                                      },
                                    }));

                                    return;
                                  }

                                  handleEntryChange(index, e);
                                }}
                                className={`${TABLE_STYLES.select} min-w-[120px] text-xs`}
                              >
                                <option value="">Batch</option>

                                {/* 👇 Existing batches (agar ho to) */}
                                {(entry.batches || []).map((batch, i) => {
                                  const qty = Number(
                                    batch.batchQuantity ?? batch.quantity ?? 0
                                  );

                                  return (
                                    <option key={i} value={batch.batchName}>
                                      {`${batch.batchName} — Qty: ${qty}`}
                                    </option>
                                  );
                                })}

                                {/* 👇 ALWAYS SHOW ADD BUTTON */}
                                <option
                                  value="__add_new__"
                                  className="font-semibold bg-blue-300"
                                >
                                  + Add New Batch
                                </option>
                              </select>

                              {addBatchModal.visible && (
                                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[300]">
                                  <div className="w-[420px] rounded-lg bg-white shadow-xl p-5">
                                    <h3 className="text-lg font-semibold mb-4">
                                      Add New Batch
                                    </h3>

                                    <div className="space-y-3 text-sm">
                                      <div>
                                        <label className="block font-medium">
                                          Batch
                                        </label>
                                        <input
                                          className="w-full border rounded p-2"
                                          value={
                                            pendingBatches[addBatchModal.index!]
                                              ?.batchName || ""
                                          }
                                          onChange={(e) =>
                                            handleAddBatchFieldChange(
                                              addBatchModal.index!,
                                              "batchName",
                                              e.target.value
                                            )
                                          }
                                        />
                                      </div>

                                      <div className="grid grid-cols-3 gap-3">
                                        <div>
                                          <label className="block font-medium">
                                            Quantity
                                          </label>
                                          <input
                                            type="number"
                                            className="w-full border rounded p-2"
                                            value={
                                              pendingBatches[
                                                addBatchModal.index!
                                              ]?.batchQuantity || 0
                                            }
                                            onChange={(e) =>
                                              handleAddBatchFieldChange(
                                                addBatchModal.index!,
                                                "batchQuantity",
                                                Number(e.target.value)
                                              )
                                            }
                                          />
                                        </div>

                                        <div>
                                          <label className="block font-medium">
                                            Rate
                                          </label>
                                          <input
                                            type="number"
                                            className="w-full border rounded p-2"
                                            value={
                                              pendingBatches[
                                                addBatchModal.index!
                                              ]?.batchRate || 0
                                            }
                                            onChange={(e) =>
                                              handleAddBatchFieldChange(
                                                addBatchModal.index!,
                                                "batchRate",
                                                Number(e.target.value)
                                              )
                                            }
                                          />
                                        </div>

                                        <div>
                                          <label className="block font-medium">
                                            MRP
                                          </label>
                                          <input
                                            type="number"
                                            className="w-full border rounded p-2"
                                            value={
                                              pendingBatches[
                                                addBatchModal.index!
                                              ]?.batchMrp || 0
                                            }
                                            onChange={(e) =>
                                              handleAddBatchFieldChange(
                                                addBatchModal.index!,
                                                "batchMrp",
                                                Number(e.target.value)
                                              )
                                            }
                                          />
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <label className="block font-medium">
                                            MFG Date
                                          </label>
                                          <input
                                            type="date"
                                            className="w-full border rounded p-2"
                                            value={
                                              pendingBatches[
                                                addBatchModal.index!
                                              ]?.batchManufacturingDate || ""
                                            }
                                            onChange={(e) =>
                                              handleAddBatchFieldChange(
                                                addBatchModal.index!,
                                                "batchManufacturingDate",
                                                e.target.value
                                              )
                                            }
                                          />
                                        </div>

                                        <div>
                                          <label className="block font-medium">
                                            Expiry Date
                                          </label>
                                          <input
                                            type="date"
                                            className="w-full border rounded p-2"
                                            value={
                                              pendingBatches[
                                                addBatchModal.index!
                                              ]?.batchExpiryDate || ""
                                            }
                                            onChange={(e) =>
                                              handleAddBatchFieldChange(
                                                addBatchModal.index!,
                                                "batchExpiryDate",
                                                e.target.value
                                              )
                                            }
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex justify-end gap-3 mt-5">
                                      <button
                                        onClick={() => {
                                          setAddBatchModal({
                                            visible: false,
                                            index: null,
                                            itemId: null,
                                            fields: {
                                              batchName: "",
                                              batchQuantity: 0,
                                              batchRate: 0,
                                              batchExpiryDate: "",
                                              batchManufacturingDate: "",
                                            },
                                          });
                                          setPendingBatches((prev) => {
                                            const newPending = { ...prev };
                                            delete newPending[
                                              addBatchModal.index!
                                            ];
                                            return newPending;
                                          });
                                        }}
                                        className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                                      >
                                        Cancel
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          applyNewBatchToRow(
                                            addBatchModal.index!
                                          )
                                        }
                                        className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                                      >
                                        Add Batch
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                                </div>
                              ) : null}
                            </td>
                          )}

                          {/* ATTRIBUTE COLUMN */}
                          {visibleColumns.attribute && hasAnyAttribute && (
                            <td className="px-1 py-2 min-w-[140px] align-top relative">
                              {itemDetails.tracking_type === "attribute" ? (
                                <div className="w-full space-y-2">
                                <select
                                  name="tracking_id"
                                  value={entry.tracking_id || ""}
                                  onChange={(e) => {
                                    if (e.target.value === "__add_new__") {
                                      setModalFormData({
                                        stock_item_id: String(entry.itemId),
                                        primary_attribute_id: "",
                                        primary_attribute_value: "",
                                        sub_attributes: [],
                                        sub_attribute_values: {},
                                        quantity: Number(entry.quantity) || 0,
                                        rate: Number(entry.rate) || 0,
                                        total_value: (Number(entry.quantity) || 0) * (Number(entry.rate) || 0),
                                        entryIndex: index
                                      });
                                      setShowAttributeModal(true);
                                      return;
                                    }
                                    handleEntryChange(index, e);
                                  }}
                                  className={`${TABLE_STYLES.select} text-xs`}
                                >
                                  <option value="">Select Attribute</option>
                                  <option value="__add_new__" className="text-blue-500 font-medium">
                                    + Add Attribute
                                  </option>
                                  {(entry.trackingOptions || []).map((opt: any) => (
                                    <option key={opt.id} value={opt.id}>
                                      {opt.primaryAttributeValue} (Qty: {opt.quantity})
                                    </option>
                                  ))}
                                </select>

                                {/* Sub-attributes */}
                                {entry.tracking_id && entry.trackingOptions && (() => {
                                  const selectedTracking = entry.trackingOptions.find((t: any) => String(t.id) === String(entry.tracking_id));
                                  if (!selectedTracking || !selectedTracking.subAttributes) return null;

                                  return (
                                    <div className="mt-2 pl-2 border-l-2 border-gray-300 space-y-1">
                                      {selectedTracking.subAttributes.map((subAttr: any) => (
                                        <div key={subAttr.id} className="flex items-center gap-1 text-[11px]">
                                          <span className="font-medium text-gray-500 min-w-[50px] capitalize">{subAttr.name}:</span>
                                          <input
                                            type="text"
                                            value={(entry.sub_attributes || {})[subAttr.id] !== undefined ? (entry.sub_attributes || {})[subAttr.id] : subAttr.value}
                                            onChange={(e) => handleSubAttributeChange(index, subAttr.id, e.target.value)}
                                            className={`${TABLE_STYLES.input} flex-1 p-1 h-6`}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()}
                                </div>
                              ) : null}
                            </td>
                          )}

                          {/* QUANTITY */}
                          <td className="px-1 py-2 min-w-[55px] align-top">
                            {!isAddingBatch && (
                              <input
                                type="number"
                                step="any"
                                name="quantity"
                                value={entry.quantity || ""}
                                onChange={(e) => handleEntryChange(index, e)}
                                className={`${TABLE_STYLES.input} text-right text-xs`}
                              />
                            )}
                          </td>

                          {/* UNIT */}
                          <td className="px-1 py-2 min-w-[45px] text-center text-xs align-top">
                            {getUnitName(entry.unitName)}
                          </td>

                          {/* RATE */}
                          <td className="px-1 py-2 min-w-[70px] align-top">
                            {!isAddingBatch && (
                              <input
                                type="number"
                                name="rate"
                                value={entry.rate || ""}
                                onChange={(e) => handleEntryChange(index, e)}
                                className={`${TABLE_STYLES.input} text-right text-xs`}
                              />
                            )}
                          </td>


                          {/* GST TOTAL */}

                          {/* GST Columns */}

                          {/* Intra State */}
                          {visibleColumns.gst && isIntraState && (
                            <>
                              <td className="px-1 py-2 text-xs text-center align-top">
                                {(() => {
                                  let r = entry.sgstRate;
                                  if (r > 14 && (entry.cgstRate === r || !entry.cgstRate)) {
                                    r = r / 2;
                                  }
                                  if (!r) r = resolveEntryGstRate(entry, ledgers, stockItems) / 2;
                                  return r || extractGstPercent(getLedgerNameById(entry.sgstLedgerId, ledgers));
                                })()}%
                              </td>

                              <td className="px-1 py-2 text-xs text-center align-top">
                                {(() => {
                                  let r = entry.cgstRate;
                                  if (r > 14 && (entry.sgstRate === r || !entry.sgstRate)) {
                                    r = r / 2;
                                  }
                                  if (!r) r = resolveEntryGstRate(entry, ledgers, stockItems) / 2;
                                  return r || extractGstPercent(getLedgerNameById(entry.cgstLedgerId, ledgers));
                                })()}%
                              </td>
                            </>
                          )}

                          {/* Inter State */}
                          {visibleColumns.gst && !isIntraState && (
                            <td className="px-1 py-2 text-xs text-center align-top">
                              {(() => {
                                const r = entry.igstRate ?? resolveEntryGstRate(entry, ledgers, stockItems);
                                return r || extractGstPercent(getLedgerNameById(entry.gstLedgerId, ledgers));
                              })()}%
                            </td>
                          )}





                          {/* AMOUNT (TAXABLE) */}
                          <td className="px-1 py-2 min-w-[75px] align-top">
                            <input
                              type="number"
                              name="amount"
                              value={entry.amount ?? ""}
                              onChange={(e) => handleEntryChange(index, e)}
                              className={`${TABLE_STYLES.input} text-right text-xs font-medium`}
                              placeholder="Taxable"
                            />
                          </td>

                          {/* GODOWN (Show only if Enabled) */}
                          {godownEnabled === "yes" && visibleColumns.godown && (
                            <td className="px-1 py-2 min-w-[95px] align-top">
                              <select
                                name="godownId"
                                value={entry.godownId || ""}
                                onChange={(e) => handleEntryChange(index, e)}
                                className={`${TABLE_STYLES.select
                                  } min-w-[95px] text-xs ${errors[`entry${index}.godownId`]
                                    ? "border-red-500"
                                    : ""
                                  }`}
                              >
                                <option value="">Select Godown</option>
                                {godowndata.map((godown: any) => (
                                  <option key={godown.id} value={godown.id}>
                                    {godown.name}
                                  </option>
                                ))}
                              </select>
                              {errors[`entry${index}.godownId`] && (
                                <p className="text-red-500 text-xs mt-1">
                                  {errors[`entry${index}.godownId`]}
                                </p>
                              )}
                            </td>
                          )}

                          {/* Purchase Ledger */}
                          <td className="px-1 py-2 min-w-[120px] align-top">
                            <select
                              name="purchaseLedgerId"
                              value={entry.purchaseLedgerId ? String(entry.purchaseLedgerId) : ""}
                              onChange={(e) => handleEntryChange(index, e)}
                              className={`${TABLE_STYLES.select} min-w-[120px] text-xs ${errors[`entry${index}.purchaseLedgerId`]
                                ? "border-red-500"
                                : ""
                                }`}
                            >
                              <option value="">Select Ledger</option>
                              {purchaseLedgers.map((ledger) => (
                                <option key={ledger.id} value={String(ledger.id)}>
                                  {ledger.name} {ledger.gstNumber ? `\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0 ${ledger.gstNumber}` : ""}
                                </option>
                              ))}
                            </select>
                            {errors[`entry${index}.purchaseLedgerId`] && (
                              <p className="text-red-500 text-xs mt-1">
                                {errors[`entry${index}.purchaseLedgerId`]}
                              </p>
                            )}
                          </td>

                          {/* ACTION */}
                          <td className="px-1 py-2 text-center min-w-[40px] align-top">
                            <button
                              onClick={() => removeEntry(index)}
                              className="p-1 rounded hover:bg-gray-200"
                              disabled={formData.entries.length <= 1}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  <tfoot>
                    {/* Calculate dynamic colspan based on visible columns */}
                    {(() => {
                      const colSpanBeforeAmount =
                        5 + // Sr(1) + Item(1) + Qty(1) + Unit(1) + Rate(1)
                        (visibleColumns.attribute && hasAnyAttribute ? 1 : 0) +
                        (visibleColumns.hsn ? 1 : 0) +
                        (visibleColumns.batch && hasAnyBatch ? 1 : 0) +
                        (visibleColumns.gst ? (isIntraState ? 2 : 1) : 0);

                      const colSpanAfterAmount =
                        2 + // Purchase Ledger(1) + Action(1)
                        ((godownEnabled === "yes" && visibleColumns.godown) ? 1 : 0);

                      return (
                        <>
                          {/* Subtotal */}
                          <tr
                            className={`font-semibold ${theme === "dark"
                              ? "border-t border-gray-600"
                              : "border-t border-gray-300"
                              }`}
                          >
                            <td colSpan={colSpanBeforeAmount} className="px-4 py-2 text-right">
                              Taxable Value
                            </td>

                            <td className="px-4 py-2 text-right">
                              {subtotal.toLocaleString()}
                            </td>

                            <td colSpan={colSpanAfterAmount}></td>
                          </tr>

                          {/* TDS (FIXED WIDTH) */}
                          {/* TDS Row */}
                          {visibleColumns.tds && (
                            <tr
                              className={`font-semibold ${theme === "dark"
                                ? "border-t border-gray-600"
                                : "border-t border-gray-300"
                                }`}
                            >
                              {/* Label + Dropdown */}
                              <td colSpan={colSpanBeforeAmount} className="px-4 py-2 text-right">
                                <div className="flex items-center justify-end gap-3 pr-6">

                                  <span className="whitespace-nowrap">
                                    TDS:
                                  </span>

                                  <select
                                    name="tdsLedgerId"
                                    value={formData.tdsLedgerId}
                                    onChange={handleChange}
                                    className={`${TABLE_STYLES.select} !w-32 text-[11px] h-8 inline-block`}
                                  >
                                    <option value="">Select TDS</option>

                                    {tdsLedgers.map((l) => (
                                      <option key={l.id} value={l.id}>
                                        {l.name} {l.gstNumber ? `\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0 ${l.gstNumber}` : ""}
                                      </option>
                                    ))}
                                  </select>

                                </div>
                              </td>

                              {/* Amount */}
                              <td className="px-4 py-2 text-right font-bold">
                                {tdsAmount.toLocaleString()}
                              </td>

                              {/* Empty Space */}
                              <td colSpan={colSpanAfterAmount} className="px-4 py-2">
                                &nbsp;
                              </td>
                            </tr>
                          )}


                          {/* IGST / SGST */}
                          {isIntraState ? (
                            <>
                              <tr
                                className={`font-semibold ${theme === "dark"
                                  ? "border-t border-gray-600"
                                  : "border-t border-gray-300"
                                  }`}
                              >
                                <td colSpan={colSpanBeforeAmount} className="px-4 py-2 text-right">
                                  SGST Total:
                                </td>

                                <td className="px-4 py-2 text-right">
                                  {sgstTotal.toLocaleString()}
                                </td>

                                <td colSpan={colSpanAfterAmount}></td>
                              </tr>

                              <tr
                                className={`font-semibold ${theme === "dark"
                                  ? "border-t border-gray-600"
                                  : "border-t border-gray-300"
                                  }`}
                              >
                                <td colSpan={colSpanBeforeAmount} className="px-4 py-2 text-right">
                                  CGST Total:
                                </td>

                                <td className="px-4 py-2 text-right">
                                  {cgstTotal.toLocaleString()}
                                </td>

                                <td colSpan={colSpanAfterAmount}></td>
                              </tr>
                            </>
                          ) : (
                            <tr
                              className={`font-semibold ${theme === "dark"
                                ? "border-t border-gray-600"
                                : "border-t border-gray-300"
                                }`}
                            >
                              <td colSpan={colSpanBeforeAmount} className="px-4 py-2 text-right">
                                IGST Total:
                              </td>

                              <td className="px-4 py-2 text-right">
                                {igstTotal.toLocaleString()}
                              </td>

                              <td colSpan={colSpanAfterAmount}></td>
                            </tr>
                          )}

                          {/* Discount Row */}
                          <tr
                            className={`font-semibold ${theme === "dark"
                              ? "border-t border-gray-600"
                              : "border-t border-gray-300"
                              }`}
                          >
                            <td colSpan={colSpanBeforeAmount} className="px-4 py-2 text-right">
                              <div className="flex items-center justify-end gap-3 pr-6">
                                <span className="whitespace-nowrap">
                                  Discount (Optional):
                                </span>
                                <select
                                  name="discountLedgerId"
                                  value={formData.discountLedgerId}
                                  onChange={handleChange}
                                  className={`${TABLE_STYLES.select} !w-32 text-[11px] h-8 inline-block`}
                                >
                                  <option value="">Select Discount</option>
                                  {discountLedgers.map((l) => (
                                    <option key={l.id} value={l.id}>
                                      {l.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>

                            <td className="px-4 py-2 text-right font-bold text-red-600">
                              <input
                                type="number"
                                name="discountAmount"
                                value={formData.discountAmount || ""}
                                onChange={handleChange}
                                placeholder="0"
                                className="w-full p-1 text-right border rounded bg-transparent font-bold text-red-600 outline-none focus:border-blue-500"
                              />
                            </td>

                            <td colSpan={colSpanAfterAmount} className="px-4 py-2">
                              &nbsp;
                            </td>
                          </tr>

                          {/* Grand Total */}
                          <tr
                            className={`font-semibold text-lg ${theme === "dark"
                              ? "bg-gray-700/50 border-t-2 border-blue-500"
                              : "bg-blue-50 border-t-2 border-blue-600 text-blue-900"
                              }`}
                          >
                            <td colSpan={colSpanBeforeAmount} className="px-4 py-2 text-right">
                              Grand Total:
                            </td>

                            <td className="px-4 py-2 text-right font-bold text-green-600">
                              {total.toLocaleString()}
                            </td>

                            <td colSpan={colSpanAfterAmount}></td>
                          </tr>
                        </>
                      );
                    })()}
                  </tfoot>
                </table>
              ) : (
                <table className="w-full mb-4">
                  <thead>
                    <tr
                      className={`${theme === "dark"
                        ? "border-b border-gray-600"
                        : "border-b border-gray-300"
                        }`}
                    >
                      <th className="px-4 py-2 text-left">Ledger</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className={`${theme === "dark"
                          ? "border-b border-gray-600"
                          : "border-b border-gray-300"
                          }`}
                      >
                        <td className="px-4 py-2">
                          {" "}
                          <select
                            title="Select Ledger"
                            name="ledgerId"
                            value={entry.ledgerId || ""}
                            onChange={(e) =>
                              handleEntryChange(
                                formData.entries.indexOf(entry),
                                e
                              )
                            }
                            required
                            className={getSelectClasses(
                              theme,
                              !!errors[
                              `entry${formData.entries.indexOf(
                                entry
                              )}.ledgerId`
                              ]
                            )}
                          >
                            {" "}
                            <option value="">Select Ledger</option>
                            {safeLedgers.map((ledger) => (
                              <option key={ledger.id} value={ledger.id}>
                                {ledger.name} {ledger.gstNumber ? `\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0 ${ledger.gstNumber}` : ""}
                              </option>
                            ))}
                          </select>
                          {errors[
                            `entry${formData.entries.indexOf(entry)}.ledgerId`
                          ] && (
                              <p className="text-red-500 text-xs mt-1">
                                {
                                  errors[
                                  `entry${formData.entries.indexOf(
                                    entry
                                  )}.ledgerId`
                                  ]
                                }
                              </p>
                            )}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            title="Enter Amount"
                            type="number"
                            name="amount"
                            value={Math.round(entry.amount ?? 0) || ""}
                            onChange={(e) =>
                              handleEntryChange(
                                formData.entries.indexOf(entry),
                                e
                              )
                            }
                            required
                            min="0"
                            step="0.01"
                            className={getInputClasses(
                              theme,
                              !!errors[
                              `entry${formData.entries.indexOf(entry)}.amount`
                              ]
                            )}
                          />
                          {errors[
                            `entry${formData.entries.indexOf(entry)}.amount`
                          ] && (
                              <p className="text-red-500 text-xs mt-1">
                                {
                                  errors[
                                  `entry${formData.entries.indexOf(
                                    entry
                                  )}.amount`
                                  ]
                                }
                              </p>
                            )}
                        </td>
                        <td className="px-4 py-2">
                          {" "}
                          <select
                            title="Select Type"
                            name="type"
                            value={entry.type}
                            onChange={(e) =>
                              handleEntryChange(
                                formData.entries.indexOf(entry),
                                e
                              )
                            }
                            className={getSelectClasses(theme)}
                          >
                            <option value="debit">Debit</option>
                            <option value="credit">Credit</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            title="Remove Ledger"
                            type="button"
                            onClick={() =>
                              removeEntry(formData.entries.indexOf(entry))
                            }
                            disabled={formData.entries.length <= 1}
                            className={`p-1 rounded ${formData.entries.length <= 1
                              ? "opacity-50 cursor-not-allowed"
                              : theme === "dark"
                                ? "hover:bg-gray-600"
                                : "hover:bg-gray-300"
                              }`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr
                      className={`font-semibold ${theme === "dark"
                        ? "border-t border-gray-600"
                        : "border-t border-gray-300"
                        }`}
                    >
                      <td className="px-4 py-2 text-right">Debit Total:</td>
                      <td className="px-4 py-2 text-right">
                        {Math.round(debitTotal).toLocaleString()}
                      </td>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2"></td>
                    </tr>
                    <tr
                      className={`font-semibold ${theme === "dark"
                        ? "border-t border-gray-600"
                        : "border-t border-gray-300"
                        }`}
                    >
                      <td className="px-4 py-2 text-right">Credit Total:</td>
                      <td className="px-4 py-2 text-right">
                        {Math.round(creditTotal).toLocaleString()}
                      </td>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2"></td>
                    </tr>


                    {/* Grand Total (Accounting Mode) */}
                    <tr
                      className={`font-semibold text-lg ${theme === "dark"
                        ? "bg-gray-700/50 border-t-2 border-blue-500"
                        : "bg-blue-50 border-t-2 border-blue-600 text-blue-900"
                        }`}
                    >
                      <td className="px-4 py-2 text-right">Grand Total:</td>
                      <td className="px-4 py-2 text-right font-bold text-green-600">
                        {total.toLocaleString()}
                      </td>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2"></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
            {errors.entries && (
              <p className="text-red-500 text-xs mt-1">{errors.entries}</p>
            )}
          </div>

          <div className="mb-6">
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="narration"
            >
              Narration
            </label>{" "}
            <textarea
              id="narration"
              name="narration"
              value={formData.narration}
              onChange={handleChange}
              rows={3}
              className={getInputClasses(theme)}
            />
          </div>

          <div className="flex justify-end space-x-4">
            <button
              title="Cancel (Esc)"
              type="button"
              onClick={() => navigate(new URLSearchParams(window.location.search).get("returnUrl") || "/app/vouchers")}
              className={`px-4 py-2 rounded ${theme === "dark"
                ? "bg-gray-700 hover:bg-gray-600"
                : "bg-gray-200 hover:bg-gray-300"
                }`}
            >
              Cancel
            </button>
            <button
              title="Print"
              type="button"
              onClick={handlePrint}
              className={`flex items-center px-4 py-2 rounded ${theme === "dark"
                ? "bg-green-600 hover:bg-green-700"
                : "bg-green-600 hover:bg-green-700 text-white"
                }`}
            >
              <Printer size={18} className="mr-1" />
              Print
            </button>
            <button
              title="Save Voucher (F9)"
              type="submit"
              disabled={isSubmitting}
              className={`flex items-center px-4 py-2 rounded ${theme === "dark"
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-blue-600 hover:bg-blue-700 text-white"
                } ${isSubmitting ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <Save size={18} className="mr-1" />
              {isSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div >
      {/* Inline Add-Batch now rendered per-entry inside table; no global modal */}
      {/* Configuration Modal (F12) */}
      {
        showConfig && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div
              className={`p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
                }`}
            >
              <h2 className="text-xl font-bold mb-4">
                Configure Purchase Voucher
              </h2>
              <p className="mb-4">Configure GST settings, invoice format, etc.</p>
              <div className="flex justify-end">
                <button
                  onClick={() => setShowConfig(false)}
                  className={`px-4 py-2 rounded ${theme === "dark"
                    ? "bg-gray-700 hover:bg-gray-600"
                    : "bg-gray-200 hover:bg-gray-300"
                    }`}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )
      } {" "}
      {/* Print Layout */} {" "}
      <div className="absolute -left-[9999px] -top-[9999px] w-[210mm] min-h-[297mm]">
        <div
          ref={printRef}
          className="p-[15mm] font-sans text-[11pt] w-full bg-white text-black leading-relaxed"
        >
          {/* Header Section */}
          <div className="border-2 border-black mb-2.5">
            {/* Top Header with TAX INVOICE */}
            <div className="bg-gray-100 py-2 px-2 text-center border-b border-black">
              <h1 className="text-[18pt] font-bold m-0 tracking-[2px]">
                TAX INVOICE
              </h1>
            </div>

            {/* Invoice Details Row */}
            <div className="flex justify-between py-1.5 px-2.5 border-b border-black text-[10pt]">
              <span>
                <strong>INVOICE NO:</strong> {formData.number}
              </span>
              <span>
                <strong>DATE:</strong>{" "}
                {new Date(formData.date).toLocaleDateString("en-GB")}
              </span>
            </div>

            {/* Supplier Invoice and Receipt Details Row */}
            <div className="flex justify-between py-1.5 px-2.5 border-b border-black text-[10pt]">
              <div className="flex gap-5">
                {formData.referenceNo && (
                  <span>
                    <strong>SUPPLIER INVOICE:</strong> {formData.referenceNo}
                  </span>
                )}
                {formData.supplierInvoiceDate && (
                  <span>
                    <strong>SUPPLIER DATE:</strong>{" "}
                    {new Date(formData.supplierInvoiceDate).toLocaleDateString(
                      "en-GB"
                    )}
                  </span>
                )}
              </div>
              <div className="flex gap-5">
                {formData.dispatchDetails?.docNo && (
                  <span>
                    <strong>RECEIPT DOC NO:</strong>{" "}
                    {formData.dispatchDetails.docNo}
                  </span>
                )}
                {formData.dispatchDetails?.through && (
                  <span>
                    <strong>RECEIPT THROUGH:</strong>{" "}
                    {formData.dispatchDetails.through}
                  </span>
                )}
              </div>
            </div>

            {/* Company Details Section */}
            <div className="p-2.5 border-b border-black">
              <div className="flex items-center mb-2">
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mr-4">
                  <span className="text-white text-[16pt] font-bold">
                    {safeCompanyInfo.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <h2 className="text-[16pt] font-bold m-0 uppercase">
                    {safeCompanyInfo.name}
                  </h2>
                  <p className="my-0.5 text-[10pt]">
                    {safeCompanyInfo.address}
                  </p>
                </div>
              </div>
              <div className="text-[10pt] flex gap-5">
                <span>
                  <strong>GSTIN:</strong> {safeCompanyInfo.gstNumber}
                </span>
                <span>
                  <strong>PAN NO:</strong> {safeCompanyInfo.panNumber}
                </span>
              </div>
            </div>

            {/* Customer Details Section */}
            <div className="p-2.5">
              <div className="mb-1.5">
                <strong className="text-[11pt]">PARTY'S NAME:</strong>
              </div>
              <div className="text-[10pt] leading-relaxed">
                <div>
                  <strong>
                    {formData.partyId
                      ? getPartyName(formData.partyId)
                      : "No Party Selected"}
                  </strong>
                </div>
                {formData.partyId && (
                  <>
                    <div>
                      GSTIN:{" "}
                      {safeLedgers.find((l) => l.id === formData.partyId)
                        ?.gstNumber || "N/A"}
                    </div>
                    <div>
                      Address:{" "}
                      {safeLedgers.find((l) => l.id === formData.partyId)
                        ?.address || "N/A"}
                    </div>
                    <div>
                      State:{" "}
                      {safeLedgers.find((l) => l.id === formData.partyId)
                        ?.state || "N/A"}
                    </div>
                  </>
                )}
                {formData.purchaseLedgerId && (
                  <div className="mt-1.5">
                    <strong>Purchase Ledger:</strong>
                    {getPurchaseLedgerName(formData.purchaseLedgerId)}
                  </div>
                )}
                {formData.dispatchDetails?.destination && (
                  <div>
                    <strong>Origin:</strong>
                    {formData.dispatchDetails.destination}
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Particulars Table */}
          {formData.mode === "item-invoice" ? (
            <table className={PRINT_STYLES.table}>
              <thead>
                <tr className="bg-gray-100">
                  <th className={`${PRINT_STYLES.headerCell} w-12 text-center`}>
                    Sr No
                  </th>
                  <th className={PRINT_STYLES.headerCell}>
                    Particulars (Description & Specifications)
                  </th>
                  <th className={`${PRINT_STYLES.headerCell} w-16 text-center`}>
                    HSN Code
                  </th>
                  <th className={`${PRINT_STYLES.headerCell} w-16 text-center`}>
                    Qty
                  </th>
                  <th className={`${PRINT_STYLES.headerCell} w-20 text-right`}>
                    Rate
                  </th>
                  <th className={`${PRINT_STYLES.headerCell} w-16 text-center`}>
                    IGST
                  </th>
                  <th className={`${PRINT_STYLES.headerCell} w-16 text-center`}>
                    CGST
                  </th>
                  <th className={`${PRINT_STYLES.headerCell} w-16 text-center`}>
                    SGST
                  </th>
                  <th className={`${PRINT_STYLES.headerCell} w-24 text-right`}>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {formData.entries
                  .filter(
                    (entry) =>
                      entry.itemId &&
                      entry.itemId !== "" &&
                      entry.itemId !== "select"
                  )
                  .map((entry, index) => {
                    const itemDetails = getItemDetails(entry.itemId || "");
                    const baseAmount =
                      (entry.quantity || 0) * (entry.rate || 0);
                    const gstRate = itemDetails.gstRate || 0;

                    // Get rates from ledgers if available
                    const igstLedgerRate = extractGstPercent(getLedgerNameById(entry.igstLedgerId, ledgers));
                    const cgstLedgerRate = extractGstPercent(getLedgerNameById(entry.cgstLedgerId, ledgers));
                    const sgstLedgerRate = extractGstPercent(getLedgerNameById(entry.sgstLedgerId, ledgers));

                    // Fallback hierarchy: Ledger Name % -> Entry state -> Item Master % calculation -> 0
                    const finalIgst = igstLedgerRate || (!isIntraState && gstRate ? gstRate : 0);
                    const finalCgst = cgstLedgerRate || (isIntraState && gstRate ? gstRate / 2 : 0);
                    const finalSgst = sgstLedgerRate || (isIntraState && gstRate ? gstRate / 2 : 0);

                    return (
                      <tr key={entry.id}>
                        <td className={`${PRINT_STYLES.cellCenter} font-bold`}>
                          {index + 1}
                        </td>
                        <td className={PRINT_STYLES.cell}>
                          <strong>{itemDetails.name}</strong>
                          {(() => {
                            const attributes = itemDetails.attributes || [];
                            if (attributes.length === 0) return null;
                            return (
                              <div className="text-[8pt] text-gray-600 mt-0.5 ml-2 font-normal">
                                {attributes.map((attr: any, i: number) => (
                                  <span key={i} className="mr-2">
                                    <strong>{attr.name}:</strong> {attr.value || "-"}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </td>
                        <td className={PRINT_STYLES.cellCenter}>
                          {itemDetails.hsnCode}
                        </td>
                        <td className={PRINT_STYLES.cellCenter}>
                          {entry.quantity?.toLocaleString() || "0"}{" "}
                          {itemDetails.unit}
                        </td>
                        <td className={PRINT_STYLES.cellRight}>
                          ₹{entry.rate?.toLocaleString() || "0"}
                        </td>
                        <td className={PRINT_STYLES.cellCenter}>
                          {finalIgst ? `${finalIgst}%` : "0"}
                        </td>
                        <td className={PRINT_STYLES.cellCenter}>
                          {finalCgst ? `${finalCgst}%` : "0"}
                        </td>
                        <td className={PRINT_STYLES.cellCenter}>
                          {finalSgst ? `${finalSgst}%` : "0"}
                        </td>
                        <td className={PRINT_STYLES.cellRight}>
                          ₹{baseAmount.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                {/* Add empty rows for spacing if no items */}
                {formData.entries.filter(
                  (entry) =>
                    entry.itemId &&
                    entry.itemId !== "" &&
                    entry.itemId !== "select"
                ).length === 0 && (
                    <>
                      <tr>
                        <td
                          className="border border-black p-5 text-[10pt] text-center"
                          colSpan={COLSPAN_VALUES.PRINT_TABLE_NO_ITEMS}
                        >
                          No items selected
                        </td>
                      </tr>
                      {Array(3)
                        .fill(0)
                        .map((_, index) => (
                          <tr key={`empty-${index}`}>
                            <td className="border border-black p-5 text-[10pt]">
                              &nbsp;
                            </td>
                            <td className="border border-black p-5 text-[10pt]">
                              &nbsp;
                            </td>
                            <td className="border border-black p-5 text-[10pt]">
                              &nbsp;
                            </td>
                            <td className="border border-black p-5 text-[10pt]">
                              &nbsp;
                            </td>
                            <td className="border border-black p-5 text-[10pt]">
                              &nbsp;
                            </td>
                            <td className="border border-black p-5 text-[10pt]">
                              &nbsp;
                            </td>
                            <td className="border border-black p-5 text-[10pt]">
                              &nbsp;
                            </td>
                            <td className="border border-black p-5 text-[10pt]">
                              &nbsp;
                            </td>
                            <td className="border border-black p-5 text-[10pt]">
                              &nbsp;
                            </td>
                          </tr>
                        ))}
                    </>
                  )}

                {/* Add empty rows for spacing when items exist */}
                {formData.entries.filter(
                  (entry) =>
                    entry.itemId &&
                    entry.itemId !== "" &&
                    entry.itemId !== "select"
                ).length > 0 &&
                  formData.entries.filter(
                    (entry) =>
                      entry.itemId &&
                      entry.itemId !== "" &&
                      entry.itemId !== "select"
                  ).length < 4 &&
                  Array(
                    Math.max(
                      0,
                      4 -
                      formData.entries.filter(
                        (entry) =>
                          entry.itemId &&
                          entry.itemId !== "" &&
                          entry.itemId !== "select"
                      ).length
                    )
                  )
                    .fill(0)
                    .map((_, index) => (
                      <tr key={`empty-${index}`}>
                        <td className="border border-black p-5 text-[10pt]">
                          &nbsp;
                        </td>
                        <td className="border border-black p-5 text-[10pt]">
                          &nbsp;
                        </td>
                        <td className="border border-black p-5 text-[10pt]">
                          &nbsp;
                        </td>
                        <td className="border border-black p-5 text-[10pt]">
                          &nbsp;
                        </td>
                        <td className="border border-black p-5 text-[10pt]">
                          &nbsp;
                        </td>
                        <td className="border border-black p-5 text-[10pt]">
                          &nbsp;
                        </td>
                        <td className="border border-black p-5 text-[10pt]">
                          &nbsp;
                        </td>
                        <td className="border border-black p-5 text-[10pt]">
                          &nbsp;
                        </td>
                        <td className="border border-black p-5 text-[10pt]">
                          &nbsp;
                        </td>
                      </tr>
                    ))}
              </tbody>
              {/* Tax Summary */}
              <tfoot>
                <tr>
                  <td
                    colSpan={COLSPAN_VALUES.PRINT_TABLE_TERMS}
                    className="border border-black p-1.5 text-[9pt]"
                  >
                    <strong>Terms & Conditions:</strong>
                    <br />
                    <span className="text-[8pt]">
                      • Goods once received will not be returned without proper
                      cause.
                      <br />
                      • Interest @ 18% p.a. will be charged on delayed payments.
                      <br />• Subject to {safeCompanyInfo.address} Jurisdiction
                      only.
                      <br />
                      • Our responsibility ceases as soon as goods are
                      delivered.
                      <br />• Quality check to be done on receipt of goods.
                    </span>
                  </td>
                  <td className="border border-black p-1.5 text-[10pt] text-right font-bold">
                    <div className="mb-1.5">Taxable Value</div>
                    {cgstTotal > 0 && <div className="mb-1.5">Add: CGST</div>}
                    {sgstTotal > 0 && <div className="mb-1.5">Add: SGST</div>}
                    {igstTotal > 0 && <div className="mb-1.5">Add: IGST</div>}
                    {discountTotal > 0 && (
                      <div className="mb-1.5">Less: Discount</div>
                    )}
                    <div className="font-bold text-[11pt]">Grand Total</div>
                  </td>
                  <td className="border border-black p-1.5 text-[10pt] text-right">
                    <div className="mb-1.5">₹{subtotal.toLocaleString()}</div>
                    {cgstTotal > 0 && (
                      <div className="mb-1.5">
                        ₹{cgstTotal.toLocaleString()}
                      </div>
                    )}
                    {sgstTotal > 0 && (
                      <div className="mb-1.5">
                        ₹{sgstTotal.toLocaleString()}
                      </div>
                    )}
                    {igstTotal > 0 && (
                      <div className="mb-1.5">
                        ₹{igstTotal.toLocaleString()}
                      </div>
                    )}
                    {discountTotal > 0 && (
                      <div className="mb-1.5">
                        ₹{discountTotal.toLocaleString()}
                      </div>
                    )}
                    <div className="font-bold text-[11pt]">
                      ₹{total.toLocaleString()}
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="w-full border-collapse mb-5">
              <thead>
                <tr>
                  <th className="border border-black p-1.5">Ledger</th>
                  <th className="border border-black p-1.5 text-right">
                    Amount
                  </th>
                  <th className="border border-black p-1.5">Type</th>
                </tr>
              </thead>
              <tbody>
                {formData.entries.map((entry) => {
                  const selectedLedger = safeLedgers.find(
                    (l) => l.id === entry.ledgerId
                  );
                  return (
                    <tr key={entry.id}>
                      <td className="border border-black p-1.5">
                        {selectedLedger?.name || "-"}
                      </td>
                      <td className="border border-black p-1.5 text-right">
                        {entry.amount.toLocaleString()}
                      </td>
                      <td className="border border-black p-1.5">
                        {entry.type}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="border border-black p-1.5 text-right font-bold">
                    Debit Total:
                  </td>
                  <td className="border border-black p-1.5 text-right">
                    {debitTotal.toLocaleString()}
                  </td>
                  <td className="border border-black p-1.5"></td>
                  <td className="border border-black p-1.5"></td>
                </tr>
                <tr>
                  <td className="border border-black p-1.5 text-right font-bold">
                    Credit Total:
                  </td>
                  <td className="border border-black p-1.5 text-right">
                    {creditTotal.toLocaleString()}
                  </td>
                  <td className="border border-black p-1.5"></td>
                </tr>

                {discountTotal > 0 && (
                  <tr>
                    <td className="border border-black p-1.5 text-right font-bold">
                      Less: Discount:
                    </td>
                    <td className="border border-black p-1.5 text-right">
                      {discountTotal.toLocaleString()}
                    </td>
                    <td className="border border-black p-1.5"></td>
                  </tr>
                )}

                <tr className="bg-gray-100">
                  <td className="border border-black p-1.5 text-right font-bold">
                    Grand Total:
                  </td>
                  <td className="border border-black p-1.5 text-right font-bold">
                    ₹{total.toLocaleString()}
                  </td>
                  <td className="border border-black p-1.5"></td>
                </tr>
              </tfoot>
            </table>
          )}
          {/* Amount in Words */}
          <div className="border border-black p-2.5 mb-4">
            <strong className="text-[11pt]">
              Total Amount (Rs. in Words):
            </strong>
            <div className="text-[10pt] mt-1.5 min-h-[20px]">
              Rupees {total > 0 ? total.toLocaleString() : "Zero"} Only
              {total > 0 && ` (₹${total.toLocaleString()})`}
            </div>
          </div>
          {/* GST Calculation Summary */}
          {formData.entries.filter(
            (entry) =>
              entry.itemId && entry.itemId !== "" && entry.itemId !== "select"
          ).length > 0 && (
              <div className="border border-black p-2.5 mb-4">
                <strong className="text-[11pt] mb-2 block">
                  GST Calculation Summary:
                </strong>
                <div className="text-[10pt]">
                  {(() => {
                    const gstInfo = getGstRateInfo();
                    return (
                      <div>
                        <div className="flex justify-between mb-2 font-bold">
                          <span>Total Items: {gstInfo.totalItems}</span>
                          <span>
                            GST Rates Applied: {gstInfo.uniqueGstRatesCount}
                          </span>
                        </div>
                        <div className="text-[9pt] mb-2">
                          <strong>GST Rates Used:</strong>
                          {gstInfo.gstRatesUsed.join("%, ")}%
                        </div>
                        {Object.entries(gstInfo.breakdown).map(([rate, data]) => (
                          <div
                            key={rate}
                            className="flex justify-between mb-1 border-b border-dotted border-gray-300 pb-0.5"
                          >
                            <span>
                              GST {rate}%: {data.count} item
                              {data.count > 1 ? "s" : ""}
                            </span>
                            <span>₹{data.gstAmount.toLocaleString()} GST</span>
                          </div>
                        ))}
                        <div className="mt-2 text-center text-[9pt] italic text-gray-600">
                          This invoice includes {gstInfo.uniqueGstRatesCount}
                          different GST rate
                          {gstInfo.uniqueGstRatesCount > 1 ? "s" : ""} as per item
                          specifications
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          {/* Footer Section */}
          <div className="flex justify-between mt-12 pt-4 border-t border-gray-300">
            <div className="flex-1">
              <div className="text-[11pt] font-bold mb-8">
                For {safeCompanyInfo.name.toUpperCase()}
              </div>
              <div className="mt-12">
                <div className="border-t border-black w-32 pt-1 text-[10pt] text-center">
                  Authorised Signatory
                </div>
              </div>
            </div>
            <div className="flex-1 text-right">
              <div className="text-[11pt] font-bold mb-8">
                Supplier's Signature
              </div>
              <div className="mt-12 flex justify-end">
                <div className="border-t border-black w-32 pt-1 text-[10pt] text-center">
                  Supplier's Signature
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Item Selection Modal */}
      {itemSelectionModal.isOpen && (
        <div className="fixed inset-0 bg-white/40 dark:bg-black/40 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div
            className={`${
              theme === "dark"
                ? "bg-gray-800 text-white"
                : "bg-white text-gray-800"
            } rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border dark:border-gray-700`}
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-2xl font-bold">Select Item</h2>
              <button
                onClick={() =>
                  setItemSelectionModal({ isOpen: false, index: null })
                }
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <div className="flex flex-col gap-2">
                {stockItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (itemSelectionModal.index !== null) {
                        handleEntryChange(itemSelectionModal.index, {
                          target: {
                            name: "itemId",
                            value: String(item.id),
                            type: "select-one",
                          },
                        } as any);
                      }
                      setItemSelectionModal({ isOpen: false, index: null });
                    }}
                    className={`px-4 py-3 rounded-lg cursor-pointer border hover:border-blue-500 transition-colors flex items-center justify-between shadow-sm ${
                      theme === "dark"
                        ? "bg-gray-700 border-gray-600 hover:bg-gray-600"
                        : "bg-white border-gray-200 hover:bg-blue-50"
                    }`}
                  >
                    <h3 className="text-lg font-medium break-words">
                      {item.name}
                    </h3>
                    {(() => {
                      let qty = 0;
                      if (item.batches) {
                        try {
                          const parsed =
                            typeof item.batches === "string"
                              ? JSON.parse(item.batches)
                              : item.batches;
                          if (Array.isArray(parsed)) {
                            qty = parsed.reduce(
                              (sum: number, b: any) =>
                                sum +
                                Number(
                                  b.batchQuantity ||
                                  b.quantity ||
                                  b.openingQuantity ||
                                  0
                                ),
                              0
                            );
                          }
                        } catch (e) {}
                      }

                      if (qty === 0) {
                        qty =
                          (item as any).closingBalance ??
                          (item as any).closing_balance ??
                          item.openingBalance ??
                          (item as any).opening_balance ??
                          (item as any).stock ??
                          0;
                      }

                      return (
                        <h3 className="text-lg font-medium break-words">
                          {qty} {item.unitName || item.unit || ""}
                        </h3>
                      );
                    })()}
                  </div>
                ))}
                {stockItems.length === 0 && (
                  <div className="col-span-full text-center py-12 text-gray-500">
                    No items available
                  </div>
                )}
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
          <span className="font-semibold">Note:</span> Use Purchase Voucher for
          recording purchases. Press F8 to create, F9 to save, F12 to configure,
          Esc to cancel.
        </p>
      </div>

      {/* ADD ATTRIBUTE MODAL */}
      {showAttributeModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${theme === "dark" ? "bg-gray-800 text-white border-gray-700" : "bg-white"} rounded-lg shadow-xl w-full max-w-md overflow-hidden border`}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Add Attribute Tracking</h3>
              <button
                onClick={() => setShowAttributeModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Primary Attribute</label>
                <select 
                  className={`${TABLE_STYLES.select} w-full`}
                  value={modalFormData.primary_attribute_id}
                  onChange={(e) => setModalFormData(p => ({ ...p, primary_attribute_id: e.target.value }))}
                >
                  <option value="">Select Primary Attribute</option>
                  {masterAttributes.map(attr => (
                    <option key={attr.id} value={attr.id}>{attr.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Primary Attribute Value</label>
                <input 
                  type="text"
                  placeholder="e.g. IMEI number, Color name..."
                  className={`${TABLE_STYLES.input} w-full`}
                  value={modalFormData.primary_attribute_value}
                  onChange={(e) => setModalFormData(p => ({ ...p, primary_attribute_value: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Sub Attributes</label>
                <div className="border border-gray-300 dark:border-gray-600 rounded-md p-3 max-h-56 overflow-y-auto space-y-2 bg-gray-50 dark:bg-gray-900/50">
                  {masterAttributes.filter(a => String(a.id) !== String(modalFormData.primary_attribute_id)).map(attr => (
                    <div key={attr.id} className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer w-32 shrink-0">
                        <input 
                          type="checkbox" 
                          checked={modalFormData.sub_attributes.includes(String(attr.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setModalFormData(p => ({ ...p, sub_attributes: [...p.sub_attributes, String(attr.id)] }));
                            } else {
                              setModalFormData(p => {
                                const newValues = { ...p.sub_attribute_values };
                                delete newValues[String(attr.id)];
                                return { 
                                  ...p, 
                                  sub_attributes: p.sub_attributes.filter(id => id !== String(attr.id)),
                                  sub_attribute_values: newValues 
                                };
                              });
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm capitalize truncate">{attr.name}</span>
                      </label>
                      
                      {modalFormData.sub_attributes.includes(String(attr.id)) && (
                        <input
                          type="text"
                          placeholder={`Enter ${attr.name}...`}
                          className={`${TABLE_STYLES.input} flex-1 text-xs p-1 min-w-0`}
                          value={(modalFormData.sub_attribute_values || {})[String(attr.id)] || ""}
                          onChange={(e) => setModalFormData(p => ({
                            ...p,
                            sub_attribute_values: { ...p.sub_attribute_values, [String(attr.id)]: e.target.value }
                          }))}
                        />
                      )}
                    </div>
                  ))}
                  {masterAttributes.length === 0 && <span className="text-sm text-gray-500">No attributes available</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Quantity</label>
                  <input 
                    type="number"
                    className={`${TABLE_STYLES.input} w-full`}
                    value={modalFormData.quantity}
                    onChange={(e) => {
                      const q = Number(e.target.value) || 0;
                      setModalFormData(p => ({ ...p, quantity: q, total_value: q * p.rate }));
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Rate</label>
                  <input 
                    type="number"
                    className={`${TABLE_STYLES.input} w-full`}
                    value={modalFormData.rate}
                    onChange={(e) => {
                      const r = Number(e.target.value) || 0;
                      setModalFormData(p => ({ ...p, rate: r, total_value: p.quantity * r }));
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Total Value</label>
                <input 
                  type="number"
                  readOnly
                  className={`${TABLE_STYLES.input} w-full bg-gray-100 dark:bg-gray-700 cursor-not-allowed font-semibold`}
                  value={modalFormData.total_value}
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowAttributeModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitAttributeModal}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm transition-colors"
              >
                Save & Select
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

export default PurchaseVoucher;

