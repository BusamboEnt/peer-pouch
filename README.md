# Peer Pouch - WhatsApp Digital Wallet

A WhatsApp-based digital wallet for ZAR (South African Rand) transactions. Users can register, check balances, send money to other wallets, and send money to phone numbers.

## Features

- ✅ **WhatsApp Registration**: Sign up using your phone number
- ✅ **PIN Security**: Secure 4-digit PIN authentication
- ✅ **Check Balance**: View your ZAR wallet balance
- ✅ **Wallet-to-Wallet Transfer**: Send money to registered users
- ✅ **Send to Phone Number**: Send money to any phone number (with claim mechanism)
- ✅ **Transaction History**: View all your transactions
- ✅ **Pending Claims**: Receive money sent to your phone number before registration

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **WhatsApp Integration**: Baileys (WhatsApp Web API)
- **Currency**: ZAR (South African Rand)

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- WhatsApp account (for bot)

## Installation

1. Clone the repository:
```bash
cd peer-pouch
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

4. Create the database:
```bash
createdb peer_pouch_wallet
```

5. Run database migrations:
```bash
npm run db:migrate
```

6. Start the server:
```bash
npm start
```

7. Scan the QR code with WhatsApp when prompted

## WhatsApp Commands

Once the bot is running, send these commands via WhatsApp:

- `hi` or `hello` - Start/view main menu
- `1` - Register new account
- `2` - Check balance
- `3` - Send money
- `4` - Transaction history
- `help` - View all commands

### Sending Money

**To a wallet:**
- Command: `send <amount> to <phone>`
- Example: `send 100 to 27821234567`

**To any phone number:**
- Same command works for both registered and unregistered users
- Unregistered recipients get notified to claim money

## Project Structure

```
peer-pouch/
├── src/
│   ├── index.js              # Main entry point
│   ├── config/               # Configuration files
│   ├── database/             # Database setup and migrations
│   ├── whatsapp/             # WhatsApp bot logic
│   ├── services/             # Business logic services
│   ├── models/               # Data models
│   └── utils/                # Utility functions
├── package.json
├── .env.example
└── README.md
```

## Security Features

- 4-digit PIN authentication
- Encrypted PIN storage (bcrypt)
- JWT token-based sessions
- Transaction verification
- Pending transfer expiry (30 days)

## API Endpoints (Internal)

- `POST /api/users/register` - Register new user
- `POST /api/users/login` - Authenticate user
- `GET /api/wallet/balance` - Get wallet balance
- `POST /api/wallet/transfer` - Transfer money
- `GET /api/transactions` - Get transaction history

## Contributing

This is a private project. Contact the repository owner for contribution guidelines.

## License

ISC

## Support

For issues or questions, please contact the development team.
