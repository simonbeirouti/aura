<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/supabaseAuth';
  import { settingsActions, paymentMethodsStore, type PaymentMethod } from '$lib/stores/settingsStore';
  import { CreditCard, Plus } from 'lucide-svelte';
  import AppLayout from '$lib/components/AppLayout.svelte';
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Label } from '$lib/components/ui/label';
  import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerClose
  } from '$lib/components/ui/drawer';
  import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';

  interface SetupIntentResponse {
    client_secret: string;
    setup_intent_id: string;
  }

  // Reactive data from store
  $: ({ paymentMethods, loading, error: loadError, customerId } = $paymentMethodsStore);
  
  let userId = '';
  let error = '';
  let isDrawerOpen = false;
  let isEditDrawerOpen = false;
  let selectedPaymentMethod: PaymentMethod | null = null;
  let isProcessing = false;
  
  // Stripe Elements
  let stripe: Stripe | null = null;
  let elements: StripeElements | null = null;
  let cardNumberElement: any = null;
  let cardExpiryElement: any = null;
  let cardCvcElement: any = null;
  let setupIntent: SetupIntentResponse | null = null;
  
  // Form containers
  let cardContainer: HTMLElement;
  let expiryContainer: HTMLElement;
  let cvcContainer: HTMLElement;

  onMount(async () => {
    try {
      if (!$authStore.user) {
        throw new Error('User not authenticated');
      }
      
      userId = $authStore.user.id;
      
      // Initialize all settings data (includes payment methods and customer)
      await settingsActions.initialize();
      
      // Initialize Stripe
      await initializeStripe();
    } catch (err) {
      console.error('Payment methods page: Initialization failed:', err);
      error = `Failed to initialize payment system: ${err instanceof Error ? err.message : String(err)}`;
    }
  });



  async function initializeStripe() {
    try {
      const publishableKey = await invoke<string>('get_stripe_publishable_key');
      stripe = await loadStripe(publishableKey);
    } catch (err) {
      console.error('Failed to initialize Stripe:', err);
      error = 'Failed to initialize payment system';
    }
  }

  async function createSetupIntent() {
    if (!customerId) return;
    
    try {
      setupIntent = await invoke<SetupIntentResponse>('create_setup_intent', {
        customerId
      });
      
      // Initialize Stripe Elements
      if (stripe && setupIntent) {
        elements = stripe.elements({
          clientSecret: setupIntent.client_secret
        });
        
        // Create card elements with explicit placeholders and proper dark/light mode styling
        // Detect if we're in dark mode by checking the background color
        const isDarkMode = document.documentElement.classList.contains('dark') || 
                          window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        // Use explicit colors that work in both modes
        const textColor = isDarkMode ? '#ffffff' : '#000000';
        const placeholderColor = isDarkMode ? '#9ca3af' : '#6b7280';
        const errorColor = isDarkMode ? '#ef4444' : '#dc2626';
        
        const elementStyle = {
          base: {
            fontSize: '16px',
            color: textColor,
            lineHeight: '1.5',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            '::placeholder': {
              color: placeholderColor,
            },
            ':focus': {
              color: textColor,
            },
            ':hover': {
              color: textColor,
            },
          },
          invalid: {
            color: errorColor,
            iconColor: errorColor,
          },
          complete: {
            color: textColor,
          }
        };
        
        cardNumberElement = elements.create('cardNumber', { 
          style: elementStyle,
          placeholder: '1234 1234 1234 1234'
        });
        cardExpiryElement = elements.create('cardExpiry', { 
          style: elementStyle,
          placeholder: 'MM / YY'
        });
        cardCvcElement = elements.create('cardCvc', { 
          style: elementStyle,
          placeholder: 'CVC'
        });
        
        // Mount elements immediately when containers are available
        const mountElements = () => {
          if (cardContainer && expiryContainer && cvcContainer) {
            cardNumberElement.mount(cardContainer);
            cardExpiryElement.mount(expiryContainer);
            cardCvcElement.mount(cvcContainer);
            return true;
          }
          return false;
        };
        
        // Try to mount immediately, if containers aren't ready, wait briefly
        if (!mountElements()) {
          setTimeout(mountElements, 50);
        }
      }
    } catch (err) {
      console.error('Failed to create setup intent:', err);
      error = 'Failed to initialize payment form';
    }
  }

  async function handleAddPaymentMethod() {
    if (!stripe || !elements || !setupIntent || !cardNumberElement) {
      return;
    }
    isProcessing = true;
    error = '';
    
    try {
      // First, create the payment method using the card element
      const { error: paymentMethodError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardNumberElement,
      });
      
      if (paymentMethodError) {
        throw new Error(paymentMethodError.message);
      }
      
      // Then confirm the setup intent with the payment method
      const { error: confirmError } = await stripe.confirmSetup({
        clientSecret: setupIntent.client_secret,
        confirmParams: {
          payment_method: paymentMethod.id,
        },
        redirect: 'if_required',
      });
      
      if (confirmError) {
        throw new Error(confirmError.message);
      }
      
      // Store payment method in database with user association
      try {
        const storedPaymentMethod = await invoke('store_payment_method_after_setup', {
          customerId,
          paymentMethodId: paymentMethod.id,
          userId,
          isDefault: paymentMethods.length === 0
        });
      } catch (dbError: any) {
        error = `Payment method added to Stripe but failed to save to database: ${dbError?.message || String(dbError)}`;
        // Don't re-throw, continue with loading payment methods
      }
      
      // Reload payment methods from database
      await settingsActions.loadPaymentMethods(true);
      
      // Close drawer and reset form
      isDrawerOpen = false;
      setupIntent = null;
      
      // Clear the form elements
      if (cardNumberElement && cardExpiryElement && cardCvcElement) {
        cardNumberElement.clear();
        cardExpiryElement.clear();
        cardCvcElement.clear();
      }
      
    } catch (err: any) {
      error = err.message || 'Failed to add payment method';
    } finally {
      isProcessing = false;
    }
  }

  async function deletePaymentMethod(paymentMethodId: string) {
    if (!userId) {
      console.error('Cannot delete payment method: User ID not available');
      error = 'User authentication required';
      return;
    }
    
    isProcessing = true;
    error = '';
    
    try {
      
      // Use the integrated function that removes from both Stripe and database
      await invoke('delete_payment_method_integrated', {
        paymentMethodId,
        userId
      });
      
      // Force reload payment methods from database with cache bypass
      await settingsActions.loadPaymentMethods(true);
      
    } catch (err) {
      console.error('Failed to delete payment method:', err);
      error = `Failed to delete payment method: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      isProcessing = false;
    }
  }

  async function setDefaultPaymentMethod(paymentMethodId: string) {
    if (!userId || !customerId) {
      console.error('Cannot set default payment method: User ID or Customer ID not available');
      error = 'User authentication required';
      return;
    }
    
    isProcessing = true;
    error = '';
    
    try {
      
      // Use the integrated function that updates both Stripe and database
      await invoke('set_default_payment_method_integrated', {
        customerId,
        paymentMethodId,
        userId
      });
      
      // Force reload payment methods from database with cache bypass
      await settingsActions.loadPaymentMethods(true);
      
    } catch (err) {
      console.error('Failed to set default payment method:', err);
      error = `Failed to set default payment method: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      isProcessing = false;
    }
  }

  function getBrandIcon(brand: string) {
    switch (brand.toLowerCase()) {
      case 'visa':
        return '💳';
      case 'mastercard':
        return '💳';
      case 'amex':
        return '💳';
      default:
        return '💳';
    }
  }

  async function openDrawer() {
    // Pre-initialize Stripe Elements before opening drawer to prevent layout shift
    if (!setupIntent) {
      await createSetupIntent();
    } else {
      // If elements already exist, remount them to ensure they're visible
      await remountStripeElements();
    }
    isDrawerOpen = true;
  }
  
  function openEditDrawer(method: PaymentMethod) {
    selectedPaymentMethod = method;
    isEditDrawerOpen = true;
  }
  
  async function remountStripeElements() {
    if (cardNumberElement && cardExpiryElement && cardCvcElement) {
      // Wait a brief moment for containers to be available in DOM
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const mountElements = () => {
        if (cardContainer && expiryContainer && cvcContainer) {
          try {
            // Unmount first to avoid errors, then remount
            cardNumberElement.unmount();
            cardExpiryElement.unmount();
            cardCvcElement.unmount();
            
            cardNumberElement.mount(cardContainer);
            cardExpiryElement.mount(expiryContainer);
            cardCvcElement.mount(cvcContainer);
            return true;
          } catch (err) {
            // Try mounting without unmounting (for first time)
            cardNumberElement.mount(cardContainer);
            cardExpiryElement.mount(expiryContainer);
            cardCvcElement.mount(cvcContainer);
            return true;
          }
        }
        return false;
      };
      
      // Try to mount immediately, if containers aren't ready, wait briefly
      if (!mountElements()) {
        setTimeout(mountElements, 50);
      }
    }
  }

  function goBack() {
    goto('/settings');
  }
</script>

<AppLayout title="Payment Methods" showBackButton={true} onBack={goBack} maxWidth="max-w-4xl">
  {#if loading}
    <div class="flex justify-center py-12">
      <div class="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
    </div>
  {:else}
    <div class="space-y-6">
      <!-- Load Error Display -->
      {#if loadError}
        <Card class="border-destructive bg-destructive/5">
          <CardContent class="p-4">
            <p class="text-destructive">{loadError}</p>
          </CardContent>
        </Card>
      {/if}
      
      <!-- Drawer for adding payment methods -->
      <Drawer bind:open={isDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Add Payment Method</DrawerTitle>
            <DrawerDescription>
              Add a new payment method to your account
            </DrawerDescription>
          </DrawerHeader>
          
          <div class="px-4 space-y-4">
            {#if error}
              <div class="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p class="text-destructive text-sm">{error}</p>
              </div>
            {/if}
            
            <div class="space-y-4">
              <div class="space-y-2">
                <Label for="card-number">Card Number</Label>
                <div id="card-number" class="p-3 border border-border rounded-lg bg-background text-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2" bind:this={cardContainer}></div>
              </div>
              
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label for="card-expiry">Expiry Date</Label>
                  <div id="card-expiry" class="p-3 border border-border rounded-lg bg-background text-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2" bind:this={expiryContainer}></div>
                </div>
                <div class="space-y-2">
                  <Label for="card-cvc">CVC</Label>
                  <div id="card-cvc" class="p-3 border border-border rounded-lg bg-background text-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2" bind:this={cvcContainer}></div>
                </div>
              </div>
            </div>
          </div>
          
          <DrawerFooter>
            <Button 
              type="button" 
              onclick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAddPaymentMethod();
              }} 
              disabled={isProcessing || !setupIntent} 
              class="w-full"
            >
              {#if isProcessing}
                <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
                Adding...
              {:else}
                Add Payment Method
              {/if}
            </Button>
            <DrawerClose>
              <Button variant="outline" class="w-full">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      
      <!-- Edit Payment Method Drawer -->
      <Drawer bind:open={isEditDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle class="flex items-center justify-center text-center">
              Edit 
              {#if selectedPaymentMethod}
                {selectedPaymentMethod.card_brand.toUpperCase()} •••• {selectedPaymentMethod.card_last4}
              {/if}
            </DrawerTitle>
          </DrawerHeader>
          
          <div class="px-4 space-y-3">
            {#if selectedPaymentMethod && !selectedPaymentMethod.is_default}
              <Button 
                onclick={() => {
                  if (selectedPaymentMethod && !isProcessing) {
                    setDefaultPaymentMethod(selectedPaymentMethod.stripe_payment_method_id);
                    isEditDrawerOpen = false;
                  }
                }}
                class="w-full justify-start"
                variant="ghost"
                disabled={isProcessing}
              >
                {#if isProcessing}
                  <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
                {/if}
                Set Default
              </Button>
            {/if}
            
            <Button 
              onclick={() => {
                if (selectedPaymentMethod && !isProcessing) {
                  deletePaymentMethod(selectedPaymentMethod.stripe_payment_method_id);
                  isEditDrawerOpen = false;
                }
              }}
              class="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
              variant="ghost"
              disabled={isProcessing}
            >
              {#if isProcessing}
                <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
              {/if}
              Remove
            </Button>
          </div>
          
          <DrawerFooter>
            <DrawerClose>
              <Button variant="outline" class="w-full">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      
      <!-- Payment Methods List -->
      {#if paymentMethods.length === 0}
        <div class="py-12 text-center">
          <CreditCard class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 class="text-lg font-medium mb-2">No payment methods</h3>
          <p class="text-muted-foreground mb-4">Add your first payment method to get started</p>
        </div>
      {:else}
        <div class="space-y-0">
          {#each paymentMethods as method, index (method.id)}
            <div class="flex items-center justify-between px-2 py-4 {index < paymentMethods.length - 1 ? 'border-b border-border' : ''}">
              <div class="flex items-center gap-3">
                <div class="text-2xl">{getBrandIcon(method.card_brand)}</div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-sm">
                      {method.card_brand.toUpperCase()} {method.card_last4}
                    </span>
                    {#if method.is_default}
                      <Badge variant="default" class="text-xs">Default</Badge>
                    {/if}
                  </div>
                  <p class="text-xs text-muted-foreground">
                    Expires {method.card_exp_month.toString().padStart(2, '0')}/{method.card_exp_year}
                  </p>
                </div>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onclick={() => openEditDrawer(method)}
                class="text-muted-foreground hover:text-foreground"
              >
                Edit
              </Button>
            </div>
          {/each}
        </div>
      {/if}
      
      <!-- Single Add Payment Method Button -->
      <div class="flex justify-center">
        <Button onclick={openDrawer} class="gap-2">
          <Plus class="w-4 h-4" />
          Add Payment Method
        </Button>
      </div>
    </div>
  {/if}
</AppLayout>
