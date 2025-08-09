<script lang="ts">
  import { onMount } from "svelte";
  import { CogIcon, PlayIcon, DollarSignIcon } from "lucide-svelte";
  import AppLayout from "../lib/components/AppLayout.svelte";
  import OnboardingProfile from "../lib/components/onboarding/OnboardingProfile.svelte";
  import { authStore } from "../lib/stores/supabaseAuth";
  import { dataActions, dataStore } from "../lib/stores/dataStore";
  import { loadingActions } from "../lib/stores/loadingStore";

  let needsOnboarding = false;
  let profileChecked = false;

  onMount(async () => {
    // Only check onboarding if user is authenticated
    if ($authStore.isAuthenticated && $authStore.user) {
      await checkOnboardingStatus();
    } else {
      profileChecked = true;
    }
  });

  async function checkOnboardingStatus() {
    if (!$authStore.user) {
      profileChecked = true;
      return;
    }

    // Check if we already have profile data in the store
    const currentProfile = $dataStore.currentProfile;
    if (currentProfile && currentProfile.id === $authStore.user.id) {
      // We already have the profile data, no need to load
      needsOnboarding = !currentProfile.onboarding_complete;
      profileChecked = true;
      return;
    }

    // Only show loading if we actually need to fetch data
    let showedLoading = false;
    
    try {
      // Initialize data store if needed (this might be quick if already initialized)
      if (!$dataStore.isInitialized) {
        loadingActions.showProfile('Initializing...');
        showedLoading = true;
        await dataActions.initialize();
      }

      // Check if profile is now available after initialization
      const storeProfile = $dataStore.currentProfile;
      if (storeProfile && storeProfile.id === $authStore.user.id) {
        needsOnboarding = !storeProfile.onboarding_complete;
        profileChecked = true;
        return;
      }

      // We need to fetch the profile
      if (!showedLoading) {
        loadingActions.showProfile('Loading your profile...');
        showedLoading = true;
      }

      const profile = await dataActions.getUserProfile($authStore.user.id, false);
      
      // User needs onboarding if they don't have a profile or haven't completed onboarding
      needsOnboarding = !profile || !profile.onboarding_complete;
    } catch (error) {
      console.error("Failed to check onboarding status:", error);
      // If we can't check, assume they need onboarding
      needsOnboarding = true;
    } finally {
      profileChecked = true;
      if (showedLoading) {
        loadingActions.hideProfile();
      }
    }
  }

  // Handle profile completion
  function handleProfileComplete() {
    needsOnboarding = false;
  }
</script>

{#if !profileChecked}
  <!-- Wait for profile check to complete -->
  <div></div>
{:else if needsOnboarding}
  <!-- Fullscreen Profile Setup -->
  <OnboardingProfile on:complete={handleProfileComplete} />
{:else}
  <!-- Normal Home Page -->
  <AppLayout>
    <div class="hero bg-base-100 rounded-2xl shadow-xl w-full max-w-md">
      <div class="hero-content text-center py-8 px-6">
        <div class="max-w-md">
          <h1 class="text-4xl md:text-5xl font-bold text-primary mb-6">
            Hello there! 👋
          </h1>
          <p class="text-lg text-base-content/80 mb-8">
            Welcome to Aura! You're successfully authenticated and ready to
            explore.
          </p>

          {#if $authStore.user}
            <div class="bg-base-200 rounded-lg p-4 mb-6">
              <p class="text-sm text-base-content/60 mb-1">Signed in as</p>
              <p class="font-medium text-base-content">
                {$authStore.user.email}
              </p>
            </div>
          {/if}

          <div class="space-y-4">
            <a href="/features" class="btn btn-primary btn-lg w-full">
              <PlayIcon class="w-5 h-5 mr-2" />
              Explore Features
            </a>
            <a href="/stripe-test" class="btn btn-primary btn-lg w-full">
              <DollarSignIcon class="w-5 h-5 mr-2" />
              Subscription
            </a>
            <a href="/settings" class="btn btn-outline btn-lg w-full">
              <CogIcon class="w-5 h-5 mr-2" />
              Settings
            </a>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
{/if}
