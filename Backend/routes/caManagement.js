const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('../utils/cloudnary');

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Helper to upload to Cloudinary
const uploadToCloudinary = (fileBuffer, folder = 'stamp') => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        uploadStream.end(fileBuffer);
    });
};

// GET all CAs
router.get('/', async (req, res) => {
    try {
        const query = 'SELECT id, name, email, phone, firm_name, registration_number, designation, membership_number, pan_number, udin, stamp_url, status, created_at, updated_at FROM ca_users ORDER BY id ASC';
        const [results] = await db.query(query);
        res.status(200).json(results);
    } catch (error) {
        console.error('Server error fetching CAs:', error);
        if (error.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ error: 'Database table ca_users does not exist. Please run the SQL command to create it.' });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

// POST a new CA
router.post('/', upload.single('stamp_image'), async (req, res) => {
    const { name, email, phone, firmName, registrationNumber, designation, membershipNumber, panNumber, udin, status, password } = req.body;

    if (!name || !email || !phone || !firmName || !registrationNumber || !password) {
        return res.status(400).json({ error: 'Please provide all mandatory fields' });
    }

    try {
        let hashedPassword = password;
        if (typeof bcrypt !== 'undefined' && bcrypt.hashSync) {
            hashedPassword = bcrypt.hashSync(password, 10);
        }

        let stampUrl = null;
        if (req.file) {
            try {
                const result = await uploadToCloudinary(req.file.buffer, 'stamp');
                stampUrl = result.secure_url;
            } catch (err) {
                console.error("Cloudinary upload error:", err);
            }
        }

        const query = `
            INSERT INTO ca_users 
            (name, email, phone, firm_name, registration_number, designation, membership_number, pan_number, udin, stamp_url, password, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [results] = await db.query(query, [name, email, phone, firmName, registrationNumber, designation || null, membershipNumber || null, panNumber || null, udin || null, stampUrl, hashedPassword, status || 'active']);
        const caId = results.insertId;

        // Sync with central users table
        await db.query(`
            INSERT INTO users (email, password_hash, role, source_table, source_id, status)
            VALUES (?, ?, 'new_ca', 'ca_users', ?, ?)
            ON DUPLICATE KEY UPDATE
                password_hash = VALUES(password_hash),
                status = VALUES(status)
        `, [email.trim().toLowerCase(), hashedPassword, caId, status || 'active']).catch(() => {});

        res.status(201).json({ message: 'CA created successfully', id: caId });
    } catch (error) {
        console.error('Server error creating CA:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email or Registration Number already exists' });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT update CA
router.put('/:id', upload.single('stamp_image'), async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, firmName, registrationNumber, designation, membershipNumber, panNumber, udin, status, password, removeStamp } = req.body;

    if (!name || !email || !phone || !firmName || !registrationNumber) {
        return res.status(400).json({ error: 'Please provide all mandatory fields' });
    }

    try {
        let stampUrl = null;
        if (req.file) {
            try {
                const result = await uploadToCloudinary(req.file.buffer, 'stamp');
                stampUrl = result.secure_url;
            } catch (err) {
                console.error("Cloudinary upload error:", err);
            }
        }

        let query = `
            UPDATE ca_users 
            SET name = ?, email = ?, phone = ?, firm_name = ?, registration_number = ?, designation = ?, membership_number = ?, pan_number = ?, udin = ?, status = ?
        `;
        const queryParams = [name, email, phone, firmName, registrationNumber, designation || null, membershipNumber || null, panNumber || null, udin || null, status || 'active'];

        if (stampUrl) {
            query += `, stamp_url = ?`;
            queryParams.push(stampUrl);
        } else if (removeStamp === 'true') {
            query += `, stamp_url = NULL`;
            
            // Attempt to delete old image from Cloudinary
            const [existingCA] = await db.query('SELECT stamp_url FROM ca_users WHERE id = ?', [id]);
            const oldUrl = existingCA[0]?.stamp_url;
            if (oldUrl && oldUrl.includes("res.cloudinary.com")) {
                try {
                    const urlParts = oldUrl.split('/');
                    const filename = urlParts[urlParts.length - 1];
                    const publicId = `stamp/${filename.split('.')[0]}`;
                    await cloudinary.uploader.destroy(publicId);
                } catch (err) {
                    console.error("Cloudinary delete error:", err);
                }
            }
        }

        if (password) {
            let hashedPassword = password;
            if (typeof bcrypt !== 'undefined' && bcrypt.hashSync) {
                hashedPassword = bcrypt.hashSync(password, 10);
            }
            query += `, password = ?`;
            queryParams.push(hashedPassword);
        }

        query += ` WHERE id = ?`;
        queryParams.push(id);
        
        const [results] = await db.query(query, queryParams);
        
        if (results.affectedRows === 0) {
            return res.status(404).json({ error: 'CA not found' });
        }
        
        res.status(200).json({ message: 'CA updated successfully' });
    } catch (error) {
        console.error('Server error updating CA:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email or Registration Number already exists' });
        }
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE stamp from CA instantly
router.delete('/:id/stamp', async (req, res) => {
    const { id } = req.params;

    try {
        const [existingCA] = await db.query('SELECT stamp_url FROM ca_users WHERE id = ?', [id]);
        const oldUrl = existingCA[0]?.stamp_url;
        
        if (oldUrl && oldUrl.includes("res.cloudinary.com")) {
            try {
                const urlParts = oldUrl.split('/');
                const filename = urlParts[urlParts.length - 1];
                const publicId = `stamp/${filename.split('.')[0]}`;
                await cloudinary.uploader.destroy(publicId);
            } catch (err) {
                console.error("Cloudinary delete error:", err);
            }
        }

        await db.query('UPDATE ca_users SET stamp_url = NULL WHERE id = ?', [id]);
        res.status(200).json({ message: 'Stamp deleted successfully' });
    } catch (error) {
        console.error('Server error deleting stamp:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE a CA
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const query = 'DELETE FROM ca_users WHERE id = ?';
        const [results] = await db.query(query, [id]);
        
        if (results.affectedRows === 0) {
            return res.status(404).json({ error: 'CA not found' });
        }
        
        await db.query('DELETE FROM users WHERE source_table = "ca_users" AND source_id = ?', [id]).catch(() => {});

        res.status(200).json({ message: 'CA deleted successfully' });
    } catch (error) {
        console.error('Server error deleting CA:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
