<script lang="ts">
  import { onMount } from "svelte";
  import { CogIcon, PlayIcon } from "lucide-svelte";
  import AppLayout from "../lib/components/AppLayout.svelte";
  import OnboardingProfile from "../lib/components/onboarding/OnboardingProfile.svelte";
  import { authStore } from "../lib/stores/supabaseAuth";
  import { databaseStore } from "../lib/stores/database";

  let needsProfileSetup = false;
  let checkingProfile = false;

  onMount(async () => {
    if ($authStore.isAuthenticated && $authStore.user) {
      await checkUserProfile();
    }
  });

  // Check if user needs to complete profile setup
  async function checkUserProfile() {
    if (!$authStore.user || checkingProfile) return;

    checkingProfile = true;

    try {
      // Initialize database if needed
      if (!$databaseStore.isInitialized) {
        await databaseStore.initialize();
      }

      // Check if user has a complete profile
      const profile = await databaseStore.getUserProfile($authStore.user.id);

      // User needs profile setup if they don't have a profile, haven't completed onboarding, 
      // or are missing required profile fields (full_name, username)
      needsProfileSetup = !profile || 
                        !profile.onboarding_complete || 
                        !profile.full_name || 
                        !profile.username || 
                        profile.full_name.trim() === '' || 
                        profile.username.trim() === '';
    } catch (error) {
      console.error("Failed to check user profile:", error);
      // If we can't check, assume they need profile setup
      needsProfileSetup = true;
    } finally {
      checkingProfile = false;
    }
  }

  // Handle profile completion
  function handleProfileComplete() {
    needsProfileSetup = false;
  }

  // Reactive check when auth state changes
  $: if ($authStore.isAuthenticated && $authStore.user && !checkingProfile) {
    checkUserProfile();
  }
</script>

{#if needsProfileSetup}
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
