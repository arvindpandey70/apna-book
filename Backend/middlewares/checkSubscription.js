const db = require('../db');
const { verifyToken } = require('../utils/jwt');

// Paths or prefixes that should be allowed even if subscription is expired
const ALLOWED_PREFIXES = [
  '/api/login',
  '/api/SignUp',
  '/api/company-subscription', // status check must remain accessible
  '/api/subscriptions', // plans listing
  '/api/dashboard', // allow dashboard-data and related read-only dashboard endpoints
  '/api/dashboard-data',
  '/api/companies-by-employee',
  '/api/companies-by-ca',
  '/uploads',
  '/api/payments',
  '/api/admin',
  '/api/traders',
  '/api/adminUser',
  '/api/accountant',
];

function startsWithAllowed(path) {
  return ALLOWED_PREFIXES.some(p => path === p || path.startsWith(p + '/') || path.startsWith(p));
}

module.exports = async function checkSubscription(req, res, next) {
  try {
    // Allow public/allowed prefixes first
    if (startsWithAllowed(req.path) || startsWithAllowed(req.originalUrl)) {
      return next();
    }

    // Allow all GET requests (read-only) so UI can display lists/reports
    if (String(req.method).toUpperCase() === 'GET') {
      return next();
    }

    // Inspect user identity if token or header present
    let userRole = null;
    let userId = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = verifyToken(token);
        userRole = decoded.role || decoded.userType;
        userId = decoded.id || decoded.userId;
      } catch (e) {
        // ignore token decode errors
      }
    }

    // 1. Accountants have 1 Year (365 days) free partner access on all companies
    if (
      userRole === 'accountant' ||
      userRole === 'ca' ||
      userRole === 'new_ca' ||
      req.headers['x-user-type'] === 'accountant'
    ) {
      return next();
    }

    // Try to find company id in common places
    const companyId =
      (req.query && (req.query.company_id || req.query.companyId)) ||
      (req.body && (req.body.companyId || req.body.company_id)) ||
      req.headers['x-company-id'] || null;

    // If no companyId found, allow the request (cannot enforce)
    if (!companyId) return next();

    // Helper to check if this company is accountant-managed
    const isAccountantManaged = await (async () => {
      // 1. Check ca_company table
      const [caRows] = await db.query(
        'SELECT 1 FROM ca_company WHERE company_id = ? LIMIT 1',
        [companyId]
      ).catch(() => [[]]);
      if (caRows && caRows.length > 0) return true;

      // 2. Check tbcompanies table attributes
      const [compRows] = await db.query(
        'SELECT fdAccountType, fdAccountantName, employee_id FROM tbcompanies WHERE id = ?',
        [companyId]
      ).catch(() => [[]]);
      if (compRows && compRows.length > 0) {
        const c = compRows[0];
        if (
          c.fdAccountType === 'accountant' ||
          (c.fdAccountantName && c.fdAccountantName.trim() !== '') ||
          c.employee_id === 0 ||
          c.employee_id === null
        ) {
          return true;
        }
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

    // 2. Accountant-Allotted Normal User: 0-day trial! Must have active REAL VERIFIED PAID subscription
    if (isAccountantManaged) {
      const [paidRows] = await db.query(
        `SELECT cs.id, cs.plan, cs.is_trial, cs.status, cs.start_date, cs.end_date, cs.payment_id
         FROM company_subscriptions cs
         LEFT JOIN payments p ON cs.payment_id = p.id OR p.company_id = cs.company_id
         WHERE cs.company_id = ?
           AND cs.is_trial = 0
           AND cs.status = 'active'
           AND cs.plan != 'accountant_partner'
           AND cs.end_date > NOW()
           AND (
             (cs.payment_id IS NOT NULL AND cs.payment_id != '' AND cs.payment_id != '0')
             OR (p.id IS NOT NULL AND p.status = 'success')
           )
         ORDER BY cs.end_date DESC LIMIT 1`,
        [companyId]
      ).catch(() => [[]]);

      if (!paidRows || paidRows.length === 0) {
        return res.status(403).json({
          success: false,
          isAccountantManaged: true,
          message: 'This company is managed by an Accountant. An active paid subscription plan is required to perform actions.'
        });
      }
      return next();
    }

    // 3. Regular Direct Website Signup (14-Day Free Trial or Standard Plan)
    const [rows] = await db.query(
      `SELECT id, plan, is_trial, status, start_date, end_date
       FROM company_subscriptions
       WHERE company_id = ?
       ORDER BY end_date DESC
       LIMIT 1`,
      [companyId]
    ).catch(() => [ [] ]);

    if (!rows || rows.length === 0) return next();

    const s = rows[0];
    const now = new Date();
    const end = new Date(s.end_date);
    const msDiff = end.getTime() - now.getTime();
    const isExpired = msDiff < 0 || s.status === 'expired' || s.status === 'cancelled';

    if (isExpired) {
      return res.status(403).json({
        success: false,
        message: s.is_trial ? 'Free trial expired. Please subscribe.' : 'Subscription expired. Please renew.'
      });
    }

    return next();
  } catch (err) {
    console.error('Error in checkSubscription middleware:', err);
    // Fail open: if middleware errors, allow request so we don't block users accidentally
    return next();
  }
};
