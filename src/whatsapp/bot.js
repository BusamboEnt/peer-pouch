import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { MessageHandler } from './messageHandler.js';

export class WhatsAppBot {
  constructor() {
    this.sock = null;
    this.messageHandler = new MessageHandler();
  }

  async start() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      getMessage: async (key) => {
        return { conversation: '' };
      }
    });

    this.sock = sock;

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n📱 Scan this QR code with WhatsApp:\n');
        qrcode.generate(qr, { small: true });
        console.log('\n');
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
          : true;

        console.log('❌ Connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect);

        if (shouldReconnect) {
          await this.start();
        }
      } else if (connection === 'open') {
        console.log('✅ WhatsApp bot connected successfully!');
        console.log('🤖 Bot is ready to receive messages');
      }
    });

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const message of messages) {
        await this.handleMessage(message);
      }
    });
  }

  async handleMessage(message) {
    try {
      // Ignore messages from self
      if (message.key.fromMe) return;

      // Get sender info
      const sender = message.key.remoteJid;
      const messageText = message.message?.conversation ||
                         message.message?.extendedTextMessage?.text ||
                         '';

      if (!messageText) return;

      console.log(`📩 Message from ${sender}: ${messageText}`);

      // Process message
      const response = await this.messageHandler.processMessage(sender, messageText);

      // Send response
      if (response) {
        await this.sendMessage(sender, response);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      const sender = message.key.remoteJid;
      await this.sendMessage(sender, '❌ Sorry, an error occurred. Please try again or type "help" for assistance.');
    }
  }

  async sendMessage(to, text) {
    try {
      await this.sock.sendMessage(to, { text });
      console.log(`📤 Sent to ${to}: ${text.substring(0, 50)}...`);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  getSocket() {
    return this.sock;
  }
}
