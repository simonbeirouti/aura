use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;
use stripe::{
    Client, CreateCustomer, CreatePaymentIntent, CreateSubscription, CreatePrice, CreateProduct,
    Customer, PaymentIntent, Subscription, Price, Product, Currency, UpdateSubscription,
    CreateSubscriptionItems, CreatePriceRecurring, CreatePriceRecurringInterval,
    CustomerId, IdOrCreate, ListCustomers, AttachPaymentMethod,
};

#[derive(Debug, Serialize, Deserialize)]
pub struct StripeConfig {
    pub secret_key: String,
    pub publishable_key: String,
    pub price_id: String, // For the subscription price
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PaymentIntentResponse {
    pub client_secret: String,
    pub payment_intent_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubscriptionResponse {
    pub subscription_id: String,
    pub customer_id: String,
    pub status: String,
    pub current_period_end: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubscriptionSyncResult {
    pub updated_subscriptions: u32,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProductPrice {
    pub id: String,
    pub amount: i64,
    pub currency: String,
    pub interval: String,
    pub interval_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProductWithPrices {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub prices: Vec<ProductPrice>,
}

// Initialize Stripe client with secret key from environment or manual input
fn get_stripe_client() -> Result<Client, String> {
    // Try compile-time environment variable first (for mobile platforms)
    let secret_key = if !env!("STRIPE_SECRET_KEY").is_empty() {
        env!("STRIPE_SECRET_KEY").to_string()
    } else {
        // Fallback to runtime environment variable (for desktop)
        std::env::var("STRIPE_SECRET_KEY")
            .map_err(|_| "STRIPE_SECRET_KEY environment variable not set".to_string())?
    };
    
    if secret_key.is_empty() {
        return Err("STRIPE_SECRET_KEY is empty".to_string());
    }
    
    Ok(Client::new(secret_key))
}

// Get Stripe configuration from environment variables with cross-platform support
fn get_stripe_config() -> Result<StripeConfig, String> {
    // Try compile-time environment variables first (for mobile platforms)
    let secret_key = if !env!("STRIPE_SECRET_KEY").is_empty() {
        env!("STRIPE_SECRET_KEY").to_string()
    } else {
        std::env::var("STRIPE_SECRET_KEY")
            .map_err(|_| "STRIPE_SECRET_KEY environment variable not set".to_string())?
    };
    
    let publishable_key = if !env!("STRIPE_PUBLISHABLE_KEY").is_empty() {
        env!("STRIPE_PUBLISHABLE_KEY").to_string()
    } else {
        std::env::var("STRIPE_PUBLISHABLE_KEY")
            .map_err(|_| "STRIPE_PUBLISHABLE_KEY environment variable not set".to_string())?
    };
    
    let price_id = if !env!("STRIPE_PRODUCT_ID").is_empty() {
        env!("STRIPE_PRODUCT_ID").to_string()
    } else {
        std::env::var("STRIPE_PRODUCT_ID")
            .map_err(|_| "STRIPE_PRODUCT_ID environment variable not set".to_string())?
    };

    Ok(StripeConfig {
        secret_key,
        publishable_key,
        price_id,
    })
}

#[tauri::command]
pub async fn get_stripe_publishable_key() -> Result<String, String> {
    let config = get_stripe_config()?;
    Ok(config.publishable_key)
}

#[tauri::command]
pub async fn create_payment_intent(
    amount: i64, // Amount in cents
    currency: String,
    customer_id: Option<String>,
) -> Result<PaymentIntentResponse, String> {
    let client = get_stripe_client()?;
    
    let currency_enum = match currency.to_lowercase().as_str() {
        "usd" => Currency::USD,
        "eur" => Currency::EUR,
        "gbp" => Currency::GBP,
        _ => Currency::USD,
    };
    let mut params = CreatePaymentIntent::new(amount, currency_enum);
    
    if let Some(customer) = customer_id {
        params.customer = Some(customer.parse().map_err(|_| "Invalid customer ID".to_string())?);
    }
    
    // Enable Apple Pay
    params.payment_method_types = Some(vec!["card".to_string()]);
    
    let payment_intent = PaymentIntent::create(&client, params)
        .await
        .map_err(|e| format!("Failed to create payment intent: {}", e))?;

    Ok(PaymentIntentResponse {
        client_secret: payment_intent.client_secret.unwrap_or_default(),
        payment_intent_id: payment_intent.id.to_string(),
    })
}

#[tauri::command]
pub async fn create_stripe_customer(
    email: String,
    name: Option<String>,
) -> Result<String, String> {
    let client = get_stripe_client()?;
    
    let mut params = CreateCustomer::new();
    params.email = Some(&email);
    if let Some(customer_name) = name.as_ref() {
        params.name = Some(customer_name);
    }
    
    let customer = Customer::create(&client, params)
        .await
        .map_err(|e| format!("Failed to create customer: {}", e))?;

    Ok(customer.id.to_string())
}

#[tauri::command]
pub async fn get_or_create_customer(
    email: String,
    name: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = get_stripe_client()?;
    
    // First try to find existing customer by email
    let mut list_params = ListCustomers::new();
    list_params.email = Some(&email);
    list_params.limit = Some(1);
    
    let customers = Customer::list(&client, &list_params)
        .await
        .map_err(|e| format!("Failed to search for customer: {}", e))?;
    
    if let Some(customer) = customers.data.first() {
        // Return existing customer
        return Ok(serde_json::json!({
            "id": customer.id.to_string(),
            "email": customer.email,
            "name": customer.name
        }));
    }
    
    // Create new customer if not found
    let mut params = CreateCustomer::new();
    params.email = Some(&email);
    if let Some(customer_name) = name.as_ref() {
        params.name = Some(customer_name);
    }
    
    let customer = Customer::create(&client, params)
        .await
        .map_err(|e| format!("Failed to create customer: {}", e))?;

    Ok(serde_json::json!({
        "id": customer.id.to_string(),
        "email": customer.email,
        "name": customer.name
    }))
}

#[tauri::command]
pub async fn create_subscription(
    customer_id: String,
    price_id: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<SubscriptionResponse, String> {
    let client = get_stripe_client()?;
    
    let customer_id_parsed: CustomerId = customer_id.clone().parse().map_err(|_| "Invalid customer ID".to_string())?;
    let mut params = CreateSubscription::new(customer_id_parsed);
    params.items = Some(vec![CreateSubscriptionItems {
        price: Some(price_id.clone()),
        quantity: Some(1),
        ..Default::default()
    }]);
    
    // Add metadata to link subscription to user
    let mut metadata = HashMap::new();
    metadata.insert("user_id".to_string(), user_id.clone());
    params.metadata = Some(metadata);
    
    let subscription = Subscription::create(&client, params)
        .await
        .map_err(|e| format!("Failed to create subscription: {}", e))?;

    // Update user profile in Supabase with subscription info
    let subscription_status = subscription.status.to_string();
    let current_period_end = subscription.current_period_end;
    
    // Use existing database module to update user profile
    crate::database::update_subscription_status(
        user_id,
        customer_id.clone(),
        subscription.id.to_string(),
        subscription_status.clone(),
        current_period_end,
        app,
    ).await?;

    Ok(SubscriptionResponse {
        subscription_id: subscription.id.to_string(),
        customer_id,
        status: subscription_status,
        current_period_end,
    })
}

#[tauri::command]
pub async fn cancel_subscription(
    subscription_id: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let client = get_stripe_client()?;
    
    // Cancel the subscription at period end
    let mut params = UpdateSubscription::default();
    params.cancel_at_period_end = Some(true);
    
    let subscription = Subscription::update(&client, &subscription_id.parse().map_err(|_| "Invalid subscription ID".to_string())?, params)
        .await
        .map_err(|e| format!("Failed to cancel subscription: {}", e))?;

    // Update user profile in Supabase
    crate::database::update_subscription_status(
        user_id,
        match subscription.customer {
            stripe::Expandable::Id(id) => id.to_string(),
            stripe::Expandable::Object(customer) => customer.id.to_string(),
        },
        subscription_id,
        "canceled".to_string(),
        subscription.current_period_end,
        app,
    ).await?;

    Ok("Subscription canceled successfully".to_string())
}

#[tauri::command]
pub async fn get_subscription_status(
    subscription_id: String,
) -> Result<SubscriptionResponse, String> {
    let client = get_stripe_client()?;
    
    let subscription = Subscription::retrieve(&client, &subscription_id.parse().map_err(|_| "Invalid subscription ID".to_string())?, &[])
        .await
        .map_err(|e| format!("Failed to retrieve subscription: {}", e))?;

    Ok(SubscriptionResponse {
        subscription_id: subscription.id.to_string(),
        customer_id: match subscription.customer {
            stripe::Expandable::Id(id) => id.to_string(),
            stripe::Expandable::Object(customer) => customer.id.to_string(),
        },
        status: subscription.status.to_string(),
        current_period_end: subscription.current_period_end,
    })
}

#[tauri::command]
pub async fn sync_subscription_status(
    user_id: String,
    subscription_id: String,
    app: tauri::AppHandle,
) -> Result<SubscriptionResponse, String> {
    let client = get_stripe_client()?;
    
    // Get latest subscription status from Stripe
    let subscription = Subscription::retrieve(&client, &subscription_id.parse().map_err(|_| "Invalid subscription ID".to_string())?, &[])
        .await
        .map_err(|e| format!("Failed to retrieve subscription: {}", e))?;

    // Update user profile with latest subscription status
    let customer_id = match subscription.customer {
        stripe::Expandable::Id(id) => id.to_string(),
        stripe::Expandable::Object(customer) => customer.id.to_string(),
    };
    
    crate::database::update_subscription_status(
        user_id,
        customer_id.clone(),
        subscription.id.to_string(),
        subscription.status.to_string(),
        subscription.current_period_end,
        app,
    ).await?;

    Ok(SubscriptionResponse {
        subscription_id: subscription.id.to_string(),
        customer_id,
        status: subscription.status.to_string(),
        current_period_end: subscription.current_period_end,
    })
}

#[tauri::command]
pub async fn sync_all_user_subscriptions(
    user_id: String,
    app: tauri::AppHandle,
) -> Result<SubscriptionSyncResult, String> {
    // Get user's current profile to find their subscription
    let profile = crate::database::get_user_profile(user_id.clone(), app.clone()).await
        .map_err(|e| format!("Failed to get user profile: {}", e))?
        .ok_or("User profile not found")?;
    
    let mut updated_subscriptions = 0;
    let mut errors = Vec::new();
    
    // If user has a subscription, sync its status
    if let Some(subscription_id) = profile.subscription_id {
        match sync_subscription_status(user_id, subscription_id, app).await {
            Ok(_) => updated_subscriptions += 1,
            Err(e) => errors.push(format!("Failed to sync subscription: {}", e)),
        }
    }
    
    Ok(SubscriptionSyncResult {
        updated_subscriptions,
        errors,
    })
}



// Fetch product with its associated prices
#[tauri::command]
pub async fn get_product_with_prices(
    product_id: String,
) -> Result<ProductWithPrices, String> {
    let client = get_stripe_client()?;
    
    // Get the product
    let product = stripe::Product::retrieve(&client, &product_id.parse().map_err(|_| "Invalid product ID".to_string())?, &[])
        .await
        .map_err(|e| format!("Failed to retrieve product: {}", e))?;
    
    // Get all prices for this product
    let product_id_str = product.id.to_string();
    let mut list_prices = stripe::ListPrices::new();
    list_prices.product = Some(stripe::IdOrCreate::Id(&product_id_str));
    list_prices.active = Some(true);
    list_prices.limit = Some(10); // Should be enough for monthly/yearly variants
    
    let prices = stripe::Price::list(&client, &list_prices)
        .await
        .map_err(|e| format!("Failed to retrieve prices: {}", e))?;
    
    // Convert prices to our format
    let mut product_prices = Vec::new();
    for price in prices.data {
        if let Some(recurring) = price.recurring {
            product_prices.push(ProductPrice {
                id: price.id.to_string(),
                amount: price.unit_amount.unwrap_or(0),
                currency: price.currency.map(|c| c.to_string()).unwrap_or_else(|| "usd".to_string()),
                interval: recurring.interval.to_string(),
                interval_count: recurring.interval_count as i64,
            });
        }
    }
    
    Ok(ProductWithPrices {
        id: product.id.to_string(),
        name: product.name.unwrap_or("Unnamed Product".to_string()),
        description: product.description,
        prices: product_prices,
    })
}

// Helper function to create a price for an existing product
#[tauri::command]
pub async fn create_price_for_product(
    product_id: String,
    amount: i64, // Amount in cents
    currency: String,
    interval: String, // "month" or "year"
) -> Result<String, String> {
    let client = get_stripe_client()?;
    
    let mut params = CreatePrice::new(currency.parse().map_err(|_| "Invalid currency".to_string())?);
    params.unit_amount = Some(amount);
    params.product = Some(IdOrCreate::Id(&product_id));
    params.recurring = Some(CreatePriceRecurring {
        interval: match interval.as_str() {
            "month" => CreatePriceRecurringInterval::Month,
            "year" => CreatePriceRecurringInterval::Year,
            _ => return Err("Invalid interval. Use 'month' or 'year'".to_string()),
        },
        ..Default::default()
    });
    
    let price = Price::create(&client, params)
        .await
        .map_err(|e| format!("Failed to create price: {}", e))?;
    
    Ok(price.id.to_string())
}

// Helper function to create a product and price (run once during setup)
#[tauri::command]
pub async fn setup_stripe_product(
    name: String,
    description: String,
    amount: i64, // Amount in cents
    currency: String,
    interval: String, // "month" or "year"
) -> Result<String, String> {
    let client = get_stripe_client()?;
    
    // Create product
    let mut product_params = CreateProduct::new(&name);
    product_params.description = Some(&description);
    
    let product = Product::create(&client, product_params)
        .await
        .map_err(|e| format!("Failed to create product: {}", e))?;

    // Create price
    let currency_enum = match currency.to_lowercase().as_str() {
        "usd" => Currency::USD,
        "eur" => Currency::EUR,
        "gbp" => Currency::GBP,
        _ => Currency::USD,
    };
    let mut price_params = CreatePrice::new(currency_enum);
    let product_id_str = product.id.to_string();
    price_params.product = Some(IdOrCreate::Id(&product_id_str));
    price_params.unit_amount = Some(amount);
    
    let interval_enum = match interval.to_lowercase().as_str() {
        "month" => CreatePriceRecurringInterval::Month,
        "year" => CreatePriceRecurringInterval::Year,
        _ => CreatePriceRecurringInterval::Month,
    };
    
    price_params.recurring = Some(CreatePriceRecurring {
        interval: interval_enum,
        interval_count: Some(1),
        ..Default::default()
    });
    
    let price = Price::create(&client, price_params)
        .await
        .map_err(|e| format!("Failed to create price: {}", e))?;

    Ok(format!("Product created successfully. Price ID: {}", price.id))
}

// Payment Method Management Commands

#[derive(Debug, Serialize, Deserialize)]
pub struct PaymentMethodResponse {
    pub id: String,
    pub card_brand: String,
    pub card_last4: String,
    pub card_exp_month: i64,
    pub card_exp_year: i64,
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SetupIntentResponse {
    pub client_secret: String,
    pub setup_intent_id: String,
}

// Create a setup intent for adding payment methods
#[tauri::command]
pub async fn create_setup_intent(
    customer_id: String,
) -> Result<SetupIntentResponse, String> {
    let client = get_stripe_client()?;
    
    let mut params = stripe::CreateSetupIntent::new();
    params.customer = Some(stripe::CustomerId::from_str(&customer_id).map_err(|e| format!("Invalid customer ID: {}", e))?);
    params.payment_method_types = Some(vec!["card".to_string()]);
    
    let setup_intent = stripe::SetupIntent::create(&client, params)
        .await
        .map_err(|e| format!("Failed to create setup intent: {}", e))?;
    
    Ok(SetupIntentResponse {
        client_secret: setup_intent.client_secret.unwrap_or_default(),
        setup_intent_id: setup_intent.id.to_string(),
    })
}

// Get customer's payment methods
#[tauri::command]
pub async fn get_customer_payment_methods(
    customer_id: String,
) -> Result<Vec<PaymentMethodResponse>, String> {
    println!("[Stripe] Getting payment methods for customer: {}", customer_id);
    
    let client = get_stripe_client().map_err(|e| {
        println!("[Stripe] Failed to get Stripe client: {}", e);
        e
    })?;
    
    let mut params = stripe::ListPaymentMethods::new();
    params.customer = Some(stripe::CustomerId::from_str(&customer_id).map_err(|e| {
        let error = format!("Invalid customer ID: {}", e);
        println!("[Stripe] {}", error);
        error
    })?);
    params.type_ = Some(stripe::PaymentMethodTypeFilter::Card);
    
    println!("[Stripe] Calling Stripe API to list payment methods...");
    let payment_methods = stripe::PaymentMethod::list(&client, &params)
        .await
        .map_err(|e| {
            let error = format!("Failed to fetch payment methods: {}", e);
            println!("[Stripe] {}", error);
            error
        })?;
    
    println!("[Stripe] Found {} payment methods", payment_methods.data.len());
    
    let mut methods = Vec::new();
    for pm in payment_methods.data {
        if let Some(card) = pm.card {
            methods.push(PaymentMethodResponse {
                id: pm.id.to_string(),
                card_brand: card.brand,
                card_last4: card.last4,
                card_exp_month: card.exp_month as i64,
                card_exp_year: card.exp_year as i64,
                is_default: false, // We'll determine this separately if needed
            });
        }
    }
    
    println!("[Stripe] Returning {} processed payment methods", methods.len());
    Ok(methods)
}

// Alias for frontend compatibility
#[tauri::command]
pub async fn list_payment_methods(
    customer_id: String,
) -> Result<Vec<PaymentMethodResponse>, String> {
    println!("[Stripe] list_payment_methods called with customer_id: {}", customer_id);
    get_customer_payment_methods(customer_id).await
}

// Delete a payment method
#[tauri::command]
pub async fn delete_payment_method(
    payment_method_id: String,
) -> Result<String, String> {
    let client = get_stripe_client()?;
    
    let payment_method_id = stripe::PaymentMethodId::from_str(&payment_method_id)
        .map_err(|e| format!("Invalid payment method ID: {}", e))?;
    
    stripe::PaymentMethod::detach(&client, &payment_method_id)
        .await
        .map_err(|e| format!("Failed to delete payment method: {}", e))?;
    
    Ok("Payment method deleted successfully".to_string())
}

// Set default payment method for customer
#[tauri::command]
pub async fn set_default_payment_method(
    customer_id: String,
    payment_method_id: String,
) -> Result<String, String> {
    let client = get_stripe_client()?;
    
    let customer_id = stripe::CustomerId::from_str(&customer_id)
        .map_err(|e| format!("Invalid customer ID: {}", e))?;
    let payment_method_id = stripe::PaymentMethodId::from_str(&payment_method_id)
        .map_err(|e| format!("Invalid payment method ID: {}", e))?;
    
    let mut params = stripe::UpdateCustomer::new();
    params.invoice_settings = Some(stripe::CustomerInvoiceSettings {
        default_payment_method: Some(payment_method_id.to_string()),
        ..Default::default()
    });
    
    stripe::Customer::update(&client, &customer_id, params)
        .await
        .map_err(|e| format!("Failed to set default payment method: {}", e))?;
    
    Ok("Default payment method updated successfully".to_string())
}

// Enhanced payment method functions that integrate with database storage

/// Create setup intent and store payment method metadata after successful setup
#[tauri::command]
pub async fn create_and_store_payment_method(
    customer_id: String,
    _user_id: String,
    _app: tauri::AppHandle,
) -> Result<SetupIntentResponse, String> {
    // First create the setup intent
    let setup_intent = create_setup_intent(customer_id.clone()).await?;
    
    // The actual payment method will be stored after the frontend confirms the setup intent
    // This function just returns the setup intent for the frontend to complete
    Ok(setup_intent)
}

/// Store payment method metadata after successful Stripe setup intent confirmation
#[tauri::command]
pub async fn store_payment_method_after_setup(
    customer_id: String,
    payment_method_id: String,
    user_id: String,
    is_default: Option<bool>,
    app: tauri::AppHandle,
) -> Result<crate::database::PaymentMethod, String> {
    let client = get_stripe_client()?;
    
    let pm_id = stripe::PaymentMethodId::from_str(&payment_method_id).map_err(|e| {
        format!("Invalid payment method ID: {}", e)
    })?;
    
    let payment_method = stripe::PaymentMethod::retrieve(&client, &pm_id, &[]).await.map_err(|e| {
        format!("Stripe API error: {}", e)
    })?;
    
    // Extract card details for storage (non-sensitive metadata only)
    let (card_brand, card_last4, card_exp_month, card_exp_year) = match &payment_method.card {
        Some(card) => {
            // Convert brand to lowercase string without quotes
            // The card.brand is already a String, so we just need to convert it to lowercase
            let brand = card.brand.to_lowercase();
            let last4 = card.last4.clone();
            let exp_month = card.exp_month as i32;
            let exp_year = card.exp_year as i32;
            (brand, last4, exp_month, exp_year)
        },
        None => {
            return Err("Payment method does not have card details".to_string());
        },
    };
    
    // Store in database using the database module function
    crate::database::store_payment_method(
        user_id.clone(),
        payment_method_id.clone(),
        card_brand.clone(),
        card_last4.clone(),
        card_exp_month,
        card_exp_year,
        is_default,
        app,
    ).await
}

/// Get user's payment methods from database (faster than Stripe API)
#[tauri::command]
pub async fn get_stored_payment_methods(
    user_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<crate::database::PaymentMethod>, String> {
    crate::database::get_user_payment_methods(user_id, app).await
}

/// Set payment method as default in both Stripe and database
#[tauri::command]
pub async fn set_default_payment_method_integrated(
    customer_id: String,
    payment_method_id: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let client = get_stripe_client()?;
    
    // First, check if the payment method is attached to the customer
    let pm_id = stripe::PaymentMethodId::from_str(&payment_method_id)
        .map_err(|e| format!("Invalid payment method ID: {}", e))?;
    
    // Try to retrieve the payment method to check its status
    match stripe::PaymentMethod::retrieve(&client, &pm_id, &[]).await {
        Ok(pm) => {
            // Check if it's attached to the right customer
            match pm.customer {
                Some(stripe::Expandable::Id(cust_id)) => {
                    if cust_id.to_string() != customer_id {
                        // Payment method exists but is attached to wrong customer or not attached
                        return Err(format!("Payment method {} is not attached to customer {}", payment_method_id, customer_id));
                    }
                },
                Some(stripe::Expandable::Object(customer)) => {
                    if customer.id.to_string() != customer_id {
                        return Err(format!("Payment method {} is attached to wrong customer", payment_method_id));
                    }
                },
                None => {
                    // Payment method exists but is not attached to any customer
                    // Try to attach it first
                    let customer_id_stripe = stripe::CustomerId::from_str(&customer_id)
                        .map_err(|e| format!("Invalid customer ID: {}", e))?;
                    
                    let attach_params = AttachPaymentMethod {
                        customer: customer_id_stripe,
                    };
                    
                    match stripe::PaymentMethod::attach(&client, &pm_id, attach_params).await {
                        Ok(_) => {
                            // Successfully attached
                        },
                        Err(e) => {
                            // Check if it's a "permanently unusable" error
                            let error_msg = e.to_string();
                            if error_msg.contains("was previously used without being attached") || 
                               error_msg.contains("may not be used again") {
                                // Payment method is permanently unusable, remove from database
                                let _ = crate::database::delete_payment_method_from_db(
                                    payment_method_id.clone(),
                                    user_id.clone(),
                                    app.clone(),
                                ).await;
                                return Err("Payment method is no longer usable and has been removed from your account. Please add a new payment method.".to_string());
                            } else {
                                return Err(format!("Failed to attach payment method to customer: {}", e));
                            }
                        }
                    }
                }
            }
        },
        Err(e) => {
            return Err(format!("Failed to retrieve payment method from Stripe: {}", e));
        }
    }
    
    // Now set as default in Stripe
    set_default_payment_method(customer_id, payment_method_id.clone()).await?;
    
    // Update in database
    crate::database::update_payment_method(
        payment_method_id,
        user_id,
        Some(true), // is_default
        None,       // is_active (don't change)
        app,
    ).await?;
    
    Ok("Payment method set as default successfully".to_string())
}

/// Delete payment method from both Stripe and database
#[tauri::command]
pub async fn delete_payment_method_integrated(
    payment_method_id: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    // Try to delete from Stripe first, but don't fail if it's already detached/orphaned
    match delete_payment_method(payment_method_id.clone()).await {
        Ok(_) => {
            // Successfully deleted from Stripe
        },
        Err(e) => {
            // Check if it's an "already detached" or "not attached" error
            if e.contains("not attached to a customer") || e.contains("detachment is impossible") {
                // Payment method is orphaned in Stripe, just remove from database
            } else {
                // Some other Stripe error, propagate it
                return Err(e);
            }
        }
    }
    
    // Soft delete from database
    crate::database::delete_payment_method_from_db(
        payment_method_id,
        user_id,
        app,
    ).await?;
    
    Ok("Payment method deleted successfully".to_string())
}

/// Create payment intent using stored payment method (for charging)
#[tauri::command]
pub async fn create_payment_intent_with_stored_method(
    amount: i64,
    currency: String,
    payment_method_id: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<PaymentIntentResponse, String> {
    let client = get_stripe_client()?;
    
    // Get customer ID from the stored payment method
    let payment_methods = crate::database::get_user_payment_methods(user_id.clone(), app.clone()).await?;
    let stored_pm = payment_methods
        .iter()
        .find(|pm| pm.stripe_payment_method_id == payment_method_id)
        .ok_or_else(|| "Payment method not found in database".to_string())?;
    
    let currency = Currency::from_str(&currency.to_lowercase())
        .map_err(|_| "Invalid currency code".to_string())?;
    
    let mut params = stripe::CreatePaymentIntent::new(amount, currency);
    // Note: Customer ID would need to be retrieved from user profile if needed
    // For now, we'll create the payment intent without explicit customer association
    params.payment_method = Some(stripe::PaymentMethodId::from_str(&payment_method_id)
        .map_err(|e| format!("Invalid payment method ID: {}", e))?);
    params.confirmation_method = Some(stripe::PaymentIntentConfirmationMethod::Manual);
    params.confirm = Some(true);
    
    let payment_intent = stripe::PaymentIntent::create(&client, params)
        .await
        .map_err(|e| format!("Failed to create payment intent: {}", e))?;
    
    // Mark payment method as used in database
    let _ = crate::database::mark_payment_method_used(
        payment_method_id,
        user_id,
        app,
    ).await;
    
    Ok(PaymentIntentResponse {
        client_secret: payment_intent.client_secret.unwrap_or_default(),
        payment_intent_id: payment_intent.id.to_string(),
    })
}
