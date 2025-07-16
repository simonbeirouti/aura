<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { toast } from "../lib/stores/toast.js";

  let name = $state("");

  async function greet(event: Event) {
    event.preventDefault();
    try {
      const greetMsg = (await invoke("greet", { name })) as string;
      toast.success(greetMsg);
      name = "";
    } catch (error) {
      toast.error(`Failed to greet: ${error}`);
    }
  }
</script>

<div class="flex flex-col items-center text-center space-y-6">
  <form onsubmit={greet} class="form-control w-full">
    <div class="join w-full">
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
</div>
