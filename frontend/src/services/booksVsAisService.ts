export interface AisManualEntry {
  id: string;
  companyId: string;
  narration: string;
  amount: number;
  createdAt: string;
}

const STORAGE_PREFIX = "apnabook_ais_manual_";
export const AIS_UPDATED_EVENT = "ais-entries-updated";

const getStorageKey = (companyId: string) =>
  `${STORAGE_PREFIX}${companyId || "default"}`;

export function getLocalAisEntries(companyId: string): AisManualEntry[] {
  try {
    const raw = localStorage.getItem(getStorageKey(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((r: any) => ({
          id: String(r.id || ""),
          companyId: String(r.companyId || companyId),
          narration: String(r.narration || ""),
          amount: Number(r.amount || 0),
          createdAt: String(r.createdAt || new Date().toISOString()),
        }))
      : [];
  } catch {
    return [];
  }
}

function saveLocalAisEntries(companyId: string, entries: AisManualEntry[]) {
  try {
    localStorage.setItem(getStorageKey(companyId), JSON.stringify(entries));
  } catch (err) {
    console.warn("Unable to write AIS entries to localStorage:", err);
  }
}

export async function fetchAisEntries(companyId: string): Promise<AisManualEntry[]> {
  if (!companyId) return [];
  const apiBase = import.meta.env.VITE_API_URL || "";

  try {
    const res = await fetch(
      `${apiBase}/api/books-vs-ais/entries?company_id=${encodeURIComponent(companyId)}`
    );
    if (res.ok) {
      const json = await res.json();
      if (json?.success && Array.isArray(json.data)) {
        const entries: AisManualEntry[] = json.data.map((r: any) => ({
          id: String(r.id),
          companyId: String(r.companyId || companyId),
          narration: String(r.narration || ""),
          amount: Number(r.amount || 0),
          createdAt: String(r.createdAt || new Date().toISOString()),
        }));
        saveLocalAisEntries(companyId, entries);
        return entries;
      }
    }
  } catch (err) {
    console.warn("Backend AIS fetch unavailable, using local storage:", err);
  }

  return getLocalAisEntries(companyId);
}

export async function addAisEntry(params: {
  companyId: string;
  ownerType?: string;
  ownerId?: string;
  narration: string;
  amount: number;
}): Promise<{ entry: AisManualEntry; savedToDb: boolean }> {
  const { companyId, ownerType, ownerId, narration, amount } = params;
  const apiBase = import.meta.env.VITE_API_URL || "";

  let created: AisManualEntry | null = null;
  let savedToDb = false;

  try {
    const res = await fetch(`${apiBase}/api/books-vs-ais/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: companyId,
        owner_type: ownerType || null,
        owner_id: ownerId || null,
        narration: narration.trim(),
        amount,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.success && json?.data) {
        created = {
          id: String(json.data.id),
          companyId: String(json.data.companyId || companyId),
          narration: String(json.data.narration || narration.trim()),
          amount: Number(json.data.amount ?? amount),
          createdAt: String(json.data.createdAt || new Date().toISOString()),
        };
        savedToDb = true;
      }
    }
  } catch (err) {
    console.warn("Backend AIS save unavailable, saving locally:", err);
  }

  if (!created) {
    created = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      companyId,
      narration: narration.trim(),
      amount: Number(amount.toFixed(2)),
      createdAt: new Date().toISOString(),
    };
  }

  const existing = getLocalAisEntries(companyId).filter((e) => e.id !== created!.id);
  const updated = [created, ...existing];
  saveLocalAisEntries(companyId, updated);
  window.dispatchEvent(new CustomEvent(AIS_UPDATED_EVENT, { detail: { companyId } }));

  return { entry: created, savedToDb };
}

export async function deleteAisEntry(params: {
  id: string;
  companyId: string;
}): Promise<void> {
  const { id, companyId } = params;
  const apiBase = import.meta.env.VITE_API_URL || "";

  if (/^\d+$/.test(id)) {
    try {
      await fetch(
        `${apiBase}/api/books-vs-ais/entries/${encodeURIComponent(id)}?company_id=${encodeURIComponent(
          companyId
        )}`,
        { method: "DELETE" }
      );
    } catch (err) {
      console.warn("Backend AIS delete unavailable, removing locally:", err);
    }
  }

  const remaining = getLocalAisEntries(companyId).filter((e) => e.id !== id);
  saveLocalAisEntries(companyId, remaining);
  window.dispatchEvent(new CustomEvent(AIS_UPDATED_EVENT, { detail: { companyId } }));
}
