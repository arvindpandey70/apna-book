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

/* =========================================================================
   COLOR PALETTES GENERATOR FOR VIBRANT COLORFUL UI
   ========================================================================= */
const COLOR_PALETTES = [
  {
    gradient: "from-rose-500 to-amber-500",
    lightBg: "bg-gradient-to-br from-rose-50/90 via-amber-50/40 to-white",
    darkBg: "bg-gradient-to-br from-rose-950/40 via-gray-800 to-gray-800",
    border: "border-rose-200 hover:border-rose-400 dark:border-rose-900/60",
    badge: "bg-gradient-to-r from-rose-500 to-amber-500 text-white",
    iconBg: "bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-rose-200",
    textAccent: "text-rose-600 dark:text-rose-400",
    itemAvatar: "bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-rose-200",
    activePill: "bg-gradient-to-r from-rose-500 to-amber-500 text-white border-rose-500 shadow-rose-200",
  },
  {
    gradient: "from-indigo-500 to-purple-600",
    lightBg: "bg-gradient-to-br from-indigo-50/90 via-purple-50/40 to-white",
    darkBg: "bg-gradient-to-br from-indigo-950/40 via-gray-800 to-gray-800",
    border: "border-indigo-200 hover:border-indigo-400 dark:border-indigo-900/60",
    badge: "bg-gradient-to-r from-indigo-500 to-purple-600 text-white",
    iconBg: "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-indigo-200",
    textAccent: "text-indigo-600 dark:text-indigo-400",
    itemAvatar: "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-indigo-200",
    activePill: "bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-indigo-500 shadow-indigo-200",
  },
  {
    gradient: "from-emerald-500 to-teal-600",
    lightBg: "bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white",
    darkBg: "bg-gradient-to-br from-emerald-950/40 via-gray-800 to-gray-800",
    border: "border-emerald-200 hover:border-emerald-400 dark:border-emerald-900/60",
    badge: "bg-gradient-to-r from-emerald-500 to-teal-600 text-white",
    iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-200",
    textAccent: "text-emerald-600 dark:text-emerald-400",
    itemAvatar: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-200",
    activePill: "bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-emerald-500 shadow-emerald-200",
  },
  {
    gradient: "from-amber-500 to-orange-600",
    lightBg: "bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-white",
    darkBg: "bg-gradient-to-br from-amber-950/40 via-gray-800 to-gray-800",
    border: "border-amber-200 hover:border-amber-400 dark:border-amber-900/60",
    badge: "bg-gradient-to-r from-amber-500 to-orange-600 text-white",
    iconBg: "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-amber-200",
    textAccent: "text-amber-600 dark:text-amber-400",
    itemAvatar: "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-amber-200",
    activePill: "bg-gradient-to-r from-amber-500 to-orange-600 text-white border-amber-500 shadow-amber-200",
  },
  {
    gradient: "from-cyan-500 to-blue-600",
    lightBg: "bg-gradient-to-br from-cyan-50/90 via-blue-50/40 to-white",
    darkBg: "bg-gradient-to-br from-cyan-950/40 via-gray-800 to-gray-800",
    border: "border-cyan-200 hover:border-cyan-400 dark:border-cyan-900/60",
    badge: "bg-gradient-to-r from-cyan-500 to-blue-600 text-white",
    iconBg: "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-cyan-200",
    textAccent: "text-cyan-600 dark:text-cyan-400",
    itemAvatar: "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-cyan-200",
    activePill: "bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-cyan-500 shadow-cyan-200",
  },
  {
    gradient: "from-fuchsia-500 to-pink-600",
    lightBg: "bg-gradient-to-br from-fuchsia-50/90 via-pink-50/40 to-white",
    darkBg: "bg-gradient-to-br from-fuchsia-950/40 via-gray-800 to-gray-800",
    border: "border-fuchsia-200 hover:border-fuchsia-400 dark:border-fuchsia-900/60",
    badge: "bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white",
    iconBg: "bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white shadow-fuchsia-200",
    textAccent: "text-fuchsia-600 dark:text-fuchsia-400",
    itemAvatar: "bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white shadow-fuchsia-200",
    activePill: "bg-gradient-to-r from-fuchsia-500 to-pink-600 text-white border-fuchsia-500 shadow-fuchsia-200",
  },
  {
    gradient: "from-violet-500 to-purple-600",
    lightBg: "bg-gradient-to-br from-violet-50/90 via-purple-50/40 to-white",
    darkBg: "bg-gradient-to-br from-violet-950/40 via-gray-800 to-gray-800",
    border: "border-violet-200 hover:border-violet-400 dark:border-violet-900/60",
    badge: "bg-gradient-to-r from-violet-500 to-purple-600 text-white",
    iconBg: "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-violet-200",
    textAccent: "text-violet-600 dark:text-violet-400",
    itemAvatar: "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-violet-200",
    activePill: "bg-gradient-to-r from-violet-500 to-purple-600 text-white border-violet-500 shadow-violet-200",
  },
];

const getColorPalette = (key: string) => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTES.length;
  return COLOR_PALETTES[index];
};

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
          ? "bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 text-white border-purple-300 ring-2 ring-purple-400/50 shadow-purple-500/30"
          : theme === "dark"
          ? "bg-gradient-to-r from-purple-900/90 via-indigo-900/90 to-pink-900/90 text-purple-100 border-purple-700/60 hover:border-purple-400"
          : "bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 text-white border-transparent hover:brightness-110 shadow-purple-200"
      }`}
      title={isActive ? "Deactivate Rubic Sales Mode" : "Activate Rubic Quick Item Selection"}
    >
      <Sparkles className={`w-4 h-4 ${isActive ? "animate-bounce text-yellow-300" : ""}`} />
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
   CATEGORY CARD COMPONENT (Vibrant Colorful Display)
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
  const palette = useMemo(() => getColorPalette(name || id), [name, id]);

  return (
    <div
      onClick={onClick}
      className={`group relative p-4 rounded-2xl cursor-pointer border transition-all duration-200 flex flex-col justify-between shadow-sm hover:shadow-xl hover:-translate-y-1 min-h-[115px] ${
        selectedVoucherCount > 0
          ? isDark
            ? "bg-purple-950/60 border-purple-400 ring-2 ring-purple-500/50 shadow-purple-900/40"
            : "bg-gradient-to-br from-purple-100 via-pink-50 to-white border-purple-400 ring-2 ring-purple-400/50 shadow-purple-200/80"
          : isDark
          ? `${palette.darkBg} ${palette.border}`
          : `${palette.lightBg} ${palette.border}`
      }`}
    >
      {/* Selected Items Badge */}
      {selectedVoucherCount > 0 && (
        <div className="absolute top-2.5 right-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-[9.5px] font-black px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 z-10">
          <Check className="w-3 h-3 stroke-[3]" />
          <span>{selectedVoucherCount} Selected</span>
        </div>
      )}

      <div className="flex items-start gap-3 mb-2">
        {/* Dynamic Vibrant Icon Container */}
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-md transition-transform group-hover:scale-110 mt-0.5 ${
            isAllCard
              ? "bg-gradient-to-br from-purple-600 via-indigo-600 to-pink-600 text-white shadow-purple-300"
              : palette.iconBg
          }`}
        >
          {isAllCard ? <LayoutGrid className="w-5 h-5" /> : <Folder className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          {/* Category Name */}
          <h3
            className={`font-black text-xs sm:text-sm leading-snug truncate transition-colors ${
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
            <p className={`text-[10.5px] font-bold truncate mt-0.5 ${palette.textAccent}`}>
              Parent: {parent}
            </p>
          )}

          {description && !parent && (
            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium truncate mt-0.5">
              {description}
            </p>
          )}

          <p className="text-[10.5px] text-gray-600 dark:text-gray-300 font-extrabold mt-1.5 flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${palette.iconBg}`}></span>
            <span>{itemCount} {itemCount === 1 ? "item" : "items"} available</span>
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10.5px] pt-2 border-t border-gray-200/80 dark:border-gray-700/60 mt-1">
        <span className={`font-bold group-hover:underline flex items-center gap-1 ${palette.textAccent}`}>
          Explore Category &rarr;
        </span>
        <span className="text-gray-400 dark:text-gray-500 font-mono text-[9.5px]">
          Stock Category
        </span>
      </div>
    </div>
  );
};

/* =========================================================================
   ITEM CARD COMPONENT (Vibrant Colorful Tile)
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
  const palette = useMemo(() => getColorPalette(item.name || String(item.id)), [item.name, item.id]);
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
      className={`group relative p-2.5 rounded-2xl cursor-pointer border transition-all duration-150 flex flex-col items-center text-center justify-between shadow-xs hover:shadow-lg min-h-[115px] ${
        clicked ? "scale-90" : "hover:-translate-y-1"
      } ${
        addedQty > 0
          ? isDark
            ? "bg-purple-950/60 border-purple-400 ring-2 ring-purple-500/50 shadow-purple-950/50"
            : "bg-gradient-to-br from-purple-100 via-pink-50 to-white border-purple-400 ring-2 ring-purple-400/60 shadow-purple-200"
          : isDark
          ? "bg-gray-800/90 border-gray-700/80 hover:border-purple-500/60 hover:bg-gray-800"
          : `${palette.lightBg} ${palette.border}`
      }`}
    >
      {/* Added Badge */}
      {addedQty > 0 && (
        <div className="absolute top-1.5 right-1.5 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 text-white text-[9.5px] font-black px-1.5 py-0.5 rounded-full shadow-md flex items-center gap-0.5 z-10">
          <Check className="w-2.5 h-2.5 stroke-[3]" />
          <span>{addedQty}</span>
        </div>
      )}

      {/* Top: Image or Colorful Avatar */}
      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center overflow-hidden my-1 shrink-0 transition-transform group-hover:scale-110 shadow-xs">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.name}
            className="w-full h-full object-cover rounded-xl"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        ) : (
          <div
            className={`w-full h-full rounded-xl flex items-center justify-center font-black text-sm border shadow-xs ${palette.itemAvatar}`}
          >
            {firstLetter}
          </div>
        )}
      </div>

      {/* Middle: Item Name */}
      <div className="w-full px-0.5 mb-1">
        <h3
          className={`font-black text-[11.5px] leading-tight truncate transition-colors ${
            isDark
              ? "text-gray-100 group-hover:text-purple-300"
              : "text-gray-900 group-hover:text-purple-700"
          }`}
          title={item.name}
        >
          {item.name}
        </h3>
      </div>

      {/* Bottom: Qty & Colorful Rate Pill */}
      <div className="w-full pt-1.5 border-t border-gray-200/80 dark:border-gray-700/60 flex items-center justify-between text-[10px] gap-1 px-0.5">
        <span className="text-gray-500 dark:text-gray-400 font-medium truncate">
          Qty:<strong className="text-gray-900 dark:text-gray-100 ml-0.5 font-bold">{addedQty > 0 ? addedQty : availableQty}</strong>
        </span>
        <span className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black px-1.5 py-0.3 rounded-md shadow-2xs text-[9.5px]">
          ₹{displayRate ? Number(displayRate).toFixed(0) : "0"}
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
      className={`p-4 md:p-5 mb-6 rounded-3xl border transition-all duration-300 ${
        isDark
          ? "bg-gradient-to-br from-gray-900 via-gray-850 to-purple-950/40 border-purple-900/60 shadow-2xl shadow-purple-950/40"
          : "bg-gradient-to-br from-purple-100/60 via-pink-50/40 to-indigo-100/50 border-purple-300 shadow-xl shadow-purple-200/60"
      }`}
    >
      {/* Colorful Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-purple-200/80 dark:border-purple-900/60">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 text-white shadow-lg shadow-purple-500/30">
            <Sparkles className="w-5 h-5 animate-pulse text-yellow-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-black text-base md:text-lg tracking-tight bg-gradient-to-r from-purple-700 via-indigo-700 to-pink-700 dark:from-purple-300 dark:via-pink-300 dark:to-indigo-300 bg-clip-text text-transparent">
                Rubic Quick Sales Selection
              </h2>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300 font-medium">
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
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold border ${
                isDark
                  ? "bg-purple-950/60 border-purple-800 text-purple-300"
                  : "bg-white/80 border-purple-300 text-purple-800 shadow-sm"
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 text-purple-600" />
              <span>Party: {selectedPartyName}</span>
            </div>
          )}

          <button
            type="button"
            onClick={onExitRubicMode}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all duration-150 flex items-center gap-1.5 border shadow-sm active:scale-95 ${
              isDark
                ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-600"
                : "bg-white hover:bg-purple-50 text-purple-800 border-purple-300 shadow-purple-100"
            }`}
            title="Return to standard header form"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-purple-600" />
            <span>Standard Form</span>
          </button>
        </div>
      </div>

      {/* ===================================================================
          MODE 1: CATEGORY CARDS VIEW (when selectedCategoryId === null)
         =================================================================== */}
      {selectedCategoryId === null ? (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300 mb-3 px-1">
            <span className="font-extrabold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <Folder className="w-4.5 h-4.5 text-purple-600" />
              Stock Categories ({categoryGroups.length} Categories Available)
            </span>
            {totalVoucherSelectedCount > 0 && (
              <span className="font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-300 flex items-center gap-1">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                {totalVoucherSelectedCount} item(s) selected in voucher
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-2xl border animate-pulse h-28 ${
                    isDark ? "bg-gray-800 border-gray-700" : "bg-white border-purple-200"
                  }`}
                />
              ))}
            </div>
          ) : categoryGroups.length === 0 ? (
            /* Empty State */
            <div className="text-center py-8 px-4 border-2 border-dashed border-purple-300 dark:border-purple-800 rounded-2xl">
              <Package className="w-8 h-8 mx-auto mb-2 text-purple-400 opacity-60" />
              <p className="font-bold text-xs text-gray-700 dark:text-gray-300">
                No Stock Categories found
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Create stock categories under Master Inventory &gt; Stock Categories first.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[460px] overflow-y-auto pt-1 pb-1 px-1">
              {/* Vibrant Stock Category Cards */}
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
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 border shadow-md active:scale-95 ${
                isDark
                  ? "bg-purple-950/80 text-purple-300 border-purple-700 hover:bg-purple-900"
                  : "bg-white text-purple-800 border-purple-300 hover:bg-purple-50 shadow-purple-100"
              }`}
            >
              <ArrowLeft className="w-3.5 h-3.5 text-purple-600" />
              <span>&larr; Back to Categories</span>
            </button>

            <div className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <span>Selected Category:</span>
              <span className="text-purple-700 dark:text-purple-300 font-black text-sm">
                {activeCategoryName}
              </span>
              <span className="text-[10.5px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-black">
                Showing {activeItemsToDisplay.length} items
              </span>
            </div>
          </div>

          {/* Quick Category Switching Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2.5 mb-3 scrollbar-none">
            {categoryGroups.map((cat) => {
              const palette = getColorPalette(cat.name || cat.id);
              const isSelected = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`px-3 py-1.2 rounded-full text-[11px] font-black whitespace-nowrap transition-all border flex items-center gap-1.5 shadow-xs ${
                    isSelected
                      ? palette.activePill
                      : isDark
                      ? "bg-gray-800 text-gray-300 border-gray-700 hover:border-purple-500"
                      : "bg-white text-gray-800 border-purple-200 hover:border-purple-400 hover:bg-purple-50/50"
                  }`}
                >
                  <span>{cat.name}</span>
                  <span className="text-[9.5px] opacity-90 px-1 py-0.2 rounded-full bg-black/10 dark:bg-white/10">
                    {cat.items.length}
                  </span>
                  {cat.selectedCount > 0 && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Items Grid */}
          {activeItemsToDisplay.length === 0 ? (
            <div className="text-center py-8 px-4 border-2 border-dashed border-purple-300 dark:border-purple-800 rounded-2xl">
              <Package className="w-8 h-8 mx-auto mb-2 text-purple-400 opacity-60" />
              <p className="font-extrabold text-xs text-gray-800 dark:text-gray-200">
                No items available in this category
              </p>
              <button
                type="button"
                onClick={() => setSelectedCategoryId(null)}
                className="mt-2.5 px-3.5 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:brightness-110 shadow-md transition-colors"
              >
                Back to Categories
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 2xl:grid-cols-10 gap-2.5 max-h-[420px] overflow-y-auto pt-1 pb-1 px-1">
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
