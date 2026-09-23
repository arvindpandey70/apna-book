import { useState, useEffect, useMemo } from "react";
import { useAppContext } from "../context/AppContext";

export const useProfitLossSync = () => {
    const { ledgerGroups } = useAppContext();
    const companyId = localStorage.getItem("company_id") || localStorage.getItem("active_company_id") || "";
    const rawOwnerType = localStorage.getItem("supplier") || "";
    const employeeId = localStorage.getItem("employee_id");
    const userId = localStorage.getItem("user_id") || "";

    const ownerType = (rawOwnerType === "ca" || rawOwnerType === "ca_employee" || rawOwnerType === "new_ca" || rawOwnerType === "employee" || employeeId)
        ? "employee"
        : (rawOwnerType || "employee");

    const ownerId = (rawOwnerType === "ca" || rawOwnerType === "ca_employee" || rawOwnerType === "new_ca" || rawOwnerType === "employee" || employeeId)
        ? (employeeId || userId)
        : userId;

    const [stockItems, setStockItems] = useState<any[]>([]);
    const [purchaseData, setPurchaseData] = useState<any[]>([]);
    const [salesData, setSalesData] = useState<any[]>([]);
    const [ledgerBalances, setLedgerBalances] = useState<Record<number, { debit: number; credit: number }>>({});

    // Group states
    const [indirectIncome, setIndirectIncome] = useState<any[]>([]);
    const [indirectExpenses, setIndirectExpenses] = useState<any[]>([]);
    const [directexpense, setDirectexpense] = useState<any[]>([]);
    const [purchaseLedgers, setPurchaseLedgers] = useState<any[]>([]);
    const [salesLedgers, setSalesLedgers] = useState<any[]>([]);
    const [stockLedgers, setStockLedgers] = useState<any[]>([]);

    useEffect(() => {
        if (!companyId || !ownerType || !ownerId) return;

        const fetchData = async () => {
            try {
                // 1. Fetch Stock Items
                const stockRes = await fetch(`${import.meta.env.VITE_API_URL}/api/stock-items?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`);
                const stockJson = await stockRes.json();
                setStockItems(stockJson.data || []);

                // 2. Fetch Purchase Data (for inventory breakup)
                const purRes = await fetch(`${import.meta.env.VITE_API_URL}/api/purchase-vouchers/purchase-history?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`);
                const purJson = await purRes.json();
                setPurchaseData(purJson.data || []);

                // 3. Fetch Sales Data (for inventory breakup)
                const saleRes = await fetch(`${import.meta.env.VITE_API_URL}/api/sales-vouchers/sale-history?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`);
                const saleJson = await saleRes.json();
                setSalesData(saleJson.data || []);

                // 4. Fetch Ledgers for groups
                const groupSummaryRes = await fetch(`${import.meta.env.VITE_API_URL}/api/group-summary?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`);
                const groupSummaryJson = await groupSummaryRes.json();
                const ledgers = groupSummaryJson.ledgers || [];

                // Helper to check if a group is a descendant of another
                const allGroups = [...(ledgerGroups || [])];
                const isDescendant = (childId: number | string, targetParentId: number | string): boolean => {
                    if (String(childId) === String(targetParentId)) return true;
                    const group = allGroups.find(g => String(g.id) === String(childId));
                    const parent = group ? (group.parent !== undefined ? group.parent : (group as any).parent_id) : null;
                    if (group && parent) return isDescendant(parent, targetParentId);
                    return false;
                };

                // Filter ledgers by group
                setDirectexpense(ledgers.filter((l: any) => isDescendant(l.group_id, -7)));
                setIndirectExpenses(ledgers.filter((l: any) => isDescendant(l.group_id, -10)));
                setIndirectIncome(ledgers.filter((l: any) => isDescendant(l.group_id, -11)));
                setPurchaseLedgers(ledgers.filter((l: any) => isDescendant(l.group_id, -15)));
                setSalesLedgers(ledgers.filter((l: any) => isDescendant(l.group_id, -16)));

                const normalizeStr = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, '');
                const stockInHandGroup = (ledgerGroups || []).find(g => {
                    const name = normalizeStr(g.name || "");
                    const type = normalizeStr(g.type || "");
                    return name.includes("stock") || type.includes("stock");
                });
                const stockInHandGroupId = stockInHandGroup ? String(stockInHandGroup.id) : null;

                const stockLeds = ledgers.filter((l: any) => {
                    const gid = String(l.group_id || l.groupId || "");
                    const gname = normalizeStr(l.groupName || l.group_name || "");
                    const gtype = normalizeStr(l.groupType || l.group_type || l.type || "");
                    return (stockInHandGroupId && gid === stockInHandGroupId) || gname.includes("stock") || gtype.includes("stock");
                });
                setStockLedgers(stockLeds);

                // 5. Fetch Ledger Balances
                const ledgerIds = ledgers.map((l: any) => l.id).join(',');
                if (ledgerIds) {
                    const balanceRes = await fetch(`${import.meta.env.VITE_API_URL}/api/group?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&ledgerIds=${ledgerIds}`);
                    const balanceJson = await balanceRes.json();
                    if (balanceJson.success) {
                        setLedgerBalances(balanceJson.data);
                    }
                }

            } catch (error) {
                console.error("Sync Profit Loss Error:", error);
            }
        };

        fetchData();
    }, [companyId, ownerType, ownerId, ledgerGroups]);

    // Calculations (Unified with ProfitLoss.tsx)
    const inventoryCalculations = useMemo(() => {
        const itemMap: Record<string, any> = {};
        stockItems.forEach((item: any) => {
            const itemName = item.name;
            if (!itemMap[itemName]) {
                itemMap[itemName] = { openingQty: 0, openingValue: 0, inwardQty: 0, inwardValue: 0, outwardQty: 0, outwardValue: 0 };
            }
            if (item.batches && item.batches.length > 0) {
                item.batches.forEach((b: any) => {
                    const q = Number(b.batchQuantity || 0);
                    const r = Number(b.openingRate || 0);
                    itemMap[itemName].openingQty += q;
                    itemMap[itemName].openingValue += q * r;
                });
            } else {
                const q = Number(item.openingBalance || item.quantity || 0);
                const r = Number(item.openingRate || item.rate || 0);
                itemMap[itemName].openingQty += q;
                itemMap[itemName].openingValue += q * r;
            }
        });

        purchaseData.forEach((p: any) => {
            const itemName = p.itemName;
            if (!itemMap[itemName]) itemMap[itemName] = { openingQty: 0, openingValue: 0, inwardQty: 0, inwardValue: 0, outwardQty: 0, outwardValue: 0 };
            const q = Number(p.purchaseQuantity || 0);
            const v = q * Number(p.rate || p.purchaseRate || 0);
            itemMap[itemName].inwardQty += q;
            itemMap[itemName].inwardValue += v;
        });

        salesData.forEach((s: any) => {
            const itemName = s.itemName;
            if (!itemMap[itemName]) return;
            const q = Math.abs(Number(s.qtyChange || 0));
            itemMap[itemName].outwardQty += q;
        });

        let totalOpeningValue = 0;
        let totalClosingValue = 0;

        Object.values(itemMap).forEach((item: any) => {
            const totalInQty = item.openingQty + item.inwardQty;
            const totalInValue = item.openingValue + item.inwardValue;
            const avgRate = totalInQty > 0 ? totalInValue / totalInQty : 0;
            const closingQty = totalInQty - item.outwardQty;
            const closingValue = closingQty * avgRate;
            totalOpeningValue += item.openingValue;
            totalClosingValue += Math.max(0, closingValue);
        });

        return { totalOpeningValue, totalClosingValue };
    }, [stockItems, purchaseData, salesData]);

    const showItemWise = localStorage.getItem("PL_SHOW_ITEM_WISE") === "true";

    const openingStockValue = useMemo(() => {
        if (showItemWise && stockItems.length > 0) return inventoryCalculations.totalOpeningValue;
        return stockLedgers.reduce((sum, l) => sum + Number(l.opening_balance || 0), 0);
    }, [showItemWise, stockItems, inventoryCalculations, stockLedgers]);

    const salesTotal = useMemo(() => {
        return salesLedgers.reduce(
            (sum, item) => sum + ((ledgerBalances[item.id]?.credit || 0) - (ledgerBalances[item.id]?.debit || 0)),
            0
        );
    }, [salesLedgers, ledgerBalances]);

    const purchaseTotal = useMemo(() => {
        return purchaseLedgers.reduce(
            (sum, item) => sum + ((ledgerBalances[item.id]?.debit || 0) - (ledgerBalances[item.id]?.credit || 0)),
            0
        );
    }, [purchaseLedgers, ledgerBalances]);

    const closingStockValue = useMemo(() => {
        if (showItemWise && stockItems.length > 0) return inventoryCalculations.totalClosingValue;
        const opening = openingStockValue;
        if (opening === 0 && purchaseTotal === 0 && salesTotal === 0) return 0;
        return stockLedgers.reduce((sum, l) => sum + Number(l.closing_balance || 0), 0);
    }, [showItemWise, stockItems, inventoryCalculations, stockLedgers, purchaseTotal, salesTotal, openingStockValue]);

    const directExpensesTotal = useMemo(() => directexpense.reduce((sum, item) => sum + ((ledgerBalances[item.id]?.debit || 0) - (ledgerBalances[item.id]?.credit || 0)), 0), [directexpense, ledgerBalances]);
    const indirectExpensesTotal = useMemo(() => indirectExpenses.reduce((sum, item) => sum + ((ledgerBalances[item.id]?.debit || 0) - (ledgerBalances[item.id]?.credit || 0)), 0), [indirectExpenses, ledgerBalances]);
    const indirectIncomeTotal = useMemo(() => indirectIncome.reduce((sum, item) => sum + ((ledgerBalances[item.id]?.credit || 0) - (ledgerBalances[item.id]?.debit || 0)), 0), [indirectIncome, ledgerBalances]);

    const netProfitValue = useMemo(() => {
        const tradingDebit = openingStockValue + purchaseTotal + directExpensesTotal;
        const tradingCredit = salesTotal + closingStockValue;
        const grossProfit = tradingCredit - tradingDebit;

        const profitLossDebit = (grossProfit < 0 ? Math.abs(grossProfit) : 0) + indirectExpensesTotal;
        const profitLossCredit = (grossProfit > 0 ? grossProfit : 0) + indirectIncomeTotal;

        return profitLossCredit - profitLossDebit;
    }, [openingStockValue, purchaseTotal, directExpensesTotal, salesTotal, closingStockValue, indirectExpensesTotal, indirectIncomeTotal]);

    useEffect(() => {
        if (!companyId) return;

        if (netProfitValue > 0) {
            localStorage.setItem(`NET_PROFIT_${companyId}`, netProfitValue.toString());
            localStorage.setItem(`NET_LOSS_${companyId}`, "0");
        } else if (netProfitValue < 0) {
            localStorage.setItem(`NET_PROFIT_${companyId}`, "0");
            localStorage.setItem(`NET_LOSS_${companyId}`, Math.abs(netProfitValue).toString());
        } else {
            localStorage.setItem(`NET_PROFIT_${companyId}`, "0");
            localStorage.setItem(`NET_LOSS_${companyId}`, "0");
        }
        // Persist Closing Stock
        localStorage.setItem(`CLOSING_STOCK_${companyId}`, closingStockValue.toString());
        localStorage.setItem(`OPENING_STOCK_${companyId}`, openingStockValue.toString());

        // Dispatch custom event to notify other components that localStorage changed
        window.dispatchEvent(new Event("storage_sync"));
    }, [netProfitValue, closingStockValue, openingStockValue, companyId]);

    return {
        netProfit: netProfitValue,
        closingStock: closingStockValue,
        openingStock: openingStockValue
    };
};
