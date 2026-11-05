const db = require('../db');

/**
 * Checks the complete subscription and free trial status for an accountant.
 * Access Priority:
 * 1. Active Paid Subscription (via payments or company_subscriptions) -> Allow access
 * 2. Active Admin-Granted Free Trial (tbca.is_free_trial_enabled = 1 and expiry > NOW()) -> Allow access
 * 3. Neither -> Block access (Subscription Required modal)
 *
 * @param {number|string} accountantId - The accountant's user ID (fdSiNo in tbca)
 * @returns {Promise<Object>} Detailed status object
 */
async function getAccountantSubscriptionStatus(accountantId) {
  try {
    if (!accountantId) {
      return {
        hasAccess: false,
        isPaid: false,
        isTrial: false,
        status: 'expired',
        isExpired: true,
        daysRemaining: 0,
        message: 'Accountant ID required'
      };
    }

    const now = new Date();

    // -------------------------------------------------------------------------
    // Priority 1: Check for active PAID subscription
    // -------------------------------------------------------------------------
    // A. Check payments table for successful plan payments made by this accountant
    try {
      const [paidRows] = await db.query(
        `SELECT p.id, p.plan_id, p.amount, p.created_at, sp.duration, sp.name AS plan_name
         FROM payments p
         LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
         WHERE p.user_id = ? AND p.status = 'success'
         ORDER BY p.id DESC LIMIT 1`,
        [accountantId]
      );

      if (paidRows && paidRows.length > 0) {
        const payment = paidRows[0];
        const duration = (payment.duration || 'monthly').toLowerCase();
        const validUntil = new Date(payment.created_at);
        if (duration === 'yearly') {
          validUntil.setFullYear(validUntil.getFullYear() + 1);
        } else {
          validUntil.setMonth(validUntil.getMonth() + 1);
        }

        if (validUntil.getTime() > now.getTime()) {
          const msDiff = validUntil.getTime() - now.getTime();
          const daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
          return {
            hasAccess: true,
            isPaid: true,
            isTrial: false,
            status: 'active',
            isExpired: false,
            plan: payment.plan_name || 'Paid Plan',
            startDate: payment.created_at,
            endDate: validUntil,
            daysRemaining: Math.max(daysRemaining, 0),
            message: 'Active paid subscription'
          };
        }
      }
    } catch (payErr) {
      // Ignore if payments table is empty or error
    }

    // B. Check company_subscriptions for any company associated with this accountant that has an active VERIFIED PAID plan
    try {
      const [compSubRows] = await db.query(
        `SELECT cs.id, cs.plan, cs.status, cs.start_date, cs.end_date, cs.payment_id
         FROM company_subscriptions cs
         INNER JOIN ca_company cc ON cs.company_id = cc.company_id
         WHERE cc.ca_id = ?
           AND cs.is_trial = 0
           AND cs.status = 'active'
           AND cs.plan != 'trial'
           AND cs.plan != 'accountant_partner'
           AND cs.plan != 'accountant_client'
           AND cs.payment_id IS NOT NULL
           AND cs.payment_id != ''
           AND cs.end_date > NOW()
         ORDER BY cs.end_date DESC LIMIT 1`,
        [accountantId]
      );

      if (compSubRows && compSubRows.length > 0) {
        const cs = compSubRows[0];
        const end = new Date(cs.end_date);
        const msDiff = end.getTime() - now.getTime();
        const daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
        return {
          hasAccess: true,
          isPaid: true,
          isTrial: false,
          status: 'active',
          isExpired: false,
          plan: cs.plan || 'Company Paid Subscription',
          startDate: cs.start_date,
          endDate: cs.end_date,
          daysRemaining: Math.max(daysRemaining, 0),
          message: 'Active paid company subscription'
        };
      }
    } catch (compErr) {
      // Ignore
    }

    // -------------------------------------------------------------------------
    // Priority 2: Check for Admin-Granted Free Trial in tbca
    // -------------------------------------------------------------------------
    let caRows = [];
    try {
      [caRows] = await db.query(
        `SELECT fdSiNo, email, is_free_trial_enabled, trial_start_date, trial_expiry_date, trial_granted_by, updated_at
         FROM tbca
         WHERE fdSiNo = ? LIMIT 1`,
        [accountantId]
      );
    } catch (colErr) {
      // If column does not exist yet before manual SQL execution, fall back gracefully
      return {
        hasAccess: false,
        isPaid: false,
        isTrial: false,
        status: 'disabled',
        isExpired: true,
        daysRemaining: 0,
        message: 'Your free trial period has expired. Please subscribe to continue using the Accountant Panel.'
      };
    }

    if (caRows && caRows.length > 0) {
      const ca = caRows[0];
      const isEnabled = Boolean(ca.is_free_trial_enabled);
      const startDate = ca.trial_start_date ? new Date(ca.trial_start_date) : null;
      const expiryDate = ca.trial_expiry_date ? new Date(ca.trial_expiry_date) : null;

      if (isEnabled) {
        if (expiryDate) {
          const msDiff = expiryDate.getTime() - now.getTime();
          const daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24));

          if (daysRemaining > 0) {
            // Free trial is ACTIVE
            return {
              hasAccess: true,
              isPaid: false,
              isTrial: true,
              status: 'active',
              isExpired: false,
              plan: 'Free Trial (Admin Granted)',
              startDate,
              endDate: expiryDate,
              daysRemaining,
              trialGrantedBy: ca.trial_granted_by,
              message: 'Active free trial'
            };
          } else {
            // Free trial has EXPIRED by date
            return {
              hasAccess: false,
              isPaid: false,
              isTrial: true,
              status: 'expired',
              isExpired: true,
              plan: 'Free Trial (Admin Granted)',
              startDate,
              endDate: expiryDate,
              daysRemaining: 0,
              trialGrantedBy: ca.trial_granted_by,
              message: 'Your free trial period has expired. Please subscribe to continue using the Accountant Panel.'
            };
          }
        } else {
          // Enabled without expiry date -> Active until modified
          return {
            hasAccess: true,
            isPaid: false,
            isTrial: true,
            status: 'active',
            isExpired: false,
            plan: 'Free Trial (Admin Granted)',
            startDate,
            endDate: null,
            daysRemaining: null,
            trialGrantedBy: ca.trial_granted_by,
            message: 'Active free trial'
          };
        }
      } else {
        // Disabled by Admin
        return {
          hasAccess: false,
          isPaid: false,
          isTrial: true,
          status: 'disabled',
          isExpired: true,
          plan: 'Free Trial (Admin Granted)',
          startDate,
          endDate: expiryDate,
          daysRemaining: 0,
          trialGrantedBy: ca.trial_granted_by,
          message: 'Your free trial period has expired. Please subscribe to continue using the Accountant Panel.'
        };
      }
    }

    // -------------------------------------------------------------------------
    // Priority 3: Neither active paid subscription nor active free trial
    // -------------------------------------------------------------------------
    return {
      hasAccess: false,
      isPaid: false,
      isTrial: false,
      status: 'expired',
      isExpired: true,
      daysRemaining: 0,
      message: 'Your free trial period has expired. Please subscribe to continue using the Accountant Panel.'
    };
  } catch (err) {
    console.error('Error in getAccountantSubscriptionStatus:', err);
    return {
      hasAccess: false,
      isPaid: false,
      isTrial: false,
      status: 'expired',
      isExpired: true,
      daysRemaining: 0,
      message: 'Your free trial period has expired. Please subscribe to continue using the Accountant Panel.'
    };
  }
}

/**
 * Calculates trial status details for a given accountant row.
 */
function computeTrialDetails(u, now = new Date()) {
  const isFreeTrialEnabled = Boolean(u.is_free_trial_enabled);
  const trialStartDate = u.trial_start_date ? new Date(u.trial_start_date).toISOString() : null;
  const trialExpiryDate = u.trial_expiry_date ? new Date(u.trial_expiry_date).toISOString() : null;
  let trialStatus = 'disabled';
  let remainingDays = 0;

  if (isFreeTrialEnabled) {
    if (u.trial_expiry_date) {
      const exp = new Date(u.trial_expiry_date);
      const diff = exp.getTime() - now.getTime();
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      if (days <= 0) {
        trialStatus = 'expired';
        remainingDays = 0;
      } else {
        trialStatus = 'active';
        remainingDays = days;
      }
    } else {
      trialStatus = 'active';
      remainingDays = null;
    }
  }

  return {
    is_free_trial_enabled: isFreeTrialEnabled,
    trial_start_date: trialStartDate,
    trial_expiry_date: trialExpiryDate,
    trial_status: trialStatus,
    trial_remaining_days: remainingDays,
    trial_granted_by: u.trial_granted_by || null,
  };
}

module.exports = {
  getAccountantSubscriptionStatus,
  computeTrialDetails,
};
