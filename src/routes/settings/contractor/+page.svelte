<script lang="ts">
  import { onMount } from "svelte";
  import { animate } from "animejs";
  import { invoke } from "@tauri-apps/api/core";
  import {
    contractorStore,
    step1Valid,
    step2Valid,
    step3Valid,
    step4Valid,
    step5Valid,
    step6Valid,
    step7Valid,
    step8Valid,
  } from "$lib/stores/contractorStore";
  import { sessionStore } from "$lib/stores/sessionStore";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import * as Card from "$lib/components/ui/card";
  import { toast } from "svelte-sonner";
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

  // State variables from store with null checking
  $: ({ formData, currentStep, loading, error, success } =
    $contractorStore);
  
  // Dynamic total steps based on contractor type
  $: totalSteps = formData?.contractorType === 'individual' ? 6 : 8;
  
  // Map actual step to display step for individuals (skipping steps 5 & 6)
  $: displayStep = formData?.contractorType === 'individual' && currentStep > 4 
    ? currentStep - 2  // Steps 7,8 become 5,6 for individuals
    : currentStep;
  
  // Ensure formData is properly initialized with bankAccount
  $: if (formData && !formData.bankAccount) {
    contractorStore.updateFormData({
      bankAccount: {
        accountHolderName: "",
        accountNumber: "",
        routingNumber: "",
        bankName: "",
        accountType: "checking"
      }
    });
  }

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
    try {
      console.log('Initializing contractor page...');
      
      // Initialize contractor store with error handling
      await contractorStore.initialize();
      console.log('Contractor store initialized successfully');
      
      // Check if contractor account already exists
      await checkExistingContractor();
    } catch (error) {
      console.error('Failed to initialize contractor store:', error);
      toast.error('Failed to load contractor data. Please refresh the page.');
      return;
    }
    
    // Initialize date picker value if dateOfBirth exists
    if (formData.dateOfBirth && !dobValue) {
      try {
        dobValue = parseDate(formData.dateOfBirth);
      } catch (err) {
        console.warn("Failed to parse existing date of birth:", err);
      }
    }
  });

  async function createConnectAccount() {
    console.log("🚀 Starting contractor account creation process...");
    contractorStore.setLoading(true);
    contractorStore.clearMessages();
    
    try {
      // Get current session
      console.log("📋 Getting current session...");
      let currentSession: any;
      const unsubscribe = sessionStore.subscribe((state: any) => {
        currentSession = state;
      });
      unsubscribe();
      
      console.log("🔐 Session state:", {
        isAuthenticated: currentSession?.isAuthenticated,
        hasUser: !!currentSession?.user,
        userId: currentSession?.user?.id
      });
      
      if (!currentSession?.isAuthenticated || !currentSession.user?.id) {
        console.error("❌ Authentication failed - no valid session");
        toast.error("Not authenticated");
        return;
      }

      // Convert form data to match backend structure
      console.log("📝 Converting form data...");
      const kycData = {
        contractorType: formData.contractorType,
        email: formData.email,
        firstName: formData.contractorType === "individual" ? formData.firstName : null,
        lastName: formData.contractorType === "individual" ? formData.lastName : null,
        phone: formData.contractorType === "individual" ? formData.phone : null,
        dateOfBirth: formData.contractorType === "individual" ? formData.dateOfBirth : null,
        address: {
          line1: formData.address.line1,
          line2: formData.address.line2 || null,
          city: formData.address.city,
          state: formData.address.state,
          postalCode: formData.address.postalCode,
          country: formData.address.country,
        },
        businessName: formData.contractorType === "business" ? formData.businessName : null,
        businessTaxId: formData.contractorType === "business" ? formData.businessTaxId : null,
        businessUrl: formData.contractorType === "business" ? formData.businessUrl : null,
        businessDescription: formData.contractorType === "business" ? formData.businessDescription : null,
      };

      console.log("📊 KYC Data prepared:", {
        contractorType: kycData.contractorType,
        email: kycData.email,
        hasAddress: !!kycData.address.line1,
        addressCountry: kycData.address.country,
        isIndividual: kycData.contractorType === "individual",
        hasBusiness: kycData.contractorType === "business" && !!kycData.businessName
      });

      // Create contractor profile and Stripe Connect account
      console.log("🔄 Calling backend create_contractor_profile...");
      const startTime = Date.now();
      
      const contractor = await invoke<any>("create_contractor_profile", {
        userId: currentSession.user.id,
        kycData: kycData,
      });

      const endTime = Date.now();
      console.log(`✅ Backend call completed in ${endTime - startTime}ms`);
      console.log("📋 Contractor response:", {
        hasConnectAccountId: !!contractor.stripe_connect_account_id,
        connectAccountId: contractor.stripe_connect_account_id,
        requirementsCompleted: contractor.stripe_connect_requirements_completed,
        responseKeys: Object.keys(contractor)
      });

      // Update local state
      connectAccountId = contractor.stripe_connect_account_id;
      requirementsCompleted = contractor.stripe_connect_requirements_completed || false;
      
      console.log("🔄 Local state updated:", {
        connectAccountId,
        requirementsCompleted
      });
      
      // Set success message
      toast.success("Contractor account created successfully! Please complete Stripe onboarding to start earning.");
      console.log("✅ Success toast displayed");
      
      // Clear saved form data since we've successfully submitted
      console.log("🧹 Clearing saved form data...");
      await invoke("save_kyc_form_data", {
        userId: currentSession.user.id,
        kycData: {},
      });
      console.log("✅ Form data cleared successfully");

    } catch (error: any) {
      console.error("❌ Failed to create contractor account:", error);
      console.error("❌ Error details:", {
        message: error.message || error,
        stack: error.stack,
        type: typeof error
      });
      toast.error(`Failed to create contractor account: ${error}`);
    } finally {
      console.log("🏁 Contractor account creation process finished");
      contractorStore.setLoading(false);
    }
  }

  async function openStripeOnboarding() {
    if (!connectAccountId) {
      toast.error("No Stripe Connect account found");
      return;
    }

    try {
      contractorStore.setLoading(true);

      const result = await invoke<{ onboarding_url: string }>("get_stripe_onboarding_url", {
        connectAccountId: connectAccountId,
      });

      // Open the onboarding URL in the system browser
      await invoke("open_url_in_browser", { url: result.onboarding_url });
      toast.success("Opening Stripe onboarding in your browser...");
      
    } catch (error) {
      console.error("Failed to get onboarding URL:", error);
      toast.error(`Failed to open Stripe onboarding: ${error}`);
    } finally {
      contractorStore.setLoading(false);
    }
  }


  async function checkExistingContractor() {
    try {
      // Get current session
      let currentSession: any;
      const unsubscribe = sessionStore.subscribe((state: any) => {
        currentSession = state;
      });
      unsubscribe();
      
      if (!currentSession?.isAuthenticated || !currentSession.user?.id) {
        return;
      }

      // Check if contractor profile already exists
      const contractor = await invoke<any>("get_contractor_profile", {
        userId: currentSession.user.id,
      });

      if (contractor) {
        connectAccountId = contractor.stripe_connect_account_id;
        requirementsCompleted = contractor.stripe_connect_requirements_completed || false;
        
        // If contractor exists but requirements not completed, show appropriate state
        if (connectAccountId && !requirementsCompleted) {
          contractorStore.setSuccess("Contractor account found. Please complete Stripe onboarding to start earning.");
        } else if (requirementsCompleted) {
          contractorStore.setSuccess("Contractor onboarding completed! You can now start earning on our platform.");
        }
      }
    } catch (error) {
      console.warn("Could not check existing contractor:", error);
    }
  }

  function nextStep() {
    const nextValidStep = getNextValidStep(currentStep);
    if (nextValidStep <= totalSteps) {
      // Ensure current step data is saved before proceeding
      if (currentStep === 1) {
        // Save email and contractor type immediately
        contractorStore.updateFormData({ 
          email: formData.email,
          contractorType: formData.contractorType 
        });
      }
      contractorStore.setCurrentStep(nextValidStep);
    }
  }

  function prevStep() {
    const prevValidStep = getPrevValidStep(currentStep);
    if (prevValidStep >= 1) {
      contractorStore.setCurrentStep(prevValidStep);
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
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    
    // Handle nested bank account fields
    if (field.startsWith("bankAccount.")) {
      const bankField = field.split(".")[1];
      updateFormData("bankAccount", {
        ...formData.bankAccount,
        [bankField]: target.value
      });
    } else {
      updateFormData(field, target.value);
    }
  }

  function handleAddressInputEvent(field: string, event: Event) {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (target) {
      updateAddressField(field, target.value);
    }
  }

  // Reactive handlers for immediate updates
  function handleEmailInput(event: Event) {
    const target = event.target as HTMLInputElement;
    formData.email = target.value;
    contractorStore.updateFormData({ email: target.value });
  }

  function handleFirstNameInput(event: Event) {
    const target = event.target as HTMLInputElement;
    formData.firstName = target.value;
    contractorStore.updateFormData({ firstName: target.value });
  }

  function handleLastNameInput(event: Event) {
    const target = event.target as HTMLInputElement;
    formData.lastName = target.value;
    contractorStore.updateFormData({ lastName: target.value });
  }

  function handlePhoneInput(event: Event) {
    const target = event.target as HTMLInputElement;
    formData.phone = target.value;
    contractorStore.updateFormData({ phone: target.value });
  }

  function handleBusinessNameInput(event: Event) {
    const target = event.target as HTMLInputElement;
    formData.businessName = target.value;
    contractorStore.updateFormData({ businessName: target.value });
  }

  function handleBusinessTaxIdInput(event: Event) {
    const target = event.target as HTMLInputElement;
    formData.businessTaxId = target.value;
    contractorStore.updateFormData({ businessTaxId: target.value });
  }

  function handleBusinessUrlInput(event: Event) {
    const target = event.target as HTMLInputElement;
    formData.businessUrl = target.value;
    contractorStore.updateFormData({ businessUrl: target.value });
  }

  function handleAddressLine1Input(event: Event) {
    const target = event.target as HTMLInputElement;
    formData.address.line1 = target.value;
    updateAddressField('line1', target.value);
  }

  function handleAddressLine2Input(event: Event) {
    const target = event.target as HTMLInputElement;
    formData.address.line2 = target.value;
    updateAddressField('line2', target.value);
  }

  function handleAddressCityInput(event: Event) {
    const target = event.target as HTMLInputElement;
    formData.address.city = target.value;
    updateAddressField('city', target.value);
  }

  function handleAddressPostalCodeInput(event: Event) {
    const target = event.target as HTMLInputElement;
    formData.address.postalCode = target.value;
    updateAddressField('postalCode', target.value);
  }

  // Validation states come from derived stores

  function getStepTitle(step: number): string {
    // For individuals, map display steps to actual step titles
    if (formData?.contractorType === 'individual') {
      switch (step) {
        case 1:
          return "Basic Information";
        case 2:
          return "Personal Information";
        case 3:
          return "Address Information";
        case 4:
          return "Bank Account";
        case 5:
          return "Document Uploads"; 
        case 6:
          return "Review & Submit"; 
        default:
          return "Step " + step;
      }
    }
    
    // For businesses, use original step mapping
    switch (step) {
      case 1:
        return "Basic Information";
      case 2:
        return "Business Information";
      case 3:
        return "Address Information";
      case 4:
        return "Bank Account";
      case 5:
        return "Beneficial Owners";
      case 6:
        return "Representatives";
      case 7:
        return "Document Uploads";
      case 8:
        return "Review & Submit";
      default:
        return "Step " + step;
    }
  }

  function getProgressPercentage() {
    // Calculate progress based on dynamic step completion
    return (displayStep / totalSteps) * 100;
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

  // Beneficial Owner management functions
  function addBeneficialOwner() {
    const newOwner = {
      contractorId: formData.email,
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      ownershipPercentage: 25,
      address: {
        line1: '',
        line2: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'AU'
      }
    };
    
    contractorStore.updateFormData({
      beneficialOwners: [...formData.beneficialOwners, newOwner]
    });
  }

  function removeBeneficialOwner(index: number) {
    const updatedOwners = formData.beneficialOwners.filter((_, i) => i !== index);
    contractorStore.updateFormData({ beneficialOwners: updatedOwners });
  }

  function updateBeneficialOwner(index: number, field: string, value: any) {
    const updatedOwners = [...formData.beneficialOwners];
    updatedOwners[index] = { ...updatedOwners[index], [field]: value };
    contractorStore.updateFormData({ beneficialOwners: updatedOwners });
  }

  // Representative management functions
  function addRepresentative() {
    const newRep = {
      contractorId: formData.email,
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      title: '',
      address: {
        line1: '',
        line2: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'AU'
      }
    };
    
    contractorStore.updateFormData({
      representatives: [...formData.representatives, newRep]
    });
  }

  function removeRepresentative(index: number) {
    const updatedReps = formData.representatives.filter((_, i) => i !== index);
    contractorStore.updateFormData({ representatives: updatedReps });
  }

  function updateRepresentative(index: number, field: string, value: any) {
    const updatedReps = [...formData.representatives];
    updatedReps[index] = { ...updatedReps[index], [field]: value };
    contractorStore.updateFormData({ representatives: updatedReps });
  }

  // Document upload functions
  async function handleDocumentUpload(event: Event, documentType: string, documentPurpose: string) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;
    
    try {
      // Add document to UI immediately with pending status
      const tempDoc = {
        id: Date.now().toString(),
        contractorId: formData.email,
        documentType,
        documentPurpose,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        uploadStatus: 'uploading',
        createdAt: new Date().toISOString()
      };
      
      contractorStore.updateFormData({
        documentUploads: [...formData.documentUploads, tempDoc]
      });
      
      // Simulate document upload for now
      const uploadedDoc = {
        ...tempDoc,
        uploadStatus: 'uploaded',
        stripeFileId: 'file_' + Date.now()
      };
      
      // Update the document in the store
      contractorStore.updateFormData({
        documentUploads: formData.documentUploads.map(doc => 
          doc.id === tempDoc.id ? uploadedDoc : doc
        )
      });
      
      toast.success(`Document ${file.name} uploaded successfully`);
      
    } catch (error) {
      console.error('Document upload failed:', error);
      toast.error(`Failed to upload ${file.name}: ${error}`);
      
      // Remove failed document from UI
      const updatedDocs = formData.documentUploads.filter(doc => doc.filename !== file.name);
      contractorStore.updateFormData({ documentUploads: updatedDocs });
    }
    
    // Clear the input
    input.value = '';
  }

  function removeDocument(documentId: string) {
    const updatedDocs = formData.documentUploads.filter(doc => doc.id !== documentId);
    contractorStore.updateFormData({ documentUploads: updatedDocs });
  }

  // Skip logic for business-only steps
  function shouldSkipStep(step: number): boolean {
    if (formData.contractorType === 'individual') {
      // Skip beneficial owners and representatives for individuals
      return step === 5 || step === 6;
    }
    return false;
  }

  // Check if a step should be displayed (handles both skip logic and conditional rendering)
  function shouldDisplayStep(step: number): boolean {
    if (shouldSkipStep(step)) {
      return false;
    }
    
    // Additional conditional checks for business-only steps
    if ((step === 5 || step === 6) && formData.contractorType !== 'business') {
      return false;
    }
    
    return true;
  }

  function getNextValidStep(currentStep: number): number {
    let nextStep = currentStep + 1;
    while (nextStep <= totalSteps && shouldSkipStep(nextStep)) {
      nextStep++;
    }
    return nextStep;
  }

  function getPrevValidStep(currentStep: number): number {
    let prevStep = currentStep - 1;
    while (prevStep >= 1 && shouldSkipStep(prevStep)) {
      prevStep--;
    }
    return prevStep;
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
      <span class="text-sm font-medium">Step {displayStep} of {totalSteps}</span
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
            oninput={handleEmailInput}
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
                oninput={handleFirstNameInput}
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
                oninput={handleLastNameInput}
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
                oninput={handlePhoneInput}
                required
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

          <!-- National ID Information -->
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="national-id-type">National ID Type</Label>
              <Select.Root
                type="single"
                name="nationalIdType"
                value={formData.nationalIdType}
                onValueChange={(value) => updateFormData("nationalIdType", value)}
              >
                <Select.Trigger class="w-full">
                  {formData.nationalIdType === "ssn" ? "Social Security Number (SSN)" :
                   formData.nationalIdType === "tin" ? "Tax Identification Number (TIN)" :
                   formData.nationalIdType === "itin" ? "Individual Taxpayer ID (ITIN)" :
                   formData.nationalIdType === "ein" ? "Employer ID Number (EIN)" :
                   "Select ID type"}
                </Select.Trigger>
                <Select.Content>
                  <Select.Group>
                    <Select.Item value="ssn" label="Social Security Number (SSN)">
                      Social Security Number (SSN)
                    </Select.Item>
                    <Select.Item value="tin" label="Tax Identification Number (TIN)">
                      Tax Identification Number (TIN)
                    </Select.Item>
                    <Select.Item value="itin" label="Individual Taxpayer ID (ITIN)">
                      Individual Taxpayer ID (ITIN)
                    </Select.Item>
                    <Select.Item value="ein" label="Employer ID Number (EIN)">
                      Employer ID Number (EIN)
                    </Select.Item>
                  </Select.Group>
                </Select.Content>
              </Select.Root>
            </div>

            <div class="space-y-2">
              <Label for="national-id-number">National ID Number</Label>
              <Input
                id="national-id-number"
                type="text"
                placeholder="123-45-6789"
                value={formData.nationalIdNumber}
                oninput={(e) => handleInputEvent("nationalIdNumber", e)}
                required
              />
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
              oninput={handleBusinessNameInput}
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
              oninput={handleBusinessTaxIdInput}
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
              oninput={handleBusinessUrlInput}
            />
          </div>

          <div class="space-y-2">
            <Label for="business-description">Business Description</Label>
            <textarea
              id="business-description"
              class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Brief description of your business..."
              value={formData.businessDescription}
              oninput={(e) => handleInputEvent("businessDescription", e)}
              required
            ></textarea>
          </div>

          <!-- Industry and Company Information -->
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="industry-mcc-code">Industry MCC Code</Label>
              <Input
                id="industry-mcc-code"
                type="text"
                placeholder="5734"
                value={formData.industryMccCode}
                oninput={(e) => handleInputEvent("industryMccCode", e)}
                maxlength={4}
                pattern="[0-9]{4}"
                required
              />
              <p class="text-xs text-muted-foreground">4-digit Merchant Category Code</p>
            </div>

            <div class="space-y-2">
              <Label for="company-structure">Company Structure</Label>
              <Select.Root
                type="single"
                name="companyStructure"
                value={formData.companyStructure}
                onValueChange={(value) => updateFormData("companyStructure", value)}
              >
                <Select.Trigger class="w-full">
                  {formData.companyStructure === "corporation" ? "Corporation" :
                   formData.companyStructure === "llc" ? "Limited Liability Company (LLC)" :
                   formData.companyStructure === "partnership" ? "Partnership" :
                   formData.companyStructure === "sole_proprietorship" ? "Sole Proprietorship" :
                   formData.companyStructure === "non_profit" ? "Non-Profit Organization" :
                   "Select structure"}
                </Select.Trigger>
                <Select.Content>
                  <Select.Group>
                    <Select.Item value="corporation" label="Corporation">
                      Corporation
                    </Select.Item>
                    <Select.Item value="llc" label="Limited Liability Company (LLC)">
                      Limited Liability Company (LLC)
                    </Select.Item>
                    <Select.Item value="partnership" label="Partnership">
                      Partnership
                    </Select.Item>
                    <Select.Item value="sole_proprietorship" label="Sole Proprietorship">
                      Sole Proprietorship
                    </Select.Item>
                    <Select.Item value="non_profit" label="Non-Profit Organization">
                      Non-Profit Organization
                    </Select.Item>
                  </Select.Group>
                </Select.Content>
              </Select.Root>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="company-registration-number">Company Registration Number</Label>
            <Input
              id="company-registration-number"
              type="text"
              placeholder="123456789"
              value={formData.companyRegistrationNumber}
              oninput={(e) => handleInputEvent("companyRegistrationNumber", e)}
              required
            />
            <p class="text-xs text-muted-foreground">Official company registration number</p>
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
            oninput={handleAddressLine1Input}
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
            oninput={handleAddressLine2Input}
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
              oninput={handleAddressCityInput}
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
              oninput={handleAddressPostalCodeInput}
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

    <!-- Step 4: Bank Account Information -->
    {#if currentStep === 4 && formData?.bankAccount}
      <div class="space-y-6">
        <div class="space-y-2">
          <Label for="account-holder-name">Account Holder Name</Label>
          <Input
            id="account-holder-name"
            type="text"
            placeholder="John Doe"
            value={formData.bankAccount.accountHolderName || ""}
            oninput={(e) => handleInputEvent("bankAccount.accountHolderName", e)}
            required
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="account-number">Account Number</Label>
            <Input
              id="account-number"
              type="text"
              placeholder="123456789"
              value={formData.bankAccount.accountNumber || ""}
              oninput={(e) => handleInputEvent("bankAccount.accountNumber", e)}
              required
            />
          </div>

          <div class="space-y-2">
            <Label for="routing-number">Routing Number</Label>
            <Input
              id="routing-number"
              type="text"
              placeholder="021000021"
              value={formData.bankAccount.routingNumber || ""}
              oninput={(e) => handleInputEvent("bankAccount.routingNumber", e)}
              maxlength={9}
              pattern="[0-9]{9}"
              required
            />
            <p class="text-xs text-muted-foreground">9-digit routing number</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="bank-name">Bank Name</Label>
            <Input
              id="bank-name"
              type="text"
              placeholder="Chase Bank"
              value={formData.bankAccount.bankName || ""}
              oninput={(e) => handleInputEvent("bankAccount.bankName", e)}
              required
            />
          </div>

          <div class="space-y-2">
            <Label for="account-type">Account Type</Label>
            <Select.Root
              type="single"
              name="accountType"
              value={formData.bankAccount.accountType || "checking"}
              onValueChange={(value) => updateFormData("bankAccount.accountType", value)}
            >
              <Select.Trigger class="w-full">
                {(formData.bankAccount.accountType || "checking") === "checking" ? "Checking Account" :
                 (formData.bankAccount.accountType || "checking") === "savings" ? "Savings Account" :
                 "Select account type"}
              </Select.Trigger>
              <Select.Content>
                <Select.Group>
                  <Select.Item value="checking" label="Checking Account">
                    Checking Account
                  </Select.Item>
                  <Select.Item value="savings" label="Savings Account">
                    Savings Account
                  </Select.Item>
                </Select.Group>
              </Select.Content>
            </Select.Root>
          </div>
        </div>

        <div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div class="flex items-start gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5 text-blue-600 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div class="text-sm">
              <p class="font-medium text-blue-900 mb-1">Bank Account Security</p>
              <p class="text-blue-700">
                Your bank account information is encrypted and securely stored. This information is required for payment processing and will be verified by Stripe.
              </p>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Step 5: Beneficial Owners -->
    {#if currentStep === 5 && formData.contractorType === "business"}
      <div class="space-y-6">
        <div class="mb-4">
          <h3 class="text-lg font-semibold mb-2">Beneficial Owners</h3>
          <p class="text-sm text-muted-foreground">
            List all individuals who own 25% or more of the business.
          </p>
        </div>

        {#each formData.beneficialOwners as owner, index (owner.id || index)}
          <Card.Root>
            <Card.Header>
              <Card.Title>Beneficial Owner {index + 1}</Card.Title>
            </Card.Header>
            <Card.Content>
              <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <Label for="bo-first-name-{index}">First Name</Label>
                    <Input
                      id="bo-first-name-{index}"
                      type="text"
                      placeholder="John"
                      value={owner.firstName}
                      oninput={(e) => updateBeneficialOwner(index, 'firstName', (e.target as HTMLInputElement)?.value || '')}
                      required
                    />
                  </div>
                  <div class="space-y-2">
                    <Label for="bo-last-name-{index}">Last Name</Label>
                    <Input
                      id="bo-last-name-{index}"
                      type="text"
                      placeholder="Doe"
                      value={owner.lastName}
                      oninput={(e) => updateBeneficialOwner(index, 'lastName', (e.target as HTMLInputElement)?.value || '')}
                      required
                    />
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <Label for="bo-dob-{index}">Date of Birth</Label>
                    <Input
                      id="bo-dob-{index}"
                      type="date"
                      value={owner.dateOfBirth}
                      oninput={(e) => updateBeneficialOwner(index, 'dateOfBirth', (e.target as HTMLInputElement)?.value || '')}
                      required
                    />
                  </div>
                  <div class="space-y-2">
                    <Label for="bo-ownership-{index}">Ownership Percentage</Label>
                    <Input
                      id="bo-ownership-{index}"
                      type="number"
                      min="25"
                      max="100"
                      placeholder="25"
                      value={owner.ownershipPercentage}
                      oninput={(e) => updateBeneficialOwner(index, 'ownershipPercentage', parseFloat((e.target as HTMLInputElement)?.value || '25'))}
                      required
                    />
                  </div>
                </div>

                <Button
                  variant="destructive"
                  size="sm"
                  onclick={() => removeBeneficialOwner(index)}
                >
                  Remove Owner
                </Button>
              </div>
            </Card.Content>
          </Card.Root>
        {/each}

        <Button
          variant="outline"
          onclick={addBeneficialOwner}
          class="w-full"
        >
          Add Beneficial Owner
        </Button>
      </div>
    {/if}

    <!-- Step 6: Representatives -->
    {#if currentStep === 6 && formData.contractorType === "business"}
      <div class="space-y-6">
        <div class="mb-4">
          <h3 class="text-lg font-semibold mb-2">Company Representatives</h3>
          <p class="text-sm text-muted-foreground">
            Add authorized representatives who can act on behalf of the company.
          </p>
        </div>

        {#each formData.representatives as rep, index (rep.id || index)}
          <Card.Root>
            <Card.Header>
              <Card.Title>Representative {index + 1}</Card.Title>
            </Card.Header>
            <Card.Content>
              <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <Label for="rep-first-name-{index}">First Name</Label>
                    <Input
                      id="rep-first-name-{index}"
                      type="text"
                      placeholder="Jane"
                      value={rep.firstName}
                      oninput={(e) => updateRepresentative(index, 'firstName', (e.target as HTMLInputElement)?.value || '')}
                      required
                    />
                  </div>
                  <div class="space-y-2">
                    <Label for="rep-last-name-{index}">Last Name</Label>
                    <Input
                      id="rep-last-name-{index}"
                      type="text"
                      placeholder="Smith"
                      value={rep.lastName}
                      oninput={(e) => updateRepresentative(index, 'lastName', (e.target as HTMLInputElement)?.value || '')}
                      required
                    />
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <Label for="rep-title-{index}">Title</Label>
                    <Input
                      id="rep-title-{index}"
                      type="text"
                      placeholder="CEO"
                      value={rep.title}
                      oninput={(e) => updateRepresentative(index, 'title', (e.target as HTMLInputElement)?.value || '')}
                      required
                    />
                  </div>
                  <div class="space-y-2">
                    <Label for="rep-dob-{index}">Date of Birth</Label>
                    <Input
                      id="rep-dob-{index}"
                      type="date"
                      value={rep.dateOfBirth}
                      oninput={(e) => updateRepresentative(index, 'dateOfBirth', (e.target as HTMLInputElement)?.value || '')}
                      required
                    />
                  </div>
                </div>

                <Button
                  variant="destructive"
                  size="sm"
                  onclick={() => removeRepresentative(index)}
                >
                  Remove Representative
                </Button>
              </div>
            </Card.Content>
          </Card.Root>
        {/each}

        <Button
          variant="outline"
          onclick={addRepresentative}
          class="w-full"
        >
          Add Representative
        </Button>
      </div>
    {/if}

    <!-- Step 7: Document Uploads -->
    {#if currentStep === 7}
      <div class="space-y-6">
        <div class="mb-4">
          <h3 class="text-lg font-semibold mb-2">Document Uploads</h3>
          <p class="text-sm text-muted-foreground">
            Upload required documents for KYC verification. Accepted formats: PDF, JPG, PNG.
          </p>
        </div>

        <!-- Identity Document -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Identity Document</Card.Title>
            <Card.Description>
              Upload a government-issued ID (passport, driver's license, etc.)
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <div class="space-y-4">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onchange={(e) => handleDocumentUpload(e, 'identity_document', 'identity_verification')}
                class="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/80"
              />
              
              {#each formData.documentUploads.filter(doc => doc.documentType === 'identity_document') as doc (doc.id)}
                <div class="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div class="flex items-center gap-3">
                    <div class="w-2 h-2 rounded-full {doc.uploadStatus === 'uploaded' ? 'bg-green-500' : doc.uploadStatus === 'failed' ? 'bg-red-500' : 'bg-yellow-500'}"></div>
                    <span class="text-sm font-medium">{doc.filename}</span>
                    <span class="text-xs text-muted-foreground capitalize">{doc.uploadStatus}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => removeDocument(doc.id || '')}
                  >
                    Remove
                  </Button>
                </div>
              {/each}
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Address Verification -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Address Verification</Card.Title>
            <Card.Description>
              Upload a utility bill or bank statement showing your address
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <div class="space-y-4">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onchange={(e) => handleDocumentUpload(e, 'address_verification', 'additional_verification')}
                class="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/80"
              />
              
              {#each formData.documentUploads.filter(doc => doc.documentType === 'address_verification') as doc (doc.id)}
                <div class="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div class="flex items-center gap-3">
                    <div class="w-2 h-2 rounded-full {doc.uploadStatus === 'uploaded' ? 'bg-green-500' : doc.uploadStatus === 'failed' ? 'bg-red-500' : 'bg-yellow-500'}"></div>
                    <span class="text-sm font-medium">{doc.filename}</span>
                    <span class="text-xs text-muted-foreground capitalize">{doc.uploadStatus}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => removeDocument(doc.id || '')}
                  >
                    Remove
                  </Button>
                </div>
              {/each}
            </div>
          </Card.Content>
        </Card.Root>
      </div>
    {/if}

    <!-- Step 8: Review & Submit -->
    {#if currentStep === 8}
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
      </div>
    {/if}

    <!-- Navigation Buttons -->
    <div class="mt-6">
      {#if currentStep === 1}
        <!-- First step: only Next button, full width -->
        <div class="w-full">
          <Button class="w-full" onclick={nextStep} disabled={!$step1Valid}>
            Next
          </Button>
        </div>
      {:else if currentStep === totalSteps}
        <!-- Last step: Previous and action buttons -->
        {#if !requirementsCompleted}
          <div class="grid grid-cols-2 gap-4">
            <Button variant="outline" onclick={prevStep}>Previous</Button>
            {#if !connectAccountId}
              <div class="space-y-2">
                <Button onclick={createConnectAccount} disabled={loading} class="w-full">
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
              </div>
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
            disabled={(currentStep === 1 && !$step1Valid) ||
              (currentStep === 2 && !$step2Valid) ||
              (currentStep === 3 && !$step3Valid) ||
              (currentStep === 4 && !$step4Valid) ||
              (currentStep === 5 && !$step5Valid) ||
              (currentStep === 6 && !$step6Valid) ||
              (currentStep === 7 && !$step7Valid)}
          >
            Next
          </Button>
        </div>
      {/if}
    </div>
  </div>
</AppLayout>
