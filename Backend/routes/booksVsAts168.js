const express = require('express');
const router = express.Router();
const pool = require('../db');

let tablesEnsuredPromise = null;

async function ensureAts168Tables() {
  if (!tablesEnsuredPromise) {
    tablesEnsuredPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ats_168_imports (
          id INT AUTO_INCREMENT PRIMARY KEY,
          company_id VARCHAR(64) NOT NULL,
          owner_type VARCHAR(32) DEFAULT NULL,
          owner_id VARCHAR(64) DEFAULT NULL,
          pan VARCHAR(20) DEFAULT NULL,
          assessee_name VARCHAR(255) DEFAULT NULL,
          tax_year VARCHAR(20) DEFAULT NULL,
          source_file_name VARCHAR(255) DEFAULT NULL,
          summary_tds DECIMAL(15, 2) DEFAULT 0.00,
          summary_tcs DECIMAL(15, 2) DEFAULT 0.00,
          total_amount_paid DECIMAL(15, 2) DEFAULT 0.00,
          total_tds_deducted DECIMAL(15, 2) DEFAULT 0.00,
          total_tds_deposited DECIMAL(15, 2) DEFAULT 0.00,
          row_count INT DEFAULT 0,
          imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ats_168_imp_company_ty (company_id, tax_year)
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ats_168_entries (
          id INT AUTO_INCREMENT PRIMARY KEY,
          import_id INT NOT NULL,
          company_id VARCHAR(64) NOT NULL,
          owner_type VARCHAR(32) DEFAULT NULL,
          owner_id VARCHAR(64) DEFAULT NULL,
          part_code VARCHAR(20) DEFAULT 'PART-I',
          sl_no VARCHAR(20) DEFAULT NULL,
          deductor_tan VARCHAR(20) DEFAULT NULL,
          deductor_pan VARCHAR(20) DEFAULT NULL,
          deductor_name VARCHAR(255) NOT NULL,
          section_code VARCHAR(32) DEFAULT NULL,
          section_description VARCHAR(255) DEFAULT NULL,
          transaction_date DATE DEFAULT NULL,
          booking_date DATE DEFAULT NULL,
          booking_status VARCHAR(50) DEFAULT NULL,
          remarks VARCHAR(100) DEFAULT NULL,
          amount_paid DECIMAL(15, 2) DEFAULT 0.00,
          tds_deducted DECIMAL(15, 2) DEFAULT 0.00,
          tds_deposited DECIMAL(15, 2) DEFAULT 0.00,
          tax_year VARCHAR(20) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_ats_168_ent_company_date (company_id, transaction_date),
          INDEX idx_ats_168_ent_company_tan (company_id, deductor_tan),
          CONSTRAINT fk_ats_168_import_id
            FOREIGN KEY (import_id) REFERENCES ats_168_imports(id)
            ON DELETE CASCADE
        )
      `);
    })().catch((err) => {
      tablesEnsuredPromise = null;
      throw err;
    });
  }
  return tablesEnsuredPromise;
}

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

/**
 * GET /api/books-vs-ats-168/books-tds (alias: /api/books-vs-26as/books-tds)
 * Books side: purchase vouchers where TDS was deducted.
 */
async function handleGetBooksTds(req, res) {
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
          const sectionMatch = ledgerName.match(/194[A-Z]?|192[A-Z]?|193|195|196[A-Z]?|10\d{2}/i);
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
    await ensureAts168Tables();

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
    await ensureAts168Tables();

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
    await ensureAts168Tables();
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
