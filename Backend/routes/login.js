const express = require('express');
const router = express.Router();
const db = require('../db'); // Promise-based MySQL pool
const bcrypt = require('bcryptjs');
const { signToken } = require('../utils/jwt');
const { loginLimiter } = require('../middlewares/rateLimiter');

// POST /api/login
router.post('/', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  try {
    const emailTrimmed = email.trim();
    const normalizedEmail = emailTrimmed.toLowerCase();
    const passwordTrimmed = password.trim();
    // =========================================================================
    // 1. UNIFIED ARCHITECTURE: Authenticate via central `users` table
    // =========================================================================
    let authUsers = [];
    try {
      const [rows] = await db.query(
        'SELECT id, email, password_hash, role, source_table, source_id, status FROM users WHERE LOWER(email) = ?',
        [normalizedEmail]
      );
      authUsers = rows;
    } catch (err) {
      authUsers = [];
    }

    if (authUsers.length > 0) {
      const authUser = authUsers[0];
      const match = await bcrypt.compare(passwordTrimmed, authUser.password_hash);
      if (match) {
        // Exact credential match found via unified identity!
      const role = authUser.role;
      const supplier = (role === 'ca' || role === 'new_ca') ? 'ca' : 'employee';
      let companyRow = null;
      let assignedCompanies = [];
      let profileUser = {};
      let employeeId = null;

      if (role === 'employee') {
        const [empRows] = await db.query('SELECT * FROM tbemployees WHERE id = ?', [authUser.source_id]);
        profileUser = empRows[0] || {};
        employeeId = authUser.source_id;

        const [companies] = await db.query(
          'SELECT * FROM tbcompanies WHERE employee_id = ? ORDER BY id ASC',
          [authUser.source_id]
        );
        companyRow = companies.length > 0 ? companies[0] : null;
        assignedCompanies = companies;
      } else if (role === 'ca') {
        const [caRows] = await db.query('SELECT * FROM tbca WHERE fdSiNo = ?', [authUser.source_id]);
        profileUser = caRows[0] || {};
        employeeId = authUser.source_id;

        const [companies] = await db.query(
          `SELECT c.* FROM tbcompanies c
           LEFT JOIN ca_company cc ON c.id = cc.company_id
           WHERE (c.fdAccountantName = ? AND c.fdAccountantName IS NOT NULL AND c.fdAccountantName != '')
              OR cc.ca_id = ?
           ORDER BY c.id ASC`,
          [profileUser.fdname || '', authUser.source_id]
        );
        companyRow = companies.length > 0 ? companies[0] : null;
        assignedCompanies = companies;
        await db.query('UPDATE tbca SET fdlast_login = NOW() WHERE fdSiNo = ?', [authUser.source_id]).catch(() => {});
      } else if (role === 'new_ca') {
        const [caRows] = await db.query('SELECT * FROM ca_users WHERE id = ?', [authUser.source_id]);
        profileUser = caRows[0] || {};
        employeeId = authUser.source_id;

        const [comps] = await db.query(
          `SELECT c.* FROM tbcompanies c
           INNER JOIN ca_company cc ON c.id = cc.company_id
           WHERE cc.ca_id = ?
           ORDER BY c.id ASC`,
          [authUser.source_id]
        );
        companyRow = comps.length > 0 ? comps[0] : null;
        assignedCompanies = comps;
        await db.query('UPDATE ca_users SET updated_at = NOW() WHERE id = ?', [authUser.source_id]).catch(() => {});
      } else if (role === 'ca_employee') {
        const [caEmpRows] = await db.query('SELECT * FROM tbcaemployees WHERE id = ?', [authUser.source_id]);
        profileUser = caEmpRows[0] || {};
        employeeId = authUser.source_id;

        const [comps] = await db.query(
          `SELECT c.* FROM tbcompanies c
           INNER JOIN tbcaemployeecompanies ec ON c.id = ec.company_id
           WHERE ec.ca_employee_id = ?
           ORDER BY c.id ASC`,
          [authUser.source_id]
        );
        companyRow = comps.length > 0 ? comps[0] : null;
        assignedCompanies = comps;
      } else if (role === 'company_user') {
        const [compUserRows] = await db.query('SELECT * FROM tbusers WHERE id = ?', [authUser.source_id]);
        profileUser = compUserRows[0] || {};
        const [[company]] = await db.query('SELECT * FROM tbcompanies WHERE id = ?', [profileUser.company_id]);
        companyRow = company || null;
        assignedCompanies = company ? [company] : [];
        employeeId = profileUser.employee_id;
      } else if (role === 'super_admin') {
        const [admRows] = await db.query('SELECT * FROM tbadmin WHERE id = ?', [authUser.source_id]);
        profileUser = admRows[0] || {};
      }

      const companyId = companyRow?.id || null;
      const hasCompany = !!companyRow;

      // Subscription / trial info
      let subscriptionInfo = null;
      if (companyId) {
        const [subsRows] = await db.query(
          `SELECT id, plan, is_trial, status, end_date
           FROM company_subscriptions
           WHERE company_id = ?
           ORDER BY id DESC LIMIT 1`,
          [companyId]
        );
        if (subsRows.length > 0) {
          const sub = subsRows[0];
          const now = new Date();
          const endDate = sub.end_date ? new Date(sub.end_date) : null;
          const daysRemaining = endDate ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;
          subscriptionInfo = {
            id: sub.id,
            plan: sub.plan,
            isTrial: Boolean(sub.is_trial),
            status: sub.status,
            endDate,
            daysRemaining,
            isExpired: daysRemaining < 0 || sub.status === 'expired',
            hasSubscription: sub.status === 'active' || (sub.is_trial && daysRemaining >= 0)
          };
        }
      }

      const token = signToken({
        id: authUser.source_id,
        userId: authUser.id,
        email: authUser.email,
        role: authUser.role,
        userType: authUser.role,
        sourceId: authUser.source_id
      });

      const profileName = (
        profileUser.firstName ? `${profileUser.firstName} ${profileUser.lastName || ''}`.trim() :
        profileUser.name || profileUser.fdname || profileUser.username || 'User'
      );

      return res.json({
        success: true,
        token,
        role: authUser.role,
        userType: authUser.role,
        supplier,
        userid: 'employee',
        user_id: authUser.source_id,
        employee_id: employeeId,
        companyId,
        hasCompany,
        companyInfo: companyRow || null,
        subscription: subscriptionInfo,
        companies: assignedCompanies,
        user: {
          id: authUser.source_id,
          userId: authUser.id,
          name: profileName,
          email: authUser.email,
          firstName: profileUser.firstName || profileUser.name || profileUser.fdname || profileName,
          lastName: profileUser.lastName || '',
          pan: profileUser.pan || profileUser.pan_number || '',
          phoneNumber: profileUser.phoneNumber || profileUser.phone || profileUser.fdphone || '',
          userLimit: profileUser.userLimit || 1,
          address: profileUser.address || '',
          companyName: companyRow ? companyRow.name : '',
          userType: authUser.role,
        }
      });
      }
    }

    // =========================================================================
    // 2. BACKWARD-COMPATIBLE FALLBACK: Legacy search
    // =========================================================================
    // Define login sources
    const roleTables = [
      {
        table: 'tbemployees',
        role: 'employee',
        supplier: 'employee',
        passwordField: 'password',
        idField: 'id',
        nameField: (u) => `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'User',
      },
      {
        table: 'tbca',
        role: 'ca',
        supplier: 'ca',
        passwordField: 'fdpassword',
        idField: 'fdSiNo',
        nameField: (u) => u.fdname || 'CA',
      },
      {
        table: 'tbcaemployees',
        role: 'ca_employee',
        supplier: 'employee',
        passwordField: 'password',
        idField: 'id',
        nameField: (u) => u.name || 'CA Employee',
      },
      {
        table: 'ca_users',
        role: 'new_ca',
        supplier: 'ca',
        passwordField: 'password',
        idField: 'id',
        nameField: (u) => u.name || 'CA',
      }
    ];

    // 1. Search in main role tables (employees, ca, ca_employees, new_ca)
    const requestedRole = req.body.role || req.body.userType;
    let tablesToSearch = [...roleTables];
    if (requestedRole) {
      const normRole = String(requestedRole).toLowerCase();
      tablesToSearch.sort((a, b) => {
        const aMatches = a.role === normRole || (normRole.includes('ca') && (a.role === 'ca' || a.role === 'new_ca'));
        const bMatches = b.role === normRole || (normRole.includes('ca') && (b.role === 'ca' || b.role === 'new_ca'));
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return 0;
      });
    }

    for (const { table, role, supplier, passwordField, idField, nameField } of tablesToSearch) {
      const [rows] = await db.query(
        `SELECT * FROM ${table} WHERE LOWER(email) = ?`,
        [normalizedEmail]
      );
      if (!rows.length) continue;

      for (const user of rows) {
        if (!user[passwordField]) {
          continue;
        }

        const match = await bcrypt.compare(passwordTrimmed, user[passwordField]);
        if (!match) {
          // Continue searching other potential matches / tables
          continue;
        }

        // Exact credential match found!
        // Auto-heal / synchronize central users table
        await db.query(`
          INSERT INTO users (email, password_hash, role, source_table, source_id, status)
          VALUES (?, ?, ?, ?, ?, 'active')
          ON DUPLICATE KEY UPDATE
            password_hash = VALUES(password_hash),
            role = VALUES(role),
            source_table = VALUES(source_table),
            source_id = VALUES(source_id),
            status = 'active'
        `, [normalizedEmail, user[passwordField], role, table, user[idField]]).catch(() => {});

        let employeeId = user[idField];
        let companyRow = null;
        let assignedCompanies = [];

        if (role === 'employee') {
          // Critical Security Fix: strictly match employee_id to the user's primary key
          // NEVER match "OR id = user[idField]", which hijacked existing companies!
          const [companies] = await db.query(
            'SELECT * FROM tbcompanies WHERE employee_id = ? ORDER BY id ASC',
            [user[idField]]
          );
          companyRow = companies.length > 0 ? companies[0] : null;
          assignedCompanies = companies;
          user.assignedCompanies = companies;
        } else if (role === 'ca') {
          const [companies] = await db.query(
            `SELECT c.* FROM tbcompanies c
             LEFT JOIN ca_company cc ON c.id = cc.company_id
             WHERE (c.fdAccountantName = ? AND c.fdAccountantName IS NOT NULL AND c.fdAccountantName != '')
                OR cc.ca_id = ?
             ORDER BY c.id ASC`,
            [user['fdname'], user[idField]]
          );
          companyRow = companies.length > 0 ? companies[0] : null;
          assignedCompanies = companies;
          user.assignedCompanies = companies;
        } else if (role === 'ca_employee') {
          const [comps] = await db.query(
            `SELECT c.* FROM tbcompanies c
             INNER JOIN tbcaemployeecompanies ec ON c.id = ec.company_id
             WHERE ec.ca_employee_id = ?
             ORDER BY c.id ASC`,
            [user[idField]]
          );
          companyRow = comps.length > 0 ? comps[0] : null;
          assignedCompanies = comps;
          user.assignedCompanies = comps;
        } else if (role === 'new_ca') {
          const [comps] = await db.query(
            `SELECT c.* FROM tbcompanies c
             INNER JOIN ca_company cc ON c.id = cc.company_id
             WHERE cc.ca_id = ?
             ORDER BY c.id ASC`,
            [user[idField]]
          );
          companyRow = comps.length > 0 ? comps[0] : null;
          assignedCompanies = comps;
          user.assignedCompanies = comps;
        }

        const companyId = companyRow?.id || null;
        const hasCompany = !!companyRow;
        const userid = 'employee';

        // --- Fetch subscription / trial info for this company (if any) ---
        let subscriptionInfo = null;
        if (companyId) {
          const [subsRows] = await db.query(
            `
              SELECT 
                id,
                plan,
                is_trial,
                status,
                start_date,
                end_date
              FROM company_subscriptions
              WHERE company_id = ?
              ORDER BY end_date DESC
              LIMIT 1
            `,
            [companyId]
          ).catch(() => [[]]);

          if (subsRows && subsRows.length > 0) {
            const s = subsRows[0];
            const now = new Date();
            const end = new Date(s.end_date);
            const msDiff = end.getTime() - now.getTime();
            const daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24));

            const isExpired = msDiff < 0 || s.status === 'expired' || s.status === 'cancelled';

            subscriptionInfo = {
              id: s.id,
              plan: s.plan,
              isTrial: !!s.is_trial,
              status: isExpired ? 'expired' : s.status,
              startDate: s.start_date,
              endDate: s.end_date,
              daysRemaining: isExpired ? 0 : Math.max(daysRemaining, 0),
              isExpired,
            };
          }
        }

        const token = signToken({
          id: user[idField],
          email: user.email,
          role,
          userType: role
        });

        // Update last login time if applicable
        if (role === 'ca') {
          await db.query('UPDATE tbca SET fdlast_login = NOW() WHERE fdSiNo = ?', [user[idField]]).catch(() => {});
        } else if (role === 'new_ca') {
          await db.query('UPDATE ca_users SET updated_at = NOW() WHERE id = ?', [user[idField]]).catch(() => {});
        }

        return res.json({
          success: true,
          token,
          role,
          userType: role,
          supplier,
          userid,
          user_id: user[idField],
          companyId,
          hasCompany,
          companyInfo: companyRow || null,
          subscription: subscriptionInfo,
          companies: assignedCompanies,
          employee_id: employeeId,
          user: {
            id: user[idField],
            name: nameField(user),
            email: user.email,
            firstName: user.firstName || user.name || nameField(user),
            lastName: user.lastName || '',
            pan: user.pan || '',
            phoneNumber: user.phoneNumber || user.phone || user.fdphone || '',
            userLimit: user.userLimit || 1,
            address: user.address || '',
            companyName: companyRow ? companyRow.name : '',
            userType: role,
          }
        });
      }
    }

    // 2. Search in tbusers for direct company access login (Access Control Restricted)
    const [userRows] = await db.query(
      'SELECT * FROM tbusers WHERE LOWER(username) = ? OR LOWER(email) = ?',
      [normalizedEmail, normalizedEmail]
    );

    if (userRows.length > 0) {
      for (const userRow of userRows) {
        if (!userRow.password) continue;
        const match = await bcrypt.compare(passwordTrimmed, userRow.password);
        if (match) {
          const [[company]] = await db.query('SELECT * FROM tbcompanies WHERE id = ?', [userRow.company_id]);
          const companyRow = company || null;

          if (!companyRow) continue;

          const token = signToken({
            id: userRow.id,
            email: userRow.email || userRow.username,
            role: 'company_user',
            userType: 'company_user'
          });

          return res.json({
            success: true,
            token,
            role: 'company_user',
            userType: 'company_user',
            supplier: 'employee',
            userid: 'employee',
            user_id: userRow.id,
            companyId: userRow.company_id,
            hasCompany: true,
            companyInfo: companyRow,
            companies: [companyRow],
            employee_id: userRow.employee_id,
            user: {
              id: userRow.id,
              name: userRow.username,
              email: userRow.email || userRow.username,
              firstName: userRow.username,
              lastName: '',
              pan: '',
              phoneNumber: userRow.phone || '',
              address: userRow.address || '',
              userLimit: 1,
              companyName: companyRow.name,
              userType: 'company_user',
            }
          });
        }
      }
    }

    // No matching user credentials found in any table
    return res.status(401).json({ success: false, message: 'Invalid email or password' });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/global-verify-company-access', async (req, res) => {
  const { employee_id, username, password } = req.body;

  if (!employee_id || !username || !password) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    const [companies] = await db.query('SELECT id, name FROM tbcompanies WHERE employee_id = ?', [employee_id]);

    if (companies.length === 0) {
      return res.status(404).json({ success: false, message: 'No companies found for this account' });
    }

    const companyIds = companies.map(c => c.id);

    const [users] = await db.query(
      'SELECT * FROM tbusers WHERE company_id IN (?) AND (LOWER(username) = ? OR LOWER(email) = ?)',
      [companyIds, username.trim().toLowerCase(), username.trim().toLowerCase()]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    for (const user of users) {
      if (!user.password) continue;
      const match = await bcrypt.compare(password.trim(), user.password);
      if (match) {
        const matchedCompany = companies.find(c => c.id === user.company_id);
        return res.json({
          success: true,
          message: 'Access granted',
          company_id: user.company_id,
          companyName: matchedCompany ? matchedCompany.name : 'Unknown'
        });
      }
    }

    res.status(401).json({ success: false, message: 'Invalid username or password' });
  } catch (err) {
    console.error('Error in global company verification:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/verify-company-access', async (req, res) => {
  const { company_id, username, password } = req.body;

  if (!company_id || !username || !password) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM tbusers WHERE company_id = ? AND (LOWER(username) = ? OR LOWER(email) = ?)',
      [company_id, username.trim().toLowerCase(), username.trim().toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const user = rows[0];
    if (!user.password) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const match = await bcrypt.compare(password.trim(), user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    res.json({ success: true, message: 'Access granted' });
  } catch (err) {
    console.error('Error verifying company access:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
