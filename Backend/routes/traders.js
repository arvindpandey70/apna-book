const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');

// Get all traders (employees from tbemployees) with their details and company counts
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { role } = req.user;
        if (role !== 'super_admin') {
            return res.status(403).json({ error: 'Unauthorized. Super Admin only.' });
        }

        const [traders] = await db.query(`
      SELECT 
        e.id, 
        e.firstName, 
        e.lastName, 
        e.email, 
        e.phoneNumber as phone, 
        e.pan, 
        e.userLimit, 
        e.created_at,
        (SELECT COUNT(*) FROM tbcompanies WHERE employee_id = e.id OR (employee_id IS NULL AND LOWER(TRIM(email)) = LOWER(TRIM(e.email)))) as company_count
      FROM tbemployees e
      ORDER BY e.created_at DESC
    `);

        res.json(traders);
    } catch (err) {
        console.error('Error fetching traders:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update trader limit
router.patch('/:id/limit', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { userLimit } = req.body;

    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Unauthorized.' });
        }

        await db.query('UPDATE tbemployees SET userLimit = ? WHERE id = ?', [userLimit, id]);
        res.json({ message: 'User limit updated successfully', id, userLimit });
    } catch (err) {
        console.error('Error updating trader limit:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete trader
router.delete('/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Unauthorized.' });
        }
        await db.query('DELETE FROM tbemployees WHERE id = ?', [id]);
        res.json({ message: 'Trader deleted successfully', id });
    } catch (err) {
        console.error('Error deleting trader:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get specific trader details, companies, and credentials
router.get('/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Unauthorized.' });
        }

        // Get trader info
        const [trader] = await db.query('SELECT firstName, lastName, email, phoneNumber, pan FROM tbemployees WHERE id = ?', [id]);
        if (trader.length === 0) return res.status(404).json({ error: 'Trader not found' });

        // Get companies and their user accounts
        const [companies] = await db.query(`
            SELECT 
                c.id, c.name, c.financial_year, c.address, c.gst_number,
                u.username, u.password as hasPassword,
                s.start_date as purchaseDate,
                s.is_trial,
                s.end_date,
                DATEDIFF(s.end_date, NOW()) as daysRemaining
            FROM tbcompanies c
            LEFT JOIN tbusers u ON c.id = u.company_id
            LEFT JOIN company_subscriptions s ON c.id = s.company_id
            WHERE c.employee_id = ?
            ORDER BY c.created_at DESC
        `, [id]);

        res.json({
            info: trader[0],
            companies: companies
        });
    } catch (err) {
        console.error('Error fetching trader details:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update company subscription (Admin only)
router.patch('/company/:companyId/subscription', authMiddleware, async (req, res) => {
    const { companyId } = req.params;
    const { startDate, endDate, isTrial, status } = req.body;

    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Unauthorized.' });
        }

        // Check if subscription exists
        const [existing] = await db.query('SELECT * FROM company_subscriptions WHERE company_id = ?', [companyId]);

        if (existing.length === 0) {
            // Create if not exists
            await db.query(`
                INSERT INTO company_subscriptions (company_id, plan, is_trial, status, start_date, end_date)
                VALUES (?, 'manual', ?, ?, ?, ?)
            `, [companyId, isTrial ? 1 : 0, status || 'active', startDate || new Date(), endDate]);
        } else {
            // Update existing
            await db.query(`
                UPDATE company_subscriptions 
                SET start_date = ?, end_date = ?, is_trial = ?, status = ?
                WHERE company_id = ?
            `, [startDate || existing[0].start_date, endDate, isTrial ? 1 : 0, status || 'active', companyId]);
        }

        res.json({ message: 'Subscription updated successfully' });
    } catch (err) {
        console.error('Error updating subscription:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
