const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');

router.post('/company', async (req, res) => {

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
    vaultPassword,
    accessControlEnabled,
    username,
    password,
    employeeId,
    maintainBy,
    accountantName,
    caId,
    assesseeName,
    companyType
  } = req.body;

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Check user limit before creating company
    const [userRows] = await connection.query(
      'SELECT userLimit FROM tbemployees WHERE id = ?',
      [employeeId]
    );

    const userLimit = userRows.length > 0 ? userRows[0].userLimit : 1;

    const [existingCompanies] = await connection.query(
      'SELECT COUNT(*) as count FROM tbcompanies WHERE employee_id = ?',
      [employeeId]
    );

    if (existingCompanies[0].count >= userLimit) {
      await connection.rollback();
      connection.release();
      return res.status(403).json({
        message: `Company limit reached. Your limit is ${userLimit} companies.`
      });
    }

    const [columns] = await connection.query(`
      SHOW COLUMNS FROM tbcompanies LIKE 'tan_number'
    `);

    if (columns.length === 0) {
      await connection.query(`
        ALTER TABLE tbcompanies
        ADD COLUMN tan_number VARCHAR(20)
      `);
      console.log("✅ tan_number column created");
    }

    const [bdCols] = await connection.query(`SHOW COLUMNS FROM tbcompanies LIKE 'back_date_allowed'`);
    if (bdCols.length === 0) {
      await connection.query(`ALTER TABLE tbcompanies ADD COLUMN back_date_allowed TINYINT(1) DEFAULT 0`);
      console.log("✅ back_date_allowed column created");
    }

    const [assesseeCols] = await connection.query(`SHOW COLUMNS FROM tbcompanies LIKE 'assessee_name'`);
    if (assesseeCols.length === 0) {
      await connection.query(`ALTER TABLE tbcompanies ADD COLUMN assessee_name VARCHAR(100)`);
      console.log("✅ assessee_name column created");
    }

    const [companyTypeCols] = await connection.query(`SHOW COLUMNS FROM tbcompanies LIKE 'company_type'`);
    if (companyTypeCols.length === 0) {
      await connection.query(`ALTER TABLE tbcompanies ADD COLUMN company_type VARCHAR(50)`);
      console.log("✅ company_type column created");
    }

    let hashedVaultPassword = null;

    if (vaultPassword) {
      hashedVaultPassword = await bcrypt.hash(vaultPassword, 10);
    }

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
        vault_password,
        fdAccountType,
        fdAccountantName,
        back_date_allowed,
        assessee_name,
        company_type
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name,
      financialYear,
      booksBeginningYear,
      address,
      pin,
      phoneNumber,
      email,
      panNumber,
      tanNumber,
      taxType === "GST" ? gstNumber : null,
      taxType === "VAT" ? vatNumber : null,
      state,
      country,
      taxType,
      employeeId,
      hashedVaultPassword || null,
      maintainBy || null,
      accountantName || null,
      req.body.backDateAllowed !== undefined ? (req.body.backDateAllowed ? 1 : 0) : 1,
      assesseeName || null,
      companyType || null
    ]);

    const companyId = companyResult.insertId;

    if (caId) {
      await connection.query(
        `INSERT INTO ca_company (ca_id, company_id) VALUES (?, ?)`,
        [caId, companyId]
      );
    }

    // --- Ensure company_subscriptions table exists (for trials/subscriptions) ---
    const [subscriptionTable] = await connection.query(
      "SHOW TABLES LIKE 'company_subscriptions'"
    );

    if (subscriptionTable.length === 0) {
      await connection.query(`
        CREATE TABLE company_subscriptions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          company_id INT NOT NULL,
          plan VARCHAR(50) NOT NULL DEFAULT 'trial',
          is_trial TINYINT(1) NOT NULL DEFAULT 1,
          status ENUM('active','expired','cancelled') NOT NULL DEFAULT 'active',
          start_date DATETIME NOT NULL,
          end_date DATETIME NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_company_id (company_id),
          CONSTRAINT fk_company_subscriptions_company
            FOREIGN KEY (company_id) REFERENCES tbcompanies(id)
            ON DELETE CASCADE
        )
      `);
      console.log("✅ company_subscriptions table created");
    }

    // --- Fetch trial period from admin_settings ---
    const [settingRows] = await connection.query(
      "SELECT setting_value FROM admin_settings WHERE setting_key = 'trial_period_days'"
    );
    const trialDays = settingRows.length > 0 ? parseInt(settingRows[0].setting_value) : 14;

    // --- Create default free trial for this company ---
    await connection.query(
      `
        INSERT INTO company_subscriptions (
          company_id,
          plan,
          is_trial,
          status,
          start_date,
          end_date
        )
        VALUES (?, 'trial', 1, 'active', NOW(), DATE_ADD(NOW(), INTERVAL ${trialDays} DAY))
      `,
      [companyId]
    );

    if (accessControlEnabled && username && password) {
      const hashedPassword = await bcrypt.hash(password, 10);

      // Try to get 'Admin' role ID
      const [roleRows] = await connection.query(
        "SELECT role_id FROM tbroles WHERE LOWER(role_name) = 'admin' LIMIT 1"
      );
      const roleId = roleRows.length > 0 ? roleRows[0].role_id : 0;

      await connection.query(`
        INSERT INTO tbusers (company_id, username, password, employee_id, email, role_id, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `, [companyId, username, hashedPassword, employeeId, email, roleId]);
    }

    // --- Automatically copy Admin template groups to the new company ---
    const [adminGroups] = await connection.execute(
      `SELECT name, parent, nature FROM ledger_groups WHERE company_id = 0 AND owner_type = 'admin'`
    );
    for (const grp of adminGroups) {
      const [existingGrp] = await connection.execute(
        `SELECT id FROM ledger_groups WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND company_id = ? AND owner_type = 'employee' AND owner_id = 0`,
        [grp.name, companyId]
      );
      if (existingGrp.length === 0) {
        await connection.execute(
          `INSERT INTO ledger_groups (name, parent, nature, company_id, owner_type, owner_id)
           VALUES (?, ?, ?, ?, 'employee', 0)`,
          [grp.name, grp.parent, grp.nature, companyId]
        );
      }
    }

    // --- Automatically copy Admin template ledgers to the new company ---
    const [adminLedgers] = await connection.execute(
      `SELECT name, group_id, opening_balance, balance_type FROM ledgers WHERE company_id = 0 AND owner_type = 'admin'`
    );
    for (const ldg of adminLedgers) {
      const [existingLdg] = await connection.execute(
        `SELECT id FROM ledgers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND company_id = ? AND owner_type = 'employee' AND owner_id = 0`,
        [ldg.name, companyId]
      );
      if (existingLdg.length === 0) {
        await connection.execute(
          `INSERT INTO ledgers (name, group_id, opening_balance, balance_type, company_id, owner_type, owner_id)
           VALUES (?, ?, ?, ?, ?, 'employee', 0)`,
          [ldg.name, ldg.group_id, ldg.opening_balance || 0, ldg.balance_type || 'debit', companyId]
        );
      }
    }

    await connection.commit();
    connection.release();


    return res.status(201).json({
      message: 'Company created successfully',
      companyId
    });

  } catch (err) {

    await connection.rollback();
    connection.release();

    console.error("❌ Company creation error:", err);

    return res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});


router.put('/company/:companyId', async (req, res) => {

  const { companyId } = req.params;

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
    vaultPassword,
    accessControlEnabled,
    username,
    password,
    employeeId,
    maintainBy,
    accountantName,
    caId,
    assesseeName,
    companyType
  } = req.body;

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {

    const [columns] = await connection.query(`
      SHOW COLUMNS FROM tbcompanies LIKE 'tan_number'
    `);

    if (columns.length === 0) {
      await connection.query(`
        ALTER TABLE tbcompanies
        ADD COLUMN tan_number VARCHAR(20)
      `);

      console.log("✅ tan_number column created");
    }

    const [bdCols] = await connection.query(`SHOW COLUMNS FROM tbcompanies LIKE 'back_date_allowed'`);
    if (bdCols.length === 0) {
      await connection.query(`ALTER TABLE tbcompanies ADD COLUMN back_date_allowed TINYINT(1) DEFAULT 0`);
      console.log("✅ back_date_allowed column created");
    }

    const [assesseeCols] = await connection.query(`SHOW COLUMNS FROM tbcompanies LIKE 'assessee_name'`);
    if (assesseeCols.length === 0) {
      await connection.query(`ALTER TABLE tbcompanies ADD COLUMN assessee_name VARCHAR(100)`);
      console.log("✅ assessee_name column created");
    }

    const [companyTypeCols] = await connection.query(`SHOW COLUMNS FROM tbcompanies LIKE 'company_type'`);
    if (companyTypeCols.length === 0) {
      await connection.query(`ALTER TABLE tbcompanies ADD COLUMN company_type VARCHAR(50)`);
      console.log("✅ company_type column created");
    }

    let hashedVaultPassword = null;

    if (vaultPassword) {
      hashedVaultPassword = await bcrypt.hash(vaultPassword, 10);
    }

    await connection.query(`
      UPDATE tbcompanies SET
        name = ?,
        financial_year = ?,
        books_beginning_year = ?,
        address = ?,
        pin = ?,
        phone_number = ?,
        email = ?,
        pan_number = ?,
        tan_number = ?,       
        gst_number = ?,
        vat_number = ?,
        state = ?,
        country = ?,
        tax_type = ?,
        employee_id = ?,
        vault_password = COALESCE(?, vault_password),
        fdAccountType = ?,
        fdAccountantName = ?,
        back_date_allowed = ?,
        assessee_name = ?,
        company_type = ?
      WHERE id = ?
    `, [
      name,
      financialYear,
      booksBeginningYear,
      address,
      pin,
      phoneNumber,
      email,
      panNumber,
      tanNumber,
      taxType === "GST" ? gstNumber : null,
      taxType === "VAT" ? vatNumber : null,
      state,
      country,
      taxType,
      employeeId,
      hashedVaultPassword,
      maintainBy || null,
      accountantName || null,
      req.body.backDateAllowed !== undefined ? (req.body.backDateAllowed ? 1 : 0) : 1,
      assesseeName || null,
      companyType || null,
      companyId
    ]);

    await connection.query(`DELETE FROM ca_company WHERE company_id = ?`, [companyId]);
    if (caId) {
      await connection.query(
        `INSERT INTO ca_company (ca_id, company_id) VALUES (?, ?)`,
        [caId, companyId]
      );
    }

    if (accessControlEnabled && username) {

      let hashedPassword = null;

      if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
      }

      const [existingUser] = await connection.query(
        `SELECT id FROM tbusers WHERE company_id = ?`,
        [companyId]
      );

      if (existingUser.length > 0) {

        await connection.query(`
          UPDATE tbusers SET
            username = ?,
            password = COALESCE(?, password),
            email = ?
          WHERE company_id = ?
        `, [username, hashedPassword || null, email, companyId]);

      } else {
        // Try to get 'Admin' role ID
        const [roleRows] = await connection.query(
          "SELECT role_id FROM tbroles WHERE LOWER(role_name) = 'admin' LIMIT 1"
        );
        const roleId = roleRows.length > 0 ? roleRows[0].role_id : 0;

        await connection.query(`
          INSERT INTO tbusers (company_id, username, password, employee_id, email, role_id, status)
          VALUES (?, ?, ?, ?, ?, ?, 'active')
        `, [companyId, username, hashedPassword, employeeId, email, roleId]);

      }
    } else if (accessControlEnabled === false) {
      // If access control is explicitly disabled, remove the company users
      await connection.query(
        `DELETE FROM tbusers WHERE company_id = ?`,
        [companyId]
      );
    }

    await connection.commit();
    connection.release();

    return res.status(200).json({
      message: 'Company updated successfully',
      companyId
    });

  } catch (err) {

    await connection.rollback();
    connection.release();

    console.error("❌ Company update error:", err);

    return res.status(500).json({
      message: 'Server error',
      error: err.message
    });
  }
});



router.get('/company/:companyId', async (req, res) => {

  const { companyId } = req.params;

  if (!companyId) {
    return res.status(400).json({ message: 'Company ID is required' });
  }

  const connection = await db.getConnection();

  try {

    const [columns] = await connection.query(`
      SHOW COLUMNS FROM tbcompanies LIKE 'tan_number'
    `);

    if (columns.length === 0) {

      await connection.query(`
        ALTER TABLE tbcompanies
        ADD COLUMN tan_number VARCHAR(20)
      `);

      console.log("✅ tan_number column auto created (GET)");
    }

    const [backDateColumns] = await connection.query(`
      SHOW COLUMNS FROM tbcompanies LIKE 'back_date_allowed'
    `);

    if (backDateColumns.length === 0) {
      await connection.query(`
        ALTER TABLE tbcompanies
        ADD COLUMN back_date_allowed TINYINT(1) DEFAULT 0
      `);
      console.log("✅ back_date_allowed column created");
    }

    const [assesseeColsGet] = await connection.query(`SHOW COLUMNS FROM tbcompanies LIKE 'assessee_name'`);
    if (assesseeColsGet.length === 0) {
      await connection.query(`ALTER TABLE tbcompanies ADD COLUMN assessee_name VARCHAR(100)`);
      console.log("✅ assessee_name column auto created (GET)");
    }

    const [companyTypeColsGet] = await connection.query(`SHOW COLUMNS FROM tbcompanies LIKE 'company_type'`);
    if (companyTypeColsGet.length === 0) {
      await connection.query(`ALTER TABLE tbcompanies ADD COLUMN company_type VARCHAR(50)`);
      console.log("✅ company_type column auto created (GET)");
    }

    const [rows] = await connection.query(`
      SELECT 
        c.id,
        c.name,
        c.financial_year AS financialYear,
        c.books_beginning_year AS booksBeginningYear,
        c.address,
        c.pin,
        c.phone_number AS phoneNumber,
        c.email,
        c.pan_number AS panNumber,
        c.tan_number AS tanNumber,     
        c.gst_number AS gstNumber,
        c.vat_number AS vatNumber,
        c.state,
        c.country,
        c.tax_type AS taxType,
        c.assessee_name AS assesseeName,
        c.company_type AS companyType,
        c.fdAccountType AS maintainBy,
        c.fdAccountantName AS accountantName,
        c.vault_password IS NOT NULL as vaultEnabled,
        c.back_date_allowed as backDateAllowed,
        u.username,
        (u.id IS NOT NULL) as accessControlEnabled,
        cc.ca_id AS caId
      FROM tbcompanies c
      LEFT JOIN tbusers u ON c.id = u.company_id
      LEFT JOIN ca_company cc ON c.id = cc.company_id
      WHERE c.id = ?
      LIMIT 1
    `, [companyId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Company not found' });
    }

    return res.status(200).json(rows[0]);

  } catch (err) {

    console.error('❌ Fetch company error:', err);

    return res.status(500).json({
      message: 'Server error',
      error: err.message
    });

  } finally {

    connection.release();

  }
});




// --- New GET route to fetch accountants ---
router.get('/accountants', async (req, res) => {
  try {
    const connection = await db.getConnection();
    const [rows] = await connection.query('SELECT fdSiNo, fdname FROM tbca');
    connection.release();
    return res.json(rows);
  } catch (err) {
    console.error('❌ Fetch accountants error:', err.message);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});


module.exports = router;
