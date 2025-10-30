import dotenv from 'dotenv';
import { WhatsAppBot } from './whatsapp/bot.js';
import pool from './database/db.js';

// Load environment variables
dotenv.config();

console.log('🚀 Starting Peer Pouch WhatsApp Wallet...\n');

// Test database connection
async function testDatabaseConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully');
    console.log(`   Time: ${result.rows[0].now}\n`);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('   Make sure PostgreSQL is running and .env is configured correctly\n');
    return false;
  }
}

// Start the application
async function start() {
  console.log('📊 Environment:', process.env.NODE_ENV || 'development');
  console.log('💰 Currency:', process.env.CURRENCY || 'ZAR');
  console.log();

  // Test database connection
  const dbConnected = await testDatabaseConnection();
  if (!dbConnected) {
    console.error('Exiting due to database connection failure.');
    process.exit(1);
  }

  // Check if database is migrated
  try {
    await pool.query('SELECT 1 FROM users LIMIT 1');
    console.log('✅ Database schema is ready\n');
  } catch (error) {
    console.error('❌ Database schema not found!');
    console.error('   Run: npm run db:migrate\n');
    process.exit(1);
  }

  // Start WhatsApp bot
  console.log('🤖 Starting WhatsApp bot...\n');
  const bot = new WhatsAppBot();

  try {
    await bot.start();
  } catch (error) {
    console.error('❌ Failed to start WhatsApp bot:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  await pool.end();
  console.log('✅ Database connection closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  await pool.end();
  console.log('✅ Database connection closed');
  process.exit(0);
});

// Start the application
start().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
