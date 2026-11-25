/**
 * Exclusive accountant ↔ company assignment helpers.
 * Ensures only one tbca accountant keeps access via ca_company / tbusers / fdAccountantName.
 * Indian FY lock: April 1 – March 31; once allotted, user cannot change until FY end
 * unless the accountant releases the company from their portal.
 */

/**
 * End date of the Indian financial year containing `fromDate` (March 31).
 * Jan–Mar → March 31 of same calendar year; Apr–Dec → March 31 of next year.
 * @param {Date} [fromDate]
 * @returns {Date}
 */
function getIndianFyEndDate(fromDate = new Date()) {
  const d = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = Jan
  // FY ends March 31: if already in Jan–Mar, end is this year's March 31
  const endYear = month <= 2 ? year : year + 1;
  return new Date(endYear, 2, 31); // local March 31
}

/**
 * Format Date as YYYY-MM-DD for MySQL DATE columns.
 * @param {Date} date
 * @returns {string}
 */
function toMysqlDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * @param {string|Date|null|undefined} lockedUntil
 * @returns {boolean}
 */
function isAccountantAssignmentLocked(lockedUntil) {
  if (!lockedUntil) return false;
  const end = lockedUntil instanceof Date ? lockedUntil : new Date(lockedUntil);
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return end >= today;
}

/**
 * Ensure tbcompanies.accountant_locked_until exists.
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} dbOrConn
 */
async function ensureAccountantLockColumn(dbOrConn) {
  const [cols] = await dbOrConn.query(
    `SHOW COLUMNS FROM tbcompanies LIKE 'accountant_locked_until'`
  );
  if (cols.length === 0) {
    await dbOrConn.query(
      `ALTER TABLE tbcompanies ADD COLUMN accountant_locked_until DATE NULL DEFAULT NULL`
    );
    console.log('✅ accountant_locked_until column created');
  }
}

/**
 * Assign a company exclusively to one accountant (tbca).
 * Removes other tbca accountants' ca_company links, upserts the new link,
 * and transfers tbusers.accountant_id so the previous accountant no longer sees the company.
 * Sets accountant_locked_until to Indian FY end (March 31) when lockForFinancialYear is true.
 *
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} dbOrConn
 * @param {number|string} companyId
 * @param {number|string} accountantId - tbca.fdSiNo
 * @param {{ syncCompanyFields?: boolean, accountantName?: string|null, lockForFinancialYear?: boolean }} [options]
 */
async function assignCompanyToAccountant(dbOrConn, companyId, accountantId, options = {}) {
  const {
    syncCompanyFields = false,
    accountantName = null,
    lockForFinancialYear = true
  } = options;
  const targetId = Number(accountantId);
  const compId = Number(companyId);

  if (!compId || !targetId || Number.isNaN(compId) || Number.isNaN(targetId) || targetId <= 0) {
    return;
  }

  await ensureAccountantLockColumn(dbOrConn);

  // Drop other tbca accountants' links (keep ca_users / new_ca links intact)
  await dbOrConn.query(
    `DELETE cc FROM ca_company cc
     INNER JOIN tbca a ON cc.ca_id = a.fdSiNo
     WHERE cc.company_id = ? AND cc.ca_id != ?`,
    [compId, targetId]
  );

  await dbOrConn.query(
    `INSERT INTO ca_company (ca_id, company_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = id`,
    [targetId, compId]
  );

  // Previous accountant created users → transfer so portal OR-path no longer matches them
  await dbOrConn.query(
    `UPDATE tbusers
     SET accountant_id = ?
     WHERE company_id = ?
       AND accountant_id IS NOT NULL
       AND accountant_id > 0
       AND accountant_id != ?`,
    [targetId, compId, targetId]
  );

  if (syncCompanyFields) {
    let name = accountantName && String(accountantName).trim() ? String(accountantName).trim() : null;
    if (!name) {
      const [rows] = await dbOrConn.query(
        'SELECT fdname FROM tbca WHERE fdSiNo = ? LIMIT 1',
        [targetId]
      );
      name = rows[0]?.fdname || null;
    }
    if (name) {
      await dbOrConn.query(
        `UPDATE tbcompanies
         SET fdAccountType = 'accountant', fdAccountantName = ?
         WHERE id = ?`,
        [name, compId]
      );
    }
  }

  if (lockForFinancialYear) {
    const fyEnd = toMysqlDate(getIndianFyEndDate());
    await dbOrConn.query(
      `UPDATE tbcompanies
       SET accountant_locked_until = ?
       WHERE id = ?`,
      [fyEnd, compId]
    );
  }
}

/**
 * Remove all tbca accountant links for a company (e.g. maintainBy → self).
 * Also clears tbusers.accountant_id so no accountant portal still lists the company.
 *
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} dbOrConn
 * @param {number|string} companyId
 * @param {{ clearCompanyFields?: boolean }} [options]
 */
async function unassignCompanyFromAccountants(dbOrConn, companyId, options = {}) {
  const { clearCompanyFields = false } = options;
  const compId = Number(companyId);
  if (!compId || Number.isNaN(compId)) return;

  await dbOrConn.query(
    `DELETE cc FROM ca_company cc
     INNER JOIN tbca a ON cc.ca_id = a.fdSiNo
     WHERE cc.company_id = ?`,
    [compId]
  );

  await dbOrConn.query(
    `UPDATE tbusers
     SET accountant_id = NULL
     WHERE company_id = ?
       AND accountant_id IS NOT NULL
       AND accountant_id > 0`,
    [compId]
  );

  await ensureAccountantLockColumn(dbOrConn);

  if (clearCompanyFields) {
    await dbOrConn.query(
      `UPDATE tbcompanies
       SET fdAccountType = 'self',
           fdAccountantName = NULL,
           accountant_locked_until = NULL
       WHERE id = ?`,
      [compId]
    );
  } else {
    await dbOrConn.query(
      `UPDATE tbcompanies SET accountant_locked_until = NULL WHERE id = ?`,
      [compId]
    );
  }
}

/**
 * Clear one accountant's access to a company without assigning someone else.
 * Used when admin removes a company from an accountant's list.
 *
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} dbOrConn
 * @param {number|string} companyId
 * @param {number|string} accountantId
 */
async function revokeAccountantCompanyAccess(dbOrConn, companyId, accountantId) {
  const compId = Number(companyId);
  const accId = Number(accountantId);
  if (!compId || !accId || Number.isNaN(compId) || Number.isNaN(accId)) return;

  await dbOrConn.query(
    'DELETE FROM ca_company WHERE company_id = ? AND ca_id = ?',
    [compId, accId]
  );

  await dbOrConn.query(
    `UPDATE tbusers
     SET accountant_id = NULL
     WHERE company_id = ? AND accountant_id = ?`,
    [compId, accId]
  );

  await ensureAccountantLockColumn(dbOrConn);

  // Clear name-match path only if this accountant was the named one
  const [accRows] = await dbOrConn.query(
    'SELECT fdname FROM tbca WHERE fdSiNo = ? LIMIT 1',
    [accId]
  );
  const accName = accRows[0]?.fdname;
  if (accName) {
    await dbOrConn.query(
      `UPDATE tbcompanies
       SET fdAccountantName = NULL,
           fdAccountType = CASE WHEN fdAccountType = 'accountant' THEN 'self' ELSE fdAccountType END,
           accountant_locked_until = NULL
       WHERE id = ? AND fdAccountantName = ?`,
      [compId, accName]
    );
  }

  // Always clear FY lock on accountant-initiated release
  await dbOrConn.query(
    `UPDATE tbcompanies SET accountant_locked_until = NULL WHERE id = ?`,
    [compId]
  );
}

module.exports = {
  assignCompanyToAccountant,
  unassignCompanyFromAccountants,
  revokeAccountantCompanyAccess,
  getIndianFyEndDate,
  toMysqlDate,
  isAccountantAssignmentLocked,
  ensureAccountantLockColumn
};
