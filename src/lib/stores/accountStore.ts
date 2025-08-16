import { writable, derived, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { centralizedAuth } from './unifiedAuth';
import { cacheManager, cacheKeys } from './cacheManager';
import { createEnhancedStore } from './core/storeManager';
import { storeManager } from './core/storeManager';

// Account balance interface
export interface AccountBalance {
  userId: string;
  totalTokens: number;
  tokensRemaining: number;
  tokensUsed: number;
  lastUpdated: number;
}

// Account state interface
export interface AccountState {
  // Current user's account data
  currentAccount: AccountBalance | null;
  
  // Loading states
  isLoading: boolean;
  isInitialized: boolean;
  
  // Error handling
  error: string | null;
  
  // Cache and sync state
  lastSync: number | null;
  lastBackgroundRefresh: number | null;
}

// Initial account state
const initialAccountState: AccountState = {
  currentAccount: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  lastSync: null,
  lastBackgroundRefresh: null
};

// Create enhanced account store
const accountStore = createEnhancedStore('account', initialAccountState, {
  saveOnChange: true,
  saveStrategy: 'debounce',
  saveInterval: 2000,
  syncStrategy: 'throttle',
  syncInterval: 30000, // 30 seconds for background sync
  autoStart: false, // Lazy loaded
  filterKeys: ['isLoading', 'error'], // Don't persist loading states
  filterKeysStrategy: 'omit'
});

// Register with store manager
storeManager.registerStore('account', accountStore);

// Helper function to get current user ID (sync version using store state)
function getCurrentUserId(): string | null {
  let userId: string | null = null;
  const unsubscribe = centralizedAuth.subscribe(auth => {
    userId = auth.user?.id || null;
  });
  unsubscribe();
  return userId;
}

// Account store actions
export const accountActions = {
  // Initialize account store
  async initialize(): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) {
      console.warn('Cannot initialize account: User not authenticated');
      return;
    }

    try {
      accountStore.update(s => ({ ...s, isLoading: true, error: null }));
      
      // Load account data with smart caching
      await this.loadAccountBalance();
      
      accountStore.update(s => ({ 
        ...s, 
        isInitialized: true, 
        isLoading: false,
        lastSync: Date.now()
      }));
    } catch (error) {
      console.error('Failed to initialize account store:', error);
      accountStore.update(s => ({ 
        ...s, 
        error: 'Failed to initialize account',
        isLoading: false,
        isInitialized: true // Still mark as initialized to prevent loops
      }));
    }
  },

  // Load account balance with smart caching
  async loadAccountBalance(forceRefresh = false): Promise<AccountBalance | null> {
    const userId = getCurrentUserId();
    if (!userId) {
      accountStore.update(s => ({ ...s, error: 'User not authenticated' }));
      return null;
    }

    // Check cache first (unless forcing refresh)
    const cacheKey = cacheKeys.userTokenBalance(userId);
    if (!forceRefresh && cacheManager.has(cacheKey)) {
      const cached = cacheManager.get<AccountBalance>(cacheKey);
      if (cached) {
        accountStore.update(s => ({ 
          ...s, 
          currentAccount: cached, 
          error: null,
          lastSync: Date.now()
        }));
        return cached;
      }
    }

    accountStore.update(s => ({ ...s, isLoading: true, error: null }));

    try {
      // Get profile data from backend (includes token balance)
      const profile = await invoke<any>('get_user_profile', { userId });
      
      if (!profile) {
        throw new Error('Profile not found');
      }

      // Extract account balance data
      const accountBalance: AccountBalance = {
        userId,
        totalTokens: profile.total_tokens || 0,
        tokensRemaining: profile.tokens_remaining || 0,
        tokensUsed: profile.tokens_used || 0,
        lastUpdated: Date.now()
      };

      // Cache the result (5 minutes TTL for balance data)
      cacheManager.set(cacheKey, accountBalance, 5 * 60 * 1000);
      
      accountStore.update(s => ({
        ...s,
        currentAccount: accountBalance,
        isLoading: false,
        error: null,
        lastSync: Date.now()
      }));

      return accountBalance;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load account balance';
      accountStore.update(s => ({
        ...s,
        isLoading: false,
        error: errorMessage
      }));
      console.error('Failed to load account balance:', error);
      return null;
    }
  },

  // Refresh account balance (force refresh)
  async refreshBalance(): Promise<AccountBalance | null> {
    return this.loadAccountBalance(true);
  },

  // Background refresh (smart refresh only when needed)
  async refreshInBackground(): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) return;

    const cacheKey = cacheKeys.userTokenBalance(userId);
    
    // Only refresh if cache is getting stale (80% of TTL)
    if (cacheManager.has(cacheKey)) {
      const entry = cacheManager.get<AccountBalance>(cacheKey);
      if (entry && entry.lastUpdated > Date.now() - (4 * 60 * 1000)) { // 4 minutes (80% of 5 min TTL)
        return; // Still fresh, no need to refresh
      }
    }

    try {
      await this.loadAccountBalance(true);
      accountStore.update(s => ({ ...s, lastBackgroundRefresh: Date.now() }));
    } catch (error) {
      console.warn('Background account refresh failed:', error);
    }
  },

  // Start background refresh interval
  startBackgroundRefresh(): void {
    // Refresh every 2 minutes in background
    setInterval(() => {
      this.refreshInBackground();
    }, 2 * 60 * 1000);
  },

  // Stop background refresh
  stopBackgroundRefresh(): void {
    // This would need to be implemented with a proper interval ID
    // For now, we'll rely on the store coordinator's background refresh
  },

  // Handle purchase completion - update token balance
  async handlePurchaseCompletion(): Promise<void> {
    const userId = getCurrentUserId();
    if (!userId) return;

    try {
      // Invalidate balance cache
      cacheManager.delete(cacheKeys.userTokenBalance(userId));
      
      // Force refresh balance
      await this.loadAccountBalance(true);
      
      console.log('Account store: Balance refreshed after purchase completion');
    } catch (error) {
      console.error('Account store: Failed to refresh balance after purchase:', error);
    }
  },

  // Update token balance (for immediate UI updates)
  updateTokenBalance(tokensRemaining: number, tokensUsed?: number): void {
    accountStore.update(s => {
      if (!s.currentAccount) {
        return { ...s };
      }
      
      return {
        ...s,
        currentAccount: {
          ...s.currentAccount,
          tokensRemaining,
          tokensUsed: tokensUsed ?? s.currentAccount.tokensUsed,
          lastUpdated: Date.now()
        }
      };
    });
  },

  // Get current balance (sync version)
  getCurrentBalance(): AccountBalance | null {
    let currentState: AccountState | null = null;
    const unsubscribe = accountStore.subscribe(state => {
      currentState = state;
    });
    unsubscribe();
    return currentState?.currentAccount || null;
  },

  // Cache management
  clearCache(): void {
    const userId = getCurrentUserId();
    if (userId) {
      cacheManager.delete(cacheKeys.userTokenBalance(userId));
    }
    
    // Reset store state
    accountStore.update(s => ({
      ...s,
      currentAccount: null,
      isInitialized: false,
      lastSync: null,
      lastBackgroundRefresh: null
    }));
  },

  invalidateBalanceCache(): void {
    const userId = getCurrentUserId();
    if (userId) {
      cacheManager.delete(cacheKeys.userTokenBalance(userId));
    }
  },

  // Reset store to initial state
  reset(): void {
    accountStore.reset();
  },

  // Destroy store
  destroy(): void {
    accountStore.destroy();
  }
};

// Derived stores for easy access
export const accountBalanceStore = derived(
  accountStore,
  $account => ({
    balance: $account.currentAccount,
    loading: $account.isLoading,
    error: $account.error,
    isInitialized: $account.isInitialized
  })
);

export const tokenBalanceStore = derived(
  accountStore,
  $account => ({
    tokensRemaining: $account.currentAccount?.tokensRemaining || 0,
    tokensUsed: $account.currentAccount?.tokensUsed || 0,
    totalTokens: $account.currentAccount?.totalTokens || 0,
    lastUpdated: $account.currentAccount?.lastUpdated || null
  })
);

// Export the main store
export { accountStore };
