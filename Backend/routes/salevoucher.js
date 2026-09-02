const express = require("express");
const router = express.Router();
const db = require("../db"); // Make sure db is using mysql2.promise()
const { generateVoucherNumber, renumberVouchers } = require("../utils/generateVoucherNumber");
const { getFinancialYear } = require("../utils/financialYear");

// GET Ledgers
router.get("/ledgers", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM ledgers");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Items
router.get("/items", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM items");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Item by Barcode
router.get("/item-by-barcode", async (req, res) => {
  const { barcode, company_id, owner_type, owner_id } = req.query;

  if (!barcode) {
    return res.status(400).json({ success: false, message: "Barcode is required" });
  }

  try {
    const query = `
      SELECT s.*, NULL as stockGroupName, u.name as unitName
      FROM stock_items s
      LEFT JOIN stock_units u ON s.unit = u.id
      WHERE s.barcode = ? AND s.company_id = ? AND s.owner_type = ? AND s.owner_id = ?
    `;
    const [rows] = await db.execute(query, [
      barcode,
      company_id,
      owner_type,
      owner_id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Item not found for this barcode",
      });
    }

    const item = rows[0];

    // Parse batches if they are stored as string
    if (item.batches && typeof item.batches === "string") {
      try {
        item.batches = JSON.parse(item.batches);
      } catch (e) {
        item.batches = [];
      }
    }

    res.json({ success: true, data: item });
  } catch (err) {
    console.error("Barcode lookup error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Sales Voucher
// 🔹 Helper: Clean State Name
const cleanState = (state = "") =>
  state.replace(/\(.*?\)/g, "").trim().toLowerCase();

// ================= AUTO CHECK COLUMN =================
async function ensureSalesLedgerColumn() {
  const [rows] = await db.query(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sales_voucher_items'
      AND COLUMN_NAME = 'salesLedgerId'      
    `
  );

  if (rows.length === 0) {
    console.log("⚠️ salesLedgerId missing → creating...");

    await db.query(`
      ALTER TABLE sales_voucher_items
      ADD COLUMN salesLedgerId INT NULL
    `);

    console.log("✅ salesLedgerId column created");
  }
}

// ================= AUTO CHECK DISCOUNT LEDGER COLUMN =================
async function ensureDiscountLedgerColumn() {
  const [rows] = await db.query(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sales_voucher_items'
      AND COLUMN_NAME = 'discountLedgerId'
    `
  );

  if (rows.length === 0) {
    console.log("⚠️ discountLedgerId missing → creating...");

    await db.query(`
      ALTER TABLE sales_voucher_items
      ADD COLUMN discountLedgerId INT NULL
    `);

    console.log("✅ discountLedgerId column created");
  }
}

// ================= AUTO CHECK DISPATCH COLUMNS =================
async function ensureDispatchColumns() {
  const columns = [
    { name: "dispatchDocNo", type: "VARCHAR(100)" },
    { name: "dispatchThrough", type: "VARCHAR(100)" },
    { name: "destination", type: "VARCHAR(255)" },
    { name: "approxDistance", type: "VARCHAR(50)" },
  ];

  for (const col of columns) {
    const [rows] = await db.query(
      `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'sales_vouchers'
        AND COLUMN_NAME = ?
      `,
      [col.name]
    );

    if (rows.length === 0) {
      console.log(`⚠️ ${col.name} missing → creating...`);

      await db.query(`
        ALTER TABLE sales_vouchers
        ADD COLUMN ${col.name} ${col.type} NULL
      `);

      // console.log(`✅ ${col.name} column created`);
    }
  }
}

// ✅ Auto-create mode column if missing
async function ensureModeColumn() {
  try {
    const [rows] = await db.execute(`
      SHOW COLUMNS FROM sales_vouchers LIKE 'mode'
    `);

    if (rows.length === 0) {
      console.log("⚠️ mode column missing in sales_vouchers → creating...");
      await db.execute(`
        ALTER TABLE sales_vouchers 
        ADD COLUMN mode VARCHAR(50) DEFAULT 'item-invoice' AFTER bill_no
      `);
      console.log("✅ mode column created");
    }
  } catch (err) {
    console.error("ensureModeColumn Error:", err);
  }
}

// ✅ Auto-create overall discount columns if missing
async function ensureOverallDiscountColumns() {
  const columns = [
    { name: "overallDiscountLedgerId", type: "INT" },
    { name: "overallDiscountAmount", type: "DECIMAL(10,2)" },
    { name: "overall_discount_percent", type: "DECIMAL(5,2)" },
  ];

  for (const col of columns) {
    const [rows] = await db.query(
      `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'sales_vouchers'
        AND COLUMN_NAME = ?
      `,
      [col.name]
    );

    if (rows.length === 0) {
      console.log(`⚠️ ${col.name} missing in sales_vouchers → creating...`);
      await db.query(`
        ALTER TABLE sales_vouchers 
        ADD COLUMN ${col.name} ${col.type} NULL DEFAULT NULL
      `);
      console.log(`✅ ${col.name} column created`);
    }
  }
}

let columnChecksDone = false;
async function ensureColumnsOnce() {
  if (columnChecksDone) return;
  await ensureSalesLedgerColumn();
  await ensureDiscountLedgerColumn();
  await ensureDispatchColumns();
  await ensureModeColumn();
  await ensureOverallDiscountColumns();
  columnChecksDone = true;
}

// ================= SAVE SALES VOUCHER =================
const ensureTrackingIdColumn = async () => {
  try {
    const [cols] = await db.execute(
      `SHOW COLUMNS FROM sales_voucher_items LIKE 'tracking_id'`
    );
    if (cols.length === 0) {
      await db.execute(
        `ALTER TABLE sales_voucher_items ADD COLUMN tracking_id INT DEFAULT NULL`
      );
      console.log("✅ tracking_id column created in sales_voucher_items");
    }
  } catch (err) {
    console.error("🔥 Error ensuring tracking_id column:", err);
  }
};

router.post("/", async (req, res) => {
  await ensureTrackingIdColumn();
  console.log("POST /sales-vouchers hit");

  try {
    // ✅ Ensure column exists first
    await ensureColumnsOnce();

    const {
      number,
      date,
      narration,
      partyId,
      referenceNo,
      dispatchDetails,

      subtotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      discountTotal,
      total,

      type,
      isQuotation,
      salesLedgerId,
      supplierInvoiceDate,

      companyId,
      ownerType,
      ownerId,

      entries,
      items,
      sales_type_id,
      bill_no,
      mode,
      discountLedgerId: overallDiscountLedgerIdRaw,
      discountAmount: overallDiscountAmount,
      overall_discount_percent: overallDiscountPercentRaw,
      discountPercent: overallDiscountPercentFallback,
    } = req.body;

    let overallDiscountPercent = Number(
      overallDiscountPercentRaw ?? overallDiscountPercentFallback ?? 0
    );
    if (isNaN(overallDiscountPercent) || overallDiscountPercent < 0) overallDiscountPercent = 0;
    if (overallDiscountPercent > 100) overallDiscountPercent = 100;

    // Helper to handle empty strings for integer/ID columns
    const cleanId = (id) => (id === "" || id === undefined || id === "null" ? null : id);

    const overallDiscountLedgerId = cleanId(overallDiscountLedgerIdRaw);

    // ================= AUTH =================
    if (!companyId || !ownerType || !ownerId) {
      return res.status(400).json({
        success: false,
        message: "companyId, ownerType & ownerId required",
      });
    }

    // ================= ENTRIES =================
    const receivedEntries = Array.isArray(entries)
      ? entries
      : Array.isArray(items)
        ? items
        : [];

    // ================= STATE =================
    let companyState = "";
    let partyState = "";

    const [companyRows] = await db.execute(
      "SELECT state FROM tbcompanies WHERE id=?",
      [companyId]
    );

    if (companyRows.length) companyState = companyRows[0].state || "";

    const [partyRows] = await db.execute(
      "SELECT state FROM ledgers WHERE id=?",
      [partyId]
    );

    if (partyRows.length) partyState = partyRows[0].state || "";

    const isIntra =
      cleanState(companyState) &&
      cleanState(partyState) &&
      cleanState(companyState) === cleanState(partyState);

    // ================= GST TOTAL FIX =================
    // Use the totals provided by the frontend instead of zeroing them out 
    // if state information is missing or mismatched.
    let finalCgst = Number(cgstTotal || 0);
    let finalSgst = Number(sgstTotal || 0);
    let finalIgst = Number(igstTotal || 0);

    // ================= DISPATCH =================
    const dispatchDocNo = dispatchDetails?.docNo || null;
    const dispatchThrough = dispatchDetails?.through || null;
    const destination = dispatchDetails?.destination || null;
    const approxDistance = dispatchDetails?.approxDistance || null;

    // ================= INSERT VOUCHER =================
    const insertVoucherSQL = `
      INSERT INTO sales_vouchers (
        number,
        date,
        narration,
        partyId,
        referenceNo,
        dispatchDocNo,
        dispatchThrough,
        destination,
        approxDistance,
        subtotal,
        cgstTotal,
        sgstTotal,
        igstTotal,
        discountTotal,
        total,
        type,
        isQuotation,
        salesLedgerId,
        supplierInvoiceDate,
        company_id,
        owner_type,
        owner_id,
        sales_type_id,
        bill_no,
        mode,
        overallDiscountLedgerId,
        overallDiscountAmount,
        overall_discount_percent
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    const voucherValues = [
      number ?? null,
      date ?? null,
      narration ?? "",
      cleanId(partyId),
      referenceNo ?? null,

      dispatchDocNo,
      dispatchThrough,
      destination,
      approxDistance,
      subtotal ?? 0,

      finalCgst,
      finalSgst,
      finalIgst,

      discountTotal ?? 0,
      total ?? 0,

      type || "sales",
      isQuotation ? 1 : 0,
      cleanId(salesLedgerId),
      supplierInvoiceDate ?? null,

      companyId,
      ownerType,
      ownerId,

      cleanId(sales_type_id),
      bill_no ?? null,
      mode || 'item-invoice',
      cleanId(overallDiscountLedgerId),
      Number(overallDiscountAmount || 0),
      overallDiscountPercent
    ];

    // ================= GENERATE NUMBER =================
    let finalNumber = number;
    if (!finalNumber) {
      finalNumber = await generateVoucherNumber({
        companyId,
        ownerType,
        ownerId,
        voucherType: "sales",
        date,
        salesTypeId: sales_type_id,
      });
    }

    const [voucherResult] = await db.execute(
      insertVoucherSQL,
      [
        finalNumber,
        ...voucherValues.slice(1)
      ]
    );

    const voucherId = voucherResult.insertId;

    // ================= INSERT ENTRIES (BASED ON MODE) =================
    if (mode === "accounting-invoice") {
      const ledgerEntries = receivedEntries.filter((e) => e.ledgerId);
      if (ledgerEntries.length > 0) {
        const ledgerValues = ledgerEntries.map((e) => [
          voucherId,
          Number(e.ledgerId),
          Number(e.amount) || 0,
          e.type || "debit",
          e.narration || null,
        ]);

        await db.query(
          `INSERT INTO voucher_entries (voucher_id, ledger_id, amount, entry_type, narration) VALUES ?`,
          [ledgerValues]
        );
      }
    } else {
      // DEFAULT: item-invoice
      const itemEntries = receivedEntries.filter((e) => e.itemId);

      if (itemEntries.length > 0) {
        const itemValues = itemEntries.map((e) => [
          voucherId,
          e.itemId,
          Number(e.quantity || 0),
          Number(e.rate || 0),
          Number(e.amount || 0),

          Number(e.cgstLedgerId || e.cgstRate || 0),
          Number(e.sgstLedgerId || e.sgstRate || 0),
          Number(e.igstLedgerId || e.igstRate || e.gstLedgerId || 0),

          Number(e.discount || 0),
          e.hsnCode ?? "",
          e.batchNumber ?? "",
          e.godownId ?? null,

          Number(e.salesLedgerId || 0),
          Number(e.discountLedgerId || 0),
          e.tracking_id || null,
        ]);

        await db.query(
          `
        INSERT INTO sales_voucher_items
        (
          voucherId,
          itemId,
          quantity,
          rate,
          amount,
          cgstRate,
          sgstRate,
          igstRate,
          discount,
          hsnCode,
          batchNumber,
          godownId,
          salesLedgerId,
          discountLedgerId,
          tracking_id
        )
        VALUES ?
        `,
          [itemValues]
        );
      }
      
      // Update sub_attribute_values if any exist
      for (const e of itemEntries) {
        if (e.tracking_id && e.sub_attributes && Object.keys(e.sub_attributes).length > 0) {
          for (const [subAttrId, val] of Object.entries(e.sub_attributes)) {
            await db.execute(
              `UPDATE tracking_sub_attributes SET sub_attribute_value = ? 
               WHERE tracking_id = ? AND sub_attribute_id = ?`,
              [val, e.tracking_id, subAttrId]
            );
          }
        }
      }
    }

    // ================= DONE =================
    // ================= CHRONOLOGICAL RENUMBERING =================
    await renumberVouchers({
      companyId,
      ownerType,
      ownerId,
      voucherType: "sales",
      date,
      salesTypeId: sales_type_id,
    });

    return res.status(200).json({
      success: true,
      message: "Sales voucher saved successfully",
      id: voucherId,
      gstType: isIntra ? "INTRA" : "INTER",
    });
  } catch (err) {
    console.error("❌ Sales voucher save failed:", err);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
});



// GET Sale History (Only fetch existing data, no table creation)
// router.get("/sale-history", async (req, res) => {
//   try {
//     const { company_id, owner_type, owner_id } = req.query;
//     console.log('query', company_id, owner_type, owner_id)

//     if (!company_id || !owner_type || !owner_id) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required params",
//       });
//     }

//     const fetchSql = `
//       SELECT * FROM sale_history
//       WHERE companyId = ? AND ownerType = ? AND ownerId = ?
//       ORDER BY movementDate DESC, id DESC
//     `;

//     const [rows] = await db.execute(fetchSql, [
//       company_id,
//       owner_type,
//       owner_id,
//     ]);

//     return res.status(200).json({
//       success: true,
//       data: rows,
//     });

//   } catch (error) {
//     console.error("🔥 Sale History Fetch Error:", error);
//     return res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

router.get("/sale-history", async (req, res) => {
  try {
    const { company_id, owner_type, owner_id } = req.query;

    if (!company_id || !owner_type || !owner_id) {
      return res.status(400).json({
        success: false,
        message: "Missing required params",
      });
    }

    const fetchSql = `
  SELECT 
    sh.id,
    sh.itemName,
    sh.hsnCode,
    sh.batchNumber,
    sh.qtyChange,
    sh.rate,
    sh.movementDate,
    sh.godownId,
    sh.voucherNumber,
    sh.companyId,
    sh.ownerType,
    sh.ownerId,
    su.symbol  AS unit,

    sv.id      AS voucherId,
    sv.partyId AS partyId,
    l.name     AS partyName

  FROM sale_history sh

  LEFT JOIN stock_items si
    ON CONVERT(sh.itemName USING utf8mb4) COLLATE utf8mb4_general_ci
     = CONVERT(si.name USING utf8mb4) COLLATE utf8mb4_general_ci
     AND CONVERT(si.company_id USING utf8mb4) COLLATE utf8mb4_general_ci = CONVERT(sh.companyId USING utf8mb4) COLLATE utf8mb4_general_ci
     AND CONVERT(si.owner_type USING utf8mb4) COLLATE utf8mb4_general_ci = CONVERT(sh.ownerType USING utf8mb4) COLLATE utf8mb4_general_ci
     AND CONVERT(si.owner_id USING utf8mb4) COLLATE utf8mb4_general_ci = CONVERT(sh.ownerId USING utf8mb4) COLLATE utf8mb4_general_ci

  LEFT JOIN stock_units su
    ON si.unit = su.id

  LEFT JOIN sales_vouchers sv
    ON CONVERT(sv.number USING utf8mb4) COLLATE utf8mb4_general_ci
     = CONVERT(sh.voucherNumber USING utf8mb4) COLLATE utf8mb4_general_ci
    AND sv.company_id = ?
    AND sv.owner_type = ?
    AND sv.owner_id = ?

  LEFT JOIN ledgers l
    ON l.id = sv.partyId

  WHERE sh.companyId = ?
    AND sh.ownerType = ?
    AND sh.ownerId = ?

  ORDER BY sh.movementDate DESC, sh.id DESC
`;

    const [rows] = await db.execute(fetchSql, [
      company_id,
      owner_type,
      owner_id,
      company_id,
      owner_type,
      owner_id,
    ]);


    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("🔥 Sale History Fetch Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});




// get next number
router.get("/next-number", async (req, res) => {
  try {
    const { company_id, owner_type, owner_id, date } = req.query;

    if (!company_id || !owner_type || !owner_id || !date) {
      return res.status(400).json({ success: false, message: "Missing required params" });
    }

    const voucherNumber = await generateVoucherNumber({
      companyId: company_id,
      ownerType: owner_type,
      ownerId: owner_id,
      voucherType: 'sales',
      date
    });

    return res.json({
      success: true,
      voucherNumber
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

// get sales vouchers
router.get("/", async (req, res) => {
  const { owner_type, owner_id, company_id, isQuotation, page, limit } = req.query;

  if (!owner_type || !owner_id) {
    return res.status(400).json({
      message: "owner_type & owner_id are required",
    });
  }

  try {
    let sql = `
      SELECT 
        id, number, date, narration, partyId, referenceNo, dispatchDocNo,
        dispatchThrough, destination, subtotal, cgstTotal, sgstTotal,
        igstTotal, discountTotal, total, createdAt, company_id, owner_type,
        owner_id, type, isQuotation, salesLedgerId, supplierInvoiceDate,
        sales_type_id, bill_no, mode,
        overallDiscountLedgerId, overallDiscountAmount, overall_discount_percent
      FROM sales_vouchers
      WHERE owner_type = ? AND owner_id = ?
    `;

    const params = [owner_type, owner_id];

    if (company_id) {
      sql += " AND company_id = ?";
      params.push(company_id);
    }

    // Filter by isQuotation if provided
    if (isQuotation !== undefined) {
      sql += " AND isQuotation = ?";
      params.push(isQuotation === "true" || isQuotation === "1" ? 1 : 0);
    }
    sql += " ORDER BY date ASC, id ASC";

    // Add pagination if limit is provided
    const parsedLimit = parseInt(limit);
    if (parsedLimit && parsedLimit > 0) {
      const parsedPage = parseInt(page) || 1;
      const offset = (parsedPage - 1) * parsedLimit;
      
      // Get total count first
      const countSql = `SELECT COUNT(*) as total FROM (${sql}) as count_query`;
      const [countRows] = await db.execute(countSql, params);
      const totalCount = countRows[0].total;
      
      // Append limit and offset
      sql += ` LIMIT ${parsedLimit} OFFSET ${offset}`;
      const [voucherRows] = await db.execute(sql, params);
      
      return res.status(200).json({ data: voucherRows, total: totalCount, page: parsedPage, limit: parsedLimit });
    } else {
      const [voucherRows] = await db.execute(sql, params);
      return res.status(200).json(voucherRows);
    }
  } catch (err) {
    console.error("Failed to load sales vouchers:", err);
    return res.status(500).json({ message: err.message });
  }
});

//delete
router.delete("/:id", async (req, res) => {
  const voucherId = req.params.id;
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1️⃣ Get voucher details before deletion
    const [rows] = await conn.execute(
      "SELECT number, company_id, owner_type, owner_id, sales_type_id FROM sales_vouchers WHERE id = ?",
      [voucherId]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Voucher not found" });
    }

    const { number: deletedNumber, company_id, owner_type, owner_id, sales_type_id } = rows[0];

    // Revert stock batch quantities
    const [items] = await conn.execute(
      "SELECT itemId, quantity, batchNumber FROM sales_voucher_items WHERE voucherId = ?",
      [voucherId]
    );

    for (const item of items) {
      if (!item.itemId) continue;
      const [stockRows] = await conn.execute(
        "SELECT batches FROM stock_items WHERE id = ? AND company_id = ? AND owner_type = ? AND owner_id = ?",
        [item.itemId, company_id, owner_type, owner_id]
      );
      if (stockRows.length > 0) {
        const stockItem = stockRows[0];
        let batches = [];
        try {
          batches = stockItem.batches ? JSON.parse(stockItem.batches) : [];
        } catch (e) {
          batches = [];
        }

        const bName = item.batchNumber || "";
        const isEmptyBatchName = bName === "" || bName === null;

        const index = isEmptyBatchName
          ? batches.findIndex(b => b.batchName === null || b.batchName === "" || b.batchName === undefined)
          : batches.findIndex(b => String(b.batchName ?? "") === String(bName));

        if (index !== -1) {
          // Since sales voucher is deleted, we ADD the quantity back to the batch!
          batches[index].batchQuantity = Number(batches[index].batchQuantity || 0) + Number(item.quantity || 0);
          await conn.execute(
            "UPDATE stock_items SET batches = ? WHERE id = ?",
            [JSON.stringify(batches), item.itemId]
          );
        }
      }
    }

    // Delete current voucher and related data
    await conn.execute("DELETE FROM sale_history WHERE voucherNumber = ?", [deletedNumber]);
    await conn.execute("DELETE FROM sales_voucher_items WHERE voucherId = ?", [voucherId]);
    await conn.execute("DELETE FROM voucher_entries WHERE voucher_id = ?", [voucherId]);
    await conn.execute("DELETE FROM sales_vouchers WHERE id = ?", [voucherId]);

    // 2️⃣ Renumber vouchers using shared utility
    await renumberVouchers({
      companyId: company_id,
      ownerType: owner_type,
      ownerId: owner_id,
      voucherType: "sales",
      date: rows[0].date || new Date(),
      salesTypeId: sales_type_id,
    }, conn);

    await conn.commit();
    return res.json({
      success: true,
      message: "Sales voucher deleted and subsequent vouchers renumbered successfully",
    });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("Delete failed:", err);
    return res.status(500).json({ message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ===============================
// GET SINGLE SALES VOUCHER (EDIT MODE WITH HISTORY)
// ===============================

router.get("/:id", async (req, res) => {
  try {
    const rawParam = req.params.id;
    const voucherId = decodeURIComponent(rawParam);

    /* ======================
       1️⃣ GET VOUCHER
    ====================== */
    const [voucherRows] = await db.execute(
      `SELECT * FROM sales_vouchers WHERE id = ? OR number = ?`,
      [voucherId, voucherId]
    );

    if (!voucherRows.length) {
      return res.status(404).json({
        success: false,
        message: "Voucher not found",
      });
    }

    const voucher = voucherRows[0];

    /* ======================
       2️⃣ GET ITEMS / ENTRIES
    ====================== */
    let entries = [];

    if (voucher.mode === "accounting-invoice") {
      const [rows] = me = await db.execute(
        `SELECT ve.*, l.name AS ledgerName 
         FROM voucher_entries ve 
         LEFT JOIN ledgers l ON l.id = ve.ledger_id
         WHERE ve.voucher_id = ?`,
        [voucherId]
      );

      entries = rows.map((r) => ({
        id: r.id,
        ledgerId: r.ledger_id,
        ledgerName: r.ledgerName,
        amount: r.amount,
        type: r.entry_type,
        narration: r.narration || "",
      }));
    } else {
      // DEFAULT: item-invoice
      const [items] = await db.execute(
        `
      SELECT svi.*, si.name as itemName
      FROM sales_voucher_items svi
      LEFT JOIN stock_items si ON svi.itemId = si.id
      WHERE svi.voucherId = ?
      `,
        [voucherId]
      );

      /* ======================
         3️⃣ GET SALE HISTORY (BY VOUCHER NUMBER)
      ====================== */
      const [history] = await db.execute(
        `
      SELECT *
      FROM sale_history
      WHERE voucherNumber = ?
      `,
        [voucher.number]
      );

      entries = await Promise.all(items.map(async (item) => {
        const historyRow = history.find(
          (h) => String(h.godownId) === String(item.godownId)
        );

        let sub_attributes = {};
        if (item.tracking_id) {
          try {
            const [subAttrRows] = await db.execute(
              `SELECT sub_attribute_id, sub_attribute_value FROM tracking_sub_attributes WHERE tracking_id = ?`,
              [item.tracking_id]
            );
            subAttrRows.forEach(row => {
              sub_attributes[row.sub_attribute_id] = row.sub_attribute_value;
            });
          } catch (e) {
            console.error("Error fetching sub attributes:", e);
          }
        }

        return {
          id: item.id,
          itemId: item.itemId,
          itemName: item.itemName,
          quantity: item.quantity,
          rate: item.rate,
          discount: item.discount,
          amount: item.amount,
          cgstRate: item.cgstRate,
          sgstRate: item.sgstRate,
          igstRate: item.igstRate,
          godownId: item.godownId,
          salesLedgerId: item.salesLedgerId,
          discountLedgerId: item.discountLedgerId,
          batchNumber: historyRow?.batchNumber || "",
          hsnCode: historyRow?.hsnCode || "",
          movementDate: historyRow?.movementDate || voucher.date,
          tracking_id: item.tracking_id || null,
          sub_attributes
        };
      }));
    }



    /* ======================
       5️⃣ SEND RESPONSE
    ====================== */

    return res.json({
      success: true,

      id: voucher.id,

      number: voucher.number,
      date: voucher.date,

      narration: voucher.narration,
      partyId: voucher.partyId,
      referenceNo: voucher.referenceNo,

      dispatchDocNo: voucher.dispatchDocNo,
      dispatchThrough: voucher.dispatchThrough,
      destination: voucher.destination,

      salesLedgerId: voucher.salesLedgerId,

      subtotal: voucher.subtotal,
      cgstTotal: voucher.cgstTotal,
      sgstTotal: voucher.sgstTotal,
      igstTotal: voucher.igstTotal,

      discountTotal: voucher.discountTotal,
      total: voucher.total,

      profit: voucher.profit,

      billNo: voucher.bill_no,
      approxDistance: voucher.approxDistance,

      isQuotation: voucher.isQuotation,

      supplierInvoiceDate: voucher.supplierInvoiceDate,
      sales_type_id: voucher.sales_type_id,
      mode: voucher.mode,
      overallDiscountLedgerId: voucher.overallDiscountLedgerId,
      overallDiscountAmount: voucher.overallDiscountAmount,
      overall_discount_percent: voucher.overall_discount_percent,
      overallDiscountPercent: voucher.overall_discount_percent,
      discountPercent: voucher.overall_discount_percent,

      // ⭐ MAIN DATA
      entries,
    });

  } catch (err) {
    console.error("🔥 Fetch sales edit voucher error:", err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});



//single put
router.put("/:id", async (req, res) => {
  await ensureTrackingIdColumn();
  const voucherId = req.params.id;

  const {
    date,
    number,
    narration,
    referenceNo,
    partyId,
    dispatchDetails,
    subtotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    discountTotal,
    total,
    entries,
    isQuotation,
    salesLedgerId,
    sales_type_id,
    bill_no,
    mode,
    discountLedgerId: overallDiscountLedgerId,
    discountAmount: overallDiscountAmount,
    overall_discount_percent: overallDiscountPercentRaw,
    discountPercent: overallDiscountPercentFallback,
  } = req.body;

  let overallDiscountPercent = Number(
    overallDiscountPercentRaw ?? overallDiscountPercentFallback ?? 0
  );
  if (isNaN(overallDiscountPercent) || overallDiscountPercent < 0) overallDiscountPercent = 0;
  if (overallDiscountPercent > 100) overallDiscountPercent = 100;

  // Helper to handle empty strings for integer/ID columns
  const cleanId = (id) => (id === "" || id === undefined || id === "null" ? null : id);

  try {
    await ensureSalesLedgerColumn();
    await ensureDiscountLedgerColumn();
    await ensureDispatchColumns();
    await ensureOverallDiscountColumns();

    // ---- 1) UPDATE MAIN TABLE ----
    await db.execute(
      `UPDATE sales_vouchers
       SET 
         date = ?, 
         number = ?, 
         narration = ?, 
         referenceNo = ?, 
         partyId = ?, 
         dispatchDocNo = ?, 
         dispatchThrough = ?, 
         destination = ?, 
         approxDistance = ?,
         subtotal = ?, 
         cgstTotal = ?, 
         sgstTotal = ?, 
         igstTotal = ?, 
         discountTotal = ?, 
         total = ?, 
         isQuotation = ?, 
         salesLedgerId = ?,
         sales_type_id = ?,
         bill_no = ?,
         mode = ?,
         overallDiscountLedgerId = ?,
         overallDiscountAmount = ?,
         overall_discount_percent = ?
       WHERE id = ?`,
      [
        date,
        number,
        narration,
        referenceNo,
        cleanId(partyId),
        dispatchDetails?.docNo || null,
        dispatchDetails?.through || null,
        dispatchDetails?.destination || null,
        dispatchDetails?.approxDistance || null,
        subtotal,
        cgstTotal,
        sgstTotal,
        igstTotal,
        discountTotal,
        total,
        isQuotation ? 1 : 0,
        cleanId(salesLedgerId),
        cleanId(sales_type_id),
        bill_no ?? null,
        mode || 'item-invoice',
        cleanId(overallDiscountLedgerId),
        Number(overallDiscountAmount || 0),
        overallDiscountPercent,
        voucherId,
      ]
    );

    // ---- 4) CLEAR OLD ROWS ----
    await db.execute(`DELETE FROM sales_voucher_items WHERE voucherId = ?`, [voucherId]);
    await db.execute(`DELETE FROM voucher_entries WHERE voucher_id = ?`, [voucherId]);

    // ---- 5) INSERT NEW ROWS (BASED ON MODE) ----
    if (mode === "accounting-invoice") {
      const ledgerEntries = entries.filter((e) => e.ledgerId);
      if (ledgerEntries.length > 0) {
        const ledgerValues = ledgerEntries.map((e) => [
          voucherId,
          Number(e.ledgerId),
          Number(e.amount || 0),
          e.type || "debit",
          e.narration || null,
        ]);

        await db.query(`INSERT INTO voucher_entries (voucher_id, ledger_id, amount, entry_type, narration) VALUES ?`, [ledgerValues]);
      }
    } else {
      // DEFAULT: item-invoice
      const itemEntries = entries.filter((e) => e.itemId);
      if (itemEntries.length > 0) {
        const itemValues = itemEntries.map((e) => [
          voucherId,
          e.itemId,
          Number(e.quantity || 0),
          Number(e.rate || 0),
          Number(e.amount || 0),
          Number(e.cgstLedgerId || e.cgstRate || 0),
          Number(e.sgstLedgerId || e.sgstRate || 0),
          Number(e.igstLedgerId || e.igstRate || e.gstLedgerId || 0),
          Number(e.discount || 0),
          e.hsnCode || "",
          e.batchNumber || "",
          e.godownId || null,
          Number(e.salesLedgerId || 0),
          Number(e.discountLedgerId || 0),
          e.tracking_id || null,
        ]);

        await db.query(
          `INSERT INTO sales_voucher_items 
          (voucherId, itemId, quantity, rate, amount, cgstRate, sgstRate, igstRate, discount, hsnCode, batchNumber, godownId, salesLedgerId, discountLedgerId, tracking_id)
          VALUES ?`,
          [itemValues]
        );
      }

      // Update sub_attribute_values if any exist
      for (const e of itemEntries) {
        if (e.tracking_id && e.sub_attributes && Object.keys(e.sub_attributes).length > 0) {
          for (const [subAttrId, val] of Object.entries(e.sub_attributes)) {
            await db.execute(
              `UPDATE tracking_sub_attributes SET sub_attribute_value = ? 
               WHERE tracking_id = ? AND sub_attribute_id = ?`,
              [val, e.tracking_id, subAttrId]
            );
          }
        }
      }
    }

    // ---- 6) CLEAR OLD HISTORY (The frontend will POST new history) ----
    await db.execute(`DELETE FROM sale_history WHERE voucherNumber = ?`, [number]);

    // ---- 7) CHRONOLOGICAL RENUMBERING ----
    await renumberVouchers({
      companyId: req.body.companyId || req.query.company_id,
      ownerType: req.body.ownerType || req.query.owner_type,
      ownerId: req.body.ownerId || req.query.owner_id,
      voucherType: "sales",
      date,
      salesTypeId: sales_type_id,
    });

    return res.json({ success: true, message: "Voucher updated successfully" });
  } catch (err) {
    console.error("❌ Update failed:", err);
    return res.status(500).json({ success: false, message: err.message || "Update failed" });
  }
});

//history maintain

let historyColumnChecksDone = false;
async function ensureSaleHistorySchemaOnce() {
  if (historyColumnChecksDone) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sale_history (
      id INT AUTO_INCREMENT PRIMARY KEY
    )
  `);

  const requiredColumns = {
    itemName: "VARCHAR(255)",
    hsnCode: "VARCHAR(50)",
    batchNumber: "VARCHAR(255)",
    qtyChange: "INT",
    rate: "DECIMAL(10,2)",
    movementDate: "DATE",
    voucherNumber: "VARCHAR(100)",
    godownId: "INT",
    companyId: "VARCHAR(100)",
    ownerType: "VARCHAR(50)",
    ownerId: "VARCHAR(100)",
  };

  for (const [col, def] of Object.entries(requiredColumns)) {
    const [rows] = await db.execute(
      `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'sale_history'
        AND COLUMN_NAME = ?
      `,
      [col]
    );

    if (rows.length === 0) {
      await db.execute(`ALTER TABLE sale_history ADD COLUMN ${col} ${def}`);
    }
  }

  historyColumnChecksDone = true;
}

router.post("/sale-history", async (req, res) => {
  try {
    // 1️⃣ Normalize input (single OR array)
    const movementData = Array.isArray(req.body) ? req.body : [req.body];

    await ensureSaleHistorySchemaOnce();

    /* =====================================================
       5️⃣ INSERT QUERY (ORDER MATTERS)
    ===================================================== */
    const insertSql = `
      INSERT INTO sale_history
      (
        itemName,
        hsnCode,
        batchNumber,
        qtyChange,
        rate,
        movementDate,
        voucherNumber,
        godownId,
        companyId,
        ownerType,
        ownerId
      )
      VALUES ?
    `;

    const values = movementData.map((e) => [
      e.itemName || null,
      e.hsnCode || "",
      e.batchNumber || null,
      Number(e.qtyChange) || 0,
      Number(e.rate) || 0,
      e.movementDate || null,
      e.voucherNumber || null,

      // ✅ SAVE ONLY GODOWN ID
      e.godownId ? Number(e.godownId) : null,

      e.companyId || null,
      e.ownerType || null,
      e.ownerId || null,
    ]);

    /* =====================================================
       6️⃣ TENANT SECURITY CHECK
    ===================================================== */
    if (values.some((v) => !v[8] || !v[9] || !v[10])) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: company or owner missing",
      });
    }

    /* =====================================================
       7️⃣ EXECUTE INSERT
    ===================================================== */
    await db.query(insertSql, [values]);

    return res.status(200).json({
      success: true,
      message: "Sale history saved successfully",
    });
  } catch (error) {
    console.error("🔥 Sale history save failed:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
