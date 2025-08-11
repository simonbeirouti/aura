import { writable, derived, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { authStore } from './supabaseAuth';
import { databaseStore } from './database';

// Payment method interface
export interface PaymentMethod {
  id: string;
  user_id: string;
  stripe_payment_method_id: string;
  card_brand: string;
  card_last4: string;
  card_exp_month: number;
  card_exp_year: number;
  is_default: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  last_used_at?: string;
}

// Profile interface (re-export from database store)
export interface Profile {
  id: string;
  updated_at?: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
  onboarding_complete?: boolean;
}

// Settings store state
interface SettingsState {
  // Profile data
  profile: Profile | null;
  profileLoading: boolean;
  profileError: string | null;
  profileLastFetch: number | null;
  
  // Payment methods data
  paymentMethods: PaymentMethod[];
  paymentMethodsLoading: boolean;
  paymentMethodsError: string | null;
  paymentMethodsLastFetch: number | null;
  
  // Stripe data
  customerId: string | null;
  stripeInitialized: boolean;
  
  // Cache settings
  cacheTTL: number; // 5 minutes
}

// Initial state
const initialState: SettingsState = {
  profile: null,
  profileLoading: false,
  profileError: null,
  profileLastFetch: null,
  
  paymentMethods: [],
  paymentMethodsLoading: false,
  paymentMethodsError: null,
  paymentMethodsLastFetch: null,
  
  customerId: null,
  stripeInitialized: false,
  
  cacheTTL: 5 * 60 * 1000 // 5 minutes
};

// Create the store
const settingsStore = writable<SettingsState>(initialState);

// Helper function to check if data is fresh
function isCacheFresh(lastFetch: number | null, ttl: number): boolean {
  if (!lastFetch) return false;
  return Date.now() - lastFetch < ttl;
}

// Settings store actions
export const settingsActions = {
  // Profile actions
  async loadProfile(forceRefresh = false): Promise<Profile | null> {
    const state = get(settingsStore);
    const user = get(authStore).user;
    
    if (!user) {
      settingsStore.update(s => ({ ...s, profileError: 'User not authenticated' }));
      return null;
    }

    // Return cached data if fresh and not forcing refresh
    if (!forceRefresh && state.profile && isCacheFresh(state.profileLastFetch, state.cacheTTL)) {
      return state.profile;
    }

    // Set loading state only if we don't have cached data
    if (!state.profile) {
      settingsStore.update(s => ({ ...s, profileLoading: true, profileError: null }));
    }

    try {
      // Initialize database if needed
      if (!get(databaseStore).isInitialized) {
        await databaseStore.initialize();
      }
      
      const profile = await databaseStore.getUserProfile(user.id);
      
      settingsStore.update(s => ({
        ...s,
        profile,
        profileLoading: false,
        profileError: null,
        profileLastFetch: Date.now()
      }));
      
      return profile;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load profile';
      settingsStore.update(s => ({
        ...s,
        profileLoading: false,
        profileError: errorMessage
      }));
      
      // Return cached data if available, even if stale
      return state.profile;
    }
  },

  async updateProfile(updates: Partial<Profile>): Promise<Profile | null> {
    const user = get(authStore).user;
    if (!user) return null;

    try {
      const updatedProfile = await databaseStore.updateUserProfile(user.id, updates);
      
      settingsStore.update(s => ({
        ...s,
        profile: updatedProfile,
        profileLastFetch: Date.now()
      }));
      
      return updatedProfile;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update profile';
      settingsStore.update(s => ({ ...s, profileError: errorMessage }));
      throw error;
    }
  },

  // Payment methods actions
  async loadPaymentMethods(forceRefresh = false): Promise<PaymentMethod[]> {
    const state = get(settingsStore);
    const user = get(authStore).user;
    
    if (!user) {
      settingsStore.update(s => ({ ...s, paymentMethodsError: 'User not authenticated' }));
      return [];
    }

    // Return cached data if fresh and not forcing refresh
    if (!forceRefresh && state.paymentMethods.length > 0 && isCacheFresh(state.paymentMethodsLastFetch, state.cacheTTL)) {
      return state.paymentMethods;
    }

    // Set loading state only if we don't have cached data
    if (state.paymentMethods.length === 0) {
      settingsStore.update(s => ({ ...s, paymentMethodsLoading: true, paymentMethodsError: null }));
    }

    try {
      // Ensure we have customer ID
      if (!state.customerId) {
        await settingsActions.initializeCustomer();
      }
      
      const paymentMethods = await invoke<PaymentMethod[]>('get_stored_payment_methods', {
        userId: user.id
      });
      
      settingsStore.update(s => ({
        ...s,
        paymentMethods,
        paymentMethodsLoading: false,
        paymentMethodsError: null,
        paymentMethodsLastFetch: Date.now()
      }));
      
      return paymentMethods;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load payment methods';
      
      // Try fallback to Stripe API if database fails
      try {
        const state = get(settingsStore);
        if (state.customerId) {
          const paymentMethods = await invoke<PaymentMethod[]>('list_payment_methods', {
            customerId: state.customerId
          });
          
          settingsStore.update(s => ({
            ...s,
            paymentMethods,
            paymentMethodsLoading: false,
            paymentMethodsError: null,
            paymentMethodsLastFetch: Date.now()
          }));
          
          return paymentMethods;
        }
      } catch (fallbackError) {
        console.error('Fallback to Stripe also failed:', fallbackError);
      }
      
      settingsStore.update(s => ({
        ...s,
        paymentMethodsLoading: false,
        paymentMethodsError: errorMessage
      }));
      
      // Return cached data if available, even if stale
      return state.paymentMethods;
    }
  },

  async initializeCustomer(): Promise<string | null> {
    const user = get(authStore).user;
    if (!user) return null;

    try {
      const customer = await invoke<{id: string}>('get_or_create_customer', {
        email: user.email || '',
        name: user.user_metadata?.full_name || user.email || 'Unknown User'
      });
      
      settingsStore.update(s => ({ ...s, customerId: customer.id }));
      return customer.id;
    } catch (error) {
      console.error('Failed to initialize customer:', error);
      return null;
    }
  },

  async addPaymentMethod(paymentMethod: PaymentMethod): Promise<void> {
    settingsStore.update(s => ({
      ...s,
      paymentMethods: [...s.paymentMethods, paymentMethod],
      paymentMethodsLastFetch: Date.now()
    }));
  },

  async removePaymentMethod(paymentMethodId: string): Promise<void> {
    settingsStore.update(s => ({
      ...s,
      paymentMethods: s.paymentMethods.filter(pm => pm.id !== paymentMethodId),
      paymentMethodsLastFetch: Date.now()
    }));
  },

  // Background refresh actions
  async refreshProfileInBackground(): Promise<void> {
    try {
      await settingsActions.loadProfile(true);
    } catch (error) {
      console.warn('Background profile refresh failed:', error);
    }
  },

  async refreshPaymentMethodsInBackground(): Promise<void> {
    try {
      await settingsActions.loadPaymentMethods(true);
    } catch (error) {
      console.warn('Background payment methods refresh failed:', error);
    }
  },

  // Cache management
  clearCache(): void {
    settingsStore.set(initialState);
  },

  invalidateProfileCache(): void {
    settingsStore.update(s => ({ ...s, profileLastFetch: null }));
  },

  invalidatePaymentMethodsCache(): void {
    settingsStore.update(s => ({ ...s, paymentMethodsLastFetch: null }));
  }
};

// Derived stores for easy access
export const profileStore = derived(
  settingsStore,
  $settings => ({
    profile: $settings.profile,
    loading: $settings.profileLoading,
    error: $settings.profileError
  })
);

export const paymentMethodsStore = derived(
  settingsStore,
  $settings => ({
    paymentMethods: $settings.paymentMethods,
    loading: $settings.paymentMethodsLoading,
    error: $settings.paymentMethodsError,
    customerId: $settings.customerId
  })
);

// Export the main store
export { settingsStore };
