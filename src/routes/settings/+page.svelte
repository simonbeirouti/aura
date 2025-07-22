<script lang="ts">
    import { onMount } from "svelte";
    import AppLayout from "../../lib/components/AppLayout.svelte";
    import { authStore } from "../../lib/stores/supabaseAuth";
    import { databaseStore } from "../../lib/stores/database";
    import { goto } from "$app/navigation";
    import {
        uploadAvatar,
        validateImageFile,
        createFilePreview,
        cleanupOldAvatars,
    } from "../../lib/utils/storage";
    import {
        ArrowLeftIcon,
        CameraIcon,
        LoaderIcon,
        LogOutIcon,
        TrashIcon,
        UserIcon,
    } from "lucide-svelte";

    let isUploadingAvatar = false;
    let uploadError = "";

    // Profile data (read-only)
    let profileData = {
        username: "",
        full_name: "",
        avatar_url: "",
    };

    // File input reference
    let fileInput: HTMLInputElement;
    let avatarPreview = "";

    // Initialize profile data
    onMount(async () => {
        if ($authStore.user) {
            // Initialize database if needed
            if (!$databaseStore.isInitialized) {
                await databaseStore.initialize();
            }

            // Load user profile
            await loadUserProfile();
        }
    });

    async function loadUserProfile() {
        if (!$authStore.user) return;

        try {
            const profile = await databaseStore.getUserProfile(
                $authStore.user.id,
            );

            if (profile) {
                profileData = {
                    username: profile.username || "",
                    full_name: profile.full_name || "",
                    avatar_url: profile.avatar_url || "",
                };
                avatarPreview = profile.avatar_url || "";
            } else {
                // Set default values if no profile exists
                profileData = {
                    username: "",
                    full_name: $authStore.user.user_metadata?.full_name || "",
                    avatar_url: "",
                };
            }
        } catch (error) {
            console.error("Failed to load profile:", error);
        }
    }

    async function handleAvatarUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];

        if (!file || !$authStore.user) return;

        // Validate file using utility function
        const validation = validateImageFile(file);
        if (!validation.valid) {
            uploadError = validation.error || "Invalid file";
            return;
        }

        isUploadingAvatar = true;
        uploadError = "";

        try {
            // Create preview immediately for better UX
            const previewUrl = await createFilePreview(file);
            avatarPreview = previewUrl;

            // Upload using utility function
            console.log("Uploading avatar to Supabase...");
            const result = await uploadAvatar(file, $authStore.user.id);
            console.log("Upload result:", result);

            if (!result.success) {
                throw new Error(result.error || "Upload failed");
            }

            if (!result.publicUrl) {
                throw new Error("No public URL returned from upload");
            }

            // Update profile data with the public URL
            profileData.avatar_url = result.publicUrl;
            avatarPreview = result.publicUrl;

            console.log("Avatar uploaded successfully:", result.publicUrl);

            // Test if the URL is accessible
            const img = new Image();
            img.onload = () => console.log("Avatar URL is accessible");
            img.onerror = () =>
                console.error(
                    "Avatar URL is not accessible:",
                    result.publicUrl,
                );
            img.src = result.publicUrl;

            // Immediately save the avatar URL to the profile
            await saveAvatarToProfile(result.publicUrl);

            // Clean up old avatars (keep only the 2 most recent)
            await cleanupOldAvatars($authStore.user.id, 2);
        } catch (error) {
            console.error("Avatar upload failed:", error);
            uploadError =
                error instanceof Error ? error.message : "Upload failed";
            // Reset preview on error
            avatarPreview = profileData.avatar_url;
        } finally {
            isUploadingAvatar = false;
        }
    }

    async function handleSignOut() {
        await authStore.logout();
        goto("/");
    }

    function goBack() {
        goto("/");
    }

    async function saveAvatarToProfile(avatarUrl: string) {
        if (!$authStore.user) return;

        try {
            // Check if profile exists first
            const existingProfile = await databaseStore.getUserProfile(
                $authStore.user.id,
            );

            if (existingProfile) {
                // Update existing profile with new avatar
                await databaseStore.updateUserProfile($authStore.user.id, {
                    avatar_url: avatarUrl,
                });
            } else {
                // Create new profile with avatar
                await databaseStore.createUserProfile(
                    $authStore.user.id,
                    undefined,
                    avatarUrl,
                );
            }
        } catch (error) {
            console.error("Failed to save avatar to profile:", error);
        }
    }

    function triggerFileInput() {
        fileInput?.click();
    }
</script>

<AppLayout>
    <div class="w-full max-w-4xl mx-auto">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-4">
                <button
                    class="btn btn-ghost btn-sm"
                    onclick={goBack}
                    aria-label="Go back to home page"
                >
                    <ArrowLeftIcon class="w-4 h-4 mr-1" />
                </button>
                <h1 class="text-3xl font-bold text-primary">
                    Profile Settings
                </h1>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Profile Card -->
            <div class="lg:col-span-2">
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <!-- Avatar Section -->
                        <div
                            class="flex flex-col sm:flex-row items-start gap-6 mb-6"
                        >
                            <div class="flex flex-col items-center gap-3">
                                <button
                                    class="avatar cursor-pointer bg-transparent border-0 p-0 hover:opacity-80 transition-opacity"
                                    onclick={triggerFileInput}
                                    disabled={isUploadingAvatar}
                                    aria-label="Click to change profile photo"
                                >
                                    <div
                                        class="w-24 h-24 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2 hover:ring-offset-4 transition-all relative"
                                    >
                                        {#if avatarPreview}
                                            <img
                                                src={avatarPreview}
                                                alt="Profile avatar"
                                                class="rounded-full w-full h-full object-cover"
                                                onerror={(e) => {
                                                    console.error(
                                                        "Avatar image failed to load:",
                                                        avatarPreview,
                                                    );
                                                    const target =
                                                        e.target as HTMLImageElement;
                                                    if (target) {
                                                        target.style.display =
                                                            "none";
                                                        const fallback =
                                                            target.nextElementSibling as HTMLElement;
                                                        if (fallback) {
                                                            fallback.style.display =
                                                                "flex";
                                                        }
                                                    }
                                                }}
                                            />
                                            <!-- Fallback when image fails -->
                                            <div
                                                class="bg-neutral text-neutral-content rounded-full w-full h-full items-center justify-center absolute inset-0"
                                                style="display: none;"
                                            >
                                                <UserIcon class="w-12 h-12" />
                                            </div>
                                        {:else}
                                            <div
                                                class="bg-neutral text-neutral-content rounded-full w-full h-full flex items-center justify-center"
                                            >
                                                <UserIcon class="w-12 h-12" />
                                            </div>
                                        {/if}

                                        <!-- Overlay on hover -->
                                        <div
                                            class="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                                        >
                                            {#if isUploadingAvatar}
                                                <LoaderIcon
                                                    class="w-6 h-6 text-white animate-spin"
                                                />
                                            {:else}
                                                <CameraIcon
                                                    class="w-6 h-6 text-white"
                                                />
                                            {/if}
                                        </div>
                                    </div>
                                </button>

                                <input
                                    bind:this={fileInput}
                                    type="file"
                                    accept="image/*"
                                    class="hidden"
                                    onchange={handleAvatarUpload}
                                />

                                {#if uploadError}
                                    <div class="text-error text-sm text-center">
                                        {uploadError}
                                    </div>
                                {/if}
                            </div>

                            {#if isUploadingAvatar}
                                <div
                                    class="mt-2 flex items-center gap-2 text-sm text-primary"
                                >
                                    <LoaderIcon class="w-4 h-4 animate-spin" />
                                    Uploading avatar...
                                </div>
                            {/if}
                        </div>

                        <!-- Profile Form -->
                        <div class="space-y-4">
                            <!-- Email (readonly) -->
                            <div class="form-control">
                                <label class="label" for="email-display">
                                    <span class="label-text font-medium"
                                        >Email Address</span
                                    >
                                </label>
                                <input
                                    id="email-display"
                                    type="email"
                                    class="input input-bordered"
                                    value={$authStore.user?.email || ""}
                                    readonly
                                />
                            </div>

                            <!-- Full Name -->
                            <div class="form-control">
                                <label class="label" for="full-name-input">
                                    <span class="label-text font-medium"
                                        >Full Name</span
                                    >
                                </label>
                                <input
                                    id="full-name-input"
                                    type="text"
                                    class="input input-bordered"
                                    value={profileData.full_name || "Not set"}
                                    readonly
                                />
                            </div>

                            <!-- Username -->
                            <div class="form-control">
                                <label class="label" for="username-input">
                                    <span class="label-text font-medium"
                                        >Username</span
                                    >
                                </label>
                                <input
                                    id="username-input"
                                    type="text"
                                    class="input input-bordered"
                                    value={profileData.username || "Not set"}
                                    readonly
                                />
                            </div>

                            <button
                                class="btn btn-error btn-outline mt-2 btn-sm w-full"
                                onclick={handleSignOut}
                            >
                                <LogOutIcon class="w-4 h-4 mr-1" />
                                Sign Out
                            </button>

                            <button class="btn btn-error btn-sm w-full">
                                <TrashIcon class="w-4 h-4 mr-1" />
                                Delete Account
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</AppLayout>
