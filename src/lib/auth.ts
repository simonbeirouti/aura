import { invoke } from '@tauri-apps/api/core';
import { authToken } from './stores';
import { get } from 'svelte/store';

export interface UserProfile {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}

/**
 * Verify the current Firebase token with the backend
 */
export async function verifyToken(): Promise<boolean> {
  try {
    const token = get(authToken);
    if (!token) {
      return false;
    }

    await invoke('verify_firebase_token', { token });
    return true;
  } catch (error) {
    console.error('Token verification failed:', error);
    return false;
  }
}

/**
 * Get user profile from the backend (requires valid token)
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const token = get(authToken);
    if (!token) {
      throw new Error('No authentication token available');
    }

    const profile = await invoke<UserProfile>('get_user_profile', { token });
    return profile;
  } catch (error) {
    console.error('Failed to get user profile:', error);
    return null;
  }
}

/**
 * Execute a protected action on the backend
 */
export async function executeProtectedAction(): Promise<string | null> {
  try {
    const token = get(authToken);
    if (!token) {
      throw new Error('No authentication token available');
    }

    const result = await invoke<string>('protected_action', { token });
    return result;
  } catch (error) {
    console.error('Protected action failed:', error);
    return null;
  }
}

/**
 * Refresh the current user's token
 */
export async function refreshToken(): Promise<boolean> {
  try {
    const { auth } = await import('./firebase');
    const user = auth.currentUser;
    
    if (!user) {
      return false;
    }

    const newToken = await user.getIdToken(true); // Force refresh
    const { storeAuthToken } = await import('./stores');
    await storeAuthToken(newToken);
    
    return true;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return false;
  }
}
