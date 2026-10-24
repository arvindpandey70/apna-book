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
 * Determine Financial Year from rtnprd (MMYYYY e.g. '092026' -> '2026-27')
 */
function getFinancialYearFromPeriod(period) {
  if (!period) return null;
  const s = String(period).trim();
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
 * POST /api/gstr2b/import
 * Saves complete GSTR-2B JSON data (metadata, B2B invoices, CDNR notes) to MySQL database.
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
      cdnr_notes = [],
      total_b2b_taxable = 0,
      total_b2b_tax = 0,
      total_b2b_val = 0,
      total_cdnr_taxable = 0,
      total_cdnr_tax = 0,
      total_cdnr_val = 0,
      itc_available_tax = 0,
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
    const returnPeriod = String(metadata.rtnprd || metadata.fp || 'UNKNOWN').trim();
    const genDt = normalizeDate(metadata.gendt || metadata.gen_dt);
    const version = metadata.version ? String(metadata.version).trim() : '1.0';
    const chksum = metadata.chksum ? String(metadata.chksum).trim() : null;
    const financialYear = getFinancialYearFromPeriod(returnPeriod) || req.body.financial_year || null;

    conn = await db.getConnection();
    await conn.beginTransaction();

    // Prevent duplicate records:
    // Remove previous import for same company & return period (or file_name)
    let existingQuery = 'SELECT id FROM gstr2b_imports WHERE company_id = ? AND return_period = ?';
    let existingParams = [targetCompanyId, returnPeriod];
    if (!returnPeriod || returnPeriod === 'UNKNOWN') {
      existingQuery = 'SELECT id FROM gstr2b_imports WHERE company_id = ? AND file_name = ?';
      existingParams = [targetCompanyId, file_name];
    }
    const [existingImports] = await conn.query(existingQuery, existingParams);

    if (existingImports.length > 0) {
      for (const oldImp of existingImports) {
        await conn.query('DELETE FROM gstr2b_b2b_invoices WHERE import_id = ?', [oldImp.id]);
        await conn.query('DELETE FROM gstr2b_cdnr_notes WHERE import_id = ?', [oldImp.id]);
        await conn.query('DELETE FROM gstr2b_imports WHERE id = ?', [oldImp.id]);
      }
    }

    // 1. Insert Parent gstr2b_imports record
    const insertImportSql = `
      INSERT INTO gstr2b_imports (
        company_id, owner_type, owner_id, gstin, return_period, financial_year,
        gen_dt, version, chksum, file_name, file_size_bytes,
        total_b2b_taxable, total_b2b_tax, total_b2b_val,
        total_cdnr_taxable, total_cdnr_tax, total_cdnr_val,
        b2b_count, cdnr_count, itc_available_tax, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      genDt,
      version,
      chksum,
      file_name,
      file_size_bytes,
      total_b2b_taxable,
      total_b2b_tax,
      total_b2b_val,
      total_cdnr_taxable,
      total_cdnr_tax,
      total_cdnr_val,
      b2b_invoices.length,
      cdnr_notes.length,
      itc_available_tax,
      rawJsonStr,
    ]);

    const importId = importResult.insertId;

    // 2. Bulk Insert B2B Invoices in chunks of 500
    if (Array.isArray(b2b_invoices) && b2b_invoices.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < b2b_invoices.length; i += chunkSize) {
        const chunk = b2b_invoices.slice(i, i + chunkSize);
        const values = [];

        for (const row of chunk) {
          const sno = Number(row.sno || i + 1);
          const ctin = String(row.ctin || '').trim();
          const trdnm = String(row.trdnm || '').trim();
          const inum = String(row.inum || '').trim();
          const idtRaw = String(row.idt || row.dt || '').trim();
          const idtNorm = normalizeDate(idtRaw);
          const invTyp = String(row.inv_typ || row.typ || 'R').trim();
          const pos = String(row.pos || '-').trim();
          const rev = String(row.rev || 'N').trim();
          const itcavl = String(row.itcavl || 'Y').trim();
          const rsn = String(row.rsn || '').trim();
          const imsStatus = String(row.ims_status || row.imsStatus || 'N').trim();
          const txval = Number(row.txval || 0);
          const camt = Number(row.camt || row.cgst || 0);
          const samt = Number(row.samt || row.sgst || 0);
          const iamt = Number(row.iamt || row.igst || 0);
          const csamt = Number(row.csamt || row.cess || 0);
          const val = row.val !== undefined && row.val !== null ? Number(row.val) : null;
          const supprd = String(row.supprd || '').trim();
          const supfildt = String(row.supfildt || '').trim();

          values.push([
            importId,
            targetCompanyId,
            sno,
            ctin,
            trdnm,
            inum,
            idtRaw,
            idtNorm,
            invTyp,
            pos,
            rev,
            itcavl,
            rsn,
            imsStatus,
            txval,
            camt,
            samt,
            iamt,
            csamt,
            val,
            supprd,
            supfildt,
          ]);
        }

        const b2bSql = `
          INSERT INTO gstr2b_b2b_invoices (
            import_id, company_id, sno, ctin, trdnm, inum, idt, idt_norm,
            inv_typ, pos, rev, itcavl, rsn, ims_status, txval, camt, samt,
            iamt, csamt, val, supprd, supfildt
          ) VALUES ?
        `;
        await conn.query(b2bSql, [values]);
      }
    }

    // 3. Bulk Insert CDNR Notes in chunks of 500
    if (Array.isArray(cdnr_notes) && cdnr_notes.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < cdnr_notes.length; i += chunkSize) {
        const chunk = cdnr_notes.slice(i, i + chunkSize);
        const values = [];

        for (const row of chunk) {
          const sno = Number(row.sno || i + 1);
          const ctin = String(row.ctin || '').trim();
          const trdnm = String(row.trdnm || '').trim();
          const ntnum = String(row.ntnum || '').trim();
          const dtRaw = String(row.dt || '').trim();
          const dtNorm = normalizeDate(dtRaw);
          const typ = String(row.typ || 'C').trim();
          const suptyp = String(row.suptyp || 'R').trim();
          const pos = String(row.pos || '-').trim();
          const rev = String(row.rev || 'N').trim();
          const itcavl = String(row.itcavl || 'Y').trim();
          const rsn = String(row.rsn || '').trim();
          const imsStatus = String(row.ims_status || row.imsStatus || 'N').trim();
          const txval = Number(row.txval || 0);
          const camt = Number(row.camt || row.cgst || 0);
          const samt = Number(row.samt || row.sgst || 0);
          const iamt = Number(row.iamt || row.igst || 0);
          const csamt = Number(row.csamt || row.cess || 0);
          const val = row.val !== undefined && row.val !== null ? Number(row.val) : null;
          const supprd = String(row.supprd || '').trim();
          const supfildt = String(row.supfildt || '').trim();

          values.push([
            importId,
            targetCompanyId,
            sno,
            ctin,
            trdnm,
            ntnum,
            dtRaw,
            dtNorm,
            typ,
            suptyp,
            pos,
            rev,
            itcavl,
            rsn,
            imsStatus,
            txval,
            camt,
            samt,
            iamt,
            csamt,
            val,
            supprd,
            supfildt,
          ]);
        }

        const cdnrSql = `
          INSERT INTO gstr2b_cdnr_notes (
            import_id, company_id, sno, ctin, trdnm, ntnum, dt, dt_norm,
            typ, suptyp, pos, rev, itcavl, rsn, ims_status, txval, camt, samt,
            iamt, csamt, val, supprd, supfildt
          ) VALUES ?
        `;
        await conn.query(cdnrSql, [values]);
      }
    }

    await conn.commit();
    conn.release();

    return res.status(200).json({
      success: true,
      message: 'GSTR-2B JSON data imported and saved to database successfully.',
      importId,
      b2bCount: b2b_invoices.length,
      cdnrCount: cdnr_notes.length,
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
    console.error('❌ GSTR-2B Import Error:', err);
    return res.status(500).json({
      success: false,
      message: `Failed to save GSTR-2B data to database: ${err.message}`,
      error: err.message,
    });
  }
});

/**
 * GET /api/gstr2b/latest
 * Fetches the most recent saved GSTR-2B import and its B2B & CDNR records for the company.
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
      SELECT * FROM gstr2b_imports
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
      `SELECT * FROM gstr2b_b2b_invoices WHERE import_id = ? ORDER BY sno ASC`,
      [imp.id]
    );

    // Fetch CDNR notes
    const [cdnrRows] = await db.query(
      `SELECT * FROM gstr2b_cdnr_notes WHERE import_id = ? ORDER BY sno ASC`,
      [imp.id]
    );

    // Format B2B invoices
    const b2bInvoices = b2bRows.map((r) => ({
      sno: r.sno,
      ctin: r.ctin,
      trdnm: r.trdnm,
      inum: r.inum,
      idt: r.idt,
      inv_typ: r.inv_typ,
      pos: r.pos,
      rev: r.rev,
      itcavl: r.itcavl,
      rsn: r.rsn,
      ims_status: r.ims_status,
      txval: parseFloat(r.txval) || 0,
      camt: parseFloat(r.camt) || 0,
      samt: parseFloat(r.samt) || 0,
      iamt: parseFloat(r.iamt) || 0,
      csamt: parseFloat(r.csamt) || 0,
      val: r.val !== null ? parseFloat(r.val) : null,
      supprd: r.supprd,
      supfildt: r.supfildt,
    }));

    // Format CDNR notes
    const cdnrNotes = cdnrRows.map((r) => ({
      sno: r.sno,
      ctin: r.ctin,
      trdnm: r.trdnm,
      ntnum: r.ntnum,
      dt: r.dt,
      typ: r.typ,
      suptyp: r.suptyp,
      pos: r.pos,
      rev: r.rev,
      itcavl: r.itcavl,
      rsn: r.rsn,
      ims_status: r.ims_status,
      txval: parseFloat(r.txval) || 0,
      camt: parseFloat(r.camt) || 0,
      samt: parseFloat(r.samt) || 0,
      iamt: parseFloat(r.iamt) || 0,
      csamt: parseFloat(r.csamt) || 0,
      val: r.val !== null ? parseFloat(r.val) : null,
      supprd: r.supprd,
      supfildt: r.supfildt,
    }));

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
        rtnprd: imp.return_period || '',
        gendt: imp.gen_dt ? imp.gen_dt.toISOString().slice(0, 10) : '',
        version: imp.version || '1.0',
        chksum: imp.chksum || '',
      },
      b2bInvoices,
      cdnrNotes,
      totalB2bTaxable: parseFloat(imp.total_b2b_taxable) || 0,
      totalB2bTax: parseFloat(imp.total_b2b_tax) || 0,
      totalB2bVal: parseFloat(imp.total_b2b_val) || 0,
      totalCdnrTaxable: parseFloat(imp.total_cdnr_taxable) || 0,
      totalCdnrTax: parseFloat(imp.total_cdnr_tax) || 0,
      totalCdnrVal: parseFloat(imp.total_cdnr_val) || 0,
      itcAvailableTax: parseFloat(imp.itc_available_tax) || 0,
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
    console.error('❌ Error fetching latest GSTR-2B:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch saved GSTR-2B records',
      error: err.message,
    });
  }
});

/**
 * GET /api/gstr2b/list
 * Lists all GSTR-2B imports for a company.
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
              total_b2b_val, total_cdnr_taxable, total_cdnr_tax, total_cdnr_val,
              b2b_count, cdnr_count, itc_available_tax, imported_at
       FROM gstr2b_imports
       WHERE company_id = ?
       ORDER BY id DESC`,
      [targetCompanyId]
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error('❌ Error listing GSTR-2B imports:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to list GSTR-2B imports',
      error: err.message,
    });
  }
});

/**
 * DELETE /api/gstr2b/import/:id
 * Deletes a GSTR-2B import and all its associated invoices/notes.
 */
router.delete('/import/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id, companyId } = req.query;
    const targetCompanyId = company_id || companyId;

    let deleteSql = 'DELETE FROM gstr2b_imports WHERE id = ?';
    const params = [id];
    if (targetCompanyId) {
      deleteSql += ' AND company_id = ?';
      params.push(targetCompanyId);
    }

    const [result] = await db.query(deleteSql, params);

    return res.json({
      success: true,
      message: 'GSTR-2B import deleted successfully',
      deletedCount: result.affectedRows,
    });
  } catch (err) {
    console.error('❌ Error deleting GSTR-2B import:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete GSTR-2B import',
      error: err.message,
    });
  }
});

module.exports = router;
