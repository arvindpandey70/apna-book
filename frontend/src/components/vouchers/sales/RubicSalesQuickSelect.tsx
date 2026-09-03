import React, { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  Search,
  X,
  Plus,
  Check,
  Package,
  ArrowRightLeft,
  Tag,
  Layers,
  ShoppingBag,
  Folder,
  ArrowLeft,
  LayoutGrid,
} from "lucide-react";
import type { StockItem, StockCategory } from "../../../types";

export interface RubicSalesButtonProps {
  isActive: boolean;
  onToggle: () => void;
  theme?: string;
}

export const RubicSalesButton: React.FC<RubicSalesButtonProps> = ({
  isActive,
  onToggle,
  theme,
}) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`px-3.5 py-1.5 rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 flex items-center gap-1.5 shadow-md hover:shadow-lg active:scale-95 border ${
        isActive
          ? "bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 text-white border-purple-300 ring-2 ring-purple-400/50 shadow-purple-500/30"
          : theme === "dark"
          ? "bg-gradient-to-r from-purple-900/90 via-indigo-900/90 to-pink-900/90 text-purple-100 border-purple-700/60 hover:border-purple-400"
          : "bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 text-white border-transparent hover:brightness-110 shadow-purple-200"
      }`}
      title={isActive ? "Deactivate Rubic Sales Mode" : "Activate Rubic Quick Item Selection"}
    >
      <Sparkles className={`w-4 h-4 ${isActive ? "animate-bounce" : ""}`} />
      <span className="tracking-wide">Rubic Sales</span>
      {isActive ? (
        <span className="ml-1 text-[10px] bg-white/30 backdrop-blur-sm text-white px-1.5 py-0.2 rounded font-extrabold border border-white/40 uppercase">
          ON
        </span>
      ) : (
        <span className="ml-1 text-[10px] bg-white/20 backdrop-blur-sm text-white px-1.5 py-0.2 rounded font-semibold">
          Quick
        </span>
      )}
    </button>
  );
};

/* =========================================================================
   CATEGORY CARD COMPONENT (Stock Category Master Display)
   ========================================================================= */
export interface RubicSalesCategoryCardProps {
  id: string;
  name: string;
  parent?: string;
  description?: string;
  itemCount: number;
  selectedVoucherCount: number;
  onClick: () => void;
  theme?: string;
  isAllCard?: boolean;
}

export const RubicSalesCategoryCard: React.FC<RubicSalesCategoryCardProps> = ({
  id,
  name,
  parent,
  description,
  itemCount,
  selectedVoucherCount,
  onClick,
  theme,
  isAllCard = false,
}) => {
  const isDark = theme === "dark";

  return (
    <div
      onClick={onClick}
      className={`group relative p-3.5 rounded-2xl cursor-pointer border transition-all duration-200 flex flex-col justify-between shadow-xs hover:shadow-md min-h-[105px] ${
        selectedVoucherCount > 0
          ? isDark
            ? "bg-purple-950/40 border-purple-500/80 ring-1 ring-purple-500/40"
            : "bg-purple-50/80 border-purple-300 ring-1 ring-purple-300/60"
          : isDark
          ? "bg-gray-800/90 border-gray-700/80 hover:border-purple-500/60 hover:bg-gray-800"
          : "bg-white border-gray-200 hover:border-purple-300 hover:bg-purple-50/30"
      }`}
    >
      {/* Selected Items Badge */}
      {selectedVoucherCount > 0 && (
        <div className="absolute top-2 right-2 bg-emerald-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shadow-md flex items-center gap-0.5 z-10">
          <Check className="w-2.5 h-2.5 stroke-[3]" />
          <span>{selectedVoucherCount} Selected</span>
        </div>
      )}

      <div className="flex items-start gap-2.5 mb-2">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs transition-transform group-hover:scale-105 mt-0.5 ${
            isAllCard
              ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
              : isDark
              ? "bg-purple-950/80 text-purple-300 border border-purple-800/60"
              : "bg-gradient-to-br from-purple-100 to-indigo-100 text-purple-700 border border-purple-200/80"
          }`}
        >
          {isAllCard ? <LayoutGrid className="w-4.5 h-4.5" /> : <Folder className="w-4.5 h-4.5" />}
        </div>
        <div className="min-w-0 flex-1">
          {/* Category Name */}
          <h3
            className={`font-extrabold text-xs sm:text-sm leading-snug truncate transition-colors ${
              isDark
                ? "text-gray-100 group-hover:text-purple-300"
                : "text-gray-900 group-hover:text-purple-700"
            }`}
            title={name}
          >
            {name}
          </h3>

          {/* Parent Category & Description Info */}
          {parent && (
            <p className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold truncate mt-0.5">
              Parent: {parent}
            </p>
          )}

          {description && !parent && (
            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-normal truncate mt-0.5">
              {description}
            </p>
          )}

          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium mt-1">
            {itemCount} {itemCount === 1 ? "item" : "items"} available
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] pt-2 border-t border-gray-100 dark:border-gray-700/60">
        <span className="text-purple-600 dark:text-purple-400 font-semibold group-hover:underline flex items-center gap-0.5">
          View Category &rarr;
        </span>
        <span className="text-gray-400 dark:text-gray-500 font-mono text-[9px]">
          Stock Category
        </span>
      </div>
    </div>
  );
};

/* =========================================================================
   ITEM CARD COMPONENT
   ========================================================================= */
export interface RubicSalesItemCardProps {
  item: StockItem;
  itemDetails: {
    name: string;
    hsnCode: string;
    unit: string;
    unitLabel: string;
    gstRate: number;
    rate: number;
    mrp: number;
  };
  addedQty: number;
  onSelect: (item: StockItem) => void;
  theme?: string;
}

export const RubicSalesItemCard: React.FC<RubicSalesItemCardProps> = ({
  item,
  itemDetails,
  addedQty,
  onSelect,
  theme,
}) => {
  const [clicked, setClicked] = useState(false);

  const handleClick = () => {
    setClicked(true);
    setTimeout(() => setClicked(false), 150);
    onSelect(item);
  };

  const isDark = theme === "dark";
  const displayRate = itemDetails.rate > 0 ? itemDetails.rate : itemDetails.mrp;
  const firstLetter = (item.name || "").trim().charAt(0).toUpperCase() || "?";
  const imageUrl =
    (item as any).image ||
    (item as any).image_url ||
    (item as any).imageUrl ||
    (item as any).photo ||
    (item as any).picture ||
    null;
  const availableQty =
    (item as any).openingBalance ??
    (item as any).quantity ??
    (item as any).stock ??
    0;

  return (
    <div
      onClick={handleClick}
      className={`group relative p-2 rounded-xl cursor-pointer border transition-all duration-150 flex flex-col items-center text-center justify-between shadow-xs hover:shadow-md min-h-[110px] ${
        clicked ? "scale-95" : "hover:-translate-y-0.5"
      } ${
        addedQty > 0
          ? isDark
            ? "bg-purple-950/40 border-purple-500/80 ring-1 ring-purple-500/50"
            : "bg-purple-50/90 border-purple-400 ring-1 ring-purple-300"
          : isDark
          ? "bg-gray-800/90 border-gray-700/80 hover:border-purple-500/60 hover:bg-gray-800"
          : "bg-white border-gray-200 hover:border-purple-400 hover:bg-purple-50/30"
      }`}
    >
      {/* Added Badge */}
      {addedQty > 0 && (
        <div className="absolute top-1 right-1 bg-purple-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shadow-md flex items-center gap-0.5 z-10">
          <Check className="w-2.5 h-2.5 stroke-[3]" />
          <span>{addedQty}</span>
        </div>
      )}

      {/* Top: Image or First Letter Avatar */}
      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center overflow-hidden my-1 shrink-0 transition-transform group-hover:scale-105">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.name}
            className="w-full h-full object-cover rounded-lg"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        ) : (
          <div
            className={`w-full h-full rounded-lg flex items-center justify-center font-black text-xs sm:text-sm border shadow-xs ${
              isDark
                ? "bg-purple-950/60 text-purple-300 border-purple-800/50"
                : "bg-gradient-to-br from-purple-100 to-indigo-100 text-purple-700 border-purple-200/80"
            }`}
          >
            {firstLetter}
          </div>
        )}
      </div>

      {/* Middle: Item Name */}
      <div className="w-full px-0.5 mb-1">
        <h3
          className={`font-bold text-[11px] leading-tight truncate transition-colors ${
            isDark
              ? "text-gray-100 group-hover:text-purple-300"
              : "text-gray-900 group-hover:text-purple-700"
          }`}
          title={item.name}
        >
          {item.name}
        </h3>
      </div>

      {/* Bottom: Qty & Rate details */}
      <div className="w-full pt-1 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between text-[10px] gap-1 px-0.5">
        <span className="text-gray-500 dark:text-gray-400 font-medium truncate">
          Qty:<strong className="text-gray-800 dark:text-gray-200 ml-0.5">{addedQty > 0 ? addedQty : availableQty}</strong>
        </span>
        <span className={`font-extrabold truncate ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
          Rate:₹{displayRate ? Number(displayRate).toFixed(0) : "0"}
        </span>
      </div>
    </div>
  );
};

/* =========================================================================
   RUBIC SALES ITEM GRID & CATEGORY SELECTION COMPONENT
   ========================================================================= */
export interface RubicSalesItemGridProps {
  stockItems: StockItem[];
  stockCategories?: StockCategory[];
  getItemDetails: (itemId: string) => any;
  entries: any[];
  onSelectItem: (item: StockItem) => void;
  onExitRubicMode: () => void;
  selectedPartyName?: string;
  theme?: string;
  isLoading?: boolean;
}

export const RubicSalesItemGrid: React.FC<RubicSalesItemGridProps> = ({
  stockItems,
  stockCategories: passedStockCategories,
  getItemDetails,
  entries,
  onSelectItem,
  onExitRubicMode,
  selectedPartyName,
  theme,
  isLoading = false,
}) => {
  const [fetchedStockCategories, setFetchedStockCategories] = useState<StockCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const isDark = theme === "dark";

  // Fetch stock categories from backend master API if not passed or empty
  useEffect(() => {
    if (passedStockCategories && passedStockCategories.length > 0) return;

    const fetchCategories = async () => {
      try {
        const companyId = localStorage.getItem("company_id");
        const ownerType = localStorage.getItem("supplier");
        const ownerId = localStorage.getItem(
          ownerType === "employee" ? "employee_id" : "user_id"
        );

        if (!companyId || !ownerType || !ownerId) return;

        const queryParams = new URLSearchParams({
          company_id: companyId,
          owner_type: ownerType,
          owner_id: ownerId,
        }).toString();

        const url = `${import.meta.env.VITE_API_URL}/api/stock-categories?${queryParams}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data.data || []);
          setFetchedStockCategories(list);
        }
      } catch (err) {
        console.error("Failed to fetch stock categories in Rubic Sales:", err);
      }
    };
    fetchCategories();
  }, [passedStockCategories]);

  const effectiveCategories = useMemo(() => {
    return (passedStockCategories && passedStockCategories.length > 0)
      ? passedStockCategories
      : fetchedStockCategories;
  }, [passedStockCategories, fetchedStockCategories]);

  // Map item IDs to added quantity in entries
  const addedQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      if (entry.itemId) {
        const id = String(entry.itemId);
        const qty = Number(entry.quantity || 0);
        map.set(id, (map.get(id) || 0) + qty);
      }
    }
    return map;
  }, [entries]);

  // Group stock items by category from Stock Category Master
  const categoryGroups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; parent?: string; description?: string; items: StockItem[]; selectedCount: number }>();

    // 1. Pre-populate map with fetched Stock Category Master items
    effectiveCategories.forEach((cat) => {
      const catId = String(cat.id);
      map.set(catId, {
        id: catId,
        name: cat.name || catId,
        parent: cat.parent || "",
        description: cat.description || "",
        items: [],
        selectedCount: 0,
      });
    });

    const uncategorizedItems: StockItem[] = [];

    // 2. Map items to categories
    stockItems.forEach((item) => {
      const rawCatId =
        (item as any).categoryId ??
        (item as any).category_id ??
        (item as any).stock_category_id ??
        (item as any).stockCategoryId;

      const rawCatName =
        (item as any).categoryName ??
        (item as any).category_name ??
        (item as any).category;

      const catIdStr = rawCatId !== undefined && rawCatId !== null && rawCatId !== "" ? String(rawCatId) : null;
      const catNameStr = rawCatName ? String(rawCatName).trim().toLowerCase() : null;

      const isSelectedInVoucher = (addedQtyMap.get(String(item.id)) || 0) > 0;

      let matchedGroup = null;

      // Try matching by ID first
      if (catIdStr && map.has(catIdStr)) {
        matchedGroup = map.get(catIdStr);
      }
      // Try matching by Name
      else if (catNameStr) {
        for (const catObj of map.values()) {
          if (catObj.name.trim().toLowerCase() === catNameStr) {
            matchedGroup = catObj;
            break;
          }
        }
      }
      // Try matching by ID matching category name in master map
      else if (catIdStr) {
        for (const catObj of map.values()) {
          if (catObj.name.trim().toLowerCase() === catIdStr.toLowerCase()) {
            matchedGroup = catObj;
            break;
          }
        }
      }

      if (matchedGroup) {
        matchedGroup.items.push(item);
        if (isSelectedInVoucher) matchedGroup.selectedCount += 1;
      } else if (catIdStr || rawCatName) {
        const fallbackId = catIdStr || `cat_${rawCatName}`;

        // Find if catIdStr matches any category name in effectiveCategories
        const matchedMasterCat = effectiveCategories.find(
          (c) => String(c.id) === catIdStr || c.name.toLowerCase() === (rawCatName || "").toLowerCase()
        );

        const fallbackName = matchedMasterCat
          ? matchedMasterCat.name
          : (rawCatName || (catIdStr && !catIdStr.startsWith("SC-") ? catIdStr : "Other Category"));

        if (map.has(fallbackId)) {
          matchedGroup = map.get(fallbackId)!;
          matchedGroup.items.push(item);
          if (isSelectedInVoucher) matchedGroup.selectedCount += 1;
        } else {
          const newGroup = {
            id: fallbackId,
            name: fallbackName,
            parent: matchedMasterCat?.parent || "",
            description: matchedMasterCat?.description || "",
            items: [item],
            selectedCount: isSelectedInVoucher ? 1 : 0,
          };
          map.set(fallbackId, newGroup);
        }
      } else {
        uncategorizedItems.push(item);
      }
    });

    const list: { id: string; name: string; parent?: string; description?: string; items: StockItem[]; selectedCount: number }[] = [];

    map.forEach((val) => {
      list.push(val);
    });

    if (uncategorizedItems.length > 0) {
      let uncatSelected = 0;
      uncategorizedItems.forEach((item) => {
        if ((addedQtyMap.get(String(item.id)) || 0) > 0) uncatSelected += 1;
      });
      list.push({
        id: "uncategorized",
        name: "General / Uncategorized",
        parent: "",
        description: "Items without an assigned stock category",
        items: uncategorizedItems,
        selectedCount: uncatSelected,
      });
    }

    return list;
  }, [effectiveCategories, stockItems, addedQtyMap]);

  // Filter items to display based on selected category
  const activeItemsToDisplay = useMemo(() => {
    if (selectedCategoryId === null) return [];
    if (selectedCategoryId === "all") return stockItems;
    const group = categoryGroups.find((g) => g.id === selectedCategoryId);
    return group ? group.items : stockItems;
  }, [selectedCategoryId, categoryGroups, stockItems]);

  const activeCategoryName = useMemo(() => {
    if (selectedCategoryId === "all") return "All Categories";
    const group = categoryGroups.find((g) => g.id === selectedCategoryId);
    return group ? group.name : "Stock Items";
  }, [selectedCategoryId, categoryGroups]);

  const totalVoucherSelectedCount = useMemo(() => {
    return Array.from(addedQtyMap.values()).filter((q) => q > 0).length;
  }, [addedQtyMap]);

  return (
    <div
      className={`p-4 md:p-5 mb-6 rounded-2xl border ${
        isDark
          ? "bg-gray-800/90 border-purple-900/50 shadow-lg shadow-purple-950/20"
          : "bg-gradient-to-br from-purple-50/50 via-white to-indigo-50/30 border-purple-200/80 shadow-md shadow-purple-100"
      }`}
    >
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-600 text-white shadow-md">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-base md:text-lg tracking-tight">
                Rubic Quick Sales Selection
              </h2>
              <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Category Wise
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {selectedCategoryId === null
                ? "Select a Stock Category below to view & add items to your voucher."
                : `Showing items in category: ${activeCategoryName}`}
            </p>
          </div>
        </div>

        {/* Right Action Bar */}
        <div className="flex items-center gap-2">
          {selectedPartyName && (
            <div
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                isDark
                  ? "bg-gray-700 border-gray-600 text-purple-300"
                  : "bg-purple-50 border-purple-200 text-purple-800"
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 text-purple-500" />
              <span>Party: {selectedPartyName}</span>
            </div>
          )}

          <button
            type="button"
            onClick={onExitRubicMode}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1 border ${
              isDark
                ? "bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600"
                : "bg-white hover:bg-gray-100 text-gray-700 border-gray-300 shadow-sm"
            }`}
            title="Return to standard header form"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Standard Form</span>
          </button>
        </div>
      </div>

      {/* ===================================================================
          MODE 1: CATEGORY CARDS VIEW (when selectedCategoryId === null)
         =================================================================== */}
      {selectedCategoryId === null ? (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-3 px-1">
            <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Folder className="w-4 h-4 text-purple-600" />
              Stock Categories ({categoryGroups.length} Categories Available)
            </span>
            {totalVoucherSelectedCount > 0 && (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                {totalVoucherSelectedCount} item(s) selected in voucher
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-2xl border animate-pulse h-24 ${
                    isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
                  }`}
                />
              ))}
            </div>
          ) : categoryGroups.length === 0 ? (
            /* Empty State */
            <div className="text-center py-8 px-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl">
              <Package className="w-8 h-8 mx-auto mb-2 text-gray-400 opacity-60" />
              <p className="font-semibold text-xs text-gray-700 dark:text-gray-300">
                No Stock Categories found
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Create stock categories under Master Inventory &gt; Stock Categories first.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[450px] overflow-y-auto pt-1 pb-1 px-1">


              {/* Stock Category Master Cards */}
              {categoryGroups.map((cat) => (
                <RubicSalesCategoryCard
                  key={cat.id}
                  id={cat.id}
                  name={cat.name}
                  parent={cat.parent}
                  description={cat.description}
                  itemCount={cat.items.length}
                  selectedVoucherCount={cat.selectedCount}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  theme={theme}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ===================================================================
           MODE 2: ITEMS GRID VIEW FOR SELECTED CATEGORY
           =================================================================== */
        <div>
          {/* Top Bar: Back Button & Category Title */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <button
              type="button"
              onClick={() => setSelectedCategoryId(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border shadow-2xs ${
                isDark
                  ? "bg-purple-950/60 text-purple-300 border-purple-800 hover:bg-purple-900/80"
                  : "bg-purple-100/80 text-purple-800 border-purple-300 hover:bg-purple-200/80"
              }`}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>&larr; Back to Categories</span>
            </button>

            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <span>Selected Category:</span>
              <span className="text-purple-600 dark:text-purple-400 font-extrabold">
                {activeCategoryName}
              </span>
              <span className="text-[10px] bg-gray-200 dark:bg-gray-700 px-1.5 py-0.2 rounded-full font-bold">
                Showing {activeItemsToDisplay.length} items
              </span>
            </div>
          </div>

          {/* Quick Category Switching Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCategoryId("all")}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border ${
                selectedCategoryId === "all"
                  ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                  : isDark
                  ? "bg-gray-800 text-gray-300 border-gray-700 hover:border-purple-500"
                  : "bg-white text-gray-700 border-gray-300 hover:border-purple-400"
              }`}
            >
              All ({stockItems.length})
            </button>

            {categoryGroups.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border flex items-center gap-1 ${
                  selectedCategoryId === cat.id
                    ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                    : isDark
                    ? "bg-gray-800 text-gray-300 border-gray-700 hover:border-purple-500"
                    : "bg-white text-gray-700 border-gray-300 hover:border-purple-400"
                }`}
              >
                <span>{cat.name}</span>
                <span className="text-[9px] opacity-80">({cat.items.length})</span>
                {cat.selectedCount > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                )}
              </button>
            ))}
          </div>

          {/* Items Grid */}
          {activeItemsToDisplay.length === 0 ? (
            <div className="text-center py-8 px-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl">
              <Package className="w-8 h-8 mx-auto mb-2 text-gray-400 opacity-60" />
              <p className="font-semibold text-xs text-gray-700 dark:text-gray-300">
                No items available in this category
              </p>
              <button
                type="button"
                onClick={() => setSelectedCategoryId(null)}
                className="mt-2.5 px-3 py-1 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors"
              >
                Back to Categories
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 2xl:grid-cols-10 gap-2 max-h-[400px] overflow-y-auto pt-1 pb-1 px-1">
              {activeItemsToDisplay.map((item) => {
                const details = getItemDetails(String(item.id));
                const addedQty = addedQtyMap.get(String(item.id)) || 0;
                return (
                  <RubicSalesItemCard
                    key={String(item.id)}
                    item={item}
                    itemDetails={details}
                    addedQty={addedQty}
                    onSelect={onSelectItem}
                    theme={theme}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
