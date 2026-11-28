const express = require('express');
const router = express.Router();
const pool = require('../db');

const toNum = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const str = String(v ?? '').trim();
  if (!str) return 0;
  const isParenNeg = /^\(.*\)$/.test(str);
  const cleaned = str.replace(/[(),₹\s]/g, '');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return isParenNeg ? -Math.abs(n) : n;
};

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const toYmdDate = (v) => {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mMmm = s.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3})[-\/\s](\d{4})$/);
  if (mMmm) {
    const mon = MONTHS[mMmm[2].toLowerCase()];
    if (mon) return `${mMmm[3]}-${mon}-${mMmm[1].padStart(2, '0')}`;
  }
  const mDmy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (mDmy) {
    return `${mDmy[3]}-${mDmy[2].padStart(2, '0')}-${mDmy[1].padStart(2, '0')}`;
  }
  return null;
};

const normalizeStr = (v, maxLen = 255) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, maxLen) : null;
};

const DEPOSIT_GROUP_NAMES = new Set([
  'deposite(assest)',
  'deposite(assets)',
  'deposites(assest)',
  'deposites(assets)',
  'deposit(assest)',
  'deposit(assets)',
  'deposits(assest)',
  'deposits(assets)',
  'deposit(asset)',
  'deposits(asset)',
  'deposite(asset)',
]);

const normalizeGroupKey = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '');

/**
 * Resolves all group IDs belonging to Current Assets -> Deposite(Assest) (-102)
 * including company copies and any nested custom sub-groups under it.
 */
async function resolveDepositAssetGroupIds(company_id, owner_type, owner_id) {
  const groupIds = new Set([-102]);
  const groupNameById = new Map([[-102, 'Deposite(Assest)']]);

  let groupSql = `
    SELECT id, name, parent
    FROM ledger_groups
    WHERE (company_id = ? AND ((owner_type = ? AND owner_id = ?) OR owner_id = 0))
       OR (company_id = 0 AND owner_type = 'admin')
  `;
  const groupParams = [company_id, owner_type || 'employee', owner_id || 0];

  if (!owner_type || !owner_id) {
    groupSql = `
      SELECT id, name, parent
      FROM ledger_groups
      WHERE company_id = ?
         OR (company_id = 0 AND owner_type = 'admin')
    `;
    groupParams.length = 1;
  }

  const [groupRows] = await pool.query(groupSql, groupParams);

  for (const g of groupRows || []) {
    const gid = Number(g.id);
    if (!Number.isFinite(gid)) continue;
    groupNameById.set(gid, g.name);
    if (DEPOSIT_GROUP_NAMES.has(normalizeGroupKey(g.name))) {
      groupIds.add(gid);
    }
  }

  // Recursively include any custom sub-groups created under Deposite(Assest)
  let added = true;
  while (added) {
    added = false;
    for (const g of groupRows || []) {
      const gid = Number(g.id);
      const pid = g.parent !== null && g.parent !== undefined ? Number(g.parent) : null;
      if (Number.isFinite(gid) && pid !== null && groupIds.has(pid) && !groupIds.has(gid)) {
        groupIds.add(gid);
        added = true;
      }
    }
  }

  return { groupIds: Array.from(groupIds), groupNameById };
}

/**
 * GET /api/books-vs-ats-168/books-tds (alias: /api/books-vs-26as/books-tds)
 * Books side: Ledgers under Current Assets -> Deposite(Assest) with entries
 * passed from Journal, Contra, Receipt, or Payment vouchers only (no Sales/Purchase).
 */
async function handleGetBooksTds(req, res) {
  try {
    const company_id = req.query.company_id || req.query.companyId;
    const owner_type = req.query.owner_type || req.query.ownerType;
    const owner_id = req.query.owner_id || req.query.ownerId;
    const fromDate = toYmdDate(req.query.from_date || req.query.fromDate);
    const toDate = toYmdDate(req.query.to_date || req.query.toDate);

    if (!company_id) {
      return res.status(400).json({ success: false, error: 'company_id is required' });
    }

    const { groupIds, groupNameById } = await resolveDepositAssetGroupIds(
      company_id,
      owner_type,
      owner_id
    );

    let ledgerSql = `
      SELECT id, name, group_id, tan_number, pan_number
      FROM ledgers
      WHERE company_id = ?
        AND group_id IN (?)
    `;
    const ledgerParams = [company_id, groupIds];

    if (owner_type && owner_id) {
      ledgerSql += ` AND ((owner_type = ? AND owner_id = ?) OR owner_id = 0)`;
      ledgerParams.push(owner_type, owner_id);
    }

    const [depositLedgers] = await pool.query(ledgerSql, ledgerParams);

    if (!depositLedgers || depositLedgers.length === 0) {
      return res.json({
        success: true,
        groupName: 'Deposite(Assest)',
        ledgersCount: 0,
        summary: {
          totalEntries: 0,
          totalAmountPaid: 0,
          totalTdsDeducted: 0,
        },
        data: [],
      });
    }

    const ledgerMap = new Map();
    const depositLedgerIds = [];
    for (const l of depositLedgers) {
      const lid = Number(l.id);
      depositLedgerIds.push(lid);
      ledgerMap.set(lid, {
        id: lid,
        name: l.name || '',
        groupId: Number(l.group_id),
        groupName: groupNameById.get(Number(l.group_id)) || 'Deposite(Assest)',
        tanNumber: String(l.tan_number || '').trim().toUpperCase(),
        panNumber: String(l.pan_number || '').trim().toUpperCase(),
      });
    }

    let entrySql = `
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
        AND LOWER(TRIM(vm.voucher_type)) IN ('journal', 'contra', 'receipt', 'payment')
        AND (ve.voucher_type IS NULL OR LOWER(TRIM(ve.voucher_type)) IN ('accounting', 'journal', 'contra', 'receipt', 'payment', ''))
    `;
    const entryParams = [depositLedgerIds, company_id];

    if (owner_type && owner_id) {
      entrySql += ` AND vm.owner_type = ? AND vm.owner_id = ?`;
      entryParams.push(owner_type, owner_id);
    }
    if (fromDate) {
      entrySql += ` AND vm.date >= ?`;
      entryParams.push(fromDate);
    }
    if (toDate) {
      entrySql += ` AND vm.date <= ?`;
      entryParams.push(toDate);
    }

    entrySql += ` ORDER BY vm.date ASC, vm.id ASC, ve.id ASC`;

    const [entryRows] = await pool.query(entrySql, entryParams);

    // Batch fetch all lines for matched vouchers so we can resolve opposite party / TAN without row duplication
    const voucherIds = Array.from(
      new Set((entryRows || []).map((r) => r.voucherId).filter(Boolean))
    );
    const linesByVoucher = new Map();

    if (voucherIds.length > 0) {
      const [allVoucherLines] = await pool.query(
        `
        SELECT
          ve.id AS entryId,
          ve.voucher_id AS voucherId,
          ve.ledger_id AS ledgerId,
          COALESCE(l.name, ve.ledger_name) AS ledgerName,
          ve.amount,
          ve.entry_type AS entryType,
          l.tan_number AS tanNumber,
          l.pan_number AS panNumber
        FROM voucher_entries ve
        LEFT JOIN ledgers l ON l.id = ve.ledger_id
        WHERE ve.voucher_id IN (?)
        ORDER BY ve.id ASC
        `,
        [voucherIds]
      );

      for (const line of allVoucherLines || []) {
        if (!linesByVoucher.has(line.voucherId)) {
          linesByVoucher.set(line.voucherId, []);
        }
        linesByVoucher.get(line.voucherId).push(line);
      }
    }

    const data = (entryRows || []).map((r) => {
      const ledgerInfo = ledgerMap.get(Number(r.ledgerId));
      const ledgerName = ledgerInfo?.name || r.entryLedgerName || '';
      const entryType = String(r.entryType || 'debit').toLowerCase();
      const absAmount = Math.abs(parseFloat(r.amount || 0) || 0);
      const signedAmount = entryType === 'credit' ? -absAmount : absAmount;

      const allLines = linesByVoucher.get(r.voucherId) || [];
      const otherLines = allLines.filter((l) => l.entryId !== r.entryId);
      const oppositeSideLines = otherLines.filter(
        (l) => String(l.entryType || '').toLowerCase() !== entryType
      );
      const candidateLines = oppositeSideLines.length > 0 ? oppositeSideLines : otherLines;

      // Prefer a candidate line that carries TAN or PAN (party/deductor ledger)
      const tanCandidate =
        candidateLines.find((l) => String(l.tanNumber || '').trim()) ||
        candidateLines.find((l) => String(l.panNumber || '').trim()) ||
        candidateLines[0];

      const oppositeLedgerName = Array.from(
        new Set(candidateLines.map((l) => String(l.ledgerName || '').trim()).filter(Boolean))
      ).join(', ');

      const oppositeAmount = Number(
        candidateLines.reduce((s, l) => s + Math.abs(parseFloat(l.amount || 0) || 0), 0).toFixed(2)
      );

      const deductorTan = String(
        tanCandidate?.tanNumber || ledgerInfo?.tanNumber || ''
      )
        .trim()
        .toUpperCase();
      const deductorPan = String(
        tanCandidate?.panNumber || ledgerInfo?.panNumber || ''
      )
        .trim()
        .toUpperCase();
      const deductorName = String(
        tanCandidate?.ledgerName || oppositeLedgerName || ledgerName
      ).trim();

      const textForSection = `${ledgerName} ${r.entryNarration || ''} ${r.voucherNarration || ''}`;
      const sectionMatch = textForSection.match(/\b(10\d{2}|194[A-Z]?|192[A-Z]?|193|195|196[A-Z]?)\b/i);

      return {
        id: r.entryId,
        voucherId: r.voucherId,
        date: r.date,
        voucherType: String(r.voucherType || '').toLowerCase(),
        voucherNumber: r.voucherNumber || '',
        referenceNo: r.referenceNo || '',
        narration: r.entryNarration || r.voucherNarration || '',
        ledgerId: r.ledgerId,
        ledgerName,
        groupName: ledgerInfo?.groupName || 'Deposite(Assest)',
        entryType,
        amount: absAmount,
        oppositeLedgerName,
        deductorName,
        deductorTan,
        deductorPan,
        section: sectionMatch ? sectionMatch[1].toUpperCase() : '',
        amountPaid: oppositeAmount,
        tdsDeducted: Number(signedAmount.toFixed(2)),
      };
    });

    res.json({
      success: true,
      groupName: 'Deposite(Assest)',
      ledgersCount: depositLedgers.length,
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
    console.error('Error in /api/books-vs-ats-168/books-tds:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
}

router.get('/api/books-vs-ats-168/books-tds', handleGetBooksTds);
router.get('/api/books-vs-26as/books-tds', handleGetBooksTds);

function mapIncomingAts168Row(row, taxYearFallback) {
  const deductorTan = normalizeStr(
    row['Deductor TAN'] ?? row.deductorTan ?? row.deductor_tan,
    20
  );
  const deductorPan = normalizeStr(
    row['Deductor PAN'] ?? row.deductorPan ?? row.deductor_pan,
    20
  );
  const deductorName =
    normalizeStr(
      row['Deductor Name'] ?? row.deductorName ?? row.deductor_name,
      255
    ) || 'Unknown Deductor';
  const sectionCode = normalizeStr(
    row.Section ?? row.section ?? row.sectionCode ?? row.section_code,
    32
  );
  const sectionDescription = normalizeStr(
    row['Section Description'] ?? row.sectionDescription ?? row.section_description,
    255
  );
  const transactionDate = toYmdDate(
    row['Transaction Date'] ?? row.transactionDate ?? row.transaction_date
  );
  const bookingDate = toYmdDate(
    row['Booking Date'] ?? row.bookingDate ?? row.booking_date
  );
  const bookingStatus = normalizeStr(
    row['Booking Status'] ?? row.bookingStatus ?? row.booking_status ?? row.Status ?? row.status,
    50
  );
  const remarks = normalizeStr(row.Remarks ?? row.remarks, 100);
  const partCode = normalizeStr(row.Part ?? row.partCode ?? row.part_code, 20) || 'PART-I';
  const slNo = normalizeStr(row['S.No.'] ?? row.slNo ?? row.sl_no, 20);

  const amountPaid = toNum(
    row['Total Amount Paid'] ?? row['Amount Paid'] ?? row.totalAmountPaid ?? row.amountPaid ?? row.amount_paid
  );
  const tdsDeducted = toNum(
    row['TDS Deducted'] ?? row.tdsDeducted ?? row.tds_deducted
  );
  const tdsDeposited = toNum(
    row['TDS Deposited'] ?? row.tdsDeposited ?? row.tds_deposited
  );

  return {
    partCode,
    slNo,
    deductorTan: deductorTan ? deductorTan.toUpperCase() : null,
    deductorPan: deductorPan ? deductorPan.toUpperCase() : null,
    deductorName,
    sectionCode,
    sectionDescription,
    transactionDate,
    bookingDate,
    bookingStatus,
    remarks,
    amountPaid: Number(amountPaid.toFixed(2)),
    tdsDeducted: Number(tdsDeducted.toFixed(2)),
    tdsDeposited: Number(tdsDeposited.toFixed(2)),
    taxYear: normalizeStr(row.taxYear ?? row.tax_year ?? taxYearFallback, 20),
  };
}

/**
 * POST /api/reports/import/ats-168 (alias: /api/reports/import/26as)
 * Persists ATS 168 metadata + line entries into MySQL.
 */
async function handleImportAts168(req, res) {
  let conn;
  try {
    const {
      company_id,
      companyId,
      owner_type,
      ownerType,
      owner_id,
      ownerId,
      metadata = {},
      rows = [],
      replaceExisting = true,
    } = req.body || {};

    const cid = normalizeStr(company_id ?? companyId, 64);
    if (!cid) {
      return res.status(400).json({ success: false, error: 'company_id is required' });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'rows array is required and cannot be empty' });
    }

    const oType = normalizeStr(owner_type ?? ownerType, 32);
    const oId = normalizeStr(owner_id ?? ownerId, 64);
    const taxYear = normalizeStr(metadata.taxYear ?? metadata.tax_year, 20);
    const pan = normalizeStr(metadata.pan, 20);
    const assesseeName = normalizeStr(metadata.assesseeName ?? metadata.assessee_name, 255);
    const sourceFileName = normalizeStr(metadata.fileName ?? metadata.sourceFileName, 255);
    const summaryTds = Number(toNum(metadata.summaryTds ?? metadata.tdsTotal).toFixed(2));
    const summaryTcs = Number(toNum(metadata.summaryTcs ?? metadata.tcsTotal).toFixed(2));

    const mappedRows = rows.map((r) => mapIncomingAts168Row(r, taxYear));

    const totalAmountPaid = Number(
      mappedRows.reduce((s, r) => s + r.amountPaid, 0).toFixed(2)
    );
    const totalTdsDeducted = Number(
      mappedRows.reduce((s, r) => s + r.tdsDeducted, 0).toFixed(2)
    );
    const totalTdsDeposited = Number(
      mappedRows.reduce((s, r) => s + r.tdsDeposited, 0).toFixed(2)
    );

    conn = await pool.getConnection();
    await conn.beginTransaction();

    if (replaceExisting) {
      if (taxYear) {
        await conn.query(
          `DELETE FROM ats_168_imports WHERE company_id = ? AND (tax_year = ? OR tax_year IS NULL)`,
          [cid, taxYear]
        );
      } else {
        await conn.query(
          `DELETE FROM ats_168_imports WHERE company_id = ?`,
          [cid]
        );
      }
    }

    const [importResult] = await conn.query(
      `INSERT INTO ats_168_imports (
        company_id, owner_type, owner_id, pan, assessee_name, tax_year,
        source_file_name, summary_tds, summary_tcs,
        total_amount_paid, total_tds_deducted, total_tds_deposited, row_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cid,
        oType,
        oId,
        pan ? pan.toUpperCase() : null,
        assesseeName,
        taxYear,
        sourceFileName,
        summaryTds,
        summaryTcs,
        totalAmountPaid,
        totalTdsDeducted,
        totalTdsDeposited,
        mappedRows.length,
      ]
    );

    const importId = importResult.insertId;

    const values = mappedRows.map((r) => [
      importId,
      cid,
      oType,
      oId,
      r.partCode,
      r.slNo,
      r.deductorTan,
      r.deductorPan,
      r.deductorName,
      r.sectionCode,
      r.sectionDescription,
      r.transactionDate,
      r.bookingDate,
      r.bookingStatus,
      r.remarks,
      r.amountPaid,
      r.tdsDeducted,
      r.tdsDeposited,
      r.taxYear,
    ]);

    await conn.query(
      `INSERT INTO ats_168_entries (
        import_id, company_id, owner_type, owner_id, part_code, sl_no,
        deductor_tan, deductor_pan, deductor_name, section_code, section_description,
        transaction_date, booking_date, booking_status, remarks,
        amount_paid, tds_deducted, tds_deposited, tax_year
      ) VALUES ?`,
      [values]
    );

    await conn.commit();

    res.json({
      success: true,
      importId,
      count: mappedRows.length,
      summary: {
        pan: pan ? pan.toUpperCase() : null,
        assesseeName,
        taxYear,
        summaryTds,
        summaryTcs,
        totalAmountPaid,
        totalTdsDeducted,
        totalTdsDeposited,
      },
      message: `Successfully saved ${mappedRows.length} ATS 168 entries to database`,
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (_) {}
    }
    console.error('Error in POST /api/reports/import/ats-168:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save ATS 168 entries',
    });
  } finally {
    if (conn) conn.release();
  }
}

router.post('/api/reports/import/ats-168', handleImportAts168);
router.post('/api/reports/import/26as', handleImportAts168);

/**
 * GET /api/books-vs-ats-168/entries (alias: /api/books-vs-26as/26as-entries)
 * Returns saved ATS 168 entries and latest import metadata for a company.
 */
async function handleGetAts168Entries(req, res) {
  try {
    const company_id = normalizeStr(req.query.company_id || req.query.companyId, 64);
    const fromDate = toYmdDate(req.query.from_date || req.query.fromDate);
    const toDate = toYmdDate(req.query.to_date || req.query.toDate);
    const taxYear = normalizeStr(req.query.tax_year || req.query.taxYear, 20);

    if (!company_id) {
      return res.status(400).json({ success: false, error: 'company_id is required' });
    }

    const [importRows] = await pool.query(
      `SELECT id, company_id, pan, assessee_name, tax_year, source_file_name,
              summary_tds, summary_tcs, total_amount_paid, total_tds_deducted,
              total_tds_deposited, row_count, imported_at
       FROM ats_168_imports
       WHERE company_id = ?
       ORDER BY imported_at DESC, id DESC
       LIMIT 1`,
      [company_id]
    );

    let sql = `
      SELECT
        id,
        import_id AS importId,
        part_code AS partCode,
        sl_no AS slNo,
        deductor_tan AS deductorTan,
        deductor_pan AS deductorPan,
        deductor_name AS deductorName,
        section_code AS section,
        section_description AS sectionDescription,
        DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transactionDate,
        DATE_FORMAT(booking_date, '%Y-%m-%d') AS bookingDate,
        booking_status AS bookingStatus,
        remarks,
        amount_paid AS amountPaid,
        tds_deducted AS tdsDeducted,
        tds_deposited AS tdsDeposited,
        tax_year AS taxYear
      FROM ats_168_entries
      WHERE company_id = ?
    `;
    const params = [company_id];

    if (taxYear) {
      sql += ` AND tax_year = ?`;
      params.push(taxYear);
    }
    if (fromDate) {
      sql += ` AND (transaction_date IS NULL OR transaction_date >= ?)`;
      params.push(fromDate);
    }
    if (toDate) {
      sql += ` AND (transaction_date IS NULL OR transaction_date <= ?)`;
      params.push(toDate);
    }

    sql += ` ORDER BY transaction_date ASC, id ASC`;

    const [rows] = await pool.query(sql, params);

    const data = (rows || []).map((r) => ({
      ...r,
      amountPaid: Number(r.amountPaid || 0),
      tdsDeducted: Number(r.tdsDeducted || 0),
      tdsDeposited: Number(r.tdsDeposited || 0),
    }));

    res.json({
      success: true,
      latestImport: importRows[0] || null,
      summary: {
        totalEntries: data.length,
        totalAmountPaid: Number(data.reduce((s, r) => s + r.amountPaid, 0).toFixed(2)),
        totalTdsDeducted: Number(data.reduce((s, r) => s + r.tdsDeducted, 0).toFixed(2)),
        totalTdsDeposited: Number(data.reduce((s, r) => s + r.tdsDeposited, 0).toFixed(2)),
      },
      data,
    });
  } catch (error) {
    console.error('Error in GET /api/books-vs-ats-168/entries:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
}

router.get('/api/books-vs-ats-168/entries', handleGetAts168Entries);
router.get('/api/books-vs-26as/26as-entries', handleGetAts168Entries);

/**
 * DELETE /api/books-vs-ats-168/entries (alias: /api/books-vs-26as/26as-entries)
 * Clears saved ATS 168 entries for a company (optionally filtered by tax_year).
 */
async function handleDeleteAts168Entries(req, res) {
  try {
    const company_id = normalizeStr(req.query.company_id || req.query.companyId, 64);
    const taxYear = normalizeStr(req.query.tax_year || req.query.taxYear, 20);

    if (!company_id) {
      return res.status(400).json({ success: false, error: 'company_id is required' });
    }

    let result;
    if (taxYear) {
      [result] = await pool.query(
        `DELETE FROM ats_168_imports WHERE company_id = ? AND tax_year = ?`,
        [company_id, taxYear]
      );
    } else {
      [result] = await pool.query(
        `DELETE FROM ats_168_imports WHERE company_id = ?`,
        [company_id]
      );
    }

    res.json({
      success: true,
      deletedImports: result.affectedRows || 0,
    });
  } catch (error) {
    console.error('Error in DELETE /api/books-vs-ats-168/entries:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  }
}

router.delete('/api/books-vs-ats-168/entries', handleDeleteAts168Entries);
router.delete('/api/books-vs-26as/26as-entries', handleDeleteAts168Entries);

module.exports = router;
