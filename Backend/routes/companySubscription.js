const express = require('express');
const router = express.Router();
const db = require('../db');

// Get subscription / trial status for a company
router.get('/status/:companyId', async (req, res) => {
  const { companyId } = req.params;
  const { user_type, user_id } = req.query;

  if (!companyId) {
    return res.status(400).json({ success: false, message: 'companyId is required' });
  }

  try {
    // 1. Accountant Role: 1 Year (365 Days) Free Access on all created companies
    if (user_type === 'accountant' || user_type === 'ca' || user_type === 'new_ca') {
      return res.json({
        success: true,
        data: {
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
        }
      });
    }

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
      if (user_id) {
        const [userRows] = await db.query(
          'SELECT accountant_id FROM tbusers WHERE id = ? LIMIT 1',
          [user_id]
        ).catch(() => [[]]);
        if (userRows && userRows.length > 0 && userRows[0].accountant_id) {
          return true;
        }
      }

      return false;
    })();

    // 2. Twist Rule: If this is an Accountant's Company accessed by a Normal User (Client staff)
    // -> 0 Days Trial! They must have a REAL VERIFIED PAID subscription to work.
    if (isAccountantManaged && (user_type === 'company_user' || !user_type || user_type === 'user')) {
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
         ORDER BY cs.end_date DESC
         LIMIT 1`,
        [companyId]
      ).catch(() => [[]]);

      if (!paidRows || !paidRows.length) {
        // No verified paid plan found -> Direct Paywall! 0-day trial!
        return res.json({
          success: true,
          data: {
            hasSubscription: false,
            isTrial: false,
            status: 'expired',
            daysRemaining: 0,
            isExpired: true,
            isAccountantManaged: true,
            message: 'This company is managed by an Accountant. To access and work on this company, please purchase a subscription plan.'
          }
        });
      }

      // Paid plan is verified and active for this company
      const p = paidRows[0];
      const now = new Date();
      const end = new Date(p.end_date);
      const msDiff = end.getTime() - now.getTime();
      const daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
      const isExpired = daysRemaining < 0 || p.status === 'expired' || p.status === 'cancelled';

      return res.json({
        success: true,
        data: {
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
        }
      });
    }

    // 3. Regular Website User / Owner (Existing Flow - Completely Untouched)
    // Gets standard trial (e.g. 14 days) or whatever is in company_subscriptions
    const [rows] = await db.query(
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
    );

    if (!rows.length) {
      return res.status(200).json({
        success: true,
        data: {
          hasSubscription: false,
          isTrial: false,
          status: 'expired',
          daysRemaining: 0,
          isExpired: true,
        },
      });
    }

    const s = rows[0];
    const now = new Date();
    const end = new Date(s.end_date);
    const msDiff = end.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
    const isExpired =
      daysRemaining < 0 || s.status === 'expired' || s.status === 'cancelled';

    return res.json({
      success: true,
      data: {
        id: s.id,
        plan: s.plan,
        isTrial: !!s.is_trial,
        status: isExpired ? 'expired' : s.status,
        startDate: s.start_date,
        endDate: s.end_date,
        daysRemaining: isExpired ? 0 : Math.max(daysRemaining, 0),
        isExpired,
        hasSubscription: true,
      },
    });
  } catch (err) {
    console.error('Error fetching company subscription status:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;

