const express = require("express");
const router = express.Router();
const db = require("../db");
const {
  detectTargetCompany,
  syncSalesVoucherToPurchaseVoucher,
  syncAllPendingSalesVouchers
} = require("../utils/gstTransactionSync");

/**
 * Check if a selected party in the current company matches another company's GST
 * Used for live frontend indication on sales voucher creation.
 */
router.get("/check-party", async (req, res) => {
  try {
    const { partyId, companyId } = req.query;
    if (!partyId || !companyId) {
      return res.status(400).json({ success: false, message: "partyId and companyId are required" });
    }

    const detection = await detectTargetCompany(companyId, partyId);
    if (!detection) {
      return res.json({
        success: true,
        isMultiCompanySync: false,
        message: "No multi-company sync match found"
      });
    }

    return res.json({
      success: true,
      isMultiCompanySync: true,
      targetCompany: {
        id: detection.targetCompany.id,
        name: detection.targetCompany.name,
        gst_number: detection.targetCompany.gst_number
      },
      matchType: detection.matchType,
      message: `⚡ Multi-Company GST Sync Active: This transaction will automatically sync to ${detection.targetCompany.name} (GST: ${detection.targetCompany.gst_number}) as a Purchase Voucher.`
    });
  } catch (err) {
    console.error("Check party error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Trigger manual or bulk sync for a company's sales vouchers
 */
router.post("/sync-now", async (req, res) => {
  try {
    const { companyId } = req.body;
    const result = await syncAllPendingSalesVouchers(companyId || null);
    return res.json(result);
  } catch (err) {
    console.error("Sync now error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Get sync history / audit list for a company
 */
router.get("/status", async (req, res) => {
  try {
    const { companyId } = req.query;
    let query = `
      SELECT s.*, 
             DATE_FORMAT(s.created_at, '%Y-%m-%d %H:%i') as formatted_date,
             DATE_FORMAT(s.synced_at, '%Y-%m-%d %H:%i') as formatted_sync_date
      FROM company_gst_synced_vouchers s
    `;
    const params = [];

    if (companyId) {
      query += ` WHERE s.source_company_id = ? OR s.target_company_id = ?`;
      params.push(companyId, companyId);
    }

    query += ` ORDER BY s.id DESC LIMIT 100`;

    const [rows] = await db.execute(query, params);
    return res.json({
      success: true,
      count: rows.length,
      syncedTransactions: rows
    });
  } catch (err) {
    console.error("Get sync status error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * List all companies with their GST numbers for easy cross-company reference
 */
router.get("/companies", async (req, res) => {
  try {
    const { companyId } = req.query;
    let query = `
      SELECT id, name, gst_number, state, address, phone_number, email 
      FROM tbcompanies 
      WHERE gst_number IS NOT NULL AND TRIM(gst_number) != ''
    `;
    const params = [];

    if (companyId) {
      query += ` AND id != ?`;
      params.push(companyId);
    }

    query += ` ORDER BY name ASC`;

    const [rows] = await db.execute(query, params);
    return res.json({ success: true, companies: rows });
  } catch (err) {
    console.error("Get companies error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
