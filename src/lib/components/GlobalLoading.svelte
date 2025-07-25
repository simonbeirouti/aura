<script lang="ts">
  import { loadingStore } from '../stores/loadingStore';
  import { LoaderIcon, XIcon } from 'lucide-svelte';

  // Subscribe to loading state
  $: loadingState = $loadingStore;

  function handleCancel() {
    if (loadingState.canCancel) {
      loadingStore.hide(loadingState.id);
    }
  }
</script>

{#if loadingState.isLoading}
  <!-- Full screen loading overlay -->
  <div 
    class="fixed inset-0 bg-base-300/90 backdrop-blur-sm z-50 flex items-center justify-center"
    role="dialog"
    aria-modal="true"
    aria-labelledby="loading-message"
  >
    <!-- Loading content centered on screen -->
    <div class="text-center space-y-6 px-4">
      <!-- Loading spinner -->
      <div class="flex justify-center">
        <LoaderIcon class="w-16 h-16 text-primary animate-spin" />
      </div>
      
      <!-- Loading message -->
      <div class="space-y-4">
        <p id="loading-message" class="text-2xl font-semibold text-base-content">
          {loadingState.message}
        </p>
        
        <!-- Progress bar (if progress is provided) -->
        {#if loadingState.progress !== undefined}
          <div class="w-80 max-w-full bg-base-200 rounded-full h-3 mx-auto">
            <div 
              class="bg-primary h-3 rounded-full transition-all duration-300 ease-out"
              style="width: {loadingState.progress}%"
            ></div>
          </div>
          <p class="text-base text-base-content/70">
            {Math.round(loadingState.progress)}% complete
          </p>
        {/if}
        
        <!-- Cancel button (if cancellable) -->
        {#if loadingState.canCancel}
          <button
            class="btn btn-ghost btn-sm mt-2"
            onclick={handleCancel}
            aria-label="Cancel loading"
          >
            <XIcon class="w-4 h-4 mr-2" />
            Cancel
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Ensure the loading overlay is above everything */
  :global(.loading-overlay) {
    z-index: 9999;
  }
  
  /* Prevent body scroll when loading is active */
  :global(body:has(.loading-overlay)) {
    overflow: hidden;
  }
</style>
