<script lang="ts">
  import { authStore } from '../stores/supabaseAuth';
  
  export let onLoginSuccess: () => void = () => {};
  
  let email = '';
  let password = '';
  let isSignUp = false;
  let loading = false;
  let error = '';
  let successMessage = '';

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!email || !password) {
      error = 'Please fill in all fields';
      return;
    }

    if (password.length < 6) {
      error = 'Password must be at least 6 characters';
      return;
    }

    loading = true;
    error = '';
    successMessage = '';

    try {
      let result;
      if (isSignUp) {
        result = await authStore.signUp(email, password);
      } else {
        result = await authStore.login(email, password);
      }

      if (result.success) {
        if (result.message) {
          successMessage = result.message;
        } else {
          onLoginSuccess();
        }
      } else {
        error = result.error || 'Authentication failed';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An unexpected error occurred';
    } finally {
      loading = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleSubmit(event as any);
    }
  }

  function toggleMode() {
    isSignUp = !isSignUp;
    error = '';
    successMessage = '';
  }

  function clearMessages() {
    error = '';
    successMessage = '';
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-base-200 p-4">
  <div class="card w-full max-w-md bg-base-100 shadow-xl">
    <div class="card-body">
      <h2 class="card-title text-2xl font-bold text-center mb-6">
        {isSignUp ? 'Create Account' : 'Welcome Back'}
      </h2>
      
      <form onsubmit={handleSubmit} class="space-y-4">
        <!-- Email Input -->
        <div class="form-control">
          <label class="label" for="email-input">
            <span class="label-text">Email</span>
          </label>
          <input
            id="email-input"
            type="email"
            bind:value={email}
            oninput={clearMessages}
            onkeydown={handleKeyDown}
            placeholder="Enter your email"
            class="input input-bordered w-full"
            class:input-error={error}
            disabled={loading}

            required
          />
        </div>

        <!-- Password Input -->
        <div class="form-control">
          <label class="label" for="password-input">
            <span class="label-text">Password</span>
          </label>
          <input
            id="password-input"
            type="password"
            bind:value={password}
            oninput={clearMessages}
            onkeydown={handleKeyDown}
            placeholder="Enter your password"
            class="input input-bordered w-full"
            class:input-error={error}
            disabled={loading}
            required
          />
          {#if isSignUp}
            <div class="label">
              <span class="label-text-alt">Minimum 6 characters</span>
            </div>
          {/if}
        </div>

        <!-- Error Message -->
        {#if error}
          <div class="alert alert-error">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        {/if}

        <!-- Success Message -->
        {#if successMessage}
          <div class="alert alert-success">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{successMessage}</span>
          </div>
        {/if}

        <!-- Submit Button -->
        <div class="form-control mt-6">
          <button 
            type="submit"
            class="btn btn-primary w-full"
            class:loading={loading}
            disabled={loading || !email || !password}
          >
            {#if loading}
              <span class="loading loading-spinner"></span>
              {isSignUp ? 'Creating Account...' : 'Signing In...'}
            {:else}
              {isSignUp ? 'Create Account' : 'Sign In'}
            {/if}
          </button>
        </div>
      </form>

      <!-- Toggle Mode -->
      <div class="divider">OR</div>
      <div class="text-center">
        <button 
          type="button"
          onclick={toggleMode}
          class="btn btn-ghost btn-sm"
          disabled={loading}
        >
          {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .card {
    backdrop-filter: blur(10px);
  }
  
  .input:focus {
    outline: none;
    border-color: hsl(var(--p));
    box-shadow: 0 0 0 2px hsl(var(--p) / 0.2);
  }
  
  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
