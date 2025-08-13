import { writable, derived, get } from 'svelte/store';
import { createClient, type AuthSession, type User } from '@supabase/supabase-js';
import { invoke } from '@tauri-apps/api/core';
import { sessionStore, sessionActions } from './sessionStore';
import { storeManager } from './core/storeManager';
import { loadingActions } from './loadingStore';
import { stripeStore, stripeUtils } from './stripeStore';
import { dataActions } from './dataStore';

// Supabase client setup with better error handling
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create a safe Supabase client that won't crash on missing env vars
let supabase: any;
try {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey
    });
    
    // On mobile platforms, this might be expected during development
    if (typeof window !== 'undefined' && 'webkit' in window) {
      console.warn('Mobile platform detected - Supabase configuration may be incomplete during development');
    }
    
    throw new Error(
      'Missing Supabase environment variables. Please check your .env file and ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.'
    );
  }
  
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} catch (error) {
  console.error('Failed to create Supabase client:', error);
  
  // Create a dummy client to prevent runtime errors
  supabase = {
    auth: {
      setSession: () => Promise.resolve({ data: { user: null }, error: new Error('Supabase not configured') }),
      getSession: () => Promise.resolve({ data: { session: null }, error: new Error('Supabase not configured') }),
      signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: new Error('Supabase not configured') }),
      signUp: () => Promise.resolve({ data: { user: null, session: null }, error: new Error('Supabase not configured') }),
      signOut: () => Promise.resolve({ error: null }),
      refreshSession: () => Promise.resolve({ data: { session: null }, error: new Error('Supabase not configured') }),
      getUser: () => Promise.resolve({ data: { user: null }, error: new Error('Supabase not configured') })
    }
  };
}

export { supabase };

// Unified Auth State Interface
interface UnifiedAuthState {
  // Core auth state
  isInitialized: boolean;
  isAuthenticated: boolean;
  user: User | null;
  session: AuthSession | null;
  isLoading: boolean;
  error: string | null;
  
  // Profile data
  profile: any | null;
  profileLoaded: boolean;
  
  // System status
  stripeInitialized: boolean;
  
  // Session management
  lastActivity: number | null;
  tokenExpiresAt: number | null;
}

// Initialization result
export interface InitializationResult {
  authReady: boolean;
  profileReady: boolean;
  stripeReady: boolean;
  errors: string[];
}

// Initial state
const initialState: UnifiedAuthState = {
  isInitialized: false,
  isAuthenticated: false,
  user: null,
  session: null,
  isLoading: true,
  error: null,
  profile: null,
  profileLoaded: false,
  stripeInitialized: false,
  lastActivity: null,
  tokenExpiresAt: null
};

// Unified Authentication Store
class UnifiedAuthStore {
  private store = writable<UnifiedAuthState>(initialState);
  private refreshTimer: NodeJS.Timeout | null = null;

  // Store subscription
  subscribe = this.store.subscribe;

  // Derived states for UI logic
  readonly isReady = derived(
    this.store,
    $state => $state.isInitialized && !$state.isLoading
  );

  readonly shouldShowApp = derived(
    this.store,
    $state => $state.isAuthenticated && $state.profile && $state.profile.onboarding_complete
  );

  readonly shouldShowOnboarding = derived(
    this.store,
    $state => $state.isAuthenticated && $state.profileLoaded && (!$state.profile || !$state.profile.onboarding_complete)
  );

  readonly shouldShowLogin = derived(
    this.store,
    $state => !$state.isAuthenticated && $state.isInitialized
  );

  /**
   * Initialize the entire application authentication and data layer
   */
  async initialize(): Promise<InitializationResult> {
    console.log('🚀 Starting unified auth initialization...');
    
    this.store.update(state => ({ 
      ...state, 
      isLoading: true, 
      error: null,
    }));

    const result: InitializationResult = {
      authReady: false,
      profileReady: false,
      stripeReady: false,
      errors: []
    };

    try {
      // Step 1: Initialize core systems
      await storeManager.initialize();
      console.log('✅ Store manager initialized');

      // Step 2: Initialize authentication
      console.log('🔄 Initializing authentication...');
      const authSuccess = await this.initializeAuth();
      result.authReady = authSuccess;

      // Step 4: Load profile if authenticated
      const state = get(this.store);
      if (state.isAuthenticated && state.user) {
        console.log('🔄 Loading user profile...');
        try {
          await dataActions.initialize();
          const profile = await dataActions.getUserProfile(state.user.id, false);
          
          this.store.update(s => ({ 
            ...s, 
            profile, 
            profileLoaded: true 
          }));
          result.profileReady = !!profile;
          console.log('✅ Profile loaded:', !!profile);
        } catch (error) {
          console.warn('⚠️ Failed to load profile:', error);
          result.errors.push(`Failed to load profile: ${error}`);
          this.store.update(s => ({ ...s, profileLoaded: true })); // Mark as loaded even if failed
        }
      } else {
        this.store.update(s => ({ ...s, profileLoaded: true })); // No user, so profile is "loaded"
      }

      // Step 5: Initialize Stripe globally (non-critical for core app functionality)
      console.log('🔄 Initializing Stripe...');
      try {
        const stripeSuccess = await stripeUtils.init();
        if (stripeSuccess) {
          result.stripeReady = true;
          console.log('✅ Stripe initialized globally');
          
          // Set user context for Stripe if authenticated
          const currentState = get(this.store);
          if (authSuccess && currentState.user) {
            try {
              await stripeUtils.setUser(
                currentState.user.id, 
                currentState.user.email,
                currentState.user.user_metadata?.full_name || currentState.user.email
              );
              console.log('✅ Stripe user context set');
            } catch (stripeUserError) {
              console.warn('⚠️ Failed to set Stripe user context:', stripeUserError);
              // Don't fail completely for this
            }
          }
        } else {
          throw new Error('Stripe initialization returned false');
        }
      } catch (error) {
        console.warn('⚠️ Failed to initialize Stripe:', error);
        // Don't add to errors if it's just missing env vars on mobile
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!errorMessage.includes('environment variable') && !errorMessage.includes('build time')) {
          result.errors.push(`Failed to initialize Stripe: ${error}`);
        }
        result.stripeReady = false;
      }

      // Step 6: Mark as initialized
      this.store.update(state => ({ 
        ...state, 
        isInitialized: true,
        isLoading: false 
      }));

      console.log('🎉 Unified auth initialization complete!', result);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Unified auth initialization failed:', error);
      result.errors.push(errorMessage);
      
      this.store.update(state => ({ 
        ...state, 
        error: errorMessage,
        isLoading: false,
        isInitialized: true // Still mark as initialized to prevent loops
      }));
    }

    return result;
  }

  /**
   * Initialize authentication layer
   */
  private async initializeAuth(): Promise<boolean> {
    try {
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
              await this.setAuthenticated(user, session);
              return true;
            }
          }
        }
      }
      
      // No valid session found, check current Supabase session
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      if (currentSession) {
        // Store the current session tokens
        await this.setAuthenticated(currentSession.user, currentSession);
        return true;
      } else {
        // No session found
        await this.setUnauthenticated();
        return true;
      }
    } catch (error) {
      console.error('Auth initialization failed:', error);
      await this.setUnauthenticated(
        error instanceof Error ? error.message : 'Authentication failed'
      );
      return false;
    }
  }

  /**
   * Initialize Stripe (non-blocking on mobile if env vars missing)
   */
  private async initializeStripe(): Promise<void> {
    try {
      await stripeStore.initialize();
      this.store.update(state => ({ ...state, stripeInitialized: true }));
    } catch (error) {
      console.error('Failed to initialize Stripe:', error);
      
      // On mobile platforms, Stripe initialization failure shouldn't block the app
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('environment variable') || errorMessage.includes('build time')) {
        console.warn('Stripe initialization failed due to missing environment variables. This is expected on mobile during development.');
        this.store.update(state => ({ ...state, stripeInitialized: false }));
        return; // Don't throw, allow app to continue
      }
      
      throw error;
    }
  }

  /**
   * Set authenticated state
   */
  private async setAuthenticated(user: User, session: AuthSession): Promise<void> {
    const now = Date.now();
    
    this.store.update(state => ({
      ...state,
      user,
      session,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      lastActivity: now,
      tokenExpiresAt: session.expires_at ? session.expires_at * 1000 : null
    }));

    // Store tokens securely in Tauri and session store
    await sessionActions.setAuthenticated(user, session);
    
    // Start token refresh monitoring
    this.scheduleTokenRefresh();
  }

  /**
   * Set unauthenticated state
   */
  private async setUnauthenticated(error?: string): Promise<void> {
    // Clear refresh timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.store.update(state => ({
      ...state,
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      error: error || null,
      profile: null,
      profileLoaded: false,
      lastActivity: null,
      tokenExpiresAt: null
    }));

    // Clear session store
    await sessionActions.setUnauthenticated(error);
  }

  /**
   * Schedule token refresh
   */
  private scheduleTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const state = get(this.store);
    if (!state.tokenExpiresAt) return;

    // Refresh 5 minutes before expiry
    const refreshTime = state.tokenExpiresAt - Date.now() - (5 * 60 * 1000);
    
    if (refreshTime > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshSession().catch(console.error);
      }, refreshTime);
    }
  }

  /**
   * Handle user sign up with email and password
   */
  async handleSignUp(email: string, password: string): Promise<void> {
    loadingActions.showAuth('Creating your account...');
    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.session && data.user) {
        await this.setAuthenticated(data.user, data.session);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sign up failed';
      console.error('Sign up failed:', error);
      this.store.update(state => ({ 
        ...state, 
        error: errorMessage,
        isLoading: false 
      }));
      throw error;
    } finally {
      loadingActions.hideAuth();
    }
  }

  /**
   * Handle user login with email and password
   */
  async handleLogin(email: string, password: string): Promise<void> {
    loadingActions.showAuth('Signing you in...');
    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.session && data.user) {
        await this.setAuthenticated(data.user, data.session);
        
        // Load profile after login
        try {
          await dataActions.initialize();
          const profile = await dataActions.getUserProfile(data.user.id, false);
          this.store.update(s => ({ 
            ...s, 
            profile, 
            profileLoaded: true 
          }));
        } catch (profileError) {
          console.warn('Failed to load profile after login:', profileError);
          this.store.update(s => ({ ...s, profileLoaded: true }));
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      console.error('Login failed:', error);
      this.store.update(state => ({ 
        ...state, 
        error: errorMessage,
        isLoading: false 
      }));
      throw error;
    } finally {
      loadingActions.hideAuth();
    }
  }

  /**
   * Handle user logout
   */
  async handleLogout(): Promise<void> {
    loadingActions.showAuth('Signing you out...');
    
    try {
      // Clear Stripe user context first
      try {
        stripeUtils.clearUser();
        console.log('✅ Stripe user context cleared');
      } catch (stripeError) {
        console.warn('Failed to clear Stripe context:', stripeError);
      }
      
      // Sign out from Supabase
      await supabase.auth.signOut();
      
      // Clear all application data
      await dataActions.clearOfflineQueue();
      
      // Clear session store and local state
      await this.setUnauthenticated();
    } catch (error) {
      console.error('Logout failed:', error);
      // Force clear session even if Supabase signout fails
      try {
        await this.setUnauthenticated(
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
  }

  /**
   * Refresh session
   */
  async refreshSession(): Promise<void> {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (data.session && data.user) {
        await this.setAuthenticated(data.user, data.session);
      }
    } catch (error) {
      console.error('Session refresh failed:', error);
      // If refresh fails, logout
      await this.handleLogout();
      throw error;
    }
  }

  /**
   * Refresh user profile
   */
  async refreshProfile(): Promise<void> {
    const state = get(this.store);
    
    if (!state.isAuthenticated || !state.user?.id) {
      return;
    }

    try {
      console.log('Unified auth: Refreshing profile to get latest token balance...');
      const profile = await dataActions.getUserProfile(state.user.id, true); // Force refresh
      
      if (profile) {
        console.log('Unified auth: Profile refreshed with token balance:', {
          total_tokens: profile.total_tokens,
          tokens_remaining: profile.tokens_remaining,
          tokens_used: profile.tokens_used
        });
      }
      
      this.store.update(s => ({ ...s, profile, profileLoaded: true }));
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
  async getState(): Promise<UnifiedAuthState> {
    return get(this.store);
  }

  /**
   * Clear any errors
   */
  clearError(): void {
    this.store.update(state => ({ ...state, error: null }));
  }

  /**
   * Clear error (alias for legacy compatibility)
   */
  async clearErrorAsync(): Promise<void> {
    this.clearError();
  }

  /**
   * Get current user (for legacy compatibility)
   */
  getCurrentUser() {
    return supabase.auth.getUser();
  }

  /**
   * Legacy compatibility methods
   */
  async login(email: string, password: string): Promise<void> {
    return this.handleLogin(email, password);
  }

  async signUp(email: string, password: string): Promise<void> {
    return this.handleSignUp(email, password);
  }

  async logout(): Promise<void> {
    return this.handleLogout();
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

  /**
   * Destroy store and cleanup
   */
  destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

// Create and export the unified auth store
export const authStore = new UnifiedAuthStore();

// Export as centralizedAuth for backward compatibility
export const centralizedAuth = authStore;

// Export types
export type { UnifiedAuthState };
