<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import AppLayout from "../../../lib/components/AppLayout.svelte";
    import { authStore } from "$lib/stores/supabaseAuth";
    import { settingsActions, subscriptionStore, paymentMethodsStore, profileStore } from '$lib/stores/settingsStore';
    import { cacheManager } from '$lib/stores/cacheManager';
    import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
    import { Button } from "$lib/components/ui/button";
    import { Badge } from "$lib/components/ui/badge";
    import { 
        CreditCardIcon, 
        CalendarIcon, 
        CheckCircleIcon, 
        XCircleIcon,
        AlertCircleIcon,
        CrownIcon
    } from "lucide-svelte";
    import { invoke } from '@tauri-apps/api/core';
    import { toast } from "svelte-sonner";

    let loading = true;
    let error: string | null = null;
    let creatingSubscription = false;
    let cancellingSubscription = false;
    let showCancelConfirm = false;

    // Environment variables for Stripe configuration
    const STRIPE_PRODUCT_ID = import.meta.env.VITE_STRIPE_PRODUCT_ID;

    // Dynamic pricing plans - loaded from Stripe
    let pricingPlans: any[] = [];
    let productInfo: any = null;

    // Reactive subscriptions to cached data
    $: subscriptionData = $subscriptionStore.subscriptionData;
    $: paymentMethods = $paymentMethodsStore.paymentMethods;
    $: hasPaymentMethod = paymentMethods.length > 0;
    $: currentProfile = $profileStore.profile;
    
    // Check if subscription period has expired
    $: subscriptionExpired = subscriptionData?.current_period_end ? 
        (Date.now() / 1000) >= subscriptionData.current_period_end : false;
    
    // Determine if we should show subscription plans
    $: shouldShowPlans = !subscriptionData || 
        !currentProfile?.subscription_status || 
        (subscriptionData.status === 'canceled' && subscriptionExpired);

    onMount(async () => {
        loading = true;
        error = null;

        try {
            // Load product data (cached if available)
            await loadProductData();
            
            // Initialize settings data (each function uses cache if available)
            await settingsActions.initialize();

        } catch (err) {
            console.error('Failed to load subscription data:', err);
            error = err instanceof Error ? err.message : 'Failed to load subscription data';
        } finally {
            loading = false;
        }
    });

    async function loadProductData() {
        try {
            if (!STRIPE_PRODUCT_ID) {
                throw new Error('STRIPE_PRODUCT_ID not configured. Please check your environment variables.');
            }
            
            // Use proper cache manager with Tauri store backend
            const cacheKey = `stripe_product_${STRIPE_PRODUCT_ID}`;
            
            // Check cache first (uses Tauri store)
            if (cacheManager.has(cacheKey)) {
                const cachedData = cacheManager.get<{productInfo: any, pricingPlans: any[]}>(cacheKey);
                if (cachedData) {
                    productInfo = cachedData.productInfo;
                    pricingPlans = cachedData.pricingPlans;
                    return;
                }
            }
            
            // Load from API if not cached or expired
            productInfo = await invoke('get_product_with_prices', {
                productId: STRIPE_PRODUCT_ID
            });

            // Transform Stripe prices into our pricing plans format
            pricingPlans = productInfo.prices.map((price: any) => {
                const isYearly = price.interval === 'year';
                const monthlyAmount = isYearly ? price.amount / 12 : price.amount;
                const savings = isYearly ? Math.round((1 - (price.amount / 12) / (productInfo.prices.find((p: any) => p.interval === 'month')?.amount || price.amount)) * 100) : 0;
                
                return {
                    id: price.interval,
                    name: price.interval === 'month' ? 'Monthly' : 'Yearly',
                    price: `$${(price.amount / 100).toFixed(2)}`,
                    interval: price.interval,
                    priceId: price.id,
                    popular: price.interval === 'year',
                    savings: savings > 0 ? `Save ${savings}%` : undefined,
                    features: [
                        'Full access to all features',
                        'Priority support',
                        'Regular updates'
                    ]
                };
            });
            
            // Cache the results using Tauri store (10 minute TTL)
            cacheManager.set(cacheKey, { productInfo, pricingPlans }, 10 * 60 * 1000);

        } catch (err) {
            console.error('Failed to load product data:', err);
            error = err instanceof Error ? err.message : 'Failed to load product data';
        }
    }

    async function createSubscription(priceId: string) {
        if (!hasPaymentMethod) {
            error = 'No payment method found. Please add a payment method first.';
            return;
        }

        creatingSubscription = true;
        error = null;

        try {
            const userId = $authStore.user?.id;
            if (!userId) {
                throw new Error('User not authenticated');
            }

            const result = await invoke('create_subscription', {
                userId,
                priceId
            });

            toast.success('✅ Subscription created successfully!');
            
            // Refresh subscription data
            await settingsActions.loadSubscription(true);
            await settingsActions.loadProfile(true);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to create subscription';
            error = errorMessage;
            toast.error(`❌ Subscription failed: ${errorMessage}`);
        } finally {
            creatingSubscription = false;
        }
    }

    function initiateCancelSubscription() {
        showCancelConfirm = true;
    }

    function cancelCancelSubscription() {
        showCancelConfirm = false;
    }

    async function confirmCancelSubscription() {
        if (!subscriptionData?.subscription_id) return;

        cancellingSubscription = true;
        
        try {
            const userId = $authStore.user?.id;
            if (!userId) {
                throw new Error('User not authenticated');
            }
            
            await invoke('cancel_subscription', {
                subscriptionId: subscriptionData.subscription_id,
                userId: userId
            });
            
            toast.success('✅ Subscription cancelled successfully. You will continue to have access until your current billing period ends.');
            
            // Reset state
            showCancelConfirm = false;
            
            // Refresh data
            await settingsActions.loadSubscription(true);
            await settingsActions.loadProfile(true);
            
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to cancel subscription';
            error = errorMessage;
            toast.error(`❌ Cancellation failed: ${errorMessage}`);
        } finally {
            cancellingSubscription = false;
        }
    }

    function goBack() {
        goto('/settings');
    }
</script>

<AppLayout title="Subscription" showBackButton={true} onBack={goBack} maxWidth="max-w-4xl">
    {#if loading}
        <div class="flex justify-center items-center py-12">
            <div class="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
    {:else}
        {#if error}
            <Card class="mb-6 border-destructive">
                <CardContent>
                    <div class="flex items-center gap-3 text-destructive">
                        <AlertCircleIcon class="w-5 h-5" />
                        <p>{error}</p>
                    </div>
                </CardContent>
            </Card>
        {/if}

        {#if subscriptionData && currentProfile?.subscription_status && !shouldShowPlans}
            <!-- Current Subscription Status -->
            <Card class="mb-8">
                <CardContent>
                    <div class="space-y-4">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <CrownIcon class="w-6 h-6 text-primary" />
                                <h3 class="text-lg font-semibold">Current Subscription</h3>
                                <Badge variant={subscriptionData.status === 'active' ? 'default' : 'secondary'}>
                                    {subscriptionData.status}
                                </Badge>
                            </div>
                        </div>

                        {#if subscriptionData.current_period_end}
                            <div class="flex items-center gap-2 text-sm text-muted-foreground pb-4">
                                <CalendarIcon class="w-4 h-4" />
                                <span>
                                    {subscriptionData.status === 'active' ? 'Renews' : 'Expires'} on 
                                    {new Date(subscriptionData.current_period_end * 1000).toLocaleDateString()}
                                </span>
                            </div>
                        {/if}
                    </div>

                    {#if subscriptionData.status === 'canceled'}
                        <div class="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                            <div class="flex items-center gap-2 text-orange-700 mb-2">
                                <AlertCircleIcon class="w-4 h-4" />
                                <span class="font-medium">Subscription Cancelled</span>
                            </div>
                            <p class="text-sm text-orange-600">
                                Your subscription has been cancelled but you still have access until 
                                {subscriptionData.current_period_end ? new Date(subscriptionData.current_period_end * 1000).toLocaleDateString() : 'the end of your billing period'}.
                                You can resubscribe anytime after this date.
                            </p>
                        </div>
                    {:else if subscriptionData.status === 'active'}
                        {#if showCancelConfirm}
                            <div class="space-y-3">
                                <div class="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                                    <div class="flex items-center gap-2 text-destructive mb-2">
                                        <AlertCircleIcon class="w-4 h-4" />
                                        <span class="font-medium">Confirm Cancellation</span>
                                    </div>
                                    <p class="text-sm text-muted-foreground">
                                        Your subscription will be cancelled and you'll continue to have access until 
                                        {subscriptionData.current_period_end ? new Date(subscriptionData.current_period_end * 1000).toLocaleDateString() : 'the end of your billing period'}.
                                    </p>
                                </div>
                                <div class="flex gap-3">
                                    <Button 
                                        variant="outline" 
                                        class="flex-1" 
                                        onclick={cancelCancelSubscription}
                                        disabled={cancellingSubscription}
                                    >
                                        Keep Subscription
                                    </Button>
                                    <Button 
                                        variant="destructive" 
                                        class="flex-1" 
                                        onclick={confirmCancelSubscription}
                                        disabled={cancellingSubscription}
                                    >
                                        {cancellingSubscription ? 'Cancelling...' : 'Confirm Cancel'}
                                    </Button>
                                </div>
                            </div>
                        {:else}
                            <Button variant="destructive" class="w-full" onclick={initiateCancelSubscription}>
                                Cancel Subscription
                            </Button>
                        {/if}
                    {/if}
                </CardContent>
            </Card>

            {#if subscriptionData.status === 'active'}
                {@const currentPlan = pricingPlans.find(plan => 
                    subscriptionData.price_id && plan.priceId === subscriptionData.price_id
                )}
                {#if currentPlan && currentPlan.interval === 'month'}
                    <!-- Upgrade to Yearly -->
                    {@const yearlyPlan = pricingPlans.find(plan => plan.interval === 'year')}
                    {#if yearlyPlan}
                        <Card class="mb-8 border-primary/20">
                            <CardContent>
                                <div class="flex items-center justify-between">
                                    <div>
                                        <h3 class="text-lg font-semibold text-primary">Upgrade to Yearly</h3>
                                        <p class="text-sm text-muted-foreground">
                                            {yearlyPlan.savings} when you switch to yearly billing
                                        </p>
                                    </div>
                                    <Button onclick={() => createSubscription(yearlyPlan.priceId)} disabled={creatingSubscription}>
                                        {creatingSubscription ? 'Processing...' : `Upgrade to ${yearlyPlan.price}/year`}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    {/if}
                {/if}
            {/if}
        {:else if shouldShowPlans && pricingPlans.length > 0}
            <!-- Subscription Plans -->
            <div class="mb-8">
                <div class="text-center mb-8">
                    <h2 class="text-2xl font-bold mb-2">Choose Your Plan</h2>
                    <p class="text-muted-foreground">Select the plan that works best for you</p>
                </div>
                
                <div class="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                    {#each pricingPlans as plan}
                        <Card class="relative {plan.popular ? 'border-primary shadow-lg scale-105' : ''}">
                            {#if plan.popular}
                                <div class="absolute -top-3 left-1/2 transform -translate-x-1/2">
                                    <Badge class="bg-primary text-primary-foreground px-3 py-1">Most Popular</Badge>
                                </div>
                            {/if}
                            
                            <CardHeader class="text-center pb-4">
                                <CardTitle class="flex items-center justify-center gap-2 mb-4">
                                    <CrownIcon class="w-5 h-5" />
                                    {plan.name}
                                </CardTitle>
                                <div class="space-y-2">
                                    <div class="text-4xl font-bold">{plan.price}</div>
                                    <div class="text-sm text-muted-foreground">per {plan.interval}</div>
                                    {#if plan.savings}
                                        <Badge variant="secondary" class="text-xs bg-green-100 text-green-700">{plan.savings}</Badge>
                                    {/if}
                                </div>
                            </CardHeader>
                            
                            <CardContent class="space-y-6 pt-0">
                                <ul class="space-y-3">
                                    {#each plan.features as feature}
                                        <li class="flex items-center gap-3 text-sm">
                                            <CheckCircleIcon class="w-4 h-4 text-primary flex-shrink-0" />
                                            <span>{feature}</span>
                                        </li>
                                    {/each}
                                </ul>
                                
                                <Button 
                                    class="w-full" 
                                    variant={plan.popular ? 'default' : 'outline'}
                                    onclick={() => createSubscription(plan.priceId)}
                                    disabled={!hasPaymentMethod || creatingSubscription}
                                >
                                    {#if !hasPaymentMethod}
                                        Add Payment Method First
                                    {:else if creatingSubscription}
                                        Processing...
                                    {:else}
                                        Subscribe to {plan.name}
                                    {/if}
                                </Button>
                                
                                {#if !hasPaymentMethod}
                                    <p class="text-xs text-center text-muted-foreground">
                                        <a href="/settings/payment-methods" class="text-primary hover:underline">
                                            Add a payment method
                                        </a> to get started
                                    </p>
                                {/if}
                            </CardContent>
                        </Card>
                    {/each}
                </div>
            </div>
        {:else}
            <!-- Error loading product -->
            <div class="text-center py-12">
                <div class="mb-4">
                    <AlertCircleIcon class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 class="text-lg font-semibold mb-2">Unable to load subscription plans</h3>
                    <p class="text-muted-foreground mb-4">
                        {error || 'There was an error loading the available subscription plans.'}
                    </p>
                    <Button onclick={() => window.location.reload()}>
                        Try Again
                    </Button>
                </div>
            </div>
        {/if}
    {/if}
</AppLayout>
