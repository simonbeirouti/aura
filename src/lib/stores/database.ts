import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { authStore } from './supabaseAuth';
import { get } from 'svelte/store';

export interface Profile {
  id: string;
  updated_at?: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  onboarding_complete?: boolean;
}

interface DatabaseState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  currentProfile: Profile | null;
}

const initialState: DatabaseState = {
  isInitialized: false,
  isLoading: false,
  error: null,
  currentProfile: null,
};

function createDatabaseStore() {
  const { subscribe, set, update } = writable<DatabaseState>(initialState);

  return {
    subscribe,

    // Initialize database connection with current auth session
    async initialize() {
      // Check if already initialized or initializing
      let currentState: DatabaseState;
      const unsubscribe = subscribe(state => { currentState = state; });
      unsubscribe();

      if (currentState!.isInitialized) {
        return;
      }

      if (currentState!.isLoading) {
        return;
      }

      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        const authState = get(authStore);

        if (!authState.isAuthenticated || !authState.session) {
          throw new Error('Authentication required to initialize database');
        }

        // Get Supabase connection details from environment
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error('Supabase URL or anon key not configured');
        }

        // Ensure session tokens are stored in Tauri store first

        await invoke('store_tokens', {
          tokens: {
            accessToken: authState.session.access_token,
            refreshToken: authState.session.refresh_token
          }
        });

        // Initialize database with Supabase connection
        const databaseUrl = `${supabaseUrl}/rest/v1`;
        const accessToken = authState.session.access_token;


        await invoke('init_database', {
          databaseUrl: databaseUrl,
          accessToken: accessToken,
          anonKey: supabaseAnonKey
        });

        // Check database status
        const status = await invoke<Record<string, string>>('get_database_status');


        if (status.status === 'ready') {
          update(state => ({
            ...state,
            isInitialized: true,
            isLoading: false,
            error: null
          }));

        } else {
          throw new Error(`Database not ready: ${status.status}`);
        }
      } catch (error) {
        console.error('[Database] Initialization failed:', error);
        update(state => ({
          ...state,
          isInitialized: false,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Database initialization failed'
        }));
        throw error;
      }
    },

    // Helper function to ensure authentication and database are ready
    async ensureAuthenticatedAndReady(): Promise<void> {
      const authState = get(authStore);

      if (!authState.isAuthenticated || !authState.session) {
        throw new Error('Authentication required');
      }

      // Ensure tokens are stored in Tauri store
      await invoke('store_tokens', {
        tokens: {
          accessToken: authState.session.access_token,
          refreshToken: authState.session.refresh_token
        }
      });

      // Initialize database if not already done
      await this.initialize();
    },

    // Get user profile
    async getUserProfile(userId: string): Promise<Profile | null> {

      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        // Ensure authentication and database are ready
        await this.ensureAuthenticatedAndReady();

        const profile = await invoke<Profile | null>('get_user_profile', { userId: userId });


        update(state => ({
          ...state,
          currentProfile: profile,
          isLoading: false,
          error: null
        }));

        return profile;
      } catch (error) {
        update(state => ({
          ...state,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to get user profile'
        }));
        return null;
      }
    },

    // Update user profile
    async updateUserProfile(
      userId: string,
      updates: {
        username?: string;
        full_name?: string;
        avatar_url?: string;
        onboarding_complete?: boolean;
      }
    ): Promise<Profile | null> {

      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        // Ensure authentication and database are ready
        await this.ensureAuthenticatedAndReady();

        const invokeParams = {
          userId: userId,
          username: updates.username || null,
          fullName: updates.full_name || null,
          avatarUrl: updates.avatar_url || null,
          onboardingComplete: updates.onboarding_complete || null
        };

        const profile = await invoke<Profile>('update_user_profile', invokeParams);

        update(state => ({
          ...state,
          currentProfile: profile,
          isLoading: false,
          error: null
        }));

        return profile;
      } catch (error) {
        update(state => ({
          ...state,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to update profile'
        }));
        return null;
      }
    },

    // Create user profile
    async createUserProfile(
      userId: string,
      fullName?: string,
      avatarUrl?: string,
      onboardingComplete?: boolean
    ): Promise<Profile | null> {

      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        // Ensure authentication and database are ready
        await this.ensureAuthenticatedAndReady();

        const invokeParams = {
          userId: userId,
          fullName: fullName || null,
          avatarUrl: avatarUrl || null,
          onboardingComplete: onboardingComplete || null
        };

        const profile = await invoke<Profile>('create_user_profile', invokeParams);

        update(state => ({
          ...state,
          currentProfile: profile,
          isLoading: false,
          error: null
        }));

        return profile;
      } catch (error) {
        update(state => ({
          ...state,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to create profile'
        }));
        return null;
      }
    },

    // Check username availability
    async checkUsernameAvailability(username: string): Promise<boolean> {
      try {
        if (!username || username.length < 3) {
          return false;
        }

        // Ensure authentication and database are ready
        await this.ensureAuthenticatedAndReady();

        const result = await invoke<boolean>('check_username_availability', { username });

        return result;
      } catch (error) {
        console.error('[Database] Username availability check failed:', error);

        // If there's a database error, we should allow the username for now
        // This prevents users from getting stuck in onboarding
        console.warn('[Database] Allowing username due to check failure');
        return true;
      }
    },

    // Get database status
    async getStatus(): Promise<Record<string, string>> {
      try {
        return await invoke<Record<string, string>>('get_database_status');
      } catch (error) {
        console.error('Failed to get database status:', error);
        return { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
      }
    },

    // Clear error
    clearError() {
      update(state => ({ ...state, error: null }));
    },

    // Reset store
    reset() {
      set(initialState);
    }
  };
}

export const databaseStore = createDatabaseStore();
