<script lang="ts">
  import { onMount } from "svelte";
  import "../app.css";
  import Toast from "../lib/components/Toast.svelte";

  import Onboarding from "../lib/components/Onboarding.svelte";
  import { authStore } from "../lib/stores/supabaseAuth";

  onMount(async () => {
    await authStore.initialize();
  });

  function handleOnboardingComplete() {
    // Onboarding completed, auth store will be updated
  }
</script>

{#if $authStore.isLoading}
  <div class="min-h-screen bg-base-200 flex items-center justify-center">
    <div class="text-center space-y-6">
      <div class="flex justify-center">
        <span class="loading loading-spinner w-16 h-16 text-primary"></span>
      </div>
      <div class="space-y-2">
        <p class="text-2xl font-semibold text-base-content">
          Loading...
        </p>
        <p class="text-sm text-base-content/60">
          Initializing your secure session
        </p>
      </div>
    </div>
  </div>
{:else if $authStore.isAuthenticated}
  <slot />
{:else}
  <Onboarding on:complete={handleOnboardingComplete} />
{/if}

<Toast />
