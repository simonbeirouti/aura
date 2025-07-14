import { writable, derived } from 'svelte/store';
import { auth } from './firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Store } from '@tauri-apps/plugin-store';

// Initialize the secure store
let store: Store;

// Initialize store async
const initStore = async () => {
  if (!store) {
    store = await Store.load('.session.dat');
  }
  return store;
};

// User store
export const user = writable<User | null>(null);

// Authentication token store
export const authToken = writable<string | null>(null);

// Loading state - starts true until Firebase auth initializes
export const isLoading = writable<boolean>(true);

// Auth initialization state - tracks if Firebase has finished checking for existing auth
export const authInitialized = writable<boolean>(false);

// Derived store for authentication status
export const isAuthenticated = derived(
  [user, authToken, authInitialized],
  ([$user, $authToken, $authInitialized]) => {
    // Only return true if we have both user and token, and auth has initialized
    return $authInitialized && !!$user && !!$authToken;
  }
);

// Function to store token securely
export async function storeAuthToken(token: string) {
  try {
    const storeInstance = await initStore();
    await storeInstance.set('auth_token', token);
    await storeInstance.save();
    authToken.set(token);
  } catch (error) {
    console.error('Failed to store auth token:', error);
  }
}

// Function to retrieve token from secure storage
export async function getStoredAuthToken(): Promise<string | null> {
  try {
    const storeInstance = await initStore();
    const token = await storeInstance.get<string>('auth_token');
    if (token) {
      authToken.set(token);
      return token;
    }
  } catch (error) {
    console.error('Failed to retrieve auth token:', error);
  }
  return null;
}

// Function to clear stored token
export async function clearAuthToken() {
  try {
    const storeInstance = await initStore();
    await storeInstance.delete('auth_token');
    await storeInstance.save();
    authToken.set(null);
  } catch (error) {
    console.error('Failed to clear auth token:', error);
  }
}

// Initialize authentication state
onAuthStateChanged(auth, async (currentUser) => {
  console.log('Auth state changed:', currentUser ? 'User logged in' : 'User logged out');
  
  user.set(currentUser);
  
  if (currentUser) {
    try {
      // Get the ID token when user is authenticated
      const token = await currentUser.getIdToken();
      await storeAuthToken(token);
      console.log('Token stored successfully');
    } catch (error) {
      console.error('Failed to get ID token:', error);
    }
  } else {
    // Clear token when user is not authenticated
    await clearAuthToken();
  }
  
  // Mark auth as initialized and loading as complete
  authInitialized.set(true);
  isLoading.set(false);
});

// Initialize by checking for stored token on app start
(async () => {
  console.log('Initializing auth store...');
  await getStoredAuthToken();
  // Firebase onAuthStateChanged will handle the rest
})();
