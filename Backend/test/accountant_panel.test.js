const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

process.env.NODE_ENV = 'test';
process.env.DISABLE_RATE_LIMITER = 'true';

const app = require('../server');
const db = require('../db');
const { signToken } = require('../utils/jwt');
const bcrypt = require('bcryptjs');

let server;
let baseUrl;

// Cleanup tracking
const createdCaIds = [];
const createdUserIds = [];
const createdCompanyIds = [];
const createdEmployeeIds = [];

before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  // Cleanup in reverse dependency order
  for (const uid of createdUserIds) {
    await db.query('DELETE FROM tbusers WHERE id = ?', [uid]).catch(() => {});
    await db.query('DELETE FROM users WHERE source_id = ? AND role = ?', [uid, 'company_user']).catch(() => {});
  }
  for (const caId of createdCaIds) {
    await db.query('DELETE FROM ca_company WHERE ca_id = ?', [caId]).catch(() => {});
    await db.query('DELETE FROM tbca WHERE fdSiNo = ?', [caId]).catch(() => {});
    await db.query('DELETE FROM users WHERE source_id = ? AND role = ?', [caId, 'accountant']).catch(() => {});
  }
  for (const cid of createdCompanyIds) {
    await db.query('DELETE FROM tbcompanies WHERE id = ?', [cid]).catch(() => {});
  }
  for (const eid of createdEmployeeIds) {
    await db.query('DELETE FROM tbemployees WHERE id = ?', [eid]).catch(() => {});
    await db.query('DELETE FROM users WHERE source_id = ? AND role = ?', [eid, 'employee']).catch(() => {});
  }

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await db.end().catch(() => {});
});

describe('Accountant Role & Accountant Panel End-to-End Suite', () => {
  const adminToken = signToken({ id: 9999, role: 'super_admin' });

  let company1Id;
  let company2Id;

  let accountantAId;
  const accountantAPassword = 'AcctPassword123!';
  const accountantAEmail = `acct_a_${Date.now()}@test.com`;
  const accountantAUsername = `accta_${Date.now()}`;
  let accountantAToken;

  let accountantBId;
  const accountantBPassword = 'AcctPassword123!';
  const accountantBEmail = `acct_b_${Date.now()}@test.com`;
  const accountantBUsername = `acctb_${Date.now()}`;
  let accountantBToken;

  let createdNormalUserId;
  const normalUserPassword = 'NormalUserPass123!';
  const normalUserUsername = `norm_user_${Date.now()}`;
  const normalUserEmail = `norm_${Date.now()}@test.com`;

  test('0. Setup test companies and verify clean state', async () => {
    // Create Company 1
    const [c1] = await db.query(
      `INSERT INTO tbcompanies (name, financial_year, books_beginning_year, address, pin, phone_number, email, pan_number, tax_type, employee_id)
       VALUES (?, '2026-27', '2026-04-01', 'Acct Co 1 Address', '110001', '9876543210', 'co1@test.com', 'ABCDE1111A', 'GST', 1)`,
      [`Acct Authorized Corp ${Date.now()}`]
    );
    company1Id = c1.insertId;
    createdCompanyIds.push(company1Id);

    // Create Company 2
    const [c2] = await db.query(
      `INSERT INTO tbcompanies (name, financial_year, books_beginning_year, address, pin, phone_number, email, pan_number, tax_type, employee_id)
       VALUES (?, '2026-27', '2026-04-01', 'Acct Co 2 Address', '110002', '9876543211', 'co2@test.com', 'ABCDE2222B', 'GST', 1)`,
      [`Acct Unauthorized Corp ${Date.now()}`]
    );
    company2Id = c2.insertId;
    createdCompanyIds.push(company2Id);

    assert.ok(company1Id > 0, 'Company 1 must be created');
    assert.ok(company2Id > 0, 'Company 2 must be created');
  });

  test('1. Admin creates Accountant A with credentials via POST /api/adminUser', async () => {
    const res = await fetch(`${baseUrl}/api/adminUser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: 'Accountant Alice',
        phone: '9876500001',
        email: accountantAEmail,
        password: accountantAPassword,
        username: accountantAUsername
      })
    });

    assert.equal(res.status, 201, 'Creating accountant must return 201');
    const data = await res.json();
    assert.ok(data.id, 'Response must return created user id');
    accountantAId = data.id;
    createdCaIds.push(accountantAId);

    // Verify record in tbca
    const [caRows] = await db.query('SELECT * FROM tbca WHERE fdSiNo = ?', [accountantAId]);
    assert.equal(caRows.length, 1);
    assert.equal(caRows[0].fdstatus, 'active');
    assert.equal(caRows[0].email, accountantAEmail);

    // Verify password is encrypted with bcrypt
    const match = await bcrypt.compare(accountantAPassword, caRows[0].fdpassword);
    assert.equal(match, true, 'Password must be properly hashed with bcrypt');

    // Verify sync to central users table
    const [userRows] = await db.query(
      'SELECT * FROM users WHERE source_id = ? AND role = "accountant"',
      [accountantAId]
    );
    assert.equal(userRows.length, 1, 'Accountant must be present in users central table');
  });

  test('2. Admin assigns Company 1 to Accountant A via POST /api/adminUser/:id/companies', async () => {
    const res = await fetch(`${baseUrl}/api/adminUser/${accountantAId}/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        companyIds: [company1Id]
      })
    });

    assert.equal(res.status, 200, 'Assigning companies must return 200');
    const data = await res.json();
    assert.equal(data.count, 1);

    // Fetch assigned companies via Admin endpoint
    const getRes = await fetch(`${baseUrl}/api/adminUser/${accountantAId}/companies`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(getRes.status, 200);
    const assigned = await getRes.json();
    assert.equal(assigned.length, 1);
    assert.equal(assigned[0].id, company1Id);
  });

  test('3. Admin suspends Accountant A: login must be rejected with 403 Forbidden', async () => {
    // Admin suspends Accountant A
    const patchRes = await fetch(`${baseUrl}/api/adminUser/${accountantAId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: 'suspended' })
    });
    assert.equal(patchRes.status, 200);

    // Attempt login as Accountant A
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: accountantAEmail,
        password: accountantAPassword
      })
    });

    assert.equal(loginRes.status, 403, 'Suspended accountant login must return 403 Forbidden');
    const loginData = await loginRes.json();
    assert.ok(loginData.message.toLowerCase().includes('suspended'), 'Error message must specify suspended account');
  });

  test('4. Admin reactivates Accountant A: login succeeds and returns role accountant', async () => {
    // Admin activates Accountant A
    const patchRes = await fetch(`${baseUrl}/api/adminUser/${accountantAId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: 'active' })
    });
    assert.equal(patchRes.status, 200);

    // Login as Accountant A
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: accountantAEmail,
        password: accountantAPassword
      })
    });

    assert.equal(loginRes.status, 200, 'Active accountant login must succeed with 200');
    const loginData = await loginRes.json();
    assert.equal(loginData.success, true);
    assert.equal(loginData.role, 'accountant');
    assert.ok(loginData.token, 'Must return JWT token');
    accountantAToken = loginData.token;
  });

  test('5. Accountant A accesses /api/accountant/companies: strictly sees authorized Company 1', async () => {
    const res = await fetch(`${baseUrl}/api/accountant/companies`, {
      headers: { Authorization: `Bearer ${accountantAToken}` }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.companies.length, 1, 'Accountant A must only see 1 authorized company');
    assert.equal(data.companies[0].id, company1Id, 'Must see Company 1');

    // Verify Company 2 is NOT present
    const hasCompany2 = data.companies.some((c) => c.id === company2Id);
    assert.equal(hasCompany2, false, 'Unauthorized Company 2 must NEVER be returned to Accountant A');
  });

  test('6. Accountant A accesses /api/accountant/dashboard: metrics reflect authorized scope', async () => {
    const res = await fetch(`${baseUrl}/api/accountant/dashboard`, {
      headers: { Authorization: `Bearer ${accountantAToken}` }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.stats.totalCompanies, 1);
    assert.equal(data.stats.totalUsers, 0);
  });

  test('7. Privilege Escalation Prevention: Accountant cannot create admin user', async () => {
    const res = await fetch(`${baseUrl}/api/accountant/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountantAToken}`
      },
      body: JSON.stringify({
        company_id: company1Id,
        username: 'hack_admin',
        email: 'hack_admin@test.com',
        password: 'Password123!',
        role: 'Admin',
        name: 'Malicious Admin Attempt'
      })
    });

    assert.equal(res.status, 403, 'Attempting to create admin role must return 403 Forbidden');
    const data = await res.json();
    assert.ok(data.error.includes('non-administrative') || data.error.includes('standard'), 'Must reject privileged roles');
  });

  test('8. Tenant Isolation (IDOR): Accountant cannot create user for unauthorized Company 2', async () => {
    const res = await fetch(`${baseUrl}/api/accountant/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountantAToken}`
      },
      body: JSON.stringify({
        company_id: company2Id,
        username: 'unauth_user',
        email: 'unauth_user@test.com',
        password: 'Password123!',
        role: 'User',
        name: 'Unauthorized Company User Attempt'
      })
    });

    assert.equal(res.status, 403, 'Creating user for unauthorized company must return 403 Forbidden');
    const data = await res.json();
    assert.ok(data.error.includes('not authorized'), 'Must state not authorized to manage company');
  });

  test('9. Accountant A creates normal user for authorized Company 1 successfully', async () => {
    const res = await fetch(`${baseUrl}/api/accountant/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountantAToken}`
      },
      body: JSON.stringify({
        company_id: company1Id,
        username: normalUserUsername,
        password: normalUserPassword,
        name: 'Regular Staff User',
        email: normalUserEmail,
        role: 'User'
      })
    });

    assert.equal(res.status, 201, 'Creating user for authorized company must return 201');
    const data = await res.json();
    assert.ok(data.user && data.user.id, 'Must return new user id');
    createdNormalUserId = data.user.id;
    createdUserIds.push(createdNormalUserId);

    // Verify database record has accountant_id linked correctly
    const [userRows] = await db.query('SELECT * FROM tbusers WHERE id = ?', [createdNormalUserId]);
    assert.equal(userRows.length, 1);
    assert.equal(userRows[0].accountant_id, accountantAId, 'accountant_id must match Accountant A');
    assert.equal(userRows[0].company_id, company1Id, 'company_id must match Company 1');
    assert.equal(userRows[0].status, 'active');

    // Verify password is hashed with bcrypt
    const match = await bcrypt.compare(normalUserPassword, userRows[0].password);
    assert.equal(match, true, 'User password must be securely hashed with bcrypt');
  });

  test('10. Newly created normal user logs in successfully with their credentials', async () => {
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalUserUsername,
        password: normalUserPassword
      })
    });

    assert.equal(loginRes.status, 200, 'Normal user login must succeed with 200');
    const loginData = await loginRes.json();
    assert.equal(loginData.success, true);
    assert.equal(loginData.role, 'company_user');
    assert.equal(loginData.companyId, company1Id);
    assert.ok(loginData.token, 'Must return valid JWT token');
  });

  test('11. Cross-Accountant Isolation: Accountant B has 0 access to Accountant A data', async () => {
    // 1. Admin creates Accountant B
    const createBRes = await fetch(`${baseUrl}/api/adminUser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: 'Accountant Bob',
        phone: '9876500002',
        email: accountantBEmail,
        password: accountantBPassword,
        username: accountantBUsername
      })
    });
    assert.equal(createBRes.status, 201);
    const dataB = await createBRes.json();
    accountantBId = dataB.id;
    createdCaIds.push(accountantBId);

    // 2. Accountant B logs in
    const loginBRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: accountantBEmail,
        password: accountantBPassword
      })
    });
    assert.equal(loginBRes.status, 200);
    const loginBData = await loginBRes.json();
    accountantBToken = loginBData.token;

    // 3. Accountant B fetches companies -> must be 0
    const bCompRes = await fetch(`${baseUrl}/api/accountant/companies`, {
      headers: { Authorization: `Bearer ${accountantBToken}` }
    });
    const bCompData = await bCompRes.json();
    assert.equal(bCompData.companies.length, 0, 'Accountant B must have 0 companies');

    // 4. Accountant B fetches users -> must be 0 (cannot see Accountant A user)
    const bUsersRes = await fetch(`${baseUrl}/api/accountant/users`, {
      headers: { Authorization: `Bearer ${accountantBToken}` }
    });
    const bUsersData = await bUsersRes.json();
    assert.equal(bUsersData.users.length, 0, 'Accountant B must see 0 users');

    // 5. Accountant B attempts to modify Accountant A user status -> rejected with 403
    const bPatchRes = await fetch(`${baseUrl}/api/accountant/users/${createdNormalUserId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountantBToken}`
      },
      body: JSON.stringify({ status: 'suspended' })
    });
    assert.equal(bPatchRes.status, 403, 'Accountant B cannot modify Accountant A user');

    // 6. Accountant B attempts to delete Accountant A user -> rejected with 403
    const bDelRes = await fetch(`${baseUrl}/api/accountant/users/${createdNormalUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accountantBToken}` }
    });
    assert.equal(bDelRes.status, 403, 'Accountant B cannot delete Accountant A user');
  });

  test('12. Accounting Data Access: Accountant accesses Company 1 overview but is blocked from Company 2', async () => {
    // Accountant A accesses authorized Company 1 overview
    const comp1Res = await fetch(`${baseUrl}/api/accountant/companies/${company1Id}/overview`, {
      headers: { Authorization: `Bearer ${accountantAToken}` }
    });
    assert.equal(comp1Res.status, 200, 'Must have access to authorized company accounting data');
    const comp1Data = await comp1Res.json();
    assert.equal(comp1Data.company.id, company1Id);
    assert.ok(comp1Data.metrics !== undefined, 'Must provide accounting metrics');

    // Accountant A attempts to access unauthorized Company 2 overview
    const comp2Res = await fetch(`${baseUrl}/api/accountant/companies/${company2Id}/overview`, {
      headers: { Authorization: `Bearer ${accountantAToken}` }
    });
    assert.equal(comp2Res.status, 403, 'Must be forbidden from unauthorized company accounting data');
  });

  test('13. Accountant A user status toggle and deletion of their own managed user works', async () => {
    // Suspend normal user
    const patchRes = await fetch(`${baseUrl}/api/accountant/users/${createdNormalUserId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountantAToken}`
      },
      body: JSON.stringify({ status: 'suspended' })
    });
    assert.equal(patchRes.status, 200);

    // Suspended normal user login must fail with 403
    const normLoginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalUserUsername,
        password: normalUserPassword
      })
    });
    assert.equal(normLoginRes.status, 403, 'Suspended normal user login must return 403');

    // Reactivate normal user
    const reactivateRes = await fetch(`${baseUrl}/api/accountant/users/${createdNormalUserId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountantAToken}`
      },
      body: JSON.stringify({ status: 'active' })
    });
    assert.equal(reactivateRes.status, 200);

    // Delete normal user
    const delRes = await fetch(`${baseUrl}/api/accountant/users/${createdNormalUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accountantAToken}` }
    });
    assert.equal(delRes.status, 200);

    // Verify deletion in database
    const [verifyRows] = await db.query('SELECT * FROM tbusers WHERE id = ?', [createdNormalUserId]);
    assert.equal(verifyRows.length, 0, 'User must be permanently removed');

    // Remove from cleanup list since already deleted
    const idx = createdUserIds.indexOf(createdNormalUserId);
    if (idx !== -1) createdUserIds.splice(idx, 1);
  });

  test('14. Accountant creates a new client company directly via POST /api/accountant/companies', async () => {
    const compName = `Acct Self Created Co ${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/accountant/companies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountantAToken}`
      },
      body: JSON.stringify({
        name: compName,
        financialYear: '2026-27',
        booksBeginningYear: '2026-04-01',
        address: '123 Business Park',
        state: 'Delhi',
        pin: '110001',
        phoneNumber: '9876543210',
        email: 'info@acctself.com',
        panNumber: 'ABCDE9999Z',
        gstNumber: '07ABCDE9999Z1Z5',
        taxType: 'GST',
        companyType: 'Private Limited'
      })
    });

    assert.equal(res.status, 201, 'Accountant company creation must return 201');
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.company.id > 0);
    const newCompanyId = data.company.id;
    createdCompanyIds.push(newCompanyId);

    // Verify company is linked to Accountant in ca_company
    const [caCompRows] = await db.query(
      'SELECT * FROM ca_company WHERE ca_id = ? AND company_id = ?',
      [accountantAId, newCompanyId]
    );
    assert.equal(caCompRows.length, 1, 'Company must be linked in ca_company table');

    // Verify GET /api/accountant/companies includes new company
    const getRes = await fetch(`${baseUrl}/api/accountant/companies`, {
      headers: { Authorization: `Bearer ${accountantAToken}` }
    });
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    const found = getData.companies.find((c) => c.id === newCompanyId);
    assert.ok(found, 'Newly created company must appear in accountant companies list');
    assert.equal(found.name, compName);

    // Accountant provisions a normal user for this newly created company
    const newUsername = `co_staff_${Date.now()}`;
    const newEmail = `staff_${Date.now()}@acctself.com`;
    const userRes = await fetch(`${baseUrl}/api/accountant/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountantAToken}`
      },
      body: JSON.stringify({
        company_id: newCompanyId,
        username: newUsername,
        email: newEmail,
        password: 'StaffPassword123!',
        role: 'Data Entry',
        phone: '9876500002',
        department: 'Operations'
      })
    });

    assert.equal(userRes.status, 201, 'User provisioned for new company must return 201');
    const userData = await userRes.json();
    assert.equal(userData.success, true);
    assert.ok(userData.user.id > 0);
    createdUserIds.push(userData.user.id);
  });
});
