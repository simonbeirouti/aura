<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { authStore } from '$lib/stores/supabaseAuth';
  import { dataStore } from '$lib/stores/dataStore';

  // Payment state
  let isProcessingPayment = false;
  let paymentError: string | null = null;
  let paymentSuccess = false;
  let customerId: string | null = null;
  let subscriptionId: string | null = null;

  // Product and pricing state
  let isLoadingProduct = true;
  let productData: any = null;
  let selectedPriceId: string | null = null;
  let selectedPrice: any = null;

  // Reactive state
  $: authState = $authStore;
  $: currentProfile = $dataStore.currentProfile;

  // Product ID from environment (you'll set this in your .env)
  const PRODUCT_ID = 'prod_Spk57CLc5GXpg1'; // Your actual product ID

  onMount(() => {
    loadProductData();
  });

  async function loadProductData() {
    isLoadingProduct = true;
    paymentError = null;
    try {
      const product = await invoke('get_product_with_prices', {
        productId: PRODUCT_ID
      });
      productData = product;
      
      // Auto-select monthly plan if available
      const monthlyPrice = productData.prices.find((p: any) => p.interval === 'month');
      if (monthlyPrice) {
        selectedPriceId = monthlyPrice.id;
        selectedPrice = monthlyPrice;
      } else if (productData.prices.length > 0) {
        // Fallback to first available price
        selectedPriceId = productData.prices[0].id;
        selectedPrice = productData.prices[0];
      }
    } catch (error: any) {
      paymentError = `Failed to load product: ${error}`;
    } finally {
      isLoadingProduct = false;
    }
  }

  function selectPrice(price: any) {
    selectedPriceId = price.id;
    selectedPrice = price;
  }

  async function processPayment() {
    if (!authState.isAuthenticated || !authState.user?.email) {
      paymentError = 'Please sign in to continue';
      return;
    }

    if (!selectedPriceId || !selectedPrice) {
      paymentError = 'Please select a pricing plan';
      return;
    }

    isProcessingPayment = true;
    paymentError = null;
    paymentSuccess = false;

    try {
      // Step 1: Create or get customer
      if (!customerId) {
        customerId = await invoke('create_stripe_customer', {
          email: authState.user.email,
          name: currentProfile?.full_name || authState.user.email
        });
      }

      // Step 2: Create payment intent
      const paymentIntent = await invoke('create_payment_intent', {
        amount: selectedPrice.amount,
        currency: selectedPrice.currency,
        customerId: customerId
      });

      // Step 3: Create subscription with selected price
      const subscription = await invoke('create_subscription', {
        customerId: customerId,
        priceId: selectedPriceId,
        userId: authState.user.id
      }) as { subscription_id: string };
      subscriptionId = subscription.subscription_id;

      // Step 4: Update user profile with subscription info
      if (currentProfile) {
        await dataStore.updateUserProfile(currentProfile.id, {
          subscription_id: subscriptionId || undefined,
          stripe_customer_id: customerId || undefined
        });
      }

      paymentSuccess = true;
      
    } catch (error: any) {
      console.error('Payment failed:', error);
      paymentError = error.toString();
    } finally {
      isProcessingPayment = false;
    }
  }

  function formatPrice(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function getIntervalText(interval: string, intervalCount: number = 1): string {
    if (intervalCount === 1) {
      return interval === 'month' ? 'month' : 'year';
    }
    return `${intervalCount} ${interval}s`;
  }

  function getSavingsText(monthlyPrice: any, yearlyPrice: any): string {
    if (!monthlyPrice || !yearlyPrice) return '';
    const monthlyYearly = monthlyPrice.amount * 12;
    const savings = monthlyYearly - yearlyPrice.amount;
    const percentage = Math.round((savings / monthlyYearly) * 100);
    return `Save ${percentage}% (${formatPrice(savings)})`;
  }
</script>

<div class="payment-container max-w-2xl mx-auto">
  <div class="card bg-base-100 shadow-lg">
    <div class="card-body">
      {#if paymentSuccess}
        <div class="alert alert-success mb-6">
          <div>
            <h3 class="font-bold">🎉 Payment Successful!</h3>
            <p>Welcome to {productData?.name}! Your subscription is now active.</p>
          </div>
        </div>
      {:else if isLoadingProduct}
        <div class="flex items-center justify-center py-12">
          <span class="loading loading-spinner loading-lg"></span>
          <span class="ml-4">Loading pricing options...</span>
        </div>
      {:else if productData && productData.prices.length > 0}
        <!-- Product Info -->
        <!-- <div class="text-center mb-6">
          <h3 class="text-xl font-bold mb-2">{productData.name}</h3>
          {#if productData.description}
            <p class="text-base-content/70">{productData.description}</p>
          {/if}
        </div> -->

        <!-- Pricing Options -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {#each productData.prices as price}
            {@const isSelected = selectedPriceId === price.id}
            {@const isYearly = price.interval === 'year'}
            {@const monthlyPrice = productData.prices.find(p => p.interval === 'month')}
            
            <button 
              class="card bg-base-200 cursor-pointer transition-all {isSelected ? 'ring-2 ring-primary bg-primary/10' : ''} w-full text-left relative"
              onclick={() => selectPrice(price)}
            >
              {#if isYearly && monthlyPrice}
                <div class="absolute -top-2 -right-2 badge badge-success text-xs">
                  {getSavingsText(monthlyPrice, price)}
                </div>
              {/if}
              
              <div class="card-body p-4">
                <div class="flex items-center justify-between mb-2">
                  <h4 class="font-bold capitalize">{price.interval}ly Plan</h4>
                </div>
                
                <div class="text-2xl font-bold text-primary mb-1">
                  {formatPrice(price.amount)}
                  <span class="text-sm text-base-content/70">/{getIntervalText(price.interval, price.interval_count)}</span>
                </div>
                
                {#if isYearly && monthlyPrice}
                  <div class="text-sm text-base-content/60">
                    {formatPrice(price.amount / 12)}/month when billed annually
                  </div>
                {/if}
              </div>
            </button>
          {/each}
        </div>

        <!-- Payment Button -->
        <div class="text-center">
          <button 
            class="btn btn-primary btn-lg w-full"
            onclick={processPayment}
            disabled={isProcessingPayment || !authState.isAuthenticated || !selectedPrice}
          >
            {#if isProcessingPayment}
              <span class="loading loading-spinner loading-sm"></span>
              Processing Payment...
            {:else if selectedPrice}
              Subscribe for {formatPrice(selectedPrice.amount)}/{getIntervalText(selectedPrice.interval)}
            {:else}
              Select a Plan
            {/if}
          </button>
        </div>

        {#if !authState.isAuthenticated}
          <div class="alert alert-warning mt-4">
            <span>⚠️ Please sign in to continue with payment</span>
          </div>
        {/if}

        {#if paymentError}
          <div class="alert alert-error mt-4">
            <div>
              <h4 class="font-bold">Payment Failed</h4>
              <p>{paymentError}</p>
              <button class="btn btn-sm btn-outline mt-2" onclick={() => loadProductData()}>
                Retry Loading
              </button>
            </div>
          </div>
        {/if}
      {:else}
        <div class="alert alert-error">
          <div>
            <h4 class="font-bold">Unable to Load Pricing</h4>
            <p>No pricing options found for this product.</p>
            <button class="btn btn-sm btn-outline mt-2" onclick={() => loadProductData()}>
              Retry
            </button>
          </div>
        </div>
      {/if}

      <!-- Current Subscription Status -->
      {#if currentProfile?.subscription_id}
        <div class="divider">Current Subscription</div>
        <div class="alert alert-info">
          <div>
            <h4 class="font-bold">Active Subscription</h4>
            <p>Subscription ID: {currentProfile.subscription_id}</p>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
