const express = require('express');
const router = express.Router();
const pool = require('../db');

const normalizeStr = (v, maxLen = 500) => {
  if (v === undefined || v === null) return '';
  return String(v).trim().slice(0, maxLen);
};

/**
 * GET /api/books-vs-ais/entries
 * Fetch all manual AIS entries for a company.
 */
router.get('/api/books-vs-ais/entries', async (req, res) => {
  try {
    const company_id = normalizeStr(req.query.company_id || req.query.companyId, 64);

    if (!company_id) {
      return res.status(400).json({ success: false, error: 'company_id is required' });
    }

    const [rows] = await pool.query(
      `SELECT id, company_id AS companyId, owner_type AS ownerType, owner_id AS ownerId,
              narration, amount, created_at AS createdAt
       FROM ais_manual_entries
       WHERE company_id = ?
       ORDER BY id DESC`,
      [company_id]
    );

    const data = (rows || []).map((r) => ({
      id: String(r.id),
      companyId: String(r.companyId),
      narration: String(r.narration || ''),
      amount: Number(r.amount || 0),
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    }));

    const totalAmount = Number(data.reduce((s, r) => s + r.amount, 0).toFixed(2));

    res.json({
      success: true,
      summary: {
        totalEntries: data.length,
        totalAmount,
      },
      data,
    });
  } catch (error) {
    console.error('Error in GET /api/books-vs-ais/entries:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
});

/**
 * POST /api/books-vs-ais/entries
 * Save a manual AIS entry (narration + amount).
 */
router.post('/api/books-vs-ais/entries', async (req, res) => {
  try {
    const company_id = normalizeStr(req.body?.company_id || req.body?.companyId, 64);
    const owner_type = normalizeStr(req.body?.owner_type || req.body?.ownerType, 32) || null;
    const owner_id = normalizeStr(req.body?.owner_id || req.body?.ownerId, 64) || null;
    const narration = normalizeStr(req.body?.narration, 500);
    const amount = Number(req.body?.amount);

    if (!company_id) {
      return res.status(400).json({ success: false, error: 'company_id is required' });
    }
    if (!narration) {
      return res.status(400).json({ success: false, error: 'Narration is required' });
    }
    if (!Number.isFinite(amount)) {
      return res.status(400).json({ success: false, error: 'Valid amount is required' });
    }

    const [result] = await pool.query(
      `INSERT INTO ais_manual_entries (company_id, owner_type, owner_id, narration, amount)
       VALUES (?, ?, ?, ?, ?)`,
      [company_id, owner_type, owner_id, narration, Number(amount.toFixed(2))]
    );

    const [rows] = await pool.query(
      `SELECT id, company_id AS companyId, narration, amount, created_at AS createdAt
       FROM ais_manual_entries
       WHERE id = ?`,
      [result.insertId]
    );

    const row = rows?.[0];
    res.status(201).json({
      success: true,
      data: row
        ? {
            id: String(row.id),
            companyId: String(row.companyId),
            narration: String(row.narration || ''),
            amount: Number(row.amount || 0),
            createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
          }
        : {
            id: String(result.insertId),
            companyId: company_id,
            narration,
            amount: Number(amount.toFixed(2)),
            createdAt: new Date().toISOString(),
          },
    });
  } catch (error) {
    console.error('Error in POST /api/books-vs-ais/entries:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
});

/**
 * DELETE /api/books-vs-ais/entries/:id
 * Delete a manual AIS entry by id.
 */
router.delete('/api/books-vs-ais/entries/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const company_id = normalizeStr(req.query.company_id || req.query.companyId, 64);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'Valid id is required' });
    }

    let result;
    if (company_id) {
      [result] = await pool.query(
        `DELETE FROM ais_manual_entries WHERE id = ? AND company_id = ?`,
        [id, company_id]
      );
    } else {
      [result] = await pool.query(`DELETE FROM ais_manual_entries WHERE id = ?`, [id]);
    }

    res.json({
      success: true,
      deleted: result.affectedRows || 0,
    });
  } catch (error) {
    console.error('Error in DELETE /api/books-vs-ais/entries/:id:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
});

module.exports = router;
