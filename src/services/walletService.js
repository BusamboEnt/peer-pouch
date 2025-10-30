import { query, transaction } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import { UserService } from './userService.js';

export class WalletService {
  /**
   * Get wallet balance for a user
   */
  static async getBalance(userId) {
    const result = await query(
      `SELECT w.balance, w.currency, u.full_name, u.phone_number
       FROM wallets w
       JOIN users u ON w.user_id = u.id
       WHERE w.user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Wallet not found');
    }

    return result.rows[0];
  }

  /**
   * Transfer money from one wallet to another (registered user)
   */
  static async transferToWallet(senderId, receiverPhone, amount, description = '') {
    if (amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }

    const normalizedReceiverPhone = UserService.normalizePhoneNumber(receiverPhone);

    return await transaction(async (client) => {
      // Get sender wallet
      const senderResult = await client.query(
        `SELECT w.balance, u.phone_number
         FROM wallets w
         JOIN users u ON w.user_id = u.id
         WHERE w.user_id = $1`,
        [senderId]
      );

      if (senderResult.rows.length === 0) {
        throw new Error('Sender wallet not found');
      }

      const senderBalance = parseFloat(senderResult.rows[0].balance);
      const senderPhone = senderResult.rows[0].phone_number;

      // Check if sender has sufficient balance
      if (senderBalance < amount) {
        throw new Error(`Insufficient balance. Available: R${senderBalance.toFixed(2)}`);
      }

      // Check if sending to self
      if (senderPhone === normalizedReceiverPhone) {
        throw new Error('Cannot send money to yourself');
      }

      // Get receiver user
      const receiverResult = await client.query(
        'SELECT id, phone_number, full_name FROM users WHERE phone_number = $1',
        [normalizedReceiverPhone]
      );

      if (receiverResult.rows.length === 0) {
        throw new Error('Receiver not found. Use send-to-phone for unregistered users.');
      }

      const receiver = receiverResult.rows[0];

      // Deduct from sender
      await client.query(
        'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2',
        [amount, senderId]
      );

      // Add to receiver
      await client.query(
        'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2',
        [amount, receiver.id]
      );

      // Create transaction record
      const referenceId = `TXN-${Date.now()}-${uuidv4().substring(0, 8)}`;
      const txResult = await client.query(
        `INSERT INTO transactions
         (sender_id, receiver_id, receiver_phone, amount, currency, type, status, description, reference_id, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         RETURNING id, reference_id, created_at`,
        [senderId, receiver.id, normalizedReceiverPhone, amount, 'ZAR', 'transfer', 'completed', description, referenceId]
      );

      return {
        transaction: txResult.rows[0],
        receiver: {
          name: receiver.full_name,
          phone: receiver.phone_number
        },
        amount,
        newBalance: senderBalance - amount
      };
    });
  }

  /**
   * Send money to phone number (may be unregistered)
   */
  static async sendToPhone(senderId, receiverPhone, amount, message = '') {
    if (amount <= 0) {
      throw new Error('Amount must be greater than zero');
    }

    const normalizedReceiverPhone = UserService.normalizePhoneNumber(receiverPhone);

    return await transaction(async (client) => {
      // Get sender wallet
      const senderResult = await client.query(
        `SELECT w.balance, u.phone_number, u.full_name
         FROM wallets w
         JOIN users u ON w.user_id = u.id
         WHERE w.user_id = $1`,
        [senderId]
      );

      if (senderResult.rows.length === 0) {
        throw new Error('Sender wallet not found');
      }

      const senderBalance = parseFloat(senderResult.rows[0].balance);
      const senderPhone = senderResult.rows[0].phone_number;
      const senderName = senderResult.rows[0].full_name;

      // Check if sender has sufficient balance
      if (senderBalance < amount) {
        throw new Error(`Insufficient balance. Available: R${senderBalance.toFixed(2)}`);
      }

      // Check if sending to self
      if (senderPhone === normalizedReceiverPhone) {
        throw new Error('Cannot send money to yourself');
      }

      // Deduct from sender
      await client.query(
        'UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2',
        [amount, senderId]
      );

      // Check if receiver is registered
      const receiverResult = await client.query(
        'SELECT id, full_name FROM users WHERE phone_number = $1',
        [normalizedReceiverPhone]
      );

      const referenceId = `TXN-${Date.now()}-${uuidv4().substring(0, 8)}`;

      if (receiverResult.rows.length > 0) {
        // Receiver is registered - instant transfer
        const receiver = receiverResult.rows[0];

        // Add to receiver
        await client.query(
          'UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2',
          [amount, receiver.id]
        );

        // Create transaction record
        const txResult = await client.query(
          `INSERT INTO transactions
           (sender_id, receiver_id, receiver_phone, amount, currency, type, status, description, reference_id, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           RETURNING id, reference_id, created_at`,
          [senderId, receiver.id, normalizedReceiverPhone, amount, 'ZAR', 'transfer', 'completed', message, referenceId]
        );

        return {
          type: 'instant',
          transaction: txResult.rows[0],
          receiver: {
            name: receiver.full_name,
            phone: normalizedReceiverPhone,
            registered: true
          },
          amount,
          newBalance: senderBalance - amount
        };
      } else {
        // Receiver is NOT registered - create pending transfer
        const txResult = await client.query(
          `INSERT INTO transactions
           (sender_id, receiver_phone, amount, currency, type, status, description, reference_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, reference_id, created_at`,
          [senderId, normalizedReceiverPhone, amount, 'ZAR', 'pending_claim', 'pending', message, referenceId]
        );

        const transaction = txResult.rows[0];

        // Create pending transfer (expires in 30 days)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        await client.query(
          `INSERT INTO pending_transfers
           (transaction_id, sender_id, receiver_phone, amount, currency, message, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [transaction.id, senderId, normalizedReceiverPhone, amount, 'ZAR', message, expiresAt]
        );

        return {
          type: 'pending',
          transaction,
          receiver: {
            phone: normalizedReceiverPhone,
            registered: false
          },
          sender: {
            name: senderName
          },
          amount,
          newBalance: senderBalance - amount,
          expiresAt
        };
      }
    });
  }

  /**
   * Get pending transfers for a phone number
   */
  static async getPendingTransfers(phoneNumber) {
    const normalizedPhone = UserService.normalizePhoneNumber(phoneNumber);

    const result = await query(
      `SELECT pt.id, pt.amount, pt.currency, pt.message, pt.created_at, pt.expires_at,
              u.full_name as sender_name, u.phone_number as sender_phone
       FROM pending_transfers pt
       JOIN users u ON pt.sender_id = u.id
       WHERE pt.receiver_phone = $1 AND pt.is_claimed = false AND pt.expires_at > NOW()
       ORDER BY pt.created_at DESC`,
      [normalizedPhone]
    );

    return result.rows;
  }

  /**
   * Get transaction history for a user
   */
  static async getTransactionHistory(userId, limit = 20) {
    const result = await query(
      `SELECT
         t.id,
         t.amount,
         t.currency,
         t.type,
         t.status,
         t.description,
         t.reference_id,
         t.created_at,
         t.completed_at,
         sender.full_name as sender_name,
         sender.phone_number as sender_phone,
         receiver.full_name as receiver_name,
         receiver.phone_number as receiver_phone,
         CASE
           WHEN t.sender_id = $1 THEN 'sent'
           WHEN t.receiver_id = $1 THEN 'received'
           ELSE 'unknown'
         END as direction
       FROM transactions t
       LEFT JOIN users sender ON t.sender_id = sender.id
       LEFT JOIN users receiver ON t.receiver_id = receiver.id
       WHERE t.sender_id = $1 OR t.receiver_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  }
}
