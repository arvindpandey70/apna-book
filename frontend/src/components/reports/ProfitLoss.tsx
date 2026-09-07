import React, { useEffect, useState, useMemo } from "react";
import { useAppContext } from "../../context/AppContext";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Printer, Download, Filter, Settings } from "lucide-react";

const ProfitLoss: React.FC = () => {
  const { theme, ledgers, ledgerGroups } = useAppContext();
  const navigate = useNavigate();
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showFullData, setShowFullData] = useState(false);
  const [showInventoryBreakup, setShowInventoryBreakup] = useState(
    localStorage.getItem("PL_SHOW_INVENTORY") === "true"
  );
  const [showDetailed, setShowDetailed] = useState(
    localStorage.getItem("PL_SHOW_DETAILED") === "true"
  );
  const [showItemWise, setShowItemWise] = useState(
    localStorage.getItem("PL_SHOW_ITEM_WISE") === "true"
  );
  const [ledgerBalances, setLedgerBalances] = useState<Record<number, { debit: number; credit: number }>>({});

  // Persist view settings
  useEffect(() => {
    localStorage.setItem("PL_SHOW_DETAILED", String(showDetailed));
  }, [showDetailed]);

  useEffect(() => {
    localStorage.setItem("PL_SHOW_ITEM_WISE", String(showItemWise));
  }, [showItemWise]);

  useEffect(() => {
    localStorage.setItem("PL_SHOW_INVENTORY", String(showInventoryBreakup));
  }, [showInventoryBreakup]);



  const companyId = localStorage.getItem("company_id");
  const ownerType = localStorage.getItem("supplier");
  const ownerId =
    localStorage.getItem(
      ownerType === "employee" ? "employee_id" : "user_id"
    ) || "";

  // Navigation handlers
  const handleStockClick = () => {
    navigate("/app/reports/stock-summary");
  };

  //get stock opening  data
  const [stockopening, setStockopening] = useState([]);
  const [stockItems, setStockItems] = useState<any[]>([]);

  useEffect(() => {
    const stockBatch = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/stock-items?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );

        if (!res.ok) {
          throw new Error("Failed to fetch stock items");
        }

        const data = await res.json();

        // Store full stock items for inventory breakup
        setStockItems(data.data || []);

        const allBatches = data.data.flatMap((item: any) => item.batches || []);

        setStockopening(allBatches);
      } catch (error) {
        console.error("Stock batch fetch error:", error);
      }
    };

    if (companyId && ownerType && ownerId) {
      stockBatch();
    }
  }, [companyId, ownerType, ownerId]);

  type SimpleLedger = {
    id: number;
    name: string;
    opening_balance: number | string;
  };

  //get purchase Data
  const [purchaseData, setPurchaseData] = useState<any[]>([]);

  useEffect(() => {
    const fetchPurchaseData = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/purchase-vouchers/purchase-history?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );

        const result = await res.json();
        console.log('purchase history', result.data)

        setPurchaseData(result.data || []);
      } catch (error) {
        console.error("Purchase fetch error", error);
      }
    };

    fetchPurchaseData();
  }, [companyId, ownerType, ownerId]);

  //sales data
  const [salesData, setSalesData] = useState<any[]>([]);
  useEffect(() => {
    const fatchSalesData = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/sales-vouchers/sale-history?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
        );
        const result = await res.json();
        console.log('sales', result.data)

        setSalesData(result.data);
      } catch (error) {
        console.log("SalesData fatch error", error);
      }
    };

    fatchSalesData();
  }, [companyId, ownerType, ownerId]);

  //get purchase ledger or Sales Ladger
  const [purchaseLedgers, setPurchaseLedgers] = useState<SimpleLedger[]>([]);
  const [salesLedgers, setSalesLedgers] = useState<SimpleLedger[]>([]);
  const [directexpense, setDirectexpense] = useState<SimpleLedger[]>([]);
  const [directincome, setDirectincome] = useState<SimpleLedger[]>([]);
  const [indirectExpenses, setIndirectExpenses] = useState<SimpleLedger[]>([]);
  const [indirectIncome, setIndirectIncome] = useState<SimpleLedger[]>([]);
  const [stockLedgers, setStockLedgers] = useState<any[]>([]);

  useEffect(() => {
    fetch(
      `${import.meta.env.VITE_API_URL
      }/api/group-summary?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}`
    )
      .then((res) => res.json())
      .then((data) => {
        const ledgers = data.ledgers || [];

        // Helper to check if a group is a descendant of another
        const allGroups = [...(ledgerGroups || [])];
        const isDescendant = (childId: number | string, targetParentId: number | string): boolean => {
          if (String(childId) === String(targetParentId)) return true;
          const group = allGroups.find(g => String(g.id) === String(childId));
          if (group && group.parent_id) return isDescendant(group.parent_id, targetParentId);
          return false;
        };

        // Purchase → group_id = -15 or descendant
        const purchases: SimpleLedger[] = ledgers
          .filter((l: any) => isDescendant(l.group_id, -15))
          .map((l: any) => ({
            id: Number(l.id),
            name: l.name,
            opening_balance: l.opening_balance,
          }));

        // Sales → group_id = -16 or descendant
        const sales: SimpleLedger[] = ledgers
          .filter((l: any) => isDescendant(l.group_id, -16))
          .map((l: any) => ({
            id: Number(l.id),
            name: l.name,
            opening_balance: l.opening_balance,
          }));

        // direct-expense
        const directExpense: SimpleLedger[] = ledgers
          .filter((l: any) => {
            const gid = String(l.group_id);
            const gtype = (l.group_type || "").toLowerCase();
            const pgtype = (l.parent_group_type || "").toLowerCase();

            if (isDescendant(gid, -7)) return true;
            if (gtype === "direct-expenses" || pgtype === "direct-expenses" || gtype === "direct-expense" || pgtype === "direct-expense") return true;

            const group = (ledgerGroups || []).find(g => String(g.id) === gid);
            return group?.type === "direct-expenses";
          })
          .map((l: any) => ({
            id: Number(l.id),
            name: l.name,
            opening_balance: l.opening_balance,
          }));

        // indirect-expenses
        const indExpenses: SimpleLedger[] = ledgers
          .filter((l: any) => {
            const gid = String(l.group_id);
            const gtype = (l.group_type || "").toLowerCase();
            const pgtype = (l.parent_group_type || "").toLowerCase();

            if (isDescendant(gid, -10)) return true;
            if (gtype === "indirect-expenses" || pgtype === "indirect-expenses" || gtype === "indirect-expense" || pgtype === "indirect-expense") return true;

            const group = (ledgerGroups || []).find(g => String(g.id) === gid);
            return group?.type === "indirect-expenses";
          })
          .map((l: any) => ({
            id: Number(l.id),
            name: l.name,
            opening_balance: l.opening_balance,
          }));

        // direct-income
        const dirIncome: SimpleLedger[] = ledgers
          .filter((l: any) => {
            const gid = String(l.group_id);
            const gtype = (l.group_type || "").toLowerCase();
            const pgtype = (l.parent_group_type || "").toLowerCase();

            if (isDescendant(gid, -8)) return true;
            if (gtype === "direct-income" || pgtype === "direct-income" || gtype === "direct-incomes" || pgtype === "direct-incomes") return true;

            const group = (ledgerGroups || []).find(g => String(g.id) === gid);
            return group?.type === "direct-income";
          })
          .map((l: any) => ({
            id: Number(l.id),
            name: l.name,
            opening_balance: l.opening_balance,
          }));

        // indirect-income
        const indIncome: SimpleLedger[] = ledgers
          .filter((l: any) => {
            const gid = String(l.group_id);
            const gtype = (l.group_type || "").toLowerCase();
            const pgtype = (l.parent_group_type || "").toLowerCase();

            if (isDescendant(gid, -11)) return true;
            if (gtype === "indirect-income" || pgtype === "indirect-income" || gtype === "indirect-incomes" || pgtype === "indirect-incomes") return true;

            const group = (ledgerGroups || []).find(g => String(g.id) === gid);
            return group?.type === "indirect-income";
          })
          .map((l: any) => ({
            id: Number(l.id),
            name: l.name,
            opening_balance: l.opening_balance,
          }));

        // Robust Stock-in-hand group identification
        const normalizeStr = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, '');

        const stockInHandGroup = (ledgerGroups || []).find(g => {
          const name = normalizeStr(g.name || "");
          const type = normalizeStr(g.type || "");
          return name.includes("stock") || type.includes("stock");
        });

        const stockInHandGroupId = stockInHandGroup ? String(stockInHandGroup.id) : null;

        const stockItems = ledgers.filter((l: any) => {
          const gid = String(l.group_id || l.groupId || "");
          const gname = normalizeStr(l.groupName || l.group_name || "");
          const gtype = normalizeStr(l.groupType || l.group_type || l.type || "");

          return (stockInHandGroupId && gid === stockInHandGroupId) ||
            gname.includes("stock") ||
            gtype.includes("stock");
        });

        setPurchaseLedgers(purchases);
        setSalesLedgers(sales);
        setDirectexpense(directExpense);
        setDirectincome(dirIncome);
        setIndirectExpenses(indExpenses);
        setIndirectIncome(indIncome);
        setStockLedgers(stockItems);

        // Fetch balances for all returned ledgers to show transactions
        const ledgerIds = ledgers.map((l: any) => l.id).join(',');
        if (ledgerIds) {
          fetch(`${import.meta.env.VITE_API_URL}/api/group?company_id=${companyId}&owner_type=${ownerType}&owner_id=${ownerId}&ledgerIds=${ledgerIds}`)
            .then((res) => res.json())
            .then((balanceData) => {
              if (balanceData.success) {
                setLedgerBalances(balanceData.data);
              }
            })
            .catch((err) => console.error("Failed to fetch ledger balances:", err));
        }
      })
      .catch((err) => {
        console.error("Failed to fetch ledgers:", err);
        setPurchaseLedgers([]);
        setSalesLedgers([]);
        setStockLedgers([]);
      });
  }, [companyId, ownerId, ownerType, ledgerGroups]);

  console.log('stock', stockLedgers)
  // Calculate opening stock from Stock-in-hand ledgers
  const getOpeningStock = () => {
    return stockLedgers.reduce((sum, l) => {
      const balance = Number(l.opening_balance || 0);
      return sum + balance;
    }, 0);
  };

  // Unified Inventory Calculations (Item-wise)
  const inventoryCalculations = useMemo(() => {
    const itemMap: Record<string, any> = {};

    // 1. Initialize with Stock Items (Opening)
    stockItems.forEach((item: any) => {
      const itemName = item.name;
      if (!itemMap[itemName]) {
        itemMap[itemName] = {
          id: item.id,
          name: itemName,
          openingQty: 0,
          openingValue: 0,
          inwardQty: 0,
          inwardValue: 0,
          outwardQty: 0,
          outwardValue: 0,
          closingQty: 0,
          closingValue: 0,
          avgRate: 0,
          batches: item.batches || []
        };
      }

      let batchesProcessed = false;
      if (item.batches && item.batches.length > 0) {
        item.batches.forEach((b: any) => {
          const q = Number(b.batchQuantity || 0);
          const r = Number(b.openingRate || 0);
          itemMap[itemName].openingQty += q;
          itemMap[itemName].openingValue += q * r;
          batchesProcessed = true;
        });
      }

      if (!batchesProcessed && (Number(item.openingBalance || 0) > 0 || Number(item.quantity || 0) > 0)) {
        const q = Number(item.openingBalance || item.quantity || 0);
        const r = Number(item.openingRate || item.rate || 0);
        itemMap[itemName].openingQty += q;
        itemMap[itemName].openingValue += q * r;
      }
    });

    // 2. Add Inwards (Purchases)
    purchaseData.forEach((p: any) => {
      const itemName = p.itemName;
      if (!itemMap[itemName]) {
        itemMap[itemName] = {
          id: itemName,
          name: itemName,
          openingQty: 0,
          openingValue: 0,
          inwardQty: 0,
          inwardValue: 0,
          outwardQty: 0,
          outwardValue: 0,
          closingQty: 0,
          closingValue: 0,
          avgRate: 0,
          batches: []
        };
      }
      const q = Number(p.purchaseQuantity || 0);
      const v = q * Number(p.rate || p.purchaseRate || 0);
      itemMap[itemName].inwardQty += q;
      itemMap[itemName].inwardValue += v;
    });

    // 3. Add Outwards (Sales)
    salesData.forEach((s: any) => {
      const itemName = s.itemName;
      if (!itemMap[itemName]) return;
      const q = Math.abs(Number(s.qtyChange || 0));
      itemMap[itemName].outwardQty += q;
    });

    // 4. Final Calculations (Weighted Average Cost)
    let totalOpeningValue = 0;
    let totalClosingValue = 0;

    Object.values(itemMap).forEach((item: any) => {
      const totalInQty = item.openingQty + item.inwardQty;
      const totalInValue = item.openingValue + item.inwardValue;
      item.avgRate = totalInQty > 0 ? totalInValue / totalInQty : 0;

      item.closingQty = totalInQty - item.outwardQty;
      item.closingValue = item.closingQty * item.avgRate;

      // Precision fix
      if (Math.abs(item.closingQty) < 0.001) item.closingQty = 0;
      if (Math.abs(item.closingValue) < 0.01) item.closingValue = 0;

      totalOpeningValue += item.openingValue;
      totalClosingValue += Math.max(0, item.closingValue);
    });

    return {
      items: Object.values(itemMap),
      totalOpeningValue,
      totalClosingValue
    };
  }, [stockItems, purchaseData, salesData]);

  // Unified Opening Stock Value Accessor
  const calculateOpeningStockValue = () => {
    if (showItemWise && stockItems.length > 0) {
      return inventoryCalculations.totalOpeningValue;
    }
    return getOpeningStock();
  };



  // Income calculations
  const getSalesTotal = () => {
    return salesLedgers.reduce(
      (sum, item) => sum + ((ledgerBalances[item.id]?.credit || 0) - (ledgerBalances[item.id]?.debit || 0)),
      0
    );
  };

  // Sales + Closing Stock (Final Sales)
  const getFinalSalesTotal = () => {
    return getSalesTotal()
  };


  const getIndirectIncomeTotal = () => {
    return indirectIncome.reduce(
      (sum, item) => sum + ((ledgerBalances[item.id]?.credit || 0) - (ledgerBalances[item.id]?.debit || 0)),
      0
    );
  };

  const getDirectIncomeTotal = () => {
    return directincome.reduce(
      (sum, item) => sum + ((ledgerBalances[item.id]?.credit || 0) - (ledgerBalances[item.id]?.debit || 0)),
      0
    );
  };

  // Expense calculations
  const getPurchaseTotal = () => {
    return purchaseLedgers.reduce(
      (sum, item) => sum + ((ledgerBalances[item.id]?.debit || 0) - (ledgerBalances[item.id]?.credit || 0)),
      0
    );
  };




  const getDirectExpensesTotal = () => {
    return directexpense.reduce(
      (sum, item) => sum + ((ledgerBalances[item.id]?.debit || 0) - (ledgerBalances[item.id]?.credit || 0)),
      0
    );
  };

  const getIndirectExpensesTotal = () => {
    return indirectExpenses.reduce(
      (sum, item) => sum + ((ledgerBalances[item.id]?.debit || 0) - (ledgerBalances[item.id]?.credit || 0)),
      0
    );
  };

  // Calculate closing stock: 0 if Opening, Purchase, and Sales are all 0
  const getClosingStock = () => {
    const opening = getOpeningStock();
    const purchase = getPurchaseTotal();
    const sales = getSalesTotal();

    if (opening === 0 && purchase === 0 && sales === 0) {
      return 0;
    }

    return stockLedgers.reduce((sum, l) => {
      const balance = Number(l.closing_balance || 0);
      return sum + balance;
    }, 0);
  };

  // Trading Account calculations (Gross Profit/Loss)
  const getTradingDebitTotal = () => {
    return calculateOpeningStockValue() + getPurchaseTotal() + getDirectExpensesTotal();
  };

  const getTradingCreditTotal = () => {
    return getSalesTotal() + getDirectIncomeTotal() + calculateClosingStockValue();
  };


  const getGrossProfit = () => {
    return getTradingCreditTotal() - getTradingDebitTotal();
  };

  // Profit & Loss Account calculations (Net Profit/Loss)
  const getProfitLossDebitTotal = () => {
    const grossLoss = getGrossProfit() < 0 ? Math.abs(getGrossProfit()) : 0;
    return grossLoss + getIndirectExpensesTotal();
  };

  const getProfitLossCreditTotal = () => {
    const grossProfit = getGrossProfit() > 0 ? getGrossProfit() : 0;
    return grossProfit + getIndirectIncomeTotal();
  };

  const getNetProfit = () => {
    return getProfitLossCreditTotal() - getProfitLossDebitTotal();
  };

  // Unified Inventory Breakup Accessors
  const getOpeningStockByItems = () => {
    return inventoryCalculations.items
      .filter(item => item.openingValue > 0)
      .map(item => ({
        id: item.id,
        name: item.name,
        batches: item.batches,
        totalValue: item.openingValue
      }));
  };

  const getPurchaseByItems = () => {
    const items = inventoryCalculations.items
      .filter(item => item.inwardValue > 0)
      .map(item => ({
        id: item.id,
        name: item.name,
        qty: item.inwardQty,
        rate: item.inwardQty > 0 ? item.inwardValue / item.inwardQty : 0,
        value: item.inwardValue
      }));

    // Add virtual row for Accounting Vouchers / Non-Inventory Purchases
    const totalPurchase = getPurchaseTotal();
    const itemTotal = items.reduce((sum, i) => sum + i.value, 0);
    const diff = totalPurchase - itemTotal;

    if (Math.abs(diff) > 0.01) {
      items.push({
        id: "non-inv-purchase",
        name: "Ledger-based (Accounting) Purchases",
        qty: 0,
        rate: 0,
        value: diff
      });
    }

    return items;
  };

  const getSalesByItems = () => {
    const revenueMap: Record<string, any> = {};
    salesData.forEach(s => {
      const q = Math.abs(Number(s.qtyChange || 0));
      const v = q * Number(s.rate || 0);
      const name = s.itemName || "Unknown Item";
      if (!revenueMap[name]) {
        revenueMap[name] = { id: name, name: name, qty: 0, value: 0 };
      }
      revenueMap[name].qty += q;
      revenueMap[name].value += v;
    });

    const items = Object.values(revenueMap).map(item => ({
      ...item,
      rate: item.qty > 0 ? item.value / item.qty : 0
    })).filter(item => item.value > 0);

    // Add virtual row for Accounting Vouchers / Non-Inventory Sales
    const totalSales = getSalesTotal();
    const itemTotal = items.reduce((sum, i) => sum + i.value, 0);
    const diff = totalSales - itemTotal;

    if (Math.abs(diff) > 0.01) {
      items.push({
        id: "non-inv-sales",
        name: "Ledger-based (Accounting) Sales",
        qty: 0,
        rate: 0,
        value: diff
      });
    }

    return items;
  };

  // Unified Closing Stock Value Accessor
  const calculateClosingStockValue = () => {
    if (showItemWise && stockItems.length > 0) {
      return inventoryCalculations.totalClosingValue;
    }
    return getClosingStock();
  };

  const getClosingStockByItems = () => {
    return inventoryCalculations.items
      .filter(item => item.closingValue > 0)
      .map(item => ({
        id: item.id,
        name: item.name,
        opening: item.openingValue,
        purchase: item.inwardValue,
        sales: item.outwardQty * item.avgRate, // This is COGS
        closing: item.closingValue
      }));
  };

  const getIndirectIncomeLedgers = () => {
    return ledgers.filter((l) => {
      const gid = String(l.groupId || l.group_id);
      const group = ledgerGroups.find((g) => String(g.id) === gid);
      const gtype = (group?.type || l.groupType || l.group_type || "").toLowerCase();
      const pgtype = (l.parent_group_type || "").toLowerCase();

      return gid === "-11" || gtype === "indirect-income" || gtype === "indirect-incomes" || pgtype === "indirect-income" || pgtype === "indirect-incomes";
    });
  };

  const getIndirectExpensesLedgers = () => {
    return ledgers.filter((l) => {
      const gid = String(l.groupId || l.group_id);
      const group = ledgerGroups.find((g) => String(g.id) === gid);
      const gtype = (group?.type || l.groupType || l.group_type || "").toLowerCase();
      const pgtype = (l.parent_group_type || "").toLowerCase();

      return gid === "-10" || gtype === "indirect-expenses" || gtype === "indirect-expense" || pgtype === "indirect-expenses" || pgtype === "indirect-expense";
    });
  };

  // Drilldown handlers for GST breakup rows
  const handlePurchaseLedgerClick = (ledgerName: string, ledgerId: number) => {
    navigate(
      `/app/reports/profit-loss/purchase/alldetails?ledger=${encodeURIComponent(
        ledgerName
      )}&groupId=${ledgerId}`
    );
  };

  const handleSalesLedgerClick = (ledgerName: string, ledgerId: number) => {
    navigate(
      `/app/reports/profit-loss/sales/alldetails?ledger=${encodeURIComponent(
        ledgerName
      )}&groupId=${ledgerId}`
    );
  };

  const handleOpeningStockItemClick = (itemName: string, itemId: string | number) => {
    navigate(
      `/app/reports/profit-loss/opening-stock/alldetails?item=${encodeURIComponent(
        itemName
      )}&itemId=${itemId}`
    );
  };

  const handlePurchaseItemClick = (itemName: string, itemId: string | number) => {
    navigate(
      `/app/reports/profit-loss/purchase-item/alldetails?item=${encodeURIComponent(
        itemName
      )}&itemId=${itemId}`
    );
  };

  const handleSalesItemClick = (itemName: string, itemId: string | number) => {
    navigate(
      `/app/reports/profit-loss/sales-item/alldetails?item=${encodeURIComponent(
        itemName
      )}&itemId=${itemId}`
    );
  };

  const handleDirectExpenseClick = (ledgerName: string, ledgerId: number) => {
    navigate(
      `/app/reports/profit-loss/direct-expense/alldetails?ledger=${encodeURIComponent(
        ledgerName
      )}&groupId=${ledgerId}`
    );
  };

  const handleIndirectExpenseClick = (ledgerName: string, ledgerId: number) => {
    navigate(
      `/app/reports/profit-loss/indirect-expense/alldetails?ledger=${encodeURIComponent(
        ledgerName
      )}&groupId=${ledgerId}`
    );
  };

  const handleIndirectIncomeClick = (ledgerName: string, ledgerId: number) => {
    navigate(
      `/app/reports/profit-loss/indirect-income/alldetails?ledger=${encodeURIComponent(
        ledgerName
      )}&groupId=${ledgerId}`
    );
  };

  const handleDirectIncomeClick = (ledgerName: string, ledgerId: number) => {
    navigate(
      `/app/reports/profit-loss/direct-income/alldetails?ledger=${encodeURIComponent(
        ledgerName
      )}&groupId=${ledgerId}`
    );
  };


  // Save Net Profit/Loss for Balance Sheet
  useEffect(() => {
    const netAmount = getNetProfit();

    if (companyId) {
      if (netAmount > 0) {
        // It's a profit
        localStorage.setItem(`NET_PROFIT_${companyId}`, netAmount.toString());
        localStorage.setItem(`NET_LOSS_${companyId}`, "0");
      } else if (netAmount < 0) {
        // It's a loss
        localStorage.setItem(`NET_PROFIT_${companyId}`, "0");
        localStorage.setItem(`NET_LOSS_${companyId}`, Math.abs(netAmount).toString());
      } else {
        // Zero
        localStorage.setItem(`NET_PROFIT_${companyId}`, "0");
        localStorage.setItem(`NET_LOSS_${companyId}`, "0");
      }
    }

  }, [getNetProfit, companyId]);


  return (
    <div className="pt-[56px] px-4 ">
      <div className="flex items-center mb-6 relative">
        <button
          title="Back to Reports"
          type="button"
          onClick={() => navigate("/app/reports")}
          className={`mr-4 p-2 rounded-full ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
            }`}
        >
          <ArrowLeft size={20} />
        </button>

        <h1 className="text-2xl font-bold">Profit & Loss Statement</h1>

        <div className="ml-auto flex space-x-2 relative">
          {/* ⚙️ Settings Button */}
          <div className="relative">
            <button
              title="Settings"
              type="button"
              onClick={() => setShowFullData((prev) => !prev)}
              className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
                }`}
            >
              <Settings size={18} />
            </button>

            {/* 🔽 Settings Dropdown */}
            {showFullData && (
              <div
                className="absolute right-0 mt-2 w-52 rounded-md shadow-lg z-50 bg-white border border-gray-300"
              >
                {/* Detailed */}
                <label
                  htmlFor="detailedView"
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-100"
                >
                  <input
                    type="checkbox"
                    id="detailedView"
                    checked={showDetailed}
                    onChange={(e) => setShowDetailed(e.target.checked)}
                  />
                  Detailed
                </label>

                {/* Item wise */}
                <label
                  htmlFor="itemWise"
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 border-t border-gray-200"
                >
                  <input
                    type="checkbox"
                    id="itemWise"
                    checked={showItemWise}
                    onChange={(e) => {
                      setShowItemWise(e.target.checked);
                      setShowInventoryBreakup(e.target.checked);
                    }}
                  />
                  Item wise
                </label>
              </div>
            )}
          </div>

          {/* Filter Button */}
          <button
            title="Toggle Filters"
            type="button"
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`p-2 rounded-md  ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
              }`}
          >
            <Filter size={18} />
          </button>

          {/* Print Button */}
          <button
            title="Print Report"
            className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
              }`}
          >
            <Printer size={18} />
          </button>

          {/* Download Button */}
          <button
            title="Download Report"
            type="button"
            className={`p-2 rounded-md ${theme === "dark" ? "hover:bg-gray-700" : "hover:bg-gray-200"
              }`}
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      {showFilterPanel && (
        <div
          className={`p-4 mb-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
            }`}
        >
          <h3 className="font-semibold mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Period</label>
              <select
                title="Select Period"
                className={`w-full p-2 rounded border ${theme === "dark"
                  ? "bg-gray-700 border-gray-600"
                  : "bg-white border-gray-300"
                  }`}
              >
                <option value="current-month">Current Month</option>
                <option value="current-quarter">Current Quarter</option>
                <option value="current-year">Current Financial Year</option>
                <option value="previous-year">Previous Financial Year</option>
                <option value="custom">Custom Period</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Trading Account Section */}
      <div
        className={`mb-6 p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
          }`}
      >
        <h2 className="text-xl font-bold mb-4 text-center">Trading Account</h2>
        <p className="text-center text-sm opacity-75 mb-4">
          For the year ended {new Date().getFullYear()}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Debit Side */}
          <div>
            <h3 className="font-semibold mb-3 text-center border-b pb-2">
              Dr.
            </h3>
            <div className="space-y-2">
              <div className="py-2 border-b border-gray-300 dark:border-gray-600">
                <div
                  className={`flex justify-between cursor-pointer transition-all duration-150 p-1.5 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                  onClick={handleStockClick}
                  title="Click to view Stock Summary"
                >
                  <span className="text-blue-600 dark:text-blue-400 group-hover:text-white underline font-semibold">
                    To Opening Stock
                  </span>
                  <span className="font-mono font-semibold">
                    {calculateOpeningStockValue().toLocaleString()}
                  </span>
                </div>

                {/* Inventory Breakup - Opening Stock */}
                {showInventoryBreakup && (
                  <div className="mt-2 space-y-1 pl-4 text-sm">
                    {getOpeningStockByItems().map((item, index) => (
                      <div
                        key={index}
                        onClick={() => handleOpeningStockItemClick(item.name, item.id)}
                        className={`flex justify-between cursor-pointer transition-all duration-150 p-1 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                      >
                        <span className="text-blue-600 group-hover:text-white underline">
                          {item.name}
                        </span>
                        <span className="font-mono">
                          {item.totalValue.toLocaleString()}
                        </span>
                      </div>
                    ))}
                    {getOpeningStockByItems().length === 0 && (
                      <div className={`text-xs italic ${theme === "dark" ? "text-gray-500" : "text-gray-500"
                        }`}>No opening stock items</div>
                    )}
                  </div>
                )}
              </div>

              {/* purchase */}
              <div className="py-2 border-b border-gray-300 dark:border-gray-600">
                <div className={`flex justify-between font-semibold cursor-pointer transition-all duration-150 p-1.5 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}>
                  <Link to="purchase">
                    <span className="text-blue-600 dark:text-blue-400 group-hover:text-white underline font-semibold">To Purchases</span>
                  </Link>
                  <span className="font-mono">
                    {showDetailed
                      ? purchaseLedgers.reduce((sum, item) => sum + ((ledgerBalances[item.id]?.debit || 0) - (ledgerBalances[item.id]?.credit || 0)), 0).toLocaleString()
                      : getPurchaseTotal().toLocaleString()
                    }
                  </span>
                </div>

                {/* GST Breakup - Ledgers */}
                {showDetailed && (
                  <div className="mt-2 space-y-1 pl-4 text-sm">
                    {purchaseLedgers
                      .filter(item => Math.abs((ledgerBalances[item.id]?.debit || 0) - (ledgerBalances[item.id]?.credit || 0)) > 0)
                      .map((item, index) => (
                        <div
                          key={index}
                          onClick={() =>
                            handlePurchaseLedgerClick(item.name, item.id)
                          }
                          className={`flex justify-between cursor-pointer transition-all duration-150 p-1 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                        >
                          <span className="text-blue-600 group-hover:text-white underline">
                            {item.name}
                          </span>
                          <span className="font-mono">
                            {(ledgerBalances[item.id]?.debit || 0).toLocaleString()}
                          </span>
                        </div>
                      ))}

                    {/* Inventory Breakup - Purchase Items */}
                    {showInventoryBreakup && (
                      <>
                        {getPurchaseByItems().map((item, index) => (
                          <div
                            key={`item-${index}`}
                            onClick={() => handlePurchaseItemClick(item.name, item.id)}
                            className={`flex justify-between cursor-pointer transition-all duration-150 p-1 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                          >
                            <span className="text-blue-600 group-hover:text-white underline">
                              {item.name}
                            </span>
                            <span className="font-mono">
                              {item.value.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* Inventory Breakup - Purchase Items (when detailed is off but inventory is on) */}
                {!showDetailed && showInventoryBreakup && (
                  <div className="mt-2 space-y-1 pl-4 text-sm">
                    {getPurchaseByItems().map((item, index) => (
                      <div
                        key={index}
                        onClick={() => handlePurchaseItemClick(item.name, item.id)}
                        className={`flex justify-between cursor-pointer transition-all duration-150 p-1 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                      >
                        <span className="text-blue-600 group-hover:text-white underline">
                          {item.name}
                        </span>
                        <span className="font-mono">
                          {item.value.toLocaleString()}
                        </span>
                      </div>
                    ))}
                    {getPurchaseByItems().length === 0 && (
                      <div className={`text-xs italic ${theme === "dark" ? "text-gray-500" : "text-gray-500"
                        }`}>No purchase items</div>
                    )}
                  </div>
                )}
              </div>

              <div className="py-2 border-b border-gray-300 dark:border-gray-600">
                {/* Header – Always visible */}
                <div className={`flex justify-between font-semibold cursor-pointer transition-all duration-150 p-1.5 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}>
                  <Link to="/app/reports/group-summary/-7">
                    <span className="text-blue-600 dark:text-blue-400 group-hover:text-white underline font-semibold">
                      To Direct Expenses
                    </span>
                  </Link>
                  <span className="font-mono">
                    {getDirectExpensesTotal().toLocaleString()}
                  </span>
                </div>

                {/* Detailed Breakup - Direct Expenses */}
                {showDetailed && directexpense.length > 0 && (
                  <div className="mt-2 space-y-1 pl-4 text-sm">
                    {directexpense
                      .filter(item => Math.abs((ledgerBalances[item.id]?.debit || 0) - (ledgerBalances[item.id]?.credit || 0)) > 0)
                      .map((item, index) => (
                        <div
                          key={index}
                          onClick={() => handleDirectExpenseClick(item.name, item.id)}
                          className={`flex justify-between cursor-pointer transition-all duration-150 p-1 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                        >
                          <span className="text-blue-600 group-hover:text-white underline">
                            {item.name}
                          </span>
                          <span className="font-mono">
                            {((ledgerBalances[item.id]?.debit || 0) - (ledgerBalances[item.id]?.credit || 0)).toLocaleString()}
                          </span>
                        </div>
                      ))}
                  </div>
                )}

                {/* Inventory Breakup - Direct Expenses Fallback */}
                {!showDetailed && showInventoryBreakup && (
                  <div className="mt-2 space-y-1 pl-4 text-sm">
                    {directexpense
                      .filter(item => Math.abs((ledgerBalances[item.id]?.debit || 0) - (ledgerBalances[item.id]?.credit || 0)) > 0)
                      .map((item, index) => (
                        <div
                          key={index}
                          onClick={() => handleDirectExpenseClick(item.name, item.id)}
                          className={`flex justify-between cursor-pointer transition-all duration-150 p-1 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                        >
                          <span className="text-blue-600 group-hover:text-white underline">
                            {item.name}
                          </span>
                          <span className="font-mono">
                            {(ledgerBalances[item.id]?.debit || 0).toLocaleString()}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {getGrossProfit() > 0 && (
                <div className="flex justify-between py-2 border-b border-gray-300 dark:border-gray-600 font-semibold text-green-600">
                  <span>To Gross Profit c/o</span>
                  <span className="font-mono">
                    {getGrossProfit().toLocaleString()}
                  </span>
                </div>
              )}

              {/* Total Row */}
              <div className="flex justify-between py-2 font-bold text-lg border-t-2 border-gray-400 dark:border-gray-500">
                <span>Total</span>
                <span className="font-mono">
                  {Math.max(
                    getTradingDebitTotal(),
                    getTradingCreditTotal()
                  ).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Credit Side */}
          <div>
            <h3 className="font-semibold mb-3 text-center border-b pb-2">
              Cr.
            </h3>
            <div className="space-y-2">
              <div className="py-2 border-b border-gray-300 dark:border-gray-600">
                {/* Sales Account */}
                <div className={`flex justify-between font-semibold cursor-pointer transition-all duration-150 p-1.5 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}>
                  <Link to="sales">
                    <span className="text-blue-600 dark:text-blue-400 group-hover:text-white underline font-semibold">By Sales</span>
                  </Link>
                  <span className="font-mono">
                    {showDetailed
                      ? salesLedgers.reduce((sum, item) => sum + ((ledgerBalances[item.id]?.credit || 0) - (ledgerBalances[item.id]?.debit || 0)), 0).toLocaleString()
                      : getFinalSalesTotal().toLocaleString()
                    }
                  </span>
                </div>

                {/* GST Breakup - Ledgers */}
                {showDetailed && (
                  <div className="mt-2 space-y-1 pl-4 text-sm">
                    {salesLedgers
                      .filter(item => Math.abs((ledgerBalances[item.id]?.credit || 0) - (ledgerBalances[item.id]?.debit || 0)) > 0)
                      .map((item, index) => (
                        <div
                          key={index}
                          onClick={() =>
                            handleSalesLedgerClick(item.name, item.id)
                          }
                          className={`flex justify-between cursor-pointer transition-all duration-150 p-1 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                        >
                          <span className="text-blue-600 group-hover:text-white underline">
                            {item.name}
                          </span>
                          <span className="font-mono">
                            {(ledgerBalances[item.id]?.credit || 0).toLocaleString()}
                          </span>
                        </div>
                      ))}

                    {/* Inventory Breakup - Sales Items */}
                    {showInventoryBreakup && (
                      <>
                        {getSalesByItems().map((item, index) => (
                          <div
                            key={`item-${index}`}
                            onClick={() => handleSalesItemClick(item.name, item.id)}
                            className={`flex justify-between cursor-pointer transition-all duration-150 p-1 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                          >
                            <span className="text-blue-600 group-hover:text-white underline">
                              {item.name}
                            </span>
                            <span className="font-mono">
                              {item.value.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* Inventory Breakup - Sales Items (when detailed is off but inventory is on) */}
                {!showDetailed && showInventoryBreakup && (
                  <div className="mt-2 space-y-1 pl-4 text-sm">
                    {getSalesByItems().map((item, index) => (
                      <div
                        key={index}
                        onClick={() => handleSalesItemClick(item.name, item.id)}
                        className={`flex justify-between cursor-pointer transition-all duration-150 p-1 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                      >
                        <span className="text-blue-600 group-hover:text-white underline">
                          {item.name}
                        </span>
                        <span className="font-mono">
                          {item.value.toLocaleString()}
                        </span>
                      </div>
                    ))}
                    {getSalesByItems().length === 0 && (
                      <div className={`text-xs italic ${theme === "dark" ? "text-gray-500" : "text-gray-500"
                        }`}>No sales items</div>
                    )}
                  </div>
                )}
              </div>

              {/* Direct Income */}
              <div className="py-2 border-b border-gray-300 dark:border-gray-600">
                <div className={`flex justify-between font-semibold cursor-pointer transition-all duration-150 p-1.5 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}>
                  <Link to="/app/reports/group-summary/-8">
                    <span className="text-blue-600 dark:text-blue-400 group-hover:text-white underline font-semibold">
                      By Direct Income
                    </span>
                  </Link>
                  <span className="font-mono">
                    {getDirectIncomeTotal().toLocaleString()}
                  </span>
                </div>

                {/* Detailed Breakup - Direct Income */}
                {showDetailed && directincome.length > 0 && (
                  <div className="mt-2 space-y-1 pl-4 text-sm">
                    {directincome
                      .filter(item => Math.abs((ledgerBalances[item.id]?.credit || 0) - (ledgerBalances[item.id]?.debit || 0)) > 0)
                      .map((item, index) => (
                        <div
                          key={index}
                          onClick={() => handleDirectIncomeClick(item.name, item.id)}
                          className={`flex justify-between cursor-pointer transition-all duration-150 p-1 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                        >
                          <span className="text-blue-600 group-hover:text-white underline">
                            {item.name}
                          </span>
                          <span className="font-mono">
                            {((ledgerBalances[item.id]?.credit || 0) - (ledgerBalances[item.id]?.debit || 0)).toLocaleString()}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="py-2 border-b border-gray-300 dark:border-gray-600">
                <div
                  className={`flex justify-between cursor-pointer transition-all duration-150 p-1.5 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                  onClick={handleStockClick}
                  title="Click to view Stock Summary"
                >
                  <span className="text-blue-600 dark:text-blue-400 group-hover:text-white underline font-semibold">
                    By Closing Stock
                  </span>
                  <span className="font-mono font-semibold">
                    {calculateClosingStockValue().toLocaleString()}
                  </span>
                </div>

                {/* Inventory Breakup - Closing Stock */}
                {showInventoryBreakup && (
                  <div className="mt-2 space-y-1 pl-4 text-sm">
                    {getClosingStockByItems().map((item, index) => (
                      <div
                        key={index}
                        onClick={() => handleOpeningStockItemClick(item.name, item.id)}
                        className={`flex justify-between cursor-pointer transition-all duration-150 p-1 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                      >
                        <span className="text-blue-600 group-hover:text-white underline">
                          {item.name}
                        </span>
                        <span className="font-mono">
                          {item.closing.toLocaleString()}
                        </span>
                      </div>
                    ))}
                    {getClosingStockByItems().length === 0 && (
                      <div className={`text-xs italic ${theme === "dark" ? "text-gray-500" : "text-gray-500"
                        }`}>No closing stock items</div>
                    )}
                  </div>
                )}
              </div>
              {getGrossProfit() < 0 && (
                <div className="flex justify-between py-2 border-b border-gray-300 dark:border-gray-600 font-semibold text-red-600">
                  <span>By Gross Loss c/o</span>
                  <span className="font-mono">
                    {Math.abs(getGrossProfit()).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2 font-bold text-lg border-t-2 border-gray-400 dark:border-gray-500">
                <span>Total</span>
                <span className="font-mono">
                  {Math.max(
                    getTradingDebitTotal(),
                    getTradingCreditTotal()
                  ).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profit & Loss Account Section */}
      <div
        className={`mb-6 p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
          }`}
      >
        <h2 className="text-xl font-bold mb-4 text-center">
          Profit & Loss Account
        </h2>
        <p className="text-center text-sm opacity-75 mb-4">
          For the year ended {new Date().getFullYear()}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Debit Side */}
          <div>
            <h3 className="font-semibold mb-3 text-center border-b pb-2">
              Dr.
            </h3>
            <div className="space-y-2">
              {getGrossProfit() < 0 && (
                <div className="flex justify-between py-2 border-b border-gray-300 dark:border-gray-600 font-semibold text-red-600">
                  <span>To Gross Loss b/f</span>
                  <span className="font-mono">
                    {Math.abs(getGrossProfit()).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="py-2 border-b border-gray-300 dark:border-gray-600">
                <div className={`flex justify-between font-semibold cursor-pointer transition-all duration-150 p-1.5 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}>
                  <Link to="/app/reports/group-summary/-10">
                    <span className="text-blue-600 dark:text-blue-400 group-hover:text-white underline font-semibold">
                      To Indirect Expenses
                    </span>
                  </Link>
                  <span className="font-mono">
                    {getIndirectExpensesTotal().toLocaleString()}
                  </span>
                </div>

                {/* Detailed Breakup - Indirect Expenses */}
                {showDetailed && indirectExpenses.length > 0 && (
                  <div className="mt-2 space-y-1 pl-4 text-sm">
                    {indirectExpenses
                      .filter(ledger => Math.abs((ledgerBalances[ledger.id]?.debit || 0) - (ledgerBalances[ledger.id]?.credit || 0)) > 0)
                      .map((ledger, index) => (
                        <div
                          key={index}
                          onClick={() => handleIndirectExpenseClick(ledger.name, ledger.id)}
                          className={`flex justify-between cursor-pointer transition-all duration-150 p-1 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                        >
                          <span className="text-blue-600 group-hover:text-white underline">{ledger.name}</span>
                          <span className="font-mono">
                            {(ledgerBalances[Number(ledger.id)]?.debit || 0).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    {indirectExpenses.length === 0 && (
                      <div className={`text-xs italic ${theme === "dark" ? "text-gray-500" : "text-gray-500"
                        }`}>No indirect expenses</div>
                    )}
                  </div>
                )}

                {/* Inventory Breakup - Indirect Expenses (Fallback or additional if needed) */}
                {!showDetailed && showInventoryBreakup && (
                  <div className="mt-2 space-y-1 pl-4 text-sm">
                    {getIndirectExpensesLedgers()
                      .filter(ledger => Math.abs((ledgerBalances[ledger.id]?.debit || 0) - (ledgerBalances[ledger.id]?.credit || 0)) > 0)
                      .map((ledger, index) => (
                        <div
                          key={index}
                          className={`flex justify-between ${theme === "dark" ? "text-gray-300" : "text-gray-700"
                            }`}
                        >
                          <span>{ledger.name}</span>
                          <span className="font-mono">
                            {(ledgerBalances[Number(ledger.id)]?.debit || 0).toLocaleString()}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              {getNetProfit() > 0 && (
                <div className="flex justify-between py-2 border-b border-gray-300 dark:border-gray-600 font-semibold text-green-600">
                  <span>To Net Profit</span>
                  <span className="font-mono">
                    {getNetProfit().toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2 font-bold text-lg border-t-2 border-gray-400 dark:border-gray-500">
                <span>Total</span>
                <span className="font-mono">
                  {Math.max(
                    getProfitLossDebitTotal(),
                    getProfitLossCreditTotal()
                  ).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Credit Side */}
          <div>
            <h3 className="font-semibold mb-3 text-center border-b pb-2">
              Cr.
            </h3>
            <div className="space-y-2">
              {getGrossProfit() > 0 && (
                <div className="flex justify-between py-2 border-b border-gray-300 dark:border-gray-600 font-semibold text-green-600">
                  <span>By Gross Profit b/f</span>
                  <span className="font-mono">
                    {getGrossProfit().toLocaleString()}
                  </span>
                </div>
              )}
              <div className="py-2 border-b border-gray-300 dark:border-gray-600">
                <div className={`flex justify-between font-semibold cursor-pointer transition-all duration-150 p-1.5 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}>
                  <Link to="/app/reports/group-summary/-11">
                    <span className="text-blue-600 dark:text-blue-400 group-hover:text-white underline font-semibold">
                      By Indirect Income
                    </span>
                  </Link>
                  <span className="font-mono">
                    {getIndirectIncomeTotal().toLocaleString()}
                  </span>
                </div>

                {/* Detailed Breakup - Indirect Income */}
                {showDetailed && indirectIncome.length > 0 && (
                  <div className="mt-2 space-y-1 pl-4 text-sm">
                    {indirectIncome
                      .filter(ledger => Math.abs((ledgerBalances[ledger.id]?.credit || 0) - (ledgerBalances[ledger.id]?.debit || 0)) > 0)
                      .map((ledger, index) => (
                        <div
                          key={index}
                          onClick={() => handleIndirectIncomeClick(ledger.name, ledger.id)}
                          className={`flex justify-between cursor-pointer transition-all duration-150 p-1 rounded group ${theme === "dark" ? "hover:bg-blue-600 hover:text-white" : "hover:bg-blue-600 hover:text-white font-bold"}`}
                        >
                          <span className="text-blue-600 group-hover:text-white underline">{ledger.name}</span>
                          <span className="font-mono">
                            {((ledgerBalances[Number(ledger.id)]?.credit || 0) - (ledgerBalances[Number(ledger.id)]?.debit || 0)).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    {indirectIncome.length === 0 && (
                      <div className={`text-xs italic ${theme === "dark" ? "text-gray-500" : "text-gray-500"
                        }`}>No indirect income</div>
                    )}
                  </div>
                )}

                {/* Inventory Breakup - Indirect Income (Fallback or additional if needed) */}
                {!showDetailed && showInventoryBreakup && (
                  <div className="mt-2 space-y-1 pl-4 text-sm">
                    {getIndirectIncomeLedgers()
                      .filter(ledger => Math.abs((ledgerBalances[ledger.id]?.credit || 0) - (ledgerBalances[ledger.id]?.debit || 0)) > 0)
                      .map((ledger, index) => (
                        <div
                          key={index}
                          className={`flex justify-between ${theme === "dark" ? "text-gray-300" : "text-gray-700"
                            }`}
                        >
                          <span>{ledger.name}</span>
                          <span className="font-mono">
                            {(ledgerBalances[Number(ledger.id)]?.credit || 0).toLocaleString()}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              {getNetProfit() < 0 && (
                <div className="flex justify-between py-2 border-b border-gray-300 dark:border-gray-600 font-semibold text-red-600">
                  <span>By Net Loss</span>
                  <span className="font-mono">
                    {Math.abs(getNetProfit()).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2 font-bold text-lg border-t-2 border-gray-400 dark:border-gray-500">
                <span>Total</span>
                <span className="font-mono">
                  {Math.max(
                    getProfitLossDebitTotal(),
                    getProfitLossCreditTotal()
                  ).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Section */}
      <div
        className={`p-6 rounded-lg ${theme === "dark" ? "bg-gray-800" : "bg-white shadow"
          }`}
      >
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-sm opacity-75">Gross Profit/Loss</p>
              <p
                className={`text-xl font-bold ${getGrossProfit() >= 0 ? "text-green-600" : "text-red-600"
                  }`}
              >
                ₹ {Math.abs(getGrossProfit()).toLocaleString()}
                <span className="text-sm ml-2">
                  ({getGrossProfit() >= 0 ? "Profit" : "Loss"})
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm opacity-75">Net Profit/Loss</p>
              <p
                className={`text-xl font-bold ${getNetProfit() >= 0 ? "text-green-600" : "text-red-600"
                  }`}
              >
                ₹ {Math.abs(getNetProfit()).toLocaleString()}
                <span className="text-sm ml-2">
                  ({getNetProfit() >= 0 ? "Profit" : "Loss"})
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm opacity-75">Gross Profit Margin</p>
              <p className="text-xl font-bold">
                {getSalesTotal() > 0
                  ? ((getGrossProfit() / getSalesTotal()) * 100).toFixed(2)
                  : "0.00"}
                %
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`mt-6 p-4 rounded ${theme === "dark" ? "bg-gray-800" : "bg-blue-50"
          }`}
      >
        <p className="text-sm">
          <span className="font-semibold">Pro Tip:</span> Click on Opening Stock
          or Closing Stock to view Stock Summary. Press F5 to refresh, F12 to
          configure display options.
        </p>
      </div>
    </div>
  );
};

export default ProfitLoss;
