use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use stripe::{
    Client, CreateCustomer, CreatePaymentIntent, CreateSubscription, CreatePrice, CreateProduct,
    Customer, PaymentIntent, Subscription, Price, Product, Currency, UpdateSubscription,
    CreateSubscriptionItems, CreatePriceRecurring, CreatePriceRecurringInterval,
    CustomerId, IdOrCreate,
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
