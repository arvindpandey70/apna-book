import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Printer,
  Download,
  ChevronDown,
  ChevronRight,
  Settings,
  Edit,
  Check,
  X,
} from "lucide-react";
import { useAppContext } from "../../context/AppContext";
import { allSystemGroups } from "../../constants/ledgerGroups";

const StockSummary: React.FC = () => {
  const { theme, units } = useAppContext();

  const navigate = useNavigate();

  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [drillPath, setDrillPath] = useState<Array<{ id: string, name: string, type: 'root' | 'group' | 'category' | 'month' | 'item', data?: any }>>(() => {
    const saved = sessionStorage.getItem("stock_drill_path");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [{ id: 'root', name: 'Stock Groups', type: 'root' }];
  });
  const [categoryVouchers, setCategoryVouchers] = useState<{ purchase: any[], sales: any[] } | null>(null);
  const [categoryVouchersLoading, setCategoryVouchersLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editLedgerId, setEditLedgerId] = useState<number | null>(null);
  const [editClosingBalance, setEditClosingBalance] = useState<string>("");

  const [integrate, setIntegrate] = useState<"integrated" | "new">(
    () => (localStorage.getItem("stock_integrate") as any) || "new"
  );

  const [reportView, setReportView] = useState<
    "All" | "Categories"
  >(() => {
    const saved = localStorage.getItem("stock_report_view");
    return saved === "Categories" ? "Categories" : "All";
  });

  useEffect(() => {
    localStorage.setItem("stock_integrate", integrate);
  }, [integrate]);

  useEffect(() => {
    localStorage.setItem("stock_report_view", reportView);
  }, [reportView]);

  const company_id = localStorage.getItem("company_id") || "";
  const owner_type = localStorage.getItem("owner_type") || "employee";
  const owner_id =
    localStorage.getItem(
      owner_type === "employee" ? "employee_id" : "user_id"
    ) || "";

  //ledger-group and ledger data get filte Stock-in-hand

  //get all ledger-group
  const [groups, setGroups] = useState<any[]>([]);

  useEffect(() => {
    sessionStorage.setItem("stock_drill_path", JSON.stringify(drillPath));
  }, [drillPath]);

  useEffect(() => {
    const fetchData = async () => {
      if (!company_id || !owner_type || !owner_id) {
        setGroups([]);
        return;
      }

      try {
        const groupRes = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/ledger-groups?company_id=${company_id}&owner_type=${owner_type}&owner_id=${owner_id}`
        );

        if (!groupRes.ok) {
          throw new Error("Failed to fetch ledger groups");
        }

        const groupDataRes = await groupRes.json();
        // console.log("groupDataRes:", groupDataRes);

        const apiGroups = Array.isArray(groupDataRes) ? groupDataRes : (Array.isArray(groupDataRes?.data) ? groupDataRes.data : []);
        const groupsArr = [...allSystemGroups, ...apiGroups];

        const stockGroup = groupsArr.find(
          (g: any) =>
            typeof g?.name === "string" &&
            g.name.toLowerCase() === "stock-in-hand"
        );
        // console.log("stockGroup:", stockGroup);

        if (!stockGroup) {
          console.warn("Stock-in-hand group not found in groupsArr");
          setGroups([]);
          return;
        }

        const stockGroupId = Number(stockGroup.id);

        const getDescendantGroups = (parentId: number, allGroups: any[]): number[] => {
          const children = allGroups.filter((g) => Number(g.parent) === parentId).map((g) => Number(g.id));
          let descendants = [...children];
          children.forEach((childId) => {
            descendants = [...descendants, ...getDescendantGroups(childId, allGroups)];
          });
          return descendants;
        };

        const stockGroupIds = [stockGroupId, ...getDescendantGroups(stockGroupId, groupsArr)];
        // console.log("stockGroupIds:", stockGroupIds);

        const ledgerRes = await fetch(
          `${import.meta.env.VITE_API_URL
          }/api/ledger?company_id=${company_id}&owner_type=${owner_type}&owner_id=${owner_id}`
        );

        if (!ledgerRes.ok) {
          throw new Error("Failed to fetch ledgers");
        }

        const ledgerDataRes = await ledgerRes.json();
        const ledgersArr = Array.isArray(ledgerDataRes) ? ledgerDataRes : (Array.isArray(ledgerDataRes?.data) ? ledgerDataRes.data : []);
        // console.log("ledgersArr sample:", ledgersArr.slice(0, 5));

        const filteredLedgers = ledgersArr.filter(
          (l: any) => stockGroupIds.includes(Number(l.groupId))
        );
        // console.log("filteredLedgers:", filteredLedgers);

        setGroups(filteredLedgers);
      } catch (error) {
        console.error("Error loading stock-in-hand ledgers", error);
        setGroups([]);
      }
    };

    fetchData();
  }, [company_id, owner_type, owner_id]);

  const loadCategoriesData = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ company_id, owner_type, owner_id });

      const [stockItemsRes, purchaseRes, salesRes, groupsRes, categoriesRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/stock-items?${params}`),
        fetch(
          `${import.meta.env.VITE_API_URL
          }/api/purchase-vouchers/purchase-history?${params}`
        ),
        fetch(
          `${import.meta.env.VITE_API_URL
          }/api/sales-vouchers/sale-history?${params}`
        ),
        fetch(`${import.meta.env.VITE_API_URL}/api/stock-groups/list?${params}`),
        fetch(`${import.meta.env.VITE_API_URL}/api/stock-categories?${params}`)
      ]);

      const stockItemsData = await stockItemsRes.json();
      const purchaseData = await purchaseRes.json();
      const salesData = await salesRes.json();
      const groupsData = await groupsRes.json();
      const categoriesData = await categoriesRes.json();

      const itemMap: Record<string, any> = {};

      const stockItemsList = Array.isArray(stockItemsData?.data) ? stockItemsData.data : [];
      const purchaseList = Array.isArray(purchaseData?.data) ? purchaseData.data : [];
      const salesList = Array.isArray(salesData?.data) ? salesData.data : [];
      
      const stockGroupsList = Array.isArray(groupsData) ? groupsData : [];
      const stockCategoriesList = Array.isArray(categoriesData) ? categoriesData : [];

      // 1️⃣ OPENING STOCK (BATCH-WISE)
      stockItemsList.forEach((item: any) => {
        const itemName = item.name;
        const lookupKey = itemName.toLowerCase().trim();

        let matchedUnitName = item.unitName || "";
        if (!matchedUnitName) {
          const matchedUnit = units.find((u) => String(u.id) === String(item.unit));
          if (matchedUnit && matchedUnit.name) {
            matchedUnitName = matchedUnit.name;
          } else if (item.unit && isNaN(Number(item.unit))) {
            matchedUnitName = item.unit;
          }
        }

        const itemObj = {
          itemName: itemName,
          unitName: matchedUnitName,
          stockGroupId: item.stockGroupId,
          categoryId: item.categoryId,
          batches: {},
        };
        itemMap[lookupKey] = itemObj;

        let batchesProcessed = false;

        if (item.batches && item.batches.length > 0) {
          item.batches.forEach((b: any) => {
            const batchName = b.batchName || "Default";

            if (!itemObj.batches[batchName]) {
              itemObj.batches[batchName] = {
                batchName: batchName,
                opening: { qty: 0, rate: 0, value: 0 },
                inward: { qty: 0, rate: 0, value: 0 },
                outward: { qty: 0, rate: 0, value: 0 },
                closing: { qty: 0, rate: 0, value: 0 },
              };
            }

            const batch = itemObj.batches[batchName];

            if (b.mode === "purchase") {
              // Store imported purchase batch data so we can backfill if purchase_history is missing it
              batch.importedInward = {
                qty: Number(b.batchQuantity || 0),
                value: Number(b.openingValue || (Number(b.batchQuantity || 0) * Number(b.openingRate || 0))),
                rate: Number(b.openingRate || 0),
              };
            } else if (!b.mode || b.mode === "opening") {
              batch.opening.qty += Number(b.batchQuantity || 0);
              batch.opening.value += Number(b.batchQuantity || 0) * Number(b.openingRate || 0);
              batch.opening.rate = batch.opening.qty !== 0 ? batch.opening.value / batch.opening.qty : 0;
              batchesProcessed = true;
            }
          });
        }

        // ✅ Handle Case: Item has Opening Balance but NO Batches (Non-Batched Item)
        // If no batches were processed (or explicitly empty), but item has master opening balance
        if (!batchesProcessed && (Number(item.openingBalance) > 0 || Number(item.quantity) > 0)) {
          const batchName = "Default";
          if (!itemObj.batches[batchName]) {
            itemObj.batches[batchName] = {
              batchName: batchName,
              opening: { qty: 0, rate: 0, value: 0 },
              inward: { qty: 0, rate: 0, value: 0 },
              outward: { qty: 0, rate: 0, value: 0 },
              closing: { qty: 0, rate: 0, value: 0 },
            };
          }

          const batch = itemObj.batches[batchName];
          const opQty = Number(item.openingBalance || item.quantity || 0);
          const opRate = Number(item.openingRate || item.rate || 0); // Check field names from API

          batch.opening.qty += opQty;
          batch.opening.value += opQty * opRate;
          batch.opening.rate = opRate;
        }
      });

      // 2️⃣ PURCHASES (INWARD)
      purchaseList.forEach((p: any) => {
        const lookupKey = p.itemName ? p.itemName.toLowerCase().trim() : "";
        const item = itemMap[lookupKey];
        if (!item) return;

        const batchName = p.batchNumber || "Default";

        const batch =
          item.batches[batchName] ??
          (item.batches[batchName] = {
            batchName: batchName,
            opening: { qty: 0, rate: 0, value: 0 },
            inward: { qty: 0, rate: 0, value: 0 },
            outward: { qty: 0, rate: 0, value: 0 },
            closing: { qty: 0, rate: 0, value: 0 },
          });

        batch.inward.qty += Number(p.purchaseQuantity || 0);
        batch.inward.value +=
          Number(p.purchaseQuantity || 0) * Number(p.rate || 0);
        batch.inward.rate =
          batch.inward.qty > 0 ? batch.inward.value / batch.inward.qty : 0;
      });

      // 3️⃣ SALES (OUTWARD)
      salesList.forEach((s: any) => {
        const lookupKey = s.itemName ? s.itemName.toLowerCase().trim() : "";
        const item = itemMap[lookupKey];
        if (!item) return;

        const batchName = s.batchNumber || "Default";
        // If sales has a batch that wasn't in opening or purchases, we should probably create it or ignore it safely
        // Usually sales must happen from existing batch, but data might be inconsistent
        let batch = item.batches[batchName];

        if (!batch) {
          // Create if missing (e.g. direct negative stock sale without purchase, though typical logic prevents this)
          batch = item.batches[batchName] = {
            batchName: batchName,
            opening: { qty: 0, rate: 0, value: 0 },
            inward: { qty: 0, rate: 0, value: 0 },
            outward: { qty: 0, rate: 0, value: 0 },
            closing: { qty: 0, rate: 0, value: 0 },
          };
        }

        const qty = Math.abs(Number(s.qtyChange || 0));
        batch.outward.qty += qty;
        batch.outward.value += qty * Number(s.rate || 0);
        batch.outward.rate =
          batch.outward.qty > 0 ? batch.outward.value / batch.outward.qty : 0;
      });

      // 3.5️⃣ BACKFILL IMPORTED PURCHASES (INWARD) IF NOT PRESENT IN PURCHASE HISTORY
      Object.values(itemMap).forEach((item: any) => {
        Object.values(item.batches).forEach((b: any) => {
          if (b.importedInward && b.inward.qty === 0) {
            b.inward.qty = b.importedInward.qty;
            b.inward.value = b.importedInward.value;
            b.inward.rate = b.importedInward.rate;
          }
        });
      });

      // 4️⃣ CLOSING (TALLY LOGIC) – FIXED (FORWARD CALCULATION ONLY)
      Object.values(itemMap).forEach((item: any) => {
        Object.values(item.batches).forEach((b: any) => {
          // b.opening.qty and b.opening.value are already populated with the real opening balance.
          // No back-calculation is needed because the database stores the real opening balance.

          // ✅ Closing is ALWAYS forward calculated: Closing = Opening + Inward - Outward
          b.closing.qty = b.opening.qty + b.inward.qty - b.outward.qty;

          const totalInQty = b.opening.qty + b.inward.qty;
          const totalInValue = b.opening.value + b.inward.value;

          if (totalInQty > 0) {
            b.closing.rate = totalInValue / totalInQty;
          } else {
            b.closing.rate = b.outward.qty > 0 ? b.outward.value / b.outward.qty : 0;
          }
          b.closing.value = b.closing.qty * b.closing.rate;

          // 🔹 Safety (precision)
          if (Math.abs(b.opening.qty) < 0.001) b.opening.qty = 0;
          if (Math.abs(b.opening.value) < 0.01) b.opening.value = 0;
          if (Math.abs(b.closing.qty) < 0.001) b.closing.qty = 0;
          if (Math.abs(b.closing.value) < 0.01) b.closing.value = 0;
        });
      });

      // 5️⃣ FINAL ARRAY & HIERARCHY
      const allItems = Object.values(itemMap).map((item: any) => ({
        ...item,
        batches: Object.values(item.batches),
      }));

      const groupMap: Record<string, any> = {};

      allItems.forEach((item: any) => {
        const groupId = item.stockGroupId || "uncategorized_group";
        const categoryId = item.categoryId || "uncategorized_category";

        if (!groupMap[groupId]) {
          const groupInfo = stockGroupsList.find((g: any) => String(g.id) === String(groupId));
          groupMap[groupId] = {
            isGroup: true,
            id: groupId,
            name: groupInfo ? groupInfo.name : (groupId === "uncategorized_group" ? "Primary" : "Unknown Group"),
            categories: {},
            totals: { openingQty: 0, openingValue: 0, inwardQty: 0, inwardValue: 0, outwardQty: 0, outwardValue: 0, closingQty: 0, closingValue: 0 }
          };
        }

        if (!groupMap[groupId].categories[categoryId]) {
          const categoryInfo = stockCategoriesList.find((c: any) => String(c.id) === String(categoryId));
          groupMap[groupId].categories[categoryId] = {
            isCategory: true,
            id: categoryId,
            name: categoryInfo ? categoryInfo.name : (categoryId === "uncategorized_category" ? "General" : "Unknown Category"),
            items: [],
            totals: { openingQty: 0, openingValue: 0, inwardQty: 0, inwardValue: 0, outwardQty: 0, outwardValue: 0, closingQty: 0, closingValue: 0 }
          };
        }

        const category = groupMap[groupId].categories[categoryId];
        category.items.push(item);
        if (!category.unitName && item.unitName) category.unitName = item.unitName;
        if (!groupMap[groupId].unitName && item.unitName) groupMap[groupId].unitName = item.unitName;

        // Sum up item totals to category and group
        item.batches.forEach((b: any) => {
          const addTotals = (target: any) => {
            target.openingQty += b.opening?.qty || 0;
            target.openingValue += b.opening?.value || 0;
            target.inwardQty += b.inward?.qty || 0;
            target.inwardValue += b.inward?.value || 0;
            target.outwardQty += b.outward?.qty || 0;
            target.outwardValue += b.outward?.value || 0;
            target.closingQty += b.closing?.qty || 0;
            target.closingValue += b.closing?.value || 0;
          };
          addTotals(category.totals);
          addTotals(groupMap[groupId].totals);
        });
      });

      const finalData = Object.values(groupMap).map((group: any) => ({
        ...group,
        categories: Object.values(group.categories).sort((a: any, b: any) => a.name.localeCompare(b.name))
      })).sort((a: any, b: any) => a.name.localeCompare(b.name));

      setData(finalData);
    } catch (err: any) {
      setError(err.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ company_id, owner_type, owner_id });

      const [stockItemsRes, purchaseRes, salesRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/api/stock-items?${params}`),
        fetch(
          `${import.meta.env.VITE_API_URL
          }/api/purchase-vouchers/purchase-history?${params}`
        ),
        fetch(
          `${import.meta.env.VITE_API_URL
          }/api/sales-vouchers/sale-history?${params}`
        ),
      ]);

      const stockItemsData = await stockItemsRes.json();
      const purchaseData = await purchaseRes.json();
      const salesData = await salesRes.json();

      const itemMap: Record<string, any> = {};

      const stockItemsList = Array.isArray(stockItemsData?.data) ? stockItemsData.data : [];
      const purchaseList = Array.isArray(purchaseData?.data) ? purchaseData.data : [];
      const salesList = Array.isArray(salesData?.data) ? salesData.data : [];

      // 1️⃣ OPENING STOCK (BATCH-WISE)
      stockItemsList.forEach((item: any) => {
        const itemName = item.name;
        const lookupKey = itemName.toLowerCase().trim();

        let matchedUnitName = item.unitName || "";
        if (!matchedUnitName) {
          const matchedUnit = units.find((u) => String(u.id) === String(item.unit));
          if (matchedUnit && matchedUnit.name) {
            matchedUnitName = matchedUnit.name;
          } else if (item.unit && isNaN(Number(item.unit))) {
            matchedUnitName = item.unit;
          }
        }

        const itemObj = {
          itemName: itemName,
          unitName: matchedUnitName,
          batches: {},
        };
        itemMap[lookupKey] = itemObj;

        let batchesProcessed = false;

        if (item.batches && item.batches.length > 0) {
          item.batches.forEach((b: any) => {
            const batchName = b.batchName || "Default";

            if (!itemObj.batches[batchName]) {
              itemObj.batches[batchName] = {
                batchName: batchName,
                opening: { qty: 0, rate: 0, value: 0 },
                inward: { qty: 0, rate: 0, value: 0 },
                outward: { qty: 0, rate: 0, value: 0 },
                closing: { qty: 0, rate: 0, value: 0 },
              };
            }

            const batch = itemObj.batches[batchName];

            if (b.mode === "purchase") {
              // Store imported purchase batch data so we can backfill if purchase_history is missing it
              batch.importedInward = {
                qty: Number(b.batchQuantity || 0),
                value: Number(b.openingValue || (Number(b.batchQuantity || 0) * Number(b.openingRate || 0))),
                rate: Number(b.openingRate || 0),
              };
            } else if (!b.mode || b.mode === "opening") {
              batch.opening.qty += Number(b.batchQuantity || 0);
              batch.opening.value += Number(b.batchQuantity || 0) * Number(b.openingRate || 0);
              batch.opening.rate = batch.opening.qty !== 0 ? batch.opening.value / batch.opening.qty : 0;
              batchesProcessed = true;
            }
          });
        }

        // ✅ Handle Case: Item has Opening Balance but NO Batches (Non-Batched Item)
        if (!batchesProcessed && (Number(item.openingBalance) > 0 || Number(item.quantity) > 0)) {
          if (!itemObj.batches["Default"]) {
            itemObj.batches["Default"] = {
              batchName: "Default",
              opening: { qty: 0, rate: 0, value: 0 },
              inward: { qty: 0, rate: 0, value: 0 },
              outward: { qty: 0, rate: 0, value: 0 },
              closing: { qty: 0, rate: 0, value: 0 },
            };
          }
          const batch = itemObj.batches["Default"];
          const opQty = Number(item.openingBalance || item.quantity || 0);
          const opRate = Number(item.openingRate || item.rate || 0);

          batch.opening.qty += opQty;
          batch.opening.value += opQty * opRate;
          batch.opening.rate = opRate;
        }
      });

      // 2️⃣ PURCHASE (INWARD)
      purchaseList.forEach((txn: any) => {
        const lookupKey = (txn.itemName || "").toLowerCase().trim();
        if (!lookupKey || !itemMap[lookupKey]) return;

        const batchName = txn.batchNumber || "Default";
        if (!itemMap[lookupKey].batches[batchName]) {
          itemMap[lookupKey].batches[batchName] = {
            batchName: batchName,
            opening: { qty: 0, rate: 0, value: 0 },
            inward: { qty: 0, rate: 0, value: 0 },
            outward: { qty: 0, rate: 0, value: 0 },
            closing: { qty: 0, rate: 0, value: 0 },
          };
        }

        const batch = itemMap[lookupKey].batches[batchName];
        const pQty = Number(txn.purchaseQuantity || 0);
        const pRate = Number(txn.rate || txn.purchaseRate || 0);
        batch.inward.qty += pQty;
        batch.inward.value += pQty * pRate;
        batch.inward.rate = batch.inward.qty !== 0 ? batch.inward.value / batch.inward.qty : 0;
      });

      // Backfill missing inward batches from imported data if purchase history was wiped
      Object.values(itemMap).forEach((itemObj: any) => {
        Object.values(itemObj.batches).forEach((batch: any) => {
          if (batch.importedInward && batch.inward.qty === 0) {
            batch.inward.qty = batch.importedInward.qty;
            batch.inward.value = batch.importedInward.value;
            batch.inward.rate = batch.importedInward.rate;
          }
        });
      });

      // 3️⃣ SALES (OUTWARD)
      salesList.forEach((txn: any) => {
        const lookupKey = (txn.itemName || "").toLowerCase().trim();
        if (!lookupKey || !itemMap[lookupKey]) return;

        const batchName = txn.batchNumber || "Default";
        if (!itemMap[lookupKey].batches[batchName]) {
          itemMap[lookupKey].batches[batchName] = {
            batchName: batchName,
            opening: { qty: 0, rate: 0, value: 0 },
            inward: { qty: 0, rate: 0, value: 0 },
            outward: { qty: 0, rate: 0, value: 0 },
            closing: { qty: 0, rate: 0, value: 0 },
          };
        }

        const batch = itemMap[lookupKey].batches[batchName];
        const qty = Math.abs(Number(txn.qtyChange || 0));
        batch.outward.qty += qty;

        // Sales value logic uses purchase rate if available to calculate actual cost of goods sold.
        const effectiveRate = txn.rate ? Number(txn.rate) : (batch.inward.rate > 0 ? batch.inward.rate : batch.opening.rate);
        batch.outward.value += qty * effectiveRate;
        batch.outward.rate = effectiveRate;
      });

      // 4️⃣ CLOSING (TALLY LOGIC) – FIXED
      Object.values(itemMap).forEach((item: any) => {
        Object.values(item.batches).forEach((b: any) => {
          b.closing.qty = b.opening.qty + b.inward.qty - b.outward.qty;

          const totalInQty = b.opening.qty + b.inward.qty;
          const totalInValue = b.opening.value + b.inward.value;

          if (totalInQty > 0) {
            b.closing.rate = totalInValue / totalInQty;
          } else {
            b.closing.rate = b.outward.qty > 0 ? b.outward.value / b.outward.qty : 0;
          }
          b.closing.value = b.closing.qty * b.closing.rate;

          if (Math.abs(b.opening.qty) < 0.001) b.opening.qty = 0;
          if (Math.abs(b.opening.value) < 0.01) b.opening.value = 0;
          if (Math.abs(b.closing.qty) < 0.001) b.closing.qty = 0;
          if (Math.abs(b.closing.value) < 0.01) b.closing.value = 0;
        });
      });

      // 5️⃣ FINAL ARRAY
      const finalData = Object.values(itemMap).map((item: any) => ({
        ...item,
        batches: Object.values(item.batches),
      }));

      setData(finalData);
    } catch (err: any) {
      setError(err.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    const fetchCategoryVouchers = async () => {
      const currentDrill = drillPath[drillPath.length - 1];
      if (currentDrill.type === "category" && !categoryVouchers && !categoryVouchersLoading) {
        setCategoryVouchersLoading(true);
        try {
          const params = new URLSearchParams({ company_id, owner_type, owner_id });
          const [purchaseRes, salesRes] = await Promise.all([
            fetch(`${import.meta.env.VITE_API_URL}/api/purchase-vouchers/purchase-history?${params}`),
            fetch(`${import.meta.env.VITE_API_URL}/api/sales-vouchers/sale-history?${params}`)
          ]);
          const purchaseData = (await purchaseRes.json()).data || [];
          const salesData = (await salesRes.json()).data || [];
          setCategoryVouchers({ purchase: purchaseData, sales: salesData });
        } catch (err) {
          console.error("Error fetching category vouchers", err);
        } finally {
          setCategoryVouchersLoading(false);
        }
      }
    };
    fetchCategoryVouchers();
  }, [drillPath, company_id, owner_type, owner_id]);

  const prevReportViewRef = useRef(reportView);

  useEffect(() => {
    if (integrate === "new") return;

    if (prevReportViewRef.current !== reportView) {
      setExpandedItems(new Set()); // Reset expanded items when view changes
      setExpandedGroups(new Set());
      setExpandedCategories(new Set());
      setDrillPath([{ id: "root", name: "Stock Groups", type: "root" }]);
      prevReportViewRef.current = reportView;
    }

    if (reportView === "Categories") loadCategoriesData();
    else loadAllData();
  }, [reportView, integrate]);

  const toggleItem = (itemName: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemName)) {
        newSet.delete(itemName);
      } else {
        newSet.add(itemName);
      }
      return newSet;
    });
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) newSet.delete(groupId);
      else newSet.add(groupId);
      return newSet;
    });
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) newSet.delete(categoryId);
      else newSet.add(categoryId);
      return newSet;
    });
  };

  // Helper function to format date
  const formatDate = (dateValue: any): string => {
    if (
      !dateValue ||
      dateValue === "-" ||
      dateValue === null ||
      dateValue === undefined
    ) {
      return "-";
    }

    try {
      if (typeof dateValue === "string") {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) {
          return dateValue;
        }
        return date.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
      }

      if (dateValue instanceof Date) {
        return dateValue.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
      }

      return "-";
    } catch (error) {
      console.error("Date formatting error:", error, dateValue);
      return "-";
    }
  };

  // Helper to format currency
  const formatCurrency = (value: number) => {
    if (!value && value !== 0) return "-";
    return value.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const handleExport = () => {
    if (!data.length) return;

    const headers = [
      "Particulars",
      "Opening Qty",
      "Opening Value",
      "Inward Qty",
      "Inward Value",
      "Outward Qty",
      "Outward Value",
      "Closing Qty",
      "Closing Value",
    ];

    const rows = data.map((item: any) => {
      const name = item.groupName || item.categoryName || item.itemName || "";
      const opQty = item.totalOpeningQty || item.opening?.qty || 0;
      const opVal = item.totalOpeningValue || item.opening?.value || 0;
      const inQty = item.totalInwardQty || item.inward?.qty || 0;
      const inVal = item.totalInwardValue || item.inward?.value || 0;
      const outQty = item.totalOutwardQty || item.outward?.qty || 0;
      const outVal = item.totalOutwardValue || item.outward?.value || 0;
      const clQty = item.totalClosingQty || item.closing?.qty || 0;
      const clVal = item.totalClosingValue || item.closing?.value || 0;

      return [
        `"${name.replace(/"/g, '""')}"`,
        opQty,
        opVal,
        inQty,
        inVal,
        outQty,
        outVal,
        clQty,
        clVal,
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "stock-summary.csv";
    link.click();
  };

  // handleEdit
  const handleEditClick = (ledger: any) => {
    // console.log("handle", ledger);
    setEditLedgerId(ledger.id);
    setEditClosingBalance(ledger.closingBalance ?? "");
  };

  const handleCancelEdit = () => {
    setEditLedgerId(null);
    setEditClosingBalance("");
  };

  const handleSaveEdit = async (ledgerId: number) => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL
        }/api/ledger?company_id=${company_id}&owner_type=${owner_type}&owner_id=${owner_id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ledgerId,
            closingBalance: editClosingBalance,
          }),
        }
      );

      if (!res.ok) {
        throw new Error("Failed to update closing balance");
      }

      // Update UI after success
      setGroups((prev) =>
        prev.map((l) =>
          l.id === ledgerId ? { ...l, closingBalance: editClosingBalance } : l
        )
      );

      setEditLedgerId(null);
      setEditClosingBalance("");
    } catch (error) {
      console.error("Closing balance update failed", error);
      alert("Failed to update closing balance");
    }
  };

  const getFinancialMonths = () => [
    "April", "May", "June", "July", "August", "September",
    "October", "November", "December", "January", "February", "March",
  ];

  const calculateCategoryMonthlySummary = useMemo(() => {
    return (categoryId: string) => {
      if (!categoryVouchers) return [];
      
      const group = data.find((g: any) => g.categories?.some((c: any) => c.id === categoryId));
      const category = group?.categories.find((c: any) => c.id === categoryId);
      if (!category) return [];

      const itemsInCat = category.items || [];
      const itemNames = itemsInCat.map((i: any) => (i.itemName || "").toLowerCase().trim());

      let baseOpeningQty = 0;
      let baseOpeningValue = 0;

      itemsInCat.forEach((item: any) => {
        if (item.batches && Array.isArray(item.batches)) {
          item.batches.forEach((b: any) => {
            if (b.mode === 'opening' || (b.opening && b.opening.qty)) {
               baseOpeningQty += Number(b.opening?.qty || b.batchQuantity || 0);
               baseOpeningValue += Number(b.opening?.value || ((b.batchQuantity || 0) * (b.openingRate || 0)) || 0);
            }
          });
        }
      });

      const purchases = categoryVouchers.purchase.filter((p: any) => {
        const pName = p.itemName ? p.itemName.toLowerCase().trim() : "";
        return itemNames.includes(pName);
      });

      const sales = categoryVouchers.sales.filter((s: any) => {
        const sName = s.itemName ? s.itemName.toLowerCase().trim() : "";
        return itemNames.includes(sName);
      });

      const monthMap: Record<string, any> = {};
      const months = getFinancialMonths();

      const baseYear = purchases[0]?.purchaseDate || sales[0]?.movementDate || new Date().toISOString();
      const fyStartYear = new Date(baseYear).getMonth() >= 3 ? new Date(baseYear).getFullYear() : new Date(baseYear).getFullYear() - 1;

      months.forEach((m, index) => {
        const year = index <= 8 ? fyStartYear : fyStartYear + 1;
        const key = `${m} ${year}`;
        monthMap[key] = {
           monthName: m,
           year: year,
           key: key,
           inQty: 0, inValue: 0, 
           outQty: 0, outValue: 0 
        };
      });

      const getMonthKey = (date: string) => {
        const d = new Date(date);
        const month = d.toLocaleString("en-IN", { month: "long" });
        const year = d.getFullYear();
        return `${month} ${year}`;
      };

      purchases.forEach((p: any) => {
        const key = getMonthKey(p.purchaseDate);
        if (monthMap[key]) {
          monthMap[key].inQty += Number(p.purchaseQuantity || 0);
          monthMap[key].inValue += Number(p.purchaseQuantity || 0) * Number(p.rate || 0);
        }
      });

      sales.forEach((s: any) => {
        const key = getMonthKey(s.movementDate);
        if (monthMap[key]) {
          monthMap[key].outQty += Math.abs(Number(s.qtyChange || 0));
          monthMap[key].outValue += Math.abs(Number(s.qtyChange || 0)) * Number(s.rate || 0);
        }
      });

      const monthlyData: any[] = [];
      let currentOpeningQty = baseOpeningQty;
      let currentOpeningValue = baseOpeningValue;

      months.forEach((m, index) => {
        const year = index <= 8 ? fyStartYear : fyStartYear + 1;
        const key = `${m} ${year}`;
        const monthTotals = monthMap[key];

        const closingQty = currentOpeningQty + monthTotals.inQty - monthTotals.outQty;
        const closingValue = currentOpeningValue + monthTotals.inValue - monthTotals.outValue;

        monthlyData.push({
           ...monthTotals,
           openingQty: currentOpeningQty,
           openingValue: currentOpeningValue,
           closingQty: closingQty,
           closingValue: closingValue
        });

        currentOpeningQty = closingQty;
        currentOpeningValue = closingValue;
      });

      return monthlyData;
    };
  }, [categoryVouchers, data]);

  const calculateItemMonthsSummary = useMemo(() => {
    return (itemName: string, categoryId: string) => {
      if (!categoryVouchers) return [];
      
      const group = data.find((g: any) => g.categories?.some((c: any) => c.id === categoryId));
      const category = group?.categories.find((c: any) => c.id === categoryId);
      if (!category) return [];

      const item = category.items?.find((i: any) => i.itemName === itemName);
      if (!item) return [];

      const iName = (itemName || "").toLowerCase().trim();

      let baseOpeningQty = 0;
      let baseOpeningValue = 0;
      if (item.batches && Array.isArray(item.batches)) {
        item.batches.forEach((b: any) => {
          if (b.mode === 'opening' || (b.opening && b.opening.qty)) {
             baseOpeningQty += Number(b.opening?.qty || b.batchQuantity || 0);
             baseOpeningValue += Number(b.opening?.value || ((b.batchQuantity || 0) * (b.openingRate || 0)) || 0);
          }
        });
      }

      const purchases = categoryVouchers.purchase.filter((p: any) => {
        return (p.itemName || "").toLowerCase().trim() === iName;
      });

      const sales = categoryVouchers.sales.filter((s: any) => {
        return (s.itemName || "").toLowerCase().trim() === iName;
      });

      const monthMap: Record<string, any> = {};
      const months = getFinancialMonths();

      const baseYear = purchases[0]?.purchaseDate || sales[0]?.movementDate || new Date().toISOString();
      const fyStartYear = new Date(baseYear).getMonth() >= 3 ? new Date(baseYear).getFullYear() : new Date(baseYear).getFullYear() - 1;

      months.forEach((m, index) => {
        const year = index <= 8 ? fyStartYear : fyStartYear + 1;
        const key = `${m} ${year}`;
        monthMap[key] = {
           monthName: m,
           year: year,
           key: key,
           inQty: 0, inValue: 0, 
           outQty: 0, outValue: 0 
        };
      });

      const getMonthKey = (date: string) => {
        const d = new Date(date);
        return `${d.toLocaleString("en-IN", { month: "long" })} ${d.getFullYear()}`;
      };

      purchases.forEach((p: any) => {
        const key = getMonthKey(p.purchaseDate);
        if (monthMap[key]) {
          monthMap[key].inQty += Number(p.purchaseQuantity || 0);
          monthMap[key].inValue += Number(p.purchaseQuantity || 0) * Number(p.rate || 0);
        }
      });

      sales.forEach((s: any) => {
        const key = getMonthKey(s.movementDate);
        if (monthMap[key]) {
          monthMap[key].outQty += Math.abs(Number(s.qtyChange || 0));
          monthMap[key].outValue += Math.abs(Number(s.qtyChange || 0)) * Number(s.rate || 0);
        }
      });

      const monthlyData: any[] = [];
      let currentOpeningQty = baseOpeningQty;
      let currentOpeningValue = baseOpeningValue;

      months.forEach((m, index) => {
        const year = index <= 8 ? fyStartYear : fyStartYear + 1;
        const key = `${m} ${year}`;
        const monthTotals = monthMap[key];

        const closingQty = currentOpeningQty + monthTotals.inQty - monthTotals.outQty;
        const closingValue = currentOpeningValue + monthTotals.inValue - monthTotals.outValue;

        monthlyData.push({
           ...monthTotals,
           openingQty: currentOpeningQty,
           openingValue: currentOpeningValue,
           closingQty: closingQty,
           closingValue: closingValue
        });

        currentOpeningQty = closingQty;
        currentOpeningValue = closingValue;
      });

      return monthlyData;
    };
  }, [categoryVouchers, data]);

  const calculateMonthItemsSummary = useMemo(() => {
    return (monthKey: string, categoryId: string) => {
      if (!categoryVouchers) return [];
      
      const group = data.find((g: any) => g.categories?.some((c: any) => c.id === categoryId));
      const category = group?.categories.find((c: any) => c.id === categoryId);
      if (!category) return [];

      const itemsInCat = category.items || [];
      const itemNames = itemsInCat.map((i: any) => (i.itemName || "").toLowerCase().trim());

      const getMonthKey = (date: string) => {
        const d = new Date(date);
        return `${d.toLocaleString("en-IN", { month: "long" })} ${d.getFullYear()}`;
      };

      // We need to calculate opening balance for this month for EACH item
      // This means summing opening balance + all previous months' inwards - outwards
      const months = getFinancialMonths();
      const baseYear = categoryVouchers.purchase[0]?.purchaseDate || categoryVouchers.sales[0]?.movementDate || new Date().toISOString();
      const fyStartYear = new Date(baseYear).getMonth() >= 3 ? new Date(baseYear).getFullYear() : new Date(baseYear).getFullYear() - 1;

      const orderedMonthKeys = months.map((m, i) => `${m} ${i <= 8 ? fyStartYear : fyStartYear + 1}`);
      const monthIndex = orderedMonthKeys.indexOf(monthKey);

      return itemsInCat.map((item: any) => {
        const iName = (item.itemName || "").toLowerCase().trim();
        
        let openingQty = 0;
        let openingValue = 0;
        if (item.batches && Array.isArray(item.batches)) {
          item.batches.forEach((b: any) => {
            if (b.mode === 'opening' || (b.opening && b.opening.qty)) {
               openingQty += Number(b.opening?.qty || b.batchQuantity || 0);
               openingValue += Number(b.opening?.value || ((b.batchQuantity || 0) * (b.openingRate || 0)) || 0);
            }
          });
        }

        // Add previous months
        for (let i = 0; i < monthIndex; i++) {
           const prevKey = orderedMonthKeys[i];
           const prevPurchases = categoryVouchers.purchase.filter((p: any) => 
             (p.itemName || "").toLowerCase().trim() === iName && getMonthKey(p.purchaseDate) === prevKey
           );
           const prevSales = categoryVouchers.sales.filter((s: any) => 
             (s.itemName || "").toLowerCase().trim() === iName && getMonthKey(s.movementDate) === prevKey
           );
           
           prevPurchases.forEach((p: any) => {
             openingQty += Number(p.purchaseQuantity || 0);
             openingValue += Number(p.purchaseQuantity || 0) * Number(p.rate || 0);
           });
           prevSales.forEach((s: any) => {
             openingQty -= Math.abs(Number(s.qtyChange || 0));
             openingValue -= Math.abs(Number(s.qtyChange || 0)) * Number(s.rate || 0);
           });
        }

        // Current month
        let inQty = 0; let inValue = 0;
        let outQty = 0; let outValue = 0;

        const currPurchases = categoryVouchers.purchase.filter((p: any) => 
          (p.itemName || "").toLowerCase().trim() === iName && getMonthKey(p.purchaseDate) === monthKey
        );
        const currSales = categoryVouchers.sales.filter((s: any) => 
          (s.itemName || "").toLowerCase().trim() === iName && getMonthKey(s.movementDate) === monthKey
        );

        currPurchases.forEach((p: any) => {
          inQty += Number(p.purchaseQuantity || 0);
          inValue += Number(p.purchaseQuantity || 0) * Number(p.rate || 0);
        });
        currSales.forEach((s: any) => {
          outQty += Math.abs(Number(s.qtyChange || 0));
          outValue += Math.abs(Number(s.qtyChange || 0)) * Number(s.rate || 0);
        });

        const closingQty = openingQty + inQty - outQty;
        const closingValue = openingValue + inValue - outValue;

        return {
          ...item,
          totals: {
            openingQty, openingValue,
            inwardQty: inQty, inwardValue: inValue,
            outwardQty: outQty, outwardValue: outValue,
            closingQty, closingValue
          }
        };
      }).filter((item: any) => 
         item.totals.openingQty !== 0 || item.totals.inwardQty !== 0 || 
         item.totals.outwardQty !== 0 || item.totals.closingQty !== 0
      );
    };
  }, [categoryVouchers, data]);

  return (
    <div className="pt-[56px] px-4">
      <div className="flex items-center mb-6">
        <button onClick={() => navigate(-1)} className="mr-4 p-2 rounded-full">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">Stock Summary</h1>

        <div className="ml-auto flex space-x-2 relative">
          <button
            onClick={() => setShowSettings((p) => !p)}
            className="p-2 rounded-md hover:bg-gray-200"
            title="Settings"
          >
            <Settings size={18} />
          </button>

          <button onClick={() => window.print()} className="p-2 rounded-md">
            <Printer size={18} />
          </button>

          <button onClick={handleExport} className="p-2 rounded-md">
            <Download size={18} />
          </button>

          {/* 🔽 Dropdown */}
          {showSettings && (
            <div className="absolute right-0 top-10 w-64 bg-white border shadow rounded z-50">
              <div className="p-3 border-b font-semibold text-sm">
                Inventory Settings
              </div>

              <div className="p-3 space-y-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={integrate === "integrated"}
                    onChange={() => {
                      setIntegrate("integrated");
                      setShowSettings(false);
                    }}
                  />
                  Integrated account with inventory
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={integrate === "new"}
                    onChange={() => {
                      setIntegrate("new");
                      setShowSettings(false);
                    }}
                  />
                  Only Account
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 rounded bg-white shadow">
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold">Stock Summary Report</h2>

          {/* Report Views */}
          {integrate === "integrated" && (
            <div className="mt-5 flex justify-center gap-8 ">
              {["All", "Categories"].map(
                (view) => (
                  <label key={view} className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={reportView === view}
                      onChange={() => setReportView(view as any)}
                    />
                    {view}
                  </label>
                )
              )}
            </div>
          )}

          {integrate === "new" && (
            <div className="mt-6 overflow-x-auto">
              <h2 className="text-lg font-semibold mb-3 text-center">
                Stock-in-Hand Ledgers
              </h2>

              {groups.length === 0 ? (
                <p className="text-center text-gray-500">
                  No Stock-in-Hand data found
                </p>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr
                      className={
                        theme === "dark"
                          ? "bg-gray-700 text-white"
                          : "bg-gray-200 text-black"
                      }
                    >
                      <th className="p-2 border text-center">S.No</th>
                      <th className="p-2 border text-center">Ledger Name</th>
                      <th className="p-2 border text-center">
                        Opening Balance
                      </th>
                      <th className="p-2 border text-center">
                        Closing Balance
                      </th>
                      <th className="p-2 border text-center">Balance Type</th>
                      <th className="p-2 border text-center">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {groups.map((ledger, index) => (
                      <tr
                        key={ledger.id}
                        className={
                          theme === "dark"
                            ? "bg-gray-900 text-white"
                            : "bg-white text-black"
                        }
                      >
                        <td className="p-2 border text-center">{index + 1}</td>

                        <td className="p-2 border text-center font-medium">
                          {ledger.name}
                        </td>

                        <td className="p-2 border text-center">
                          {ledger.openingBalance}
                        </td>

                        {/* 🔹 Closing Balance (Editable) */}
                        <td className="p-2 border text-center">
                          {editLedgerId === ledger.id ? (
                            <input
                              type="number"
                              className="w-24 px-2 py-1 border rounded text-center"
                              value={editClosingBalance}
                              onChange={(e) =>
                                setEditClosingBalance(e.target.value)
                              }
                            />
                          ) : (
                            ledger.closingBalance
                          )}
                        </td>

                        <td className="p-2 border text-center capitalize">
                          {ledger.balanceType}
                        </td>

                        {/* 🔹 Action */}
                        <td className="p-2 border text-center">
                          {editLedgerId === ledger.id ? (
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => handleSaveEdit(ledger.id)}
                                className="text-green-600 hover:text-green-800"
                                title="Save"
                              >
                                <Check size={18} />
                              </button>

                              <button
                                onClick={handleCancelEdit}
                                className="text-red-600 hover:text-red-800"
                                title="Cancel"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleEditClick(ledger)}
                              className="text-blue-600 hover:text-blue-800"
                              title="Edit Closing Balance"
                            >
                              <Edit size={18} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {loading && <p>Loading...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading &&
          !error &&
          integrate === "integrated" &&
          data.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500">
                No data available for {reportView} view
              </p>
            </div>
          )}

        {!loading &&
          !error &&
          integrate === "integrated" &&
          data.length > 0 && (
            <div className="flex flex-col gap-4">
                  {reportView === "Categories" && drillPath.length > 1 && (
                    <div className={`flex items-center gap-2 p-2 rounded-md ${theme === "dark" ? "bg-gray-800" : "bg-gray-100"}`}>
                      <button
                        onClick={() => setDrillPath(prev => prev.slice(0, prev.length - 1))}
                        className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-1 text-sm font-semibold"
                      >
                        <ArrowLeft size={16} /> Back
                      </button>
                      <div className="flex items-center gap-2 text-sm font-semibold ml-4">
                        {drillPath.map((step, idx) => (
                          <React.Fragment key={idx}>
                            {idx > 0 && <span>/</span>}
                            <span 
                              className={`cursor-pointer hover:underline ${idx === drillPath.length - 1 ? "text-blue-600 dark:text-blue-400" : ""}`}
                              onClick={() => setDrillPath(prev => prev.slice(0, idx + 1))}
                            >
                              {step.name}
                            </span>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr
                        className={
                          theme === "dark"
                            ? "bg-gray-700 text-white"
                            : "bg-gray-200 text-black"
                        }
                      >
                        <th
                          rowSpan={2}
                          className={`border ${theme === "dark"
                            ? "border-gray-500"
                            : "border-gray-400"
                            } p-2 text-left font-semibold`}
                          style={{ minWidth: "200px" }}
                        >
                          Particulars
                        </th>
                        {(reportView === "All" || reportView === "Categories") && (
                          <>
                            <th
                              colSpan={3}
                              className={`border ${theme === "dark"
                                ? "border-gray-500"
                                : "border-gray-400"
                                } p-1 text-center font-semibold`}
                            >
                              Opening Balance
                            </th>
                            <th
                              colSpan={3}
                              className={`border ${theme === "dark"
                                ? "border-gray-500"
                                : "border-gray-400"
                                } p-1 text-center font-semibold`}
                            >
                              Inwards
                            </th>
                            <th
                              colSpan={3}
                              className={`border ${theme === "dark"
                                ? "border-gray-500"
                                : "border-gray-400"
                                } p-1 text-center font-semibold`}
                            >
                              Outwards
                            </th>
                          </>
                        )}
                        <th
                          colSpan={3}
                          className={`border ${theme === "dark"
                            ? "border-gray-500"
                            : "border-gray-400"
                            } p-1 text-center font-semibold`}
                        >
                          Closing Balance
                        </th>
                      </tr>
                      {/* Sub Header Row */}
                      <tr
                        className={
                          theme === "dark"
                            ? "bg-gray-700 text-white"
                            : "bg-gray-200 text-black"
                        }
                      >
                        {(reportView === "All" || reportView === "Categories") && (
                          <>
                            {/* Opening */}
                            <th className={`border ${theme === "dark" ? "border-gray-500" : "border-gray-400"} p-1 text-center`}>Quantity</th>
                            <th className={`border ${theme === "dark" ? "border-gray-500" : "border-gray-400"} p-1 text-center`}>Rate</th>
                            <th className={`border ${theme === "dark" ? "border-gray-500" : "border-gray-400"} p-1 text-center`}>Value</th>

                            {/* Inward */}
                            <th className={`border ${theme === "dark" ? "border-gray-500" : "border-gray-400"} p-1 text-center`}>Quantity</th>
                            <th className={`border ${theme === "dark" ? "border-gray-500" : "border-gray-400"} p-1 text-center`}>Rate</th>
                            <th className={`border ${theme === "dark" ? "border-gray-500" : "border-gray-400"} p-1 text-center`}>Value</th>

                            {/* Outward */}
                            <th className={`border ${theme === "dark" ? "border-gray-500" : "border-gray-400"} p-1 text-center`}>Quantity</th>
                            <th className={`border ${theme === "dark" ? "border-gray-500" : "border-gray-400"} p-1 text-center`}>Rate</th>
                            <th className={`border ${theme === "dark" ? "border-gray-500" : "border-gray-400"} p-1 text-center`}>Value</th>
                          </>
                        )}

                        {/* Closing */}
                        <th className={`border ${theme === "dark" ? "border-gray-500" : "border-gray-400"} p-1 text-center`}>Quantity</th>
                        <th className={`border ${theme === "dark" ? "border-gray-500" : "border-gray-400"} p-1 text-center`}>Rate</th>
                        <th className={`border ${theme === "dark" ? "border-gray-500" : "border-gray-400"} p-1 text-center`}>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportView === "Categories" ? (
                        (() => {
                           const currentDrill = drillPath[drillPath.length - 1];

                           if (currentDrill.type === 'root') {
                             return data.map((group: any, gIdx: number) => {
                               if (!group.isGroup) return null;
                               const groupTotals = group.totals || { openingQty: 0, openingValue: 0, inwardQty: 0, inwardValue: 0, outwardQty: 0, outwardValue: 0, closingQty: 0, closingValue: 0 };
                               const groupOpRate = groupTotals.openingQty > 0 ? groupTotals.openingValue / groupTotals.openingQty : 0;
                               const groupInRate = groupTotals.inwardQty > 0 ? groupTotals.inwardValue / groupTotals.inwardQty : 0;
                               const groupOutRate = groupTotals.outwardQty > 0 ? groupTotals.outwardValue / groupTotals.outwardQty : 0;
                               const groupClRate = groupTotals.closingQty ? Math.abs(groupTotals.closingValue / groupTotals.closingQty) : 0;
                               return (
                                 <React.Fragment key={`g-${gIdx}`}>
                                   <tr
                                     className={`cursor-pointer font-bold ${theme === "dark" ? "bg-gray-800 text-white hover:bg-gray-700" : "bg-gray-200 hover:bg-gray-300"}`}
                                     onClick={() => setDrillPath([...drillPath, { id: group.id, name: group.name, type: 'group' }])}
                                   >
                                     <td className="border p-2">
                                       <div className="flex items-center gap-2">
                                         {group.name}
                                       </div>
                                     </td>
                                     <td className="border p-2 text-right align-middle">{groupTotals.openingQty ? `${groupTotals.openingQty} ${group.unitName || ""}`.trim() : ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(groupOpRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(groupTotals.openingValue)}</td>
                                     <td className="border p-2 text-right align-middle">{groupTotals.inwardQty ? `${groupTotals.inwardQty} ${group.unitName || ""}`.trim() : ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(groupInRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(groupTotals.inwardValue)}</td>
                                     <td className="border p-2 text-right align-middle">{groupTotals.outwardQty ? `${groupTotals.outwardQty} ${group.unitName || ""}`.trim() : ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(groupOutRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(groupTotals.outwardValue)}</td>
                                     <td className="border p-2 text-right align-middle">{groupTotals.closingQty ? `${groupTotals.closingQty} ${group.unitName || ""}`.trim() : ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(groupClRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(groupTotals.closingValue)}</td>
                                   </tr>
                                 </React.Fragment>
                               );
                             });
                           } else if (currentDrill.type === 'group') {
                             const group = data.find((g: any) => g.id === currentDrill.id);
                             if (!group) return null;
                             return group.categories.map((category: any, cIdx: number) => {
                               const catTotals = category.totals;
                               const catOpRate = catTotals.openingQty > 0 ? catTotals.openingValue / catTotals.openingQty : 0;
                               const catInRate = catTotals.inwardQty > 0 ? catTotals.inwardValue / catTotals.inwardQty : 0;
                               const catOutRate = catTotals.outwardQty > 0 ? catTotals.outwardValue / catTotals.outwardQty : 0;
                               const catClRate = catTotals.closingQty ? Math.abs(catTotals.closingValue / catTotals.closingQty) : 0;
                               return (
                                 <React.Fragment key={`c-${cIdx}`}>
                                   <tr
                                     className={`cursor-pointer font-semibold ${theme === "dark" ? "bg-gray-700 text-white hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"}`}
                                     onClick={() => setDrillPath([...drillPath, { id: category.id, name: category.name, type: 'category' }])}
                                   >
                                     <td className="border p-2">
                                       <div className="flex items-center gap-2">
                                         {category.name}
                                       </div>
                                     </td>
                                     <td className="border p-2 text-right align-middle">{catTotals.openingQty ? `${catTotals.openingQty} ${category.unitName || ""}`.trim() : ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(catOpRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(catTotals.openingValue)}</td>
                                     <td className="border p-2 text-right align-middle">{catTotals.inwardQty ? `${catTotals.inwardQty} ${category.unitName || ""}`.trim() : ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(catInRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(catTotals.inwardValue)}</td>
                                     <td className="border p-2 text-right align-middle">{catTotals.outwardQty ? `${catTotals.outwardQty} ${category.unitName || ""}`.trim() : ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(catOutRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(catTotals.outwardValue)}</td>
                                     <td className="border p-2 text-right align-middle">{catTotals.closingQty ? `${catTotals.closingQty} ${category.unitName || ""}`.trim() : ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(catClRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(catTotals.closingValue)}</td>
                                   </tr>
                                 </React.Fragment>
                               );
                             });
                           } else if (currentDrill.type === 'category') {
                             const group = data.find((g: any) => g.categories?.some((c: any) => c.id === currentDrill.id));
                             const category = group?.categories.find((c: any) => c.id === currentDrill.id);
                             if (!category) return null;
                             
                             return category.items.map((item: any, iIdx: number) => {
                               const batches = Array.isArray(item.batches) ? item.batches : [];
                               const totals = batches.reduce(
                                 (acc: any, b: any) => {
                                   acc.openingQty += b.opening?.qty || 0;
                                   acc.openingValue += b.opening?.value || 0;
                                   acc.inwardQty += b.inward?.qty || 0;
                                   acc.inwardValue += b.inward?.value || 0;
                                   acc.outwardQty += b.outward?.qty || 0;
                                   acc.outwardValue += b.outward?.value || 0;
                                   acc.closingQty += b.closing?.qty || 0;
                                   acc.closingValue += b.closing?.value || 0;
                                   return acc;
                                 },
                                 { openingQty: 0, openingValue: 0, inwardQty: 0, inwardValue: 0, outwardQty: 0, outwardValue: 0, closingQty: 0, closingValue: 0 }
                               );
                               
                               const openingRate = totals.openingQty > 0 ? totals.openingValue / totals.openingQty : 0;
                               const inwardRate = totals.inwardQty > 0 ? totals.inwardValue / totals.inwardQty : 0;
                               const outwardRate = totals.outwardQty > 0 ? totals.outwardValue / totals.outwardQty : 0;
                               const closingRate = totals.closingQty !== 0 ? Math.abs(totals.closingValue / totals.closingQty) : 0;
                               
                               return (
                                 <React.Fragment key={`i-${iIdx}`}>
                                   <tr
                                     className={`cursor-pointer ${theme === "dark" ? "bg-gray-900 text-gray-300 hover:bg-gray-800" : "bg-white hover:bg-gray-50"}`}
                                     onClick={() => {
                                       navigate(`/app/reports/item-monthly-summary?item=${item.itemName}`);
                                     }}
                                   >
                                     <td className="border p-2">
                                       <div className="flex items-center gap-2">
                                         {item.itemName}
                                       </div>
                                     </td>
                                     <td className="border p-2 text-right align-middle">{totals.openingQty ? `${totals.openingQty} ${item.unitName}`.trim() : ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(openingRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(totals.openingValue)}</td>

                                     <td className="border p-2 text-right align-middle">{totals.inwardQty ? `${totals.inwardQty} ${item.unitName}`.trim() : ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(inwardRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(totals.inwardValue)}</td>

                                     <td className="border p-2 text-right align-middle">{totals.outwardQty ? `${totals.outwardQty} ${item.unitName}`.trim() : ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(outwardRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(totals.outwardValue)}</td>

                                     <td className="border p-2 text-right align-middle">{totals.closingQty ? `${totals.closingQty} ${item.unitName}`.trim() : ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(closingRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(totals.closingValue)}</td>
                                   </tr>
                                 </React.Fragment>
                               );
                             });
                           } else if (currentDrill.type === 'item') {
                             if (categoryVouchersLoading) {
                               return <tr><td colSpan={13} className="text-center p-4">Loading monthly summary...</td></tr>;
                             }
                             const itemData = (currentDrill as any).data;
                             const itemMonthsData = calculateItemMonthsSummary(itemData.itemName, itemData.categoryId);

                             return itemMonthsData.map((m: any, mIdx: number) => {
                               const opRate = m.openingQty ? m.openingValue / m.openingQty : 0;
                               const inRate = m.inQty ? m.inValue / m.inQty : 0;
                               const outRate = m.outQty ? m.outValue / m.outQty : 0;
                               const clRate = m.closingQty ? Math.abs(m.closingValue / m.closingQty) : 0;
                               
                               return (
                                 <React.Fragment key={`m-${mIdx}`}>
                                   <tr
                                     className={`cursor-pointer ${theme === "dark" ? "bg-gray-900 text-gray-300 hover:bg-gray-800" : "bg-white hover:bg-gray-50"}`}
                                     onClick={() => {
                                       navigate(`/app/reports/item-monthly-summary?item=${itemData.itemName}`);
                                     }}
                                   >
                                     <td className="border p-2 font-semibold">
                                       <div className="flex items-center gap-2">
                                         {m.monthName}
                                       </div>
                                     </td>
                                     <td className="border p-2 text-right align-middle">{m.openingQty || ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(opRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(m.openingValue)}</td>

                                     <td className="border p-2 text-right align-middle">{m.inQty || ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(inRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(m.inValue)}</td>

                                     <td className="border p-2 text-right align-middle">{m.outQty || ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(outRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(m.outValue)}</td>

                                     <td className="border p-2 text-right align-middle">{m.closingQty || ""}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(clRate)}</td>
                                     <td className="border p-2 text-right align-middle">{formatCurrency(m.closingValue)}</td>
                                   </tr>
                                 </React.Fragment>
                               );
                             });
                           }
                           return null;
                        })()
                      ) : (
                        data.map((item: any, idx: number) => {
                          if (item.isGroup) return null; // Wait for data to load
                          const isExpanded = expandedItems.has(item.itemName);
                          const batches = Array.isArray(item.batches) ? item.batches : [];

                          const totals = batches.reduce(
                            (acc: any, b: any) => {
                              acc.openingQty += b.opening?.qty || 0;
                              acc.openingValue += b.opening?.value || 0;
                              acc.inwardQty += b.inward?.qty || 0;
                              acc.inwardValue += b.inward?.value || 0;
                              acc.outwardQty += b.outward?.qty || 0;
                              acc.outwardValue += b.outward?.value || 0;
                              acc.closingQty += b.closing?.qty || 0;
                              acc.closingValue += b.closing?.value || 0;
                              return acc;
                            },
                            { openingQty: 0, openingValue: 0, inwardQty: 0, inwardValue: 0, outwardQty: 0, outwardValue: 0, closingQty: 0, closingValue: 0 }
                          );

                          const closingRate = totals.closingQty !== 0 ? Math.abs(totals.closingValue / totals.closingQty) : 0;
                          const openingRate = totals.openingQty > 0 ? totals.openingValue / totals.openingQty : 0;
                          const inwardRate = totals.inwardQty > 0 ? totals.inwardValue / totals.inwardQty : 0;
                          const outwardRate = totals.outwardQty > 0 ? totals.outwardValue / totals.outwardQty : 0;

                          return (
                            <React.Fragment key={idx}>
                              <tr
                                className={`cursor-pointer font-semibold ${theme === "dark" ? "bg-gray-800 text-white hover:bg-gray-700" : "bg-gray-50 hover:bg-gray-100"}`}
                                onClick={() => {
                                  if (batches.length === 1 && batches[0]?.batchName === "Default") {
                                    navigate(`/app/reports/item-monthly-summary?item=${item.itemName}&batch=Default`);
                                  } else {
                                    toggleItem(item.itemName);
                                  }
                                }}
                              >
                                <td className="border p-2">
                                  <div className="flex items-center gap-2">
                                    {(batches.length === 1 && batches[0]?.batchName === "Default") ? null :
                                      isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    {item.itemName}
                                  </div>
                                </td>
                                <td className="border p-2 text-right align-middle">{totals.openingQty ? `${totals.openingQty} ${item.unitName}`.trim() : ""}</td>
                                <td className="border p-2 text-right align-middle">{formatCurrency(openingRate)}</td>
                                <td className="border p-2 text-right align-middle">{formatCurrency(totals.openingValue)}</td>

                                <td className="border p-2 text-right align-middle">{totals.inwardQty ? `${totals.inwardQty} ${item.unitName}`.trim() : ""}</td>
                                <td className="border p-2 text-right align-middle">{formatCurrency(inwardRate)}</td>
                                <td className="border p-2 text-right align-middle">{formatCurrency(totals.inwardValue)}</td>

                                <td className="border p-2 text-right align-middle">{totals.outwardQty ? `${totals.outwardQty} ${item.unitName}`.trim() : ""}</td>
                                <td className="border p-2 text-right align-middle">{formatCurrency(outwardRate)}</td>
                                <td className="border p-2 text-right align-middle">{formatCurrency(totals.outwardValue)}</td>

                                <td className="border p-2 text-right align-middle">{totals.closingQty ? `${totals.closingQty} ${item.unitName}`.trim() : ""}</td>
                                <td className="border p-2 text-right align-middle">{formatCurrency(closingRate)}</td>
                                <td className="border p-2 text-right align-middle">{formatCurrency(totals.closingValue)}</td>
                              </tr>

                              {isExpanded && batches.length > 0 && (batches.length > 1 || batches[0]?.batchName !== "Default") &&
                                batches.map((b: any, bIdx: number) => (
                                  <tr
                                    key={bIdx}
                                    className={`cursor-pointer ${theme === "dark" ? "bg-gray-900 text-gray-400 hover:bg-gray-800" : "bg-white hover:bg-yellow-100"}`}
                                    onClick={() => navigate(`/app/reports/item-monthly-summary?item=${item.itemName}&batch=${b.batchName}`)}
                                  >
                                    <td className="border pl-8 italic">{b.batchName}</td>
                                    <td className="border p-2 text-right align-middle">{b.opening.qty ? `${b.opening.qty} ${item.unitName}`.trim() : ""}</td>
                                    <td className="border p-2 text-right align-middle">{formatCurrency(b.opening.rate)}</td>
                                    <td className="border p-2 text-right align-middle">{formatCurrency(b.opening.value)}</td>
                                    <td className="border p-2 text-right align-middle">{b.inward.qty ? `${b.inward.qty} ${item.unitName}`.trim() : ""}</td>
                                    <td className="border p-2 text-right align-middle">{b.inward.rate ? formatCurrency(b.inward.rate) : ""}</td>
                                    <td className="border p-2 text-right align-middle">{b.inward.value ? formatCurrency(b.inward.value) : ""}</td>
                                    <td className="border p-2 text-right align-middle">{b.outward.qty ? `${b.outward.qty} ${item.unitName}`.trim() : ""}</td>
                                    <td className="border p-2 text-right align-middle">{b.outward.rate ? formatCurrency(b.outward.rate) : ""}</td>
                                    <td className="border p-2 text-right align-middle">{b.outward.value ? formatCurrency(b.outward.value) : ""}</td>
                                    <td className="border p-2 text-right align-middle">{b.closing.qty ? `${b.closing.qty} ${item.unitName}`.trim() : ""}</td>
                                    <td className="border p-2 text-right align-middle">{formatCurrency(b.closing.rate)}</td>
                                    <td className="border p-2 text-right align-middle">{formatCurrency(b.closing.value)}</td>
                                  </tr>
                                ))}
                            </React.Fragment>
                          );
                        })
                      )}

                      {/* ✅ GRAND TOTAL */}
                      {(() => {
                        // const grand = data.reduce(
                        //   (acc: any, item: any) => {
                        //     item.batches.forEach((b: any) => {
                        //       acc.opening += b.opening.value;
                        //       acc.inward += b.inward.value;
                        //       acc.outward += b.outward.value;
                        //       acc.closing += b.closing.value;
                        //     });
                        //     return acc;
                        //   },
                        //   { opening: 0, inward: 0, outward: 0, closing: 0 }
                        // );
                        let itemsToAggregate: any[] = data;
                        if (reportView === "Categories") {
                          const currentDrill = drillPath[drillPath.length - 1];
                          if (currentDrill.type === 'group') {
                            const group = data.find((g: any) => g.id === currentDrill.id);
                            itemsToAggregate = group ? group.categories.map((c: any) => ({ isGroup: true, totals: c.totals })) : [];
                          } else if (currentDrill.type === 'category') {
                            const group = data.find((g: any) => g.categories?.some((c: any) => c.id === currentDrill.id));
                            const category = group?.categories.find((c: any) => c.id === currentDrill.id);
                            itemsToAggregate = category ? category.items.map((i: any) => ({ isGroup: false, batches: i.batches })) : [];
                          } else if (currentDrill.type === 'item') {
                            const itemData = (currentDrill as any).data;
                            itemsToAggregate = itemData ? [{ isGroup: false, batches: itemData.batches }] : [];
                          } else if (currentDrill.type === 'month') {
                            const monthData = (currentDrill as any).data;
                            const monthItemsData = calculateMonthItemsSummary(monthData.key, monthData.categoryId);
                            itemsToAggregate = monthItemsData.map((i: any) => ({ isGroup: true, totals: i.totals }));
                          }
                        }

                        const grand = itemsToAggregate.reduce(
                          (acc: any, group: any) => {
                            if (group.isGroup && group.totals) {
                              acc.openingQty += group.totals.openingQty || 0;
                              acc.openingValue += group.totals.openingValue || 0;

                              acc.inwardQty += group.totals.inwardQty || 0;
                              acc.inwardValue += group.totals.inwardValue || 0;

                              acc.outwardQty += group.totals.outwardQty || 0;
                              acc.outwardValue += group.totals.outwardValue || 0;

                              acc.closingQty += group.totals.closingQty || 0;
                              acc.closingValue += group.totals.closingValue || 0;
                            } else if (!group.isGroup && group.batches) {
                              // Fallback for non-hierarchical view (Opening, Closing, etc.)
                              const batches = Array.isArray(group.batches) ? group.batches : [];
                              batches.forEach((b: any) => {
                                acc.openingQty += b.opening?.qty || 0;
                                acc.openingValue += b.opening?.value || 0;
                                acc.inwardQty += b.inward?.qty || 0;
                                acc.inwardValue += b.inward?.value || 0;
                                acc.outwardQty += b.outward?.qty || 0;
                                acc.outwardValue += b.outward?.value || 0;
                                acc.closingQty += b.closing?.qty || 0;
                                acc.closingValue += b.closing?.value || 0;
                              });
                            }
                            return acc;
                          },
                          {
                            openingQty: 0,
                            openingValue: 0,
                            inwardQty: 0,
                            inwardValue: 0,
                            outwardQty: 0,
                            outwardValue: 0,
                            closingQty: 0,
                            closingValue: 0,
                          }
                        );

                        // Calculate average rates
                        const safeRate = (val: number, qty: number) =>
                          qty !== 0 ? val / qty : 0;
                        const repUnit = data[0]?.unitName || (data[0]?.categories?.[0]?.unitName) || "";

                        return (
                          <tr className="font-bold bg-gray-200">
                            <td className="border p-2">Grand Total</td>

                            {(reportView === "All" || reportView === "Categories") && (
                              <>
                                {/* Opening */}
                                <td className="border p-2 text-right align-middle">
                                  {grand.openingQty ? `${grand.openingQty} ${repUnit}`.trim() : ""}
                                </td>
                                <td className="border p-2 text-right align-middle">
                                  {/* Rate */}
                                </td>
                                <td className="border p-2 text-right align-middle">
                                  {formatCurrency(grand.openingValue)}
                                </td>

                                {/* Inward */}
                                <td className="border p-2 text-right align-middle">
                                  {grand.inwardQty ? `${grand.inwardQty} ${repUnit}`.trim() : ""}
                                </td>
                                <td className="border p-2 text-right align-middle">
                                  {/* Rate */}
                                </td>
                                <td className="border p-2 text-right align-middle">
                                  {formatCurrency(grand.inwardValue)}
                                </td>

                                {/* Outward */}
                                <td className="border p-2 text-right align-middle">
                                  {grand.outwardQty ? `${grand.outwardQty} ${repUnit}`.trim() : ""}
                                </td>
                                <td className="border p-2 text-right align-middle">
                                  {/* Rate */}
                                </td>
                                <td className="border p-2 text-right align-middle">
                                  {formatCurrency(grand.outwardValue)}
                                </td>
                              </>
                            )}

                            {/* Closing */}
                            <td className="border p-2 text-right align-middle">
                              {grand.closingQty ? `${grand.closingQty} ${repUnit}`.trim() : ""}
                            </td>
                            <td className="border p-2 text-right align-middle">
                              {/* Rate */}
                            </td>
                            <td className="border p-2 text-right align-middle">
                              {formatCurrency(grand.closingValue)}
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default StockSummary;

