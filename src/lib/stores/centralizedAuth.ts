import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { authStore } from './supabaseAuth';
import { stripeStore } from './stripeStore';
import { migrationStore } from './migrationStore';
import { dataActions } from './dataStore';

interface AuthState {
  isInitialized: boolean;
  isAuthenticated: boolean;
  user: any | null;
  profile: any | null;
  isLoading: boolean;
  error: string | null;
  migrationStatus: 'pending' | 'running' | 'complete' | 'error' | null;
  stripeInitialized: boolean;
}

interface InitializationResult {
  authReady: boolean;
  profileReady: boolean;
  migrationsComplete: boolean;
  stripeReady: boolean;
  errors: string[];
}

class CentralizedAuthStore {
  private store = writable<AuthState>({
    isInitialized: false,
    isAuthenticated: false,
    user: null,
    profile: null,
    isLoading: true,
    error: null,
    migrationStatus: null,
    stripeInitialized: false
  });

  subscribe = this.store.subscribe;

  /**
   * Safely get auth state without causing uninitialized variable errors
   */
  private async safeGetAuthState(): Promise<{ isAuthenticated: boolean; user: any | null }> {
    try {
      // Check if authStore is properly initialized
      if (!authStore || typeof authStore.subscribe !== 'function') {
        console.warn('AuthStore not properly initialized, returning unauthenticated state');
        return { isAuthenticated: false, user: null };
      }

      return new Promise((resolve) => {
        try {
          const unsubscribe = authStore.subscribe(state => {
            unsubscribe();
            resolve({
              isAuthenticated: state?.isAuthenticated || false,
              user: state?.user || null
            });
          });
        } catch (subscribeError) {
          console.warn('Failed to subscribe to authStore:', subscribeError);
          resolve({ isAuthenticated: false, user: null });
        }
      });
    } catch (error) {
      console.warn('Failed to get auth state safely:', error);
      return { isAuthenticated: false, user: null };
    }
  }

  /**
   * Safely initialize authStore without causing uninitialized variable errors
   */
  private async safeInitializeAuth(): Promise<void> {
    try {
      // Check if authStore exists and has initialize method
      if (!authStore || typeof authStore.initialize !== 'function') {
        throw new Error('AuthStore not properly initialized or missing initialize method');
      }

      await authStore.initialize();
    } catch (error) {
      console.warn('Failed to initialize authStore:', error);
      throw error;
    }
  }

  /**
   * Safely logout from authStore without causing uninitialized variable errors
   */
  private async safeLogout(): Promise<void> {
    try {
      // Check if authStore exists and has logout method
      if (!authStore || typeof authStore.logout !== 'function') {
        console.warn('AuthStore not properly initialized or missing logout method');
        return;
      }

      await authStore.logout();
    } catch (error) {
      console.warn('Failed to logout from authStore:', error);
      // Don't throw - we want to continue with clean state
    }
  }

  // Derived stores for common checks
  readonly isReady = derived(
    this.store,
    $state => $state.isInitialized && !$state.isLoading && $state.migrationStatus === 'complete'
  );

  readonly shouldShowApp = derived(
    this.store,
    $state => $state.isAuthenticated && $state.profile && $state.migrationStatus === 'complete'
  );

  readonly shouldShowOnboarding = derived(
    this.store,
    $state => $state.isAuthenticated && (!$state.profile || !$state.profile.onboarding_complete) && $state.migrationStatus === 'complete'
  );

  readonly shouldShowLogin = derived(
    this.store,
    $state => !$state.isAuthenticated && $state.migrationStatus === 'complete'
  );

  /**
   * Initialize the entire application authentication and data layer
   */
  async initialize(): Promise<InitializationResult> {
    this.store.update(state => ({ 
      ...state, 
      isLoading: true, 
      error: null,
      migrationStatus: 'pending'
    }));

    const result: InitializationResult = {
      authReady: false,
      profileReady: false,
      migrationsComplete: false,
      stripeReady: false,
      errors: []
    };

    try {
      // Step 1: Run database migrations first
      this.store.update(state => ({ ...state, migrationStatus: 'running' }));
      
      const migrationSuccess = await migrationStore.checkAndRunMigrations(true);
      if (!migrationSuccess) {
        result.errors.push('Database migrations failed');
        this.store.update(state => ({ ...state, migrationStatus: 'error' }));
        return result;
      }
      
      result.migrationsComplete = true;
      this.store.update(state => ({ ...state, migrationStatus: 'complete' }));

      // Step 2: Robust cache → backend → login flow
      let authState: { isAuthenticated: boolean; user: any | null } = { isAuthenticated: false, user: null };
      
      try {
        // First, try to safely initialize auth store (checks cache and backend)
        await this.safeInitializeAuth();
        
        // Safely get current auth state without subscribing to uninitialized store
        authState = await this.safeGetAuthState();
        result.authReady = true;
        
        console.log('Auth state after initialization:', { 
          isAuthenticated: authState.isAuthenticated, 
          hasUser: !!authState.user 
        });
      } catch (error) {
        console.warn('Auth initialization failed (likely invalid refresh token):', error);
        
        // Clear any invalid tokens and reset to clean state using safe method
        await this.safeLogout();
        authState = { isAuthenticated: false, user: null };
        result.authReady = true;
        console.log('Auth state reset to unauthenticated after error');
        
        result.errors.push(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Step 3: If authenticated, load user profile and initialize Stripe
      if (authState.isAuthenticated && authState.user && authState.user.id) {
        this.store.update(state => ({ 
          ...state, 
          isAuthenticated: true, 
          user: authState.user 
        }));

        // Load user profile
        try {
          await dataActions.initialize();
          const profile = await dataActions.getUserProfile(authState.user.id, false);
          
          this.store.update(state => ({ ...state, profile }));
          result.profileReady = !!profile;
        } catch (error) {
          result.errors.push(`Failed to load profile: ${error}`);
        }

        // Initialize Stripe for authenticated user
        try {
          await this.initializeStripe();
          result.stripeReady = true;
        } catch (error) {
          result.errors.push(`Failed to initialize Stripe: ${error}`);
        }
      } else {
        // User not authenticated - still initialize Stripe for potential signup/login
        try {
          await this.initializeStripe();
          result.stripeReady = true;
        } catch (error) {
          result.errors.push(`Failed to initialize Stripe: ${error}`);
        }
      }

      this.store.update(state => ({ 
        ...state, 
        isInitialized: true,
        isLoading: false 
      }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(errorMessage);
      
      this.store.update(state => ({ 
        ...state, 
        error: errorMessage,
        isLoading: false 
      }));
    }

    return result;
  }

  /**
   * Initialize Stripe with backend caching
   */
  private async initializeStripe(): Promise<void> {
    try {
      // Get Stripe publishable key from backend (cached)
      await stripeStore.initialize();
      
      this.store.update(state => ({ ...state, stripeInitialized: true }));
    } catch (error) {
      console.error('Failed to initialize Stripe:', error);
      throw error;
    }
  }

  /**
   * Handle user sign up with email and password
   */
  async handleSignUp(email: string, password: string): Promise<void> {
    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      // Use safe auth store access for sign up
      if (!authStore || typeof authStore.signUp !== 'function') {
        throw new Error('AuthStore not properly initialized or missing signUp method');
      }

      await authStore.signUp(email, password);
      
      // After successful sign up, the user will need to verify email
      // The auth state will be updated via the auth store subscription
      this.store.update(state => ({ ...state, isLoading: false }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.store.update(state => ({ 
        ...state, 
        error: errorMessage,
        isLoading: false 
      }));
      throw error;
    }
  }

  /**
   * Handle user login with email and password
   */
  async handleLogin(email: string, password: string): Promise<void> {
    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      // Use safe auth store access for login
      if (!authStore || typeof authStore.login !== 'function') {
        throw new Error('AuthStore not properly initialized or missing login method');
      }

      await authStore.login(email, password);
      
      // After successful login, reinitialize to load profile and Stripe
      await this.initialize();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.store.update(state => ({ 
        ...state, 
        error: errorMessage,
        isLoading: false 
      }));
      throw error;
    }
  }

  /**
   * Handle user login (internal method for when user object is already available)
   */
  async handleUserLogin(user: any): Promise<void> {
    this.store.update(state => ({ 
      ...state, 
      isAuthenticated: true, 
      user,
      isLoading: true 
    }));

    try {
      // Load user profile
      await dataActions.initialize();
      const profile = await dataActions.getUserProfile(user.id, false);
      
      // Initialize/refresh Stripe for this user
      await this.initializeStripe();
      
      this.store.update(state => ({ 
        ...state, 
        profile,
        isLoading: false 
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.store.update(state => ({ 
        ...state, 
        error: errorMessage,
        isLoading: false 
      }));
    }
  }

  /**
   * Handle user logout
   */
  async handleLogout(): Promise<void> {
    try {
      // Clear all stores
      await authStore.logout();
      await dataActions.clearOfflineQueue();
      
      this.store.update(state => ({ 
        ...state,
        isAuthenticated: false,
        user: null,
        profile: null,
        error: null
      }));
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  /**
   * Refresh user profile
   */
  async refreshProfile(): Promise<void> {
    const state = await new Promise<AuthState>(resolve => {
      const unsubscribe = this.store.subscribe(state => {
        unsubscribe();
        resolve(state);
      });
    });

    if (!state.isAuthenticated || !state.user?.id) {
      return;
    }

    try {
      const profile = await dataActions.getUserProfile(state.user.id, true); // Force refresh
      this.store.update(state => ({ ...state, profile }));
    } catch (error) {
      console.error('Failed to refresh profile:', error);
    }
  }

  /**
   * Handle onboarding completion
   */
  async completeOnboarding(): Promise<void> {
    await this.refreshProfile();
  }

  /**
   * Get current auth state
   */
  async getState(): Promise<AuthState> {
    return new Promise<AuthState>(resolve => {
      const unsubscribe = this.store.subscribe(state => {
        unsubscribe();
        resolve(state);
      });
    });
  }

  /**
   * Clear any errors
   */
  clearError(): void {
    this.store.update(state => ({ ...state, error: null }));
  }

  /**
   * Force re-initialization (for development/debugging)
   */
  async reinitialize(): Promise<InitializationResult> {
    this.store.update(state => ({ 
      ...state, 
      isInitialized: false,
      isLoading: true,
      error: null 
    }));
    
    return this.initialize();
  }
}

export const centralizedAuth = new CentralizedAuthStore();

// Export types
export type { AuthState, InitializationResult };
