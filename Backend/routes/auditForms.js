const express = require('express');
const router = express.Router();
const db = require('../db');

// Ensure table exists helper
let tableEnsured = false;
const ensureAuditFormsTable = async () => {
  if (tableEnsured) return;
  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS audit_forms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id VARCHAR(100) NOT NULL,
        ca_id VARCHAR(100) NULL,
        form_type VARCHAR(20) NOT NULL,
        assessment_year VARCHAR(20) NULL,
        form_data LONGTEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_company_form (company_id, form_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
    await db.query(createTableQuery);
    tableEnsured = true;
  } catch (err) {
    console.error('Error ensuring audit_forms table exists:', err.message);
  }
};

// GET audit form data by company_id & form_type
router.get('/form', async (req, res) => {
  try {
    await ensureAuditFormsTable();

    const { company_id, form_type, user_id, user_type, financialYear } = req.query;

    if (!company_id || !form_type) {
      return res.status(400).json({ success: false, message: 'company_id and form_type are required' });
    }

    // 1. Fetch saved audit form response
    const [rows] = await db.query(
      'SELECT id, company_id, ca_id, form_type, assessment_year, form_data, status, updated_at FROM audit_forms WHERE company_id = ? AND form_type = ?',
      [company_id, form_type]
    );

    let savedData = null;
    let status = null;
    let assessmentYear = null;

    if (rows.length > 0) {
      status = rows[0].status;
      assessmentYear = rows[0].assessment_year;
      try {
        savedData = typeof rows[0].form_data === 'string' ? JSON.parse(rows[0].form_data) : rows[0].form_data;
      } catch (e) {
        console.error('Error parsing saved form_data JSON:', e);
        savedData = null;
      }
    }

    // 2. Fetch Company details for defaults
    let companyInfo = null;
    if (company_id) {
      const [companies] = await db.query('SELECT * FROM tbcompanies WHERE id = ?', [company_id]);
      if (companies.length > 0) {
        companyInfo = companies[0];
      }
    }

    // 3. Fetch CA user profile details for defaults
    let caInfo = null;
    if (user_id) {
      if (user_type === 'ca' || user_type === 'ca_user') {
        const [caRows] = await db.query(
          'SELECT fdSiNo as id, fdname as name, email, fdphoneNumber as phone, fdpan as pan, address FROM tbca WHERE fdSiNo = ?',
          [user_id]
        );
        if (caRows.length > 0) caInfo = caRows[0];
      } else if (user_type === 'new_ca') {
        const [caRows] = await db.query(
          'SELECT id, name, email, phone, firm_name, registration_number, membership_number, pan_number, udin FROM ca_users WHERE id = ?',
          [user_id]
        );
        if (caRows.length > 0) caInfo = caRows[0];
      } else if (user_type === 'ca_employee') {
        const [caRows] = await db.query(
          'SELECT id, name, email, phone, adhar, address FROM tbcaemployees WHERE id = ?',
          [user_id]
        );
        if (caRows.length > 0) caInfo = caRows[0];
      } else {
        const [empRows] = await db.query(
          'SELECT id, CONCAT(firstName, " ", lastName) as name, email, phoneNumber as phone, pan, address FROM tbemployees WHERE id = ?',
          [user_id]
        );
        if (empRows.length > 0) caInfo = empRows[0];
      }
    }

    // 4. Calculate Part D Financial Particulars for company_id & financialYear
    let financialParticulars = {
      grossReceipts: 0,
      totalSales: 0,
      totalPurchases: 0,
      grossProfit: 0,
      totalExpenses: 0,
      netProfit: 0,
      depreciationClaimed: 0
    };

    if (company_id) {
      const targetFy = financialYear || companyInfo?.financial_year || companyInfo?.financialYear;
      const match = targetFy ? targetFy.match(/\d{4}/) : null;
      const year = match ? parseInt(match[0], 10) : (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1);
      const startDate = `${year}-04-01`;
      const endDate = `${year + 1}-03-31`;

      const [salesRows] = await db.query(
        `SELECT SUM(total) as totalSales, SUM(subtotal) as grossReceipts FROM sales_vouchers WHERE company_id = ? AND date >= ? AND date <= ?`,
        [company_id, startDate, endDate]
      );
      const totalSales = Number(salesRows[0]?.totalSales || 0);
      const grossReceipts = Number(salesRows[0]?.grossReceipts || totalSales);

      const [purchaseRows] = await db.query(
        `SELECT SUM(total) as totalPurchases FROM purchase_vouchers WHERE company_id = ? AND date >= ? AND date <= ?`,
        [company_id, startDate, endDate]
      );
      const totalPurchases = Number(purchaseRows[0]?.totalPurchases || 0);

      const [expenseRows] = await db.query(
        `SELECT SUM(ve.amount) as totalOtherExpenses
         FROM voucher_main vm
         JOIN voucher_entries ve ON vm.id = ve.voucher_id
         WHERE vm.company_id = ? AND vm.date >= ? AND vm.date <= ?
           AND vm.voucher_type IN ('payment', 'journal')
           AND ve.entry_type = 'debit'`,
        [company_id, startDate, endDate]
      );
      const otherExpenses = Number(expenseRows[0]?.totalOtherExpenses || 0);

      const grossProfit = totalSales - totalPurchases;
      const totalExpenses = totalPurchases + otherExpenses;
      const netProfit = totalSales - totalExpenses;

      const [depRows] = await db.query(
        `SELECT SUM(ve.amount) as depreciation
         FROM voucher_main vm
         JOIN voucher_entries ve ON vm.id = ve.voucher_id
         JOIN ledgers l ON ve.ledger_id = l.id
         WHERE vm.company_id = ? AND vm.date >= ? AND vm.date <= ?
           AND LOWER(l.name) LIKE '%depreciation%'`,
        [company_id, startDate, endDate]
      );
      const depreciationClaimed = Number(depRows[0]?.depreciation || 0);

      financialParticulars = {
        grossReceipts,
        totalSales,
        totalPurchases,
        grossProfit,
        totalExpenses,
        netProfit,
        depreciationClaimed
      };
    }

    res.json({
      success: true,
      savedData,
      status,
      assessmentYear,
      companyInfo,
      caInfo,
      financialParticulars
    });
  } catch (error) {
    console.error('Error fetching audit form data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST save or update audit form data
router.post('/form', async (req, res) => {
  try {
    await ensureAuditFormsTable();

    const { company_id, form_type, assessment_year, form_data, status, ca_id } = req.body;

    if (!company_id || !form_type || !form_data) {
      return res.status(400).json({ success: false, message: 'company_id, form_type, and form_data are required' });
    }

    const jsonData = typeof form_data === 'string' ? form_data : JSON.stringify(form_data);
    const formStatus = status || 'draft';
    const caIdVal = ca_id || null;
    const yearVal = assessment_year || null;

    const upsertQuery = `
      INSERT INTO audit_forms (company_id, ca_id, form_type, assessment_year, form_data, status)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        ca_id = VALUES(ca_id),
        assessment_year = VALUES(assessment_year),
        form_data = VALUES(form_data),
        status = VALUES(status),
        updated_at = NOW()
    `;

    await db.query(upsertQuery, [company_id, caIdVal, form_type, yearVal, jsonData, formStatus]);

    res.json({ success: true, message: 'Audit form saved successfully' });
  } catch (error) {
    console.error('Error saving audit form data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
