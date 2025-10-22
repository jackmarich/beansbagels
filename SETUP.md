# Bean's Bagels - Integrated Ordering System Setup

## Overview
This system replaces the Google Form with an integrated ordering system that includes:
- Dynamic time slot loading with bagel capacity rules (max 6 bagels per 30-minute slot)
- Automatic sold-out slot detection
- Weekly capacity reset (every Monday)
- SMS confirmation via Twilio
- Complete form matching the original Google Form fields

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup (Optional - for SMS)
Copy the example environment file and configure Twilio:
```bash
cp env.example .env
```

Edit `.env` and add your Twilio credentials:
```
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

**Note:** SMS will work without Twilio credentials, but orders will still be processed.

### 3. Start the Server
```bash
npm start
```

The server will start on `http://localhost:3000`

### 4. Test the System
1. Visit `http://localhost:3000/order.html`
2. Fill out the form and submit an order
3. Check that the database is created (`orders.db` file)
4. Verify SMS is sent (if Twilio is configured)

## Features Implemented

### ✅ Form Fields (Matching Google Form)
- **Customer Info**: Name, Building/Room, Phone
- **Day Selection**: Saturday or Sunday
- **Item Selection**: Bagel ($3 + $1 spread) or Breakfast Sandwich ($7 + $1 hashbrown; +$2 double meat)
- **Time Slots**: Dynamic loading based on day and item
- **Bagel Options**: Toasted, Spread (Butter/Cream Cheese), Hash brown
- **Sandwich Options**: Toasted, Meat, Extra meat, Cheese, Egg, Hash brown, Condiments
- **Additional**: Notes, Payment readiness checkbox

### ✅ Capacity Management
- **Bagel Limit**: 6 bagels per 30-minute slot
- **Sandwich Orders**: Don't count against bagel capacity
- **Weekly Reset**: Automatically resets every Monday (America/New_York timezone)
- **Race Condition Protection**: Server-side capacity checking

### ✅ Time Slots
- **Saturday**: 10:00-10:30, 10:30-11:00, 11:00-11:30, 11:30-12:00, 12:00-12:30, 12:30-13:00, 13:00-13:30, 13:30-14:00
- **Sunday**: 10:00-10:30, 10:30-11:00, 11:30-12:00, 12:00-12:30, 12:30-13:00, 13:00-13:30, 13:30-14:00

### ✅ API Endpoints
- `GET /api/slots?day=Saturday&item=bagel` - Returns available time slots
- `POST /api/orders` - Creates new order with capacity validation

### ✅ SMS Integration
- Automatic SMS confirmation on successful orders
- Graceful handling of SMS failures (order still processes)
- E.164 phone number normalization

## Database Schema

### Orders Table
```sql
CREATE TABLE orders (
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
  week_key TEXT NOT NULL
);
```

### Time Slots Table
```sql
CREATE TABLE time_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  slot TEXT NOT NULL,
  UNIQUE(day, slot)
);
```

## Testing Capacity Rules

### Test Bagel Capacity
1. Place 6 bagel orders for the same time slot
2. Try to place a 7th bagel order - should be rejected with "SLOT_SOLD_OUT"
3. Try to place a sandwich order for the same slot - should succeed

### Test Weekly Reset
1. Note the current week key in the database
2. Wait for Monday (or manually adjust system time)
3. Verify that bagel counts reset for new week

### Test SMS
1. Configure Twilio credentials
2. Place a test order
3. Verify SMS is received

## Production Deployment

### Environment Variables
- `PORT`: Server port (default: 3000)
- `TWILIO_ACCOUNT_SID`: Twilio account SID
- `TWILIO_AUTH_TOKEN`: Twilio auth token  
- `TWILIO_PHONE_NUMBER`: Twilio phone number (+1234567890)

### Database
- SQLite database file: `orders.db`
- Automatically created on first run
- Backup regularly for production use

### Security Considerations
- Rate limiting on `/api/orders` endpoint
- Input validation and sanitization
- SQL injection protection via parameterized queries
- CORS configuration for same-origin requests

## Troubleshooting

### Common Issues

**SMS not sending:**
- Check Twilio credentials in `.env`
- Verify phone number format
- Check Twilio account balance

**Time slots not loading:**
- Check server is running
- Verify API endpoint is accessible
- Check browser console for errors

**Database errors:**
- Ensure write permissions in project directory
- Check disk space
- Verify SQLite installation

**Capacity not working:**
- Check week_key calculation
- Verify timezone settings
- Check database queries

## Development

### File Structure
```
beansbagels/
├── server.js              # Express server with API endpoints
├── package.json           # Dependencies and scripts
├── order.html             # Integrated ordering form
├── assets/css/styles.css  # Form styling
├── orders.db              # SQLite database (created automatically)
└── .env                   # Environment variables (optional)
```

### API Documentation

#### GET /api/slots
**Parameters:**
- `day`: "Saturday" or "Sunday"
- `item`: "bagel" or "sandwich"

**Response:**
```json
{
  "day": "Saturday",
  "item": "bagel", 
  "slots": [
    {"label": "10:00–10:30", "value": "10:00-10:30", "soldOut": false},
    {"label": "10:30–11:00", "value": "10:30-11:00", "soldOut": true}
  ]
}
```

#### POST /api/orders
**Request Body:**
```json
{
  "name": "John Doe",
  "building_room": "Building 2 Room 314",
  "day": "Saturday",
  "slot": "10:00-10:30",
  "item": "bagel",
  "options": {
    "toasted": true,
    "spread": "Cream Cheese",
    "hashbrown": true
  },
  "notes": "Extra napkins please",
  "phone": "+15551234567",
  "payment_ready": true
}
```

**Response:**
```json
{
  "orderId": "ord_1234567890_abc123",
  "status": "received",
  "sms": "queued",
  "summary": {
    "day": "Saturday",
    "slot": "10:00-10:30", 
    "item": "bagel",
    "total_cents": 400
  }
}
```

## Support
For issues or questions, contact the development team or check the server logs for detailed error messages.
