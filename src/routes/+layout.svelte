<script>
  import "../app.css";
  import AuthGuard from "$lib/components/AuthGuard.svelte";
</script>

<AuthGuard>
  <slot />
</AuthGuard>
