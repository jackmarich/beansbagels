const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { sql } = require('@vercel/postgres');
const cors = require('cors');
const twilio = require('twilio');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static('.'));

// Kitchen password (hardcoded as requested)
const KITCHEN_PASSWORD = 'lafayette';
const SESSION_SECRET = process.env.SESSION_SECRET || 'beansbagels-secret-key';

// Database setup - use SQLite for local development, PostgreSQL for production
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
let db = null;

if (isProduction) {
    console.log('Using Vercel Postgres for production');
} else {
    db = new sqlite3.Database('./orders.db');
    console.log('Using SQLite for local development');
}

// Database helper functions
async function dbQuery(query, params = []) {
    if (isProduction) {
        return await sql.query(query, params);
    } else {
        return new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve({ rows });
            });
        });
    }
}

async function dbGet(query, params = []) {
    if (isProduction) {
        const result = await sql.query(query, params);
        return result.rows[0] || null;
    } else {
        return new Promise((resolve, reject) => {
            db.get(query, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
}

async function dbRun(query, params = []) {
    if (isProduction) {
        const result = await sql.query(query, params);
        return { changes: result.rowCount || 0, lastID: result.insertId || null };
    } else {
        return new Promise((resolve, reject) => {
            db.run(query, params, function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes, lastID: this.lastID });
            });
        });
    }
}

// Create tables
async function createTables() {
    try {
        if (isProduction) {
            // PostgreSQL table creation
            await sql`
                CREATE TABLE IF NOT EXISTS orders (
                    id SERIAL PRIMARY KEY,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    day TEXT NOT NULL CHECK (day IN ('Saturday', 'Sunday')),
                    slot TEXT NOT NULL,
                    item TEXT NOT NULL CHECK (item IN ('bagel', 'sandwich')),
                    options TEXT NOT NULL,
                    name TEXT NOT NULL,
                    building_room TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    notes TEXT,
                    payment_ready BOOLEAN NOT NULL,
                    total_cents INTEGER NOT NULL,
                    week_key TEXT NOT NULL,
                    status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'working', 'ready', 'handed_off', 'canceled', 'no_show')),
                    kitchen_notes TEXT
                )
            `;
        } else {
            // SQLite table creation
            await new Promise((resolve, reject) => {
                db.serialize(() => {
                    db.run(`
                        CREATE TABLE IF NOT EXISTS orders (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            day TEXT NOT NULL CHECK (day IN ('Saturday', 'Sunday')),
                            slot TEXT NOT NULL,
                            item TEXT NOT NULL CHECK (item IN ('bagel', 'sandwich')),
                            options TEXT NOT NULL,
                            name TEXT NOT NULL,
                            building_room TEXT NOT NULL,
                            phone TEXT NOT NULL,
                            notes TEXT,
                            payment_ready BOOLEAN NOT NULL,
                            total_cents INTEGER NOT NULL,
                            week_key TEXT NOT NULL,
                            status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'working', 'ready', 'handed_off', 'canceled', 'no_show')),
                            kitchen_notes TEXT
                        )
                    `);

                    // Add status column to existing orders if it doesn't exist
                    db.run(`ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'queued'`, (err) => {
                        if (err && !err.message.includes('duplicate column name')) {
                            console.error('Error adding status column:', err);
                        }
                    });

                    db.run(`ALTER TABLE orders ADD COLUMN kitchen_notes TEXT`, (err) => {
                        if (err && !err.message.includes('duplicate column name')) {
                            console.error('Error adding kitchen_notes column:', err);
                        }
                    });

                    // Time slots configuration
                    db.run(`
                        CREATE TABLE IF NOT EXISTS time_slots (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            day TEXT NOT NULL,
                            slot TEXT NOT NULL,
                            UNIQUE(day, slot)
                        )
                    `);

                    // Insert default time slots
                    const saturdaySlots = [
                        '10:00-10:30', '10:30-11:00', '11:00-11:30', '11:30-12:00',
                        '12:00-12:30', '12:30-13:00', '13:00-13:30', '13:30-14:00'
                    ];

                    const sundaySlots = [
                        '10:00-10:30', '10:30-11:00', '11:30-12:00', '12:00-12:30',
                        '12:30-13:00', '13:00-13:30', '13:30-14:00'
                    ];

                    // Insert Saturday slots
                    saturdaySlots.forEach(slot => {
                        db.run(
                            'INSERT OR IGNORE INTO time_slots (day, slot) VALUES (?, ?)',
                            ['Saturday', slot]
                        );
                    });

                    // Insert Sunday slots
                    sundaySlots.forEach(slot => {
                        db.run(
                            'INSERT OR IGNORE INTO time_slots (day, slot) VALUES (?, ?)',
                            ['Sunday', slot]
                        );
                    });

                    resolve();
                });
            });
        }
        console.log('Database tables created successfully');
    } catch (error) {
        console.error('Error creating tables:', error);
    }
}

// Initialize database
createTables();

// Authentication middleware
function requireAuth(req, res, next) {
    const sessionToken = req.cookies.mgmt;

    if (!sessionToken) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const expectedToken = crypto.createHash('sha256').update(KITCHEN_PASSWORD + SESSION_SECRET).digest('hex');

    if (sessionToken !== expectedToken) {
        return res.status(401).json({ error: 'Invalid session' });
    }

    next();
}

// Initialize Twilio client (only if credentials are provided)
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
    );
}

// Helper function to get week key (Monday start in America/New_York)
function getWeekKey(date = new Date()) {
    const nyDate = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const dayOfWeek = nyDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Sunday = 0, so -6 to get Monday
    const monday = new Date(nyDate);
    monday.setDate(nyDate.getDate() + mondayOffset);
    return monday.toISOString().split('T')[0]; // YYYY-MM-DD format
}

// Helper function to normalize phone numbers
function normalizePhoneNumber(phone) {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');

    // If it starts with 1 and has 11 digits, remove the 1
    if (digits.length === 11 && digits.startsWith('1')) {
        return '+' + digits;
    }

    // If it has 10 digits, add +1
    if (digits.length === 10) {
        return '+1' + digits;
    }

    // Otherwise, add + if not present
    return digits.startsWith('+') ? digits : '+' + digits;
}

// Helper function to calculate order total
function calculateOrderTotal(item, options) {
    let total = 0;

    if (item === 'bagel') {
        total = 300; // $3.00 base price
        if (options.spread && options.spread !== 'None') {
            total += 100; // +$1.00 for spread
        }
        if (options.hashbrown) {
            total += 100; // +$1.00 for hash brown
        }
    } else if (item === 'sandwich') {
        total = 700; // $7.00 base price
        if (options.extraMeat && options.extraMeat !== 'none') {
            total += 200; // +$2.00 for extra meat
        }
        if (options.hashbrown && options.hashbrown !== 'none') {
            total += 100; // +$1.00 for hash brown
        }
    }

    return total;
}

// Kitchen Authentication
app.post('/api/manage/login', (req, res) => {
    const { password } = req.body;

    if (password === KITCHEN_PASSWORD) {
        const sessionToken = crypto.createHash('sha256').update(KITCHEN_PASSWORD + SESSION_SECRET).digest('hex');

        res.cookie('mgmt', sessionToken, {
            httpOnly: true,
            secure: false, // Set to true in production with HTTPS
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

app.post('/api/manage/logout', (req, res) => {
    res.clearCookie('mgmt');
    res.json({ success: true });
});

// Kitchen Dashboard API
app.get('/api/kitchen/orders', requireAuth, async (req, res) => {
    try {
        const { week, day, item, slot, status, q, limit = 100 } = req.query;
        const weekKey = week || getWeekKey();

        let query = `
            SELECT id, created_at, day, slot, item, options, name, building_room, phone, notes, 
                   payment_ready, total_cents, week_key, status, kitchen_notes, created_at as last_updated
            FROM orders 
            WHERE 1=1
        `;
        const params = [];

        if (weekKey) {
            query += ' AND week_key = ?';
            params.push(weekKey);
        }

        if (day && day !== 'all') {
            query += ' AND day = ?';
            params.push(day);
        }

        if (item && item !== 'all') {
            query += ' AND item = ?';
            params.push(item);
        }

        if (slot) {
            query += ' AND slot = ?';
            params.push(slot);
        }

        if (status && status !== 'all') {
            query += ' AND status = ?';
            params.push(status);
        }

        if (q) {
            query += ' AND (name LIKE ? OR phone LIKE ? OR building_room LIKE ?)';
            const searchTerm = `%${q}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        query += ' ORDER BY slot, created_at LIMIT ?';
        params.push(parseInt(limit));

        const result = await dbQuery(query, params);
        const orders = result.rows.map(order => ({
            ...order,
            options: JSON.parse(order.options)
        }));

        res.json({ orders });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Update order status
app.patch('/api/manage/orders/:id/status', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        await dbRun(
            'UPDATE orders SET status = ? WHERE id = ?',
            [status, id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Update order (for moving slots, etc.)
app.patch('/api/manage/orders/:id', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { day, slot, item, overrideCapacity = false } = req.body;

    try {
        // If moving a bagel order to a different slot, check capacity
        if (item === 'bagel' && !overrideCapacity) {
            const weekKey = getWeekKey();
            const countResult = await dbGet(
                'SELECT COUNT(*) as count FROM orders WHERE day = ? AND slot = ? AND week_key = ?',
                [day, slot, weekKey]
            );

            if (countResult.count >= 6) {
                return res.status(409).json({
                    error: 'SLOT_SOLD_OUT',
                    message: 'That slot is full. Use overrideCapacity=true to force the move.'
                });
            }
        }

        const updateFields = [];
        const params = [];

        if (day) {
            updateFields.push('day = ?');
            params.push(day);
        }
        if (slot) {
            updateFields.push('slot = ?');
            params.push(slot);
        }
        if (item) {
            updateFields.push('item = ?');
            params.push(item);
        }

        if (updateFields.length > 0) {
            params.push(id);
            await dbRun(
                `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`,
                params
            );

            res.json({ success: true });
        } else {
            res.status(400).json({ error: 'No fields to update' });
        }
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Resend SMS
app.post('/api/manage/orders/:id/resend-sms', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { message } = req.body;

    try {
        const order = await dbGet('SELECT * FROM orders WHERE id = ?', [id]);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (twilioClient) {
            const smsMessage = message || `Your order is ready for pickup! ${order.item} for ${order.day} ${order.slot}.`;

            await twilioClient.messages.create({
                body: smsMessage,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: order.phone
            });

            res.json({ success: true, message: 'SMS sent successfully' });
        } else {
            res.status(500).json({ error: 'SMS not configured' });
        }
    } catch (error) {
        console.error('SMS error:', error);
        res.status(500).json({ error: 'Failed to send SMS' });
    }
});

// Delete order
app.delete('/api/manage/orders/:id', requireAuth, async (req, res) => {
    const { id } = req.params;

    try {
        await dbRun('DELETE FROM orders WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Reset weekend orders (delete all orders for current week)
app.post('/api/manage/reset-weekend', requireAuth, async (req, res) => {
    const weekKey = getWeekKey();

    try {
        const result = await dbRun('DELETE FROM orders WHERE week_key = ?', [weekKey]);

        res.json({
            success: true,
            message: `Reset complete. Deleted ${result.changes} orders for week ${weekKey}`,
            deletedCount: result.changes
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Get slots with capacity info
app.get('/api/manage/slots', requireAuth, async (req, res) => {
    const { week, day, item } = req.query;
    const weekKey = week || getWeekKey();

    try {
        if (isProduction) {
            // For PostgreSQL, we'll use a simplified approach
            const slots = [
                '10:00-10:30', '10:30-11:00', '11:00-11:30', '11:30-12:00',
                '12:00-12:30', '12:30-13:00', '13:00-13:30', '13:30-14:00'
            ];

            const results = [];
            for (const slot of slots) {
                const countResult = await dbGet(
                    'SELECT COUNT(*) as count FROM orders WHERE day = ? AND slot = ? AND week_key = ?',
                    [day, slot, weekKey]
                );

                results.push({
                    slot,
                    bagelsUsed: countResult.count,
                    bagelsCap: 6
                });
            }

            res.json({ slots: results });
        } else {
            // SQLite version
            db.all(
                'SELECT slot FROM time_slots WHERE day = ? ORDER BY slot',
                [day],
                (err, timeSlots) => {
                    if (err) {
                        console.error('Database error:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }

                    const slotChecks = timeSlots.map(slotData => {
                        return new Promise((resolve) => {
                            db.get(
                                'SELECT COUNT(*) as count FROM orders WHERE day = ? AND slot = ? AND week_key = ?',
                                [day, slotData.slot, weekKey],
                                (err, result) => {
                                    if (err) {
                                        console.error('Database error:', err);
                                        resolve({
                                            slot: slotData.slot,
                                            bagelsUsed: 0,
                                            bagelsCap: 6
                                        });
                                    } else {
                                        resolve({
                                            slot: slotData.slot,
                                            bagelsUsed: result.count,
                                            bagelsCap: 6
                                        });
                                    }
                                }
                            );
                        });
                    });

                    Promise.all(slotChecks).then(results => {
                        res.json({ slots: results });
                    });
                }
            );
        }
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /api/slots - Get available time slots
app.get('/api/slots', async (req, res) => {
    const { day, item } = req.query;
    const weekKey = getWeekKey();

    if (!day || !item) {
        return res.status(400).json({ error: 'Day and item are required' });
    }

    try {
        if (isProduction) {
            // For PostgreSQL, use hardcoded slots
            const slots = [
                '10:00-10:30', '10:30-11:00', '11:00-11:30', '11:30-12:00',
                '12:00-12:30', '12:30-13:00', '13:00-13:30', '13:30-14:00'
            ];

            const results = [];
            for (const slot of slots) {
                const countResult = await dbGet(
                    'SELECT COUNT(*) as count FROM orders WHERE day = ? AND slot = ? AND week_key = ?',
                    [day, slot, weekKey]
                );

                results.push({
                    label: slot.replace('-', '–'),
                    value: slot,
                    soldOut: countResult.count >= 6
                });
            }

            res.json({
                day,
                item,
                slots: results
            });
        } else {
            // SQLite version
            db.all(
                'SELECT slot FROM time_slots WHERE day = ? ORDER BY slot',
                [day],
                (err, timeSlots) => {
                    if (err) {
                        console.error('Database error:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }

                    const slotChecks = timeSlots.map(slotData => {
                        return new Promise((resolve) => {
                            db.get(
                                'SELECT COUNT(*) as count FROM orders WHERE day = ? AND slot = ? AND week_key = ?',
                                [day, slotData.slot, weekKey],
                                (err, result) => {
                                    if (err) {
                                        console.error('Database error:', err);
                                        resolve({
                                            ...slotData,
                                            soldOut: false
                                        });
                                    } else {
                                        resolve({
                                            ...slotData,
                                            soldOut: result.count >= 6
                                        });
                                    }
                                }
                            );
                        });
                    });

                    Promise.all(slotChecks).then(results => {
                        const formattedSlots = results.map(slot => ({
                            label: slot.slot.replace('-', '–'),
                            value: slot.slot,
                            soldOut: slot.soldOut
                        }));

                        res.json({
                            day,
                            item,
                            slots: formattedSlots
                        });
                    });
                }
            );
        }
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// POST /api/orders - Create a new order
app.post('/api/orders', async (req, res) => {
    const { name, building_room, day, slot, item, options, notes, phone, payment_ready } = req.body;

    // Validate required fields
    const requiredFields = ['name', 'building_room', 'day', 'slot', 'item', 'phone', 'payment_ready'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
        return res.status(400).json({
            error: 'Missing required fields',
            missing: missingFields
        });
    }

    try {
        const weekKey = getWeekKey();
        const normalizedPhone = normalizePhoneNumber(phone);
        const totalCents = calculateOrderTotal(item, options);

        // Check capacity before inserting
        const countResult = await dbGet(
            'SELECT COUNT(*) as count FROM orders WHERE day = ? AND slot = ? AND week_key = ?',
            [day, slot, weekKey]
        );

        if (countResult.count >= 6) {
            return res.status(409).json({
                error: 'SLOT_SOLD_OUT',
                message: 'That slot just sold out — please pick another time'
            });
        }

        // Insert the order
        const result = await dbRun(
            `INSERT INTO orders (day, slot, item, options, name, building_room, phone, notes, payment_ready, total_cents, week_key, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued')`,
            [day, slot, item, JSON.stringify(options), name, building_room, normalizedPhone, notes, payment_ready, totalCents, weekKey]
        );

        // Send SMS confirmation
        let smsStatus = 'not_configured';
        if (twilioClient) {
            try {
                const smsMessage = `Thanks! We received your order for ${item} on ${day} ${slot}. Reply STOP to opt out.`;
                await twilioClient.messages.create({
                    body: smsMessage,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: normalizedPhone
                });
                smsStatus = 'sent';
                console.log('SMS sent successfully');
            } catch (smsErr) {
                console.error('SMS error:', smsErr);
                smsStatus = 'failed';
            }
        } else {
            console.log('SMS not configured - skipping SMS');
        }

        res.status(201).json({
            orderId: result.lastID,
            status: 'received',
            sms: smsStatus,
            summary: {
                day,
                slot,
                item,
                total_cents: totalCents
            }
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to view the site`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    if (db) {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('Database connection closed.');
            }
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});
