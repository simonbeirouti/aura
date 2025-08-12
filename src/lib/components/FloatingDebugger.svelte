<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { centralizedAuth } from '../stores/unifiedAuth';
  import { settingsStore } from '../stores/settingsStore';
  import { stripeStore } from '../stores/stripeStore';
  import { migrationStore } from '../stores/migrationStore';
  import { sessionStore } from '../stores/sessionStore';
  import { cacheManager, cacheStats } from '../stores/cacheManager';
  import { storeCoordinator, coordinatorStats } from '../stores/storeCoordinator';
  import { invoke } from '@tauri-apps/api/core';
  import { Badge } from './ui/badge';

  let isVisible = false;
  let isDragging = false;
  let position = { x: 20, y: 20 };
  let dragStart = { x: 0, y: 0 };
  let activeTab = 'auth';

  // Store states
  let authState: any = {};
  let settingsState: any = {};
  let stripeState: any = {};
  let migrationState: any = {};
  let sessionState: any = {};
  let cacheState: any = {};
  let coordinatorState: any = {};

  // Database data
  let databaseStatus: any = null;
  let databaseProfile: any = null;
  let databasePaymentMethods: any = null;
  let databaseError: string | null = null;

  // Subscriptions
  let unsubscribes: (() => void)[] = [];

  onMount(() => {
    // Subscribe to all stores
    unsubscribes = [
      centralizedAuth.subscribe(state => authState = state),
      settingsStore.subscribe(state => settingsState = state),
      stripeStore.subscribe(state => stripeState = state),
      migrationStore.subscribe(state => migrationState = state),
      sessionStore.subscribe(state => sessionState = state),
      cacheStats.subscribe(state => cacheState = state),
      coordinatorStats.subscribe(state => coordinatorState = state)
    ];

    // Load position from localStorage
    const savedPosition = localStorage.getItem('debugger-position');
    if (savedPosition) {
      position = JSON.parse(savedPosition);
    }

    // Listen for keyboard shortcut (Ctrl+Shift+D)
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        toggleDebugger();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    
    return () => {
      window.removeEventListener('keydown', handleKeydown);
    };
  });

  onDestroy(() => {
    unsubscribes.forEach(unsub => unsub());
  });

  function toggleDebugger() {
    isVisible = !isVisible;
  }

  function startDrag(e: MouseEvent) {
    isDragging = true;
    dragStart = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  }

  function handleDrag(e: MouseEvent) {
    if (!isDragging) return;
    
    position = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    };
    
    // Save position to localStorage
    localStorage.setItem('debugger-position', JSON.stringify(position));
  }

  function stopDrag() {
    isDragging = false;
  }

  async function checkDatabaseStatus() {
    try {
      databaseError = null;
      databaseStatus = await invoke('get_database_status');
    } catch (error) {
      databaseError = error instanceof Error ? error.message : 'Database check failed';
      databaseStatus = null;
    }
  }

  async function loadDatabaseProfile() {
    try {
      databaseError = null;
      const userId = authState.user?.id;
      if (!userId) {
        databaseError = 'No authenticated user';
        return;
      }
      databaseProfile = await invoke('get_user_profile', { userId });
    } catch (error) {
      databaseError = error instanceof Error ? error.message : 'Profile load failed';
      databaseProfile = null;
    }
  }

  async function loadDatabasePaymentMethods() {
    try {
      databaseError = null;
      const userId = authState.user?.id;
      if (!userId) {
        databaseError = 'No authenticated user';
        return;
      }
      databasePaymentMethods = await invoke('get_stored_payment_methods', { userId });
    } catch (error) {
      databaseError = error instanceof Error ? error.message : 'Payment methods load failed';
      databasePaymentMethods = null;
    }
  }

  async function clearCache() {
    try {
      cacheManager.clear();
      databaseError = null;
    } catch (error) {
      databaseError = error instanceof Error ? error.message : 'Cache clear failed';
    }
  }

  async function reinitializeAuth() {
    try {
      databaseError = null;
      await centralizedAuth.reinitialize();
    } catch (error) {
      databaseError = error instanceof Error ? error.message : 'Auth reinitialize failed';
    }
  }

  function formatJson(obj: any) {
    if (obj === null || obj === undefined) return 'null';
    return JSON.stringify(obj, null, 2);
  }

  function getStatusColor(status: any) {
    if (status === true || status === 'complete' || status === 'active') return 'bg-green-500';
    if (status === false || status === 'error' || status === 'failed') return 'bg-red-500';
    if (status === 'pending' || status === 'running' || status === 'loading') return 'bg-yellow-500';
    return 'bg-gray-500';
  }
</script>

<svelte:window on:mousemove={handleDrag} on:mouseup={stopDrag} />

<!-- Debug Toggle Button (always visible) -->
<button
  class="fixed top-4 right-4 z-[9999] bg-purple-600 hover:bg-purple-700 text-white rounded-full w-10 h-10 flex items-center justify-center font-mono text-sm shadow-lg"
  on:click={toggleDebugger}
  title="Toggle Debugger (Ctrl+Shift+D)"
>
  🐛
</button>

{#if isVisible}
  <!-- Floating Debugger Window -->
  <div
    class="fixed z-[9998] bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg shadow-2xl max-w-2xl max-h-[80vh] overflow-hidden"
    style="left: {position.x}px; top: {position.y}px; min-width: 500px;"
  >
    <!-- Header -->
    <div
      class="bg-purple-600 text-white px-4 py-2 flex items-center justify-between cursor-move select-none"
      role="button"
      tabindex="0"
      on:mousedown={startDrag}
      on:keydown={(e) => e.key === 'Enter' && e.preventDefault()}
    >
      <h3 class="font-semibold">🐛 Store Debugger</h3>
      <div class="flex items-center gap-2">
        <span class="text-xs opacity-75">Ctrl+Shift+D</span>
        <button
          on:click={toggleDebugger}
          class="hover:bg-purple-700 rounded p-1"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
      {#each [
        { id: 'auth', label: 'Auth', color: getStatusColor(authState.isAuthenticated) },
        { id: 'stores', label: 'Stores', color: getStatusColor(settingsState.isInitialized) },
        { id: 'migration', label: 'Migration', color: getStatusColor(migrationState.status) },
        { id: 'cache', label: 'Cache', color: getStatusColor(cacheState.size > 0) },
        { id: 'database', label: 'Database', color: 'bg-blue-500' }
      ] as tab}
        <button
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2
            {activeTab === tab.id 
              ? 'border-purple-500 text-purple-600 dark:text-purple-400' 
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}"
          on:click={() => activeTab = tab.id}
        >
          <div class="w-2 h-2 rounded-full {tab.color}"></div>
          {tab.label}
        </button>
      {/each}
    </div>

    <!-- Content -->
    <div class="p-4 overflow-auto max-h-96">
      {#if activeTab === 'auth'}
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-4">
            <Badge variant={authState.isAuthenticated ? 'default' : 'secondary'}>
              Authenticated: {authState.isAuthenticated}
            </Badge>
            <Badge variant={authState.isInitialized ? 'default' : 'secondary'}>
              Initialized: {authState.isInitialized}
            </Badge>
          </div>
          
          <div class="space-y-2">
            <h4 class="font-semibold text-sm">User:</h4>
            <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-32">
{formatJson(authState.user ? { id: authState.user.id, email: authState.user.email } : null)}
            </pre>
          </div>

          <div class="space-y-2">
            <h4 class="font-semibold text-sm">Profile:</h4>
            <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-32">
{formatJson(authState.profile)}
            </pre>
          </div>

          <div class="flex gap-2">
            <button class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600" on:click={reinitializeAuth}>Reinitialize Auth</button>
          </div>
        </div>

      {:else if activeTab === 'stores'}
        <div class="space-y-3">
          <div class="grid grid-cols-3 gap-2">
            <Badge variant={settingsState.isInitialized ? 'default' : 'secondary'}>
              Settings: {settingsState.isInitialized}
            </Badge>
            <Badge variant={stripeState.stripe ? 'default' : 'secondary'}>
              Stripe: {!!stripeState.stripe}
            </Badge>
            <Badge variant={sessionState.isAuthenticated ? 'default' : 'secondary'}>
              Session: {sessionState.isAuthenticated}
            </Badge>
          </div>

          <div class="space-y-2">
            <h4 class="font-semibold text-sm">Settings Store:</h4>
            <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-24">
{formatJson({
  profile: !!settingsState.profile,
  paymentMethods: settingsState.paymentMethods?.length || 0,
  subscriptionData: !!settingsState.subscriptionData,
  customerId: settingsState.customerId
})}
            </pre>
          </div>

          <div class="space-y-2">
            <h4 class="font-semibold text-sm">Coordinator Stats:</h4>
            <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-24">
{formatJson(coordinatorState)}
            </pre>
          </div>
        </div>

      {:else if activeTab === 'migration'}
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-4">
            <Badge variant={migrationState.status === 'complete' ? 'default' : 'secondary'}>
              Status: {migrationState.status || 'unknown'}
            </Badge>
            <Badge variant={migrationState.isLoading ? 'secondary' : 'default'}>
              Loading: {migrationState.isLoading}
            </Badge>
          </div>

          <div class="space-y-2">
            <h4 class="font-semibold text-sm">Migration State:</h4>
            <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-32">
{formatJson(migrationState)}
            </pre>
          </div>
        </div>

      {:else if activeTab === 'cache'}
        <div class="space-y-3">
          <div class="grid grid-cols-3 gap-2">
            <Badge>Size: {cacheState.size || 0}</Badge>
            <Badge>Hits: {cacheState.hits || 0}</Badge>
            <Badge>Misses: {cacheState.misses || 0}</Badge>
          </div>

          <div class="space-y-2">
            <h4 class="font-semibold text-sm">Cache Stats:</h4>
            <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-24">
{formatJson({
  ...cacheState,
  hitRate: `${((cacheState.hitRate || 0) * 100).toFixed(1)}%`
})}
            </pre>
          </div>

          <div class="flex gap-2">
            <button class="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600" on:click={clearCache}>Clear Cache</button>
          </div>
        </div>

      {:else if activeTab === 'database'}
        <div class="space-y-3">
          <div class="flex gap-2 flex-wrap">
            <button class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600" on:click={checkDatabaseStatus}>Check DB Status</button>
            <button class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600" on:click={loadDatabaseProfile}>Load Profile</button>
            <button class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600" on:click={loadDatabasePaymentMethods}>Load Payment Methods</button>
          </div>

          {#if databaseError}
            <div class="p-2 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-sm text-red-700 dark:text-red-300">
              {databaseError}
            </div>
          {/if}

          {#if databaseStatus}
            <div class="space-y-2">
              <h4 class="font-semibold text-sm">Database Status:</h4>
              <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-24">
{formatJson(databaseStatus)}
              </pre>
            </div>
          {/if}

          {#if databaseProfile}
            <div class="space-y-2">
              <h4 class="font-semibold text-sm">Database Profile:</h4>
              <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-24">
{formatJson(databaseProfile)}
              </pre>
            </div>
          {/if}

          {#if databasePaymentMethods}
            <div class="space-y-2">
              <h4 class="font-semibold text-sm">Database Payment Methods:</h4>
              <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-24">
{formatJson(databasePaymentMethods)}
              </pre>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  pre {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
