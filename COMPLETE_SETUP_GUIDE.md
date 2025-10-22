# Bean's Bagels - Complete Setup Guide

## 🎯 Overview
This guide will walk you through setting up the complete Bean's Bagels ordering system with integrated kitchen dashboard and SMS notifications.

## 📋 Prerequisites
- Node.js (version 14 or higher)
- A Twilio account (for SMS functionality)
- Basic terminal/command line knowledge

## 🚀 Step-by-Step Setup

### 1. Install Dependencies
```bash
cd /path/to/beansbagels
npm install
```

### 2. Set Up SMS (Twilio) - Optional but Recommended

#### Get Twilio Credentials:
1. Go to [Twilio Console](https://console.twilio.com/)
2. Sign up for a free account (includes $15 credit)
3. Get your credentials:
   - **Account SID**: Found on the main dashboard
   - **Auth Token**: Found on the main dashboard (click to reveal)
   - **Phone Number**: Buy a phone number from Twilio Console → Phone Numbers → Manage → Buy a number

#### Configure Environment Variables:
1. Copy the example environment file:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` file with your Twilio credentials:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token_here
   TWILIO_PHONE_NUMBER=+1234567890
   PORT=3000
   ```

### 3. Start the Server
```bash
npm start
```

The server will start on `http://localhost:3000`

### 4. Test the System

#### Test Ordering System:
1. Visit `http://localhost:3000/order.html`
2. Fill out a test order
3. Submit and verify it appears in the kitchen dashboard

#### Test Kitchen Dashboard:
1. Visit `http://localhost:3000/kitchen.html`
2. Login with password: `lafayette`
3. Verify you can see orders and manage them

#### Test SMS (if configured):
1. Place a test order with a real phone number
2. Check that you receive an SMS confirmation
3. In kitchen dashboard, mark order as "Ready" and click "SMS" to send pickup notification

## 🔧 Configuration Options

### Kitchen Password
- **Current**: `lafayette` (hardcoded in server.js)
- **To Change**: Edit line 19 in `server.js`:
  ```javascript
  const KITCHEN_PASSWORD = 'your_new_password';
  ```

### Auto-refresh Interval
- **Current**: 5 seconds
- **To Change**: Edit line in `kitchen.html`:
  ```javascript
  refreshInterval = setInterval(refreshOrders, 5000); // Change 5000 to desired milliseconds
  ```

### Bagel Capacity Limit
- **Current**: 6 bagels per 30-minute slot
- **To Change**: Edit the capacity checks in `server.js` (search for `>= 6`)

## 📱 SMS Setup Details

### Twilio Account Setup:
1. **Sign Up**: Go to [twilio.com](https://www.twilio.com) and create account
2. **Verify Phone**: Verify your personal phone number
3. **Buy Number**: Purchase a phone number for sending SMS
4. **Get Credentials**: Copy Account SID, Auth Token, and Phone Number

### SMS Features:
- **Order Confirmation**: Sent automatically when order is placed
- **Pickup Notification**: Sent from kitchen dashboard when order is ready
- **Custom Messages**: Kitchen staff can send custom messages

### SMS Costs:
- **Free Trial**: $15 credit included
- **SMS Cost**: ~$0.0075 per message in US
- **Phone Number**: ~$1/month

## 🗄️ Database Management

### Database File:
- **Location**: `orders.db` (created automatically)
- **Type**: SQLite (file-based, no separate server needed)

### Backup Database:
```bash
cp orders.db orders_backup_$(date +%Y%m%d).db
```

### Reset Database (if needed):
```bash
rm orders.db
npm start  # Will recreate database with fresh tables
```

## 🔍 Troubleshooting

### Common Issues:

#### 1. "Port 3000 already in use"
```bash
# Kill process using port 3000
lsof -ti:3000 | xargs kill -9
# Or use a different port
PORT=3001 npm start
```

#### 2. "SMS not configured" messages
- Check that `.env` file exists and has correct Twilio credentials
- Verify Twilio account has sufficient balance
- Test Twilio credentials in Twilio Console

#### 3. Kitchen dashboard shows "Authentication required"
- Clear browser cookies for localhost:3000
- Try logging in again with password `lafayette`

#### 4. Orders not appearing in kitchen dashboard
- Check that orders have `status` field (should be 'queued' by default)
- Verify database has the new columns (restart server if needed)

#### 5. Database errors about missing columns
```bash
# Delete database and restart (will recreate with correct schema)
rm orders.db
npm start
```

### Debug Mode:
Add this to your `.env` file to see more detailed logs:
```
DEBUG=true
```

## 🧪 Testing Checklist

### Ordering System:
- [ ] Can place bagel orders
- [ ] Can place sandwich orders
- [ ] All form fields work correctly
- [ ] Time slots load dynamically
- [ ] Capacity limits work (try 7 bagel orders for same slot)
- [ ] SMS confirmation received (if configured)

### Kitchen Dashboard:
- [ ] Can login with password `lafayette`
- [ ] Can see orders in correct status lanes
- [ ] Can drag orders between lanes
- [ ] Can use action buttons (Start, Ready, Handed Off, SMS)
- [ ] Can move orders to different time slots
- [ ] Can cancel orders
- [ ] Filters work (day, item, status, search)
- [ ] Auto-refresh works
- [ ] Sound notifications work (if enabled)

### SMS System:
- [ ] Order confirmation SMS received
- [ ] Pickup notification SMS sent from kitchen
- [ ] Custom SMS messages work
- [ ] SMS works for both bagel and sandwich orders

## 🚀 Production Deployment

### For Production Use:

#### 1. Environment Variables:
```bash
# Production .env file
TWILIO_ACCOUNT_SID=your_production_sid
TWILIO_AUTH_TOKEN=your_production_token
TWILIO_PHONE_NUMBER=+1234567890
PORT=3000
SESSION_SECRET=your_secure_random_string
```

#### 2. Security Considerations:
- Change default kitchen password
- Use HTTPS in production
- Set secure cookie flags
- Add rate limiting
- Regular database backups

#### 3. Process Management:
```bash
# Install PM2 for process management
npm install -g pm2

# Start with PM2
pm2 start server.js --name "beansbagels"

# Auto-restart on server reboot
pm2 startup
pm2 save
```

#### 4. Reverse Proxy (Nginx):
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 📊 Monitoring & Maintenance

### Daily Tasks:
- Check SMS delivery rates in Twilio Console
- Monitor order volume and capacity usage
- Verify kitchen dashboard is accessible

### Weekly Tasks:
- Backup database
- Check Twilio account balance
- Review any error logs

### Monthly Tasks:
- Update dependencies: `npm update`
- Review and rotate session secrets
- Analyze order patterns and capacity needs

## 🆘 Support & Resources

### Documentation:
- [Twilio SMS API](https://www.twilio.com/docs/sms)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)

### Getting Help:
1. Check this guide first
2. Review server logs for error messages
3. Test individual components (ordering, kitchen, SMS)
4. Verify all environment variables are set correctly

## 🎉 Success Indicators

Your system is working correctly when:
- ✅ Customers can place orders at `/order.html`
- ✅ Kitchen staff can manage orders at `/kitchen.html` (password: `lafayette`)
- ✅ SMS notifications are sent and received
- ✅ Orders flow through: Queued → Working → Ready → Handed Off
- ✅ Bagel capacity limits are enforced (6 per slot)
- ✅ System auto-refreshes and shows real-time updates

## 📝 Quick Reference

### URLs:
- **Order Form**: `http://localhost:3000/order.html`
- **Kitchen Dashboard**: `http://localhost:3000/kitchen.html`
- **Home Page**: `http://localhost:3000/index.html`

### Passwords:
- **Kitchen Dashboard**: `lafayette`

### Key Files:
- **Server**: `server.js`
- **Order Form**: `order.html`
- **Kitchen Dashboard**: `kitchen.html`
- **Database**: `orders.db`
- **Environment**: `.env`

### Commands:
```bash
# Start server
npm start

# Install dependencies
npm install

# Kill server
lsof -ti:3000 | xargs kill -9

# Backup database
cp orders.db orders_backup_$(date +%Y%m%d).db
```

---

**Need Help?** If you encounter any issues not covered in this guide, check the server logs for error messages and verify all configuration steps have been completed correctly.
