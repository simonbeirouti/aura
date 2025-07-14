<script lang="ts">
  import { user, isAuthenticated } from '$lib/stores';
  import { verifyToken, getUserProfile } from '$lib/auth';
  import ProtectedRoute from '$lib/components/ProtectedRoute.svelte';

  let loading = $state(false);
  let tokenValid = $state<boolean | null>(null);
  let userProfile = $state<any>(null);

  async function testBackendIntegration() {
    loading = true;
    try {
      // Test token verification
      tokenValid = await verifyToken();
      
      // Get user profile from backend
      userProfile = await getUserProfile();
    } catch (err) {
      console.error('Backend integration test failed:', err);
    } finally {
      loading = false;
    }
  }
</script>

<ProtectedRoute>
  <div class="min-h-screen bg-base-200 p-4">
    <div class="max-w-4xl mx-auto">
      <!-- Welcome Header -->
      <div class="hero bg-base-100 rounded-lg shadow-xl mb-8">
        <div class="hero-content text-center py-12">
          <div class="max-w-md">
            <div class="avatar mb-4">
              <div class="w-20 rounded-full">
                <img src={$user?.photoURL || 'https://picsum.photos/80/80'} alt="User avatar" />
              </div>
            </div>
            <h1 class="text-4xl font-bold">Welcome to Aura!</h1>
            <p class="text-xl mt-2">{$user?.displayName || 'User'}</p>
            <p class="text-base-content/70">{$user?.email}</p>
          </div>
        </div>
      </div>

      <!-- Dashboard Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <!-- Profile Card -->
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <h2 class="card-title">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </h2>
            <p>Manage your account settings and preferences.</p>
            <div class="card-actions justify-end">
              <a href="/profile" class="btn btn-primary">View Profile</a>
            </div>
          </div>
        </div>

        <!-- Backend Integration Card -->
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <h2 class="card-title">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Backend Test
            </h2>
            <p>Test the connection between frontend and Rust backend.</p>
            <div class="card-actions justify-end">
              <button 
                class="btn btn-outline" 
                class:loading={loading}
                onclick={testBackendIntegration}
                disabled={loading}
              >
                Test Connection
              </button>
            </div>
          </div>
        </div>

        <!-- Features Card -->
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <h2 class="card-title">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Features
            </h2>
            <p>Explore the powerful features of Aura.</p>
            <div class="card-actions justify-end">
              <button class="btn btn-outline" disabled>Coming Soon</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Backend Integration Results -->
      {#if tokenValid !== null || userProfile}
        <div class="card bg-base-100 shadow-xl">
          <div class="card-body">
            <h2 class="card-title">Backend Integration Results</h2>
            
            {#if tokenValid !== null}
              <div class="alert" class:alert-success={tokenValid} class:alert-error={!tokenValid}>
                <span>🔐 Token is {tokenValid ? 'valid' : 'invalid'}</span>
              </div>
            {/if}
            
            {#if userProfile}
              <div class="alert alert-info">
                <div class="text-left">
                  <p><strong>Backend Profile:</strong></p>
                  <p>UID: {userProfile.uid}</p>
                  <p>Email: {userProfile.email || 'N/A'}</p>
                  <p>Name: {userProfile.name || 'N/A'}</p>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
</ProtectedRoute>
