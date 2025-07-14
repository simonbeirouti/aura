<script lang="ts">
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';
  import { getUserProfile, executeProtectedAction } from '$lib/auth';
  import { user } from '$lib/stores';
  import { onMount } from 'svelte';

  let userProfile: any = null;
  let actionResult: string | null = null;
  let loading = false;

  onMount(async () => {
    if ($user) {
      userProfile = await getUserProfile();
    }
  });

  async function testProtectedAction() {
    loading = true;
    try {
      actionResult = await executeProtectedAction();
    } finally {
      loading = false;
    }
  }
</script>

<ProtectedRoute>
  <div class="hero min-h-screen bg-base-200">
    <div class="hero-content text-center">
      <div class="max-w-md">
        <h1 class="text-5xl font-bold">Profile</h1>
        
        {#if userProfile}
          <div class="card w-96 bg-base-100 shadow-xl mt-8">
            <figure class="px-10 pt-10">
              <img
                src={userProfile.picture || 'https://picsum.photos/200/200'}
                alt="Profile"
                class="rounded-xl w-24 h-24"
              />
            </figure>
            <div class="card-body items-center text-center">
              <h2 class="card-title">{userProfile.name || 'Anonymous'}</h2>
              <p>{userProfile.email || 'No email'}</p>
              <p class="text-sm opacity-70">UID: {userProfile.uid}</p>
            </div>
          </div>
        {/if}

        <div class="mt-8">
          <button 
            class="btn btn-secondary" 
            class:loading={loading}
            on:click={testProtectedAction}
            disabled={loading}
          >
            Test Protected Action
          </button>
          
          {#if actionResult}
            <div class="alert alert-success mt-4">
              <span>{actionResult}</span>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</ProtectedRoute>
