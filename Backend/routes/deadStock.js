const express = require('express');
const router = express.Router();
const pool = require('../db');

function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
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
      filterType = 'all', // 'all', 'dead', 'critical', 'slow', 'never_sold'
    } = req.query;

    const company = company_id || cId;
    const ownerT = owner_type || oType;
    const ownerI = owner_id || oId;

    if (!company) {
      return res.status(400).json({ success: false, error: 'company_id is required' });
    }

    const targetDate = asOnDate || toDate || new Date().toISOString().slice(0, 10);
    const threshold = parseInt(thresholdDays, 10) || 90;

    // 1. Fetch stock items with relations
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

    // 2. Fetch Purchase Vouchers
    const [purchaseVouchers] = await pool.query(
      `
      SELECT 
        pvi.itemId,
        pvi.quantity,
        pvi.rate,
        pv.date AS voucherDate,
        pv.number AS voucherNumber
      FROM purchase_voucher_items pvi
      JOIN purchase_vouchers pv ON pvi.voucherId = pv.id
      WHERE pv.company_id = ? AND pv.date <= ?
      ORDER BY pv.date ASC
      `,
      [company, targetDate]
    );

    // 3. Fetch Purchase History
    let purchaseHistory = [];
    try {
      const [ph] = await pool.query(
        `
        SELECT 
          itemName,
          purchaseQuantity AS quantity,
          rate,
          purchaseDate AS voucherDate,
          voucherNumber
        FROM purchase_history
        WHERE companyId = ? AND purchaseDate <= ?
        ORDER BY purchaseDate ASC
        `,
        [company, targetDate]
      );
      purchaseHistory = ph;
    } catch (e) {
      // Table might not exist or empty
    }

    // 4. Fetch Sales Vouchers
    const [salesVouchers] = await pool.query(
      `
      SELECT 
        svi.itemId,
        svi.quantity,
        svi.rate,
        sv.date AS voucherDate,
        sv.number AS voucherNumber
      FROM sales_voucher_items svi
      JOIN sales_vouchers sv ON svi.voucherId = sv.id
      WHERE sv.company_id = ? AND sv.date <= ?
      ORDER BY sv.date ASC
      `,
      [company, targetDate]
    );

    // 5. Fetch Sale History
    let saleHistory = [];
    try {
      const [sh] = await pool.query(
        `
        SELECT 
          itemName,
          ABS(qtyChange) AS quantity,
          rate,
          movementDate AS voucherDate,
          voucherNumber
        FROM sale_history
        WHERE companyId = ? AND movementDate <= ?
        ORDER BY movementDate ASC
        `,
        [company, targetDate]
      );
      saleHistory = sh;
    } catch (e) {
      // Table might not exist or empty
    }

    // 6. Process each item
    const processedList = [];

    for (const item of stockItems) {
      let openingQty = 0;
      let openingRate = 0;
      let openingDate = item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : null;

      // Extract opening from batches JSON if present
      if (item.batches) {
        try {
          const batches = typeof item.batches === 'string' ? JSON.parse(item.batches) : item.batches;
          if (Array.isArray(batches)) {
            batches.forEach((b) => {
              const bQty = parseFloat(b.batchQuantity || b.openingBalance || 0);
              openingQty += bQty;
              if (b.openingRate && parseFloat(b.openingRate) > 0) {
                openingRate = parseFloat(b.openingRate);
              }
              if (b.manufacturingDate && !openingDate) {
                openingDate = b.manufacturingDate;
              }
            });
          }
        } catch (e) {}
      }

      // Collect Inward transactions (PV + PH)
      const pRows = purchaseVouchers.filter((p) => p.itemId === item.id);
      const phRows = purchaseHistory.filter(
        (p) => p.itemName && p.itemName.trim().toLowerCase() === item.name.trim().toLowerCase()
      );

      let inwardQty = 0;
      let lastPurchaseDate = null;
      let lastPurchaseRate = 0;
      let totalPurchaseVal = 0;

      // Process PV
      pRows.forEach((p) => {
        const qty = parseFloat(p.quantity || 0);
        const rate = parseFloat(p.rate || 0);
        inwardQty += qty;
        totalPurchaseVal += qty * rate;
        if (!lastPurchaseDate || new Date(p.voucherDate) > new Date(lastPurchaseDate)) {
          lastPurchaseDate = new Date(p.voucherDate).toISOString().slice(0, 10);
          lastPurchaseRate = rate;
        }
      });

      // Process PH (avoid duplicate if voucher numbers match)
      const existingVouchers = new Set(pRows.map((p) => p.voucherNumber).filter(Boolean));
      phRows.forEach((p) => {
        if (!existingVouchers.has(p.voucherNumber)) {
          const qty = parseFloat(p.quantity || 0);
          const rate = parseFloat(p.rate || 0);
          inwardQty += qty;
          totalPurchaseVal += qty * rate;
          if (!lastPurchaseDate || new Date(p.voucherDate) > new Date(lastPurchaseDate)) {
            lastPurchaseDate = new Date(p.voucherDate).toISOString().slice(0, 10);
            lastPurchaseRate = rate;
          }
        }
      });

      // Collect Outward transactions (SV + SH)
      const sRows = salesVouchers.filter((s) => s.itemId === item.id);
      const shRows = saleHistory.filter(
        (s) => s.itemName && s.itemName.trim().toLowerCase() === item.name.trim().toLowerCase()
      );

      let outwardQty = 0;
      let lastSaleDate = null;
      let lastSaleRate = 0;

      // Process SV
      sRows.forEach((s) => {
        const qty = parseFloat(s.quantity || 0);
        const rate = parseFloat(s.rate || 0);
        outwardQty += qty;
        if (!lastSaleDate || new Date(s.voucherDate) > new Date(lastSaleDate)) {
          lastSaleDate = new Date(s.voucherDate).toISOString().slice(0, 10);
          lastSaleRate = rate;
        }
      });

      // Process SH
      const existingSalesVouchers = new Set(sRows.map((s) => s.voucherNumber).filter(Boolean));
      shRows.forEach((s) => {
        if (!existingSalesVouchers.has(s.voucherNumber)) {
          const qty = parseFloat(s.quantity || 0);
          const rate = parseFloat(s.rate || 0);
          outwardQty += qty;
          if (!lastSaleDate || new Date(s.voucherDate) > new Date(lastSaleDate)) {
            lastSaleDate = new Date(s.voucherDate).toISOString().slice(0, 10);
            lastSaleRate = rate;
          }
        }
      });

      // Closing Quantity
      const closingQty = openingQty + inwardQty - outwardQty;

      // Only consider items with positive closing stock
      if (closingQty <= 0) continue;

      // Determine Valuation Rate (Last Purchase Rate > Avg Purchase Rate > Opening Rate)
      let valuationRate = lastPurchaseRate;
      if (valuationRate <= 0 && inwardQty > 0) {
        valuationRate = totalPurchaseVal / inwardQty;
      }
      if (valuationRate <= 0) {
        valuationRate = openingRate;
      }
      if (valuationRate <= 0 && lastSaleRate > 0) {
        valuationRate = lastSaleRate; // Fallback to sale rate if no purchase rate exists
      }

      const blockedValue = closingQty * valuationRate;

      // Calculate days inactive
      let daysInactive = 0;
      let neverSold = false;

      if (lastSaleDate) {
        daysInactive = daysBetween(lastSaleDate, targetDate);
      } else {
        neverSold = true;
        // Inactive since purchase date, or opening date, or created date
        const baseDate = lastPurchaseDate || openingDate || targetDate;
        daysInactive = daysBetween(baseDate, targetDate);
      }

      // Determine Status Classification
      let status = 'Active';
      let riskLevel = 'low'; // low, medium, high, critical

      if (daysInactive >= 180 || (neverSold && daysInactive >= 90)) {
        status = 'Critical Dead';
        riskLevel = 'critical';
      } else if (daysInactive >= 90) {
        status = 'Dead Stock';
        riskLevel = 'high';
      } else if (daysInactive >= 30) {
        status = 'Slow Moving';
        riskLevel = 'medium';
      } else {
        status = 'Moving / Active';
        riskLevel = 'low';
      }

      // Filter by threshold or filterType
      let isDeadMatch = false;
      if (filterType === 'all') {
        isDeadMatch = daysInactive >= threshold || neverSold;
      } else if (filterType === 'never_sold') {
        isDeadMatch = neverSold;
      } else if (filterType === 'critical') {
        isDeadMatch = riskLevel === 'critical';
      } else if (filterType === 'dead') {
        isDeadMatch = riskLevel === 'high' || riskLevel === 'critical';
      } else if (filterType === 'slow') {
        isDeadMatch = riskLevel === 'medium';
      } else {
        isDeadMatch = daysInactive >= threshold;
      }

      if (isDeadMatch) {
        processedList.push({
          id: item.id,
          name: item.name,
          unit: item.unitSymbol || item.unitName || item.unit || 'Units',
          hsnCode: item.hsnCode || '-',
          stockGroupId: item.stockGroupId || null,
          stockGroupName: item.stockGroupName || 'General',
          categoryId: item.categoryId || null,
          categoryName: item.categoryName || '-',
          godownId: item.godown_id || null,
          godownName: item.godownName || 'Main Location',
          openingQty: parseFloat(openingQty.toFixed(2)),
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
        });
      }
    }

    // Sort by blocked value descending (largest blocked money first)
    processedList.sort((a, b) => b.blockedValue - a.blockedValue);

    // Summary calculation
    const totalDeadItems = processedList.length;
    const totalDeadQty = processedList.reduce((acc, curr) => acc + curr.closingQty, 0);
    const totalBlockedValue = processedList.reduce((acc, curr) => acc + curr.blockedValue, 0);
    const criticalCount = processedList.filter((item) => item.riskLevel === 'critical').length;
    const neverSoldCount = processedList.filter((item) => item.neverSold).length;

    res.json({
      success: true,
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
    res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

module.exports = router;
