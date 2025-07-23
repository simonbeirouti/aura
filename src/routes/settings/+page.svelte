<script lang="ts">
    import { onMount } from "svelte";
    import AppLayout from "../../lib/components/AppLayout.svelte";
    import { authStore } from "../../lib/stores/supabaseAuth";
    import { databaseStore } from "../../lib/stores/database";
    import { goto } from "$app/navigation";
    import {
        ArrowLeftIcon,
        LogOutIcon,
        UserIcon,
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

    async function handleSignOut() {
        await authStore.logout();
        // Don't use goto - let the layout handle the authentication state change
    }

    function goBack() {
        goto("/");
    }
</script>

<AppLayout>
    <div class="w-full max-w-2xl mx-auto">
        <!-- Header -->
        <div class="flex items-center justify-between">
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
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <!-- Profile Display -->
                    <div class="flex items-center gap-6 mb-6">
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
                                        <UserIcon class="w-10 h-10 text-base-content/50" />
                                    </div>
                                {/if}
                            </div>
                        </div>
                        
                        <!-- Name and Username -->
                        <div class="flex-1 text-center">
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

                    <button
                        class="btn btn-error btn-outline w-full"
                        onclick={handleSignOut}
                    >
                        <LogOutIcon class="w-4 h-4 mr-2" />
                        Sign Out
                    </button>
                </div>
            </div>
        {/if}
    </div>
</AppLayout>
