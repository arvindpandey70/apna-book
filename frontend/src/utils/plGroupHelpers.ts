import { allSystemGroups } from "../constants/ledgerGroups";

export type PlGroup = {
  id: number;
  name?: string;
  parent?: number | null;
  parent_id?: number | null;
  type?: string | null;
  nature?: string | null;
  [key: string]: any;
};

const normalizeStr = (s: string) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Normalize parent from either `parent` or `parent_id`. */
export const getGroupParent = (group: PlGroup | null | undefined): number | null => {
  if (!group) return null;
  const raw =
    group.parent !== undefined && group.parent !== null
      ? group.parent
      : group.parent_id !== undefined && group.parent_id !== null
        ? group.parent_id
        : null;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
};

/** Merge system + API/context groups; later entries win on same id. */
export const buildAllGroups = (
  fetchedGroups: any[] = [],
  contextGroups: any[] = []
): PlGroup[] => {
  const map = new Map<string, PlGroup>();

  allSystemGroups.forEach((g) => {
    map.set(String(g.id), {
      id: Number(g.id),
      name: g.name,
      parent: g.parent !== null && g.parent !== undefined ? Number(g.parent) : null,
      type: g.nature?.toLowerCase().replace(" ", "-") || null,
    });
  });

  contextGroups.forEach((g: any) => {
    if (g == null || g.id === undefined || g.id === null) return;
    map.set(String(g.id), {
      ...g,
      id: Number(g.id),
      parent: getGroupParent(g),
    });
  });

  fetchedGroups.forEach((g: any) => {
    if (g == null || g.id === undefined || g.id === null) return;
    map.set(String(g.id), {
      ...g,
      id: Number(g.id),
      parent: getGroupParent(g),
    });
  });

  return Array.from(map.values());
};

/** Walk parent chain: true if childId is targetParentId or under it. */
export const isDescendant = (
  allGroups: PlGroup[],
  childId: number | string | null | undefined,
  targetParentId: number | string,
  visited = new Set<string>()
): boolean => {
  if (childId === null || childId === undefined || childId === "") return false;
  const id = String(childId);
  if (id === String(targetParentId)) return true;
  if (visited.has(id)) return false;
  visited.add(id);

  const group = allGroups.find((g) => String(g.id) === id);
  const parent = getGroupParent(group);
  if (parent === null) return false;
  return isDescendant(allGroups, parent, targetParentId, visited);
};

/**
 * True if group sits under a root like Purchase Accounts / Sales Accounts.
 * Covers system ids (-15/-16) and company-local copies matched by name.
 */
export const isUnderAccountRoot = (
  allGroups: PlGroup[],
  groupId: number | string | null | undefined,
  opts: { systemId: number; rootNameNormalized: string },
  visited = new Set<string>()
): boolean => {
  if (groupId === null || groupId === undefined || groupId === "") return false;
  const id = String(groupId);
  if (id === String(opts.systemId)) return true;
  if (visited.has(id)) return false;
  visited.add(id);

  const group = allGroups.find((g) => String(g.id) === id);
  if (!group) return false;

  const name = normalizeStr(group.name || "");
  if (name === opts.rootNameNormalized) return true;

  const parent = getGroupParent(group);
  if (parent === null) return false;
  return isUnderAccountRoot(allGroups, parent, opts, visited);
};

export const isUnderPurchaseAccounts = (
  allGroups: PlGroup[],
  groupId: number | string | null | undefined
): boolean =>
  isUnderAccountRoot(allGroups, groupId, {
    systemId: -15,
    rootNameNormalized: "purchaseaccounts",
  });

export const isUnderSalesAccounts = (
  allGroups: PlGroup[],
  groupId: number | string | null | undefined
): boolean =>
  isUnderAccountRoot(allGroups, groupId, {
    systemId: -16,
    rootNameNormalized: "salesaccounts",
  });
