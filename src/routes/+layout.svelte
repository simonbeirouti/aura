<script lang="ts">
  import { onMount } from "svelte";
  import "../app.css";
  import Toast from "../lib/components/Toast.svelte";
  import Login from "../lib/components/Login.svelte";
  import Onboarding from "../lib/components/Onboarding.svelte";
  import { authStore } from "../lib/stores/supabaseAuth";
  import { databaseStore } from "../lib/stores/database";

  let needsOnboarding = false;
  let checkingProfile = false;

  onMount(async () => {
    await authStore.initialize();

    // Check if user needs onboarding after auth is initialized
    if ($authStore.isAuthenticated && $authStore.user) {
      await checkUserProfile();
    }
  });

  // Check if user needs to complete onboarding
  async function checkUserProfile() {
    if (!$authStore.user) return;
    if (checkingProfile) {
      return;
    }

    checkingProfile = true;

    try {
      // Initialize database if needed
      if (!$databaseStore.isInitialized) {
        await databaseStore.initialize();
      }

      // Check if user has a profile
      const profile = await databaseStore.getUserProfile($authStore.user.id);

      // User needs onboarding if they don't have a profile or haven't completed onboarding
      needsOnboarding = !profile || !profile.onboarding_complete;
    } catch (error) {
      console.error("Failed to check user profile:", error);
      // If we can't check, assume they need onboarding
      needsOnboarding = true;
    } finally {
      checkingProfile = false;
    }
  }

  function handleLoginSuccess() {
    // Check profile after successful login
    if ($authStore.user) {
      checkUserProfile();
    } else {
      console.warn("[Layout] No user found after login success");
    }
  }

  function handleOnboardingComplete() {
    needsOnboarding = false;
    // Force a refresh of the profile data
    checkUserProfile();
  }

  // Watch for auth state changes (logging only, no automatic actions)
  $: {
  }
</script>

{#if $authStore.isLoading || checkingProfile}
  <div class="min-h-screen bg-base-200 flex items-center justify-center">
    <div class="text-center space-y-6">
      <div class="flex justify-center">
        <span class="loading loading-spinner w-16 h-16 text-primary"></span>
      </div>
      <div class="space-y-2">
        <p class="text-2xl font-semibold text-base-content">
          {checkingProfile ? "Setting up your profile..." : "Loading..."}
        </p>
        <p class="text-sm text-base-content/60">
          {checkingProfile
            ? "Just a moment while we prepare everything"
            : "Initializing your secure session"}
        </p>
      </div>
    </div>
  </div>
{:else if $authStore.isAuthenticated && needsOnboarding}
  <Onboarding on:complete={handleOnboardingComplete} />
{:else if $authStore.isAuthenticated}
  <slot />
{:else}
  <div class="app-screen">
    <Login onLoginSuccess={handleLoginSuccess} />
  </div>
{/if}

<Toast />
