<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { stripeStore } from '$lib/stores/stripeStore';
  import { authStore } from '$lib/stores/supabaseAuth';
  import { dataStore } from '$lib/stores/dataStore';
  import ApplePaySubscription from './ApplePaySubscription.svelte';

  // Component state
  let isLoading = false;
  let error: string | null = null;
  let showCancelConfirm = false;
  let pollingInterval: NodeJS.Timeout | null = null;
  let lastSyncTime: Date | null = null;

  // Reactive state from stores
  $: stripeState = $stripeStore;
  $: authState = $authStore;
  $: currentProfile = $dataStore.currentProfile;
  $: user = $authStore.user;
  $: hasActiveSubscription = currentProfile?.subscription_status === 'active' || 
                            currentProfile?.subscription_status === 'trialing';
  $: subscriptionEndDate = currentProfile?.subscription_period_end ? 
                          new Date(currentProfile.subscription_period_end * 1000) : null;

  // Polling configuration
  const POLLING_INTERVAL = 30000; // 30 seconds
  const MAX_POLLING_DURATION = 300000; // 5 minutes

  // Start polling for subscription status updates
  function startPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    if (!currentProfile?.subscription_id || !user?.id) {
      return;
    }

    console.log('Starting subscription status polling...');
    
    pollingInterval = setInterval(async () => {
      try {
        await syncSubscriptionStatus();
      } catch (error) {
        console.error('Polling sync failed:', error);
      }
    }, POLLING_INTERVAL);

    // Stop polling after max duration to prevent indefinite polling
    setTimeout(() => {
      stopPolling();
    }, MAX_POLLING_DURATION);
  }

  // Stop polling
  function stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
      console.log('Stopped subscription status polling');
    }
  }

  // Sync subscription status manually
  async function syncSubscriptionStatus() {
    if (!currentProfile?.subscription_id || !user?.id) {
      return;
    }

    try {
      const result = await stripeStore.syncSubscriptionStatus(
        user.id,
        currentProfile.subscription_id
      );
      
      lastSyncTime = new Date();
      
      // Refresh profile data to get updated subscription info
      await dataStore.refreshCurrentProfile();
      
      console.log('Subscription status synced:', result);
    } catch (error) {
      console.error('Failed to sync subscription status:', error);
    }
  }

  onMount(async () => {
    // Initialize Stripe if not already done
    if (!stripeState.stripe) {
      await stripeStore.initialize();
    }

    // If user has a subscription, get the latest status and start polling
    if (currentProfile?.subscription_id) {
      await syncSubscriptionStatus();
      startPolling();
    }
  });

  onDestroy(() => {
    // Clean up polling interval on component destroy
    stopPolling();
  });

  async function refreshSubscriptionStatus() {
    if (!currentProfile?.subscription_id) return;

    isLoading = true;
    error = null;

    try {
      await stripeStore.getSubscriptionStatus(currentProfile.subscription_id);
      // Refresh user profile to get updated data
      await dataStore.refreshCurrentProfile();
    } catch (err) {
      console.error('Failed to refresh subscription status:', err);
      error = err instanceof Error ? err.message : 'Failed to refresh subscription status';
    } finally {
      isLoading = false;
    }
  }

  async function handleSubscriptionSuccess(subscription: any) {
    console.log('Subscription created successfully:', subscription);
    
    // Refresh user profile to show updated subscription status
    await dataStore.refreshCurrentProfile();
    
    // Show success message
    error = null;
  }

  async function handleSubscriptionError(errorMessage: string) {
    console.error('Subscription error:', errorMessage);
    error = errorMessage;
  }

  async function cancelSubscription() {
    if (!currentProfile?.subscription_id || !authState.user) return;

    isLoading = true;
    error = null;

    try {
      await stripeStore.cancelSubscription(
        currentProfile.subscription_id,
        authState.user.id
      );

      // Refresh user profile
      await dataStore.refreshCurrentProfile();
      
      showCancelConfirm = false;
      console.log('Subscription canceled successfully');
    } catch (err) {
      console.error('Failed to cancel subscription:', err);
      error = err instanceof Error ? err.message : 'Failed to cancel subscription';
    } finally {
      isLoading = false;
    }
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  function getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'active':
        return 'badge-success';
      case 'trialing':
        return 'badge-info';
      case 'canceled':
        return 'badge-warning';
      case 'past_due':
        return 'badge-error';
      default:
        return 'badge-neutral';
    }
  }
</script>

<div class="subscription-manager max-w-2xl mx-auto p-6">
  <h2 class="text-2xl font-bold mb-6">Subscription Management</h2>

  {#if error}
    <div class="alert alert-error mb-6">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{error}</span>
    </div>
  {/if}

  {#if isLoading}
    <div class="flex items-center justify-center py-8">
      <div class="loading loading-spinner loading-lg"></div>
      <span class="ml-3">Loading subscription information...</span>
    </div>
  {:else if hasActiveSubscription}
    <!-- Active Subscription Display -->
    <div class="card bg-base-200 shadow-xl">
      <div class="card-body">
        <div class="flex items-center justify-between mb-4">
          <h3 class="card-title text-xl">Current Subscription</h3>
          <div class="flex items-center gap-2">
            <div class="badge badge-lg {getStatusBadgeClass(currentProfile?.subscription_status || '')}">
              {currentProfile?.subscription_status || 'Unknown'}
            </div>
            {#if pollingInterval}
              <div class="badge badge-info badge-sm">Auto-sync active</div>
            {/if}
          </div>
        </div>

        <!-- Polling Status and Manual Sync -->
        <div class="flex items-center justify-between mb-4 p-3 bg-base-100 rounded-lg">
          <div class="text-sm">
            {#if lastSyncTime}
              <span class="text-base-content/70">Last synced: {lastSyncTime.toLocaleTimeString()}</span>
            {:else}
              <span class="text-base-content/70">Not synced yet</span>
            {/if}
          </div>
          <button 
            class="btn btn-sm btn-outline" 
            onclick={syncSubscriptionStatus}
            disabled={isLoading}
          >
            {#if isLoading}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            {/if}
            Sync Now
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div class="stat bg-base-100 rounded-lg">
            <div class="stat-title">Plan</div>
            <div class="stat-value text-lg">Monthly Subscription</div>
            <div class="stat-desc">$10.00/month</div>
          </div>

          <div class="stat bg-base-100 rounded-lg">
            <div class="stat-title">Next Billing Date</div>
            <div class="stat-value text-lg">
              {subscriptionEndDate ? formatDate(subscriptionEndDate) : 'Unknown'}
            </div>
            <div class="stat-desc">
              {currentProfile?.subscription_status === 'canceled' ? 'Subscription ends' : 'Next charge'}
            </div>
          </div>
        </div>

        <div class="card-actions justify-end">
          <button 
            class="btn btn-outline btn-sm"
            onclick={refreshSubscriptionStatus}
            disabled={isLoading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh Status
          </button>

          {#if currentProfile?.subscription_status !== 'canceled'}
            <button 
              class="btn btn-error btn-sm"
              onclick={() => showCancelConfirm = true}
              disabled={isLoading}
            >
              Cancel Subscription
            </button>
          {/if}
        </div>
      </div>
    </div>

    <!-- Cancel Confirmation Modal -->
    {#if showCancelConfirm}
      <div class="modal modal-open">
        <div class="modal-box">
          <h3 class="font-bold text-lg mb-4">Cancel Subscription</h3>
          <p class="mb-6">
            Are you sure you want to cancel your subscription? You'll continue to have access until 
            {subscriptionEndDate ? formatDate(subscriptionEndDate) : 'the end of your billing period'}.
          </p>
          
          <div class="modal-action">
            <button 
              class="btn btn-ghost"
              onclick={() => showCancelConfirm = false}
              disabled={isLoading}
            >
              Keep Subscription
            </button>
            <button 
              class="btn btn-error"
              class:loading={isLoading}
              onclick={cancelSubscription}
              disabled={isLoading}
            >
              {isLoading ? 'Canceling...' : 'Yes, Cancel'}
            </button>
          </div>
        </div>
        <button class="modal-backdrop" onclick={() => showCancelConfirm = false} aria-label="Close modal"></button>
      </div>
    {/if}
  {:else}
    <!-- No Active Subscription - Show Subscribe Option -->
    <div class="card bg-base-200 shadow-xl">
      <div class="card-body">
        <h3 class="card-title text-xl mb-4">Subscribe to Premium</h3>
        
        <div class="mb-6">
          <p class="text-base-content/80 mb-4">
            Get access to premium features with our monthly subscription.
          </p>
          
          <div class="features-list">
            <div class="flex items-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>Premium features access</span>
            </div>
            <div class="flex items-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>Priority support</span>
            </div>
            <div class="flex items-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>Cancel anytime</span>
            </div>
          </div>
        </div>

        <ApplePaySubscription 
          amount={1000}
          currency="usd"
          productName="Monthly Premium Subscription"
          onSuccess={handleSubscriptionSuccess}
          onError={handleSubscriptionError}
        />
      </div>
    </div>
  {/if}

  <!-- Subscription History/Details -->
  {#if currentProfile?.subscription_id}
    <div class="card bg-base-100 shadow-lg mt-6">
      <div class="card-body">
        <h3 class="card-title text-lg mb-4">Subscription Details</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span class="font-semibold">Customer ID:</span>
            <span class="font-mono text-xs ml-2">{currentProfile.stripe_customer_id || 'N/A'}</span>
          </div>
          <div>
            <span class="font-semibold">Subscription ID:</span>
            <span class="font-mono text-xs ml-2">{currentProfile.subscription_id}</span>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .features-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
</style>
