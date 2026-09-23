const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/dashboard-data', async (req, res) => {
  const { employee_id, company_id, user_type, user_id } = req.query;

  if (!employee_id) return res.status(400).json({ success: false, error: 'employee_id required' });

  try {
    let companyInfoQuery;
    let queryParams = [];

    if (user_type === 'new_ca' && user_id) {
      companyInfoQuery = `SELECT c.* FROM tbcompanies c INNER JOIN ca_company cc ON c.id = cc.company_id WHERE cc.ca_id = ?`;
      queryParams = [user_id];
    } else {
      companyInfoQuery = 'SELECT * FROM tbcompanies WHERE employee_id = ? OR id = ?';
      queryParams = [employee_id, employee_id];
    }

    let companiesQuery;
    let companiesQueryParams = [];

    if (user_type === 'new_ca' && user_id) {
      companiesQuery = `SELECT c.*, 
        (SELECT COUNT(*) FROM tbusers u WHERE u.company_id = c.id) > 0 as isLocked 
        FROM tbcompanies c 
        INNER JOIN ca_company cc ON c.id = cc.company_id 
        WHERE cc.ca_id = ?`;
      companiesQueryParams = [user_id];
    } else {
      companiesQuery = `SELECT c.*, 
        (SELECT COUNT(*) FROM tbusers u WHERE u.company_id = c.id) > 0 as isLocked 
        FROM tbcompanies c WHERE c.employee_id = ? OR c.id = ?`;
      companiesQueryParams = [employee_id, employee_id];
    }

    if (company_id) {
      if (user_type === 'new_ca' && user_id) {
        companyInfoQuery += ' AND c.id = ?';
      } else {
        companyInfoQuery += ' AND id = ?';
      }
      queryParams.push(company_id);

      // if filtering companies by company_id
      if (user_type === 'new_ca' && user_id) {
        companiesQuery += ' AND c.id = ?';
        companiesQueryParams.push(company_id);
      } else {
        companiesQuery += ' AND c.id = ?';
        companiesQueryParams.push(company_id);
      }
    }

    const [[companyInfo]] = await db.query(companyInfoQuery, queryParams);
    const [userLimitRows] = await db.query('SELECT userLimit FROM tbemployees WHERE id = ?', [employee_id]);
    const userLimit = userLimitRows && userLimitRows.length > 0 ? userLimitRows[0].userLimit : 1;
    const [companies] = await db.query(companiesQuery, companiesQueryParams);

    // Fetch ledgers and vouchers for the specific company (using the first one found or the company_id provided)
    const activeCompanyId = company_id || (companyInfo ? companyInfo.id : null);
    let ledgers = [];
    let vouchers = [];
    let stats = {
      salesMonthly: 0,
      purchaseMonthly: 0,
      inputTaxMonthly: 0,
      outputTaxMonthly: 0
    };

    if (activeCompanyId) {
      const [ledgerRows] = await db.query('SELECT * FROM ledgers WHERE company_id = ?', [activeCompanyId]);
      
      const { financialYear } = req.query; // e.g. "2025-26" or "2025-2026"

      let vQuery = 'SELECT * FROM voucher_main WHERE company_id = ?';
      let vParams = [activeCompanyId];

      if (financialYear) {
        const match = financialYear.match(/\d{4}/);
        const year = match ? parseInt(match[0], 10) : new Date().getFullYear();
        const startDate = `${year}-04-01`;
        const endDate = `${year + 1}-03-31`;
        vQuery += ' AND date >= ? AND date <= ?';
        vParams.push(startDate, endDate);
      }

      const [voucherRows] = await db.query(vQuery, vParams);
      ledgers = ledgerRows;
      vouchers = voucherRows;

      // Calculate stats based on financialYear
      let salesQuery = `
        SELECT 
          SUM(total) as totalSales,
          SUM(cgstTotal + sgstTotal + igstTotal) as totalOutputTax
        FROM sales_vouchers 
        WHERE company_id = ?
      `;
      let purchaseQuery = `
        SELECT 
          SUM(total) as totalPurchases,
          SUM(cgstTotal + sgstTotal + igstTotal) as totalInputTax
        FROM purchase_vouchers 
        WHERE company_id = ?
      `;
      let queryParams = [activeCompanyId];

      if (financialYear) {
        // Filter by financial year range
        const match = financialYear.match(/\d{4}/);
        const year = match ? parseInt(match[0], 10) : new Date().getFullYear();
        const startDate = `${year}-04-01`;
        const endDate = `${year + 1}-03-31`;

        salesQuery += ' AND date >= ? AND date <= ?';
        purchaseQuery += ' AND date >= ? AND date <= ?';
        queryParams.push(startDate, endDate);
      } else if (financialYear === undefined) {
        // Default: Current Month (original behavior)
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        salesQuery += ' AND MONTH(date) = ? AND YEAR(date) = ?';
        purchaseQuery += ' AND MONTH(date) = ? AND YEAR(date) = ?';
        queryParams.push(currentMonth, currentYear);
      } else {
        // financialYear === "" (Clear) -> All time, no more filters needed
      }

      const [salesStats] = await db.query(salesQuery, queryParams);
      const [purchaseStats] = await db.query(purchaseQuery, queryParams);

      stats = {
        salesMonthly: salesStats[0]?.totalSales || 0,
        purchaseMonthly: purchaseStats[0]?.totalPurchases || 0,
        outputTaxMonthly: salesStats[0]?.totalOutputTax || 0,
        inputTaxMonthly: purchaseStats[0]?.totalInputTax || 0
      };
    }

    res.json({
      success: true,
      companyInfo: companyInfo || null,
      companies: companies || [],
      userLimit,
      ledgers,
      vouchers,
      stats
    });
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/companies-by-employee', async (req, res) => {
  const { employee_id } = req.query;


  if (!employee_id) {
    return res.status(400).json({ success: false, error: 'employee_id required' });
  }

  try {
    const [companies] = await db.query(
      `SELECT c.id, c.name, 
       (SELECT COUNT(*) FROM tbusers u WHERE u.company_id = c.id) > 0 as isLocked 
       FROM tbcompanies c WHERE c.employee_id = ? OR c.id = ?`,
      [employee_id, employee_id]
    );

    res.json({ success: true, companies });
  } catch (err) {
    console.error('Error fetching companies by employee:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
// Assuming CA's ID is available as req.query.ca_id
router.get('/companies-by-ca', async (req, res) => {
  const caId = req.query.ca_id;
  const { financialYear } = req.query;
  if (!caId) return res.status(400).json({ message: 'Missing ca_id' });

  let connection;
  try {
    connection = await db.getConnection();

    // 1. Look up the CA's name using their ID (fdSiNo)
    const [caRows] = await connection.query('SELECT fdname FROM tbca WHERE fdSiNo = ?', [caId]);

    const caName = caRows.length > 0 ? caRows[0].fdname.trim() : null;

    // 2. Find companies linked to this CA (as accountant or owner)
    const [rows] = await connection.query(
      `SELECT id, name, assessee_name, company_type, employee_id, pan_number, gst_number, address,
       (SELECT COUNT(*) FROM tbusers u WHERE u.company_id = tbcompanies.id) > 0 as isLocked
       FROM tbcompanies 
       WHERE (fdAccountantName = ?) OR (employee_id = ?) OR id IN (SELECT company_id FROM ca_company WHERE ca_id = ?)`,
      [caName, caId, caId]
    );

    if (financialYear) {
      const match = financialYear.match(/\d{4}/);
      const year = match ? parseInt(match[0], 10) : new Date().getFullYear();
      const startDate = `${year}-04-01`;
      const endDate = `${year + 1}-03-31`;

      for (let company of rows) {
        const [salesStats] = await connection.query(
          `SELECT SUM(total) as totalSales FROM sales_vouchers WHERE company_id = ? AND date >= ? AND date <= ?`,
          [company.id, startDate, endDate]
        );
        const [purchaseStats] = await connection.query(
          `SELECT SUM(total) as totalPurchases FROM purchase_vouchers WHERE company_id = ? AND date >= ? AND date <= ?`,
          [company.id, startDate, endDate]
        );
        const [voucherStats] = await connection.query(
          `SELECT COUNT(*) as totalVouchers FROM voucher_main WHERE company_id = ? AND date >= ? AND date <= ?`,
          [company.id, startDate, endDate]
        );

        company.fyTotalSales = salesStats[0]?.totalSales || 0;
        company.fyTotalPurchases = purchaseStats[0]?.totalPurchases || 0;
        company.fyTotalVouchers = voucherStats[0]?.totalVouchers || 0;
      }
    }

    res.json({ companies: rows });
  } catch (err) {
    console.error('Error fetching companies by CA ID:', err);
    res.status(500).json({ message: err.message });
  } finally {
    if (connection) connection.release();
  }
});



router.get('/companies-by-new-ca', async (req, res) => {
  const caId = req.query.ca_id;
  if (!caId) return res.status(400).json({ message: 'Missing ca_id' });

  try {
    const [companies] = await db.query(
      `SELECT c.id, c.name, 
       (SELECT COUNT(*) FROM tbusers u WHERE u.company_id = c.id) > 0 as isLocked 
       FROM tbcompanies c
       INNER JOIN ca_company cc ON c.id = cc.company_id
       WHERE cc.ca_id = ?`,
      [caId]
    );

    res.json({ companies });
  } catch (err) {
    console.error('Error fetching companies for new ca:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
