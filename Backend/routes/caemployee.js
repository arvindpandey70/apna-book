const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db'); // your DB connection module

router.post('/ca-employee', async (req, res) => {
  const { ca_id, name, email, phone, adhar, password } = req.body;
  if (!ca_id || !name || !email || !password) {
    return res.status(400).json({ message: "Required fields missing" });
  }

  let connection;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    connection = await db.getConnection();

    const [result] = await connection.query(
      `INSERT INTO tbcaemployees (ca_id, name, email, phone, adhar, password)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ca_id, name, email, phone, adhar, hashedPassword]
    );

    res.status(201).json({ message: 'CA Employee created', ca_employee_id: result.insertId });
  } catch (err) {
    console.error("Error creating CA employee:", err);
    res.status(500).json({ message: err.message });
  } finally {
    if (connection) connection.release();
  }
});
router.post('/assign-companies-to-ca-employee', async (req, res) => {
  const { ca_employee_id, company_ids } = req.body; // company_ids = [1, 2, 3]

  if (!ca_employee_id || !Array.isArray(company_ids)) {
    return res.status(400).json({ message: "CA Employee ID and company_ids are required" });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Delete old assignments to avoid duplicates or when updating
    await connection.query(
      `DELETE FROM tbcaemployeecompanies WHERE ca_employee_id = ?`,
      [ca_employee_id]
    );

    // Insert new assignments
    for (const companyId of company_ids) {
      console.log("Assigning company:", companyId, "to ca_employee:", ca_employee_id);

      await connection.query(
        `INSERT INTO tbcaemployeecompanies (ca_employee_id, company_id)
         VALUES (?, ?)`,
        [ca_employee_id, companyId]
      );
    }

    await connection.commit();
    res.json({ message: 'Companies assigned successfully' });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error("Error assigning companies:", err);
    res.status(500).json({ message: err.message });
  } finally {
    if (connection) connection.release();
  }
});
router.get('/ca-employee-companies', async (req, res) => {
  const ca_employee_id = req.query.ca_employee_id;
  if (!ca_employee_id) {
    return res.status(400).json({ message: 'ca_employee_id is required' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    const [rows] = await connection.query(
      `SELECT c.*
       FROM tbcompanies c
       INNER JOIN tbcaemployeecompanies a ON c.id = a.company_id
       WHERE a.ca_employee_id = ?`,
      [ca_employee_id]
    );
    res.json({ companies: rows });
  } catch (err) {
    console.error("Error fetching CA employee companies:", err);
    res.status(500).json({ message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Alias for frontend compatibility
router.get('/companies-by-ca-employee', async (req, res) => {
  const ca_employee_id = req.query.ca_employee_id;
  if (!ca_employee_id) {
    return res.status(400).json({ message: 'ca_employee_id is required' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    const [rows] = await connection.query(
      `SELECT c.*
       FROM tbcompanies c
       INNER JOIN tbcaemployeecompanies a ON c.id = a.company_id
       WHERE a.ca_employee_id = ?`,
      [ca_employee_id]
    );
    res.json({ companies: rows });
  } catch (err) {
    console.error("Error fetching CA employee companies:", err);
    res.status(500).json({ message: err.message });
  } finally {
    if (connection) connection.release();
  }
});
router.post('/ca-employee-login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

  let connection;
  try {
    connection = await db.getConnection();
    const [rows] = await connection.query(
      `SELECT id, password FROM tbcaemployees WHERE email = ?`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email/password' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) return res.status(401).json({ message: 'Invalid email/password' });

    // On success return ca_employee_id for frontend storage
    return res.json({ message: 'Login success', ca_employee_id: user.id });
  } catch (err) {
    console.error("Error CA employee login:", err);
    return res.status(500).json({ message: err.message });
  } finally {
    if (connection) connection.release();
  }
});
// Get all CA employees with their assigned companies for a CA
router.get('/ca-employees-with-companies', async (req, res) => {
  const ca_id = req.query.ca_id;
  if (!ca_id) return res.status(400).json({ message: "Missing ca_id" });

  let connection;
  try {
    connection = await db.getConnection();
    // Get CA employees and their assigned companies in a joined query
    const [rows] = await connection.query(
      `SELECT e.id AS employee_id, e.name, e.adhar, e.phone, e.email, 
              GROUP_CONCAT(c.name) AS company_names
         FROM tbcaemployees e
    LEFT JOIN tbcaemployeecompanies ec ON e.id = ec.ca_employee_id
    LEFT JOIN tbcompanies c ON ec.company_id = c.id
        WHERE e.ca_id = ?
        GROUP BY e.id`,
      [ca_id]
    );
    // console.log(rows);
    res.json({ employees: rows });
  } catch (err) {
    console.error("Error fetching CA employees with companies:", err);
    res.status(500).json({ message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/ca-employee-permissions', async (req, res) => {
  const { ca_employee_id } = req.query;
  if (!ca_employee_id) return res.status(400).json({ message: "Missing ca_employee_id" });

  let connection;
  try {
    connection = await db.getConnection();
    const [rows] = await connection.query(
      `SELECT permissions FROM tbcaemployeepermissions WHERE ca_employee_id = ?`,
      [ca_employee_id]
    );

    if (rows.length > 0) {
      let permissions = rows[0].permissions;
      if (typeof permissions === 'string') {
        try {
          permissions = JSON.parse(permissions);
        } catch (e) {
          permissions = {};
        }
      }
      res.json({ permissions: permissions || {} });
    } else {
      res.json({ permissions: {} });
    }
  } catch (err) {
    console.error("Error fetching permissions:", err);
    res.status(500).json({ message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/update-ca-employee-permissions', async (req, res) => {
  const { ca_employee_id, permissions } = req.body;
  if (!ca_employee_id || !permissions) {
    return res.status(400).json({ message: "ca_employee_id and permissions are required" });
  }

  let connection;
  try {
    connection = await db.getConnection();

    // Check if permissions already exist
    const [rows] = await connection.query(
      `SELECT id FROM tbcaemployeepermissions WHERE ca_employee_id = ?`,
      [ca_employee_id]
    );

    if (rows.length > 0) {
      await connection.query(
        `UPDATE tbcaemployeepermissions SET permissions = ? WHERE ca_employee_id = ?`,
        [JSON.stringify(permissions), ca_employee_id]
      );
    } else {
      await connection.query(
        `INSERT INTO tbcaemployeepermissions (ca_employee_id, permissions) VALUES (?, ?)`,
        [ca_employee_id, JSON.stringify(permissions)]
      );
    }

    res.json({ message: 'Permissions updated successfully' });
  } catch (err) {
    console.error("Error updating permissions:", err);
    res.status(500).json({ message: err.message });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;