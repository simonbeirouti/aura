<script lang="ts">
  import { onMount } from "svelte";
  import { animate } from "animejs";
  import {
    contractorStore,
    step1Valid,
    step2Valid,
    step3Valid,
  } from "$lib/stores/contractorStore";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import Calendar from "$lib/components/ui/calendar/calendar.svelte";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { ChevronDownIcon, UserIcon, BuildingIcon } from "lucide-svelte/icons";
  import {
    getLocalTimeZone,
    today,
    type CalendarDate,
    parseDate,
  } from "@internationalized/date";
  import AppLayout from "$lib/components/AppLayout.svelte";

  // Type definitions
  interface ConnectAccountResponse {
    account_id: string;
    onboarding_url: string;
    requirements_completed: boolean;
  }

  interface ConnectAccountStatus {
    requirements_completed: boolean;
    requirements_currently_due: string[];
    requirements_eventually_due: string[];
    charges_enabled: boolean;
    payouts_enabled: boolean;
  }

  // State variables from store
  $: ({ formData, currentStep, totalSteps, loading, error, success } =
    $contractorStore);

  // Local state
  let connectAccountId = "";
  let requirementsCompleted = false;
  let onboardingUrl = "";

  // Date picker state
  let dobOpen = false;
  let dobValue: CalendarDate | undefined;

  // Select options
  const contractorTypes = [
    { value: "individual", label: "Individual" },
    { value: "business", label: "Business" },
  ];

  const states = [
    { value: "NSW", label: "NSW" },
    { value: "VIC", label: "VIC" },
    { value: "QLD", label: "QLD" },
    { value: "WA", label: "WA" },
    { value: "SA", label: "SA" },
    { value: "TAS", label: "TAS" },
    { value: "ACT", label: "ACT" },
    { value: "NT", label: "NT" },
  ];

  const countries = [{ value: "AU", label: "Australia" }];

  // Derived values for select triggers
  // Computed labels for select components
  $: contractorTypeLabel =
    contractorTypes.find((t) => t.value === formData.contractorType)?.label ??
    "Select contractor type";
  $: stateLabel =
    states.find((s) => s.value === formData.address.state)?.label ??
    "Select State";
  $: countryLabel =
    countries.find((c) => c.value === formData.address.country)?.label ??
    "Select Country";

  onMount(async () => {
    // Initialize contractor store
    await contractorStore.initialize();

    // Initialize date picker value if dateOfBirth exists
    if (formData.dateOfBirth && !dobValue) {
      try {
        dobValue = parseDate(formData.dateOfBirth);
      } catch (err) {
        console.warn("Failed to parse existing date of birth:", err);
      }
    }
  });

  function createConnectAccount() {
    // Connect account functionality will be implemented here
  }

  function openStripeOnboarding() {
    if (onboardingUrl) {
      window.open(onboardingUrl, "_blank");
    }
  }

  function nextStep() {
    if (currentStep < totalSteps) {
      contractorStore.setCurrentStep(currentStep + 1);
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      contractorStore.setCurrentStep(currentStep - 1);
    }
  }

  function handleInputChange() {
    // Auto-save is handled by the store
  }

  function updateFormData(field: string, value: any) {
    contractorStore.updateFormData({ [field]: value });
  }

  function updateAddressField(field: string, value: string) {
    contractorStore.updateFormData({
      address: { ...formData.address, [field]: value },
    });
  }

  function handleInputEvent(field: string, event: Event) {
    const target = event.target as HTMLInputElement;
    if (target) {
      updateFormData(field, target.value);
    }
  }

  function handleAddressInputEvent(field: string, event: Event) {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (target) {
      updateAddressField(field, target.value);
    }
  }

  // Validation states come from derived stores

  function getStepTitle(step: number) {
    switch (step) {
      case 1:
        return "Basic Information";
      case 2:
        return formData.contractorType === "individual"
          ? "Personal Details"
          : "Business Details";
      case 3:
        return "Address Information";
      case 4:
        return "Review & Submit";
      default:
        return "Step " + step;
    }
  }

  function getProgressPercentage() {
    // Calculate progress based on current step completion
    return (currentStep / totalSteps) * 100;
  }

  function updateProgressBar() {
    const percentage = getProgressPercentage();

    try {
      animate(".contractor-progress", {
        width: `${percentage}%`,
        duration: 800,
        easing: "easeOutQuad",
      });
    } catch (error) {
      const progressBar = document.querySelector(
        ".contractor-progress",
      ) as HTMLElement;
      if (progressBar) {
        progressBar.style.width = `${percentage}%`;
      }
    }
  }

  // Update progress bar when current step changes
  $: if (currentStep) {
    setTimeout(updateProgressBar, 100);
  }
</script>

<AppLayout
  title="Contractor Onboarding"
  showBackButton={true}
  onBack={() => history.back()}
>
  <!-- Progress Bar -->
  <div class="mb-4">
    <div class="text-center mb-2">
      <span class="text-sm font-medium">Step {currentStep} of {totalSteps}</span
      >
    </div>
    <div
      class="w-full h-3 bg-muted rounded-full overflow-hidden border border-border"
    >
      <div
        class="contractor-progress h-full bg-primary rounded-full"
        style="width: 0%"
      ></div>
    </div>
  </div>

  <!-- Status Messages -->
  {#if error}
    <div
      class="rounded-lg border border-destructive/50 bg-destructive/10 p-4 mb-6"
    >
      <div class="flex items-center gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span class="text-sm text-destructive font-medium">{error}</span>
      </div>
    </div>
  {/if}

  {#if success}
    <div class="rounded-lg border border-green-500/50 bg-green-500/10 p-4 mb-6">
      <div class="flex items-center gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span class="text-sm text-green-600 font-medium">{success}</span>
      </div>
    </div>
  {/if}

  <!-- KYC Form -->
  <div class="mt-6">

    <!-- Step 1: Basic Information -->
    {#if currentStep === 1}
      <div class="space-y-6">
        <div class="space-y-2">
          <Label for="contractor-type">Contractor Type</Label>
          <Select.Root
            type="single"
            name="contractorType"
            value={formData.contractorType}
            onValueChange={(value) => updateFormData("contractorType", value)}
          >
            <Select.Trigger class="w-full">
              {contractorTypeLabel}
            </Select.Trigger>
            <Select.Content>
              <Select.Group>
                {#each contractorTypes as type (type.value)}
                  <Select.Item value={type.value} label={type.label}>
                    {type.label}
                  </Select.Item>
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>
        </div>

        <div class="space-y-2">
          <Label for="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            placeholder="your@email.com"
            value={formData.email}
            oninput={(e) => handleInputEvent("email", e)}
            required
          />
        </div>
      </div>
    {/if}

    <!-- Step 2: Personal/Business Details -->
    {#if currentStep === 2}
      <div class="space-y-6">
        {#if formData.contractorType === "individual"}
          <!-- First and Last Name on same row -->
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="first-name">First Name</Label>
              <Input
                id="first-name"
                type="text"
                placeholder="John"
                value={formData.firstName}
                oninput={(e) => handleInputEvent("firstName", e)}
                required
              />
            </div>

            <div class="space-y-2">
              <Label for="last-name">Last Name</Label>
              <Input
                id="last-name"
                type="text"
                placeholder="Doe"
                value={formData.lastName}
                oninput={(e) => handleInputEvent("lastName", e)}
                required
              />
            </div>
          </div>

          <!-- Phone and Date of Birth on same row -->
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+61 400 000 000"
                value={formData.phone}
                oninput={(e) => handleInputEvent("phone", e)}
              />
            </div>

            <div class="space-y-2">
              <Label for="dob">Date of Birth</Label>
              <Popover.Root bind:open={dobOpen}>
                <Popover.Trigger>
                  {#snippet child({ props })}
                    <Button
                      {...props}
                      variant="outline"
                      class="w-full justify-between font-normal h-10 px-3 py-2 text-sm"
                    >
                      {dobValue
                        ? dobValue
                            .toDate(getLocalTimeZone())
                            .toLocaleDateString()
                        : "Select date"}
                      <ChevronDownIcon class="h-4 w-4" />
                    </Button>
                  {/snippet}
                </Popover.Trigger>
                <Popover.Content
                  class="w-auto overflow-hidden p-0"
                  align="end"
                  side="top"
                >
                  <Calendar
                    type="single"
                    bind:value={dobValue}
                    captionLayout="dropdown"
                    onValueChange={(date) => {
                      dobOpen = false;
                      if (date) {
                        dobValue = date as CalendarDate;
                        updateFormData("dateOfBirth", date.toString());
                      }
                    }}
                    maxValue={today(getLocalTimeZone())}
                  />
                </Popover.Content>
              </Popover.Root>
            </div>
          </div>
        {:else}
          <div class="space-y-2">
            <Label for="business-name">Business Name</Label>
            <Input
              id="business-name"
              type="text"
              placeholder="Your Business Pty Ltd"
              value={formData.businessName}
              oninput={(e) => handleInputEvent("businessName", e)}
              required
            />
          </div>

          <div class="space-y-2">
            <Label for="business-tax-id">Business Tax ID (ABN)</Label>
            <Input
              id="business-tax-id"
              type="text"
              placeholder="12 345 678 901"
              value={formData.businessTaxId}
              oninput={(e) => handleInputEvent("businessTaxId", e)}
              required
            />
          </div>

          <div class="space-y-2">
            <Label for="business-url">Business Website (Optional)</Label>
            <Input
              id="business-url"
              type="url"
              placeholder="https://yourbusiness.com"
              value={formData.businessUrl}
              oninput={(e) => handleInputEvent("businessUrl", e)}
            />
          </div>

          <div class="space-y-2">
            <Label for="business-description"
              >Business Description (Optional)</Label
            >
            <textarea
              id="business-description"
              class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Brief description of your business..."
              value={formData.businessDescription}
              oninput={(e) => handleInputEvent("businessDescription", e)}
            ></textarea>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Step 3: Address Information -->
    {#if currentStep === 3}
      <div class="space-y-6">
        <div class="space-y-2">
          <Label for="address-line1">Street Address</Label>
          <Input
            id="address-line1"
            type="text"
            placeholder="123 Main Street"
            value={formData.address.line1}
            oninput={(e) => handleAddressInputEvent("line1", e)}
            required
          />
        </div>

        <div class="space-y-2">
          <Label for="address-line2">Apartment, suite, etc. (Optional)</Label>
          <Input
            id="address-line2"
            type="text"
            placeholder="Unit 4"
            value={formData.address.line2}
            oninput={(e) => handleAddressInputEvent("line2", e)}
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="city">City</Label>
            <Input
              id="city"
              type="text"
              placeholder="Sydney"
              value={formData.address.city}
              oninput={(e) => handleAddressInputEvent("city", e)}
              required
            />
          </div>

          <div class="space-y-2">
            <Label for="state">State</Label>
            <Select.Root
              type="single"
              name="state"
              value={formData.address.state}
              onValueChange={(value) => updateAddressField("state", value)}
            >
              <Select.Trigger class="w-full">
                {stateLabel}
              </Select.Trigger>
              <Select.Content>
                <Select.Group>
                  {#each states as state (state.value)}
                    <Select.Item value={state.value} label={state.label}>
                      {state.label}
                    </Select.Item>
                  {/each}
                </Select.Group>
              </Select.Content>
            </Select.Root>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="postal-code">Postal Code</Label>
            <Input
              id="postal-code"
              type="text"
              placeholder="2000"
              value={formData.address.postalCode}
              oninput={(e) => handleAddressInputEvent("postalCode", e)}
              required
            />
          </div>

          <div class="space-y-2">
            <Label for="country">Country</Label>
            <Select.Root
              type="single"
              name="country"
              value={formData.address.country}
              onValueChange={(value) => updateAddressField("country", value)}
            >
              <Select.Trigger class="w-full">
                {countryLabel}
              </Select.Trigger>
              <Select.Content>
                <Select.Group>
                  {#each countries as country (country.value)}
                    <Select.Item value={country.value} label={country.label}>
                      {country.label}
                    </Select.Item>
                  {/each}
                </Select.Group>
              </Select.Content>
            </Select.Root>
          </div>
        </div>
      </div>
    {/if}

    <!-- Step 4: Review & Submit -->
    {#if currentStep === 4}
      <div class="space-y-4">
        <!-- Contractor Type Card -->
        <Card.Root>
          <Card.Header>
            <div class="flex items-center gap-3">
              {#if formData.contractorType === "individual"}
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10"
                >
                  <UserIcon class="h-5 w-5 text-primary" />
                </div>
                <div class="pt-1">
                  <Card.Title>Individual Contractor</Card.Title>
                  <Card.Description>Personal account</Card.Description>
                </div>
              {:else}
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10"
                >
                  <BuildingIcon class="h-5 w-5 text-primary" />
                </div>
                <div class="pt-1">
                  <Card.Title>Business Contractor</Card.Title>
                  <Card.Description>Company account</Card.Description>
                </div>
              {/if}
            </div>
          </Card.Header>
        </Card.Root>

        <!-- Contact Information Card -->
        <Card.Root>
          <Card.Content>
            <div class="space-y-4">
              {#if formData.contractorType === "individual"}
                <div>
                  <div class="text-lg font-semibold mb-2">
                    {formData.firstName}
                    {formData.lastName}
                  </div>
                </div>

                {#if formData.phone}
                  <div>
                    <div class="text-sm text-muted-foreground mb-1">Phone</div>
                    <div class="text-sm">{formData.phone}</div>
                  </div>
                {/if}
              {:else}
                <div>
                  <div class="text-lg font-semibold mb-2">
                    {formData.businessName}
                  </div>
                </div>

                <div>
                  <div class="text-sm text-muted-foreground mb-1">Tax ID</div>
                  <div class="text-sm">{formData.businessTaxId}</div>
                </div>
              {/if}

              <div>
                <div class="text-sm text-muted-foreground mb-1">Email</div>
                <div class="text-sm">{formData.email}</div>
              </div>

              <div>
                <div class="text-sm text-muted-foreground mb-1">Address</div>
                <div class="text-sm">
                  {formData.address.line1}
                  {#if formData.address.line2}, {formData.address.line2}{/if}
                  <br />
                  {formData.address.city}, {formData.address.state}
                  {formData.address.postalCode}
                  <br />
                  {formData.address.country}
                </div>
              </div>
            </div>
          </Card.Content>
        </Card.Root>

        {#if !connectAccountId}
          <div
            class="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4"
          >
            <span class="text-sm text-yellow-600 font-medium"
              >This will create your Stripe Connect account. You'll then need to
              complete additional verification through Stripe's secure
              onboarding process.</span
            >
          </div>
        {/if}
      </div>
    {/if}

    <!-- Navigation Buttons -->
    <div class="mt-6">
      {#if currentStep === 1}
        <!-- First step: only Next button, full width -->
        <div class="w-full">
          <Button class="w-full" onclick={nextStep} disabled={!step1Valid}>
            Next
          </Button>
        </div>
      {:else if currentStep === totalSteps}
        <!-- Last step: Previous and action buttons -->
        {#if !requirementsCompleted}
          <div class="grid grid-cols-2 gap-4">
            <Button variant="outline" onclick={prevStep}>Previous</Button>
            {#if !connectAccountId}
              <Button onclick={createConnectAccount} disabled={loading}>
                {#if loading}
                  <svg
                    class="animate-spin -ml-1 mr-3 h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      class="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                    ></circle>
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Creating Account...
                {:else}
                  Create account
                {/if}
              </Button>
            {:else}
              <Button onclick={openStripeOnboarding}>
                Complete Stripe Onboarding
              </Button>
            {/if}
          </div>
        {:else}
          <!-- Completed state - full width success message -->
          <div
            class="rounded-lg border border-green-500/50 bg-green-500/10 p-4"
          >
            <div class="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span class="text-sm text-green-600 font-medium"
                >Contractor onboarding completed! You can now start earning on
                our platform.</span
              >
            </div>
          </div>
        {/if}
      {:else}
        <!-- Middle steps: Previous and Next buttons, 50/50 width -->
        <div class="grid grid-cols-2 gap-4">
          <Button variant="outline" onclick={prevStep}>Previous</Button>
          <Button
            onclick={nextStep}
            disabled={(currentStep === 2 && !step2Valid) ||
              (currentStep === 3 && !step3Valid)}
          >
            Next
          </Button>
        </div>
      {/if}
    </div>
  </div>
</AppLayout>
