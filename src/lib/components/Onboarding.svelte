<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { authStore } from "../stores/supabaseAuth";
    import { databaseStore } from "../stores/database";
    import {
        uploadAvatar,
        validateImageFile,
        createFilePreview,
    } from "../utils/storage";
    import {
        CameraIcon,
        CheckIcon,
        LoaderIcon,
        UserIcon,
        ArrowRightIcon,
        SkipForwardIcon,
    } from "lucide-svelte";

    const dispatch = createEventDispatcher();

    let currentStep = 1;
    const totalSteps = 3;

    // Form data
    let profileData = {
        full_name: "",
        username: "",
        avatar_url: "",
    };

    // UI state
    let isUploading = false;
    let isSaving = false;
    let uploadError = "";
    let usernameError = "";
    let avatarPreview = "";

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

        // Validate file
        const validation = validateImageFile(file);
        if (!validation.valid) {
            uploadError = validation.error || "Invalid file";
            return;
        }

        isUploading = true;
        uploadError = "";

        try {
            // Create preview immediately for better UX
            const previewUrl = await createFilePreview(file);
            avatarPreview = previewUrl;

            // Upload to Supabase

            const result = await uploadAvatar(file, $authStore.user.id);

            if (!result.success) {
                throw new Error(result.error || "Upload failed");
            }

            if (!result.publicUrl) {
                throw new Error("No public URL returned from upload");
            }

            // Update with the actual uploaded URL
            profileData.avatar_url = result.publicUrl;
            avatarPreview = result.publicUrl;

            // Test if the URL is accessible
            const img = new Image();

            img.onerror = () =>
                console.error(
                    "Avatar URL is not accessible:",
                    result.publicUrl,
                );
            img.src = result.publicUrl;
        } catch (error) {
            console.error("Avatar upload failed:", error);
            uploadError =
                error instanceof Error ? error.message : "Upload failed";
            avatarPreview = "";
        } finally {
            isUploading = false;
        }
    }

    async function checkUsername() {
        if (!profileData.username || profileData.username.length < 3) {
            usernameError = "Username must be at least 3 characters";
            return false;
        }

        // Basic validation for username format
        const usernameRegex = /^[a-zA-Z0-9_-]+$/;
        if (!usernameRegex.test(profileData.username)) {
            usernameError =
                "Username can only contain letters, numbers, hyphens, and underscores";
            return false;
        }

        try {
            const isAvailable = await databaseStore.checkUsernameAvailability(
                profileData.username,
            );

            if (!isAvailable) {
                usernameError =
                    "Username is already taken. Try adding numbers or underscores.";
                return false;
            }
            usernameError = "";
            return true;
        } catch (error) {
            console.error("Username check error:", error);
            usernameError =
                "Unable to verify username. You can skip this step for now.";
            return false;
        }
    }

    async function nextStep() {
        if (currentStep === 2) {
            // Validate username before proceeding
            const isValid = await checkUsername();
            if (!isValid) return;
        }

        if (currentStep < totalSteps) {
            currentStep++;
        } else {
            await completeOnboarding(false); // Full completion
        }
    }

    function previousStep() {
        if (currentStep > 1) {
            currentStep--;
        }
    }

    function skipStep() {
        if (currentStep < totalSteps) {
            currentStep++;
        } else {
            completeOnboarding(true); // Skip completion
        }
    }

    async function completeOnboarding(isSkipped = false) {
        if (!$authStore.user) {
            console.error("No authenticated user found");
            return;
        }

        isSaving = true;

        try {
            // Check if profile exists (database initialization handled automatically)
            const existingProfile = await databaseStore.getUserProfile(
                $authStore.user.id,
            );

            if (existingProfile) {
                // Update existing profile with completion status
                const updateData = {
                    username: profileData.username || undefined,
                    full_name: profileData.full_name || undefined,
                    avatar_url: profileData.avatar_url || undefined,
                    onboarding_complete: true,
                };

                const result = await databaseStore.updateUserProfile(
                    $authStore.user.id,
                    updateData,
                );
            } else {
                // Create new profile with completion status
                const createData = {
                    userId: $authStore.user.id,
                    fullName: profileData.full_name || undefined,
                    avatarUrl: profileData.avatar_url || undefined,
                    onboardingComplete: true,
                };

                const result = await databaseStore.createUserProfile(
                    $authStore.user.id,
                    profileData.full_name || undefined,
                    profileData.avatar_url || undefined,
                    true, // Mark onboarding as complete
                );
            }

            // Dispatch completion event
            dispatch("complete");
        } catch (error) {
            console.error("Failed to complete onboarding:", error);
            console.error(
                "Error details:",
                error instanceof Error ? error.message : String(error),
            );
        } finally {
            isSaving = false;
        }
    }

    function triggerFileInput() {
        fileInput?.click();
    }
</script>

<div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
    <div class="card w-full max-w-lg bg-base-100 shadow-xl">
        <div class="card-body">
            <!-- Progress Header -->
            <div class="text-center mb-6">
                <h1 class="text-2xl font-bold text-primary mb-2">
                    Welcome to Aura!
                </h1>
                <p class="text-base-content/70">Let's set up your profile</p>

                <!-- Progress Bar -->
                <div class="flex items-center justify-center mt-4 gap-2">
                    {#each Array(totalSteps) as _, i}
                        <div class="flex items-center">
                            <div
                                class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                                {i + 1 === currentStep
                                    ? 'bg-primary text-primary-content'
                                    : i + 1 < currentStep
                                      ? 'bg-success text-success-content'
                                      : 'bg-base-300 text-base-content/50'}"
                            >
                                {i + 1 < currentStep ? "✓" : i + 1}
                            </div>
                            {#if i < totalSteps - 1}
                                <div
                                    class="w-8 h-0.5 {i + 1 < currentStep
                                        ? 'bg-success'
                                        : 'bg-base-300'}"
                                ></div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Step Content -->
            {#if currentStep === 1}
                <!-- Step 1: Full Name -->
                <div class="space-y-4">
                    <div class="text-center">
                        <UserIcon class="w-12 h-12 mx-auto text-primary mb-2" />
                        <h2 class="text-xl font-bold">What's your name?</h2>
                        <p class="text-sm text-base-content/70">
                            This helps us personalize your experience
                        </p>
                    </div>

                    <div class="form-control">
                        <label class="label" for="full-name">
                            <span class="label-text font-medium">Full Name</span
                            >
                        </label>
                        <input
                            id="full-name"
                            type="text"
                            class="input input-bordered input-lg"
                            bind:value={profileData.full_name}
                            placeholder="Enter your full name"
                        />
                    </div>
                </div>
            {:else if currentStep === 2}
                <!-- Step 2: Username -->
                <div class="space-y-4">
                    <div class="text-center">
                        <div class="text-2xl mb-2">@</div>
                        <h2 class="text-xl font-bold">Choose a username</h2>
                        <p class="text-sm text-base-content/70">
                            This will be your unique identifier
                        </p>
                    </div>

                    <div class="form-control">
                        <label class="label" for="username">
                            <span class="label-text font-medium">Username</span>
                        </label>
                        <input
                            id="username"
                            type="text"
                            class="input input-bordered input-lg {usernameError
                                ? 'input-error'
                                : ''}"
                            bind:value={profileData.username}
                            placeholder="e.g. john_doe, user123, my-username"
                            onblur={checkUsername}
                            oninput={() => {
                                if (usernameError) usernameError = "";
                            }}
                        />
                        {#if usernameError}
                            <div class="label">
                                <span class="label-text-alt text-error"
                                    >{usernameError}</span
                                >
                            </div>
                        {/if}
                        <div class="label">
                            <span class="label-text-alt text-base-content/60">
                                Use letters, numbers, hyphens, and underscores
                                only
                            </span>
                        </div>
                    </div>
                </div>
            {:else if currentStep === 3}
                <!-- Step 3: Avatar -->
                <div class="space-y-4">
                    <div class="text-center">
                        <h2 class="text-xl font-bold">Add a profile photo</h2>
                        <p class="text-sm text-base-content/70">
                            Help others recognize you
                        </p>
                    </div>

                    <div class="flex flex-col items-center gap-4">
                        <!-- Avatar Preview -->
                        <button
                            class="avatar cursor-pointer bg-transparent border-0 p-0"
                            onclick={triggerFileInput}
                            aria-label="Click to upload profile photo"
                        >
                            <div
                                class="w-24 h-24 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2 hover:ring-offset-4 transition-all relative"
                            >
                                {#if avatarPreview}
                                    <img
                                        src={avatarPreview}
                                        alt="Profile preview"
                                        class="rounded-full w-full h-full object-cover"
                                        onerror={(e) => {
                                            console.error(
                                                "Avatar image failed to load:",
                                                avatarPreview,
                                            );
                                            const target =
                                                e.target as HTMLImageElement;
                                            if (target) {
                                                target.style.display = "none";
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
                            </div>
                        </button>

                        <!-- Upload Button -->
                        <button
                            class="btn btn-primary btn-sm"
                            onclick={() => {
                                if (isUploading) {
                                    return;
                                } else {
                                    triggerFileInput();
                                }
                            }}
                            disabled={isUploading}
                        >
                            {#if isUploading}
                                <LoaderIcon class="w-4 h-4 mr-1 animate-spin" />
                                Uploading...
                            {:else}
                                <CameraIcon class="w-4 h-4 mr-1" />
                                Choose Photo
                            {/if}
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

                        <p class="text-xs text-base-content/60 text-center">
                            Click the avatar or button to upload a photo<br />
                            Max file size: 5MB
                        </p>
                    </div>
                </div>
            {/if}

            <!-- Navigation Buttons -->
            <div class="flex justify-between items-center mt-8">
                <button
                    class="btn btn-ghost btn-sm"
                    onclick={previousStep}
                    disabled={currentStep === 1 || isSaving}
                >
                    Back
                </button>

                <div class="flex gap-2">
                    {#if currentStep === 2 || currentStep === totalSteps}
                        <button
                            class="btn btn-ghost btn-sm"
                            onclick={skipStep}
                            disabled={isSaving}
                        >
                            <SkipForwardIcon class="w-4 h-4 mr-1" />
                            Skip {currentStep === 2 ? "Username" : "Photo"}
                        </button>
                    {/if}

                    <button
                        class="btn btn-primary btn-sm"
                        onclick={nextStep}
                        disabled={isSaving ||
                            (currentStep === 1 &&
                                !profileData.full_name.trim())}
                    >
                        {#if isSaving}
                            <LoaderIcon class="w-4 h-4 mr-1 animate-spin" />
                            Saving...
                        {:else if currentStep === totalSteps}
                            <CheckIcon class="w-4 h-4 mr-1" />
                            Complete
                        {:else}
                            Next
                            <ArrowRightIcon class="w-4 h-4 ml-1" />
                        {/if}
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>
