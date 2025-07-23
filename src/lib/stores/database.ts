import { invoke } from '@tauri-apps/api/core';
import { dataStore, dataActions } from './dataStore';
import { sessionActions } from './sessionStore';

export interface Profile {
  id: string;
  updated_at?: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  onboarding_complete?: boolean;
}

// Enhanced database store using new architecture
function createDatabaseStore() {
  return {
    // Subscribe to data store for reactive updates
    subscribe: dataStore.subscribe,

    // Initialize database connection with current auth session
    async initialize() {
      await dataActions.initialize();
    },

    // Get user profile
    async getUserProfile(userId: string): Promise<Profile | null> {
      return await dataActions.getUserProfile(userId);
    },

    // Update user profile
    async updateUserProfile(
      userId: string,
      updates: Partial<Profile>
    ): Promise<Profile | null> {
      return await dataActions.updateUserProfile(userId, updates);
    },

    // Create user profile
    async createUserProfile(
      userId: string,
      profileData: Partial<Profile>
    ): Promise<Profile | null> {
      return await dataActions.createUserProfile(userId, profileData);
    },

    // Check username availability
    async checkUsernameAvailability(username: string): Promise<boolean> {
      return await dataActions.checkUsernameAvailability(username);
    },

    // Get database status
    async getDatabaseStatus() {
      try {
        return await invoke('get_database_status');
      } catch (error) {
        console.error('Failed to get database status:', error);
        return { error: error instanceof Error ? error.message : 'Status check failed' };
      }
    },

    // Sync data
    async sync() {
      await dataActions.sync();
    },

    // Load data
    async load() {
      await dataActions.load();
    },

    // Save data
    async save() {
      await dataActions.save();
    }
  };
}

export const databaseStore = createDatabaseStore();
