<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  let name = $state("");
  let greetMsg = $state("");

  async function greet(event: Event) {
    event.preventDefault();
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    greetMsg = await invoke("greet", { name });
  }
</script>

<div
  class="min-h-screen bg-base-200 flex flex-col items-center justify-center p-4"
>
  <!-- Hero Section -->
  <div class="hero-content flex flex-col items-center text-center">
    <!-- Greeting Form -->
    <form onsubmit={greet} class="form-control w-full max-w-xs mx-auto">
      <div class="join">
        <input
          id="greet-input"
          type="text"
          placeholder="Your name here..."
          bind:value={name}
          class="input input-bordered join-item flex-1"
          required
        />
        <button type="submit" class="btn btn-primary join-item"> Greet </button>
      </div>
    </form>

    <!-- Greeting Message -->
    {#if greetMsg}
      <div class="alert alert-success mt-6">
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
