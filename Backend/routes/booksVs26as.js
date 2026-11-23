const express = require('express');
const router = express.Router();
const pool = require('../db');

/**
 * GET /api/books-vs-26as/books-tds
 * Books side: purchase vouchers where TDS was deducted.
 */
router.get('/api/books-vs-26as/books-tds', async (req, res) => {
  try {
    const company_id = req.query.company_id || req.query.companyId;
    const owner_type = req.query.owner_type || req.query.ownerType;
    const owner_id = req.query.owner_id || req.query.ownerId;
    const fromDate = req.query.from_date || req.query.fromDate || '';
    const toDate = req.query.to_date || req.query.toDate || '';

    if (!company_id) {
      return res.status(400).json({ success: false, error: 'company_id is required' });
    }

    let sql = `
      SELECT
        pv.id,
        pv.number AS voucherNumber,
        pv.date,
        pv.referenceNo,
        pv.subtotal,
        pv.total,
        pv.tdsTotal,
        pv.partyId,
        l.name AS partyName,
        l.tan_number AS partyTan,
        l.pan_number AS partyPan
      FROM purchase_vouchers pv
      LEFT JOIN ledgers l ON l.id = pv.partyId
      WHERE pv.company_id = ?
        AND ABS(IFNULL(pv.tdsTotal, 0)) > 0
    `;
    const params = [company_id];

    if (owner_type && owner_id) {
      sql += ` AND pv.owner_type = ? AND pv.owner_id = ?`;
      params.push(owner_type, owner_id);
    }
    if (fromDate) {
      sql += ` AND pv.date >= ?`;
      params.push(fromDate);
    }
    if (toDate) {
      sql += ` AND pv.date <= ?`;
      params.push(toDate);
    }

    sql += ` ORDER BY pv.date ASC, pv.id ASC`;

    const [rows] = await pool.query(sql, params);

    // Optional: resolve TDS section from item-level tdsRate ledger ids
    const ids = (rows || []).map((r) => r.id);
    const sectionByVoucher = {};
    if (ids.length > 0) {
      try {
        const [itemRows] = await pool.query(
          `
          SELECT pvi.voucherId, pvi.tdsRate, tds_l.name AS tdsLedgerName
          FROM purchase_voucher_items pvi
          LEFT JOIN ledgers tds_l
            ON tds_l.id = CAST(pvi.tdsRate AS UNSIGNED)
           AND CAST(pvi.tdsRate AS DECIMAL(15,2)) > 40
          WHERE pvi.voucherId IN (?)
          `,
          [ids]
        );
        for (const row of itemRows || []) {
          if (sectionByVoucher[row.voucherId]) continue;
          const ledgerName = String(row.tdsLedgerName || '');
          const sectionMatch = ledgerName.match(/194[A-Z]?|192[A-Z]?|193|195|196[A-Z]?/i);
          if (sectionMatch) {
            sectionByVoucher[row.voucherId] = sectionMatch[0].toUpperCase();
          }
        }
      } catch (e) {
        // non-fatal
      }
    }

    const data = (rows || []).map((r) => {
      const tds = Math.abs(parseFloat(r.tdsTotal || 0) || 0);
      const amountPaid = parseFloat(r.subtotal || r.total || 0) || 0;

      return {
        id: r.id,
        date: r.date,
        voucherNumber: r.voucherNumber || '',
        referenceNo: r.referenceNo || '',
        partyId: r.partyId,
        deductorName: r.partyName || '',
        deductorTan: String(r.partyTan || '')
          .trim()
          .toUpperCase(),
        deductorPan: String(r.partyPan || '')
          .trim()
          .toUpperCase(),
        section: sectionByVoucher[r.id] || '',
        amountPaid,
        tdsDeducted: tds,
      };
    });

    res.json({
      success: true,
      summary: {
        totalEntries: data.length,
        totalAmountPaid: parseFloat(
          data.reduce((s, r) => s + r.amountPaid, 0).toFixed(2)
        ),
        totalTdsDeducted: parseFloat(
          data.reduce((s, r) => s + r.tdsDeducted, 0).toFixed(2)
        ),
      },
      data,
    });
  } catch (error) {
    console.error('Error in /api/books-vs-26as/books-tds:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
});

module.exports = router;
