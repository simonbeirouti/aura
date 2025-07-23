<script lang="ts">
  import { onMount } from "svelte";
  import "../app.css";
  import Toast from "../lib/components/Toast.svelte";
  import GlobalLoading from "../lib/components/GlobalLoading.svelte";
  import Onboarding from "../lib/components/Onboarding.svelte";
  import { authStore } from "../lib/stores/supabaseAuth";
  import { dataActions } from "../lib/stores/dataStore";
  import { loadingActions } from "../lib/stores/loadingStore";

  let profileLoaded = false;
  let profileExists = false;
  let lastAuthState = false; // Track previous auth state

  onMount(async () => {
    // Show app loading
    loadingActions.showApp('Initializing application...');
    
    try {
      await authStore.initialize();
      
      // Initialize lastAuthState after auth initialization
      lastAuthState = $authStore.isAuthenticated;

      // Clear any existing offline queue to prevent endless retries
      await dataActions.clearOfflineQueue();

      // Set profileLoaded to true if user is not authenticated
      if (!$authStore.isAuthenticated) {
        profileLoaded = true;
      }
    } finally {
      // Hide app loading
      loadingActions.hideApp();
    }
  });

  function handleOnboardingComplete() {
    // Onboarding completed, reload profile status
    profileExists = true;
  }

  // Handle authentication state changes
  $: if ($authStore.isAuthenticated !== lastAuthState) {
    if (!$authStore.isAuthenticated) {
      // User logged out
      profileExists = false;
      profileLoaded = true;
    } else if ($authStore.isAuthenticated && $authStore.user?.id) {
      // User logged in - show loading and load profile
      profileLoaded = false;
      loadingActions.showProfile('Loading your profile...');
      loadUserProfile();
    }
    lastAuthState = $authStore.isAuthenticated;
  }

  async function loadUserProfile() {
    if (!$authStore.isAuthenticated || !$authStore.user?.id) return;
    
    try {
      await dataActions.initialize();
      const profile = await dataActions.getUserProfile(
        $authStore.user.id,
        false,
      );
      profileExists = !!profile;
      profileLoaded = true;
    } catch (error) {
      console.error("Failed to load profile:", error);
      profileExists = false;
      profileLoaded = true;
    } finally {
      // Hide profile loading
      loadingActions.hideProfile();
    }
  }

  // Reactive statement to determine what to show
  $: shouldShowMainApp = $authStore.isAuthenticated && profileLoaded && profileExists;
  $: shouldShowOnboarding = !$authStore.isAuthenticated && profileLoaded;
  

</script>

{#if shouldShowMainApp}
  <slot />
{:else if shouldShowOnboarding}
  <Onboarding on:complete={handleOnboardingComplete} />
{:else}
  <!-- Fallback state - shouldn't normally reach here -->
  <div class="min-h-screen bg-base-200 flex items-center justify-center">
    <div class="text-center">
      <p class="text-lg text-base-content">
        Something went wrong. Please refresh the page.
      </p>
    </div>
  </div>
{/if}

<Toast />
<GlobalLoading />
