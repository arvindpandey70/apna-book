const express = require('express');
const router = express.Router();
const pool = require('../db');

const normalizeStr = (v, maxLen = 500) => {
  if (v === undefined || v === null) return '';
  return String(v).trim().slice(0, maxLen);
};

const toYmdDate = (v) => {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate()
  ).padStart(2, '0')}`;
};

async function resolveIndirectIncomeGroupIds(companyId) {
  const [groupRows] = await pool.query(
    `SELECT id, name, parent FROM ledger_groups WHERE company_id = ? OR company_id = 0 OR id < 0`,
    [companyId]
  );

  const seedIds = new Set([-11]);
  const groupNameById = new Map([[-11, 'Indirect Income']]);

  for (const g of groupRows || []) {
    const gid = Number(g.id);
    const name = String(g.name || '').trim();
    const norm = name.toLowerCase();
    groupNameById.set(gid, name || groupNameById.get(gid) || 'Indirect Income');
    if (gid === -11 || Number(g.parent) === -11 || norm.includes('indirect income')) {
      seedIds.add(gid);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const g of groupRows || []) {
      const gid = Number(g.id);
      const pid = g.parent != null ? Number(g.parent) : null;
      if (pid !== null && seedIds.has(pid) && !seedIds.has(gid)) {
        seedIds.add(gid);
        changed = true;
      }
    }
  }

  return { groupIds: Array.from(seedIds), groupNameById };
}

/**
 * GET /api/books-vs-ais/indirect-income
 * Fetches Books entries posted to ledgers under Indirect Income (-11 & child groups).
 */
router.get('/api/books-vs-ais/indirect-income', async (req, res) => {
  try {
    const company_id = normalizeStr(req.query.company_id || req.query.companyId, 64);
    const owner_type = normalizeStr(req.query.owner_type || req.query.ownerType, 32) || null;
    const owner_id = normalizeStr(req.query.owner_id || req.query.ownerId, 64) || null;

    if (!company_id) {
      return res.status(400).json({ success: false, error: 'company_id is required' });
    }

    const { groupIds, groupNameById } = await resolveIndirectIncomeGroupIds(company_id);

    let ledgerSql = `
      SELECT id, name, group_id
      FROM ledgers
      WHERE company_id = ?
        AND group_id IN (?)
    `;
    const ledgerParams = [company_id, groupIds];

    if (owner_type && owner_id) {
      ledgerSql += ` AND ((owner_type = ? AND owner_id = ?) OR owner_id = 0)`;
      ledgerParams.push(owner_type, owner_id);
    }

    const [ledgers] = await pool.query(ledgerSql, ledgerParams);
    if (!ledgers || ledgers.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const ledgerMap = new Map();
    const ledgerIds = [];
    for (const l of ledgers) {
      const lid = Number(l.id);
      ledgerIds.push(lid);
      ledgerMap.set(lid, {
        name: String(l.name || ''),
        groupName: groupNameById.get(Number(l.group_id)) || 'Indirect Income',
      });
    }

    const results = [];

    // 1. Accounting vouchers (Journal, Receipt, Payment, Contra)
    let vmSql = `
      SELECT
        ve.id AS entryId,
        ve.voucher_id AS voucherId,
        ve.ledger_id AS ledgerId,
        ve.ledger_name AS entryLedgerName,
        ve.amount,
        ve.entry_type AS entryType,
        ve.narration AS entryNarration,
        vm.voucher_type AS voucherType,
        vm.voucher_number AS voucherNumber,
        DATE_FORMAT(vm.date, '%Y-%m-%d') AS date,
        vm.reference_no AS referenceNo,
        vm.narration AS voucherNarration
      FROM voucher_entries ve
      INNER JOIN voucher_main vm ON vm.id = ve.voucher_id
      WHERE ve.ledger_id IN (?)
        AND vm.company_id = ?
        AND LOWER(TRIM(vm.voucher_type)) IN ('journal', 'receipt', 'payment', 'contra')
        AND (ve.voucher_type IS NULL OR LOWER(TRIM(ve.voucher_type)) IN ('accounting', 'journal', 'contra', 'receipt', 'payment', ''))
    `;
    const vmParams = [ledgerIds, company_id];
    if (owner_type && owner_id) {
      vmSql += ` AND vm.owner_type = ? AND vm.owner_id = ?`;
      vmParams.push(owner_type, owner_id);
    }
    vmSql += ` ORDER BY vm.date DESC, vm.id DESC`;

    const [vmRows] = await pool.query(vmSql, vmParams);
    const vmIds = Array.from(new Set((vmRows || []).map((r) => r.voucherId).filter(Boolean)));
    const linesByVm = new Map();

    if (vmIds.length > 0) {
      const [allLines] = await pool.query(
        `SELECT ve.id AS entryId, ve.voucher_id AS voucherId, COALESCE(l.name, ve.ledger_name) AS ledgerName, ve.entry_type AS entryType
         FROM voucher_entries ve
         LEFT JOIN ledgers l ON l.id = ve.ledger_id
         WHERE ve.voucher_id IN (?)`,
        [vmIds]
      );
      for (const line of allLines || []) {
        if (!linesByVm.has(line.voucherId)) linesByVm.set(line.voucherId, []);
        linesByVm.get(line.voucherId).push(line);
      }
    }

    for (const r of vmRows || []) {
      const entryType = String(r.entryType || 'credit').toLowerCase();
      const absAmt = Math.abs(Number(r.amount) || 0);
      const info = ledgerMap.get(Number(r.ledgerId));
      const allLines = linesByVm.get(r.voucherId) || [];
      const oppositeNames = Array.from(
        new Set(
          allLines
            .filter((l) => l.entryId !== r.entryId && String(l.entryType || '').toLowerCase() !== entryType)
            .map((l) => String(l.ledgerName || '').trim())
            .filter(Boolean)
        )
      );

      results.push({
        id: `vm-${r.entryId}`,
        voucherId: String(r.voucherId),
        sourceVoucherType: String(r.voucherType || 'journal').toLowerCase(),
        voucherNumber: String(r.voucherNumber || '-'),
        date: toYmdDate(r.date),
        ledgerId: String(r.ledgerId),
        ledgerName: info?.name || r.entryLedgerName || 'Indirect Income',
        groupName: info?.groupName || 'Indirect Income',
        oppositeLedgerName: oppositeNames.join(', '),
        entryType,
        amount: absAmt,
        signedAmount: entryType === 'credit' ? absAmt : -absAmt,
        narration: String(r.entryNarration || r.voucherNarration || r.referenceNo || ''),
      });
    }

    // 2. Sales vouchers (Accounting mode)
    let svAccSql = `
      SELECT
        ve.id AS entryId,
        sv.id AS voucherId,
        ve.ledger_id AS ledgerId,
        ve.amount,
        ve.entry_type AS entryType,
        ve.narration AS entryNarration,
        sv.number AS voucherNumber,
        DATE_FORMAT(sv.date, '%Y-%m-%d') AS date,
        lp.name AS partyName
      FROM voucher_entries ve
      INNER JOIN sales_vouchers sv ON sv.id = ve.voucher_id
      LEFT JOIN ledgers lp ON lp.id = sv.partyId
      WHERE ve.ledger_id IN (?)
        AND sv.company_id = ?
        AND sv.mode = 'accounting-invoice'
    `;
    const svAccParams = [ledgerIds, company_id];
    if (owner_type && owner_id) {
      svAccSql += ` AND sv.owner_type = ? AND sv.owner_id = ?`;
      svAccParams.push(owner_type, owner_id);
    }
    const [svAccRows] = await pool.query(svAccSql, svAccParams);
    for (const r of svAccRows || []) {
      const entryType = String(r.entryType || 'credit').toLowerCase();
      const absAmt = Math.abs(Number(r.amount) || 0);
      const info = ledgerMap.get(Number(r.ledgerId));
      results.push({
        id: `sv-acc-${r.entryId}`,
        voucherId: String(r.voucherId),
        sourceVoucherType: 'sales',
        voucherNumber: String(r.voucherNumber || '-'),
        date: toYmdDate(r.date),
        ledgerId: String(r.ledgerId),
        ledgerName: info?.name || 'Indirect Income',
        groupName: info?.groupName || 'Indirect Income',
        oppositeLedgerName: String(r.partyName || ''),
        entryType,
        amount: absAmt,
        signedAmount: entryType === 'credit' ? absAmt : -absAmt,
        narration: String(r.entryNarration || ''),
      });
    }

    // 3. Purchase vouchers (Accounting mode)
    let pvAccSql = `
      SELECT
        ve.id AS entryId,
        pv.id AS voucherId,
        ve.ledger_id AS ledgerId,
        ve.amount,
        ve.entry_type AS entryType,
        ve.narration AS entryNarration,
        pv.number AS voucherNumber,
        DATE_FORMAT(pv.date, '%Y-%m-%d') AS date,
        lp.name AS partyName
      FROM voucher_entries ve
      INNER JOIN purchase_vouchers pv ON pv.id = ve.voucher_id
      LEFT JOIN ledgers lp ON lp.id = pv.partyId
      WHERE ve.ledger_id IN (?)
        AND pv.company_id = ?
        AND pv.mode = 'accounting-invoice'
    `;
    const pvAccParams = [ledgerIds, company_id];
    if (owner_type && owner_id) {
      pvAccSql += ` AND pv.owner_type = ? AND pv.owner_id = ?`;
      pvAccParams.push(owner_type, owner_id);
    }
    const [pvAccRows] = await pool.query(pvAccSql, pvAccParams);
    for (const r of pvAccRows || []) {
      const entryType = String(r.entryType || 'debit').toLowerCase();
      const absAmt = Math.abs(Number(r.amount) || 0);
      const info = ledgerMap.get(Number(r.ledgerId));
      results.push({
        id: `pv-acc-${r.entryId}`,
        voucherId: String(r.voucherId),
        sourceVoucherType: 'purchase',
        voucherNumber: String(r.voucherNumber || '-'),
        date: toYmdDate(r.date),
        ledgerId: String(r.ledgerId),
        ledgerName: info?.name || 'Indirect Income',
        groupName: info?.groupName || 'Indirect Income',
        oppositeLedgerName: String(r.partyName || ''),
        entryType,
        amount: absAmt,
        signedAmount: entryType === 'credit' ? absAmt : -absAmt,
        narration: String(r.entryNarration || ''),
      });
    }

    results.sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : b.voucherNumber.localeCompare(a.voucherNumber)));

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Error in GET /api/books-vs-ais/indirect-income:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
});

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
