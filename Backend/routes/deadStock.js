const express = require('express');
const router = express.Router();
const pool = require('../db');

function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 0;
  const diffTime = d2.getTime() - d1.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
}

function toDateStr(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const raw = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  }
  return d.toISOString().slice(0, 10);
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

function parseBatches(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * FIFO consume: pehle aayi layer pehle nikalti hai.
 * Sale sirf un layers se hoti hai jo sale date tak aa chuki hon.
 */
function consumeFifo(layers, outwardMoves) {
  const sortedOut = [...outwardMoves].sort((a, b) => {
    if (a.date === b.date) return a.seq - b.seq;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : 1;
  });

  for (const move of sortedOut) {
    let left = move.qty;
    if (left <= 0) continue;

    for (const layer of layers) {
      if (left <= 0) break;
      if (layer.remaining <= 0) continue;
      // Stock that arrived after this sale cannot be sold yet
      if (layer.date && move.date && layer.date > move.date) continue;

      const take = Math.min(layer.remaining, left);
      layer.remaining = parseFloat((layer.remaining - take).toFixed(6));
      left = parseFloat((left - take).toFixed(6));
    }
  }

  return layers.filter((l) => l.remaining > 0.000001);
}

// GET /api/dead-stock
router.get('/api/dead-stock', async (req, res) => {
  try {
    const {
      company_id,
      companyId: cId,
      owner_type,
      ownerType: oType,
      owner_id,
      ownerId: oId,
      asOnDate,
      toDate,
      thresholdDays = 90,
      stockGroupId,
      categoryId,
      godownId,
      search,
      filterType = 'all',
    } = req.query;

    const company = company_id || cId;
    const ownerT = owner_type || oType;
    const ownerI = owner_id || oId;

    if (!company) {
      return res.status(400).json({ success: false, error: 'company_id is required' });
    }

    const targetDate = asOnDate || toDate || new Date().toISOString().slice(0, 10);
    const threshold = parseInt(thresholdDays, 10) || 90;

    let itemsSql = `
      SELECT 
        si.id,
        si.name,
        si.unit,
        su.name AS unitName,
        su.symbol AS unitSymbol,
        si.categoryId,
        sc.name AS categoryName,
        sc.parent AS stockGroupId,
        sg.name AS stockGroupName,
        si.godown_id,
        g.name AS godownName,
        si.hsnCode,
        si.batches,
        si.createdAt
      FROM stock_items si
      LEFT JOIN stock_units su ON si.unit = su.id OR si.unit = su.name
      LEFT JOIN stock_categories sc ON si.categoryId = sc.id
      LEFT JOIN stock_groups sg ON sc.parent = sg.id
      LEFT JOIN godowns g ON si.godown_id = g.id
      WHERE si.company_id = ?
    `;
    const itemsParams = [company];

    if (ownerT && ownerI) {
      itemsSql += ` AND (si.owner_type = ? AND si.owner_id = ?)`;
      itemsParams.push(ownerT, ownerI);
    }
    if (stockGroupId) {
      itemsSql += ` AND sc.parent = ?`;
      itemsParams.push(stockGroupId);
    }
    if (categoryId) {
      itemsSql += ` AND si.categoryId = ?`;
      itemsParams.push(categoryId);
    }
    if (godownId) {
      itemsSql += ` AND si.godown_id = ?`;
      itemsParams.push(godownId);
    }
    if (search && search.trim()) {
      itemsSql += ` AND (si.name LIKE ? OR si.hsnCode LIKE ?)`;
      itemsParams.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    itemsSql += ` ORDER BY si.name ASC`;

    const [stockItems] = await pool.query(itemsSql, itemsParams);

    if (!stockItems || stockItems.length === 0) {
      return res.json({
        success: true,
        method: 'FIFO',
        summary: {
          totalDeadItems: 0,
          totalDeadQty: 0,
          totalBlockedValue: 0,
          criticalCount: 0,
          neverSoldCount: 0,
        },
        data: [],
      });
    }

    const nameCounts = {};
    for (const item of stockItems) {
      const key = normalizeName(item.name);
      nameCounts[key] = (nameCounts[key] || 0) + 1;
    }

    const godownNameById = new Map();
    try {
      let gSql = `SELECT id, name FROM godowns WHERE company_id = ?`;
      const gParams = [company];
      if (ownerT && ownerI) {
        gSql += ` AND owner_type = ? AND owner_id = ?`;
        gParams.push(ownerT, ownerI);
      }
      const [godownRows] = await pool.query(gSql, gParams);
      for (const g of godownRows || []) {
        godownNameById.set(Number(g.id), g.name);
      }
    } catch (e) {
      // ignore
    }

    let purchaseVouchers = [];
    try {
      let pvSql = `
        SELECT 
          pvi.itemId,
          pvi.quantity,
          pvi.rate,
          pvi.godownId,
          pv.date AS voucherDate,
          pv.number AS voucherNumber
        FROM purchase_voucher_items pvi
        JOIN purchase_vouchers pv ON pvi.voucherId = pv.id
        WHERE pv.company_id = ? AND pv.date <= ?
      `;
      const pvParams = [company, targetDate];
      if (ownerT && ownerI) {
        pvSql += ` AND pv.owner_type = ? AND pv.owner_id = ?`;
        pvParams.push(ownerT, ownerI);
      }
      pvSql += ` ORDER BY pv.date ASC, pvi.id ASC`;
      const [rows] = await pool.query(pvSql, pvParams);
      purchaseVouchers = rows || [];
    } catch (e) {
      purchaseVouchers = [];
    }

    let purchaseHistory = [];
    try {
      let phSql = `
        SELECT 
          itemName,
          purchaseQuantity AS quantity,
          rate,
          purchaseDate AS voucherDate,
          voucherNumber,
          godownId
        FROM purchase_history
        WHERE companyId = ? AND purchaseDate <= ?
      `;
      const phParams = [company, targetDate];
      if (ownerT && ownerI) {
        phSql += ` AND ownerType = ? AND ownerId = ?`;
        phParams.push(ownerT, ownerI);
      }
      phSql += ` ORDER BY purchaseDate ASC, id ASC`;
      const [ph] = await pool.query(phSql, phParams);
      purchaseHistory = ph || [];
    } catch (e) {
      purchaseHistory = [];
    }

    let salesVouchers = [];
    try {
      let svSql = `
        SELECT 
          svi.itemId,
          svi.quantity,
          svi.rate,
          svi.godownId,
          sv.date AS voucherDate,
          sv.number AS voucherNumber
        FROM sales_voucher_items svi
        JOIN sales_vouchers sv ON svi.voucherId = sv.id
        WHERE sv.company_id = ? AND sv.date <= ?
      `;
      const svParams = [company, targetDate];
      if (ownerT && ownerI) {
        svSql += ` AND sv.owner_type = ? AND sv.owner_id = ?`;
        svParams.push(ownerT, ownerI);
      }
      svSql += ` ORDER BY sv.date ASC, svi.id ASC`;
      const [rows] = await pool.query(svSql, svParams);
      salesVouchers = rows || [];
    } catch (e) {
      salesVouchers = [];
    }

    let saleHistory = [];
    try {
      let shSql = `
        SELECT 
          itemName,
          ABS(qtyChange) AS quantity,
          rate,
          movementDate AS voucherDate,
          voucherNumber,
          godownId
        FROM sale_history
        WHERE companyId = ? AND movementDate <= ?
      `;
      const shParams = [company, targetDate];
      if (ownerT && ownerI) {
        shSql += ` AND ownerType = ? AND ownerId = ?`;
        shParams.push(ownerT, ownerI);
      }
      shSql += ` ORDER BY movementDate ASC, id ASC`;
      const [sh] = await pool.query(shSql, shParams);
      saleHistory = sh || [];
    } catch (e) {
      saleHistory = [];
    }

    const purchasesByItemId = new Map();
    for (const row of purchaseVouchers) {
      const id = Number(row.itemId);
      if (!purchasesByItemId.has(id)) purchasesByItemId.set(id, []);
      purchasesByItemId.get(id).push(row);
    }

    const salesByItemId = new Map();
    for (const row of salesVouchers) {
      const id = Number(row.itemId);
      if (!salesByItemId.has(id)) salesByItemId.set(id, []);
      salesByItemId.get(id).push(row);
    }

    const purchasesByName = new Map();
    for (const row of purchaseHistory) {
      const key = normalizeName(row.itemName);
      if (!key) continue;
      if (!purchasesByName.has(key)) purchasesByName.set(key, []);
      purchasesByName.get(key).push(row);
    }

    const salesByName = new Map();
    for (const row of saleHistory) {
      const key = normalizeName(row.itemName);
      if (!key || key === '-') continue;
      if (!salesByName.has(key)) salesByName.set(key, []);
      salesByName.get(key).push(row);
    }

    const processedList = [];
    let layerSeq = 0;

    for (const item of stockItems) {
      const itemId = Number(item.id);
      const nameKey = normalizeName(item.name);
      const canUseNameHistory = nameCounts[nameKey] === 1;
      const itemCreated = toDateStr(item.createdAt) || targetDate;

      // --- Build FIFO inbound layers (oldest first) ---
      const layers = [];
      const importedPurchaseLayers = [];
      let openingQtyTotal = 0;

      const batches = parseBatches(item.batches);
      for (const b of batches) {
        const bQty = parseFloat(b.batchQuantity || b.openingBalance || 0) || 0;
        if (bQty <= 0) continue;
        const bRate = parseFloat(b.openingRate || b.batchRate || b.rate || 0) || 0;
        const bValue = parseFloat(b.openingValue || 0) || bQty * bRate;
        const rate = bRate > 0 ? bRate : bQty > 0 ? bValue / bQty : 0;
        const bDate =
          toDateStr(b.manufacturingDate || b.batchManufacturingDate) || itemCreated;

        if (b.mode === 'purchase') {
          importedPurchaseLayers.push({
            date: bDate,
            qty: bQty,
            remaining: bQty,
            rate,
            godownId: null,
            source: 'batch_purchase',
            seq: layerSeq++,
          });
        } else if (!b.mode || b.mode === 'opening') {
          openingQtyTotal += bQty;
          layers.push({
            date: bDate,
            qty: bQty,
            remaining: bQty,
            rate,
            godownId: item.godown_id ? Number(item.godown_id) : null,
            source: 'opening',
            seq: layerSeq++,
          });
        }
      }

      const pRows = purchasesByItemId.get(itemId) || [];
      const usedPurchaseVouchers = new Set();
      let inwardQty = 0;
      let lastPurchaseDate = null;
      let lastPurchaseRate = 0;

      for (const p of pRows) {
        const qty = parseFloat(p.quantity || 0) || 0;
        if (qty <= 0) continue;
        const rate = parseFloat(p.rate || 0) || 0;
        const pDate = toDateStr(p.voucherDate) || itemCreated;
        inwardQty += qty;
        if (p.voucherNumber) usedPurchaseVouchers.add(String(p.voucherNumber));
        if (!lastPurchaseDate || pDate > lastPurchaseDate) {
          lastPurchaseDate = pDate;
          if (rate > 0) lastPurchaseRate = rate;
        }
        layers.push({
          date: pDate,
          qty,
          remaining: qty,
          rate,
          godownId: p.godownId != null ? Number(p.godownId) : null,
          source: 'purchase_voucher',
          seq: layerSeq++,
        });
      }

      if (canUseNameHistory) {
        for (const p of purchasesByName.get(nameKey) || []) {
          const vNum = p.voucherNumber ? String(p.voucherNumber) : null;
          if (vNum && usedPurchaseVouchers.has(vNum)) continue;
          const qty = parseFloat(p.quantity || 0) || 0;
          if (qty <= 0) continue;
          const rate = parseFloat(p.rate || 0) || 0;
          const pDate = toDateStr(p.voucherDate) || itemCreated;
          inwardQty += qty;
          if (vNum) usedPurchaseVouchers.add(vNum);
          if (!lastPurchaseDate || pDate > lastPurchaseDate) {
            lastPurchaseDate = pDate;
            if (rate > 0) lastPurchaseRate = rate;
          }
          layers.push({
            date: pDate,
            qty,
            remaining: qty,
            rate,
            godownId: p.godownId != null ? Number(p.godownId) : null,
            source: 'purchase_history',
            seq: layerSeq++,
          });
        }
      }

      // Backfill purchase-mode batches only when no voucher/history inward
      if (inwardQty <= 0 && importedPurchaseLayers.length > 0) {
        for (const layer of importedPurchaseLayers) {
          inwardQty += layer.qty;
          if (layer.rate > 0) lastPurchaseRate = layer.rate;
          if (!lastPurchaseDate || (layer.date && layer.date > lastPurchaseDate)) {
            lastPurchaseDate = layer.date;
          }
          layers.push(layer);
        }
      }

      // Sort layers: date ASC, then seq (FIFO order)
      layers.sort((a, b) => {
        if (a.date === b.date) return a.seq - b.seq;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date < b.date ? -1 : 1;
      });

      // --- Outward moves for FIFO consume ---
      const outwardMoves = [];
      const sRows = salesByItemId.get(itemId) || [];
      const usedSaleVouchers = new Set();
      let outwardQty = 0;
      let lastSaleDate = null;
      let lastSaleRate = 0;
      let moveSeq = 0;

      for (const s of sRows) {
        const qty = Math.abs(parseFloat(s.quantity || 0) || 0);
        if (qty <= 0) continue;
        const rate = parseFloat(s.rate || 0) || 0;
        const sDate = toDateStr(s.voucherDate);
        outwardQty += qty;
        if (s.voucherNumber) usedSaleVouchers.add(String(s.voucherNumber));
        if (sDate && (!lastSaleDate || sDate > lastSaleDate)) {
          lastSaleDate = sDate;
          if (rate > 0) lastSaleRate = rate;
        }
        outwardMoves.push({ date: sDate, qty, seq: moveSeq++ });
      }

      if (canUseNameHistory) {
        for (const s of salesByName.get(nameKey) || []) {
          const vNum = s.voucherNumber ? String(s.voucherNumber) : null;
          if (vNum && usedSaleVouchers.has(vNum)) continue;
          const qty = Math.abs(parseFloat(s.quantity || 0) || 0);
          if (qty <= 0) continue;
          const rate = parseFloat(s.rate || 0) || 0;
          const sDate = toDateStr(s.voucherDate);
          outwardQty += qty;
          if (vNum) usedSaleVouchers.add(vNum);
          if (sDate && (!lastSaleDate || sDate > lastSaleDate)) {
            lastSaleDate = sDate;
            if (rate > 0) lastSaleRate = rate;
          }
          outwardMoves.push({ date: sDate, qty, seq: moveSeq++ });
        }
      }

      // FIFO: pehle aaya → pehle gaya
      const remainingLayers = consumeFifo(layers, outwardMoves);
      if (remainingLayers.length === 0) continue;

      const totalClosingQty = remainingLayers.reduce((sum, l) => sum + l.remaining, 0);
      if (totalClosingQty <= 0) continue;

      // Dead portion = remaining layers whose age >= threshold (FIFO age)
      const deadLayers = remainingLayers.filter(
        (l) => daysBetween(l.date || targetDate, targetDate) >= threshold
      );
      if (deadLayers.length === 0 && filterType === 'all') {
        // For status pills below, we still may need non-threshold filtering later
      }

      const neverSold = outwardQty <= 0;

      // Report qty/value based on FIFO-aged dead layers when threshold filter applies;
      // for slow/dead/critical pills use remaining layers matching that age band.
      const layerAge = (l) => daysBetween(l.date || targetDate, targetDate);

      let reportLayers = remainingLayers;
      if (filterType === 'all') {
        reportLayers = remainingLayers.filter((l) => layerAge(l) >= threshold);
      } else if (filterType === 'never_sold') {
        if (!neverSold) continue;
        reportLayers = remainingLayers.filter((l) => layerAge(l) >= threshold);
      } else if (filterType === 'critical') {
        reportLayers = remainingLayers.filter(
          (l) => layerAge(l) >= 180 || (neverSold && layerAge(l) >= 90)
        );
      } else if (filterType === 'dead') {
        reportLayers = remainingLayers.filter(
          (l) => layerAge(l) >= 90 && layerAge(l) < 180
        );
      } else if (filterType === 'slow') {
        reportLayers = remainingLayers.filter(
          (l) => layerAge(l) >= 30 && layerAge(l) < 90
        );
      } else {
        reportLayers = remainingLayers.filter((l) => layerAge(l) >= threshold);
      }

      if (reportLayers.length === 0) continue;

      const closingQty = reportLayers.reduce((sum, l) => sum + l.remaining, 0);
      const blockedValue = reportLayers.reduce(
        (sum, l) => sum + l.remaining * (l.rate > 0 ? l.rate : 0),
        0
      );
      let valuationRate = closingQty > 0 ? blockedValue / closingQty : 0;
      if (valuationRate <= 0) {
        valuationRate = lastPurchaseRate || lastSaleRate || 0;
      }

      // Inactive days = age of oldest remaining FIFO layer in report
      const oldestDate = reportLayers.reduce((min, l) => {
        if (!l.date) return min;
        if (!min || l.date < min) return l.date;
        return min;
      }, null);
      const daysInactive = daysBetween(oldestDate || targetDate, targetDate);

      let status = 'Moving / Active';
      let riskLevel = 'low';
      if (daysInactive >= 180 || (neverSold && daysInactive >= 90)) {
        status = 'Critical Dead';
        riskLevel = 'critical';
      } else if (daysInactive >= 90) {
        status = 'Dead Stock';
        riskLevel = 'high';
      } else if (daysInactive >= 30) {
        status = 'Slow Moving';
        riskLevel = 'medium';
      }

      // Godown from master → oldest remaining dead layer → vouchers
      let resolvedGodownId = item.godown_id ? Number(item.godown_id) : null;
      let resolvedGodownName = item.godownName || null;

      if (!resolvedGodownId) {
        for (const l of reportLayers) {
          if (l.godownId) {
            resolvedGodownId = l.godownId;
            break;
          }
        }
      }

      const pickGodownFromRows = (rows) => {
        if (!rows || rows.length === 0) return;
        for (let i = rows.length - 1; i >= 0; i--) {
          const gid = rows[i].godownId != null ? Number(rows[i].godownId) : NaN;
          if (!Number.isNaN(gid) && gid > 0) {
            resolvedGodownId = gid;
            return;
          }
        }
      };

      if (!resolvedGodownId) pickGodownFromRows(pRows);
      if (!resolvedGodownId && canUseNameHistory) {
        pickGodownFromRows(purchasesByName.get(nameKey) || []);
      }
      if (!resolvedGodownId) pickGodownFromRows(sRows);
      if (!resolvedGodownId && canUseNameHistory) {
        pickGodownFromRows(salesByName.get(nameKey) || []);
      }
      if (resolvedGodownId) {
        resolvedGodownName = godownNameById.get(resolvedGodownId) || null;
      }

      processedList.push({
        id: item.id,
        name: item.name,
        unit: item.unitSymbol || item.unitName || item.unit || '',
        hsnCode: item.hsnCode || '',
        stockGroupId: item.stockGroupId || null,
        stockGroupName: item.stockGroupName || '',
        categoryId: item.categoryId || null,
        categoryName: item.categoryName || '',
        godownId: resolvedGodownId,
        godownName: resolvedGodownName || '',
        openingQty: parseFloat(openingQtyTotal.toFixed(2)),
        inwardQty: parseFloat(inwardQty.toFixed(2)),
        outwardQty: parseFloat(outwardQty.toFixed(2)),
        closingQty: parseFloat(closingQty.toFixed(2)),
        valuationRate: parseFloat(valuationRate.toFixed(2)),
        blockedValue: parseFloat(blockedValue.toFixed(2)),
        lastSaleDate: lastSaleDate || null,
        lastPurchaseDate: lastPurchaseDate || null,
        daysInactive,
        neverSold,
        status,
        riskLevel,
        valuationMethod: 'FIFO',
        fifoLayers: reportLayers.map((l) => ({
          date: l.date,
          qty: parseFloat(l.remaining.toFixed(2)),
          rate: parseFloat((l.rate || 0).toFixed(2)),
          ageDays: layerAge(l),
          value: parseFloat((l.remaining * (l.rate || 0)).toFixed(2)),
        })),
      });
    }

    processedList.sort((a, b) => b.blockedValue - a.blockedValue);

    const totalDeadItems = processedList.length;
    const totalDeadQty = processedList.reduce((acc, curr) => acc + curr.closingQty, 0);
    const totalBlockedValue = processedList.reduce(
      (acc, curr) => acc + curr.blockedValue,
      0
    );
    const criticalCount = processedList.filter(
      (row) => row.riskLevel === 'critical'
    ).length;
    const neverSoldCount = processedList.filter((row) => row.neverSold).length;

    res.json({
      success: true,
      method: 'FIFO',
      asOnDate: targetDate,
      thresholdDays: threshold,
      summary: {
        totalDeadItems,
        totalDeadQty: parseFloat(totalDeadQty.toFixed(2)),
        totalBlockedValue: parseFloat(totalBlockedValue.toFixed(2)),
        criticalCount,
        neverSoldCount,
      },
      data: processedList,
    });
  } catch (error) {
    console.error('Error in /api/dead-stock:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
});

module.exports = router;
