require('dotenv').config();
const db = require('../db');

/**
 * Migration Script: Creates unified `users` table and safely synchronizes
 * existing users across all 6 profile tables.
 */
async function runUnifiedUsersMigration() {
  console.log('🚀 Running Unified Users Architecture Migration...');

  try {
    // 1. Create central `users` table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(191) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('employee', 'ca', 'ca_employee', 'new_ca', 'company_user', 'super_admin') NOT NULL,
        source_table VARCHAR(50) NOT NULL,
        source_id INT NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_users_email (email),
        INDEX idx_users_role (role),
        INDEX idx_users_source (source_table, source_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Central users table is ready');

    // 2. Sync tbemployees (Business Owners / Traders)
    const [employees] = await db.query('SELECT id, email, password FROM tbemployees WHERE email IS NOT NULL AND email != ""');
    for (const emp of employees) {
      if (!emp.email || !emp.password) continue;
      const normalizedEmail = emp.email.trim().toLowerCase();
      await db.query(`
        INSERT INTO users (email, password_hash, role, source_table, source_id)
        VALUES (?, ?, 'employee', 'tbemployees', ?)
        ON DUPLICATE KEY UPDATE
          password_hash = VALUES(password_hash),
          source_table = VALUES(source_table),
          source_id = VALUES(source_id)
      `, [normalizedEmail, emp.password, emp.id]);
    }
    console.log(`✅ Synced ${employees.length} employees to users table`);

    // 3. Sync ca_users (New CA accounts)
    const [caUsers] = await db.query('SELECT id, email, password, status FROM ca_users WHERE email IS NOT NULL AND email != ""');
    for (const ca of caUsers) {
      if (!ca.email || !ca.password) continue;
      const normalizedEmail = ca.email.trim().toLowerCase();
      await db.query(`
        INSERT INTO users (email, password_hash, role, source_table, source_id, status)
        VALUES (?, ?, 'new_ca', 'ca_users', ?, ?)
        ON DUPLICATE KEY UPDATE
          password_hash = VALUES(password_hash),
          role = 'new_ca',
          source_table = 'ca_users',
          source_id = VALUES(source_id),
          status = VALUES(status)
      `, [normalizedEmail, ca.password, ca.id, ca.status || 'active']);
    }
    console.log(`✅ Synced ${caUsers.length} ca_users to users table`);

    // 4. Sync tbca (Legacy CA accounts)
    const [tbcas] = await db.query('SELECT fdSiNo, email, fdpassword, fdstatus FROM tbca WHERE email IS NOT NULL AND email != ""');
    for (const ca of tbcas) {
      if (!ca.email || !ca.fdpassword) continue;
      const normalizedEmail = ca.email.trim().toLowerCase();
      await db.query(`
        INSERT INTO users (email, password_hash, role, source_table, source_id, status)
        VALUES (?, ?, 'ca', 'tbca', ?, ?)
        ON DUPLICATE KEY UPDATE
          password_hash = VALUES(password_hash),
          source_table = VALUES(source_table),
          source_id = VALUES(source_id)
      `, [normalizedEmail, ca.fdpassword, ca.fdSiNo, ca.fdstatus || 'active']);
    }
    console.log(`✅ Synced ${tbcas.length} tbca to users table`);

    // 5. Sync tbcaemployees (Staff Accountants)
    const [caEmployees] = await db.query('SELECT id, email, password FROM tbcaemployees WHERE email IS NOT NULL AND email != ""');
    for (const ce of caEmployees) {
      if (!ce.email || !ce.password) continue;
      const normalizedEmail = ce.email.trim().toLowerCase();
      await db.query(`
        INSERT INTO users (email, password_hash, role, source_table, source_id)
        VALUES (?, ?, 'ca_employee', 'tbcaemployees', ?)
        ON DUPLICATE KEY UPDATE
          password_hash = VALUES(password_hash),
          source_table = VALUES(source_table),
          source_id = VALUES(source_id)
      `, [normalizedEmail, ce.password, ce.id]);
    }
    console.log(`✅ Synced ${caEmployees.length} ca employees to users table`);

    // 6. Sync tbusers (Company Sub-Users)
    const [compUsers] = await db.query('SELECT id, email, username, password FROM tbusers WHERE (email IS NOT NULL AND email != "") OR (username IS NOT NULL AND username != "")');
    for (const cu of compUsers) {
      const userIdent = (cu.email || cu.username || '').trim().toLowerCase();
      if (!userIdent || !cu.password) continue;
      await db.query(`
        INSERT INTO users (email, password_hash, role, source_table, source_id)
        VALUES (?, ?, 'company_user', 'tbusers', ?)
        ON DUPLICATE KEY UPDATE
          password_hash = VALUES(password_hash),
          source_table = VALUES(source_table),
          source_id = VALUES(source_id)
      `, [userIdent, cu.password, cu.id]);
    }
    console.log(`✅ Synced ${compUsers.length} company users to users table`);

    // 7. Sync tbadmin (Super Admin)
    const [admins] = await db.query('SELECT id, email, password FROM tbadmin WHERE email IS NOT NULL AND email != ""');
    for (const adm of admins) {
      if (!adm.email || !adm.password) continue;
      const normalizedEmail = adm.email.trim().toLowerCase();
      await db.query(`
        INSERT INTO users (email, password_hash, role, source_table, source_id)
        VALUES (?, ?, 'super_admin', 'tbadmin', ?)
        ON DUPLICATE KEY UPDATE
          password_hash = VALUES(password_hash),
          source_table = VALUES(source_table),
          source_id = VALUES(source_id)
      `, [normalizedEmail, adm.password, adm.id]);
    }
    console.log(`✅ Synced ${admins.length} admins to users table`);

    console.log('🎉 Unified users migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  }
}

if (require.main === module) {
  runUnifiedUsersMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runUnifiedUsersMigration };
