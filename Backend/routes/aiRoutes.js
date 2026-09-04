const express = require('express');
const router = express.Router();
const multer = require('multer');
const { searchProductImage, isValidImageUrl } = require('../utils/imageSearch');

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// In-memory cache for product image queries (TTL: 1 hour)
const queryCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

function getCachedResult(key) {
  const cached = queryCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    queryCache.delete(key);
    return null;
  }
  return cached.data;
}

function setCachedResult(key, data) {
  queryCache.set(key, { timestamp: Date.now(), data });
}

router.post('/extract-bill', upload.single('billImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const base64Data = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Extract detailed bill data. Return ONLY a JSON object exactly structured as follows: { \"invoiceNumber\": string, \"date\": string (YYYY-MM-DD), \"supplierName\": string, \"supplierGst\": string, \"supplierAddress\": string, \"supplierState\": string, \"supplierPinCode\": string, \"supplierPan\": string, \"totalTaxableValue\": number, \"totalIgst\": number, \"totalCgst\": number, \"totalSgst\": number, \"tdsAmount\": number, \"discountAmount\": number, \"items\": [{ \"name\": string, \"hsnSac\": string, \"quantity\": number, \"unit\": string, \"rate\": number, \"taxableValue\": number, \"gstRate\": number, \"igstRate\": number, \"cgstRate\": number, \"sgstRate\": number, \"igstAmount\": number, \"cgstAmount\": number, \"sgstAmount\": number, \"discount\": number, \"purchaseLedgerHint\": string }] }. If any field is not found, use null or 0. Do not include markdown formatting like ```json." },
            { inlineData: { mimeType: mimeType, data: base64Data } }
          ]
        }]
      })
    });

    if (!response.ok) {
       console.error(`Gemini API Error: ${response.status}`);
       const errorData = await response.text();
       return res.status(response.status).json({ error: 'Failed to extract data from Gemini API', details: errorData });
    }

    const data = await response.json();
    const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!extractedText) {
      return res.status(500).json({ error: 'No extraction content returned from AI.' });
    }

    const cleanJson = extractedText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJson);

    return res.status(200).json(parsedData);

  } catch (error) {
    console.error('Extraction Error:', error);
    return res.status(500).json({ error: 'Internal server error during bill extraction.' });
  }
});

/**
 * POST /api/ai/product-image
 * Given an item name, uses Gemini to understand the product and searches for a high-quality product image.
 */
router.post('/product-image', async (req, res) => {
  try {
    const { itemName } = req.body || {};

    if (!itemName || typeof itemName !== 'string' || itemName.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing itemName (must be at least 3 characters).'
      });
    }

    const cleanItemName = itemName.trim();
    const cacheKey = cleanItemName.toLowerCase();

    // Check cache
    const cached = getCachedResult(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const prompt = `You are a product identification assistant for an inventory management system.

Given a user-entered inventory item name, identify the most likely real-world product.

Return ONLY valid JSON.

Required fields:
- productName
- normalizedName
- brand
- category
- searchQuery

Rules:
- Do not invent product information when it cannot be reasonably inferred.
- Preserve important size, weight, quantity, model number, variant, or packaging information.
- Make searchQuery optimized for finding the actual product/package image.
- Do not include markdown.
- Do not include explanations outside the JSON.

User item name:
${cleanItemName}`;

    let aiProduct = null;
    let searchQuery = cleanItemName;

    if (apiKey) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        if (response.ok) {
          const data = await response.json();
          const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

          if (extractedText) {
            const cleanJson = extractedText.replace(/```json/gi, '').replace(/```/g, '').trim();
            try {
              const parsed = JSON.parse(cleanJson);
              if (parsed && typeof parsed === 'object') {
                aiProduct = {
                  name: parsed.productName || cleanItemName,
                  normalizedName: parsed.normalizedName || cleanItemName,
                  brand: parsed.brand || '',
                  category: parsed.category || ''
                };
                if (parsed.searchQuery) {
                  searchQuery = parsed.searchQuery;
                }
              }
            } catch (e) {
              console.warn("Failed to parse Gemini response JSON:", e.message);
            }
          }
        } else {
          console.warn(`Gemini API returned status ${response.status}`);
        }
      } catch (aiErr) {
        console.warn("Gemini API call failed, falling back to direct image search:", aiErr.message);
      }
    } else {
      console.warn("GEMINI_API_KEY missing, using direct multi-tier image search fallback");
    }

    // Fallback product info if AI call failed
    if (!aiProduct) {
      aiProduct = {
        name: cleanItemName,
        normalizedName: cleanItemName,
        brand: '',
        category: ''
      };
    }

    // Search for product image using searchQuery (or fallback queries)
    let imageUrl = await searchProductImage(searchQuery);
    if (!imageUrl && searchQuery !== cleanItemName) {
      imageUrl = await searchProductImage(cleanItemName);
    }

    if (!imageUrl) {
      const result = {
        success: false,
        message: 'Product found, but no image could be found',
        product: aiProduct
      };
      // Short cache for missing images
      setCachedResult(cacheKey, result);
      return res.status(200).json(result);
    }

    const result = {
      success: true,
      product: aiProduct,
      image: {
        url: imageUrl,
        alt: `${aiProduct.name || cleanItemName} product`
      }
    };

    setCachedResult(cacheKey, result);
    return res.status(200).json(result);

  } catch (error) {
    console.error('Error in /api/ai/product-image:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during product image search'
    });
  }
});

module.exports = router;
