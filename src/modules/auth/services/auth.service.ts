import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/services/logger/logger';

export class AuthService {
  /**
   * Securely authenticates a user using their email and password.
   * Note: This must be called with a Client-Side Supabase instance to automatically 
   * set browser cookies for Next.js Middleware parsing.
   */
  async login(supabase: SupabaseClient, email: string, password: string) {
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
   * Creates a new account. Profile creation and enrollment into the
   * single business are handled automatically by database triggers
   * (on_auth_user_created, on_profile_created_join_business) — nothing
   * else needs to happen here.
   */
  async signUp(supabase: SupabaseClient, email: string, password: string, fullName: string) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      });

      if (error) {
        logger.warn('Sign up attempt failed', { error: error.message, email });
        return { success: false, error: error.message };
      }

      // If email confirmation is required, Supabase returns a user but no session.
      const needsEmailConfirmation = !data.session;

      logger.info('User successfully signed up', { userId: data.user?.id, needsEmailConfirmation });
      return { success: true, data, needsEmailConfirmation };
    } catch (error: any) {
      logger.error('Unexpected error during sign up', { error: error.message });
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
