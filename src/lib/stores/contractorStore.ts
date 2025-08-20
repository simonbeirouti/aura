import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { sessionStore } from './sessionStore';

export interface ContractorFormData {
  contractorType: "individual" | "business";
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  businessName: string;
  businessTaxId: string;
  businessUrl: string;
  businessDescription: string;
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
  firstName: "",
  lastName: "",
  phone: "",
  dateOfBirth: "",
  address: {
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "AU",
  },
  businessName: "",
  businessTaxId: "",
  businessUrl: "",
  businessDescription: "",
};

const initialState: ContractorState = {
  formData: initialFormData,
  contractorStatus: null,
  currentStep: 1,
  totalSteps: 4,
  loading: false,
  error: "",
  success: "",
  isInitialized: false,
};

function createContractorStore() {
  const { subscribe, set, update } = writable<ContractorState>(initialState);

  return {
    subscribe,
    
    // Initialize store with user data and saved form data
    async initialize() {
      update(state => ({ ...state, loading: true, error: "" }));
      
      try {
        // Get current session
        let currentSession: any;
        const unsubscribe = sessionStore.subscribe(state => {
          currentSession = state;
        });
        unsubscribe();
        
        if (!currentSession?.isAuthenticated || !currentSession.user?.id) {
          update(state => ({ ...state, loading: false, error: "Not authenticated" }));
          return;
        }

        // Load saved form data
        const savedData = await this.loadFormData();
        
        // Load user profile data to pre-populate
        const userData = await invoke<any>("get_user_profile", {
          userId: currentSession.user.id,
        });

        update(state => {
          const newFormData = { ...state.formData };
          
          // Pre-populate with user data if form fields are empty
          if (userData?.email && !newFormData.email) {
            newFormData.email = userData.email;
          }
          if (userData?.first_name && !newFormData.firstName) {
            newFormData.firstName = userData.first_name;
          }
          if (userData?.last_name && !newFormData.lastName) {
            newFormData.lastName = userData.last_name;
          }
          if (userData?.phone && !newFormData.phone) {
            newFormData.phone = userData.phone;
          }

          // Override with saved form data if available
          const finalFormData = savedData ? { ...newFormData, ...savedData } : newFormData;
          
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

    // Update form data and auto-save
    async updateFormData(newFormData: Partial<ContractorFormData>) {
      update(state => ({
        ...state,
        formData: { ...state.formData, ...newFormData }
      }));
      
      // Auto-save after a delay
      setTimeout(() => this.saveFormData(), 2000);
    },

    // Save form data to backend
    async saveFormData() {
      try {
        let currentSession: any;
        const unsubscribe = sessionStore.subscribe(state => {
          currentSession = state;
        });
        unsubscribe();
        
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

      } catch (error) {
        console.warn("Failed to save contractor form data:", error);
      }
    },

    // Load form data from backend
    async loadFormData(): Promise<ContractorFormData | null> {
      try {
        let currentSession: any;
        const unsubscribe = sessionStore.subscribe(state => {
          currentSession = state;
        });
        unsubscribe();
        
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
