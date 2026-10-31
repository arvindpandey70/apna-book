const express = require('express');
const router = express.Router();
const db = require('../db'); // Promise-based MySQL pool
const bcrypt = require('bcryptjs');
const { signToken } = require('../utils/jwt');
const { loginLimiter } = require('../middlewares/rateLimiter');

async function getSubscriptionForUser(companyRow, role, userId) {
  // 1. Accountant Role: 1 Year (365 Days) Free Partner Access
  if (role === 'accountant' || role === 'ca' || role === 'new_ca') {
    return {
      id: 0,
      plan: 'Accountant Partner (Free 1-Year)',
      isTrial: false,
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      daysRemaining: 365,
      isExpired: false,
      hasSubscription: true,
      isAccountant: true
    };
  }

  if (!companyRow || !companyRow.id) return null;
  const companyId = companyRow.id;

  // Helper to check if this company is accountant-managed
  const isAccountantManaged = await (async () => {
    // 1. Check ca_company table
    const [caRows] = await db.query(
      'SELECT 1 FROM ca_company WHERE company_id = ? LIMIT 1',
      [companyId]
    ).catch(() => [[]]);
    if (caRows && caRows.length > 0) return true;

    // 2. Check tbcompanies table attributes
    if (
      companyRow.fdAccountType === 'accountant' ||
      (companyRow.fdAccountantName && companyRow.fdAccountantName.trim() !== '') ||
      companyRow.employee_id === 0 ||
      companyRow.employee_id === null
    ) {
      return true;
    }

    // 3. Check if company has users provisioned with accountant_id
    const [uRows] = await db.query(
      'SELECT 1 FROM tbusers WHERE company_id = ? AND accountant_id IS NOT NULL AND accountant_id > 0 LIMIT 1',
      [companyId]
    ).catch(() => [[]]);
    if (uRows && uRows.length > 0) return true;

    // 4. Check if current user is linked to an accountant
    if (userId) {
      const [userRows] = await db.query(
        'SELECT accountant_id FROM tbusers WHERE id = ? LIMIT 1',
        [userId]
      ).catch(() => [[]]);
      if (userRows && userRows.length > 0 && userRows[0].accountant_id) {
        return true;
      }
    }

    return false;
  })();

  // 2. Accountant-Allotted User: 0-Days Trial. Must have active REAL VERIFIED PAID subscription
  if (isAccountantManaged && (role === 'company_user' || !role || role === 'user')) {
    const [paidRows] = await db.query(
      `SELECT cs.id, cs.plan, cs.is_trial, cs.status, cs.start_date, cs.end_date, cs.payment_id
       FROM company_subscriptions cs
       LEFT JOIN payments p ON cs.payment_id = p.id OR p.company_id = cs.company_id
       WHERE cs.company_id = ?
         AND cs.is_trial = 0
         AND cs.status = 'active'
         AND cs.plan != 'accountant_partner'
         AND cs.end_date > NOW()
       ORDER BY cs.end_date DESC LIMIT 1`,
      [companyId]
    ).catch(() => [[]]);

    if (!paidRows || paidRows.length === 0) {
      return {
        hasSubscription: false,
        isTrial: false,
        status: 'expired',
        daysRemaining: 0,
        isExpired: true,
        isAccountantManaged: true,
        message: 'This company is managed by an Accountant. To access and work on this company, please purchase a subscription plan.'
      };
    }

    const p = paidRows[0];
    const now = new Date();
    const end = new Date(p.end_date);
    const msDiff = end.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
    const isExpired = daysRemaining < 0 || p.status === 'expired' || p.status === 'cancelled';
    return {
      id: p.id,
      plan: p.plan,
      isTrial: false,
      status: isExpired ? 'expired' : p.status,
      startDate: p.start_date,
      endDate: p.end_date,
      daysRemaining: isExpired ? 0 : Math.max(daysRemaining, 0),
      isExpired,
      hasSubscription: true,
      isAccountantManaged: true
    };
  }

  // 3. Regular Direct Website Signup (14-Day Free Trial or Standard Plan)
  const [subsRows] = await db.query(
    `SELECT id, plan, is_trial, status, start_date, end_date
     FROM company_subscriptions
     WHERE company_id = ?
     ORDER BY end_date DESC LIMIT 1`,
    [companyId]
  ).catch(() => [[]]);

  if (!subsRows || subsRows.length === 0) {
    return {
      hasSubscription: false,
      isTrial: false,
      status: 'expired',
      daysRemaining: 0,
      isExpired: true
    };
  }

  const s = subsRows[0];
  const now = new Date();
  const end = new Date(s.end_date);
  const msDiff = end.getTime() - now.getTime();
  const daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
  const isExpired = daysRemaining < 0 || s.status === 'expired' || s.status === 'cancelled';
  return {
    id: s.id,
    plan: s.plan,
    isTrial: !!s.is_trial,
    status: isExpired ? 'expired' : s.status,
    startDate: s.start_date,
    endDate: s.end_date,
    daysRemaining: isExpired ? 0 : Math.max(daysRemaining, 0),
    isExpired,
    hasSubscription: true
  };
}

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
      const supplier = (role === 'new_ca' || role === 'ca') ? 'ca' : (role === 'accountant' ? 'accountant' : 'employee');
      let companyRow = null;
      let assignedCompanies = [];
      let profileUser = {};
      let employeeId = null;

      if (role === 'employee') {
        const [empRows] = await db.query('SELECT * FROM tbemployees WHERE id = ?', [authUser.source_id]);
        profileUser = empRows[0] || {};
        employeeId = authUser.source_id;

        const [companies] = await db.query(
          `SELECT * FROM tbcompanies 
           WHERE employee_id = ? 
              OR ((employee_id IS NULL OR employee_id = 0) AND LOWER(TRIM(email)) = LOWER(TRIM(?)))
           ORDER BY id ASC`,
          [authUser.source_id, authUser.email]
        );
        // Auto-heal any orphaned company
        for (const comp of companies) {
          if (!comp.employee_id || comp.employee_id === 0) {
            comp.employee_id = authUser.source_id;
            await db.query('UPDATE tbcompanies SET employee_id = ? WHERE id = ?', [authUser.source_id, comp.id]).catch(() => {});
          }
        }
        companyRow = companies.length > 0 ? companies[0] : null;
        assignedCompanies = companies;
      } else if (role === 'ca' || role === 'accountant') {
        const [caRows] = await db.query('SELECT * FROM tbca WHERE fdSiNo = ?', [authUser.source_id]);
        profileUser = caRows[0] || {};
        if (profileUser.fdstatus === 'suspended') {
          return res.status(403).json({ success: false, message: 'Account is suspended. Please contact Admin.' });
        }
        employeeId = authUser.source_id;

        const [companies] = await db.query(
          `SELECT DISTINCT c.* FROM tbcompanies c
           LEFT JOIN ca_company cc ON c.id = cc.company_id
           LEFT JOIN tbusers u ON c.id = u.company_id AND u.accountant_id = ?
           WHERE (c.fdAccountantName = ? AND c.fdAccountantName IS NOT NULL AND c.fdAccountantName != '')
              OR cc.ca_id = ?
              OR u.id IS NOT NULL
           ORDER BY c.name ASC`,
          [authUser.source_id, profileUser.fdname || '', authUser.source_id]
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
      const subscriptionInfo = await getSubscriptionForUser(companyRow, authUser.role, authUser.source_id);

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
        role: 'accountant',
        supplier: 'accountant',
        passwordField: 'fdpassword',
        idField: 'fdSiNo',
        nameField: (u) => u.fdname || 'Accountant',
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
          const [companies] = await db.query(
            `SELECT * FROM tbcompanies 
             WHERE employee_id = ? 
                OR ((employee_id IS NULL OR employee_id = 0) AND LOWER(TRIM(email)) = LOWER(TRIM(?)))
             ORDER BY id ASC`,
            [user[idField], user.email]
          );
          // Auto-heal any orphaned company
          for (const comp of companies) {
            if (!comp.employee_id || comp.employee_id === 0) {
              comp.employee_id = user[idField];
              await db.query('UPDATE tbcompanies SET employee_id = ? WHERE id = ?', [user[idField], comp.id]).catch(() => {});
            }
          }
          companyRow = companies.length > 0 ? companies[0] : null;
          assignedCompanies = companies;
          user.assignedCompanies = companies;
        } else if (role === 'ca' || role === 'accountant') {
          if (user.fdstatus === 'suspended') {
            return res.status(403).json({ success: false, message: 'Account is suspended. Please contact Admin.' });
          }
          const [companies] = await db.query(
            `SELECT DISTINCT c.* FROM tbcompanies c
             LEFT JOIN ca_company cc ON c.id = cc.company_id
             LEFT JOIN tbusers u ON c.id = u.company_id AND u.accountant_id = ?
             WHERE (c.fdAccountantName = ? AND c.fdAccountantName IS NOT NULL AND c.fdAccountantName != '')
                OR cc.ca_id = ?
                OR u.id IS NOT NULL
             ORDER BY c.name ASC`,
            [user[idField], user['fdname'] || '', user[idField]]
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
        const subscriptionInfo = await getSubscriptionForUser(companyRow, role, user[idField]);

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
          if (userRow.status === 'suspended') {
            return res.status(403).json({ success: false, message: 'User account is suspended. Please contact your accountant or administrator.' });
          }
          const [[company]] = await db.query('SELECT * FROM tbcompanies WHERE id = ?', [userRow.company_id]);
          const companyRow = company || null;

          if (!companyRow) continue;

          const token = signToken({
            id: userRow.id,
            email: userRow.email || userRow.username,
            role: 'company_user',
            userType: 'company_user',
            companyId: userRow.company_id
          });

          const subscriptionInfo = await getSubscriptionForUser(companyRow, 'company_user', userRow.id);

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
            subscription: subscriptionInfo,
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
