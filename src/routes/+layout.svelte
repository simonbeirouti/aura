<script lang="ts">
  import { onMount } from "svelte";
  import "../app.css";
  import { ModeWatcher } from "mode-watcher";
  import { Toaster } from "../lib/components/ui/sonner";
  import GlobalLoading from "../lib/components/GlobalLoading.svelte";
  import Onboarding from "../lib/components/Onboarding.svelte";
  import FooterNavigation from "../lib/components/FooterNavigation.svelte";
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

<!-- Strict fixed viewport - NEVER scrolls -->
<div class="fixed inset-0 flex flex-col" style="height: 100vh; max-height: 100vh; overflow: hidden;">
  {#if shouldShowMainApp}
    <!-- Content area - exactly 100vh minus footer height -->
    <div class="flex-1" style="height: calc(100vh - 4rem); max-height: calc(100vh - 4rem); overflow: hidden;">
      <slot />
    </div>
    <!-- Footer - fixed 4rem height -->
    <div style="height: 4rem; min-height: 4rem; max-height: 4rem; flex-shrink: 0;">
      <FooterNavigation />
    </div>
  {:else if shouldShowOnboarding}
    <div class="h-full overflow-hidden">
      <Onboarding on:complete={handleOnboardingComplete} />
    </div>
  {:else}
    <!-- Fallback state -->
    <div class="h-full bg-background flex items-center justify-center overflow-hidden">
      <div class="text-center">
        <p class="text-lg text-foreground">
          Something went wrong. Please refresh the page.
        </p>
      </div>
    </div>
  {/if}
</div>

<ModeWatcher />
<Toaster position="top-center" />
<GlobalLoading />
