import bcrypt from 'bcrypt';
import { query, transaction } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

const SALT_ROUNDS = 10;

export class UserService {
  /**
   * Register a new user with wallet
   */
  static async register(phoneNumber, fullName, pin) {
    // Validate PIN (4 digits)
    if (!/^\d{4}$/.test(pin)) {
      throw new Error('PIN must be exactly 4 digits');
    }

    // Normalize phone number
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

    // Check if user already exists
    const existing = await query(
      'SELECT id FROM users WHERE phone_number = $1',
      [normalizedPhone]
    );

    if (existing.rows.length > 0) {
      throw new Error('User with this phone number already exists');
    }

    // Hash PIN
    const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);

    // Create user and wallet in transaction
    return await transaction(async (client) => {
      // Create user
      const userResult = await client.query(
        `INSERT INTO users (phone_number, full_name, pin_hash)
         VALUES ($1, $2, $3)
         RETURNING id, phone_number, full_name, created_at`,
        [normalizedPhone, fullName, pinHash]
      );

      const user = userResult.rows[0];

      // Create wallet
      await client.query(
        `INSERT INTO wallets (user_id, balance, currency)
         VALUES ($1, $2, $3)`,
        [user.id, 0, 'ZAR']
      );

      // Check for pending transfers to this phone number
      const pendingResult = await client.query(
        `SELECT id, amount, sender_id, message
         FROM pending_transfers
         WHERE receiver_phone = $1 AND is_claimed = false AND expires_at > NOW()`,
        [normalizedPhone]
      );

      const pendingTransfers = pendingResult.rows;

      // Auto-claim all pending transfers
      for (const transfer of pendingTransfers) {
        await client.query(
          `UPDATE wallets
           SET balance = balance + $1
           WHERE user_id = $2`,
          [transfer.amount, user.id]
        );

        await client.query(
          `UPDATE pending_transfers
           SET is_claimed = true, claimed_at = NOW(), claimed_by = $1
           WHERE id = $2`,
          [user.id, transfer.id]
        );

        await client.query(
          `UPDATE transactions
           SET status = 'completed', receiver_id = $1, completed_at = NOW()
           WHERE id = (SELECT transaction_id FROM pending_transfers WHERE id = $2)`,
          [user.id, transfer.id]
        );
      }

      return {
        user,
        pendingClaimedCount: pendingTransfers.length,
        pendingClaimedAmount: pendingTransfers.reduce((sum, t) => sum + parseFloat(t.amount), 0)
      };
    });
  }

  /**
   * Authenticate user with PIN
   */
  static async authenticate(phoneNumber, pin) {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

    const result = await query(
      `SELECT id, phone_number, full_name, pin_hash, is_active
       FROM users
       WHERE phone_number = $1`,
      [normalizedPhone]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = result.rows[0];

    if (!user.is_active) {
      throw new Error('Account is inactive');
    }

    const isValid = await bcrypt.compare(pin, user.pin_hash);

    if (!isValid) {
      throw new Error('Invalid PIN');
    }

    return {
      id: user.id,
      phoneNumber: user.phone_number,
      fullName: user.full_name
    };
  }

  /**
   * Get user by phone number
   */
  static async getUserByPhone(phoneNumber) {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

    const result = await query(
      `SELECT u.id, u.phone_number, u.full_name, u.is_active, w.balance, w.currency
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       WHERE u.phone_number = $1`,
      [normalizedPhone]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId) {
    const result = await query(
      `SELECT u.id, u.phone_number, u.full_name, u.is_active, w.balance, w.currency
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Normalize phone number (remove spaces, add country code if needed)
   */
  static normalizePhoneNumber(phone) {
    // Remove all non-digit characters
    let normalized = phone.replace(/\D/g, '');

    // If starts with 0, replace with 27 (South Africa)
    if (normalized.startsWith('0')) {
      normalized = '27' + normalized.substring(1);
    }

    // If doesn't start with country code, add 27
    if (!normalized.startsWith('27')) {
      normalized = '27' + normalized;
    }

    return normalized;
  }

  /**
   * Update user PIN
   */
  static async updatePin(userId, oldPin, newPin) {
    // Validate new PIN
    if (!/^\d{4}$/.test(newPin)) {
      throw new Error('PIN must be exactly 4 digits');
    }

    // Get current user
    const userResult = await query(
      'SELECT pin_hash FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    // Verify old PIN
    const isValid = await bcrypt.compare(oldPin, userResult.rows[0].pin_hash);
    if (!isValid) {
      throw new Error('Current PIN is incorrect');
    }

    // Hash new PIN
    const newPinHash = await bcrypt.hash(newPin, SALT_ROUNDS);

    // Update PIN
    await query(
      'UPDATE users SET pin_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPinHash, userId]
    );

    return true;
  }
}
