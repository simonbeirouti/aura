<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { invoke } from "@tauri-apps/api/core";
    import AppLayout from "$lib/components/AppLayout.svelte";
    import { centralizedAuth } from "$lib/stores/unifiedAuth";
    import { cacheManager, cacheKeys } from "$lib/stores/cacheManager";
    import {
        Card,
        CardContent,
        CardHeader,
        CardTitle,
    } from "$lib/components/ui/card";
    import { Button } from "$lib/components/ui/button";
    import { Badge } from "$lib/components/ui/badge";
    import { toast } from "svelte-sonner";
    import {
        CalendarIcon,
        CreditCardIcon,
        CoinsIcon,
        RefreshCwIcon
    } from "lucide-svelte";

    interface Purchase {
        id: string;
        user_id: string;
        stripe_payment_intent_id: string;
        stripe_price_id: string;
        stripe_product_id?: string;
        package_id?: string;
        package_price_id?: string;
        amount_paid: number;
        currency: string;
        tokens_purchased?: number;
        status: string;
        completed_at?: string;
        created_at?: string;
        updated_at?: string;
    }

    let purchases: Purchase[] = [];
    let loading = true;
    let error: string | null = null;

    onMount(async () => {
        await loadPurchases();
    });

    function goBack() {
        goto("/settings");
    }

    async function loadPurchases(forceRefresh = false) {
        try {
            loading = true;
            error = null;

            const authState = await centralizedAuth.getState();
            if (!authState.isAuthenticated || !authState.user?.id) {
                error = "Please log in to view purchase history";
                return;
            }

            const cacheKey = cacheKeys.userPurchases(authState.user.id);

            // Check cache first if not forcing refresh
            if (!forceRefresh && cacheManager.has(cacheKey)) {
                const cachedPurchases = cacheManager.get<Purchase[]>(cacheKey);
                if (cachedPurchases) {
                    purchases = cachedPurchases;
                    loading = false;
                    return;
                }
            }

            // Load from database if not cached or expired
            const freshPurchases = await invoke<Purchase[]>("get_user_purchases", {
                userId: authState.user.id,
            });

            purchases = freshPurchases;

            // Cache the results (5 minute TTL)
            cacheManager.set(cacheKey, purchases, 5 * 60 * 1000);
        } catch (err) {
            console.error("Failed to load purchases:", err);
            error = err instanceof Error ? err.message : "Failed to load purchase history";
            toast.error("Failed to load purchase history");
        } finally {
            loading = false;
        }
    }

    function formatPrice(amount_cents: number): string {
        const amount = (amount_cents / 100).toFixed(2);
        return `$${amount}`;
    }

    function formatDate(dateString?: string): string {
        if (!dateString) return "Unknown date";
        
        try {
            const date = new Date(dateString);
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear().toString().slice(-2);
            return `${day}/${month}/${year}`;
        } catch {
            return "Invalid date";
        }
    }
</script>

<AppLayout title="Purchase History" showBackButton={true} onBack={goBack} maxWidth="max-w-4xl">
    <div slot="header-actions">
        <Button 
            variant="ghost" 
            size="sm" 
            onclick={() => loadPurchases(true)}
            disabled={loading}
            class="h-8 w-8 p-0"
        >
            <RefreshCwIcon class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
        </Button>
    </div>
    {#if loading}
        <!-- Loading state -->
        <div class="flex justify-center items-center py-12">
            <div class="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
    {:else if error}
        <!-- Error state -->
        <Card class="mb-6">
            <CardContent class="pt-6">
                <div class="text-center">
                    <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                        <div class="flex items-center justify-center">
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
                    <Button onclick={() => loadPurchases(true)} variant="outline">
                        Try Again
                    </Button>
                </div>
            </CardContent>
        </Card>
    {:else if purchases.length === 0}
        <!-- Empty state -->
        <Card class="mb-6">
            <CardContent class="pt-6">
                <div class="text-center py-8">
                    <CreditCardIcon class="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 class="text-lg font-semibold text-foreground mb-2">No purchases yet</h3>
                    <p class="text-muted-foreground mb-4">
                        You haven't made any purchases yet. Check out our packages to get started.
                    </p>
                    <Button onclick={() => goto("/packages")} variant="outline">
                        Browse Packages
                    </Button>
                </div>
            </CardContent>
        </Card>
    {:else}
        <!-- Summary card -->
        {#if purchases.length > 0}
            <Card class="mb-4">
                <CardContent>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
                        <div>
                            <div class="text-2xl font-bold text-primary">
                                {purchases.length}
                            </div>
                            <div class="text-sm text-muted-foreground">
                                Total Purchases
                            </div>
                        </div>
                        <div>
                            <div class="text-2xl font-bold text-primary">
                                {formatPrice(purchases.reduce((sum, p) => sum + p.amount_paid, 0))}
                            </div>
                            <div class="text-sm text-muted-foreground">
                                Total Spent
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        {/if}
        <!-- Purchases list -->
        <div class="space-y-2">
            {#each purchases as purchase (purchase.id)}
                <div class="py-2">
                    <div class="flex items-center justify-between gap-6 px-4">
                        <div class="flex items-center gap-2">
                            <CreditCardIcon class="w-5 h-5 text-muted-foreground" />
                            <span class="font-semibold text-lg">
                                {formatPrice(purchase.amount_paid)}
                            </span>
                        </div>
                        <div class="flex items-center gap-2 text-muted-foreground">
                            <span class="text-md">{formatDate(purchase.completed_at || purchase.created_at)}</span>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</AppLayout>
