<script lang="ts">
  import { onMount } from "svelte";
  import "../app.css";
  import Toast from "../lib/components/Toast.svelte";
  import Login from "../lib/components/Login.svelte";
  import { authStore } from "../lib/stores/supabaseAuth";



  onMount(async () => {
    await authStore.initialize();
  });

  function handleLoginSuccess() {
    // Login successful callback
  }
</script>

{#if $authStore.isLoading}
  <div class="min-h-screen bg-base-200 flex items-center justify-center">
    <div class="text-center space-y-6">
      <div class="flex justify-center">
        <span class="loading loading-spinner w-16 h-16 text-primary"></span>
      </div>
      <div class="space-y-2">
        <p class="text-2xl font-semibold text-base-content">Loading...</p>
        <p class="text-sm text-base-content/60">Initializing your secure session</p>
      </div>
    </div>
  </div>
{:else if $authStore.isAuthenticated}
  <slot />
{:else}
  <div class="app-screen">
    <Login onLoginSuccess={handleLoginSuccess} />
  </div>
{/if}

<Toast />
