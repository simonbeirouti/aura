<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { invoke } from '@tauri-apps/api/core';
    import AppLayout from '$lib/components/AppLayout.svelte';
    import { authStore } from '$lib/stores/supabaseAuth';
    import { cacheManager } from '$lib/stores/cacheManager';
    import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
    import { Button } from '$lib/components/ui/button';
    import { toast } from 'svelte-sonner';
    import * as Drawer from '$lib/components/ui/drawer';
  
    interface ProductPrice {
      id: string;
      amount: number;
      currency: string;
      interval: string;
      interval_count: number;
    }
  
    interface ProductWithPrices {
      id: string;
      name: string;
      description: string;
      prices: ProductPrice[];
    }
  
    let product: ProductWithPrices | null = null;
    let loading = true;
    let error: string | null = null;
    let purchasingPriceId: string | null = null;
    let selectedPrice: ProductPrice | null = null;
    let showDrawer = false;
  
    // Environment variables for Stripe configuration
    const STRIPE_PACKAGE_PRODUCT_ID = import.meta.env.VITE_STRIPE_PACKAGE_PRODUCT_ID;
  
    onMount(async () => {
      await loadPackageProduct();
    });
  
    function goBack() {
      goto('/');
    }
  
    function openPurchaseDrawer(price: ProductPrice) {
      selectedPrice = price;
      showDrawer = true;
    }
  
    function closePurchaseDrawer() {
      selectedPrice = null;
      showDrawer = false;
      purchasingPriceId = null;
    }
  
    async function loadPackageProduct() {
      try {
        loading = true;
        error = null;
        
        if (!STRIPE_PACKAGE_PRODUCT_ID) {
          throw new Error('VITE_STRIPE_PACKAGE_PRODUCT_ID not configured. Please check your environment variables.');
        }
        
        // Use proper cache manager with Tauri store backend
        const cacheKey = `stripe_package_product_${STRIPE_PACKAGE_PRODUCT_ID}`;
        
        // Check cache first (uses Tauri store)
        if (cacheManager.has(cacheKey)) {
          const cachedData = cacheManager.get<ProductWithPrices>(cacheKey);
          if (cachedData) {
            product = cachedData;
            return;
          }
        }
        
        // Load from API if not cached or expired
        product = await invoke<ProductWithPrices>('get_product_with_prices', {
          productId: STRIPE_PACKAGE_PRODUCT_ID
        });
        
        // Cache the results using Tauri store (10 minute TTL)
        cacheManager.set(cacheKey, product, 10 * 60 * 1000);
        
      } catch (err) {
        console.error('Failed to load package product:', err);
        error = err instanceof Error ? err.message : 'Failed to load packages';
      } finally {
        loading = false;
      }
    }
  
    async function purchasePackage() {
      if (!selectedPrice) return;
      
      if (!$authStore.user?.id) {
        error = 'Please log in to make a purchase';
        toast.error('Please log in to make a purchase');
        return;
      }
  
      try {
        purchasingPriceId = selectedPrice.id;
        error = null;
  
        // Create payment intent for one-time purchase
        const paymentIntent = await invoke('create_payment_intent', {
          amount: selectedPrice.amount,
          currency: selectedPrice.currency,
          customerId: $authStore.user.id
        });
  
        toast.success('Payment intent created! Integration with Stripe Elements needed.');
        
        // Close drawer after successful payment intent creation
        closePurchaseDrawer();
        
        // TODO: Integrate with Stripe Elements for payment completion
        // TODO: Store purchase record in database after successful payment
        
      } catch (err) {
        console.error('Purchase failed:', err);
        const errorMessage = err instanceof Error ? err.message : 'Purchase failed';
        error = errorMessage;
        toast.error(`❌ Purchase failed: ${errorMessage}`);
      } finally {
        purchasingPriceId = null;
      }
    }
  
    function formatPrice(amount: number, currency: string): string {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format(amount / 100);
    }
  
    function getPriceDescription(price: ProductPrice): string {
      if (price.interval === 'one_time' || !price.interval) {
        return 'One-time purchase';
      }
      if (price.interval === 'month') {
        return 'Monthly';
      }
      if (price.interval === 'year') {
        return 'Yearly';
      }
      return `Per ${price.interval}`;
    }
  </script>
  
  <AppLayout title="Packages" showBackButton={true} onBack={goBack} maxWidth="max-w-4xl">
    {#if loading}
      <div class="flex justify-center items-center py-12">
        <div class="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    {:else if error}
      <Card class="mb-6 border-destructive">
        <CardContent>
          <div class="flex items-center gap-3 text-destructive">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span>{error}</span>
          </div>
          <div class="mt-4">
            <Button onclick={() => loadPackageProduct()} variant="outline">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    {:else if product}
      <div>
  
        {#if product.prices && product.prices.length > 0}
          <div class="grid grid-cols-2 gap-4 w-full">
            {#each product.prices as price (price.id)}
              <Card 
                class="relative cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200"
                onclick={() => openPurchaseDrawer(price)}
              >
                <CardHeader class="text-center py-3">
                  <CardTitle class="text-lg font-bold text-primary">
                    {formatPrice(price.amount, price.currency)}
                  </CardTitle>
                  <!-- <p class="text-xs text-muted-foreground mt-1">
                    {getPriceDescription(price)}
                  </p> -->
                </CardHeader>
              </Card>
            {/each}
          </div>
        {:else}
          <Card>
            <CardContent class="text-center py-12">
              <div class="text-muted-foreground mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 class="text-lg font-medium mb-2">No packages available</h3>
              <p class="text-muted-foreground">There are no packages configured for this product.</p>
            </CardContent>
          </Card>
        {/if}
      </div>
    {:else}
      <Card>
        <CardContent class="text-center py-12">
          <div class="text-muted-foreground mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h3 class="text-lg font-medium mb-2">Product not found</h3>
          <p class="text-muted-foreground">The package product could not be loaded.</p>
        </CardContent>
      </Card>
    {/if}
  </AppLayout>
  
  <!-- Purchase Drawer -->
  <Drawer.Root bind:open={showDrawer}>
    <Drawer.Content>
      {#if selectedPrice}
        <div class="px-4 pt-4">
          <div class="text-center mb-6">
            <div class="text-4xl font-bold text-primary mb-2">
              {formatPrice(selectedPrice.amount, selectedPrice.currency)}
            </div>
            <p class="text-sm text-muted-foreground">
              {getPriceDescription(selectedPrice)}
            </p>
          </div>
          
          {#if error}
            <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <div class="flex items-center">
                <svg class="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span class="text-sm text-red-800">{error}</span>
              </div>
            </div>
          {/if}
        </div>
        
        <Drawer.Footer>
          <Button 
            class="flex-1"
            onclick={purchasePackage}
            disabled={purchasingPriceId !== null}
          >
            {#if purchasingPriceId === selectedPrice.id}
              <div class="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2"></div>
              Processing...
            {:else}
              Purchase Now
            {/if}
          </Button>
          <Button 
            variant="outline" 
            class="flex-1"
            onclick={closePurchaseDrawer}
            disabled={purchasingPriceId !== null}
          >
            Cancel
          </Button>
        </Drawer.Footer>
      {/if}
    </Drawer.Content>
  </Drawer.Root>
  