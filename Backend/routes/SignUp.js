const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const { signToken } = require('../utils/jwt');
const { registerLimiter } = require('../middlewares/rateLimiter');

// POST /api/SignUp/register
router.post('/register', registerLimiter, async (req, res) => {
  const { firstName, lastName, email, phoneNumber, pan, password, userLimit, address } = req.body;

  // 1. Mandatory field checks
  if (!firstName || !lastName || !email || !password || !phoneNumber || !pan) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  // 2. Normalize and sanitize inputs
  const trimmedFirstName = String(firstName).trim();
  const trimmedLastName = String(lastName).trim();
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPan = String(pan).trim().toUpperCase();
  const trimmedPhone = String(phoneNumber).trim();
  const trimmedPassword = String(password).trim();
  const parsedUserLimit = parseInt(userLimit, 10) > 0 ? parseInt(userLimit, 10) : 1;
  const trimmedAddress = address ? String(address).trim() : null;

  // 3. Server-side validations
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return res.status(400).json({ success: false, message: 'Invalid email address format' });
  }

  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  if (!panRegex.test(normalizedPan)) {
    return res.status(400).json({ success: false, message: 'Invalid PAN number format (e.g. ABCDE1234F)' });
  }

  if (trimmedPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  if (trimmedPhone.length < 7 || !/^[0-9+\-\s()]+$/.test(trimmedPhone)) {
    return res.status(400).json({ success: false, message: 'Invalid phone number format' });
  }

  try {
    // 4. Pre-check email uniqueness across central users table and legacy tables
    const [existingUsers] = await db.query('SELECT id FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
    if (existingUsers.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const [existingEmp] = await db.query('SELECT id FROM tbemployees WHERE LOWER(email) = ?', [normalizedEmail]);
    if (existingEmp.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const [existingPan] = await db.query('SELECT id FROM tbemployees WHERE pan = ?', [normalizedPan]);
    if (existingPan.length > 0) {
      return res.status(409).json({ success: false, message: 'PAN number already registered' });
    }

    // Check tbca, tbcaemployees, ca_users, tbadmin
    const [existingCa] = await db.query('SELECT fdSiNo FROM tbca WHERE LOWER(email) = ?', [normalizedEmail]);
    if (existingCa.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const [existingCaEmp] = await db.query('SELECT id FROM tbcaemployees WHERE LOWER(email) = ?', [normalizedEmail]);
    if (existingCaEmp.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const [existingCaUser] = await db.query('SELECT id FROM ca_users WHERE LOWER(email) = ?', [normalizedEmail]);
    if (existingCaUser.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const [existingAdmin] = await db.query('SELECT id FROM tbadmin WHERE LOWER(email) = ?', [normalizedEmail]);
    if (existingAdmin.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    // 5. Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(trimmedPassword, 10);

    // 6. Insert user record into tbemployees
    const insertSql = `
      INSERT INTO tbemployees (firstName, lastName, email, phoneNumber, pan, password, userLimit, token, address)
      VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)
    `;

    const [result] = await db.query(insertSql, [
      trimmedFirstName,
      trimmedLastName,
      normalizedEmail,
      trimmedPhone,
      normalizedPan,
      hashedPassword,
      parsedUserLimit,
      trimmedAddress,
    ]);

    const newUserId = result.insertId;

    // 6b. Automatically sync to central users table
    await db.query(`
      INSERT INTO users (email, password_hash, role, source_table, source_id)
      VALUES (?, ?, 'employee', 'tbemployees', ?)
      ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        source_id = VALUES(source_id)
    `, [normalizedEmail, hashedPassword, newUserId]);

    // 7. Generate verified JWT token
    const token = signToken({
      id: newUserId,
      email: normalizedEmail,
      role: 'employee',
      userType: 'employee'
    });

    // Optionally update token field in database
    await db.query('UPDATE tbemployees SET token = ? WHERE id = ?', [token, newUserId]).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      userId: newUserId,
      token,
      user: {
        id: newUserId,
        email: normalizedEmail,
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        phoneNumber: trimmedPhone,
        pan: normalizedPan,
        userLimit: parsedUserLimit,
        userType: 'employee'
      }
    });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const isPan = err.message && err.message.toLowerCase().includes('pan');
      return res.status(409).json({
        success: false,
        message: isPan ? 'PAN number already registered' : 'Email already registered'
      });
    }

    console.error('❌ Registration error:', err);
    return res.status(500).json({ success: false, message: 'Registration failed due to a server error' });
  }
});

module.exports = router;
