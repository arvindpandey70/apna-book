import React, { useState, useMemo } from "react";
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
} from "lucide-react";
import type { StockItem } from "../../../types";

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

      {/* Middle: Item Name (Fixed single-line with ellipsis ...) */}
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

export interface RubicSalesItemGridProps {
  stockItems: StockItem[];
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
  getItemDetails,
  entries,
  onSelectItem,
  onExitRubicMode,
  selectedPartyName,
  theme,
  isLoading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const isDark = theme === "dark";

  // Filter items by search
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return stockItems;
    const term = searchTerm.toLowerCase().trim();
    return stockItems.filter((item) => {
      const name = (item.name || "").toLowerCase();
      const hsn = (item.hsnCode || "").toLowerCase();
      const barcode = String((item as any).barcode || (item as any).bar_code || "").toLowerCase();
      return name.includes(term) || hsn.includes(term) || barcode.includes(term);
    });
  }, [stockItems, searchTerm]);

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

  return (
    <div
      className={`p-4 md:p-5 mb-6 rounded-2xl border ${
        isDark
          ? "bg-gray-800/90 border-purple-900/50 shadow-lg shadow-purple-950/20"
          : "bg-gradient-to-br from-purple-50/50 via-white to-indigo-50/30 border-purple-200/80 shadow-md shadow-purple-100"
      }`}
    >
      {/* Top Banner: Active Rubic Sales Mode Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700/80">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-purple-600 text-white shadow-md">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-base md:text-lg tracking-tight">
                Rubic Quick Sales Selection
              </h2>
              <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Active Mode
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Click any item card to quickly add it to your Sales Voucher table below.
            </p>
          </div>
        </div>

        {/* Right Action: Current Party Indicator & Switch Mode Button */}
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



      {/* Items Counter Bar */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-3 px-1">
        <span>
          Showing <strong className="text-purple-600 dark:text-purple-400">{filteredItems.length}</strong> of {stockItems.length} items
        </span>
        {entries.some((e) => e.itemId) && (
          <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <Check className="w-3.5 h-3.5" />
            {entries.filter((e) => e.itemId).length} item(s) selected in voucher
          </span>
        )}
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 2xl:grid-cols-10 gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className={`p-2 rounded-xl border animate-pulse flex flex-col items-center justify-between min-h-[110px] ${
                isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
              }`}
            >
              <div className="w-9 h-9 bg-gray-300 dark:bg-gray-700 rounded-lg my-1"></div>
              <div className="h-2.5 bg-gray-200 dark:bg-gray-700/60 rounded w-full mb-1"></div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700/80 rounded w-full mt-1"></div>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        /* Empty State */
        <div className="text-center py-8 px-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
          <Package className="w-8 h-8 mx-auto mb-2 text-gray-400 opacity-60" />
          <p className="font-semibold text-xs text-gray-700 dark:text-gray-300">
            {searchTerm ? `No items found matching "${searchTerm}"` : "No stock items available"}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {searchTerm ? "Try searching with a different keyword or HSN code" : "Add stock items from Master Inventory first."}
          </p>
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="mt-2.5 px-2.5 py-1 rounded text-[11px] font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors"
            >
              Clear Filter
            </button>
          )}
        </div>
      ) : (
        /* Super Compact Mini Product Tile Grid */
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 2xl:grid-cols-10 gap-2 max-h-[450px] overflow-y-auto pt-1.5 pb-1 px-1">
          {filteredItems.map((item) => {
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
  );
};
