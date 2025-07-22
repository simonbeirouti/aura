<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { authStore } from '../stores/supabaseAuth';
  import { toast } from '../stores/toast';
  
  export let onLoginSuccess: () => void = () => {};
  
  let email = '';
  let password = '';
  let isSignUp = true;
  let loading = false;
  let showPassword = false;

  // Validation functions
  function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  function isValidPassword(password: string): boolean {
    return password.trim().length >= 6;
  }

  function validateForm(): string | null {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) {
      return 'Please enter your email address';
    }

    if (!isValidEmail(trimmedEmail)) {
      return 'Please enter a valid email address (e.g., test@email.com)';
    }

    if (!trimmedPassword) {
      return 'Please enter your password';
    }

    if (!isValidPassword(trimmedPassword)) {
      return 'Password must be at least 6 characters long';
    }

    return null;
  }

  // Check if form is valid for button state
  $: isFormValid = email.trim() && password.trim() && isValidEmail(email.trim()) && isValidPassword(password.trim());

  async function handleEmailAuth() {
    const validationError = validateForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    loading = true;

    try {
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();
      
      let result;
      if (isSignUp) {
        result = await authStore.signUp(trimmedEmail, trimmedPassword);
        if (result.success) {
          toast.success('Account created successfully! Redirecting...');
        } else {
          toast.error(result.error || 'Failed to create account');
        }
      } else {
        result = await authStore.login(trimmedEmail, trimmedPassword);
        if (result.success) {
          toast.success('Welcome back! Signing you in...');
          onLoginSuccess();
        } else {
          toast.error(result.error || 'Invalid email or password');
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication Error';
      toast.error(errorMessage);
    } finally {
      loading = false;
    }
  }

  function handleGoogleSignIn() {
    toast.info('Google Sign-In will be implemented next', 3000);
  }

  function handleAppleSignIn() {
    toast.info('Apple Sign-In will be implemented next', 3000);
  }

  function handleFacebookSignIn() {
    toast.info('Facebook Sign-In will be implemented next', 3000);
  }

  function togglePassword() {
    showPassword = !showPassword;
  }

  // Mobile keyboard handling
  let initialViewportHeight = 0;
  let isKeyboardOpen = false;

  function handleInputFocus() {
    if (typeof window !== 'undefined') {
      // Store initial viewport height
      initialViewportHeight = window.innerHeight;
      isKeyboardOpen = true;
      
      // Add a small delay to ensure the keyboard is fully open
      setTimeout(() => {
        // Scroll to ensure input is visible but not too aggressive
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
          activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    }
  }

  function handleInputBlur() {
    if (typeof window !== 'undefined' && isKeyboardOpen) {
      isKeyboardOpen = false;
      
      // Add delay to ensure keyboard is fully closed
      setTimeout(() => {
        // Reset scroll position to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Force viewport height reset
        document.documentElement.style.height = '100%';
        document.body.style.height = '100%';
        
        // Clean up after animation
        setTimeout(() => {
          document.documentElement.style.height = '';
          document.body.style.height = '';
        }, 300);
      }, 100);
    }
  }

  // Handle viewport resize (keyboard open/close detection)
  function handleViewportResize() {
    if (typeof window !== 'undefined' && initialViewportHeight > 0) {
      const currentHeight = window.innerHeight;
      const heightDifference = initialViewportHeight - currentHeight;
      
      // If viewport shrunk significantly, keyboard is likely open
      if (heightDifference > 150) {
        isKeyboardOpen = true;
      }
      // If viewport returned to near original size, keyboard is likely closed
      else if (heightDifference < 50 && isKeyboardOpen) {
        handleInputBlur();
      }
    }
  }

  // Lifecycle management
  onMount(() => {
    if (typeof window !== 'undefined') {
      initialViewportHeight = window.innerHeight;
      window.addEventListener('resize', handleViewportResize);
      
      // Prevent zoom on input focus (iOS Safari)
      const viewport = document.querySelector('meta[name=viewport]');
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
      }
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', handleViewportResize);
      
      // Restore normal viewport behavior
      const viewport = document.querySelector('meta[name=viewport]');
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
      }
    }
  });
</script>

<div class="min-h-screen flex flex-col safe-area-inset">
  <!-- Main Content Container with Background Image -->
  <div class="flex-1 relative overflow-hidden rounded-2xl sm:rounded-3xl mx-3 sm:mx-4 my-3 sm:my-4 shadow-2xl max-h-[70vh] sm:max-h-[75vh]">
    <!-- Background Image -->
    <div class="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <!-- Robot silhouette overlay -->
      <div class="absolute inset-0 bg-cover bg-center opacity-80 robot-bg"></div>
    </div>
    
    <!-- Content positioned at bottom of image -->
    <div class="absolute inset-0 flex flex-col justify-end p-4 sm:p-6">
      <!-- Toggle Buttons -->
      <div class="flex justify-center mb-4 sm:mb-6">
        <div class="flex bg-base-300/80 rounded-xl p-1 w-3/4 sm:w-1/2 max-w-xs">
          <button
            onclick={() => isSignUp = true}
            class="flex-1 py-2 sm:py-2.5 rounded-xl text-center font-semibold text-xs sm:text-sm transition-all"
            class:bg-primary={isSignUp}
            class:text-primary-content={isSignUp}
            class:text-base-content={!isSignUp}
          >
            Sign Up
          </button>
          <button
            onclick={() => isSignUp = false}
            class="flex-1 py-2 sm:py-2.5 rounded-xl text-center font-semibold text-xs sm:text-sm transition-all"
            class:bg-primary={!isSignUp}
            class:text-primary-content={!isSignUp}
            class:text-base-content={isSignUp}
          >
            Log In
          </button>
        </div>
      </div>

      <!-- Form Container -->
      <div class="flex justify-center">
        <div class="w-full max-w-sm px-2">
          <!-- Email Input -->
          <div class="mb-3 sm:mb-4">
            <input
              type="email"
              bind:value={email}
              placeholder="Email"
              class="input input-sm sm:input-md w-full bg-base-100/90 border-base-300 rounded-xl text-sm sm:text-base placeholder-base-content/60"
              disabled={loading}
              onfocus={handleInputFocus}
              onblur={handleInputBlur}
            />
          </div>

          <!-- Password Input -->
          <div class="mb-4 sm:mb-5 relative">
            <input
              type={showPassword ? 'text' : 'password'}
              bind:value={password}
              placeholder="Password"
              class="input input-sm sm:input-md w-full bg-base-100/90 border-base-300 rounded-xl text-sm sm:text-base placeholder-base-content/60 pr-10 sm:pr-12"
              disabled={loading}
              onfocus={handleInputFocus}
              onblur={handleInputBlur}
            />
            <button
              type="button"
              onclick={togglePassword}
              class="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-base-content/60 hover:text-base-content"
            >
              {#if showPassword}
                <svg class="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path>
                </svg>
              {:else}
                <svg class="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
              {/if}
            </button>
          </div>

          <!-- Sign Up Button -->
          <button
            onclick={handleEmailAuth}
            disabled={loading || !isFormValid}
            class="btn btn-primary btn-sm sm:btn-md w-full rounded-xl py-3 sm:py-4 text-sm sm:text-base font-semibold disabled:btn-disabled"
          >
            {#if loading}
              <span class="loading loading-spinner loading-sm sm:loading-md"></span>
              Loading...
            {:else}
              {isSignUp ? 'Sign Up' : 'Log In'}
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- OR ACCESS WITH - Outside the card -->
  <div class="text-center mt-4 sm:mt-6 mb-4 sm:mb-6">
    <p class="text-base-content/60 text-xs font-medium tracking-wide">OR ACCESS WITH</p>
  </div>

  <!-- Social Login Buttons - Outside the card -->
  <div class="flex justify-center gap-4 sm:gap-5 mb-4 sm:mb-6 pb-safe">
    <button
      onclick={handleAppleSignIn}
      class="btn btn-circle bg-base-100 border-base-300 hover:bg-base-200 w-12 h-12 sm:w-14 sm:h-14 shadow-sm"
      aria-label="Sign in with Apple"
    >
      <svg class="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
    </button>
    
    <button
      onclick={handleFacebookSignIn}
      class="btn btn-circle bg-base-100 border-base-300 hover:bg-base-200 w-12 h-12 sm:w-14 sm:h-14 shadow-sm"
      aria-label="Sign in with Facebook"
    >
      <svg class="w-5 h-5 sm:w-6 sm:h-6 text-[#1877F2]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    </button>
    
    <button
      onclick={handleGoogleSignIn}
      class="btn btn-circle bg-base-100 border-base-300 hover:bg-base-200 w-12 h-12 sm:w-14 sm:h-14 shadow-sm"
      aria-label="Sign in with Google"
    >
      <svg class="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    </button>
  </div>


</div>

<style>
  .robot-bg {
    background-image: radial-gradient(circle at 50% 50%, #334155 0%, #0f172a 100%);
    position: relative;
  }
  
  .robot-bg::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: 
      radial-gradient(1px 1px at 50px 100px, #ffffff 50%, transparent 50%),
      radial-gradient(0.5px 0.5px at 150px 80px, #ffffff 50%, transparent 50%),
      radial-gradient(1.5px 1.5px at 300px 120px, #ffffff 50%, transparent 50%),
      radial-gradient(0.8px 0.8px at 350px 200px, #ffffff 50%, transparent 50%),
      radial-gradient(1.2px 1.2px at 80px 300px, #ffffff 50%, transparent 50%),
      radial-gradient(0.7px 0.7px at 250px 350px, #ffffff 50%, transparent 50%),
      radial-gradient(1px 1px at 380px 450px, #ffffff 50%, transparent 50%),
      radial-gradient(0.9px 0.9px at 120px 500px, #ffffff 50%, transparent 50%);
    opacity: 0.6;
  }
  
  .robot-bg::after {
    content: '';
    position: absolute;
    top: 30%;
    left: 50%;
    transform: translateX(-50%);
    width: 160px;
    height: 240px;
    background: linear-gradient(135deg, #475569 0%, #64748b 100%);
    border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
    opacity: 0.3;
    box-shadow: 
      -20px -20px 0 -10px rgba(51, 65, 85, 0.4),
      20px -20px 0 -10px rgba(51, 65, 85, 0.4),
      -10px 10px 20px rgba(0, 0, 0, 0.3);
  }

  .input:focus {
    outline: none;
    border-color: hsl(var(--p));
    box-shadow: 0 0 0 2px hsl(var(--p) / 0.2);
  }
</style>
