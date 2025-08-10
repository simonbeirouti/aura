<script lang="ts">
    import { onMount } from "svelte";
    import AppLayout from "../../lib/components/AppLayout.svelte";
    import { authStore } from "../../lib/stores/supabaseAuth";
    import { databaseStore } from "../../lib/stores/database";
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

    let profile: any = null;
    let isLoading = true;

    onMount(async () => {
        await loadProfile();
    });

    async function loadProfile() {
        try {
            if (!$authStore.user) return;
            
            // Initialize database if needed
            if (!$databaseStore.isInitialized) {
                await databaseStore.initialize();
            }
            
            profile = await databaseStore.getUserProfile($authStore.user.id);
        } catch (error) {
            console.error("Failed to load profile:", error);
        } finally {
            isLoading = false;
        }
    }

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

<AppLayout>
    <div class="w-full max-w-2xl mx-auto">
        <!-- Header -->
        <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-4">
                <button
                    class="btn btn-ghost btn-sm"
                    onclick={goBack}
                    aria-label="Go back to home page"
                >
                    <ArrowLeftIcon class="w-4 h-4 mr-1" />
                </button>
                <h1 class="text-3xl font-bold text-primary">
                    Settings
                </h1>
            </div>
        </div>

        {#if isLoading}
            <!-- Loading state -->
            <div class="flex justify-center items-center py-12">
                <span class="loading loading-spinner w-8 h-8 text-primary"></span>
            </div>
        {:else}
            <!-- Profile Information Card -->
            <div class="card bg-red-100 shadow-x mb-6">
                <div class="card-body">
                    <!-- Profile Display -->
                    <div class="flex items-center gap-6">
                        <!-- Avatar -->
                        <div class="avatar">
                            <div class="w-40 h-40 rounded-lg">
                                {#if profile?.avatar_url}
                                    <img 
                                        src={profile.avatar_url} 
                                        alt="Profile avatar"
                                        class="w-full h-full object-cover rounded-lg"
                                    />
                                {:else}
                                    <div class="w-full h-full bg-base-300 rounded-lg flex items-center justify-center">
                                        <UserIcon class="w-8 h-8 text-base-content/50" />
                                    </div>
                                {/if}
                            </div>
                        </div>
                        
                        <!-- Name and Username -->
                        <div class="flex-1 text-left">
                            <div class="space-y-2">
                                <div>
                                    <p class="text-sm text-base-content/60 mb-1">Full Name</p>
                                    <p class="text-xl font-semibold text-base-content">
                                        {profile?.full_name || 'Not set'}
                                    </p>
                                </div>
                                <div>
                                    <p class="text-sm text-base-content/60 mb-1">Username</p>
                                    <p class="text-lg text-base-content">
                                        @{profile?.username || 'Not set'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Navigation Links -->
            <div class="space-y-2">
                <!-- Payment Methods -->
                <button 
                    class="w-full flex items-center justify-between p-4 bg-base-100 hover:bg-base-200 rounded-lg transition-colors"
                    onclick={() => navigateTo('/settings/payment-methods')}
                >
                    <div class="flex items-center gap-3">
                        <CreditCardIcon class="w-5 h-5 text-base-content/70" />
                        <span class="text-base-content font-medium">Payment methods</span>
                    </div>
                    <ChevronRight class="w-5 h-5 text-base-content/40" />
                </button>

                <!-- Logout -->
                <button 
                    class="w-full flex items-center gap-3 p-4 text-left hover:bg-base-200 rounded-lg transition-colors"
                    onclick={handleSignOut}
                >
                    <LogOut class="w-5 h-5 text-base-content/70" />
                    <span class="text-base-content font-medium">Log out</span>
                </button>
            </div>
        {/if}
    </div>
</AppLayout>
