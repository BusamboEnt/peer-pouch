# 🚀 Quick Start Guide - Peer Pouch WhatsApp Wallet

Get your WhatsApp wallet running in minutes!

## Prerequisites

- Node.js v18+ installed
- PostgreSQL v14+ installed and running
- WhatsApp account (for the bot)

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your PostgreSQL credentials:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=peer_pouch_wallet
DB_USER=postgres
DB_PASSWORD=your_password

PORT=3000
NODE_ENV=development
JWT_SECRET=change_this_to_random_string_in_production
CURRENCY=ZAR
```

## Step 3: Create Database

```bash
# Using psql
createdb peer_pouch_wallet

# Or connect to PostgreSQL and run:
# CREATE DATABASE peer_pouch_wallet;
```

## Step 4: Run Migrations

```bash
npm run db:migrate
```

You should see:
```
✅ Database migration completed successfully!
📊 Tables created:
   - users
   - wallets
   - transactions
   - pending_transfers
   - whatsapp_sessions
```

## Step 5: Start the Bot

```bash
npm start
```

## Step 6: Connect WhatsApp

1. When the bot starts, a **QR code** will appear in your terminal
2. Open WhatsApp on your phone
3. Go to **Settings > Linked Devices > Link a Device**
4. Scan the QR code

You should see:
```
✅ WhatsApp bot connected successfully!
🤖 Bot is ready to receive messages
```

## Step 7: Test the Bot

Send a WhatsApp message to the connected number:

```
hi
```

You should receive:
```
👋 Welcome to Peer Pouch!

Your WhatsApp digital wallet for ZAR.

Main Menu:
1️⃣ Register

Reply with 1 to get started!
```

## 🎉 That's it!

Your WhatsApp wallet is now running!

## What You Can Do

### Register a User
1. Send: `hi`
2. Reply: `1`
3. Enter your full name
4. Create a 4-digit PIN
5. Confirm PIN

### Send Money
```
send 100 to 0821234567
```

### Check Balance
```
menu
```
Then select option `2`

### View Transaction History
```
menu
```
Then select option `4`

## Common Issues

### Database Connection Failed
- Make sure PostgreSQL is running: `sudo service postgresql start`
- Check your credentials in `.env`
- Verify database exists: `psql -l`

### QR Code Not Appearing
- Make sure terminal supports UTF-8
- Try a different terminal emulator
- Check firewall settings

### WhatsApp Disconnects
- The bot will auto-reconnect
- If persistent, delete `auth_info_baileys` folder and rescan QR

## Testing Wallet Features

### Test Scenario 1: Register Two Users

**User A (Phone: 0821111111)**
1. Send: `hi`
2. Reply: `1`
3. Name: `Alice Smith`
4. PIN: `1234`

**User B (Phone: 0822222222)**
1. Send: `hi`
2. Reply: `1`
3. Name: `Bob Jones`
4. PIN: `5678`

### Test Scenario 2: Send Money (Wallet to Wallet)

**As User A:**
```
send 50 to 0822222222
```
Enter PIN: `1234`

**As User B:**
Check balance - should show R50.00

### Test Scenario 3: Send to Unregistered Number

**As User A:**
```
send 25 to 0823333333
```

The money will be held pending until 0823333333 registers!

**As User C (0823333333):**
1. Register (steps above)
2. After registration, you'll automatically receive: "You had 1 pending transfer waiting for you. Amount claimed: R25.00"

## Production Deployment

### Security Checklist
- [ ] Change `JWT_SECRET` to a strong random string
- [ ] Use strong database password
- [ ] Enable SSL for database connection
- [ ] Set `NODE_ENV=production`
- [ ] Regular database backups
- [ ] Monitor failed login attempts
- [ ] Set up error logging/monitoring

### Recommended Hosting
- **VPS**: DigitalOcean, AWS EC2, Google Cloud
- **Database**: Managed PostgreSQL (AWS RDS, DigitalOcean Managed Database)
- **Process Manager**: PM2 for keeping bot running

### PM2 Setup
```bash
npm install -g pm2
pm2 start src/index.js --name peer-pouch
pm2 save
pm2 startup
```

## Support

For issues or questions:
- Check logs: `pm2 logs peer-pouch`
- Database issues: Check PostgreSQL logs
- WhatsApp issues: Delete `auth_info_baileys` and reconnect

## Next Steps

- Add payment gateway integration (Paystack, Flutterwave)
- Implement KYC verification
- Add transaction limits
- Build admin dashboard
- Add more currencies

Happy building! 🚀
