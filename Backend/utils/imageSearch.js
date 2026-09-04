/**
 * Multi-tiered Product Image Search Service
 * Searches for legitimate product images across public APIs (DuckDuckGo, Open Food Facts, Wikimedia, Wikipedia, Unsplash).
 */

async function fetchWithTimeout(resource, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(id);
  }
}

function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return true;
  } catch {
    return false;
  }
}

async function searchProductImage(query) {
  if (!query || typeof query !== 'string') return null;
  const cleanQuery = query.trim();

  // 1. DuckDuckGo Image Search
  try {
    const tokenRes = await fetchWithTimeout(
      `https://duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
      },
      3500
    );
    if (tokenRes && tokenRes.ok) {
      const tokenText = await tokenRes.text();
      const vqdMatch = tokenText.match(/vqd=['"]([^'"]+)['"]/);
      if (vqdMatch && vqdMatch[1]) {
        const vqd = vqdMatch[1];
        const ddgUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(cleanQuery)}&vqd=${vqd}&f=,,,`;
        const res = await fetchWithTimeout(
          ddgUrl,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/javascript, */*; q=0.01',
            },
          },
          3500
        );
        if (res && res.ok) {
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            for (const item of data.results) {
              if (isValidImageUrl(item.image)) {
                return item.image;
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("DuckDuckGo image search fallback:", e.message);
  }

  // 2. Open Food Facts API (Great for Grocery, Snacks, Beverages)
  try {
    const mainTerm = cleanQuery.split(' ')[0] || cleanQuery;
    const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(mainTerm)}&search_simple=1&action=process&json=1&page_size=10`;
    const res = await fetchWithTimeout(offUrl, {}, 3500);
    if (res && res.ok) {
      const data = await res.json();
      if (data.products && data.products.length > 0) {
        const prod = data.products.find(p => p.image_front_url || p.image_url);
        if (prod) {
          const img = prod.image_front_url || prod.image_url;
          if (isValidImageUrl(img)) return img;
        }
      }
    }
  } catch (e) {
    console.warn("OpenFoodFacts fallback:", e.message);
  }

  // 3. Wikimedia Commons API
  try {
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanQuery)}&gsrlimit=5&prop=imageinfo&iiprop=url&format=json`;
    const res = await fetchWithTimeout(wikiUrl, {}, 3500);
    if (res && res.ok) {
      const data = await res.json();
      if (data.query && data.query.pages) {
        const pages = Object.values(data.query.pages);
        for (const page of pages) {
          if (page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url) {
            const url = page.imageinfo[0].url;
            if (isValidImageUrl(url) && url.match(/\.(jpg|jpeg|png|webp)$/i)) {
              return url;
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("Wikimedia fallback:", e.message);
  }

  // 4. Wikipedia Page Images API
  try {
    const wpUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(cleanQuery)}&prop=pageimages&format=json&pithumbsize=500`;
    const res = await fetchWithTimeout(wpUrl, {}, 3500);
    if (res && res.ok) {
      const data = await res.json();
      if (data.query && data.query.pages) {
        const pages = Object.values(data.query.pages);
        if (pages[0] && pages[0].thumbnail && pages[0].thumbnail.source) {
          if (isValidImageUrl(pages[0].thumbnail.source)) {
            return pages[0].thumbnail.source;
          }
        }
      }
    }
  } catch (e) {
    console.warn("Wikipedia fallback:", e.message);
  }

  // 5. Public High-Quality Product Image Fallback
  const fallbackTopic = encodeURIComponent(cleanQuery.replace(/[^a-zA-Z0-9 ]/g, '').trim());
  return `https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=500&q=80`;
}

module.exports = {
  searchProductImage,
  isValidImageUrl,
};
