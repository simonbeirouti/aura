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
  <div class="app-loading">
    <div class="text-center">
      <span class="loading loading-spinner loading-lg text-primary"></span>
      <p class="mt-4 text-lg">Loading...</p>
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
