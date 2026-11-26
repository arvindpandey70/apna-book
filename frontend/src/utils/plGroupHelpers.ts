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

const normalizeNature = (n: string | null | undefined): string => {
  const s = String(n || "").trim().toLowerCase();
  if (!s) return "";
  if (s.startsWith("asset")) return "Assets";
  if (s.startsWith("liab")) return "Liabilities";
  if (s.startsWith("expense")) return "Expenses";
  if (s.startsWith("income") || s === "incomes") return "Income";
  // Preserve exact title-case for known values
  if (s === "assets") return "Assets";
  if (s === "liabilities") return "Liabilities";
  if (s === "expenses") return "Expenses";
  if (s === "income") return "Income";
  return String(n || "").trim();
};

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

/** Current financial year range (Apr–Mar). */
export const getFinancialYearRange = (refDate: Date = new Date()) => {
  const y = refDate.getFullYear();
  const m = refDate.getMonth(); // 0-11
  const fyStartYear = m >= 3 ? y : y - 1;
  return {
    fyStartYear,
    fromDate: `${fyStartYear}-04-01`,
    toDate: `${fyStartYear + 1}-03-31`,
  };
};

/** Previous financial year range. */
export const getPreviousFinancialYearRange = (refDate: Date = new Date()) => {
  const { fyStartYear } = getFinancialYearRange(refDate);
  return {
    fyStartYear: fyStartYear - 1,
    fromDate: `${fyStartYear - 1}-04-01`,
    toDate: `${fyStartYear - 1 + 1}-03-31`,
  };
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
      parent_id: g.parent !== null && g.parent !== undefined ? Number(g.parent) : null,
      nature: g.nature || null,
      type: g.nature?.toLowerCase().replace(" ", "-") || null,
    });
  });

  contextGroups.forEach((g: any) => {
    if (g == null || g.id === undefined || g.id === null) return;
    const parent = getGroupParent(g);
    map.set(String(g.id), {
      ...g,
      id: Number(g.id),
      parent,
      parent_id: parent,
      nature: g.nature || map.get(String(g.id))?.nature || null,
    });
  });

  fetchedGroups.forEach((g: any) => {
    if (g == null || g.id === undefined || g.id === null) return;
    const parent = getGroupParent(g);
    const existing = map.get(String(g.id));
    map.set(String(g.id), {
      ...existing,
      ...g,
      id: Number(g.id),
      parent,
      parent_id: parent,
      nature: g.nature || existing?.nature || null,
    });
  });

  // Inherit nature from parent chain when missing (company copies of system groups)
  map.forEach((g, key) => {
    if (g.nature) return;
    let cur: PlGroup | undefined = g;
    const visited = new Set<string>();
    while (cur && !visited.has(String(cur.id))) {
      visited.add(String(cur.id));
      if (cur.nature) {
        g.nature = normalizeNature(cur.nature);
        map.set(key, g);
        return;
      }
      // Match by name to system group nature
      const byName = allSystemGroups.find(
        (sg) => normalizeStr(sg.name) === normalizeStr(cur?.name || "")
      );
      if (byName?.nature) {
        g.nature = byName.nature;
        map.set(key, g);
        return;
      }
      const p = getGroupParent(cur);
      cur = p !== null ? map.get(String(p)) : undefined;
    }
  });

  return Array.from(map.values());
};

/**
 * Resolve ledger's account nature (Assets / Liabilities / Expenses / Income)
 * using ledger fields, immediate group, or parent chain / system groups.
 */
export const resolveLedgerNature = (
  ledger: any,
  allGroups: PlGroup[]
): string => {
  const direct = normalizeNature(
    ledger?.nature || ledger?.group_nature || ledger?.groupNature || ""
  );
  if (direct === "Assets" || direct === "Liabilities" || direct === "Expenses" || direct === "Income") {
    return direct;
  }

  const gid = ledger?.group_id ?? ledger?.groupId;
  if (gid === null || gid === undefined || gid === "") return "";

  const visited = new Set<string>();
  let currentId: number | string | null = gid;

  while (currentId !== null && currentId !== undefined && !visited.has(String(currentId))) {
    visited.add(String(currentId));
    const group = allGroups.find((g) => String(g.id) === String(currentId));
    if (!group) {
      const sys = allSystemGroups.find((g) => String(g.id) === String(currentId));
      if (sys?.nature) return normalizeNature(sys.nature);
      break;
    }
    const n = normalizeNature(group.nature || "");
    if (n === "Assets" || n === "Liabilities" || n === "Expenses" || n === "Income") {
      return n;
    }
    const byName = allSystemGroups.find(
      (sg) => normalizeStr(sg.name) === normalizeStr(group.name || "")
    );
    if (byName?.nature) return normalizeNature(byName.nature);

    currentId = getGroupParent(group);
  }

  return "";
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

export type AccountRootOpts = {
  systemId: number;
  rootNameNormalized: string;
};

/** Resolve root group IDs (system root preferred, deduplicated by normalized name). */
export const findAccountRootIds = (
  allGroups: PlGroup[],
  opts: AccountRootOpts
): number[] => {
  const roots = allGroups.filter((g) => {
    const name = normalizeStr(g.name || "");
    const parent = getGroupParent(g);
    return (
      Number(g.id) === opts.systemId ||
      (name === opts.rootNameNormalized &&
        (parent === null || parent === 0 || parent === opts.systemId))
    );
  });

  const sortedRoots = [...roots].sort((a, b) =>
    Number(a.id) === opts.systemId ? -1 : Number(b.id) === opts.systemId ? 1 : 0
  );
  const seen = new Set<string>();
  const ids: number[] = [];
  sortedRoots.forEach((g) => {
    const key = normalizeStr(g.name || "") || String(g.id);
    if (seen.has(key)) return;
    seen.add(key);
    ids.push(Number(g.id));
  });

  if (ids.length === 0) ids.push(opts.systemId);
  return ids;
};

/** Direct child subgroups under `parentId` (including same-named company copies), deduplicated by name. */
export const getChildAccountGroups = (
  allGroups: PlGroup[],
  parentId: number,
  opts: AccountRootOpts
): PlGroup[] => {
  const parentGroup = allGroups.find((g) => Number(g.id) === Number(parentId));
  const parentName = normalizeStr(parentGroup?.name || "");

  const equivalentParentIds = new Set<number>([Number(parentId)]);
  if (parentName) {
    allGroups.forEach((g) => {
      if (normalizeStr(g.name || "") === parentName) {
        equivalentParentIds.add(Number(g.id));
      }
    });
  }
  if (Number(parentId) === opts.systemId || parentName === opts.rootNameNormalized) {
    allGroups.forEach((g) => {
      if (normalizeStr(g.name || "") === opts.rootNameNormalized) {
        equivalentParentIds.add(Number(g.id));
      }
    });
    equivalentParentIds.add(opts.systemId);
  }

  const children = allGroups.filter((g) => {
    const p = getGroupParent(g);
    if (p === null) return false;
    if (!equivalentParentIds.has(Number(p))) return false;
    if (
      equivalentParentIds.has(Number(g.id)) &&
      parentName &&
      normalizeStr(g.name || "") === parentName
    ) {
      return false;
    }
    return isUnderAccountRoot(allGroups, g.id, opts);
  });

  const unique: PlGroup[] = [];
  const seenNames = new Set<string>();
  children.forEach((g) => {
    const key = normalizeStr(g.name || "") || String(g.id);
    if (seenNames.has(key)) return;
    seenNames.add(key);
    unique.push(g);
  });

  return unique.sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""))
  );
};

/** Ledgers directly attached to `groupId` (or same-named company copies). */
export const getDirectGroupLedgers = <
  T extends { group_id: number; name: string }
>(
  allGroups: PlGroup[],
  ledgers: T[],
  groupId: number
): T[] => {
  const group = allGroups.find((g) => Number(g.id) === Number(groupId));
  const groupName = normalizeStr(group?.name || "");

  const equivalentIds = new Set<number>([Number(groupId)]);
  if (groupName) {
    allGroups.forEach((g) => {
      if (normalizeStr(g.name || "") === groupName) {
        equivalentIds.add(Number(g.id));
      }
    });
  }

  return ledgers
    .filter((l) => equivalentIds.has(Number(l.group_id)))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/** All ledgers directly under `groupId` or any of its descendant subgroups, deduplicated by id. */
export const collectGroupDescendantLedgers = <
  T extends { id: number; group_id: number; name: string }
>(
  allGroups: PlGroup[],
  ledgers: T[],
  groupId: number,
  opts: AccountRootOpts,
  visited = new Set<number>()
): T[] => {
  if (visited.has(Number(groupId))) return [];
  visited.add(Number(groupId));

  const direct = getDirectGroupLedgers(allGroups, ledgers, groupId);
  const childGroups = getChildAccountGroups(allGroups, groupId, opts);
  let all = [...direct];

  childGroups.forEach((cg) => {
    all = [
      ...all,
      ...collectGroupDescendantLedgers(
        allGroups,
        ledgers,
        Number(cg.id),
        opts,
        visited
      ),
    ];
  });

  return Array.from(new Map(all.map((l) => [l.id, l])).values());
};
