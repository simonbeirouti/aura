import { writable, derived, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { loadStripe, type Stripe, type StripeElements, type PaymentIntent } from '@stripe/stripe-js';
import { cacheManager, cacheKeys } from './cacheManager';

interface StripeState {
  // Core Stripe instance
  stripe: Stripe | null;
  elements: StripeElements | null;
  publishableKey: string | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Current user context
  currentCustomerId: string | null;
  currentUserId: string | null;
  
  // Payment processing
  paymentIntent: PaymentIntent | null;
  
  // Subscription management
  subscriptionStatus: {
    subscriptionId: string | null;
    customerId: string | null;
    status: string | null;
    currentPeriodEnd: number | null;
    priceId: string | null;
  };
  
  // Global cache
  customers: Map<string, any>;
  paymentMethods: Map<string, any[]>;
  subscriptions: Map<string, any>;
  
  // Initialization tracking
  lastInitialized: number | null;
  environmentMode: 'live' | 'test' | null;
}

interface PaymentIntentResponse {
  client_secret: string;
  payment_intent_id: string;
}

interface SubscriptionResponse {
  subscription_id: string;
  customer_id: string;
  status: string;
  current_period_end: number;
  price_id: string;
}

interface SubscriptionSyncResult {
  updated_subscriptions: number;
  errors: string[];
}

class StripeStore {
  private store = writable<StripeState>({
    stripe: null,
    elements: null,
    publishableKey: null,
    isInitialized: false,
    isLoading: false,
    error: null,
    currentCustomerId: null,
    currentUserId: null,
    paymentIntent: null,
    subscriptionStatus: {
      subscriptionId: null,
      customerId: null,
      status: null,
      currentPeriodEnd: null,
      priceId: null
    },
    customers: new Map(),
    paymentMethods: new Map(),
    subscriptions: new Map(),
    lastInitialized: null,
    environmentMode: null
  });

  public subscribe = this.store.subscribe;

  // Set current user context for Stripe operations
  async setUserContext(userId: string, userEmail?: string, userName?: string): Promise<void> {
    if (!userId) {
      console.warn('Invalid userId provided to setUserContext');
      return;
    }

    console.log(`🔄 Setting Stripe user context for: ${userId}`);

    // Get or create customer for this user
    const customerId = await this.getOrCreateCustomer(userId, userEmail, userName);
    
    if (!customerId) {
      console.error(`❌ Failed to get/create Stripe customer for user: ${userId}`);
      // Still update with null to track the failure
      this.store.update(state => ({
        ...state,
        currentUserId: userId,
        currentCustomerId: null
      }));
      return;
    }
    
    this.store.update(state => ({
      ...state,
      currentUserId: userId,
      currentCustomerId: customerId
    }));

    console.log(`✅ Stripe user context set: ${userId} -> ${customerId}`);
  }

  // Clear user context (on logout)
  clearUserContext(): void {
    this.store.update(state => ({
      ...state,
      currentUserId: null,
      currentCustomerId: null,
      subscriptionStatus: {
        subscriptionId: null,
        customerId: null,
        status: null,
        currentPeriodEnd: null,
        priceId: null
      }
    }));

    console.log('🔄 Stripe user context cleared');
  }

  // Get or create Stripe customer for user
  private async getOrCreateCustomer(userId: string, userEmail?: string, userName?: string): Promise<string | null> {
    try {
      console.log(`🔄 Getting/creating Stripe customer for user: ${userId}`);
      
      // Check cache first
      const cacheKey = cacheKeys.stripeCustomer(userId);
      const cached = cacheManager.get<string>(cacheKey);
      if (cached) {
        console.log(`✅ Found cached Stripe customer: ${cached}`);
        return cached;
      }

      // Check store cache
      const currentState = get(this.store);
      if (currentState.customers.has(userId)) {
        const storeCustomerId = currentState.customers.get(userId);
        console.log(`✅ Found store cached Stripe customer: ${storeCustomerId}`);
        return storeCustomerId;
      }

      // Get from backend
      console.log(`🔄 Calling backend to get_or_create_customer for: ${userId}`);
      const result = await invoke<any>('get_or_create_customer', { 
        email: userEmail || '',
        name: userName || ''
      });
      const customerId = result.id;
      
      if (!customerId) {
        console.error(`❌ Backend returned null/empty customerId for user: ${userId}`);
        return null;
      }

      console.log(`✅ Backend returned Stripe customer: ${customerId}`);
      
      // Cache the result
      cacheManager.set(cacheKey, customerId, 60 * 60 * 1000); // 1 hour
      
      // Update store cache
      this.store.update(state => ({
        ...state,
        customers: new Map(state.customers).set(userId, customerId)
      }));

      return customerId;
    } catch (error) {
      console.error(`❌ Failed to get/create Stripe customer for user ${userId}:`, error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        type: typeof error,
        error
      });
      return null;
    }
  }

  // Initialize Stripe with publishable key from backend
  async initialize(forceReload: boolean = false): Promise<boolean> {
    const currentState = get(this.store);
    
    // Return early if already initialized and not forcing reload
    if (currentState.isInitialized && !forceReload) {
      console.log('Stripe already initialized, skipping...');
      return true;
    }

    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      // Get publishable key from Tauri backend with caching
      const cacheKey = 'stripe_publishable_key';
      let publishableKey = cacheManager.get<string>(cacheKey);
      
      if (!publishableKey || forceReload) {
        publishableKey = await invoke<string>('get_stripe_publishable_key');
        // Cache for 1 hour
        cacheManager.set(cacheKey, publishableKey, 60 * 60 * 1000);
      }
      
      // Detect environment mode
      const environmentMode = publishableKey.startsWith('pk_live') ? 'live' : 'test';
      
      // Load Stripe
      const stripe = await loadStripe(publishableKey);
      
      if (!stripe) {
        throw new Error('Failed to load Stripe JavaScript SDK');
      }

      this.store.update(state => ({
        ...state,
        stripe,
        publishableKey,
        isInitialized: true,
        isLoading: false,
        environmentMode,
        lastInitialized: Date.now(),
        error: null
      }));

      console.log(`✅ Stripe initialized successfully (${environmentMode} mode)`);
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Stripe:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize Stripe';
      
      this.store.update(state => ({
        ...state,
        error: errorMessage,
        isLoading: false,
        isInitialized: false
      }));
      
      return false;
    }
  }

  // Create a payment intent for subscription
  async createPaymentIntent(amount: number, currency: string = 'usd', customerId?: string): Promise<PaymentIntentResponse> {
    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      const response = await invoke<PaymentIntentResponse>('create_payment_intent', {
        amount,
        currency,
        customerId
      });

      console.log('Payment intent created:', response);
      return response;
    } catch (error) {
      console.error('Failed to create payment intent:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create payment intent';
      this.store.update(state => ({ ...state, error: errorMessage, isLoading: false }));
      throw error;
    }
  }

  // Create Stripe customer
  async createCustomer(email: string, name?: string): Promise<string> {
    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      const customerId = await invoke<string>('create_stripe_customer', {
        email,
        name
      });

      console.log('Stripe customer created:', customerId);
      return customerId;
    } catch (error) {
      console.error('Failed to create Stripe customer:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create customer';
      this.store.update(state => ({ ...state, error: errorMessage, isLoading: false }));
      throw error;
    }
  }

  // Create subscription
  async createSubscription(customerId: string, userId: string): Promise<SubscriptionResponse> {
    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      const subscription = await invoke<SubscriptionResponse>('create_subscription', {
        customerId,
        userId
      });

      this.store.update(state => ({
        ...state,
        subscriptionStatus: {
          subscriptionId: subscription.subscription_id,
          customerId: subscription.customer_id,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end,
          priceId: subscription.price_id
        },
        isLoading: false
      }));

      console.log('Subscription created:', subscription);
      return subscription;
    } catch (error) {
      console.error('Failed to create subscription:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create subscription';
      this.store.update(state => ({ ...state, error: errorMessage, isLoading: false }));
      throw error;
    }
  }

  // Cancel subscription
  async cancelSubscription(subscriptionId: string, userId: string): Promise<void> {
    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      await invoke<string>('cancel_subscription', {
        subscriptionId,
        userId
      });

      this.store.update(state => ({
        ...state,
        subscriptionStatus: {
          ...state.subscriptionStatus,
          status: 'canceled'
        },
        isLoading: false
      }));

      console.log('Subscription canceled successfully');
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to cancel subscription';
      this.store.update(state => ({ ...state, error: errorMessage, isLoading: false }));
      throw error;
    }
  }

  // Get subscription status
  async getSubscriptionStatus(subscriptionId: string): Promise<SubscriptionResponse> {
    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      const subscription = await invoke<SubscriptionResponse>('get_subscription_status', {
        subscriptionId
      });

      this.store.update(state => ({
        ...state,
        subscriptionStatus: {
          subscriptionId: subscription.subscription_id,
          customerId: subscription.customer_id,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end,
          priceId: subscription.price_id
        },
        isLoading: false
      }));

      return subscription;
    } catch (error) {
      console.error('Failed to get subscription status:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to get subscription status';
      this.store.update(state => ({ ...state, error: errorMessage, isLoading: false }));
      throw error;
    }
  }

  // Sync subscription status with Stripe (polling-based)
  async syncSubscriptionStatus(userId: string, subscriptionId: string): Promise<SubscriptionResponse> {
    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      const subscription = await invoke<SubscriptionResponse>('sync_subscription_status', {
        userId,
        subscriptionId
      });

      this.store.update(state => ({
        ...state,
        subscriptionStatus: {
          subscriptionId: subscription.subscription_id,
          customerId: subscription.customer_id,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end,
          priceId: subscription.price_id
        },
        isLoading: false
      }));

      console.log('Subscription status synced:', subscription);
      return subscription;
    } catch (error) {
      console.error('Failed to sync subscription status:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync subscription status';
      this.store.update(state => ({ ...state, error: errorMessage, isLoading: false }));
      throw error;
    }
  }

  // Sync all user subscriptions (polling-based)
  async syncAllUserSubscriptions(userId: string): Promise<SubscriptionSyncResult> {
    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      const result = await invoke<SubscriptionSyncResult>('sync_all_user_subscriptions', {
        userId
      });

      console.log('All subscriptions synced:', result);
      this.store.update(state => ({ ...state, isLoading: false }));
      return result;
    } catch (error) {
      console.error('Failed to sync all subscriptions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync subscriptions';
      this.store.update(state => ({ ...state, error: errorMessage, isLoading: false }));
      throw error;
    }
  }

  // Setup Stripe product (admin function)
  async setupProduct(name: string, description: string, amount: number, currency: string = 'usd', interval: string = 'month'): Promise<string> {
    try {
      const result = await invoke<string>('setup_stripe_product', {
        name,
        description,
        amount,
        currency,
        interval
      });

      console.log('Stripe product setup result:', result);
      return result;
    } catch (error) {
      console.error('Failed to setup Stripe product:', error);
      throw error;
    }
  }

  // Clear error state
  clearError(): void {
    this.store.update(state => ({ ...state, error: null }));
  }

  // Get current Stripe instance (ensure it's initialized)
  async getStripe(): Promise<Stripe | null> {
    const state = get(this.store);
    
    if (!state.stripe && !state.isLoading) {
      console.warn('Stripe not initialized, attempting to initialize...');
      const success = await this.initialize();
      if (!success) {
        console.error('Failed to initialize Stripe');
        return null;
      }
      return get(this.store).stripe;
    }
    
    return state.stripe;
  }

  // Check if Stripe is ready for operations
  isReady(): boolean {
    const state = get(this.store);
    return state.isInitialized && !!state.stripe && !state.isLoading;
  }

  // Get current user's customer ID
  getCurrentCustomerId(): string | null {
    const state = get(this.store);
    return state.currentCustomerId;
  }

  // Get environment mode
  getEnvironmentMode(): 'live' | 'test' | null {
    const state = get(this.store);
    return state.environmentMode;
  }

  // Global utility: Ensure Stripe is ready before operation
  async ensureReady(): Promise<boolean> {
    if (this.isReady()) {
      return true;
    }

    if (get(this.store).isLoading) {
      // Wait for current initialization
      return new Promise((resolve) => {
        const unsubscribe = this.store.subscribe((state) => {
          if (!state.isLoading) {
            unsubscribe();
            resolve(state.isInitialized && !!state.stripe);
          }
        });
      });
    }

    return await this.initialize();
  }

  // Reset store state
  reset(): void {
    this.store.set({
      stripe: null,
      elements: null,
      publishableKey: null,
      isInitialized: false,
      isLoading: false,
      error: null,
      currentCustomerId: null,
      currentUserId: null,
      paymentIntent: null,
      subscriptionStatus: {
        subscriptionId: null,
        customerId: null,
        status: null,
        currentPeriodEnd: null,
        priceId: null
      },
      customers: new Map(),
      paymentMethods: new Map(),
      subscriptions: new Map(),
      lastInitialized: null,
      environmentMode: null
    });
  }
}

export const stripeStore = new StripeStore();

// Derived stores for common use cases
export const stripeReady = derived(
  stripeStore,
  ($stripe) => $stripe.isInitialized && !!$stripe.stripe && !$stripe.isLoading
);

export const stripeCustomer = derived(
  stripeStore,
  ($stripe) => ({
    customerId: $stripe.currentCustomerId,
    userId: $stripe.currentUserId,
    hasCustomer: !!$stripe.currentCustomerId
  })
);

export const stripeEnvironment = derived(
  stripeStore,
  ($stripe) => ({
    mode: $stripe.environmentMode,
    isLive: $stripe.environmentMode === 'live',
    isTest: $stripe.environmentMode === 'test',
    publishableKey: $stripe.publishableKey
  })
);

export const stripeSubscription = derived(
  stripeStore,
  ($stripe) => ({
    ...$stripe.subscriptionStatus,
    hasActiveSubscription: $stripe.subscriptionStatus.status === 'active',
    isTrialing: $stripe.subscriptionStatus.status === 'trialing',
    isPastDue: $stripe.subscriptionStatus.status === 'past_due',
    isCanceled: $stripe.subscriptionStatus.status === 'canceled'
  })
);

// Global Stripe utility functions
export const stripeUtils = {
  // Initialize and ensure Stripe is ready
  async init(forceReload = false): Promise<boolean> {
    return await stripeStore.initialize(forceReload);
  },

  // Get Stripe instance (auto-initialize if needed)
  async getStripe(): Promise<Stripe | null> {
    return await stripeStore.getStripe();
  },

  // Check if ready without initializing
  isReady(): boolean {
    return stripeStore.isReady();
  },

  // Ensure ready and throw if not
  async ensureReady(): Promise<void> {
    const ready = await stripeStore.ensureReady();
    if (!ready) {
      throw new Error('Stripe failed to initialize. Check your configuration.');
    }
  },

  // Set user context for operations
  async setUser(userId: string, userEmail?: string, userName?: string): Promise<void> {
    await stripeStore.setUserContext(userId, userEmail, userName);
  },

  // Clear user context
  clearUser(): void {
    stripeStore.clearUserContext();
  },

  // Get current customer ID
  getCustomerId(): string | null {
    return stripeStore.getCurrentCustomerId();
  },

  // Check environment
  getEnvironment(): 'live' | 'test' | null {
    return stripeStore.getEnvironmentMode();
  },

  // Create payment intent with current user
  async createPayment(amount: number, currency = 'usd'): Promise<PaymentIntentResponse> {
    await stripeUtils.ensureReady();
    const customerId = stripeStore.getCurrentCustomerId();
    return await stripeStore.createPaymentIntent(amount, currency, customerId || undefined);
  },

  // Create subscription for current user
  async createSubscription(): Promise<SubscriptionResponse> {
    await stripeUtils.ensureReady();
    const customerId = stripeStore.getCurrentCustomerId();
    const userId = get(stripeStore).currentUserId;
    
    if (!customerId || !userId) {
      throw new Error('No user context set. Call stripeUtils.setUser() first.');
    }
    
    return await stripeStore.createSubscription(customerId, userId);
  },

  // Get subscription status for current user
  async getSubscriptionStatus(): Promise<SubscriptionResponse | null> {
    const subscription = get(stripeStore).subscriptionStatus;
    if (!subscription.subscriptionId) {
      return null;
    }
    
    return await stripeStore.getSubscriptionStatus(subscription.subscriptionId);
  }
};
