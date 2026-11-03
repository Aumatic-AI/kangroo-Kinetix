import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/services/logger/logger';

// Public signup is disabled; the single account is provisioned by
// scripts/create-admin-user.mjs. A bare username (no "@") maps to this domain.
const USERNAME_EMAIL_DOMAIN = 'kangrooo.com';

function toEmail(identifier: string) {
  const v = identifier.trim().toLowerCase();
  return v.includes('@') ? v : `${v}@${USERNAME_EMAIL_DOMAIN}`;
}

export class AuthService {
  /**
   * Securely authenticates a user using their email and password.
   * Note: This must be called with a Client-Side Supabase instance to automatically 
   * set browser cookies for Next.js Middleware parsing.
   */
  async login(supabase: SupabaseClient, identifier: string, password: string) {
    const email = toEmail(identifier);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logger.warn('Login attempt failed', { error: error.message, email });
        return { success: false, error: error.message };
      }

      logger.info('User successfully logged in', { userId: data.user?.id });
      return { success: true, data };
    } catch (error: any) {
      logger.error('Unexpected error during login', { error: error.message });
      return { success: false, error: 'An unexpected error occurred. Please try again.' };
    }
  }

  /**
   * Logs out the current user and clears the session.
   */
  async logout(supabase: SupabaseClient) {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        logger.error('Logout error', { error: error.message });
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (error: any) {
      logger.error('Unexpected error during logout', { error: error.message });
      return { success: false, error: 'An unexpected error occurred during logout.' };
    }
  }
}

export const authService = new AuthService();
