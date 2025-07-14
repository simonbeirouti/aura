import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import { Stronghold, Client } from '@tauri-apps/plugin-stronghold';
import { appDataDir } from '@tauri-apps/api/path';

export interface AuthState {
  isAuthenticated: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  isInitialized: false,
  isLoading: false,
  error: null
};

export const authStore = writable<AuthState>(initialState);

// Stronghold instance management
let strongholdInstance: Stronghold | null = null;
let clientInstance: Client | null = null;
let currentPassword: string | null = null;

// Lazy initialization of Stronghold
async function ensureStrongholdInitialized(): Promise<void> {
  if (!strongholdInstance && currentPassword) {
    const { stronghold, client } = await initializeStronghold(currentPassword);
    strongholdInstance = stronghold;
    clientInstance = client;
  }
}

export const getStrongholdClient = async (): Promise<Client | null> => {
  await ensureStrongholdInitialized();
  return clientInstance;
};

export const getStronghold = async (): Promise<Stronghold | null> => {
  await ensureStrongholdInitialized();
  return strongholdInstance;
};

export const saveStronghold = async (): Promise<void> => {
  await ensureStrongholdInitialized();
  if (strongholdInstance) {
    await strongholdInstance.save();
  }
};

async function initializeStronghold(password: string): Promise<{ stronghold: Stronghold; client: Client }> {
  const vaultPath = `${await appDataDir()}/aura-vault.hold`;
  const stronghold = await Stronghold.load(vaultPath, password);
  
  let client: Client;
  const clientName = 'aura-client';
  
  try {
    client = await stronghold.loadClient(clientName);
  } catch {
    client = await stronghold.createClient(clientName);
  }
  
  return { stronghold, client };
}

// Cache initialization check to avoid repeated calls
let initializationChecked = false;
let cachedInitializationResult = false;

export const authActions = {
  async checkInitialization() {
    // Return cached result if already checked
    if (initializationChecked) {
      authStore.update(state => ({ 
        ...state, 
        isInitialized: cachedInitializationResult,
        isLoading: false 
      }));
      return cachedInitializationResult;
    }

    authStore.update(state => ({ ...state, isLoading: true, error: null }));
    
    try {
      const isInitialized = await invoke<boolean>('is_app_initialized');
      
      // Cache the result
      initializationChecked = true;
      cachedInitializationResult = isInitialized;
      
      authStore.update(state => ({ 
        ...state, 
        isInitialized, 
        isLoading: false 
      }));
      return isInitialized;
    } catch (error) {
      authStore.update(state => ({ 
        ...state, 
        error: `Failed to check initialization: ${error}`, 
        isLoading: false 
      }));
      return false;
    }
  },

  async initializeApp(password: string) {
    authStore.update(state => ({ ...state, isLoading: true, error: null }));
    
    try {
      // Initialize app authentication in Rust backend
      await invoke('initialize_app', { password });
      
      // Update cache to reflect initialization
      initializationChecked = true;
      cachedInitializationResult = true;
      
      // Store password for lazy Stronghold initialization
      currentPassword = password;
      
      authStore.update(state => ({ 
        ...state, 
        isInitialized: true, 
        isAuthenticated: true, 
        isLoading: false 
      }));
      return true;
    } catch (error) {
      authStore.update(state => ({ 
        ...state, 
        error: `Failed to initialize app: ${error}`, 
        isLoading: false 
      }));
      return false;
    }
  },

  async login(password: string) {
    authStore.update(state => ({ ...state, isLoading: true, error: null }));
    
    try {
      // Authenticate with Rust backend first (this is fast)
      await invoke('unlock_app', { password });
      
      // Update auth state immediately - Stronghold will be initialized lazily when needed
      authStore.update(state => ({ 
        ...state, 
        isAuthenticated: true, 
        isLoading: false 
      }));
      
      // Store password for lazy Stronghold initialization
      currentPassword = password;
      
      return true;
    } catch (error) {
      authStore.update(state => ({ 
        ...state, 
        error: `Authentication failed: ${error}`, 
        isLoading: false 
      }));
      return false;
    }
  },

  async logout() {
    try {
      // Save any pending changes to Stronghold
      if (strongholdInstance) {
        await strongholdInstance.save();
      }
      
      // Clear Stronghold instances and password
      strongholdInstance = null;
      clientInstance = null;
      currentPassword = null;
      
      // Lock the app in Rust backend
      await invoke('lock_app');
      
      authStore.update(state => ({ 
        ...state, 
        isAuthenticated: false, 
        error: null 
      }));
    } catch (error) {
      authStore.update(state => ({ 
        ...state, 
        error: `Failed to logout: ${error}` 
      }));
    }
  },

  async resetApp() {
    authStore.update(state => ({ ...state, isLoading: true, error: null }));
    
    try {
      // Clear all local instances first
      strongholdInstance = null;
      clientInstance = null;
      currentPassword = null;
      
      // Reset the app in Rust backend (removes all files and data)
      await invoke('reset_app');
      
      // Clear initialization cache
      initializationChecked = false;
      cachedInitializationResult = false;
      
      // Reset auth state to initial state
      authStore.update(state => ({ 
        ...state, 
        isInitialized: false,
        isAuthenticated: false, 
        isLoading: false,
        error: null 
      }));
      
      return true;
    } catch (error) {
      authStore.update(state => ({ 
        ...state, 
        error: `Failed to reset app: ${error}`, 
        isLoading: false 
      }));
      return false;
    }
  },

  clearError() {
    authStore.update(state => ({ ...state, error: null }));
  }
};
