/**
 * Global Stripe Integration
 * 
 * This module provides a unified interface for Stripe operations throughout the application.
 * It automatically handles initialization, user context, and provides convenient utilities.
 */

export {
  // Core store and utilities
  stripeStore,
  stripeUtils,
  
  // Derived stores for reactive UI
  stripeReady,
  stripeCustomer,
  stripeEnvironment,
  stripeSubscription,
  
  // Types
  type StripeState,
  type PaymentIntentResponse,
  type SubscriptionResponse,
  type SubscriptionSyncResult
} from './stores/stripeStore';

// Re-export Stripe types for convenience
export type {
  Stripe,
  StripeElements,
  PaymentIntent,
  PaymentMethod,
  Subscription
} from '@stripe/stripe-js';

/**
 * Quick Stripe utilities - auto-initialize and provide common operations
 */
export const stripe = {
  /**
   * Initialize Stripe globally (call once at app start)
   */
  async init(forceReload = false) {
    const { stripeUtils } = await import('./stores/stripeStore');
    return await stripeUtils.init(forceReload);
  },

  /**
   * Get Stripe instance (auto-initializes if needed)
   */
  async getInstance() {
    const { stripeUtils } = await import('./stores/stripeStore');
    return await stripeUtils.getStripe();
  },

  /**
   * Check if Stripe is ready
   */
  async isReady() {
    const { stripeUtils } = await import('./stores/stripeStore');
    return stripeUtils.isReady();
  },

  /**
   * Set user context for all Stripe operations
   */
  async setUser(userId: string) {
    const { stripeUtils } = await import('./stores/stripeStore');
    await stripeUtils.setUser(userId);
  },

  /**
   * Clear user context (on logout)
   */
  async clearUser() {
    const { stripeUtils } = await import('./stores/stripeStore');
    stripeUtils.clearUser();
  },

  /**
   * Create payment for current user
   */
  async createPayment(amount: number, currency = 'usd') {
    const { stripeUtils } = await import('./stores/stripeStore');
    return await stripeUtils.createPayment(amount, currency);
  },

  /**
   * Create subscription for current user
   */
  async createSubscription() {
    const { stripeUtils } = await import('./stores/stripeStore');
    return await stripeUtils.createSubscription();
  },

  /**
   * Get subscription status for current user
   */
  async getSubscriptionStatus() {
    const { stripeUtils } = await import('./stores/stripeStore');
    return await stripeUtils.getSubscriptionStatus();
  },

  /**
   * Get current customer ID
   */
  async getCustomerId() {
    const { stripeUtils } = await import('./stores/stripeStore');
    return stripeUtils.getCustomerId();
  },

  /**
   * Get environment (live/test)
   */
  async getEnvironment() {
    const { stripeUtils } = await import('./stores/stripeStore');
    return stripeUtils.getEnvironment();
  }
};

/**
 * Svelte store exports for reactive components
 */
export const stores = {
  async ready() {
    const { stripeReady } = await import('./stores/stripeStore');
    return stripeReady;
  },

  async customer() {
    const { stripeCustomer } = await import('./stores/stripeStore');
    return stripeCustomer;
  },

  async environment() {
    const { stripeEnvironment } = await import('./stores/stripeStore');
    return stripeEnvironment;
  },

  async subscription() {
    const { stripeSubscription } = await import('./stores/stripeStore');
    return stripeSubscription;
  }
};

// Export main store for advanced usage
export async function getStripeStore() {
  const { stripeStore } = await import('./stores/stripeStore');
  return stripeStore;
}
