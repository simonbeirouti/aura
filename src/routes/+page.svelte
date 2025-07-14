<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { authActions, getStrongholdClient, saveStronghold } from "$lib/stores/auth.js";

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
      console.error('Failed to greet:', error);
    }
  }

  async function logout() {
    isLoading = true;
    try {
      await authActions.logout();
    } catch (error) {
      console.error('Failed to logout:', error);
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
        await store.insert('user_secret', data);
        
        // Save the vault
        await saveStronghold();
        
        secretNote = '';
        retrievedSecret = '';
      }
    } catch (error) {
      console.error('Failed to store secret:', error);
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
        const data = await store.get('user_secret');
        if (data) {
          retrievedSecret = new TextDecoder().decode(new Uint8Array(data));
        } else {
          retrievedSecret = 'No secret found';
        }
      }
    } catch (error) {
      retrievedSecret = 'Failed to retrieve secret';
      console.error('Failed to retrieve secret:', error);
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
        await store.remove('user_secret');
        await saveStronghold();
        retrievedSecret = '';
      }
    } catch (error) {
      console.error('Failed to clear secret:', error);
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="min-h-screen bg-base-200 p-4">
  <!-- Header -->
  <div class="navbar bg-base-100 rounded-box shadow-lg mb-6">
    <div class="flex-1">
      <h1 class="text-xl font-bold">🔐 Aura - Secure App</h1>
    </div>
    <div class="flex-none">
      <button 
        class="btn btn-outline btn-error" 
        onclick={logout}
        disabled={isLoading}
      >
        {#if isLoading}
          <span class="loading loading-spinner loading-sm"></span>
        {:else}
          Logout
        {/if}
      </button>
    </div>
  </div>

  <div class="max-w-4xl mx-auto grid gap-6 md:grid-cols-2">
    <!-- Welcome Section -->
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title text-primary">👋 Welcome!</h2>
        <p class="text-base-content/70 mb-4">
          You're successfully authenticated! This app demonstrates secure authentication using Stronghold.
        </p>
        
        <!-- Greeting Form -->
        <form onsubmit={greet} class="form-control">
          <label class="label" for="name-input">
            <span class="label-text">Test the greeting feature:</span>
          </label>
          <div class="join">
            <input
              id="name-input"
              type="text"
              placeholder="Enter your name..."
              bind:value={name}
              class="input input-bordered join-item flex-1"
              disabled={isLoading}
            />
            <button 
              type="submit" 
              class="btn btn-primary join-item"
              disabled={isLoading || !name.trim()}
            >
              Greet
            </button>
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
            <span>{greetMsg}</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Stronghold Demo Section -->
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title text-secondary">🔒 Secure Storage</h2>
        <p class="text-base-content/70 mb-4">
          Store and retrieve secrets securely using Stronghold encryption.
        </p>

        <!-- Store Secret -->
        <div class="form-control mb-4">
          <label class="label" for="secret-input">
            <span class="label-text">Secret Note:</span>
          </label>
          <div class="join">
            <input
              id="secret-input"
              type="text"
              placeholder="Enter a secret note..."
              bind:value={secretNote}
              class="input input-bordered join-item flex-1"
              disabled={isLoading}
            />
            <button 
              class="btn btn-secondary join-item"
              onclick={storeSecret}
              disabled={isLoading || !secretNote.trim()}
            >
              {#if isLoading}
                <span class="loading loading-spinner loading-sm"></span>
              {:else}
                Store
              {/if}
            </button>
          </div>
        </div>

        <!-- Retrieve/Display Secret -->
        <div class="flex gap-2 mb-4">
          <button 
            class="btn btn-outline btn-secondary flex-1"
            onclick={retrieveSecret}
            disabled={isLoading}
          >
            {#if isLoading}
              <span class="loading loading-spinner loading-sm"></span>
            {:else}
              Retrieve Secret
            {/if}
          </button>
          <button 
            class="btn btn-outline btn-warning"
            onclick={clearSecret}
            disabled={isLoading}
          >
            Clear
          </button>
        </div>

        <!-- Retrieved Secret Display -->
        {#if retrievedSecret}
          <div class="alert" class:alert-info={retrievedSecret !== 'No secret found' && retrievedSecret !== 'Failed to retrieve secret'} class:alert-warning={retrievedSecret === 'No secret found'} class:alert-error={retrievedSecret === 'Failed to retrieve secret'}>
            <span class="font-mono text-sm break-all">{retrievedSecret}</span>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
