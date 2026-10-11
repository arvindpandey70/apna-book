const express = require("express");
const router = express.Router();
const db = require('../db');

// ✅ GET all ledger groups
router.get("/", async (req, res) => {
  try {
    const sql = "SELECT id, name, type, parent FROM ledger_groups";
    const [rows] = await db.query(sql); // ✅ No callback
    res.json(rows);
  } catch (err) {
    console.error("Error fetching ledger groups:", err);
    res.status(500).json({ error: "Failed to fetch ledger groups" });
  }
});


module.exports = router;
