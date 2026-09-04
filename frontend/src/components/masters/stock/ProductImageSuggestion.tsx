import React, { useEffect, useState, useRef } from "react";
import { Sparkles, Check, RefreshCw, Trash2, Image as ImageIcon, AlertCircle } from "lucide-react";

interface ProductImageSuggestionProps {
  itemName: string;
  isEditMode?: boolean;
  currentImage?: string;
  onSelectImage: (imageUrl: string) => void;
  onRemoveImage?: () => void;
  theme?: string;
}

interface ProductInfo {
  name: string;
  normalizedName: string;
  brand: string;
  category: string;
}

interface ImageInfo {
  url: string;
  alt: string;
}

export const ProductImageSuggestion: React.FC<ProductImageSuggestionProps> = ({
  itemName,
  isEditMode = false,
  currentImage = "",
  onSelectImage,
  onRemoveImage,
  theme = "light",
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [suggestedProduct, setSuggestedProduct] = useState<ProductInfo | null>(null);
  const [suggestedImage, setSuggestedImage] = useState<ImageInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [usedSuggestedUrl, setUsedSuggestedUrl] = useState<string>("");

  const initialNameRef = useRef<string>(itemName);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const isDark = theme === "dark";

  const fetchProductImage = async (queryName: string) => {
    if (!queryName || queryName.trim().length < 3) {
      setLoading(false);
      setSuggestedProduct(null);
      setSuggestedImage(null);
      setErrorMsg(null);
      return;
    }

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setErrorMsg(null);

    try {
      const baseUrl = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${baseUrl}/api/ai/product-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemName: queryName }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Server status ${res.status}`);
      }

      const data = await res.json();

      if (controller.signal.aborted) return;

      if (data.success && data.image?.url) {
        setSuggestedProduct(data.product || null);
        setSuggestedImage(data.image);
        setErrorMsg(null);
      } else {
        setSuggestedProduct(data.product || null);
        setSuggestedImage(null);
        setErrorMsg(data.message || "Product found, but no image could be found.");
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        return; // Ignored aborted request
      }
      console.warn("AI Product Image Suggestion Error:", err);
      setSuggestedProduct(null);
      setSuggestedImage(null);
      setErrorMsg("AI product detection unavailable");
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    // If edit mode and item name hasn't changed from initial load, don't auto-fetch
    if (isEditMode && itemName === initialNameRef.current) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!itemName || itemName.trim().length < 3) {
      setLoading(false);
      setSuggestedProduct(null);
      setSuggestedImage(null);
      setErrorMsg(null);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchProductImage(itemName);
    }, 800); // 800ms debounce

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [itemName, isEditMode]);

  const handleUseImage = () => {
    if (suggestedImage?.url) {
      onSelectImage(suggestedImage.url);
      setUsedSuggestedUrl(suggestedImage.url);
    }
  };

  const handleManualTrigger = () => {
    if (itemName && itemName.trim().length >= 3) {
      fetchProductImage(itemName);
    }
  };

  const isImageCurrentlyUsed = currentImage && usedSuggestedUrl === currentImage;

  return (
    <div className={`p-4 rounded-lg border transition-all ${isDark ? "bg-gray-800 border-gray-700 text-gray-200" : "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 text-gray-800"} mb-4`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
          <span className="font-semibold text-sm">AI Product Assistant</span>
        </div>
        {!loading && (
          <button
            type="button"
            onClick={handleManualTrigger}
            disabled={!itemName || itemName.trim().length < 3}
            className={`text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors ${
              isDark ? "hover:bg-gray-700 text-gray-300" : "hover:bg-blue-100 text-blue-700"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title="Re-run AI Product Image Search"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Find Image
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-3 py-3 text-sm font-medium text-indigo-600 dark:text-indigo-400">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
          <span>Finding product image...</span>
        </div>
      )}

      {!loading && errorMsg && (
        <div className="flex items-center gap-2 py-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle size={14} />
          <span>{errorMsg}</span>
        </div>
      )}

      {!loading && suggestedImage && (
        <div className="mt-2 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className={`relative w-24 h-24 rounded-md border overflow-hidden flex-shrink-0 bg-white ${isDark ? "border-gray-600" : "border-gray-300"}`}>
            <img
              src={suggestedImage.url}
              alt={suggestedImage.alt || "Product Suggestion"}
              className="w-full h-full object-contain p-1"
              onError={() => setErrorMsg("Failed to load suggested product image")}
            />
          </div>

          <div className="flex-1 flex flex-col justify-between h-full space-y-2">
            <div>
              <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 uppercase tracking-wider">
                Detected Product
              </p>
              <p className="text-sm font-bold truncate">
                {suggestedProduct?.normalizedName || suggestedProduct?.name || itemName}
              </p>
              {(suggestedProduct?.brand || suggestedProduct?.category) && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {[suggestedProduct.brand, suggestedProduct.category].filter(Boolean).join(" • ")}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleUseImage}
                className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
                  isImageCurrentlyUsed
                    ? "bg-green-600 text-white cursor-default"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
              >
                {isImageCurrentlyUsed ? (
                  <>
                    <Check size={14} /> Applied
                  </>
                ) : (
                  <>
                    <ImageIcon size={14} /> Use Image
                  </>
                )}
              </button>

              {onRemoveImage && currentImage && (
                <button
                  type="button"
                  onClick={onRemoveImage}
                  className={`px-3 py-1.5 text-xs font-medium rounded border flex items-center gap-1 transition-colors ${
                    isDark ? "border-gray-600 hover:bg-gray-700 text-gray-300" : "border-gray-300 hover:bg-gray-100 text-gray-700"
                  }`}
                >
                  <Trash2 size={12} /> Remove Image
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductImageSuggestion;
