<script lang="ts">
    import { onMount } from "svelte";
    import AppLayout from "$lib/components/AppLayout.svelte";
    import { centralizedAuth } from "$lib/stores/unifiedAuth";
    import { settingsActions, profileStore } from "$lib/stores/settingsStore";
    import { goto } from "$app/navigation";
    import {
        UserIcon,
        CreditCardIcon,
        ChevronRight,
        LogOut,
        CrownIcon,
        HistoryIcon,
    } from "lucide-svelte";
    import { Card, CardContent } from "$lib/components/ui/card";
    import { Button } from "$lib/components/ui/button";
    import ModeToggle from "$lib/components/ModeToggle.svelte";

    // Reactive profile data from store
    $: ({ profile, loading: isLoading, error } = $profileStore);

    onMount(async () => {
        // Initialize all settings data with smart caching
        await settingsActions.initialize();
    });

    function goBack() {
        goto("/");
    }

    async function handleSignOut() {
        await centralizedAuth.handleLogout();
    }

    function navigateTo(path: string) {
        goto(path);
    }

    // Navigation items array with title and link
    const navigationItems = [
        { title: "Purchase History", link: "/settings/purchases", icon: HistoryIcon },
        { title: "Subscription", link: "/settings/subscription", icon: CrownIcon },
        { title: "Payment methods", link: "/settings/payment-methods", icon: CreditCardIcon }
    ];
</script>

<AppLayout title="Settings" showBackButton={true} onBack={goBack} maxWidth="max-w-2xl">
    <div slot="header-actions">
        <ModeToggle />
    </div>

    {#if isLoading}
        <!-- Loading state -->
        <div class="flex justify-center items-center py-12">
            <div class="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
    {:else}
            <!-- Profile Information Card -->
        <Card class="mb-6">
            <CardContent>
                <!-- Profile Display -->
                <div class="flex items-center gap-6">
                    <!-- Avatar -->
                    <div class="w-40 h-40 rounded-lg overflow-hidden">
                        {#if profile?.avatar_url}
                            <img 
                                src={profile.avatar_url} 
                                alt="Profile avatar"
                                class="w-full h-full object-cover"
                            />
                        {:else}
                            <div class="w-full h-full bg-muted rounded-lg flex items-center justify-center">
                                <UserIcon class="w-8 h-8 text-muted-foreground" />
                            </div>
                        {/if}
                    </div>
                    
                    <!-- Username and Token Balance -->
                    <div class="flex-1 text-left">
                        <div class="space-y-3">
                            <div>
                                <p class="text-sm text-muted-foreground mb-1">Username</p>
                                <p class="text-xl font-semibold text-foreground">
                                    @{profile?.username || 'Not set'}
                                </p>
                            </div>
                            <div>
                                <p class="text-sm text-muted-foreground mb-1">Token Balance</p>
                                <p class="text-lg text-foreground font-medium">
                                    {(profile?.tokens_remaining || 0).toLocaleString()}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>

            <!-- Navigation Links -->
        <div class="space-y-2">
            {#each navigationItems as item}
                <Button 
                    variant="ghost"
                    class="w-full justify-between h-auto p-4"
                    onclick={() => navigateTo(item.link)}
                >
                    <div class="flex items-center gap-3">
                        <svelte:component this={item.icon} class="w-5 h-5 text-muted-foreground" />
                        <span class="text-foreground font-medium">{item.title}</span>
                    </div>
                    <ChevronRight class="w-5 h-5 text-muted-foreground" />
                </Button>
            {/each}

            <!-- Logout -->
            <Button 
                variant="ghost"
                class="w-full justify-start gap-3 h-auto p-4"
                onclick={handleSignOut}
            >
                <LogOut class="w-5 h-5 text-muted-foreground" />
                <span class="text-foreground font-medium">Log out</span>
            </Button>
        </div>
        {/if}
</AppLayout>
