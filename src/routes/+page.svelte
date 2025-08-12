<script lang="ts">
  import { onMount } from "svelte";
  import { CogIcon, PlayIcon, CoinsIcon } from "lucide-svelte";
  import AppLayout from "../lib/components/AppLayout.svelte";
  import OnboardingProfile from "../lib/components/onboarding/OnboardingProfile.svelte";
  import { centralizedAuth } from "../lib/stores/unifiedAuth";
  import { dataActions, dataStore } from "../lib/stores/dataStore";
  import { loadingActions } from "../lib/stores/loadingStore";

  import { goto } from "$app/navigation";
  import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";

  let needsOnboarding = false;
  let profileChecked = false;

  onMount(async () => {
    // Check onboarding status using centralized auth
    const authState = await centralizedAuth.getState();
    if (authState.isAuthenticated && authState.user) {
      await checkOnboardingStatus(authState);
    } else {
      profileChecked = true;
    }
  });

  async function checkOnboardingStatus(authState: any) {
    if (!authState.user) {
      profileChecked = true;
      return;
    }

    // Check if we already have profile data in the store
    const currentProfile = $dataStore.currentProfile;
    if (currentProfile && currentProfile.id === authState.user.id) {
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
      if (storeProfile && storeProfile.id === authState.user.id) {
        needsOnboarding = !storeProfile.onboarding_complete;
        profileChecked = true;
        return;
      }

      // We need to fetch the profile
      if (!showedLoading) {
        loadingActions.showProfile('Loading your profile...');
        showedLoading = true;
      }

      const profile = await dataActions.getUserProfile(authState.user.id, false);
      
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
    <Card class="text-center">
      <CardHeader>
        <CardTitle class="text-4xl md:text-5xl font-bold text-primary mb-4">
          Hello there! 👋
        </CardTitle>
        
        <!-- Username and Token Balance -->
        {#if $dataStore.currentProfile}
          <div class="space-y-3 mb-6">
            <!-- Username -->
            {#if $dataStore.currentProfile.username}
              <p class="text-xl text-muted-foreground">
                @{$dataStore.currentProfile.username}
              </p>
            {/if}
            
            <!-- Token Balance -->
            <div class="inline-flex items-center gap-2 bg-muted/50 rounded-lg px-4 py-2">
              <CoinsIcon class="w-5 h-5 text-primary" />
              <span class="text-lg font-semibold text-foreground">
                {($dataStore.currentProfile.tokens_remaining || 0).toLocaleString()} tokens
              </span>
            </div>
          </div>
        {/if}
        
        <p class="text-lg text-muted-foreground">
          Welcome to Aura! You're successfully authenticated and ready to
          explore.
        </p>
      </CardHeader>
    </Card>
  </AppLayout>
{/if}
