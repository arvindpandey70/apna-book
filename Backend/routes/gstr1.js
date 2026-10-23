const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * Normalizes date string (DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD) to YYYY-MM-DD
 */
function normalizeDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (!s || s === '-' || s === 'null' || s === 'undefined') return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  try {
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 10);
    }
  } catch (e) {
    // ignore
  }
  return null;
}

/**
 * Determine Financial Year from fp (MMYYYY e.g. '042026' -> '2026-27')
 */
function getFinancialYearFromFp(fp) {
  if (!fp) return null;
  const s = String(fp).trim();
  if (s.length === 6 && /^\d{6}$/.test(s)) {
    const m = parseInt(s.slice(0, 2), 10);
    const y = parseInt(s.slice(2), 10);
    if (!isNaN(m) && !isNaN(y)) {
      const fyStart = m >= 4 ? y : y - 1;
      const fyEndShort = String(fyStart + 1).slice(-2);
      return `${fyStart}-${fyEndShort}`;
    }
  }
  return null;
}

/**
 * POST /api/gstr1/import
 * Saves complete GSTR-1 JSON data (metadata, B2B invoices, B2C summaries) to MySQL database.
 */
router.post('/import', async (req, res) => {
  let conn;
  try {
    const {
      company_id,
      companyId,
      owner_type = 'company',
      owner_id = null,
      file_name,
      file_size_bytes = 0,
      metadata = {},
      b2b_invoices = [],
      b2c_summaries = [],
      total_b2b_taxable = 0,
      total_b2b_tax = 0,
      total_b2b_val = 0,
      total_b2c_taxable = 0,
      total_b2c_tax = 0,
      raw_json = null,
    } = req.body;

    const targetCompanyId = company_id || companyId;
    if (!targetCompanyId) {
      return res.status(400).json({
        success: false,
        message: 'Missing company_id. Company context is required for import persistence.',
      });
    }

    if (!file_name) {
      return res.status(400).json({
        success: false,
        message: 'Missing file_name in import payload.',
      });
    }

    const gstin = String(metadata.gstin || '').trim();
    const returnPeriod = String(metadata.fp || 'UNKNOWN').trim();
    const filingTyp = metadata.filing_typ ? String(metadata.filing_typ).trim() : null;
    const filDt = normalizeDate(metadata.fil_dt);
    const gt = Number(metadata.gt || 0);
    const curGt = Number(metadata.cur_gt || 0);
    const version = metadata.version ? String(metadata.version).trim() : null;
    const hash = metadata.hash ? String(metadata.hash).trim() : null;
    const financialYear = getFinancialYearFromFp(returnPeriod) || req.body.financial_year || null;

    conn = await db.getConnection();
    await conn.beginTransaction();

    // Strategy to prevent duplicate records:
    // If an import already exists for the same company and return period (or same file_name),
    // remove previous import rows so we cleanly overwrite without leaving stale/duplicate invoices.
    let existingQuery = 'SELECT id FROM gstr1_imports WHERE company_id = ? AND return_period = ?';
    let existingParams = [targetCompanyId, returnPeriod];
    if (!returnPeriod || returnPeriod === 'UNKNOWN') {
      existingQuery = 'SELECT id FROM gstr1_imports WHERE company_id = ? AND file_name = ?';
      existingParams = [targetCompanyId, file_name];
    }
    const [existingImports] = await conn.query(existingQuery, existingParams);

    if (existingImports.length > 0) {
      for (const oldImp of existingImports) {
        // Child tables have ON DELETE CASCADE, but explicit delete guarantees cleanliness
        await conn.query('DELETE FROM gstr1_b2b_invoices WHERE import_id = ?', [oldImp.id]);
        await conn.query('DELETE FROM gstr1_b2c_summaries WHERE import_id = ?', [oldImp.id]);
        await conn.query('DELETE FROM gstr1_imports WHERE id = ?', [oldImp.id]);
      }
    }

    // 1. Insert Parent gstr1_imports record
    const insertImportSql = `
      INSERT INTO gstr1_imports (
        company_id, owner_type, owner_id, gstin, return_period, financial_year,
        filing_typ, fil_dt, gt, cur_gt, version, hash, file_name, file_size_bytes,
        total_b2b_taxable, total_b2b_tax, total_b2b_val,
        total_b2c_taxable, total_b2c_tax,
        b2b_count, b2c_count, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const rawJsonStr = raw_json
      ? typeof raw_json === 'string'
        ? raw_json
        : JSON.stringify(raw_json)
      : null;

    const [importResult] = await conn.query(insertImportSql, [
      targetCompanyId,
      owner_type,
      owner_id,
      gstin,
      returnPeriod,
      financialYear,
      filingTyp,
      filDt,
      gt,
      curGt,
      version,
      hash,
      file_name,
      file_size_bytes,
      total_b2b_taxable,
      total_b2b_tax,
      total_b2b_val,
      total_b2c_taxable,
      total_b2c_tax,
      b2b_invoices.length,
      b2c_summaries.length,
      rawJsonStr,
    ]);

    const importId = importResult.insertId;

    // 2. Bulk Insert B2B Invoices in chunks of 500
    if (Array.isArray(b2b_invoices) && b2b_invoices.length > 0) {
      const b2bChunkSize = 500;
      for (let i = 0; i < b2b_invoices.length; i += b2bChunkSize) {
        const chunk = b2b_invoices.slice(i, i + b2bChunkSize);
        const values = [];

        for (const row of chunk) {
          const sno = Number(row.sno || i + 1);
          const ctin = String(row.ctin || '').trim();
          const inum = String(row.inum || '').trim();
          const idtRaw = String(row.idt || '').trim();
          const idtNorm = normalizeDate(idtRaw);
          const invTyp = String(row.inv_typ || 'R').trim();
          const pos = String(row.pos || '-').trim();
          const rt = String(row.rt || '-').trim();
          const txval = Number(row.txval || 0);
          const camt = Number(row.camt || 0);
          const samt = Number(row.samt || 0);
          const iamt = Number(row.iamt || 0);
          const csamt = Number(row.csamt || 0);
          const val = row.val !== undefined && row.val !== null ? Number(row.val) : null;
          const rawItems = row.itms ? JSON.stringify(row.itms) : null;

          values.push([
            importId,
            targetCompanyId,
            sno,
            ctin,
            inum,
            idtRaw,
            idtNorm,
            invTyp,
            pos,
            rt,
            txval,
            camt,
            samt,
            iamt,
            csamt,
            val,
            rawItems,
          ]);
        }

        const b2bSql = `
          INSERT INTO gstr1_b2b_invoices (
            import_id, company_id, sno, ctin, inum, idt, idt_norm, inv_typ,
            pos, rt, txval, camt, samt, iamt, csamt, val, raw_items
          ) VALUES ?
        `;
        await conn.query(b2bSql, [values]);
      }
    }

    // 3. Bulk Insert B2C Summaries in chunks of 500
    if (Array.isArray(b2c_summaries) && b2c_summaries.length > 0) {
      const b2cChunkSize = 500;
      for (let i = 0; i < b2c_summaries.length; i += b2cChunkSize) {
        const chunk = b2c_summaries.slice(i, i + b2cChunkSize);
        const values = [];

        for (const row of chunk) {
          const sno = Number(row.sno || i + 1);
          const pos = String(row.pos || '-').trim();
          const splyTy = String(row.sply_ty || '-').trim();
          const typ = String(row.typ || '-').trim();
          const rt = String(row.rt || '-').trim();
          const txval = Number(row.txval || 0);
          const camt = Number(row.camt || 0);
          const samt = Number(row.samt || 0);
          const iamt = Number(row.iamt || 0);
          const csamt = Number(row.csamt || 0);
          const flag = String(row.flag || '-').trim();

          values.push([
            importId,
            targetCompanyId,
            sno,
            pos,
            splyTy,
            typ,
            rt,
            txval,
            camt,
            samt,
            iamt,
            csamt,
            flag,
          ]);
        }

        const b2cSql = `
          INSERT INTO gstr1_b2c_summaries (
            import_id, company_id, sno, pos, sply_ty, typ, rt,
            txval, camt, samt, iamt, csamt, flag
          ) VALUES ?
        `;
        await conn.query(b2cSql, [values]);
      }
    }

    await conn.commit();
    conn.release();

    return res.status(200).json({
      success: true,
      message: 'GSTR-1 JSON data imported and saved to database successfully.',
      importId,
      b2bCount: b2b_invoices.length,
      b2cCount: b2c_summaries.length,
      returnPeriod,
      gstin,
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
        conn.release();
      } catch (rollbackErr) {
        console.error('Error on rollback:', rollbackErr);
      }
    }
    console.error('❌ GSTR-1 Import Error:', err);
    return res.status(500).json({
      success: false,
      message: `Failed to save GSTR-1 data to database: ${err.message}`,
      error: err.message,
    });
  }
});

/**
 * GET /api/gstr1/latest
 * Fetches the most recent saved GSTR-1 import and its complete B2B/B2C records for the active company.
 */
router.get('/latest', async (req, res) => {
  try {
    const { company_id, companyId, return_period } = req.query;
    const targetCompanyId = company_id || companyId;

    if (!targetCompanyId) {
      return res.status(400).json({
        success: false,
        message: 'Missing company_id query parameter.',
      });
    }

    let importSql = `
      SELECT * FROM gstr1_imports
      WHERE company_id = ?
    `;
    const params = [targetCompanyId];

    if (return_period) {
      importSql += ` AND return_period = ?`;
      params.push(return_period);
    }

    importSql += ` ORDER BY id DESC LIMIT 1`;

    const [imports] = await db.query(importSql, params);
    if (imports.length === 0) {
      return res.json({
        success: true,
        data: null,
      });
    }

    const imp = imports[0];

    // Fetch B2B invoices
    const [b2bRows] = await db.query(
      `SELECT * FROM gstr1_b2b_invoices WHERE import_id = ? ORDER BY sno ASC`,
      [imp.id]
    );

    // Fetch B2C summaries
    const [b2cRows] = await db.query(
      `SELECT * FROM gstr1_b2c_summaries WHERE import_id = ? ORDER BY sno ASC`,
      [imp.id]
    );

    // Format B2B invoices to match ParsedGstr1Data / GstB2bInvoiceRow
    const b2bInvoices = b2bRows.map((r) => ({
      sno: r.sno,
      ctin: r.ctin,
      inum: r.inum,
      idt: r.idt,
      inv_typ: r.inv_typ,
      pos: r.pos,
      rt: r.rt,
      txval: parseFloat(r.txval) || 0,
      camt: parseFloat(r.camt) || 0,
      samt: parseFloat(r.samt) || 0,
      iamt: parseFloat(r.iamt) || 0,
      csamt: parseFloat(r.csamt) || 0,
      val: r.val !== null ? parseFloat(r.val) : null,
    }));

    // Format B2C summaries to match GstB2cSummaryRow
    const b2cSummaries = b2cRows.map((r) => ({
      sno: r.sno,
      pos: r.pos,
      sply_ty: r.sply_ty,
      typ: r.typ,
      rt: r.rt,
      txval: parseFloat(r.txval) || 0,
      camt: parseFloat(r.camt) || 0,
      samt: parseFloat(r.samt) || 0,
      iamt: parseFloat(r.iamt) || 0,
      csamt: parseFloat(r.csamt) || 0,
      flag: r.flag,
    }));

    // Date formatting helper for imported_at
    const importedAtDate = new Date(imp.imported_at || imp.created_at);
    const scannedAt = !isNaN(importedAtDate.getTime())
      ? importedAtDate.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : '';

    const payload = {
      id: imp.id,
      companyId: imp.company_id,
      metadata: {
        gstin: imp.gstin || '',
        fp: imp.return_period || '',
        filing_typ: imp.filing_typ || '',
        fil_dt: imp.fil_dt ? imp.fil_dt.toISOString().slice(0, 10) : '',
        gt: parseFloat(imp.gt) || 0,
        cur_gt: parseFloat(imp.cur_gt) || 0,
        version: imp.version || '',
        hash: imp.hash || '',
      },
      b2bInvoices,
      b2cSummaries,
      totalB2bTaxable: parseFloat(imp.total_b2b_taxable) || 0,
      totalB2bTax: parseFloat(imp.total_b2b_tax) || 0,
      totalB2bVal: parseFloat(imp.total_b2b_val) || 0,
      totalB2cTaxable: parseFloat(imp.total_b2c_taxable) || 0,
      totalB2cTax: parseFloat(imp.total_b2c_tax) || 0,
      fileName: imp.file_name,
      fileSizeBytes: Number(imp.file_size_bytes) || 0,
      scannedAt,
      importedAt: imp.imported_at,
    };

    return res.json({
      success: true,
      data: payload,
    });
  } catch (err) {
    console.error('❌ Error fetching latest GSTR-1:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch saved GSTR-1 records',
      error: err.message,
    });
  }
});

/**
 * GET /api/gstr1/list
 * Lists all GSTR-1 imports for a company.
 */
router.get('/list', async (req, res) => {
  try {
    const { company_id, companyId } = req.query;
    const targetCompanyId = company_id || companyId;

    if (!targetCompanyId) {
      return res.status(400).json({
        success: false,
        message: 'Missing company_id query parameter.',
      });
    }

    const [rows] = await db.query(
      `SELECT id, company_id, gstin, return_period, financial_year,
              file_name, file_size_bytes, total_b2b_taxable, total_b2b_tax,
              total_b2b_val, total_b2c_taxable, total_b2c_tax,
              b2b_count, b2c_count, imported_at
       FROM gstr1_imports
       WHERE company_id = ?
       ORDER BY id DESC`,
      [targetCompanyId]
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error('❌ Error listing GSTR-1 imports:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to list GSTR-1 imports',
      error: err.message,
    });
  }
});

/**
 * DELETE /api/gstr1/import/:id
 * Deletes a GSTR-1 import and all its associated invoices/summaries.
 */
router.delete('/import/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id, companyId } = req.query;
    const targetCompanyId = company_id || companyId;

    let deleteSql = 'DELETE FROM gstr1_imports WHERE id = ?';
    const params = [id];
    if (targetCompanyId) {
      deleteSql += ' AND company_id = ?';
      params.push(targetCompanyId);
    }

    const [result] = await db.query(deleteSql, params);

    return res.json({
      success: true,
      message: 'Import deleted successfully',
      deletedCount: result.affectedRows,
    });
  } catch (err) {
    console.error('❌ Error deleting GSTR-1 import:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete GSTR-1 import',
      error: err.message,
    });
  }
});

module.exports = router;
