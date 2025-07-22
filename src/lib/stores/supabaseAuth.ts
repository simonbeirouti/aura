import { writable } from 'svelte/store';
import { createClient, type AuthSession, type User } from '@supabase/supabase-js';
import { invoke } from '@tauri-apps/api/core';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env file and ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Auth store interface
interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  session: AuthSession | null;
  error: string | null;
}

// Initial state
const initialState: AuthState = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  session: null,
  error: null,
};

// Create the store
function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(initialState);

  return {
    subscribe,

    // Initialize auth state on app start
    async initialize() {
      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        // First, check current Supabase session
        const { data: { session: currentSession } } = await supabase.auth.getSession();

        if (currentSession) {
          try {
            // Store the current session tokens

            await invoke('store_tokens', {
              tokens: {
                accessToken: currentSession.access_token,
                refreshToken: currentSession.refresh_token
              }
            });

          } catch (tokenError) {
            console.error('[Auth] Failed to store tokens during initialization:', tokenError);
            // Continue anyway - token storage failure shouldn't block authentication
          }

          update(state => ({
            ...state,
            isAuthenticated: true,
            isLoading: false,
            user: currentSession.user,
            session: currentSession,
            error: null
          }));
          return;
        }

        // Check if we have stored tokens
        const hasSession = await invoke<boolean>('check_session');

        if (hasSession) {
          const tokens = await invoke<{ access_token: string; refresh_token: string }>('get_tokens');

          // Set session in Supabase client
          const { data, error } = await supabase.auth.setSession({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token
          });

          if (error) {
            // Clear invalid tokens
            await invoke('logout');
            update(state => ({ ...state, isAuthenticated: false, isLoading: false, error: error.message }));
            return;
          }

          if (data.session) {
            // Update stored tokens if they were refreshed
            await invoke('store_tokens', {
              tokens: {
                accessToken: data.session.access_token,
                refreshToken: data.session.refresh_token
              }
            });

            update(state => ({
              ...state,
              isAuthenticated: true,
              isLoading: false,
              user: data.user,
              session: data.session,
              error: null
            }));
            return;
          }
        }

        // No valid session found
        update(state => ({ ...state, isAuthenticated: false, isLoading: false }));

      } catch (error) {
        update(state => ({
          ...state,
          isAuthenticated: false,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Authentication initialization failed'
        }));
      }
    },

    // Login with email and password
    async login(email: string, password: string) {
      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) {
          update(state => ({ ...state, isLoading: false, error: error.message }));
          return { success: false, error: error.message };
        }

        if (data.session) {
          try {
            // Store tokens securely

            await invoke('store_tokens', {
              tokens: {
                accessToken: data.session.access_token,
                refreshToken: data.session.refresh_token
              }
            });

          } catch (tokenError) {
            console.error('[Auth] Failed to store tokens:', tokenError);
            // Continue anyway - token storage failure shouldn't block login
          }

          update(state => ({
            ...state,
            isAuthenticated: true,
            isLoading: false,
            user: data.user,
            session: data.session,
            error: null
          }));


          return { success: true, message: undefined };
        }

        return { success: false, error: 'No session returned' };
      } catch (error) {
        update(state => ({ ...state, isLoading: false, error: error instanceof Error ? error.message : 'Login failed' }));
        return { success: false, error: error instanceof Error ? error.message : 'Login failed' };
      }
    },

    // Sign up with email and password
    async signUp(email: string, password: string) {
      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        });

        if (error) {
          update(state => ({ ...state, isLoading: false, error: error.message }));
          return { success: false, error: error.message };
        }

        if (data.session) {
          try {
            // Store tokens securely

            await invoke('store_tokens', {
              tokens: {
                accessToken: data.session.access_token,
                refreshToken: data.session.refresh_token
              }
            });

          } catch (tokenError) {
            console.error('[Auth] Failed to store tokens:', tokenError);
            // Continue anyway - token storage failure shouldn't block signup
          }

          update(state => ({
            ...state,
            isAuthenticated: true,
            isLoading: false,
            user: data.user,
            session: data.session,
            error: null
          }));


          return { success: true, message: 'Account created successfully!' };
        }

        return { success: false, error: 'Unexpected signup response' };
      } catch (error) {
        update(state => ({ ...state, isLoading: false, error: error instanceof Error ? error.message : 'Signup failed' }));
        return { success: false, error: error instanceof Error ? error.message : 'Signup failed' };
      }
    },

    // Logout
    async logout() {
      try {
        // Sign out from Supabase
        const { error } = await supabase.auth.signOut();

        // Clear stored tokens
        await invoke('logout');

        // Update state
        update(state => ({
          ...state,
          isAuthenticated: false,
          isLoading: false,
          user: null,
          session: null,
          error: null
        }));

      } catch (error) {
        // Force local logout even if there's an error
        update(state => ({
          ...state,
          isAuthenticated: false,
          isLoading: false,
          user: null,
          session: null,
          error: null
        }));
      }
    },

    // Refresh session
    async refreshSession() {
      try {
        const { data, error } = await supabase.auth.refreshSession();

        if (error) {
          // If refresh fails, logout
          await this.logout();
          return { success: false, error: error.message };
        }

        if (data.session) {
          // Update stored tokens
          await invoke('update_tokens', {
            tokens: {
              accessToken: data.session.access_token,
              refreshToken: data.session.refresh_token
            }
          });

          update(state => ({
            ...state,
            session: data.session,
            user: data.user
          }));

          return { success: true, message: undefined };
        }

        return { success: false, error: 'No session returned', message: undefined };
      } catch (error) {
        await this.logout();
        return { success: false, error: error instanceof Error ? error.message : 'Refresh failed' };
      }
    },

    // Clear error
    clearError() {
      update(state => ({ ...state, error: null }));
    },

    // Get current user
    getCurrentUser() {
      return supabase.auth.getUser();
    },
  };
}

export const authStore = createAuthStore();
