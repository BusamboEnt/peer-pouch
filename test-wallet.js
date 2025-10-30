import dotenv from 'dotenv';
import { UserService } from './src/services/userService.js';
import { WalletService } from './src/services/walletService.js';
import pool from './src/database/db.js';

dotenv.config();

console.log('🧪 Testing Peer Pouch Wallet Functionality\n');
console.log('==========================================\n');

let testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

function testCase(name, callback) {
  testResults.total++;
  return callback()
    .then((result) => {
      testResults.passed++;
      console.log(`✅ ${name}`);
      if (result) console.log(`   ${result}\n`);
      return true;
    })
    .catch((error) => {
      testResults.failed++;
      console.log(`❌ ${name}`);
      console.log(`   Error: ${error.message}\n`);
      return false;
    });
}

async function runTests() {
  let user1, user2, user3;

  try {
    console.log('📝 TEST 1: User Registration\n');
    console.log('----------------------------\n');

    // Test 1: Register User 1 (Alice)
    await testCase('Register Alice (0821111111)', async () => {
      const result = await UserService.register('0821111111', 'Alice Smith', '1234');
      user1 = result.user;
      return `User ID: ${user1.id.substring(0, 8)}... | Phone: ${user1.phone_number}`;
    });

    // Test 2: Register User 2 (Bob)
    await testCase('Register Bob (0822222222)', async () => {
      const result = await UserService.register('0822222222', 'Bob Jones', '5678');
      user2 = result.user;
      return `User ID: ${user2.id.substring(0, 8)}... | Phone: ${user2.phone_number}`;
    });

    // Test 3: Duplicate registration should fail
    await testCase('Prevent duplicate registration', async () => {
      try {
        await UserService.register('0821111111', 'Alice Duplicate', '9999');
        throw new Error('Should have failed');
      } catch (error) {
        if (error.message.includes('already exists')) {
          return 'Correctly rejected duplicate';
        }
        throw error;
      }
    });

    // Test 4: Authentication
    console.log('\n🔐 TEST 2: Authentication\n');
    console.log('----------------------------\n');

    await testCase('Authenticate Alice with correct PIN', async () => {
      const auth = await UserService.authenticate('27821111111', '1234');
      return `Authenticated: ${auth.fullName}`;
    });

    await testCase('Reject invalid PIN', async () => {
      try {
        await UserService.authenticate('27821111111', '9999');
        throw new Error('Should have failed');
      } catch (error) {
        if (error.message.includes('Invalid PIN')) {
          return 'Correctly rejected invalid PIN';
        }
        throw error;
      }
    });

    // Test 5: Check Balances
    console.log('\n💰 TEST 3: Check Initial Balances\n');
    console.log('----------------------------\n');

    await testCase('Alice initial balance should be R0.00', async () => {
      const wallet = await WalletService.getBalance(user1.id);
      if (parseFloat(wallet.balance) !== 0) {
        throw new Error(`Expected 0, got ${wallet.balance}`);
      }
      return `Balance: R${parseFloat(wallet.balance).toFixed(2)} ${wallet.currency}`;
    });

    // Test 6: Add test funds to Alice's wallet
    console.log('\n💵 TEST 4: Add Test Funds\n');
    console.log('----------------------------\n');

    await testCase('Add R1000.00 to Alice wallet (for testing)', async () => {
      await pool.query(
        'UPDATE wallets SET balance = 1000.00 WHERE user_id = $1',
        [user1.id]
      );
      const wallet = await WalletService.getBalance(user1.id);
      return `New balance: R${parseFloat(wallet.balance).toFixed(2)}`;
    });

    // Test 7: Wallet-to-Wallet Transfer
    console.log('\n💸 TEST 5: Wallet-to-Wallet Transfer\n');
    console.log('----------------------------\n');

    await testCase('Transfer R100.00 from Alice to Bob', async () => {
      const result = await WalletService.transferToWallet(
        user1.id,
        '0822222222',
        100,
        'Test transfer'
      );
      return `Sent R${result.amount.toFixed(2)} to ${result.receiver.name} | New balance: R${result.newBalance.toFixed(2)}`;
    });

    await testCase('Verify Bob received R100.00', async () => {
      const wallet = await WalletService.getBalance(user2.id);
      if (parseFloat(wallet.balance) !== 100) {
        throw new Error(`Expected 100, got ${wallet.balance}`);
      }
      return `Bob's balance: R${parseFloat(wallet.balance).toFixed(2)}`;
    });

    await testCase('Verify Alice balance is R900.00', async () => {
      const wallet = await WalletService.getBalance(user1.id);
      if (parseFloat(wallet.balance) !== 900) {
        throw new Error(`Expected 900, got ${wallet.balance}`);
      }
      return `Alice's balance: R${parseFloat(wallet.balance).toFixed(2)}`;
    });

    // Test 8: Send to unregistered number
    console.log('\n📤 TEST 6: Send to Unregistered Phone Number\n');
    console.log('----------------------------\n');

    await testCase('Send R50.00 to unregistered number (0823333333)', async () => {
      const result = await WalletService.sendToPhone(
        user1.id,
        '0823333333',
        50,
        'Welcome gift'
      );
      if (result.type !== 'pending') {
        throw new Error('Expected pending transfer');
      }
      return `Pending transfer created | Expires: ${new Date(result.expiresAt).toLocaleDateString()}`;
    });

    await testCase('Verify Alice balance is R850.00 (deducted)', async () => {
      const wallet = await WalletService.getBalance(user1.id);
      if (parseFloat(wallet.balance) !== 850) {
        throw new Error(`Expected 850, got ${wallet.balance}`);
      }
      return `Alice's balance: R${parseFloat(wallet.balance).toFixed(2)}`;
    });

    await testCase('Verify pending transfer exists', async () => {
      const pending = await WalletService.getPendingTransfers('0823333333');
      if (pending.length !== 1) {
        throw new Error(`Expected 1 pending transfer, got ${pending.length}`);
      }
      return `Pending: R${parseFloat(pending[0].amount).toFixed(2)} from ${pending[0].sender_name}`;
    });

    // Test 9: Register user with pending transfer (auto-claim)
    console.log('\n🎁 TEST 7: Auto-Claim Pending Transfer\n');
    console.log('----------------------------\n');

    await testCase('Register Charlie (0823333333) with pending transfer', async () => {
      const result = await UserService.register('0823333333', 'Charlie Brown', '4321');
      user3 = result.user;
      if (result.pendingClaimedCount !== 1) {
        throw new Error(`Expected 1 claimed transfer, got ${result.pendingClaimedCount}`);
      }
      return `Claimed ${result.pendingClaimedCount} transfer(s) | Amount: R${result.pendingClaimedAmount.toFixed(2)}`;
    });

    await testCase('Verify Charlie balance is R50.00 (claimed)', async () => {
      const wallet = await WalletService.getBalance(user3.id);
      if (parseFloat(wallet.balance) !== 50) {
        throw new Error(`Expected 50, got ${wallet.balance}`);
      }
      return `Charlie's balance: R${parseFloat(wallet.balance).toFixed(2)}`;
    });

    await testCase('Verify no pending transfers remain', async () => {
      const pending = await WalletService.getPendingTransfers('0823333333');
      if (pending.length !== 0) {
        throw new Error(`Expected 0 pending transfers, got ${pending.length}`);
      }
      return 'All pending transfers claimed';
    });

    // Test 10: Transaction History
    console.log('\n📜 TEST 8: Transaction History\n');
    console.log('----------------------------\n');

    await testCase('Alice transaction history', async () => {
      const transactions = await WalletService.getTransactionHistory(user1.id, 10);
      if (transactions.length < 2) {
        throw new Error(`Expected at least 2 transactions, got ${transactions.length}`);
      }
      return `Found ${transactions.length} transactions`;
    });

    // Test 11: Insufficient balance
    console.log('\n🚫 TEST 9: Error Handling\n');
    console.log('----------------------------\n');

    await testCase('Prevent transfer with insufficient balance', async () => {
      try {
        await WalletService.transferToWallet(user2.id, '0821111111', 500, 'Too much');
        throw new Error('Should have failed');
      } catch (error) {
        if (error.message.includes('Insufficient balance')) {
          return 'Correctly rejected insufficient balance';
        }
        throw error;
      }
    });

    await testCase('Prevent sending to self', async () => {
      try {
        await WalletService.transferToWallet(user1.id, '0821111111', 10, 'To myself');
        throw new Error('Should have failed');
      } catch (error) {
        if (error.message.includes('Cannot send money to yourself')) {
          return 'Correctly rejected self-transfer';
        }
        throw error;
      }
    });

    // Test 12: Phone number normalization
    console.log('\n📱 TEST 10: Phone Number Normalization\n');
    console.log('----------------------------\n');

    await testCase('Normalize phone: 0821111111 → 27821111111', async () => {
      const normalized = UserService.normalizePhoneNumber('0821111111');
      if (normalized !== '27821111111') {
        throw new Error(`Expected 27821111111, got ${normalized}`);
      }
      return `Normalized: ${normalized}`;
    });

    await testCase('Normalize phone: 27821111111 → 27821111111', async () => {
      const normalized = UserService.normalizePhoneNumber('27821111111');
      if (normalized !== '27821111111') {
        throw new Error(`Expected 27821111111, got ${normalized}`);
      }
      return `Normalized: ${normalized}`;
    });

    await testCase('Normalize phone: 821111111 → 27821111111', async () => {
      const normalized = UserService.normalizePhoneNumber('821111111');
      if (normalized !== '27821111111') {
        throw new Error(`Expected 27821111111, got ${normalized}`);
      }
      return `Normalized: ${normalized}`;
    });

    // Test 13: Send to registered user using sendToPhone
    console.log('\n💫 TEST 11: Send to Phone (Registered User)\n');
    console.log('----------------------------\n');

    await testCase('Send R25.00 to Bob using phone number (instant)', async () => {
      const result = await WalletService.sendToPhone(user1.id, '0822222222', 25, 'Quick transfer');
      if (result.type !== 'instant') {
        throw new Error('Expected instant transfer for registered user');
      }
      return `Instant transfer to ${result.receiver.name} | Type: ${result.type}`;
    });

    await testCase('Verify Bob balance increased by R25.00', async () => {
      const wallet = await WalletService.getBalance(user2.id);
      if (parseFloat(wallet.balance) !== 125) {
        throw new Error(`Expected 125, got ${wallet.balance}`);
      }
      return `Bob's balance: R${parseFloat(wallet.balance).toFixed(2)}`;
    });

    // Final Summary
    console.log('\n==========================================\n');
    console.log('🎯 TEST SUMMARY\n');
    console.log(`Total Tests: ${testResults.total}`);
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
    console.log('\n==========================================\n');

    // Final balance summary
    console.log('💰 FINAL BALANCES:\n');
    const aliceWallet = await WalletService.getBalance(user1.id);
    const bobWallet = await WalletService.getBalance(user2.id);
    const charlieWallet = await WalletService.getBalance(user3.id);

    console.log(`Alice: R${parseFloat(aliceWallet.balance).toFixed(2)}`);
    console.log(`Bob: R${parseFloat(bobWallet.balance).toFixed(2)}`);
    console.log(`Charlie: R${parseFloat(charlieWallet.balance).toFixed(2)}`);
    console.log(`Total: R${(parseFloat(aliceWallet.balance) + parseFloat(bobWallet.balance) + parseFloat(charlieWallet.balance)).toFixed(2)}\n`);

    if (testResults.failed === 0) {
      console.log('✅ ALL TESTS PASSED! 🎉\n');
      console.log('Your wallet system is working perfectly!\n');
    } else {
      console.log('⚠️ Some tests failed. Please review the errors above.\n');
    }

  } catch (error) {
    console.error('💥 Fatal error during tests:', error);
  } finally {
    await pool.end();
    console.log('🔌 Database connection closed\n');
    process.exit(testResults.failed > 0 ? 1 : 0);
  }
}

// Run tests
runTests();
