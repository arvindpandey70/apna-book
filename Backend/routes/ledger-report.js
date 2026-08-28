const express = require("express");
const router = express.Router();
const db = require("../db");

// ✅ Auto-create salesLedgerId column if missing
async function ensureSalesLedgerColumn(connection) {
  try {
    const [rows] = await connection.execute(`
      SHOW COLUMNS FROM sales_voucher_items
      LIKE 'salesLedgerId'
    `);

    if (rows.length === 0) {
      console.log("⚠️ salesLedgerId missing → creating...");

      await connection.execute(`
        ALTER TABLE sales_voucher_items
        ADD COLUMN salesLedgerId INT AFTER voucherId
      `);

      console.log("✅ salesLedgerId created");
    }
  } catch (err) {
    if (!err.message.includes("Duplicate column")) {
      throw err;
    }
  }
}

router.get("/report", async (req, res) => {
  const { ledgerId } = req.query;


  if (!ledgerId) {
    return res.status(400).json({
      success: false,
      message: "Missing ledgerId",
    });
  }

  const connection = await db.getConnection();

  try {

    await ensureSalesLedgerColumn(connection);

    /* ===============================
       1️⃣ LEDGER MASTER
    =============================== */
    const [ledRows] = await connection.execute(
      `SELECT l.*, g.name AS groupName
       FROM ledgers l
       LEFT JOIN ledger_groups g ON g.id = l.group_id
       WHERE l.id = ?`,
      [ledgerId]
    );

    if (!ledRows.length) {
      return res.status(404).json({
        success: false,
        message: "Ledger not found",
      });
    }

    const ledger = ledRows[0];
    const lNameLower = String(ledger.name || "").toLowerCase();
    const isCgstLedger = lNameLower.includes("cgst");
    const isSgstLedger = lNameLower.includes("sgst") || lNameLower.includes("utgst");
    const isIgstLedger = lNameLower.includes("igst");
    const isGstLedger = isCgstLedger || isSgstLedger || isIgstLedger;
    let ledgerGstPct = 0;
    const pctMatch = lNameLower.match(/(\d+(\.\d+)?)/);
    if (isGstLedger && pctMatch) {
      ledgerGstPct = parseFloat(pctMatch[1]);
    }

    /* ===============================
       2️⃣ PURCHASE VOUCHERS → DEBIT/CREDIT
    =============================== */
    const [purchaseVouchers] = await connection.execute(
      `
SELECT
  pv.id,
  pv.number,
  pv.date,
  MAX(pv.mode) AS mode,
  pv.partyId,

  pv.subtotal,
  pv.cgstTotal,
  pv.sgstTotal,
  pv.igstTotal,
  pv.tdsTotal,
  pv.total,
  pv.discountTotal,

  MAX(pvi.purchaseLedgerId) AS purchaseLedgerId,
  MAX(pvi.cgstRate)        AS cgstRate,
  MAX(pvi.sgstRate)        AS sgstRate,
  MAX(pvi.igstRate)        AS igstRate,
  MAX(pvi.tdsRate)         AS tdsRate,
  MAX(pvi.discountLedgerId) AS discountLedgerId,

  MAX(l_party.name)    AS partyName,
  MAX(l_purchase.name) AS purchaseLedgerName

FROM purchase_vouchers pv

JOIN purchase_voucher_items pvi
  ON pvi.voucherId = pv.id

LEFT JOIN ledgers l_party
  ON l_party.id = pv.partyId

LEFT JOIN ledgers l_purchase
  ON l_purchase.id = pvi.purchaseLedgerId

WHERE
     pv.partyId = ?
  OR pvi.purchaseLedgerId = ?
  OR pvi.cgstRate = ? OR (${isCgstLedger && ledgerGstPct > 0 ? "pvi.cgstRate = ?" : "1=0"})
  OR pvi.sgstRate = ? OR (${isSgstLedger && ledgerGstPct > 0 ? "pvi.sgstRate = ?" : "1=0"})
  OR pvi.igstRate = ? OR (${isIgstLedger && ledgerGstPct > 0 ? "pvi.igstRate = ?" : "1=0"})
  OR pvi.tdsRate = ?
  OR pvi.discountLedgerId = ?

GROUP BY pv.id

ORDER BY pv.date ASC
`,
      [
        ledgerId, ledgerId, 
        ledgerId, ...(isCgstLedger && ledgerGstPct > 0 ? [ledgerGstPct] : []),
        ledgerId, ...(isSgstLedger && ledgerGstPct > 0 ? [ledgerGstPct] : []),
        ledgerId, ...(isIgstLedger && ledgerGstPct > 0 ? [ledgerGstPct] : []),
        ledgerId, ledgerId
      ]
    );


    /* ===============================
       3️⃣ SALES VOUCHERS → CREDIT/DEBIT
    =============================== */
    const [salesVouchers] = await connection.execute(
      `
  SELECT
    sv.id,
    sv.number,
    sv.date,
    sv.partyId,
    sv.subtotal,
    sv.cgstTotal,
    sv.sgstTotal,
    sv.igstTotal,
    sv.total,

    MAX(svi.salesLedgerId) AS salesLedgerId,
    MAX(svi.cgstRate) AS cgstRate,
    MAX(svi.sgstRate) AS sgstRate,
    MAX(svi.igstRate) AS igstRate,
    MAX(svi.discountLedgerId) AS discountLedgerId,

    MAX(l_party.name) AS partyName,
    MAX(l_sales.name) AS salesLedgerName,
    MAX(sv.discountTotal) AS discountTotal,
    MAX(sv.overallDiscountLedgerId) AS overallDiscountLedgerId,
    MAX(sv.overallDiscountAmount) AS overallDiscountAmount,
    SUM(CASE WHEN svi.discountLedgerId = ? THEN svi.discount ELSE 0 END) AS itemDiscountForThisLedger

  FROM sales_vouchers sv

  JOIN sales_voucher_items svi
    ON svi.voucherId = sv.id

  LEFT JOIN ledgers l_party
    ON l_party.id = sv.partyId

  LEFT JOIN ledgers l_sales
    ON l_sales.id = svi.salesLedgerId

  WHERE
       sv.partyId = ?
    OR svi.salesLedgerId = ?
    OR svi.discountLedgerId = ?
    OR sv.overallDiscountLedgerId = ?
    OR svi.cgstRate = ?
    OR svi.sgstRate = ?
    OR svi.igstRate = ?

  GROUP BY sv.id

  ORDER BY sv.date ASC
  `,
      [ledgerId, ledgerId, ledgerId, ledgerId, ledgerId, ledgerId, ledgerId, ledgerId]
    );

    /* ===============================
       3️⃣A QUOTATIONS → CREDIT/DEBIT
    =============================== */
    const [quotations] = await connection.execute(
      `SELECT sv.id, sv.number, sv.date, sv.narration, sv.partyId, sv.salesLedgerId, sv.total, sv.isQuotation,
              CASE 
                WHEN sv.salesLedgerId = ? THEN sv.partyId
                ELSE sv.salesLedgerId
              END AS otherLedgerId,
              CASE 
                WHEN sv.salesLedgerId = ? THEN l_party.name
                ELSE l_sales.name
              END AS partyName
       FROM sales_vouchers sv
       LEFT JOIN ledgers l_party ON l_party.id = sv.partyId
       LEFT JOIN ledgers l_sales ON l_sales.id = sv.salesLedgerId
       WHERE (sv.salesLedgerId = ? OR sv.partyId = ?)
         AND sv.isQuotation = 1
       ORDER BY sv.date ASC, sv.id ASC`,
      [ledgerId, ledgerId, ledgerId, ledgerId]
    );

    /* ===============================
       4️⃣ SALES ORDERS + ITEMS → CREDIT
    =============================== */
    const [salesOrderRows] = await connection.execute(
      `SELECT
         so.id   AS salesOrderId,
         so.number,
         so.date,
         so.partyId,
         so.salesLedgerId,
         so.status,
         so.narration,

         soi.id AS itemRowId,
         soi.itemId,
         soi.quantity,
         soi.rate,
         soi.discount,
         soi.amount
       FROM sales_orders so
       LEFT JOIN sales_order_items soi
         ON soi.salesOrderId = so.id
       WHERE so.salesLedgerId = ?
       ORDER BY so.date ASC, so.id ASC`,
      [ledgerId]
    );

    /* ===============================
       5️⃣ PURCHASE ORDERS + ITEMS → DEBIT 🔥
    =============================== */
    const [purchaseOrderRows] = await connection.execute(
      `SELECT
         po.id   AS purchaseOrderId,
         po.number,
         po.date,
         po.party_id,
         po.purchase_ledger_id,
         po.status,
         po.narration,

         poi.id AS itemRowId,
         poi.item_id,
         poi.quantity,
         poi.rate,
         poi.discount,
         poi.amount
       FROM purchase_orders po
       LEFT JOIN purchase_order_items poi
         ON poi.purchase_order_id = po.id
       WHERE po.purchase_ledger_id = ?
       ORDER BY po.date ASC, po.id ASC`,
      [ledgerId]
    );

    /* ===============================
      6️⃣ NORMAL LEDGER ENTRIES (WITH OPPOSITE LEDGER)
   =============================== */
    const [txns] = await connection.execute(
      `
SELECT
  vm.id AS voucher_id,
  vm.voucher_type,
  vm.voucher_number,
  vm.date,

  ve.entry_type,
  ve.amount,

  ve.ledger_id AS current_ledger,

  other.ledger_id AS opposite_ledger,
  l2.name AS opposite_ledger_name

FROM voucher_entries ve

JOIN voucher_main vm
  ON vm.id = ve.voucher_id

JOIN voucher_entries other
  ON other.voucher_id = ve.voucher_id
 AND other.ledger_id != ve.ledger_id

LEFT JOIN ledgers l2
  ON l2.id = other.ledger_id

WHERE ve.ledger_id = ?

  AND vm.voucher_type IN ('journal','contra','receipt','payment')

ORDER BY vm.date ASC
`,
      [ledgerId]
    );

    /* ===============================
       6️⃣C PURCHASE VOUCHER ACCOUNTING ENTRIES 🔥
       For vouchers saved in accounting mode we need to return ALL voucher_entries
       for vouchers that include the selected ledger. This ensures both the selected
       ledger's line and the opposite ledger lines (debits/credits) are shown.
    =============================== */

    // 1) Find purchase voucher IDs (company/owner scoped) that include this ledger
    const [pvIdRows] = await connection.execute(
      `SELECT DISTINCT pv.id AS voucher_id
       FROM purchase_vouchers pv
       JOIN voucher_entries ve ON ve.voucher_id = pv.id
       WHERE ve.ledger_id = ?
         AND pv.company_id = ?
         AND pv.owner_type = ?
         AND pv.owner_id = ?`,
      [ledgerId, ledger.company_id, ledger.owner_type, ledger.owner_id]
    );

    let purchaseAccountingEntries = [];
    if (pvIdRows && pvIdRows.length > 0) {
      const ids = pvIdRows.map((r) => r.voucher_id);
      const placeholders = ids.map(() => '?').join(',');

      const [accRows] = await connection.execute(
        `SELECT ve.id AS entry_id, ve.voucher_id, ve.ledger_id, COALESCE(l.name, ve.ledger_name) AS ledger_name,
                ve.amount, ve.entry_type, pv.number AS voucher_number, pv.date,
                pv.partyId, pv.mode, pv.total, l_header.name AS header_party_name
         FROM voucher_entries ve
         LEFT JOIN ledgers l ON l.id = ve.ledger_id
         LEFT JOIN purchase_vouchers pv ON pv.id = ve.voucher_id
         LEFT JOIN ledgers l_header ON l_header.id = pv.partyId
         WHERE ve.voucher_id IN (${placeholders})
           AND pv.mode = 'accounting-invoice'
         ORDER BY pv.date ASC, ve.voucher_id ASC, ve.id ASC`,
        ids
      );

      purchaseAccountingEntries = accRows;
    }

    /* ===============================
       6️⃣D SALES VOUCHER ACCOUNTING ENTRIES 🔥
       Mirror approach used for purchase vouchers: find sales voucher IDs that
       include the selected ledger, then load all voucher_entries for those vouchers
       and later emit counterpart rows (other ledger entries) so the ledger view
       shows the other parties with correct debit/credit mapping.
    =============================== */

    const [svIdRows] = await connection.execute(
      `SELECT DISTINCT sv.id AS voucher_id
       FROM sales_vouchers sv
       JOIN voucher_entries ve ON ve.voucher_id = sv.id
       WHERE ve.ledger_id = ?
         AND sv.company_id = ?
         AND sv.owner_type = ?
         AND sv.owner_id = ?`,
      [ledgerId, ledger.company_id, ledger.owner_type, ledger.owner_id]
    );

    let salesAccountingEntries = [];
    if (svIdRows && svIdRows.length > 0) {
      const ids = svIdRows.map((r) => r.voucher_id);
      const placeholders = ids.map(() => '?').join(',');

      const [accRows] = await connection.execute(
        `SELECT ve.id AS entry_id, ve.voucher_id, ve.ledger_id, COALESCE(l.name, ve.ledger_name) AS ledger_name,
                ve.amount, ve.entry_type, sv.number AS voucher_number, sv.date,
                sv.partyId, sv.mode, sv.total, l_header.name AS header_party_name
         FROM voucher_entries ve
         LEFT JOIN ledgers l ON l.id = ve.ledger_id
         LEFT JOIN sales_vouchers sv ON sv.id = ve.voucher_id
         LEFT JOIN ledgers l_header ON l_header.id = sv.partyId
         WHERE ve.voucher_id IN (${placeholders})
           AND sv.mode = 'accounting-invoice'
         ORDER BY sv.date ASC, ve.voucher_id ASC, ve.id ASC`,
        ids
      );

      salesAccountingEntries = accRows;
    }

    /* ===============================
       6️⃣A DEBIT / CREDIT NOTES 🔥 (NEW)
    =============================== */
    const [dcNotes] = await connection.execute(
      `
      SELECT dnv.id, dnv.date, dnv.number, dnv.party_id, dnv.narration, l.name AS partyName
      FROM debit_note_vouchers dnv
      LEFT JOIN ledgers l ON l.id = dnv.party_id
      WHERE narration IS NOT NULL
      ORDER BY date ASC, id ASC
      `
    );

    /* ===============================
       6️⃣B CREDIT NOTES 🔥
    =============================== */
    const [creditNotes] = await connection.execute(
      `
      SELECT cv.id, cv.date, cv.number, cv.mode, cv.narration, l.name AS partyName
      FROM credit_vouchers cv
      LEFT JOIN ledgers l ON l.id = cv.partyId
      WHERE narration IS NOT NULL
        AND cv.company_id = ?
        AND cv.owner_type = ?
        AND cv.owner_id = ?
      ORDER BY date ASC, id ASC
      `,
      [ledger.company_id, ledger.owner_type, ledger.owner_id]
    );

    /* ===============================
       7️⃣ BUILD TRANSACTIONS
    =============================== */
    let balance = Number(ledger.opening_balance || 0);
    if (ledger.balance_type === "credit") {
      balance = -balance;
    }
    const transactions = [];

    // Normal vouchers
    // Normal vouchers (Journal / Contra / Receipt / Payment)
    txns.forEach((row) => {

      const debit =
        row.entry_type === "debit"
          ? Number(row.amount)
          : 0;

      const credit =
        row.entry_type === "credit"
          ? Number(row.amount)
          : 0;

      balance += debit - credit;

      transactions.push({

        id: String(row.voucher_id),

        date: row.date,

        voucherType: row.voucher_type,

        voucherNo: row.voucher_number,


        particulars:
          row.opposite_ledger_name ||
          String(row.opposite_ledger),

        debit,
        credit,
        balance,
      });
    });


    // Debit  Notes
    dcNotes.forEach((note) => {
      let parsed;

      try {
        parsed = JSON.parse(note.narration);
      } catch {
        return;
      }

      if (!Array.isArray(parsed.accountingEntries)) return;

      parsed.accountingEntries.forEach((entry) => {
        // ✅ LEDGER FILTER
        if (String(entry.ledgerId) !== String(ledgerId)) return;

        const debit = entry.type === "debit" ? Number(entry.amount || 0) : 0;
        const credit = entry.type === "credit" ? Number(entry.amount || 0) : 0;

        balance += debit - credit;

        transactions.push({
          id: `DN-${note.id}-${entry.ledgerId}`,
          date: note.date,
          voucherType: "Debit Note",
          voucherNo: note.number,
          particulars: note.partyName || "Party",
          debit,
          credit,
          balance,
        });
      });
    });

    // Credit Notes
    creditNotes.forEach((note) => {
      let parsed;

      try {
        parsed = JSON.parse(note.narration);
      } catch {
        return;
      }

      if (!Array.isArray(parsed.accountingEntries)) return;

      parsed.accountingEntries.forEach((entry) => {
        if (String(entry.ledgerId) !== String(ledgerId)) return;

        const debit = entry.type === "debit" ? Number(entry.amount || 0) : 0;
        const credit = entry.type === "credit" ? Number(entry.amount || 0) : 0;

        balance += debit - credit;

        transactions.push({
          id: `CN-${note.id}-${entry.ledgerId}`,
          date: note.date,
          voucherType: "Credit Note",
          voucherNo: note.number,
          referenceNo: note.mode,
          particulars: note.partyName || "Party",
          debit,
          credit,
          balance,
        });
      });
    });

    // Purchase Voucher → Debit
    // Purchase Voucher → Proper Accounting
    purchaseVouchers.forEach((pv) => {
      // Skip aggregated purchase_vouchers when voucher was saved in accounting mode.
      // Accounting-mode vouchers are handled by `purAccTxns` (detailed voucher_entries).
      if (pv.mode && String(pv.mode).toLowerCase() === "accounting-invoice") return;
      let debit = 0;
      let credit = 0;
      let particulars = "";

      const currentLedger = Number(ledgerId);

      /* ========= PURCHASE ========= */
      if (currentLedger === Number(pv.purchaseLedgerId)) {
        debit = Number(pv.subtotal || 0);
        particulars = pv.partyName;
      }

      /* ========= PARTY ========= */
      else if (currentLedger === Number(pv.partyId)) {
        credit = Number(pv.total || 0);
        particulars = pv.purchaseLedgerName;
      }

      /* ========= IGST ========= */
      else if (currentLedger === Number(pv.igstRate) || (isIgstLedger && ledgerGstPct > 0 && Number(pv.igstRate) === ledgerGstPct)) {
        debit = Number(pv.igstTotal || 0);
        particulars = pv.partyName;
      }

      /* ========= CGST ========= */
      else if (currentLedger === Number(pv.cgstRate) || (isCgstLedger && ledgerGstPct > 0 && Number(pv.cgstRate) === ledgerGstPct)) {
        debit = Number(pv.cgstTotal || 0);
        particulars = pv.partyName;
      }

      /* ========= SGST ========= */
      else if (currentLedger === Number(pv.sgstRate) || (isSgstLedger && ledgerGstPct > 0 && Number(pv.sgstRate) === ledgerGstPct)) {
        debit = Number(pv.sgstTotal || 0);
        particulars = pv.partyName;
      }

      /* ========= TDS ========= */
      /* ========= DISCOUNT ========= */
      else if (currentLedger === Number(pv.discountLedgerId)) {
        credit = Number(pv.discountTotal || 0); // Income/Rebate
        particulars = pv.partyName;
      }

      /* ========= TDS ========= */
      else if (currentLedger === Number(pv.tdsRate)) {
        // Calculate what the total WOULD be if TDS was subtracted (Credit behavior)
        const totalIfCredit =
          Number(pv.subtotal || 0) +
          Number(pv.cgstTotal || 0) +
          Number(pv.sgstTotal || 0) +
          Number(pv.igstTotal || 0) -
          Number(pv.discountTotal || 0) -
          Number(pv.tdsTotal || 0);

        // Check if the actual stored total matches this credit calculation
        // Allowing for small floating point differences
        const isCredit = Math.abs(Number(pv.total) - totalIfCredit) < 0.01;

        if (isCredit) {
          credit = Number(pv.tdsTotal || 0); // Show in Credit
        } else {
          debit = Number(pv.tdsTotal || 0);  // Show in Debit (Default)
        }
        particulars = pv.partyName;
      }

      if (debit === 0 && credit === 0) return;

      // Balance updates for relevant ledgers
      if (
        currentLedger === Number(pv.partyId) ||
        currentLedger === Number(pv.purchaseLedgerId) ||
        currentLedger === Number(pv.cgstRate) ||
        currentLedger === Number(pv.sgstRate) ||
        currentLedger === Number(pv.igstRate) ||
        currentLedger === Number(pv.tdsRate) ||
        Number(pv.specificDiscount) > 0
      ) {
        balance += debit - credit;
      }

      transactions.push({
        id: String(pv.id),
        date: pv.date,
        voucherType: "Purchase",
        voucherNo: pv.number,
        particulars,
        debit,
        credit,
        balance,
      });
    });


    // Sales Voucher → Credit
    salesVouchers.forEach((sv) => {
      if (sv.mode && String(sv.mode).toLowerCase() === "accounting-invoice") return;
      let debit = 0;
      let credit = 0;
      let particulars = "";

      const currentLedger = Number(ledgerId);

      /* ========= SALES LEDGER ========= */
      if (currentLedger === Number(sv.salesLedgerId)) {
        credit = Number(sv.subtotal || 0);
        particulars = sv.partyName; // ✅ Party
      }

      /* ========= PARTY ========= */
      else if (currentLedger === Number(sv.partyId)) {
        debit = Number(sv.total || 0);
        particulars = sv.salesLedgerName; // ✅ Sales
      }

      /* ========= IGST ========= */
      else if (currentLedger === Number(sv.igstRate)) {
        credit = Number(sv.igstTotal || 0);
        particulars = sv.partyName; // ✅ Party
      }

      /* ========= CGST ========= */
      else if (currentLedger === Number(sv.cgstRate)) {
        credit = Number(sv.cgstTotal || 0);
        particulars = sv.partyName; // ✅ Party
      }

      /* ========= SGST ========= */
      else if (currentLedger === Number(sv.sgstRate)) {
        credit = Number(sv.sgstTotal || 0);
        particulars = sv.partyName; // ✅ Party
      }

      /* ========= DISCOUNT ========= */
      else if (Number(sv.itemDiscountForThisLedger) > 0 || currentLedger === Number(sv.overallDiscountLedgerId)) {
        let amt = 0;
        // 1. Add item-wise discounts assigned to this ledger
        amt += Number(sv.itemDiscountForThisLedger || 0);

        // 2. Add overall manual discount if assigned to this ledger
        if (currentLedger === Number(sv.overallDiscountLedgerId)) {
          amt += Number(sv.overallDiscountAmount || 0);
        }
        debit = amt;
        particulars = sv.partyName; // ✅ Party
      }

      if (debit === 0 && credit === 0) return;

      // Balance sirf Party + Sales pe
      if (
        currentLedger === Number(sv.partyId) ||
        currentLedger === Number(sv.salesLedgerId) ||
        currentLedger === Number(sv.discountLedgerId) ||
        currentLedger === Number(sv.overallDiscountLedgerId)
      ) {
        balance += debit - credit;
      }

      transactions.push({
        id: String(sv.id),
        date: sv.date,
        voucherType: "Sales",
        voucherNo: sv.number,
        particulars,
        debit,
        credit,
        balance,
      });
    });

    // Purchase Voucher Accounting Mode push (show counterpart entries for the selected ledger)
    // For each purchase voucher that includes the selected ledger, emit rows for the OTHER
    // ledger entries (counterparties). This makes the ledger view show Mohan/Mukesh when
    // Aman is selected, and ensures amounts appear in their correct Debit/Credit columns.
    {
      const pvMap = {};
      purchaseAccountingEntries.forEach((e) => {
        if (!pvMap[e.voucher_id]) pvMap[e.voucher_id] = [];
        pvMap[e.voucher_id].push(e);
      });

      Object.values(pvMap).forEach((entries) => {
        // Find the selected ledger's entry in this voucher
        const sel = entries.find((x) => String(x.ledger_id) === String(ledgerId));
        if (!sel) return;

        const mainVoucher = entries[0]; // All entries have the same pv.total, pv.partyId, etc.
        // For Purchase Accounting Invoices, the Party is the CREDIT entry. 
        // For Sales Accounting Invoices, the Party is the DEBIT entry.
        const partyEntry = entries.find(e => e.entry_type === "credit");
        const partyId = partyEntry ? partyEntry.ledger_id : mainVoucher.partyId;
        const partyName = partyEntry ? partyEntry.ledger_name : (mainVoucher.header_party_name || "Party");

        const isSelectedParty = String(ledgerId) === String(partyId);

        if (isSelectedParty) {
          // If viewing Party ledger, show ONE row for the total, with main counterpart (highest debit)
          const counterpartType = "debit"; // Party is Credit in Purchase, counterpart is Debit
          const counterpart = entries
            .filter(e => e.entry_type === counterpartType)
            .sort((a, b) => Number(b.amount) - Number(a.amount))[0];

          if (!counterpart) return;

          const debit = 0;
          const credit = Number(mainVoucher.total || 0); // Party in Purchase is Credit
          balance += debit - credit;

          transactions.push({
            id: `PUR-ACC-P-${mainVoucher.voucher_id}`,
            date: mainVoucher.date,
            voucherType: "Purchase",
            voucherNo: mainVoucher.voucher_number,
            particulars: counterpart.ledger_name || String(counterpart.ledger_id),
            debit,
            credit,
            balance,
          });
        } else {
          // If viewing non-party ledger (Purchase/Tax), show its own amount, particulars = Party Name from identified party
          const debit = sel.entry_type === "debit" ? Number(sel.amount) : 0;
          const credit = sel.entry_type === "credit" ? Number(sel.amount) : 0;
          balance += debit - credit;

          transactions.push({
            id: `PUR-ACC-L-${sel.entry_id}-${sel.voucher_id}`,
            date: sel.date,
            voucherType: "Purchase",
            voucherNo: sel.voucher_number,
            particulars: partyName,
            debit,
            credit,
            balance,
          });
        }
      });
    }

    // Sales Voucher Accounting Mode push (emit counterpart entries)
    {
      const svMap = {};
      salesAccountingEntries.forEach((e) => {
        if (!svMap[e.voucher_id]) svMap[e.voucher_id] = [];
        svMap[e.voucher_id].push(e);
      });

      Object.values(svMap).forEach((entries) => {
        const sel = entries.find((x) => String(x.ledger_id) === String(ledgerId));
        if (!sel) return;

        const mainVoucher = entries[0];
        const partyEntry = entries.find(e => e.entry_type === "debit");
        const partyId = partyEntry ? partyEntry.ledger_id : mainVoucher.partyId;
        const partyName = partyEntry ? partyEntry.ledger_name : (mainVoucher.header_party_name || "Party");

        const isSelectedParty = String(ledgerId) === String(partyId);

        if (isSelectedParty) {
          // Party in Sales is Debit, counterpart is Credit
          const counterpartType = "credit";
          const counterpart = entries
            .filter(e => e.entry_type === counterpartType)
            .sort((a, b) => Number(b.amount) - Number(a.amount))[0];

          if (!counterpart) return;

          const debit = Number(mainVoucher.total || 0);
          const credit = 0;
          balance += debit - credit;

          transactions.push({
            id: `SAL-ACC-P-${mainVoucher.voucher_id}`,
            date: mainVoucher.date,
            voucherType: "Sales",
            voucherNo: mainVoucher.voucher_number,
            particulars: counterpart.ledger_name || String(counterpart.ledger_id),
            debit,
            credit,
            balance,
          });
        } else {
          const debit = sel.entry_type === "debit" ? Number(sel.amount) : 0;
          const credit = sel.entry_type === "credit" ? Number(sel.amount) : 0;
          balance += debit - credit;

          transactions.push({
            id: `SAL-ACC-L-${sel.entry_id}-${sel.voucher_id}`,
            date: sel.date,
            voucherType: "Sales",
            voucherNo: sel.voucher_number,
            particulars: partyName,
            debit,
            credit,
            balance,
          });
        }
      });
    }

    // Quotations → Credit
    quotations.forEach((qt) => {
      const credit = Number(qt.total || 0);
      balance -= credit;

      transactions.push({
        id: String(qt.id),
        date: qt.date,
        voucherType: "Quotation",
        voucherNo: qt.number,
        particulars: qt.partyName || qt.partyId.toString(),
        debit: 0,
        credit,
        balance,
        isQuotation: true,
      });
    });

    /* ===============================
       8️⃣ GROUP SALES ORDERS
    =============================== */
    const salesOrdersMap = {};

    salesOrderRows.forEach((row) => {
      if (!salesOrdersMap[row.salesOrderId]) {
        salesOrdersMap[row.salesOrderId] = {
          id: row.salesOrderId,
          number: row.number,
          date: row.date,
          partyId: row.partyId,
          salesLedgerId: row.salesLedgerId,
          status: row.status,
          narration: row.narration,
          items: [],
          total: 0,
        };
      }

      if (row.itemRowId) {
        salesOrdersMap[row.salesOrderId].items.push({
          itemId: row.itemId,
          quantity: Number(row.quantity),
          rate: Number(row.rate),
          discount: Number(row.discount),
          amount: Number(row.amount),
        });

        salesOrdersMap[row.salesOrderId].total += Number(row.amount || 0);
      }
    });

    const salesOrders = Object.values(salesOrdersMap);

    // Sales Order → Credit
    salesOrders.forEach((so) => {
      const credit = Number(so.total || 0);
      balance -= credit;

      transactions.push({
        id: String(so.id),
        date: so.date,
        voucherType: "Sales Order",
        voucherNo: so.number,
        particulars: so.salesLedgerId.toString(),
        debit: 0,
        credit,
        balance,
      });
    });

    /* ===============================
       9️⃣ GROUP PURCHASE ORDERS 🔥
    =============================== */
    const purchaseOrdersMap = {};

    purchaseOrderRows.forEach((row) => {
      if (!purchaseOrdersMap[row.purchaseOrderId]) {
        purchaseOrdersMap[row.purchaseOrderId] = {
          id: row.purchaseOrderId,
          number: row.number,
          date: row.date,
          partyId: row.party_id,
          purchaseLedgerId: row.purchase_ledger_id,
          status: row.status,
          narration: row.narration,
          items: [],
          total: 0,
        };
      }

      if (row.itemRowId) {
        purchaseOrdersMap[row.purchaseOrderId].items.push({
          itemId: row.item_id,
          quantity: Number(row.quantity),
          rate: Number(row.rate),
          discount: Number(row.discount),
          amount: Number(row.amount),
        });

        purchaseOrdersMap[row.purchaseOrderId].total += Number(row.amount || 0);
      }
    });

    const purchaseOrders = Object.values(purchaseOrdersMap);

    // Purchase Order → Debit
    purchaseOrders.forEach((po) => {
      const debit = Number(po.total || 0);
      balance += debit;

      transactions.push({
        id: String(po.id),
        date: po.date,
        voucherType: "Purchase Order",
        voucherNo: po.number,
        particulars: po.purchaseLedgerId.toString(),
        debit,
        credit: 0,
        balance,
      });
    });

    /* ===============================
       🔟 SORT BY DATE & FILTER
    =============================== */
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate;

    let periodOpeningBalance = Number(ledger.opening_balance || 0);
    let periodDebit = 0;
    let periodCredit = 0;
    const filteredTransactions = [];

    const isDebitLedger = ledger.balance_type === "debit";

    transactions.forEach((t) => {
      const d = new Date(t.date);
      const tDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      if (fromDate && tDate < fromDate) {
        if (isDebitLedger) {
          periodOpeningBalance += (t.debit - t.credit);
        } else {
          periodOpeningBalance += (t.credit - t.debit);
        }
      } else if ((!fromDate || tDate >= fromDate) && (!toDate || tDate <= toDate)) {
        periodDebit += t.debit;
        periodCredit += t.credit;
        filteredTransactions.push(t);
      }
    });

    let periodClosingBalance = periodOpeningBalance;
    if (isDebitLedger) {
      periodClosingBalance += (periodDebit - periodCredit);
    } else {
      periodClosingBalance += (periodCredit - periodDebit);
    }

    return res.json({
      success: true,
      ledger,
      transactions: filteredTransactions,
      salesOrders,
      purchaseOrders,
      summary: {
        openingBalance: periodOpeningBalance,
        closingBalance: periodClosingBalance,
        totalDebit: periodDebit,
        totalCredit: periodCredit,
        transactionCount: filteredTransactions.length,
      },
    });
  } catch (err) {
    console.error("LEDGER REPORT ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  } finally {
    connection.release();
  }
});

module.exports = router;
