<script lang="ts">
  import { CogIcon, PlayIcon } from "lucide-svelte";
  import AppLayout from "../lib/components/AppLayout.svelte";
  import { authStore } from "../lib/stores/supabaseAuth";

  let authState: {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: any;
    error: string | null;
  } = {
    isAuthenticated: false,
    isLoading: true,
    user: null,
    error: null,
  };

  authStore.subscribe((state) => {
    authState = state;
  });
</script>

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

        {#if authState.user}
          <div class="bg-base-200 rounded-lg p-4 mb-6">
            <p class="text-sm text-base-content/60 mb-1">Signed in as</p>
            <p class="font-medium text-base-content">
              {authState.user.email}
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
