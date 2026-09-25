const mysql = require("mysql2/promise");
require("dotenv").config();

const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

if (process.env.DB_SSL === "true" || (process.env.DB_HOST && process.env.DB_HOST.includes("aivencloud.com"))) {
  dbConfig.ssl = { rejectUnauthorized: false };
}

const db = mysql.createPool(dbConfig);

//  Test DB Connection
(async () => {
  try {
    const connection = await db.getConnection();
    console.log("MySQL Connected Successfully");
    connection.release();
  } catch (err) {
    console.error("MySQL Connection Failed:");
    console.error(err.message);
  }
})();

module.exports = db;




// db.js
// const mysql = require('mysql2/promise');

// const db = mysql.createPool({
//   // host: 'localhost',
//   // user: 'root',
//   // password: '',
//   // database: 'dbEnegix'

//   host: '185.27.134.175',
//   user: 'if0_39475678',
//   password: 'OWxmEIee5nFl',
//   database: 'if0_39475678_dbenegix'
// });

// module.exports = db;