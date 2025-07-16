<script lang="ts">
  import { toasts, removeToast, type Toast } from '../stores/toast.js';
  import { fly, fade } from 'svelte/transition';

  // Get the alert class based on toast type
  function getAlertClass(type: Toast['type']): string {
    switch (type) {
      case 'success':
        return 'alert-success';
      case 'warning':
        return 'alert-warning';
      case 'error':
        return 'alert-error';
      case 'info':
      default:
        return 'alert-info';
    }
  }

  // Get the icon SVG based on toast type
  function getIcon(type: Toast['type']): string {
    switch (type) {
      case 'success':
        return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'warning':
        return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z';
      case 'error':
        return 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'info':
      default:
        return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    }
  }

  function handleDismiss(id: string) {
    removeToast(id);
  }
</script>

<!-- Toast container positioned at top-end -->
{#if $toasts.length > 0}
  <div class="toast toast-top toast-end w-full z-50">
    {#each $toasts as toast (toast.id)}
      <div
        class="alert {getAlertClass(toast.type)} shadow-lg min-w-72 max-w-96 toast-item"
        in:fly={{ y: -50, duration: 300 }}
        out:fade={{ duration: 200 }}
      >
        <!-- Icon -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="stroke-current shrink-0 h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d={getIcon(toast.type)}
          />
        </svg>
        
        <!-- Message -->
        <span class="flex-1">{toast.message}</span>
        
        <!-- Dismiss button (if dismissible) -->
        {#if toast.dismissible}
          <button
            class="btn btn-sm btn-ghost btn-circle"
            onclick={() => handleDismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Ensure toast container doesn't interfere with page layout */
  .toast {
    pointer-events: none;
  }
  
  .toast .alert {
    pointer-events: auto;
  }
  
  /* Prevent toast movement during transitions */
  .toast-item {
    position: absolute;
    top: 0;
    right: 0;
    transform-origin: top right;
  }
  
  /* Mobile responsive adjustments */
  @media (max-width: 640px) {
    .toast {
      left: 1rem;
      right: 1rem;
      top: 1rem;
    }
    
    .toast-item {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      transform-origin: top center;
    }
    
    .alert {
      min-width: auto !important;
      max-width: none !important;
      width: 100%;
    }
  }
</style>
