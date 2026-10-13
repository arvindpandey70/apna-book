require('dotenv').config();
const db = require('../db');

async function runMigration() {
  console.log('🚀 Starting authentication security database migration...');

  try {
    // 1. Ensure 'address' column in relevant user tables
    const userTables = [
      { name: 'tbemployees', after: 'pan' },
      { name: 'tbca', after: null },
      { name: 'tbcaemployees', after: 'adhar' }
    ];

    for (const table of userTables) {
      try {
        const [cols] = await db.query(`SHOW COLUMNS FROM ${table.name} LIKE 'address'`);
        if (cols.length === 0) {
          const afterClause = table.after ? `AFTER ${table.after}` : '';
          await db.query(`ALTER TABLE ${table.name} ADD COLUMN address TEXT ${afterClause}`.trim());
          console.log(`✅ Added 'address' column to ${table.name}`);
        } else {
          console.log(`ℹ️ 'address' column already exists in ${table.name}`);
        }
      } catch (err) {
        console.warn(`⚠️ Warning checking address column in ${table.name}:`, err.message);
      }
    }

    // 2. Add UNIQUE index on tbemployees(pan)
    try {
      const [panIdx] = await db.query(`SHOW INDEX FROM tbemployees WHERE Key_name = 'uq_tbemployees_pan' OR Key_name = 'pan'`);
      if (panIdx.length === 0) {
        await db.query(`ALTER TABLE tbemployees ADD UNIQUE KEY uq_tbemployees_pan (pan)`);
        console.log(`✅ Added UNIQUE KEY uq_tbemployees_pan on tbemployees(pan)`);
      } else {
        console.log(`ℹ️ Unique index on tbemployees(pan) already exists`);
      }
    } catch (err) {
      console.warn(`⚠️ Warning ensuring index on tbemployees(pan):`, err.message);
    }

    // 3. Add UNIQUE index on tbadmin(email)
    try {
      const [adminIdx] = await db.query(`SHOW INDEX FROM tbadmin WHERE Key_name = 'uq_tbadmin_email' OR Key_name = 'email'`);
      if (adminIdx.length === 0) {
        await db.query(`ALTER TABLE tbadmin ADD UNIQUE KEY uq_tbadmin_email (email)`);
        console.log(`✅ Added UNIQUE KEY uq_tbadmin_email on tbadmin(email)`);
      } else {
        console.log(`ℹ️ Unique index on tbadmin(email) already exists`);
      }
    } catch (err) {
      console.warn(`⚠️ Warning ensuring index on tbadmin(email):`, err.message);
    }

    // 4. Add UNIQUE index on tbusers(company_id, username)
    try {
      const [userCompIdx] = await db.query(`SHOW INDEX FROM tbusers WHERE Key_name = 'uq_tbusers_company_username'`);
      if (userCompIdx.length === 0) {
        await db.query(`ALTER TABLE tbusers ADD UNIQUE KEY uq_tbusers_company_username (company_id, username)`);
        console.log(`✅ Added UNIQUE KEY uq_tbusers_company_username on tbusers(company_id, username)`);
      } else {
        console.log(`ℹ️ Unique index on tbusers(company_id, username) already exists`);
      }
    } catch (err) {
      console.warn(`⚠️ Warning ensuring index on tbusers(company_id, username):`, err.message);
    }

    console.log('🎉 Migration completed successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  }
}

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMigration };
