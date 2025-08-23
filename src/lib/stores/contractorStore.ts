import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { get } from 'svelte/store';
// Import centralizedAuth lazily to avoid initialization issues
let centralizedAuth: any = null;

// Import the working unified auth store
const getCentralizedAuth = async () => {
  if (!centralizedAuth) {
    const module = await import('./unifiedAuth');
    centralizedAuth = module.centralizedAuth;
  }
  return centralizedAuth;
};

// Simplified contractor store with fixed TypeScript issues

// Address interface for KYC entities
export interface ContractorAddress {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
}

// Types for new KYC entities
export interface BeneficialOwner {
    id?: string;
    contractorId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    ownershipPercentage: number;
    address: ContractorAddress;
    nationalIdNumber?: string;
    nationalIdType?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface Representative {
    id?: string;
    contractorId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    title: string;
    address: ContractorAddress;
    nationalIdNumber?: string;
    nationalIdType?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface DocumentUpload {
    id?: string;
    contractorId: string;
    documentType: string;
    documentPurpose: string;
    filename: string;
    fileSize?: number;
    mimeType?: string;
    stripeFileId?: string;
    localFilePath?: string;
    fileHash?: string;
    uploadStatus: string;
    uploadError?: string;
    verificationStatus?: string;
    verificationNotes?: string;
    requiredForCapability?: string;
    requirementId?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface ContractorFormData {
  contractorType: "individual" | "business";
  email: string;
  
  // Individual fields
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  nationalIdNumber: string;
  nationalIdType: string; // ssn, tin, etc.
  
  // Business fields
  businessName: string;
  businessTaxId: string;
  businessUrl: string;
  businessDescription: string;
  industryMccCode: string;
  companyRegistrationNumber: string;
  companyStructure: string; // corporation, llc, partnership, etc.
  
  // Address
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  
  // Bank account information
  bankAccount: {
    accountHolderName: string;
    accountNumber: string;
    routingNumber: string;
    bankName: string;
    accountType: string; // checking, savings, etc.
  };
  
  // New KYC entities
  beneficialOwners: BeneficialOwner[];
  representatives: Representative[];
  documentUploads: DocumentUpload[];
}

export interface ContractorStatus {
  id: string;
  user_id: string;
  contractor_type: string;
  kyc_status: "pending" | "approved" | "rejected";
  stripe_connect_account_id?: string;
  stripe_connect_requirements_completed?: boolean;
  created_at: string;
  updated_at: string;
}

interface ContractorState {
  formData: ContractorFormData;
  contractorStatus: ContractorStatus | null;
  currentStep: number;
  totalSteps: number;
  loading: boolean;
  error: string;
  success: string;
  isInitialized: boolean;
}

const initialFormData: ContractorFormData = {
  contractorType: "individual",
  email: "",
  
  // Individual fields
  firstName: "",
  lastName: "",
  phone: "",
  dateOfBirth: "",
  nationalIdNumber: "",
  nationalIdType: "ssn", // default to SSN for US
  
  // Business fields
  businessName: "",
  businessTaxId: "",
  businessUrl: "",
  businessDescription: "",
  industryMccCode: "",
  companyRegistrationNumber: "",
  companyStructure: "corporation", // default structure
  
  // Address
  address: {
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "AU",
  },
  
  // Bank account information
  bankAccount: {
    accountHolderName: "",
    accountNumber: "",
    routingNumber: "",
    bankName: "",
    accountType: "checking", // default to checking
  },
  
  // New KYC entities
  beneficialOwners: [],
  representatives: [],
  documentUploads: [],
};

const initialState: ContractorState = {
  formData: initialFormData,
  contractorStatus: null,
  currentStep: 1,
  totalSteps: 8, // Updated to match actual steps: Basic Info, Personal/Business, Address, Bank Account, Beneficial Owners, Representatives, Documents, Review
  loading: false,
  error: "",
  success: "",
  isInitialized: false,
};

function createContractorStore() {
  const { subscribe, set, update } = writable<ContractorState>(initialState);
  
  // Debounced save timeout
  let saveTimeoutId: NodeJS.Timeout;

  return {
    subscribe,
    
    // Initialize store with user data and saved form data
    async initialize() {
      update(state => ({ ...state, loading: true, error: "" }));
      
      try {
        console.log('Getting centralized auth...');
        // Get current session with retry logic
        const auth = await getCentralizedAuth();
        if (!auth) {
          throw new Error('Failed to load authentication module');
        }
        
        console.log('Getting auth state...');
        const currentSession = await auth.getState();
        console.log('Auth state retrieved:', currentSession?.isAuthenticated);
        
        if (!currentSession?.isAuthenticated || !currentSession.user?.id) {
          update(state => ({ ...state, loading: false, error: "Not authenticated" }));
          return;
        }

        // Store user info to avoid closure issues
        const userId = currentSession.user.id;
        const userEmail = currentSession.user?.email;

        // Immediately populate email from session to prevent delay
        update(state => ({
          ...state,
          formData: {
            ...state.formData,
            email: userEmail || state.formData.email
          }
        }));

        // Load saved form data and user profile in parallel
        const [savedData, userData] = await Promise.all([
          invoke<any>("load_kyc_form_data", { userId }).catch(() => null),
          invoke<any>("get_user_profile", { userId }).catch(() => null)
        ]);

        update(state => {
          const newFormData = { ...state.formData };
          
          // Pre-populate other fields from profile if available
          if (userData?.full_name && !newFormData.firstName && !newFormData.lastName) {
            // Try to split full_name into first and last name
            const nameParts = userData.full_name.split(' ');
            if (nameParts.length >= 2) {
              newFormData.firstName = nameParts[0];
              newFormData.lastName = nameParts.slice(1).join(' ');
            } else {
              newFormData.firstName = userData.full_name;
            }
          }

          // Prioritize saved data over profile data, but ensure email is always present
          let finalFormData = savedData ? { ...newFormData, ...savedData } : newFormData;
          
          // Ensure email is always populated from session if not in saved data
          if (!finalFormData.email && userEmail) {
            finalFormData.email = userEmail;
          }
          
          return {
            ...state,
            formData: finalFormData,
            loading: false,
            isInitialized: true,
          };
        });
        
      } catch (error) {
        console.error('Failed to initialize contractor store:', error);
        update(state => ({ 
          ...state, 
          loading: false, 
          error: `Initialization failed: ${error}`,
          isInitialized: true,
        }));
      }
    },

    // Update form data immediately for reactivity
    updateFormData(newFormData: Partial<ContractorFormData>) {
      update(state => {
        const updatedState = {
          ...state,
          formData: { ...state.formData, ...newFormData }
        };
        return updatedState;
      });
      
      // Immediate save for critical fields, debounced for others
      const criticalFields = ['email', 'contractorType', 'firstName', 'lastName', 'businessName'];
      const fieldName = Object.keys(newFormData)[0];
      
      if (criticalFields.includes(fieldName)) {
        // Save immediately for critical fields
        this.saveKycFormData();
      } else {
        // Debounced save for non-critical fields
        clearTimeout(saveTimeoutId);
        saveTimeoutId = setTimeout(() => this.saveKycFormData(), 1000);
      }
    },

    // Save KYC form data to backend with debouncing
    async saveKycFormData() {
      try {
        const auth = await getCentralizedAuth();
        const currentSession = await auth.getState();
        
        if (!currentSession?.isAuthenticated || !currentSession.user?.id) return;

        let currentFormData: ContractorFormData = initialFormData;
        const unsubscribeStore = subscribe(state => {
          currentFormData = state.formData;
        });
        unsubscribeStore();
        
        await invoke<string>("save_kyc_form_data", {
          userId: currentSession.user.id,
          kycData: currentFormData,
        });

        console.log('KYC form data saved successfully');
        
        // Load related entities after saving main form
        // These will be called from the returned object methods
        console.log('KYC form data saved, related entities can be loaded separately');
        
      } catch (error) {
        console.error("❌ Failed to save contractor form data:", error);
        // Update store to show save error to user
        update(state => ({ 
          ...state, 
          error: `Failed to save form data: ${error}. Your progress may be lost.` 
        }));
      }
    },

    // Load KYC form data from backend
    async loadKycFormData(): Promise<ContractorFormData | null> {
      try {
        const auth = await getCentralizedAuth();
        const currentSession = await auth.getState();
        
        if (!currentSession?.isAuthenticated || !currentSession.user?.id) return null;

        const savedData = await invoke<ContractorFormData | null>("load_kyc_form_data", {
          userId: currentSession.user.id,
        });

        return savedData;
      } catch (error) {
        console.warn("Failed to load contractor form data:", error);
        return null;
      }
    },

    // Update current step
    setCurrentStep(step: number) {
      update(state => ({ ...state, currentStep: step }));
    },

    // Set loading state
    setLoading(loading: boolean) {
      update(state => ({ ...state, loading }));
    },

    // Set error message
    setError(error: string) {
      update(state => ({ ...state, error, success: "" }));
    },

    // Set success message
    setSuccess(success: string) {
      update(state => ({ ...state, success, error: "" }));
    },

    // Clear messages
    clearMessages() {
      update(state => ({ ...state, error: "", success: "" }));
    },

    // Reset store to initial state
    reset() {
      set(initialState);
    },
    
    // Validate form data
    validateFormData(data: ContractorFormData): string[] {
      const errors: string[] = [];

      // Basic validation
      if (!data.email) errors.push("Email is required");
      if (!data.firstName) errors.push("First name is required");
      if (!data.lastName) errors.push("Last name is required");
      if (!data.phone) errors.push("Phone number is required");
      if (!data.dateOfBirth) errors.push("Date of birth is required");

      // Individual-specific validation
      if (data.contractorType === "individual") {
        if (!data.nationalIdNumber) errors.push("National ID number is required");
        if (!data.nationalIdType) errors.push("National ID type is required");
      }

      // Business-specific validation
      if (data.contractorType === "business") {
        if (!data.businessName) errors.push("Business name is required");
        if (!data.businessTaxId) errors.push("Business tax ID is required");
        if (!data.businessDescription) errors.push("Business description is required");
        if (!data.industryMccCode) errors.push("Industry MCC code is required");
        if (!data.companyStructure) errors.push("Company structure is required");
      }

      // Address validation
      if (!data.address.line1) errors.push("Address line 1 is required");
      if (!data.address.city) errors.push("City is required");
      if (!data.address.state) errors.push("State is required");
      if (!data.address.postalCode) errors.push("Postal code is required");
      if (!data.address.country) errors.push("Country is required");

      // Bank account validation
      if (!data.bankAccount.accountHolderName) errors.push("Account holder name is required");
      if (!data.bankAccount.accountNumber) errors.push("Account number is required");
      if (!data.bankAccount.routingNumber) errors.push("Routing number is required");
      if (!data.bankAccount.bankName) errors.push("Bank name is required");

      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (data.email && !emailRegex.test(data.email)) {
        errors.push("Invalid email format");
      }

      // Phone format validation (basic)
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      if (data.phone && !phoneRegex.test(data.phone.replace(/[\s\-\(\)]/g, ""))) {
        errors.push("Invalid phone number format");
      }

      // Date of birth validation (must be 18+ years old)
      if (data.dateOfBirth) {
        const dob = new Date(data.dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
          age--;
        }
        
        if (age < 18) {
          errors.push("Must be at least 18 years old");
        }
      }

      // Business URL validation (if provided)
      if (data.businessUrl) {
        try {
          new URL(data.businessUrl);
        } catch {
          errors.push("Invalid business URL format");
        }
      }

      // MCC code validation (4 digits)
      if (data.contractorType === "business" && data.industryMccCode) {
        const mccRegex = /^\d{4}$/;
        if (!mccRegex.test(data.industryMccCode)) {
          errors.push("MCC code must be 4 digits");
        }
      }

      // Routing number validation (9 digits for US)
      if (data.bankAccount.routingNumber && data.address.country === "US") {
        const routingRegex = /^\d{9}$/;
        if (!routingRegex.test(data.bankAccount.routingNumber)) {
          errors.push("US routing number must be 9 digits");
        }
      }

      return errors;
    },
  };
}

export const contractorStore = createContractorStore();

// Derived stores for validation
export const step1Valid = derived(
  contractorStore,
  ($store) => Boolean(
    $store.formData.contractorType &&
    $store.formData.email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($store.formData.email)
  )
);

export const step2Valid = derived(
  contractorStore,
  ($store) => {
    if ($store.formData.contractorType === "individual") {
      return Boolean(
        $store.formData.firstName && 
        $store.formData.lastName && 
        $store.formData.phone && 
        $store.formData.dateOfBirth
      );
    } else {
      return Boolean(
        $store.formData.businessName && 
        $store.formData.businessTaxId && 
        $store.formData.businessUrl
      );
    }
  }
);

export const step3Valid = derived(
  contractorStore,
  ($store) => Boolean(
    $store.formData.address.line1 &&
    $store.formData.address.city &&
    $store.formData.address.state &&
    $store.formData.address.postalCode &&
    $store.formData.address.country
  )
);

export const step4Valid = derived(
  contractorStore,
  ($store) => Boolean(
    $store.formData.bankAccount.accountHolderName &&
    $store.formData.bankAccount.accountNumber &&
    $store.formData.bankAccount.routingNumber &&
    $store.formData.bankAccount.bankName &&
    $store.formData.bankAccount.accountType
  )
);

export const step5Valid = derived(
  contractorStore,
  ($store) => {
    // For individuals, step 5 is skipped so it's always valid
    if ($store.formData.contractorType === "individual") {
      return true;
    }
    // For businesses, at least one beneficial owner is required if any exist
    return $store.formData.beneficialOwners.length === 0 || 
           $store.formData.beneficialOwners.every(owner => 
             owner.firstName && owner.lastName && owner.ownershipPercentage > 0
           );
  }
);

export const step6Valid = derived(
  contractorStore,
  ($store) => {
    // For individuals, step 6 is skipped so it's always valid
    if ($store.formData.contractorType === "individual") {
      return true;
    }
    // For businesses, at least one representative is required if any exist
    return $store.formData.representatives.length === 0 || 
           $store.formData.representatives.every(rep => 
             rep.firstName && rep.lastName && rep.title
           );
  }
);

export const step7Valid = derived(
  contractorStore,
  ($store) => {
    // Document uploads are optional but if any exist, they should be valid
    return $store.formData.documentUploads.length === 0 || 
           $store.formData.documentUploads.every(doc => 
             doc.filename && doc.documentType && doc.uploadStatus !== 'failed'
           );
  }
);

export const step8Valid = derived(
  contractorStore,
  ($store) => {
    // Review step is always valid - it's just for review and submission
    return true;
  }
);
