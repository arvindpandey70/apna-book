export interface SystemGroup {
    id: number;
    name: string;
    nature: "Assets" | "Liabilities" | "Income" | "Expenses" | "";
    parent?: number | null;
    isSystem: boolean;
}

export const systemPrimaryGroups: SystemGroup[] = [
    { id: -3, name: "Branch/Division", nature: "Assets", isSystem: true },
    { id: -4, name: "Capital Account", nature: "Liabilities", isSystem: true },
    { id: -5, name: "Current Assets", nature: "Assets", isSystem: true },
    { id: -6, name: "Current Liabilities", nature: "Liabilities", isSystem: true },
    { id: -7, name: "Direct Expenses", nature: "Expenses", isSystem: true },
    { id: -8, name: "Direct Income", nature: "Income", isSystem: true },
    { id: -9, name: "Fixed Assets", nature: "Assets", isSystem: true },
    { id: -10, name: "Indirect Expenses", nature: "Expenses", isSystem: true },
    { id: -11, name: "Indirect Income", nature: "Income", isSystem: true },
    { id: -12, name: "Investments", nature: "Assets", isSystem: true },
    { id: -13, name: "Loan(Liability)", nature: "Liabilities", isSystem: true },
    { id: -14, name: "Misc. Expense (Assets)", nature: "Assets", isSystem: true },
    { id: -15, name: "Purchase Accounts", nature: "Expenses", isSystem: true },
    { id: -16, name: "Sales Accounts", nature: "Income", isSystem: true },
    { id: -17, name: "Suspense A/C", nature: "Assets", isSystem: true },
    { id: -18, name: "Profit & Loss A/c", nature: "Liabilities", isSystem: true },
    { id: -19, name: "TDS Payables", nature: "Liabilities", isSystem: true },
    { id: -20, name: "Gst Liabilities", nature: "Liabilities", isSystem: true },
];

export const systemSubGroups: SystemGroup[] = [
    { id: -100, name: "Debit/Credit Note from Creditors", parent: -15, nature: "Expenses", isSystem: true },
    { id: -101, name: "Debit/Credit Note to Debtors", parent: -16, nature: "Income", isSystem: true },
    { id: -102, name: "Deposite(Assest)", parent: -5, nature: "Assets", isSystem: true },
    { id: -103, name: "Duties & Taxes", parent: -6, nature: "Liabilities", isSystem: true },
    { id: -104, name: "Loans and Advances (Assets)", parent: -5, nature: "Assets", isSystem: true },
    { id: -105, name: "Provisions", parent: -6, nature: "Liabilities", isSystem: true },
    { id: -106, name: "Reserves & Surplus", parent: -4, nature: "Liabilities", isSystem: true },
    { id: -107, name: "Secured Loan", parent: -13, nature: "Liabilities", isSystem: true },
    { id: -108, name: "Stock-In-Hand", parent: -5, nature: "Assets", isSystem: true },
    { id: -109, name: "Sundry Creditors", parent: -6, nature: "Liabilities", isSystem: true },
    { id: -110, name: "Sundry Debtors", parent: -5, nature: "Assets", isSystem: true },
    { id: -111, name: "Unsecured Loans", parent: -13, nature: "Liabilities", isSystem: true },
    { id: -112, name: "Cash-in-Hand", parent: -5, nature: "Assets", isSystem: true },
    { id: -113, name: "Bank Accounts", parent: -5, nature: "Assets", isSystem: true },
    { id: -114, name: "Bank OD A/c", parent: -13, nature: "Liabilities", isSystem: true },
    { id: -115, name: "GST", parent: -103, nature: "Liabilities", isSystem: true },
    { id: -116, name: "IGST", parent: -115, nature: "Liabilities", isSystem: true },
    { id: -117, name: "CGST", parent: -115, nature: "Liabilities", isSystem: true },
    { id: -118, name: "SGST", parent: -115, nature: "Liabilities", isSystem: true },
];

export const allSystemGroups: SystemGroup[] = [...systemPrimaryGroups, ...systemSubGroups];

export interface HierarchicalGroup extends SystemGroup {
    level: number;
    parentName?: string;
    path: string;
}

export function buildGroupHierarchy<T extends { id: number | string; name: string; parent?: number | string | null; nature?: any; isSystem?: boolean }>(
    groups: T[]
): (T & { level: number; parentName?: string; path: string })[] {
    const uniqueGroupsMap = new Map<string, T>();
    for (const g of groups) {
        if (!uniqueGroupsMap.has(String(g.id))) {
            uniqueGroupsMap.set(String(g.id), g);
        }
    }
    const allGroups = Array.from(uniqueGroupsMap.values());

    const idMap = new Map<string, T>(allGroups.map(g => [String(g.id), g]));
    const childrenMap = new Map<string, T[]>();
    const roots: T[] = [];

    for (const g of allGroups) {
        const parentId = g.parent !== undefined && g.parent !== null ? String(g.parent) : null;
        if (parentId && idMap.has(parentId) && parentId !== String(g.id)) {
            const list = childrenMap.get(parentId) || [];
            list.push(g);
            childrenMap.set(parentId, list);
        } else {
            roots.push(g);
        }
    }

    roots.sort((a, b) => a.name.localeCompare(b.name));

    const result: (T & { level: number; parentName?: string; path: string })[] = [];
    const visited = new Set<string>();

    function traverse(node: T, level: number, parentPath: string, parentName?: string) {
        if (visited.has(String(node.id))) return;
        visited.add(String(node.id));

        const currentPath = parentPath ? `${parentPath} > ${node.name}` : node.name;
        result.push({
            ...node,
            level,
            parentName,
            path: currentPath,
        });

        const children = childrenMap.get(String(node.id)) || [];
        children.sort((a, b) => a.name.localeCompare(b.name));
        for (const child of children) {
            traverse(child, level + 1, currentPath, node.name);
        }
    }

    for (const root of roots) {
        traverse(root, 0, "");
    }

    for (const g of allGroups) {
        if (!visited.has(String(g.id))) {
            traverse(g, 0, "");
        }
    }

    return result;
}
