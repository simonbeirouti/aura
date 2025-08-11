<script lang="ts">
    import { onMount } from "svelte";
    import AppLayout from "../../lib/components/AppLayout.svelte";
    import { authStore } from "../../lib/stores/supabaseAuth";
    import { settingsActions, profileStore } from "../../lib/stores/settingsStore";
    import { goto } from "$app/navigation";
    import {
        ArrowLeftIcon,
        UserIcon,
        CreditCardIcon,
        Users,
        Gift,
        FileText,
        ChevronRight,
        LogOut,
    } from "lucide-svelte";
    import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
    import { Button } from "$lib/components/ui/button";
    import ModeToggle from "../../lib/components/ModeToggle.svelte";

    // Reactive profile data from store
    $: ({ profile, loading: isLoading, error } = $profileStore);

    onMount(async () => {
        // Load profile data (will use cache if available)
        await settingsActions.loadProfile();
        
        // Start background refresh after initial load
        setTimeout(() => {
            settingsActions.refreshProfileInBackground();
        }, 100);
    });

    function goBack() {
        goto("/");
    }

    async function handleSignOut() {
        await authStore.logout();
        // Don't use goto - let the layout handle the authentication state change
    }

    function navigateTo(path: string) {
        goto(path);
    }
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
                    
                    <!-- Name and Username -->
                    <div class="flex-1 text-left">
                        <div class="space-y-2">
                            <div>
                                <p class="text-sm text-muted-foreground mb-1">Full Name</p>
                                <p class="text-xl font-semibold text-foreground">
                                    {profile?.full_name || 'Not set'}
                                </p>
                            </div>
                            <div>
                                <p class="text-sm text-muted-foreground mb-1">Username</p>
                                <p class="text-lg text-foreground">
                                    @{profile?.username || 'Not set'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>

            <!-- Navigation Links -->
        <div class="space-y-2">
            <!-- Payment Methods -->
            <Button 
                variant="ghost"
                class="w-full justify-between h-auto p-4"
                onclick={() => navigateTo('/settings/payment-methods')}
            >
                <div class="flex items-center gap-3">
                    <CreditCardIcon class="w-5 h-5 text-muted-foreground" />
                    <span class="text-foreground font-medium">Payment methods</span>
                </div>
                <ChevronRight class="w-5 h-5 text-muted-foreground" />
            </Button>

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
