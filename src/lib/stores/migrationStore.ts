import { writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

interface MigrationStatus {
  total_migrations: number;
  applied_migrations: number;
  pending_migrations: string[];
  last_applied: string | null;
  database_version: string;
}

interface MigrationResult {
  success: boolean;
  applied_migrations: string[];
  failed_migrations: string[];
  errors: string[];
}

interface MigrationState {
  status: MigrationStatus | null;
  isLoading: boolean;
  error: string | null;
  lastCheck: number | null;
  autoMigrationEnabled: boolean;
}

class MigrationStore {
  private store = writable<MigrationState>({
    status: null,
    isLoading: false,
    error: null,
    lastCheck: null,
    autoMigrationEnabled: true
  });

  subscribe = this.store.subscribe;

  /**
   * Get current migration status from backend
   */
  async getStatus(): Promise<MigrationStatus | null> {
    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      const status = await invoke<MigrationStatus>('get_migration_status');
      
      this.store.update(state => ({
        ...state,
        status,
        isLoading: false,
        lastCheck: Date.now()
      }));

      return status;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.store.update(state => ({
        ...state,
        error: errorMessage,
        isLoading: false
      }));
      console.error('Failed to get migration status:', error);
      return null;
    }
  }

  /**
   * Run pending migrations
   */
  async runMigrations(): Promise<MigrationResult | null> {
    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      const result = await invoke<MigrationResult>('run_migrations');
      
      // Refresh status after running migrations
      await this.getStatus();

      this.store.update(state => ({ ...state, isLoading: false }));

      if (!result.success) {
        const errorMessage = result.errors.join(', ');
        this.store.update(state => ({ ...state, error: errorMessage }));
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.store.update(state => ({
        ...state,
        error: errorMessage,
        isLoading: false
      }));
      console.error('Failed to run migrations:', error);
      return null;
    }
  }

  /**
   * Check if migrations are needed and optionally run them automatically
   */
  async checkAndRunMigrations(autoRun: boolean = true): Promise<boolean> {
    const status = await this.getStatus();
    
    if (!status) {
      return false;
    }

    const hasPendingMigrations = status.pending_migrations.length > 0;
    
    if (hasPendingMigrations && autoRun) {
      const result = await this.runMigrations();
      return result?.success ?? false;
    }

    return !hasPendingMigrations;
  }

  /**
   * Reset migration state (for development/testing)
   */
  async resetMigrationState(): Promise<boolean> {
    this.store.update(state => ({ ...state, isLoading: true, error: null }));

    try {
      await invoke<string>('reset_migration_state');
      
      // Refresh status after reset
      await this.getStatus();

      this.store.update(state => ({ ...state, isLoading: false }));
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.store.update(state => ({
        ...state,
        error: errorMessage,
        isLoading: false
      }));
      console.error('Failed to reset migration state:', error);
      return false;
    }
  }

  /**
   * Enable or disable automatic migrations
   */
  setAutoMigration(enabled: boolean): void {
    this.store.update(state => ({ ...state, autoMigrationEnabled: enabled }));
  }

  /**
   * Clear any errors
   */
  clearError(): void {
    this.store.update(state => ({ ...state, error: null }));
  }

  /**
   * Get readable migration status summary
   */
  getStatusSummary(status: MigrationStatus): string {
    if (status.pending_migrations.length === 0) {
      return `Database is up to date (v${status.database_version})`;
    }
    
    return `${status.pending_migrations.length} pending migration(s). Current version: ${status.database_version}`;
  }
}

export const migrationStore = new MigrationStore();

// Export types for use in components
export type { MigrationStatus, MigrationResult, MigrationState };
