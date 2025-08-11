<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { authStore } from "../../stores/supabaseAuth";
    import { dataStore } from "../../stores/dataStore";
    import {
        uploadAvatar,
        validateImageFile,
        createFilePreview,
    } from "../../utils/storage";
    import {
        CameraIcon,
        LoaderIcon,
    } from "lucide-svelte";

    const dispatch = createEventDispatcher();

    // UI state
    let isSaving = false;
    let isUploading = false;
    let uploadError = "";
    let usernameError = "";
    let avatarPreview = "";

    // Profile form data (for authenticated users)
    let profileData = {
        full_name: "",
        username: "",
        avatar_url: "",
    };

    // File input reference
    let fileInput: HTMLInputElement;

    // Initialize with user data if available
    $: if ($authStore.user && !profileData.full_name) {
        profileData.full_name = $authStore.user.user_metadata?.full_name || "";
    }

    async function handleAvatarUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];

        if (!file || !$authStore.user) return;

        try {
            // Validate file
            validateImageFile(file);

            // Create preview
            avatarPreview = await createFilePreview(file);

            // Upload to storage
            isUploading = true;
            uploadError = "";

            const result = await uploadAvatar(file, $authStore.user.id);
            if (result.success && result.publicUrl) {
                profileData.avatar_url = result.publicUrl;
                avatarPreview = result.publicUrl;
            } else {
                throw new Error(result.error || "Upload failed");
            }
        } catch (error) {
            console.error("Avatar upload failed:", error);
            uploadError =
                error instanceof Error
                    ? error.message
                    : "Failed to upload avatar";
            avatarPreview = "";
        } finally {
            isUploading = false;
        }
    }

    function triggerFileInput() {
        fileInput?.click();
    }

    async function checkUsername() {
        if (!profileData.username || profileData.username.length < 3) {
            usernameError = "Username must be at least 3 characters";
            return false;
        }

        try {
            const isAvailable = await dataStore.checkUsernameAvailability(
                profileData.username,
            );
            if (!isAvailable) {
                usernameError = "Username is already taken";
                return false;
            }
            usernameError = "";
            return true;
        } catch (error) {
            console.error("Username check failed:", error);
            usernameError = "Failed to check username availability";
            return false;
        }
    }

    // Reset view to handle keyboard displacement
    function resetView() {
        // Blur any focused input to dismiss keyboard
        if (document.activeElement && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        
        // Scroll to top and reset viewport
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Force viewport reset for mobile browsers
        if (typeof window !== 'undefined') {
            // Small delay to ensure keyboard is dismissed
            setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'auto' });
                // Trigger a resize event to reset the viewport
                window.dispatchEvent(new Event('resize'));
            }, 100);
        }
    }

    async function completeOnboarding(isSkipped = false) {
        if (!$authStore.user) {
            console.error("No authenticated user found");
            return;
        }

        isSaving = true;

        try {
            // Create or update user profile
            const profilePayload = {
                full_name: profileData.full_name || $authStore.user.email || "",
                username: profileData.username || "",
                avatar_url: profileData.avatar_url || "",
                onboarding_complete: true,
            };

            // Try to get existing profile first
            let existingProfile = null;
            try {
                existingProfile = await dataStore.getUserProfile(
                    $authStore.user.id,
                );
            } catch (error) {
                console.log("No existing profile found, will create new one");
            }

            if (existingProfile) {
                // Update existing profile
                await dataStore.updateUserProfile($authStore.user.id, {
                    full_name: profilePayload.full_name,
                    username: profilePayload.username,
                    avatar_url: profilePayload.avatar_url,
                    onboarding_complete: profilePayload.onboarding_complete,
                });
            } else {
                // Create new profile
                await dataStore.createUserProfile($authStore.user.id, {
                    full_name: profilePayload.full_name,
                    username: profilePayload.username,
                    avatar_url: profilePayload.avatar_url,
                    onboarding_complete: profilePayload.onboarding_complete,
                });
            }

            // Reset view before dispatching completion
            resetView();

            // Small delay to ensure view reset completes before transition
            setTimeout(() => {
                // Dispatch completion event
                dispatch("complete", {
                    skipped: isSkipped,
                    profile: profilePayload,
                });
            }, 150);
            
        } catch (error) {
            console.error("Failed to complete onboarding:", error);
            // Reset view even on error
            resetView();
            
            // Still dispatch completion to avoid getting stuck
            setTimeout(() => {
                dispatch("complete", {
                    skipped: true,
                    error: error instanceof Error ? error.message : "Unknown error",
                });
            }, 150);
        } finally {
            isSaving = false;
        }
    }
</script>

<!-- Profile Setup Layout matching steps 1 & 2 -->
<div class="min-h-screen bg-background flex flex-col relative">
    <!-- Main Content Container -->
    <div class="flex-1 flex flex-col justify-between items-center px-8 py-16">
        <!-- Top Section: Profile Form -->
        <div class="flex-1 flex flex-col justify-center items-center max-w-md mx-auto">
            <div class="text-center">
                <h2 class="text-3xl font-bold text-foreground mb-6">
                    Set up your profile
                </h2>
                <p class="text-lg text-muted-foreground leading-relaxed mb-8">
                    Tell us a bit about yourself to personalize your
                    experience
                </p>

                <!-- Profile Form -->
                <div class="space-y-6 max-w-sm mx-auto">
                    <!-- Avatar Upload -->
                    <div class="flex flex-col items-center gap-4">
                        <button
                            class="avatar cursor-pointer bg-transparent border-0 p-0 m-4"
                            onclick={triggerFileInput}
                            disabled={isUploading}
                        >
                            <div
                                class="w-40 h-40 rounded-full bg-muted border-2 border-dashed border-border hover:border-primary transition-colors flex items-center justify-center"
                            >
                                {#if avatarPreview}
                                    <img
                                        src={avatarPreview}
                                        alt="Avatar preview"
                                        class="w-full h-full rounded-full object-cover"
                                    />
                                {:else if isUploading}
                                    <LoaderIcon
                                        class="w-6 h-6 animate-spin text-primary"
                                    />
                                {:else}
                                    <CameraIcon
                                        class="w-6 h-6 text-muted-foreground"
                                    />
                                {/if}
                            </div>
                        </button>
                        <p
                            class="text-xs text-muted-foreground text-center"
                        >
                            Click to add a profile photo
                        </p>
                    </div>

                    <!-- File Input -->
                    <input
                        bind:this={fileInput}
                        type="file"
                        accept="image/*"
                        class="hidden"
                        onchange={handleAvatarUpload}
                    />

                    <!-- Form Fields -->
                    <div class="space-y-4">
                        <!-- Full Name -->
                        <div class="space-y-2">
                            <input
                                id="full-name-input"
                                type="text"
                                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                bind:value={profileData.full_name}
                                placeholder="Enter your full name"
                                required
                            />
                        </div>

                        <!-- Username -->
                        <div class="space-y-2">
                            <input
                                id="username-input"
                                type="text"
                                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 {usernameError
                                    ? 'border-destructive'
                                    : ''}"
                                bind:value={profileData.username}
                                placeholder="Choose a username"
                                onblur={checkUsername}
                                required
                            />
                            {#if usernameError}
                                <div class="text-sm text-destructive mt-1">
                                    {usernameError}
                                </div>
                            {/if}
                        </div>
                    </div>

                    {#if uploadError}
                        <div class="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                            {uploadError}
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        <!-- Bottom Section: Complete Setup Button (aligned with steps 1-2) -->
        <div class="w-full mx-auto">
            <div class="flex justify-center items-center px-2 pb-12">
                <button
                    class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8"
                    onclick={() => completeOnboarding(false)}
                    disabled={isSaving ||
                        !profileData.full_name ||
                        !profileData.username ||
                        !!usernameError}
                >
                    {#if isSaving}
                        <LoaderIcon class="w-4 h-4 animate-spin" />
                        Creating...
                    {:else}
                        Complete Setup
                    {/if}
                </button>
            </div>
        </div>
    </div>
</div>
