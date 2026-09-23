const express = require('express');
const router = express.Router();
const pool = require('../db');




router.get("/api/group", async (req, res) => {
  try {

    const { company_id, owner_type, owner_id, ledgerIds } = req.query;


    if (!company_id || !ledgerIds) {
      return res.status(400).json({
        success: false,
        message: "Missing Query Params",
      });
    }

    const idArray = ledgerIds
      .split(",")
      .map(id => Number(id))
      .filter(id => !isNaN(id));

    if (!idArray.length) {
      return res.json({
        success: true,
        data: {},
      });
    }

    const [rows] = await pool.query(

      `
      SELECT
        ledgerId,
        SUM(debit)  AS debit,
        SUM(credit) AS credit

      FROM (

        /* ================= PURCHASE (ITEM-INVOICE MODE) ================= */

        /* CGST - use DISTINCT subquery so voucher-level total is counted once per voucher, not once per item */
        SELECT
          CAST(pvi_agg.cgstRate AS UNSIGNED) AS ledgerId,
          pv.cgstTotal AS debit,
          0 AS credit
        FROM purchase_vouchers pv
        JOIN (
          SELECT DISTINCT voucherId, cgstRate
          FROM purchase_voucher_items
          WHERE cgstRate IN (?) AND cgstRate > 0
        ) pvi_agg ON pvi_agg.voucherId = pv.id
        WHERE pv.company_id = ?
          AND pv.owner_type = ?
          AND pv.owner_id = ?
          AND pv.mode != 'accounting-invoice'

        UNION ALL

        /* SGST - one row per voucher */
        SELECT
          CAST(pvi_agg.sgstRate AS UNSIGNED) AS ledgerId,
          pv.sgstTotal AS debit,
          0 AS credit
        FROM purchase_vouchers pv
        JOIN (
          SELECT DISTINCT voucherId, sgstRate
          FROM purchase_voucher_items
          WHERE sgstRate IN (?) AND sgstRate > 0
        ) pvi_agg ON pvi_agg.voucherId = pv.id
        WHERE pv.company_id = ?
          AND pv.owner_type = ?
          AND pv.owner_id = ?
          AND pv.mode != 'accounting-invoice'

        UNION ALL

        /* IGST - one row per voucher */
        SELECT
          CAST(pvi_agg.igstRate AS UNSIGNED) AS ledgerId,
          pv.igstTotal AS debit,
          0 AS credit
        FROM purchase_vouchers pv
        JOIN (
          SELECT DISTINCT voucherId, igstRate
          FROM purchase_voucher_items
          WHERE igstRate IN (?) AND igstRate > 0
        ) pvi_agg ON pvi_agg.voucherId = pv.id
        WHERE pv.company_id = ?
          AND pv.owner_type = ?
          AND pv.owner_id = ?
          AND pv.mode != 'accounting-invoice'

        UNION ALL

        /* Purchase Ledger - per item amount (correct, item-level) */
        SELECT
          CAST(pvi.purchaseLedgerId AS UNSIGNED) AS ledgerId,
          pvi.amount AS debit,
          0 AS credit
        FROM purchase_voucher_items pvi
        JOIN purchase_vouchers pv ON pvi.voucherId = pv.id
        WHERE pvi.purchaseLedgerId IN (?)
          AND pv.company_id = ?
          AND pv.owner_type = ?
          AND pv.owner_id = ?
          AND pv.mode != 'accounting-invoice'

        UNION ALL

        /* TDS - one row per voucher */
        SELECT
          CAST(pvi_agg.tdsRate AS UNSIGNED) AS ledgerId,
          0 AS debit,
          pv.tdsTotal AS credit
        FROM purchase_vouchers pv
        JOIN (
          SELECT DISTINCT voucherId, tdsRate
          FROM purchase_voucher_items
          WHERE tdsRate IN (?) AND tdsRate > 0
        ) pvi_agg ON pvi_agg.voucherId = pv.id
        WHERE pv.company_id = ?
          AND pv.owner_type = ?
          AND pv.owner_id = ?
          AND pv.mode != 'accounting-invoice'

        /* ================= PURCHASE DISCOUNT (GLOBAL) ================= */
        UNION ALL

        SELECT
          CAST(pvi_agg.discountLedgerId AS UNSIGNED) AS ledgerId,
          0 AS debit,
          pv.discountTotal AS credit
        FROM purchase_vouchers pv
        JOIN (
          SELECT DISTINCT voucherId, discountLedgerId
          FROM purchase_voucher_items
          WHERE discountLedgerId IN (?) AND discountLedgerId > 0
        ) pvi_agg ON pvi_agg.voucherId = pv.id
        WHERE pv.company_id = ?
          AND pv.owner_type = ?
          AND pv.owner_id = ?
          AND pv.mode != 'accounting-invoice'
          AND pv.discountTotal > 0
          AND pv.mode != 'accounting-invoice'


        /* ================= SALES (ITEM-INVOICE MODE) ================= */

        UNION ALL

        /* Sales CGST - one row per voucher */
        SELECT
          CAST(svi_agg.cgstRate AS UNSIGNED) AS ledgerId,
          0 AS debit,
          sv.cgstTotal AS credit
        FROM sales_vouchers sv
        JOIN (
          SELECT DISTINCT voucherId, cgstRate
          FROM sales_voucher_items
          WHERE cgstRate IN (?) AND cgstRate > 0
        ) svi_agg ON svi_agg.voucherId = sv.id
        WHERE sv.company_id = ?
          AND sv.owner_type = ?
          AND sv.owner_id = ?
          AND sv.mode != 'accounting-invoice'

        UNION ALL

        /* Sales SGST - one row per voucher */
        SELECT
          CAST(svi_agg.sgstRate AS UNSIGNED) AS ledgerId,
          0 AS debit,
          sv.sgstTotal AS credit
        FROM sales_vouchers sv
        JOIN (
          SELECT DISTINCT voucherId, sgstRate
          FROM sales_voucher_items
          WHERE sgstRate IN (?) AND sgstRate > 0
        ) svi_agg ON svi_agg.voucherId = sv.id
        WHERE sv.company_id = ?
          AND sv.owner_type = ?
          AND sv.owner_id = ?
          AND sv.mode != 'accounting-invoice'

        UNION ALL

        /* Sales IGST - one row per voucher */
        SELECT
          CAST(svi_agg.igstRate AS UNSIGNED) AS ledgerId,
          0 AS debit,
          sv.igstTotal AS credit
        FROM sales_vouchers sv
        JOIN (
          SELECT DISTINCT voucherId, igstRate
          FROM sales_voucher_items
          WHERE igstRate IN (?) AND igstRate > 0
        ) svi_agg ON svi_agg.voucherId = sv.id
        WHERE sv.company_id = ?
          AND sv.owner_type = ?
          AND sv.owner_id = ?
          AND sv.mode != 'accounting-invoice'

        UNION ALL

        /* Sales Ledger - per item amount */
        SELECT
          CAST(svi.salesLedgerId AS UNSIGNED) AS ledgerId,
          0 AS debit,
          svi.amount AS credit
        FROM sales_voucher_items svi
        JOIN sales_vouchers sv ON svi.voucherId = sv.id
        WHERE svi.salesLedgerId IN (?)
          AND sv.company_id = ?
          AND sv.owner_type = ?
          AND sv.owner_id = ?
          AND sv.mode != 'accounting-invoice'

        /* ================= SALES DISCOUNT (ITEM-WISE) ================= */

        UNION ALL

        SELECT
          CAST(svi.discountLedgerId AS UNSIGNED) AS ledgerId,
          SUM(svi.discount) AS debit,
          0 AS credit
        FROM sales_voucher_items svi
        JOIN sales_vouchers sv ON svi.voucherId = sv.id
        WHERE svi.discountLedgerId IN (?)
          AND sv.company_id = ?
          AND sv.owner_type = ?
          AND sv.owner_id = ?
          AND svi.discount > 0
          AND sv.mode != 'accounting-invoice'
        GROUP BY svi.discountLedgerId


        /* ================= SALES OVERALL DISCOUNT (MANUAL) ================= */

        UNION ALL

        SELECT
          CAST(sv.overallDiscountLedgerId AS UNSIGNED) AS ledgerId,
          sv.overallDiscountAmount AS debit,
          0 AS credit
        FROM sales_vouchers sv
        WHERE sv.overallDiscountLedgerId IN (?)
          AND sv.company_id = ?
          AND sv.owner_type = ?
          AND sv.owner_id = ?
          AND sv.overallDiscountAmount > 0
          AND sv.mode != 'accounting-invoice'


        /* ================= PARTY ================= */

        UNION ALL

        SELECT
          CAST(pv.partyId AS UNSIGNED) AS ledgerId,
          0 AS debit,
          pv.total AS credit
        FROM purchase_vouchers pv
        WHERE pv.partyId IN (?)
          AND pv.company_id = ?
          AND pv.owner_type = ?
          AND pv.owner_id = ?
          AND pv.mode != 'accounting-invoice'

        UNION ALL

        SELECT
          CAST(sv.partyId AS UNSIGNED) AS ledgerId,
          sv.total AS debit,
          0 AS credit
        FROM sales_vouchers sv
        WHERE sv.partyId IN (?)
          AND sv.company_id = ?
          AND sv.owner_type = ?
          AND sv.owner_id = ?
          AND sv.mode != 'accounting-invoice'


        /* ================= JOURNAL / CONTRA / PAYMENT / RECEIPT ================= */

        UNION ALL

        SELECT
          CAST(ve.ledger_id AS UNSIGNED) AS ledgerId,

          CASE
            WHEN ve.entry_type = 'debit' THEN ve.amount
            ELSE 0
          END AS debit,

          CASE
            WHEN ve.entry_type = 'credit' THEN ve.amount
            ELSE 0
          END AS credit

        FROM voucher_entries ve
        JOIN voucher_main vm ON vm.id = ve.voucher_id

        WHERE ve.ledger_id IN (?)
          AND vm.voucher_type IN ('journal','contra','payment','receipt')
          AND vm.company_id = ?
          AND vm.owner_type = ?
          AND vm.owner_id = ?

        /* ================= ACCOUNTING-MODE PURCHASE VOUCHER ENTRIES ================= */
        /* These entries have voucher_id = purchase_vouchers.id (not voucher_main.id) */

        UNION ALL

        SELECT
          CAST(ve.ledger_id AS UNSIGNED) AS ledgerId,

          CASE
            WHEN ve.entry_type = 'debit' THEN ve.amount
            ELSE 0
          END AS debit,

          CASE
            WHEN ve.entry_type = 'credit' THEN ve.amount
            ELSE 0
          END AS credit

        FROM voucher_entries ve
        JOIN purchase_vouchers pv ON pv.id = ve.voucher_id

        WHERE ve.ledger_id IN (?)
          AND pv.company_id = ?
          AND pv.owner_type = ?
          AND pv.owner_id = ?

        /* ================= ACCOUNTING-MODE SALES VOUCHER ENTRIES ================= */
        /* These entries have voucher_id = sales_vouchers.id (not voucher_main.id) */

        UNION ALL

        SELECT
          CAST(ve.ledger_id AS UNSIGNED) AS ledgerId,

          CASE
            WHEN ve.entry_type = 'debit' THEN ve.amount
            ELSE 0
          END AS debit,

          CASE
            WHEN ve.entry_type = 'credit' THEN ve.amount
            ELSE 0
          END AS credit

        FROM voucher_entries ve
        JOIN sales_vouchers sv ON sv.id = ve.voucher_id

        WHERE ve.ledger_id IN (?)
          AND sv.company_id = ?
          AND sv.owner_type = ?
          AND sv.owner_id = ?

      ) AS final_data

      GROUP BY ledgerId
      `,

      [
        // Purchase item-invoice mode
        idArray, company_id, owner_type, owner_id,   // CGST
        idArray, company_id, owner_type, owner_id,   // SGST
        idArray, company_id, owner_type, owner_id,   // IGST
        idArray, company_id, owner_type, owner_id,   // Purchase Ledger
        idArray, company_id, owner_type, owner_id,   // TDS
        idArray, company_id, owner_type, owner_id,   // Purchase Discount

        // Sales item-invoice mode
        idArray, company_id, owner_type, owner_id,   // CGST
        idArray, company_id, owner_type, owner_id,   // SGST
        idArray, company_id, owner_type, owner_id,   // IGST
        idArray, company_id, owner_type, owner_id,   // Sales Ledger
        idArray, company_id, owner_type, owner_id,   // Sales Discount (Items)
        idArray, company_id, owner_type, owner_id,   // Sales Discount (Overall/Manual)

        // Party
        idArray, company_id, owner_type, owner_id,   // Purchase Party
        idArray, company_id, owner_type, owner_id,   // Sales Party

        // Normal vouchers (journal/contra/payment/receipt via voucher_main)
        idArray, company_id, owner_type, owner_id,

        // Accounting-mode Purchase voucher entries (voucher_id = purchase_vouchers.id)
        idArray, company_id, owner_type, owner_id,

        // Accounting-mode Sales voucher entries (voucher_id = sales_vouchers.id)
        idArray, company_id, owner_type, owner_id,
      ]
    );

    /* =====================================================
       5️⃣ INCLUDE DEBIT / CREDIT NOTES (JSON PARSING)
    ===================================================== */
    // Fetch Debit Notes
    const [dnRows] = await pool.query(
      `SELECT narration FROM debit_note_vouchers 
       WHERE company_id = ? AND owner_type = ? AND owner_id = ?`,
      [company_id, owner_type, owner_id]
    );

    // Fetch Credit Notes
    const [cnRows] = await pool.query(
      `SELECT narration FROM credit_vouchers 
       WHERE company_id = ? AND owner_type = ? AND owner_id = ?`,
      [company_id, owner_type, owner_id]
    );

    const noteRows = [...dnRows, ...cnRows];
    const notesData = {};

    noteRows.forEach(row => {
      if (!row.narration) return;
      try {
        const parsed = JSON.parse(row.narration);
        if (Array.isArray(parsed.accountingEntries)) {
          parsed.accountingEntries.forEach(entry => {
            const lid = Number(entry.ledgerId);
            if (!lid || !idArray.includes(lid)) return;

            if (!notesData[lid]) notesData[lid] = { debit: 0, credit: 0 };
            if (entry.type === 'debit') notesData[lid].debit += Number(entry.amount || 0);
            else if (entry.type === 'credit') notesData[lid].credit += Number(entry.amount || 0);
          });
        }
      } catch (e) {
        // Not a JSON narration, skip
      }
    });


    const result = {};

    rows.forEach(row => {

      const id = Number(row.ledgerId);

      if (!isNaN(id)) {
        const debit = Number(row.debit || 0) + (notesData[id]?.debit || 0);
        const credit = Number(row.credit || 0) + (notesData[id]?.credit || 0);

        result[id] = { debit, credit };
      }

    });

    res.json({
      success: true,
      data: result,
    });

  } catch (err) {

    console.error("Group API Error:", err);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});


// GET /api/group-summary
router.get("/api/group-summary", async (req, res) => {
  const { groupType, company_id, owner_type, owner_id } = req.query;

  if (!company_id || !owner_type || !owner_id) {
    return res.status(400).json({
      error: "Missing tenant parameters (company_id, owner_type, owner_id)",
    });
  }

  try {
    /* =====================================================
       1️⃣ FETCH LEDGER GROUPS (WITH PARENT DATA)
    ===================================================== */
    const [ledgerGroups] = await pool.query(
      `
      SELECT
        g.id,
        g.name,
        g.type,
        g.nature,
        g.parent               AS parent_id,
        pg.name                AS parent_name,
        pg.type                AS parent_type,
        pg.nature              AS parent_nature,
        g.alias,
        g.behavesLikeSubLedger,
        g.nettBalancesForReporting,
        g.usedForCalculation,
        g.allocationMethod,
        g.company_id,
        g.owner_type,
        g.owner_id
      FROM ledger_groups g
      LEFT JOIN ledger_groups pg ON g.parent = pg.id
      WHERE g.company_id = ?
        AND (g.owner_type = ? OR g.company_id > 0)
        AND (g.owner_id = ? OR g.owner_id = 0 OR g.company_id > 0)
      ORDER BY g.name
      `,
      [company_id, owner_type, owner_id]
    );

    /* =====================================================
       2️⃣ BUILD LEDGERS QUERY (WITH GROUP + PARENT GROUP)
    ===================================================== */
    let ledgersSql = `
      SELECT
        l.id,
        l.name,
        l.group_id,
        l.opening_balance,
        l.balance_type,
        l.closing_balance,

        g.name     AS group_name,
        g.type     AS group_type,
        g.nature   AS group_nature,
        g.parent   AS parent_group_id,

        pg.name    AS parent_group_name,
        pg.type    AS parent_group_type,
        pg.nature  AS parent_group_nature
      FROM ledgers l
      LEFT JOIN ledger_groups g  ON l.group_id = g.id
      LEFT JOIN ledger_groups pg ON g.parent = pg.id
      WHERE l.company_id = ?
        AND (l.owner_type = ? OR l.company_id > 0)
        AND (l.owner_id = ? OR l.owner_id = 0 OR l.company_id > 0)
    `;

    const params = [company_id, owner_type, owner_id];

    // Optional filter by group type (Assets / Liabilities / etc.)
    if (groupType) {
      ledgersSql += " AND g.type = ?";
      params.push(groupType);
    }

    ledgersSql += " ORDER BY l.name";

    const [ledgers] = await pool.query(ledgersSql, params);

    /* =====================================================
       3️⃣ NORMALIZE LEDGER DATA
    ===================================================== */
    const normalizedLedgers = ledgers.map((ledger) => ({
      ...ledger,
      opening_balance: parseFloat(ledger.opening_balance) || 0,
    }));

    /* =====================================================
       4️⃣ FINAL RESPONSE
    ===================================================== */
    res.json({
      ledgerGroups,
      ledgers: normalizedLedgers,
    });
  } catch (error) {
    console.error("Error fetching group summary data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});



module.exports = router;
