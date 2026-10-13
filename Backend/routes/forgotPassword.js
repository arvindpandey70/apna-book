const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const { signToken, verifyToken } = require('../utils/jwt');
const { forgotPasswordLimiter } = require('../middlewares/rateLimiter');
const { sendMail } = require('../utils/mailer');

// Helper: find user across known tables
async function findUserByEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();

  // Check tbadmin (super admin)
  let [rows] = await db.query('SELECT * FROM tbadmin WHERE LOWER(email) = ?', [normalizedEmail]);
  if (rows.length) return { table: 'tbadmin', user: rows[0], passwordField: 'password', idField: 'id' };

  // Check tbemployees
  [rows] = await db.query('SELECT * FROM tbemployees WHERE LOWER(email) = ?', [normalizedEmail]);
  if (rows.length) return { table: 'tbemployees', user: rows[0], passwordField: 'password', idField: 'id' };

  // Check tbca
  [rows] = await db.query('SELECT * FROM tbca WHERE LOWER(email) = ?', [normalizedEmail]);
  if (rows.length) return { table: 'tbca', user: rows[0], passwordField: 'fdpassword', idField: 'fdSiNo' };

  // Check tbcaemployees
  [rows] = await db.query('SELECT * FROM tbcaemployees WHERE LOWER(email) = ?', [normalizedEmail]);
  if (rows.length) return { table: 'tbcaemployees', user: rows[0], passwordField: 'password', idField: 'id' };

  // Check ca_users
  [rows] = await db.query('SELECT * FROM ca_users WHERE LOWER(email) = ?', [normalizedEmail]);
  if (rows.length) return { table: 'ca_users', user: rows[0], passwordField: 'password', idField: 'id' };

  // Check tbusers (company users)
  [rows] = await db.query('SELECT * FROM tbusers WHERE LOWER(email) = ? OR LOWER(username) = ?', [normalizedEmail, normalizedEmail]);
  if (rows.length) return { table: 'tbusers', user: rows[0], passwordField: 'password', idField: 'id' };

  return null;
}

// POST /forgot -> send 4-digit OTP if user exists
router.post('/forgot', forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

  try {
    const found = await findUserByEmail(email);
    // Generic response regardless of whether account exists to prevent account enumeration
    if (!found) {
      return res.status(200).json({ success: true, message: 'If an account exists, a reset code has been sent' });
    }

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpHash = bcrypt.hashSync(otp, 10);

    const payload = {
      type: 'otp_token',
      table: found.table,
      id: found.user[found.idField],
      email: found.user.email || found.user.username || '',
      otpHash,
    };

    const otpToken = signToken(payload, { expiresIn: '15m' });

    const subject = 'Your Password Reset Verification Code';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
        <h2 style="color: #6D30D4; text-align: center; margin-bottom: 20px;">Password Reset Request</h2>
        <p style="font-size: 16px; color: #333;">Hello,</p>
        <p style="font-size: 16px; color: #333;">We received a request to reset your password. Please use the following verification code to proceed:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; color: #6D30D4; letter-spacing: 5px; padding: 10px 20px; background-color: #f4f0fc; border-radius: 8px;">${otp}</span>
        </div>
        <p style="font-size: 16px; color: #333;">This code is valid for <strong>15 minutes</strong>. For your security, please do not share this code with anyone.</p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;" />
        <p style="font-size: 14px; color: #888; text-align: center;">If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
      </div>
    `;

    try {
      await sendMail({ to: payload.email || email, subject, html, text: `Your OTP is: ${otp}` });
    } catch (mailErr) {
      console.warn('Mail send failed (SMTP):', mailErr.message);
    }

    return res.json({ success: true, message: 'If an account exists, a reset code has been sent', otpToken });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /verify-otp -> verify 4-digit OTP
router.post('/verify-otp', async (req, res) => {
  const { otpToken, otp } = req.body;
  if (!otpToken || !otp) return res.status(400).json({ success: false, message: 'Token and OTP are required' });

  try {
    const decoded = verifyToken(otpToken);
    if (!decoded || decoded.type !== 'otp_token' || !decoded.otpHash) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }

    const isValid = await bcrypt.compare(String(otp).trim(), decoded.otpHash);
    if (!isValid) return res.status(400).json({ success: false, message: 'Invalid OTP code' });

    const resetPayload = {
      type: 'reset_token',
      table: decoded.table,
      id: decoded.id,
    };

    const resetToken = signToken(resetPayload, { expiresIn: '15m' });

    return res.json({ success: true, resetToken });
  } catch (err) {
    console.error('Verify OTP error:', err);
    if (err.name === 'TokenExpiredError') return res.status(400).json({ success: false, message: 'Token expired' });
    return res.status(400).json({ success: false, message: 'Invalid token' });
  }
});

// POST /reset -> accept token + newPassword
router.post('/reset', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ success: false, message: 'Token and newPassword are required' });

  const trimmedPassword = String(newPassword).trim();
  if (trimmedPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  try {
    const decoded = verifyToken(token);
    if (!decoded || !decoded.table || !decoded.id || decoded.type !== 'reset_token') {
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }

    const table = decoded.table;
    const id = decoded.id;

    // Security whitelist of allowed tables
    const allowedTables = ['tbadmin', 'tbemployees', 'tbca', 'tbcaemployees', 'ca_users', 'tbusers'];
    if (!allowedTables.includes(table)) {
      return res.status(400).json({ success: false, message: 'Invalid target user' });
    }

    const hashed = await bcrypt.hash(trimmedPassword, 10);

    let passwordField = 'password';
    let idColumn = 'id';
    if (table === 'tbca') {
      passwordField = 'fdpassword';
      idColumn = 'fdSiNo';
    }

    const query = `UPDATE ${table} SET ${passwordField} = ? WHERE ${idColumn} = ?`;
    await db.query(query, [hashed, id]);

    // Also sync updated password to central users table
    await db.query('UPDATE users SET password_hash = ? WHERE source_table = ? AND source_id = ?', [hashed, table, id]).catch(() => {});

    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    if (err.name === 'TokenExpiredError') return res.status(400).json({ success: false, message: 'Token expired' });
    return res.status(400).json({ success: false, message: 'Invalid token' });
  }
});

module.exports = router;
