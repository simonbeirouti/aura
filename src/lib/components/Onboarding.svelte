<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { centralizedAuth } from "../stores/unifiedAuth";
    import OnboardingIntro from "./onboarding/OnboardingIntro.svelte";
    import OnboardingSecurity from "./onboarding/OnboardingSecurity.svelte";
    import OnboardingAuth from "./onboarding/OnboardingAuth.svelte";

    const dispatch = createEventDispatcher();

    // Onboarding state - supports 3 steps (intro, security, auth)
    let currentStep = $state(1);
    const totalSteps = 3;
    
    // Navigation functions
    function nextStep() {
        if (currentStep < totalSteps) {
            currentStep++;
        }
    }

    function prevStep() {
        if (currentStep > 1) {
            currentStep--;
        }
    }

    // Handle authentication success from OnboardingAuth component
    function handleAuthSuccess() {
        // Authentication complete, dispatch completion event
        dispatch('complete');
    }
</script>

{#if currentStep === 3}
    <!-- Authentication Step (Step 3) -->
    <OnboardingAuth on:authSuccess={handleAuthSuccess} />
{:else}
    <!-- Regular Onboarding Layout for Steps 1 & 2 -->
    <div class="min-h-screen bg-base-100 flex flex-col relative">
        <!-- Main Content Container -->
        <div class="flex-1 flex flex-col justify-between items-center px-8 py-16">
            <!-- Top Section: Image and Text -->
            <div class="flex-1 flex flex-col justify-center items-center max-w-md mx-auto">
                {#if currentStep === 1}
                    <OnboardingIntro />
                {:else if currentStep === 2}
                    <OnboardingSecurity />
                {/if}
            </div>

            <!-- Bottom Section: Indicator and Buttons (only for steps 1-2) -->
            {#if currentStep < 3}
                <div class="w-full mx-auto">
                    <!-- Progress Indicator -->
                    <div class="flex justify-center gap-2 mb-16">
                        {#each Array(totalSteps) as _, i}
                            <div
                                class="w-3 h-3 rounded-full transition-colors duration-300 {i + 1 <= currentStep
                                    ? 'bg-primary'
                                    : 'bg-base-300'}"
                            ></div>
                        {/each}
                    </div>

                    <!-- Navigation Buttons -->
                    <div class="flex justify-center items-center px-2 pb-12 gap-6">
                        <!-- Back Button -->
                        {#if currentStep !== 1}
                            <button class="btn btn-outline text-base-content/60 w-1/2" onclick={prevStep}>
                                Back
                            </button>
                        {/if}

                        <!-- Next Button -->
                        <button class="btn btn-primary w-1/2" onclick={nextStep}>
                            Next
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}
