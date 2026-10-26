const db = require('../db');

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

    // Try to find company id in common places
    const companyId =
      (req.query && (req.query.company_id || req.query.companyId)) ||
      (req.body && (req.body.companyId || req.body.company_id)) ||
      req.headers['x-company-id'] || null;

    // If no companyId found, allow the request (cannot enforce)
    if (!companyId) return next();

    // Check company_subscriptions table for latest record
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
