const express = require("express");
const router = express.Router();
const pool = require("../db"); // your mysql2 connection pool

// GET /api/balance-sheet
router.get("/api/balance-sheet", async (req, res) => {
  const { company_id, owner_type, owner_id } = req.query;
  if (!company_id || !owner_type || !owner_id) {
    return res.status(400).json({ error: "Missing tenant parameters" });
  }

  try {
    // Fetch only groups for this tenant (if groups are tenant-specific)
    // Fetch only groups for this tenant (if groups are tenant-specific)
    const [ledgerGroups] = await pool.query(
      `
      SELECT id, name, type, parent 
      FROM ledger_groups 
      WHERE (company_id = ? AND owner_type = ? AND owner_id = ?)
      OR (company_id = ? AND company_id > 0)
      OR (company_id = 0 AND owner_type = 'employee' AND owner_id = 0)`,
      [company_id, owner_type, owner_id, company_id]
    );

    // Fetch only ledgers for this tenant
    const [ledgers] = await pool.query(
      `
      SELECT 
        l.id, 
        l.name, 
        l.group_id,
        CAST(l.opening_balance AS DECIMAL(15,2)) AS opening_balance,
        l.balance_type,
        l.closing_balance,
        g.name AS group_name,
        g.type AS group_type
      FROM ledgers l
      LEFT JOIN ledger_groups g
        ON l.group_id = g.id
      WHERE (l.company_id = ? AND ((l.owner_type = ? AND l.owner_id = ?) OR l.owner_id = 0))
         OR (l.company_id = ? AND l.company_id > 0)
      ORDER BY g.type, g.name, l.name
    `,
      [company_id, owner_type, owner_id, company_id]
    );

    // Fetch transferred Profit/Loss from voucher_entries narration
    const [transferredEntries] = await pool.query(
      `SELECT narration FROM voucher_entries 
       WHERE (narration LIKE 'PROFIT_TR:%' OR narration LIKE 'LOSS_TR:%')
       AND voucher_id IN (SELECT id FROM voucher_main WHERE company_id = ?)`,
      [company_id]
    );

    let transferredProfit = 0;
    let transferredLoss = 0;
    transferredEntries.forEach(entry => {
      if (entry.narration.startsWith('PROFIT_TR:')) {
        transferredProfit = Math.max(transferredProfit, parseFloat(entry.narration.split(':')[1]) || 0);
      } else if (entry.narration.startsWith('LOSS_TR:')) {
        transferredLoss = Math.max(transferredLoss, parseFloat(entry.narration.split(':')[1]) || 0);
      }
    });

    res.json({ ledgerGroups, ledgers, transferredProfit, transferredLoss });
  } catch (err) {
    console.error("Error fetching balance sheet data", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/api/balance-sheet/group", async (req, res) => {
  try {
    const { company_id, owner_type, owner_id, id } = req.query;

    if (!company_id || !owner_type || !owner_id || !id) {
      return res.status(400).json({
        success: false,
        message: "Missing Params",
      });
    }

    // 1️⃣ Child Groups nikalo
    const [groups] = await pool.query(
      `
      SELECT id, name, parent
      FROM ledger_groups
      WHERE parent = ?
      AND (
        (company_id = ? AND owner_type = ? AND owner_id = ?)
        OR (company_id = 0 AND owner_type = 'employee' AND owner_id = 0)
      )
      `,
      [id, company_id, owner_type, owner_id]
    );

    // 2️⃣ Direct ledgers under parent group
    const [directLedgers] = await pool.query(
      `
      SELECT 
        l.id,
        l.name,
        l.group_id,
        l.opening_balance,
        l.balance_type,
        l.closing_balance,
        g.name AS group_name
      FROM ledgers l
      LEFT JOIN ledger_groups g ON l.group_id = g.id
      WHERE 
        l.group_id = ?
        AND l.company_id = ?
        AND ((l.owner_type = ? AND l.owner_id = ?) OR l.owner_id = 0)
      `,
      [id, company_id, owner_type, owner_id]
    );

    // 3️⃣ Ledgers under child groups
    let ledgers = [...directLedgers];

    if (groups.length > 0) {
      const groupIds = groups.map((g) => g.id);

      const placeholders = groupIds.map(() => "?").join(",");

      const [rows] = await pool.query(
        `
        SELECT 
          l.id,
          l.name,
          l.group_id,
          l.opening_balance,
          l.balance_type,
          l.closing_balance,
          g.name AS group_name
        FROM ledgers l
        LEFT JOIN ledger_groups g ON l.group_id = g.id
        WHERE 
          l.group_id IN (${placeholders})
          AND l.company_id = ?
          AND ((l.owner_type = ? AND l.owner_id = ?) OR l.owner_id = 0)
        `,
        [...groupIds, company_id, owner_type, owner_id]
      );

      ledgers = [...ledgers, ...rows];
    }

    return res.json({
      success: true,
      parentId: id,
      groups,
      ledgers,
    });
  } catch (error) {
    console.error("Balance Sheet Group API Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});

router.patch("/api/profit", async (req, res) => {
  try {
    const {
      profit,
      loss,
      company_id,
      owner_type,
      owner_id,
      capitalAccountId,
      profitId
    } = req.body;

    /* -------------------------------
       1. Validation
    --------------------------------*/
    if (!company_id || !owner_type || !owner_id) {
      return res.status(400).json({
        success: false,
        error: "Missing tenant parameters",
      });
    }

    const nProfit = Number(profit) || 0;
    const nLoss = Number(loss) || 0;

    /* -------------------------------
       2. Resolve Ledger IDs
    --------------------------------*/
    let finalProfitId = profitId;
    let finalCapitalId = capitalAccountId;

    // Resolve IDs if missing
    if (!finalProfitId) {
      const [pRows] = await pool.query(
        "SELECT id FROM ledgers WHERE company_id = ? AND owner_type = ? AND owner_id = ? AND (group_id = -18 OR name LIKE '%Profit%') LIMIT 1",
        [company_id, owner_type, owner_id]
      );
      if (pRows.length > 0) finalProfitId = pRows[0].id;
    }
    if (!finalCapitalId) {
      const [cRows] = await pool.query(
        "SELECT id FROM ledgers WHERE company_id = ? AND owner_type = ? AND owner_id = ? AND (group_id = -4 OR name LIKE '%Capital%') LIMIT 1",
        [company_id, owner_type, owner_id]
      );
      if (cRows.length > 0) finalCapitalId = cRows[0].id;
    }

    /* -------------------------------
       3. Find Voucher
    --------------------------------*/
    // We need at least one valid ledger to find the voucher
    const lookupId = finalProfitId || finalCapitalId;
    if (!lookupId) {
      return res.status(404).json({ success: false, error: "Required ledgers not found" });
    }

    let [vRows] = await pool.query(
      "SELECT voucher_id FROM voucher_entries WHERE ledger_id = ? LIMIT 1",
      [lookupId]
    );

    // If no voucher contains these ledgers specifically, find ANY voucher for this company/tenant
    if (vRows.length === 0) {
      [vRows] = await pool.query(
        "SELECT id as voucher_id FROM voucher_main WHERE company_id = ? AND owner_type = ? AND owner_id = ? ORDER BY id DESC LIMIT 1",
        [company_id, owner_type, owner_id]
      );
    }

    if (vRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No vouchers found for this company. Please create at least one voucher (like an opening balance) first.",
      });
    }
    const voucherId = vRows[0].voucher_id;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // ---------------------------------------------------------
      // 4. Handle PROFIT Transfer (Only if profit > 0)
      // ---------------------------------------------------------
      if (finalProfitId && nProfit > 0) {
        const [existing] = await connection.query(
          "SELECT id, amount, narration FROM voucher_entries WHERE voucher_id = ? AND ledger_id = ? AND narration LIKE 'PROFIT_TR:%' LIMIT 1",
          [voucherId, finalProfitId]
        );

        let oldTransferred = 0;
        let entryId = existing.length > 0 ? existing[0].id : null;

        if (entryId) {
          const parts = existing[0].narration.split(':');
          oldTransferred = Number(parts[1]) || 0;
        }

        const delta = nProfit - oldTransferred;

        if (delta !== 0) {
          if (entryId) {
            // Update existing transfer with delta
            await connection.query(
              "UPDATE voucher_entries SET amount = amount + ?, narration = ? WHERE id = ?",
              [delta, `PROFIT_TR:${nProfit}`, entryId]
            );
          } else {
            // New Transfer for this ledger
            const [baseEntry] = await connection.query(
              "SELECT id FROM voucher_entries WHERE voucher_id = ? AND ledger_id = ? LIMIT 1",
              [voucherId, finalProfitId]
            );

            if (baseEntry.length > 0) {
              await connection.query(
                "UPDATE voucher_entries SET amount = amount + ?, narration = ? WHERE id = ?",
                [nProfit, `PROFIT_TR:${nProfit}`, baseEntry[0].id]
              );
            } else {
              await connection.query(
                "INSERT INTO voucher_entries (voucher_id, ledger_id, amount, entry_type, narration) VALUES (?, ?, ?, 'credit', ?)",
                [voucherId, finalProfitId, nProfit, `PROFIT_TR:${nProfit}`]
              );
            }
          }
        }
      }

      // ---------------------------------------------------------
      // 5. Handle LOSS Transfer (Only if loss > 0)
      // ---------------------------------------------------------
      if (finalCapitalId && nLoss > 0) {
        const [existing] = await connection.query(
          "SELECT id, amount, narration FROM voucher_entries WHERE voucher_id = ? AND ledger_id = ? AND narration LIKE 'LOSS_TR:%' LIMIT 1",
          [voucherId, finalCapitalId]
        );

        let oldTransferred = 0;
        let entryId = existing.length > 0 ? existing[0].id : null;

        if (entryId) {
          const parts = existing[0].narration.split(':');
          oldTransferred = Number(parts[1]) || 0;
        }

        const delta = nLoss - oldTransferred;

        if (delta !== 0) {
          if (entryId) {
            // Update existing transfer with delta
            await connection.query(
              "UPDATE voucher_entries SET amount = amount + ?, narration = ? WHERE id = ?",
              [delta, `LOSS_TR:${nLoss}`, entryId]
            );
          } else {
            // New Transfer for this ledger
            const [baseEntry] = await connection.query(
              "SELECT id FROM voucher_entries WHERE voucher_id = ? AND ledger_id = ? LIMIT 1",
              [voucherId, finalCapitalId]
            );

            if (baseEntry.length > 0) {
              await connection.query(
                "UPDATE voucher_entries SET amount = amount + ?, narration = ? WHERE id = ?",
                [nLoss, `LOSS_TR:${nLoss}`, baseEntry[0].id]
              );
            } else {
              await connection.query(
                "INSERT INTO voucher_entries (voucher_id, ledger_id, amount, entry_type, narration) VALUES (?, ?, ?, 'debit', ?)",
                [voucherId, finalCapitalId, nLoss, `LOSS_TR:${nLoss}`]
              );
            }
          }
        }
      }

      await connection.commit();
      return res.json({ success: true, message: "Transfer adjusted successfully" });

    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

  } catch (err) {
    console.error("Profit API Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
