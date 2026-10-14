const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const { signToken } = require('../utils/jwt');
const authMiddleware = require('../middlewares/authMiddleware');
const { loginLimiter } = require('../middlewares/rateLimiter');

// ✅ Admin Signup (For Super Admin)
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    // Check if tbadmin has this email
    const [adminRows] = await db.query('SELECT id FROM tbadmin WHERE LOWER(email) = ?', [normalizedEmail]);
    if (adminRows.length > 0) {
      return res.status(400).json({ message: 'Email already exists in super admin' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password.trim(), 10);

    const [result] = await db.query(
      'INSERT INTO tbadmin (email, password) VALUES (?, ?)',
      [normalizedEmail, hashedPassword]
    );

    // Generate token so they can log in immediately
    const token = signToken(
      { id: result.insertId, email: normalizedEmail, role: 'super_admin', userType: 'super_admin' },
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Signup successful',
      token,
      user: {
        id: result.insertId,
        email: normalizedEmail,
        name: 'Admin',
        role: 'super_admin'
      }
    });

  } catch (err) {
    console.error('Signup error:', err.message);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Admin Login
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    // Find user - checking tbadmin (super admin)
    const [rows] = await db.query('SELECT * FROM tbadmin WHERE LOWER(email) = ?', [normalizedEmail]);
    const user = rows[0];

    if (!user || !user.password) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Strictly verify password using bcrypt
    const isMatch = await bcrypt.compare(password.trim(), user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT - Role is strictly super_admin
    const token = signToken(
      { id: user.id, email: user.email, role: 'super_admin', userType: 'super_admin' },
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: 'Admin',
        role: 'super_admin'
      }
    });


  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Get Current Admin Profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { id } = req.user;
    
    // Only fetch from tbadmin
    const [rows] = await db.query('SELECT id, email, created_at FROM tbadmin WHERE id = ?', [id]);
    const user = rows[0];

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: { ...user, role: 'super_admin' } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Update Profile
router.put('/update-profile', authMiddleware, async (req, res) => {
  try {
    const { id } = req.user; // Role is guaranteed super_admin if authMiddleware passed
    const { email, password } = req.body;

    let updateQuery;
    let params;

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery = 'UPDATE tbadmin SET email = ?, password = ? WHERE id = ?';
      params = [email, hashedPassword, id];
    } else {
      updateQuery = 'UPDATE tbadmin SET email = ? WHERE id = ?';
      params = [email, id];
    }

    await db.query(updateQuery, params);
    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Admin Logout
router.post('/logout', (req, res) => {
  res.status(200).json({ message: 'Logout successful' });
});

// ✅ Admin Dashboard Stats
// ✅ Admin Dashboard Stats
router.get('/dashboard-stats', authMiddleware, async (req, res) => {
  try {
    // Global stats for Super Admin
    let totalCA, totalEmployees, totalCompanies, recentCompanies;

    [[{ totalCA }]] = await db.query('SELECT COUNT(*) as totalCA FROM tbca');
    [[{ totalEmployees }]] = await db.query('SELECT COUNT(*) as totalEmployees FROM tbemployees');
    [[{ totalCompanies }]] = await db.query('SELECT COUNT(*) as totalCompanies FROM tbcompanies');

    [recentCompanies] = await db.query(`
      SELECT c.name, c.created_at, e.fdname as owner
      FROM tbcompanies c
      LEFT JOIN tbca e ON c.fdAccountantName = e.fdname
      ORDER BY c.created_at DESC
      LIMIT 5
    `);

    res.json({
      stats: {
        totalCA,
        totalEmployees,
        totalCompanies,
        monthlyRevenue: 125000, // Mocked
        failedPayments: 3       // Mocked
      },
      recentActivity: recentCompanies.map(c => ({
        type: 'company_created',
        title: 'New company registered',
        time: c.created_at,
        user: c.name,
        owner: c.owner
      }))
    });
  } catch (err) {
    console.error('Stats fetch error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Admin All Ledgers
router.get('/all-ledgers', authMiddleware, async (req, res) => {
  try {
    const [ledgers] = await db.query(`
      SELECT l.id, l.name, l.opening_balance, l.balance_type, l.created_at, l.company_id, l.owner_type, l.group_id, 'Global Admin' as company_name
      FROM ledgers l
      WHERE l.company_id = 0 AND l.owner_type = 'admin'
      ORDER BY l.created_at DESC
    `);
    
    res.json(ledgers);
  } catch (err) {
    console.error('Ledgers fetch error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Admin Create Global Ledger
router.post('/create-global-ledger', authMiddleware, async (req, res) => {
  const { name, groupId, openingBalance, balanceType } = req.body;

  if (!name || !groupId) {
    return res.status(400).json({ message: 'Name and Group ID are required' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Save as Admin Template (company_id = 0, owner_type = 'admin', owner_id = 0)
    const [adminTemplate] = await connection.execute(
      `SELECT id FROM ledgers WHERE name = ? AND company_id = 0 AND owner_type = 'admin'`,
      [name]
    );

    if (adminTemplate.length > 0) {
      return res.status(400).json({ message: 'Global ledger with this name already exists' });
    }

    await connection.execute(
      `INSERT INTO ledgers (name, group_id, opening_balance, balance_type, company_id, owner_type, owner_id)
       VALUES (?, ?, ?, ?, 0, 'admin', 0)`,
      [name, groupId, openingBalance || 0, balanceType || 'debit']
    );

    // 2. Fetch all companies
    const [companies] = await connection.execute(`SELECT id FROM tbcompanies`);

    // 3. Insert into all companies (if not already exists)
    for (const company of companies) {
      const [existing] = await connection.execute(
        `SELECT id FROM ledgers WHERE name = ? AND company_id = ? AND owner_type = 'employee' AND owner_id = 0`,
        [name, company.id]
      );

      if (existing.length === 0) {
        await connection.execute(
          `INSERT INTO ledgers (name, group_id, opening_balance, balance_type, company_id, owner_type, owner_id)
           VALUES (?, ?, ?, ?, ?, 'employee', 0)`,
          [name, groupId, openingBalance || 0, balanceType || 'debit', company.id]
        );
      }
    }

    await connection.commit();
    res.status(201).json({ message: 'Global ledger created successfully and copied to all companies' });
  } catch (err) {
    await connection.rollback();
    console.error('Global ledger creation error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  } finally {
    connection.release();
  }
});

// ✅ Admin Edit Global Ledger
router.put('/global-ledger/:id', authMiddleware, async (req, res) => {
  const ledgerId = req.params.id;
  const { name, groupId, openingBalance, balanceType } = req.body;

  if (!name || !groupId) {
    return res.status(400).json({ message: 'Name and Group ID are required' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Fetch old name
    const [oldLedger] = await connection.execute(
      `SELECT name FROM ledgers WHERE id = ? AND company_id = 0 AND owner_type = 'admin'`,
      [ledgerId]
    );

    if (oldLedger.length === 0) {
      return res.status(404).json({ message: 'Global ledger template not found' });
    }
    const oldName = oldLedger[0].name;

    // 2. Update Admin Template
    await connection.execute(
      `UPDATE ledgers SET name = ?, group_id = ?, opening_balance = ?, balance_type = ? 
       WHERE id = ? AND company_id = 0 AND owner_type = 'admin'`,
      [name, groupId, openingBalance || 0, balanceType || 'debit', ledgerId]
    );

    // 3. Update copies in all companies (matching by old name and employee owner_type)
    await connection.execute(
      `UPDATE ledgers SET name = ?, group_id = ?, opening_balance = ?, balance_type = ? 
       WHERE name = ? AND company_id > 0 AND owner_type = 'employee' AND owner_id = 0`,
      [name, groupId, openingBalance || 0, balanceType || 'debit', oldName]
    );

    await connection.commit();
    res.json({ message: 'Global ledger updated successfully across all companies' });
  } catch (err) {
    await connection.rollback();
    console.error('Global ledger update error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  } finally {
    connection.release();
  }
});

// ✅ Admin Delete Global Ledger
router.delete('/global-ledger/:id', authMiddleware, async (req, res) => {
  const ledgerId = req.params.id;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Fetch old name
    const [oldLedger] = await connection.execute(
      `SELECT name FROM ledgers WHERE id = ? AND company_id = 0 AND owner_type = 'admin'`,
      [ledgerId]
    );

    if (oldLedger.length === 0) {
      return res.status(404).json({ message: 'Global ledger template not found' });
    }
    const oldName = oldLedger[0].name;

    // 2. Delete copies from all companies (using IGNORE to prevent crashing if foreign keys block deletion)
    await connection.execute(
      `DELETE IGNORE FROM ledgers WHERE name = ? AND company_id > 0 AND owner_type = 'employee' AND owner_id = 0`,
      [oldName]
    );

    // 3. Delete Admin Template
    await connection.execute(
      `DELETE FROM ledgers WHERE id = ? AND company_id = 0 AND owner_type = 'admin'`,
      [ledgerId]
    );

    await connection.commit();
    res.json({ message: 'Global ledger deleted successfully' });
  } catch (err) {
    await connection.rollback();
    console.error('Global ledger deletion error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  } finally {
    connection.release();
  }
});

// ✅ Admin All Groups
router.get('/all-groups', authMiddleware, async (req, res) => {
  try {
    const [groups] = await db.query(`
      SELECT g.id, g.name, g.parent, g.nature, g.created_at, g.company_id, g.owner_type, 'Global Admin' as company_name
      FROM ledger_groups g
      WHERE g.company_id = 0 AND g.owner_type = 'admin'
      ORDER BY g.created_at DESC
    `);
    
    res.json(groups);
  } catch (err) {
    console.error('Groups fetch error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ✅ Admin Create Global Group
router.post('/create-global-group', authMiddleware, async (req, res) => {
  const { name, parent, nature } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Group Name is required' });
  }

  const trimmedName = name.trim();
  const parentVal = parent !== undefined && parent !== null && parent !== '' ? Number(parent) : null;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Check if Admin template already exists
    const [adminTemplate] = await connection.execute(
      `SELECT id FROM ledger_groups WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND company_id = 0 AND owner_type = 'admin'`,
      [trimmedName]
    );

    if (adminTemplate.length > 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Global group with this name already exists' });
    }

    // 2. Insert Admin Template
    await connection.execute(
      `INSERT INTO ledger_groups (name, parent, nature, company_id, owner_type, owner_id)
       VALUES (?, ?, ?, 0, 'admin', 0)`,
      [trimmedName, parentVal, nature || null]
    );

    // 3. Fetch all companies
    const [companies] = await connection.execute(`SELECT id FROM tbcompanies`);

    // 4. Insert into all companies (if not already exists)
    for (const company of companies) {
      const [existing] = await connection.execute(
        `SELECT id FROM ledger_groups WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND company_id = ? AND owner_type = 'employee' AND owner_id = 0`,
        [trimmedName, company.id]
      );

      if (existing.length === 0) {
        await connection.execute(
          `INSERT INTO ledger_groups (name, parent, nature, company_id, owner_type, owner_id)
           VALUES (?, ?, ?, ?, 'employee', 0)`,
          [trimmedName, parentVal, nature || null, company.id]
        );
      }
    }

    await connection.commit();
    res.status(201).json({ message: 'Global group created successfully and copied to all companies' });
  } catch (err) {
    await connection.rollback();
    console.error('Global group creation error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  } finally {
    connection.release();
  }
});

// ✅ Admin Edit Global Group
router.put('/global-group/:id', authMiddleware, async (req, res) => {
  const groupId = req.params.id;
  const { name, parent, nature } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'Group Name is required' });
  }

  const trimmedName = name.trim();
  const parentVal = parent !== undefined && parent !== null && parent !== '' ? Number(parent) : null;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Fetch old name
    const [oldGroup] = await connection.execute(
      `SELECT name FROM ledger_groups WHERE id = ? AND company_id = 0 AND owner_type = 'admin'`,
      [groupId]
    );

    if (oldGroup.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Global group template not found' });
    }
    const oldName = oldGroup[0].name;

    // Check if new name conflicts with another global group
    if (trimmedName.toLowerCase() !== oldName.toLowerCase()) {
      const [nameConflict] = await connection.execute(
        `SELECT id FROM ledger_groups WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND company_id = 0 AND owner_type = 'admin' AND id != ?`,
        [trimmedName, groupId]
      );
      if (nameConflict.length > 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'Another global group with this name already exists' });
      }
    }

    // 2. Update Admin Template
    await connection.execute(
      `UPDATE ledger_groups SET name = ?, parent = ?, nature = ? 
       WHERE id = ? AND company_id = 0 AND owner_type = 'admin'`,
      [trimmedName, parentVal, nature || null, groupId]
    );

    // 3. Update copies in all companies (matching by old name and employee owner_type)
    await connection.execute(
      `UPDATE ledger_groups SET name = ?, parent = ?, nature = ? 
       WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND company_id > 0 AND owner_type = 'employee' AND owner_id = 0`,
      [trimmedName, parentVal, nature || null, oldName]
    );

    await connection.commit();
    res.json({ message: 'Global group updated successfully across all companies' });
  } catch (err) {
    await connection.rollback();
    console.error('Global group update error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  } finally {
    connection.release();
  }
});

// ✅ Admin Delete Global Group
router.delete('/global-group/:id', authMiddleware, async (req, res) => {
  const groupId = req.params.id;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Fetch old name
    const [oldGroup] = await connection.execute(
      `SELECT name FROM ledger_groups WHERE id = ? AND company_id = 0 AND owner_type = 'admin'`,
      [groupId]
    );

    if (oldGroup.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Global group template not found' });
    }
    const oldName = oldGroup[0].name;

    // 2. Delete copies from all companies (using IGNORE to prevent crashing if foreign keys block deletion)
    await connection.execute(
      `DELETE IGNORE FROM ledger_groups WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND company_id > 0 AND owner_type = 'employee' AND owner_id = 0`,
      [oldName]
    );

    // 3. Delete Admin Template
    await connection.execute(
      `DELETE FROM ledger_groups WHERE id = ? AND company_id = 0 AND owner_type = 'admin'`,
      [groupId]
    );

    await connection.commit();
    res.json({ message: 'Global group deleted successfully' });
  } catch (err) {
    await connection.rollback();
    console.error('Global group deletion error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  } finally {
    connection.release();
  }
});

module.exports = router;
