import React, { useState } from "react";
import { Save, Trash2, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  addAisEntry,
  deleteAisEntry,
  type AisManualEntry,
} from "../../services/booksVsAisService";

interface AisManualPanelProps {
  companyId: string;
  ownerType?: string;
  ownerId?: string;
  isDark: boolean;
  entries: AisManualEntry[];
  loading?: boolean;
  searchTerm?: string;
  onEntriesChanged: () => Promise<void> | void;
}

const fmtMoney = (v: number) =>
  `₹${(Number.isFinite(v) ? v : 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDateTime = (iso?: string) => {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return String(iso).slice(0, 10);
  return dt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const AisManualPanel: React.FC<AisManualPanelProps> = ({
  companyId,
  ownerType,
  ownerId,
  isDark,
  entries,
  loading = false,
  searchTerm = "",
  onEntriesChanged,
}) => {
  const [narration, setNarration] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const filteredEntries = React.useMemo(() => {
    if (!searchTerm.trim()) return entries;
    const t = searchTerm.toLowerCase().trim();
    return entries.filter(
      (e) =>
        e.narration.toLowerCase().includes(t) ||
        e.amount.toFixed(2).includes(t) ||
        e.createdAt.toLowerCase().includes(t)
    );
  }, [entries, searchTerm]);

  const totalAmount = React.useMemo(
    () => filteredEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [filteredEntries]
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!companyId) {
      setErrorMsg("Please select a company first.");
      return;
    }

    const trimmedNarration = narration.trim();
    if (!trimmedNarration) {
      setErrorMsg("Narration is required.");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount)) {
      setErrorMsg("Please enter a valid amount.");
      return;
    }

    setSaving(true);
    try {
      await addAisEntry({
        companyId,
        ownerType,
        ownerId,
        narration: trimmedNarration,
        amount: parsedAmount,
      });
      setNarration("");
      setAmount("");
      setSuccessMsg("AIS entry saved.");
      await onEntriesChanged();
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to save AIS entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setErrorMsg(null);
    try {
      await deleteAisEntry({ id, companyId });
      await onEntriesChanged();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to delete entry.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Manual Entry Form: Narration + Amount + Save */}
      <form
        onSubmit={handleSave}
        className={`p-3 border-b ${
          isDark ? "border-gray-700 bg-gray-900/40" : "border-gray-200 bg-teal-50/30"
        }`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
          <div className="sm:col-span-6">
            <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Narration
            </label>
            <input
              type="text"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Enter AIS narration / description..."
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                isDark
                  ? "bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                  : "bg-white border-gray-300 text-gray-900"
              }`}
            />
          </div>

          <div className="sm:col-span-4">
            <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Amount (₹)
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                isDark
                  ? "bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                  : "bg-white border-gray-300 text-gray-900"
              }`}
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              Save
            </button>
          </div>
        </div>

        {(errorMsg || successMsg) && (
          <div className="mt-2 text-[11px] flex items-center gap-1.5">
            {errorMsg && (
              <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertCircle size={12} /> {errorMsg}
              </span>
            )}
            {successMsg && (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 size={12} /> {successMsg}
              </span>
            )}
          </div>
        )}
      </form>

      {/* Entries Table */}
      <div className="overflow-x-auto max-h-[450px] flex-1">
        <table className="w-full text-xs">
          <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0 z-10">
            <tr>
              <th className="px-2.5 py-2 text-left w-10">#</th>
              <th className="px-2.5 py-2 text-left">Narration</th>
              <th className="px-2.5 py-2 text-left whitespace-nowrap">Date</th>
              <th className="px-2.5 py-2 text-right whitespace-nowrap">Amount</th>
              <th className="px-2.5 py-2 text-center w-12">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> Loading AIS entries...
                  </span>
                </td>
              </tr>
            ) : filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                  No manual AIS entries added yet. Enter Narration and Amount above and click Save.
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry, idx) => (
                <tr
                  key={entry.id}
                  className="hover:bg-teal-50/40 dark:hover:bg-gray-700/40 transition-colors"
                >
                  <td className="px-2.5 py-2 text-gray-400">{idx + 1}</td>
                  <td className="px-2.5 py-2 font-medium break-words">
                    {entry.narration}
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap text-gray-500 dark:text-gray-400">
                    {fmtDateTime(entry.createdAt)}
                  </td>
                  <td className="px-2.5 py-2 text-right font-semibold text-teal-600 dark:text-teal-400 whitespace-nowrap">
                    {fmtMoney(entry.amount)}
                  </td>
                  <td className="px-2.5 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      title="Delete entry"
                      className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 inline-flex items-center"
                    >
                      {deletingId === entry.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filteredEntries.length > 0 && (
            <tfoot className="bg-gray-100 dark:bg-gray-900 sticky bottom-0 font-semibold border-t border-gray-300 dark:border-gray-700">
              <tr>
                <td colSpan={3} className="px-2.5 py-2 text-right">
                  Total ({filteredEntries.length} entries)
                </td>
                <td className="px-2.5 py-2 text-right text-teal-600 dark:text-teal-400 whitespace-nowrap">
                  {fmtMoney(totalAmount)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default AisManualPanel;
