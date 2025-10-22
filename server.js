const express = require('express');
const sqlite3 = require('sqlite3').verbose();
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

// Authentication middleware
function requireAuth(req, res, next) {
    const sessionToken = req.cookies.mgmt;

    if (!sessionToken) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    // Simple token validation (in production, use proper JWT or session store)
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

// Database setup
const db = new sqlite3.Database('./orders.db');

// Create tables
db.serialize(() => {
    // Orders table
    db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      day TEXT NOT NULL CHECK (day IN ('Saturday', 'Sunday')),
      slot TEXT NOT NULL,
      item TEXT NOT NULL CHECK (item IN ('bagel', 'sandwich')),
      options TEXT NOT NULL, -- JSON string
      name TEXT NOT NULL,
      building_room TEXT NOT NULL,
      phone TEXT NOT NULL,
      notes TEXT,
      payment_ready BOOLEAN NOT NULL,
      total_cents INTEGER NOT NULL,
      week_key TEXT NOT NULL,
      status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'working', 'ready', 'handed_off', 'canceled', 'no_show')),
      kitchen_notes TEXT,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
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

    // Note: last_updated column cannot be added with DEFAULT CURRENT_TIMESTAMP in SQLite
    // We'll handle this in the application logic instead

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
});

// Helper function to get week key (Monday start in America/New_York)
function getWeekKey(date = new Date()) {
    const nyDate = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const dayOfWeek = nyDate.getDay();
    const monday = new Date(nyDate);
    monday.setDate(nyDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    return monday.toISOString().split('T')[0];
}

// Helper function to normalize phone number to E.164
function normalizePhone(phone) {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');

    // Add +1 if it's a 10-digit US number
    if (digits.length === 10) {
        return `+1${digits}`;
    }

    // Add + if it's an 11-digit number starting with 1
    if (digits.length === 11 && digits.startsWith('1')) {
        return `+${digits}`;
    }

    // Return as-is if it already has country code
    return phone.startsWith('+') ? phone : `+${digits}`;
}

// Helper function to calculate price
function calculatePrice(item, options) {
    let basePrice = 0;

    if (item === 'bagel') {
        basePrice = 300; // $3.00
        if (options.spread && options.spread !== 'None') {
            basePrice += 100; // +$1.00
        }
        if (options.hashbrown) {
            basePrice += 100; // +$1.00
        }
    } else if (item === 'sandwich') {
        basePrice = 700; // $7.00
        if (options.hashbrown && options.hashbrown !== 'none') {
            basePrice += 100; // +$1.00
        }
        if (options.extra_meat) {
            basePrice += 200; // +$2.00
        }
    }

    return basePrice;
}

// API Routes

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
app.get('/api/kitchen/orders', requireAuth, (req, res) => {
    const { week, day, item, slot, status, q, limit = 100 } = req.query;

    let query = `
    SELECT id, created_at, day, slot, item, options, name, building_room, phone, notes, 
           payment_ready, total_cents, week_key, status, kitchen_notes
    FROM orders 
    WHERE 1=1
  `;
    const params = [];

    if (week) {
        query += ' AND week_key = ?';
        params.push(week);
    } else {
        // Default to current week
        const currentWeek = getWeekKey();
        query += ' AND week_key = ?';
        params.push(currentWeek);
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

    if (status) {
        const statuses = status.split(',');
        const placeholders = statuses.map(() => '?').join(',');
        query += ` AND status IN (${placeholders})`;
        params.push(...statuses);
    }

    if (q) {
        query += ' AND (name LIKE ? OR phone LIKE ? OR building_room LIKE ?)';
        const searchTerm = `%${q}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY slot, created_at LIMIT ?';
    params.push(parseInt(limit));

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        const orders = rows.map(row => ({
            ...row,
            options: JSON.parse(row.options)
        }));

        res.json({ orders });
    });
});

// Update order status
app.patch('/api/manage/orders/:id/status', requireAuth, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['queued', 'working', 'ready', 'handed_off', 'canceled', 'no_show'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    db.run(
        'UPDATE orders SET status = ? WHERE id = ?',
        [status, id],
        function (err) {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Order not found' });
            }

            res.json({ success: true });
        }
    );
});

// Update order (for moving slots, etc.)
app.patch('/api/manage/orders/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const { day, slot, item, overrideCapacity = false } = req.body;

    // Get current order
    db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // If changing to a bagel order in a different slot, check capacity
        if (item === 'bagel' && (day !== order.day || slot !== order.slot)) {
            const weekKey = getWeekKey();

            db.get(
                'SELECT COUNT(*) as count FROM orders WHERE day = ? AND slot = ? AND item = ? AND week_key = ? AND id != ?',
                [day, slot, 'bagel', weekKey, id],
                (err, result) => {
                    if (err) {
                        console.error('Database error:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }

                    if (result.count >= 6 && !overrideCapacity) {
                        return res.status(409).json({
                            error: 'SLOT_SOLD_OUT',
                            message: 'That slot is full. Use overrideCapacity=true to force the move.'
                        });
                    }

                    // Proceed with update
                    updateOrder();
                }
            );
        } else {
            updateOrder();
        }

        function updateOrder() {
            const updates = [];
            const params = [];

            if (day) {
                updates.push('day = ?');
                params.push(day);
            }
            if (slot) {
                updates.push('slot = ?');
                params.push(slot);
            }
            if (item) {
                updates.push('item = ?');
                params.push(item);
            }

            // Note: last_updated column not available in existing database
            params.push(id);

            const query = `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`;

            db.run(query, params, function (err) {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }

                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Order not found' });
                }

                res.json({ success: true });
            });
        }
    });
});

// Resend SMS
app.post('/api/manage/orders/:id/resend-sms', requireAuth, (req, res) => {
    const { id } = req.params;
    const { message } = req.body;

    db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
            return res.status(400).json({ error: 'SMS not configured' });
        }

        const defaultMessage = `Your ${order.item === 'bagel' ? 'Bagel' : 'Breakfast Sandwich'} is ready for pickup!`;
        const smsMessage = message || defaultMessage;

        twilioClient.messages.create({
            body: smsMessage,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: order.phone
        }).then(() => {
            res.json({ success: true, message: 'SMS sent successfully' });
        }).catch((smsErr) => {
            console.error('SMS error:', smsErr);
            res.status(500).json({ error: 'Failed to send SMS' });
        });
    });
});

// Delete order
app.delete('/api/manage/orders/:id', requireAuth, (req, res) => {
    const { id } = req.params;

    db.run('DELETE FROM orders WHERE id = ?', [id], function (err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json({ success: true });
    });
});

// Reset weekend orders (delete all orders for current week)
app.post('/api/manage/reset-weekend', requireAuth, (req, res) => {
    const weekKey = getWeekKey();

    db.run('DELETE FROM orders WHERE week_key = ?', [weekKey], function (err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json({
            success: true,
            message: `Reset complete. Deleted ${this.changes} orders for week ${weekKey}`,
            deletedCount: this.changes
        });
    });
});

// Get slots with capacity info
app.get('/api/manage/slots', requireAuth, (req, res) => {
    const { week, day, item } = req.query;

    if (!week || !day || !item) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Get all slots for the day
    db.all(
        'SELECT slot FROM time_slots WHERE day = ? ORDER BY slot',
        [day],
        (err, rows) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            const slots = rows.map(row => ({ slot: row.slot }));

            // For bagel orders, check capacity
            if (item === 'bagel') {
                const slotChecks = slots.map(slotData => {
                    return new Promise((resolve) => {
                        db.get(
                            'SELECT COUNT(*) as count FROM orders WHERE day = ? AND slot = ? AND item = ? AND week_key = ?',
                            [day, slotData.slot, 'bagel', week],
                            (err, result) => {
                                if (err) {
                                    console.error('Database error:', err);
                                    resolve({ ...slotData, bagelsUsed: 0, bagelsCap: 6 });
                                } else {
                                    resolve({
                                        ...slotData,
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
            } else {
                // For sandwich orders, no capacity limit
                const results = slots.map(slot => ({
                    ...slot,
                    bagelsUsed: 0,
                    bagelsCap: 6
                }));
                res.json({ slots: results });
            }
        }
    );
});

// GET /api/slots - Get available time slots
app.get('/api/slots', (req, res) => {
    const { day, item } = req.query;

    if (!day || !item) {
        return res.status(400).json({ error: 'Missing required parameters: day and item' });
    }

    if (!['Saturday', 'Sunday'].includes(day)) {
        return res.status(400).json({ error: 'Invalid day. Must be Saturday or Sunday' });
    }

    if (!['bagel', 'sandwich'].includes(item)) {
        return res.status(400).json({ error: 'Invalid item. Must be bagel or sandwich' });
    }

    const weekKey = getWeekKey();

    // Get all slots for the day
    db.all(
        'SELECT slot FROM time_slots WHERE day = ? ORDER BY slot',
        [day],
        (err, rows) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            const slots = rows.map(row => ({ slot: row.slot }));

            // Check total capacity for each slot (both bagels and sandwiches count toward the 6-order limit)
            const slotChecks = slots.map(slotData => {
                return new Promise((resolve) => {
                    db.get(
                        'SELECT COUNT(*) as count FROM orders WHERE day = ? AND slot = ? AND week_key = ?',
                        [day, slotData.slot, weekKey],
                        (err, result) => {
                            if (err) {
                                console.error('Database error:', err);
                                resolve({ ...slotData, soldOut: true });
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
                const formattedSlots = results.map(result => ({
                    label: result.slot.replace('-', '–'),
                    value: result.slot,
                    soldOut: result.soldOut
                }));

                res.json({
                    day,
                    item,
                    slots: formattedSlots
                });
            });
        }
    );
});

// POST /api/orders - Create a new order
app.post('/api/orders', (req, res) => {
    const {
        name,
        building_room,
        day,
        slot,
        item,
        options,
        notes,
        phone,
        payment_ready
    } = req.body;

    // Validate required fields
    const requiredFields = ['name', 'building_room', 'day', 'slot', 'item', 'phone', 'payment_ready'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
        return res.status(400).json({
            error: 'Missing required fields',
            missing: missingFields
        });
    }

    // Validate day and item
    if (!['Saturday', 'Sunday'].includes(day)) {
        return res.status(400).json({ error: 'Invalid day' });
    }

    if (!['bagel', 'sandwich'].includes(item)) {
        return res.status(400).json({ error: 'Invalid item' });
    }

    // Normalize phone number
    const normalizedPhone = normalizePhone(phone);

    // Calculate price
    const totalCents = calculatePrice(item, options || {});

    // Get week key
    const weekKey = getWeekKey();

    // Check total capacity for the slot (both bagels and sandwiches count toward the 6-order limit)
    db.get(
        'SELECT COUNT(*) as count FROM orders WHERE day = ? AND slot = ? AND week_key = ?',
        [day, slot, weekKey],
        (err, result) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (result.count >= 6) {
                return res.status(409).json({
                    error: 'SLOT_SOLD_OUT',
                    message: 'That slot just sold out — please pick another time'
                });
            }

            // Proceed with order creation
            createOrder();
        }
    );

    function createOrder() {
        const orderId = `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        db.run(
            `INSERT INTO orders (day, slot, item, options, name, building_room, phone, notes, payment_ready, total_cents, week_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [day, slot, item, JSON.stringify(options || {}), name, building_room, normalizedPhone, notes || '', payment_ready, totalCents, weekKey],
            function (err) {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }

                // Send SMS confirmation
                let smsStatus = 'queued';
                if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
                    const smsMessage = `Thanks! We received your order for ${item === 'bagel' ? 'Bagel' : 'Breakfast Sandwich'} on ${day} ${slot.replace('-', '–')}. Reply STOP to opt out.`;

                    twilioClient.messages.create({
                        body: smsMessage,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: normalizedPhone
                    }).then(() => {
                        console.log('SMS sent successfully');
                    }).catch((smsErr) => {
                        console.error('SMS error:', smsErr);
                        smsStatus = 'failed';
                    });
                } else {
                    console.log('SMS not configured - skipping SMS');
                    smsStatus = 'not_configured';
                }

                res.status(201).json({
                    orderId,
                    status: 'received',
                    sms: smsStatus,
                    summary: {
                        day,
                        slot,
                        item,
                        total_cents: totalCents
                    }
                });
            }
        );
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to view the site`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});
