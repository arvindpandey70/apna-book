const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');

// Middleware: ensure caller has accountant role
function ensureAccountant(req, res, next) {
  if (!req.user || !['accountant', 'ca', 'new_ca'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Forbidden: Accountant access only.' });
  }
  next();
}

router.use(ensureAccountant);

// Helper: check if company is authorized for this accountant
async function checkAccountantCompanyAccess(accountantId, companyId) {
  const [rows] = await db.query(`
    SELECT 1 FROM ca_company WHERE ca_id = ? AND company_id = ?
    UNION
    SELECT 1 FROM tbusers WHERE accountant_id = ? AND company_id = ?
    LIMIT 1
  `, [accountantId, companyId, accountantId, companyId]);

  return rows.length > 0;
}

// -----------------------------------------------------------------------------
// 1. GET /api/accountant/dashboard
// Metrics: companies count, users created count, active count, recent users, companies
// -----------------------------------------------------------------------------
router.get('/dashboard', async (req, res) => {
  try {
    const accountantId = req.user.id;

    // Get accountant profile details
    const [accRows] = await db.query(
      'SELECT fdSiNo AS id, fdname AS name, fdphone AS phone, email, fdstatus AS status, fdlast_login FROM tbca WHERE fdSiNo = ?',
      [accountantId]
    );
    const accountantInfo = accRows[0] || { id: accountantId, name: 'Accountant', email: req.user.email };

    // Authorized companies query
    const [companies] = await db.query(`
      SELECT DISTINCT c.id, c.name, c.financial_year, c.address, c.pan_number, c.gst_number, c.email, c.phone_number, c.employee_id,
        (SELECT COUNT(*) FROM tbusers WHERE company_id = c.id AND accountant_id = ?) AS user_count
      FROM tbcompanies c
      LEFT JOIN ca_company cc ON c.id = cc.company_id AND cc.ca_id = ?
      LEFT JOIN tbusers u ON c.id = u.company_id AND u.accountant_id = ?
      WHERE cc.id IS NOT NULL OR u.id IS NOT NULL
      ORDER BY c.name ASC
    `, [accountantId, accountantId, accountantId]);

    // Users created by this accountant
    const [userStats] = await db.query(`
      SELECT 
        COUNT(*) AS total_users,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_users,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended_users
      FROM tbusers 
      WHERE accountant_id = ?
    `, [accountantId]);

    // 5 Most recent users
    const [recentUsers] = await db.query(`
      SELECT 
        u.id, u.username, u.email, u.phone, u.department, u.status, u.created_at, u.last_login,
        c.name AS company_name
      FROM tbusers u
      INNER JOIN tbcompanies c ON u.company_id = c.id
      WHERE u.accountant_id = ?
      ORDER BY u.created_at DESC
      LIMIT 5
    `, [accountantId]);

    res.json({
      success: true,
      accountant: accountantInfo,
      stats: {
        totalCompanies: companies.length,
        totalUsers: userStats[0]?.total_users || 0,
        activeUsers: userStats[0]?.active_users || 0,
        suspendedUsers: userStats[0]?.suspended_users || 0,
      },
      companies,
      recentUsers
    });
  } catch (err) {
    console.error('Error fetching accountant dashboard:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 2. GET /api/accountant/companies
// Returns all companies this accountant is authorized to access
// -----------------------------------------------------------------------------
router.get('/companies', async (req, res) => {
  try {
    const accountantId = req.user.id;

    const [companies] = await db.query(`
      SELECT DISTINCT 
        c.id, c.name, c.financial_year, c.address, c.pan_number, c.gst_number, c.email, c.phone_number, c.employee_id,
        c.state, c.tax_type,
        (SELECT COUNT(*) FROM tbusers WHERE company_id = c.id AND accountant_id = ?) AS user_count,
        (SELECT COUNT(*) FROM voucher_main WHERE company_id = c.id) AS voucher_count
      FROM tbcompanies c
      LEFT JOIN ca_company cc ON c.id = cc.company_id AND cc.ca_id = ?
      LEFT JOIN tbusers u ON c.id = u.company_id AND u.accountant_id = ?
      WHERE cc.id IS NOT NULL OR u.id IS NOT NULL
      ORDER BY c.name ASC
    `, [accountantId, accountantId, accountantId]);

    res.json({ success: true, companies });
  } catch (err) {
    console.error('Error fetching accountant companies:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 2b. POST /api/accountant/companies
// Creates a new company owned by this accountant
// -----------------------------------------------------------------------------
router.post('/companies', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const accountantId = req.user.id;

    // Get accountant profile name
    const [accRows] = await connection.query(
      'SELECT fdname FROM tbca WHERE fdSiNo = ?',
      [accountantId]
    );
    const accountantName = accRows[0]?.fdname || 'Accountant';

    const {
      name,
      financialYear = '2026-27',
      booksBeginningYear = '2026-04-01',
      address = '',
      pin = '',
      phoneNumber = '',
      email = '',
      panNumber = '',
      tanNumber = '',
      gstNumber = '',
      vatNumber = '',
      state = '',
      country = 'India',
      taxType = 'GST',
      companyType = 'Private Limited',
      assesseeName = '',
      backDateAllowed = 1
    } = req.body;

    if (!name || !name.trim()) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, error: 'Company name is required.' });
    }

    // 1. Insert into tbcompanies
    const [companyResult] = await connection.query(`
      INSERT INTO tbcompanies (
        name,
        financial_year,
        books_beginning_year,
        address,
        pin,
        phone_number,
        email,
        pan_number,
        tan_number,
        gst_number,
        vat_number,
        state,
        country,
        tax_type,
        employee_id,
        fdAccountType,
        fdAccountantName,
        back_date_allowed,
        assessee_name,
        company_type
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'accountant', ?, ?, ?, ?)
    `, [
      name.trim(),
      financialYear,
      booksBeginningYear,
      address.trim(),
      pin.trim(),
      phoneNumber.trim(),
      email.trim(),
      panNumber.trim().toUpperCase(),
      tanNumber.trim().toUpperCase(),
      taxType === 'GST' ? gstNumber.trim().toUpperCase() : null,
      taxType === 'VAT' ? vatNumber.trim().toUpperCase() : null,
      state,
      country,
      taxType,
      accountantName,
      backDateAllowed ? 1 : 0,
      assesseeName.trim(),
      companyType
    ]);

    const companyId = companyResult.insertId;

    // 2. Link company in ca_company
    await connection.query(
      'INSERT INTO ca_company (ca_id, company_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE id=id',
      [accountantId, companyId]
    );

    // 3. Client users have 0-day trial and must pay for subscription before accessing company
    const [subTable] = await connection.query("SHOW TABLES LIKE 'company_subscriptions'");
    if (subTable.length > 0) {
      await connection.query(`
        INSERT INTO company_subscriptions (
          company_id, plan, is_trial, status, start_date, end_date
        )
        VALUES (?, 'accountant_client', 0, 'expired', NOW(), NOW())
      `, [companyId]).catch(e => console.warn('Subscription insertion note:', e.message));
    }
    // Note: Automatic migration of groups/ledgers removed. Groups & ledgers are created manually.

    await connection.commit();
    connection.release();

    res.status(201).json({
      success: true,
      message: `Company "${name.trim()}" created successfully`,
      company: {
        id: companyId,
        name: name.trim(),
        financialYear,
        booksBeginningYear,
        address,
        pin,
        phoneNumber,
        email,
        panNumber,
        gstNumber,
        state,
        country,
        taxType,
        user_count: 0,
        voucher_count: 0
      }
    });
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error('Error creating company in accountantPanel:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 2c. PUT /api/accountant/companies/:companyId
// Updates an existing authorized company
// -----------------------------------------------------------------------------
router.put('/companies/:companyId', async (req, res) => {
  try {
    const accountantId = req.user.id;
    const { companyId } = req.params;

    const isAuthorized = await checkAccountantCompanyAccess(accountantId, companyId);
    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not have access to update this company.' });
    }

    const {
      name,
      financialYear,
      booksBeginningYear,
      address,
      pin,
      phoneNumber,
      email,
      panNumber,
      tanNumber,
      gstNumber,
      vatNumber,
      state,
      country,
      taxType,
      companyType,
      assesseeName
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Company name is required.' });
    }

    await db.query(`
      UPDATE tbcompanies SET
        name = ?,
        financial_year = COALESCE(?, financial_year),
        books_beginning_year = COALESCE(?, books_beginning_year),
        address = COALESCE(?, address),
        pin = COALESCE(?, pin),
        phone_number = COALESCE(?, phone_number),
        email = COALESCE(?, email),
        pan_number = COALESCE(?, pan_number),
        tan_number = COALESCE(?, tan_number),
        gst_number = COALESCE(?, gst_number),
        vat_number = COALESCE(?, vat_number),
        state = COALESCE(?, state),
        country = COALESCE(?, country),
        tax_type = COALESCE(?, tax_type),
        company_type = COALESCE(?, company_type),
        assessee_name = COALESCE(?, assessee_name)
      WHERE id = ?
    `, [
      name.trim(),
      financialYear,
      booksBeginningYear,
      address,
      pin,
      phoneNumber,
      email,
      panNumber,
      tanNumber,
      gstNumber,
      vatNumber,
      state,
      country,
      taxType,
      companyType,
      assesseeName,
      companyId
    ]);

    res.json({
      success: true,
      message: 'Company updated successfully',
      companyId
    });
  } catch (err) {
    console.error('Error updating company:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 3. GET /api/accountant/users
// Lists all normal users created by this accountant with search and filters
// -----------------------------------------------------------------------------
router.get('/users', async (req, res) => {
  try {
    const accountantId = req.user.id;
    const { search = '', status = 'all', company_id } = req.query;

    let sql = `
      SELECT 
        u.id, u.company_id, u.username, u.email, u.phone, u.department, u.status, u.last_login, u.created_at,
        c.name AS company_name,
        COALESCE(r.role_name, 'User') AS role
      FROM tbusers u
      INNER JOIN tbcompanies c ON u.company_id = c.id
      LEFT JOIN tbroles r ON u.role_id = r.role_id
      WHERE u.accountant_id = ?
    `;
    const params = [accountantId];

    if (search.trim()) {
      sql += ` AND (u.username LIKE ? OR u.email LIKE ? OR c.name LIKE ?)`;
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (status !== 'all') {
      sql += ` AND u.status = ?`;
      params.push(status);
    }

    if (company_id) {
      sql += ` AND u.company_id = ?`;
      params.push(company_id);
    }

    sql += ' ORDER BY u.created_at DESC';

    const [users] = await db.query(sql, params);

    res.json({ success: true, users });
  } catch (err) {
    console.error('Error fetching accountant users:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 4. POST /api/accountant/users
// Creates a normal user for an authorized company
// -----------------------------------------------------------------------------
router.post('/users', async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const accountantId = req.user.id;
    const { company_id, username, email, password, role = 'User', phone = '', department = '' } = req.body;

    if (!company_id || !username || !email || !password) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ success: false, error: 'Company, username, email, and password are required.' });
    }

    // 1. Enforce business rule: Accountant must be authorized for this company
    const isAuthorized = await checkAccountantCompanyAccess(accountantId, company_id);
    if (!isAuthorized) {
      await connection.rollback();
      connection.release();
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You are not authorized to create users for this company. Please contact Admin.'
      });
    }

    // 2. Prevent Privilege Escalation: Whitelist non-privileged user roles
    const FORBIDDEN_ROLES = ['admin', 'super_admin', 'accountant', 'ca', 'new_ca', 'owner', 'manager'];
    const normalizedRole = String(role).trim().toLowerCase();
    if (FORBIDDEN_ROLES.includes(normalizedRole)) {
      await connection.rollback();
      connection.release();
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Accountants can only create standard non-administrative users (e.g. User, Data Entry, Viewer).'
      });
    }

    // 3. Check for existing username or email in this company
    const trimmedUsername = String(username).trim();
    const trimmedEmail = String(email).trim().toLowerCase();

    const [existing] = await connection.query(
      'SELECT id FROM tbusers WHERE company_id = ? AND (LOWER(username) = ? OR LOWER(email) = ?)',
      [company_id, trimmedUsername.toLowerCase(), trimmedEmail]
    );

    if (existing.length > 0) {
      await connection.rollback();
      connection.release();
      return res.status(409).json({ success: false, error: 'A user with this username or email already exists for this company.' });
    }

    // 4. Resolve company owner employee_id
    const [compRows] = await connection.query('SELECT employee_id, name FROM tbcompanies WHERE id = ?', [company_id]);
    const employeeId = compRows[0]?.employee_id || 0;
    const companyName = compRows[0]?.name || '';

    // 5. Hash password
    const passwordHash = await bcrypt.hash(password.trim(), 10);

    // 6. Find or create role_id
    let roleId = 0;
    const [roleRows] = await connection.query(
      'SELECT role_id FROM tbroles WHERE LOWER(role_name) = ? LIMIT 1',
      [normalizedRole]
    );
    if (roleRows.length > 0) {
      roleId = roleRows[0].role_id;
    } else {
      // If role table doesn't have it, create standard role entry
      try {
        const [insertedRole] = await connection.query(
          'INSERT INTO tbroles (role_name, description, is_system) VALUES (?, ?, 0)',
          [role.trim(), `Standard role created for ${role.trim()}`]
        );
        roleId = insertedRole.insertId;
      } catch (e) {
        roleId = 0;
      }
    }

    // 7. Insert into tbusers
    const [result] = await connection.query(`
      INSERT INTO tbusers (
        company_id, role_id, employee_id, accountant_id,
        email, username, password, phone, department, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW())
    `, [company_id, roleId, employeeId, accountantId, trimmedEmail, trimmedUsername, passwordHash, phone, department]);

    const newUserId = result.insertId;

    // 8. Ensure assignment in ca_company so accountant has bidirectional link
    await connection.query(
      'INSERT INTO ca_company (ca_id, company_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE id=id',
      [accountantId, company_id]
    );

    // 9. Sync to central users table for unified login
    await connection.query(`
      INSERT INTO users (email, password_hash, role, source_table, source_id, status)
      VALUES (?, ?, 'company_user', 'tbusers', ?, 'active')
      ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        role = 'company_user',
        source_table = 'tbusers',
        source_id = VALUES(source_id),
        status = 'active'
    `, [trimmedEmail, passwordHash, newUserId]).catch(err => {
      console.warn('Sync to users table notice:', err.message);
    });

    await connection.commit();
    connection.release();

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: newUserId,
        username: trimmedUsername,
        email: trimmedEmail,
        phone,
        department,
        role: role.trim(),
        company_id,
        company_name: companyName,
        status: 'active'
      }
    });
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error('Error in accountant create user:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 5. PATCH /api/accountant/users/:userId/status
// Suspends or activates a user created by this accountant
// -----------------------------------------------------------------------------
router.patch('/users/:userId/status', async (req, res) => {
  try {
    const accountantId = req.user.id;
    const { userId } = req.params;
    const { status } = req.body;

    if (!['active', 'suspended', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Must be active, suspended, or inactive.' });
    }

    // Verify existence & ownership
    const [check] = await db.query('SELECT id, accountant_id FROM tbusers WHERE id = ?', [userId]);
    if (check.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    if (check[0].accountant_id !== accountantId) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not authorized to modify this user.' });
    }

    await db.query(
      'UPDATE tbusers SET status = ? WHERE id = ? AND accountant_id = ?',
      [status, userId, accountantId]
    );

    // Sync to central users table
    await db.query(
      'UPDATE users SET status = ? WHERE source_table = "tbusers" AND source_id = ?',
      [status, userId]
    ).catch(() => {});

    res.json({ success: true, message: `User status changed to ${status}`, id: userId, status });
  } catch (err) {
    console.error('Error changing user status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 6. DELETE /api/accountant/users/:userId
// Deletes a user created by this accountant
// -----------------------------------------------------------------------------
router.delete('/users/:userId', async (req, res) => {
  try {
    const accountantId = req.user.id;
    const { userId } = req.params;

    // Verify existence & ownership
    const [check] = await db.query('SELECT id, accountant_id FROM tbusers WHERE id = ?', [userId]);
    if (check.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    if (check[0].accountant_id !== accountantId) {
      return res.status(403).json({ success: false, error: 'Forbidden: You are not authorized to delete this user.' });
    }

    // Delete linked role rows first
    await db.query('DELETE FROM tbuserroles WHERE user_id = ?', [userId]).catch(() => {});

    // Delete user
    await db.query('DELETE FROM tbusers WHERE id = ? AND accountant_id = ?', [userId, accountantId]);

    // Delete from central users table
    await db.query('DELETE FROM users WHERE source_table = "tbusers" AND source_id = ?', [userId]).catch(() => {});

    res.json({ success: true, message: 'User deleted successfully', id: userId });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// -----------------------------------------------------------------------------
// 7. GET /api/accountant/companies/:companyId/overview
// View authorized company overview metrics, verifying accountant authorization
// -----------------------------------------------------------------------------
router.get('/companies/:companyId/overview', async (req, res) => {
  try {
    const accountantId = req.user.id;
    const { companyId } = req.params;

    const isAuthorized = await checkAccountantCompanyAccess(accountantId, companyId);
    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: 'Forbidden: You do not have access to this company.' });
    }

    // Fetch company info
    const [compRows] = await db.query('SELECT * FROM tbcompanies WHERE id = ?', [companyId]);
    if (compRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Company not found.' });
    }
    const company = compRows[0];

    // Aggregates
    const [salesStats] = await db.query(
      'SELECT COALESCE(SUM(total), 0) AS total_sales, COUNT(*) AS sales_count FROM sales_vouchers WHERE company_id = ?',
      [companyId]
    ).catch(() => [[{ total_sales: 0, sales_count: 0 }]]);

    const [purchaseStats] = await db.query(
      'SELECT COALESCE(SUM(total), 0) AS total_purchases, COUNT(*) AS purchase_count FROM purchase_vouchers WHERE company_id = ?',
      [companyId]
    ).catch(() => [[{ total_purchases: 0, purchase_count: 0 }]]);

    const [voucherStats] = await db.query(
      'SELECT COUNT(*) AS total_vouchers FROM voucher_main WHERE company_id = ?',
      [companyId]
    ).catch(() => [[{ total_vouchers: 0 }]]);

    const [users] = await db.query(
      'SELECT id, username, email, phone, status, last_login FROM tbusers WHERE company_id = ? AND accountant_id = ?',
      [companyId, accountantId]
    );

    res.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        financialYear: company.financial_year,
        booksBeginningYear: company.books_beginning_year,
        panNumber: company.pan_number,
        gstNumber: company.gst_number,
        state: company.state,
        country: company.country,
        taxType: company.tax_type,
        email: company.email,
        phone: company.phone_number,
        address: company.address
      },
      stats: {
        totalSales: Number(salesStats[0]?.total_sales || 0),
        salesCount: Number(salesStats[0]?.sales_count || 0),
        totalPurchases: Number(purchaseStats[0]?.total_purchases || 0),
        purchaseCount: Number(purchaseStats[0]?.purchase_count || 0),
        totalVouchers: Number(voucherStats[0]?.total_vouchers || 0),
        managedUsersCount: users.length
      },
      metrics: {
        totalSales: Number(salesStats[0]?.total_sales || 0),
        salesCount: Number(salesStats[0]?.sales_count || 0),
        totalPurchases: Number(purchaseStats[0]?.total_purchases || 0),
        purchaseCount: Number(purchaseStats[0]?.purchase_count || 0),
        totalVouchers: Number(voucherStats[0]?.total_vouchers || 0),
        managedUsersCount: users.length
      },
      users
    });
  } catch (err) {
    console.error('Error fetching company overview:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
