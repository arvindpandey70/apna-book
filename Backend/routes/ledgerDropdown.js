const express = require("express");
const router = express.Router();
const db = require('../db');

// ✅ GET all ledger groups
router.get("/", async (req, res) => {
  try {
    const sql = `
      SELECT id, name, type, parent, nature FROM ledger_groups
      WHERE (company_id = 0 AND owner_type = 'admin')
         OR (id IN (
           SELECT MIN(id) FROM ledger_groups
           WHERE LOWER(TRIM(name)) NOT IN (
             SELECT LOWER(TRIM(name)) FROM ledger_groups WHERE company_id = 0 AND owner_type = 'admin'
           )
           GROUP BY LOWER(TRIM(name))
         ))
      ORDER BY name
    `;
    const [rows] = await db.query(sql);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching ledger groups:", err);
    res.status(500).json({ error: "Failed to fetch ledger groups" });
  }
});


module.exports = router;
