# Bean's Bagels - Quick Start Guide

## 🚀 Get Running in 5 Minutes

### 1. Install & Start
```bash
npm install
npm start
```

### 2. Access Your System
- **Order Form**: http://localhost:3000/order.html
- **Kitchen Dashboard**: http://localhost:3000/kitchen.html (password: `lafayette`)

### 3. Set Up SMS (Optional)
1. Get Twilio account at [twilio.com](https://twilio.com)
2. Copy `env.example` to `.env`
3. Add your Twilio credentials to `.env`:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1234567890
   ```

### 4. Test Everything
1. Place a test order at `/order.html`
2. Login to kitchen dashboard with password `lafayette`
3. Move order through: Queued → Working → Ready → Handed Off
4. Send SMS notification when order is ready

## 🎯 Key Features
- ✅ **Ordering System**: Complete form matching Google Form
- ✅ **Kitchen Dashboard**: Drag & drop order management
- ✅ **SMS Notifications**: Order confirmations and pickup alerts
- ✅ **Capacity Management**: 6 bagel limit per 30-min slot
- ✅ **Real-time Updates**: Auto-refresh every 5 seconds

## 🔧 Quick Fixes
- **Port in use**: `lsof -ti:3000 | xargs kill -9`
- **Database issues**: `rm orders.db && npm start`
- **SMS not working**: Check `.env` file has correct Twilio credentials

## 📱 SMS Setup
1. Sign up at [twilio.com](https://twilio.com) (free $15 credit)
2. Buy a phone number
3. Get Account SID, Auth Token, and Phone Number
4. Add to `.env` file

## 🎉 You're Ready!
Your Bean's Bagels ordering system is now fully functional with integrated kitchen management and SMS notifications!
