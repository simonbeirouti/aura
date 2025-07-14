<script lang="ts">
  import {
    signInWithPopup,
    GoogleAuthProvider,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
  } from "firebase/auth";
  import { auth } from "$lib/firebase";
  import { isAuthenticated, user, isLoading } from "$lib/stores";
  import { verifyToken, getUserProfile } from "$lib/auth";
  import { goto } from "$app/navigation";

  let email = $state("");
  let password = $state("");
  let isSignUp = $state(true);
  let loading = $state(false);
  let error = $state("");
  let showPassword = $state(false);
  let tokenValid = $state<boolean | null>(null);
  let userProfile = $state<any>(null);

  async function signInWithGoogle() {
    loading = true;
    error = "";
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function handleEmailAuth(event: Event) {
    event.preventDefault();
    loading = true;
    error = "";

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function testBackendIntegration() {
    loading = true;
    try {
      // Test token verification
      tokenValid = await verifyToken();

      // Get user profile from backend
      userProfile = await getUserProfile();
    } catch (err) {
      console.error("Backend integration test failed:", err);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if ($isAuthenticated && !$isLoading) {
      goto("/app");
    }
  });
</script>

{#if $isLoading}
  <div class="min-h-screen bg-base-200 flex items-center justify-center">
    <div class="loading loading-spinner loading-lg"></div>
  </div>
{:else if !$isAuthenticated}
  <div class="min-h-screen bg-base-200 p-4 sm:flex sm:items-center sm:justify-center">
    <div class="w-full max-w-md sm:max-w-lg xl:max-w-xl flex flex-col h-screen sm:h-auto">
      <div class="h-3/4 sm:h-96 xl:h-[500px] rounded-3xl overflow-hidden shadow-2xl relative flex-shrink-0">
        
        <!-- Background Image -->
        <div
          class="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style="background-image: url('https://picsum.photos/800/600?random=1')"
        ></div>

        <!-- Overlay -->
        <div class="absolute inset-0 bg-black/30"></div>

        <!-- Content positioned at bottom of image -->
        <div class="relative h-full flex flex-col justify-end p-5">
          <!-- Toggle Buttons -->
          <div class="flex justify-center mb-5">
            <div class="flex bg-base-300 rounded-xl p-1 w-1/2">
              <button
                class="flex-1 py-2.5 rounded-xl text-center font-semibold text-sm transition-all"
                class:bg-primary={isSignUp}
                class:text-primary-content={isSignUp}
                class:text-base-content={!isSignUp}
                onclick={() => (isSignUp = true)}
              >
                Sign Up
              </button>
              <button
                class="flex-1 py-2.5 rounded-xl text-center font-semibold text-sm transition-all"
                class:bg-primary={!isSignUp}
                class:text-primary-content={!isSignUp}
                class:text-base-content={isSignUp}
                onclick={() => (isSignUp = false)}
              >
                Log In
              </button>
            </div>
          </div>

          <!-- Form Container - 5/6 width -->
          <div class="flex justify-center">
            <div class="w-5/6">
              <!-- Email Input -->
              <div class="mb-4">
                <input
                  type="email"
                  placeholder="Email"
                  class="w-full bg-base-100/90 backdrop-blur-sm pl-4 py-2 border border-base-300 rounded-xl text-base placeholder:text-base-content/60"
                  bind:value={email}
                  required
                />
              </div>

              <!-- Password Input -->
              <div class="mb-5 relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  class="w-full bg-base-100/90 backdrop-blur-sm pl-4 py-2 pr-12 border border-base-300 rounded-xl text-base placeholder:text-base-content/60"
                  bind:value={password}
                  required
                />
                <button
                  type="button"
                  class="absolute right-4 top-3.5 p-0.5 text-base-content/60 hover:text-base-content"
                  onclick={() => (showPassword = !showPassword)}
                >
                  {#if showPassword}
                    <svg
                      class="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L8.464 8.464M9.878 9.878l-1.414-1.414m4.242 4.242l1.414 1.414M14.12 14.12L15.536 15.536M14.12 14.12l1.414 1.414"
                      />
                    </svg>
                  {:else}
                    <svg
                      class="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        stroke-linecap="round"
                        stroke-width="2"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  {/if}
                </button>
              </div>

              <!-- Submit Button -->
              <button
                type="submit"
                class="w-full bg-primary rounded-xl py-3 text-center text-primary-content text-base font-semibold transition-opacity"
                class:opacity-70={loading}
                class:opacity-100={!loading}
                onclick={handleEmailAuth}
                disabled={loading}
              >
                {loading ? "Loading..." : isSignUp ? "Sign Up" : "Log In"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- OR ACCESS WITH - Outside the card -->
      <p
        class="text-center text-base-content/60 mt-6 sm:mt-8 mb-4 sm:mb-6 text-xs font-medium tracking-wider"
      >
        OR ACCESS WITH
      </p>

      <!-- Social Login Buttons -->
      <div class="flex justify-center gap-5 mb-6 lg:mb-0">
        <button
          class="w-14 h-14 rounded-full bg-base-100 flex justify-center items-center shadow-sm border border-base-300 hover:shadow-md transition-shadow"
          onclick={() => alert("Apple Sign-In coming soon!")}
          aria-label="Sign in with Apple"
        >
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
            />
          </svg>
        </button>

        <button
          class="w-14 h-14 rounded-full bg-base-100 flex justify-center items-center shadow-sm border border-base-300 hover:shadow-md transition-shadow"
          onclick={() => alert("Facebook Sign-In coming soon!")}
          aria-label="Sign in with Facebook"
        >
          <svg
            class="w-6 h-6 text-[#1877F2]"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
            />
          </svg>
        </button>

        <button
          class="w-14 h-14 rounded-full bg-base-100 flex justify-center items-center shadow-sm border border-base-300 hover:shadow-md transition-shadow"
          onclick={signInWithGoogle}
          disabled={loading}
          aria-label="Sign in with Google"
        >
          <svg class="w-6 h-6" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC04"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
        </button>
      </div>
    </div>
  </div>
{/if}
