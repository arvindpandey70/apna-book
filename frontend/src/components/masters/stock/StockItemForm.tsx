import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Save, X, Trash2, ArrowLeft, Plus, ChevronDown, Settings } from "lucide-react";
import { useAppContext } from "../../../context/AppContext";
import type {
  GodownAllocation,
  Godown,
  GstClassification,
} from "../../../types";
import Swal from "sweetalert2";
import Barcode from "react-barcode";
import { nanoid } from "nanoid";
import { useParams } from "react-router-dom";

const generateEAN13 = () => {
  let code = "890"; // India prefix
  for (let i = 0; i < 9; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }

  // Calculate checksum for EAN-13
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checksum = (10 - (sum % 10)) % 10;
  return code + checksum;
};


// Interface for InputField props
interface InputFieldProps {
  id: string;
  name: string;
  label: string;
  type?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  error?: string;
}

// Interface for SelectField props
interface SelectFieldProps {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  error?: string;
}



// Reusable Input component
const InputField: React.FC<InputFieldProps> = ({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  required = false,
  error = "",
}) => {
  const { theme } = useAppContext();

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1">
        {label}
      </label>
      <input
        type={type}
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        className={`w-full p-2 rounded border ${error
          ? "border-red-500"
          : theme === "dark"
            ? "bg-gray-700 border-gray-600 focus:border-blue-500"
            : "bg-white border-gray-300 focus:border-blue-500"
          } outline-none transition-colors`}
        required={required}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
};

// Reusable Select component
const SelectField: React.FC<SelectFieldProps> = ({
  id,
  name,
  label,
  value,
  onChange,
  options,
  required = false,
  error = "",
}) => {
  const { theme } = useAppContext();

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        className={`w-full p-2 rounded border ${error
          ? "border-red-500"
          : theme === "dark"
            ? "bg-gray-700 border-gray-600 focus:border-blue-500"
            : "bg-white border-gray-300 focus:border-blue-500"
          } outline-none transition-colors`}
        required={required}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
};



const StockItemForm = () => {
  const { theme } = useAppContext();

  const navigate = useNavigate();
  const companyId = localStorage.getItem("company_id");
  const ownerType = localStorage.getItem("supplier");
  const ownerId = localStorage.getItem(
    ownerType === "employee" ? "employee_id" : "user_id"
  );

  const [barcode, setBarcode] = useState<string>("");
  const { id } = useParams<{ id?: string }>();

  const [categories, setCategories] = useState<
    { value: string; label: string }[]
  >([]);

  const [masterAttributes, setMasterAttributes] = useState<{id: number; name: string}[]>([]);
  const [showRageInput, setShowRageInput] = useState(false);
  const [rage, setRage] = useState("");
  const [godowns, setGodowns] = useState<{ value: string; label: string }[]>([]);

  const [gstLedgers, setGstLedgers] = useState<{
    gst: any[];
    cgst: any[];
    sgst: any[];
    igst: any[];
  }>({
    gst: [],
    cgst: [],
    sgst: [],
    igst: [],
  });

  const [isAttributeDropdownOpen, setIsAttributeDropdownOpen] = useState(false);
  const [openSubAttrDropdownId, setOpenSubAttrDropdownId] = useState<string | null>(null);
  const attributeDropdownRef = useRef<HTMLDivElement>(null);
  const [trackingSystem, setTrackingSystem] = useState<"batch" | "attribute" | "">("");

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (attributeDropdownRef.current && !attributeDropdownRef.current.contains(event.target as Node)) {
        setIsAttributeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);



  useEffect(() => {
    async function fetchMasterAttrs() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/stock-attributes`);
        const json = await res.json();
        if (json.success) setMasterAttributes(json.data);
      } catch (err) {
        console.error("Failed to fetch master attributes:", err);
      }
    }
    fetchMasterAttrs();
  }, []);

  //get ledgers
  useEffect(() => {
    async function fetchGstLedgers() {
      if (!companyId || !ownerType || !ownerId) return;

      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/stock-items/ledger` +
          `?company_id=${companyId}` +
          `&owner_type=${ownerType}` +
          `&owner_id=${ownerId}`
        );


        const data = await res.json();

        if (data.success) {
          setGstLedgers(data.data);
        } else {
          console.error("Ledger API error:", data.message);
        }
      } catch (err) {
        console.error("Failed to fetch GST ledgers", err);
      }
    }

    fetchGstLedgers();
  }, [companyId, ownerType, ownerId]);



  const deduplicateOptions = (ledgers: any[]) => {
    const seen = new Set<string>();
    const options: { value: string; label: string }[] = [];
    for (const l of ledgers) {
      if (!l || l.id === undefined || l.id === null) continue;
      const key = String(l.id);
      if (!seen.has(key)) {
        seen.add(key);
        options.push({
          value: key,
          label: l.name,
        });
      }
    }
    return options;
  };

  const gstOptions = deduplicateOptions([
    ...gstLedgers.gst,
    ...gstLedgers.igst,
  ]);

  const cgstOptions = deduplicateOptions(gstLedgers.cgst);

  const sgstOptions = deduplicateOptions(gstLedgers.sgst);





  // fetch units from database
  const [unitsData, setUnitsData] = useState([]);

  useEffect(() => {
    const fetchUnits = async () => {
      if (!companyId || !ownerType || !ownerId) return;

      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/stock-units?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );

        const data = await res.json();

        if (Array.isArray(data)) {
          setUnitsData(data);
        } else {
          setUnitsData([]);
          console.warn("Units data format incorrect:", data);
        }
      } catch (error) {
        console.error("Failed to fetch units:", error);
      }
    };

    fetchUnits();
  }, [companyId, ownerType, ownerId]);

  useEffect(() => {
    async function fetchCategories() {
      if (!companyId || !ownerType || !ownerId) return;

      try {
        const params = new URLSearchParams({
          company_id: companyId,
          owner_type: ownerType,
          owner_id: ownerId,
        });
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/stock-categories?${params.toString()}`
        );
        const data = await res.json();

        if (Array.isArray(data) && data.length > 0) {
          setCategories(
            data.map((cat: any) => ({
              value: cat.id.toString(),
              label: cat.name,
            }))
          );
        } else {
          setCategories([{ value: "", label: "No categories available" }]);
        }
      } catch (error) {
        console.error("Failed to fetch categories:", error);
        setCategories([{ value: "", label: "Failed to load categories" }]);
      }
    }

    async function fetchGodowns() {
      if (!companyId || !ownerType || !ownerId) return;
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/godowns?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        const data = await res.json();
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          setGodowns(
            data.data.map((g: any) => ({
              value: g.id.toString(),
              label: g.name,
            }))
          );
        } else {
          setGodowns([{ value: "", label: "No godowns available" }]);
        }
      } catch (error) {
        console.error("Failed to fetch godowns:", error);
        setGodowns([{ value: "", label: "Failed to load godowns" }]);
      }
    }

    fetchCategories();
    fetchGodowns();
  }, [companyId, ownerType, ownerId]);

  useEffect(() => {
    async function fetchStockItem() {
      if (!id) return;

      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/stock-items/${id}` +
          `?company_id=${companyId}` +
          `&owner_type=${ownerType}` +
          `&owner_id=${ownerId}` +
          `&mode=opening`
        );

        const data = await res.json();

        if (res.ok && data.success) {
          const item = data.data;

          // --- Set main form data ---
          setFormData({
            name: item.name || "",
            stockGroupId: item.stockGroupId?.toString() || "",
            categoryId: item.categoryId?.toString() || "",
            unit: item.unit?.toString() || "",
            openingBalance: Number(item.openingBalance) || 0,
            openingValue: Number(item.openingValue) || 0,
            hsnSacOption: "specify-details",
            hsnCode: item.hsnCode || "",
            gstRateOption: "specify-details",
            gstRate: item.gstRate?.toString() || "",
            gstClassification: "",
            taxType: item.taxType || "Taxable",
            gstLedgerId: item.gstLedgerId?.toString() || "",
            cgstLedgerId: item.cgstLedgerId?.toString() || "",
            sgstLedgerId: item.sgstLedgerId?.toString() || "",
            attributes: item.attributes || [],

            standardPurchaseRate: Number(item.standardPurchaseRate) || 0,
            standardSaleRate: Number(item.standardSaleRate) || 0,
            enableBatchTracking: !!item.enableBatchTracking && Array.isArray(item.batches) && item.batches.some((b: any) => b.batchName && b.batchName.trim() !== ""),
            enableAttributeTracking: !!item.enableAttributeTracking || (Array.isArray(item.attributeTrackingRows) && item.attributeTrackingRows.length > 0),
            batchName: item.batchNumber || "",
            batchExpiryDate: item.batchExpiryDate || "",
            batchManufacturingDate: item.batchManufacturingDate || "",
            allowNegativeStock: !!item.allowNegativeStock,
            maintainInPieces: !!item.maintainInPieces,
            secondaryUnit: item.secondaryUnit || "",
            image: item.image || "",
          });

          if (item.image) {
            setPreview(item.image);
          }

          if (item.tracking_type) {
            setTrackingSystem(item.tracking_type as "batch" | "attribute");
          } else if (Array.isArray(item.attributeTrackingRows) && item.attributeTrackingRows.length > 0) {
            setTrackingSystem("attribute");
          } else if (Array.isArray(item.batches) && item.batches.some((b: any) => b.batchName && b.batchName.trim() !== "")) {
            setTrackingSystem("batch");
          } else {
            setTrackingSystem("");
          }

          if (item.godown_id) {
            setRage(item.godown_id.toString());
            setShowRageInput(true);
          }

          // --- Set godown allocations ---
          setGodownAllocations(item.godownAllocations || []);

          // --- Set barcode ---
          setBarcode(item.barcode || "");

          // --- Set batch rows safely ---
          if (Array.isArray(item.batches) && item.batches.length > 0) {
            setBatchRows(
              item.batches.map((b: any) => {
                const rate = Number(b.batchRate ?? b.openingRate) || 0;
                const qty = Number(b.batchQuantity) || 0;

                return {
                  id: b.id || nanoid(),
                  batchName: b.batchName || "",
                  batchQuantity: qty,
                  batchRate: rate, // Always filled
                  openingRate: Number(b.openingRate) || rate, // Fallback to rate
                  batchExpiryDate: b.batchExpiryDate ? b.batchExpiryDate.split("T")[0] : "",
                  batchManufacturingDate: b.batchManufacturingDate ? b.batchManufacturingDate.split("T")[0] : "",
                  openingValue: Number(b.openingValue) || rate * qty, // Always calculated
                  mode: b.mode,
                  mrp: b.mrp || "",
                };
              })
            );
          } else {
            setBatchRows([
              {
                id: nanoid(),
                batchName: "",
                batchExpiryDate: "",
                batchManufacturingDate: "",
                batchQuantity: "",
                batchRate: "",
                openingRate: 0,
                mrp: "",
              },
            ]);
          }

          // --- Set attribute rows safely ---
          if (Array.isArray(item.attributeTrackingRows) && item.attributeTrackingRows.length > 0) {
            setAttributeRows(
              item.attributeTrackingRows.map((a: any) => ({
                id: a.id || nanoid(),
                primaryAttribute: a.primaryAttribute || "",
                primaryAttributeValue: a.primaryAttributeValue || "",
                subAttributes: Array.isArray(a.subAttributes) ? a.subAttributes.map((sa: any) => sa.id || sa) : (a.subAttributes ? a.subAttributes.split(',') : []),
                subAttributeValues: Array.isArray(a.subAttributes) 
                  ? a.subAttributes.reduce((acc: any, sa: any) => ({ ...acc, [sa.id]: sa.value || "" }), {})
                  : {},
                quantity: a.quantity || "",
                rate: a.rate || "",
                openingRate: Number(a.quantity || 0) * Number(a.rate || 0),
              }))
            );
          } else {
            setAttributeRows([
              {
                id: nanoid(),
                primaryAttribute: "",
                primaryAttributeValue: "",
                subAttributes: [],
                subAttributeValues: {},
                quantity: "",
                rate: "",
                openingRate: 0,
              }
            ]);
          }
        } else {
          Swal.fire(
            "Error",
            data.message || "Failed to fetch stock item",
            "error"
          );
        }
      } catch (err) {
        console.error("🔥 Error fetching stock item:", err);
        Swal.fire("Error", "Unable to fetch stock item", "error");
      }
    }

    fetchStockItem();
  }, [id, companyId, ownerType, ownerId]);

  // Generate barcode on first load if not editing
  useEffect(() => {
    if (!id) {
      setBarcode(generateEAN13());
    }
  }, [id]);

  // Handle barcode scanning from POS device
  useEffect(() => {
    let buffer = "";
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // Ignore if user is typing in a text input field
      const isTextInput =
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        (target.tagName === "INPUT" &&
          !["checkbox", "radio", "button", "submit", "reset", "image", "file"].includes((target as HTMLInputElement).type));

      if (isTextInput) return;

      const currentTime = Date.now();

      // Reset buffer if keystrokes are too slow (manual typing vs scanner speed)
      if (currentTime - lastKeyTime > 100) {
        buffer = "";
      }
      lastKeyTime = currentTime;

      if (e.key === "Enter") {
        if (buffer.length > 3) { // Minimum length to avoid accidental simple Enters
          e.preventDefault(); // Prevent form submission
          setBarcode(buffer);
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'Barcode Scanned',
            showConfirmButton: false,
            timer: 1500
          });
          buffer = "";
        }
      } else if (e.key.length === 1) { // Capture printable characters
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  interface FormData {
    name: string;
    stockGroupId: string;
    categoryId: string;
    unit: string;
    openingBalance: number;
    openingValue: number;

    hsnCode: string;


    gstLedgerId: string;
    cgstLedgerId: string;
    sgstLedgerId: string;
    attributes: string[];



    taxType: "Taxable" | "Exempt" | "Nil-rated";

    enableBatchTracking: boolean;
    batchName: string;
    batchExpiryDate: string;
    batchManufacturingDate: string;
    allowNegativeStock: boolean;
    maintainInPieces: boolean;
    secondaryUnit: string;
    image: string;
    enableAttributeTracking: boolean;
  }

  interface Errors {
    [key: string]: string;
  }

  const [formData, setFormData] = useState<FormData>({
    name: "",
    stockGroupId: "",
    categoryId: "",
    unit: "",
    openingBalance: 0,
    openingValue: 0,

    hsnCode: "",


    taxType: "Taxable",
    gstLedgerId: "",
    cgstLedgerId: "",
    sgstLedgerId: "",
    attributes: [],



    enableBatchTracking: false,
    batchName: "",
    batchExpiryDate: "",
    batchManufacturingDate: "",
    allowNegativeStock: true,
    maintainInPieces: false,
    secondaryUnit: "",
    image: "",
    enableAttributeTracking: false,
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };


  const [godownAllocations, setGodownAllocations] = useState<
    GodownAllocation[]
  >([]);
  const [batchRows, setBatchRows] = useState([
    {
      id: nanoid(),
      batchName: "",
      batchExpiryDate: "",
      batchManufacturingDate: "",
      batchQuantity: "",
      batchRate: "",
      openingRate: 0,
      mrp: "",
    },
  ]);

  const [attributeRows, setAttributeRows] = useState([
    {
      id: nanoid(),
      primaryAttribute: "",
      primaryAttributeValue: "",
      subAttributes: [] as string[],
      subAttributeValues: {} as Record<string, string>,
      quantity: "",
      rate: "",
      openingRate: 0,
    },
  ]);
  const [errors, setErrors] = useState<Errors>({});

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  // --- Batch Rows handlers ---
  const addBatchRow = () => {
    setBatchRows([
      ...batchRows,
      {
        id: nanoid(),
        batchName: "",
        batchExpiryDate: "",
        batchManufacturingDate: "",
        batchQuantity: "",
        batchRate: "",
        openingRate: 0,
        mrp: "",
      },
    ]);
  };
  
  const addAttributeRow = () => {
    setAttributeRows([
      ...attributeRows,
      {
        id: nanoid(),
        primaryAttribute: "",
        primaryAttributeValue: "",
        subAttributes: [],
        subAttributeValues: {},
        quantity: "",
        rate: "",
        openingRate: 0,
      },
    ]);
  };
  
  const removeAttributeRow = (index: number) => {
    setAttributeRows(attributeRows.filter((_, i) => i !== index));
  };
  
  const updateAttributeRow = (index: number, field: string, value: any) => {
    setAttributeRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        
        let updated = { ...row };
        if (field === "subAttributeValue") {
          updated.subAttributeValues = {
            ...updated.subAttributeValues,
            [value.id]: value.value,
          };
        } else {
          updated = {
            ...updated,
            [field]: field === "quantity" || field === "rate" ? Number(value) : value,
          };
        }
        
        const qty = Number(updated.quantity) || 0;
        const rate = Number(updated.rate) || 0;
        updated.openingRate = qty * rate;
        return updated;
      })
    );
  };
  const removeBatchRow = async (index: number) => {
    const batchToDelete = batchRows[index];

    // UI optimistic update
    setBatchRows((prev) => prev.filter((_, i) => i !== index));

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL
        }/api/stock-items/${id}/batch?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            batchName: batchToDelete.batchName,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to delete batch");
      }

      console.log("✅ Batch deleted:", data);
    } catch (err) {
      console.error("❌ Delete batch error:", err);
      Swal.fire("Error", "Failed to delete batch", "error");
    }
  };

  const updateBatchRow = (index: number, field: string, value: string) => {
    setBatchRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;

        const updated = {
          ...row,
          [field]:
            field === "batchQuantity" || field === "batchRate"
              ? Number(value)
              : value,
        };

        // Auto calculate Opening Rate
        const qty = Number(updated.batchQuantity) || 0;
        const rate = Number(updated.batchRate) || 0;
        updated.openingRate = qty * rate;

        return updated;
      })
    );
  };

  // --- End batch rows ---

  const validateForm = () => {
    const newErrors: Errors = {};

    if (!formData.name) newErrors.name = "Name is required";
    if (!formData.categoryId)
      newErrors.categoryId = "Category is required";
    if (!formData.unit) newErrors.unit = "Unit is required";

    // ---- HSN ----
    if (!formData.hsnCode) {
      newErrors.hsnCode = "HSN / SAC Code is required";
    }



    // ---- Batch duplicate validation ----
    if (formData.enableBatchTracking) {
      const batchMap: Record<string, number[]> = {};

      batchRows.forEach((b, index) => {
        const key = (b.batchName || "").trim().toUpperCase();
        if (!key) return;

        if (!batchMap[key]) batchMap[key] = [];
        batchMap[key].push(index);
      });

      Object.values(batchMap).forEach((indexes) => {
        if (indexes.length > 1) {
          indexes.forEach((i) => {
            newErrors[`batchName-${i}`] =
              "Batch number already exists";
          });
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation check before proceeding
    if (!validateForm()) {
      Swal.fire(
        "Validation Error",
        "Please fix the errors before submitting.",
        "warning"
      );
      return;
    }

    const selectedLedger = [
      ...gstLedgers.gst,
      ...gstLedgers.igst,
    ].find((l) => l.id.toString() === formData.gstLedgerId);
    
    const extractedRate = selectedLedger
      ? (parseInt(selectedLedger.name.replace(/[^0-9]/g, "")) || 0)
      : Number(formData.gstRate || 0);

    // Construct stockItem object
    const stockItem: any = {
      name: formData.name,
      stockGroupId: formData.stockGroupId,
      categoryId: formData.categoryId,
      unit: formData.unit,
      openingBalance: formData.openingBalance,
      openingValue: formData.openingValue,

      hsnCode: formData.hsnCode,
      gstRate: extractedRate,
      taxType: formData.taxType,

      gstLedgerId: formData.gstLedgerId,
      cgstLedgerId: formData.cgstLedgerId,
      sgstLedgerId: formData.sgstLedgerId,
      attributes: formData.attributes,

      enableBatchTracking: formData.enableBatchTracking,
      tracking_type: trackingSystem,
      allowNegativeStock: formData.allowNegativeStock,
      maintainInPieces: formData.maintainInPieces,
      secondaryUnit: formData.secondaryUnit,

      batches: trackingSystem === "batch" 
        ? batchRows
            .filter((b) => b.batchQuantity || b.batchRate || b.mrp || b.batchName)
            .map((b) => ({
              ...b,
              mode: "opening",
              batchQuantity: Number(b.batchQuantity) || 0,
              batchRate: Number(b.batchRate) || 0,
              openingRate: Number(b.batchRate || 0) * Number(b.batchQuantity || 0),
            }))
        : [],
      attributeTrackingRows: trackingSystem === "attribute" 
        ? attributeRows.filter(a => a.primaryAttribute || a.quantity || a.rate) 
        : [],
      godownAllocations,
      barcode,
      godown_id: rage,
      company_id: companyId,
      owner_type: ownerType,
      owner_id: ownerId,
    };

    // Use FormData for file upload
    const submitData = new FormData();
    Object.entries(stockItem).forEach(([key, value]) => {
      if (key === "batches" || key === "godownAllocations" || key === "attributes" || key === "attributeTrackingRows") {
        submitData.append(key, JSON.stringify(value));
      } else {
        submitData.append(key, value as string);
      }
    });

    if (imageFile) {
      submitData.append("image", imageFile);
    } else if (formData.image) {
      submitData.append("image", formData.image);
    }

    // Determine if we're updating or creating a new record
    const method = id ? "PUT" : "POST"; // Use PUT for update, POST for new
    const url = id
      ? `${import.meta.env.VITE_API_URL}/api/stock-items/${id}` // URL with ID for update
      : `${import.meta.env.VITE_API_URL}/api/stock-items`; // URL for new record creation

    try {
      const res = await fetch(url, {
        method: method,
        body: submitData, // Send FormData instead of JSON
      });

      // Check if response status is ok (2xx status codes)
      if (!res.ok) {
        let data;
        try {
          // Attempt to parse JSON only if response is not ok
          data = await res.json();
        } catch (jsonError) {
          // Handle non-JSON responses if JSON parsing fails
          console.error("Error parsing JSON:", jsonError);
          const text = await res.text();
          console.error("Raw response:", text);
          Swal.fire({
            icon: "error",
            title: "Error",
            text: "The server returned an unexpected format. Please try again.",
          });
          return;
        }

        // Show error message from the server
        Swal.fire({
          icon: "error",
          title: "Error",
          text: data.message || "Failed to save stock item",
        });
        return;
      }

      // Parse JSON from response if status is ok
      const data = await res.json();

      // Success message after stock item is saved/updated
      Swal.fire({
        icon: "success",
        title: "Success",
        text:
          data.message ||
          (id
            ? "Stock item updated successfully!"
            : "Stock item saved successfully!"),
      }).then(() => {
        navigate("/app/masters/stock-item"); // Navigate to stock-item page
      });
    } catch (err) {
      console.error("🔥 Network/Error:", err);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "An error occurred while saving the stock item.",
      });
    }
  };



  const taxTypeOptions = [
    { value: "Taxable", label: "Taxable" },
    { value: "Exempt", label: "Exempt" },
    { value: "Nil-rated", label: "Nil-rated" },
  ];

  const unitOptions =
    unitsData.length > 0
      ? unitsData.map((unit: any) => ({
        value: unit.id.toString(),
        label: unit.name,
      }))
      : [{ value: "", label: "No units available" }];



  return (
    <div className="pt-[56px] px-4 ">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <button
            onClick={() => navigate("/app/masters/stock-item")}
            className={`mr-4 p-2 rounded-full ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
              }`}
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold">New Stock Item</h1>
        </div>
        <button
          className={`p-2 rounded-full ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
            }`}
          aria-label="Settings"
          type="button"
          onClick={() => setShowRageInput(!showRageInput)}
        >
          <Settings size={20} />
        </button>
      </div>

      <div
        className={`p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
          }`}
      >
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputField
              id="name"
              name="name"
              label="Name"
              value={formData.name}
              onChange={handleChange}
              required
              error={errors.name}
            />
            <SelectField
              id="categoryId"
              name="categoryId"
              label="Category"
              value={formData.categoryId}
              onChange={handleChange}
              options={categories}
              required
              error={errors.categoryId}
            />

            <SelectField
              id="unit"
              name="unit"
              label="Unit"
              value={formData.unit}
              onChange={handleChange}
              options={unitOptions}
              required
              error={errors.unit}
            />

            <SelectField
              id="taxType"
              name="taxType"
              label="Tax Type"
              value={formData.taxType}
              onChange={handleChange}
              options={taxTypeOptions}
              required
              error={errors.taxType}
            />

            <InputField
              id="hsnCode"
              name="hsnCode"
              label="HSN / SAC Code"
              value={formData.hsnCode}
              onChange={handleChange}
              required
              error={errors.hsnCode}
            />

            <SelectField
              id="gstLedgerId"
              name="gstLedgerId"
              label="IGST"
              value={formData.gstLedgerId}
              onChange={handleChange}
              options={gstOptions}
            />


            <SelectField
              id="cgstLedgerId"
              name="cgstLedgerId"
              label="CGST"
              value={formData.cgstLedgerId}
              onChange={handleChange}
              options={cgstOptions}
            />

            <SelectField
              id="sgstLedgerId"
              name="sgstLedgerId"
              label="SGST"
              value={formData.sgstLedgerId}
              onChange={handleChange}
              options={sgstOptions}
            />



            {showRageInput && (
              <SelectField
                id="rage"
                name="rage"
                label="Rage"
                value={rage}
                onChange={(e) => setRage(e.target.value)}
                options={godowns}
              />
            )}

            <div className="md:col-span-2">

              <label className="block text-sm font-medium mb-1">Product Image</label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div
                  className={`relative w-32 h-32 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden ${theme === "dark" ? "border-gray-600 bg-gray-700" : "border-gray-300 bg-gray-50"
                    }`}
                >
                  {preview ? (
                    <>
                      <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setPreview("");
                          setImageFile(null);
                          setFormData(prev => ({ ...prev, image: "" }));
                        }}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <Plus className="text-gray-400" size={32} />
                  )}
                </div>
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    id="product-image-upload"
                  />
                  <label
                    htmlFor="product-image-upload"
                    className="cursor-pointer px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors inline-block text-sm font-medium"
                  >
                    {preview ? "Change Image" : "Upload Image"}
                  </label>
                  <p className="text-xs text-gray-500 mt-2">Max size: 5MB (PNG, JPG, JPEG)</p>
                </div>
              </div>
            </div>




            {/* ----------------- Tracking System Selection ----------------- */}
            <div className={`flex flex-col gap-3 md:col-span-2 mt-4 mb-2 p-4 border rounded-lg ${theme === 'dark' ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-gray-50'}`}>
              <h4 className="font-semibold text-sm">Select Tracking System</h4>
              <div className="flex flex-col sm:flex-row gap-6 mt-1 items-center">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="trackingSystem"
                    value="batch"
                    checked={trackingSystem === "batch"}
                    onChange={() => {
                      setTrackingSystem("batch");
                      setFormData(prev => ({ ...prev, enableAttributeTracking: false }));
                    }}
                    className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  Batch System
                </label>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="trackingSystem"
                    value="attribute"
                    checked={trackingSystem === "attribute"}
                    onChange={() => {
                      setTrackingSystem("attribute");
                      setFormData(prev => ({ ...prev, enableBatchTracking: false }));
                    }}
                    className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  Attribute System
                </label>
                {trackingSystem !== "" && (
                  <button
                    type="button"
                    onClick={() => {
                      setTrackingSystem("");
                      setFormData(prev => ({ ...prev, enableBatchTracking: false, enableAttributeTracking: false }));
                    }}
                    className="text-xs text-red-500 hover:text-red-700 underline font-medium"
                  >
                    Clear Selection
                  </button>
                )}
              </div>
            </div>

            {trackingSystem === "batch" && (
              <>
            {/* ----------------- Batch Tracking Dynamic Rows ----------------- */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-4 gap-3 md:col-span-2">
              {/* Left: Checkboxes */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    name="enableBatchTracking"
                    checked={formData.enableBatchTracking}
                    onChange={handleChange}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  Enable Batch Tracking
                </label>
              </div>

              {/* Right: Add Batch Button - ALWAYS SHOWN */}
              <button
                type="button"
                onClick={addBatchRow}
                className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                <Plus size={16} /> Add Batch
              </button>
            </div>

            {/* ALWAYS SHOWN BATCH CONTAINER */}
            <div className="flex flex-col gap-4 mt-4 md:col-span-2 border border-gray-400 rounded-lg p-3">
              {batchRows.map((row, index) => (
                <div
                  key={row.id}
                  className="flex flex-col md:flex-row gap-3 items-stretch md:items-end w-full"
                >
                  {/* Batch/Serial Number field - ONLY visible when enableBatchTracking is checked */}
                  {formData.enableBatchTracking && (
                    <div className="w-full md:flex-1">
                      <InputField
                        id={`batchName-${index}`}
                        name={`batchName-${index}`}
                        label="Batch"
                        value={row.batchName}
                        onChange={(e) =>
                          updateBatchRow(index, "batchName", e.target.value)
                        }
                        error={errors[`batchName-${index}`]}
                      />
                    </div>
                  )}

                  {/* Qty field - ALWAYS visible */}
                  <div className="w-full md:flex-1">
                    <InputField
                      id={`batchQuantity-${index}`}
                      name={`batchQuantity-${index}`}
                      label="Qty"
                      value={row.batchQuantity}
                      onChange={(e) =>
                        updateBatchRow(index, "batchQuantity", e.target.value)
                      }
                      error={errors[`batchQuantity-${index}`]}
                    />
                  </div>

                  {/* Rate field - ALWAYS visible */}
                  <div className="w-full md:flex-1">
                    <InputField
                      id={`batchRate-${index}`}
                      name={`batchRate-${index}`}
                      label="Rate"
                      value={row.batchRate}
                      onChange={(e) =>
                        updateBatchRow(index, "batchRate", e.target.value)
                      }
                      error={errors[`batchRate-${index}`]}
                    />
                  </div>

                  {/* Total Value field - ALWAYS visible */}
                  <div className="w-full md:flex-1">
                    <InputField
                      id={`openingRate-${index}`}
                      name={`openingRate-${index}`}
                      label="Total Value"
                      type="number"
                      value={row.batchRate && row.batchQuantity ? Number(row.batchRate) * Number(row.batchQuantity) : ""}
                      onChange={() => { }}
                      error={errors[`openingRate-${index}`]}
                      disabled
                    />
                  </div>

                  {/* MRP field - ALWAYS visible */}
                  <div className="w-full md:flex-1">
                    <InputField
                      id={`mrp-${index}`}
                      name={`mrp-${index}`}
                      label="MRP"
                      type="number"
                      value={row.mrp || ""}
                      onChange={(e) => updateBatchRow(index, "mrp", e.target.value)}
                      error={errors[`mrp-${index}`]}
                    />
                  </div>

                  {/* MFG Date field - ONLY visible when enableBatchTracking is checked */}
                  {formData.enableBatchTracking && (
                    <div className="w-full md:flex-1">
                      <InputField
                        id={`batchManufacturingDate-${index}`}
                        name={`batchManufacturingDate-${index}`}
                        type="date"
                        label="MFG Date"
                        value={row.batchManufacturingDate}
                        onChange={(e) =>
                          updateBatchRow(
                            index,
                            "batchManufacturingDate",
                            e.target.value
                          )
                        }
                      />
                    </div>
                  )}

                  {/* Expiry Date field - ONLY visible when enableBatchTracking is checked */}
                  {formData.enableBatchTracking && (
                    <div className="w-full md:flex-1">
                      <InputField
                        id={`batchExpiryDate-${index}`}
                        name={`batchExpiryDate-${index}`}
                        type="date"
                        label="Expiry Date"
                        value={row.batchExpiryDate}
                        onChange={(e) =>
                          updateBatchRow(
                            index,
                            "batchExpiryDate",
                            e.target.value
                          )
                        }
                      />
                    </div>
                  )}

                  {/* Delete Button - ALWAYS visible */}
                  <div className="flex justify-center pb-2 w-full md:w-auto">
                    <button
                      type="button"
                      onClick={() => removeBatchRow(index)}
                      className="p-2 text-red-700 hover:text-red-900"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            </>
            )}

            {/* ---------------------------------------------------------------- */}

            {trackingSystem === "attribute" && (
            <div className="flex flex-col gap-2 md:col-span-2 mt-4">
              <label className="flex items-center gap-2 text-sm font-medium mb-2">
                <input
                  type="checkbox"
                  name="enableAttributeTracking"
                  checked={formData.enableAttributeTracking}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                Attributes wise
              </label>

              {formData.enableAttributeTracking && (
                <div className="flex flex-col gap-4 mb-4 md:col-span-2 border border-gray-400 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold text-sm">Attributes Tracking</h4>
                    <button
                      type="button"
                      onClick={addAttributeRow}
                      className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                    >
                      <Plus size={16} /> Add Row
                    </button>
                  </div>
                  {attributeRows.map((row, index) => (
                    <div key={row.id} className="flex flex-col md:flex-row gap-3 items-stretch md:items-end w-full">
                      <div className="w-full md:flex-1">
                        <SelectField
                          id={`attr-select-primary-${index}`}
                          name={`attr-select-primary-${index}`}
                          label="Primary Attribute"
                          value={row.primaryAttribute}
                          options={masterAttributes.map(a => ({ value: a.id.toString(), label: a.name }))}
                          onChange={(e) => updateAttributeRow(index, "primaryAttribute", e.target.value)}
                          error={errors[`attr-select-primary-${index}`]}
                        />
                        {row.primaryAttribute && (
                          <div className="mt-2">
                            <InputField
                              id={`attr-primary-val-${index}`}
                              name={`attr-primary-val-${index}`}
                              label="Value"
                              value={row.primaryAttributeValue}
                              onChange={(e) => updateAttributeRow(index, "primaryAttributeValue", e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                      <div className="w-full md:flex-1 relative">
                        <label className="block text-sm font-medium mb-1">Sub Attributes</label>
                        <div 
                          className={`w-full p-2 rounded border flex justify-between items-center cursor-pointer ${theme === "dark" ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"}`}
                          onClick={() => setOpenSubAttrDropdownId(openSubAttrDropdownId === row.id ? null : row.id)}
                        >
                          <span className={`truncate ${(!row.subAttributes || row.subAttributes.length === 0) ? "text-gray-500" : ""}`}>
                            {row.subAttributes && row.subAttributes.length > 0 
                              ? row.subAttributes.map((id: string) => masterAttributes.find(a => a.id.toString() === id)?.name).filter(Boolean).join(", ")
                              : "Select sub attributes"}
                          </span>
                          <ChevronDown size={16} />
                        </div>
                        
                        {openSubAttrDropdownId === row.id && (
                          <div className={`absolute z-20 w-full mt-1 border rounded shadow-lg max-h-48 overflow-y-auto ${theme === "dark" ? "bg-gray-800 border-gray-600" : "bg-white border-gray-200"}`}>
                            <div className="p-2 flex flex-col gap-1">
                              {masterAttributes.map((attr) => (
                                <label key={attr.id} className={`flex items-center gap-2 cursor-pointer p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors`}>
                                  <input
                                    type="checkbox"
                                    checked={row.subAttributes?.includes(attr.id.toString()) || false}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      const newSubAttrs = checked
                                        ? [...(row.subAttributes || []), attr.id.toString()]
                                        : (row.subAttributes || []).filter((id: string) => id !== attr.id.toString());
                                      updateAttributeRow(index, "subAttributes", newSubAttrs as any);
                                    }}
                                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                  />
                                  <span className="text-sm select-none">{attr.name}</span>
                                </label>
                              ))}
                              {masterAttributes.length === 0 && (
                                <span className="text-sm text-gray-400 p-1">No attributes found</span>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {row.subAttributes && row.subAttributes.length > 0 && (
                          <div className="mt-2 flex flex-col gap-2">
                            {row.subAttributes.map((subId: string) => {
                              const attrName = masterAttributes.find(a => a.id.toString() === subId)?.name || subId;
                              return (
                                <div key={subId} className="pl-4 border-l-2 border-blue-200">
                                  <InputField
                                    id={`attr-sub-val-${index}-${subId}`}
                                    name={`attr-sub-val-${index}-${subId}`}
                                    label={`${attrName} Value`}
                                    value={row.subAttributeValues[subId] || ""}
                                    onChange={(e) => updateAttributeRow(index, "subAttributeValue", { id: subId, value: e.target.value })}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="w-full md:flex-1">
                        <InputField
                          id={`attr-qty-${index}`}
                          name={`attr-qty-${index}`}
                          label="Qty"
                          value={row.quantity}
                          onChange={(e) => updateAttributeRow(index, "quantity", e.target.value)}
                          error={errors[`attr-qty-${index}`]}
                        />
                      </div>
                      <div className="w-full md:flex-1">
                        <InputField
                          id={`attr-rate-${index}`}
                          name={`attr-rate-${index}`}
                          label="Rate"
                          value={row.rate}
                          onChange={(e) => updateAttributeRow(index, "rate", e.target.value)}
                          error={errors[`attr-rate-${index}`]}
                        />
                      </div>
                      <div className="w-full md:flex-1">
                        <InputField
                          id={`attr-total-${index}`}
                          name={`attr-total-${index}`}
                          label="Total Value"
                          type="number"
                          value={row.rate && row.quantity ? Number(row.rate) * Number(row.quantity) : ""}
                          onChange={() => { }}
                          error={errors[`attr-total-${index}`]}
                          disabled
                        />
                      </div>
                      <div className="flex justify-center pb-2 w-full md:w-auto">
                        <button
                          type="button"
                          onClick={() => removeAttributeRow(index)}
                          className="p-2 text-red-700 hover:text-red-900"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            <div className="flex flex-col gap-2 md:col-span-2 mt-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={barcode === ""}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setBarcode(""); // Clear for scanning
                    } else {
                      setBarcode(generateEAN13()); // Regenerate
                    }
                  }}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                Scan Barcode with POS (Clear & Scan)
              </label>
            </div>

            {barcode ? (
              <div className="mb-4 mt-2 md:col-span-2">
                <h3 className="mb-1 font-medium">{id ? 'Barcode' : 'Generated/Scanned Barcode'}</h3>
                <div className="border p-2 rounded flex flex-col items-center bg-white">
                  <Barcode value={barcode} width={1} height={40} fontSize={16} />
                </div>
                <p className="text-xs text-gray-500 mt-1">Scan a barcode with your POS scanner to update automatically.</p>
              </div>
            ) : (
              <div className="mb-4 mt-2 p-4 border border-blue-300 bg-blue-50 rounded text-center md:col-span-2">
                <p className="font-semibold text-blue-700 animate-pulse">Waiting for POS Scan...</p>
                <p className="text-xs text-blue-600">Please scan the product barcode now.</p>
              </div>
            )}

          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate("/app/masters/stock-item")}
              className={`px-4 py-2 rounded ${theme === "dark"
                ? "bg-gray-700 hover:bg-gray-600"
                : "bg-gray-200 hover:bg-gray-300"
                }`}
            >
              <Trash2 className="w-4 h-4 inline mr-1" />
              Cancel
            </button>
            <button
              type="submit"
              className={`flex items-center px-4 py-2 rounded ${theme === "dark"
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
            >
              <Save className="w-4 h-4 mr-1" />
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StockItemForm;
