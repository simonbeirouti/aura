<script>
  import "../app.css";
  import Toast from "../lib/components/Toast.svelte";
</script>

<div class="app-root bg-base-100 text-base-content">
  <div class="content-container">
    <slot />
  </div>
</div>

<Toast />
