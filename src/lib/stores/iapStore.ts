import { writable, derived, get } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import {
  initialize,
  getProducts,
  purchase,
  restorePurchases,
  acknowledgePurchase,
  onPurchaseUpdated
} from '@choochmeque/tauri-plugin-iap-api';

// IAP Plugin API types matching Swift implementation
export interface Product {
  productId: string;
  title?: string;
  description?: string;
  productType?: string;
  formattedPrice?: string;
  priceCurrencyCode?: string;
  subscriptionOfferDetails?: SubscriptionOffer[];
}

export interface SubscriptionOffer {
  offerToken: string;
  basePlanId: string;
  offerId?: string;
  pricingPhases: PricingPhase[];
}

export interface PricingPhase {
  formattedPrice: string;
  priceCurrencyCode: string;
  priceAmountMicros: number;
  billingPeriod: string;
  billingCycleCount: number;
  recurrenceMode: number;
}

export interface Purchase {
  orderId?: string;
  packageName?: string;
  productId: string;
  purchaseTime?: number;
  purchaseToken: string;
  purchaseState: number; // 0 = purchased, 1 = canceled
  isAutoRenewing?: boolean;
  isAcknowledged?: boolean;
  originalJson?: string;
  signature?: string;
}

export interface Transaction {
  transactionId: string;
  productId: string;
  status: TransactionStatus;
  purchaseTime?: number;
  isAutoRenewing?: boolean;
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
  purchases: Purchase[];
  transactions: Transaction[];
  isLoading: boolean;
  error: string | null;
  logs: string[];
  pluginAvailable: boolean;
}

// Create the main IAP store
function createIAPStore() {
  const store = writable<IAPState>({
    isInitialized: false,
    canMakePayments: false,
    countryCode: null,
    products: [],
    purchases: [],
    transactions: [],
    isLoading: false,
    error: null,
    logs: [],
    pluginAvailable: false
  });

  const { subscribe, update } = store;

  function addLog(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    update(state => ({
      ...state,
      logs: [...state.logs, `[${timestamp}] ${message}`]
    }));
  }


  async function isDesktopMacOS(): Promise<boolean> {
    try {
      const platformInfo = await invoke('get_platform_info');
      const isDesktopMac = (platformInfo as any)?.os === 'macos';
      addLog(`🔍 Platform check: ${JSON.stringify(platformInfo)} - Desktop macOS: ${isDesktopMac}`);
      return isDesktopMac;
    } catch (error) {
      addLog(`⚠️ Could not determine platform: ${error}`);
      return false; // Assume not desktop macOS if we can't determine
    }
  }
  

  function checkPluginAvailability(operation: string): boolean {
    // Check if IAP functions are available
    if (typeof initialize !== 'function' || typeof getProducts !== 'function' || typeof purchase !== 'function') {
      const pluginErrorMsg = `${operation} not available - IAP plugin functions not loaded.`;
      addLog(`❌ ${pluginErrorMsg}`);
      update(state => ({
        ...state,
        error: pluginErrorMsg,
        pluginAvailable: false
      }));
      return false;
    }
    
    // Check current state
    const currentState = get(store);
    if (!currentState.pluginAvailable) {
      const stateErrorMsg = `${operation} not available - plugin marked as unavailable.`;
      addLog(`❌ ${stateErrorMsg}`);
      return false;
    }
    
    return true;
  }

  async function initializeIAP(): Promise<boolean> {
    try {
      update(state => ({
        ...state,
        isLoading: true,
        error: null
      }));

      addLog('🚀 Starting IAP initialization...');
      
      // Get platform info from Tauri backend
      let platformInfo: any = null;
      try {
        platformInfo = await invoke('get_platform_info');
        addLog(`🔍 Platform info: ${JSON.stringify(platformInfo)}`);
      } catch (error) {
        addLog(`⚠️ Could not get platform info: ${error}`);
      }
      
      const isIOS = platformInfo?.os === 'ios';
      const isAndroid = platformInfo?.os === 'android';
      const isMobile = isIOS || isAndroid;
      
      addLog(`📱 Platform detection: iOS=${isIOS}, Android=${isAndroid}, Mobile=${isMobile}`);
      
      // Block only desktop macOS, allow iOS and Android
      if (await isDesktopMacOS()) {
        const macErrorMsg = 'IAP not available on desktop macOS due to platform limitations. Use iOS or Android for in-app purchases.';
        addLog(`❌ ${macErrorMsg}`);
        update(state => ({
          ...state,
          isInitialized: false,
          canMakePayments: false,
          isLoading: false,
          error: macErrorMsg,
          pluginAvailable: false
        }));
        return false;
      }
      
      // Check if IAP functions are available
      if (typeof initialize !== 'function') {
        const pluginErrorMsg = 'IAP plugin functions not available. Plugin may not be loaded or not supported on this platform.';
        addLog(`❌ ${pluginErrorMsg}`);
        update(state => ({
          ...state,
          isInitialized: false,
          canMakePayments: false,
          isLoading: false,
          error: pluginErrorMsg,
          pluginAvailable: false
        }));
        return false;
      }
      
      addLog('✅ IAP plugin functions are available');
      
      // Proceed if we're on iOS/Android or if platform detection failed (safer)
      if (isMobile || !platformInfo) {
        addLog(`✅ Proceeding with IAP initialization on ${platformInfo?.os || 'unknown'} platform`);
      } else {
        const unsupportedMsg = `IAP not supported on ${platformInfo?.os} platform. Use iOS or Android for in-app purchases.`;
        addLog(`❌ ${unsupportedMsg}`);
        update(state => ({
          ...state,
          isInitialized: false,
          canMakePayments: false,
          isLoading: false,
          error: unsupportedMsg,
          pluginAvailable: false
        }));
        return false;
      }
      
      // Initialize IAP plugin
      addLog('📱 Initializing IAP plugin for mobile platform...');
      const result = await initialize();
      addLog(`✅ IAP initialize() result: ${JSON.stringify(result)}`);
      
      // Mark as successfully initialized
      update(state => ({
        ...state,
        isInitialized: true,
        canMakePayments: true,
        isLoading: false,
        error: null,
        pluginAvailable: true
      }));
      
      addLog('🎉 IAP initialization completed successfully!');
      
      // Immediately query all products after initialization
      addLog('🔄 Auto-querying products after initialization...');
      try {
        await queryAllProductsInternal();
        const finalState = get(store);
        addLog(`✅ Auto product query completed - ${finalState.products.length} products loaded`);
      } catch (error) {
        addLog(`❌ Auto product query failed: ${error}`);
      }
      
      return true;
      
    } catch (error) {
      const errorMsg = `IAP initialization failed: ${error}`;
      addLog(`❌ ${errorMsg}`);
      update(state => ({
        ...state,
        error: errorMsg,
        isInitialized: false,
        canMakePayments: false,
        isLoading: false,
        pluginAvailable: false
      }));
      return false;
    }
  }

  async function queryProducts(productIds: string[], productType?: 'inapp' | 'subs'): Promise<void> {
    try {
      const typeStr = productType ? ` (type: ${productType})` : ' (no type specified)';
      addLog(`🛒 Querying products: ${productIds.join(', ')}${typeStr}`);
      
      // Check if plugin is available and initialized
      if (!checkPluginAvailability('Get products')) {
        return;
      }
      
      // Get current state to check if initialized
      const currentState = get(store);
      if (!currentState.isInitialized) {
        addLog('❌ Cannot query products - IAP not initialized');
        return;
      }
      
      // Try multiple approaches to get products
      let response: any = null;
      let lastError: any = null;
      
      // Approach 1: With product type if specified
      if (productType) {
        try {
          addLog(`📞 Attempt 1: getProducts(${JSON.stringify(productIds)}, "${productType}")`);
          response = await getProducts(productIds, productType);
          addLog(`📦 Approach 1 response: ${JSON.stringify(response)}`);
        } catch (error) {
          lastError = error;
          addLog(`❌ Approach 1 failed: ${error}`);
        }
      }
      
      // Approach 2: Without product type if first failed or no type specified
      if (!response) {
        try {
          addLog(`📞 Attempt 2: getProducts(${JSON.stringify(productIds)}) - no type`);
          response = await getProducts(productIds);
          addLog(`📦 Approach 2 response: ${JSON.stringify(response)}`);
        } catch (error) {
          lastError = error;
          addLog(`❌ Approach 2 failed: ${error}`);
        }
      }
      
      // Approach 3: Try each product individually if batch failed
      if (!response && productIds.length > 1) {
        addLog(`📞 Attempt 3: Querying products individually`);
        const individualProducts: Product[] = [];
        
        for (const productId of productIds) {
          try {
            addLog(`📞 Individual query: getProducts(["${productId}"])`);
            const individualResponse = await getProducts([productId]);
            addLog(`📦 Individual response for ${productId}: ${JSON.stringify(individualResponse)}`);
            
            if (individualResponse && individualResponse.products) {
              if (Array.isArray(individualResponse.products)) {
                individualProducts.push(...individualResponse.products);
              } else {
                individualProducts.push(individualResponse.products as Product);
              }
            }
            
            // Small delay between individual queries to avoid overwhelming StoreKit
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (error) {
            addLog(`❌ Individual query failed for ${productId}: ${error}`);
          }
        }
        
        if (individualProducts.length > 0) {
          response = { products: individualProducts };
          addLog(`✅ Individual queries found ${individualProducts.length} products`);
        }
      }
      
      if (!response) {
        throw lastError || new Error('All product query approaches failed');
      }
      
      // Handle response structure
      let allProducts: Product[] = [];
      if (Array.isArray(response)) {
        allProducts = response as Product[];
      } else if (response && Array.isArray(response.products)) {
        allProducts = response.products as Product[];
      } else if (response && response.products && !Array.isArray(response.products)) {
        allProducts = [response.products as Product];
      }
      
      addLog(`✅ Found ${allProducts.length} products total`);
      
      // Log each product for debugging
      allProducts.forEach(product => {
        addLog(`  ✓ ${product.productId}: ${product.title || 'No title'} (${product.formattedPrice || 'No price'})`);
      });
      
      update(state => ({
        ...state,
        products: [...state.products.filter(p => !productIds.includes(p.productId)), ...allProducts]
      }));
      
    } catch (error) {
      const errorMsg = `Error querying products: ${error}`;
      addLog(`❌ ${errorMsg}`);
      update(state => ({
        ...state,
        error: errorMsg
      }));
    }
  }
  
  // Internal function for auto-querying after initialization
  async function queryAllProductsInternal(): Promise<void> {
    addLog(`🔄 Starting auto-query for all products...`);
    addLog(`📋 Consumables to query: ${JSON.stringify(iapProductIds.consumables)}`);
    addLog(`📋 Subscriptions to query: ${JSON.stringify(iapProductIds.subscriptions)}`);
    
    // Strategy 1: Query ALL products together (no type specified)
    const allProductIds = [...iapProductIds.consumables, ...iapProductIds.subscriptions];
    if (allProductIds.length > 0) {
      addLog(`🔄 Strategy 1: Query all products together (no type): ${JSON.stringify(allProductIds)}`);
      await queryProducts(allProductIds);
    }
    
    let currentState = get(store);
    addLog(`📊 After Strategy 1: ${currentState.products.length} products loaded`);
    
    // Strategy 2: Query by type separately if we don't have all products
    if (currentState.products.length < allProductIds.length) {
      addLog(`⚠️ Only ${currentState.products.length}/${allProductIds.length} products loaded, trying by type...`);
      
      // Query consumables with 'inapp' type
      if (iapProductIds.consumables.length > 0) {
        addLog(`🔄 Strategy 2a: Querying consumables with 'inapp' type: ${JSON.stringify(iapProductIds.consumables)}`);
        await queryProducts(iapProductIds.consumables, 'inapp');
        
        currentState = get(store);
        addLog(`📊 After consumables query: ${currentState.products.length} products loaded`);
      }
      
      // Query subscriptions with 'subs' type
      if (iapProductIds.subscriptions.length > 0) {
        addLog(`🔄 Strategy 2b: Querying subscriptions with 'subs' type: ${JSON.stringify(iapProductIds.subscriptions)}`);
        await queryProducts(iapProductIds.subscriptions, 'subs');
        
        currentState = get(store);
        addLog(`📊 After subscriptions query: ${currentState.products.length} products loaded`);
      }
    }
    
    // Strategy 3: Individual queries if we still don't have all products
    currentState = get(store);
    if (currentState.products.length < allProductIds.length) {
      addLog(`⚠️ Still only ${currentState.products.length}/${allProductIds.length} products, trying individual queries...`);
      
      for (const productId of allProductIds) {
        const existingProduct = currentState.products.find(p => p.productId === productId);
        if (!existingProduct) {
          addLog(`🔄 Strategy 3: Individual query for missing product: ${productId}`);
          await queryProducts([productId]);
          
          // Small delay between individual queries
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
    
    // Final check
    const finalState = get(store);
    addLog(`✅ Auto-query completed. Total products loaded: ${finalState.products.length}/${allProductIds.length}`);
    
    if (finalState.products.length > 0) {
      finalState.products.forEach(product => {
        addLog(`  📦 ${product.productId}: ${product.title || 'No title'} (${product.formattedPrice || 'No price'})`);
      });
    } else {
      addLog(`❌ No products loaded! This might be a StoreKit configuration or plugin issue.`);
    }
    
    // Show which products are missing
    const loadedIds = finalState.products.map(p => p.productId);
    const missingIds = allProductIds.filter(id => !loadedIds.includes(id));
    if (missingIds.length > 0) {
      addLog(`⚠️ Missing products: ${JSON.stringify(missingIds)}`);
    }
  }

  async function purchaseProduct(productId: string, productType?: 'inapp' | 'subs', offerToken?: string): Promise<void> {
    try {
      const typeStr = productType ? ` (type: ${productType})` : ' (auto-detect type)';
      addLog(`💳 Requesting purchase for: ${productId}${typeStr}`);
      
      // Check if plugin is available first
      if (!checkPluginAvailability('Purchase')) {
        return;
      }
      
      // Check if we're initialized
      const purchaseState = get(store);
      if (!purchaseState.isInitialized) {
        addLog('❌ Cannot purchase - IAP not initialized');
        return;
      }
      
      // Block only desktop macOS
      if (await isDesktopMacOS()) {
        addLog('❌ Purchase not available on desktop macOS');
        return;
      }
      
      // Auto-detect product type if not provided
      let finalProductType = productType;
      if (!finalProductType) {
        if (iapProductIds.subscriptions.includes(productId)) {
          finalProductType = 'subs';
          addLog(`🔍 Auto-detected subscription product: ${productId}`);
        } else if (iapProductIds.consumables.includes(productId)) {
          finalProductType = 'inapp';
          addLog(`🔍 Auto-detected consumable product: ${productId}`);
        } else {
          finalProductType = 'inapp'; // Default to inapp
          addLog(`🔍 Unknown product type, defaulting to inapp: ${productId}`);
        }
      }
      
      // Verify product exists before purchase
      const verifyState = get(store);
      const productExists = verifyState.products.some(p => p.productId === productId);
      if (!productExists) {
        const errorMsg = `Product ${productId} not found in loaded products. Available: ${verifyState.products.map(p => p.productId).join(', ')}`;
        addLog(`❌ ${errorMsg}`);
        update(state => ({
          ...state,
          error: errorMsg
        }));
        return;
      }
      
      addLog(`✅ Product ${productId} found in loaded products`);
      
      // Use the IAP API to initiate purchase
      addLog(`📞 Calling purchase("${productId}", "${finalProductType}", ${offerToken ? '"' + offerToken + '"' : 'undefined'})`);
      const purchaseResponse = await purchase(productId, finalProductType, offerToken);
      addLog(`📦 Purchase response: ${JSON.stringify(purchaseResponse)}`);
      addLog('✅ Purchase request initiated successfully');
      
      // Handle purchase response - iOS StoreKit returns different formats
      if (purchaseResponse) {
        const purchaseData = purchaseResponse as any;
        addLog(`📦 Purchase response received: ${JSON.stringify(purchaseData)}`);
        
        // Check if this is a successful purchase or just a purchase initiation
        if (purchaseData.purchaseState !== undefined) {
          // This is a completed purchase
          addLog(`✅ Purchase completed with state: ${purchaseData.purchaseState}`);
          
          const transaction: Transaction = {
            transactionId: purchaseData.purchaseToken || purchaseData.orderId || 'unknown',
            productId: purchaseData.productId,
            status: purchaseData.purchaseState === 0 ? TransactionStatus.purchased : TransactionStatus.failed,
            purchaseTime: purchaseData.purchaseTime || Date.now(),
            isAutoRenewing: purchaseData.isAutoRenewing || false,
            error: undefined
          };
          
          update(state => ({
            ...state,
            purchases: [...state.purchases, purchaseData as Purchase],
            transactions: [...state.transactions, transaction]
          }));
          
          // iOS auto-acknowledges, but call acknowledgePurchase for consistency
          if (purchaseData.purchaseState === 0) {
            try {
              await acknowledgePurchase(purchaseData.purchaseToken);
              addLog(`✅ Purchase acknowledged: ${purchaseData.purchaseToken}`);
            } catch (ackError) {
              addLog(`⚠️ Failed to acknowledge purchase: ${ackError}`);
            }
          }
        } else {
          // This is just a purchase initiation (user will see iOS purchase dialog)
          addLog(`📱 Purchase dialog initiated for ${productId} - waiting for user completion`);
          addLog(`⚠️ Note: Purchase completion will be handled by purchase listener`);
        }
      } else {
        addLog(`⚠️ Purchase response was null or undefined`);
      }
    } catch (error) {
      const errorMsg = `Error purchasing product: ${error}`;
      addLog(errorMsg);
      update(state => ({
        ...state,
        error: errorMsg
      }));
    }
  }

  async function restoreUserPurchases(productType: 'inapp' | 'subs' = 'subs'): Promise<void> {
    try {
      addLog(`🔄 Restoring purchases for type: ${productType}`);
      
      // Check if plugin is available first
      if (!checkPluginAvailability('Restore purchases')) {
        return;
      }
      
      // Check if we're initialized
      const currentState = get(store);
      if (!currentState.isInitialized) {
        addLog('❌ Cannot restore purchases - IAP not initialized');
        return;
      }
      
      // Block only desktop macOS
      if (await isDesktopMacOS()) {
        addLog('❌ Restore purchases not available on desktop macOS');
        return;
      }
      
      // Use the IAP API to restore purchases - Swift returns {"purchases": array}
      const response = await restorePurchases(productType);
      addLog(`Restore response: ${JSON.stringify(response)}`);
      
      const allPurchases = response?.purchases || response || [];
      
      addLog(`Restored ${allPurchases.length} purchases`);
      
      // Create transactions for restored purchases
      const restoredTransactions: Transaction[] = allPurchases.map((p: any) => ({
        transactionId: p.purchaseToken || p.orderId || 'unknown',
        productId: p.productId,
        status: TransactionStatus.restored,
        purchaseTime: p.purchaseTime || Date.now(),
        isAutoRenewing: p.isAutoRenewing || false,
        error: undefined
      }));
      
      update(state => ({
        ...state,
        purchases: [...state.purchases, ...allPurchases.filter((p: any) => 
          !state.purchases.some(existing => existing.purchaseToken === p.purchaseToken)
        )],
        transactions: [...state.transactions, ...restoredTransactions.filter((t: any) => 
          !state.transactions.some(existing => existing.transactionId === t.transactionId)
        )]
      }));
    } catch (error) {
      const errorMsg = `Error restoring purchases: ${error}`;
      addLog(errorMsg);
      update(state => ({
        ...state,
        error: errorMsg
      }));
    }
  }

  function clearError(): void {
    update(state => ({
      ...state,
      error: null
    }));
  }

  function clearLogs(): void {
    update(state => ({
      ...state,
      logs: []
    }));
  }

  let purchaseListener: (() => void) | null = null;

  function setupPurchaseListener(): void {
    if (typeof onPurchaseUpdated === 'function' && !purchaseListener) {
      purchaseListener = onPurchaseUpdated((purchase: any) => {
        addLog(`Purchase updated: ${JSON.stringify(purchase)}`);
        
        const transaction: Transaction = {
          transactionId: purchase.purchaseToken || purchase.orderId || 'unknown',
          productId: purchase.productId,
          status: purchase.purchaseState === 0 ? TransactionStatus.purchased : TransactionStatus.failed,
          purchaseTime: purchase.purchaseTime || Date.now(),
          isAutoRenewing: purchase.isAutoRenewing || false,
          error: undefined
        };
        
        update(state => ({
          ...state,
          purchases: [...state.purchases.filter(p => p.purchaseToken !== purchase.purchaseToken), purchase],
          transactions: [...state.transactions.filter(t => t.transactionId !== transaction.transactionId), transaction]
        }));
      });
      addLog('Purchase listener setup complete');
    }
  }

  function cleanupPurchaseListener(): void {
    if (purchaseListener) {
      purchaseListener();
      purchaseListener = null;
      addLog('Purchase listener cleaned up');
    }
  }

  return {
    subscribe,
    initialize: initializeIAP,
    queryProducts,
    purchaseProduct,
    restoreUserPurchases,
    restorePurchases: restoreUserPurchases, // Alias for backward compatibility
    clearError,
    clearLogs,
    addLog,
    setupPurchaseListener,
    cleanupPurchaseListener
  };
}

// Create and export the IAP store instance
export const iapStore = createIAPStore();

// Derived stores for common use cases
export const iapReady = derived(
  iapStore,
  ($iap: IAPState) => $iap.isInitialized && $iap.canMakePayments && !$iap.isLoading
);

export const iapProducts = derived(
  iapStore,
  ($iap: IAPState) => $iap.products
);

export const iapPurchases = derived(
  iapStore,
  ($iap: IAPState) => $iap.purchases
);

// Product IDs matching StoreKit configuration
export const iapProductIds = {
  consumables: ['tokens_100', 'tokens_500', 'tokens_1000', 'tokens_5000', 'tokens_25000', 'tokens_100000'],
  nonConsumables: [], // No non-consumables in current StoreKit config
  subscriptions: ['monthly_subscription', 'yearly_subscription']
};

export const allProductIds = [
  ...iapProductIds.consumables,
  ...iapProductIds.nonConsumables,
  ...iapProductIds.subscriptions
];

// Convenience functions for querying specific product types
export async function queryConsumableProducts() {
  // iOS StoreKit treats consumables differently - try without product type first
  return iapStore.queryProducts(iapProductIds.consumables);
}

export async function querySubscriptionProducts() {
  return iapStore.queryProducts(iapProductIds.subscriptions, 'subs');
}

export async function queryAllProducts() {
  // Query consumables first (without type parameter)
  await queryConsumableProducts();
  // Then query subscriptions with 'subs' type
  await querySubscriptionProducts();
}
