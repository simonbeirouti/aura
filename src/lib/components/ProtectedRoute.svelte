<script lang="ts">
  import { isAuthenticated, isLoading } from '$lib/stores';

  export let fallback: string = '/login';
</script>

{#if $isLoading}
  <div class="flex justify-center items-center min-h-screen">
    <div class="loading loading-spinner loading-lg"></div>
  </div>
{:else if $isAuthenticated}
  <slot />
{:else}
  <div class="hero min-h-screen bg-base-200">
    <div class="hero-content text-center">
      <div class="max-w-md">
        <h1 class="text-5xl font-bold">Access Restricted</h1>
        <p class="py-6">You need to be signed in to access this page.</p>
        <a href={fallback} class="btn btn-primary">Sign In</a>
      </div>
    </div>
  </div>
{/if}
