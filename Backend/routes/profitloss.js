const express = require('express');
const router = express.Router();
const pool = require('../db'); // your MySQL pool connection

//purchase
router.get("/api/purchase", async (req, res) => {
  try {
    // console.log("hit hua");

    const { ids, company_id, owner_id, owner_type } = req.query;

    if (!ids) {
      return res.status(400).json({ success: false, message: "IDs missing" });
    }

    // 1️⃣ Convert ids → array
    const idArray = ids.split(",").map(Number);

    // console.log("IDs:", idArray);

    // 2️⃣ SQL Query with JOIN
    const [rows] = await pool.query(
      `
      SELECT 
        purchaseLedgerId,
        SUM(amount) AS totalSubtotal
      FROM (
        -- Item Wise Purchases
        SELECT 
          pvi.purchaseLedgerId,
          SUM(pvi.amount) AS amount
        FROM purchase_voucher_items pvi
        JOIN purchase_vouchers pv ON pvi.voucherId = pv.id
        WHERE pvi.purchaseLedgerId IN (?)
          AND pv.company_id = ?
          AND pv.owner_type = ?
          AND pv.owner_id = ?
          AND pv.mode = 'item-invoice'
        GROUP BY pvi.purchaseLedgerId

        UNION ALL

        -- Accounting Invoice Purchases
        SELECT 
          ve.ledger_id AS purchaseLedgerId,
          SUM(CASE WHEN ve.entry_type = 'debit' THEN ve.amount ELSE -ve.amount END) AS amount
        FROM voucher_entries ve
        JOIN purchase_vouchers pv ON ve.voucher_id = pv.id
        WHERE ve.ledger_id IN (?)
          AND pv.company_id = ?
          AND pv.owner_type = ?
          AND pv.owner_id = ?
          AND pv.mode = 'accounting-invoice'
        GROUP BY ve.ledger_id
      ) AS combined
      GROUP BY purchaseLedgerId
      `,
      [idArray, company_id, owner_type, owner_id, idArray, company_id, owner_type, owner_id]
    );

    // 3️⃣ Result ko map me convert karo
    const result = {};

    rows.forEach((row) => {
      result[row.purchaseLedgerId] = row.totalSubtotal;
    });


    // console.log(result);

    // 4️⃣ Send to frontend
    res.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.log("Purchase API Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

//sales

router.get("/api/sales", async (req, res) => {
  try {

    // console.log("Sales API hit ✅");

    const { ids, company_id, owner_id, owner_type } = req.query;

    if (!ids) {
      return res.status(400).json({
        success: false,
        message: "IDs missing",
      });
    }

    const idArray = ids.split(",").map(Number);

    const [rows] = await pool.query(
      `
      SELECT 
        salesLedgerId,
        SUM(amount) AS totalSubtotal
      FROM (
        -- Item Wise Sales
        SELECT 
          svi.salesLedgerId,
          SUM(svi.amount) AS amount
        FROM sales_voucher_items svi
        JOIN sales_vouchers sv ON svi.voucherId = sv.id
        WHERE svi.salesLedgerId IN (?)
          AND sv.company_id = ?
          AND sv.owner_type = ?
          AND sv.owner_id = ?
          AND sv.mode = 'item-invoice'
        GROUP BY svi.salesLedgerId

        UNION ALL

        -- Accounting Invoice Sales
        SELECT 
          ve.ledger_id AS salesLedgerId,
          SUM(CASE WHEN ve.entry_type = 'credit' THEN ve.amount ELSE -ve.amount END) AS amount
        FROM voucher_entries ve
        JOIN sales_vouchers sv ON ve.voucher_id = sv.id
        WHERE ve.ledger_id IN (?)
          AND sv.company_id = ?
          AND sv.owner_type = ?
          AND sv.owner_id = ?
          AND sv.mode = 'accounting-invoice'
        GROUP BY ve.ledger_id
      ) AS combined
      GROUP BY salesLedgerId
      `,
      [idArray, company_id, owner_type, owner_id, idArray, company_id, owner_type, owner_id]
    );

    const result = {};

    rows.forEach((row) => {
      result[row.salesLedgerId] = row.totalSubtotal;
    });

    res.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.log("Sales API Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});


//purchase:id
router.get("/api/purchase/:id", async (req, res) => {
  try {

    const { id } = req.params;
    const { company_id, owner_id, owner_type, fromDate, toDate } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID missing",
      });
    }

    const idArray = id.split(",").map(Number);
    const from = fromDate ? String(fromDate).slice(0, 10) : null;
    const to = toDate ? String(toDate).slice(0, 10) : null;

    // Default: current financial year (Apr–Mar)
    let fyFrom = from;
    let fyTo = to;
    if (!fyFrom || !fyTo) {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const fyStart = m >= 3 ? y : y - 1;
      fyFrom = fyFrom || `${fyStart}-04-01`;
      fyTo = fyTo || `${fyStart + 1}-03-31`;
    }

    const [rows] = await pool.query(
      `
      SELECT 
        monthNo,
        SUM(total) AS total
      FROM (
        -- Item Wise
        SELECT 
          MONTH(pv.date) AS monthNo,
          SUM(pvi.amount) AS total
        FROM purchase_voucher_items pvi
        JOIN purchase_vouchers pv ON pvi.voucherId = pv.id
        WHERE pvi.purchaseLedgerId IN (?)
          AND pv.company_id = ?
          AND pv.owner_type = ?
          AND pv.owner_id = ?
          AND pv.mode = 'item-invoice'
          AND pv.date >= ? AND pv.date <= ?
        GROUP BY MONTH(pv.date)

        UNION ALL

        -- Accounting Invoice
        SELECT 
          MONTH(pv.date) AS monthNo,
          SUM(CASE WHEN ve.entry_type = 'debit' THEN ve.amount ELSE -ve.amount END) AS total
        FROM voucher_entries ve
        JOIN purchase_vouchers pv ON ve.voucher_id = pv.id
        WHERE ve.ledger_id IN (?)
          AND pv.company_id = ?
          AND pv.owner_type = ?
          AND pv.owner_id = ?
          AND pv.mode = 'accounting-invoice'
          AND pv.date >= ? AND pv.date <= ?
        GROUP BY MONTH(pv.date)
      ) AS combined
      GROUP BY monthNo
      ORDER BY monthNo
      `,
      [
        idArray, company_id, owner_type, owner_id, fyFrom, fyTo,
        idArray, company_id, owner_type, owner_id, fyFrom, fyTo,
      ]
    );

    res.json({
      success: true,
      data: rows,
    });

  } catch (error) {
    console.log("Purchase API Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

//sales:id
// sales:id (MONTH WISE)
router.get("/api/sales/:id", async (req, res) => {
  try {
    // console.log('hit hus saled :id')

    const { id } = req.params;
    const { company_id, owner_id, owner_type, fromDate, toDate } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID missing",
      });
    }

    // ids → array
    const idArray = id.split(",").map(Number);
    const from = fromDate ? String(fromDate).slice(0, 10) : null;
    const to = toDate ? String(toDate).slice(0, 10) : null;

    let fyFrom = from;
    let fyTo = to;
    if (!fyFrom || !fyTo) {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const fyStart = m >= 3 ? y : y - 1;
      fyFrom = fyFrom || `${fyStart}-04-01`;
      fyTo = fyTo || `${fyStart + 1}-03-31`;
    }

    const [rows] = await pool.query(
      `
      SELECT 
        monthNo,
        SUM(total) AS total
      FROM (
        -- Item Wise
        SELECT 
          MONTH(sv.date) AS monthNo,
          SUM(svi.amount) AS total
        FROM sales_voucher_items svi
        JOIN sales_vouchers sv ON svi.voucherId = sv.id
        WHERE svi.salesLedgerId IN (?)
          AND sv.company_id = ?
          AND sv.owner_type = ?
          AND sv.owner_id = ?
          AND sv.mode = 'item-invoice'
          AND sv.date >= ? AND sv.date <= ?
        GROUP BY MONTH(sv.date)

        UNION ALL

        -- Accounting Invoice
        SELECT 
          MONTH(sv.date) AS monthNo,
          SUM(CASE WHEN ve.entry_type = 'credit' THEN ve.amount ELSE -ve.amount END) AS total
        FROM voucher_entries ve
        JOIN sales_vouchers sv ON ve.voucher_id = sv.id
        WHERE ve.ledger_id IN (?)
          AND sv.company_id = ?
          AND sv.owner_type = ?
          AND sv.owner_id = ?
          AND sv.mode = 'accounting-invoice'
          AND sv.date >= ? AND sv.date <= ?
        GROUP BY MONTH(sv.date)
      ) AS combined
      GROUP BY monthNo
      ORDER BY monthNo
      `,
      [
        idArray, company_id, owner_type, owner_id, fyFrom, fyTo,
        idArray, company_id, owner_type, owner_id, fyFrom, fyTo,
      ]
    );

    res.json({
      success: true,
      data: rows,
    });

  } catch (error) {
    console.log("Sales Month API Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});



// GET /api/profit-loss
router.get('/api/profit-loss', async (req, res) => {
  try {
    // Get all ledger groups
    const [groups] = await pool.query('SELECT id, name, type FROM ledger_groups');

    // Get all ledgers with their group info
    const [ledgers] = await pool.query(`
      SELECT 
        l.id, l.name, l.group_id, l.opening_balance, l.balance_type,
        g.name AS group_name,
        g.type AS group_type
      FROM ledgers l
      LEFT JOIN ledger_groups g ON l.group_id = g.id
      ORDER BY g.type, g.name, l.name
    `);

    res.json({ ledgerGroups: groups, ledgers });

  } catch (err) {
    console.error('Error fetching profit & loss data:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
