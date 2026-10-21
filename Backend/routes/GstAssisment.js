const express = require("express");
const router = express.Router();
const db = require("../db");


router.get("/purchase", async (req, res) => {
  try {

    const { company_id, owner_type, owner_id, year } = req.query;

    if (!company_id || !owner_type || !owner_id) {
      return res.status(400).json({
        success: false,
        message: "company_id, owner_type and owner_id are required",
      });
    }

    // ================================
    // FETCH ALL RELATED LEDGERS
    // ================================
    const [rows] = await db.execute(
      `
      SELECT id, name
      FROM ledgers
      WHERE company_id = ?
        AND owner_type = ?
        AND (owner_id = ? OR owner_id = 0)
        AND (
          LOWER(name) LIKE '%purchase%'
          OR LOWER(name) LIKE '%igst%'
          OR LOWER(name) LIKE '%cgst%'
          OR LOWER(name) LIKE '%sgst%'
          OR LOWER(name) LIKE '%intra%'
          OR LOWER(name) LIKE '%inter%'
        )
      ORDER BY name
      `,
      [company_id, owner_type, owner_id]
    );

    // ================================
    // GROUP LEDGERS
    // ================================
    const ledgers = {
      intraPurchase: [],
      interPurchase: [],
      igst: [],
      cgst: [],
      sgst: []
    };


    rows.forEach((row) => {

      const name = row.name.toLowerCase();

      // Intra Purchase
      if (name.includes("purchase") && name.includes("intra")) {
        ledgers.intraPurchase.push(row);
      }

      // Inter Purchase
      else if (name.includes("purchase") && name.includes("inter")) {
        ledgers.interPurchase.push(row);
      }

      // Taxes
      else if (name.includes("igst")) {
        ledgers.igst.push(row);
      }

      else if (name.includes("cgst")) {
        ledgers.cgst.push(row);
      }

      else if (name.includes("sgst")) {
        ledgers.sgst.push(row);
      }

    });

    // ================================
    // FETCH TRANSACTIONS
    // ================================
    const [transactions] = await db.execute(`
      SELECT
        MONTH(v.date) as monthVal,
        i.purchaseLedgerId,
        i.amount,
        i.cgstRate,
        i.sgstRate,
        i.igstRate
      FROM purchase_vouchers v
      JOIN purchase_voucher_items i ON v.id = i.voucherId
      WHERE v.company_id = ? 
        AND v.owner_type = ? 
        AND v.owner_id = ?
        ${year ? "AND YEAR(v.date) = ?" : ""}
    `, year ? [company_id, owner_type, owner_id, year] : [company_id, owner_type, owner_id]);

    // ================================
    // MONTH CONFIG
    // ================================
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const monthlyData = {};

    // ================================
    // LEDGER MAP
    // ================================
    const ledgerMap = new Map();
    rows.forEach(r => ledgerMap.set(r.id, r));

    // ================================
    // RATE EXTRACTOR
    // ================================
    const getRateFromLedger = (ledgerId) => {

      const ledger = ledgerMap.get(ledgerId);

      if (!ledger) return 0;

      // 18% , 2.5% , 28.00%
      const match = ledger.name.match(/(\d+(\.\d+)?)/);

      return match ? parseFloat(match[0]) : 0;
    };

    // ================================
    // PROCESS TRANSACTIONS
    // ================================
    transactions.forEach(t => {

      const mName = monthNames[t.monthVal - 1];

      if (!monthlyData[mName]) {
        monthlyData[mName] = {
          intraPurchase: {},
          interPurchase: {},
          cgst: {},
          sgst: {},
          igst: {},

          totalIntraPurchase: 0,
          totalInterPurchase: 0,

          totalCGST: 0,
          totalSGST: 0,
          totalIGST: 0
        };
      }

      const amount = Number(t.amount || 0);

      const purchaseLedgerId = t.purchaseLedgerId;

      const cgstLedgerId = Math.round(Number(t.cgstRate || 0));
      const sgstLedgerId = Math.round(Number(t.sgstRate || 0));
      const igstLedgerId = Math.round(Number(t.igstRate || 0));

      const purchaseLedger = ledgerMap.get(purchaseLedgerId);

      const purchaseName = purchaseLedger?.name?.toLowerCase() || "";

      // ================================
      // PURCHASE TYPE
      // ================================

      // INTRA
      if (purchaseName.includes("intra")) {

        monthlyData[mName].intraPurchase[purchaseLedgerId] =
          (monthlyData[mName].intraPurchase[purchaseLedgerId] || 0) + amount;

        monthlyData[mName].totalIntraPurchase += amount;
      }

      // INTER
      else if (purchaseName.includes("inter")) {

        monthlyData[mName].interPurchase[purchaseLedgerId] =
          (monthlyData[mName].interPurchase[purchaseLedgerId] || 0) + amount;

        monthlyData[mName].totalInterPurchase += amount;
      }

      // ================================
      // TAX CALCULATION
      // ================================

      // CGST
      if (cgstLedgerId > 0) {

        const rate = getRateFromLedger(cgstLedgerId);

        const tax = amount * (rate / 100);

        if (ledgerMap.has(cgstLedgerId)) {

          monthlyData[mName].cgst[cgstLedgerId] =
            (monthlyData[mName].cgst[cgstLedgerId] || 0) + tax;

          monthlyData[mName].totalCGST += tax;
        }
      }

      // SGST
      if (sgstLedgerId > 0) {

        const rate = getRateFromLedger(sgstLedgerId);

        const tax = amount * (rate / 100);

        if (ledgerMap.has(sgstLedgerId)) {

          monthlyData[mName].sgst[sgstLedgerId] =
            (monthlyData[mName].sgst[cgstLedgerId] || 0) + tax;

          monthlyData[mName].totalSGST += tax;
        }
      }

      // IGST
      if (igstLedgerId > 0) {

        const rate = getRateFromLedger(igstLedgerId);

        const tax = amount * (rate / 100);

        if (ledgerMap.has(igstLedgerId)) {

          monthlyData[mName].igst[igstLedgerId] =
            (monthlyData[mName].igst[igstLedgerId] || 0) + tax;

          monthlyData[mName].totalIGST += tax;
        }
      }

    });


    // ================================
    // RESPONSE
    // ================================
    return res.json({
      success: true,
      data: {
        ledgers,
        monthlyData
      }
    });

  } catch (error) {

    console.error("Purchase GST Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
});




router.get("/sales", async (req, res) => {
  try {

    const { company_id, owner_type, owner_id, year } = req.query;

    if (!company_id || !owner_type || !owner_id) {
      return res.status(400).json({
        success: false,
        message: "company_id, owner_type and owner_id are required",
      });
    }

    // ================================
    // FETCH ALL RELATED LEDGERS
    // ================================
    const [rows] = await db.execute(
      `
      SELECT id, name
      FROM ledgers
      WHERE company_id = ?
        AND owner_type = ?
        AND (owner_id = ? OR owner_id = 0)
        AND (
          LOWER(name) LIKE '%sales%'
          OR LOWER(name) LIKE '%igst%'
          OR LOWER(name) LIKE '%cgst%'
          OR LOWER(name) LIKE '%sgst%'
          OR LOWER(name) LIKE '%intra%'
          OR LOWER(name) LIKE '%inter%'
        )
      ORDER BY name
      `,
      [company_id, owner_type, owner_id]
    );

    // ================================
    // GROUP LEDGERS
    // ================================
    const ledgers = {
      intraSales: [],
      interSales: [],
      igst: [],
      cgst: [],
      sgst: []
    };

    rows.forEach((row) => {

      const name = row.name.toLowerCase();

      // Intra Sales
      if (name.includes("sales") && name.includes("intra")) {
        ledgers.intraSales.push(row);
      }

      // Inter Sales
      else if (name.includes("sales") && name.includes("inter")) {
        ledgers.interSales.push(row);
      }

      // Taxes
      else if (name.includes("igst")) {
        ledgers.igst.push(row);
      }

      else if (name.includes("cgst")) {
        ledgers.cgst.push(row);
      }

      else if (name.includes("sgst")) {
        ledgers.sgst.push(row);
      }

    });

    // ================================
    // FETCH TRANSACTIONS
    // ================================
    const [transactions] = await db.execute(`
      SELECT
        MONTH(v.date) as monthVal,
        i.salesLedgerId,
        i.amount,
        i.cgstRate,
        i.sgstRate,
        i.igstRate
      FROM sales_vouchers v
      JOIN sales_voucher_items i ON v.id = i.voucherId
      WHERE v.company_id = ? 
        AND v.owner_type = ? 
        AND v.owner_id = ?
        ${year ? "AND YEAR(v.date) = ?" : ""}
    `, year ? [company_id, owner_type, owner_id, year] : [company_id, owner_type, owner_id]);

    // ================================
    // MONTH CONFIG
    // ================================
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const monthlyData = {};

    // ================================
    // LEDGER MAP
    // ================================
    const ledgerMap = new Map();
    rows.forEach(r => ledgerMap.set(r.id, r));

    // ================================
    // RATE EXTRACTOR
    // ================================
    const getRateFromLedger = (ledgerId) => {

      const ledger = ledgerMap.get(ledgerId);

      if (!ledger) return 0;

      // 18% , 2.5% , 28%
      const match = ledger.name.match(/(\d+(\.\d+)?)/);

      return match ? parseFloat(match[0]) : 0;
    };

    // ================================
    // PROCESS TRANSACTIONS
    // ================================
    transactions.forEach(t => {

      const mName = monthNames[t.monthVal - 1];

      if (!monthlyData[mName]) {
        monthlyData[mName] = {

          intraSales: {},
          interSales: {},

          cgst: {},
          sgst: {},
          igst: {},

          totalIntraSales: 0,
          totalInterSales: 0,

          totalCGST: 0,
          totalSGST: 0,
          totalIGST: 0
        };
      }

      const amount = Number(t.amount || 0);

      const salesLedgerId = t.salesLedgerId;

      const cgstLedgerId = Math.round(Number(t.cgstRate || 0));
      const sgstLedgerId = Math.round(Number(t.sgstRate || 0));
      const igstLedgerId = Math.round(Number(t.igstRate || 0));

      const salesLedger = ledgerMap.get(salesLedgerId);

      const salesName = salesLedger?.name?.toLowerCase() || "";

      // ================================
      // SALES TYPE
      // ================================

      // INTRA
      if (salesName.includes("intra")) {

        monthlyData[mName].intraSales[salesLedgerId] =
          (monthlyData[mName].intraSales[salesLedgerId] || 0) + amount;

        monthlyData[mName].totalIntraSales += amount;
      }

      // INTER
      else if (salesName.includes("inter")) {

        monthlyData[mName].interSales[salesLedgerId] =
          (monthlyData[mName].interSales[salesLedgerId] || 0) + amount;

        monthlyData[mName].totalInterSales += amount;
      }

      // ================================
      // TAX CALCULATION
      // ================================

      // CGST
      if (cgstLedgerId > 0) {

        const rate = getRateFromLedger(cgstLedgerId);

        const tax = amount * (rate / 100);

        if (ledgerMap.has(cgstLedgerId)) {

          monthlyData[mName].cgst[cgstLedgerId] =
            (monthlyData[mName].cgst[cgstLedgerId] || 0) + tax;

          monthlyData[mName].totalCGST += tax;
        }
      }

      // SGST
      if (sgstLedgerId > 0) {

        const rate = getRateFromLedger(sgstLedgerId);

        const tax = amount * (rate / 100);

        if (ledgerMap.has(sgstLedgerId)) {

          monthlyData[mName].sgst[sgstLedgerId] =
            (monthlyData[mName].sgst[sgstLedgerId] || 0) + tax;

          monthlyData[mName].totalSGST += tax;
        }
      }

      // IGST
      if (igstLedgerId > 0) {

        const rate = getRateFromLedger(igstLedgerId);

        const tax = amount * (rate / 100);

        if (ledgerMap.has(igstLedgerId)) {

          monthlyData[mName].igst[igstLedgerId] =
            (monthlyData[mName].igst[igstLedgerId] || 0) + tax;

          monthlyData[mName].totalIGST += tax;
        }
      }

    });

    // ================================
    // RESPONSE
    // ================================
    return res.json({
      success: true,
      data: {
        ledgers,
        monthlyData
      }
    });

  } catch (error) {

    console.error("Sales GST Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
});


router.get("/credit-note", async (req, res) => {
  try {
    const { company_id, owner_type, owner_id } = req.query;

    if (!company_id || !owner_type || !owner_id) {
      return res.status(400).json({
        success: false,
        message: "company_id, owner_type and owner_id are required",
      });
    }

    // ================================
    // FETCH ALL RELATED LEDGERS
    // ================================
    const [rows] = await db.execute(
      `
      SELECT id, name
      FROM ledgers
      WHERE company_id = ?
        AND owner_type = ?
        AND (owner_id = ? OR owner_id = 0)
        AND (
          LOWER(name) LIKE '%sales%'
          OR LOWER(name) LIKE '%credit%'
          OR LOWER(name) LIKE '%igst%'
          OR LOWER(name) LIKE '%cgst%'
          OR LOWER(name) LIKE '%sgst%'
          OR LOWER(name) LIKE '%intra%'
          OR LOWER(name) LIKE '%inter%'
        )
      ORDER BY name
      `,
      [company_id, owner_type, owner_id]
    );

    // ================================
    // GROUP LEDGERS
    // ================================
    const ledgers = {
      intraSales: [],
      interSales: [],
      igst: [],
      cgst: [],
      sgst: []
    };

    rows.forEach((row) => {
      const name = row.name.toLowerCase();

      // Intra Sales
      if ((name.includes("sales") || name.includes("credit")) && name.includes("intra")) {
        ledgers.intraSales.push(row);
      }
      // Inter Sales
      else if ((name.includes("sales") || name.includes("credit")) && name.includes("inter")) {
        ledgers.interSales.push(row);
      }
      // Taxes
      else if (name.includes("igst")) {
        ledgers.igst.push(row);
      }
      else if (name.includes("cgst")) {
        ledgers.cgst.push(row);
      }
      else if (name.includes("sgst")) {
        ledgers.sgst.push(row);
      }
    });

    // ================================
    // FETCH VOUCHERS
    // ================================
    const [vouchers] = await db.execute(
      `
      SELECT id, date, narration
      FROM credit_vouchers
      WHERE company_id = ?
        AND owner_type = ?
        AND owner_id = ?
      `,
      [company_id, owner_type, owner_id]
    );

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const monthlyData = {};
    const ledgerMap = new Map();
    rows.forEach(r => ledgerMap.set(r.id, r));

    vouchers.forEach((v) => {
      let monthVal = null;
      if (v.date) {
        const d = new Date(v.date);
        if (!isNaN(d.getTime())) {
          monthVal = d.getMonth() + 1;
        }
      }
      if (!monthVal) return;

      const mName = monthNames[monthVal - 1];

      if (!monthlyData[mName]) {
        monthlyData[mName] = {
          intraSales: {},
          interSales: {},
          cgst: {},
          sgst: {},
          igst: {},
          totalIntraSales: 0,
          totalInterSales: 0,
          totalCGST: 0,
          totalSGST: 0,
          totalIGST: 0
        };
      }

      let entries = [];
      if (v.narration) {
        try {
          const parsed = JSON.parse(v.narration);
          entries = parsed.accountingEntries || [];
        } catch (err) {
          // not JSON, ignore
        }
      }

      entries.forEach((e) => {
        const ledgerId = Number(e.ledgerId);
        const amount = Number(e.amount || 0);
        if (!ledgerId || amount <= 0) return;

        const ledger = ledgerMap.get(ledgerId);
        if (!ledger) return;

        const ledgerName = ledger.name.toLowerCase();

        // 1. Check if it's Intra Sales
        if (ledgerName.includes("intra") && (ledgerName.includes("sales") || ledgerName.includes("credit"))) {
          monthlyData[mName].intraSales[ledgerId] =
            (monthlyData[mName].intraSales[ledgerId] || 0) + amount;
          monthlyData[mName].totalIntraSales += amount;
        }
        // 2. Check if it's Inter Sales
        else if (ledgerName.includes("inter") && (ledgerName.includes("sales") || ledgerName.includes("credit"))) {
          monthlyData[mName].interSales[ledgerId] =
            (monthlyData[mName].interSales[ledgerId] || 0) + amount;
          monthlyData[mName].totalInterSales += amount;
        }
        // 3. Check if it's CGST
        else if (ledgerName.includes("cgst")) {
          monthlyData[mName].cgst[ledgerId] =
            (monthlyData[mName].cgst[ledgerId] || 0) + amount;
          monthlyData[mName].totalCGST += amount;
        }
        // 4. Check if it's SGST
        else if (ledgerName.includes("sgst")) {
          monthlyData[mName].sgst[ledgerId] =
            (monthlyData[mName].sgst[ledgerId] || 0) + amount;
          monthlyData[mName].totalSGST += amount;
        }
        // 5. Check if it's IGST
        else if (ledgerName.includes("igst")) {
          monthlyData[mName].igst[ledgerId] =
            (monthlyData[mName].igst[ledgerId] || 0) + amount;
          monthlyData[mName].totalIGST += amount;
        }
      });
    });

    return res.json({
      success: true,
      data: {
        ledgers,
        monthlyData
      }
    });

  } catch (error) {
    console.error("Credit Note GST Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
});

router.get("/debit-note", async (req, res) => {
  try {
    const { company_id, owner_type, owner_id } = req.query;

    if (!company_id || !owner_type || !owner_id) {
      return res.status(400).json({
        success: false,
        message: "company_id, owner_type and owner_id are required",
      });
    }

    // ================================
    // FETCH ALL RELATED LEDGERS
    // ================================
    const [rows] = await db.execute(
      `
      SELECT id, name
      FROM ledgers
      WHERE company_id = ?
        AND owner_type = ?
        AND (owner_id = ? OR owner_id = 0)
        AND (
          LOWER(name) LIKE '%purchase%'
          OR LOWER(name) LIKE '%debit%'
          OR LOWER(name) LIKE '%igst%'
          OR LOWER(name) LIKE '%cgst%'
          OR LOWER(name) LIKE '%sgst%'
          OR LOWER(name) LIKE '%intra%'
          OR LOWER(name) LIKE '%inter%'
        )
      ORDER BY name
      `,
      [company_id, owner_type, owner_id]
    );

    // ================================
    // GROUP LEDGERS
    // ================================
    const ledgers = {
      intraPurchase: [],
      interPurchase: [],
      igst: [],
      cgst: [],
      sgst: []
    };

    rows.forEach((row) => {
      const name = row.name.toLowerCase();

      // Intra Purchase
      if ((name.includes("purchase") || name.includes("debit")) && name.includes("intra")) {
        ledgers.intraPurchase.push(row);
      }
      // Inter Purchase
      else if ((name.includes("purchase") || name.includes("debit")) && name.includes("inter")) {
        ledgers.interPurchase.push(row);
      }
      // Taxes
      else if (name.includes("igst")) {
        ledgers.igst.push(row);
      }
      else if (name.includes("cgst")) {
        ledgers.cgst.push(row);
      }
      else if (name.includes("sgst")) {
        ledgers.sgst.push(row);
      }
    });

    // ================================
    // FETCH VOUCHERS
    // ================================
    const [vouchers] = await db.execute(
      `
      SELECT id, date, narration
      FROM debit_note_vouchers
      WHERE company_id = ?
        AND owner_type = ?
        AND owner_id = ?
      `,
      [company_id, owner_type, owner_id]
    );

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const monthlyData = {};
    const ledgerMap = new Map();
    rows.forEach(r => ledgerMap.set(r.id, r));

    vouchers.forEach((v) => {
      let monthVal = null;
      if (v.date) {
        const d = new Date(v.date);
        if (!isNaN(d.getTime())) {
          monthVal = d.getMonth() + 1;
        }
      }
      if (!monthVal) return;

      const mName = monthNames[monthVal - 1];

      if (!monthlyData[mName]) {
        monthlyData[mName] = {
          intraPurchase: {},
          interPurchase: {},
          cgst: {},
          sgst: {},
          igst: {},
          totalIntraPurchase: 0,
          totalInterPurchase: 0,
          totalCGST: 0,
          totalSGST: 0,
          totalIGST: 0
        };
      }

      let entries = [];
      if (v.narration) {
        try {
          const parsed = JSON.parse(v.narration);
          entries = parsed.accountingEntries || [];
        } catch (err) {
          // not JSON, ignore
        }
      }

      entries.forEach((e) => {
        const ledgerId = Number(e.ledgerId);
        const amount = Number(e.amount || 0);
        if (!ledgerId || amount <= 0) return;

        const ledger = ledgerMap.get(ledgerId);
        if (!ledger) return;

        const ledgerName = ledger.name.toLowerCase();

        // 1. Check if it's Intra Purchase
        if (ledgerName.includes("intra") && (ledgerName.includes("purchase") || ledgerName.includes("debit"))) {
          monthlyData[mName].intraPurchase[ledgerId] =
            (monthlyData[mName].intraPurchase[ledgerId] || 0) + amount;
          monthlyData[mName].totalIntraPurchase += amount;
        }
        // 2. Check if it's Inter Purchase
        else if (ledgerName.includes("inter") && (ledgerName.includes("purchase") || ledgerName.includes("debit"))) {
          monthlyData[mName].interPurchase[ledgerId] =
            (monthlyData[mName].interPurchase[ledgerId] || 0) + amount;
          monthlyData[mName].totalInterPurchase += amount;
        }
        // 3. Check if it's CGST
        else if (ledgerName.includes("cgst")) {
          monthlyData[mName].cgst[ledgerId] =
            (monthlyData[mName].cgst[ledgerId] || 0) + amount;
          monthlyData[mName].totalCGST += amount;
        }
        // 4. Check if it's SGST
        else if (ledgerName.includes("sgst")) {
          monthlyData[mName].sgst[ledgerId] =
            (monthlyData[mName].sgst[ledgerId] || 0) + amount;
          monthlyData[mName].totalSGST += amount;
        }
        // 5. Check if it's IGST
        else if (ledgerName.includes("igst")) {
          monthlyData[mName].igst[ledgerId] =
            (monthlyData[mName].igst[ledgerId] || 0) + amount;
          monthlyData[mName].totalIGST += amount;
        }
      });
    });

    return res.json({
      success: true,
      data: {
        ledgers,
        monthlyData
      }
    });

  } catch (error) {
    console.error("Debit Note GST Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
});


router.get("/trading-account", async (req, res) => {
  try {
    const { company_id, owner_type, owner_id, year } = req.query;

    if (!company_id || !owner_type || !owner_id) {
      return res.status(400).json({
        success: false,
        message: "company_id, owner_type and owner_id are required",
      });
    }

    // Helper: Normalize rate string or name to float percentage
    const extractRateFromName = (name) => {
      if (!name) return null;
      const lower = name.toLowerCase();
      if (lower.includes("0%") || lower.includes("non-gst") || lower.includes("nongst") || lower.includes("exempt") || lower.includes("nil")) {
        return 0;
      }
      const match = name.match(/(\d+(\.\d+)?)\s*%/);
      if (match) return parseFloat(match[1]);
      const numMatch = name.match(/(\d+(\.\d+)?)/);
      if (numMatch && (lower.includes("gst") || lower.includes("tax") || lower.includes("purchase") || lower.includes("sale") || lower.includes("intra") || lower.includes("inter") || lower.includes("debit") || lower.includes("credit"))) {
        return parseFloat(numMatch[1]);
      }
      return null;
    };

    // 1. Fetch all ledgers to build lookup and rate extractor
    const [ledgers] = await db.execute(
      `SELECT id, name, group_id, opening_balance, balance_type 
       FROM ledgers 
       WHERE company_id = ? AND owner_type = ? AND (owner_id = ? OR owner_id = 0)`,
      [company_id, owner_type, owner_id]
    );

    const ledgerMap = new Map();
    ledgers.forEach(l => ledgerMap.set(Number(l.id), l));

    const getTaxRate = (rateVal, isCgstOrSgst = false) => {
      if (!rateVal) return 0;
      const num = Number(rateVal);
      if (isNaN(num) || num <= 0) return 0;
      if (num <= 40) return num; // Already tax rate percentage
      const ledger = ledgerMap.get(num);
      if (!ledger) return 0;
      const extracted = extractRateFromName(ledger.name);
      return extracted !== null ? extracted : 0;
    };

    const getCombinedTaxRate = (cgstRate, sgstRate, igstRate, fallbackLedgerId = null, itemRate = null) => {
      const igst = getTaxRate(igstRate, false);
      if (igst > 0) return igst;
      const cgst = getTaxRate(cgstRate, true);
      const sgst = getTaxRate(sgstRate, true);
      if (cgst > 0 || sgst > 0) return cgst + sgst;
      if (fallbackLedgerId) {
        const l = ledgerMap.get(Number(fallbackLedgerId));
        if (l) {
          const r = extractRateFromName(l.name);
          if (r !== null) return r;
        }
      }
      if (itemRate !== null && !isNaN(Number(itemRate)) && Number(itemRate) > 0) {
        return Number(itemRate);
      }
      return 0;
    };

    // 2. Fetch stock groups
    const [stockGroups] = await db.execute(
      `SELECT id, name FROM stock_groups WHERE company_id = ? AND owner_type = ? AND owner_id = ?`,
      [company_id, owner_type, owner_id]
    );
    const stockGroupMap = {};
    stockGroups.forEach(g => {
      stockGroupMap[g.id] = g.name;
    });

    // 3. Fetch stock items
    const [stockItems] = await db.execute(
      `SELECT id, name, categoryId, batches, gstRate, gstLedgerId, cgstLedgerId, sgstLedgerId 
       FROM stock_items 
       WHERE company_id = ? AND owner_type = ? AND owner_id = ?`,
      [company_id, owner_type, owner_id]
    );

    const getItemRate = (item) => {
      if (Number(item.gstRate || 0) > 0) return Number(item.gstRate);
      if (item.gstLedgerId) {
        const l = ledgerMap.get(Number(item.gstLedgerId));
        if (l) {
          const r = extractRateFromName(l.name);
          if (r !== null) return r;
        }
      }
      if (item.cgstLedgerId || item.sgstLedgerId) {
        const c = ledgerMap.get(Number(item.cgstLedgerId));
        const s = ledgerMap.get(Number(item.sgstLedgerId));
        const cr = c ? extractRateFromName(c.name) || 0 : 0;
        const sr = s ? extractRateFromName(s.name) || 0 : 0;
        if (cr > 0 || sr > 0) return cr + sr;
      }
      return 0;
    };

    // 4. Compute Opening Stock grouped by GST Rate
    const openingStockByRate = {};
    const openingStockByRateAndGroup = {};
    const openingStockByRateAndItem = {};
    const itemMap = {};

    stockItems.forEach(item => {
      const rate = getItemRate(item);
      const groupName = stockGroupMap[item.categoryId] || "Primary";
      const itemName = item.name;

      itemMap[item.id] = {
        id: item.id,
        name: item.name,
        gstRate: rate,
        groupName: groupName,
        openingQty: 0,
        openingValue: 0,
        inwardQty: 0,
        inwardValue: 0,
        outwardQty: 0
      };

      let batches = [];
      try {
        batches = item.batches ? JSON.parse(item.batches) : [];
      } catch (e) {}

      let opVal = 0;
      if (batches && batches.length > 0) {
        batches.forEach(b => {
          const q = Number(b.batchQuantity || 0);
          const r = Number(b.openingRate || (b.mode === 'opening' ? b.batchRate : 0) || 0);
          const v = Number(b.openingValue || (q * r) || 0);
          if (b.openingRate || b.openingValue || b.mode === 'opening') {
            opVal += v;
            itemMap[item.id].openingQty += q;
            itemMap[item.id].openingValue += v;
          }
        });
      }

      openingStockByRate[rate] = (openingStockByRate[rate] || 0) + opVal;
      if (!openingStockByRateAndGroup[rate]) openingStockByRateAndGroup[rate] = {};
      openingStockByRateAndGroup[rate][groupName] = (openingStockByRateAndGroup[rate][groupName] || 0) + opVal;

      if (!openingStockByRateAndItem[rate]) openingStockByRateAndItem[rate] = {};
      openingStockByRateAndItem[rate][itemName] = (openingStockByRateAndItem[rate][itemName] || 0) + opVal;
    });

    // 5. Compute Purchases by GST Rate
    const purchaseByRate = {};
    const purchaseIntraByRate = {};
    const purchaseInterByRate = {};

    // 5a. Item invoice purchases
    const [purchaseHistory] = await db.execute(
      `SELECT i.itemId, i.quantity AS purchaseQuantity, i.rate, i.amount, i.cgstRate, i.sgstRate, i.igstRate, i.purchaseLedgerId, v.date
       FROM purchase_voucher_items i
       JOIN purchase_vouchers v ON i.voucherId = v.id
       WHERE v.company_id = ? AND v.owner_type = ? AND v.owner_id = ?
       ${year ? "AND YEAR(v.date) = ?" : ""}`,
      year ? [company_id, owner_type, owner_id, year] : [company_id, owner_type, owner_id]
    );

    purchaseHistory.forEach(p => {
      const item = itemMap[p.itemId];
      const rate = getCombinedTaxRate(p.cgstRate, p.sgstRate, p.igstRate, p.purchaseLedgerId, item?.gstRate);
      const amt = Number(p.amount || 0);
      purchaseByRate[rate] = (purchaseByRate[rate] || 0) + amt;

      const pLedger = ledgerMap.get(Number(p.purchaseLedgerId));
      const pName = pLedger?.name?.toLowerCase() || "";
      const isInter = pName.includes("inter") || Number(p.igstRate || 0) > 0;
      if (isInter) {
        purchaseInterByRate[rate] = (purchaseInterByRate[rate] || 0) + amt;
      } else {
        purchaseIntraByRate[rate] = (purchaseIntraByRate[rate] || 0) + amt;
      }

      if (item) {
        const q = Number(p.purchaseQuantity || 0);
        const v = q * Number(p.rate || 0);
        item.inwardQty += q;
        item.inwardValue += v;
      }
    });

    // 5b. Accounting invoice purchases
    const [acctPurchases] = await db.execute(
      `SELECT id, subtotal, purchaseLedgerId, cgstTotal, sgstTotal, igstTotal, date
       FROM purchase_vouchers
       WHERE company_id = ? AND owner_type = ? AND owner_id = ? AND mode = 'accounting-invoice'
       ${year ? "AND YEAR(date) = ?" : ""}`,
      year ? [company_id, owner_type, owner_id, year] : [company_id, owner_type, owner_id]
    );

    acctPurchases.forEach(v => {
      const l = ledgerMap.get(Number(v.purchaseLedgerId));
      let rate = l ? extractRateFromName(l.name) : null;
      if (rate === null) {
        const sub = Number(v.subtotal || 0);
        const tax = Number(v.cgstTotal || 0) + Number(v.sgstTotal || 0) + Number(v.igstTotal || 0);
        rate = sub > 0 ? Math.round((tax / sub) * 100) : 0;
      }
      const amt = Number(v.subtotal || 0);
      purchaseByRate[rate] = (purchaseByRate[rate] || 0) + amt;

      const pName = l?.name?.toLowerCase() || "";
      const isInter = pName.includes("inter") || Number(v.igstTotal || 0) > 0;
      if (isInter) {
        purchaseInterByRate[rate] = (purchaseInterByRate[rate] || 0) + amt;
      } else {
        purchaseIntraByRate[rate] = (purchaseIntraByRate[rate] || 0) + amt;
      }
    });

    // 6. Compute Sales by GST Rate
    const salesByRate = {};
    const salesIntraByRate = {};
    const salesInterByRate = {};

    // 6a. Item invoice sales
    const [salesHistory] = await db.execute(
      `SELECT i.itemId, i.quantity AS qtyChange, i.amount, i.cgstRate, i.sgstRate, i.igstRate, i.salesLedgerId, v.date
       FROM sales_voucher_items i
       JOIN sales_vouchers v ON i.voucherId = v.id
       WHERE v.company_id = ? AND v.owner_type = ? AND v.owner_id = ?
       ${year ? "AND YEAR(v.date) = ?" : ""}`,
      year ? [company_id, owner_type, owner_id, year] : [company_id, owner_type, owner_id]
    );

    salesHistory.forEach(s => {
      const item = itemMap[s.itemId];
      const rate = getCombinedTaxRate(s.cgstRate, s.sgstRate, s.igstRate, s.salesLedgerId, item?.gstRate);
      const amt = Number(s.amount || 0);
      salesByRate[rate] = (salesByRate[rate] || 0) + amt;

      const sLedger = ledgerMap.get(Number(s.salesLedgerId));
      const sName = sLedger?.name?.toLowerCase() || "";
      const isInter = sName.includes("inter") || Number(s.igstRate || 0) > 0;
      if (isInter) {
        salesInterByRate[rate] = (salesInterByRate[rate] || 0) + amt;
      } else {
        salesIntraByRate[rate] = (salesIntraByRate[rate] || 0) + amt;
      }

      if (item) {
        item.outwardQty += Math.abs(Number(s.qtyChange || 0));
      }
    });

    // 6b. Accounting invoice sales
    const [acctSales] = await db.execute(
      `SELECT id, subtotal, salesLedgerId, cgstTotal, sgstTotal, igstTotal, date
       FROM sales_vouchers
       WHERE company_id = ? AND owner_type = ? AND owner_id = ? AND mode = 'accounting-invoice'
       ${year ? "AND YEAR(date) = ?" : ""}`,
      year ? [company_id, owner_type, owner_id, year] : [company_id, owner_type, owner_id]
    );

    acctSales.forEach(v => {
      const l = ledgerMap.get(Number(v.salesLedgerId));
      let rate = l ? extractRateFromName(l.name) : null;
      if (rate === null) {
        const sub = Number(v.subtotal || 0);
        const tax = Number(v.cgstTotal || 0) + Number(v.sgstTotal || 0) + Number(v.igstTotal || 0);
        rate = sub > 0 ? Math.round((tax / sub) * 100) : 0;
      }
      const amt = Number(v.subtotal || 0);
      salesByRate[rate] = (salesByRate[rate] || 0) + amt;

      const sName = l?.name?.toLowerCase() || "";
      const isInter = sName.includes("inter") || Number(v.igstTotal || 0) > 0;
      if (isInter) {
        salesInterByRate[rate] = (salesInterByRate[rate] || 0) + amt;
      } else {
        salesIntraByRate[rate] = (salesIntraByRate[rate] || 0) + amt;
      }
    });

    // 7. Debit Notes (Purchase Returns)
    const debitNoteByRate = {};
    const [dnVouchers] = await db.execute(
      `SELECT narration, date FROM debit_note_vouchers 
       WHERE company_id = ? AND owner_type = ? AND owner_id = ?
       ${year ? "AND YEAR(date) = ?" : ""}`,
      year ? [company_id, owner_type, owner_id, year] : [company_id, owner_type, owner_id]
    );

    dnVouchers.forEach(v => {
      if (!v.narration) return;
      try {
        const parsed = JSON.parse(v.narration);
        (parsed.accountingEntries || []).forEach(e => {
          const lid = Number(e.ledgerId);
          const l = ledgerMap.get(lid);
          if (!l) return;
          const lname = l.name.toLowerCase();
          if (lname.includes("purchase") || lname.includes("debit")) {
            const rate = extractRateFromName(l.name) || 0;
            debitNoteByRate[rate] = (debitNoteByRate[rate] || 0) + Number(e.amount || 0);
          }
        });
      } catch (err) {}
    });

    // 8. Credit Notes (Sales Returns)
    const creditNoteByRate = {};
    const [cnVouchers] = await db.execute(
      `SELECT narration, date FROM credit_vouchers 
       WHERE company_id = ? AND owner_type = ? AND owner_id = ?
       ${year ? "AND YEAR(date) = ?" : ""}`,
      year ? [company_id, owner_type, owner_id, year] : [company_id, owner_type, owner_id]
    );

    cnVouchers.forEach(v => {
      if (!v.narration) return;
      try {
        const parsed = JSON.parse(v.narration);
        (parsed.accountingEntries || []).forEach(e => {
          const lid = Number(e.ledgerId);
          const l = ledgerMap.get(lid);
          if (!l) return;
          const lname = l.name.toLowerCase();
          if (lname.includes("sales") || lname.includes("credit")) {
            const rate = extractRateFromName(l.name) || 0;
            creditNoteByRate[rate] = (creditNoteByRate[rate] || 0) + Number(e.amount || 0);
          }
        });
      } catch (err) {}
    });

    // 9. Compute Closing Stock by rate using weighted average cost
    const closingStockByRate = {};
    const closingStockByRateAndGroup = {};
    const closingStockByRateAndItem = {};

    Object.values(itemMap).forEach(item => {
      const rate = item.gstRate;
      const groupName = item.groupName;
      const itemName = item.name;
      const totalInQty = item.openingQty + item.inwardQty;
      const totalInValue = item.openingValue + item.inwardValue;
      const avgRate = totalInQty > 0 ? totalInValue / totalInQty : 0;
      const closingQty = totalInQty - item.outwardQty;
      const closingValue = Math.max(0, closingQty * avgRate);

      closingStockByRate[rate] = (closingStockByRate[rate] || 0) + closingValue;

      if (!closingStockByRateAndGroup[rate]) closingStockByRateAndGroup[rate] = {};
      closingStockByRateAndGroup[rate][groupName] = (closingStockByRateAndGroup[rate][groupName] || 0) + closingValue;

      if (!closingStockByRateAndItem[rate]) closingStockByRateAndItem[rate] = {};
      closingStockByRateAndItem[rate][itemName] = (closingStockByRateAndItem[rate][itemName] || 0) + closingValue;
    });

    // 10. Direct Expenses
    const [groups] = await db.execute(`SELECT id, name, parent FROM ledger_groups`);
    const directGroups = new Set([-7]);
    let added = true;
    while (added) {
      added = false;
      groups.forEach(g => {
        if (g.parent && directGroups.has(Number(g.parent)) && !directGroups.has(g.id)) {
          directGroups.add(g.id);
          added = true;
        }
      });
    }

    const directLedgers = Array.from(ledgerMap.values()).filter(l => {
      const isDirect = directGroups.has(Number(l.group_id));
      const lname = (l.name || "").toLowerCase();
      const isTax = lname.includes("cgst") || lname.includes("sgst") || lname.includes("igst") || lname.includes("tax payable") || lname.includes("gst payable");
      return isDirect && !isTax;
    });
    const directExpensesByRate = {};

    for (const ledger of directLedgers) {
      const [entries] = await db.execute(
        `SELECT SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE -amount END) AS balance
         FROM voucher_entries ve
         JOIN voucher_main v ON ve.voucher_id = v.id
         WHERE ve.ledger_id = ? AND v.company_id = ? AND v.owner_type = ? AND v.owner_id = ?
         ${year ? "AND YEAR(v.date) = ?" : ""}`,
        year ? [ledger.id, company_id, owner_type, owner_id, year] : [ledger.id, company_id, owner_type, owner_id]
      );
      const balance = Number(entries[0]?.balance || 0) + Number(ledger.opening_balance || 0);
      if (balance === 0) continue;

      const rate = extractRateFromName(ledger.name);
      const targetRate = rate !== null ? rate : 0;
      directExpensesByRate[targetRate] = (directExpensesByRate[targetRate] || 0) + balance;
    }

    // 11. Normalize all rates dynamically from company trading ledgers, transactions, and stock items
    // EXCLUDE GST tax ledgers (CGST, SGST, IGST) from generating trading heads
    const tradingLedgers = Array.from(ledgerMap.values()).filter(l => {
      const gid = Number(l.group_id);
      const lname = (l.name || "").toLowerCase();
      // Exclude tax groups (-103, -115, -6) and tax names
      if (gid === -103 || gid === -115 || gid === -6) return false;
      if (lname.includes("cgst") || lname.includes("sgst") || lname.includes("igst") || lname.includes("tax payable") || lname.includes("gst payable")) return false;
      return gid === -15 || gid === -16 || gid === -7 || gid === -108 || lname.includes("purchase") || lname.includes("sales") || lname.includes("stock");
    });

    const dataRates = new Set();

    // Rates from trading transactions with data
    Object.keys(openingStockByRate).forEach(r => { if (Number(openingStockByRate[r]) > 0) dataRates.add(Number(r)); });
    Object.keys(purchaseByRate).forEach(r => { if (Number(purchaseByRate[r]) !== 0) dataRates.add(Number(r)); });
    Object.keys(salesByRate).forEach(r => { if (Number(salesByRate[r]) !== 0) dataRates.add(Number(r)); });
    Object.keys(closingStockByRate).forEach(r => { if (Number(closingStockByRate[r]) > 0) dataRates.add(Number(r)); });
    Object.keys(directExpensesByRate).forEach(r => { if (Number(directExpensesByRate[r]) > 0) dataRates.add(Number(r)); });
    Object.keys(debitNoteByRate).forEach(r => { if (Number(debitNoteByRate[r]) !== 0) dataRates.add(Number(r)); });
    Object.keys(creditNoteByRate).forEach(r => { if (Number(creditNoteByRate[r]) !== 0) dataRates.add(Number(r)); });

    // Rates from existing company trading ledgers (Purchase, Sales, Stock)
    tradingLedgers.forEach(l => {
      const r = extractRateFromName(l.name);
      if (r !== null) dataRates.add(r);
    });

    // If company has no rates at all, fallback to [0]
    if (dataRates.size === 0) dataRates.add(0);

    const allRates = Array.from(dataRates).sort((a, b) => a - b);

    // 12. Build rate-wise rows
    const tradingAccount = allRates.map(rate => {
      const openingStock = Number((openingStockByRate[rate] || 0).toFixed(2));
      const grossPurchase = Number((purchaseByRate[rate] || 0).toFixed(2));
      const purchaseIntra = Number((purchaseIntraByRate[rate] || 0).toFixed(2));
      const purchaseInter = Number((purchaseInterByRate[rate] || 0).toFixed(2));
      const debitNote = Number((debitNoteByRate[rate] || 0).toFixed(2));
      const purchase = Number((grossPurchase - debitNote).toFixed(2));

      const totalStockPlusPurchase = Number((openingStock + purchase).toFixed(2));
      const directExpense = Number((directExpensesByRate[rate] || 0).toFixed(2));
      const totalDebitBeforeGP = Number((totalStockPlusPurchase + directExpense).toFixed(2));

      const grossSales = Number((salesByRate[rate] || 0).toFixed(2));
      const salesIntra = Number((salesIntraByRate[rate] || 0).toFixed(2));
      const salesInter = Number((salesInterByRate[rate] || 0).toFixed(2));
      const creditNote = Number((creditNoteByRate[rate] || 0).toFixed(2));
      const sales = Number((grossSales - creditNote).toFixed(2));

      const closingStock = Number((closingStockByRate[rate] || 0).toFixed(2));
      const totalCredit = Number((sales + closingStock).toFixed(2));

      // Accounting Balancing:
      const grossProfit = Number((totalCredit - totalDebitBeforeGP).toFixed(2));
      const totalDebitSide = grossProfit >= 0 ? Number((totalDebitBeforeGP + grossProfit).toFixed(2)) : totalDebitBeforeGP;
      const totalCreditSide = grossProfit >= 0 ? totalCredit : Number((totalCredit + Math.abs(grossProfit)).toFixed(2));

      return {
        gstRate: rate,
        openingStock,
        openingStockByGroup: openingStockByRateAndGroup[rate] || {},
        openingStockByItem: openingStockByRateAndItem[rate] || {},
        grossPurchase,
        purchase,
        purchaseIntra,
        purchaseInter,
        debitNote,
        totalStockPlusPurchase,
        directExpense,
        totalDebitBeforeGP,
        grossProfit,
        totalDebitSide,
        grossSales,
        sales,
        salesIntra,
        salesInter,
        creditNote,
        closingStock,
        closingStockByGroup: closingStockByRateAndGroup[rate] || {},
        closingStockByItem: closingStockByRateAndItem[rate] || {},
        totalCreditSide
      };
    });

    res.json({
      success: true,
      data: tradingAccount,
      rates: allRates
    });

  } catch (error) {
    console.error("Trading Account GST Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
});


module.exports = router;

