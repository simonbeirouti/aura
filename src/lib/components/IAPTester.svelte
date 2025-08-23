<script lang="ts">
  import { onMount } from 'svelte';
  import { iapStore, iapProductIds } from '$lib/stores/iapStore';

  // Subscribe to store state for JSON output
  $: state = $iapStore;
  $: jsonOutput = JSON.stringify({
    iapState: state,
    productIds: iapProductIds,
    timestamp: new Date().toISOString()
  }, null, 2);

  onMount(async () => {
    // Auto-initialize and test all IAP functions
    await iapStore.initialize();
    await iapStore.queryProducts(iapProductIds);
    await iapStore.restorePurchases();
  });
</script>

<div class="w-full max-w-4xl mx-auto p-4">
  <h2 class="text-xl font-bold mb-4">IAP Debug JSON Output</h2>
  <pre class="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto text-sm font-mono whitespace-pre-wrap">{jsonOutput}</pre>
</div>
