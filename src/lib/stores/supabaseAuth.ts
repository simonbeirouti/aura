import { createClient, type AuthSession, type User } from '@supabase/supabase-js';
import { invoke } from '@tauri-apps/api/core';
import { sessionStore, sessionActions } from './sessionStore';
import { storeManager } from './core/storeManager';
import { loadingActions } from './loadingStore';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env file and ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Enhanced auth store using new architecture
function createAuthStore() {
  return {
    // Subscribe to session store for reactive updates
    subscribe: sessionStore.subscribe,

    // Initialize auth state on app start
    async initialize() {
      loadingActions.showAuth('Initializing...');
      await sessionActions.setLoading(true);
      await sessionActions.setError(null);

      try {
        // Initialize store manager first
        await storeManager.initialize();
        
        // Load session data from persistent store
        await sessionActions.load();
        
        // Check if we have valid stored session
        const hasValidSession = await sessionActions.hasValidSession();
        
        if (hasValidSession) {
          // Try to restore session from stored tokens
          const tokens = await sessionActions.getTokens();
          if (tokens) {
            // Set the Supabase session with stored tokens
            const { data: { user }, error } = await supabase.auth.setSession({
              access_token: tokens.accessToken,
              refresh_token: tokens.refreshToken
            });
            
            if (user && !error) {
              const { data: { session } } = await supabase.auth.getSession();
              if (session) {
                await sessionActions.setAuthenticated(user, session);
                return;
              }
            }
          }
        }
        
        // No valid session found, check current Supabase session
        const { data: { session: currentSession } } = await supabase.auth.getSession();

        if (currentSession) {
          // Store the current session tokens
          await sessionActions.setAuthenticated(currentSession.user, currentSession);
        } else {
          // No session found
          await sessionActions.setUnauthenticated();
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
        await sessionActions.setUnauthenticated(
          error instanceof Error ? error.message : 'Authentication failed'
        );
      } finally {
        loadingActions.hideAuth();
      }
    },

    // Login with email and password
    async login(email: string, password: string) {
      loadingActions.showAuth('Signing you in...');
      await sessionActions.setLoading(true);
      await sessionActions.setError(null);

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          await sessionActions.setError(error.message);
          throw new Error(error.message);
        }

        if (data.session && data.user) {
          await sessionActions.setAuthenticated(data.user, data.session);
        }
      } catch (error) {
        console.error('Login failed:', error);
        await sessionActions.setError(
          error instanceof Error ? error.message : 'Login failed'
        );
        throw error;
      } finally {
        loadingActions.hideAuth();
      }
    },

    // Sign up with email and password
    async signUp(email: string, password: string) {
      loadingActions.showAuth('Creating your account...');
      await sessionActions.setLoading(true);
      await sessionActions.setError(null);

      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        });

        if (error) {
          await sessionActions.setError(error.message);
          throw new Error(error.message);
        }

        if (data.session && data.user) {
          await sessionActions.setAuthenticated(data.user, data.session);
        }
      } catch (error) {
        console.error('Sign up failed:', error);
        await sessionActions.setError(
          error instanceof Error ? error.message : 'Sign up failed'
        );
        throw error;
      } finally {
        loadingActions.hideAuth();
      }
    },

    // Logout
    async logout() {
      loadingActions.showAuth('Signing you out...');
      
      try {
        // Sign out from Supabase first
        await supabase.auth.signOut();
        
        // Clear session store after Supabase signout
        await sessionActions.setUnauthenticated();
      } catch (error) {
        console.error('Logout failed:', error);
        // Force clear session even if Supabase signout fails
        try {
          await sessionActions.setUnauthenticated(
            error instanceof Error ? error.message : 'Logout failed'
          );
        } catch (sessionError) {
          console.error('Failed to clear session:', sessionError);
          // Last resort: manually clear Supabase session
          await supabase.auth.signOut({ scope: 'local' });
        }
      } finally {
        loadingActions.hideAuth();
      }
    },

    // Refresh session
    async refreshSession() {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        
        if (error) {
          throw new Error(error.message);
        }
        
        if (data.session && data.user) {
          await sessionActions.setAuthenticated(data.user, data.session);
        }
      } catch (error) {
        console.error('Session refresh failed:', error);
        // If refresh fails, logout
        await this.logout();
        throw error;
      }
    },

    // Clear error
    async clearError() {
      await sessionActions.setError(null);
    },

    // Get current user
    getCurrentUser() {
      return supabase.auth.getUser();
    }
  };
}

export const authStore = createAuthStore();
