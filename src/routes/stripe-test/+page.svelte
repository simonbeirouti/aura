<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/supabaseAuth';
  import StripePayment from '$lib/components/StripePayment.svelte';
  import SubscriptionManager from '$lib/components/SubscriptionManager.svelte';
  import ApplePaySubscription from '$lib/components/ApplePaySubscription.svelte';

  // Reactive state
  $: authState = $authStore;

  let activeTab = 'test';
  let showSuccessMessage = false;
  let successMessage = '';

  function handleSubscriptionSuccess(subscription: any) {
    console.log('Subscription successful:', subscription);
    successMessage = `Subscription created successfully! ID: ${subscription.subscription_id}`;
    showSuccessMessage = true;
    setTimeout(() => showSuccessMessage = false, 5000);
  }

  function handleSubscriptionError(error: string) {
    console.error('Subscription error:', error);
    successMessage = `Subscription failed: ${error}`;
    showSuccessMessage = true;
    setTimeout(() => showSuccessMessage = false, 5000);
  }
</script>

<svelte:head>
  <title>Stripe Integration Test - Aura</title>
</svelte:head>

<div class="container mx-auto p-4">
  <div class="mb-2">
    <h1 class="text-3xl font-bold mb-2">Stripe Integration Test</h1>
    <p class="text-base-content/70">
      Test and verify the Stripe payment integration for Apple Pay subscriptions.
    </p>
  </div>

  {#if showSuccessMessage}
    <div class="alert alert-info">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
      <span>{successMessage}</span>
    </div>
  {/if}

  <!-- Tab Navigation -->
  <div class="tabs tabs-lift grid grid-cols-3">
    <button 
      class="tab {activeTab === 'test' ? 'tab-active' : ''}"
      role="tab"
      onclick={() => activeTab = 'test'}
    >
      Tests
    </button>
    <button 
      class="tab {activeTab === 'subscription' ? 'tab-active' : ''}"
      role="tab"
      onclick={() => activeTab = 'subscription'}
    >
      Subscription
    </button>
    <button 
      class="tab {activeTab === 'applepay' ? 'tab-active' : ''}"
      role="tab"
      onclick={() => activeTab = 'applepay'}
    >
      Apple Pay
    </button>
  </div>

  <!-- Tab Content -->
  <div class="mt-2">
    {#if activeTab === 'test'}
      <StripePayment />
    {:else if activeTab === 'subscription'}
      <div class="tab-content bg-base-100 p-4 rounded-lg">
        <h3 class="text-lg font-semibold mb-4">Subscription Management</h3>
        {#if authState.isAuthenticated}
          <SubscriptionManager />
        {:else}
          <div class="alert alert-warning">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span>Please sign in to manage subscriptions</span>
          </div>
        {/if}
      </div>
    {:else if activeTab === 'applepay'}
      <div class="tab-content bg-base-100 p-4 rounded-lg">
        <h3 class="text-lg font-semibold mb-4">Apple Pay Test</h3>
        <div class="card bg-base-200 shadow-lg">
          <div class="card-body">
            <h2 class="card-title mb-4">Apple Pay Integration</h2>
            <p class="text-base-content/80 mb-6">
              Test the Apple Pay integration directly. This will create a real subscription if payment is successful.
            </p>
            
            {#if authState.isAuthenticated}
              <ApplePaySubscription 
                amount={1000}
                currency="usd"
                productName="Test Subscription"
                onSuccess={handleSubscriptionSuccess}
                onError={handleSubscriptionError}
              />
            {:else}
              <div class="alert alert-warning">
                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span>Please sign in to test Apple Pay</span>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div> 

<style>
  .tab-content {
    animation: fadeIn 0.3s ease-in-out;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
