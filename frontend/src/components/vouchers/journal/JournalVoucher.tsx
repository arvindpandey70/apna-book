import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import Swal from "sweetalert2";
import { useAppContext } from "../../../context/AppContext";
import { Save, Plus, Trash2, ArrowLeft, Printer, Settings, ChevronDown, X } from "lucide-react";
import type { VoucherEntry, Ledger } from "../../../types";
import { useFinancialYear, getFinancialYearDefaults, useVoucherDateConfig } from "../../../hooks/useFinancialYear";

const LedgerCombobox: React.FC<{
  value: string;
  onChange: (value: string) => void;
  ledgers: Ledger[];
  placeholder?: string;
  theme: string;
  error?: string;
  hasAddNew?: boolean;
  onAddNew?: () => void;
}> = ({
  value,
  onChange,
  ledgers,
  placeholder = "-- Select or Search Ledger --",
  theme,
  error,
  hasAddNew = false,
  onAddNew,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLedger = useMemo(() => {
    return ledgers.find((l) => String(l.id) === String(value));
  }, [ledgers, value]);

  // Sync searchTerm when value changes externally
  useEffect(() => {
    if (selectedLedger) {
      setSearchTerm(selectedLedger.name);
    } else if (!value) {
      setSearchTerm("");
    }
  }, [value, selectedLedger]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        if (selectedLedger) {
          setSearchTerm(selectedLedger.name);
        } else {
          setSearchTerm("");
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [selectedLedger]);

  // Filtered ledgers
  const filteredLedgers = useMemo(() => {
    if (!searchTerm) return ledgers;
    if (
      selectedLedger &&
      searchTerm.trim().toLowerCase() === selectedLedger.name.trim().toLowerCase()
    ) {
      return ledgers;
    }
    const term = searchTerm.toLowerCase().trim();
    return ledgers.filter((l) => {
      const nameMatch = l.name ? l.name.toLowerCase().includes(term) : false;
      const groupMatch = (l as any).groupName
        ? (l as any).groupName.toLowerCase().includes(term)
        : false;
      return nameMatch || groupMatch;
    });
  }, [ledgers, searchTerm, selectedLedger]);

  const handleSelect = (l: Ledger) => {
    onChange(String(l.id));
    setSearchTerm(l.name);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
        return;
      }
    }

    const totalOptions = filteredLedgers.length + (hasAddNew ? 1 : 0);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % (totalOptions || 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(
        (prev) => (prev - 1 + totalOptions) % (totalOptions || 1)
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredLedgers.length) {
        handleSelect(filteredLedgers[highlightedIndex]);
      } else if (hasAddNew && highlightedIndex === filteredLedgers.length) {
        if (onAddNew) onAddNew();
        else onChange("add-new");
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          autoComplete="off"
          value={searchTerm}
          onChange={(e) => {
            const val = e.target.value;
            setSearchTerm(val);
            setIsOpen(true);
            setHighlightedIndex(0);
            if (!val) {
              onChange("");
            }
          }}
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full p-2 pr-12 rounded border outline-none text-sm transition-colors ${
            theme === "dark"
              ? "bg-gray-700 border-gray-600 text-gray-100 focus:border-blue-500"
              : "bg-white border-gray-300 text-gray-900 focus:border-blue-500"
          } ${error ? "border-red-500" : ""}`}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-gray-400">
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                onChange("");
                setIsOpen(true);
              }}
              className="p-1 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              title="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            title="Toggle Dropdown"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {isOpen && (
        <div
          className={`absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border shadow-lg ${
            theme === "dark"
              ? "bg-gray-800 border-gray-700 text-gray-100"
              : "bg-white border-gray-200 text-gray-800"
          }`}
        >
          {filteredLedgers.length === 0 ? (
            <div className="p-3 text-sm opacity-60 text-center">
              No matching ledgers found
            </div>
          ) : (
            filteredLedgers.map((l, index) => {
              const isSelected = String(l.id) === String(value);
              const isHighlighted = index === highlightedIndex;

              return (
                <div
                  key={l.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(l);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
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
                  <span className="font-medium">{l.name}</span>
                  {isSelected && (
                    <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">
                      Selected
                    </span>
                  )}
                </div>
              );
            })
          )}

          {hasAddNew && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                if (onAddNew) onAddNew();
                else onChange("add-new");
                setIsOpen(false);
              }}
              onMouseEnter={() => setHighlightedIndex(filteredLedgers.length)}
              className={`px-3 py-2 text-sm cursor-pointer font-bold border-t flex items-center gap-1.5 ${
                theme === "dark"
                  ? "border-gray-700 text-blue-400 hover:bg-gray-700"
                  : "border-gray-100 text-blue-600 hover:bg-blue-50"
              } ${
                highlightedIndex === filteredLedgers.length
                  ? theme === "dark"
                    ? "bg-gray-700"
                    : "bg-blue-50"
                  : ""
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>+ Add New Ledger</span>
            </div>
          )}
        </div>
      )}
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
};

const JournalVoucher: React.FC = () => {
  const { theme, companyInfo, vouchers } = useAppContext();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const copyId = location.state?.copyId;
  const isEditMode = !!id;
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const companyId = localStorage.getItem("company_id");
  const ownerType = localStorage.getItem("supplier");
  const ownerId = localStorage.getItem(
    ownerType === "employee" ? "employee_id" : "user_id"
  );

  const { selectedFinYear } = useFinancialYear();
  const { defaultDate, minDate, maxDate, isDateReadOnly } = useVoucherDateConfig(selectedFinYear);

  const initialFormData: Omit<VoucherEntry, "id"> = {
    date: defaultDate,
    type: "journal",
    number: "",
    narration: "",
    entries: [
      { id: "1", ledgerId: "", amount: 0, type: "debit", narration: "" },
      { id: "2", ledgerId: "", amount: 0, type: "credit", narration: "" },
    ],
    referenceNo: "",
    supplierInvoiceDate: "",
  };

  const [formData, setFormData] = useState<Omit<VoucherEntry, "id">>(
    isEditMode
      ? vouchers.find((v) => v.id === id) || initialFormData
      : initialFormData
  );
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [config, setConfig] = useState({
    autoNumbering: true,
    showReference: true,
    showCostCentre: false,
    showEntryNarration: false,
  });

  useEffect(() => {
    if (isEditMode || formData.number) return;
    if (!companyId || !ownerType || !ownerId) return;

    const fetchNextJournalNumber = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/vouchers/next-number` +
          `?company_id=${companyId}` +
          `&owner_type=${ownerType}` +
          `&owner_id=${ownerId}` +
          `&voucherType=journal` +
          `&date=${formData.date}`
        );

        const data = await res.json();

        if (data.success) {
          setFormData((prev) => ({
            ...prev,
            number: data.voucherNumber,
          }));
        }
      } catch (err) {
        console.error("Journal voucher number preview error", err);
      }
    };

    fetchNextJournalNumber();
  }, [formData.date, isEditMode, formData.number]);

  // Mock cost centres
  const costCentres = useMemo(
    () => [
      { id: "CC1", name: "Washing Department" },
      { id: "CC2", name: "Polishing Department" },
    ],
    []
  );

  const validateForm = useCallback(() => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.date) newErrors.date = "Date is required";
    if (!formData.number) newErrors.number = "Voucher number is required";
    formData.entries.forEach((entry, index) => {
      if (!entry.ledgerId)
        newErrors[`ledgerId${index}`] = `Ledger is required for entry ${index + 1
          }`;
      if (entry.amount <= 0)
        newErrors[
          `amount${index}`
        ] = `Amount must be greater than 0 for entry ${index + 1}`;
    });
    const totalDebit = formData.entries
      .filter((entry) => entry.type === "debit")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const totalCredit = formData.entries
      .filter((entry) => entry.type === "credit")
      .reduce((sum, entry) => sum + entry.amount, 0);
    if (totalDebit !== totalCredit) {
      newErrors.balance = "Total debit must equal total credit";
    }
    if (
      formData.entries.filter((e) => e.type === "debit").length < 1 ||
      formData.entries.filter((e) => e.type === "credit").length < 1
    ) {
      newErrors.entries =
        "At least one debit and one credit entry are required";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleEntryChange = (
    index: number,
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;
    let updatedEntries = [...formData.entries];

    const newValue = type === "number" ? parseFloat(value) || 0 : value;

    updatedEntries[index] = {
      ...updatedEntries[index],
      [name]: newValue,
    };

    // Auto-fill logic for 2-field entry
    if (index === 0 && updatedEntries.length === 2) {
      if (name === "amount") {
        updatedEntries[1] = {
          ...updatedEntries[1],
          amount: newValue as number,
        };
      } else if (name === "type") {
        updatedEntries[1] = {
          ...updatedEntries[1],
          type: newValue === "debit" ? "credit" : "debit",
        };
      }
    }

    setFormData((prev) => ({ ...prev, entries: updatedEntries }));
    setErrors((prev) => ({ ...prev, [`${name}${index}`]: "" }));

    if (e.target.value === "add-new") {
      navigate("/app/masters/ledger/create"); // Redirect to ledger creation page
    }
  };

  const addEntry = () => {
    setFormData((prev) => ({
      ...prev,
      entries: [
        ...prev.entries,
        {
          id: (prev.entries.length + 1).toString(),
          ledgerId: "",
          amount: 0,
          type: "credit",
          narration: "",
        },
      ],
    }));
  };

  const removeEntry = (index: number) => {
    if (formData.entries.length <= 2) return; // Minimum 2 entries
    const updatedEntries = [...formData.entries];
    updatedEntries.splice(index, 1);
    setFormData((prev) => ({ ...prev, entries: updatedEntries }));
    setErrors((prev) => ({
      ...prev,
      [`ledgerId${index}`]: "",
      [`amount${index}`]: "",
    }));
  };
  useEffect(() => {
    const fetchLedgers = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/ledger?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        const data = await res.json();
        setLedgers(data);
      } catch (err) {
        console.error("Failed to load ledgers", err);
      }
    };

    fetchLedgers();
  }, []);

  useEffect(() => {
    if (!isEditMode && !copyId) return;

    const fetchVoucher = async () => {
      try {
        const fetchId = isEditMode ? id : copyId;
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/vouchers/${fetchId}`
        );
        const json = await res.json();

        if (!json.data) return;

        const v = json.data;

        // Map backend → frontend
        const mappedEntries = v.entries.map((e: any, i: number) => ({
          id: (i + 1).toString(),
          ledgerId: e.ledger_id?.toString() || "",
          amount: Number(e.amount) || 0,
          type: e.type || "debit",
          narration: e.narration || "",
        }));

        setFormData({
          date: isEditMode ? (v.date?.split("T")[0] || "") : defaultDate,
          type: v.type || "journal",
          number: isEditMode ? (v.number || "") : "", // Clear number for copy so auto-numbering can run
          narration: v.narration || "",
          referenceNo: v.reference_no || "",
          supplierInvoiceDate: v.supplier_invoice_date
            ? v.supplier_invoice_date.split("T")[0]
            : "",
          entries: mappedEntries,
        });
      } catch (err) {
        console.error("Fetch error:", err);
      }
    };

    fetchVoucher();
  }, [isEditMode, id, copyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      const payload = {
        ...formData,
        companyId: companyId,
        owner_type: ownerType,
        owner_id: ownerId,
      };

      const url = isEditMode
        ? `${import.meta.env.VITE_API_URL}/api/vouchers/${id}`
        : `${import.meta.env.VITE_API_URL}/api/vouchers`;

      const method = isEditMode ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        Swal.fire("Success", data.message, "success").then(() => {
          navigate(new URLSearchParams(window.location.search).get("returnUrl") || "/app/vouchers");
        });
      } else {
        Swal.fire("Error", data.message, "error");
      }
    } catch (error) {
      console.error("Submission error:", error);
      Swal.fire("Error", "Something went wrong", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = useCallback(() => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head><title>Journal Voucher</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              h1 { font-size: 24px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { padding: 8px; border: 1px solid #ddd; text-align: left; }
            </style>
          </head>
          <body>
            <h1>${companyInfo?.name || "Hanuman Car Wash"
        } - Journal Voucher</h1>
            <table>
              <tr><th>Voucher No.</th><td>${formData.number}</td></tr>
              <tr><th>Date</th><td>${formData.date}</td></tr>
              ${formData.referenceNo
          ? `<tr><th>Reference No.</th><td>${formData.referenceNo}</td></tr>`
          : ""
        }
              ${formData.supplierInvoiceDate
          ? `<tr><th>Reference Date</th><td>${formData.supplierInvoiceDate}</td></tr>`
          : ""
        }
              <tr><th>Narration</th><td>${formData.narration || "N/A"}</td></tr>
            </table>
            <h2>Entries</h2>
            <table>
              <thead>
                <tr>
                  <th>Ledger</th>
                  <th>Type</th>
                  <th>Amount</th>
                  ${config.showEntryNarration ? "<th>Narration</th>" : ""}
                  ${config.showCostCentre ? "<th>Cost Centre</th>" : ""}
                </tr>
              </thead>
              <tbody>
                ${formData.entries
          .map(
            (entry) => `
                  <tr>
                    <td>${ledgers.find((l) => l.id === entry.ledgerId)?.name ||
              "N/A"
              }</td>
                    <td>${entry.type === "debit" ? "Dr" : "Cr"}</td>
                    <td>${entry.amount.toLocaleString()}</td>
                    ${config.showEntryNarration
                ? `<td>${entry.narration || "N/A"}</td>`
                : ""
              }
                    ${config.showCostCentre
                ? `<td>${entry.costCentreId
                  ? costCentres.find(
                    (c) => c.id === entry.costCentreId
                  )?.name || "N/A"
                  : "N/A"
                }</td>`
                : ""
              }
                  </tr>
                `
          )
          .join("")}
              </tbody>
              <tfoot>
                <tr>
                  <td>Totals</td>
                  <td></td>
                  <td>Dr: ${formData.entries
          .filter((e) => e.type === "debit")
          .reduce((sum, e) => sum + e.amount, 0)
          .toLocaleString()}<br/>
                      Cr: ${formData.entries
          .filter((e) => e.type === "credit")
          .reduce((sum, e) => sum + e.amount, 0)
          .toLocaleString()}</td>
                  ${config.showEntryNarration ? "<td></td>" : ""}
                  ${config.showCostCentre ? "<td></td>" : ""}
                </tr>
              </tfoot>
            </table>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  }, [formData, config, companyInfo, ledgers, costCentres]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        handleSubmit({ preventDefault: () => { } } as React.FormEvent);
      } else if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        handlePrint();
      } else if (e.key === "F12") {
        e.preventDefault();
        setShowConfigPanel(!showConfigPanel);
      } else if (e.key === "Escape") {
        navigate(new URLSearchParams(window.location.search).get("returnUrl") || "/app/vouchers");
      }
    },
    [showConfigPanel, navigate, handleSubmit, handlePrint]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const totalDebit = formData.entries
    .filter((entry) => entry.type === "debit")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const totalCredit = formData.entries
    .filter((entry) => entry.type === "credit")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const isBalanced = totalDebit === totalCredit;

  return (
    <div
      className={`pt-[56px] px-4 ${theme === "dark" ? "bg-gray-900" : "bg-gray-50"
        }`}
    >
      <div className="flex items-center mb-6">
        <button
          title="Back to Vouchers"
          type="button"
          onClick={() => navigate(new URLSearchParams(window.location.search).get("returnUrl") || "/app/vouchers")}
          className={`mr-4 p-2 rounded-full ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
            }`}
        >
          <ArrowLeft size={20} />
        </button>
        <h1
          className={`text-2xl font-bold ${theme === "dark" ? "text-gray-100" : "text-gray-900"
            }`}
        >
          {isEditMode ? "Edit Journal Voucher" : "New Journal Voucher"}
        </h1>
        <div className="ml-auto flex space-x-2">
          <button
            title="Save Voucher"
            onClick={handleSubmit}
            disabled={isSubmitting || !isBalanced}
            className={`p-2 rounded-md ${theme === "dark"
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-blue-500 hover:bg-blue-600"
              } text-white flex items-center ${isSubmitting || !isBalanced ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <Save size={18} className="mr-2" /> {isSubmitting ? "Saving..." : "Save"}
          </button>
          <button
            title="Print Voucher"
            onClick={handlePrint}
            className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
              }`}
          >
            <Printer size={18} />
          </button>
          <button
            title="Configure"
            onClick={() => setShowConfigPanel(!showConfigPanel)}
            className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
              }`}
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      <div
        className={`p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
          }`}
      >
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <label
                className={`block text-sm font-medium mb-1 ${theme === "dark" ? "text-gray-300" : "text-gray-700"
                  }`}
              >
                Date
              </label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
                max={maxDate}
                min={minDate}
                readOnly={isDateReadOnly}
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600 text-gray-100"
                  : "bg-white border-gray-300 text-gray-900"
                  } focus:border-blue-500 focus:ring-blue-500 ${isDateReadOnly ? 'bg-gray-100 cursor-not-allowed opacity-75' : ''}`}
              />
              {errors.date && (
                <p className="text-red-500 text-sm mt-1">{errors.date}</p>
              )}
            </div>
            <div>
              <label
                className={`block text-sm font-medium mb-1 ${theme === "dark" ? "text-gray-300" : "text-gray-700"
                  }`}
              >
                Voucher No.
              </label>
              <input
                type="text"
                name="number"
                value={formData.number}
                onChange={handleChange}
                readOnly={config.autoNumbering}
                required
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600 text-gray-100"
                  : "bg-white border-gray-300 text-gray-900"
                  } focus:border-blue-500 focus:ring-blue-500 ${config.autoNumbering ? "opacity-50" : ""
                  }`}
                placeholder={
                  config.autoNumbering ? "Auto" : "Enter voucher number"
                }
              />
              {errors.number && (
                <p className="text-red-500 text-sm mt-1">{errors.number}</p>
              )}
            </div>
            {config.showReference && (
              <>
                <div>
                  <label
                    className={`block text-sm font-medium mb-1 ${theme === "dark" ? "text-gray-300" : "text-gray-700"
                      }`}
                  >
                    Reference No.
                  </label>
                  <input
                    type="text"
                    name="referenceNo"
                    value={formData.referenceNo}
                    onChange={handleChange}
                    title="Reference number"
                    className={`w-full p-2 rounded border ${theme === "dark"
                      ? "bg-gray-700 border-gray-600 text-gray-100"
                      : "bg-white border-gray-300 text-gray-900"
                      } focus:border-blue-500 focus:ring-blue-500`}
                    placeholder="Enter reference number"
                  />
                </div>
                <div>
                  <label
                    className={`block text-sm font-medium mb-1 ${theme === "dark" ? "text-gray-300" : "text-gray-700"
                      }`}
                  >
                    Reference Date
                  </label>
                  <input
                    type="date"
                    name="supplierInvoiceDate"
                    value={formData.supplierInvoiceDate}
                    onChange={handleChange}
                    title="Reference date"
                    className={`w-full p-2 rounded border ${theme === "dark"
                      ? "bg-gray-700 border-gray-600 text-gray-100"
                      : "bg-white border-gray-300 text-gray-900"
                      } focus:border-blue-500 focus:ring-blue-500`}
                  />
                </div>
              </>
            )}
          </div>

          <div
            className={`p-4 mb-6 rounded ${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
              }`}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Entries</h3>
              <button
                type="button"
                onClick={addEntry}
                className={`flex items-center text-sm px-2 py-1 rounded ${theme === "dark"
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
              >
                <Plus size={16} className="mr-1" /> Add Line
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full mb-4">
                <thead>
                  <tr
                    className={`${theme === "dark"
                      ? "border-b border-gray-600"
                      : "border-b border-gray-300"
                      }`}
                  >
                    <th className="px-4 py-2 text-left">Ledger Account</th>
                    <th className="px-4 py-2 text-left">Dr/Cr</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    {config.showCostCentre && (
                      <th className="px-4 py-2 text-left">Cost Centre</th>
                    )}
                    {config.showEntryNarration && (
                      <th className="px-4 py-2 text-left">Narration</th>
                    )}
                    <th className="px-4 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.entries.map((entry, index) => (
                    <tr
                      key={index}
                      className={`${theme === "dark"
                        ? "border-b border-gray-600"
                        : "border-b border-gray-300"
                        }`}
                    >
                      <td className="px-4 py-2">
                        <LedgerCombobox
                          value={entry.ledgerId}
                          onChange={(val) => {
                            if (val === "add-new") {
                              navigate("/app/masters/ledger/create");
                            } else {
                              handleEntryChange(index, { target: { name: "ledgerId", value: val } } as any);
                            }
                          }}
                          ledgers={ledgers}
                          placeholder="Select Ledger Account"
                          theme={theme}
                          error={errors[`ledgerId${index}`]}
                          hasAddNew={true}
                          onAddNew={() => navigate("/app/masters/ledger/create")}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          name="type"
                          value={entry.type}
                          onChange={(e) => handleEntryChange(index, e)}
                          required
                          title="Select debit or credit"
                          className={`w-full p-2 rounded border ${theme === "dark"
                            ? "bg-gray-700 border-gray-600 text-gray-100"
                            : "bg-white border-gray-300 text-gray-900"
                            } focus:border-blue-500 focus:ring-blue-500`}
                        >
                          <option value="debit">Dr</option>
                          <option value="credit">Cr</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          name="amount"
                          value={entry.amount}
                          onChange={(e) => handleEntryChange(index, e)}
                          required
                          min="0"
                          step="0.01"
                          title="Enter amount"
                          placeholder="0.00"
                          className={`w-full p-2 rounded border text-right ${theme === "dark"
                            ? "bg-gray-700 border-gray-600 text-gray-100"
                            : "bg-white border-gray-300 text-gray-900"
                            } focus:border-blue-500 focus:ring-blue-500`}
                        />
                        {errors[`amount${index}`] && (
                          <p className="text-red-500 text-sm mt-1">
                            {errors[`amount${index}`]}
                          </p>
                        )}
                      </td>
                      {config.showCostCentre && (
                        <td className="px-4 py-2">
                          <select
                            name="costCentreId"
                            value={entry.costCentreId || ""}
                            onChange={(e) => handleEntryChange(index, e)}
                            title="Select cost centre"
                            className={`w-full p-2 rounded border ${theme === "dark"
                              ? "bg-gray-700 border-gray-600 text-gray-100"
                              : "bg-white border-gray-300 text-gray-900"
                              } focus:border-blue-500 focus:ring-blue-500`}
                          >
                            <option value="">None</option>
                            {costCentres.map((cc) => (
                              <option key={cc.id} value={cc.id}>
                                {cc.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      {config.showEntryNarration && (
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            name="narration"
                            value={entry.narration || ""}
                            onChange={(e) => handleEntryChange(index, e)}
                            className={`w-full p-2 rounded border ${theme === "dark"
                              ? "bg-gray-700 border-gray-600 text-gray-100"
                              : "bg-white border-gray-300 text-gray-900"
                              } focus:border-blue-500 focus:ring-blue-500`}
                            placeholder="Entry narration"
                          />
                        </td>
                      )}
                      <td className="px-4 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeEntry(index)}
                          disabled={formData.entries.length <= 2}
                          title={
                            formData.entries.length <= 2
                              ? "Cannot remove - minimum 2 entries required"
                              : "Remove entry"
                          }
                          className={`p-1 rounded ${formData.entries.length <= 2
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
                    <td className="px-4 py-2 text-right" colSpan={2}>
                      Totals:
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex flex-col">
                        <span>Dr: {totalDebit.toLocaleString()}</span>
                        <span>Cr: {totalCredit.toLocaleString()}</span>
                      </div>
                    </td>
                    <td
                      className="px-4 py-2 text-center"
                      colSpan={
                        config.showCostCentre && config.showEntryNarration
                          ? 3
                          : config.showCostCentre || config.showEntryNarration
                            ? 2
                            : 1
                      }
                    >
                      {isBalanced ? (
                        <span
                          className={`px-2 py-1 rounded text-xs ${theme === "dark"
                            ? "bg-green-900 text-green-200"
                            : "bg-green-100 text-green-800"
                            }`}
                        >
                          Balanced
                        </span>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded text-xs ${theme === "dark"
                            ? "bg-red-900 text-red-200"
                            : "bg-red-100 text-red-800"
                            }`}
                        >
                          Unbalanced
                        </span>
                      )}
                    </td>
                  </tr>
                  {errors.balance && (
                    <tr>
                      <td
                        colSpan={
                          config.showCostCentre && config.showEntryNarration
                            ? 6
                            : config.showCostCentre || config.showEntryNarration
                              ? 5
                              : 4
                        }
                      >
                        <p className="text-red-500 text-sm mt-1">
                          {errors.balance}
                        </p>
                      </td>
                    </tr>
                  )}
                  {errors.entries && (
                    <tr>
                      <td
                        colSpan={
                          config.showCostCentre && config.showEntryNarration
                            ? 6
                            : config.showCostCentre || config.showEntryNarration
                              ? 5
                              : 4
                        }
                      >
                        <p className="text-red-500 text-sm mt-1">
                          {errors.entries}
                        </p>
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>

          <div className="mb-6">
            <label
              className={`block text-sm font-medium mb-1 ${theme === "dark" ? "text-gray-300" : "text-gray-700"
                }`}
            >
              Narration
            </label>
            <textarea
              name="narration"
              value={formData.narration}
              onChange={handleChange}
              rows={3}
              title="Enter narration"
              placeholder="Enter voucher narration"
              className={`w-full p-2 rounded border ${theme === "dark"
                ? "bg-gray-700 border-gray-600 text-gray-100"
                : "bg-white border-gray-300 text-gray-900"
                } focus:border-blue-500 focus:ring-blue-500`}
            />
          </div>

          {showConfigPanel && (
            <div
              className={`p-4 mb-6 rounded ${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
                }`}
            >
              <h3 className="font-semibold mb-4">Configuration (F12)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={config.autoNumbering}
                    onChange={(e) => {
                      setConfig((prev) => ({
                        ...prev,
                        autoNumbering: e.target.checked,
                      }));
                    }}
                    className={`mr-2 ${theme === "dark" ? "bg-gray-600" : "bg-white"
                      }`}
                  />
                  Auto Numbering
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={config.showReference}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        showReference: e.target.checked,
                      }))
                    }
                    className={`mr-2 ${theme === "dark" ? "bg-gray-600" : "bg-white"
                      }`}
                  />
                  Show Reference Fields
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={config.showCostCentre}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        showCostCentre: e.target.checked,
                      }))
                    }
                    className={`mr-2 ${theme === "dark" ? "bg-gray-600" : "bg-white"
                      }`}
                  />
                  Show Cost Centre
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={config.showEntryNarration}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        showEntryNarration: e.target.checked,
                      }))
                    }
                    className={`mr-2 ${theme === "dark" ? "bg-gray-600" : "bg-white"
                      }`}
                  />
                  Show Narration per Entry
                </label>
              </div>
            </div>
          )}
        </form>
      </div>

      <div
        className={`mt-6 p-4 rounded ${theme === "dark" ? "bg-gray-800" : "bg-blue-50"
          }`}
      >
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-semibold">Note:</span> Journal vouchers are used
          for adjusting entries and non-cash transactions. Ensure at least one
          debit and one credit entry.
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
          <span className="font-semibold">Keyboard Shortcuts:</span> Ctrl+S to
          save, Ctrl+P to print, F12 to configure, Esc to cancel.
        </p>
      </div>
    </div>
  );
};

export default JournalVoucher;

