<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { goto } from '$app/navigation';
  import PaymentMethodManager from '$lib/components/PaymentMethodManager.svelte';
  import { authStore } from '$lib/stores/supabaseAuth';
  import { ArrowLeft } from 'lucide-svelte';
  
  let customerId = '';
  let loading = true;
  let error = '';

  onMount(async () => {
    try {
      // Get current user information
      const { data: { user }, error: userError } = await authStore.getCurrentUser();
      
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // Get or create customer with user information
      const customer = await invoke<{id: string}>('get_or_create_customer', {
        email: user.email || '',
        name: user.user_metadata?.full_name || user.email || 'Unknown User'
      });
      customerId = customer.id;
    } catch (err) {
      console.error('Failed to get customer:', err);
      error = 'Failed to load payment methods';
    } finally {
      loading = false;
    }
  });

  function goBack() {
    goto('/settings');
  }
</script>

<div class="min-h-screen bg-base-100">
  <!-- Header -->
  <div class="bg-white border-b border-base-200">
    <div class="max-w-4xl mx-auto px-4 py-4">
      <div class="flex items-center gap-4">
        <button 
          onclick={goBack}
          class="p-2 hover:bg-base-200 rounded-full transition-colors"
          aria-label="Go back to settings"
        >
          <ArrowLeft class="w-6 h-6" />
        </button>
        <div>
          <h1 class="text-2xl font-bold text-base-content">Payment methods</h1>
        </div>
      </div>
    </div>
  </div>

  <!-- Content -->
  <div class="max-w-4xl mx-auto px-4 py-8">
    {#if loading}
      <div class="flex justify-center py-12">
        <span class="loading loading-spinner w-8 h-8"></span>
      </div>
    {:else if error}
      <div class="alert alert-error">
        <span>{error}</span>
      </div>
    {:else}
      <PaymentMethodManager {customerId} />
    {/if}
  </div>
</div>
