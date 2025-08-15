import { writable, derived, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { centralizedAuth } from './unifiedAuth';
import { cacheManager, cacheKeys } from './cacheManager';

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
  stripe_customer_id?: string;
  subscription_id?: string;
  subscription_status?: string;
  subscription_period_end?: number;
  // Token balance fields
  total_tokens?: number;
  tokens_remaining?: number;
  tokens_used?: number;
  // Purchase tracking fields
  total_purchases?: number;
  total_spent_cents?: number;
  last_purchase_at?: string;
}

// Settings store state
interface SettingsState {
  // Profile data
  profile: Profile | null;
  profileLoading: boolean;
  profileError: string | null;
  
  // Payment methods data
  paymentMethods: PaymentMethod[];
  paymentMethodsLoading: boolean;
  paymentMethodsError: string | null;
  
  // Subscription data
  subscriptionData: any | null;
  subscriptionLoading: boolean;
  subscriptionError: string | null;
  
  // Stripe data
  customerId: string | null;
  stripeInitialized: boolean;
  
  // Loading coordination
  isInitialized: boolean;
  globalError: string | null;
}

// Initial state
const initialState: SettingsState = {
  profile: null,
  profileLoading: false,
  profileError: null,
  
  paymentMethods: [],
  paymentMethodsLoading: false,
  paymentMethodsError: null,
  
  subscriptionData: null,
  subscriptionLoading: false,
  subscriptionError: null,
  
  customerId: null,
  stripeInitialized: false,
  
  isInitialized: false,
  globalError: null
};

// Create the store
const settingsStore = writable<SettingsState>(initialState);

// Helper function to get current user ID (sync version using store state)
function getCurrentUserId(): string | null {
  let userId: string | null = null;
  const unsubscribe = centralizedAuth.subscribe(auth => {
    userId = auth.user?.id || null;
  });
  unsubscribe();
  return userId;
}

// Settings store actions
export const settingsActions = {
  // Initialize all settings data
  async initialize(): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) {
      console.warn('Cannot initialize settings: User not authenticated');
      return;
    }

    try {
      // Load all data in parallel (will use cache if available)
      // Each load function handles its own caching logic
      await Promise.allSettled([
        this.loadProfile(),
        this.loadPaymentMethods(),
        this.loadSubscription()
      ]);

      settingsStore.update(s => ({ ...s, isInitialized: true }));
    } catch (error) {
      console.error('Failed to initialize settings:', error);
      settingsStore.update(s => ({ 
        ...s, 
        globalError: 'Failed to initialize settings',
        isInitialized: true // Still mark as initialized to prevent loops
      }));
    }
  },

  // Profile actions
  async loadProfile(forceRefresh = false): Promise<Profile | null> {
    const userId = getCurrentUserId();
    if (!userId) {
      settingsStore.update(s => ({ ...s, profileError: 'User not authenticated' }));
      return null;
    }

    // Simple cache check
    const cacheKey = cacheKeys.profile(userId);
    if (!forceRefresh && cacheManager.has(cacheKey)) {
      const cached = cacheManager.get<Profile>(cacheKey);
      if (cached) {
        settingsStore.update(s => ({ ...s, profile: cached, profileError: null }));
        return cached;
      }
    }

    settingsStore.update(s => ({ ...s, profileLoading: true, profileError: null }));

    try {
      const profile = await invoke<Profile>('get_user_profile', { userId });
      
      // Cache the result
      if (profile) {
        cacheManager.set(cacheKey, profile, 5 * 60 * 1000);
      }
      
      settingsStore.update(s => ({
        ...s,
        profile,
        profileLoading: false,
        profileError: null
      }));

      return profile;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load profile';
      settingsStore.update(s => ({
        ...s,
        profileLoading: false,
        profileError: errorMessage
      }));
      console.error('Failed to load profile:', error);
      return null;
    }
  },

  async updateProfile(updates: Partial<Profile>): Promise<Profile | null> {
    const userId = getCurrentUserId();
    if (!userId) return null;

    settingsStore.update(s => ({ ...s, profileLoading: true, profileError: null }));

    try {
      const updatedProfile = await invoke<Profile>('update_user_profile', {
        userId,
        username: updates.username,
        fullName: updates.full_name,
        avatarUrl: updates.avatar_url,
        onboardingComplete: updates.onboarding_complete
      });
      
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
    const userId = getCurrentUserId();
    if (!userId) {
      settingsStore.update(s => ({ ...s, paymentMethodsError: 'User not authenticated' }));
      return [];
    }

    // Simple cache check
    const cacheKey = cacheKeys.paymentMethods(userId);
    if (!forceRefresh && cacheManager.has(cacheKey)) {
      const cached = cacheManager.get<PaymentMethod[]>(cacheKey);
      if (cached) {
        settingsStore.update(s => ({ ...s, paymentMethods: cached, paymentMethodsError: null }));
        return cached;
      }
    }

    settingsStore.update(s => ({ ...s, paymentMethodsLoading: true, paymentMethodsError: null }));

    try {
      // Initialize customer if needed
      await this.initializeCustomer();

      const paymentMethods = await invoke<PaymentMethod[]>('get_stored_payment_methods', { userId });
      
      // Cache the result
      if (paymentMethods) {
        cacheManager.set(cacheKey, paymentMethods, 3 * 60 * 1000);
      }
      
      settingsStore.update(s => ({
        ...s,
        paymentMethods: paymentMethods || [],
        paymentMethodsLoading: false,
        paymentMethodsError: null
      }));

      return paymentMethods || [];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load payment methods';
      settingsStore.update(s => ({
        ...s,
        paymentMethodsLoading: false,
        paymentMethodsError: errorMessage
      }));
      console.error('Failed to load payment methods:', error);
      return [];
    }
  },

  async initializeCustomer(): Promise<string | null> {
    const userId = getCurrentUserId();
    if (!userId) return null;

    const cacheKey = cacheKeys.stripeCustomer(userId);
    
    // Try cache first
    const cached = cacheManager.get<string>(cacheKey);
    if (cached) {
      settingsStore.update(s => ({ ...s, customerId: cached }));
      return cached;
    }

    try {
      const customerId = await invoke<string>('initialize_stripe_customer', { userId });
      
      // Cache customer ID for longer (1 hour)
      cacheManager.set(cacheKey, customerId, 60 * 60 * 1000);
      
      settingsStore.update(s => ({ ...s, customerId }));
      return customerId;
    } catch (error) {
      console.error('Failed to initialize customer:', error);
      return null;
    }
  },

  async addPaymentMethod(paymentMethod: PaymentMethod): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) return;

    // Update store immediately
    settingsStore.update(s => ({
      ...s,
      paymentMethods: [...s.paymentMethods, paymentMethod]
    }));

    // Update cache
    const cacheKey = cacheKeys.paymentMethods(userId);
    const current = cacheManager.get<PaymentMethod[]>(cacheKey) || [];
    cacheManager.set(cacheKey, [...current, paymentMethod], 3 * 60 * 1000);
  },

  async removePaymentMethod(paymentMethodId: string): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) return;

    // Update store immediately
    settingsStore.update(s => ({
      ...s,
      paymentMethods: s.paymentMethods.filter(pm => pm.id !== paymentMethodId)
    }));

    // Update cache
    const cacheKey = cacheKeys.paymentMethods(userId);
    const current = cacheManager.get<PaymentMethod[]>(cacheKey) || [];
    cacheManager.set(cacheKey, current.filter(pm => pm.id !== paymentMethodId), 3 * 60 * 1000);
  },

  // Background refresh actions (smart refresh only when needed)
  async refreshProfileInBackground(): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) return;

    const cacheKey = cacheKeys.profile(userId);
    
    // Only refresh if cache is getting stale (80% of TTL)
    if (cacheManager.has(cacheKey)) {
      const entry = cacheManager.get(cacheKey);
      if (entry) return; // Still fresh, no need to refresh
    }

    try {
      await this.loadProfile(true);
    } catch (error) {
      console.warn('Background profile refresh failed:', error);
    }
  },

  async refreshPaymentMethodsInBackground(): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) return;

    const cacheKey = cacheKeys.paymentMethods(userId);
    
    // Only refresh if cache is getting stale
    if (cacheManager.has(cacheKey)) {
      return; // Still fresh
    }

    try {
      await this.loadPaymentMethods(true);
    } catch (error) {
      console.warn('Background payment methods refresh failed:', error);
    }
  },

  // Subscription actions
  async loadSubscription(forceRefresh = false): Promise<any | null> {
    const userId = getCurrentUserId();
    if (!userId) {
      settingsStore.update(s => ({ ...s, subscriptionError: 'User not authenticated' }));
      return null;
    }

    // Simple cache check
    const cacheKey = cacheKeys.subscription(userId);
    if (!forceRefresh && cacheManager.has(cacheKey)) {
      const cached = cacheManager.get<any>(cacheKey);
      if (cached) {
        settingsStore.update(s => ({ ...s, subscriptionData: cached, subscriptionError: null }));
        return cached;
      }
    }

    settingsStore.update(s => ({ ...s, subscriptionLoading: true, subscriptionError: null }));

    try {
      // Get subscription data from profile first
      const profile = await invoke<Profile>('get_user_profile', { userId });
      
      let subscriptionData = null;
      if (profile?.subscription_id) {
        try {
          subscriptionData = await invoke<any>('get_subscription', {
            subscriptionId: profile.subscription_id
          });
        } catch (subError) {
          console.warn('Failed to get subscription details:', subError);
          // Use profile data as fallback
          subscriptionData = {
            subscription_id: profile.subscription_id,
            status: profile.subscription_status,
            current_period_end: profile.subscription_period_end
          };
        }
      }
      
      // Cache the result
      cacheManager.set(cacheKey, subscriptionData, 2 * 60 * 1000);
      
      settingsStore.update(s => ({
        ...s,
        subscriptionData,
        subscriptionLoading: false,
        subscriptionError: null
      }));

      return subscriptionData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load subscription';
      settingsStore.update(s => ({
        ...s,
        subscriptionLoading: false,
        subscriptionError: errorMessage
      }));
      console.error('Failed to load subscription:', error);
      return null;
    }
  },

  async syncSubscription(userId: string, subscriptionId: string): Promise<any | null> {
    try {
      const subscriptionData = await invoke<any>('sync_subscription', {
        userId,
        subscriptionId
      });
      
      // Update cache immediately
      const cacheKey = cacheKeys.subscription(userId);
      cacheManager.set(cacheKey, subscriptionData, 2 * 60 * 1000);
      
      settingsStore.update(s => ({
        ...s,
        subscriptionData
      }));

      // Also refresh profile to get updated subscription fields
      await this.loadProfile(true);

      return subscriptionData;
    } catch (error) {
      console.error('Failed to sync subscription:', error);
      return null;
    }
  },

  async refreshSubscriptionInBackground(): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) return;

    const cacheKey = cacheKeys.subscription(userId);
    
    // Only refresh if cache is getting stale
    if (cacheManager.has(cacheKey)) {
      return; // Still fresh
    }

    try {
      await this.loadSubscription(true);
    } catch (error) {
      console.warn('Background subscription refresh failed:', error);
    }
  },

  // Cache management
  clearCache(): void {
    const userId = getCurrentUserId();
    if (userId) {
      // Clear all user-specific cache entries
      cacheManager.invalidatePattern(cacheKeys.userPattern(userId));
    }
    
    // Reset store state
    settingsStore.update(s => ({
      ...s,
      profile: null,
      paymentMethods: [],
      subscriptionData: null,
      isInitialized: false
    }));
  },

  invalidateProfileCache(): void {
    const userId = getCurrentUserId();
    if (userId) {
      cacheManager.delete(cacheKeys.profile(userId));
    }
  },

  invalidatePaymentMethodsCache(): void {
    const userId = getCurrentUserId();
    if (userId) {
      cacheManager.delete(cacheKeys.paymentMethods(userId));
    }
  },

  invalidateSubscriptionCache(): void {
    const userId = getCurrentUserId();
    if (userId) {
      cacheManager.delete(cacheKeys.subscription(userId));
    }
  },

  // Force refresh all data
  async refreshAll(): Promise<void> {
    await Promise.allSettled([
      this.loadProfile(true),
      this.loadPaymentMethods(true),
      this.loadSubscription(true)
    ]);
  },

  // Purchase completion hook
  async handlePurchaseCompletion(): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) return;

    try {
      // Use cache manager to handle purchase completion cache invalidation
      cacheManager.handlePurchaseCompletion(userId);
      
      // Also explicitly invalidate purchases cache
      this.invalidatePurchasesCache();
      
      // Force refresh profile to get updated token balance
      await this.loadProfile(true);
    } catch (error) {
      console.error('Settings store: Failed to refresh profile after purchase:', error);
    }
  },

  // Token balance refresh (specific method for token updates)
  async refreshTokenBalance(): Promise<Profile | null> {
    const userId = getCurrentUserId();
    if (!userId) return null;

    try {
      // Force refresh profile data to get latest token balances
      const profile = await this.loadProfile(true);
      
      return profile;
    } catch (error) {
      console.error('Settings store: Failed to refresh token balance:', error);
      return null;
    }
  },

  // Purchases cache management
  invalidatePurchasesCache(): void {
    const userId = getCurrentUserId();
    if (userId) {
      cacheManager.delete(cacheKeys.userPurchases(userId));
    }
  },

  async refreshPurchasesInBackground(): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) return;

    const cacheKey = cacheKeys.userPurchases(userId);
    
    // Only refresh if cache is getting stale
    if (cacheManager.has(cacheKey)) {
      return; // Still fresh
    }

    try {
      console.log('Settings store: Background refresh of purchases cache');
      // This would trigger a background load if the purchases page is loaded
      // For now, we just log that the cache is stale
    } catch (error) {
      console.warn('Settings store: Background purchases refresh failed:', error);
    }
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

export const subscriptionStore = derived(
  settingsStore,
  $settings => ({
    subscriptionData: $settings.subscriptionData,
    loading: $settings.subscriptionLoading,
    error: $settings.subscriptionError
  })
);

// Export the main store
export { settingsStore };
