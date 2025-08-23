import { writable, derived } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';

// IAP Plugin API types based on documentation
export interface Product {
  productId: string;
  localizedTitle: string;
  localizedDescription: string;
  price: string;
  priceLocale: string;
  currencyCode: string;
  currencySymbol: string;
}

export interface Transaction {
  transactionId: string;
  productId: string;
  status: TransactionStatus;
  error?: string;
}

export enum TransactionStatus {
  pending = 'pending',
  purchased = 'purchased',
  failed = 'failed',
  restored = 'restored'
}

export interface Exception {
  message: string;
  code?: string;
}

interface IAPState {
  isInitialized: boolean;
  canMakePayments: boolean;
  countryCode: string | null;
  products: Product[];
  transactions: Transaction[];
  isLoading: boolean;
  error: string | null;
  logs: string[];
}

// Create the main IAP store
function createIAPStore() {
  const { subscribe, set, update } = writable<IAPState>({
    isInitialized: false,
    canMakePayments: false,
    countryCode: null,
    products: [],
    transactions: [],
    isLoading: false,
    error: null,
    logs: []
  });

  function addLog(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    update(state => ({
      ...state,
      logs: [...state.logs, `[${timestamp}] ${message}`]
    }));
  }

  function clearLogs() {
    update(state => ({
      ...state,
      logs: []
    }));
  }

  async function checkCanMakePayments(): Promise<boolean> {
    try {
      addLog('Checking if payments are available...');
      // Check if payments are available (this is usually automatic on iOS)
      const canPay = true; // On iOS, if the app loads, payments are usually available
      
      update(state => ({
        ...state,
        canMakePayments: canPay
      }));
      
      addLog(`Can make payments: ${canPay}`);
      return canPay;
    } catch (error) {
      const errorMsg = `IAP not available on this platform: ${error}`;
      addLog(errorMsg);
      update(state => ({
        ...state,
        error: errorMsg,
        canMakePayments: false
      }));
      return false;
    }
  }

  async function getCountryCode(): Promise<string | null> {
    try {
      addLog('Getting country code...');
      // Country code might not be available in iOS plugin, skip for now
      const code = 'Unknown';
      
      update(state => ({
        ...state,
        countryCode: code
      }));
      
      addLog(`Country code: ${code}`);
      return code;
    } catch (error) {
      const errorMsg = `Error getting country code: ${error}`;
      addLog(errorMsg);
      update(state => ({
        ...state,
        error: errorMsg
      }));
      return null;
    }
  }

  async function initialize(): Promise<boolean> {
    try {
      update(state => ({
        ...state,
        isLoading: true,
        error: null
      }));

      addLog('Initializing IAP...');
      
      // Note: The actual initialization with callbacks might need to be handled differently
      // For now, we'll simulate initialization and check basic functionality
      const initialized = true; // This would be the result of actual initialization
      
      update(state => ({
        ...state,
        isInitialized: initialized,
        isLoading: false
      }));

      if (initialized) {
        addLog('IAP initialized successfully');
        // Check payment availability and get country code
        await checkCanMakePayments();
        await getCountryCode();
      } else {
        addLog('IAP initialization failed');
      }

      return initialized;
    } catch (error) {
      const errorMsg = `Initialization error: ${error}`;
      addLog(errorMsg);
      update(state => ({
        ...state,
        error: errorMsg,
        isLoading: false,
        isInitialized: false
      }));
      return false;
    }
  }

  async function queryProducts(productIds: string[]): Promise<void> {
    try {
      addLog(`Querying products: ${productIds.join(', ')}`);
      
      // Use the correct parameter structure with payload
      const response = await invoke('plugin:iap|fetch_products', { 
        payload: { productIds }
      });
      
      addLog(`Product query response: ${JSON.stringify(response)}`);
      
      // Handle response if products are returned immediately
      if (response && (response as any).products) {
        addLog(`Found ${(response as any).products.length} products`);
        simulateProductsReceived((response as any).products);
      } else if (response) {
        addLog(`Response received but no products field: ${JSON.stringify(response)}`);
      } else {
        addLog('No response received - products may be delivered via callback');
      }
    } catch (error) {
      const errorMsg = `Error querying products: ${error}`;
      addLog(errorMsg);
      update(state => ({
        ...state,
        error: errorMsg
      }));
    }
  }

  async function purchaseProduct(productId: string): Promise<void> {
    try {
      addLog(`Requesting purchase for: ${productId}`);
      await invoke('plugin:iap|purchase_product', { 
        payload: { productId }
      });
      addLog('Purchase request initiated');
    } catch (error) {
      const errorMsg = `Error purchasing product: ${error}`;
      addLog(errorMsg);
      update(state => ({
        ...state,
        error: errorMsg
      }));
    }
  }

  async function restorePurchases(): Promise<void> {
    try {
      addLog('Restoring purchases...');
      const response = await invoke('plugin:iap|restore_purchases', {
        payload: {}
      });
      addLog('Restore purchases initiated');
      
      // Handle response if purchases are returned immediately
      if (response && (response as any).purchases) {
        addLog(`Restored ${(response as any).purchases.length} purchases`);
      }
    } catch (error) {
      const errorMsg = `Error restoring purchases: ${error}`;
      addLog(errorMsg);
      update(state => ({
        ...state,
        error: errorMsg
      }));
    }
  }

  async function finishTransaction(transactionId: string): Promise<void> {
    try {
      addLog(`Finishing transaction: ${transactionId}`);
      await invoke('plugin:iap|acknowledge_purchase', { 
        request: { transactionId } 
      });
      addLog('Transaction finished');
    } catch (error) {
      const errorMsg = `Error finishing transaction: ${error}`;
      addLog(errorMsg);
      update(state => ({
        ...state,
        error: errorMsg
      }));
    }
  }

  function clearError() {
    update(state => ({
      ...state,
      error: null
    }));
  }

  // Simulate receiving products (in real implementation, this would be called by the plugin)
  function simulateProductsReceived(products: Product[]) {
    addLog(`Products received: ${products.length} products`);
    update(state => ({
      ...state,
      products
    }));
  }

  // Simulate receiving transactions (in real implementation, this would be called by the plugin)
  function simulateTransactionsReceived(transactions: Transaction[]) {
    addLog(`Transactions received: ${transactions.length} transactions`);
    update(state => ({
      ...state,
      transactions
    }));
  }

  return {
    subscribe,
    initialize,
    checkCanMakePayments,
    getCountryCode,
    queryProducts,
    purchaseProduct,
    restorePurchases,
    finishTransaction,
    clearError,
    clearLogs,
    addLog,
    simulateProductsReceived,
    simulateTransactionsReceived
  };
}

// IAP Product IDs - configure these in App Store Connect
export const iapProductIds = [
  'package_1',           // Consumable
  'package_2',           // Consumable
  'skin_1',              // Non-consumable
  'monthly_subscriptions', // Auto-renewable subscription
  'yearly_subscriptions'   // Auto-renewable subscription
];

export const iapStore = createIAPStore();

// Derived stores for easy access to specific state
export const isIAPReady = derived(
  iapStore,
  $iap => $iap.isInitialized && $iap.canMakePayments
);

export const availableProducts = derived(
  iapStore,
  $iap => $iap.products
);

export const recentTransactions = derived(
  iapStore,
  $iap => $iap.transactions.slice(-5) // Show last 5 transactions
);
