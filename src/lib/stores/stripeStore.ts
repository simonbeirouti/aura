import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { loadStripe, type Stripe, type StripeElements, type PaymentIntent } from '@stripe/stripe-js';

interface StripeState {
  stripe: Stripe | null;
  elements: StripeElements | null;
  publishableKey: string | null;
  isLoading: boolean;
  error: string | null;
  paymentIntent: PaymentIntent | null;
  subscriptionStatus: {
    subscriptionId: string | null;
    customerId: string | null;
    status: string | null;
    currentPeriodEnd: number | null;
  };
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
    isLoading: false,
    error: null,
    paymentIntent: null,
    subscriptionStatus: {
      subscriptionId: null,
      customerId: null,
      status: null,
      currentPeriodEnd: null,
    }
  });

  public subscribe = this.store.subscribe;

  // Initialize Stripe with publishable key from backend
  async initialize(): Promise<void> {
    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      // Get publishable key from Tauri backend
      const publishableKey = await invoke<string>('get_stripe_publishable_key');
      
      // Load Stripe
      const stripe = await loadStripe(publishableKey);
      
      if (!stripe) {
        throw new Error('Failed to load Stripe');
      }

      this.store.update(state => ({
        ...state,
        stripe,
        publishableKey,
        isLoading: false
      }));

      console.log('Stripe initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Stripe:', error);
      this.store.update(state => ({
        ...state,
        error: error instanceof Error ? error.message : 'Failed to initialize Stripe',
        isLoading: false
      }));
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
          currentPeriodEnd: subscription.current_period_end
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
          currentPeriodEnd: subscription.current_period_end
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
          currentPeriodEnd: subscription.current_period_end
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

  // Reset store state
  reset(): void {
    this.store.set({
      stripe: null,
      elements: null,
      publishableKey: null,
      isLoading: false,
      error: null,
      paymentIntent: null,
      subscriptionStatus: {
        subscriptionId: null,
        customerId: null,
        status: null,
        currentPeriodEnd: null,
      }
    });
  }
}

export const stripeStore = new StripeStore();
