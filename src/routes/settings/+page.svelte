<script lang="ts">
    import AppLayout from "../../lib/components/AppLayout.svelte";
    import { authStore } from "../../lib/stores/supabaseAuth";
    import { goto } from "$app/navigation";
    import { ArrowLeftIcon, LockKeyholeIcon, LogOutIcon, TrashIcon } from "lucide-svelte";

    let authState: {
        isAuthenticated: boolean;
        isLoading: boolean;
        user: any;
        error: string | null;
    } = {
        isAuthenticated: false,
        isLoading: true,
        user: null,
        error: null,
    };

    authStore.subscribe((state) => {
        authState = state;
    });

    async function handleSignOut() {
        await authStore.logout();
        goto("/");
    }

    function goBack() {
        goto("/");
    }
</script>

<AppLayout>
    <div class="w-full max-w-2xl mx-auto">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-4">
                <button
                    class="btn btn-ghost btn-sm"
                    on:click={goBack}
                    aria-label="Go back to home page"
                >
                    <ArrowLeftIcon class="w-4 h-4 mr-1" />
                </button>
                <h1 class="text-3xl font-bold text-primary">Settings</h1>
            </div>
        </div>

        <!-- Single Settings Card -->
        <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
                <!-- Account Section -->
                <h2 class="text-xl font-bold">Account</h2>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="form-control">
                        <input
                            id="email-display"
                            type="email"
                            class="input input-bordered input-sm w-full"
                            value={authState.user.email}
                            readonly
                        />
                    </div>
                </div>

                <h2 class="text-xl font-bold">Security</h2>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button class="btn btn-outline btn-sm">
                        <LockKeyholeIcon class="w-4 h-4 mr-1" />
                        Change Password
                    </button>
                </div>

                <h2 class="text-xl font-bold text-error">Danger Zone</h2>

                <div class="flex flex-col sm:flex-row gap-3">
                    <button
                        class="btn btn-error btn-outline btn-sm flex-1"
                        on:click={handleSignOut}
                    >
                        <LogOutIcon class="w-4 h-4 mr-1" />
                        Sign Out
                    </button>

                    <button class="btn btn-error btn-sm flex-1">
                        <TrashIcon class="w-4 h-4 mr-1" />
                        Delete Account
                    </button>
                </div>
            </div>
        </div>
    </div>
</AppLayout>
