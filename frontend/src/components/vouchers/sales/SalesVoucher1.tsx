import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useAppContext } from "../../../context/AppContext";
import {
  useNavigate,
  useParams,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import type {
  VoucherEntry,
  Ledger,
  Godown,
  LedgerWithGroup,
  SalesType,
} from "../../../types";
import { Save, Plus, Trash2, ArrowLeft, Printer, Settings, ChevronDown, X, Search } from "lucide-react";
import { RubicSalesButton, RubicSalesItemGrid } from "./RubicSalesQuickSelect";

import Swal from "sweetalert2";
import EWayBillGeneration from "./EWayBillGeneration";
import InvoicePrint from "./InvoicePrint";
import PrintOptions from "./PrintOptions";
import type { StockItem } from "../../../types";
import {
  useFinancialYear,
  getFinancialYearDefaults,
  useVoucherDateConfig,
} from "../../../hooks/useFinancialYear";

// DRY Constants for Tailwind Classes
const FORM_STYLES = {
  input: (theme: string, hasError?: boolean) =>
    `w-full p-2 rounded border ${
      theme === "dark"
        ? "bg-gray-700 border-gray-600 focus:border-blue-500"
        : "bg-white border-gray-300 focus:border-blue-500"
    } outline-none transition-colors ${hasError ? "border-red-500" : ""}`,
  select: (theme: string, hasError?: boolean) =>
    `w-full p-2 rounded border cursor-pointer ${
      theme === "dark"
        ? "bg-gray-700 border-gray-600 focus:border-blue-500"
        : "bg-white border-gray-300 focus:border-blue-500"
    } outline-none transition-colors ${hasError ? "border-red-500" : ""}`,
  tableInput: (theme: string) =>
    `w-full p-1 rounded border ${
      theme === "dark"
        ? "bg-gray-700 border-gray-600 focus:border-blue-500"
        : "bg-white border-gray-300 focus:border-blue-500"
    } outline-none transition-colors`,
  tableSelect: (theme: string) =>
    `w-full p-1 rounded border cursor-pointer ${
      theme === "dark"
        ? "bg-gray-700 border-gray-600 focus:border-blue-500"
        : "bg-white border-gray-300 focus:border-blue-500"
    } outline-none transition-colors`,
};

const deduplicateLedgers = <T extends { id?: any; name?: string; ownerId?: any; owner_id?: any }>(list: T[]): T[] => {
  if (!Array.isArray(list)) return [];
  const seenIds = new Map<string, T>();
  const seenNames = new Map<string, T>();

  for (const item of list) {
    if (!item) continue;
    const idKey = item.id != null && item.id !== "" ? String(item.id) : null;
    const nameKey = item.name ? item.name.trim().toLowerCase() : null;

    if (idKey && seenIds.has(idKey)) {
      continue;
    }

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

const SalesVoucher: React.FC = () => {
  const {
    theme,
    godowns = [],
    vouchers = [],
    units = [],
    companyInfo,
    setCompanyInfo,
    addVoucher,
    updateVoucher,
  } = useAppContext();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const copyId = location.state?.copyId;
  const [searchParams] = useSearchParams();
  const isEditMode = !!id;
  const companyId = localStorage.getItem("company_id");
  const ownerType = localStorage.getItem("supplier");
  const ownerId = localStorage.getItem(
    ownerType === "employee" ? "employee_id" : "user_id"
  );

  const [ledgers, setLedgers] = useState<LedgerWithGroup[]>([]);
  const [originalEntries, setOriginalEntries] = useState<any[]>([]); // Edit mode: purani entries store karo
  const [selectedPartyState, setSelectedPartyState] = useState<string>(""); // Store selected party's state
  const [selectedPartyGst, setSelectedPartyGst] = useState<string>(""); // Store selected party's GST number
  const [salesTypes, setSalesTypes] = useState<SalesType[]>([]);
  const [selectedSalesTypeId, setSelectedSalesTypeId] = useState<string>("");
  const [isReadyToSave, setIsReadyToSave] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const DRAFT_KEY = "SALES_VOUCHER_CREATE_DRAFT";

  //wholsell or retailer
  const [profitConfig, setProfitConfig] = useState({
    customerType: "",
    method: "",
    value: "",
  });

  const { selectedFinYear } = useFinancialYear();
  const { defaultDate, minDate, maxDate, isDateReadOnly } =
    useVoucherDateConfig(selectedFinYear);

  const [itemSelectionModal, setItemSelectionModal] = useState<{
    isOpen: boolean;
    index: number | null;
  }>({ isOpen: false, index: null });
  const [itemSearchTerm, setItemSearchTerm] = useState("");
  const [isRubicSalesMode, setIsRubicSalesMode] = useState<boolean>(false);

  // Robust detection for party ledgers — backend may return different field names

  const isPartyLedger = (l: any) => {
    const groupName =
      l.groupName || l.group_name || (l.group && l.group.name) || "";
    const groupId = l.groupId ?? l.group_id ?? (l.group && l.group.id);

    if (!groupName && !groupId && !l.type) {
      const lower = (l.name || "").toLowerCase();
      return (
        lower.includes("cash") ||
        lower.includes("debtor") ||
        lower.includes("customer") ||
        lower.includes("party")
      );
    }

    if (groupName) {
      const gn = groupName.toString().toLowerCase();
      if (
        gn.includes("sundry") ||
        gn.includes("debtor") ||
        gn.includes("cash") ||
        gn.includes("customer")
      )
        return true;
    }

    if (groupId === 7 || groupId === "7" || groupId === 8 || groupId === "8")
      return true;

    if (
      l.type &&
      (l.type === "customer" || l.type === "cash" || l.type === "party")
    )
      return true;

    return false;
  };

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
      const payload = { ...modalFormData, mode: "sales" };
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/stock-items/add-tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
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

  const partyLedgers = useMemo(() => deduplicateLedgers(ledgers || []), [ledgers]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [stockCategories, setStockCategories] = useState<StockCategory[]>([]);
  const [unitss, setUnits] = useState<any[]>([]);

  // 🔹 Fetch units from backend
  useEffect(() => {
    const fetchUnits = async () => {
      try {
        const res = await fetch(
          `${
            import.meta.env.VITE_API_URL
          }/api/stock-units?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        const data = await res.json();
        console.log("this is unit", data);
        setUnits(data);
      } catch (error) {
        console.error("Failed to fetch units:", error);
      }
    };
    if (companyId) fetchUnits();
  }, [companyId, ownerType, ownerId]);

  // Unified Item Details Helper
  const getItemDetails = (itemId: string) => {
    const item = (stockItems || []).find(
      (i) => String(i.id) === String(itemId)
    );
    if (!item)
      return {
        name: "-",
        hsnCode: "",
        unit: "-",
        unitId: "",
        unitLabel: "",
        gstRate: 0,
        rate: 0,
        batches: [],
      };

    const rawUnit =
      item.unitId ?? item.unit_id ?? item.unit ?? item.unitName ?? null;

    // Look in context units OR local unitss
    const allUnits = [...(units || []), ...(unitss || [])];
    const matchedUnit =
      allUnits.find((u) => String(u.id) === String(rawUnit)) ||
      allUnits.find(
        (u) =>
          u.name?.toLowerCase() === String(rawUnit).toLowerCase() ||
          u.symbol?.toLowerCase() === String(rawUnit).toLowerCase()
      );

    const unitIdResult = matchedUnit?.id ?? rawUnit ?? "";
    const unitLabelResult =
      item.unitName ||
      matchedUnit?.symbol ||
      matchedUnit?.name ||
      String(rawUnit || "");

    return {
      name: item.name,
      hsnCode: item.hsnCode || "",
      unit: unitLabelResult,
      unitId: unitIdResult,
      unitLabel: unitLabelResult,
      gstRate: Number(item.gstRate) || 0,
      gstLedgerId: (item as any).gstLedgerId || "",
      cgstLedgerId: (item as any).cgstLedgerId || "",
      sgstLedgerId: (item as any).sgstLedgerId || "",
      igstLedgerId: (item as any).igstLedgerId || "",
      godown_id: (item as any).godown_id || "",
      rate: Number(
        (item as any).standardSaleRate ||
          (item as any).sellingRate ||
          (item as any).sellingPrice ||
          (item as any).saleRate ||
          (item as any).rate ||
          (item as any).mrp ||
          (item as any).MRP ||
          0
      ),
      mrp: Number(
        (item as any).mrp ||
          (item as any).MRP ||
          (item as any).sellingPrice ||
          0
      ),
      barcode:
        item.barcode ||
        (item as any).bar_code ||
        (item as any).Barcode ||
        (item as any).barcode_number ||
        (item as any).item_barcode ||
        "",
      batches: (() => {
        if (!item.batches) return [];
        try {
          return typeof item.batches === "string"
            ? JSON.parse(item.batches)
            : item.batches;
        } catch {
          return [];
        }
      })(),
      attributes: (item as any).attributes || [],
      tracking_type: (item as any).tracking_type || ((item as any).enableBatchTracking ? "batch" : ""),
    };
  };

  const getUnitName = (unitId: any) => {
    if (!unitId) return "-";
    const unit = unitss.find((u: any) => String(u.id) === String(unitId));
    return unit?.name || unit?.symbol || "-";
  };

  // Check if quotation mode is requested via URL

  const isQuotationMode = searchParams.get("mode") === "quotation";

  // Safe fallbacks for context data - Remove demo data and use only from context
  const safeStockItems = stockItems || [];
  const safeLedgers = useMemo(() => deduplicateLedgers(ledgers || []), [ledgers]);

  // ✅ Hoisted Helper Functions
  function getLedgerName(ledgerId: any) {
    if (!ledgerId) return "-";
    const ledger = safeLedgers.find((l) => String(l.id) === String(ledgerId));
    return ledger ? ledger.name : "-";
  }

  function getLedgerNameById(ledgerId: any) {
    if (!ledgerId) return "-";
    const ledger = safeLedgers.find((l) => String(l.id) === String(ledgerId));
    if (!ledger?.name) return "-";
    const match = ledger.name.match(/(\d+(\.\d+)?)/);
    return match ? `${Number(match[1])}%` : ledger.name;
  }

  function getPartyName(partyId: any) {
    if (!safeLedgers || safeLedgers.length === 0) return "Unknown Party";
    const party = safeLedgers.find(
      (ledger) => String(ledger.id) === String(partyId)
    );
    return party ? party.name : "Unknown Party";
  }

  function getSalesLedgerByGst(gstPercent: any, isIntra: boolean = false) {
    if (!gstPercent || gstPercent <= 0) return null;
    const gstStr = String(Number(gstPercent));
    return safeLedgers.find((l) => {
      const name = (l.name || "").toLowerCase();
      if (!name.includes("sales")) return false;
      if (isIntra) {
        if (!name.includes("intra")) return false;
      } else {
        if (!name.includes("inter")) return false;
      }
      return (
        name.includes(`${gstStr}%`) ||
        name.includes(`${gstStr} %`) ||
        name.includes(`sales ${gstStr}`) ||
        name.includes(`@${gstStr}%`) ||
        name.match(new RegExp(`\\b${gstStr}\\b`))
      );
    });
  }

  // Fetch company info if not available in context
  useEffect(() => {
    if (!companyInfo && companyId && setCompanyInfo) {
      const fetchCompanyInfo = async () => {
        try {
          const res = await fetch(
            `${import.meta.env.VITE_API_URL}/api/company/company/${companyId}`
          );
          if (!res.ok) {
            console.error("Failed to fetch company info:", res.status);
            return;
          }
          const data = await res.json();
          // Update context with fetched company info
          if (data) {
            setCompanyInfo(data);
          }
        } catch (err) {
          console.error("Error fetching company info:", err);
        }
      };
      fetchCompanyInfo();
    }
  }, [companyId, companyInfo, setCompanyInfo]);

  // Fetch Sales Types for voucher type dropdown
  useEffect(() => {
    const fetchSalesTypes = async () => {
      try {
        let url = `${import.meta.env.VITE_API_URL}/api/sales-types`;

        // Add tenant filters if available
        if (companyId && ownerType && ownerId) {
          url += `?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
        }

        const res = await fetch(url);
        const json = await res.json();
        if (json?.success) {
          setSalesTypes(json?.data || []);
          // Auto-select default Sales type (id=1) if not in edit mode
          if (!isEditMode) {
            setSelectedSalesTypeId((prev) => prev || "custom");
          }
        } else {
          setSalesTypes([]);
        }
      } catch (err) {
        console.error("Error fetching sales types:", err);
        setSalesTypes([]);
      }
    };
    fetchSalesTypes();
  }, []);

  // Bill No. preview based on selected sales type (prefix + (current_no+1) + suffix)

  // Check localStorage for companyInfo as fallback
  useEffect(() => {
    if (!companyInfo) {
      try {
        const storedCompanyInfo = localStorage.getItem("companyInfo");
        if (storedCompanyInfo) {
          const parsed = JSON.parse(storedCompanyInfo);
          if (setCompanyInfo && parsed) {
            setCompanyInfo(parsed);
          }
        }
      } catch (err) {
        console.error("Error parsing companyInfo from localStorage:", err);
      }
    }
  }, [companyInfo, setCompanyInfo]);

  const safeCompanyInfo = companyInfo || {
    name: "Your Company Name",
    address: "Your Company Address",
    gstNumber: "N/A",
    phoneNumber: "N/A",
    state: "Default State",
    panNumber: "N/A",
  };

  // State initialization first
  const [isQuotation, setIsQuotation] = useState(isQuotationMode); // Initialize with URL parameter
  const [godownList, setGodownList] = useState<Godown[]>([]);

  // 🔹 PROFIT / PRICING RULE STATE
  const [pricingRule, setPricingRule] = useState<{
    customerType: "wholesale" | "retailer" | "";
    method: "profit_percentage" | "on_mrp" | "";
    value: number; // % value (2, 5, etc.)
  }>({
    customerType: "",
    method: "",
    value: 0,
  });

  const getInitialFormData = (): Omit<VoucherEntry, "id"> => {
    if (isEditMode && id) {
      const existingVoucher = vouchers.find((v) => v.id === id);
      if (existingVoucher) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _, ...voucherData } = existingVoucher;
        return voucherData;
      }
    }
    return {
      date: defaultDate,
      type: isQuotationMode ? "quotation" : "sales",
      // number: `${isQuotation ? "QT" : "XYZ"}0001`, // Will be updated by useEffect
      number: "",
      narration: "",
      referenceNo: "",
      partyId: "",
      mode: "item-invoice",
      dispatchDetails: {
        docNo: "",
        through: "",
        destination: "",
        approxDistance: "",
      },
      salesLedgerId: "", // Add sales ledger field
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
          godownId: "",
          salesLedgerId: "",
          discount: 0,
          discountLedgerId: "",
          hsnCode: "",
        },
      ],
      discountLedgerId: "",
      discountAmount: 0,
      discountPercent: "",
    };
  };

  const [formData, setFormData] = useState<Omit<VoucherEntry, "id">>(() =>
    getInitialFormData()
  );

  // ✅ Always-fresh ref to formData — prevents stale closure in async barcode lookup
  const formDataRef = useRef<any>(null);
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Bill No. preview based on selected sales type (prefix + (current_no+1) + suffix)
  const selectedSalesType = useMemo(() => {
    if (!selectedSalesTypeId) return null;
    return (
      salesTypes.find((st) => String(st.id) === String(selectedSalesTypeId)) ||
      null
    );
  }, [salesTypes, selectedSalesTypeId]);

  const billNoPreview = useMemo(() => {
    if (selectedSalesTypeId === "custom") return formData.number; // Return manual entry for custom
    if (!selectedSalesType) return "";

    const prefix = (selectedSalesType.prefix || "").trim();
    const suffix = (selectedSalesType.suffix || "").trim();
    const nextNo = Number(selectedSalesType.current_no || 1);

    // If both prefix and suffix are empty -> show only next number
    if (!prefix && !suffix) return String(nextNo);
    // Format: prefix + nextNo + suffix
    return `${prefix}${nextNo}${suffix}`;
  }, [selectedSalesType, selectedSalesTypeId, formData.number]);

  // --- DRAFT PERSISTENCE (RESTORE) ---
  useEffect(() => {
    // Skip if in Edit Mode or Copy Mode
    if (isEditMode || copyId) {
      // Don't set ready to save yet; wait for load effects to finish and set it
      return;
    }

    const savedDraft = localStorage.getItem(DRAFT_KEY);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (
          parsed &&
          (parsed.partyId ||
            (parsed.entries && parsed.entries.some((e: any) => e.itemId)))
        ) {
          setFormData(parsed);

          if (parsed.sales_type_id) {
            setSelectedSalesTypeId(parsed.sales_type_id);
          }

          if (parsed.profitConfig) {
            setProfitConfig(parsed.profitConfig);
          }

          Swal.fire({
            toast: true,
            position: "top-end",
            icon: "info",
            title: "Draft restored",
            showConfirmButton: false,
            timer: 2000,
          });
        }
      } catch (e) {
        console.error("Failed to restore Sales Voucher draft", e);
      }
    }
    setIsReadyToSave(true);
  }, [isEditMode, copyId]);

  // --- FETCH DATA FOR COPY ---
  useEffect(() => {
    if (!copyId || isEditMode) return;

    const fetchVoucherForCopy = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/sales-vouchers/${copyId}`
        );
        const data = await res.json();

        // Sales API returns flat JSON on success
        if (data.success || data.id) {
          const v = data;

          // Map entries precisely as loadSingleVoucher does
          const mappedEntries = (v.entries || []).map((e: any, idx: number) => {
            const qty = Number(e.quantity) || 0;
            const rate = Number(e.rate) || 0;
            return {
              id: `e${idx + 1}`,
              itemId: e.itemId || e.item_id || "",
              ledgerId: e.ledgerId?.toString() || e.ledger_id?.toString() || "",
              quantity: qty,
              rate: rate,
              amount:
                v.mode === "accounting-invoice"
                  ? Number(e.amount || 0)
                  : qty * rate, // ✅ Use GROSS amount
              type: e.type || "debit",
              // The component logic expects ledger IDs in these fields,
              // which are then hydrated into rates by a separate useEffect.
              cgstLedgerId: e.cgstRate
                ? String(Number(e.cgstRate))
                : "",
              sgstLedgerId: e.sgstRate
                ? String(Number(e.sgstRate))
                : "",
              igstLedgerId: e.igstRate
                ? String(Number(e.igstRate))
                : "",
              cgstRate: 0,
              sgstRate: 0,
              igstRate: 0,
              godownId: e.godownId || e.godown_id || "",
              salesLedgerId:
                e.salesLedgerId?.toString() ||
                e.sales_ledger_id?.toString() ||
                "",
              discount: Number(e.discount) || 0,
              discountLedgerId:
                e.discountLedgerId || e.discount_ledger_id || "",
              hsnCode: e.hsnCode || e.hsn_code || "",
              batchNumber: e.batchNumber || e.batch_number || "",
              narration: e.narration || "",
            };
          });

          const isVoucherQuotation =
            v.isQuotation === 1 || v.type === "quotation";
          setIsQuotation(isVoucherQuotation);

          setFormData({
            date: defaultDate,
            type: isVoucherQuotation ? "quotation" : "sales",
            number: "", // Clear number for copy (will be auto-filled by useEffect)
            narration: v.narration || "",
            referenceNo: v.referenceNo || v.reference_no || "",
            partyId: String(v.partyId || v.party_id || ""),
            mode: v.mode || "item-invoice",
            dispatchDetails: v.dispatch_details
              ? typeof v.dispatch_details === "string"
                ? JSON.parse(v.dispatch_details)
                : v.dispatch_details
              : {
                  docNo: v.dispatchDocNo || "",
                  through: v.dispatchThrough || "",
                  destination: v.destination || "",
                  approxDistance: v.approxDistance || "",
                },
            salesLedgerId: String(v.sales_ledger_id || v.salesLedgerId || ""),
            entries:
              mappedEntries.length > 0
                ? mappedEntries
                : getInitialFormData().entries,
            discountLedgerId: String(v.overallDiscountLedgerId || v.discountLedgerId || ""),
            discountAmount: Number(v.overallDiscountAmount || v.discountAmount || 0),
            discountPercent: v.overall_discount_percent ? Number(v.overall_discount_percent) : "",
          });

          // Set Sales Type ID if it exists
          if (v.sales_type_id) {
            setSelectedSalesTypeId(String(v.sales_type_id));
          }

          // ✅ PREVENT OVERWRITE BY DRAFT SAVER
          // Set ready to save only after state has settled
          setTimeout(() => {
            setIsReadyToSave(true);
          }, 500);
        }
      } catch (err) {
        console.error("Failed to fetch voucher for copy:", err);
      }
    };

    fetchVoucherForCopy();
  }, [copyId, isEditMode]); // Removed defaultDate to prevent re-runs

  // --- DRAFT PERSISTENCE (SAVE) ---
  useEffect(() => {
    if (!isEditMode && isReadyToSave && formData) {
      const hasData =
        formData.partyId ||
        formData.entries.some((e) => e.itemId || e.quantity > 0);
      if (hasData) {
        // Include additional states in the draft
        const draftData = {
          ...formData,
          sales_type_id: selectedSalesTypeId,
          profitConfig: profitConfig,
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
      }
    }
  }, [formData, isEditMode, isReadyToSave, selectedSalesTypeId, profitConfig]);

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);

    setFormData({
      date: defaultDate,
      type: isQuotationMode ? "quotation" : "sales",
      number: formData.number, // Keep the number
      narration: "",
      referenceNo: "",
      partyId: "",
      mode: "item-invoice",
      dispatchDetails: {
        docNo: "",
        through: "",
        destination: "",
        approxDistance: "",
      },
      salesLedgerId: "",
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
          godownId: "",
          salesLedgerId: "",
          discount: 0,
          discountLedgerId: "",
          hsnCode: "",
        },
      ],
    });

    setSelectedPartyState("");
    setSelectedPartyGst("");
    setProfitConfig({ customerType: "", method: "", value: "" });
    setIsReadyToSave(true);
    setShowConfig(false);

    const Toast = Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true,
    });
    Toast.fire({
      icon: "success",
      title: "Draft Cleared",
    });
  };

  const [godownEnabled, setGodownEnabled] = useState<"yes" | "no">("yes"); // Add state for godown selection visibility
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showPrintOptions, setShowPrintOptions] = useState(false); // Print options popup state
  const [showEWayBill, setShowEWayBill] = useState(false); // E-way Bill modal state
  const [showInvoicePrint, setShowInvoicePrint] = useState(false); // Invoice print modal state
  const [showConfig, setShowConfig] = useState(false);
  const [columnSettings, setColumnSettings] = useState({
    showGodown: true,
    showBatch: true,
    showDiscount: true,
    showGST: true,

    // NEW HEADER FIELD CONTROLS
    showDestination: true,
    showDispatchThrough: true,
    showDispatchDocNo: true,
    showDispatchDetails: false,
  });

  // Add these states at top of your component:
  const [statusMsg, setStatusMsg] = useState("");
  const [statusColor, setStatusColor] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isBarcodeError, setIsBarcodeError] = useState(false);

  // timers for debouncing rate input per entry
  // POS Barcode Scanner Logic (Global Listener)
  const barcodeBuffer = useRef("");
  const lastKeyTime = useRef(0);
  const rateDebounceTimers = useRef<{ [entryId: string]: number | null }>({});

  // Add this useEffect() in component (below states)
  useEffect(() => {
    const ownerId = localStorage.getItem("employee_id") || 1;
    const ownerType = localStorage.getItem("supplier") || "admin";

    if (!profitConfig.customerType || !profitConfig.method) {
      setStatusMsg("");
      return;
    }

    fetch(
      `${import.meta.env.VITE_API_URL}/api/set-profit/${ownerId}/${ownerType}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (!data.success || !data.data) {
          setStatusMsg("Not Set");
          setStatusColor("text-red-600 font-semibold");
          return;
        }

        const saved = data.data;

        let savedMethod = "";
        let savedValue = "";

        // 🔥 IMPORTANT MAPPING
        if (profitConfig.customerType === "wholesale") {
          savedMethod = saved.wholesale_method;
          savedValue = saved.wholesale_value;
        } else if (profitConfig.customerType === "retailer") {
          savedMethod = saved.retailer_method;
          savedValue = saved.retailer_value;
        }

        if (savedMethod === profitConfig.method && Number(savedValue) > 0) {
          setPricingRule({
            customerType: profitConfig.customerType as any,
            method: savedMethod as any,
            value: Number(savedValue),
          });

          setStatusMsg(
            `Value: ${profitConfig.customerType} Profit Percentage ${savedValue}%`
          );
          setStatusColor("text-green-600 font-semibold");
        } else {
          setPricingRule({ customerType: "", method: "", value: 0 });
          setStatusMsg("Not Set");
          setStatusColor("text-red-600 font-semibold");
        }
      })
      .catch(() => {
        setStatusMsg("Not Set");
        setStatusColor("text-red-600 font-semibold");
      });
  }, [profitConfig.customerType, profitConfig.method]);

  // Regenerate voucher number when quotation mode changes
  useEffect(() => {
    if (!isEditMode && !copyId) {
      setFormData((prev) => ({
        ...prev,
        number: "",
        type: isQuotation ? "quotation" : "sales",
      }));
    }
  }, [isQuotation, isEditMode, copyId]);

  // Load voucher in edit mode
  // ================= EDIT MODE LOAD (BACKEND DRIVEN) =================

  useEffect(() => {
    if (!isEditMode || !id) return;

    const loadSingleVoucher = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/sales-vouchers/${id}`
        );

        const data = await res.json();

        if (!data.success) {
          console.error("Failed to load voucher");
          return;
        }

        // 🔥 DIRECT FROM BACKEND
        const toLocalDateStr = (isoString: string) => {
          if (!isoString) return "";
          const d = new Date(isoString);
          if (isNaN(d.getTime())) return "";
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };

        setFormData({
          date: toLocalDateStr(data.date) || "",

          number: data.number || "",

          referenceNo: data.referenceNo || "",

          partyId: data.partyId?.toString() || "",

          mode: data.mode || "item-invoice",

          isQuotation: data.isQuotation === 1,

          salesLedgerId: data.salesLedgerId?.toString() || "",

          dispatchDetails: {
            docNo: data.dispatchDocNo || "",
            through: data.dispatchThrough || "",
            destination: data.destination || "",
            approxDistance: data.approxDistance || "",
          },

          narration: data.narration || "",

          // ⭐ MAIN FIX: Map IDs correctly (Backend stores IDs in Rate columns)
          entries: data.entries.map((e: any, i: any) => ({
            id: "e" + i + Date.now(),

            itemId: e.itemId,

            quantity: Math.round(Number(e.quantity || 0)),

            rate: Math.round(Number(e.rate || 0)),

            discount: Math.round(Number(e.discount || 0)),

            amount:
              data.mode === "accounting-invoice"
                ? Number(e.amount || 0)
                : Math.round(Number(e.quantity || 0)) *
                  Math.round(Number(e.rate || 0)),

            // Map Backend IDs to LedgerId fields (Convert float string "115.00" to int 115)
            cgstLedgerId: e.cgstRate
              ? String(Number(e.cgstRate))
              : "",
            sgstLedgerId: e.sgstRate
              ? String(Number(e.sgstRate))
              : "",
            igstLedgerId: e.igstRate
              ? String(Number(e.igstRate))
              : "",

            // Initialise Rates to 0 (will be hydrated by useEffect)
            cgstRate: 0,
            sgstRate: 0,
            igstRate: 0,

            godownId: e.godownId || "",

            salesLedgerId: e.salesLedgerId?.toString() || "",

            // 🔥 AUTO FROM HISTORY
            hsnCode: e.hsnCode || "",

            batchNumber: e.batchNumber || "",

            // Restore Discount Ledger if saved
            discountLedgerId: e.discountLedgerId || "",

            ledgerId: e.ledgerId?.toString() || "",
            type: e.type || "debit",
            narration: e.narration || "",
          })),

          discountLedgerId: data.overallDiscountLedgerId?.toString() || "",
          discountAmount: Number(data.overallDiscountAmount || 0),
          discountPercent: data.overall_discount_percent ? Number(data.overall_discount_percent) : "",

          type: "sales",
        });

        // ✅ Original entries save karo (stock revert ke liye edit mode mein)
        setOriginalEntries(data.entries || []);

        setIsQuotation(data.isQuotation === 1);
        setSelectedSalesTypeId(data.sales_type_id?.toString() || "");

        // ✅ SET READY TO SAVE AFTER FULL LOAD
        setIsReadyToSave(true);
      } catch (err) {
        console.error("Single voucher load error:", err);
      }
    };

    loadSingleVoucher();
  }, [isEditMode, id]);

  // 🔥 HYDRATE GST RATES FROM LEDGER IDs (Fix for Edit Mode)
  useEffect(() => {
    // Wait until dependencies are loaded
    const ledgersLoaded = ledgers.length > 0;
    const itemsLoaded = stockItems.length > 0;

    if (formData.entries.length === 0) return;

    setFormData((prev) => {
      let hasChanges = false;

      const newEntries = prev.entries.map((entry) => {
        let updatedEntry = { ...entry };
        let entryChanged = false;

        // --- 1. Hydrate Item Details (Batches, Unit, HSN) ---
        if (itemsLoaded && entry.itemId) {
          const details = getItemDetails(entry.itemId);
          if (details.name !== "-") {
            // Batches (only if missing)
            if (
              (!updatedEntry.batches || updatedEntry.batches.length === 0) &&
              details.batches &&
              details.batches.length > 0
            ) {
              updatedEntry.batches = details.batches;
              entryChanged = true;
            }

            // HSN (if missing)
            if (!updatedEntry.hsnCode && details.hsnCode) {
              updatedEntry.hsnCode = details.hsnCode;
              entryChanged = true;
            }

            // Unit (if missing)
            if (!updatedEntry.unitId && details.unitId) {
              updatedEntry.unitId = details.unitId;
              updatedEntry.unitLabel = details.unitLabel;
              entryChanged = true;
            }
          }
        }

        // --- 2. Hydrate GST Rates from Ledger IDs ---
        if (ledgersLoaded) {
          const verifyGstLedger = (ledgerId: any) => {
            if (!ledgerId) return "";
            const l = ledgers.find((x) => String(x.id) === String(ledgerId));
            if (!l) return "";
            const groupId = (l as any).groupId ?? (l as any).group_id ?? ((l as any).group && (l as any).group.id);
            if (String(groupId) === "7" || String(groupId) === "8") return String(ledgerId);
            const upperName = l.name.toUpperCase();
            if (upperName.includes("GST") || upperName.includes("TAX") || upperName.includes("%")) return String(ledgerId);
            return ""; // Incorrectly mapped from rate
          };

          updatedEntry.cgstLedgerId = verifyGstLedger(updatedEntry.cgstLedgerId);
          updatedEntry.sgstLedgerId = verifyGstLedger(updatedEntry.sgstLedgerId);
          updatedEntry.igstLedgerId = verifyGstLedger(updatedEntry.igstLedgerId);

          const extract = (ledgerId: any) => {
            if (!ledgerId) return 0;
            const l = ledgers.find((x) => String(x.id) === String(ledgerId));
            if (l && l.name) {
              const m = l.name.match(/(\d+(\.\d+)?)/);
              return m ? Number(m[1]) : 0;
            }
            return 0;
          };

          let cRate = updatedEntry.cgstLedgerId ? extract(updatedEntry.cgstLedgerId) : 0;
          let sRate = updatedEntry.sgstLedgerId ? extract(updatedEntry.sgstLedgerId) : 0;
          let iRate = updatedEntry.igstLedgerId ? extract(updatedEntry.igstLedgerId) : 0;

          // Fallback to item GST rate if missing or extract failed
          if (itemsLoaded && entry.itemId) {
            const details = getItemDetails(entry.itemId);
            if (details.gstRate > 0) {
              const companyState = safeCompanyInfo?.state || "";
              const partyState = selectedPartyState || "";
              const hasParty = !!formData.partyId;
              const statesMatch =
                hasParty &&
                (!companyState ||
                  !partyState ||
                  companyState.toLowerCase().trim() ===
                    partyState.toLowerCase().trim());

              if (!hasParty || statesMatch) {
                if (cRate === 0) cRate = details.gstRate / 2;
                if (sRate === 0) sRate = details.gstRate / 2;
                iRate = 0;
              } else {
                cRate = 0;
                sRate = 0;
                if (iRate === 0) iRate = details.gstRate;
              }
            }
          }

          if (cRate !== updatedEntry.cgstRate) {
            updatedEntry.cgstRate = cRate;
            entryChanged = true;
          }
          if (sRate !== updatedEntry.sgstRate) {
            updatedEntry.sgstRate = sRate;
            entryChanged = true;
          }
          if (iRate !== updatedEntry.igstRate) {
            updatedEntry.igstRate = iRate;
            entryChanged = true;
          }

          // --- 3. Hydrate Discount Ledger (if discount amount exists but no ledger) ---
          if (
            !updatedEntry.discountLedgerId &&
            updatedEntry.discount > 0 &&
            updatedEntry.rate > 0
          ) {
            const amount =
              (updatedEntry.quantity || 0) * (updatedEntry.rate || 0);
            if (amount > 0) {
              const discountPercent = (updatedEntry.discount / amount) * 100;
              // Find a discount ledger that roughly matches this percent
              const discountLedger = ledgers.find((l) => {
                if (!l.name.toLowerCase().includes("discount")) return false;
                const m = l.name.match(/(\d+(\.\d+)?)/);
                if (!m) return false;
                const p = Number(m[1]);
                return Math.abs(p - discountPercent) < 0.1; // tolerance
              });
              if (discountLedger) {
                updatedEntry.discountLedgerId = discountLedger.id;
                entryChanged = true;
              }
            }
          }
        }

        if (entryChanged) {
          hasChanges = true;
          return updatedEntry;
        }
        return entry;
      });

      if (hasChanges) {
        return { ...prev, entries: newEntries };
      }
      return prev;
    });
  }, [ledgers, stockItems, units, unitss, formData.entries]);

  // voucher no logic
  useEffect(() => {
    if (selectedSalesTypeId === "custom") return; // Skip auto-generation for custom
    if (!selectedSalesType || isEditMode) return;

    const prefix = (selectedSalesType.prefix || "").trim();
    const suffix = (selectedSalesType.suffix || "").trim();
    const nextNo = Number(selectedSalesType.current_no || 1);

    let voucherNo = "";

    if (!prefix && !suffix) {
      voucherNo = String(nextNo);
    } else {
      voucherNo = `${prefix}${nextNo}${suffix}`;
    }

    setFormData((prev) => ({
      ...prev,
      number: voucherNo,
      referenceNo: String(nextNo),
    }));
  }, [selectedSalesType, selectedSalesTypeId]);

  // Set party state when ledgers are loaded and party is selected
  useEffect(() => {
    if (formData.partyId && ledgers.length > 0) {
      const party = ledgers.find(
        (l) => String(l.id) === String(formData.partyId)
      );

      // Try multiple possible field names for state
      const partyAny = party as any;
      const partyState =
        partyAny?.state || partyAny?.state_name || partyAny?.State || "";
      setSelectedPartyState(partyState);

      const partyGst =
        partyAny?.gstNumber || partyAny?.gst_number || partyAny?.gstin || "";
      setSelectedPartyGst(partyGst);
    } else {
      setSelectedPartyState("");
      setSelectedPartyGst("");
    }
  }, [formData.partyId, ledgers, safeCompanyInfo?.state]);

  //godown fatch
  useEffect(() => {
    const fetchGodowns = async () => {
      try {
        const companyId = localStorage.getItem("company_id");
        const ownerType = localStorage.getItem("supplier");
        const ownerId = localStorage.getItem(
          ownerType === "employee" ? "employee_id" : "user_id"
        );

        if (!companyId || !ownerType || !ownerId) {
          console.error("Missing auth params");
          return;
        }

        const url = `${
          import.meta.env.VITE_API_URL
        }/api/godowns?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;

        const res = await fetch(url);
        const data = await res.json();
        const list = data.data || [];
        setGodownList(list);

        // If only 1 godown, auto-fill it for all entries
        if (list.length === 1) {
          const singleGodownId = String(list[0].id);
          setFormData((prev) => ({
            ...prev,
            entries: prev.entries.map((entry) => ({
              ...entry,
              godownId: singleGodownId,
            })),
          }));
        }
      } catch (err) {
        console.error("Error loading godowns:", err);
      }
    };

    fetchGodowns();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const companyId = localStorage.getItem("company_id");
    const ownerType = localStorage.getItem("supplier");
    const ownerId = localStorage.getItem(
      ownerType === "employee" ? "employee_id" : "user_id"
    );
    if (!companyId || !ownerType || !ownerId) return;

    const params = new URLSearchParams({
      company_id: companyId,
      owner_type: ownerType,
      owner_id: ownerId,
    });

    fetch(
      `${import.meta.env.VITE_API_URL}/api/stock-items?${params.toString()}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          console.log("stockitem", data.data);
          setStockItems(data.data);
        } else setStockItems([]);
      })
      .catch(() => setStockItems([]));

    fetch(
      `${import.meta.env.VITE_API_URL}/api/stock-categories?${params.toString()}`
    )
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.data || []);
        setStockCategories(list);
      })
      .catch(() => setStockCategories([]));
  }, []);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    if (name.startsWith("dispatchDetails.")) {
      const field = name.split(".")[1];

      setFormData((prev) => ({
        ...prev,
        dispatchDetails: {
          docNo: prev.dispatchDetails?.docNo || "",
          through: prev.dispatchDetails?.through || "",
          destination: prev.dispatchDetails?.destination || "",
          approxDistance: prev.dispatchDetails?.approxDistance || "",
          [field]: value,
        },
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));

      // When party is selected, store the party's state
      if (name === "partyId" && value) {
        const selectedParty = ledgers.find(
          (l) => String(l.id) === String(value)
        );
        const selectedAny = selectedParty as any;
        const partyState =
          selectedAny?.state ||
          selectedAny?.state_name ||
          selectedAny?.State ||
          "";
        setSelectedPartyState(partyState);

        const partyGst =
          selectedAny?.gstNumber ||
          selectedAny?.gst_number ||
          selectedAny?.gstin ||
          "";
        setSelectedPartyGst(partyGst);

        // Update GST rates for all existing entries when party changes
        if (formData.mode === "item-invoice") {
          setFormData((prev) => {
            const companyState = safeCompanyInfo?.state || "";
            const statesMatch = Boolean(
              (!companyState || !partyState || companyState.toLowerCase().trim() === partyState.toLowerCase().trim())
            );

            // ✅ Extract GST % from ledger names
            const extractGstPercent = (ledgerId: any) => {
              if (!ledgerId) return 0;
              const ledger = safeLedgers.find(
                (l) => String(l.id) === String(ledgerId)
              );
              if (!ledger?.name) return 0;
              const match = ledger.name.match(/(\d+(\.\d+)?)/);
              return match ? Number(match[1]) : 0;
            };

            return {
              ...prev,
              entries: prev.entries.map((entry) => {
                if (!entry.itemId) return entry;

                const itemDetails = getItemDetails(entry.itemId);

                let cRate = extractGstPercent(itemDetails.cgstLedgerId);
                let sRate = extractGstPercent(itemDetails.sgstLedgerId);
                let iRate = extractGstPercent(
                  itemDetails.gstLedgerId || itemDetails.igstLedgerId
                );

                if (itemDetails.gstRate > 0) {
                  if (cRate === 0) cRate = itemDetails.gstRate / 2;
                  if (sRate === 0) sRate = itemDetails.gstRate / 2;
                  if (iRate === 0) iRate = itemDetails.gstRate;
                }

                if (statesMatch) {
                  // Same state: CGST + SGST (extract from ledger names)
                  return {
                    ...entry,
                    cgstRate: cRate,
                    sgstRate: sRate,
                    igstRate: 0,
                    // ✅ Update ledger IDs for intra-state
                    cgstLedgerId: itemDetails.cgstLedgerId || "",
                    sgstLedgerId: itemDetails.sgstLedgerId || "",
                    gstLedgerId: "",
                    igstLedgerId: "",
                  };
                } else {
                  // Different state: IGST
                  return {
                    ...entry,
                    cgstRate: 0,
                    sgstRate: 0,
                    igstRate: iRate,
                    // ✅ Update ledger IDs for inter-state
                    cgstLedgerId: "",
                    sgstLedgerId: "",
                  };
                }
              }),
            };
          });
        }
      }

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
              discount: 0,
              narration: "",
            },
          ],
        }));
      }
    }
    setErrors((prev) => ({ ...prev, [name]: "" }));
    if (e.target.value === "add-new") {
      navigate("/app/masters/ledger/create");
      return;
    }
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
    const list = deduplicateLedgers(partyLedgers || []);
    if (!partySearchTerm) return list;

    if (
      selectedPartyObj &&
      partySearchTerm.trim().toLowerCase() === selectedPartyObj.name.trim().toLowerCase()
    ) {
      return list;
    }

    const term = partySearchTerm.toLowerCase().trim();
    return list.filter((l) => {
      const nameMatch = l.name ? l.name.toLowerCase().includes(term) : false;
      const groupName = l.groupName || l.group_name || (l.group && l.group.name) || "";
      const groupMatch = groupName.toLowerCase().includes(term);
      return nameMatch || groupMatch;
    });
  }, [partyLedgers, partySearchTerm, selectedPartyObj]);

  const handleSelectParty = (ledger: any) => {
    handleChange({
      target: { name: "partyId", value: String(ledger.id) },
    } as any);
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
        handleChange({ target: { name: "partyId", value: "add-new" } } as any);
        setIsPartyDropdownOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsPartyDropdownOpen(false);
    }
  };

  const applyProfit = (baseRate: number, mrp: number = 0) => {
    // 1️⃣ On MRP (Retailer only)
    if (
      profitConfig.customerType === "retailer" &&
      profitConfig.method === "on_mrp"
    ) {
      // If MRP exists, use it. Otherwise fall back to baseRate (or 0)
      return mrp > 0 ? mrp : baseRate;
    }

    // 2️⃣ Profit Percentage (Saved Rule) - Only if method matches
    if (
      profitConfig.method === "profit_percentage" &&
      pricingRule.method === "profit_percentage" &&
      Number(pricingRule.value) > 0
    ) {
      return Number(
        (baseRate + (baseRate * Number(pricingRule.value)) / 100).toFixed(2)
      );
    }

    return baseRate;
  };

  const recalcAmount = (ent: any) => {
    const qty = Number(ent.quantity || 0);
    const rate = Number(ent.rate || 0);
    const profit = Number(ent.profit || 0);

    // ✅ GROSS amount (Qty * Rate) + Profit
    return qty * rate + profit;
  };

  useEffect(() => {
    const isProfitPerc =
      pricingRule.method === "profit_percentage" &&
      Number(pricingRule.value) > 0;
    const isOnMrp =
      profitConfig.method === "on_mrp" &&
      profitConfig.customerType === "retailer";

    // If neither rule is active, do nothing
    if (!isProfitPerc && !isOnMrp) {
      return;
    }

    setFormData((prev) => {
      const updatedEntries = prev.entries.map((entry) => {
        if (!entry.itemId) return entry;

        const details = getItemDetails(entry.itemId);
        let mrp = details.mrp || 0;
        if (entry.batchNumber && entry.batches) {
          const batch = entry.batches.find(
            (b) => b.batchName === entry.batchNumber
          );
          if (batch && (batch.mrp || batch.MRP)) {
            mrp = Number(batch.mrp || batch.MRP);
          }
        }

        // 🟢 ALWAYS use standard rate as base to prevent compounding
        let baseRate = details.rate || 0;

        if (entry.batchNumber && entry.batches) {
          const batch = entry.batches.find((b: any) => b.batchName === entry.batchNumber);
          if (batch) {
            const bRate = Number(batch.openingRate || batch.batchRate || batch.rate || batch.sellingPrice || batch.sellingRate || batch.standardSaleRate || 0);
            if (bRate > 0) baseRate = bRate;
          }
        } else if (baseRate === 0 && details.batches?.length) {
          const defaultBatch = details.batches.find((b: any) => !b.batchName);
          if (defaultBatch) {
            const bRate = Number(defaultBatch.openingRate || defaultBatch.batchRate || defaultBatch.rate || defaultBatch.sellingPrice || defaultBatch.sellingRate || defaultBatch.standardSaleRate || 0);
            if (bRate > 0) baseRate = bRate;
          }
        }
        const newRate = applyProfit(baseRate, mrp);

        if (newRate === entry.rate) return entry;

        return {
          ...entry,
          rate: newRate,
          amount: recalcAmount({ ...entry, rate: newRate }),
        };
      });

      return { ...prev, entries: updatedEntries };
    });
  }, [
    pricingRule.method,
    pricingRule.value,
    profitConfig.method,
    profitConfig.customerType,
  ]);

  const populateItemEntry = useCallback(
    (entry: any, itemId: string | number) => {
      const value = String(itemId);
      const details = getItemDetails(value);
      const gst = details.gstRate || 0;

      const companyState = safeCompanyInfo?.state || "";
      const partyState = selectedPartyState || "";
      const statesMatch = Boolean(
        !companyState ||
          !partyState ||
          companyState.toLowerCase().trim() === partyState.toLowerCase().trim()
      );

      const extractGstPercent = (ledgerId: any) => {
        if (!ledgerId) return 0;
        const ledger = safeLedgers.find(
          (l) => String(l.id) === String(ledgerId)
        );
        if (!ledger?.name) return 0;
        const match = ledger.name.match(/(\d+(\.\d+)?)/);
        return match ? Number(match[1]) : 0;
      };

      let extractedCgst = extractGstPercent(details.cgstLedgerId);
      let extractedSgst = extractGstPercent(details.sgstLedgerId);
      let extractedIgst = extractGstPercent(
        details.gstLedgerId || details.igstLedgerId
      );

      if (details.gstRate > 0) {
        if (extractedCgst === 0) extractedCgst = details.gstRate / 2;
        if (extractedSgst === 0) extractedSgst = details.gstRate / 2;
        if (extractedIgst === 0) extractedIgst = details.gstRate;
      }

      let cgstRate = 0;
      let sgstRate = 0;
      let igstRate = 0;

      if (statesMatch) {
        cgstRate = extractedCgst;
        sgstRate = extractedSgst;
        igstRate = 0;
      } else {
        cgstRate = 0;
        sgstRate = 0;
        igstRate = extractedIgst;
      }

      let itemMrp = Number(details.mrp || 0);
      let initialRate = Number(details.rate || 0);
      if (initialRate === 0 && itemMrp > 0) {
        initialRate = itemMrp;
      }
      let defaultQty = 0;

      if (details.batches?.length) {
        const defaultBatch = details.batches.find((b: any) => !b.batchName);
        if (defaultBatch) {
          const bRate = Number(
            defaultBatch.openingRate ||
              defaultBatch.batchRate ||
              defaultBatch.rate ||
              defaultBatch.sellingPrice ||
              defaultBatch.sellingRate ||
              defaultBatch.standardSaleRate ||
              0
          );
          if (bRate > 0) initialRate = bRate;

          if (defaultBatch.mrp || defaultBatch.MRP) {
            itemMrp = Number(defaultBatch.mrp || defaultBatch.MRP);
            if (initialRate === 0) initialRate = itemMrp;
          }
          if (defaultBatch.batchQuantity) {
            defaultQty = Number(defaultBatch.batchQuantity);
          }
        }
      }

      const newRate = applyProfit(initialRate, itemMrp);

      let totalGst = 0;
      if (statesMatch) {
        totalGst = Number(extractedCgst || 0) + Number(extractedSgst || 0);
      } else {
        totalGst = Number(extractedIgst || 0);
      }
      totalGst = Number(totalGst);

      const salesLedger = getSalesLedgerByGst(totalGst, statesMatch);

      if (!salesLedger && totalGst > 0) {
        Swal.fire({
          icon: "warning",
          title: "Sales Ledger Missing",
          text: `Sales ${totalGst}% ${
            statesMatch ? "Intra" : "Inter"
          } Ledger not found. Please create it first.`,
        });
      }

      const updated = {
        ...entry,
        itemId: value,
        hsnCode: details.hsnCode || "",
        unitId: details.unitId || "",
        unitLabel: details.unitLabel || "",
        batches: details.batches || [],
        batchNumber: "",
        rate: newRate,
        quantity: defaultQty,
        gstRate: gst,
        cgstRate: cgstRate,
        sgstRate: sgstRate,
        igstRate: igstRate,
        gstLedgerId: details.gstLedgerId || "",
        cgstLedgerId: details.cgstLedgerId || "",
        sgstLedgerId: details.sgstLedgerId || "",
        igstLedgerId: details.igstLedgerId || "",
        godownId:
          details.godown_id?.toString() ||
          (godownList.length === 1 ? String(godownList[0].id) : ""),
        salesLedgerId: salesLedger
          ? String(salesLedger.id)
          : entry?.salesLedgerId || "",
        tracking_id: "",
        trackingOptions: [],
        sub_attributes: {},
      };

      updated.amount = recalcAmount(updated);
      return updated;
    },
    [
      safeCompanyInfo?.state,
      selectedPartyState,
      safeLedgers,
      applyProfit,
      godownList,
      getSalesLedgerByGst,
      getItemDetails,
      recalcAmount,
    ]
  );

  const handleRubicItemSelect = useCallback(
    (item: StockItem) => {
      const itemIdStr = String(item.id);
      setFormData((prev) => {
        const entries = [...prev.entries];
        const existingIndex = entries.findIndex(
          (e) => String(e.itemId) === itemIdStr
        );

        if (existingIndex !== -1) {
          const existing = entries[existingIndex];
          const currentQty = Number(existing.quantity || 0);
          const newQty = currentQty + 1;
          const updatedEntry = {
            ...existing,
            quantity: newQty,
          };
          updatedEntry.amount = recalcAmount(updatedEntry);
          entries[existingIndex] = updatedEntry;
          return { ...prev, entries };
        }

        const emptyIndex = entries.findIndex(
          (e) => !e.itemId || e.itemId === ""
        );
        let targetIndex = emptyIndex;
        let baseEntry: any;

        if (targetIndex !== -1) {
          baseEntry = entries[targetIndex];
        } else {
          targetIndex = entries.length;
          baseEntry = {
            id: `e${entries.length + 1}`,
            itemId: "",
            ledgerId: "",
            quantity: 0,
            rate: 0,
            amount: 0,
            type: "debit",
            cgstRate: 0,
            sgstRate: 0,
            igstRate: 0,
            godownId:
              godownList.length === 1 ? String(godownList[0].id) : "",
            salesLedgerId: "",
            discount: 0,
            discountLedgerId: "",
            hsnCode: "",
          };
        }

        let populated = populateItemEntry(baseEntry, itemIdStr);
        if (Number(populated.quantity || 0) <= 0) {
          populated.quantity = 1;
          populated.amount = recalcAmount(populated);
        }

        if (emptyIndex !== -1) {
          entries[emptyIndex] = populated;
        } else {
          entries.push(populated);
        }

        return { ...prev, entries };
      });

      fetch(`${import.meta.env.VITE_API_URL}/api/stock-items/${item.id}`)
        .then((res) => res.json())
        .then((data) => {
          const trackingRows =
            data?.data?.attributeTrackingRows || data?.attributeTrackingRows;
          if (trackingRows) {
            setFormData((prev) => {
              const cur = [...prev.entries];
              const idx = cur.findIndex((e) => String(e.itemId) === itemIdStr);
              if (idx !== -1) {
                cur[idx] = { ...cur[idx], trackingOptions: trackingRows };
              }
              return { ...prev, entries: cur };
            });
          }
        })
        .catch((err) =>
          console.error("Error fetching tracking options:", err)
        );
    },
    [populateItemEntry, recalcAmount, godownList]
  );

  const handleEntryChange = async (
    index: number,
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const updatedEntries = [...formData.entries];
    const entry = updatedEntries[index];

    if (formData.mode === "item-invoice") {
      // 1️⃣ ITEM SELECT
      if (name === "itemId") {
        const updatedEntry = populateItemEntry(entry, value);
        updatedEntries[index] = updatedEntry;

        fetch(`${import.meta.env.VITE_API_URL}/api/stock-items/${value}`)
          .then((res) => res.json())
          .then((data) => {
            const trackingRows =
              data?.data?.attributeTrackingRows || data?.attributeTrackingRows;
            if (trackingRows) {
              setFormData((prev) => {
                const cur = [...prev.entries];
                if (cur[index]) {
                  cur[index] = { ...cur[index], trackingOptions: trackingRows };
                }
                return { ...prev, entries: cur };
              });
            }
          })
          .catch((err) =>
            console.error("Error fetching tracking options:", err)
          );

        setFormData((p) => ({ ...p, entries: updatedEntries }));
        return;
      }

      // TRACKING / ATTRIBUTE SELECT
      if (name === "tracking_id") {
        const trackingId = value;
        const selectedTracking = (entry.trackingOptions || []).find((t: any) => String(t.id) === String(trackingId));
        
        let newSubAttributes: Record<string, string> = {};
        if (selectedTracking && Array.isArray(selectedTracking.subAttributes)) {
           selectedTracking.subAttributes.forEach((sub: any) => {
               newSubAttributes[String(sub.id)] = sub.value || "";
           });
        }
        
        updatedEntries[index] = {
           ...entry,
           tracking_id: trackingId,
           sub_attributes: newSubAttributes,
        };
        
        // Auto-fill qty/rate from tracking if available
        if (selectedTracking) {
           if (Number(selectedTracking.quantity) > 0) updatedEntries[index].quantity = Number(selectedTracking.quantity);
           if (Number(selectedTracking.rate) > 0) updatedEntries[index].rate = Number(selectedTracking.rate);
           updatedEntries[index].amount = recalcAmount(updatedEntries[index]);
        }
        
        setFormData((p) => ({ ...p, entries: updatedEntries }));
        return;
      }

      // 2️⃣ BATCH SELECT

      if (name === "batchNumber") {
        const selected = entry.batches?.find(
          (b: any) => String(b.batchName) === String(value)
        );

        if (!selected) return;

        const autoQty = Number(
          selected.batchQuantity ?? selected.quantity ?? 0
        );

        // ✅ Batch MRP (Check lowercase 'mrp' first based on user data)
        const batchMrp = Number(selected.mrp || selected.MRP || 0);

        // ✅ base rate nikalo
        const bRate = Number(
          selected.openingRate ||
            selected.batchRate ||
            selected.rate ||
            selected.sellingPrice ||
            selected.sellingRate ||
            selected.standardSaleRate ||
            0
        );
        const baseRate =
          bRate > 0 ? bRate : batchMrp > 0 ? batchMrp : Number(entry.rate || 0);

        // ✅ profit apply karo
        const finalRate = applyProfit(baseRate, batchMrp);

        updatedEntries[index] = {
          ...entry,
          batchNumber: value,
          quantity: autoQty,
          rate: finalRate, // ✅ FIXED
          availableQty: autoQty,
        };

        // ✅ amount recalculation
        updatedEntries[index].amount = recalcAmount(updatedEntries[index]);

        setFormData((p) => ({ ...p, entries: updatedEntries }));
        return;
      }

      // 3️⃣ QUANTITY UPDATE
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
        
        const oldQty = Number(entry.quantity || 0);
        // @ts-ignore
        const newQty = value.endsWith('.') ? value : Number(value || 0);

        updatedEntries[index].quantity = newQty;

        // Recalculate discount if percentage ledger selected
        if (updatedEntries[index].discountLedgerId) {
          const ledger = safeLedgers.find(
            (l) =>
              String(l.id) === String(updatedEntries[index].discountLedgerId)
          );
          if (ledger) {
            const m = ledger.name.match(/(\d+(\.\d+)?)/);
            const percent = m ? Number(m[1]) : 0;
            if (percent > 0) {
              const baseAmount =
                newQty * (Number(updatedEntries[index].rate) || 0);
              updatedEntries[index].discount = (baseAmount * percent) / 100;
            }
          }
        }

        updatedEntries[index].amount = recalcAmount(updatedEntries[index]);
        setFormData((p) => ({ ...p, entries: updatedEntries }));
        return;
      }

      // 4️⃣ Rate / Discount / Profit
      if (["rate", "discount", "profit"].includes(name)) {
        // Discount/Profit: apply immediately
        if (name === "discount" || name === "profit") {
          updatedEntries[index][name] = Number(value) || 0;
          updatedEntries[index].amount = recalcAmount(updatedEntries[index]);
          setFormData((p) => ({ ...p, entries: updatedEntries }));
          return;
        }

        // Rate: update shown value immediately, then debounce applying profit percentage
        const rawRate = Number(value) || 0;
        updatedEntries[index].rate = rawRate;

        // Recalculate discount if a percentage ledger is selected
        if (updatedEntries[index].discountLedgerId) {
          const ledger = safeLedgers.find(
            (l) =>
              String(l.id) === String(updatedEntries[index].discountLedgerId)
          );
          if (ledger) {
            const m = ledger.name.match(/(\d+(\.\d+)?)/);
            const percent = m ? Number(m[1]) : 0;
            if (percent > 0) {
              const baseAmount =
                (Number(updatedEntries[index].quantity) || 0) * rawRate;
              updatedEntries[index].discount = (baseAmount * percent) / 100;
            }
          }
        }

        updatedEntries[index].amount = recalcAmount(updatedEntries[index]);
        setFormData((p) => ({ ...p, entries: updatedEntries }));

        const entryId = updatedEntries[index].id || `idx-${index}`;

        // clear existing timer
        const existing = rateDebounceTimers.current[entryId];
        if (existing) clearTimeout(existing);

        // set new debounce timer (2.5s)
        rateDebounceTimers.current[entryId] = window.setTimeout(() => {
          setFormData((prev) => {
            const newEntries = prev.entries.map((e) => ({ ...e }));
            const targetIndex = newEntries.findIndex((e) => e.id === entryId);
            const target =
              (targetIndex !== -1 && newEntries[targetIndex]) ||
              newEntries[index];

            if (!target) return prev;

            const rateToUse = rawRate;

            if (
              pricingRule.method === "profit_percentage" &&
              Number(pricingRule.value) > 0
            ) {
              const adjusted = Number(
                (
                  rateToUse +
                  (rateToUse * Number(pricingRule.value)) / 100
                ).toFixed(2)
              );
              target.rate = adjusted;
            } else {
              target.rate = rateToUse;
            }

            // Recalculate discount again after profit adjustment
            if (target.discountLedgerId) {
              const ledger = safeLedgers.find(
                (l) => String(l.id) === String(target.discountLedgerId)
              );
              if (ledger) {
                const m = ledger.name.match(/(\d+(\.\d+)?)/);
                const percent = m ? Number(m[1]) : 0;
                if (percent > 0) {
                  const baseAmount =
                    (Number(target.quantity) || 0) * (Number(target.rate) || 0);
                  target.discount = (baseAmount * percent) / 100;
                }
              }
            }

            target.amount = recalcAmount(target);

            // clear stored timer
            rateDebounceTimers.current[entryId] = null;

            return { ...prev, entries: newEntries };
          });
        }, 1000);

        return;
      }

      // 5️⃣ Discount Ledger Select
      if (name === "discountLedgerId") {
        updatedEntries[index].discountLedgerId = value;

        if (!value) {
          updatedEntries[index].discount = 0;
        } else {
          const ledger = safeLedgers.find(
            (l) => String(l.id) === String(value)
          );
          if (ledger) {
            const m = ledger.name.match(/(\d+(\.\d+)?)/);
            const percent = m ? Number(m[1]) : 0;
            const baseAmount =
              (Number(updatedEntries[index].quantity) || 0) *
              (Number(updatedEntries[index].rate) || 0);
            updatedEntries[index].discount = (baseAmount * percent) / 100;
          }
        }

        updatedEntries[index].amount = recalcAmount(updatedEntries[index]);
        setFormData((p) => ({ ...p, entries: updatedEntries }));
        return;
      }
    }

    updatedEntries[index][name] =
      type === "number" ? Number(value) || 0 : value;
    setFormData((p) => ({ ...p, entries: updatedEntries }));
  };

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
        godownId: godownList.length === 1 ? String(godownList[0].id) : "",
        salesLedgerId: "",
        discount: 0,
        discountLedgerId: "",
        hsnCode: "",
      } as any;

      if (prev.mode === "accounting-invoice") {
        return {
          ...prev,
          entries: [...prev.entries, { ...newEntry, type: "debit" }],
        };
      }

      return { ...prev, entries: [...prev.entries, newEntry] };
    });
  };

  const removeEntry = (index: number) => {
    if (formData.entries.length <= 1) return;
    const updatedEntries = [...formData.entries];
    updatedEntries.splice(index, 1);
    setFormData((prev) => ({ ...prev, entries: updatedEntries }));
  };

  const performBarcodeLookup = async (code: string) => {
    if (!code.trim()) return;

    try {
      const url = `${
        import.meta.env.VITE_API_URL
      }/api/sales-vouchers/item-by-barcode?barcode=${code}&company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.success && json.data) {
        setIsBarcodeError(false);
        const item = json.data;

        // ✅ CHECK directly using formDataRef (reliable — no async batching issue)
        const existingIndex = (formDataRef.current?.entries || []).findIndex(
          (e: any) => String(e.itemId) === String(item.id)
        );

        if (existingIndex !== -1) {
          // Item pehle se hai — sirf quantity +1 karo, koi naya row nahi
          setFormData((prev) => {
            const updatedEntries = [...prev.entries];
            const existingEntry = updatedEntries[existingIndex];
            const newQty = Number(existingEntry.quantity || 0) + 1;
            const newRate = Number(existingEntry.rate || 0);
            const newAmount = newQty * newRate;

            updatedEntries[existingIndex] = {
              ...existingEntry,
              quantity: newQty,
              amount: newAmount,
            };

            return { ...prev, entries: updatedEntries };
          });

          Swal.mixin({
            toast: true,
            position: "top-end",
            showConfirmButton: false,
            timer: 1500,
            timerProgressBar: true,
          }).fire({ icon: "success", title: `Qty +1: ${item.name}` });
          setBarcodeInput("");
          return;
        }

        // ✅ Naya item — add fresh entry
        const details = getItemDetails(item.id);

        setFormData((prev) => {
          const updatedEntries = [...prev.entries];

          const extractGstPercent = (ledgerId: any) => {
            if (!ledgerId) return 0;
            const ledger = safeLedgers.find(
              (l) => String(l.id) === String(ledgerId)
            );
            if (!ledger?.name) return 0;
            const match = ledger.name.match(/(\d+(\.\d+)?)/);
            return match ? Number(match[1]) : 0;
          };

          const companyState = safeCompanyInfo?.state || "";
          const partyState = selectedPartyState || "";
          const statesMatch = Boolean(
            (!companyState || !partyState || companyState.toLowerCase().trim() === partyState.toLowerCase().trim())
          );

          let extractedCgst = extractGstPercent(details.cgstLedgerId);
          let extractedSgst = extractGstPercent(details.sgstLedgerId);
          let extractedIgst = extractGstPercent(
            details.gstLedgerId || details.igstLedgerId
          );

          if (details.gstRate > 0) {
            if (extractedCgst === 0) extractedCgst = details.gstRate / 2;
            if (extractedSgst === 0) extractedSgst = details.gstRate / 2;
            if (extractedIgst === 0) extractedIgst = details.gstRate;
          }

          let cgstRate = 0,
            sgstRate = 0,
            igstRate = 0;
          if (statesMatch) {
            cgstRate = extractedCgst;
            sgstRate = extractedSgst;
          } else {
            igstRate = extractedIgst;
          }

          const totalGst = statesMatch
            ? extractedCgst + extractedSgst
            : extractedIgst;
          const gstToMatch = Number(totalGst);

          const salesLedgers = ledgers.filter((l) =>
            String(l.name).toLowerCase().includes("sales")
          );
          const matchingSalesLedger = salesLedgers.find((l) => {
            const name = String(l.name).toLowerCase();
            if (statesMatch) {
              if (!name.includes("intra")) return false;
            } else {
              if (!name.includes("inter")) return false;
            }
            return (
              name.includes(`${gstToMatch}%`) ||
              name.includes(`${gstToMatch} %`) ||
              name.includes(`sales ${gstToMatch}`) ||
              name.includes(`@${gstToMatch}%`) ||
              name.includes(`@ ${gstToMatch}%`)
            );
          });

          if (!matchingSalesLedger && gstToMatch > 0) {
            Swal.fire({
              title: "Sales Ledger Missing",
              text: `Sales ${gstToMatch}% Ledger not found. Please create it first.`,
              icon: "warning",
              confirmButtonColor: "#3085d6",
            });
          }

          const newEntry = {
            id: `e${Date.now()}`,
            itemId: String(item.id),
            hsnCode: details.hsnCode || "",
            unitId: details.unitId || "",
            unitLabel: details.unitLabel || "",
            batches: details.batches || [],
            batchNumber: "",
            quantity: 2, // ✅ Set to 2 to match Purchase logic
            rate: details.rate || 0,
            amount: (details.rate || 0) * 2,
            type: "debit",
            cgstRate: cgstRate,
            sgstRate: sgstRate,
            igstRate: igstRate,
            gstLedgerId: details.gstLedgerId || "",
            cgstLedgerId: details.cgstLedgerId || "",
            sgstLedgerId: details.sgstLedgerId || "",
            igstLedgerId: details.igstLedgerId || "",
            salesLedgerId: matchingSalesLedger
              ? String(matchingSalesLedger.id)
              : "",
            godownId: godownList.length === 1 ? String(godownList[0].id) : "",
            discount: 0,
          };

          const lastIndex = updatedEntries.length - 1;
          if (lastIndex >= 0 && !updatedEntries[lastIndex].itemId) {
            updatedEntries[lastIndex] = newEntry as any;
          } else {
            updatedEntries.push(newEntry as any);
          }

          return { ...prev, entries: updatedEntries };
        });

        Swal.mixin({
          toast: true,
          position: "top-end",
          showConfirmButton: false,
          timer: 1500,
          timerProgressBar: true,
        }).fire({ icon: "success", title: `Item added: ${item.name}` });
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
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if source is common inputs (unless it's barcode specific)
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // Option: allow barcode scanning even if inside an input,
        // but typically we let the standard field typing happen.
        // For auto POS we buffer everything.
      }

      const currentTime = Date.now();
      const diff = currentTime - lastKeyTime.current;
      lastKeyTime.current = currentTime;

      // Professional scanners usually type very fast (< 50ms per char)
      if (diff < 50) {
        if (e.key === "Enter") {
          if (barcodeBuffer.current.length >= 3) {
            const code = barcodeBuffer.current;
            // ✅ Clear barcodeInput — prevents debounce useEffect from double-calling
            setBarcodeInput("");
            performBarcodeLookup(code);
            barcodeBuffer.current = "";
          }
        } else if (e.key.length === 1) {
          barcodeBuffer.current += e.key;
        }
      } else {
        // Reset buffer if delay is too long (human typing)
        if (e.key.length === 1) {
          barcodeBuffer.current = e.key;
        } else {
          barcodeBuffer.current = "";
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []); // Run once on mount

  // 🔹 AUTOMATIC BARCODE LOOKUP ON TYPING (Debounced)
  useEffect(() => {
    if (!barcodeInput || barcodeInput.length < 3) return;

    const timer = setTimeout(() => {
      performBarcodeLookup(barcodeInput);
    }, 600); // Wait for 600ms of inactivity before calling API

    return () => clearTimeout(timer);
  }, [barcodeInput]);

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    performBarcodeLookup(barcodeInput);
  };
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const messages: string[] = [];

    const pushError = (key: string, msg: string) => {
      if (!newErrors[key]) {
        newErrors[key] = msg;
        messages.push(msg);
      }
    };

    // ===== HEADER LEVEL VALIDATION =====
    if (!formData.date) pushError("date", "Voucher Date is required");
    if (!formData.number) pushError("number", "Voucher Number is required");

    // Only validate item-invoice specific fields when mode is item-invoice
    if (formData.mode === "item-invoice") {
      if (!formData.partyId) pushError("partyId", "Party is required");
    }

    // ===== ENTRY LEVEL VALIDATION =====
    if (!formData.entries.length) {
      pushError("entries", "At least one entry is required");
    }

    formData.entries.forEach((entry, index) => {
      const row = index + 1;

      if (formData.mode === "item-invoice") {
        if (!entry.itemId)
          pushError(`entry.${index}.itemId`, `Row ${row}: Item is required`);

        if (!entry.salesLedgerId)
          pushError(
            `entry.${index}.salesLedgerId`,
            `Row ${row}: Sales Ledger is required`
          );

        if ((entry.quantity ?? 0) <= 0)
          pushError(
            `entry.${index}.quantity`,
            `Row ${row}: Quantity must be greater than 0`
          );

        if (
          columnSettings.showBatch &&
          entry.batches?.length &&
          !entry.batchNumber
        ) {
          // Check if there are any selectable batches (with a valid batchName)
          const hasSelectableBatches = entry.batches.some(
            (b) => b && b.batchName && String(b.batchName).trim() !== ""
          );

          if (hasSelectableBatches) {
            pushError(
              `entry.${index}.batchNumber`,
              `Row ${row}: Batch selection is required`
            );
          }
        }

        // Godown is now optional, so no validation here
      } else {
        if (!entry.ledgerId)
          pushError(
            `entry.${index}.ledgerId`,
            `Row ${row}: Ledger is required`
          );

        if ((entry.amount ?? 0) <= 0)
          pushError(
            `entry.${index}.amount`,
            `Row ${row}: Amount must be greater than 0`
          );
      }
    });

    if (formData.mode === "accounting-invoice") {
      const { debitTotal, creditTotal } = calculateTotals() as any;
      if (Math.abs((debitTotal || 0) - (creditTotal || 0)) > 0.01) {
        pushError("entries", "Debit and credit amounts must balance");
      }
    }

    setErrors(newErrors);

    return {
      isValid: messages.length === 0,
      messages,
    };
  };

  useEffect(() => {
    const fetchLedgers = async () => {
      try {
        const res = await fetch(
          `${
            import.meta.env.VITE_API_URL
          }/api/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        const data = await res.json();
        console.log("ye hai ledger", data);
        setLedgers(deduplicateLedgers(Array.isArray(data) ? data : []));
      } catch (error) {
        console.error("Failed to fetch ledgers:", error);
      }
    };

    fetchLedgers();
  }, [companyId, ownerType, ownerId]);

  const calculateTotals = () => {
    if (formData.mode === "item-invoice") {
      let subtotal = 0;
      let cgstTotal = 0;
      let sgstTotal = 0;
      let igstTotal = 0;
      let itemDiscountTotal = 0;

      formData.entries.forEach((entry) => {
        const qty = Number(entry.quantity || 0);
        const rate = Number(entry.rate || 0);
        const discount = Number(entry.discount || 0);
        const profit = Number(entry.profit || 0);

        const baseAmount = qty * rate + profit;
        // const netAmount = baseAmount - discount; // GST is calculated on gross amount per user req

        subtotal += baseAmount; // Taxable Value should be GROSS per user request
        itemDiscountTotal += discount;
        cgstTotal += (baseAmount * (entry.cgstRate || 0)) / 100;
        sgstTotal += (baseAmount * (entry.sgstRate || 0)) / 100;
        igstTotal += (baseAmount * (entry.igstRate || 0)) / 100;
      });

      const overallDiscountPercent = Number(formData.discountPercent || 0);
      let overallDiscount = 0;
      if (overallDiscountPercent > 0) {
        overallDiscount = Number(((subtotal * overallDiscountPercent) / 100).toFixed(2));
      } else {
        overallDiscount = Number(formData.discountAmount || 0);
      }

      const total =
        subtotal +
        cgstTotal +
        sgstTotal +
        igstTotal -
        overallDiscount -
        itemDiscountTotal;

      return {
        subtotal,
        cgstTotal,
        sgstTotal,
        igstTotal,
        itemDiscountTotal,
        overallDiscount,
        discountTotal: itemDiscountTotal + overallDiscount,
        total,
      };
    } else {
      let debitTotal = 0;
      let creditTotal = 0;
      let cgstTotal = 0;
      let sgstTotal = 0;
      let igstTotal = 0;
      let discountTotal = 0;
      let subtotal = 0;

      formData.entries.forEach((e) => {
        const amt = Number(e.amount || 0);
        if (e.type === "debit") {
          debitTotal += amt;
        } else {
          creditTotal += amt;
        }

        if (e.ledgerId) {
          const ledgerName = getLedgerName(String(e.ledgerId)).toLowerCase();
          const isTax = /cgst|sgst|igst/i.test(ledgerName);
          const isDiscount =
            /discount|disc|rebate|allowance|less|deduction/i.test(ledgerName);

          if (ledgerName.includes("cgst")) {
            cgstTotal += amt;
          } else if (ledgerName.includes("sgst")) {
            sgstTotal += amt;
          } else if (ledgerName.includes("igst")) {
            igstTotal += amt;
          } else if (isDiscount) {
            discountTotal += amt;
          } else if (
            ledgerName.includes("sales") ||
            (!isTax && !isDiscount && e.type === "credit")
          ) {
            subtotal += amt;
          }
        }
      });

      // Taxable Value is subtotal minus any credit-side discounts or plus debit-side discounts?
      // Usually, it's just the Sales ledger amount.
      const finalSubtotal = subtotal;

      // Net Invoice Value = CreditTotal - DiscountTotal (assuming Discount is a deduction)
      const total = creditTotal - discountTotal;

      return {
        debitTotal,
        creditTotal,
        total: total > 0 ? total : creditTotal,
        subtotal: finalSubtotal,
        cgstTotal,
        sgstTotal,
        igstTotal,
        discountTotal,
      };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsReadyToSave(false); // Stop draft saving immediately when starting submission

    const { isValid, messages } = validateForm();

    if (!isValid) {
      Swal.fire({
        icon: "warning",
        title: "Please fix the following",
        html: `
        <ul style="text-align:left; margin-left:16px">
          ${messages.map((m) => `<li>• ${m}</li>`).join("")}
        </ul>
      `,
        confirmButtonText: "OK",
      });
      return;
    }

    // Prevent double submit by disabling save button
    setIsSaving(true);

    const totals = calculateTotals();

    // Extract partyId from first ledger entry when in accounting mode
    let finalPartyId = formData.partyId;
    if (formData.mode === "accounting-invoice" && formData.entries.length > 0) {
      // Use first debit entry's ledgerId as partyId, or first entry if no debit found
      const firstDebitEntry = formData.entries.find(
        (e) => e.type === "debit" && e.ledgerId
      );
      finalPartyId =
        firstDebitEntry?.ledgerId || formData.entries[0]?.ledgerId || "";
    }

    // Ensure entries have CGST, SGST, IGST rates properly formatted
    const entriesWithGST = formData.entries.map((entry) => ({
      ...entry,
      // Ensure GST rates are numbers and properly set
      cgstRate: Number(entry.cgstRate || 0),
      sgstRate: Number(entry.sgstRate || 0),
      igstRate: Number(entry.igstRate || 0),
      // Ensure all numeric fields are properly formatted
      quantity: Number(entry.quantity || 0),
      rate: Number(entry.rate || 0),
      amount: Number(entry.amount || 0),
      discount: Number(entry.discount || 0),
    }));

    const payload = {
      date: formData.date,
      number: formData.number,
      referenceNo: (() => {
        let val = formData.referenceNo || formData.number || "";
        const parts = String(val).split("/");
        if (parts.length >= 2) {
          const match = parts.find((p) => /^\d+$/.test(p));
          if (match) return match;
        }
        return val;
      })(),
      partyId: finalPartyId,
      salesLedgerId: formData.salesLedgerId,
      narration: formData.narration,
      type: isQuotation ? "quotation" : "sales",
      isQuotation: isQuotation,
      mode: formData.mode, // ✅ Added mode

      companyId,
      ownerType,
      ownerId,

      dispatchDetails: {
        docNo: formData.dispatchDetails?.docNo || "",
        through: formData.dispatchDetails?.through || "",
        destination: formData.dispatchDetails?.destination || "",
        approxDistance: formData.dispatchDetails?.approxDistance || "",
      },

      entries: entriesWithGST,

      // Sales Type and Bill No.
      sales_type_id:
        selectedSalesTypeId && selectedSalesTypeId !== "custom"
          ? Number(selectedSalesTypeId)
          : null,
      bill_no: billNoPreview || null,

      // Ensure totals are properly formatted as numbers with 2 decimal places
      subtotal: Number((totals.subtotal || 0).toFixed(2)),
      cgstTotal: Number((totals.cgstTotal || 0).toFixed(2)),
      sgstTotal: Number((totals.sgstTotal || 0).toFixed(2)),
      igstTotal: Number((totals.igstTotal || 0).toFixed(2)),
      discountTotal: Number((totals.discountTotal || 0).toFixed(2)),
      total: Number((totals.total || 0).toFixed(2)),

      discountLedgerId: formData.discountLedgerId,
      discountAmount: totals.overallDiscount ?? formData.discountAmount,
      overall_discount_percent: Number(formData.discountPercent || 0),
      discountPercent: Number(formData.discountPercent || 0),
    };

    try {
      let voucherSaved = false;

      // ================= UPDATE MODE =================
      if (id) {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/sales-vouchers/${id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        const data = await res.json();
        voucherSaved = data.success;
      }

      // ================= CREATE MODE =================
      if (!id) {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/sales-vouchers`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        const data = await res.json();
        voucherSaved = !!data.id;
      }

      // ❌ Stop if voucher not saved
      if (!voucherSaved) {
        Swal.fire("Error", "Save failed", "error");
        setIsSaving(false);
        return;
      }

      // ================= STOCK UPDATE (EDIT MODE: REVERT OLD + DEDUCT NEW) =================
      console.log(
        "🔴 SALE STOCK UPDATE — companyId:",
        companyId,
        "ownerType:",
        ownerType,
        "ownerId:",
        ownerId
      );

      // ✅ STEP 1: Edit mode mein — pehle purani (original) entries ki quantity wapas stock mein add karo
      if (isEditMode && originalEntries.length > 0) {
        console.log(
          "🔁 Edit mode: Purani entries ka stock wapas add kar rahe hain..."
        );
        await Promise.all(
          originalEntries.map(async (origEntry: any) => {
            if (!origEntry.itemId) return;

            const batchName = origEntry.batchNumber || "";
            const patchUrl = `${import.meta.env.VITE_API_URL}/api/stock-items/${
              origEntry.itemId
            }/batches?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
            const patchBody = {
              batchName: batchName,
              quantity: +Number(origEntry.quantity || 0), // ✅ Positive: stock wapas add
              mode: "add",
            };
            console.log("🔁 PATCH revert old stock:", patchUrl, patchBody);

            try {
              const patchRes = await fetch(patchUrl, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patchBody),
              });
              const patchData = await patchRes.json();
              console.log(
                "🟡 PATCH revert response:",
                patchRes.status,
                patchData
              );
            } catch (err) {
              console.error(
                `⚠️ Stock revert failed for item ${origEntry.itemId}:`,
                err
              );
            }
          })
        );
      }

      // ✅ STEP 2: Nayi entries ki quantity stock se deduct karo
      await Promise.all(
        formData.entries.map(async (entry) => {
          if (!entry.itemId) return;

          const targetBatchName = entry.batchNumber || "";
          const patchUrl = `${import.meta.env.VITE_API_URL}/api/stock-items/${
            entry.itemId
          }/batches?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`;
          const patchBody = {
            batchName: targetBatchName,
            quantity: -Number(entry.quantity || 0), // ✅ Negative: stock deduct
            mode: "add",
          };
          console.log("🔴 PATCH sale stock deduct:", patchUrl, patchBody);

          try {
            const patchRes = await fetch(patchUrl, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patchBody),
            });
            const patchData = await patchRes.json();
            console.log("🟢 PATCH sale response:", patchRes.status, patchData);
          } catch (err) {
            console.error(
              `⚠️ Sale stock deduction failed for item ${entry.itemId}:`,
              err
            );
          }
        })
      );

      // ================= SALE HISTORY SAVE =================
      const historyPayload = formData.entries.map((entry) => {
        const item = getItemDetails(entry.itemId || "");

        return {
          itemName: item.name,
          hsnCode: entry.hsnCode || item.hsnCode || "",
          batchNumber: entry.batchNumber || null,

          qtyChange: -Number(entry.quantity || 0),
          rate: Number(entry.rate || 0),

          movementDate: formData.date,
          voucherNumber: formData.number,
          godownId: entry.godownId ? Number(entry.godownId) : null,
          companyId,
          ownerType,
          ownerId,
        };
      });

      await fetch(
        `${import.meta.env.VITE_API_URL}/api/sales-vouchers/sale-history`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(historyPayload),
        }
      );

      // ✅ CLEAR DRAFT ON SUCCESS
      if (!isEditMode) {
        localStorage.removeItem(DRAFT_KEY);
      }

      // ✅ SUCCESS ALERT
      Swal.fire({
        icon: "success",
        title: "Success",
        text: isEditMode
          ? "Voucher updated successfully"
          : "Voucher saved successfully",
      }).then(() => {
        navigate(new URLSearchParams(window.location.search).get("returnUrl") || "/app/vouchers");
      });
    } catch (err) {
      console.error("Submit error:", err);
      Swal.fire("Error", "Network or server issue", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Print Options Handlers
  const handlePrintClick = () => {
    const selectedItems = formData.entries.filter(
      (entry) =>
        entry.itemId && entry.itemId !== "" && entry.itemId !== "select"
    );

    if (selectedItems.length === 0) {
      alert("Please select at least one item before printing the invoice.");
      return;
    }
    if (!formData.partyId) {
      alert("Please select a party before printing the invoice.");
      return;
    }

    // Show print options popup instead of direct print
    setShowPrintOptions(true);
  };

  const handleGenerateInvoice = () => {
    console.log("Generating Invoice...");
    setShowPrintOptions(false);
    setShowInvoicePrint(true); // Show separate invoice print modal
  };

  const handleGenerateEWayBill = () => {
    console.log("Generating E-way Bill...");
    setShowPrintOptions(false);
    setShowEWayBill(true); // Show E-way Bill generation modal
  };

  const handleGenerateEInvoice = () => {
    console.log("Generating E-Invoice...");
    // TODO: Implement E-Invoice generation using existing format
    alert("E-Invoice generation feature will be implemented soon!");
    setShowPrintOptions(false);
  };

  const handleSendToEmail = () => {
    console.log("Sending to Email...");
    // TODO: Implement email functionality
    alert("Email sending feature will be implemented soon!");
    setShowPrintOptions(false);
  };

  const handleSendToWhatsApp = () => {
    console.log("Sending to WhatsApp...");
    // TODO: Implement WhatsApp sharing
    alert("WhatsApp sharing feature will be implemented soon!");
    setShowPrintOptions(false);
  };

  const {
    subtotal = 0,
    cgstTotal = 0,
    sgstTotal = 0,
    igstTotal = 0,
    discountTotal = 0,
    total: grandTotal = 0,
  } = calculateTotals();

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

  const hasAnyBatch = formData.entries?.some((entry) => {
    if (!entry.itemId) return false;
    const item = stockItems.find((s) => String(s.id) === String(entry.itemId));
    return (item as any)?.tracking_type === "batch" || entry?.batches?.some((b: any) => b?.batchName);
  });

  const hasAnyAttribute = formData.entries?.some((entry) => {
    if (!entry.itemId) return false;
    const item = stockItems.find((s) => String(s.id) === String(entry.itemId));
    return (item as any)?.tracking_type === "attribute" || (entry.trackingOptions && entry.trackingOptions.length > 0);
  });

  const hasAnyGodown = formData.entries?.some((entry) => {
    if (!entry.itemId) return false;
    const item = stockItems.find((s) => String(s.id) === String(entry.itemId));
    return (item as any)?.godown_id || entry.godownId;
  });

  // 🔹 Resolve Party & Sales Ledger for Invoice Print
  const partyLedger = safeLedgers.find(
    (l) => String(l.id) === String(formData.partyId)
  );

  const salesLedger = safeLedgers.find(
    (l) => String(l.id) === String(formData.salesLedgerId)
  );

  const discount = useMemo(() => {
    const matched = safeLedgers.filter((l) =>
      /discount|disc|rebate|allowance|deduction/i.test(l.name)
    );
    return matched.length > 0 ? deduplicateLedgers(matched) : deduplicateLedgers(safeLedgers);
  }, [safeLedgers]);

  const footerDiscountLedgers = useMemo(() => {
    return deduplicateLedgers(safeLedgers || []);
  }, [safeLedgers]);

  return (
    <React.Fragment>
      <div className="pt-[56px] px-2 md:px-4 w-full max-w-full min-w-0">
        <div className="flex flex-wrap items-center mb-6 justify-between gap-4">
          {/* LEFT SIDE - Back Button + Page Title + Rubic Sales Button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(new URLSearchParams(window.location.search).get("returnUrl") || "/app/vouchers")}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <ArrowLeft size={20} />
            </button>

            <h1 className="text-2xl font-bold">
              {isQuotation ? "📋 Sales Quotation" : "📝 Sales Voucher"}
            </h1>

            <RubicSalesButton
              isActive={isRubicSalesMode}
              onToggle={() => setIsRubicSalesMode((prev) => !prev)}
              theme={theme}
            />
          </div>

          {/* RIGHT SIDE - Sales Type + ⚙ SETTINGS ICON */}
          <div className="flex items-center gap-3">
            <select
              name="salesType"
              value={selectedSalesTypeId}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "add-new") {
                  navigate("/app/masters/sales-types");
                  return;
                }
                setSelectedSalesTypeId(v);

                // ✅ AUTO-UPDATE VOUCHER NUMBER (Even in Edit Mode if user explicitly changes type)
                if (v !== "custom" && v !== "") {
                  const newType = salesTypes.find(
                    (st) => String(st.id) === String(v)
                  );
                  if (newType) {
                    const prefix = (newType.prefix || "").trim();
                    const suffix = (newType.suffix || "").trim();
                    const nextNo = Number(newType.current_no || 1);
                    const voucherNo =
                      !prefix && !suffix
                        ? String(nextNo)
                        : `${prefix}${nextNo}${suffix}`;
                    setFormData((prev) => ({ ...prev, number: voucherNo, referenceNo: String(nextNo) }));
                  }
                }
              }}
              className={`${FORM_STYLES.select(theme)} min-w-[120px] text-sm`}
              title="Sales Voucher Type"
            >
              <option value="">Select Sales Type</option>
              <option value="custom">Custom</option>
              {salesTypes.map((s) => (
                <option key={String(s.id)} value={String(s.id)}>
                  {s.sales_type}
                </option>
              ))}
              <option value="add-new">+ Add Sales Voucher Type</option>
            </select>

            <button
              type="button"
              onClick={() => setShowConfig(true)}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
              title="Voucher Display Settings"
            >
              <Settings size={22} />
            </button>
          </div>
        </div>

        <div
          className={`p-4 md:p-6 rounded-lg w-full max-w-full min-w-0 ${
            theme === "dark" ? "bg-gray-800" : "bg-white shadow"
          }`}
        >
          <form onSubmit={handleSubmit}>
            {/* Header Form Fields - Properly Organized in 4-Column Grid */}
            <div
              className={`${
                isRubicSalesMode ? "hidden" : "p-5 mb-8 rounded-xl border"
              } ${
                theme === "dark"
                  ? "bg-gray-800/50 border-gray-700"
                  : "bg-gray-50/50 border-gray-200"
              } space-y-6 shadow-sm`}
            >
              {/* Row 1: Primary Details */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <label
                    className="block text-sm font-semibold mb-1.5 opacity-80"
                    htmlFor="date"
                  >
                    Date
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
                    className={`${FORM_STYLES.input(theme, !!errors.date)} ${
                      isDateReadOnly
                        ? "bg-gray-100 cursor-not-allowed opacity-75"
                        : ""
                    }`}
                  />
                  {errors.date && (
                    <p className="text-red-500 text-xs mt-1">{errors.date}</p>
                  )}
                </div>

                <div>
                  <label
                    className="block text-sm font-semibold mb-1.5 opacity-80"
                    htmlFor="number"
                  >
                    Voucher No.
                  </label>
                  <input
                    type="text"
                    id="number"
                    name="number"
                    value={formData.number}
                    onChange={(e) => {
                      if (selectedSalesTypeId === "custom") {
                        handleChange(e);
                      }
                    }}
                    readOnly={selectedSalesTypeId !== "custom"}
                    className={`${FORM_STYLES.input(theme, !!errors.number)} ${
                      theme === "dark" ? "bg-gray-700/50" : "bg-gray-100"
                    }`}
                  />
                  {errors.number && (
                    <p className="text-red-500 text-xs mt-1">{errors.number}</p>
                  )}
                </div>

                {formData.mode !== "accounting-invoice" && (
                  <div ref={partyComboboxRef} className="relative md:col-span-1">
                    <label
                      className="block text-sm font-semibold mb-1.5 opacity-80"
                      htmlFor="partyId"
                    >
                      Party Name
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
                            handleChange({
                              target: { name: "partyId", value: "" },
                            } as any);
                          }
                        }}
                        onFocus={() => setIsPartyDropdownOpen(true)}
                        onClick={() => setIsPartyDropdownOpen(true)}
                        onKeyDown={handlePartyKeyDown}
                        placeholder="-- Select or Search Party --"
                        className={`${FORM_STYLES.input(
                          theme,
                          !!errors.partyId
                        )} font-medium pr-14`}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-gray-400">
                        {partySearchTerm && (
                          <button
                            type="button"
                            onClick={() => {
                              setPartySearchTerm("");
                              handleChange({
                                target: { name: "partyId", value: "" },
                              } as any);
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
                          onClick={() =>
                            setIsPartyDropdownOpen(!isPartyDropdownOpen)
                          }
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
                            const isSelected =
                              String(ledger.id) === String(formData.partyId);
                            const isHighlighted =
                              index === partyHighlightedIndex;
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
                                onMouseEnter={() =>
                                  setPartyHighlightedIndex(index)
                                }
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
                                  <span className="font-medium">
                                    {ledger.name}
                                  </span>
                                  {groupName && (
                                    <span className="text-[11px] opacity-60">
                                      {groupName}
                                    </span>
                                  )}
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

                        {/* + Add New Ledger */}
                        <div
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleChange({
                              target: { name: "partyId", value: "add-new" },
                            } as any);
                            setIsPartyDropdownOpen(false);
                          }}
                          onMouseEnter={() =>
                            setPartyHighlightedIndex(
                              filteredPartyLedgers.length
                            )
                          }
                          className={`px-3 py-2 text-sm cursor-pointer font-bold border-t flex items-center gap-1.5 ${
                            theme === "dark"
                              ? "border-gray-700 text-blue-400 hover:bg-gray-700"
                              : "border-gray-100 text-blue-600 hover:bg-blue-50"
                          } ${
                            partyHighlightedIndex ===
                            filteredPartyLedgers.length
                              ? theme === "dark"
                                ? "bg-gray-700"
                                : "bg-blue-50"
                              : ""
                          }`}
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add New Ledger</span>
                        </div>
                      </div>
                    )}

                    {selectedPartyState && (
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-blue-600 font-bold flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                        State: {selectedPartyState} | Gst:{" "}
                        {selectedPartyGst || "N/A"}
                      </p>
                    )}
                    {errors.partyId && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.partyId}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label
                    className="block text-sm font-semibold mb-1.5 opacity-80"
                    htmlFor="referenceNo"
                  >
                    Reference No.
                  </label>
                  <input
                    type="text"
                    id="referenceNo"
                    name="referenceNo"
                    value={formData.referenceNo}
                    onChange={handleChange}
                    placeholder="Enter ref #"
                    className={FORM_STYLES.input(theme)}
                  />
                </div>
              </div>

              {/* Row 2: Dispatch Details */}
              {columnSettings.showDispatchDetails && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5 opacity-80">
                      Dispatch Doc No.
                    </label>
                    <input
                      type="text"
                      name="dispatchDetails.docNo"
                      value={formData.dispatchDetails?.docNo ?? ""}
                      onChange={handleChange}
                      placeholder="Doc Number"
                      className={FORM_STYLES.input(theme)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-1.5 opacity-80">
                      Dispatch Through
                    </label>
                    <input
                      type="text"
                      name="dispatchDetails.through"
                      value={formData.dispatchDetails?.through ?? ""}
                      onChange={handleChange}
                      placeholder="Carrier Name"
                      className={FORM_STYLES.input(theme)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-1.5 opacity-80">
                      Destination
                    </label>
                    <input
                      type="text"
                      name="dispatchDetails.destination"
                      value={formData.dispatchDetails?.destination ?? ""}
                      onChange={handleChange}
                      placeholder="Delivery Place"
                      className={FORM_STYLES.input(theme)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-1.5 opacity-80">
                      Distance (KM)
                    </label>
                    <input
                      type="text"
                      name="dispatchDetails.approxDistance"
                      value={formData.dispatchDetails?.approxDistance ?? ""}
                      onChange={handleChange}
                      placeholder="e.g. 120"
                      className={FORM_STYLES.input(theme)}
                    />
                  </div>
                </div>
              )}

              {/* Row 3: Configuration & Mode */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                <div>
                  <label
                    className="block text-sm font-semibold mb-1.5 opacity-80"
                    htmlFor="mode"
                  >
                    Voucher Mode
                  </label>
                  <select
                    id="mode"
                    name="mode"
                    value={formData.mode}
                    onChange={handleChange}
                    className={FORM_STYLES.select(theme)}
                  >
                    <option value="item-invoice">Item Invoice</option>
                    <option value="accounting-invoice">
                      Accounting Invoice
                    </option>
                  </select>
                </div>

                {formData.mode !== "accounting-invoice" && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold mb-2 opacity-80">
                      Pricing Rule / Customer Type
                    </label>
                    <div className="flex flex-wrap items-center gap-3 md:gap-6 p-2 rounded-lg border border-dashed border-gray-400/50">
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="radio"
                            name="customerType"
                            value="wholesale"
                            checked={profitConfig.customerType === "wholesale"}
                            onChange={(e) => {
                              setProfitConfig((prev) => ({
                                ...prev,
                                customerType: e.target.value,
                                method:
                                  prev.method === "on_mrp" ? "" : prev.method,
                              }));
                              setPricingRule({
                                customerType: "",
                                method: "",
                                value: 0,
                              }); // Clear old rule
                            }}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium group-hover:text-blue-500 transition-colors">
                            Wholesale
                          </span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="radio"
                            name="customerType"
                            value="retailer"
                            checked={profitConfig.customerType === "retailer"}
                            onChange={(e) => {
                              setProfitConfig((prev) => ({
                                ...prev,
                                customerType: e.target.value,
                              }));
                              setPricingRule({
                                customerType: "",
                                method: "",
                                value: 0,
                              }); // Clear old rule
                            }}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium group-hover:text-blue-500 transition-colors">
                            Retailer
                          </span>
                        </label>
                      </div>

                      {/* Pricing Strategy Selector */}
                      {(profitConfig.customerType === "wholesale" ||
                        profitConfig.customerType === "retailer") && (
                        <div className="flex items-center gap-3 pl-4 border-l border-gray-300 dark:border-gray-600">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="pricingMethod"
                              value="profit_percentage"
                              checked={
                                profitConfig.method === "profit_percentage"
                              }
                              onChange={(e) =>
                                setProfitConfig({
                                  ...profitConfig,
                                  method: e.target.value,
                                })
                              }
                              className="h-3 w-3"
                            />
                            <span className="text-xs">Profit %</span>
                          </label>

                          {profitConfig.customerType === "retailer" && (
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name="pricingMethod"
                                value="on_mrp"
                                checked={profitConfig.method === "on_mrp"}
                                onChange={(e) =>
                                  setProfitConfig({
                                    ...profitConfig,
                                    method: e.target.value,
                                  })
                                }
                                className="h-3 w-3"
                              />
                              <span className="text-xs">On MRP</span>
                            </label>
                          )}
                        </div>
                      )}

                      {/* Status Msg */}
                      {statusMsg && (
                        <div
                          className={`text-[10px] px-2 py-0.5 rounded-full ${
                            theme === "dark" ? "bg-gray-700" : "bg-white"
                          } shadow-sm ml-auto animate-pulse`}
                        >
                          <span className={statusColor}>{statusMsg}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Rubic Sales Item Card Grid */}
            {isRubicSalesMode && (
              <RubicSalesItemGrid
                stockItems={stockItems}
                stockCategories={stockCategories}
                getItemDetails={getItemDetails}
                entries={formData.entries}
                onSelectItem={handleRubicItemSelect}
                onExitRubicMode={() => setIsRubicSalesMode(false)}
                selectedPartyName={
                  partyLedgers.find((l) => String(l.id) === String(formData.partyId))?.name
                }
                theme={theme}
              />
            )}

            <div
              className={`p-4 mb-6 rounded ${
                theme === "dark" ? "bg-gray-700" : "bg-gray-50"
              }`}
            >
              <div className="flex flex-col md:flex-row gap-4 items-center mb-4">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-blue-600 rounded-full"></span>
                  {formData.mode === "item-invoice"
                    ? "Items & Particulars"
                    : "Ledger Entries"}
                </h3>

                {formData.mode === "item-invoice" && (
                  <div className="flex-1 max-w-md w-full ml-auto">
                    <form
                      onSubmit={handleBarcodeSubmit}
                      className="relative group"
                    >
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2z"></path>
                          <path d="M7 7h1v10H7z"></path>
                          <path d="M10 7h2v10h-2z"></path>
                          <path d="M15 7h1v10h-1z"></path>
                          <path d="M18 7h1v10h-1z"></path>
                        </svg>
                      </div>
                      <input
                        type="text"
                        placeholder="Scan Barcode or Type & Press Enter..."
                        value={barcodeInput}
                        onChange={(e) => {
                          setBarcodeInput(e.target.value);
                          setIsBarcodeError(false); // Reset error when typing
                        }}
                        className={`w-full pl-10 pr-4 py-2 rounded-lg border-2 transition-all outline-none ${
                          isBarcodeError
                            ? "border-red-500 bg-red-50"
                            : theme === "dark"
                            ? "bg-gray-800 border-gray-700 focus:border-blue-500 text-white"
                            : "bg-white border-gray-200 focus:border-blue-500"
                        }`}
                      />
                    </form>
                  </div>
                )}

                <button
                  title="Add Entry"
                  type="button"
                  onClick={addEntry}
                  className={`flex items-center text-sm font-medium px-4 py-2 rounded-lg transition-all shadow-sm ${
                    theme === "dark"
                      ? "bg-blue-600 hover:bg-blue-700 text-white"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  <Plus size={18} className="mr-2" />
                  Add{" "}
                  {formData.mode === "item-invoice" ? "Item Row" : "Ledger Row"}
                </button>
              </div>
              <div className="w-full max-w-full min-w-0">
                {formData.mode === "item-invoice" ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr
                        className={`${
                          theme === "dark"
                            ? "border-b border-gray-600"
                            : "border-b border-gray-300"
                        }`}
                      >
                        <th className="px-1.5 py-1.5 text-left text-[11px] whitespace-nowrap">
                          S.No
                        </th>
                        <th className="px-1.5 py-1.5 text-left text-[11px] whitespace-nowrap">
                          Item
                        </th>
                        <th className="px-1.5 py-1.5 text-left text-[11px] whitespace-nowrap">
                          HSN/SAC
                        </th>
                        {hasAnyAttribute && (
                          <th className="px-1.5 py-1.5 text-left text-[11px] whitespace-nowrap">
                            Attribute
                          </th>
                        )}
                        {columnSettings.showBatch && hasAnyBatch && (
                          <th className="px-1.5 py-1.5 text-left text-[11px] whitespace-nowrap">Batch</th>
                        )}

                        <th className="px-1.5 py-1.5 text-right text-[11px] whitespace-nowrap">
                          Quantity
                        </th>
                        <th className="px-1.5 py-1.5 text-left text-[11px] whitespace-nowrap">
                          Unit
                        </th>
                        <th className="px-1.5 py-1.5 text-right text-[11px] whitespace-nowrap">
                          Rate
                        </th>
                        {profitConfig.customerType === "retailer" &&
                          profitConfig.method === "on_mrp" && (
                            <th className="px-1.5 py-1.5 text-right text-[11px] whitespace-nowrap">
                              Profit
                            </th>
                          )}
                        {columnSettings.showGST &&
                          (() => {
                            const hasParty = !!formData.partyId;
                            const companyState = safeCompanyInfo?.state || "";
                            const partyState = selectedPartyState || "";

                            const isInterState =
                              hasParty &&
                              !!companyState &&
                              !!partyState &&
                              companyState.toLowerCase().trim() !== partyState.toLowerCase().trim();

                            // ✅ Default (no party or intra-state) → SGST + CGST
                            if (!isInterState) {
                              return (
                                <>
                                  <th className="px-1.5 py-1.5 text-center text-[11px] whitespace-nowrap">
                                    SGST%
                                  </th>
                                  <th className="px-1.5 py-1.5 text-center text-[11px] whitespace-nowrap">
                                    CGST%
                                  </th>
                                </>
                              );
                            }

                            // ✅ Inter-state → IGST
                            return (
                              <th className="px-1.5 py-1.5 text-center text-[11px] whitespace-nowrap">
                                IGST%
                              </th>
                            );
                          })()}

                        <th className="px-1.5 py-1.5 text-right text-[11px] whitespace-nowrap">
                          Taxable
                        </th>
                        {columnSettings.showDiscount && (
                          <th className="px-1.5 py-1.5 text-left text-[11px] whitespace-nowrap">Discount</th>
                        )}

                        {godownEnabled === "yes" &&
                          columnSettings.showGodown && hasAnyGodown && (
                            <th className="px-1.5 py-1.5 text-left text-[11px] whitespace-nowrap">
                              Godown
                            </th>
                          )}
                        <th className="px-1.5 py-1.5 text-left text-[11px] whitespace-nowrap">
                          Sales Ledger
                        </th>
                        <th className="px-1.5 py-1.5 text-center text-[11px] whitespace-nowrap">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.entries.map((entry, index) => {
                        const itemDetails = getItemDetails(entry.itemId || "");

                        // ✅ SELECTED BATCH
                        const selectedBatch = entry.batches?.find(
                          (b) => b.batchName === entry.batchNumber
                        );

                        // Check if party is selected and states match for dynamic column display
                        const hasParty = !!formData.partyId;
                        const companyState = safeCompanyInfo?.state || "";
                        const partyState = selectedPartyState || "";
                        const statesMatch =
                          hasParty &&
                          (!companyState || !partyState || companyState.toLowerCase().trim() === partyState.toLowerCase().trim());

                        return (
                          <tr
                            key={entry.id}
                            className={`${
                              theme === "dark"
                                ? "border-b border-gray-600"
                                : "border-b border-gray-300"
                            }`}
                          >
                            {/* SR */}
                            <td className="px-1 py-1 text-center text-[11px] align-top">
                              {index + 1}
                            </td>

                            {/* ITEM */}
                            <td className="px-1 py-1 align-top">
                              <div
                                onClick={() =>
                                  setItemSelectionModal({ isOpen: true, index })
                                }
                                className={`${FORM_STYLES.tableSelect(
                                  theme
                                )} text-[11px] w-full max-w-full cursor-pointer flex items-center min-h-[26px] px-1 py-0.5 overflow-hidden whitespace-nowrap truncate`}
                                title={
                                  entry.itemId
                                    ? stockItems.find(
                                        (i) =>
                                          String(i.id) === String(entry.itemId)
                                      )?.name || "Select Item"
                                    : "Select Item"
                                }
                              >
                                {entry.itemId ? (
                                  stockItems.find(
                                    (i) => String(i.id) === String(entry.itemId)
                                  )?.name || "Select Item"
                                ) : (
                                  <span className="text-gray-400">
                                    Select Item
                                  </span>
                                )}
                              </div>

                            </td>

                            {/* HSN */}
                            <td className="px-1 py-1 text-center text-[11px] align-top">
                              <input
                                type="text"
                                name="hsnCode"
                                value={entry.hsnCode || ""}
                                onChange={(e) => handleEntryChange(index, e)}
                                className={`${FORM_STYLES.tableInput(
                                  theme
                                )} text-center text-[11px] px-1 py-0.5 w-full`}
                                placeholder="HSN"
                              />
                            </td>

                            {/* ATTRIBUTE */}
                            {hasAnyAttribute && (
                              <td className="px-1 py-1 text-center text-[11px] align-top">
                                {itemDetails.tracking_type === "attribute" ? (
                                  <>
                                    <select
                                      name="tracking_id"
                                      value={entry.tracking_id || ""}
                                      onChange={(e) => handleEntryChange(index, e)}
                                      className={`${FORM_STYLES.tableSelect(theme)} w-full text-[11px] px-1 py-0.5 truncate`}
                                    >
                                      <option value="">Attribute</option>
                                      {(entry.trackingOptions || []).map((t: any) => {
                                        const pAttr = masterAttributes.find(ma => String(ma.id) === String(t.primaryAttribute));
                                        return (
                                          <option key={t.id} value={t.id}>
                                            {pAttr ? pAttr.name : 'Attribute'}: {t.primaryAttributeValue}
                                          </option>
                                        );
                                      })}
                                    </select>
                                    
                                    {/* DISPLAY SUB-ATTRIBUTES IN ROW */}
                                    {entry.sub_attributes && Object.keys(entry.sub_attributes).length > 0 && (
                                      <div className="mt-1 text-left text-[9px] text-gray-500 bg-gray-50 p-0.5 rounded border border-gray-200">
                                        {Object.entries(entry.sub_attributes).map(([subId, val]) => {
                                          const subAttr = masterAttributes.find(a => String(a.id) === String(subId));
                                          return subAttr && val ? (
                                            <div key={subId} className="flex justify-between border-b border-gray-100 last:border-0">
                                              <span className="text-gray-400 capitalize">{subAttr.name}:</span>
                                              <span className="font-medium text-gray-700">{String(val)}</span>
                                            </div>
                                          ) : null;
                                        })}
                                      </div>
                                    )}
                                  </>
                                ) : null}
                              </td>
                            )}

                            {/* BATCH */}
                            {columnSettings.showBatch && hasAnyBatch && (
                                <td className="px-1 py-1 align-top">
                                  {itemDetails.tracking_type === "batch" ? (
                                    <>
                                      <select
                                    name="batchNumber"
                                    value={entry.batchNumber || ""}
                                    onChange={(e) =>
                                      handleEntryChange(index, e)
                                    }
                                    className={`${FORM_STYLES.tableSelect(
                                      theme
                                    )} w-full text-[11px] px-1 py-0.5 truncate`}
                                  >
                                    <option value="">Batch</option>

                                    {entry.batches
                                      .filter((b) => b.batchName)
                                      .map((b, i) => {
                                        const qty = Number(
                                          b.batchQuantity ?? b.quantity ?? 0
                                        );

                                        return (
                                          <option key={i} value={b.batchName}>
                                            {`${b.batchName} (Qty:${qty})`}
                                          </option>
                                        );
                                      })}
                                      </select>
                                    </>
                                  ) : null}
                                </td>
                              )}

                            {/* ✅ QTY (BATCH WISE) */}
                            <td className="px-1 py-2 min-w-[55px] align-top">
                              <input
                                type="number"
                                step="any"
                                name="quantity"
                                value={entry.quantity || ""}
                                onChange={(e) => handleEntryChange(index, e)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.preventDefault();
                                }}
                                className={`${FORM_STYLES.tableInput(
                                  theme
                                )} text-right text-xs`}
                                min={0}
                              />
                            </td>

                            {/* UNIT */}
                            <td className="px-1 py-2 min-w-[45px] text-center text-xs align-top">
                              {itemDetails.unit || getUnitName(entry.unitId)}
                            </td>

                            {/* RATE */}
                            <td className="px-1 py-2 min-w-[70px] align-top">
                              <input
                                type="number"
                                name="rate"
                                value={entry.rate || ""}
                                onChange={(e) => handleEntryChange(index, e)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.preventDefault();
                                }}
                                className={`${FORM_STYLES.tableInput(
                                  theme
                                )} text-right text-xs`}
                              />
                            </td>

                            {/* PROFIT */}
                            {profitConfig.customerType === "retailer" &&
                              profitConfig.method === "on_mrp" && (
                                <td className="px-1 py-2 min-w-[70px] align-top">
                                  <input
                                    type="number"
                                    name="profit"
                                    value={entry.profit ?? ""}
                                    onChange={(e) =>
                                      handleEntryChange(index, e)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") e.preventDefault();
                                    }}
                                    className={`${FORM_STYLES.tableInput(
                                      theme
                                    )} text-right text-xs`}
                                    placeholder="Profit"
                                  />
                                </td>
                              )}

                            {/* GST */}
                            {columnSettings.showGST &&
                              (() => {
                                const isInterState =
                                  hasParty &&
                                  !!companyState &&
                                  !!partyState &&
                                  companyState.toLowerCase().trim() !== partyState.toLowerCase().trim();

                                if (!isInterState) {
                                  return (
                                    <>
                                      <td
                                        className="px-1 py-2 text-center text-xs align-top pt-3 font-medium truncate"
                                        title={entry.sgstLedgerId ? getLedgerNameById(entry.sgstLedgerId) : undefined}
                                      >
                                        {`${Number(entry.sgstRate || 0)}%`}
                                      </td>
                                      <td
                                        className="px-1 py-2 text-center text-xs align-top pt-3 font-medium truncate"
                                        title={entry.cgstLedgerId ? getLedgerNameById(entry.cgstLedgerId) : undefined}
                                      >
                                        {`${Number(entry.cgstRate || 0)}%`}
                                      </td>
                                    </>
                                  );
                                } else {
                                  return (
                                    <td
                                      className="px-1 py-2 text-center text-xs align-top pt-3 font-medium truncate"
                                      title={entry.igstLedgerId ? getLedgerNameById(entry.igstLedgerId) : undefined}
                                    >
                                      {`${Number(entry.igstRate || 0)}%`}
                                    </td>
                                  );
                                }
                              })()}

                            {/* AMOUNT */}
                            <td className="px-1 py-2 text-center min-w-[75px] font-medium text-xs align-top">
                              {Number(entry.amount ?? 0).toLocaleString()}
                            </td>

                            {/* DISCOUNT */}
                            {columnSettings.showDiscount && (
                              <td className="px-1 py-1 align-top">
                                <select
                                  name="discountLedgerId"
                                  value={entry.discountLedgerId || ""}
                                  onChange={(e) => handleEntryChange(index, e)}
                                  className={`${FORM_STYLES.tableSelect(
                                    theme
                                  )} text-[11px] w-full max-w-full truncate px-1 py-0.5`}
                                >
                                  <option value="">Select Discount</option>
                                  {discount.map((l) => (
                                    <option key={l.id} value={l.id}>
                                      {l.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            )}

                            {/* GODOWN */}
                            {godownEnabled === "yes" &&
                              columnSettings.showGodown && hasAnyGodown && (
                                <td className="px-1 py-1 align-top">
                                  {godownList.length === 1 ? (
                                    <input
                                      readOnly
                                      tabIndex={-1}
                                      value={godownList[0].name}
                                      className={`${FORM_STYLES.tableInput(
                                        theme
                                      )} w-full text-[11px] px-1 py-0.5 truncate`}
                                    />
                                  ) : (
                                    <select
                                      name="godownId"
                                      value={entry.godownId}
                                      onChange={(e) =>
                                        handleEntryChange(index, e)
                                      }
                                      className={`${FORM_STYLES.tableSelect(
                                        theme
                                      )} w-full text-[11px] px-1 py-0.5 truncate`}
                                    >
                                      <option value="">Select Godown</option>
                                      {godownList.map((g) => (
                                        <option key={g.id} value={g.id}>
                                          {g.name}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </td>
                              )}

                            {/* SALES LEDGER */}
                            <td className="px-1 py-1 align-top">
                              <select
                                name="salesLedgerId"
                                value={entry.salesLedgerId || ""}
                                onChange={(e) => handleEntryChange(index, e)}
                                className={`${FORM_STYLES.tableSelect(
                                  theme
                                )} text-[11px] w-full max-w-full truncate px-1 py-0.5 ${
                                  errors[`entry.${index}.salesLedgerId`]
                                    ? "border-red-500"
                                    : ""
                                }`}
                              >
                                <option value="">Select Ledger</option>
                                {deduplicateLedgers(
                                  ledgers.filter((l) =>
                                    l.name && l.name.toLowerCase().includes("sales")
                                  )
                                ).map((ledger) => (
                                  <option key={ledger.id} value={ledger.id}>
                                    {ledger.name}
                                  </option>
                                ))}
                              </select>
                              {errors[`entry.${index}.salesLedgerId`] && (
                                <p className="text-red-500 text-[10px] mt-0.5">
                                  {errors[`entry.${index}.salesLedgerId`]}
                                </p>
                              )}
                            </td>

                            {/* DELETE */}
                            <td className="px-1 py-2 text-center min-w-[40px] align-top">
                              <button
                                type="button"
                                onClick={() => removeEntry(index)}
                                disabled={formData.entries.length <= 1}
                                className={`p-1 rounded ${
                                  formData.entries.length <= 1
                                    ? "opacity-50 cursor-not-allowed"
                                    : theme === "dark"
                                    ? "hover:bg-gray-600"
                                    : "hover:bg-gray-200"
                                }`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {(() => {
                        const totals = calculateTotals() as any;
                        const {
                          subtotal = 0,
                          cgstTotal = 0,
                          sgstTotal = 0,
                          igstTotal = 0,
                        } = totals;

                        // Check if party is selected and states match for dynamic column calculation
                        const hasParty = !!formData.partyId;
                        const companyState = safeCompanyInfo?.state || "";
                        const partyState = selectedPartyState || "";
                        const isInterState =
                          hasParty &&
                          !!companyState &&
                          !!partyState &&
                          companyState.toLowerCase().trim() !== partyState.toLowerCase().trim();

                        // Calculate total columns dynamically (Base: S.No, Item, HSN, Qty, Unit, Rate, Taxable, Sales Ledger, Action = 9)
                        let totalCols = 9;
                        if (columnSettings.showBatch && hasAnyBatch)
                          totalCols += 1; // Batch
                        if (hasAnyAttribute) totalCols += 1; // Attribute
                        if (
                          profitConfig.customerType === "retailer" &&
                          profitConfig.method === "on_mrp"
                        )
                          totalCols += 1; // Profit
                        if (columnSettings.showGST) {
                          if (isInterState) {
                            // Inter-state: IGST% (1 column)
                            totalCols += 1;
                          } else {
                            // Default / Intra-state: SGST%, CGST% (2 columns)
                            totalCols += 2;
                          }
                        }
                        if (columnSettings.showDiscount) totalCols += 1; // Discount
                        if (
                          godownEnabled === "yes" &&
                          columnSettings.showGodown &&
                          hasAnyGodown
                        )
                          totalCols += 1; // Godown
                        // Action column is separate, so colspan = totalCols - 1 (excluding Action)
                        const colspan = totalCols - 1;
                        return (
                          <>
                            {/* SUBTOTAL */}
                            <tr
                              className={`font-semibold ${
                                theme === "dark"
                                  ? "border-t border-gray-600"
                                  : "border-t border-gray-300"
                              }`}
                            >
                              <td
                                className="px-4 py-2 text-left"
                                colSpan={colspan}
                              >
                                Taxable Value:
                              </td>
                              <td className="px-4 py-2 text-right">
                                ₹{subtotal.toLocaleString()}
                              </td>
                            </tr>

                            {/* CGST TOTAL - Show when intra-state / default and cgstTotal > 0 */}
                            {!isInterState && cgstTotal > 0 && (
                              <tr
                                className={`font-semibold ${
                                  theme === "dark"
                                    ? "border-t border-gray-600"
                                    : "border-t border-gray-300"
                                }`}
                              >
                                <td
                                  className="px-4 py-2 text-left"
                                  colSpan={colspan}
                                >
                                  CGST Total:
                                </td>
                                <td className="px-4 py-2 text-right text-blue-600 font-bold">
                                  ₹{cgstTotal.toFixed(2)}
                                </td>
                              </tr>
                            )}

                            {/* SGST TOTAL - Show when intra-state / default and sgstTotal > 0 */}
                            {!isInterState && sgstTotal > 0 && (
                              <tr
                                className={`font-semibold ${
                                  theme === "dark"
                                    ? "border-t border-gray-600"
                                    : "border-t border-gray-300"
                                }`}
                              >
                                <td
                                  className="px-4 py-2 text-left"
                                  colSpan={colspan}
                                >
                                  SGST Total:
                                </td>
                                <td className="px-4 py-2 text-right text-blue-600 font-bold">
                                  ₹{sgstTotal.toFixed(2)}
                                </td>
                              </tr>
                            )}

                            {/* IGST TOTAL - Show when inter-state and igstTotal > 0 */}
                            {isInterState && igstTotal > 0 && (
                              <tr
                                className={`font-semibold ${
                                  theme === "dark"
                                    ? "border-t border-gray-600"
                                    : "border-t border-gray-300"
                                }`}
                              >
                                <td
                                  className="px-4 py-2 text-left"
                                  colSpan={colspan}
                                >
                                  IGST Total:
                                </td>
                                <td className="px-4 py-2 text-right text-blue-600 font-bold">
                                  ₹{igstTotal.toFixed(2)}
                                </td>
                              </tr>
                            )}

                            {/* GST TOTAL - Always show when GST is present */}
                            {cgstTotal + sgstTotal + igstTotal > 0 && (
                              <tr
                                className={`font-semibold ${
                                  theme === "dark"
                                    ? "border-t border-gray-600"
                                    : "border-t border-gray-300"
                                }`}
                              >
                                <td
                                  className="px-4 py-2 text-left"
                                  colSpan={colspan}
                                >
                                  GST Total:
                                </td>
                                <td className="px-4 py-2 text-right text-blue-600 font-bold">
                                  ₹
                                  {(cgstTotal + sgstTotal + igstTotal).toFixed(
                                    2
                                  )}
                                </td>
                              </tr>
                            )}

                            {/* DISCOUNT */}
                            <tr
                              className={`font-semibold ${
                                theme === "dark"
                                  ? "border-t border-gray-600"
                                  : "border-t border-gray-300"
                              }`}
                            >
                              <td
                                className="px-4 py-2 text-left"
                                colSpan={colspan}
                              >
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span>Overall:</span>
                                  <select
                                    name="discountLedgerId"
                                    value={formData.discountLedgerId || ""}
                                    onChange={handleChange}
                                    className={`${FORM_STYLES.tableSelect(
                                      theme
                                    )} !w-48 text-xs`}
                                  >
                                    <option value="">
                                      Select Discount Ledger
                                    </option>
                                    {footerDiscountLedgers.map((l) => (
                                      <option key={String(l.id)} value={String(l.id)}>
                                        {l.name}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      name="discountPercent"
                                      value={formData.discountPercent ?? ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === "") {
                                          setFormData((prev) => ({
                                            ...prev,
                                            discountPercent: "",
                                            discountAmount: 0,
                                          }));
                                          return;
                                        }
                                        let num = parseFloat(val);
                                        if (isNaN(num)) {
                                          setFormData((prev) => ({
                                            ...prev,
                                            discountPercent: "",
                                            discountAmount: 0,
                                          }));
                                          return;
                                        }
                                        if (num < 0) num = 0;
                                        if (num > 100) num = 100;

                                        const currentSubtotal = totals?.subtotal || 0;
                                        const calcAmount = Number(((currentSubtotal * num) / 100).toFixed(2));
                                        setFormData((prev) => ({
                                          ...prev,
                                          discountPercent: val,
                                          discountAmount: calcAmount,
                                        }));
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") e.preventDefault();
                                      }}
                                      min="0"
                                      max="100"
                                      step="any"
                                      className={`w-16 p-1 text-center border rounded text-xs outline-none transition-colors font-semibold ${
                                        theme === "dark"
                                          ? "bg-gray-700 text-white border-gray-600 focus:border-blue-400"
                                          : "bg-white text-gray-900 border-gray-300 focus:border-blue-500"
                                      }`}
                                    />
                                    <span className={`text-xs font-semibold ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                                      %
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2 text-right text-red-600 font-bold">
                                <div className="flex items-center justify-end gap-1">
                                  <span>₹</span>
                                  <input
                                    type="number"
                                    name="discountAmount"
                                    value={totals.overallDiscount ? totals.overallDiscount : (formData.discountAmount || "")}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === "") {
                                        setFormData((prev) => ({
                                          ...prev,
                                          discountAmount: "",
                                          discountPercent: "",
                                        }));
                                        return;
                                      }
                                      let amt = parseFloat(val);
                                      if (isNaN(amt)) return;
                                      if (amt < 0) amt = 0;
                                      const currentSubtotal = totals?.subtotal || 0;
                                      const calcPercent = currentSubtotal > 0 ? Number(((amt / currentSubtotal) * 100).toFixed(2)) : 0;
                                      setFormData((prev) => ({
                                        ...prev,
                                        discountAmount: amt,
                                        discountPercent: calcPercent <= 100 ? calcPercent : "",
                                      }));
                                    }}
                                    className={`w-24 p-1 text-right border rounded font-bold text-red-600 outline-none focus:border-blue-500 text-xs ${
                                      theme === "dark"
                                        ? "bg-gray-700 border-gray-600"
                                        : "bg-white border-gray-300"
                                    }`}
                                  />
                                </div>
                              </td>
                            </tr>

                            {/* GRAND TOTAL */}
                            <tr
                              className={`font-bold ${
                                theme === "dark"
                                  ? "border-t-2 border-gray-500"
                                  : "border-t-2 border-black"
                              }`}
                            >
                              <td
                                className="px-4 py-2 text-left text-lg"
                                colSpan={colspan}
                              >
                                Grand Total:
                              </td>
                              <td className="px-4 py-2 text-right text-lg text-green-600 font-bold">
                                ₹{grandTotal.toFixed(2)}
                              </td>
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
                        className={`${
                          theme === "dark"
                            ? "border-b border-gray-600"
                            : "border-b border-gray-300"
                        }`}
                      >
                        <th className="px-4 py-2 text-left">S.No</th>
                        <th className="px-4 py-2 text-left">Ledger</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                        <th className="px-4 py-2 text-left">Type</th>
                        <th className="px-4 py-2 text-left">Narration</th>
                        <th className="px-4 py-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.entries.map((entry, index) => (
                        <tr
                          key={entry.id}
                          className={`${
                            theme === "dark"
                              ? "border-b border-gray-600"
                              : "border-b border-gray-300"
                          }`}
                        >
                          <td className="px-4 py-2">{index + 1}</td>
                          <td className="px-4 py-2">
                            <select
                              title="Select Ledger"
                              name="ledgerId"
                              value={entry.ledgerId ?? ""}
                              onChange={(e) => handleEntryChange(index, e)}
                              required
                              className={`${FORM_STYLES.tableSelect(theme)} ${
                                errors[`entry${index}.ledgerId`]
                                  ? "border-red-500"
                                  : ""
                              }`}
                            >
                              <option value="">Select Ledger</option>
                              {safeLedgers.map((ledger: Ledger) => (
                                <option key={ledger.id} value={ledger.id}>
                                  {ledger.name}
                                </option>
                              ))}
                              <option
                                value="add-new"
                                className={`flex items-center px-4 py-2 rounded ${
                                  theme === "dark"
                                    ? "bg-blue-600 hover:bg-green-700"
                                    : "bg-green-600 hover:bg-green-700 text-white"
                                }`}
                              >
                                + Add New Ledger
                              </option>
                            </select>
                            {errors[`entry${index}.ledgerId`] && (
                              <p className="text-red-500 text-xs mt-1">
                                {errors[`entry${index}.ledgerId`]}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <input
                              title="Enter Amount"
                              type="number"
                              name="amount"
                              value={entry.amount ?? ""}
                              onChange={(e) => handleEntryChange(index, e)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.preventDefault();
                              }}
                              required
                              min="0"
                              step="0.01"
                              className={`${FORM_STYLES.tableInput(
                                theme
                              )} text-right ${
                                errors[`entry${index}.amount`]
                                  ? "border-red-500"
                                  : ""
                              }`}
                            />
                            {errors[`entry${index}.amount`] && (
                              <p className="text-red-500 text-xs mt-1">
                                {errors[`entry${index}.amount`]}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <select
                              title="Select Type"
                              name="type"
                              value={entry.type}
                              onChange={(e) => handleEntryChange(index, e)}
                              className={FORM_STYLES.tableInput(theme)}
                            >
                              <option value="debit">Debit</option>
                              <option value="credit">Credit</option>
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              name="narration"
                              value={entry.narration || ""}
                              onChange={(e) => handleEntryChange(index, e)}
                              placeholder="Entry Narration"
                              className={FORM_STYLES.tableInput(theme)}
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              title="Remove Ledger"
                              type="button"
                              onClick={() => removeEntry(index)}
                              disabled={formData.entries.length <= 1}
                              className={`p-1 rounded ${
                                formData.entries.length <= 1
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
                      {(() => {
                        const { debitTotal = 0, creditTotal = 0 } =
                          calculateTotals() as any;
                        return (
                          <>
                            <tr
                              className={`font-semibold ${
                                theme === "dark"
                                  ? "border-t border-gray-600"
                                  : "border-t border-gray-300"
                              }`}
                            >
                              <td colSpan={2} className="px-4 py-2 text-right">
                                Debit Total:
                              </td>
                              <td className="px-4 py-2 text-right">
                                ₹
                                {Number(debitTotal).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td colSpan={3}></td>
                            </tr>
                            <tr
                              className={`font-semibold ${
                                theme === "dark"
                                  ? "border-t border-gray-600"
                                  : "border-t border-gray-300"
                              }`}
                            >
                              <td colSpan={2} className="px-4 py-2 text-right">
                                Credit Total:
                              </td>
                              <td className="px-4 py-2 text-right">
                                ₹
                                {Number(creditTotal).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td colSpan={3}></td>
                            </tr>
                            <tr
                              className={`font-bold text-lg ${
                                theme === "dark"
                                  ? "border-t-2 border-gray-500"
                                  : "border-t-2 border-black"
                              }`}
                            >
                              <td colSpan={2} className="px-4 py-2 text-right">
                                Grand Total:
                              </td>
                              <td className="px-4 py-2 text-right text-green-600">
                                ₹
                                {Number(debitTotal).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td colSpan={3}></td>
                            </tr>
                          </>
                        );
                      })()}
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
              </label>
              <textarea
                id="narration"
                name="narration"
                value={formData.narration}
                onChange={handleChange}
                rows={3}
                title="Voucher Narration"
                placeholder="Enter narration for this sales voucher"
                className={FORM_STYLES.input(theme)}
              />
            </div>
            <div className="flex justify-end space-x-4">
              <button
                title="Cancel (Esc)"
                type="button"
                onClick={() => navigate(new URLSearchParams(window.location.search).get("returnUrl") || "/app/vouchers")}
                className={`px-4 py-2 rounded ${
                  theme === "dark"
                    ? "bg-gray-700 hover:bg-gray-600"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
              >
                Cancel
              </button>
              <button
                title="Print"
                type="button"
                onClick={handlePrintClick}
                className={`flex items-center px-4 py-2 rounded ${
                  theme === "dark"
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
                disabled={isSaving}
                className={`flex items-center px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed ${
                  theme === "dark"
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                <Save size={18} className="mr-1" />
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>

        {/* Configuration Modal (F12) */}
        {showConfig && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">
                Voucher Display Settings
              </h2>

              <div className="space-y-4">
                <label className="flex justify-between items-center">
                  <span>Enable Godown Column</span>
                  <input
                    type="checkbox"
                    checked={columnSettings.showGodown}
                    onChange={(e) =>
                      setColumnSettings((prev) => ({
                        ...prev,
                        showGodown: e.target.checked,
                      }))
                    }
                  />
                </label>

                <label className="flex justify-between items-center">
                  <span>Enable Batch Column</span>
                  <input
                    type="checkbox"
                    checked={columnSettings.showBatch}
                    onChange={(e) =>
                      setColumnSettings((prev) => ({
                        ...prev,
                        showBatch: e.target.checked,
                      }))
                    }
                  />
                </label>

                <label className="flex justify-between items-center">
                  <span>Enable Discount Column</span>
                  <input
                    type="checkbox"
                    checked={columnSettings.showDiscount}
                    onChange={(e) =>
                      setColumnSettings((prev) => ({
                        ...prev,
                        showDiscount: e.target.checked,
                      }))
                    }
                  />
                </label>

                <label className="flex justify-between items-center">
                  <span>Enable GST Column</span>
                  <input
                    type="checkbox"
                    checked={columnSettings.showGST}
                    onChange={(e) =>
                      setColumnSettings((prev) => ({
                        ...prev,
                        showGST: e.target.checked,
                      }))
                    }
                  />
                </label>

                <label className="flex justify-between items-center p-2 rounded hover:bg-gray-100 transition-colors cursor-pointer">
                  <span className="font-medium">
                    Enable Dispatch & Shipping Details
                  </span>
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={columnSettings.showDispatchDetails}
                    onChange={(e) =>
                      setColumnSettings((prev) => ({
                        ...prev,
                        showDispatchDetails: e.target.checked,
                        showDispatchDocNo: e.target.checked,
                        showDispatchThrough: e.target.checked,
                        showDestination: e.target.checked,
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
                      <span className="font-semibold text-sm">
                        Clear Saved Draft
                      </span>
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 mt-6">
                <button
                  className="w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-semibold transition-all"
                  onClick={() => setShowConfig(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Print Options Component */}
        <PrintOptions
          theme={theme}
          showPrintOptions={showPrintOptions}
          onClose={() => setShowPrintOptions(false)}
          onGenerateInvoice={handleGenerateInvoice}
          onGenerateEWayBill={handleGenerateEWayBill}
          onGenerateEInvoice={handleGenerateEInvoice}
          onSendToEmail={handleSendToEmail}
          onSendToWhatsApp={handleSendToWhatsApp}
        />

        {/* E-way Bill Generation Modal */}
        {showEWayBill && (
          <EWayBillGeneration
            theme={theme}
            voucherData={formData}
            onClose={() => setShowEWayBill(false)}
            getPartyName={getPartyName}
            getItemDetails={getItemDetails}
            calculateTotals={calculateTotals}
          />
        )}

        {/* Invoice Print Modal */}
        {showInvoicePrint && (
          <InvoicePrint
            theme={theme}
            voucherData={formData}
            isQuotation={isQuotation}
            onClose={() => setShowInvoicePrint(false)}
            // 🔥 DIRECT DATA (IMPORTANT)
            partyLedger={partyLedger}
            salesLedger={salesLedger}
            getItemDetails={getItemDetails}
            calculateTotals={calculateTotals}
            getGstRateInfo={getGstRateInfo}
            companyInfo={safeCompanyInfo}
            ledgers={safeLedgers}
          />
        )}

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
          className={`mt-6 p-4 rounded ${
            theme === "dark" ? "bg-gray-800" : "bg-blue-50"
          }`}
        >
          <p className="text-sm">
            <span className="font-semibold">Note:</span> Use Sales Voucher for
            recording sales. Press F8 to create, F9 to save, F12 to configure,
            Esc to cancel.
          </p>
        </div>
      </div>
    </React.Fragment>
  );
};

export default SalesVoucher;

