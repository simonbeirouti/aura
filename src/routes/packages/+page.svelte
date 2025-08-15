<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { goto } from "$app/navigation";
  import { invoke } from "@tauri-apps/api/core";
  import AppLayout from "$lib/components/AppLayout.svelte";
  import { centralizedAuth } from "$lib/stores/unifiedAuth";
  import { stripeStore } from "$lib/stores/stripeStore";
  import { cacheManager, cacheKeys } from "$lib/stores/cacheManager";
  import { settingsActions } from "$lib/stores/settingsStore";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "svelte-sonner";
  import * as Drawer from "$lib/components/ui/drawer";

  interface PackagePrice {
    id: string;
    package_id: string;
    stripe_price_id: string;
    amount_cents: number;
    currency: string;
    interval_type: string;
    interval_count: number;
    token_amount: number;
    is_active: boolean;
  }

  interface Package {
    id: string;
    name: string;
    description: string;
    stripe_product_id: string;
    features: any;
    is_active: boolean;
    sort_order: number;
  }

  interface PackageWithPrices {
    package: Package;
    prices: PackagePrice[];
  }

  let packagesData: PackageWithPrices[] = [];
  let loading = true;
  let error: string | null = null;
  let purchasingPriceId: string | null = null;
  let selectedPrice: PackagePrice | null = null;
  let showDrawer = false;

  onMount(async () => {
    await loadPackages();
  });

  function goBack() {
    goto("/");
  }

  function openPurchaseDrawer(price: PackagePrice) {
    selectedPrice = price;
    showDrawer = true;
  }

  function closePurchaseDrawer() {
    selectedPrice = null;
    showDrawer = false;
    purchasingPriceId = null;
  }

  async function loadPackages() {
    try {
      loading = true;
      error = null;

      // Use proper cache manager with Tauri store backend
      const cacheKey = cacheKeys.packages();

      // Check cache first (uses Tauri store)
      if (cacheManager.has(cacheKey)) {
        const cachedData = cacheManager.get<PackageWithPrices[]>(cacheKey);
        if (cachedData) {
          packagesData = cachedData;
          return;
        }
      }

      // Load from database if not cached or expired
      packagesData = await invoke<PackageWithPrices[]>(
        "get_packages_with_prices",
      );

      // Cache the results using Tauri store (10 minute TTL)
      cacheManager.set(cacheKey, packagesData, 10 * 60 * 1000);
    } catch (err) {
      console.error("Failed to load packages:", err);
      error = err instanceof Error ? err.message : "Failed to load packages";
    } finally {
      loading = false;
    }
  }

  async function purchasePackage() {
    if (!selectedPrice) return;

    const authState = await centralizedAuth.getState();
    if (!authState.isAuthenticated || !authState.user?.id) {
      error = "Please log in to make a purchase";
      toast.error("Please log in to make a purchase");
      return;
    }

    try {
      purchasingPriceId = selectedPrice.stripe_price_id;
      error = null;

      // Get the Stripe customer ID from the stripe store
      const stripeState = get(stripeStore);
      const stripeCustomerId = stripeState?.currentCustomerId;

      if (!stripeCustomerId) {
        error = "Stripe customer not found. Please try refreshing the page.";
        toast.error(
          "❌ Stripe customer not found. Please try refreshing the page.",
        );
        return;
      }

      // Create payment intent for one-time purchase
      const paymentIntent = await invoke<{
        client_secret: string;
        payment_intent_id: string;
      }>("create_payment_intent", {
        amount: selectedPrice.amount_cents,
        currency: selectedPrice.currency,
        customer_id: stripeCustomerId,
      });

      // For now, simulate successful payment and record purchase
      // In a real app, this would happen after Stripe Elements confirms the payment
      try {
        const purchaseData = {
          userId: authState.user.id,
          stripePaymentIntentId: paymentIntent.payment_intent_id,
          stripePriceId: selectedPrice.stripe_price_id,
          amountPaid: selectedPrice.amount_cents,
          currency: selectedPrice.currency,
        };

        const recordResult = await invoke("record_purchase", purchaseData);

        toast.success("🎉 Purchase completed successfully!");

        // Close drawer after successful purchase
        closePurchaseDrawer();

        // Handle purchase completion - refresh profile and token balance
        await Promise.allSettled([
          centralizedAuth.refreshProfile(),
          settingsActions.handlePurchaseCompletion()
        ]);
      } catch (recordError) {
        console.error("❌ Failed to record purchase:", recordError);
        toast.error(
          "Payment created but failed to record. Please contact support.",
        );
      }
    } catch (err) {
      console.error("Purchase failed:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Purchase failed";
      error = errorMessage;
      toast.error(`❌ Purchase failed: ${errorMessage}`);
    } finally {
      purchasingPriceId = null;
    }
  }

     function formatPrice(amount_cents: number, currency: string): string {
     const amount = (amount_cents / 100).toFixed(2);
     return `$${amount}`;
   }

  function getPriceDescription(price: PackagePrice): string {
    if (price.interval_type === "one_time" || !price.interval_type) {
      return `${price.token_amount.toLocaleString()} tokens`;
    }
    if (price.interval_type === "month") {
      return "Monthly";
    }
    if (price.interval_type === "year") {
      return "Yearly";
    }
    return `Per ${price.interval_type}`;
  }
</script>

<AppLayout
  title="Packages"
  showBackButton={true}
  onBack={goBack}
  maxWidth="max-w-4xl"
>
  {#if loading}
    <div class="flex justify-center items-center py-12">
      <div
        class="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"
      ></div>
    </div>
  {:else if error}
    <Card class="mb-6 border-destructive">
      <CardContent>
        <div class="flex items-center gap-3 text-destructive">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
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
          <span>{error}</span>
        </div>
        <div class="mt-4">
          <Button onclick={() => loadPackages()} variant="outline">
            Try Again
          </Button>
        </div>
      </CardContent>
    </Card>
  {:else if packagesData.length > 0}
    <div>
      {#each packagesData as packageData}
        {#if packageData.prices && packageData.prices.length > 0}
          <div class="mb-8">
            <div class="grid grid-cols-2 gap-4 w-full">
              {#each packageData.prices as price (price.id)}
                <Card
                  class="relative cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200"
                  onclick={() => openPurchaseDrawer(price)}
                >
                  <CardHeader class="text-center py-3">
                    <CardTitle class="text-lg font-bold text-primary">
                      {formatPrice(price.amount_cents, price.currency)}
                    </CardTitle>
                    <p class="text-xs text-muted-foreground mt-1">
                      {getPriceDescription(price)}
                    </p>
                  </CardHeader>
                </Card>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {:else}
    <Card>
      <CardContent class="text-center py-12">
        <div class="text-muted-foreground mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-16 w-16 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        </div>
        <h3 class="text-lg font-medium mb-2">Product not found</h3>
        <p class="text-muted-foreground">
          The package product could not be loaded.
        </p>
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
            {formatPrice(selectedPrice.amount_cents, selectedPrice.currency)}
          </div>
          <p class="text-sm text-muted-foreground">
            {getPriceDescription(selectedPrice)}
          </p>
        </div>

        {#if error}
          <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <div class="flex items-center">
              <svg
                class="w-5 h-5 text-red-400 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
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
          {#if purchasingPriceId === selectedPrice.stripe_price_id}
            <div
              class="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2"
            ></div>
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
