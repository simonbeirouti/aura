<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { authStore } from '$lib/stores/supabaseAuth';
  import { dataStore } from '$lib/stores/dataStore';

  // Test state
  let environmentTest: any = null;
  let manualTestResult: any = null;
  let isTestingEnvironment = false;
  let isTestingManual = false;
  
  // Manual test inputs
  let manualSecretKey = '';
  let manualPublishableKey = '';
  
  // Integration test state
  let integrationTests: { [key: string]: { status: 'pending' | 'success' | 'error', message: string, data?: any } } = {};
  let isRunningIntegration = false;
  let testCustomerId = '';

  // Reactive state
  $: authState = $authStore;
  $: currentProfile = $dataStore.currentProfile;

  onMount(() => {
    testEnvironmentVariables();
  });

  async function testEnvironmentVariables() {
    isTestingEnvironment = true;
    try {
      const result = await invoke('test_stripe_environment');
      environmentTest = result;
    } catch (error: any) {
      environmentTest = { error: error.toString() };
    } finally {
      isTestingEnvironment = false;
    }
  }

  async function testManualKeys() {
    if (!manualSecretKey || !manualPublishableKey) {
      alert('Please enter both secret and publishable keys');
      return;
    }

    isTestingManual = true;
    try {
      const result = await invoke('test_stripe_with_keys', {
        secretKey: manualSecretKey,
        publishableKey: manualPublishableKey
      });
      manualTestResult = result;
    } catch (error: any) {
      manualTestResult = { error: error.toString() };
    } finally {
      isTestingManual = false;
    }
  }

  function initializeIntegrationTests() {
    integrationTests = {
      publishableKey: { status: 'pending', message: 'Not started' },
      createCustomer: { status: 'pending', message: 'Not started' },
      createPaymentIntent: { status: 'pending', message: 'Not started' }
    };
  }

  async function runIntegrationTests() {
    if (!authState.isAuthenticated || !authState.user) {
      alert('Please sign in to run integration tests');
      return;
    }

    isRunningIntegration = true;
    initializeIntegrationTests();

    try {
      await testGetPublishableKey();
      await testCreateCustomer();
      await testCreatePaymentIntent();
    } catch (error) {
      console.error('Integration test failed:', error);
    } finally {
      isRunningIntegration = false;
    }
  }

  async function testGetPublishableKey() {
    updateIntegrationTest('publishableKey', 'pending', 'Testing...');
    try {
      const result = await invoke('get_stripe_publishable_key');
      updateIntegrationTest('publishableKey', 'success', 'Retrieved publishable key', result);
    } catch (error: any) {
      updateIntegrationTest('publishableKey', 'error', `Failed: ${error}`);
    }
  }

  async function testCreateCustomer() {
    if (!authState.user?.email) {
      updateIntegrationTest('createCustomer', 'error', 'No user email available');
      return;
    }

    updateIntegrationTest('createCustomer', 'pending', 'Creating customer...');
    try {
      const result = await invoke('create_stripe_customer', {
        email: authState.user.email,
        name: currentProfile?.full_name || 'Test User'
      });
      testCustomerId = result as string;
      updateIntegrationTest('createCustomer', 'success', `Customer created: ${testCustomerId}`, result);
    } catch (error: any) {
      updateIntegrationTest('createCustomer', 'error', `Failed: ${error}`);
    }
  }

  async function testCreatePaymentIntent() {
    updateIntegrationTest('createPaymentIntent', 'pending', 'Creating payment intent...');
    try {
      const result = await invoke('create_payment_intent', {
        amount: 1000, // $10.00
        currency: 'usd',
        customerId: testCustomerId || undefined
      });
      updateIntegrationTest('createPaymentIntent', 'success', 'Payment intent created', result);
    } catch (error: any) {
      updateIntegrationTest('createPaymentIntent', 'error', `Failed: ${error}`);
    }
  }

  function updateIntegrationTest(testName: string, status: 'pending' | 'success' | 'error', message: string, data?: any) {
    integrationTests[testName] = { status, message, data };
    integrationTests = { ...integrationTests }; // Trigger reactivity
  }

  function getStatusIcon(status: 'pending' | 'success' | 'error') {
    switch (status) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'pending':
        return '⏳';
      default:
        return '⏳';
    }
  }

  function getStatusColor(status: 'pending' | 'success' | 'error') {
    switch (status) {
      case 'success':
        return 'text-success';
      case 'error':
        return 'text-error';
      case 'pending':
        return 'text-warning';
      default:
        return 'text-base-content';
    }
  }
</script>

<div class="stripe-test max-w-4xl mx-auto p-2">
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-2xl font-bold">Stripe Test</h2>
    <button 
      class="btn btn-primary"
      onclick={() => testEnvironmentVariables()}
      disabled={isTestingEnvironment}
    >
      {#if isTestingEnvironment}
        <span class="loading loading-spinner loading-sm"></span>
        Testing...
      {:else}
        Refresh
      {/if}
    </button>
  </div>

  <!-- Environment Variables Test -->
  <div class="card bg-base-100 shadow-lg mb-6">
    <div class="card-body">
      <h3 class="card-title mb-4">Environment Variables Test</h3>
      
      {#if isTestingEnvironment}
        <div class="flex items-center gap-2">
          <span class="loading loading-spinner loading-sm"></span>
          <span>Testing environment variables...</span>
        </div>
      {:else if environmentTest}
        {#if environmentTest.error}
          <div class="alert alert-error">
            <span>❌ Environment test failed: {environmentTest.error}</span>
          </div>
        {:else}
          <div class="space-y-4">
            <!-- Platform Info -->
            <div class="alert alert-info">
              <div>
                <h4 class="font-bold">Platform: {environmentTest.platform || 'Unknown'}</h4>
                <p class="text-sm">Working Directory: {environmentTest.current_dir || 'Unknown'}</p>
              </div>
            </div>
            
            <!-- Environment Variables Status -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="card bg-base-200">
                <div class="card-body p-4">
                  <h4 class="card-title text-sm">Secret Key</h4>
                  <div class="text-lg font-bold {environmentTest.secret_key_status === 'valid_format' ? 'text-success' : 'text-error'}">
                    {environmentTest.secret_key_status}
                  </div>
                  <div class="text-xs text-base-content/70">
                    {environmentTest.secret_key_preview || 'No preview'}
                  </div>
                  <div class="text-xs">
                    {environmentTest.secret_key_status === 'valid_format' ? '✅ Ready' : '❌ Not available'}
                  </div>
                </div>
              </div>
              
              <div class="card bg-base-200">
                <div class="card-body p-4">
                  <h4 class="card-title text-sm">Publishable Key</h4>
                  <div class="text-lg font-bold {environmentTest.publishable_key_status === 'valid_format' ? 'text-success' : 'text-error'}">
                    {environmentTest.publishable_key_status}
                  </div>
                  <div class="text-xs text-base-content/70">
                    {environmentTest.publishable_key_preview || 'No preview'}
                  </div>
                  <div class="text-xs">
                    {environmentTest.publishable_key_status === 'valid_format' ? '✅ Ready' : '❌ Not available'}
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Client Status -->
            <div class="alert {environmentTest.client_init_status === 'success' ? 'alert-success' : 'alert-error'}">
              <div>
                <h4 class="font-bold">Stripe Client: {environmentTest.client_init_status === 'success' ? 'Connected' : 'Failed'}</h4>
                <p class="text-sm">{environmentTest.client_init_status}</p>
              </div>
            </div>
            
            <!-- All Stripe Environment Variables -->
            {#if environmentTest.all_stripe_vars && environmentTest.all_stripe_vars.length > 0}
              <div class="collapse collapse-arrow bg-base-200">
                <input type="checkbox" /> 
                <div class="collapse-title text-sm font-medium">
                  All Stripe Environment Variables ({environmentTest.all_stripe_vars.length})
                </div>
                <div class="collapse-content">
                  <div class="space-y-1">
                    {#each environmentTest.all_stripe_vars as envVar}
                      <div class="text-xs font-mono bg-base-300 p-2 rounded">{envVar}</div>
                    {/each}
                  </div>
                </div>
              </div>
            {:else}
              <div class="alert alert-warning">
                <span>⚠️ No STRIPE environment variables found</span>
              </div>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="alert alert-info">
          <span>Click "Refresh Environment Test" to check environment variables</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Manual Key Testing -->
  <div class="card bg-base-100 shadow-lg mb-6">
    <div class="card-body">
      <h3 class="card-title mb-4">Manual Key Testing</h3>
      <p class="text-sm text-base-content/70 mb-4">
        If environment variables aren't working, test with manual keys
      </p>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div class="form-control">
          <label class="label">
            <span class="label-text">Secret Key (sk_...)</span>
          </label>
          <input 
            type="password" 
            placeholder="sk_test_..." 
            class="input input-bordered"
            bind:value={manualSecretKey}
          />
        </div>
        
        <div class="form-control">
          <label class="label">
            <span class="label-text">Publishable Key (pk_...)</span>
          </label>
          <input 
            type="text" 
            placeholder="pk_test_..." 
            class="input input-bordered"
            bind:value={manualPublishableKey}
          />
        </div>
      </div>
      
      <button 
        class="btn btn-secondary mb-4"
        onclick={() => testManualKeys()}
        disabled={isTestingManual || !manualSecretKey || !manualPublishableKey}
      >
        {#if isTestingManual}
          <span class="loading loading-spinner loading-sm"></span>
          Testing Keys...
        {:else}
          Test Manual Keys
        {/if}
      </button>
      
      {#if manualTestResult}
        {#if manualTestResult.error}
          <div class="alert alert-error">
            <span>❌ {manualTestResult.error}</span>
          </div>
        {:else}
          <div class="alert alert-success">
            <div>
              <h4 class="font-bold">✅ Manual Key Test Results</h4>
              <p>API Connectivity: {manualTestResult.api_connectivity}</p>
              <p>Secret Key Valid: {manualTestResult.secret_key_valid ? 'Yes' : 'No'}</p>
              <p>Publishable Key: {manualTestResult.publishable_key?.substring(0, 20)}...</p>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>

  <!-- Integration Tests -->
  <div class="card bg-base-100 shadow-lg">
    <div class="card-body">
      <div class="flex items-center justify-between mb-4">
        <h3 class="card-title">Integration Tests</h3>
        <button 
          class="btn btn-primary"
          onclick={() => runIntegrationTests()}
          disabled={isRunningIntegration}
        >
          {#if isRunningIntegration}
            <span class="loading loading-spinner loading-sm"></span>
            Running Tests...
          {:else}
            Run Integration Tests
          {/if}
        </button>
      </div>
      
      <div class="space-y-3">
        {#each Object.entries(integrationTests) as [testName, test]}
          <div class="flex items-center justify-between p-3 bg-base-200 rounded-lg">
            <div class="flex items-center gap-3">
              <span class="text-lg">{getStatusIcon(test.status)}</span>
              <div>
                <div class="font-medium capitalize">{testName.replace(/([A-Z])/g, ' $1').trim()}</div>
                <div class="text-sm {getStatusColor(test.status)}">{test.message}</div>
              </div>
            </div>
            {#if test.data}
              <div class="text-xs text-base-content/50 max-w-xs truncate">
                {JSON.stringify(test.data)}
              </div>
            {/if}
          </div>
        {/each}
      </div>
      
      {#if Object.keys(integrationTests).length === 0}
        <div class="text-center text-base-content/50 py-8">
          Click "Run Integration Tests" to start testing
        </div>
      {/if}
    </div>
  </div>
</div>
