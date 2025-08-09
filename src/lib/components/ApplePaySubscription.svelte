<script lang="ts">
  import { onMount } from 'svelte';
  import { stripeStore } from '$lib/stores/stripeStore';
  import { authStore } from '$lib/stores/supabaseAuth';
  import { dataStore } from '$lib/stores/dataStore';
  import { loadStripe } from '@stripe/stripe-js';
  import type { PaymentRequest, PaymentRequestPaymentMethodEvent } from '@stripe/stripe-js';

  // Props
  export let amount: number = 1000; // Amount in cents ($10.00)
  export let currency: string = 'usd';
  export let productName: string = 'Monthly Subscription';
  export let onSuccess: (subscription: any) => void = () => {};
  export let onError: (error: string) => void = () => {};

  // Component state
  let paymentRequest: PaymentRequest | null = null;
  let canMakePayment = false;
  let isProcessing = false;
  let error: string | null = null;
  let mounted = false;

  // Reactive state from stores
  $: stripeState = $stripeStore;
  $: authState = $authStore;
  $: currentProfile = $dataStore.currentProfile;

  onMount(async () => {
    mounted = true;
    await initializeStripe();
  });

  async function initializeStripe() {
    try {
      // Initialize Stripe store if not already done
      if (!stripeState.stripe) {
        await stripeStore.initialize();
      }

      // Wait for Stripe to be loaded
      if (stripeState.stripe && mounted) {
        await setupPaymentRequest();
      }
    } catch (err) {
      console.error('Failed to initialize Stripe:', err);
      error = err instanceof Error ? err.message : 'Failed to initialize payment system';
    }
  }

  async function setupPaymentRequest() {
    if (!stripeState.stripe) return;

    // Create payment request
    paymentRequest = stripeState.stripe.paymentRequest({
      country: 'US',
      currency: currency.toLowerCase(),
      total: {
        label: productName,
        amount: amount,
      },
      requestPayerName: true,
      requestPayerEmail: true,
    });

    // Check if Apple Pay is available
    const result = await paymentRequest.canMakePayment();
    canMakePayment = !!result?.applePay;

    if (canMakePayment) {
      // Handle payment method selection
      paymentRequest.on('paymentmethod', handlePaymentMethod);
    }
  }

  async function handlePaymentMethod(event: PaymentRequestPaymentMethodEvent) {
    if (!authState.user || !currentProfile) {
      event.complete('fail');
      error = 'User not authenticated';
      return;
    }

    isProcessing = true;
    error = null;

    try {
      // Create or get Stripe customer
      let customerId = currentProfile.stripe_customer_id;
      
      if (!customerId) {
        customerId = await stripeStore.createCustomer(
          authState.user.email || '',
          currentProfile.full_name || undefined
        );
      }

      // Create payment intent
      const paymentIntentResponse = await stripeStore.createPaymentIntent(
        amount,
        currency,
        customerId
      );

      // Confirm payment with Stripe
      const { error: confirmError, paymentIntent } = await stripeState.stripe!.confirmCardPayment(
        paymentIntentResponse.client_secret,
        {
          payment_method: event.paymentMethod.id
        }
      );

      if (confirmError) {
        console.error('Payment confirmation failed:', confirmError);
        event.complete('fail');
        error = confirmError.message || 'Payment failed';
        onError(error);
        return;
      }

      if (paymentIntent?.status === 'succeeded') {
        // Create subscription
        const subscription = await stripeStore.createSubscription(
          customerId,
          authState.user.id
        );

        // Refresh user profile to get updated subscription info
        await dataStore.refreshCurrentProfile();

        event.complete('success');
        onSuccess(subscription);
        
        console.log('Payment and subscription successful:', subscription);
      } else {
        event.complete('fail');
        error = 'Payment was not completed successfully';
        onError(error);
      }
    } catch (err) {
      console.error('Payment processing error:', err);
      event.complete('fail');
      error = err instanceof Error ? err.message : 'Payment processing failed';
      onError(error);
    } finally {
      isProcessing = false;
    }
  }

  async function handleSubscribe() {
    if (!paymentRequest) {
      error = 'Payment system not initialized';
      return;
    }

    try {
      // Show Apple Pay sheet
      paymentRequest.show();
    } catch (err) {
      console.error('Failed to show Apple Pay:', err);
      error = err instanceof Error ? err.message : 'Failed to show Apple Pay';
      onError(error);
    }
  }
</script>

<div class="apple-pay-subscription">
  {#if stripeState.isLoading}
    <div class="loading loading-spinner loading-md"></div>
    <p class="text-sm text-base-content/70 mt-2">Initializing payment system...</p>
  {:else if error || stripeState.error}
    <div class="alert alert-error">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{error || stripeState.error}</span>
    </div>
    <button 
      class="btn btn-outline btn-sm mt-2" 
      onclick={() => {
        error = null;
        stripeStore.clearError();
        initializeStripe();
      }}
    >
      Retry
    </button>
  {:else if canMakePayment}
    <div class="subscription-info mb-4">
      <h3 class="text-lg font-semibold mb-2">{productName}</h3>
      <p class="text-2xl font-bold text-primary">
        ${(amount / 100).toFixed(2)}
        <span class="text-sm font-normal text-base-content/70">/month</span>
      </p>
    </div>

    <button
      class="btn btn-primary btn-lg w-full apple-pay-button"
      class:loading={isProcessing}
      disabled={isProcessing || !authState.isAuthenticated}
      onclick={handleSubscribe}
    >
      {#if isProcessing}
        <span class="loading loading-spinner loading-sm"></span>
        Processing...
      {:else}
        <svg class="w-6 h-6 mr-2" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
        </svg>
        Pay with Apple Pay
      {/if}
    </button>

    {#if !authState.isAuthenticated}
      <p class="text-sm text-warning mt-2 text-center">
        Please sign in to subscribe
      </p>
    {/if}
  {:else}
    <div class="alert alert-info">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
      <div>
        <h3 class="font-bold">Apple Pay not available</h3>
        <div class="text-xs">Apple Pay is not supported on this device or browser.</div>
      </div>
    </div>

    <!-- Fallback: Regular card payment button -->
    <button
      class="btn btn-primary btn-lg w-full mt-4"
      class:loading={isProcessing}
      disabled={isProcessing || !authState.isAuthenticated}
      onclick={() => {
        // TODO: Implement regular card payment flow
        error = 'Regular card payments not yet implemented. Please use a device that supports Apple Pay.';
      }}
    >
      {#if isProcessing}
        <span class="loading loading-spinner loading-sm"></span>
        Processing...
      {:else}
        Subscribe with Card
      {/if}
    </button>
  {/if}
</div>

<style>
  .apple-pay-button {
    background: linear-gradient(135deg, #000 0%, #333 100%);
    color: white;
    border: none;
  }
  
  .apple-pay-button:hover {
    background: linear-gradient(135deg, #333 0%, #555 100%);
  }
  
  .apple-pay-button:disabled {
    background: #ccc;
    color: #666;
  }
</style>
