import React, { useEffect, useState } from "react";
import { useAppContext } from "../../../context/AppContext";
import { useNavigate, useParams } from "react-router-dom";
import type {
  VoucherEntry,
  Ledger,
  VoucherEntryLine,
  LedgerWithGroup,
} from "../../../types";
import { Save, Plus, Trash2, ArrowLeft, Printer } from "lucide-react";
import PrintOptions from "../sales/PrintOptions";
import EWayBillGeneration from "../sales/EWayBillGeneration";
import { useFinancialYear, getFinancialYearDefaults } from "../../../hooks/useFinancialYear";
import InvoicePrint from "../sales/InvoicePrint";
import Swal from "sweetalert2";

const CreditNoteVoucher: React.FC = () => {
  const { theme } = useAppContext();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const { selectedFinYear } = useFinancialYear();
  const { defaultDate, maxDate } = getFinancialYearDefaults(selectedFinYear);

  const [ledgers, setLedgers] = useState<LedgerWithGroup[]>([]);
  const companyId = localStorage.getItem("company_id");
  const ownerType = localStorage.getItem("supplier");
  const ownerId = localStorage.getItem(
    ownerType === "employee" ? "employee_id" : "user_id"
  );
  // Purchase Ledger dropdown should show ledgers with group indicating purchase ledgers or expense ledgers

  useEffect(() => {
    if (!isEditMode || !id) return;

    const fetchDebitNote = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/CreditNotevoucher/${id}?companyId=${companyId}&ownerType=${ownerType}&ownerId=${ownerId}`
        );

        const result = await res.json();

        if (!result.success) {
          Swal.fire("Error", "Debit Note not found", "error");
          return;
        }

        const v = result.data;

        setFormData({
          date: v.date ? v.date.split("T")[0] : "",
          type: "debit-note",
          number: v.number,
          narration: v.narration || "",
          mode: v.mode || "accounting-invoice",
          entries:
            v.entries?.length > 0
              ? v.entries.map((e: any, i: number) => ({
                id: String(i + 1),
                ledgerId: e.ledgerId,
                amount: Math.round(Number(e.amount) || 0),
                type: e.type,
              }))
              : [
                { id: "1", ledgerId: "", amount: 0, type: "debit" },
                { id: "2", ledgerId: "", amount: 0, type: "credit" },
              ],
        });
      } catch (err) {
        console.error(err);
        Swal.fire("Error", "Failed to load Credit Note", "error");
      }
    };

    fetchDebitNote();
  }, [isEditMode, id, companyId, ownerType, ownerId]);

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
        console.error("Failed to fetch ledgers:", err);
      }
    };
    fetchLedgers();
  }, [companyId, ownerType, ownerId]);

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

  const [formData, setFormData] = useState<Omit<VoucherEntry, "id">>({
    date: defaultDate,
    type: "debit-note",
    number: "",
    narration: "",
    mode: "accounting-invoice",
    entries: [
      { id: "1", ledgerId: "", amount: 0, type: "debit" },
      { id: "2", ledgerId: "", amount: 0, type: "credit" },
    ],
  });

  // Print-related state
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [showEWayBill, setShowEWayBill] = useState(false);
  const [showInvoicePrint, setShowInvoicePrint] = useState(false);

  const safeLedgers = ledgers || [];

  // ger voucher number
  useEffect(() => {
    if (isEditMode) return;
    if (!companyId || !ownerType || !ownerId || !formData.date) return;

    const fetchNextCNVNumber = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/CreditNotevoucher/next-number` +
          `?company_id=${companyId}` +
          `&owner_type=${ownerType}` +
          `&owner_id=${ownerId}` +
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
        console.error("Credit Note number fetch failed", err);
      }
    };

    fetchNextCNVNumber();
  }, [formData.date, companyId, ownerType, ownerId, isEditMode]);

  const getItemDetails = (itemId: string) => {
    return {
      name: "",
      unit: "",
      rate: 0,
      hsnCode: "",
      gstRate: 0,
    };
  };

  // Helper functions
  const getPartyBalance = (partyId: string) => {
    const party = safeLedgers.find((l) => l.id === partyId);
    return party ? party.openingBalance || 0 : 0;
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;

    if (name === "mode") {
      const newMode = value as "accounting-invoice";

      setFormData((prev) => ({
        ...prev,
        mode: newMode,

        entries: isEditMode
          ? prev.entries
          : [
            { id: "1", ledgerId: "", amount: 0, type: "debit" },
            { id: "2", ledgerId: "", amount: 0, type: "credit" },
          ],
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleEntryChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => {
      const updatedEntries = [...prev.entries];

      if (name === "ledgerId") {
        updatedEntries[index] = {
          ...updatedEntries[index],
          ledgerId: value,
        };
      }

      if (name === "amount") {
        updatedEntries[index] = {
          ...updatedEntries[index],
          amount: value === "" ? "" : (value.includes(".") ? value : (isNaN(Number(value)) ? value : Number(value))),
        };
      }

      if (name === "type") {
        updatedEntries[index] = {
          ...updatedEntries[index],
          type: value as "debit" | "credit",
        };
      }

      return { ...prev, entries: updatedEntries };
    });
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
        },
      ],
    }));
  };

  const removeEntry = (index: number) => {
    if (formData.entries.length <= 2) return;
    const updatedEntries = [...formData.entries];
    updatedEntries.splice(index, 1);
    setFormData((prev) => ({ ...prev, entries: updatedEntries }));
  };

  // Calculate totals (accounting entries)
  const calculateTotals = () => {
    const total = formData.entries.reduce((sum, e) => sum + (e.amount ?? 0), 0);
    return {
      subtotal: total,
      cgstTotal: 0,
      sgstTotal: 0,
      igstTotal: 0,
      discountTotal: 0,
      total,
    };
  };

  // Get balance info for traditional calculation (accounting entries)
  const getBalanceInfo = () => {
    const totalDebit = formData.entries
      .filter((entry: VoucherEntryLine) => entry.type === "debit")
      .reduce(
        (sum: number, entry: VoucherEntryLine) => sum + (entry.amount || 0),
        0
      );

    const totalCredit = formData.entries
      .filter((entry: VoucherEntryLine) => entry.type === "credit")
      .reduce(
        (sum: number, entry: VoucherEntryLine) => sum + (entry.amount || 0),
        0
      );

    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
    return { totalDebit, totalCredit, isBalanced };
  };

  const { totalDebit, totalCredit, isBalanced } = getBalanceInfo();

  // Print Options Handlers
  const handlePrintClick = () => {
    console.log("Print button clicked");

    // Show print options popup instead of direct print
    setShowPrintOptions(true);
  };

  const handleGenerateInvoice = () => {
    console.log("Generating Debit Note Invoice...");
    setShowPrintOptions(false);
    setShowInvoicePrint(true); // Show invoice print modal
  };

  const handleGenerateEWayBill = () => {
    console.log("Generating E-way Bill...");
    setShowPrintOptions(false);
    setShowEWayBill(true); // Show E-way Bill generation modal
  };

  const handleGenerateEInvoice = () => {
    console.log("Generating E-Invoice...");
    setShowPrintOptions(false);
    // TODO: Implement E-Invoice generation for debit note
    alert("E-Invoice generation feature will be implemented soon!");
  };

  const handleSendToEmail = () => {
    console.log("Sending to Email...");
    setShowPrintOptions(false);
    // TODO: Implement email functionality for debit note
    alert("Email sending feature will be implemented soon!");
  };

  const handleSendToWhatsApp = () => {
    console.log("Sending to WhatsApp...");
    setShowPrintOptions(false);
    // TODO: Implement WhatsApp sharing for debit note
    alert("WhatsApp sharing feature will be implemented soon!");
  };

  // Helper function to get party name
  const getPartyName = (partyId: string) => {
    if (!safeLedgers || safeLedgers.length === 0) return "Unknown Party";

    const party = safeLedgers.find((ledger) => ledger.id === partyId);
    return party ? party.name : "Unknown Party";
  };

  // Company info for invoice printing
  const { companyInfo } = useAppContext();
  const safeCompanyInfo = companyInfo || {
    name: "Your Company Name",
    address: "Your Company Address",
    gstNumber: "N/A",
    phoneNumber: "N/A",
    state: "Default State",
    panNumber: "N/A",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isBalanced) {
      Swal.fire("Error", "Debit & Credit must be equal", "error");
      return;
    }

    try {
      if (!ownerId) {
        Swal.fire("Error", "Owner ID missing", "error");
        return;
      }

      const payload = {
        companyId,
        ownerType,
        ownerId,
        date: formData.date,
        number: formData.number,
        mode: formData.mode,
        narration: formData.narration,
        entries: formData.entries.map((e) => ({
          ledgerId: e.ledgerId,
          amount: e.amount,
          type: e.type,
        })),
      };

      const url = isEditMode
        ? `${import.meta.env.VITE_API_URL}/api/CreditNotevoucher/${id}`
        : `${import.meta.env.VITE_API_URL}/api/CreditNotevoucher`;

      const method = isEditMode ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!result.success) {
        throw new Error(result.message || "Failed");
      }

      Swal.fire({
        icon: "success",
        title: isEditMode ? "Updated" : "Saved",
        text: isEditMode
          ? "Credit Note updated successfully"
          : "Credit Note created successfully",
      }).then(() => {
        navigate(-1);
      });
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Save failed", "error");
    }
  };

  return (
    <div className="pt-[56px] px-4 ">
      <div className="flex items-center mb-6">
        <button
          title="Back"
          onClick={() => navigate(-1)}
          className={`mr-4 p-2 rounded-full ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
            }`}
        >
          <ArrowLeft size={20} />
        </button>

        <div>
          <h1 className="text-2xl font-bold">
            {isEditMode ? "Edit Credit Note" : "Credit Note Voucher"}
          </h1>
        </div>
      </div>

      <div
        className={`p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
          }`}
      >
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="date">
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
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                  : "bg-white border-gray-300 focus:border-blue-500"
                  } outline-none transition-colors`}
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="number"
              >
                Credit Note No.
              </label>
              <input
                type="text"
                id="number"
                name="number"
                value={formData.number}
                readOnly
                disabled
                placeholder="Auto"
                className={`w-full p-2 rounded border cursor-not-allowed opacity-70 ${theme === "dark"
                  ? "bg-gray-700 border-gray-600 text-gray-300"
                  : "bg-gray-100 border-gray-300 text-gray-600"
                  }`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="mode">
                Voucher Mode
              </label>
              <select
                id="mode"
                name="mode"
                value={formData.mode}
                onChange={handleChange}
                title="Voucher Mode"
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                  : "bg-white border-gray-300 focus:border-blue-500"
                  } outline-none transition-colors`}
              >
                <option value="accounting-invoice">Accounting Invoice</option>
              </select>
            </div>
          </div>

          <div
            className={`p-4 mb-6 rounded ${theme === "dark" ? "bg-gray-700" : "bg-gray-50"
              }`}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Entries</h3>
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
                Add Line
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

                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-left">Dr/Cr</th>
                    <th className="px-4 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.entries.map(
                    (entry: VoucherEntryLine, index: number) => (
                      <tr
                        key={index}
                        className={`${theme === "dark"
                          ? "border-b border-gray-600"
                          : "border-b border-gray-300"
                          }`}
                      >
                        <td className="px-4 py-2">
                          <select
                            title="Ledger Account"
                            name="ledgerId"
                            value={entry.ledgerId}
                            onChange={(e) => handleEntryChange(index, e)}
                            required
                            className={`w-full p-2 rounded border ${theme === "dark"
                              ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                              : "bg-white border-gray-300 focus:border-blue-500"
                              } outline-none transition-colors`}
                          >
                            <option value="">Select Ledger</option>
                            {safeLedgers.map((ledger: Ledger) => (
                              <option key={ledger.id} value={ledger.id}>
                                {ledger.name}
                              </option>
                            ))}
                            <option
                              value="add-new"
                              className={`flex items-center px-4 py-2 rounded ${theme === "dark"
                                ? "bg-blue-600 hover:bg-green-700"
                                : "bg-green-600 hover:bg-green-700 text-white"
                                }`}
                            >
                              + Add New Ledger
                            </option>
                          </select>
                        </td>

                        <td className="px-4 py-2">
                          <input
                            title="Amount"
                            type="number"
                            name="amount"
                            value={entry.amount ?? ""}
                            onChange={(e) => handleEntryChange(index, e)}
                            required
                            min="0"
                            step="any"
                            className={`w-full p-2 rounded border text-right ${theme === "dark"
                              ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                              : "bg-white border-gray-300 focus:border-blue-500"
                              } outline-none transition-colors`}
                          />
                        </td>

                        <td className="px-4 py-2">
                          <select
                            title="Dr/Cr"
                            name="type"
                            value={entry.type}
                            onChange={(e) => handleEntryChange(index, e)}
                            required
                            className={`w-full p-2 rounded border ${theme === "dark"
                              ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                              : "bg-white border-gray-300 focus:border-blue-500"
                              } outline-none transition-colors`}
                          >
                            <option value="debit">Dr</option>
                            <option value="credit">Cr</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            title="Remove Entry"
                            type="button"
                            onClick={() => removeEntry(index)}
                            disabled={formData.entries.length <= 2}
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
                    )
                  )}
                </tbody>
                <tfoot>
                  <tr
                    className={`font-semibold ${theme === "dark"
                      ? "border-t border-gray-600"
                      : "border-t border-gray-300"
                      }`}
                  >
                    <td className="px-4 py-2 text-right" colSpan={3}>
                      Totals:
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex flex-col">
                        <span>Dr: ₹{Number(totalDebit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span>Cr: ₹{Number(totalCredit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">
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
                </tfoot>
              </table>
            </div>
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
              className={`w-full p-2 rounded border ${theme === "dark"
                ? "bg-gray-700 border-gray-600 focus:border-blue-500"
                : "bg-white border-gray-300 focus:border-blue-500"
                } outline-none transition-colors`}
            />
          </div>

          <div className="flex justify-end space-x-4">
            <button
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
              onClick={handlePrintClick}
              className={`flex items-center px-4 py-2 rounded ${theme === "dark"
                ? "bg-green-600 hover:bg-green-700"
                : "bg-green-600 hover:bg-green-700 text-white"
                }`}
            >
              <Printer size={18} className="mr-1" />
              Print
            </button>
            <button
              type="submit"
              disabled={!isBalanced}
              className={`flex items-center px-4 py-2 rounded ${!isBalanced
                ? "opacity-50 cursor-not-allowed bg-blue-600"
                : theme === "dark"
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
            >
              <Save size={18} className="mr-1" />
              {isEditMode ? "Update" : "Save"}
            </button>
          </div>
        </form>
      </div>

      <div
        className={`mt-6 p-4 rounded ${theme === "dark" ? "bg-gray-800" : "bg-blue-50"
          }`}
      >
        <p className="text-sm">
          <span className="font-semibold">Note:</span> Credit notes are issued
          to increase the amount due from a customer or to a supplier.
        </p>
      </div>

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
          isQuotation={false}
          onClose={() => setShowInvoicePrint(false)}
          getPartyName={getPartyName}
          getItemDetails={getItemDetails}
          calculateTotals={calculateTotals}
          getGstRateInfo={() => ({
            uniqueGstRatesCount: 1,
            gstRatesUsed: [18],
            totalItems: formData.entries.length,
            breakdown: {},
          })}
          companyInfo={safeCompanyInfo}
          ledgers={safeLedgers}
        />
      )}
    </div>
  );
};

export default CreditNoteVoucher;

