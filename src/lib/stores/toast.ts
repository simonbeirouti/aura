import { writable } from 'svelte/store';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // in milliseconds, default 4000
  dismissible?: boolean; // default true
}

// Store for managing active toasts
export const toasts = writable<Toast[]>([]);

// Helper function to generate unique IDs
function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

// Add a new toast (replaces any existing toast for singleton behavior)
export function addToast(
  message: string, 
  type: ToastType = 'info', 
  duration: number = 4000,
  dismissible: boolean = true
): string {
  const id = generateId();
  const toast: Toast = {
    id,
    type,
    message,
    duration,
    dismissible
  };

  // Replace all existing toasts with the new one (singleton behavior)
  toasts.set([toast]);

  // Auto-dismiss after duration if specified
  if (duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }

  return id;
}

// Remove a specific toast
export function removeToast(id: string): void {
  toasts.update(currentToasts => 
    currentToasts.filter(toast => toast.id !== id)
  );
}

// Clear all toasts
export function clearAllToasts(): void {
  toasts.set([]);
}

// Convenience functions for different toast types
export const toast = {
  info: (message: string, duration?: number) => addToast(message, 'info', duration),
  success: (message: string, duration?: number) => addToast(message, 'success', duration),
  warning: (message: string, duration?: number) => addToast(message, 'warning', duration),
  error: (message: string, duration?: number) => addToast(message, 'error', duration),
  remove: removeToast,
  clear: clearAllToasts
};
