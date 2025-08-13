<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';
  import { CreditCardIcon, TrashIcon, PlusIcon } from 'lucide-svelte';
  
  interface PaymentMethod {
    id: string;
    card_brand: string;
    card_last4: string;
    card_exp_month: number;
    card_exp_year: number;
    is_default: boolean;
  }

  interface SetupIntentResponse {
    client_secret: string;
    setup_intent_id: string;
  }

  export let customerId: string;

  let paymentMethods: PaymentMethod[] = [];
  let isLoading = true;
  let error = '';
  let showAddForm = false;
  let isProcessing = false;
  
  // Stripe Elements
  let stripe: Stripe | null = null;
  let elements: StripeElements | null = null;
  let cardNumberElement: any = null;
  let cardExpiryElement: any = null;
  let cardCvcElement: any = null;
  let setupIntent: SetupIntentResponse | null = null;
  
  // Form containers
  let cardContainer: HTMLElement;
  let expiryContainer: HTMLElement;
  let cvcContainer: HTMLElement;

  onMount(async () => {
    await loadPaymentMethods();
    await initializeStripe();
  });

  async function initializeStripe() {
    try {
      const publishableKey = await invoke<string>('get_stripe_publishable_key');
      stripe = await loadStripe(publishableKey);
      
      if (stripe) {
        elements = stripe.elements();
      }
    } catch (err) {
      console.error('Failed to initialize Stripe:', err);
      error = 'Failed to initialize payment system';
    }
  }

  async function loadPaymentMethods() {
    try {
      isLoading = true;
      error = '';
      paymentMethods = await invoke<PaymentMethod[]>('get_customer_payment_methods', {
        customerId
      });
    } catch (err) {
      console.error('Failed to load payment methods:', err);
      error = 'Failed to load payment methods';
    } finally {
      isLoading = false;
    }
  }

  async function showAddPaymentMethod() {
    try {
      isProcessing = true;
      error = '';
      
      // Create setup intent
      const response = await invoke<SetupIntentResponse>('create_setup_intent', {
        customerId
      });
      setupIntent = response;
      
      // Create Stripe Elements
      if (stripe && setupIntent) {
        elements = stripe.elements({
          clientSecret: setupIntent.client_secret
        });
        
        // Create separate elements with styling
        const elementStyle = {
          base: {
            fontSize: '16px',
            color: '#111827',
            '::placeholder': {
              color: '#9CA3AF',
            },
          },
        };
        
        cardNumberElement = elements.create('cardNumber', { style: elementStyle });
        cardExpiryElement = elements.create('cardExpiry', { style: elementStyle });
        cardCvcElement = elements.create('cardCvc', { style: elementStyle });
        
        showAddForm = true;
        
        // Mount elements after DOM update
        setTimeout(() => {
          if (cardContainer && cardNumberElement) {
            cardNumberElement.mount('#card-element');
          }
          if (cardExpiryElement) {
            cardExpiryElement.mount('#expiry-element');
          }
          if (cardCvcElement) {
            cardCvcElement.mount('#cvc-element');
          }
        }, 100);
      }
    } catch (err) {
      error = `Failed to initialize payment form: ${err}`;
      console.error('Error showing add form:', err);
    } finally {
      isProcessing = false;
    }
  }

  async function submitPaymentMethod() {
    if (!stripe || !elements || !setupIntent) {
      error = 'Payment system not ready';
      return;
    }

    try {
      isProcessing = true;
      error = '';

      // Confirm setup intent with elements
      const { error: stripeError, setupIntent: confirmedSetupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required'
      });

      if (stripeError) {
        error = stripeError.message || 'Failed to add payment method';
        return;
      }

      if (confirmedSetupIntent?.status === 'succeeded') {
        // Success - reload payment methods
        await loadPaymentMethods();
        cancelAddPaymentMethod();
      } else {
        error = 'Failed to confirm payment method';
      }
    } catch (err) {
      console.error('Failed to submit payment method:', err);
      error = 'Failed to add payment method';
    } finally {
      isProcessing = false;
    }
  }

  function cancelAddPaymentMethod() {
    showAddForm = false;
    setupIntent = null;
    error = '';
    
    // Clean up all Stripe elements
    if (cardNumberElement) {
      cardNumberElement.destroy();
      cardNumberElement = null;
    }
    if (cardExpiryElement) {
      cardExpiryElement.destroy();
      cardExpiryElement = null;
    }
    if (cardCvcElement) {
      cardCvcElement.destroy();
      cardCvcElement = null;
    }
    
    elements = null;
  }

  async function deletePaymentMethod(paymentMethodId: string) {
    if (!confirm('Are you sure you want to delete this payment method?')) {
      return;
    }

    try {
      await invoke('delete_payment_method', {
        paymentMethodId
      });
      
      await loadPaymentMethods();
    } catch (err) {
      console.error('Failed to delete payment method:', err);
      error = 'Failed to delete payment method';
    }
  }

  async function setDefaultPaymentMethod(paymentMethodId: string) {
    try {
      await invoke('set_default_payment_method', {
        customerId,
        paymentMethodId
      });
      
      await loadPaymentMethods();
    } catch (err) {
      console.error('Failed to set default payment method:', err);
      error = 'Failed to set default payment method';
    }
  }

  function formatCardBrand(brand: string): string {
    return brand.charAt(0).toUpperCase() + brand.slice(1);
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    {#if !showAddForm}
      <button
        class="btn btn-primary btn-sm w-full"
        onclick={showAddPaymentMethod}
        disabled={isLoading}
      >
        <PlusIcon class="w-4 h-4 mr-1" />
        Add Payment Method
      </button>
    {/if}
  </div>

  <!-- Error Display -->
  {#if error}
    <div class="alert alert-error">
      <span>{error}</span>
    </div>
  {/if}

  <!-- Add Payment Method Form -->
  {#if showAddForm}
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white rounded-2xl p-6 w-full max-w-md mx-4 relative">
        <!-- Close Button -->
        <button 
          class="absolute top-4 left-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
          onclick={cancelAddPaymentMethod}
          disabled={isProcessing}
          aria-label="Close add card form"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>

        <!-- Header -->
        <div class="text-center mb-8">
          <h2 class="text-2xl font-semibold text-gray-900">Add card details</h2>
        </div>

        <!-- Card Form -->
        <div class="space-y-4">
          <!-- Card Number -->
          <div class="relative">
            <div 
              bind:this={cardContainer}
              id="card-element"
              class="w-full p-4 border border-gray-300 rounded-xl bg-white text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors min-h-[60px] flex items-center"
              role="textbox"
              aria-labelledby="card-label"
            ></div>
            <label id="card-label" class="absolute -top-2 left-3 bg-white px-1 text-sm text-gray-600">
              Card number 🔒
            </label>
          </div>

          <!-- Expiry and CVV Row -->
          <div class="grid grid-cols-2 gap-4">
            <!-- Expiry -->
            <div class="relative">
              <div id="expiry-element" class="w-full p-4 border border-gray-300 rounded-xl bg-white text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors min-h-[60px] flex items-center" aria-labelledby="expiry-label">
                <!-- Stripe will mount expiry element here -->
              </div>
              <label id="expiry-label" class="absolute -top-2 left-3 bg-white px-1 text-sm text-gray-600">
                Expiry<br/><span class="text-xs text-gray-400">MM / YY</span>
              </label>
            </div>

            <!-- CVV -->
            <div class="relative">
              <div id="cvc-element" class="w-full p-4 border border-gray-300 rounded-xl bg-white text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors min-h-[60px] flex items-center" aria-labelledby="cvc-label">
                <!-- Stripe will mount CVC element here -->
              </div>
              <label id="cvc-label" class="absolute -top-2 left-3 bg-white px-1 text-sm text-gray-600">
                CVV<br/><span class="text-xs text-gray-400">---</span>
              </label>
            </div>
          </div>

          <!-- Postcode -->
          <div class="relative">
            <input 
              id="postcode-input"
              type="text" 
              placeholder="" 
              class="w-full p-4 border border-gray-300 rounded-xl bg-white text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors peer"
            />
            <label for="postcode-input" class="absolute -top-2 left-3 bg-white px-1 text-sm text-gray-600">
              Postcode
            </label>
          </div>

          <!-- Country/Region -->
          <div class="relative">
            <select id="country-select" class="w-full p-4 border border-gray-300 rounded-xl bg-white text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors appearance-none">
              <option value="AU">Australia</option>
              <option value="US">United States</option>
              <option value="GB">United Kingdom</option>
              <option value="CA">Canada</option>
              <option value="DE">Germany</option>
              <option value="FR">France</option>
              <option value="JP">Japan</option>
            </select>
            <label for="country-select" class="absolute -top-2 left-3 bg-white px-1 text-sm text-gray-600">
              Country/region
            </label>
            <svg class="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </div>
        </div>

        <!-- Submit Button -->
        <button
          class="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={submitPaymentMethod}
          disabled={isProcessing}
        >
          {#if isProcessing}
            <span class="inline-flex items-center gap-2">
              <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Adding card...
            </span>
          {:else}
            Add card
          {/if}
        </button>
      </div>
    </div>
  {/if}

  <!-- Payment Methods List -->
  {#if isLoading}
    <div class="flex justify-center py-8">
      <span class="loading loading-spinner w-6 h-6"></span>
    </div>
  <!-- {:else if paymentMethods.length === 0}
    <div class="text-center py-8">
      <CreditCardIcon class="w-12 h-12 mx-auto text-base-content/30 mb-4" />
      <p class="text-base-content/60">No payment methods added</p>
      <p class="text-sm text-base-content/40 mt-1">
        Add a payment method to get started
      </p>
    </div> -->
  {:else}
    <div class="space-y-3">
      {#each paymentMethods as method (method.id)}
        <div class="card bg-base-100 border border-base-300">
          <div class="card-body p-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <CreditCardIcon class="w-5 h-5 text-base-content/60" />
                <div>
                  <div class="font-medium">
                    {formatCardBrand(method.card_brand)} •••• {method.card_last4}
                  </div>
                  <div class="text-sm text-base-content/60">
                    Expires {method.card_exp_month.toString().padStart(2, '0')}/{method.card_exp_year}
                  </div>
                </div>
                {#if method.is_default}
                  <div class="badge badge-primary badge-sm">Default</div>
                {/if}
              </div>
              
              <div class="flex items-center gap-2">
                {#if !method.is_default}
                  <button
                    class="btn btn-ghost btn-xs"
                    onclick={() => setDefaultPaymentMethod(method.id)}
                  >
                    Set Default
                  </button>
                {/if}
                <button
                  class="btn btn-ghost btn-xs text-error hover:bg-error hover:text-error-content"
                  onclick={() => deletePaymentMethod(method.id)}
                >
                  <TrashIcon class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
