const db = require("../db");
const { generateVoucherNumber } = require("./generateVoucherNumber");

/**
 * Ensure the sync audit table and tracking columns exist in the database.
 */
async function ensureSyncSchema() {
  try {
    // 1. Audit table for synced transactions
    await db.execute(`
      CREATE TABLE IF NOT EXISTS company_gst_synced_vouchers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        source_company_id INT NOT NULL,
        source_company_name VARCHAR(255) NULL,
        source_company_gst VARCHAR(50) NULL,
        source_voucher_type VARCHAR(50) NOT NULL DEFAULT 'sales',
        source_voucher_id INT NOT NULL,
        source_voucher_number VARCHAR(100) NULL,
        target_company_id INT NOT NULL,
        target_company_name VARCHAR(255) NULL,
        target_company_gst VARCHAR(50) NULL,
        target_voucher_type VARCHAR(50) NOT NULL DEFAULT 'purchase',
        target_voucher_id INT NOT NULL,
        target_voucher_number VARCHAR(100) NULL,
        sync_status VARCHAR(50) DEFAULT 'synced',
        total_amount DECIMAL(15,2) DEFAULT 0.00,
        synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_source_voucher (source_company_id, source_voucher_type, source_voucher_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);

    // 2. Ensure purchase_vouchers has tracking columns
    const [pvCols] = await db.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_vouchers'
        AND COLUMN_NAME IN ('synced_from_sales_voucher_id', 'synced_from_company_id')
    `);
    const existingPvCols = pvCols.map((c) => c.COLUMN_NAME);

    if (!existingPvCols.includes("synced_from_sales_voucher_id")) {
      await db.execute(`
        ALTER TABLE purchase_vouchers 
        ADD COLUMN synced_from_sales_voucher_id INT NULL DEFAULT NULL
      `).catch(() => {});
    }
    if (!existingPvCols.includes("synced_from_company_id")) {
      await db.execute(`
        ALTER TABLE purchase_vouchers 
        ADD COLUMN synced_from_company_id INT NULL DEFAULT NULL
      `).catch(() => {});
    }

    // 3. Ensure sales_vouchers has tracking columns
    const [svCols] = await db.execute(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_vouchers'
        AND COLUMN_NAME IN ('is_gst_synced', 'synced_to_company_id')
    `);
    const existingSvCols = svCols.map((c) => c.COLUMN_NAME);

    if (!existingSvCols.includes("is_gst_synced")) {
      await db.execute(`
        ALTER TABLE sales_vouchers 
        ADD COLUMN is_gst_synced TINYINT(1) DEFAULT 0
      `).catch(() => {});
    }
    if (!existingSvCols.includes("synced_to_company_id")) {
      await db.execute(`
        ALTER TABLE sales_vouchers 
        ADD COLUMN synced_to_company_id INT NULL DEFAULT NULL
      `).catch(() => {});
    }
  } catch (err) {
    console.error("⚠️ ensureSyncSchema error:", err.message);
  }
}

/**
 * Clean & normalize GST string for exact or substring comparisons.
 */
function normalizeGst(gst = "") {
  return String(gst || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Detect if a party ledger in source company corresponds to another company based on GST number or name.
 * 
 * Rules:
 * 1. Matches if otherCompany.gst_number === ledger.gst_number
 * 2. Matches if otherCompany.gst_number is contained inside ledger.name (e.g. "Apnat 343434sdfsdfsdf")
 * 3. Matches if otherCompany.name is contained in ledger.name and otherCompany has a GST number.
 */
async function detectTargetCompany(sourceCompanyId, partyId) {
  if (!sourceCompanyId || !partyId) return null;

  try {
    // 1. Get party ledger
    const [ledgerRows] = await db.execute(
      "SELECT id, name, gst_number, state, address, phone, email FROM ledgers WHERE id = ?",
      [partyId]
    );
    if (ledgerRows.length === 0) return null;
    const ledger = ledgerRows[0];

    // 2. Get source company
    const [sourceRows] = await db.execute(
      "SELECT id, name, gst_number, state, address, pin, phone_number, email FROM tbcompanies WHERE id = ?",
      [sourceCompanyId]
    );
    const sourceCompany = sourceRows.length > 0 ? sourceRows[0] : null;

    // 3. Fetch all other candidate companies
    const [otherCompanies] = await db.execute(
      `SELECT id, name, gst_number, state, address, pin, phone_number, email, employee_id 
       FROM tbcompanies 
       WHERE id != ? AND gst_number IS NOT NULL AND TRIM(gst_number) != ''`,
      [sourceCompanyId]
    );

    const normLedgerGst = normalizeGst(ledger.gst_number);
    const normLedgerName = normalizeGst(ledger.name);
    const rawLedgerNameLower = String(ledger.name || "").trim().toLowerCase();

    for (const comp of otherCompanies) {
      const normCompGst = normalizeGst(comp.gst_number);
      const rawCompNameLower = String(comp.name || "").trim().toLowerCase();

      if (!normCompGst) continue;

      let matchType = null;

      // Check 1: Ledger's GST number field exactly matches Company's GST
      if (normLedgerGst && normLedgerGst === normCompGst) {
        matchType = "direct_gst_match";
      }
      // Check 2: Company's GST appears inside Ledger's Name (e.g. "Apnat 343434sdfsdfsdf")
      else if (normLedgerName.includes(normCompGst) || String(ledger.name || "").toUpperCase().includes(normCompGst)) {
        matchType = "gst_in_name_match";
      }
      // Check 3: Raw company name match if both indicate the same company
      else if (rawCompNameLower && (rawLedgerNameLower === rawCompNameLower || rawLedgerNameLower.startsWith(rawCompNameLower))) {
        matchType = "company_name_match";
      }

      if (matchType) {
        return {
          targetCompany: comp,
          sourceCompany,
          partyLedger: ledger,
          matchedGst: comp.gst_number,
          matchType
        };
      }
    }

    return null;
  } catch (err) {
    console.error("🔥 detectTargetCompany error:", err);
    return null;
  }
}

/**
 * Synchronize a Sales Voucher from source company to a Purchase Voucher in target company.
 */
async function syncSalesVoucherToPurchaseVoucher(salesVoucherId) {
  if (!salesVoucherId) return { synced: false, reason: "No sales voucher ID provided" };

  await ensureSyncSchema();

  try {
    // 1. Fetch Sales Voucher
    const [voucherRows] = await db.execute(
      "SELECT * FROM sales_vouchers WHERE id = ?",
      [salesVoucherId]
    );
    if (voucherRows.length === 0) {
      return { synced: false, reason: "Sales voucher not found" };
    }
    const salesVoucher = voucherRows[0];

    // Quotations should not sync to real purchase accounts
    if (salesVoucher.isQuotation === 1 || salesVoucher.isQuotation === true) {
      return { synced: false, reason: "Quotation vouchers are not synced" };
    }

    // 2. Detect target company
    const detection = await detectTargetCompany(salesVoucher.company_id, salesVoucher.partyId);
    if (!detection) {
      return { synced: false, reason: "Party does not match any other company GST or name" };
    }

    const { targetCompany, sourceCompany, partyLedger, matchType } = detection;

    // 3. Find or Create Supplier Ledger (for Source Company) in Target Company
    // In target company (ApnaTax), ApnaBook is the Sundry Creditor
    let targetPartyId = null;
    const normSourceGst = normalizeGst(sourceCompany?.gst_number);
    const sourceName = sourceCompany?.name || "ApnaBook";

    // Try finding by GST
    if (normSourceGst) {
      const [existingLedgers] = await db.execute(
        `SELECT id FROM ledgers 
         WHERE company_id = ? AND (
           REPLACE(UPPER(TRIM(COALESCE(gst_number,''))), ' ', '') = ?
           OR LOWER(TRIM(name)) = LOWER(TRIM(?))
           OR LOWER(name) LIKE ?
         ) LIMIT 1`,
        [targetCompany.id, normSourceGst, sourceName, `%${sourceName.toLowerCase()}%`]
      );
      if (existingLedgers.length > 0) {
        targetPartyId = existingLedgers[0].id;
      }
    } else {
      // Find by name
      const [existingLedgers] = await db.execute(
        `SELECT id FROM ledgers WHERE company_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
        [targetCompany.id, sourceName]
      );
      if (existingLedgers.length > 0) {
        targetPartyId = existingLedgers[0].id;
      }
    }

    // If not found, automatically create the supplier ledger in target company!
    if (!targetPartyId) {
      const ledgerName = sourceCompany?.gst_number 
        ? `${sourceName} (${sourceCompany.gst_number})`
        : sourceName;

      const [createLedgerResult] = await db.execute(
        `INSERT INTO ledgers (
           name, group_id, opening_balance, balance_type, address, 
           gst_number, state, company_id, owner_type, owner_id
         ) VALUES (?, 14, 0.00, 'credit', ?, ?, ?, ?, ?, ?)`,
        [
          ledgerName,
          sourceCompany?.address || "",
          sourceCompany?.gst_number || "",
          sourceCompany?.state || "",
          targetCompany.id,
          targetCompany.employee_id ? "employee" : (salesVoucher.owner_type || "user"),
          targetCompany.employee_id || salesVoucher.owner_id || 1
        ]
      );
      targetPartyId = createLedgerResult.insertId;
      console.log(`✅ Auto-created supplier ledger "${ledgerName}" in target company ${targetCompany.name} (id: ${targetPartyId})`);
    }

    // 4. Find or Create Default Purchase Account in Target Company
    let targetPurchaseLedgerId = null;
    const [purchaseLedgers] = await db.execute(
      `SELECT id FROM ledgers 
       WHERE company_id = ? AND (group_id = 6 OR LOWER(name) LIKE '%purchase%') 
       LIMIT 1`,
      [targetCompany.id]
    );
    if (purchaseLedgers.length > 0) {
      targetPurchaseLedgerId = purchaseLedgers[0].id;
    } else {
      const [createPurchaseLedger] = await db.execute(
        `INSERT INTO ledgers (name, group_id, opening_balance, balance_type, company_id, owner_type, owner_id)
         VALUES ('Purchase Account', 6, 0.00, 'debit', ?, ?, ?)`,
        [
          targetCompany.id,
          targetCompany.employee_id ? "employee" : (salesVoucher.owner_type || "user"),
          targetCompany.employee_id || salesVoucher.owner_id || 1
        ]
      );
      targetPurchaseLedgerId = createPurchaseLedger.insertId;
    }

    // 5. Fetch items from sales voucher
    const [salesItems] = await db.execute(
      "SELECT * FROM sales_voucher_items WHERE voucherId = ?",
      [salesVoucherId]
    );

    // 6. Map / Create stock items in Target Company
    const targetItemsToInsert = [];
    for (const sItem of salesItems) {
      let targetItemId = null;

      // Get source item details
      let sourceItemName = `Item-${sItem.itemId}`;
      let sourceItemHsn = sItem.hsnCode || "";
      let sourceItemUnit = 1;

      if (sItem.itemId) {
        const [sourceItemRows] = await db.execute(
          "SELECT name, hsnCode, unit FROM stock_items WHERE id = ?",
          [sItem.itemId]
        );
        if (sourceItemRows.length > 0) {
          sourceItemName = sourceItemRows[0].name;
          sourceItemHsn = sourceItemRows[0].hsnCode || sItem.hsnCode || "";
          sourceItemUnit = sourceItemRows[0].unit || 1;
        }
      }

      // Check if item exists in target company by name
      const [targetItemRows] = await db.execute(
        "SELECT id FROM stock_items WHERE company_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1",
        [targetCompany.id, sourceItemName]
      );

      if (targetItemRows.length > 0) {
        targetItemId = targetItemRows[0].id;
      } else {
        // Auto-create item in target company
        const [createItemResult] = await db.execute(
          `INSERT INTO stock_items (name, hsnCode, unit, company_id, owner_type, owner_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            sourceItemName,
            sourceItemHsn,
            sourceItemUnit,
            targetCompany.id,
            targetCompany.employee_id ? "employee" : (salesVoucher.owner_type || "user"),
            targetCompany.employee_id || salesVoucher.owner_id || 1
          ]
        );
        targetItemId = createItemResult.insertId;
      }

      targetItemsToInsert.push({
        itemId: targetItemId,
        quantity: sItem.quantity || 0,
        rate: sItem.rate || 0,
        amount: sItem.amount || 0,
        discount: sItem.discount || 0,
        cgstRate: sItem.cgstRate || 0,
        sgstRate: sItem.sgstRate || 0,
        igstRate: sItem.igstRate || 0,
        hsnCode: sItem.hsnCode || sourceItemHsn,
        batchNumber: sItem.batchNumber || null,
        godownId: null,
        purchaseLedgerId: targetPurchaseLedgerId
      });
    }

    // 7. Check if there's already an existing synced purchase voucher
    const [existingSyncRows] = await db.execute(
      `SELECT * FROM company_gst_synced_vouchers 
       WHERE source_company_id = ? AND source_voucher_type = 'sales' AND source_voucher_id = ?`,
      [salesVoucher.company_id, salesVoucherId]
    );

    let targetPurchaseVoucherId = null;
    let targetPurchaseVoucherNumber = null;

    if (existingSyncRows.length > 0) {
      // UPDATE EXISTING PURCHASE VOUCHER
      targetPurchaseVoucherId = existingSyncRows[0].target_voucher_id;
      targetPurchaseVoucherNumber = existingSyncRows[0].target_voucher_number;

      // Check if target purchase voucher already exists and is identical
      const [pvCheck] = await db.execute(
        `SELECT id, total, partyId FROM purchase_vouchers WHERE id = ?`,
        [targetPurchaseVoucherId]
      );

      const isUnchanged =
        pvCheck.length > 0 &&
        Math.abs(Number(pvCheck[0].total || 0) - Number(salesVoucher.total || 0)) < 0.01 &&
        Number(pvCheck[0].partyId) === Number(targetPartyId);

      if (isUnchanged) {
        return {
          synced: true,
          action: "unchanged",
          targetCompany: targetCompany.name,
          targetPurchaseVoucherId,
          targetPurchaseVoucherNumber
        };
      }

      console.log(`🔗 Multi-Company GST Sync Triggered: ${sourceCompany?.name || salesVoucher.company_id} -> ${targetCompany.name} (GST: ${targetCompany.gst_number}) via ${matchType}`);

      await db.execute(
        `UPDATE purchase_vouchers SET
           date = ?,
           supplierInvoiceDate = ?,
           narration = ?,
           partyId = ?,
           referenceNo = ?,
           purchaseLedgerId = ?,
           subtotal = ?,
           cgstTotal = ?,
           sgstTotal = ?,
           igstTotal = ?,
           discountTotal = ?,
           total = ?,
           mode = ?
         WHERE id = ?`,
        [
          salesVoucher.date,
          salesVoucher.date,
          `Auto-synced from ${sourceName} (Sales Inv #${salesVoucher.number})`,
          targetPartyId,
          salesVoucher.number,
          targetPurchaseLedgerId,
          salesVoucher.subtotal || 0,
          salesVoucher.cgstTotal || 0,
          salesVoucher.sgstTotal || 0,
          salesVoucher.igstTotal || 0,
          salesVoucher.discountTotal || 0,
          salesVoucher.total || 0,
          salesVoucher.mode || 'item-invoice',
          targetPurchaseVoucherId
        ]
      );

      // Clear & re-insert items
      await db.execute("DELETE FROM purchase_voucher_items WHERE voucherId = ?", [targetPurchaseVoucherId]);

      if (targetItemsToInsert.length > 0) {
        const itemRows = targetItemsToInsert.map(i => [
          targetPurchaseVoucherId,
          i.itemId,
          i.quantity,
          i.rate,
          i.discount,
          i.cgstRate,
          i.sgstRate,
          i.igstRate,
          i.amount,
          0, // tdsRate
          i.godownId,
          i.purchaseLedgerId,
          null, // discountLedgerId
          null  // tracking_id
        ]);
        await db.query(
          `INSERT INTO purchase_voucher_items (
             voucherId, itemId, quantity, rate, discount, cgstRate, sgstRate, 
             igstRate, amount, tdsRate, godownId, purchaseLedgerId, discountLedgerId, tracking_id
           ) VALUES ?`,
          [itemRows]
        );
      }

      // Update sync table
      await db.execute(
        `UPDATE company_gst_synced_vouchers SET
           total_amount = ?,
           sync_status = 'synced',
           target_voucher_number = ?,
           synced_at = NOW()
         WHERE id = ?`,
        [salesVoucher.total || 0, targetPurchaseVoucherNumber, existingSyncRows[0].id]
      );

      console.log(`🔄 Updated synced purchase voucher #${targetPurchaseVoucherNumber} (id: ${targetPurchaseVoucherId}) in ${targetCompany.name}`);
    } else {
      // INSERT NEW PURCHASE VOUCHER
      targetPurchaseVoucherNumber = `PUR-SYNC-${salesVoucher.number}`;
      try {
        const generated = await generateVoucherNumber({
          companyId: targetCompany.id,
          ownerType: targetCompany.employee_id ? "employee" : (salesVoucher.owner_type || "user"),
          ownerId: targetCompany.employee_id || salesVoucher.owner_id || 1,
          voucherType: "purchase",
          date: salesVoucher.date
        });
        if (generated) targetPurchaseVoucherNumber = generated;
      } catch (e) {
        // Fallback to PUR-SYNC-number
      }

      const [pvResult] = await db.execute(
        `INSERT INTO purchase_vouchers (
           number, date, supplierInvoiceDate, narration, partyId, referenceNo,
           purchaseLedgerId, subtotal, cgstTotal, sgstTotal, igstTotal, discountTotal,
           total, company_id, owner_type, owner_id, mode,
           synced_from_sales_voucher_id, synced_from_company_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          targetPurchaseVoucherNumber,
          salesVoucher.date,
          salesVoucher.date,
          `Auto-synced from ${sourceName} (Sales Inv #${salesVoucher.number})`,
          targetPartyId,
          salesVoucher.number,
          targetPurchaseLedgerId,
          salesVoucher.subtotal || 0,
          salesVoucher.cgstTotal || 0,
          salesVoucher.sgstTotal || 0,
          salesVoucher.igstTotal || 0,
          salesVoucher.discountTotal || 0,
          salesVoucher.total || 0,
          targetCompany.id,
          targetCompany.employee_id ? "employee" : (salesVoucher.owner_type || "user"),
          targetCompany.employee_id || salesVoucher.owner_id || 1,
          salesVoucher.mode || 'item-invoice',
          salesVoucher.id,
          salesVoucher.company_id
        ]
      );
      targetPurchaseVoucherId = pvResult.insertId;

      // Insert purchase items
      if (targetItemsToInsert.length > 0) {
        const itemRows = targetItemsToInsert.map(i => [
          targetPurchaseVoucherId,
          i.itemId,
          i.quantity,
          i.rate,
          i.discount,
          i.cgstRate,
          i.sgstRate,
          i.igstRate,
          i.amount,
          0,
          i.godownId,
          i.purchaseLedgerId,
          null,
          null
        ]);
        await db.query(
          `INSERT INTO purchase_voucher_items (
             voucherId, itemId, quantity, rate, discount, cgstRate, sgstRate, 
             igstRate, amount, tdsRate, godownId, purchaseLedgerId, discountLedgerId, tracking_id
           ) VALUES ?`,
          [itemRows]
        );
      }

      // Record in company_gst_synced_vouchers
      await db.execute(
        `INSERT INTO company_gst_synced_vouchers (
           source_company_id, source_company_name, source_company_gst,
           source_voucher_type, source_voucher_id, source_voucher_number,
           target_company_id, target_company_name, target_company_gst,
           target_voucher_type, target_voucher_id, target_voucher_number,
           sync_status, total_amount
         ) VALUES (?, ?, ?, 'sales', ?, ?, ?, ?, ?, 'purchase', ?, ?, 'synced', ?)`,
        [
          salesVoucher.company_id,
          sourceName,
          sourceCompany?.gst_number || "",
          salesVoucher.id,
          salesVoucher.number,
          targetCompany.id,
          targetCompany.name,
          targetCompany.gst_number || "",
          targetPurchaseVoucherId,
          targetPurchaseVoucherNumber,
          salesVoucher.total || 0
        ]
      );

      console.log(`🎉 Created new synced purchase voucher #${targetPurchaseVoucherNumber} (id: ${targetPurchaseVoucherId}) in ${targetCompany.name}`);
    }

    // Mark sales voucher as synced
    await db.execute(
      `UPDATE sales_vouchers SET is_gst_synced = 1, synced_to_company_id = ? WHERE id = ?`,
      [targetCompany.id, salesVoucherId]
    );

    return {
      synced: true,
      targetCompany: {
        id: targetCompany.id,
        name: targetCompany.name,
        gst_number: targetCompany.gst_number
      },
      purchaseVoucherId: targetPurchaseVoucherId,
      purchaseVoucherNumber: targetPurchaseVoucherNumber,
      message: `Transaction successfully synced to ${targetCompany.name} (GST: ${targetCompany.gst_number}) as Purchase Voucher #${targetPurchaseVoucherNumber}`
    };
  } catch (err) {
    console.error("🔥 syncSalesVoucherToPurchaseVoucher error:", err);
    return { synced: false, error: err.message };
  }
}

/**
 * Delete a synced purchase voucher in target company when source sales voucher is deleted.
 */
async function deleteSyncedPurchaseVoucher(salesVoucherId, sourceCompanyId) {
  try {
    const [syncRows] = await db.execute(
      `SELECT * FROM company_gst_synced_vouchers 
       WHERE source_voucher_id = ? AND source_voucher_type = 'sales'`,
      [salesVoucherId]
    );

    if (syncRows.length === 0) return { deleted: false };

    for (const syncRecord of syncRows) {
      const pvId = syncRecord.target_voucher_id;
      // Delete items
      await db.execute("DELETE FROM purchase_voucher_items WHERE voucherId = ?", [pvId]).catch(() => {});
      // Delete entries
      await db.execute("DELETE FROM voucher_entries WHERE voucher_id = ?", [pvId]).catch(() => {});
      // Delete voucher
      await db.execute("DELETE FROM purchase_vouchers WHERE id = ?", [pvId]).catch(() => {});
      // Delete sync record
      await db.execute("DELETE FROM company_gst_synced_vouchers WHERE id = ?", [syncRecord.id]).catch(() => {});
      console.log(`🗑️ Deleted synced purchase voucher #${syncRecord.target_voucher_number} (id: ${pvId}) in target company ${syncRecord.target_company_id}`);
    }

    return { deleted: true };
  } catch (err) {
    console.error("🔥 deleteSyncedPurchaseVoucher error:", err);
    return { deleted: false, error: err.message };
  }
}

/**
 * Bulk scan and sync any eligible sales vouchers that have not yet been synced.
 */
async function syncAllPendingSalesVouchers(specificCompanyId = null, force = false) {
  await ensureSyncSchema();
  try {
    let query = `
      SELECT sv.id, sv.company_id, sv.partyId, sv.number, sv.total, l.name as partyName, l.gst_number as partyGst
      FROM sales_vouchers sv
      LEFT JOIN ledgers l ON sv.partyId = l.id
      WHERE sv.isQuotation = 0
    `;
    const params = [];
    if (!force) {
      query += ` AND sv.id NOT IN (
        SELECT source_voucher_id FROM company_gst_synced_vouchers 
        WHERE source_voucher_type = 'sales' AND sync_status = 'synced'
      )`;
    }
    if (specificCompanyId) {
      query += " AND sv.company_id = ?";
      params.push(specificCompanyId);
    }

    const [vouchers] = await db.execute(query, params);
    const results = [];

    for (const v of vouchers) {
      const detection = await detectTargetCompany(v.company_id, v.partyId);
      if (detection) {
        const syncRes = await syncSalesVoucherToPurchaseVoucher(v.id);
        results.push({
          salesVoucherId: v.id,
          salesVoucherNumber: v.number,
          total: v.total,
          partyName: v.partyName,
          targetCompany: detection.targetCompany.name,
          targetGst: detection.targetCompany.gst_number,
          syncResult: syncRes
        });
      }
    }

    return {
      success: true,
      scannedCount: vouchers.length,
      syncedCount: results.filter(r => r.syncResult?.synced).length,
      details: results
    };
  } catch (err) {
    console.error("🔥 syncAllPendingSalesVouchers error:", err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  ensureSyncSchema,
  detectTargetCompany,
  syncSalesVoucherToPurchaseVoucher,
  deleteSyncedPurchaseVoucher,
  syncAllPendingSalesVouchers
};
