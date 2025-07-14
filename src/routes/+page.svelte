<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import {
    authActions,
    getStrongholdClient,
    saveStronghold,
  } from "$lib/stores/auth.js";

  let name = $state("");
  let greetMsg = $state("");
  let secretNote = $state("");
  let retrievedSecret = $state("");
  let isLoading = $state(false);

  async function greet(event: Event) {
    event.preventDefault();
    if (!name.trim()) return;

    try {
      greetMsg = await invoke("greet", { name });
    } catch (error) {
      console.error("Failed to greet:", error);
    }
  }

  async function logout() {
    isLoading = true;
    try {
      await authActions.logout();
    } catch (error) {
      console.error("Failed to logout:", error);
    } finally {
      isLoading = false;
    }
  }

  async function storeSecret() {
    if (!secretNote.trim()) return;

    isLoading = true;
    try {
      const client = await getStrongholdClient();
      if (client) {
        const store = client.getStore();
        const data = Array.from(new TextEncoder().encode(secretNote));
        await store.insert("user_secret", data);

        // Save the vault
        await saveStronghold();

        secretNote = "";
        retrievedSecret = "";
      }
    } catch (error) {
      console.error("Failed to store secret:", error);
    } finally {
      isLoading = false;
    }
  }

  async function retrieveSecret() {
    isLoading = true;
    try {
      const client = await getStrongholdClient();
      if (client) {
        const store = client.getStore();
        const data = await store.get("user_secret");
        if (data) {
          retrievedSecret = new TextDecoder().decode(new Uint8Array(data));
        } else {
          retrievedSecret = "No secret found";
        }
      }
    } catch (error) {
      retrievedSecret = "Failed to retrieve secret";
      console.error("Failed to retrieve secret:", error);
    } finally {
      isLoading = false;
    }
  }

  async function clearSecret() {
    isLoading = true;
    try {
      const client = await getStrongholdClient();
      if (client) {
        const store = client.getStore();
        await store.remove("user_secret");
        await saveStronghold();
        retrievedSecret = "";
      }
    } catch (error) {
      console.error("Failed to clear secret:", error);
    } finally {
      isLoading = false;
    }
  }
</script>

<!-- Mobile-First Layout with Safe Area Support -->
<div class="min-h-screen bg-base-200">
  <!-- Safe area top padding for mobile devices (iPhone notch, etc.) -->
  <div class="pt-safe-top">
    <div class="container-responsive">
      <!-- Header with enhanced mobile styling -->
      <header class="sticky top-0 z-10 mb-4">
        <div
          class="navbar bg-base-100/95 rounded-box shadow-lg safe-area backdrop-blur-sm"
        >
          <div class="flex-1">
            <h1 class="heading-responsive font-bold text-primary">🔐 Aura</h1>
            <div
              class="badge badge-secondary badge-sm ml-2 hidden sm:inline-flex"
            >
              Secure
            </div>
          </div>
          <div class="flex-none">
            <button
              class="btn btn-outline btn-sm btn-error"
              onclick={logout}
              disabled={isLoading}
            >
              {#if isLoading}
                <span class="loading loading-spinner loading-xs"></span>
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 sm:mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span class="hidden sm:inline">Logout</span>
              {/if}
            </button>
          </div>
        </div>
      </header>

      <!-- Main Content with Mobile-First Design -->
      <main class="section-spacing">
        <div class="grid gap-4 md:gap-6 lg:grid-cols-2">
          <!-- Welcome Section -->
          <section class="card bg-base-100 shadow-xl">
            <div class="card-body content-section">
              <h2
                class="card-title text-primary heading-responsive flex items-center gap-2"
              >
                <span class="text-2xl">👋</span>
                <span>Welcome!</span>
              </h2>
              <p class="text-responsive text-base-content/70 mb-6">
                You're successfully authenticated! This app demonstrates secure
                authentication using Stronghold.
              </p>

              <!-- Greeting Form with Mobile Optimization -->
              <form onsubmit={greet} class="space-y-4">
                <div class="form-control">
                  <label class="label" for="name-input">
                    <span class="label-text text-responsive font-medium"
                      >Test the greeting feature:</span
                    >
                  </label>
                  <div class="flex flex-col sm:flex-row gap-3 sm:gap-0">
                    <input
                      id="name-input"
                      type="text"
                      placeholder="Enter your name..."
                      bind:value={name}
                      class="input input-bordered input-mobile-safe flex-1 sm:rounded-r-none touch-target"
                      disabled={isLoading}
                    />
                    <button
                      type="submit"
                      class="btn btn-primary sm:rounded-l-none btn-mobile touch-target"
                      disabled={isLoading || !name.trim()}
                    >
                      {#if isLoading}
                        <span class="loading loading-spinner loading-sm"></span>
                      {:else}
                        <span class="hidden sm:inline">Send Greeting</span>
                        <span class="sm:hidden">Greet</span>
                      {/if}
                    </button>
                  </div>
                </div>
              </form>

              <!-- Greeting Message -->
              {#if greetMsg}
                <div class="alert alert-success mt-4">
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
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span class="text-responsive">{greetMsg}</span>
                </div>
              {/if}
            </div>
          </section>

          <!-- Stronghold Demo Section -->
          <section class="card bg-base-100 shadow-xl">
          <div class="card-body content-section">
            <h2
              class="card-title text-secondary heading-responsive flex items-center gap-2"
            >
              <span class="text-2xl">🔒</span>
              <span>Secure Storage</span>
            </h2>
            <p class="text-responsive text-base-content/70 mb-6">
              Store and retrieve secrets securely using Stronghold encryption.
            </p>

            <!-- Store Secret Form with Mobile Optimization -->
            <div class="space-y-4">
              <div class="form-control">
                <label class="label" for="secret-input">
                  <span class="label-text text-responsive font-medium"
                    >Secret Note:</span
                  >
                </label>
                <div class="flex flex-col sm:flex-row gap-3 sm:gap-0">
                  <input
                    id="secret-input"
                    type="password"
                    placeholder="Enter a secret note..."
                    bind:value={secretNote}
                    class="input input-bordered input-mobile-safe flex-1 sm:rounded-r-none touch-target"
                    disabled={isLoading}
                  />
                  <button
                    class="btn btn-secondary sm:rounded-l-none btn-mobile touch-target"
                    onclick={storeSecret}
                    disabled={isLoading || !secretNote.trim()}
                  >
                    {#if isLoading}
                      <span class="loading loading-spinner loading-sm"></span>
                    {:else}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4 sm:mr-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                      <span class="hidden sm:inline">Store Secret</span>
                      <span class="sm:hidden">Store</span>
                    {/if}
                  </button>
                </div>
              </div>

              <!-- Action Buttons with Mobile-First Layout -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  class="btn btn-outline btn-secondary btn-mobile touch-target"
                  onclick={retrieveSecret}
                  disabled={isLoading}
                >
                  {#if isLoading}
                    <span class="loading loading-spinner loading-sm"></span>
                  {:else}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-4 w-4 mr-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v-2L4.257 10.257a6 6 0 115.486-5.486L17 7"
                      />
                    </svg>
                    Retrieve Secret
                  {/if}
                </button>
                <button
                  class="btn btn-outline btn-warning btn-mobile touch-target"
                  onclick={clearSecret}
                  disabled={isLoading}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  Clear Storage
                </button>
              </div>
            </div>

            <!-- Retrieved Secret Display with Mobile Optimization -->
            {#if retrievedSecret}
              <div class="mt-4">
                <div
                  class="alert"
                  class:alert-info={retrievedSecret !== "No secret found" &&
                    retrievedSecret !== "Failed to retrieve secret"}
                  class:alert-warning={retrievedSecret === "No secret found"}
                  class:alert-error={retrievedSecret ===
                    "Failed to retrieve secret"}
                >
                  <div class="flex items-start gap-2">
                    {#if retrievedSecret !== "No secret found" && retrievedSecret !== "Failed to retrieve secret"}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    {:else if retrievedSecret === "No secret found"}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                        />
                      </svg>
                    {:else}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 flex-shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    {/if}
                    <span class="font-mono text-responsive break-all flex-1"
                      >{retrievedSecret}</span
                    >
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </section>
        </div>
      </main>
    </div>
  </div>
</div>
