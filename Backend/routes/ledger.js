const express = require("express");
const router = express.Router();
const db = require("../db"); // your MySQL pool
// const checkPermission = require('../middlewares/checkPermission');

const deduplicateLedgerRows = (rows) => {
  if (!Array.isArray(rows)) return [];
  const seenIds = new Map();
  const seenNames = new Map();

  for (const row of rows) {
    if (!row) continue;
    const idKey = row.id != null && row.id !== "" ? String(row.id) : null;
    const nameKey = row.name ? row.name.trim().toLowerCase() : null;

    if (idKey && seenIds.has(idKey)) {
      continue;
    }

    if (nameKey && seenNames.has(nameKey)) {
      const existing = seenNames.get(nameKey);
      const existingOwnerId = Number(existing.ownerId ?? existing.owner_id ?? 0);
      const currentOwnerId = Number(row.ownerId ?? row.owner_id ?? 0);
      if (existingOwnerId === 0 && currentOwnerId !== 0) {
        if (existing.id != null) seenIds.delete(String(existing.id));
        seenNames.set(nameKey, row);
        if (idKey) seenIds.set(idKey, row);
      }
      continue;
    }

    if (idKey) seenIds.set(idKey, row);
    if (nameKey) seenNames.set(nameKey, row);
  }

  return Array.from(seenNames.values());
};

// Check for duplicate ledger name
router.get("/check-duplicate", async (req, res) => {
  const { name, gst_number, company_id, owner_type, owner_id, exclude_id } = req.query;

  if ((!name && !gst_number) || !company_id || !owner_type || !owner_id) {
    return res.status(400).json({ message: "Missing required parameters" });
  }

  try {
    let sql = `SELECT id, name FROM ledgers WHERE company_id = ? AND ((owner_type = ? AND owner_id = ?) OR owner_id = 0)`;
    const params = [company_id, owner_type, owner_id];

    if (name) {
      sql += ` AND LOWER(TRIM(name)) = LOWER(TRIM(?))`;
      params.push(name);
    } else if (gst_number) {
      sql += ` AND gst_number = ?`;
      params.push(gst_number);
    }

    if (exclude_id) {
      sql += ` AND id != ?`;
      params.push(exclude_id);
    }

    const [rows] = await db.execute(sql, params);
    res.json({
      exists: rows.length > 0,
      ledgerId: rows.length > 0 ? rows[0].id : null,
      ledgerName: rows.length > 0 ? rows[0].name : null,
    });
  } catch (err) {
    console.error("Error checking duplicate ledger:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get Ledgers scoped by company and owner
router.get("/", async (req, res) => {
  const { company_id, owner_type, owner_id } = req.query;

  if (!company_id || !owner_type || !owner_id) {
    return res.status(400).json({
      message: "company_id, owner_type and owner_id are required",
    });
  }

  try {
    const [rows] = await db.execute(
      `SELECT 
        l.id,
        l.name,
        l.group_id AS groupId,
        l.opening_balance AS openingBalance,
        l.closing_balance AS closingBalance,
        l.balance_type AS balanceType,
        l.address,
        l.email,
        l.phone,
        l.gst_number AS gstNumber,
        l.pan_number AS panNumber,
        l.tan_number AS tanNumber,
        l.depreciation_rate AS depreciationRate,
        l.percentage,
        l.state,
        l.district,
        l.pin_code AS pinCode,
        l.created_at AS createdAt,
        l.company_id AS companyId,
        l.owner_type AS ownerType,
        l.owner_id AS ownerId,
        g.name AS groupName,
        g.type AS groupType,
        g.nature AS groupNature
      FROM ledgers l
      LEFT JOIN ledger_groups g ON l.group_id = g.id
      WHERE l.company_id = ?
        AND (
          (l.owner_type = ? AND l.owner_id = ?) 
          OR l.owner_id = 0
        )
      ORDER BY l.name`,
      [company_id, owner_type, owner_id]
    );

    const deduplicatedRows = deduplicateLedgerRows(rows);
    res.json(deduplicatedRows);
  } catch (err) {
    console.error("Error fetching ledgers:", err);
    res.status(500).json({ message: "Failed to fetch ledgers" });
  }
});

// Create a new ledger scoped by company and owner
router.post("/", async (req, res) => {
  const {
    name,
    groupId,
    openingBalance,
    closingBalance,
    balanceType,
    address,
    email,
    phone,
    gstNumber,
    panNumber,
    tanNumber,
    depreciationRate,
    state,
    district,
    pinCode,
    companyId,
    ownerType,
    ownerId,
  } = req.body;

  if (!companyId || !ownerType || !ownerId || !name || !groupId) {
    return res.status(400).json({
      message: "companyId, ownerType, ownerId, name, and groupId are required",
    });
  }

  try {
    // 🔍 Check if ledger name already exists for this company/owner (case-insensitive)
    const [existingLedger] = await db.execute(
      `SELECT id, name, group_id AS groupId, balance_type AS balanceType 
       FROM ledgers 
       WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) 
       AND company_id = ? 
       AND ((owner_type = ? AND owner_id = ?) OR owner_id = 0)`,
      [name, companyId, ownerType, ownerId]
    );

    if (existingLedger.length > 0) {
      if (req.body.reuseIfExists) {
        return res.status(200).json({
          message: "Ledger already exists",
          ledger: existingLedger[0],
        });
      }
      return res.status(400).json({
        message: `Ledger with name "${name}" already exists.`,
      });
    }

    // 🔍 Check if columns exist and add if missing
    const [colClosing] = await db.execute(`
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ledgers'
    AND COLUMN_NAME = 'closing_balance';
  `);

    if (colClosing.length === 0) {
      await db.execute(`
      ALTER TABLE ledgers
      ADD COLUMN closing_balance DECIMAL(15,2) DEFAULT 0;
    `);
    }

    // Check for state column
    const [colState] = await db.execute(`
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ledgers'
    AND COLUMN_NAME = 'state';
  `);

    if (colState.length === 0) {
      await db.execute(`
      ALTER TABLE ledgers
      ADD COLUMN state VARCHAR(100) DEFAULT '';
    `);
    }

    // Check for district column
    const [colDistrict] = await db.execute(`
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ledgers'
    AND COLUMN_NAME = 'district';
  `);

    if (colDistrict.length === 0) {
      await db.execute(`
      ALTER TABLE ledgers
      ADD COLUMN district VARCHAR(100) DEFAULT '';
    `);
    }

    // Check for pin_code column
    const [colPinCode] = await db.execute(`
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ledgers'
    AND COLUMN_NAME = 'pin_code';
  `);

    if (colPinCode.length === 0) {
      await db.execute(`
      ALTER TABLE ledgers
      ADD COLUMN pin_code VARCHAR(20) DEFAULT '';
    `);
    }

    // 🔁 Auto handle missing closingBalance
    const finalClosingBalance =
      closingBalance !== undefined ? closingBalance : openingBalance || 0;

    let isFixedAssetsGroup = false;
    if (String(groupId) === "-9") {
      isFixedAssetsGroup = true;
    } else if (groupId) {
      const [grpRows] = await db.execute(`SELECT name FROM ledger_groups WHERE id = ?`, [groupId]);
      if (grpRows.length > 0) {
        const grpName = grpRows[0].name.toLowerCase().replace(/[\s-]/g, "");
        if (grpName === "fixedassets") isFixedAssetsGroup = true;
      }
    }

    const rawDepRate = depreciationRate ?? req.body.depreciation_rate;
    const finalDepreciationRate = (isFixedAssetsGroup && rawDepRate !== undefined && rawDepRate !== null && rawDepRate !== "")
      ? parseFloat(rawDepRate)
      : null;

    let isCurrentAssetsGroup = false;
    if (String(groupId) === "-5") {
      isCurrentAssetsGroup = true;
    } else if (groupId) {
      const [grpRows] = await db.execute(`SELECT name FROM ledger_groups WHERE id = ?`, [groupId]);
      if (grpRows.length > 0) {
        const grpName = grpRows[0].name.toLowerCase().replace(/[\s-]/g, "");
        if (grpName === "currentassets") isCurrentAssetsGroup = true;
      }
    }

    const rawPercentage = req.body.percentage;
    const finalPercentage = (isCurrentAssetsGroup && rawPercentage !== undefined && rawPercentage !== null && rawPercentage !== "")
      ? parseFloat(rawPercentage)
      : null;

    const sql = `
    INSERT INTO ledgers 
    (name, group_id, opening_balance, closing_balance, balance_type, address, email, phone, gst_number, pan_number, tan_number, depreciation_rate, percentage, state, district, pin_code, company_id, owner_type, owner_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    const [result] = await db.execute(sql, [
      name,
      groupId,
      openingBalance || 0,
      finalClosingBalance,
      balanceType || "debit",
      address || "",
      email || "",
      phone || "",
      gstNumber || "",
      panNumber || "",
      tanNumber || req.body.tan_number || "",
      finalDepreciationRate,
      finalPercentage,
      state || "",
      district || "",
      pinCode || "",
      companyId,
      ownerType,
      ownerId,
    ]);

    res.status(201).json({ 
      message: "Ledger created successfully",
      ledger: {
        id: result.insertId,
        name,
        groupId,
        gstNumber,
        state,
        address,
        pinCode,
        panNumber,
        tanNumber: tanNumber || req.body.tan_number || "",
        depreciationRate: finalDepreciationRate,
        percentage: finalPercentage,
        balanceType: balanceType || "debit"
      }
    });
  } catch (err) {
    console.error("Error creating ledger:", err);
    res.status(500).json({ message: "Failed to create ledger" });
  }
});

// Get only Cash/Bank Ledgers (for Contra Voucher)
router.get("/cash-bank", async (req, res) => {
  const { company_id, owner_type, owner_id } = req.query;

  try {
    if (!company_id || !owner_type || !owner_id) {
      return res.status(400).json({
        message: "companyId, ownerType, and ownerId are required",
      });
    }

    const [rows] = await db.execute(
      `
      SELECT 
        l.id,
        l.name,
        l.created_at AS createdAt,
        g.name AS groupName
      FROM ledgers l
      INNER JOIN ledger_groups g ON l.group_id = g.id
      WHERE 
        (
          LOWER(l.name) LIKE '%cash%' OR 
          LOWER(l.name) LIKE '%bank%' OR
          LOWER(g.name) LIKE '%cash%' OR 
          LOWER(g.name) LIKE '%bank%'
        )
        AND l.company_id = ?
        AND (
          (l.owner_type = ? AND l.owner_id = ?) 
          OR l.owner_id = 0
        )
      ORDER BY l.name ASC
      `,
      [company_id, owner_type, owner_id]
    );

    const deduplicatedRows = deduplicateLedgerRows(rows);
    res.json(deduplicatedRows);
  } catch (err) {
    console.error("Error fetching cash/bank ledgers:", err);
    res.status(500).json({ message: "Failed to fetch cash/bank ledgers" });
  }
});

// Create multiple ledgers in bulk
router.post("/bulk", async (req, res) => {
  const { ledgers, companyId, ownerType, ownerId } = req.body;

  // Validate top-level tenant ownership required
  if (!companyId || !ownerType || !ownerId) {
    return res
      .status(400)
      .json({ message: "companyId, ownerType, and ownerId are required" });
  }

  if (!ledgers || !Array.isArray(ledgers) || ledgers.length === 0) {
    return res.status(400).json({ message: "Invalid ledgers data" });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Check if state and district columns exist, add if missing
    const [colState] = await connection.execute(`
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ledgers'
    AND COLUMN_NAME = 'state';
  `);

    if (colState.length === 0) {
      await connection.execute(`
      ALTER TABLE ledgers
      ADD COLUMN state VARCHAR(100) DEFAULT '';
    `);
    }

    const [colDistrict] = await connection.execute(`
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ledgers'
    AND COLUMN_NAME = 'district';
  `);

    if (colDistrict.length === 0) {
      await connection.execute(`
      ALTER TABLE ledgers
      ADD COLUMN district VARCHAR(100) DEFAULT '';
    `);
    }

    const [colPinCode] = await connection.execute(`
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ledgers'
    AND COLUMN_NAME = 'pin_code';
  `);

    if (colPinCode.length === 0) {
      await connection.execute(`
      ALTER TABLE ledgers
      ADD COLUMN pin_code VARCHAR(20) DEFAULT '';
    `);
    }

    const sql = `
      INSERT INTO ledgers 
      (name, group_id, opening_balance, balance_type, address, email, phone, gst_number, pan_number, tan_number, depreciation_rate, percentage, state, district, pin_code, company_id, owner_type, owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Deduplicate incoming batch by ledger name
    const uniqueBatchLedgers = [];
    const seenBatchNames = new Set();
    for (const item of ledgers) {
      if (!item || !item.name) continue;
      const key = item.name.trim().toLowerCase();
      if (!seenBatchNames.has(key)) {
        seenBatchNames.add(key);
        uniqueBatchLedgers.push(item);
      }
    }

    if (uniqueBatchLedgers.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: "No valid ledgers provided" });
    }

    // Check existing ledgers in DB for this company & owner to prevent duplicate records
    const [existingLedgers] = await connection.execute(
      `SELECT LOWER(TRIM(name)) AS name 
       FROM ledgers 
       WHERE company_id = ? 
       AND ((owner_type = ? AND owner_id = ?) OR owner_id = 0)`,
      [companyId, ownerType, ownerId]
    );
    const existingNamesSet = new Set(existingLedgers.map((r) => r.name));

    const results = [];

    for (const ledger of uniqueBatchLedgers) {
      const {
        name,
        groupId,
        openingBalance,
        balanceType,
        address,
        email,
        phone,
        gstNumber,
        panNumber,
        tanNumber,
        depreciationRate,
        percentage,
        state,
        district,
        pinCode,
      } = ledger;

      //  Validate required fields
      if (!name || !groupId) {
        throw new Error(
          `Missing required fields for ledger: ${name || "Unknown"}`
        );
      }

      const trimmedName = name.trim();
      const lowerName = trimmedName.toLowerCase();

      // Skip duplicate ledger if already present in database or batch
      if (existingNamesSet.has(lowerName)) {
        results.push({ name: trimmedName, status: "skipped", reason: "Already exists" });
        continue;
      }

      let isFixedAssetsGroup = false;
      if (String(groupId) === "-9") {
        isFixedAssetsGroup = true;
      } else if (groupId) {
        const [grpRows] = await connection.execute(`SELECT name FROM ledger_groups WHERE id = ?`, [groupId]);
        if (grpRows.length > 0) {
          const grpName = grpRows[0].name.toLowerCase().replace(/[\s-]/g, "");
          if (grpName === "fixedassets") isFixedAssetsGroup = true;
        }
      }

      const itemDepRate = depreciationRate ?? ledger.depreciation_rate;
      const finalDepreciationRate = (isFixedAssetsGroup && itemDepRate !== undefined && itemDepRate !== null && itemDepRate !== "")
        ? parseFloat(itemDepRate)
        : null;

      let isCurrentAssetsGroup = false;
      if (String(groupId) === "-5") {
        isCurrentAssetsGroup = true;
      } else if (groupId) {
        const [grpRows] = await connection.execute(`SELECT name FROM ledger_groups WHERE id = ?`, [groupId]);
        if (grpRows.length > 0) {
          const grpName = grpRows[0].name.toLowerCase().replace(/[\s-]/g, "");
          if (grpName === "currentassets") isCurrentAssetsGroup = true;
        }
      }

      const itemPct = percentage ?? ledger.percentage;
      const finalPercentage = (isCurrentAssetsGroup && itemPct !== undefined && itemPct !== null && itemPct !== "")
        ? parseFloat(itemPct)
        : null;

      await connection.execute(sql, [
        trimmedName,
        groupId,
        openingBalance || 0,
        balanceType || "debit",
        address || "",
        email || "",
        phone || "",
        gstNumber || "",
        panNumber || "",
        tanNumber || ledger.tan_number || "",
        finalDepreciationRate,
        finalPercentage,
        state || "",
        district || "",
        pinCode || "",
        companyId,
        ownerType,
        ownerId,
      ]);

      existingNamesSet.add(lowerName);
      results.push({ name: trimmedName, status: "created" });
    }

    await connection.commit();
    const createdCount = results.filter((r) => r.status === "created").length;
    const skippedCount = results.filter((r) => r.status === "skipped").length;

    res.status(201).json({
      message: `${createdCount} ledger(s) created successfully${skippedCount > 0 ? `, ${skippedCount} duplicate(s) skipped` : ""}!`,
      results,
    });
  } catch (err) {
    await connection.rollback();
    console.error("Bulk ledger insert error:", err);
    res.status(500).json({
      message: "Failed to create ledgers",
      error: err.message,
    });
  } finally {
    connection.release();
  }
});

// Get Admin ledger import status for a company
router.get("/import-status", async (req, res) => {
  const companyId = req.query.company_id || req.query.companyId;

  if (!companyId) {
    return res.status(400).json({ message: "company_id is required" });
  }

  try {
    const [rows] = await db.execute(
      "SELECT admin_ledgers_imported FROM tbcompanies WHERE id = ?",
      [companyId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Company not found" });
    }

    res.json({
      imported: Boolean(rows[0].admin_ledgers_imported)
    });
  } catch (err) {
    console.error("Error fetching import status:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Import Admin ledgers into target company
router.post("/import-from-admin", async (req, res) => {
  const companyId = req.body.companyId || req.body.company_id || req.query.company_id;
  const ownerType = req.body.ownerType || req.body.owner_type || req.query.owner_type || "employee";
  const ownerId = req.body.ownerId || req.body.owner_id || req.query.owner_id || 0;

  if (!companyId) {
    return res.status(400).json({ message: "companyId is required" });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Dynamically check columns present in ledgers table to prevent "Unknown column" errors
    const [tableCols] = await connection.execute("SHOW COLUMNS FROM ledgers");
    const existingTableCols = new Set(tableCols.map((c) => c.Field));

    const possibleCols = [
      "group_id",
      "opening_balance",
      "closing_balance",
      "balance_type",
      "address",
      "email",
      "phone",
      "gst_number",
      "pan_number",
      "tan_number",
      "depreciation_rate",
      "state",
      "district",
      "pin_code",
    ];

    const validCols = possibleCols.filter((col) => existingTableCols.has(col));

    const selectCols = ["name", ...validCols].join(", ");

    // 1. Fetch Admin template ledgers (company_id = 0 AND owner_type = 'admin')
    const [adminLedgers] = await connection.execute(
      `SELECT ${selectCols} FROM ledgers WHERE company_id = 0 AND owner_type = 'admin'`
    );

    if (adminLedgers.length === 0) {
      await connection.execute(
        "UPDATE tbcompanies SET admin_ledgers_imported = 1 WHERE id = ?",
        [companyId]
      );
      await connection.commit();
      return res.json({
        success: true,
        message: "No Admin ledgers configured to import.",
        importedCount: 0,
        skippedCount: 0,
      });
    }

    // 2. Fetch existing ledgers for target company to avoid duplicate creation
    const [existingLedgers] = await connection.execute(
      `SELECT LOWER(TRIM(name)) as name_lower FROM ledgers WHERE company_id = ?`,
      [companyId]
    );

    const existingNamesSet = new Set(existingLedgers.map((l) => l.name_lower));

    let importedCount = 0;
    let skippedCount = 0;

    const insertColsStr = ["name", ...validCols, "company_id", "owner_type", "owner_id"].join(", ");
    const placeholdersStr = new Array(validCols.length + 4).fill("?").join(", ");
    const insertQuery = `INSERT INTO ledgers (${insertColsStr}) VALUES (${placeholdersStr})`;

    // 3. Import missing Admin ledgers safely
    for (const ledger of adminLedgers) {
      const nameKey = (ledger.name || "").trim().toLowerCase();

      if (existingNamesSet.has(nameKey)) {
        skippedCount++;
        continue;
      }

      // Double-check existence inside loop for atomicity
      const [duplicateCheck] = await connection.execute(
        `SELECT id FROM ledgers WHERE company_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))`,
        [companyId, ledger.name]
      );

      if (duplicateCheck.length > 0) {
        skippedCount++;
        existingNamesSet.add(nameKey);
        continue;
      }

      const paramValues = [
        ledger.name,
        ...validCols.map((col) => {
          if (col === "opening_balance" || col === "closing_balance") {
            return ledger[col] ?? 0;
          }
          if (col === "balance_type") {
            return ledger[col] ?? "debit";
          }
          return ledger[col] ?? null;
        }),
        companyId,
        ownerType,
        ownerId,
      ];

      await connection.execute(insertQuery, paramValues);

      importedCount++;
      existingNamesSet.add(nameKey);
    }

    // 4. Mark Admin ledgers import as completed in database
    await connection.execute(
      "UPDATE tbcompanies SET admin_ledgers_imported = 1 WHERE id = ?",
      [companyId]
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Admin ledgers imported successfully",
      importedCount,
      skippedCount,
    });
  } catch (err) {
    await connection.rollback();
    console.error("Error importing admin ledgers:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to import admin ledgers",
      error: err.message,
    });
  } finally {
    connection.release();
  }
});

// Get ledger by ID
router.get("/:id", async (req, res) => {
  const ledgerId = parseInt(req.params.id, 10);
  const { owner_type, owner_id, company_id } = req.query;

  if (isNaN(ledgerId)) {
    return res.status(400).json({ message: "Invalid ledger ID" });
  }

  if (!owner_type || !owner_id || !company_id) {
    return res.status(400).json({
      message:
        "Missing required query params: owner_type, owner_id, company_id",
    });
  }

  try {
    const [rows] = await db.execute(
      `SELECT 
        l.*, 
        g.id AS groupId, 
        g.name AS groupName
       FROM ledgers l
       LEFT JOIN ledger_groups g ON l.group_id = g.id
       WHERE l.id = ? 
       AND l.company_id = ?
       AND (
         (l.owner_type = ? AND l.owner_id = ?)
         OR l.owner_id = 0
       )`,
      [ledgerId, company_id, owner_type, owner_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Ledger not found" });
    }

    // res.json(rows[0]);
    const ledger = rows[0];

    res.json({
      id: ledger.id,
      name: ledger.name,
      groupId: ledger.group_id, // FIXED
      openingBalance: ledger.opening_balance,
      closingBalance: ledger.closing_balance,
      balanceType: ledger.balance_type,
      address: ledger.address,
      email: ledger.email,
      phone: ledger.phone,
      gstNumber: ledger.gst_number,
      panNumber: ledger.pan_number,
      tanNumber: ledger.tan_number || "",
      depreciationRate: ledger.depreciation_rate !== null && ledger.depreciation_rate !== undefined ? parseFloat(ledger.depreciation_rate) : null,
      percentage: ledger.percentage !== null && ledger.percentage !== undefined ? parseFloat(ledger.percentage) : null,
      state: ledger.state || "",
      district: ledger.district || "",
      pinCode: ledger.pin_code || "",
      createdAt: ledger.created_at,
      groupName: ledger.groupName,
    });
  } catch (err) {
    console.error("Error fetching ledger by ID:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Update a ledger by ID
router.put("/:id", async (req, res) => {
  const ledgerId = parseInt(req.params.id, 10);
  const { owner_type, owner_id, company_id } = req.query;

  const {
    name,
    groupId,
    openingBalance,
    balanceType,
    address,
    email,
    phone,
    gstNumber,
    panNumber,
    tanNumber,
    depreciationRate,
    state,
    district,
    pinCode,
    closingBalance,
  } = req.body;

  if (isNaN(ledgerId)) {
    return res.status(400).json({ message: "Invalid ledger ID" });
  }

  if (!owner_type || !owner_id || !company_id) {
    return res.status(400).json({
      message:
        "Missing required query params: owner_type, owner_id, company_id",
    });
  }

  try {
    // 🔍 Check if ledger name already exists for this company/owner (excluding current ledger)
    const [existingLedger] = await db.execute(
      `SELECT id FROM ledgers 
       WHERE name = ? 
       AND company_id = ? 
       AND owner_type = ? 
       AND owner_id = ?
       AND id != ?`,
      [name, company_id, owner_type, owner_id, ledgerId]
    );

    if (existingLedger.length > 0) {
      return res.status(400).json({
        message: `Ledger with name "${name}" already exists.`,
      });
    }

    // Check if state and district columns exist, add if missing
    const [colState] = await db.execute(`
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ledgers'
    AND COLUMN_NAME = 'state';
  `);

    if (colState.length === 0) {
      await db.execute(`
      ALTER TABLE ledgers
      ADD COLUMN state VARCHAR(100) DEFAULT '';
    `);
    }

    const [colDistrict] = await db.execute(`
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ledgers'
    AND COLUMN_NAME = 'district';
  `);

    if (colDistrict.length === 0) {
      await db.execute(`
      ALTER TABLE ledgers
      ADD COLUMN district VARCHAR(100) DEFAULT '';
    `);
    }

    const [colPinCode] = await db.execute(`
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ledgers'
    AND COLUMN_NAME = 'pin_code';
  `);

    if (colPinCode.length === 0) {
      await db.execute(`
      ALTER TABLE ledgers
      ADD COLUMN pin_code VARCHAR(20) DEFAULT '';
    `);
    }

    let isFixedAssetsGroup = false;
    if (String(groupId) === "-9") {
      isFixedAssetsGroup = true;
    } else if (groupId) {
      const [grpRows] = await db.execute(`SELECT name FROM ledger_groups WHERE id = ?`, [groupId]);
      if (grpRows.length > 0) {
        const grpName = grpRows[0].name.toLowerCase().replace(/[\s-]/g, "");
        if (grpName === "fixedassets") isFixedAssetsGroup = true;
      }
    }

    const rawDepRate = depreciationRate ?? req.body.depreciation_rate;
    const finalDepreciationRate = (isFixedAssetsGroup && rawDepRate !== undefined && rawDepRate !== null && rawDepRate !== "")
      ? parseFloat(rawDepRate)
      : null;

    let isCurrentAssetsGroup = false;
    if (String(groupId) === "-5") {
      isCurrentAssetsGroup = true;
    } else if (groupId) {
      const [grpRows] = await db.execute(`SELECT name FROM ledger_groups WHERE id = ?`, [groupId]);
      if (grpRows.length > 0) {
        const grpName = grpRows[0].name.toLowerCase().replace(/[\s-]/g, "");
        if (grpName === "currentassets") isCurrentAssetsGroup = true;
      }
    }

    const rawPercentage = req.body.percentage;
    const finalPercentage = (isCurrentAssetsGroup && rawPercentage !== undefined && rawPercentage !== null && rawPercentage !== "")
      ? parseFloat(rawPercentage)
      : null;

    const sql = `
      UPDATE ledgers
      SET name = ?, 
          group_id = ?, 
          opening_balance = ?, 
          balance_type = ?,
          address = ?, 
          email = ?, 
          phone = ?, 
          gst_number = ?, 
          pan_number = ?,
          tan_number = ?,
          depreciation_rate = ?,
          percentage = ?,
          state = ?,
          district = ?,
          pin_code = ?,
          closing_balance = ?
      WHERE id = ? 
      AND (company_id = ? OR company_id = 0)
      AND (
        (owner_type = ? AND owner_id = ?)
        OR owner_id = 0
      )
    `;

    const [result] = await db.execute(sql, [
      name,
      groupId,
      openingBalance || 0,
      balanceType || "debit",
      address || "",
      email || "",
      phone || "",
      gstNumber || "",
      panNumber || "",
      tanNumber || req.body.tan_number || "",
      finalDepreciationRate,
      finalPercentage,
      state || "",
      district || "",
      pinCode || "",
      closingBalance !== undefined ? closingBalance : openingBalance || 0,
      ledgerId,
      company_id,
      owner_type,
      owner_id,
    ]);

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "Ledger not found or unauthorized" });
    }

    res.json({ message: "Ledger updated successfully" });
  } catch (err) {
    console.error("Error updating ledger:", err);
    res.status(500).json({ message: "Failed to update ledger" });
  }
});

// Delete a ledger by ID
router.delete("/:id", async (req, res) => {
  const ledgerId = parseInt(req.params.id, 10);

  if (isNaN(ledgerId)) {
    return res.status(400).json({ message: "Invalid ledger ID" });
  }

  try {
    // 1️⃣ Ledger exist check
    const [ledgerRows] = await db.execute(
      "SELECT id FROM ledgers WHERE id = ?",
      [ledgerId]
    );

    if (ledgerRows.length === 0) {
      return res.status(404).json({ message: "Ledger not found" });
    }

    // 2️⃣ sales_vouchers check
    const [salesVoucher] = await db.execute(
      "SELECT 1 FROM sales_vouchers WHERE partyId = ? LIMIT 1",
      [ledgerId]
    );
    if (salesVoucher.length) {
      return res.status(400).json({
        message: "Ledger used in Sales Voucher, cannot delete",
      });
    }

    // 3️⃣ purchase_orders check
    const [purchaseOrder] = await db.execute(
      "SELECT 1 FROM purchase_orders WHERE party_id = ? LIMIT 1",
      [ledgerId]
    );
    if (purchaseOrder.length) {
      return res.status(400).json({
        message: "Ledger used in Purchase Order, cannot delete",
      });
    }

    // 4️⃣ sales_orders check
    const [salesOrder] = await db.execute(
      "SELECT 1 FROM sales_orders WHERE partyId = ? LIMIT 1",
      [ledgerId]
    );
    if (salesOrder.length) {
      return res.status(400).json({
        message: "Ledger used in Sales Order, cannot delete",
      });
    }

    // 5️⃣ voucher_entries check
    const [voucherEntries] = await db.execute(
      "SELECT 1 FROM voucher_entries WHERE ledger_id = ? LIMIT 1",
      [ledgerId]
    );
    if (voucherEntries.length) {
      return res.status(400).json({
        message: "Ledger used in Vouchers, cannot delete",
      });
    }

    // 6️⃣ SAFE DELETE
    await db.execute("DELETE FROM ledgers WHERE id = ?", [ledgerId]);

    res.json({ message: "Ledger deleted successfully" });
  } catch (err) {
    console.error("Error deleting ledger:", err);
    res.status(500).json({ message: "Failed to delete ledger" });
  }
});

//patch closing balance
router.patch("/", async (req, res) => {
  const { company_id, owner_type, owner_id } = req.query;
  const { ledgerId, closingBalance } = req.body;

  if (!company_id || !owner_type || !owner_id) {
    return res.status(400).json({
      message: "company_id, owner_type and owner_id are required",
    });
  }

  if (!ledgerId || closingBalance === undefined) {
    return res.status(400).json({
      message: "ledgerId and closingBalance are required",
    });
  }

  try {
    const [result] = await db.execute(
      `
      UPDATE ledgers
      SET closing_balance = ?
      WHERE id = ?
        AND company_id = ?
        AND owner_type = ?
        AND (owner_id = ? OR owner_id = 0)
      `,
      [closingBalance, ledgerId, company_id, owner_type, owner_id]
    );

    res.json({
      success: true,
      message: "Closing balance updated successfully",
    });
  } catch (err) {
    console.error("Closing balance update error:", err);
    res.status(500).json({
      message: "Failed to update closing balance",
    });
  }
});

module.exports = router;
