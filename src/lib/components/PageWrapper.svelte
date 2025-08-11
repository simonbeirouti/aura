<script lang="ts">
  export let title: string = "";
  export let showBackButton: boolean = false;
  export let maxWidth: string = "max-w-4xl";
  export let padding: string = "p-4";
  export let onBack: (() => void) | null = null;
</script>

<!-- Strict content container - fills available space exactly -->
<div class="bg-background text-foreground w-full h-full flex flex-col" style="max-height: 100%; overflow: hidden;">
  <div class="w-full {maxWidth} mx-auto {padding} h-full flex flex-col" style="max-height: 100%; overflow: hidden;">
    <!-- Page Header - Fixed size -->
    {#if title || showBackButton}
      <header class="flex items-center justify-between mb-6" style="flex-shrink: 0;">
        <div class="flex items-center gap-4">
          {#if showBackButton}
            <button
              onclick={onBack}
              class="flex items-center justify-center w-10 h-10 rounded-full bg-muted hover:bg-muted/80 transition-colors"
              aria-label="Go back"
            >
              <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          {/if}
          {#if title}
            <h1 class="text-2xl font-semibold">{title}</h1>
          {/if}
        </div>
        <!-- Header Actions Slot -->
        <div class="flex items-center gap-2">
          <slot name="header-actions" />
        </div>
      </header>
    {/if}

    <!-- Main Content - ONLY this scrolls if content exceeds available space -->
    <main class="flex-1 overflow-y-auto pb-4" style="min-height: 0; max-height: 100%;">
      <slot />
    </main>
  </div>
</div>

<style>
  /* Ensure smooth scrolling */
  .overflow-y-auto {
    scroll-behavior: smooth;
  }
  
  /* Custom scrollbar styling */
  .overflow-y-auto::-webkit-scrollbar {
    width: 6px;
  }
  
  .overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .overflow-y-auto::-webkit-scrollbar-thumb {
    background: hsl(var(--muted-foreground) / 0.3);
    border-radius: 3px;
  }
  
  .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--muted-foreground) / 0.5);
  }
</style>
