# 🚀 Deployment Guide - Peer Pouch WhatsApp Wallet

This guide will help you deploy your WhatsApp wallet to production.

---

## 📋 Prerequisites

- VPS or Cloud server (Ubuntu 20.04+ recommended)
- Domain name (optional, for web dashboard)
- WhatsApp Business account or personal account
- Payment gateway account (Paystack, Flutterwave, etc.)
- PostgreSQL database
- Node.js v18+

---

## 🌍 Recommended Hosting Providers

### VPS Options
1. **DigitalOcean** ($5-10/month)
   - Droplet with 1GB RAM
   - Easy to set up
   - Good for South Africa region

2. **AWS EC2** (Free tier available)
   - t2.micro or t3.micro
   - More complex but scalable

3. **Linode** ($5/month)
   - Simple interface
   - Good performance

4. **Vultr** ($5/month)
   - Multiple locations
   - Fast deployment

### Database Options
1. **DigitalOcean Managed PostgreSQL** ($15/month)
2. **AWS RDS** (Pay as you go)
3. **Self-hosted** (Included in VPS)

---

## 🛠️ Deployment Steps

### Step 1: Server Setup

```bash
# SSH into your server
ssh root@your-server-ip

# Update system
apt update && apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Install PostgreSQL
apt install -y postgresql postgresql-contrib

# Install PM2 (process manager)
npm install -g pm2

# Install Git
apt install -y git
```

### Step 2: Database Setup

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL prompt:
CREATE DATABASE peer_pouch_wallet;
CREATE USER peer_pouch WITH PASSWORD 'your_strong_password';
GRANT ALL PRIVILEGES ON DATABASE peer_pouch_wallet TO peer_pouch;
\q
```

### Step 3: Clone & Configure

```bash
# Create app directory
mkdir -p /var/www/peer-pouch
cd /var/www/peer-pouch

# Clone your repository (or upload files)
git clone <your-repo-url> .

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with production values
nano .env
```

**Production .env:**
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=peer_pouch_wallet
DB_USER=peer_pouch
DB_PASSWORD=your_strong_password

PORT=3000
NODE_ENV=production

JWT_SECRET=<generate-random-string-here>

CURRENCY=ZAR
DEFAULT_WALLET_BALANCE=0
PENDING_TRANSFER_EXPIRY_DAYS=30
```

**Generate secure JWT secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4: Run Migrations

```bash
npm run db:migrate
```

### Step 5: Start with PM2

```bash
# Start the app
pm2 start src/index.js --name peer-pouch

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup

# Check status
pm2 status

# View logs
pm2 logs peer-pouch
```

### Step 6: Connect WhatsApp

```bash
# View logs to see QR code
pm2 logs peer-pouch --lines 50

# Scan the QR code with WhatsApp
# WhatsApp → Settings → Linked Devices → Link a Device
```

You should see:
```
✅ WhatsApp bot connected successfully!
🤖 Bot is ready to receive messages
```

### Step 7: Set Up Firewall

```bash
# Allow SSH, HTTP, HTTPS
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
```

---

## 🔒 Security Hardening

### 1. Database Security

```bash
# Edit PostgreSQL config
nano /etc/postgresql/*/main/pg_hba.conf

# Change to:
local   all             all                                     md5
host    all             all             127.0.0.1/32            md5

# Restart PostgreSQL
systemctl restart postgresql
```

### 2. Environment Variables

```bash
# Restrict .env permissions
chmod 600 /var/www/peer-pouch/.env
```

### 3. Enable SSL (Optional but recommended)

If you have a domain:

```bash
# Install Certbot
apt install -y certbot

# Get certificate
certbot certonly --standalone -d yourdomain.com
```

### 4. Regular Updates

```bash
# Create update script
cat > /root/update-peer-pouch.sh << 'EOF'
#!/bin/bash
cd /var/www/peer-pouch
git pull
npm install
pm2 restart peer-pouch
EOF

chmod +x /root/update-peer-pouch.sh
```

---

## 📊 Monitoring

### PM2 Monitoring

```bash
# View logs
pm2 logs peer-pouch

# Monitor resources
pm2 monit

# List processes
pm2 list
```

### Database Monitoring

```bash
# Check database size
sudo -u postgres psql -d peer_pouch_wallet -c "SELECT pg_size_pretty(pg_database_size('peer_pouch_wallet'));"

# Check connections
sudo -u postgres psql -d peer_pouch_wallet -c "SELECT count(*) FROM pg_stat_activity;"
```

---

## 🔄 Backup Strategy

### Automated Database Backups

```bash
# Create backup script
cat > /root/backup-peer-pouch.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/peer-pouch"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup database
sudo -u postgres pg_dump peer_pouch_wallet | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /root/backup-peer-pouch.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add line:
# 0 2 * * * /root/backup-peer-pouch.sh >> /var/log/peer-pouch-backup.log 2>&1
```

---

## 🧪 Testing in Production

### 1. Test Registration

Send WhatsApp message to your bot number:
```
hi
```

Expected response:
```
👋 Welcome to Peer Pouch!

Your WhatsApp digital wallet for ZAR.

Main Menu:
1️⃣ Register

Reply with 1 to get started!
```

### 2. Complete Flow Test

Follow the test scenarios in `TEST_RESULTS.md`:
1. Register 2 test users
2. Add test funds (manually via database for testing)
3. Test transfers
4. Test send to unregistered number
5. Verify balances

### 3. Database Check

```bash
sudo -u postgres psql -d peer_pouch_wallet

SELECT * FROM users;
SELECT * FROM wallets;
SELECT * FROM transactions;
```

---

## 💳 Payment Gateway Integration

### Option 1: Paystack (Recommended for South Africa)

```bash
npm install paystack
```

Add to .env:
```env
PAYSTACK_SECRET_KEY=sk_live_xxxxx
PAYSTACK_PUBLIC_KEY=pk_live_xxxxx
```

### Option 2: Flutterwave

```bash
npm install flutterwave-node-v3
```

Add to .env:
```env
FLW_SECRET_KEY=FLWSECK-xxxxx
FLW_PUBLIC_KEY=FLWPUBK-xxxxx
```

### Implementation

Create `src/services/paymentService.js`:
```javascript
// Add deposit/withdrawal functionality
// Connect to payment gateway
// Handle webhooks
// Update wallet balances
```

---

## 📱 WhatsApp Business API (Optional)

For official WhatsApp Business API (better deliverability):

1. **Apply for WhatsApp Business API**
   - Via Facebook Business Manager
   - Or through partners: 360Dialog, Twilio, MessageBird

2. **Costs**
   - Setup: $0-500 (depends on partner)
   - Per message: $0.005-0.01
   - Better than Baileys for production

3. **Benefits**
   - Official support
   - Better reliability
   - No ban risk
   - Green checkmark

---

## 🚨 Troubleshooting

### WhatsApp Disconnects

```bash
# Check logs
pm2 logs peer-pouch

# Delete auth session and reconnect
rm -rf auth_info_baileys/
pm2 restart peer-pouch
# Scan QR code again
```

### Database Connection Errors

```bash
# Check PostgreSQL status
systemctl status postgresql

# Check credentials
sudo -u postgres psql -d peer_pouch_wallet

# Restart app
pm2 restart peer-pouch
```

### High Memory Usage

```bash
# Restart PM2
pm2 restart peer-pouch

# Check for memory leaks
pm2 monit
```

### Can't Connect to WhatsApp

1. Check internet connection: `ping web.whatsapp.com`
2. Check firewall rules
3. Try different server location
4. Use VPN if blocked

---

## 📈 Scaling

### When you grow:

1. **Database**: Migrate to managed PostgreSQL
2. **Redis**: Add Redis for session management
3. **Load Balancer**: Use Nginx for multiple instances
4. **Queue System**: Add Bull or RabbitMQ for jobs
5. **Monitoring**: Add Sentry, DataDog, or New Relic

---

## 🎯 Launch Checklist

Before going live:

- [ ] Database backups configured
- [ ] .env has strong passwords
- [ ] WhatsApp connected and tested
- [ ] Test registration flow
- [ ] Test transfers (all scenarios)
- [ ] Firewall configured
- [ ] PM2 auto-restart enabled
- [ ] Monitoring set up
- [ ] Terms of service ready
- [ ] Privacy policy ready
- [ ] Support channel ready
- [ ] KYC strategy decided
- [ ] Transaction limits set
- [ ] Payment gateway tested
- [ ] Compliance review done

---

## 📞 Support

For deployment issues:
1. Check `pm2 logs peer-pouch`
2. Check database connection
3. Verify environment variables
4. Review firewall rules
5. Test internet connectivity

---

## 🎉 You're Ready!

Your WhatsApp wallet is now live and ready to accept users!

Monitor closely for the first few days and scale as needed.

**Good luck with your launch!** 🚀

---

**Last Updated**: October 30, 2025
