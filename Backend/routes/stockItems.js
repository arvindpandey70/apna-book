const express = require("express");
const router = express.Router();
const db = require("../db");
const upload = require(".././middlewares/upload");
const cloudinary = require(".././utils/cloudnary");
const streamifier = require("streamifier");


// GET all stock items (scoped)
router.get("/", async (req, res) => {
  const { company_id, owner_type, owner_id, search } = req.query;

  const connection = await db.getConnection();
  try {
    const ensureColumn = async (table, column, definition) => {
      const [rows] = await connection.execute(
        `
        SELECT COUNT(*) AS count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        `,
        [table, column]
      );
      if (rows[0].count === 0) {
        await connection.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    };
    await ensureColumn("stock_items", "image", "VARCHAR(255) NULL");
    await ensureColumn("stock_items", "gstLedgerId", "INT NULL");
    await ensureColumn("stock_items", "cgstLedgerId", "INT NULL");
    await ensureColumn("stock_items", "sgstLedgerId", "INT NULL");
    await ensureColumn("stock_items", "attributeId", "INT NULL");
    await ensureColumn("stock_items", "tracking_type", "VARCHAR(50) NULL");
    await ensureColumn("stock_items", "godown_id", "INT NULL");
    await ensureColumn("stock_items", "gstRate", "DECIMAL(5,2) DEFAULT 0.00");
    let query = `
      SELECT 
        s.id,
        s.name,
        c.parent AS stockGroupId,
        s.categoryId,
        NULL AS stockGroupName,
        s.unit,
        u.name AS unitName,
        0.00 AS openingBalance,
        s.hsnCode,
        s.taxType,
        s.gstLedgerId,
        gl.name AS gstLedgerName,
        s.cgstLedgerId,
        s.sgstLedgerId,
        s.gstRate,
        s.attributeId,
        s.godown_id,
        s.barcode,
        s.batches,
        s.enableBatchTracking,
        s.tracking_type,
        s.type,
        s.image,
        s.company_id,
        s.owner_type,
        s.owner_id
      FROM stock_items s
      LEFT JOIN stock_categories c ON s.categoryId = c.id
      LEFT JOIN stock_units u ON s.unit = u.id
      LEFT JOIN ledgers gl ON s.gstLedgerId = gl.id
      WHERE 1 = 1
    `;

    const params = [];

    if (company_id) {
      query += " AND s.company_id = ?";
      params.push(company_id);
    }

    if (owner_type) {
      query += " AND s.owner_type = ?";
      params.push(owner_type);
    }

    if (owner_id) {
      query += " AND s.owner_id = ?";
      params.push(owner_id);
    }

    if (search && search.trim() !== "") {
      query += " AND s.name LIKE ?";
      params.push(`%${search.trim()}%`);
    }

    query += " ORDER BY s.id DESC";

    const [rows] = await connection.execute(query, params);

    // Fetch attributes for these items
    const itemIds = rows.map(i => i.id);
    let allAttributes = [];
    if (itemIds.length > 0) {
      const [attrRows] = await connection.execute(
        `SELECT a.id, a.stock_item_id, m.name as name, a.attribute_value as value 
         FROM stock_item_attributes a
         JOIN stock_attributes m ON a.attribute_id = m.id
         WHERE a.stock_item_id IN (${itemIds.join(',')})`
      );
      allAttributes = attrRows;
    }

    const formattedRows = rows.map((item) => {
      let rate = Number(item.gstRate || 0);
      if (rate === 0 && item.gstLedgerName) {
        const match = item.gstLedgerName.match(/(\d+(\.\d+)?)/);
        if (match) {
          rate = parseFloat(match[0]);
        }
      }
      return {
        ...item,
        gstRate: rate,
        batches: (() => {
          try {
            return item.batches ? JSON.parse(item.batches) : [];
          } catch {
            return [];
          }
        })(),
        attributes: allAttributes.filter(a => a.stock_item_id === item.id)
      };
    });

    return res.json({
      success: true,
      data: formattedRows,
    });
  } catch (err) {
    console.error("🔥 Error fetching stock items:", err);
    return res.status(500).json({
      success: false,
      message: "Error fetching stock items",
    });
  } finally {
    connection.release();
  }
});


// POST save stock item (scoped)
// router.post('/', async (req, res) => {
//   const connection = await db.getConnection();

//   try {
//     await connection.beginTransaction();

//     const {
//       name, stockGroupId, unit, openingBalance, openingValue,
//       hsnCode, gstRate, taxType, standardPurchaseRate, standardSaleRate,
//       enableBatchTracking, allowNegativeStock, maintainInPieces, secondaryUnit,
//       batchName, batchExpiryDate, batchManufacturingDate,
//       godownAllocations = [],
//       barcode
//     } = req.body;

//     const values = [
//       name, stockGroupId ?? null, unit ?? null,
//       openingBalance ?? 0, openingValue ?? 0, hsnCode ?? null, gstRate ?? 0,
//       taxType ?? 'Taxable', standardPurchaseRate ?? 0, standardSaleRate ?? 0,
//       enableBatchTracking ? 1 : 0, allowNegativeStock ? 1 : 0,
//       maintainInPieces ? 1 : 0, secondaryUnit ?? null,
//       batchName ?? null, batchExpiryDate ?? null, batchManufacturingDate ?? null,
//       barcode
//     ];

//     const [result] = await connection.execute(`
//       INSERT INTO stock_items (
//         name, stockGroupId, unit, openingBalance, openingValue,
//         hsnCode, gstRate, taxType, standardPurchaseRate, standardSaleRate,
//         enableBatchTracking, allowNegativeStock, maintainInPieces, secondaryUnit,
//         batchNumber, batchExpiryDate, batchManufacturingDate, barcode
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `, values);

//     const stockItemId = result.insertId;

//     for (const alloc of godownAllocations) {
//       await connection.execute(`
//         INSERT INTO godown_allocations (stockItemId, godownId, quantity, value)
//         VALUES (?, ?, ?, ?)
//       `, [
//         stockItemId,
//         alloc.godownId ?? null,
//         alloc.quantity ?? 0,
//         alloc.value ?? 0
//       ]);
//     }

//     await connection.commit();
//     res.json({ success: true, message: 'Stock item saved successfully' });

//   } catch (err) {
//     console.error("🔥 Error saving stock item:", err);
//     await connection.rollback();
//     res.status(500).json({ success: false, message: 'Error saving stock item' });
//   } finally {
//     connection.release();
//   }
// });

// router.post("/", async (req, res) => {
//   const connection = await db.getConnection();

//   try {
//     await connection.beginTransaction();

//     const {
//       name,
//       stockGroupId,
//       categoryId,
//       unit,
//       openingBalance,
//       hsnCode,
//       gstRate,
//       taxType,
//       standardPurchaseRate,
//       standardSaleRate,
//       enableBatchTracking,
//       allowNegativeStock,
//       maintainInPieces,
//       secondaryUnit,
//       batches = [],
//       godownAllocations = [],
//       barcode,
//       company_id,
//       owner_type,
//       owner_id,
//     } = req.body;

//     if (!name || !unit || !taxType) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required fields: name, unit, or taxType",
//       });
//     }

//     // ✔ Ensure openingValue column exists dynamically
//     const [colCheck] = await connection.execute(`
//       SELECT COUNT(*) AS count
//       FROM information_schema.COLUMNS
//       WHERE TABLE_NAME = 'stock_items'
//       AND COLUMN_NAME = 'openingValue'
//     `);

//     if (colCheck[0].count === 0) {
//       await connection.execute(`
//         ALTER TABLE stock_items
//         ADD COLUMN openingValue DECIMAL(15,2) DEFAULT 0
//       `);
//       console.log("📌 Column openingValue created successfully!");
//     }

//     // ✔ Correct Batch Mapping (OpeningRate = Rate)
//     let totalOpeningValue = 0;

//     const batchData = enableBatchTracking
//       ? batches.map((batch) => {
//           const qty = Number(batch.batchQuantity) || 0;
//           const rate = Number(batch.batchRate) || 0;
//           const openingRate = rate; // Correct mapping
//           const openingValue = qty * rate; // Correct calculation

//           totalOpeningValue += openingValue;

//           return {
//             batchName: batch.batchName || "",
//             batchQuantity: qty,
//             openingRate,
//             openingValue,
//             batchExpiryDate: batch.batchExpiryDate || null,
//             batchManufacturingDate: batch.batchManufacturingDate || null,
//           };
//         })
//       : [];

//     const finalOpeningValue = totalOpeningValue;

//     // Fetch stock_items table columns dynamically
//     const [columnsResult] = await connection.execute(`
//       SHOW COLUMNS FROM stock_items
//     `);

//     const columnNames = columnsResult
//       .filter((col) => col.Field !== "id")
//       .map((col) => col.Field);

//     const values = columnNames.map((column) => {
//       switch (column) {
//         case "name":
//           return name;
//         case "stockGroupId":
//           return stockGroupId ?? null;
//         case "categoryId":
//           return categoryId ?? null;
//         case "unit":
//           return unit ?? null;
//         case "openingBalance":
//           return openingBalance ?? 0;
//         case "openingValue":
//           return finalOpeningValue ?? 0;
//         case "hsnCode":
//           return hsnCode ?? null;
//         case "gstRate":
//           return gstRate ?? 0;
//         case "taxType":
//           return taxType;
//         case "standardPurchaseRate":
//           return standardPurchaseRate ?? 0;
//         case "standardSaleRate":
//           return standardSaleRate ?? 0;
//         case "enableBatchTracking":
//           return enableBatchTracking ? 1 : 0;
//         case "allowNegativeStock":
//           return allowNegativeStock ? 1 : 0;
//         case "maintainInPieces":
//           return maintainInPieces ? 1 : 0;
//         case "secondaryUnit":
//           return secondaryUnit ?? null;
//         case "barcode":
//           return barcode;
//         case "company_id":
//           return company_id ?? null;
//         case "owner_type":
//           return owner_type ?? null;
//         case "owner_id":
//           return owner_id ?? null;
//         case "batches":
//           return JSON.stringify(batchData);
//         default:
//           return null;
//       }
//     });

//     const placeholders = columnNames.map(() => "?").join(", ");
//     const insertQuery = `
//       INSERT INTO stock_items (${columnNames.join(", ")})
//       VALUES (${placeholders})
//     `;

//     const [result] = await connection.execute(insertQuery, values);
//     const stockItemId = result.insertId;

//     // Insert Godown Allocations
//     for (const alloc of godownAllocations) {
//       await connection.execute(
//         `
//         INSERT INTO godown_allocations (stockItemId, godownId, quantity, value)
//         VALUES (?, ?, ?, ?)
//       `,
//         [stockItemId, alloc.godownId, alloc.quantity, alloc.value]
//       );
//     }

//     await connection.commit();

//     res.json({
//       success: true,
//       message: "Stock item saved successfully",
//       stockItemId,
//       batchesInserted: batchData.length,
//       openingValue: finalOpeningValue,
//     });
//   } catch (err) {
//     console.error("🔥 Error saving stock item:", err);
//     await connection.rollback();
//     res.status(500).json({
//       success: false,
//       message: "Error saving stock item",
//       error: err.message,
//     });
//   } finally {
//     connection.release();
//   }
// });

router.post("/", upload.single("image"), async (req, res) => {
  const connection = await db.getConnection();
  const safeNumber = (v, def = 0) => {
    const n = Number(v);
    return isNaN(n) ? def : n;
  };

  try {
    await connection.beginTransaction();

    /* ===============================
       🔥 RUNTIME COLUMN CHECK & ADD
       =============================== */

    const ensureColumn = async (table, column, definition) => {
      const [rows] = await connection.execute(
        `
        SELECT COUNT(*) AS count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        `,
        [table, column]
      );

      if (rows[0].count === 0) {
        await connection.execute(
          `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
        );
      }
    };

    // 🔒 REQUIRED SAFE COLUMNS (LOCAL + PROD)
    await ensureColumn("stock_items", "categoryId", "VARCHAR(50) NULL");
    await ensureColumn("stock_items", "type", "VARCHAR(50) DEFAULT 'opening'");
    await ensureColumn(
      "stock_items",
      "createdAt",
      "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
    );
    await ensureColumn("stock_items", "gstLedgerId", "INT NULL");
    await ensureColumn("stock_items", "cgstLedgerId", "INT NULL");
    await ensureColumn("stock_items", "sgstLedgerId", "INT NULL");
    await ensureColumn("stock_items", "attributeId", "INT NULL");
    await ensureColumn("stock_items", "tracking_type", "VARCHAR(50) NULL");
    await ensureColumn("stock_items", "godown_id", "INT NULL");
    await ensureColumn("stock_items", "image", "VARCHAR(255) NULL");



    /* ===============================
       📥 REQUEST DATA
       =============================== */

    const {
      name,
      stockGroupId,
      categoryId,
      unit,
      openingBalance,
      hsnCode,
      gstRate,
      taxType,
      gstLedgerId,
      cgstLedgerId,
      sgstLedgerId,
      attributeId,
      attributes = [],
      standardPurchaseRate,
      standardSaleRate,
      enableBatchTracking,
      tracking_type,
      allowNegativeStock,
      maintainInPieces,
      secondaryUnit,
      batches = [],
      godownAllocations = [],
      attributeTrackingRows = [],
      barcode,
      godown_id,
      company_id,
      owner_type,
      owner_id,
    } = req.body;

    let parsedBatches = Array.isArray(batches) ? batches : [];
    if (typeof batches === "string") {
      try { parsedBatches = JSON.parse(batches); } catch (e) { parsedBatches = []; }
    }

    let parsedGodownAllocations = Array.isArray(godownAllocations) ? godownAllocations : [];
    if (typeof godownAllocations === "string") {
      try { parsedGodownAllocations = JSON.parse(godownAllocations); } catch (e) { parsedGodownAllocations = []; }
    }

    let parsedAttributes = Array.isArray(attributes) ? attributes : [];
    if (typeof attributes === "string") {
      try { parsedAttributes = JSON.parse(attributes); } catch (e) { parsedAttributes = []; }
    }
    
    let parsedAttributeTrackingRows = Array.isArray(attributeTrackingRows) ? attributeTrackingRows : [];
    if (typeof attributeTrackingRows === "string") {
      try { parsedAttributeTrackingRows = JSON.parse(attributeTrackingRows); } catch (e) { parsedAttributeTrackingRows = []; }
    }


    if (!name || !unit || !taxType) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, unit, or taxType",
      });
    }

    const batchNames = parsedBatches
      .map((b) => (b.batchName || "").trim().toUpperCase())
      .filter(Boolean);

    const uniqueBatchNames = new Set(batchNames);

    if (batchNames.length !== uniqueBatchNames.size) {
      return res.status(400).json({
        success: false,
        message: "Duplicate batchName found in request",
      });
    }

    const sanitize = (v) => (v === "" || v === undefined ? null : v);

    /* ===============================
       📦 BATCH CALCULATION
       =============================== */

    /* ===============================
   ✅ SAFE DUPLICATE BATCH CHECK (NODE SIDE)
   =============================== */

    const [existingItems] = await connection.execute(
      `
  SELECT id, batches
  FROM stock_items
  WHERE company_id = ?
    AND owner_type = ?
    AND owner_id = ?
  `,
      [company_id, owner_type, owner_id]
    );

    for (const rawName of batchNames) {
      const batchName = String(rawName || "").trim().toUpperCase();

      if (!batchName) continue;

      for (const item of existingItems) {
        let dbBatches = [];

        try {
          dbBatches = item.batches ? JSON.parse(item.batches) : [];
          if (!Array.isArray(dbBatches)) dbBatches = [];
        } catch {
          dbBatches = [];
        }

        const found = dbBatches.some(
          (b) =>
            String(b.batchName || "")
              .trim()
              .toUpperCase() === batchName
        );

        if (found) {
          await connection.rollback();

          return res.status(409).json({
            success: false,
            message: `Batch "${batchName}" already exists`,
          });
        }
      }
    }

    let totalOpeningValue = 0;

    const batchData = parsedBatches.map((b) => {
      const qty = Number(b.batchQuantity) || 0;
      const rate = Number(b.batchRate) || 0;
      const openingValue = qty * rate;

      totalOpeningValue += openingValue;

      return {
        batchName: sanitize(b.batchName),
        batchQuantity: qty,
        openingRate: rate,
        openingValue,
        batchExpiryDate: sanitize(b.batchExpiryDate),
        batchManufacturingDate: sanitize(b.batchManufacturingDate),
        mode: "opening",
        mrp: Number(b.mrp) || 0,
      };
    });

    /* ===============================
       🖼️ IMAGE UPLOAD (CLOUDINARY)
       =============================== */
    let imageUrl = null;
    if (req.file) {
      try {
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "stock_items" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
        });
        imageUrl = result.secure_url;
      } catch (uploadError) {
        console.error("❌ Cloudinary Upload Error:", uploadError);
      }
    }

    /* ===============================
       🧠 SAFE DYNAMIC INSERT
       =============================== */
    /* ===============================
       ✅ EXPLICIT & SAFE INSERT
       =============================== */

    if (tracking_type === "batch" && parsedAttributeTrackingRows.length > 0) {
      return res.status(400).json({ success: false, message: "A Batch-tracked item cannot receive Attribute tracking data." });
    }
    if (tracking_type === "attribute" && batchData.some((b) => b.batchName)) {
      return res.status(400).json({ success: false, message: "An Attribute-tracked item cannot receive Batch tracking data." });
    }

    const insertQuery = `
  INSERT INTO stock_items (
    name,
    categoryId,
    unit,
    hsnCode,
    taxType,
    gstRate,
    gstLedgerId,
    cgstLedgerId,
    sgstLedgerId,
    attributeId,
    godown_id,
    enableBatchTracking,
    tracking_type,
    barcode,
    batches,
    company_id,
    owner_type,
    owner_id,
    type,
    image
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

    const values = [
      name,
      sanitize(categoryId),
      sanitize(unit),
      sanitize(hsnCode),
      taxType,
      Number(gstRate) || 0,
      sanitize(gstLedgerId),
      sanitize(cgstLedgerId),
      sanitize(sgstLedgerId),
      sanitize(attributeId),
      sanitize(godown_id),
      enableBatchTracking ? 1 : 0,
      sanitize(tracking_type),
      sanitize(barcode),
      JSON.stringify(batchData),
      sanitize(company_id),
      sanitize(owner_type),
      sanitize(owner_id),
      "opening",
      imageUrl
    ];



    const [result] = await connection.execute(insertQuery, values);


    const stockItemId = result.insertId;

    /* ===============================
        🏬 GODOWN ALLOCATIONS
       =============================== */

    for (const alloc of parsedGodownAllocations) {
      await connection.execute(
        `
        INSERT INTO godown_allocations
        (stockItemId, godownId, quantity, value)
        VALUES (?, ?, ?, ?)
        `,
        [
          stockItemId,
          sanitize(alloc.godownId),
          alloc.quantity ?? 0,
          alloc.value ?? 0,
        ]
      );
    }

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS stock_item_attributes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        stock_item_id INT NOT NULL,
        attribute_id INT NOT NULL,
        attribute_value VARCHAR(255) NULL
      )
    `);

    for (const attrId of parsedAttributes) {
      if (attrId) {
        await connection.execute(
          'INSERT INTO stock_item_attributes (stock_item_id, attribute_id, attribute_value) VALUES (?, ?, ?)',
          [stockItemId, attrId, null]
        );
      }
    }

    /* ===============================
        📈 ATTRIBUTE TRACKING ROWS
       =============================== */
    for (const row of parsedAttributeTrackingRows) {
      if (!row.primaryAttribute) continue;
      const qty = Number(row.quantity) || 0;
      const rate = Number(row.rate) || 0;
      const total = qty * rate;
      const primaryValue = row.primaryAttributeValue || null;
      const mode = row.mode || 'opening';

      const [trackingRes] = await connection.execute(
        `
        INSERT INTO stock_item_attribute_tracking
        (stock_item_id, primary_attribute_id, primary_attribute_value, quantity, rate, total_value, mode)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [stockItemId, row.primaryAttribute, primaryValue, qty, rate, total, mode]
      );

      const trackingId = trackingRes.insertId;

      if (Array.isArray(row.subAttributes)) {
        for (const subAttrId of row.subAttributes) {
          if (subAttrId) {
            const subVal = (row.subAttributeValues && row.subAttributeValues[subAttrId]) ? row.subAttributeValues[subAttrId] : null;
            await connection.execute(
              `
              INSERT INTO tracking_sub_attributes
              (tracking_id, sub_attribute_id, sub_attribute_value)
              VALUES (?, ?, ?)
              `,
              [trackingId, subAttrId, subVal]
            );
          }
        }
      }
    }

    await connection.commit();

    res.json({
      success: true,
      message: "Stock item saved successfully",
      stockItemId,
      openingValue: totalOpeningValue,
    });
  } catch (err) {
    console.error("🔥 Error saving stock item:", err);
    await connection.rollback();
    res.status(500).json({
      success: false,
      message: "Error saving stock item",
      error: err.message,
    });
  } finally {
    connection.release();
  }
});

// Helper for parsing batches and godownAllocations in PUT
const parseFormDataArrays = (req) => {
  if (typeof req.body.batches === "string") {
    try { req.body.batches = JSON.parse(req.body.batches); } catch (e) { req.body.batches = []; }
  }
  if (typeof req.body.godownAllocations === "string") {
    try { req.body.godownAllocations = JSON.parse(req.body.godownAllocations); } catch (e) { req.body.godownAllocations = []; }
  }
  if (typeof req.body.attributes === "string") {
    try { req.body.attributes = JSON.parse(req.body.attributes); } catch (e) { req.body.attributes = []; }
  }
  if (typeof req.body.attributeTrackingRows === "string") {
    try { req.body.attributeTrackingRows = JSON.parse(req.body.attributeTrackingRows); } catch (e) { req.body.attributeTrackingRows = []; }
  }
};

// stock purchase item

router.post("/purchase-batch", async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      name,
      stockGroupId,
      categoryId,
      unit,
      openingBalance,
      hsnCode,
      gstRate,
      taxType,
      standardPurchaseRate,
      standardSaleRate,
      enableBatchTracking,
      allowNegativeStock,
      maintainInPieces,
      secondaryUnit,
      batches = [],
      godownAllocations = [],
      barcode,
      company_id,
      owner_type,
      owner_id,
    } = req.body;

    if (!name || !unit || !taxType) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, unit, or taxType",
      });
    }

    // 1️⃣ Create table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS stock_purchase (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        stockGroupId INT,
        categoryId INT,
        unit VARCHAR(50) NOT NULL,
        openingBalance DECIMAL(15,2) DEFAULT 0,
        openingValue DECIMAL(15,2) DEFAULT 0,
        hsnCode VARCHAR(50),
        gstRate DECIMAL(5,2) DEFAULT 0,
        taxType VARCHAR(50),
        standardPurchaseRate DECIMAL(15,2) DEFAULT 0,
        standardSaleRate DECIMAL(15,2) DEFAULT 0,
        enableBatchTracking TINYINT(1) DEFAULT 0,
        allowNegativeStock TINYINT(1) DEFAULT 0,
        maintainInPieces TINYINT(1) DEFAULT 0,
        secondaryUnit VARCHAR(50),
        barcode VARCHAR(100),
        company_id INT,
        owner_type VARCHAR(50),
        owner_id INT,
        batches JSON,
        type VARCHAR(50) DEFAULT 'purchase',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Helper to convert empty strings to null
    const sanitize = (value) =>
      value === "" || value === undefined ? null : value;

    // 2️⃣ Prepare batch data
    let totalOpeningValue = 0;

    const batchData = (batches || []).map((batch) => {
      const qty = Number(batch.batchQuantity) || 0;
      const rate = Number(batch.batchRate) || 0;
      const openingValue = qty * rate;
      totalOpeningValue += openingValue;

      return {
        batchName: sanitize(batch.batchName),
        batchQuantity: qty,
        openingRate: rate,
        openingValue,
        batchExpiryDate: sanitize(batch.batchExpiryDate),
        batchManufacturingDate: sanitize(batch.batchManufacturingDate),
      };
    });

    // 3️⃣ Insert into stock_purchase
    const insertQuery = `
      INSERT INTO stock_purchase (
        name, stockGroupId, categoryId, unit, openingBalance, openingValue,
        hsnCode, gstRate, taxType, standardPurchaseRate, standardSaleRate,
        enableBatchTracking, allowNegativeStock, maintainInPieces, secondaryUnit,
        barcode, company_id, owner_type, owner_id, batches
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      name,
      sanitize(stockGroupId),
      sanitize(categoryId),
      unit,
      openingBalance ?? 0,
      totalOpeningValue ?? 0,
      sanitize(hsnCode),
      gstRate ?? 0,
      taxType,
      standardPurchaseRate ?? 0,
      standardSaleRate ?? 0,
      enableBatchTracking ? 1 : 0,
      allowNegativeStock ? 1 : 0,
      maintainInPieces ? 1 : 0,
      sanitize(secondaryUnit),
      sanitize(barcode),
      sanitize(company_id),
      sanitize(owner_type),
      sanitize(owner_id),
      JSON.stringify(batchData),
    ];

    const [result] = await connection.execute(insertQuery, values);
    const stockItemId = result.insertId;

    // 4️⃣ Insert Godown Allocations
    for (const alloc of godownAllocations || []) {
      await connection.execute(
        `
        INSERT INTO godown_allocations (stockItemId, godownId, quantity, value)
        VALUES (?, ?, ?, ?)
      `,
        [
          stockItemId,
          sanitize(alloc.godownId),
          alloc.quantity ?? 0,
          alloc.value ?? 0,
        ]
      );
    }

    await connection.commit();

    res.json({
      success: true,
      message: "Stock purchase saved successfully",
      stockItemId,
      batchesInserted: batchData.length,
      openingValue: totalOpeningValue,
    });
  } catch (err) {
    console.error("🔥 Error saving stock purchase:", err);
    await connection.rollback();
    res.status(500).json({
      success: false,
      message: "Error saving stock purchase",
      error: err.message,
    });
  } finally {
    connection.release();
  }
});

// GET stock purchases with access control
router.get("/purchase-batch", async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { company_id, owner_id, owner_type } = req.query;

    if (!company_id || !owner_id) {
      return res.status(400).json({
        success: false,
        message: "company_id and owner_id are required to fetch data",
      });
    }

    let query = `
      SELECT * FROM stock_purchase
      WHERE company_id = ? AND owner_id = ?
    `;
    const params = [company_id, owner_id];

    if (owner_type) {
      query += " AND owner_type = ?";
      params.push(owner_type);
    }

    const [rows] = await connection.execute(query, params);

    // Parse batches JSON
    const formattedRows = rows.map((row) => ({
      ...row,
      batches: row.batches ? JSON.parse(row.batches) : [],
    }));

    res.json({
      success: true,
      data: formattedRows,
    });
  } catch (err) {
    console.error("🔥 Error fetching stock purchases:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching stock purchases",
      error: err.message,
    });
  } finally {
    connection.release();
  }
});

// GET item details by barcode
router.get("/barcode/:barcode", async (req, res) => {
  const { barcode } = req.params;
  const connection = await db.getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT 
        s.id, s.name, NULL AS stockGroupId, s.unit, 0.00 AS openingBalance,
        s.hsnCode, s.gstRate, s.taxType, s.barcode,
        NULL AS stockGroupName,
        u.name AS unitName
      FROM stock_items s
      LEFT JOIN stock_units u ON s.unit = u.id
      WHERE s.barcode = ?`,
      [barcode]
    );
    if (rows.length === 0) {
      res.status(404).json({ success: false, message: "Item not found." });
    } else {
      res.json({ success: true, data: rows[0] });
    }
  } catch (err) {
    console.error("🔥 Error fetching item by barcode:", err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    connection.release();
  }
});

// ledger get and filter sgst, cgst, igst
router.get("/ledger", async (req, res) => {
  try {
    const { company_id, owner_type, owner_id } = req.query;

    if (!company_id || !owner_type || !owner_id) {
      return res.status(400).json({
        success: false,
        message: "company_id, owner_type and owner_id are required",
      });
    }

    // ✅ Case-insensitive search (upper/lower dono chalega)
    const [rows] = await db.query(
      `
      SELECT id, name
      FROM ledgers
      WHERE company_id = ?
        AND (
          (owner_type = ? AND owner_id = ?) 
          OR owner_id = 0
        )
        AND group_id = -103
        AND (
          LOWER(name) LIKE '%gst%'
          OR LOWER(name) LIKE '%cgst%'
          OR LOWER(name) LIKE '%sgst%'
          OR LOWER(name) LIKE '%igst%'
        )
      `,
      [company_id, owner_type, owner_id]
    );

    const result = {
      gst: [],
      cgst: [],
      sgst: [],
      igst: [],
    };

    rows.forEach((ledger) => {
      const lname = ledger.name.toLowerCase(); // ✅ sab lowercase

      if (lname.includes("igst")) {
        result.igst.push(ledger);
      }
      else if (lname.includes("cgst")) {
        result.cgst.push(ledger);
      }
      else if (lname.includes("sgst")) {
        result.sgst.push(ledger);
      }
      else if (lname.includes("gst")) {
        result.gst.push(ledger);
      }
    });

    res.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error("Ledger fetch error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch ledgers",
    });
  }
});



// POST add a single batch to existing stock item
router.post("/:id/batches", async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      batchName,
      batchQuantity = 0,
      batchRate = 0,
      batchExpiryDate = null,
      batchManufacturingDate = null,
      mode = "purchase",
      mrp = 0,
      company_id,
      owner_type,
      owner_id,
    } = req.body;

    // Allow null/empty batchName for no-batch purchase items
    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Missing item id" });
    }

    // Fetch existing item
    const [rows] = await connection.execute(
      `SELECT id, batches, company_id, owner_type, owner_id FROM stock_items WHERE id = ?`,
      [id]
    );

    if (!rows || rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Stock item not found" });
    }

    const item = rows[0];

    // Optional access control: if company/owner provided, verify
    if (company_id && String(item.company_id) !== String(company_id)) {
      return res
        .status(403)
        .json({ success: false, message: "Company mismatch" });
    }

    if (owner_id && String(item.owner_id) !== String(owner_id)) {
      return res
        .status(403)
        .json({ success: false, message: "Owner mismatch" });
    }

    let batches = [];
    try {
      batches = item.batches ? JSON.parse(item.batches) : [];
      if (!Array.isArray(batches)) batches = [];
    } catch (e) {
      batches = [];
    }

    const newBatch = {
      batchName: batchName || null,  // null for no-batch items
      batchQuantity: Number(batchQuantity) || 0,
      batchRate: Number(batchRate) || 0,
      batchExpiryDate: batchExpiryDate || null,
      mode: mode || "purchase",
      batchManufacturingDate: batchManufacturingDate || null,
      mrp: Number(mrp) || 0,
    };



    batches.push(newBatch);

    await connection.execute(
      `UPDATE stock_items SET batches = ? WHERE id = ?`,
      [JSON.stringify(batches), id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Batch added",
      batch: newBatch,
      batches,
    });
  } catch (err) {
    console.error("🔥 Error adding batch:", err);
    await connection.rollback();
    res.status(500).json({
      success: false,
      message: "Error adding batch",
      error: err.message,
    });
  } finally {
    connection.release();
  }
});

// Deleter Request

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { company_id, owner_type, owner_id } = req.query;

  if (!company_id || !owner_type || !owner_id) {
    return res.status(400).json({
      success: false,
      message: "company_id, owner_type & owner_id are required",
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 🔹 1. Get stock item (name check)
    const [items] = await connection.execute(
      `
      SELECT id, name, image 
      FROM stock_items
      WHERE id = ? AND company_id = ? AND owner_type = ? AND owner_id = ?
      `,
      [id, company_id, owner_type, owner_id]
    );

    if (items.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Stock item not found or access denied",
      });
    }

    const itemName = items[0].name;
    const itemImage = items[0].image;

    // 🔹 2. Check sales_history & purchase_history usage
    const [[usage]] = await connection.execute(
      `
      SELECT 
        EXISTS (
          SELECT 1 FROM sale_history 
          WHERE itemName = ? AND companyId = ? AND ownerType = ? AND ownerId = ?
        ) AS saleUsed,
        EXISTS (
          SELECT 1 FROM purchase_history 
          WHERE itemName = ? AND companyId = ? AND ownerType = ? AND ownerId = ?
        ) AS purchaseUsed
      `,
      [
        itemName,
        company_id,
        owner_type,
        owner_id,
        itemName,
        company_id,
        owner_type,
        owner_id,
      ]
    );

    if (usage.saleUsed || usage.purchaseUsed) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message:
          "This stock item is used in Sales or Purchase vouchers, cannot delete",
      });
    }

    // 🔹 3. Delete dependent records
    await connection.execute(
      "DELETE FROM godown_allocations WHERE stockItemId = ?",
      [id]
    );

    // 🔹 4. Delete stock item
    await connection.execute("DELETE FROM stock_items WHERE id = ?", [id]);

    // 🔹 5. Delete image from Cloudinary if exists
    if (itemImage && itemImage.includes("res.cloudinary.com")) {
      try {
        const parts = itemImage.split("/");
        const publicId = `stock_item/${parts.pop().split(".")[0]}`;
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.error("❌ Cloudinary Delete Error (Item Deletion):", err);
      }
    }

    await connection.commit();

    return res.json({
      success: true,
      message: "Stock item deleted successfully",
    });
  } catch (err) {
    await connection.rollback();
    console.error("🔥 Error deleting stock item:", err);
    return res.status(500).json({
      success: false,
      message: "Error deleting stock item",
    });
  } finally {
    connection.release();
  }
});

router.delete("/:itemId/delete-by-hsn", async (req, res) => {
  try {
    const { itemId } = req.params;
    const { hsnCode } = req.body;
    const { company_id, owner_type, owner_id } = req.query;

    if (!itemId || !hsnCode) {
      return res.status(400).json({
        success: false,
        message: "itemId and hsnCode required",
      });
    }

    const [result] = await db.query(
      `
      DELETE FROM stock_items
      WHERE id = ?
        AND hsnCode = ?
        AND company_id = ?
        AND owner_type = ?
        AND owner_id = ?
      `,
      [itemId, hsnCode, company_id, owner_type, owner_id]
    );

    // 🔑 IMPORTANT PART
    if (result.affectedRows === 0) {
      return res.json({
        success: true,
        message: "Already deleted",
      });
    }

    res.json({
      success: true,
      message: "Deleted successfully",
    });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({
      success: false,
      message: "Delete failed",
    });
  }
});

//put item
router.put("/:id", upload.single("image"), async (req, res) => {
  parseFormDataArrays(req);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // 🔍 FETCH OLD IMAGE FOR DELETION
    const [existing] = await connection.execute(
      "SELECT image FROM stock_items WHERE id = ?",
      [id]
    );
    const oldImageUrl = existing[0]?.image;

    /* ===============================
       🔥 RUNTIME COLUMN CHECK & ADD
       =============================== */

    const ensureColumn = async (table, column, definition) => {
      const [rows] = await connection.execute(
        `
        SELECT COUNT(*) AS count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        `,
        [table, column]
      );

      if (rows[0].count === 0) {
        await connection.execute(
          `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
        );
      }
    };

    // Ensure required columns
    await ensureColumn("stock_items", "categoryId", "VARCHAR(50) NULL");
    await ensureColumn("stock_items", "gstLedgerId", "INT NULL");
    await ensureColumn("stock_items", "cgstLedgerId", "INT NULL");
    await ensureColumn("stock_items", "sgstLedgerId", "INT NULL");
    await ensureColumn("stock_items", "attributeId", "INT NULL");
    await ensureColumn("stock_items", "tracking_type", "VARCHAR(50) NULL");
    await ensureColumn("stock_items", "image", "VARCHAR(255) NULL");


    /* ===============================
       📥 REQUEST DATA
       =============================== */

    const {
      name,
      stockGroupId,
      categoryId,
      unit,
      openingBalance,
      hsnCode,
      gstRate,

      gstLedgerId,
      cgstLedgerId,
      sgstLedgerId,
      attributeId,
      attributes = [],

      taxType,
      standardPurchaseRate,
      standardSaleRate,
      enableBatchTracking,
      tracking_type,
      allowNegativeStock,
      maintainInPieces,
      secondaryUnit,
      batches = [],
      attributeTrackingRows = [],
      barcode,
      godown_id,
      company_id,
      owner_type,
      owner_id,
    } = req.body;

    if (!name || !unit || !taxType) {
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });
    }

    const sanitize = (v) => (v === "" || v === undefined ? null : v);

    /* ===============================
       📦 BATCH CALCULATION
       =============================== */

    let totalOpeningValue = 0;

    const batchData = batches.map((b) => {
      const qty = Number(b.batchQuantity) || 0;
      const rate = Number(b.batchRate) || 0;
      const openingValue = qty * rate;

      totalOpeningValue += openingValue;

      return {
        batchName: sanitize(b.batchName),
        batchQuantity: qty,
        openingRate: rate,
        openingValue,
        batchExpiryDate: sanitize(b.batchExpiryDate),
        batchManufacturingDate: sanitize(b.batchManufacturingDate),
        mode: "opening",
        mrp: Number(b.mrp) || 0,
      };
    });

    /* ===============================
       🖼️ IMAGE UPLOAD (CLOUDINARY)
       =============================== */
    let imageUrl = req.body.image || null; // fallback to existing image if no new one
    if (req.file) {
      // 🗑️ DELETE OLD IMAGE FROM CLOUDINARY
      if (oldImageUrl && oldImageUrl.includes("res.cloudinary.com")) {
        try {
          const parts = oldImageUrl.split("/");
          const publicId = `stock_item/${parts.pop().split(".")[0]}`;
          await cloudinary.uploader.destroy(publicId);
        } catch (delError) {
          console.error("❌ Cloudinary Delete Error:", delError);
        }
      }

      try {
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "stock_item" },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
        });
        imageUrl = result.secure_url;
      } catch (uploadError) {
        console.error("❌ Cloudinary Upload Error:", uploadError);
      }
    }

    let parsedAttributeTrackingRows = [];
    if (Array.isArray(attributeTrackingRows)) {
      parsedAttributeTrackingRows = attributeTrackingRows;
    } else if (typeof attributeTrackingRows === "string") {
      try { parsedAttributeTrackingRows = JSON.parse(attributeTrackingRows); } catch (e) { parsedAttributeTrackingRows = []; }
    }

    if (tracking_type === "batch" && parsedAttributeTrackingRows.length > 0) {
      return res.status(400).json({ success: false, message: "A Batch-tracked item cannot receive Attribute tracking data." });
    }
    if (tracking_type === "attribute" && batchData.some((b) => b.batchName)) {
      return res.status(400).json({ success: false, message: "An Attribute-tracked item cannot receive Batch tracking data." });
    }

    /* ===============================
       🧠 UPDATE QUERY
       =============================== */

    const updateQuery = `
      UPDATE stock_items SET 
        name = ?,
        categoryId = ?,
        unit = ?,
        hsnCode = ?,
        gstLedgerId = ?,
        cgstLedgerId = ?,
        sgstLedgerId = ?,
        attributeId = ?,
        godown_id = ?,
        taxType = ?,
        enableBatchTracking = ?,
        tracking_type = ?,
        batches = ?,
        barcode = ?,
        company_id = ?,
        owner_type = ?,
        owner_id = ?,
        image = ?
      WHERE id = ?
    `;

    const values = [
      sanitize(name),
      sanitize(categoryId),
      sanitize(unit),
      sanitize(hsnCode),
      sanitize(gstLedgerId),
      sanitize(cgstLedgerId),
      sanitize(sgstLedgerId),
      sanitize(attributeId),
      sanitize(godown_id),
      taxType ?? "Taxable",
      enableBatchTracking ? 1 : 0,
      sanitize(tracking_type),
      JSON.stringify(batchData),
      sanitize(barcode),
      sanitize(company_id),
      sanitize(owner_type),
      sanitize(owner_id),
      imageUrl,
      id,
    ];

    await connection.execute(updateQuery, values);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS stock_item_attributes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        stock_item_id INT NOT NULL,
        attribute_id INT NOT NULL,
        attribute_value VARCHAR(255) NULL
      )
    `);

    await connection.execute('DELETE FROM stock_item_attributes WHERE stock_item_id = ?', [id]);
    let parsedAttributes = Array.isArray(attributes) ? attributes : [];
    for (const attrId of parsedAttributes) {
      if (attrId) {
        await connection.execute(
          'INSERT INTO stock_item_attributes (stock_item_id, attribute_id, attribute_value) VALUES (?, ?, ?)',
          [id, attrId, null]
        );
      }
    }


    // Delete existing attribute tracking rows first
    const [oldTrackingRows] = await connection.execute(
      'SELECT id FROM stock_item_attribute_tracking WHERE stock_item_id = ?',
      [id]
    );
    if (oldTrackingRows.length > 0) {
      const oldIds = oldTrackingRows.map(r => r.id);
      await connection.execute(`DELETE FROM tracking_sub_attributes WHERE tracking_id IN (${oldIds.join(',')})`);
      await connection.execute(`DELETE FROM stock_item_attribute_tracking WHERE stock_item_id = ?`, [id]);
    }

    /* ===============================
        📈 RE-INSERT ATTRIBUTE TRACKING ROWS
       =============================== */
    parsedAttributeTrackingRows = Array.isArray(attributeTrackingRows) ? attributeTrackingRows : [];
    if (typeof attributeTrackingRows === "string") {
      try { parsedAttributeTrackingRows = JSON.parse(attributeTrackingRows); } catch (e) { parsedAttributeTrackingRows = []; }
    }
    for (const row of parsedAttributeTrackingRows) {
      if (!row.primaryAttribute) continue;
      const qty = Number(row.quantity) || 0;
      const rate = Number(row.rate) || 0;
      const total = qty * rate;
      const primaryValue = row.primaryAttributeValue || null;
      const mode = row.mode || 'opening';

      const [trackingRes] = await connection.execute(
        `
        INSERT INTO stock_item_attribute_tracking
        (stock_item_id, primary_attribute_id, primary_attribute_value, quantity, rate, total_value, mode)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [id, row.primaryAttribute, primaryValue, qty, rate, total, mode]
      );

      const trackingId = trackingRes.insertId;

      if (Array.isArray(row.subAttributes)) {
        for (const subAttrId of row.subAttributes) {
          if (subAttrId) {
            const subVal = (row.subAttributeValues && row.subAttributeValues[subAttrId]) ? row.subAttributeValues[subAttrId] : null;
            await connection.execute(
              `
              INSERT INTO tracking_sub_attributes
              (tracking_id, sub_attribute_id, sub_attribute_value)
              VALUES (?, ?, ?)
              `,
              [trackingId, subAttrId, subVal]
            );
          }
        }
      }
    }

    await connection.commit();

    return res.json({
      success: true,
      message: "Stock item updated successfully!",
      id,
      openingValue: totalOpeningValue,
      batches: batchData,
    });
  } catch (err) {
    await connection.rollback();
    console.error("🔥 Update Error:", err);
    return res.status(500).json({
      success: false,
      message: "Error updating stock item",
      error: err.message,
    });
  } finally {
    connection.release();
  }
});

// POST add tracking
router.post("/add-tracking", async (req, res) => {
  const { stock_item_id, primary_attribute_id, primary_attribute_value, sub_attributes, quantity, rate, total_value, mode } = req.body;
  
  if (!stock_item_id || !primary_attribute_id) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [trackingResult] = await connection.execute(
      `INSERT INTO stock_item_attribute_tracking 
       (stock_item_id, primary_attribute_id, primary_attribute_value, quantity, rate, total_value, mode)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [stock_item_id, primary_attribute_id, primary_attribute_value || '', quantity || 0, rate || 0, total_value || 0, mode || 'purchase']
    );
    
    const newTrackingId = trackingResult.insertId;

    if (Array.isArray(sub_attributes) && sub_attributes.length > 0) {
      for (const subAttrId of sub_attributes) {
        const val = req.body.sub_attribute_values ? req.body.sub_attribute_values[subAttrId] || '' : '';
        await connection.execute(
          `INSERT INTO tracking_sub_attributes (tracking_id, sub_attribute_id, sub_attribute_value)
           VALUES (?, ?, ?)`,
          [newTrackingId, subAttrId, val]
        );
      }
    }

    // Automatically assign this tracking attribute to the stock item if it doesn't have one
    await connection.execute(
      `UPDATE stock_items SET attributeId = ? WHERE id = ? AND (attributeId IS NULL OR attributeId = 0)`,
      [primary_attribute_id, stock_item_id]
    );

    await connection.commit();
    res.json({ success: true, tracking_id: newTrackingId, message: "Tracking added successfully" });
  } catch (err) {
    await connection.rollback();
    console.error("🔥 Error adding tracking:", err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    connection.release();
  }
});

//single get

router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const { company_id, owner_type, owner_id, mode } = req.query;

  const connection = await db.getConnection();
  try {
    const ensureColumn = async (table, column, definition) => {
      const [rows] = await connection.execute(
        `
        SELECT COUNT(*) AS count
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        `,
        [table, column]
      );
      if (rows[0].count === 0) {
        await connection.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    };
    await ensureColumn("stock_items", "image", "VARCHAR(255) NULL");
    await ensureColumn("stock_items", "gstLedgerId", "INT NULL");
    await ensureColumn("stock_items", "cgstLedgerId", "INT NULL");
    await ensureColumn("stock_items", "sgstLedgerId", "INT NULL");
    await ensureColumn("stock_items", "attributeId", "INT NULL");
    await ensureColumn("stock_items", "tracking_type", "VARCHAR(50) NULL");
    await ensureColumn("stock_items", "godown_id", "INT NULL");

    let query = `
      SELECT 
        s.id,
        s.name,
        NULL AS stockGroupId,
        s.categoryId,
        NULL AS stockGroupName,
        s.unit,
        u.name AS unitName,
        0.00 AS openingBalance,
        0.00 AS openingValue,
        s.hsnCode,
        s.gstRate,
        s.gstLedgerId,
        gl.name AS gstLedgerName,
        s.cgstLedgerId,
        s.sgstLedgerId,
        s.attributeId,
        s.godown_id,
        s.taxType,
        s.barcode,
        s.batches,
        s.enableBatchTracking,
        s.tracking_type,
        NULL AS allowNegativeStock,
        NULL AS maintainInPieces,
        NULL AS secondaryUnit,
        s.image,
        s.company_id,
        s.owner_type,
        s.owner_id
      FROM stock_items s
      LEFT JOIN stock_units u ON s.unit = u.id
      LEFT JOIN ledgers gl ON s.gstLedgerId = gl.id
      WHERE s.id = ?
    `;

    const params = [id];

    if (company_id) {
      query += " AND s.company_id = ?";
      params.push(company_id);
    }
    if (owner_type) {
      query += " AND s.owner_type = ?";
      params.push(owner_type);
    }
    if (owner_id) {
      query += " AND s.owner_id = ?";
      params.push(owner_id);
    }

    const [rows] = await connection.execute(query, params);

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "No stock item found",
      });
    }

    const item = rows[0];

    // Fetch attributes
    let itemAttributes = [];
    try {
      const [attrRows] = await connection.execute(
        `SELECT attribute_id FROM stock_item_attributes WHERE stock_item_id = ?`,
        [id]
      );
      itemAttributes = attrRows.map(row => row.attribute_id.toString());
    } catch (err) {
      console.warn("Failed to fetch stock item attributes", err);
    }

    // Fetch attribute tracking rows
    let attributeTrackingRows = [];
    try {
      const [trackingRows] = await connection.execute(
        `SELECT 
           t.id, t.primary_attribute_id as primaryAttribute, t.primary_attribute_value as primaryAttributeValue, 
           t.quantity, t.rate, t.total_value, t.mode,
           GROUP_CONCAT(CONCAT_WS('::', s.sub_attribute_id, IFNULL(s.sub_attribute_value, ''), IFNULL(sa.name, 'Unknown'))) as subAttributes
         FROM stock_item_attribute_tracking t
         LEFT JOIN tracking_sub_attributes s ON t.id = s.tracking_id
         LEFT JOIN stock_attributes sa ON s.sub_attribute_id = sa.id
         WHERE t.stock_item_id = ?
         GROUP BY t.id`,
         [id]
      );
      attributeTrackingRows = trackingRows.map(row => {
        let subAttrs = [];
        try {
          if (row.subAttributes && typeof row.subAttributes === 'string') {
             subAttrs = row.subAttributes.split(',').map(pair => {
                 const [id, value, name] = pair.split('::');
                 return { id: id, value: value || "", name: name || "Unknown" };
             });
          }
          subAttrs = subAttrs.filter((sa) => sa && sa.id && sa.id !== "null");
        } catch (e) {}

        return {
          id: row.id.toString(),
          primaryAttribute: row.primaryAttribute ? row.primaryAttribute.toString() : "",
          primaryAttributeValue: row.primaryAttributeValue || "",
          quantity: row.quantity,
          rate: row.rate,
          total_value: row.total_value,
          mode: row.mode || "opening",
          subAttributes: subAttrs.map((sa) => ({ id: sa.id.toString(), value: sa.value || "", name: sa.name || "Unknown" }))
        };
      });
    } catch (err) {
      console.warn("Failed to fetch attribute tracking rows", err);
    }

    // 🔥 batches parse
    let batches = [];

    try {
      batches = item.batches ? JSON.parse(item.batches) : [];
    } catch {
      batches = [];
    }

    // 🔥 MODE FILTER (opening / purchase)
    if (mode) {
      batches = batches.filter(
        (b) => b.mode && b.mode.toLowerCase() === mode.toLowerCase()
      );
    }

    let rate = Number(item.gstRate || 0);
    if (rate === 0 && item.gstLedgerName) {
      const match = item.gstLedgerName.match(/(\d+(\.\d+)?)/);
      if (match) {
        rate = parseFloat(match[0]);
      }
    }

    res.json({
      success: true,
      data: {
        ...item,
        gstRate: rate,
        batches,
        attributes: itemAttributes,
        attributeTrackingRows,
      },
    });
  } catch (err) {
    console.error("🔥 Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    connection.release();
  }
});

//  UPDATE ONLY BATCHES for a Stock Item
router.patch("/:id/batches", async (req, res) => {
  const { id } = req.params;
  const { company_id, owner_type, owner_id } = req.query;
  const { batchName, quantity, rate, mode } = req.body;

  console.log("🔵 PATCH /batches called:", {
    id, company_id, owner_type, owner_id,
    body: { batchName, quantity, mode, rate }
  });

  if (quantity === undefined) {
    return res.status(400).json({
      success: false,
      message: "quantity is required",
    });
  }

  const connection = await db.getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT batches, allowNegativeStock, openingBalance FROM stock_items
         WHERE id=? AND company_id=? AND owner_type=? AND owner_id=?`,
      [id, company_id, owner_type, owner_id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Stock item not found",
      });
    }

    const item = rows[0];
    let batches = JSON.parse(item.batches || "[]");
    const allowNegative = true; // Always allow negative stock

    // ====================================================================
    // ✅ SMART LOGIC: Handle empty/null batchName (no-batch selection)
    //    → FIRST check if batches array has an entry with batchName="" or null
    //      (items created with a "default" empty-named batch)
    //    → If found: update that batch's batchQuantity
    //    → If NOT found: update openingBalance (pure no-batch item)
    // ====================================================================
    const isEmptyBatchName = batchName === "" || batchName === null || batchName === undefined;

    const emptyBatchIndex = isEmptyBatchName
      ? batches.findIndex((b) => {
        const bn = b.batchName;
        return bn === null || bn === "" || bn === undefined;
      })
      : -1;

    if (isEmptyBatchName && emptyBatchIndex === -1) {
      // ─── PURE NO-BATCH ITEM → update openingBalance ───
      let currentQty = Number(item.openingBalance || 0);
      let newQty = mode === "add"
        ? currentQty + Number(quantity)
        : Number(quantity);

      console.log(`📦 openingBalance update: ${currentQty} → ${newQty}`);

      if (newQty < 0 && !allowNegative) {
        return res.status(400).json({
          success: false,
          message: `Stock cannot be negative (Current: ${currentQty}, Change: ${quantity})`,
        });
      }

      await connection.execute(
        `UPDATE stock_items SET openingBalance=? WHERE id=?`,
        [newQty, id]
      );

      return res.json({
        success: true,
        message: "Opening balance updated successfully",
        newOpeningBalance: newQty,
      });
    }

    // ====================================================================
    // ✅ BATCH ITEM: Find exact batch by batchName and update its quantity
    //    (also catches empty-named batches found in the array above)
    // ====================================================================
    const index = isEmptyBatchName
      ? emptyBatchIndex
      : batches.findIndex(
        (b) => String(b.batchName ?? "") === String(batchName ?? "")
      );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    let newQty = 0;
    if (mode === "add") {
      newQty = Number(batches[index].batchQuantity || 0) + Number(quantity);
    } else {
      newQty = Number(quantity);
    }

    console.log(`📦 batchQuantity update [${batches[index].batchName}]: ${batches[index].batchQuantity} → ${newQty}`);

    if (newQty < 0 && !allowNegative) {
      return res.status(400).json({
        success: false,
        message: `Stock cannot be negative (Current: ${batches[index].batchQuantity}, Change: ${quantity})`,
      });
    }

    batches[index].batchQuantity = newQty;

    if (rate !== undefined) {
      batches[index].batchRate = Number(rate);
    }

    await connection.execute(`UPDATE stock_items SET batches=? WHERE id=?`, [
      JSON.stringify(batches),
      id,
    ]);

    res.json({
      success: true,
      message: "Batch updated successfully",
      updatedBatch: batches[index],
    });
  } catch (err) {
    console.error("🔥 Batch Update Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update batch",
    });
  } finally {
    connection.release();
  }
});


//delete only batch
router.delete("/:id/batch", async (req, res) => {
  const { id } = req.params;
  const { company_id, owner_type, owner_id } = req.query;
  const { batchName } = req.body;

  if (!batchName) {
    return res.status(400).json({
      success: false,
      message: "batchName is required",
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `
      SELECT batches FROM stock_items
      WHERE id = ? AND company_id = ? AND owner_type = ? AND owner_id = ?
      `,
      [id, company_id, owner_type, owner_id]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Stock item not found",
      });
    }

    const batches = JSON.parse(rows[0].batches || "[]");

    const updatedBatches = batches.filter(
      (b) => String(b.batchName) !== String(batchName)
    );

    if (updatedBatches.length === batches.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    await connection.execute(
      "UPDATE stock_items SET batches = ? WHERE id = ?",
      [JSON.stringify(updatedBatches), id]
    );

    await connection.commit();

    res.json({ success: true, batches: updatedBatches });
  } catch (err) {
    await connection.rollback();
    console.error("🔥 Delete batch error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    connection.release();
  }
});
// Update attribute value for a stock item
router.put("/attribute/:linkId", async (req, res) => {
  const { linkId } = req.params;
  const { value } = req.body;

  const connection = await db.getConnection();
  try {
    await connection.execute(
      "UPDATE stock_item_attributes SET attribute_value = ? WHERE id = ?",
      [value || null, linkId]
    );

    res.json({ success: true, message: "Attribute value updated successfully" });
  } catch (err) {
    console.error("🔥 Error updating attribute value:", err);
    res.status(500).json({ success: false, message: "Server error updating attribute value" });
  } finally {
    connection.release();
  }
});

module.exports = router;
