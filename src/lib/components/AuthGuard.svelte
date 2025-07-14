<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore, authActions } from '../stores/auth.js';
  import AuthSetup from './AuthSetup.svelte';
  import AuthLogin from './AuthLogin.svelte';

  let mounted = false;

  onMount(async () => {
    // Check if the app is initialized when component mounts
    await authActions.checkInitialization();
    mounted = true;
  });

  $: if (mounted && $authStore.isInitialized && !$authStore.isAuthenticated) {
    // If app is initialized but not authenticated, we might need to check auth status
    // This handles cases where the app was previously authenticated in this session
  }
</script>

{#if !mounted || $authStore.isLoading}
  <!-- Loading state -->
  <div class="min-h-screen bg-base-200 flex items-center justify-center">
    <div class="text-center">
      <span class="loading loading-spinner loading-lg"></span>
      <p class="mt-4 text-base-content/70">Loading Aura...</p>
    </div>
  </div>
{:else if $authStore.error}
  <!-- Error state -->
  <div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
    <div class="card w-full max-w-md bg-base-100 shadow-xl">
      <div class="card-body text-center">
        <h2 class="card-title justify-center text-error">Error</h2>
        <p class="text-base-content/70">{$authStore.error}</p>
        <div class="card-actions justify-center mt-4">
          <button 
            class="btn btn-primary" 
            on:click={authActions.clearError}
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  </div>
{:else if !$authStore.isInitialized}
  <!-- First time setup -->
  <AuthSetup />
{:else if (!$authStore.isAuthenticated)}
  <!-- Login required -->
  <AuthLogin />
{:else}
  <!-- Authenticated - show main app content -->
  <slot />
{/if}
