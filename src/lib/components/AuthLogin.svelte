<script lang="ts">
  import { authActions } from '../stores/auth.js';
  
  let password = '';
  let isLoading = false;
  let error = '';
  let showResetConfirm = false;
  let isResetting = false;

  async function handleLogin(event: Event) {
    event.preventDefault();
    
    if (!password) {
      error = 'Please enter your password';
      return;
    }

    isLoading = true;
    error = '';

    const success = await authActions.login(password);
    
    if (!success) {
      isLoading = false;
      password = ''; // Clear password on failed attempt
    }
  }

  async function handleReset() {
    isResetting = true;
    
    const success = await authActions.resetApp();
    
    if (success) {
      showResetConfirm = false;
      // The app will automatically redirect to setup since isInitialized will be false
    } else {
      error = 'Failed to reset app. Please try again.';
    }
    
    isResetting = false;
  }

  function showResetDialog() {
    showResetConfirm = true;
    error = '';
  }

  function cancelReset() {
    showResetConfirm = false;
  }

  function clearError() {
    error = '';
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleLogin(event);
    }
  }
</script>

<div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
  <div class="card w-full max-w-md bg-base-100 shadow-xl">
    <div class="card-body">
      <h2 class="card-title text-center justify-center mb-6">
        Welcome Back
      </h2>
      
      <p class="text-center text-base-content/70 mb-6">
        Enter your master password to unlock Aura
      </p>

      <form onsubmit={handleLogin} class="space-y-4">
        <div class="form-control">
          <label class="label" for="password">
            <span class="label-text">Master Password</span>
          </label>
          <input
            id="password"
            type="password"
            placeholder="Enter your master password"
            bind:value={password}
            oninput={clearError}
            onkeydown={handleKeydown}
            class="input input-bordered w-full"
            class:input-error={error}
            required
            disabled={isLoading}

          />
        </div>

        {#if error}
          <div class="alert alert-error">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        {/if}

        <div class="form-control mt-6">
          <button 
            type="submit" 
            class="btn btn-primary w-full"
            class:loading={isLoading}
            disabled={isLoading || !password}
          >
            {#if isLoading}
              <span class="loading loading-spinner"></span>
              Unlocking...
            {:else}
              Unlock Aura
            {/if}
          </button>
        </div>
      </form>

      <div class="divider"></div>
      
      <div class="text-center space-y-2">
        <p class="text-sm text-base-content/60">
          Forgot your password?
        </p>
        <button 
          type="button"
          class="btn btn-outline btn-warning btn-sm"
          onclick={showResetDialog}
          disabled={isLoading || isResetting}
        >
          Reset Application
        </button>
      </div>
    </div>
  </div>

  <!-- Reset Confirmation Modal -->
  {#if showResetConfirm}
    <div class="modal modal-open">
      <div class="modal-box">
        <h3 class="font-bold text-lg text-error">⚠️ Reset Application</h3>
        <p class="py-4">
          This will <strong>permanently delete</strong> all your data including:
        </p>
        <ul class="list-disc list-inside space-y-1 text-sm text-base-content/80 mb-4">
          <li>Your master password</li>
          <li>All stored secrets and notes</li>
          <li>Application settings</li>
          <li>Stronghold vault files</li>
        </ul>
        <p class="text-sm text-warning font-medium mb-6">
          This action cannot be undone. You will need to set up the application again.
        </p>
        
        <div class="modal-action">
          <button 
            class="btn btn-outline"
            onclick={cancelReset}
            disabled={isResetting}
          >
            Cancel
          </button>
          <button 
            class="btn btn-error"
            onclick={handleReset}
            disabled={isResetting}
          >
            {#if isResetting}
              <span class="loading loading-spinner loading-sm"></span>
              Resetting...
            {:else}
              Reset Everything
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
