/**
 * Exclusive accountant ↔ company assignment helpers.
 * Ensures only one tbca accountant keeps access via ca_company / tbusers / fdAccountantName.
 */

/**
 * Assign a company exclusively to one accountant (tbca).
 * Removes other tbca accountants' ca_company links, upserts the new link,
 * and transfers tbusers.accountant_id so the previous accountant no longer sees the company.
 *
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} dbOrConn
 * @param {number|string} companyId
 * @param {number|string} accountantId - tbca.fdSiNo
 * @param {{ syncCompanyFields?: boolean, accountantName?: string|null }} [options]
 */
async function assignCompanyToAccountant(dbOrConn, companyId, accountantId, options = {}) {
  const { syncCompanyFields = false, accountantName = null } = options;
  const targetId = Number(accountantId);
  const compId = Number(companyId);

  if (!compId || !targetId || Number.isNaN(compId) || Number.isNaN(targetId) || targetId <= 0) {
    return;
  }

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

  if (clearCompanyFields) {
    await dbOrConn.query(
      `UPDATE tbcompanies
       SET fdAccountType = 'self', fdAccountantName = NULL
       WHERE id = ?`,
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
           fdAccountType = CASE WHEN fdAccountType = 'accountant' THEN 'self' ELSE fdAccountType END
       WHERE id = ? AND fdAccountantName = ?`,
      [compId, accName]
    );
  }
}

module.exports = {
  assignCompanyToAccountant,
  unassignCompanyFromAccountants,
  revokeAccountantCompanyAccess
};
