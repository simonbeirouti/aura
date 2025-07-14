<script lang="ts">
  import { authActions } from '../stores/auth.js';
  
  let password = '';
  let confirmPassword = '';
  let isLoading = false;
  let error = '';

  async function handleSetup() {
    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }

    if (password.length < 8) {
      error = 'Password must be at least 8 characters long';
      return;
    }

    isLoading = true;
    error = '';

    const success = await authActions.initializeApp(password);
    
    if (!success) {
      isLoading = false;
    }
  }

  function clearError() {
    error = '';
  }
</script>

<div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
  <div class="card w-full max-w-md bg-base-100 shadow-xl">
    <div class="card-body">
      <h2 class="card-title text-center justify-center mb-6">
        Welcome to Aura
      </h2>
      
      <p class="text-center text-base-content/70 mb-6">
        Set up your master password to secure your data
      </p>

      <form on:submit|preventDefault={handleSetup} class="space-y-4">
        <div class="form-control">
          <label class="label" for="password">
            <span class="label-text">Master Password</span>
          </label>
          <input
            id="password"
            type="password"
            placeholder="Enter your master password"
            bind:value={password}
            on:input={clearError}
            class="input input-bordered w-full"
            class:input-error={error}
            required
            disabled={isLoading}
          />
        </div>

        <div class="form-control">
          <label class="label" for="confirm-password">
            <span class="label-text">Confirm Password</span>
          </label>
          <input
            id="confirm-password"
            type="password"
            placeholder="Confirm your master password"
            bind:value={confirmPassword}
            on:input={clearError}
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
            disabled={isLoading || !password || !confirmPassword}
          >
            {#if isLoading}
              <span class="loading loading-spinner"></span>
              Setting up...
            {:else}
              Set Up Aura
            {/if}
          </button>
        </div>
      </form>

      <div class="divider"></div>
      
      <div class="text-center text-sm text-base-content/60">
        <p>Your password will be used to encrypt and protect your data.</p>
        <p class="font-semibold">Make sure to remember it - it cannot be recovered!</p>
      </div>
    </div>
  </div>
</div>
