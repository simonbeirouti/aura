<script lang="ts">
  import { onMount } from "svelte";
  import { CogIcon, PlayIcon } from "lucide-svelte";
  import AppLayout from "../lib/components/AppLayout.svelte";
  import OnboardingProfile from "../lib/components/onboarding/OnboardingProfile.svelte";
  import { authStore } from "../lib/stores/supabaseAuth";
  import { dataActions, dataStore } from "../lib/stores/dataStore";
  import { loadingActions } from "../lib/stores/loadingStore";

  import { goto } from "$app/navigation";
  import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";

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
  <AppLayout maxWidth="max-w-2xl">
    <div slot="header-actions">

    </div>
    
    <Card class="text-center">
      <CardHeader>
        <CardTitle class="text-4xl md:text-5xl font-bold text-primary mb-4">
          Hello there! 👋
        </CardTitle>
        <p class="text-lg text-muted-foreground">
          Welcome to Aura! You're successfully authenticated and ready to
          explore.
        </p>
      </CardHeader>
      <CardContent>
        {#if $authStore.user}
          <div class="bg-muted rounded-lg p-4 mb-6">
            <p class="text-sm text-muted-foreground mb-1">Signed in as</p>
            <p class="font-medium text-foreground">
              {$authStore.user.email}
            </p>
          </div>
        {/if}

        <div class="space-y-4">
          <Button
            onclick={() => goto('/features')}
            variant="default"
            size="lg"
            class="w-full gap-2"
          >
            <PlayIcon class="w-5 h-5" />
            Explore Features
          </Button>
          <Button
            onclick={() => goto('/settings')}
            variant="outline"
            size="lg"
            class="w-full gap-2"
          >
            <CogIcon class="w-5 h-5" />
            Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  </AppLayout>
{/if}
