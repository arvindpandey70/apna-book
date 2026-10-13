const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
process.env.NODE_ENV = 'test';
process.env.DISABLE_RATE_LIMITER = 'true';

const app = require('../server');
const db = require('../db');
const { signToken, verifyToken } = require('../utils/jwt');
const bcrypt = require('bcryptjs');

let server;
let baseUrl;

// Test accounts tracking for clean teardown
const createdEmployeeIds = [];
const createdCompanyIds = [];

before(async () => {
  // Start server on an ephemeral free port
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
  // Cleanup test data created during test run
  for (const cid of createdCompanyIds) {
    await db.query('DELETE FROM tbcompanies WHERE id = ?', [cid]).catch(() => {});
  }
  for (const uid of createdEmployeeIds) {
    await db.query('DELETE FROM tbemployees WHERE id = ?', [uid]).catch(() => {});
  }

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await db.end().catch(() => {});
});

describe('Authentication & User Isolation Suite', () => {

  const testUserA = {
    firstName: 'UserA',
    lastName: 'Test',
    email: `usera_${Date.now()}@test.com`,
    password: 'Password123!',
    phoneNumber: '9876543210',
    pan: `ABCDE${Math.floor(1000 + Math.random() * 9000)}A`,
    userLimit: 2,
    address: 'Test Address A'
  };

  const testUserB = {
    firstName: 'UserB',
    lastName: 'Test',
    email: `userb_${Date.now()}@test.com`,
    password: 'Password123!',
    phoneNumber: '9876543211',
    pan: `BCDEF${Math.floor(1000 + Math.random() * 9000)}B`,
    userLimit: 2,
    address: 'Test Address B'
  };

  const testUserC = {
    firstName: 'UserC',
    lastName: 'Test',
    email: `userc_${Date.now()}@test.com`,
    password: 'Password123!',
    phoneNumber: '9876543212',
    pan: `CDEFG${Math.floor(1000 + Math.random() * 9000)}C`,
    userLimit: 2,
    address: 'Test Address C'
  };

  let userAId, userBId, userCId;
  let companyBId;

  test('1. Registration of User A and User B succeeds with unique identities', async () => {
    // Register User A
    const resA = await fetch(`${baseUrl}/api/SignUp/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUserA)
    });
    assert.equal(resA.status, 201, 'User A registration should return 201');
    const dataA = await resA.json();
    assert.ok(dataA.userId, 'User A should receive a valid userId');
    assert.ok(dataA.token, 'User A should receive a JWT token');
    userAId = dataA.userId;
    createdEmployeeIds.push(userAId);

    // Register User B
    const resB = await fetch(`${baseUrl}/api/SignUp/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUserB)
    });
    assert.equal(resB.status, 201, 'User B registration should return 201');
    const dataB = await resB.json();
    assert.ok(dataB.userId, 'User B should receive a valid userId');
    userBId = dataB.userId;
    createdEmployeeIds.push(userBId);

    assert.notEqual(userAId, userBId, 'User A and User B must have distinct user IDs');
  });

  test('2. User B creates a company, creating an existing company identity in the database', async () => {
    // Manually insert a company for User B to simulate existing company
    const [compResult] = await db.query(
      `INSERT INTO tbcompanies (name, financial_year, books_beginning_year, address, pin, phone_number, email, pan_number, tax_type, employee_id)
       VALUES (?, '2026-27', '2026-04-01', 'B Address', '700001', '9876543211', ?, ?, 'GST', ?)`,
      ['Company B Private Ltd', testUserB.email, testUserB.pan, userBId]
    );
    companyBId = compResult.insertId;
    createdCompanyIds.push(companyBId);

    assert.ok(companyBId > 0, 'Company B should be persisted in database');
  });

  test('3. CRITICAL REGRESSION: Register User C and verify User C is NOT hijacked by User B company', async () => {
    // Register User C
    const resC = await fetch(`${baseUrl}/api/SignUp/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUserC)
    });
    assert.equal(resC.status, 201, 'User C registration should return 201');
    const dataC = await resC.json();
    userCId = dataC.userId;
    createdEmployeeIds.push(userCId);

    // Now log in as User C using User C credentials
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserC.email,
        password: testUserC.password
      })
    });

    assert.equal(loginRes.status, 200, 'User C login should succeed');
    const loginData = await loginRes.json();

    // Verify authenticated identity is strictly User C
    assert.equal(loginData.success, true);
    assert.equal(loginData.user_id, userCId, 'User C user_id must match User C');
    assert.equal(loginData.user.id, userCId, 'User C user.id must match User C');
    assert.equal(loginData.user.email, testUserC.email.toLowerCase(), 'Email must be User C email');
    assert.equal(loginData.user.firstName, testUserC.firstName);

    // Verify token claims
    const decoded = verifyToken(loginData.token);
    assert.equal(decoded.id, userCId, 'Token claim id must be User C');
    assert.equal(decoded.email, testUserC.email.toLowerCase(), 'Token claim email must be User C');

    // CRITICAL BUG VERIFICATION: User C must NOT have User B company!
    assert.equal(loginData.hasCompany, false, 'User C has not created any company, hasCompany must be false');
    assert.equal(loginData.companyId, null, 'User C companyId must be null');
    assert.equal(loginData.companyInfo, null, 'User C companyInfo must be null');
    assert.equal(loginData.companies.length, 0, 'User C assigned companies must be empty');
    assert.equal(loginData.user.companyName, '', 'User C companyName must be empty');
  });

  test('4. Log in as User B: verify User B sees their own company and not User A or User C', async () => {
    const loginResB = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserB.email,
        password: testUserB.password
      })
    });

    assert.equal(loginResB.status, 200);
    const loginDataB = await loginResB.json();

    assert.equal(loginDataB.user_id, userBId);
    assert.equal(loginDataB.hasCompany, true);
    assert.equal(loginDataB.companyId, companyBId);
    assert.equal(loginDataB.companyInfo.id, companyBId);
    assert.equal(loginDataB.companyInfo.employee_id, userBId);
    assert.equal(loginDataB.companies[0].id, companyBId);
  });

  test('5. Login with incorrect password returns 401 and never creates valid state', async () => {
    const badLogin = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserC.email,
        password: 'WrongPassword999!'
      })
    });

    assert.equal(badLogin.status, 401);
    const badData = await badLogin.json();
    assert.equal(badData.success, false);
    assert.equal(badData.token, undefined);
  });

  test('6. Login with nonexistent user returns 401', async () => {
    const nonExistent = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ghost_user_does_not_exist@domain.com',
        password: 'Password123!'
      })
    });

    assert.equal(nonExistent.status, 401);
    const data = await nonExistent.json();
    assert.equal(data.success, false);
    assert.equal(data.token, undefined);
  });

  test('7. Duplicate registration: identical email is rejected with 409 Conflict', async () => {
    const dupRes = await fetch(`${baseUrl}/api/SignUp/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...testUserA,
        pan: `XYZDE${Math.floor(1000 + Math.random() * 9000)}Z` // different pan
      })
    });

    assert.equal(dupRes.status, 409, 'Duplicate email should be rejected with 409 Conflict');
    const dupData = await dupRes.json();
    assert.equal(dupData.success, false);
  });

  test('8. Duplicate registration: identical PAN is rejected with 409 Conflict', async () => {
    const dupPanRes = await fetch(`${baseUrl}/api/SignUp/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...testUserA,
        email: `new_diff_email_${Date.now()}@domain.com` // different email, same pan
      })
    });

    assert.equal(dupPanRes.status, 409, 'Duplicate PAN should be rejected with 409 Conflict');
    const dupPanData = await dupPanRes.json();
    assert.equal(dupPanData.success, false);
  });

  test('9. Token Verification: Malformed, tampered, and expired tokens are rejected', async () => {
    // Malformed token
    const resMalformed = await fetch(`${baseUrl}/api/profile/my-profile`, {
      headers: { 'Authorization': 'Bearer not-a-valid-token' }
    });
    assert.equal(resMalformed.status, 401);

    // Tampered token
    const validToken = signToken({ id: userCId, email: testUserC.email, role: 'employee' });
    const tamperedToken = validToken.slice(0, -6) + 'abcdef';
    const resTampered = await fetch(`${baseUrl}/api/profile/my-profile`, {
      headers: { 'Authorization': `Bearer ${tamperedToken}` }
    });
    assert.equal(resTampered.status, 401);

    // Expired token
    const expiredToken = signToken({ id: userCId, email: testUserC.email, role: 'employee' }, { expiresIn: '0s' });
    const resExpired = await fetch(`${baseUrl}/api/profile/my-profile`, {
      headers: { 'Authorization': `Bearer ${expiredToken}` }
    });
    assert.equal(resExpired.status, 401);
  });

  test('10. Account Isolation in Dashboard: User C query does not return User B company data', async () => {
    // User C queries dashboard-data
    const res = await fetch(`${baseUrl}/api/dashboard-data?employee_id=${userCId}`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.success, true);
    assert.equal(data.companies.length, 0, 'User C dashboard should list 0 companies');
    assert.equal(data.companyInfo, null, 'User C dashboard should have null companyInfo');

    // Confirm User B company is NOT returned in User C dashboard
    const foundCompanyB = data.companies.some(c => c.id === companyBId);
    assert.equal(foundCompanyB, false, 'User B company must never be present in User C dashboard');
  });

  test('11. Concurrency: Simultaneous registrations and logins remain completely isolated', async () => {
    const concurrentUsers = [
      {
        firstName: 'Concurrent1',
        lastName: 'Test',
        email: `conc1_${Date.now()}@test.com`,
        password: 'Password123!',
        phoneNumber: '9111111111',
        pan: `ZZAAA${Math.floor(1000 + Math.random() * 9000)}A`,
        userLimit: 1
      },
      {
        firstName: 'Concurrent2',
        lastName: 'Test',
        email: `conc2_${Date.now()}@test.com`,
        password: 'Password123!',
        phoneNumber: '9222222222',
        pan: `ZZBBB${Math.floor(1000 + Math.random() * 9000)}B`,
        userLimit: 1
      },
      {
        firstName: 'Concurrent3',
        lastName: 'Test',
        email: `conc3_${Date.now()}@test.com`,
        password: 'Password123!',
        phoneNumber: '9333333333',
        pan: `ZZCCC${Math.floor(1000 + Math.random() * 9000)}C`,
        userLimit: 1
      }
    ];

    // Register simultaneously
    const regPromises = concurrentUsers.map(u =>
      fetch(`${baseUrl}/api/SignUp/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(u)
      }).then(r => r.json())
    );

    const regResults = await Promise.all(regPromises);
    for (let i = 0; i < regResults.length; i++) {
      assert.ok(regResults[i].userId, `Concurrent user ${i} must register successfully`);
      createdEmployeeIds.push(regResults[i].userId);
    }

    // Login simultaneously
    const loginPromises = concurrentUsers.map(u =>
      fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: u.email, password: u.password })
      }).then(r => r.json())
    );

    const loginResults = await Promise.all(loginPromises);
    for (let i = 0; i < loginResults.length; i++) {
      assert.equal(loginResults[i].success, true);
      assert.equal(loginResults[i].user.email, concurrentUsers[i].email.toLowerCase());
      assert.equal(loginResults[i].user.id, regResults[i].userId);
      assert.equal(loginResults[i].hasCompany, false);
    }
  });

  test('12. CA Login & Isolation: CA login resolves role, returns supplier ca, and only sees companies assigned to that CA', async () => {
    // Create a temporary CA user in ca_users
    const caEmail = `test_ca_${Date.now()}@example.com`;
    const caPassword = 'CaPassword123!';
    const hashed = await bcrypt.hash(caPassword, 10);

    const [caInsert] = await db.query(
      `INSERT INTO ca_users (name, email, phone, firm_name, registration_number, designation, membership_number, pan_number, udin, password, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      ['Test CA', caEmail, '9876543211', 'Test Firm', 'REG123', 'CA', 'MEM123', 'PAN123', 'UDIN123', hashed]
    );
    const caId = caInsert.insertId;

    try {
      // 1. Log in as CA before any companies are assigned
      const res1 = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: caEmail, password: caPassword })
      });
      const data1 = await res1.json();
      assert.equal(data1.success, true);
      assert.equal(data1.role, 'new_ca');
      assert.equal(data1.supplier, 'ca');
      assert.equal(data1.hasCompany, false);

      // Verify companies-by-ca returns 0 companies for this unassigned CA
      const compRes1 = await fetch(`${baseUrl}/api/companies-by-ca?ca_id=${caId}`);
      const compData1 = await compRes1.json();
      assert.equal(compData1.companies.length, 0);

      // 2. Link a test company to this CA in ca_company
      const [compInsert] = await db.query(
        `INSERT INTO tbcompanies (name, financial_year, books_beginning_year, address, pin, phone_number, email, pan_number, employee_id)
         VALUES (?, '2026-2027', '2026-04-01', 'CA Test Address', '110001', '9876543210', ?, 'ABCDE1234F', ?)`,
        ['CA Client Corp', caEmail, 999999]
      );
      const testCompanyId = compInsert.insertId;
      createdCompanyIds.push(testCompanyId);

      await db.query(
        'INSERT INTO ca_company (ca_id, company_id) VALUES (?, ?)',
        [caId, testCompanyId]
      );

      // 3. Log in again: CA now hasCompany = true and companyId matching testCompanyId
      const res2 = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: caEmail, password: caPassword })
      });
      const data2 = await res2.json();
      assert.equal(data2.success, true);
      assert.equal(data2.role, 'new_ca');
      assert.equal(data2.supplier, 'ca');
      assert.equal(data2.hasCompany, true);
      assert.equal(data2.companyId, testCompanyId);

      // Verify companies-by-ca returns strictly the linked company
      const compRes2 = await fetch(`${baseUrl}/api/companies-by-ca?ca_id=${caId}`);
      const compData2 = await compRes2.json();
      assert.equal(compData2.companies.length, 1);
      assert.equal(compData2.companies[0].id, testCompanyId);
      assert.equal(compData2.companies[0].name, 'CA Client Corp');
    } finally {
      // Clean up CA records
      await db.query('DELETE FROM ca_company WHERE ca_id = ?', [caId]).catch(() => {});
      await db.query('DELETE FROM ca_users WHERE id = ?', [caId]).catch(() => {});
    }
  });

  test('13. Unified Users Architecture: Registration, central users lookup, and backward-compatible adapter keys work seamlessly', async () => {
    const testEmail = `unified_${Date.now()}@example.com`;
    const testPassword = 'UnifiedPass123!';
    const testPan = `UNIQU${Math.floor(1000 + Math.random() * 9000)}Z`;

    // 1. Register a new user
    const regRes = await fetch(`${baseUrl}/api/SignUp/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Unified',
        lastName: 'User',
        email: testEmail,
        password: testPassword,
        phoneNumber: '9123456780',
        pan: testPan,
        userLimit: 1,
        address: 'Unified Street'
      })
    });
    const regData = await regRes.json();
    assert.equal(regRes.status, 201);
    assert.ok(regData.userId);
    createdEmployeeIds.push(regData.userId);

    // 2. Verify that the user was automatically created in the central `users` table
    const [authRows] = await db.query('SELECT * FROM users WHERE LOWER(email) = ?', [testEmail.toLowerCase()]);
    assert.equal(authRows.length, 1, 'User must exist in central users table');
    assert.equal(authRows[0].role, 'employee');
    assert.equal(authRows[0].source_table, 'tbemployees');
    assert.equal(authRows[0].source_id, regData.userId);

    // 3. Login using credentials: verify single-query lookup & adapter keys for Ledgers/Vouchers
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    const loginData = await loginRes.json();
    assert.equal(loginData.success, true);
    assert.equal(loginData.role, 'employee');
    // Ensure backward-compatible keys needed by Ledgers and Vouchers are intact:
    assert.equal(loginData.employee_id, regData.userId);
    assert.equal(loginData.user_id, regData.userId);
    assert.equal(loginData.supplier, 'employee');
    assert.equal(loginData.userType, 'employee');
    assert.equal(loginData.hasCompany, false);

    // Clean up from users table
    await db.query('DELETE FROM users WHERE id = ?', [authRows[0].id]).catch(() => {});
  });

});

