import { UserService } from '../services/userService.js';
import { WalletService } from '../services/walletService.js';
import { SessionManager } from './sessionManager.js';

export class MessageHandler {
  constructor() {
    this.sessionManager = new SessionManager();
  }

  async processMessage(phoneNumber, messageText) {
    // Clean phone number (extract from WhatsApp JID)
    const cleanPhone = phoneNumber.split('@')[0];
    const normalizedPhone = UserService.normalizePhoneNumber(cleanPhone);

    // Get or create session
    const session = await this.sessionManager.getSession(normalizedPhone);

    const text = messageText.trim().toLowerCase();

    // Handle registration flow
    if (session.state === 'registering_name') {
      return await this.handleRegistrationName(normalizedPhone, messageText, session);
    }

    if (session.state === 'registering_pin') {
      return await this.handleRegistrationPin(normalizedPhone, messageText, session);
    }

    if (session.state === 'confirming_pin') {
      return await this.handleRegistrationPinConfirm(normalizedPhone, messageText, session);
    }

    // Handle authentication flow
    if (session.state === 'awaiting_pin') {
      return await this.handlePinAuth(normalizedPhone, messageText, session);
    }

    // Handle send money flow
    if (session.state === 'sending_amount') {
      return await this.handleSendAmount(normalizedPhone, messageText, session);
    }

    if (session.state === 'sending_recipient') {
      return await this.handleSendRecipient(normalizedPhone, messageText, session);
    }

    if (session.state === 'sending_confirm_pin') {
      return await this.handleSendConfirmPin(normalizedPhone, messageText, session);
    }

    // Main menu commands
    if (text === 'hi' || text === 'hello' || text === 'menu' || text === 'start') {
      return await this.showMainMenu(normalizedPhone);
    }

    if (text === 'help') {
      return this.showHelp();
    }

    // Menu options
    if (text === '1') {
      return await this.handleRegisterCommand(normalizedPhone);
    }

    if (text === '2') {
      return await this.handleBalanceCommand(normalizedPhone, session);
    }

    if (text === '3') {
      return await this.handleSendCommand(normalizedPhone, session);
    }

    if (text === '4') {
      return await this.handleHistoryCommand(normalizedPhone, session);
    }

    if (text === '5') {
      return await this.handlePendingCommand(normalizedPhone, session);
    }

    // Direct commands
    if (text.startsWith('send ')) {
      return await this.handleDirectSend(normalizedPhone, messageText, session);
    }

    // Default response
    return `I didn't understand that. Type "menu" to see options or "help" for assistance.`;
  }

  async showMainMenu(phoneNumber) {
    const user = await UserService.getUserByPhone(phoneNumber);

    if (!user) {
      return `👋 Welcome to *Peer Pouch*!\n\nYour WhatsApp digital wallet for ZAR.\n\n*Main Menu:*\n1️⃣ Register\n\nReply with *1* to get started!`;
    }

    return `👋 Welcome back, *${user.full_name}*!\n\n*Main Menu:*\n2️⃣ Check Balance\n3️⃣ Send Money\n4️⃣ Transaction History\n5️⃣ Pending Transfers\n\n💡 Type "help" for more options`;
  }

  showHelp() {
    return `*📚 Help & Commands*

*Quick Commands:*
• menu - Show main menu
• send <amount> to <phone> - Send money
• balance - Check your balance
• history - View transactions

*Getting Started:*
1. Register with option 1
2. Set a 4-digit PIN
3. Start sending & receiving money

*Sending Money:*
You can send to:
✅ Registered users (instant)
✅ Any phone number (they claim later)

*Example:*
send 100 to 0821234567

*Security:*
• Your PIN is encrypted
• Transactions require PIN confirmation
• Never share your PIN

Need assistance? Contact support.`;
  }

  async handleRegisterCommand(phoneNumber) {
    const user = await UserService.getUserByPhone(phoneNumber);

    if (user) {
      return `You're already registered! Type "menu" to see options.`;
    }

    await this.sessionManager.updateSession(phoneNumber, { state: 'registering_name' });
    return `🎉 Let's create your Peer Pouch wallet!\n\nWhat's your full name?`;
  }

  async handleRegistrationName(phoneNumber, name, session) {
    if (name.length < 2) {
      return `Please enter a valid name (at least 2 characters).`;
    }

    await this.sessionManager.updateSession(phoneNumber, {
      state: 'registering_pin',
      data: { name: name.trim() }
    });

    return `Great, *${name}*!\n\nNow, create a 4-digit PIN to secure your wallet.\n\n🔒 This PIN will be required for all transactions.`;
  }

  async handleRegistrationPin(phoneNumber, pin, session) {
    if (!/^\d{4}$/.test(pin)) {
      return `❌ PIN must be exactly 4 digits.\n\nPlease try again:`;
    }

    await this.sessionManager.updateSession(phoneNumber, {
      state: 'confirming_pin',
      data: { ...session.data, pin }
    });

    return `Please confirm your PIN by entering it again:`;
  }

  async handleRegistrationPinConfirm(phoneNumber, pin, session) {
    if (pin !== session.data.pin) {
      await this.sessionManager.updateSession(phoneNumber, { state: 'registering_pin' });
      return `❌ PINs don't match!\n\nPlease enter your 4-digit PIN again:`;
    }

    try {
      const result = await UserService.register(
        phoneNumber,
        session.data.name,
        session.data.pin
      );

      await this.sessionManager.updateSession(phoneNumber, {
        state: 'authenticated',
        userId: result.user.id,
        data: {}
      });

      let message = `✅ *Registration Successful!*\n\nWelcome to Peer Pouch, ${result.user.full_name}!\n\nYour wallet is ready! 🎉\nBalance: R0.00`;

      if (result.pendingClaimedCount > 0) {
        message += `\n\n💰 *Great news!*\nYou had ${result.pendingClaimedCount} pending transfer(s) waiting for you.\n\nAmount claimed: R${result.pendingClaimedAmount.toFixed(2)}`;
      }

      message += `\n\nType "menu" to see what you can do!`;

      return message;
    } catch (error) {
      await this.sessionManager.clearSession(phoneNumber);
      return `❌ Registration failed: ${error.message}\n\nType "menu" to try again.`;
    }
  }

  async handleBalanceCommand(phoneNumber, session) {
    const user = await UserService.getUserByPhone(phoneNumber);

    if (!user) {
      return `You need to register first! Type "menu" and select option 1.`;
    }

    if (!session.userId) {
      await this.sessionManager.updateSession(phoneNumber, { state: 'awaiting_pin' });
      return `🔒 Please enter your PIN to view balance:`;
    }

    const wallet = await WalletService.getBalance(user.id);
    return `💰 *Your Balance*\n\nR${parseFloat(wallet.balance).toFixed(2)} ${wallet.currency}\n\nType "menu" for more options.`;
  }

  async handlePinAuth(phoneNumber, pin, session) {
    try {
      const user = await UserService.authenticate(phoneNumber, pin);

      await this.sessionManager.updateSession(phoneNumber, {
        state: 'authenticated',
        userId: user.id
      });

      const wallet = await WalletService.getBalance(user.id);
      return `✅ Authenticated!\n\n💰 Balance: R${parseFloat(wallet.balance).toFixed(2)}\n\nType "menu" for options.`;
    } catch (error) {
      await this.sessionManager.clearSession(phoneNumber);
      return `❌ ${error.message}\n\nType "menu" to try again.`;
    }
  }

  async handleSendCommand(phoneNumber, session) {
    const user = await UserService.getUserByPhone(phoneNumber);

    if (!user) {
      return `You need to register first! Type "menu" and select option 1.`;
    }

    if (!session.userId) {
      await this.sessionManager.updateSession(phoneNumber, {
        state: 'awaiting_pin',
        data: { nextAction: 'send' }
      });
      return `🔒 Please enter your PIN:`;
    }

    await this.sessionManager.updateSession(phoneNumber, { state: 'sending_amount' });
    return `💸 *Send Money*\n\nHow much do you want to send? (in ZAR)\n\nType the amount (e.g., 100):`;
  }

  async handleSendAmount(phoneNumber, amountText, session) {
    const amount = parseFloat(amountText);

    if (isNaN(amount) || amount <= 0) {
      return `❌ Please enter a valid amount (e.g., 100).\n\nHow much do you want to send?`;
    }

    const user = await UserService.getUserByPhone(phoneNumber);
    const wallet = await WalletService.getBalance(user.id);

    if (parseFloat(wallet.balance) < amount) {
      await this.sessionManager.clearSession(phoneNumber);
      return `❌ Insufficient balance!\n\nYour balance: R${parseFloat(wallet.balance).toFixed(2)}\nAmount requested: R${amount.toFixed(2)}\n\nType "menu" to return.`;
    }

    await this.sessionManager.updateSession(phoneNumber, {
      state: 'sending_recipient',
      data: { amount }
    });

    return `Send R${amount.toFixed(2)} to which phone number?\n\nExample: 0821234567 or 27821234567`;
  }

  async handleSendRecipient(phoneNumber, recipientPhone, session) {
    const cleanRecipient = recipientPhone.replace(/\D/g, '');

    if (cleanRecipient.length < 9) {
      return `❌ Please enter a valid phone number.\n\nExample: 0821234567`;
    }

    await this.sessionManager.updateSession(phoneNumber, {
      state: 'sending_confirm_pin',
      data: { ...session.data, recipientPhone: cleanRecipient }
    });

    const { amount, recipientPhone: phone } = session.data;
    return `📋 *Confirm Transaction*\n\nAmount: R${amount.toFixed(2)}\nTo: ${cleanRecipient}\n\n🔒 Enter your PIN to confirm:`;
  }

  async handleSendConfirmPin(phoneNumber, pin, session) {
    try {
      // Verify PIN
      await UserService.authenticate(phoneNumber, pin);

      const { amount, recipientPhone } = session.data;
      const user = await UserService.getUserByPhone(phoneNumber);

      // Perform transfer
      const result = await WalletService.sendToPhone(user.id, recipientPhone, amount, '');

      await this.sessionManager.updateSession(phoneNumber, { state: 'authenticated', data: {} });

      if (result.type === 'instant') {
        return `✅ *Money Sent Successfully!*\n\nAmount: R${result.amount.toFixed(2)}\nTo: ${result.receiver.name} (${result.receiver.phone})\n\nNew balance: R${result.newBalance.toFixed(2)}\nRef: ${result.transaction.reference_id}\n\nType "menu" for more options.`;
      } else {
        return `✅ *Money Sent!*\n\nAmount: R${result.amount.toFixed(2)}\nTo: ${result.receiver.phone} (Unregistered)\n\nThe recipient will be notified to claim the money when they register.\n\nNew balance: R${result.newBalance.toFixed(2)}\nRef: ${result.transaction.reference_id}\nExpires: ${new Date(result.expiresAt).toLocaleDateString()}\n\nType "menu" for more options.`;
      }
    } catch (error) {
      await this.sessionManager.clearSession(phoneNumber);
      return `❌ Transaction failed: ${error.message}\n\nType "menu" to try again.`;
    }
  }

  async handleDirectSend(phoneNumber, messageText, session) {
    const user = await UserService.getUserByPhone(phoneNumber);

    if (!user) {
      return `You need to register first! Type "menu" and select option 1.`;
    }

    // Parse: send 100 to 0821234567
    const match = messageText.match(/send\s+(\d+(?:\.\d+)?)\s+to\s+([\d\s+]+)/i);

    if (!match) {
      return `❌ Invalid format!\n\nUse: send <amount> to <phone>\nExample: send 100 to 0821234567`;
    }

    const amount = parseFloat(match[1]);
    const recipientPhone = match[2].replace(/\D/g, '');

    if (!session.userId) {
      await this.sessionManager.updateSession(phoneNumber, {
        state: 'sending_confirm_pin',
        data: { amount, recipientPhone, direct: true }
      });
      return `📋 *Confirm Transaction*\n\nAmount: R${amount.toFixed(2)}\nTo: ${recipientPhone}\n\n🔒 Enter your PIN to confirm:`;
    }

    await this.sessionManager.updateSession(phoneNumber, {
      state: 'sending_confirm_pin',
      data: { amount, recipientPhone }
    });

    return `📋 *Confirm Transaction*\n\nAmount: R${amount.toFixed(2)}\nTo: ${recipientPhone}\n\n🔒 Enter your PIN to confirm:`;
  }

  async handleHistoryCommand(phoneNumber, session) {
    const user = await UserService.getUserByPhone(phoneNumber);

    if (!user) {
      return `You need to register first! Type "menu" and select option 1.`;
    }

    if (!session.userId) {
      await this.sessionManager.updateSession(phoneNumber, {
        state: 'awaiting_pin',
        data: { nextAction: 'history' }
      });
      return `🔒 Please enter your PIN:`;
    }

    const transactions = await WalletService.getTransactionHistory(user.id, 10);

    if (transactions.length === 0) {
      return `📜 *Transaction History*\n\nNo transactions yet.\n\nType "menu" for options.`;
    }

    let message = `📜 *Transaction History*\n\n`;

    transactions.forEach((tx, index) => {
      const date = new Date(tx.created_at).toLocaleDateString();
      const amount = parseFloat(tx.amount).toFixed(2);

      if (tx.direction === 'sent') {
        const recipient = tx.receiver_name || tx.receiver_phone || 'Unknown';
        message += `${index + 1}. Sent R${amount}\n   To: ${recipient}\n   ${date} | ${tx.status}\n\n`;
      } else {
        const sender = tx.sender_name || tx.sender_phone || 'Unknown';
        message += `${index + 1}. Received R${amount}\n   From: ${sender}\n   ${date} | ${tx.status}\n\n`;
      }
    });

    message += `Type "menu" for more options.`;

    return message;
  }

  async handlePendingCommand(phoneNumber, session) {
    const pending = await WalletService.getPendingTransfers(phoneNumber);

    if (pending.length === 0) {
      return `📋 *Pending Transfers*\n\nYou have no pending transfers.\n\nType "menu" for options.`;
    }

    let message = `📋 *Pending Transfers*\n\nYou have ${pending.length} pending transfer(s):\n\n`;

    pending.forEach((pt, index) => {
      const amount = parseFloat(pt.amount).toFixed(2);
      const expires = new Date(pt.expires_at).toLocaleDateString();
      message += `${index + 1}. R${amount} from ${pt.sender_name}\n   Expires: ${expires}\n\n`;
    });

    message += `Register to claim these transfers automatically!\n\nType "menu" for options.`;

    return message;
  }
}
