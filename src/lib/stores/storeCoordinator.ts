import { writable, derived, get } from 'svelte/store';
import { cacheManager, cacheKeys } from './cacheManager';
import { settingsActions } from './settingsStore';
import { centralizedAuth } from './unifiedAuth';
import { dataActions } from './dataStore';
import { stripeStore } from './stripeStore';

// Store coordinator state
interface CoordinatorState {
  isInitialized: boolean;
  lastFullSync: number | null;
  syncInProgress: boolean;
  errors: string[];
  stats: {
    cacheHits: number;
    cacheMisses: number;
    syncCount: number;
    errorCount: number;
  };
}

// Initial coordinator state
const initialState: CoordinatorState = {
  isInitialized: false,
  lastFullSync: null,
  syncInProgress: false,
  errors: [],
  stats: {
    cacheHits: 0,
    cacheMisses: 0,
    syncCount: 0,
    errorCount: 0
  }
};

// Create store coordinator
class StoreCoordinator {
  private store = writable<CoordinatorState>(initialState);
  private syncTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.setupAuthListener();
  }

  // Store interface
  get subscribe() {
    return this.store.subscribe;
  }

  // Initialize all stores with coordinated caching
  async initialize(): Promise<void> {
    const state = get(this.store);
    if (state.isInitialized) return;

    this.store.update(s => ({ ...s, syncInProgress: true }));

    try {
      // Check if user is authenticated
      const auth = await centralizedAuth.getState();
      if (!auth.isAuthenticated || !auth.user?.id) {
        console.warn('Store coordinator: User not authenticated, skipping initialization');
        return;
      }

      // Initialize core stores in optimal order
      await this.initializeStores();

      // Start periodic sync
      this.startPeriodicSync();

      this.store.update(s => ({
        ...s,
        isInitialized: true,
        syncInProgress: false,
        lastFullSync: Date.now(),
        stats: { ...s.stats, syncCount: s.stats.syncCount + 1 }
      }));

    } catch (error) {
      console.error('Store coordinator: Initialization failed:', error);
      this.addError(`Initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      
      this.store.update(s => ({
        ...s,
        syncInProgress: false,
        isInitialized: true // Still mark as initialized to prevent loops
      }));
    }
  }

  // Initialize stores in optimal order
  private async initializeStores(): Promise<void> {
    const auth = await centralizedAuth.getState();
    const userId = auth.user?.id;
    if (!userId) return;

    // Check what's already cached to avoid unnecessary loads
    const profileCached = cacheManager.has(cacheKeys.profile(userId));
    const paymentMethodsCached = cacheManager.has(cacheKeys.paymentMethods(userId));
    const subscriptionCached = cacheManager.has(cacheKeys.subscription(userId));

    // Initialize settings store (will use cache if available)
    await settingsActions.initialize();

    // Initialize Stripe if needed
    const stripeState = get(stripeStore);
    if (!stripeState.stripe) {
      await stripeStore.initialize();
    }

    // Update cache hit/miss stats
    this.updateCacheStats(profileCached, paymentMethodsCached, subscriptionCached);
  }

  // Update cache statistics
  private updateCacheStats(profileCached: boolean, paymentMethodsCached: boolean, subscriptionCached: boolean): void {
    const hits = [profileCached, paymentMethodsCached, subscriptionCached].filter(Boolean).length;
    const misses = 3 - hits;

    this.store.update(s => ({
      ...s,
      stats: {
        ...s.stats,
        cacheHits: s.stats.cacheHits + hits,
        cacheMisses: s.stats.cacheMisses + misses
      }
    }));
  }

  // Smart refresh - only refresh stale data
  async smartRefresh(): Promise<void> {
    const auth = await centralizedAuth.getState();
    const userId = auth.user?.id;
    if (!userId) return;

    const refreshTasks: Promise<any>[] = [];

    // Check what needs refreshing
    if (!cacheManager.has(cacheKeys.profile(userId))) {
      refreshTasks.push(settingsActions.loadProfile(true));
    }

    if (!cacheManager.has(cacheKeys.paymentMethods(userId))) {
      refreshTasks.push(settingsActions.loadPaymentMethods(true));
    }

    if (!cacheManager.has(cacheKeys.subscription(userId))) {
      refreshTasks.push(settingsActions.loadSubscription(true));
    }

    // Background refresh purchases cache if needed
    if (!cacheManager.has(cacheKeys.userPurchases(userId))) {
      refreshTasks.push(settingsActions.refreshPurchasesInBackground());
    }

    if (refreshTasks.length > 0) {
      await Promise.allSettled(refreshTasks);
      
      this.store.update(s => ({
        ...s,
        lastFullSync: Date.now(),
        stats: { ...s.stats, syncCount: s.stats.syncCount + 1 }
      }));
    }
  }

  // Force refresh all data
  async forceRefresh(): Promise<void> {
    this.store.update(s => ({ ...s, syncInProgress: true }));

    try {
      await settingsActions.refreshAll();
      
      this.store.update(s => ({
        ...s,
        syncInProgress: false,
        lastFullSync: Date.now(),
        stats: { ...s.stats, syncCount: s.stats.syncCount + 1 }
      }));
    } catch (error) {
      console.error('Store coordinator: Force refresh failed:', error);
      this.addError(`Force refresh failed: ${error instanceof Error ? error.message : String(error)}`);
      
      this.store.update(s => ({ ...s, syncInProgress: false }));
    }
  }

  // Invalidate all user-specific cache
  async invalidateUserCache(): Promise<void> {
    const auth = await centralizedAuth.getState();
    const userId = auth.user?.id;
    if (userId) {
      cacheManager.invalidatePattern(cacheKeys.userPattern(userId));
      settingsActions.clearCache();
    }
  }

  // Handle user logout
  async handleLogout(): Promise<void> {
    // Clear all caches
    await this.invalidateUserCache();
    
    // Stop periodic sync
    this.stopPeriodicSync();
    
    // Reset coordinator state
    this.store.set(initialState);
  }

  // Setup authentication listener
  private setupAuthListener(): void {
    centralizedAuth.subscribe(async (auth) => {
      if (!auth.isAuthenticated && get(this.store).isInitialized) {
        // User logged out
        await this.handleLogout();
      } else if (auth.isAuthenticated && !get(this.store).isInitialized) {
        // User logged in
        setTimeout(() => this.initialize(), 100); // Small delay to ensure auth is fully set
      }
    });
  }

  // Start periodic sync for background updates
  private startPeriodicSync(): void {
    if (this.syncTimer) return;

    // Sync every 2 minutes in background
    this.syncTimer = setInterval(async () => {
      try {
        await this.smartRefresh();
      } catch (error) {
        console.warn('Store coordinator: Background sync failed:', error);
      }
    }, 2 * 60 * 1000);
  }

  // Stop periodic sync
  private stopPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // Add error to error list
  private addError(error: string): void {
    this.store.update(s => ({
      ...s,
      errors: [...s.errors.slice(-4), error], // Keep last 5 errors
      stats: { ...s.stats, errorCount: s.stats.errorCount + 1 }
    }));
  }

  // Clear errors
  clearErrors(): void {
    this.store.update(s => ({ ...s, errors: [] }));
  }

  // Get coordination statistics
  getStats() {
    const state = get(this.store);
    const cacheStats = cacheManager.getStats();
    
    return {
      ...state.stats,
      cacheSize: cacheStats.size,
      cacheHitRate: cacheStats.hitRate,
      lastSync: state.lastFullSync,
      isInitialized: state.isInitialized,
      syncInProgress: state.syncInProgress,
      errors: state.errors
    };
  }

  // Cleanup on destroy
  destroy(): void {
    this.stopPeriodicSync();
  }
}

// Create and export store coordinator instance
export const storeCoordinator = new StoreCoordinator();

// Derived store for coordination statistics
export const coordinatorStats = derived(
  storeCoordinator,
  ($coordinator) => ({
    isInitialized: $coordinator.isInitialized,
    syncInProgress: $coordinator.syncInProgress,
    lastSync: $coordinator.lastFullSync,
    errorCount: $coordinator.stats.errorCount,
    syncCount: $coordinator.stats.syncCount,
    errors: $coordinator.errors
  })
);

// Export convenience functions
export const coordinatorActions = {
  initialize: () => storeCoordinator.initialize(),
  smartRefresh: () => storeCoordinator.smartRefresh(),
  forceRefresh: () => storeCoordinator.forceRefresh(),
  invalidateCache: () => storeCoordinator.invalidateUserCache(),
  clearErrors: () => storeCoordinator.clearErrors(),
  getStats: () => storeCoordinator.getStats()
};

// Cleanup on app close
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    storeCoordinator.destroy();
  });
}
