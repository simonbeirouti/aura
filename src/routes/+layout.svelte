<script>
  import "../app.css";
  import { isAuthenticated, user, isLoading, authInitialized } from '$lib/stores';
  import { signOut } from 'firebase/auth';
  import { auth } from '$lib/firebase';
  import { goto, afterNavigate } from '$app/navigation';
  
  let currentPath = '/';
  
  afterNavigate((navigation) => {
    currentPath = navigation.to?.url.pathname || '/';
  });

  async function handleSignOut() {
    try {
      await signOut(auth);
      goto('/');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }
</script>

<!-- Global loading screen while auth initializes -->
{#if $isLoading || !$authInitialized}
  <div class="hero min-h-screen bg-base-200">
    <div class="hero-content text-center">
      <div class="max-w-md">
        <div class="loading loading-spinner loading-lg mb-4"></div>
        <h1 class="text-2xl font-bold">Loading Aura...</h1>
        <p class="text-base-content/70">Initializing your experience</p>
      </div>
    </div>
  </div>
{:else}
  <!-- Navigation bar for authenticated users -->
  {#if $isAuthenticated}
    <div class="navbar bg-base-100 shadow-sm">
      <div class="navbar-start">
        <div class="dropdown">
          <div tabindex="0" role="button" class="btn btn-ghost lg:hidden">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h8m-8 6h16"></path>
            </svg>
          </div>
          <ul class="menu menu-sm dropdown-content bg-base-100 rounded-box z-[1] mt-3 w-52 p-2 shadow">
            <li><a href="/app">Dashboard</a></li>
            <li><a href="/profile">Profile</a></li>
          </ul>
        </div>
        <a href="/app" class="btn btn-ghost text-xl">Aura</a>
      </div>
      <div class="navbar-center hidden lg:flex">
        <ul class="menu menu-horizontal px-1">
          <li><a href="/app" class:active={currentPath === '/app'}>Dashboard</a></li>
          <li><a href="/profile" class:active={currentPath === '/profile'}>Profile</a></li>
        </ul>
      </div>
      <div class="navbar-end">
        <button class="btn btn-error" disabled={!$isAuthenticated} aria-label="Sign Out" onclick={handleSignOut}>Sign Out</button>
      </div>
    </div>
  {/if}

  <!-- Main content area -->
  <main>
    {#key currentPath}
      <div>
        <slot />
      </div>
    {/key}
  </main>
{/if}
