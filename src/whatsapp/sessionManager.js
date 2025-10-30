import { query } from '../database/db.js';

export class SessionManager {
  /**
   * Get or create a session for a phone number
   */
  async getSession(phoneNumber) {
    const result = await query(
      `SELECT phone_number, user_id, session_data, last_interaction
       FROM whatsapp_sessions
       WHERE phone_number = $1`,
      [phoneNumber]
    );

    if (result.rows.length === 0) {
      // Create new session
      const defaultSession = {
        state: 'new',
        data: {}
      };

      await query(
        `INSERT INTO whatsapp_sessions (phone_number, session_data, last_interaction)
         VALUES ($1, $2, NOW())`,
        [phoneNumber, JSON.stringify(defaultSession)]
      );

      return {
        phoneNumber,
        userId: null,
        state: 'new',
        data: {}
      };
    }

    const session = result.rows[0];
    const sessionData = session.session_data || { state: 'new', data: {} };

    return {
      phoneNumber: session.phone_number,
      userId: session.user_id,
      state: sessionData.state || 'new',
      data: sessionData.data || {}
    };
  }

  /**
   * Update session state and data
   */
  async updateSession(phoneNumber, updates) {
    const currentSession = await this.getSession(phoneNumber);

    const newSessionData = {
      state: updates.state || currentSession.state,
      data: updates.data !== undefined ? updates.data : currentSession.data
    };

    await query(
      `UPDATE whatsapp_sessions
       SET session_data = $1, user_id = $2, last_interaction = NOW()
       WHERE phone_number = $3`,
      [JSON.stringify(newSessionData), updates.userId || currentSession.userId, phoneNumber]
    );
  }

  /**
   * Clear session (logout)
   */
  async clearSession(phoneNumber) {
    await query(
      `UPDATE whatsapp_sessions
       SET session_data = $1, user_id = NULL, last_interaction = NOW()
       WHERE phone_number = $2`,
      [JSON.stringify({ state: 'new', data: {} }), phoneNumber]
    );
  }

  /**
   * Delete old sessions (cleanup)
   */
  async cleanupOldSessions(daysOld = 30) {
    const result = await query(
      `DELETE FROM whatsapp_sessions
       WHERE last_interaction < NOW() - INTERVAL '${daysOld} days'
       RETURNING phone_number`,
      []
    );

    return result.rowCount;
  }
}
