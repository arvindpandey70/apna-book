const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const upload = require('../middlewares/userUpload');
const cloudinary = require('../utils/cloudnary');
const streamifier = require('streamifier');
const { computeTrialDetails, getAccountantSubscriptionStatus } = require('../utils/accountantTrial');

// Helper to upload to Cloudinary
const uploadToCloudinary = (fileBuffer, folder = 'user_terms') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'auto' // Important for handling both images and PDFs
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

// Helper to ensure columns exist
const ensureTermsColumn = async () => {
  try {
    const [caCols] = await db.query("SHOW COLUMNS FROM tbca LIKE 'fdterms_file'");
    if (caCols.length === 0) {
      await db.query("ALTER TABLE tbca ADD COLUMN fdterms_file VARCHAR(255) DEFAULT NULL");
    }
    const [empCols] = await db.query("SHOW COLUMNS FROM tbemployees LIKE 'fdterms_file'");
    if (empCols.length === 0) {
      await db.query("ALTER TABLE tbemployees ADD COLUMN fdterms_file VARCHAR(255) DEFAULT NULL");
    }
  } catch (err) {
    console.error('Error ensuring terms column:', err);
  }
};
ensureTermsColumn();

// Role-aware Users Route (Accountant Management)
router.get('/', async (req, res) => {
  try {
    const { id, role } = req.user;
    let users;

    if (role === 'super_admin') {
      // Super Admin sees all CAs / Accountants
      try {
        [users] = await db.query(`
          SELECT
            fdSiNo AS id,
            fdname AS name,
            fdphone AS phone,
            email,
            fdstatus AS status,
            fdlast_login AS last_login,
            fdterms_file AS terms_file,
            is_free_trial_enabled,
            trial_start_date,
            trial_expiry_date,
            trial_granted_by,
            updated_at
          FROM tbca
          ORDER BY fdSiNo DESC
        `);
      } catch (trialColErr) {
        // Safe fallback if manual SQL script hasn't been executed yet
        [users] = await db.query(`
          SELECT
            fdSiNo AS id,
            fdname AS name,
            fdphone AS phone,
            email,
            fdstatus AS status,
            fdlast_login AS last_login,
            fdterms_file AS terms_file
          FROM tbca
          ORDER BY fdSiNo DESC
        `);
      }
    } else {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const now = new Date();
    // Ensure dates and trial details are formatted
    const formattedUsers = users.map(u => ({
      ...u,
      lastLogin: u.last_login ? new Date(u.last_login).toISOString() : null,
      ...computeTrialDetails(u, now),
    }));

    res.json(formattedUsers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get trial details for a single accountant
router.get('/:userId/trial', async (req, res) => {
  try {
    const { role } = req.user;
    if (role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { userId } = req.params;
    let caRows = [];
    try {
      [caRows] = await db.query(`
        SELECT
          fdSiNo AS id,
          fdname AS name,
          email,
          is_free_trial_enabled,
          trial_start_date,
          trial_expiry_date,
          trial_granted_by,
          updated_at
        FROM tbca
        WHERE fdSiNo = ?
        LIMIT 1
      `, [userId]);
    } catch (colErr) {
      return res.status(400).json({
        error: 'Free trial columns not found. Please execute manual_free_trial_setup.sql.'
      });
    }

    if (!caRows || caRows.length === 0) {
      return res.status(404).json({ error: 'Accountant not found' });
    }

    const u = caRows[0];
    const trialDetails = computeTrialDetails(u, new Date());
    const subStatus = await getAccountantSubscriptionStatus(userId);

    res.json({
      id: u.id,
      name: u.name,
      email: u.email,
      ...trialDetails,
      subscription_status: subStatus,
    });
  } catch (err) {
    console.error('Error fetching accountant trial:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Update trial access for an accountant (Admin-controlled)
router.put('/:userId/trial', async (req, res) => {
  try {
    const { role, id: adminId } = req.user;
    if (role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized: Only Super Admin can manage free trials' });
    }

    const { userId } = req.params;
    const { is_free_trial_enabled, trial_expiry_date } = req.body;

    const isEnabled = Boolean(is_free_trial_enabled);
    let expiryDateVal = null;
    if (trial_expiry_date) {
      expiryDateVal = new Date(trial_expiry_date);
      if (isNaN(expiryDateVal.getTime())) {
        return res.status(400).json({ error: 'Invalid trial expiry date format' });
      }
    }

    // Verify accountant exists in tbca
    let userRows;
    try {
      [userRows] = await db.query(
        'SELECT fdSiNo, email, fdname, is_free_trial_enabled, trial_start_date FROM tbca WHERE fdSiNo = ?',
        [userId]
      );
    } catch (colErr) {
      return res.status(400).json({
        error: 'Free trial columns not found in database. Please run manual_free_trial_setup.sql first.'
      });
    }

    if (!userRows || userRows.length === 0) {
      return res.status(404).json({ error: 'Accountant not found' });
    }

    const existing = userRows[0];
    let startDate = existing.trial_start_date;
    if (isEnabled && !startDate) {
      startDate = new Date();
    }

    // Execute update without touching any paid subscription tables
    await db.query(
      `UPDATE tbca
       SET is_free_trial_enabled = ?,
           trial_start_date = ?,
           trial_expiry_date = ?,
           trial_granted_by = ?,
           updated_at = NOW()
       WHERE fdSiNo = ?`,
      [isEnabled ? 1 : 0, startDate, expiryDateVal, adminId, userId]
    );

    // Compute updated trial details
    const updatedRow = {
      is_free_trial_enabled: isEnabled,
      trial_start_date: startDate,
      trial_expiry_date: expiryDateVal,
      trial_granted_by: adminId,
    };
    const details = computeTrialDetails(updatedRow, new Date());

    res.json({
      success: true,
      message: isEnabled ? 'Free trial enabled successfully' : 'Free trial disabled successfully',
      data: {
        id: userId,
        ...details,
      }
    });
  } catch (err) {
    console.error('Error updating accountant trial:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Add new user (Role-aware)
router.post('/', upload.single('terms_file'), async (req, res) => {
  try {
    const { id, role } = req.user;
    const { name, phone, email, password, status } = req.body;
    let terms_file = null;

    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.buffer);
        terms_file = result.secure_url;
      } catch (uploadError) {
        console.error("❌ Cloudinary Upload Error:", uploadError);
      }
    }

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date();

    if (role === 'super_admin') {
      const [result] = await db.query(`
        INSERT INTO tbca (fdname, fdphone, email, fdpassword, fdstatus, fdlast_login, fdterms_file)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [name, phone, email, hashedPassword, status || 'active', now, terms_file]);

      await db.query(`
        INSERT INTO users (email, password_hash, role, source_table, source_id, status)
        VALUES (?, ?, 'accountant', 'tbca', ?, ?)
        ON DUPLICATE KEY UPDATE
          password_hash = VALUES(password_hash),
          role = 'accountant',
          source_table = 'tbca',
          source_id = VALUES(source_id),
          status = VALUES(status)
      `, [email, hashedPassword, result.insertId, status || 'active']).catch(err => {
        console.error('Error syncing accountant to users table:', err.message);
      });

      res.status(201).json({ id: result.insertId, name, phone, email, status: status || 'active', lastLogin: now, terms_file });
    } else {
      res.status(403).json({ error: 'Unauthorized' });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Update user (Role-aware)
router.put('/:userId', upload.single('terms_file'), async (req, res) => {
  const { role } = req.user;
  const { name, phone, email, password, status } = req.body;
  const userId = req.params.userId;
  let terms_file = null;

  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.buffer);
      terms_file = result.secure_url;
    } catch (uploadError) {
      console.error("❌ Cloudinary Upload Error:", uploadError);
    }
  }

  try {
    if (role === 'super_admin') {
      let query, params;
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        query = 'UPDATE tbca SET fdname = ?, fdphone = ?, email = ?, fdpassword = ?, fdstatus = ?' + (terms_file ? ', fdterms_file = ?' : '') + ' WHERE fdSiNo = ?';
        params = [name, phone, email, hashedPassword, status];
        if (terms_file) params.push(terms_file);
        params.push(userId);
      } else {
        query = 'UPDATE tbca SET fdname = ?, fdphone = ?, email = ?, fdstatus = ?' + (terms_file ? ', fdterms_file = ?' : '') + ' WHERE fdSiNo = ?';
        params = [name, phone, email, status];
        if (terms_file) params.push(terms_file);
        params.push(userId);
      }
      await db.query(query, params);
    } else {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({ id: userId, name, phone, email, status, terms_file, message: 'User updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Change user status (Role-aware)
router.patch('/:userId/status', async (req, res) => {
  try {
    const { role } = req.user;
    const { status } = req.body;
    const userId = req.params.userId;

    if (!['active', 'suspended', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    let result;
    if (role === 'super_admin') {
      [result] = await db.query('UPDATE tbca SET fdstatus = ? WHERE fdSiNo = ?', [status, userId]);
    } else {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Status updated', id: userId, status });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Delete user (Role-aware)
router.delete('/:userId', async (req, res) => {
  try {
    const { id, role } = req.user;
    const userId = parseInt(req.params.userId, 10);
    let result;

    if (role === 'super_admin') {
      [result] = await db.query('DELETE FROM tbca WHERE fdSiNo = ?', [userId]);
    } else {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted', id: userId });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get all available companies for Admin assignment
router.get('/available-companies', async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const [companies] = await db.query(`
      SELECT id, name, financial_year, pan_number, gst_number
      FROM tbcompanies
      ORDER BY name ASC
    `);
    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get companies assigned to an accountant
router.get('/:userId/companies', async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { userId } = req.params;
    const [rows] = await db.query(`
      SELECT c.id, c.name, c.financial_year, c.pan_number, c.gst_number
      FROM tbcompanies c
      INNER JOIN ca_company cc ON c.id = cc.company_id
      WHERE cc.ca_id = ?
      ORDER BY c.name ASC
    `, [userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Assign companies to an accountant
router.post('/:userId/companies', async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { userId } = req.params;
    const companyIds = req.body.companyIds || req.body.company_ids;

    if (!Array.isArray(companyIds)) {
      return res.status(400).json({ error: 'companyIds must be an array' });
    }

    await db.query('DELETE FROM ca_company WHERE ca_id = ?', [userId]);

    for (const compId of companyIds) {
      await db.query(
        'INSERT INTO ca_company (ca_id, company_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE id=id',
        [userId, compId]
      );
    }

    res.json({ message: 'Companies assigned successfully', count: companyIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
