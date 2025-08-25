<script lang="ts">
  import { onMount } from 'svelte';
  import { iapStore, iapProductIds, allProductIds, type Product, type Purchase } from '$lib/stores/iapStore';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';

  // Subscribe to store state for JSON output
  $: state = $iapStore;
  $: jsonOutput = JSON.stringify({
    iapState: {
      ...state,
      // Show only last 5 logs for readability
      logs: state.logs.slice(-5)
    },
    productIds: iapProductIds,
    allProductIds: allProductIds,
    timestamp: new Date().toISOString()
  }, null, 2);
  
  // Helper to get product display info
  function getProductInfo(productId: string) {
    const storeProduct = state.products.find(p => p.productId === productId);
    if (storeProduct) {
      return {
        title: storeProduct.title,
        price: storeProduct.formattedPrice,
        currency: storeProduct.priceCurrencyCode
      };
    }
    
    // Fallback to hardcoded info if product not loaded
    const tokenPkg = tokenPackages.find(t => t.id === productId);
    const sub = subscriptions.find(s => s.id === productId);
    return {
      title: tokenPkg?.tokens || sub?.name || productId,
      price: tokenPkg?.price || sub?.price || 'Unknown',
      currency: 'USD'
    };
  }

  // Token packages for UI display
  const tokenPackages = [
    { id: 'tokens_100', tokens: '100', price: '$1.49', emoji: '🪙' },
    { id: 'tokens_500', tokens: '500', price: '$7.49', emoji: '💰' },
    { id: 'tokens_1000', tokens: '1,000', price: '$14.99', emoji: '💎' },
    { id: 'tokens_5000', tokens: '5,000', price: '$30.99', emoji: '🏆' },
    { id: 'tokens_25000', tokens: '25,000', price: '$62.99', emoji: '👑' },
    { id: 'tokens_100000', tokens: '100,000', price: '$159.99', emoji: '🌟' }
  ];

  const subscriptions = [
    { id: 'monthly_subscription', name: 'Monthly Premium', price: '$10.00', period: '/month', emoji: '📅' },
    { id: 'yearly_subscription', name: 'Yearly Premium', price: '$100.00', period: '/year', emoji: '🗓️' }
  ];

  async function handlePurchase(productId: string, productType: 'inapp' | 'subs' = 'inapp') {
    try {
      await iapStore.purchaseProduct(productId, productType);
    } catch (error) {
      console.error('Purchase failed:', error);
    }
  }

  async function handleRestore() {
    try {
      await iapStore.restorePurchases();
    } catch (error) {
      console.error('Restore failed:', error);
    }
  }

  async function handleRefresh() {
    try {
      iapStore.addLog('🔄 Refreshing product information...');
      
      // Query all product types
      await iapStore.queryProducts(iapProductIds.consumables, 'inapp');
      if (iapProductIds.nonConsumables.length > 0) {
        await iapStore.queryProducts(iapProductIds.nonConsumables, 'inapp');
      }
      await iapStore.queryProducts(iapProductIds.subscriptions, 'subs');
      
      iapStore.addLog('✅ Product refresh complete');
    } catch (error) {
      console.error('Refresh failed:', error);
      iapStore.addLog(`❌ Refresh failed: ${error}`);
    }
  }

  onMount(() => {
    // Auto-initialize and test all IAP functions
    (async () => {
      iapStore.addLog('🚀 Starting IAP initialization...');
      
      const initialized = await iapStore.initialize();
      
      if (initialized) {
        // Setup purchase update listener for real-time events
        iapStore.setupPurchaseListener();
        
        // Query products after successful initialization
        await handleRefresh();
        
        // Restore previous purchases
        await iapStore.restorePurchases('inapp');
        await iapStore.restorePurchases('subs');
        
        iapStore.addLog('✅ IAP initialization complete');
      } else {
        iapStore.addLog('❌ IAP initialization failed - check logs for details');
      }
    })();
    
    // Cleanup listener on component destroy
    return () => {
      iapStore.cleanupPurchaseListener();
    };
  });
</script>

<div class="w-full max-w-6xl mx-auto p-4 space-y-6">
  <div class="text-center">
    <h2 class="text-2xl font-bold mb-2">IAP Testing Interface</h2>
    <p class="text-muted-foreground">Test token purchases and subscriptions with StoreKit Configuration</p>
  </div>

  <!-- Control Buttons -->
  <div class="flex flex-wrap gap-2 justify-center">
    <Button onclick={handleRefresh} variant="outline">
      🔄 Refresh Products
    </Button>
    <Button onclick={handleRestore} variant="outline">
      📦 Restore Purchases
    </Button>
    <Button onclick={() => iapStore.clearLogs()} variant="outline">
      🗑️ Clear Logs
    </Button>
  </div>

  <!-- Status Cards -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-sm">IAP Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-1 text-sm">
          <div class="flex justify-between">
            <span>Plugin:</span>
            <span class={state.pluginAvailable ? 'text-green-600' : 'text-red-600'}>
              {state.pluginAvailable ? '✅' : '❌'}
            </span>
          </div>
          <div class="flex justify-between">
            <span>Initialized:</span>
            <span class={state.isInitialized ? 'text-green-600' : 'text-red-600'}>
              {state.isInitialized ? '✅' : '❌'}
            </span>
          </div>
          <div class="flex justify-between">
            <span>Can Pay:</span>
            <span class={state.canMakePayments ? 'text-green-600' : 'text-red-600'}>
              {state.canMakePayments ? '✅' : '❌'}
            </span>
          </div>
          <div class="flex justify-between">
            <span>Loading:</span>
            <span class={state.isLoading ? 'text-yellow-600' : 'text-gray-600'}>
              {state.isLoading ? '⏳' : '✅'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-sm">Products</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="text-sm">
          <div class="flex justify-between">
            <span>Available:</span>
            <span class="font-mono">{state.products.length}</span>
          </div>
          <div class="flex justify-between">
            <span>Queried:</span>
            <span class="font-mono">{allProductIds.length}</span>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="text-sm">Purchases</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="text-sm">
          <div class="flex justify-between">
            <span>Purchases:</span>
            <span class="font-mono">{state.purchases.length}</span>
          </div>
          <div class="flex justify-between">
            <span>Transactions:</span>
            <span class="font-mono">{state.transactions.length}</span>
          </div>
          <div class="flex justify-between">
            <span>Recent:</span>
            <span class="font-mono">{state.transactions.slice(-3).length}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>

  <!-- Token Packages -->
  <div>
    <h3 class="text-lg font-semibold mb-3">Token Packages</h3>
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {#each tokenPackages as pkg}
        {@const productInfo = getProductInfo(pkg.id)}
        <Card class="text-center">
          <CardContent class="p-4">
            <div class="text-2xl mb-2">{pkg.emoji}</div>
            <div class="font-semibold text-sm">{productInfo.title} Tokens</div>
            <div class="text-xs text-muted-foreground mb-1">{productInfo.price}</div>
            <div class="text-xs text-gray-500 mb-3">{productInfo.currency}</div>
            <Button 
              size="sm" 
              class="w-full text-xs"
              onclick={() => handlePurchase(pkg.id, 'inapp')}
              disabled={state.isLoading || !state.pluginAvailable}
            >
              {state.pluginAvailable ? 'Purchase' : 'Unavailable'}
            </Button>
          </CardContent>
        </Card>
      {/each}
    </div>
  </div>

  <!-- Subscriptions -->
  <div>
    <h3 class="text-lg font-semibold mb-3">Subscriptions</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each subscriptions as sub}
        {@const productInfo = getProductInfo(sub.id)}
        <Card>
          <CardContent class="p-4 text-center">
            <div class="text-3xl mb-2">{sub.emoji}</div>
            <div class="font-semibold">{productInfo.title}</div>
            <div class="text-sm text-muted-foreground mb-1">
              {productInfo.price}<span class="text-xs">{sub.period}</span>
            </div>
            <div class="text-xs text-gray-500 mb-3">{productInfo.currency}</div>
            <Button 
              class="w-full"
              onclick={() => handlePurchase(sub.id, 'subs')}
              disabled={state.isLoading || !state.pluginAvailable}
            >
              {state.pluginAvailable ? 'Subscribe' : 'Unavailable'}
            </Button>
          </CardContent>
        </Card>
      {/each}
    </div>
  </div>

  <!-- Error Display -->
  {#if state.error}
    <Card class="border-red-200 bg-red-50">
      <CardHeader class="pb-2">
        <CardTitle class="text-sm text-red-800">Error</CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-sm text-red-700">{state.error}</p>
        <Button 
          size="sm" 
          variant="outline" 
          class="mt-2"
          onclick={() => iapStore.clearError()}
        >
          Clear Error
        </Button>
      </CardContent>
    </Card>
  {/if}

  <!-- Recent Purchases -->
  {#if state.purchases.length > 0}
    <Card>
      <CardHeader>
        <CardTitle class="text-sm">Recent Purchases</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-2">
          {#each state.purchases.slice(-5) as purchase}
            <div class="bg-gray-50 p-3 rounded-lg">
              <div class="flex justify-between items-start">
                <div>
                  <div class="font-semibold text-sm">{purchase.productId}</div>
                  <div class="text-xs text-gray-600">Order: {purchase.orderId}</div>
                  <div class="text-xs text-gray-600">
                    {new Date(purchase.purchaseTime).toLocaleString()}
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-xs px-2 py-1 rounded {purchase.purchaseState === 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                    {purchase.purchaseState === 0 ? 'Purchased' : 'Failed'}
                  </div>
                  {#if purchase.isAutoRenewing}
                    <div class="text-xs text-blue-600 mt-1">Auto-renewing</div>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </CardContent>
    </Card>
  {/if}

  <!-- Debug JSON Output -->
  <Card>
    <CardHeader>
      <CardTitle class="text-sm">Debug JSON Output</CardTitle>
    </CardHeader>
    <CardContent>
      <pre class="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto text-xs font-mono whitespace-pre-wrap max-h-96">{jsonOutput}</pre>
    </CardContent>
  </Card>

  <!-- Logs -->
  {#if state.logs.length > 0}
    <Card>
      <CardHeader>
        <CardTitle class="text-sm">Activity Logs</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="bg-gray-900 text-gray-300 p-4 rounded-lg max-h-64 overflow-auto">
          {#each state.logs.slice(-20) as log}
            <div class="text-xs font-mono mb-1">{log}</div>
          {/each}
        </div>
      </CardContent>
    </Card>
  {/if}
</div>
