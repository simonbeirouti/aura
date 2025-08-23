use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::command;
use tauri_plugin_store::StoreExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub updated_at: Option<String>,
    pub username: Option<String>,
    pub full_name: Option<String>,
    pub avatar_url: Option<String>,
    pub onboarding_complete: Option<bool>,
    pub stripe_customer_id: Option<String>,
    pub subscription_id: Option<String>,
    pub subscription_status: Option<String>,
    pub subscription_period_end: Option<i64>,
    // Token balance fields
    pub total_tokens: Option<i64>,
    pub tokens_remaining: Option<i64>,
    pub tokens_used: Option<i64>,
    // Purchase tracking fields
    pub total_purchases: Option<i32>,
    pub total_spent_cents: Option<i64>,
    pub last_purchase_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub database_url: String,
    pub access_token: String,
    pub anon_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PaymentMethod {
    pub id: String,
    pub user_id: String,
    pub stripe_customer_id: String,
    pub stripe_payment_method_id: String,
    pub card_brand: String,
    pub card_last4: String,
    pub card_exp_month: i32,
    pub card_exp_year: i32,
    pub is_default: bool,
    pub is_active: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub last_used_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePaymentMethodRequest {
    pub user_id: String,
    pub stripe_customer_id: String,
    pub stripe_payment_method_id: String,
    pub card_brand: String,
    pub card_last4: String,
    pub card_exp_month: i32,
    pub card_exp_year: i32,
    pub is_default: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Purchase {
    pub id: String,
    pub user_id: String,
    pub stripe_payment_intent_id: String,
    pub stripe_price_id: String,
    pub stripe_product_id: Option<String>,
    pub package_id: Option<String>,
    pub package_price_id: Option<String>,
    pub amount_paid: i64,
    pub currency: String,
    pub tokens_purchased: Option<i64>,
    pub status: String,
    pub completed_at: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdatePaymentMethodRequest {
    pub payment_method_id: String,
    pub user_id: String,
    pub is_default: Option<bool>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionPlan {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub stripe_product_id: String,
    pub features: Option<serde_json::Value>,
    pub is_active: bool,
    pub sort_order: i32,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ContractorKycFormData {
    #[serde(rename = "contractorType", alias = "contractor_type")]
    pub contractor_type: String,
    pub email: String,
    
    // Individual fields
    #[serde(rename = "firstName", alias = "first_name")]
    pub first_name: Option<String>,
    #[serde(rename = "lastName", alias = "last_name")]
    pub last_name: Option<String>,
    pub phone: Option<String>,
    #[serde(rename = "dateOfBirth", alias = "date_of_birth")]
    pub date_of_birth: Option<String>,
    #[serde(rename = "nationalIdNumber", alias = "national_id_number")]
    pub national_id_number: Option<String>,
    #[serde(rename = "nationalIdType", alias = "national_id_type")]
    pub national_id_type: Option<String>,
    
    // Business fields
    #[serde(rename = "businessName", alias = "business_name")]
    pub business_name: Option<String>,
    #[serde(rename = "businessTaxId", alias = "business_tax_id")]
    pub business_tax_id: Option<String>,
    #[serde(rename = "businessUrl", alias = "business_url")]
    pub business_url: Option<String>,
    #[serde(rename = "businessDescription", alias = "business_description")]
    pub business_description: Option<String>,
    #[serde(rename = "industryMccCode", alias = "industry_mcc_code")]
    pub industry_mcc_code: Option<String>,
    #[serde(rename = "companyRegistrationNumber", alias = "company_registration_number")]
    pub company_registration_number: Option<String>,
    #[serde(rename = "companyStructure", alias = "company_structure")]
    pub company_structure: Option<String>,
    
    // Address
    pub address: Option<ContractorAddress>,
    
    // Bank account
    #[serde(rename = "bankAccount", alias = "bank_account")]
    pub bank_account: Option<ContractorBankAccount>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ContractorAddress {
    pub line1: String,
    pub line2: Option<String>,
    pub city: String,
    pub state: String,
    #[serde(rename = "postalCode", alias = "postal_code")]
    pub postal_code: String,
    pub country: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Contractor {
    pub id: String,
    pub user_id: String,
    pub profile_id: String,
    pub contractor_type: String,
    pub kyc_status: String,
    pub is_active: bool,
    pub stripe_connect_account_id: Option<String>,
    pub stripe_connect_account_status: Option<String>,
    pub stripe_connect_requirements_completed: Option<bool>,
    
    // Business information
    pub business_name: Option<String>,
    pub business_tax_id: Option<String>,
    pub business_website_url: Option<String>,
    pub business_description: Option<String>,
    pub industry_mcc_code: Option<String>,
    pub company_registration_number: Option<String>,
    pub company_structure: Option<String>,
    
    // Individual information
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub date_of_birth: Option<String>,
    pub phone_number: Option<String>,
    pub national_id_number: Option<String>,
    pub national_id_type: Option<String>,
    
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionPrice {
    pub id: String,
    pub subscription_plan_id: String,
    pub stripe_price_id: String,
    pub amount_cents: i64,
    pub currency: String,
    pub interval_type: String,
    pub interval_count: i32,
    pub token_amount: i64,
    pub trial_period_days: i32,
    pub is_active: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionPlanWithPrices {
    pub plan: SubscriptionPlan,
    pub prices: Vec<SubscriptionPrice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Package {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub stripe_product_id: String,
    pub features: Option<serde_json::Value>,
    pub is_active: bool,
    pub sort_order: i32,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackagePrice {
    pub id: String,
    pub package_id: String,
    pub stripe_price_id: String,
    pub amount_cents: i64,
    pub currency: String,
    pub interval_type: String,
    pub interval_count: i32,
    pub token_amount: i64,
    pub is_active: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageWithPrices {
    pub package: Package,
    pub prices: Vec<PackagePrice>,
}

/// Initialize database connection with authentication
/// Note: For Supabase, this stores connection config only
/// The schema should be set up directly in Supabase SQL Editor
#[command]
pub async fn init_database(
    database_url: String,
    access_token: String,
    anon_key: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    // Validate access token is present
    if access_token.is_empty() {
        return Err("Authentication required - no access token provided".to_string());
    }

    // For Supabase, we don't run migrations here
    // The schema should be set up directly in Supabase
    // This just stores the connection configuration

    // Store database config for future use (tokens are stored separately in session store)
    let store = app.store("database.store").map_err(|e| e.to_string())?;
    store.set("database_url", serde_json::json!(database_url));
    store.set("anon_key", serde_json::json!(anon_key));
    // Note: access_token is stored in session.store via store_tokens command
    store.save().map_err(|e| e.to_string())?;

    Ok("Database connection configured successfully".to_string())
}

/// Get authenticated database connection
pub async fn get_authenticated_db(app: &tauri::AppHandle) -> Result<DatabaseConfig, String> {
    // Get database URL from database store
    let db_store = app.store("database.store").map_err(|e| e.to_string())?;
    let database_url = db_store
        .get("database_url")
        .and_then(|v| v.as_str().map(String::from))
        .ok_or_else(|| "Database not initialized".to_string())?;

    // Get access token from session store
    let session_store = app.store("session.store").map_err(|e| e.to_string())?;
    let access_token = session_store
        .get("sb-access-token")
        .and_then(|v| v.as_str().map(String::from))
        .ok_or_else(|| "No authentication token found in session store".to_string())?;

    // Get anon key from database store
    let anon_key = db_store
        .get("anon_key")
        .and_then(|v| v.as_str().map(String::from))
        .ok_or_else(|| "No anon key found in database store".to_string())?;

    Ok(DatabaseConfig {
        database_url,
        access_token,
        anon_key,
    })
}

/// Get user profile with authentication check
#[command]
pub async fn get_user_profile(
    user_id: String,
    app: tauri::AppHandle,
) -> Result<Option<Profile>, String> {
    let db_config = get_authenticated_db(&app).await?;

    // Verify user is authenticated by checking if they have a valid session
    let session_check = crate::session::check_session(app.clone()).await?;
    if !session_check {
        return Err("Authentication required".to_string());
    }

    // Use HTTP request to Supabase REST API
    let client = reqwest::Client::new();
    
    let url = format!("{}/rest/v1/profiles", db_config.database_url);
    let auth_header = format!("Bearer {}", db_config.access_token);

    let response = client
        .get(&url)
        .header("Authorization", &auth_header)
        .header("apikey", &db_config.anon_key)
        .query(&[("id", format!("eq.{}", user_id))])
        .query(&[("select", "*")])
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status();
    
    if !status.is_success() {
        // Get response body for debugging
        let error_body = response.text().await.unwrap_or_else(|_| "Could not read error body".to_string());
        return Err(format!("Database query failed: {} - {}", status, error_body));
    }

    let profiles: Vec<Profile> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(profiles.into_iter().next())
}

/// Update user profile with authentication check
#[command]
pub async fn update_user_profile(
    user_id: String,
    username: Option<String>,
    full_name: Option<String>,
    avatar_url: Option<String>,
    onboarding_complete: Option<bool>,
    app: tauri::AppHandle,
) -> Result<Profile, String> {
    let db_config = get_authenticated_db(&app).await?;

    // Verify user is authenticated
    let session_check = crate::session::check_session(app.clone()).await?;
    if !session_check {
        return Err("Authentication required".to_string());
    }

    // Build update payload
    let mut update_data = serde_json::Map::new();
    if let Some(username) = username {
        update_data.insert("username".to_string(), serde_json::Value::String(username));
    }
    if let Some(full_name) = full_name {
        update_data.insert(
            "full_name".to_string(),
            serde_json::Value::String(full_name),
        );
    }
    if let Some(avatar_url) = avatar_url {
        update_data.insert(
            "avatar_url".to_string(),
            serde_json::Value::String(avatar_url),
        );
    }
    if let Some(onboarding_complete) = onboarding_complete {
        update_data.insert(
            "onboarding_complete".to_string(),
            serde_json::Value::Bool(onboarding_complete),
        );
    }
    update_data.insert(
        "updated_at".to_string(),
        serde_json::Value::String("now()".to_string()),
    );

    let client = reqwest::Client::new();

    let response = client
        .patch(&format!("{}/rest/v1/profiles", db_config.database_url))
        .header(
            "Authorization",
            format!("Bearer {}", db_config.access_token),
        )
        .header("apikey", db_config.anon_key.clone())
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .query(&[("id", format!("eq.{}", user_id))])
        .json(&update_data)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Profile update failed: {}", error_text));
    }

    let profiles: Vec<Profile> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    profiles
        .into_iter()
        .next()
        .ok_or_else(|| "Profile not found or access denied".to_string())
}

/// Create user profile (typically called after signup)
#[command]
pub async fn create_user_profile(
    user_id: String,
    full_name: Option<String>,
    avatar_url: Option<String>,
    onboarding_complete: Option<bool>,
    app: tauri::AppHandle,
) -> Result<Profile, String> {
    let db_config = get_authenticated_db(&app).await?;

    // Verify user is authenticated
    let session_check = crate::session::check_session(app.clone()).await?;
    if !session_check {
        return Err("Authentication required".to_string());
    }

    // Build create payload
    let mut create_data = serde_json::Map::new();
    create_data.insert("id".to_string(), serde_json::Value::String(user_id.clone()));
    if let Some(full_name) = full_name {
        create_data.insert(
            "full_name".to_string(),
            serde_json::Value::String(full_name),
        );
    }
    if let Some(avatar_url) = avatar_url {
        create_data.insert(
            "avatar_url".to_string(),
            serde_json::Value::String(avatar_url),
        );
    }
    if let Some(onboarding_complete) = onboarding_complete {
        create_data.insert(
            "onboarding_complete".to_string(),
            serde_json::Value::Bool(onboarding_complete),
        );
    }

    let client = reqwest::Client::new();

    let response = client
        .post(&format!("{}/rest/v1/profiles", db_config.database_url))
        .header(
            "Authorization",
            format!("Bearer {}", db_config.access_token),
        )
        .header("apikey", db_config.anon_key.clone())
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&create_data)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Profile creation failed: {}", error_text));
    }

    let profiles: Vec<Profile> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    profiles
        .into_iter()
        .next()
        .ok_or_else(|| "Failed to create profile".to_string())
}

/// Check if username is available
#[command]
pub async fn check_username_availability(
    username: String,
    app: tauri::AppHandle,
) -> Result<bool, String> {
    let db_config = get_authenticated_db(&app).await?;

    // Verify user is authenticated
    let session_check = crate::session::check_session(app.clone()).await?;

    if !session_check {
        return Err("Authentication required".to_string());
    }

    let client = reqwest::Client::new();

    let response = client
        .get(&format!("{}/rest/v1/profiles", db_config.database_url))
        .header(
            "Authorization",
            format!("Bearer {}", db_config.access_token),
        )
        .header("apikey", db_config.anon_key.clone())
        .query(&[("username", format!("eq.{}", username))])
        .query(&[("select", "id")])
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Username check failed: {}", response.status()));
    }

    let profiles: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(profiles.is_empty())
}

/// Get database connection status
#[command]
pub async fn get_database_status(app: tauri::AppHandle) -> Result<HashMap<String, String>, String> {
    let mut status = HashMap::new();

    // Check if database is configured
    let db_store = app.store("database.store").map_err(|e| e.to_string())?;
    let has_db_url = db_store.get("database_url").is_some();

    // Check if session tokens are available
    let session_store = app.store("session.store").map_err(|e| e.to_string())?;
    let has_tokens = session_store.get("sb-access-token").is_some()
        && session_store.get("sb-refresh-token").is_some();

    let has_config = has_db_url && has_tokens;

    status.insert("configured".to_string(), has_config.to_string());
    status.insert("has_database_url".to_string(), has_db_url.to_string());
    status.insert("has_session_tokens".to_string(), has_tokens.to_string());

    if has_config {
        // Check authentication
        let session_check = crate::session::check_session(app.clone()).await?;
        status.insert("authenticated".to_string(), session_check.to_string());

        if session_check {
            status.insert("status".to_string(), "ready".to_string());
        } else {
            status.insert("status".to_string(), "authentication_required".to_string());
        }
    } else {
        status.insert("status".to_string(), "not_configured".to_string());
    }

    Ok(status)
}

/// Update user subscription status
#[command]
pub async fn update_subscription_status(
    user_id: String,
    stripe_customer_id: String,
    subscription_id: String,
    subscription_status: String,
    subscription_period_end: i64,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let db_config = get_authenticated_db(&app).await?;
    let client = reqwest::Client::new();
    
    let url = format!("{}/rest/v1/profiles", db_config.database_url);
    
    let mut update_data = HashMap::new();
    update_data.insert("stripe_customer_id", serde_json::json!(stripe_customer_id));
    update_data.insert("subscription_id", serde_json::json!(subscription_id));
    update_data.insert("subscription_status", serde_json::json!(subscription_status));
    update_data.insert("subscription_period_end", serde_json::json!(subscription_period_end));
    update_data.insert("updated_at", serde_json::json!(chrono::Utc::now().to_rfc3339()));
    
    let response = client
        .patch(&url)
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .query(&[("id", format!("eq.{}", user_id))])
        .json(&update_data)
        .send()
        .await
        .map_err(|e| format!("Failed to send subscription update request: {}", e))?;
    
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Failed to update subscription status: {} - {}", status, error_text));
    }
    
    Ok(())
}

/// Store payment method metadata after successful Stripe setup
#[command]
pub async fn store_payment_method(
    user_id: String,
    stripe_customer_id: String,
    stripe_payment_method_id: String,
    card_brand: String,
    card_last4: String,
    card_exp_month: i32,
    card_exp_year: i32,
    is_default: Option<bool>,
    app: tauri::AppHandle,
) -> Result<PaymentMethod, String> {
    let db_config = get_authenticated_db(&app).await
        .map_err(|e| format!("Database authentication failed: {}", e))?;
    
    let client = reqwest::Client::new();
    
    // Check if this is the user's first payment method
    let existing_methods = get_user_payment_methods(user_id.clone(), app.clone()).await?;
    let should_be_default = is_default.unwrap_or(false) || existing_methods.is_empty();
    
    let url = format!("{}/rest/v1/payment_methods", db_config.database_url);
    
    let payload = serde_json::json!({
        "user_id": user_id,
        "stripe_customer_id": stripe_customer_id,
        "stripe_payment_method_id": stripe_payment_method_id,
        "card_brand": card_brand,
        "card_last4": card_last4,
        "card_exp_month": card_exp_month,
        "card_exp_year": card_exp_year,
        "is_default": should_be_default,
        "is_active": true
    });
    
    // If this is set as default, first unset all other defaults for this user
    if should_be_default {
        let _ = unset_all_default_payment_methods(user_id.clone(), app.clone()).await;
    }
    
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to store payment method: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Database error storing payment method: {}", error_text));
    }
    
    let payment_methods: Vec<PaymentMethod> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse payment method response: {}", e))?;
    
    payment_methods
        .into_iter()
        .next()
        .ok_or_else(|| "No payment method returned from database".to_string())
}

/// Get user's payment methods from database
#[command]
pub async fn get_user_payment_methods(
    user_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<PaymentMethod>, String> {
    let db_config = get_authenticated_db(&app).await?;
    let client = reqwest::Client::new();
    
    let url = format!("{}/rest/v1/payment_methods", db_config.database_url);
    
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .query(&[
            ("user_id", format!("eq.{}", user_id)),
            ("order", "is_default.desc,created_at.desc".to_string())
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to fetch payment methods: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Database error fetching payment methods: {}", error_text));
    }
    
    let payment_methods: Vec<PaymentMethod> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse payment methods response: {}", e))?;
    
    Ok(payment_methods)
}

/// Update payment method (e.g., set as default, deactivate)
#[command]
pub async fn update_payment_method(
    payment_method_id: String,
    user_id: String,
    is_default: Option<bool>,
    is_active: Option<bool>,
    app: tauri::AppHandle,
) -> Result<PaymentMethod, String> {
    let db_config = get_authenticated_db(&app).await?;
    let client = reqwest::Client::new();
    
    // If setting as default, first unset all other defaults
    if is_default == Some(true) {
        let _ = unset_all_default_payment_methods(user_id.clone(), app.clone()).await;
    }
    
    let url = format!("{}/rest/v1/payment_methods", db_config.database_url);
    
    let mut payload = serde_json::json!({});
    if let Some(default) = is_default {
        payload["is_default"] = serde_json::Value::Bool(default);
    }
    if let Some(active) = is_active {
        payload["is_active"] = serde_json::Value::Bool(active);
    }
    payload["updated_at"] = serde_json::Value::String(chrono::Utc::now().to_rfc3339());
    
    let response = client
        .patch(&url)
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .query(&[
            ("stripe_payment_method_id", format!("eq.{}", payment_method_id)),
            ("user_id", format!("eq.{}", user_id))
        ])
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to update payment method: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Database error updating payment method: {}", error_text));
    }
    
    let payment_methods: Vec<PaymentMethod> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse payment method response: {}", e))?;
    
    payment_methods
        .into_iter()
        .next()
        .ok_or_else(|| "No payment method returned from database".to_string())
}

/// Ensure that if there's only one payment method, it's set as default
async fn ensure_single_payment_method_is_default(
    user_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let payment_methods = get_user_payment_methods(user_id.clone(), app.clone()).await?;
    
    // If there's exactly one payment method and it's not default, make it default
    if payment_methods.len() == 1 {
        let pm = &payment_methods[0];
        if !pm.is_default {
            let _ = update_payment_method(
                pm.stripe_payment_method_id.clone(),
                user_id,
                Some(true), // is_default
                None,       // is_active (don't change)
                app,
            ).await;
        }
    }
    
    Ok(())
}

/// Delete payment method (hard delete from database)
#[command]
pub async fn delete_payment_method_from_db(
    payment_method_id: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let db_config = get_authenticated_db(&app).await?;
    let client = reqwest::Client::new();
    
    let url = format!("{}/rest/v1/payment_methods", db_config.database_url);
    
    let response = client
        .delete(&url)
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .query(&[
            ("stripe_payment_method_id", format!("eq.{}", payment_method_id)),
            ("user_id", format!("eq.{}", user_id))
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to delete payment method: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Database error deleting payment method: {}", error_text));
    }
    
    // After deletion, ensure remaining payment method (if any) is set as default
    let _ = ensure_single_payment_method_is_default(user_id, app).await;
    
    Ok("Payment method deleted successfully".to_string())
}

/// Mark payment method as used (update last_used_at)
#[command]
pub async fn mark_payment_method_used(
    payment_method_id: String,
    user_id: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let db_config = get_authenticated_db(&app).await?;
    let client = reqwest::Client::new();
    
    let url = format!("{}/rest/v1/payment_methods", db_config.database_url);
    
    let payload = serde_json::json!({
        "last_used_at": chrono::Utc::now().to_rfc3339(),
        "updated_at": chrono::Utc::now().to_rfc3339()
    });
    
    let response = client
        .patch(&url)
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .query(&[
            ("stripe_payment_method_id", format!("eq.{}", payment_method_id)),
            ("user_id", format!("eq.{}", user_id))
        ])
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to mark payment method as used: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Database error marking payment method as used: {}", error_text));
    }
    
    Ok("Payment method marked as used".to_string())
}

/// Helper function to unset all default payment methods for a user
async fn unset_all_default_payment_methods(
    user_id: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let db_config = get_authenticated_db(&app).await?;
    let client = reqwest::Client::new();
    
    let url = format!("{}/rest/v1/payment_methods", db_config.database_url);
    
    let payload = serde_json::json!({
        "is_default": false,
        "updated_at": chrono::Utc::now().to_rfc3339()
    });
    
    let response = client
        .patch(&url)
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .query(&[
            ("user_id", format!("eq.{}", user_id)),
            ("is_default", "eq.true".to_string()),
            ("is_active", "eq.true".to_string())
        ])
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to unset default payment methods: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Database error unsetting default payment methods: {}", error_text));
    }
    
    Ok(())
}

/// Get subscription plans with their associated prices from the database
#[command]
pub async fn get_subscription_plans_with_prices(
    app: tauri::AppHandle,
) -> Result<Vec<SubscriptionPlanWithPrices>, String> {
    let db_config = get_authenticated_db(&app).await?;
    let client = reqwest::Client::new();
    
    // Query subscription plans
    let plans_response = client
        .get(&format!("{}/rest/v1/subscription_plans?is_active=eq.true&order=sort_order", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to query subscription plans: {}", e))?;
    
    if !plans_response.status().is_success() {
        let error_text = plans_response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Database error fetching subscription plans: {}", error_text));
    }
    
    let plans: Vec<SubscriptionPlan> = plans_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse subscription plans response: {}", e))?;
    
    // Query subscription prices
    let prices_response = client
        .get(&format!("{}/rest/v1/subscription_prices?is_active=eq.true", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to query subscription prices: {}", e))?;
    
    if !prices_response.status().is_success() {
        let error_text = prices_response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Database error fetching subscription prices: {}", error_text));
    }
    
    let prices: Vec<SubscriptionPrice> = prices_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse subscription prices response: {}", e))?;
    
    // Combine plans with their prices
    let mut result = Vec::new();
    for plan in plans {
        let plan_prices: Vec<SubscriptionPrice> = prices
            .iter()
            .filter(|price| price.subscription_plan_id == plan.id)
            .cloned()
            .collect();
        
        result.push(SubscriptionPlanWithPrices {
            plan,
            prices: plan_prices,
        });
    }
    
    Ok(result)
}

/// Get packages with their associated prices from the database
#[command]
pub async fn get_packages_with_prices(
    app: tauri::AppHandle,
) -> Result<Vec<PackageWithPrices>, String> {
    let db_config = get_authenticated_db(&app).await?;
    let client = reqwest::Client::new();
    
    // Query packages
    let packages_response = client
        .get(&format!("{}/rest/v1/packages?is_active=eq.true&order=sort_order", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to query packages: {}", e))?;
    
    if !packages_response.status().is_success() {
        let error_text = packages_response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Database error fetching packages: {}", error_text));
    }
    
    let packages: Vec<Package> = packages_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse packages response: {}", e))?;
    
    // Query package prices
    let prices_response = client
        .get(&format!("{}/rest/v1/package_prices?is_active=eq.true&order=amount_cents.asc", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to query package prices: {}", e))?;
    
    if !prices_response.status().is_success() {
        let error_text = prices_response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Database error fetching package prices: {}", error_text));
    }
    
    let prices: Vec<PackagePrice> = prices_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse package prices response: {}", e))?;
    
    // Group prices by package
    let mut packages_with_prices = Vec::new();
    for package in packages {
        let package_prices: Vec<PackagePrice> = prices
            .iter()
            .filter(|p| p.package_id == package.id)
            .cloned()
            .collect();
        
        packages_with_prices.push(PackageWithPrices {
            package,
            prices: package_prices,
        });
    }
    
    Ok(packages_with_prices)
}

/// Get user's purchase history from database
#[command]
pub async fn get_user_purchases(
    user_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<Purchase>, String> {
    let db_config = get_authenticated_db(&app).await?;

    // Verify user is authenticated by checking if they have a valid session
    let session_check = crate::session::check_session(app.clone()).await?;
    if !session_check {
        return Err("Authentication required".to_string());
    }

    let client = reqwest::Client::new();
    
    let url = format!("{}/rest/v1/purchases", db_config.database_url);
    
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .query(&[
            ("user_id", format!("eq.{}", user_id)),
            ("status", "eq.completed".to_string()),
            ("order", "completed_at.desc".to_string()),
            ("select", "id,user_id,stripe_payment_intent_id,stripe_price_id,stripe_product_id,package_id,package_price_id,amount_paid,currency,tokens_purchased,status,completed_at,created_at,updated_at".to_string())
        ])
        .send()
        .await
        .map_err(|e| format!("Failed to fetch purchases: {}", e))?;
    
    let status = response.status();
    if !status.is_success() {
        let error_body = response.text().await.unwrap_or_else(|_| "Could not read error body".to_string());
        return Err(format!("Database query failed: {} - {}", status, error_body));
    }
    
    let purchases: Vec<Purchase> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse purchases response: {}", e))?;
    
    Ok(purchases)
}

/// Save contractor KYC form data for auto-save functionality
#[command]
pub async fn save_kyc_form_data(
    user_id: String,
    kyc_data: ContractorKycFormData,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let db_config = get_authenticated_db(&app).await?;

    // Verify user is authenticated
    let session_check = crate::session::check_session(app.clone()).await?;
    if !session_check {
        return Err("User not authenticated".to_string());
    }

    let client = reqwest::Client::new();
    
    // Convert form data to JSON
    let kyc_json = serde_json::to_value(&kyc_data)
        .map_err(|e| format!("Failed to serialize KYC data: {}", e))?;

    // Use UPSERT with ON CONFLICT clause for proper update/insert behavior
    let response = client
        .post(&format!("{}/rest/v1/contractor_kyc_form_data?on_conflict=user_id", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .header("Prefer", "resolution=merge-duplicates")
        .json(&serde_json::json!({
            "user_id": user_id,
            "kyc_data": kyc_json
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to save KYC form data: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Database error: {}", error_text));
    }

    Ok("KYC form data saved successfully".to_string())
}

/// Load contractor KYC form data
#[command]
pub async fn load_kyc_form_data(
    user_id: String,
    app: tauri::AppHandle,
) -> Result<Option<ContractorKycFormData>, String> {
    let db_config = get_authenticated_db(&app).await?;

    // Verify user is authenticated
    let session_check = crate::session::check_session(app.clone()).await?;
    if !session_check {
        return Err("User not authenticated".to_string());
    }

    let client = reqwest::Client::new();
    
    let response = client
        .get(&format!("{}/rest/v1/contractor_kyc_form_data", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .query(&[("user_id", format!("eq.{}", user_id))])
        .query(&[("select", "kyc_data")])
        .send()
        .await
        .map_err(|e| format!("Failed to load KYC form data: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Database error: {}", error_text));
    }

    let form_data_records: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse KYC form data response: {}", e))?;

    if let Some(record) = form_data_records.first() {
        if let Some(kyc_data) = record.get("kyc_data") {
            let form_data: ContractorKycFormData = serde_json::from_value(kyc_data.clone())
                .map_err(|e| format!("Failed to deserialize KYC data: {}", e))?;
            return Ok(Some(form_data));
        }
    }

    Ok(None)
}

/// Create contractor profile and Stripe Connect account
#[command]
pub async fn create_contractor_profile(
    user_id: String,
    kyc_data: ContractorKycFormData,
    app: tauri::AppHandle,
) -> Result<Contractor, String> {
    let db_config = get_authenticated_db(&app).await?;

    // Verify user is authenticated
    let session_check = crate::session::check_session(app.clone()).await?;
    if !session_check {
        return Err("User not authenticated".to_string());
    }

    // Get user profile to link contractor
    let profile = get_user_profile(user_id.clone(), app.clone()).await?
        .ok_or("User profile not found")?;

    // Create Stripe Connect account
    println!("🔄 Creating Stripe Connect account for user: {}", user_id);
    let connect_response = crate::stripe::create_connect_account(
        user_id.clone(),
        kyc_data.contractor_type.clone(),
        kyc_data.email.clone(),
        app.clone(),
    ).await.map_err(|e| {
        println!("❌ Stripe Connect account creation failed: {}", e);
        e
    })?;
    
    println!("✅ Stripe Connect account created: {}", connect_response.account_id);

    let client = reqwest::Client::new();
    
    // Create contractor record
    let contractor_data = serde_json::json!({
        "user_id": user_id,
        "profile_id": profile.id,
        "contractor_type": kyc_data.contractor_type,
        "kyc_status": "submitted",
        "is_active": true,
        "stripe_connect_account_id": connect_response.account_id,
        "stripe_connect_account_status": "pending",
        "stripe_connect_requirements_completed": connect_response.requirements_completed,
        "business_name": kyc_data.business_name,
        "business_tax_id": kyc_data.business_tax_id
    });
    
    println!("📋 Attempting to create contractor record:");
    println!("   - user_id: {}", user_id);
    println!("   - profile_id: {}", profile.id);
    println!("   - contractor_type: {}", kyc_data.contractor_type);
    println!("   - stripe_connect_account_id: {}", connect_response.account_id);
    println!("   - business_name: {:?}", kyc_data.business_name);
    println!("   - business_tax_id: {:?}", kyc_data.business_tax_id);

    let response = client
        .post(&format!("{}/rest/v1/contractors", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&contractor_data)
        .send()
        .await
        .map_err(|e| format!("Failed to create contractor: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        println!("❌ Database contractor creation failed: HTTP {} - {}", status, error_text);
        
        // Check if it's a constraint violation or schema issue
        if status.as_u16() == 409 {
            println!("🔍 Constraint violation - contractor may already exist for this user");
        } else if status.as_u16() == 422 {
            println!("🔍 Schema validation error - check required fields and data types");
        } else if status.as_u16() == 401 || status.as_u16() == 403 {
            println!("🔍 Authentication/authorization error - check RLS policies");
        }
        
        return Err(format!("Failed to create contractor record: HTTP {} {}", status, 
                          if error_text.is_empty() { status.canonical_reason().unwrap_or("Unknown error") } else { &error_text }));
    }

    let contractors: Vec<Contractor> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse contractor response: {}", e))?;

    let contractor = contractors.into_iter().next()
        .ok_or("Failed to create contractor")?;

    println!("✅ Contractor record created successfully with ID: {}", contractor.id);

    // Create contractor address record
    if let Some(address) = kyc_data.address {
        println!("🏠 Creating contractor address record for contractor ID: {}", contractor.id);
        let address_data = serde_json::json!({
            "contractor_id": contractor.id,
            "address_type": "residential",
            "street_address": address.line1,
            "street_address_2": address.line2,
            "city": address.city,
            "state_province": address.state,
            "postal_code": address.postal_code,
            "country": address.country,
            "is_verified": false
        });
        
        println!("📋 Address data: {:?}", address_data);

        let address_response = client
            .post(&format!("{}/rest/v1/contractor_addresses", db_config.database_url))
            .header("Authorization", format!("Bearer {}", db_config.access_token))
            .header("apikey", &db_config.anon_key)
            .header("Content-Type", "application/json")
            .json(&address_data)
            .send()
            .await
            .map_err(|e| format!("Failed to create contractor address: {}", e))?;
            
        if !address_response.status().is_success() {
            let status = address_response.status();
            let error_text = address_response.text().await.unwrap_or_default();
            println!("❌ Failed to create contractor address: HTTP {} - {}", status, error_text);
            // Don't fail the entire process for address creation failure
            println!("⚠️ Continuing without address record");
        } else {
            println!("✅ Contractor address created successfully");
        }
    }

    // Update profile to mark as contractor
    println!("👤 Updating profile to mark as contractor: profile_id={}, contractor_id={}", profile.id, contractor.id);
    let profile_update_response = client
        .patch(&format!("{}/rest/v1/profiles", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .query(&[("id", format!("eq.{}", profile.id))])
        .json(&serde_json::json!({
            "is_contractor": true,
            "contractor_id": contractor.id
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to update profile: {}", e))?;
        
    if !profile_update_response.status().is_success() {
        let status = profile_update_response.status();
        let error_text = profile_update_response.text().await.unwrap_or_default();
        println!("❌ Failed to update profile: HTTP {} - {}", status, error_text);
        // Don't fail the entire process for profile update failure
        println!("⚠️ Continuing without profile update");
    } else {
        println!("✅ Profile updated successfully");
    }

    Ok(contractor)
}

/// Get contractor profile for user
#[command]
pub async fn get_contractor_profile(
    user_id: String,
    app: tauri::AppHandle,
) -> Result<Option<Contractor>, String> {
    let db_config = get_authenticated_db(&app).await?;

    // Verify user is authenticated
    let session_check = crate::session::check_session(app.clone()).await?;
    if !session_check {
        return Err("User not authenticated".to_string());
    }

    let client = reqwest::Client::new();
    
    let response = client
        .get(&format!("{}/rest/v1/contractors", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .query(&[("user_id", format!("eq.{}", user_id))])
        .send()
        .await
        .map_err(|e| format!("Failed to get contractor profile: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Database error: {}", error_text));
    }

    let contractors: Vec<Contractor> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse contractor response: {}", e))?;

    Ok(contractors.into_iter().next())
}

// New structs for additional KYC entities

#[derive(Debug, Serialize, Deserialize)]
pub struct ContractorBankAccount {
    #[serde(rename = "accountHolderName", alias = "account_holder_name")]
    pub account_holder_name: String,
    #[serde(rename = "accountNumber", alias = "account_number")]
    pub account_number: String,
    #[serde(rename = "routingNumber", alias = "routing_number")]
    pub routing_number: String,
    #[serde(rename = "bankName", alias = "bank_name")]
    pub bank_name: String,
    #[serde(rename = "accountType", alias = "account_type")]
    pub account_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BeneficialOwner {
    pub id: String,
    pub contractor_id: String,
    pub first_name: String,
    pub last_name: String,
    pub date_of_birth: String,
    pub email: Option<String>,
    pub phone_number: Option<String>,
    pub street_address: String,
    pub street_address_2: Option<String>,
    pub city: String,
    pub state_province: Option<String>,
    pub postal_code: String,
    pub country: String,
    pub ownership_percentage: f64,
    pub title: Option<String>,
    pub national_id_number: Option<String>,
    pub national_id_type: Option<String>,
    pub is_verified: bool,
    pub verified_at: Option<String>,
    pub verification_notes: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Representative {
    pub id: String,
    pub contractor_id: String,
    pub first_name: String,
    pub last_name: String,
    pub date_of_birth: String,
    pub email: Option<String>,
    pub phone_number: Option<String>,
    pub street_address: String,
    pub street_address_2: Option<String>,
    pub city: String,
    pub state_province: Option<String>,
    pub postal_code: String,
    pub country: String,
    pub title: String,
    pub is_authorized_signatory: bool,
    pub national_id_number: Option<String>,
    pub national_id_type: Option<String>,
    pub is_verified: bool,
    pub verified_at: Option<String>,
    pub verification_notes: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentUpload {
    pub id: String,
    pub contractor_id: String,
    pub document_type: String,
    pub document_purpose: String,
    pub file_name: String,
    pub file_size: Option<i64>,
    pub mime_type: Option<String>,
    pub stripe_file_id: Option<String>,
    pub stripe_upload_status: String,
    pub stripe_upload_error: Option<String>,
    pub local_file_path: Option<String>,
    pub file_hash: Option<String>,
    pub verification_status: String,
    pub verification_notes: Option<String>,
    pub verified_at: Option<String>,
    pub required_for_capability: Option<Vec<String>>,
    pub requirement_id: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

// Database commands for new entities

/// Create beneficial owner
#[command]
pub async fn create_beneficial_owner(
    contractor_id: String,
    first_name: String,
    last_name: String,
    date_of_birth: String,
    email: Option<String>,
    phone_number: Option<String>,
    street_address: String,
    street_address_2: Option<String>,
    city: String,
    state_province: Option<String>,
    postal_code: String,
    country: String,
    ownership_percentage: f64,
    title: Option<String>,
    national_id_number: Option<String>,
    national_id_type: Option<String>,
    app: tauri::AppHandle,
) -> Result<BeneficialOwner, String> {
    let db_config = get_authenticated_db(&app).await?;
    let session_check = crate::session::check_session(app.clone()).await?;
    if !session_check {
        return Err("Authentication required".to_string());
    }

    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "contractor_id": contractor_id,
        "first_name": first_name,
        "last_name": last_name,
        "date_of_birth": date_of_birth,
        "email": email,
        "phone_number": phone_number,
        "street_address": street_address,
        "street_address_2": street_address_2,
        "city": city,
        "state_province": state_province,
        "postal_code": postal_code,
        "country": country,
        "ownership_percentage": ownership_percentage,
        "title": title,
        "national_id_number": national_id_number,
        "national_id_type": national_id_type,
        "is_verified": false
    });

    let response = client
        .post(&format!("{}/rest/v1/contractor_beneficial_owners", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to create beneficial owner: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Database error creating beneficial owner: {}", error_text));
    }

    let beneficial_owners: Vec<BeneficialOwner> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse beneficial owner response: {}", e))?;

    beneficial_owners
        .into_iter()
        .next()
        .ok_or_else(|| "No beneficial owner returned from database".to_string())
}

/// Get beneficial owners for contractor
#[command]
pub async fn get_beneficial_owners(
    contractor_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<BeneficialOwner>, String> {
    let db_config = get_authenticated_db(&app).await?;
    let session_check = crate::session::check_session(app.clone()).await?;
    if !session_check {
        return Err("Authentication required".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&format!("{}/rest/v1/contractor_beneficial_owners", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .query(&[("contractor_id", format!("eq.{}", contractor_id))])
        .send()
        .await
        .map_err(|e| format!("Failed to fetch beneficial owners: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Database error fetching beneficial owners: {}", error_text));
    }

    let beneficial_owners: Vec<BeneficialOwner> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse beneficial owners response: {}", e))?;

    Ok(beneficial_owners)
}

/// Create representative
#[command]
pub async fn create_representative(
    contractor_id: String,
    first_name: String,
    last_name: String,
    date_of_birth: String,
    email: Option<String>,
    phone_number: Option<String>,
    street_address: String,
    street_address_2: Option<String>,
    city: String,
    state_province: Option<String>,
    postal_code: String,
    country: String,
    title: String,
    is_authorized_signatory: bool,
    national_id_number: Option<String>,
    national_id_type: Option<String>,
    app: tauri::AppHandle,
) -> Result<Representative, String> {
    let db_config = get_authenticated_db(&app).await?;
    let session_check = crate::session::check_session(app.clone()).await?;
    if !session_check {
        return Err("Authentication required".to_string());
    }

    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "contractor_id": contractor_id,
        "first_name": first_name,
        "last_name": last_name,
        "date_of_birth": date_of_birth,
        "email": email,
        "phone_number": phone_number,
        "street_address": street_address,
        "street_address_2": street_address_2,
        "city": city,
        "state_province": state_province,
        "postal_code": postal_code,
        "country": country,
        "title": title,
        "is_authorized_signatory": is_authorized_signatory,
        "national_id_number": national_id_number,
        "national_id_type": national_id_type,
        "is_verified": false
    });

    let response = client
        .post(&format!("{}/rest/v1/contractor_representatives", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to create representative: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Database error creating representative: {}", error_text));
    }

    let representatives: Vec<Representative> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse representative response: {}", e))?;

    representatives
        .into_iter()
        .next()
        .ok_or_else(|| "No representative returned from database".to_string())
}

/// Get representatives for contractor
#[command]
pub async fn get_representatives(
    contractor_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<Representative>, String> {
    let db_config = get_authenticated_db(&app).await?;
    let session_check = crate::session::check_session(app.clone()).await?;
    if !session_check {
        return Err("Authentication required".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&format!("{}/rest/v1/contractor_representatives", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .query(&[("contractor_id", format!("eq.{}", contractor_id))])
        .send()
        .await
        .map_err(|e| format!("Failed to fetch representatives: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Database error fetching representatives: {}", error_text));
    }

    let representatives: Vec<Representative> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse representatives response: {}", e))?;

    Ok(representatives)
}

/// Create document upload record
#[command]
pub async fn create_document_upload(
    contractor_id: String,
    document_type: String,
    document_purpose: String,
    file_name: String,
    file_size: Option<i64>,
    mime_type: Option<String>,
    stripe_file_id: Option<String>,
    local_file_path: Option<String>,
    file_hash: Option<String>,
    required_for_capability: Option<Vec<String>>,
    requirement_id: Option<String>,
    app: tauri::AppHandle,
) -> Result<DocumentUpload, String> {
    let db_config = get_authenticated_db(&app).await?;
    let session_check = crate::session::check_session(app.clone()).await?;
    if !session_check {
        return Err("Authentication required".to_string());
    }

    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "contractor_id": contractor_id,
        "document_type": document_type,
        "document_purpose": document_purpose,
        "file_name": file_name,
        "file_size": file_size,
        "mime_type": mime_type,
        "stripe_file_id": stripe_file_id,
        "stripe_upload_status": "pending",
        "local_file_path": local_file_path,
        "file_hash": file_hash,
        "verification_status": "pending",
        "required_for_capability": required_for_capability,
        "requirement_id": requirement_id
    });

    let response = client
        .post(&format!("{}/rest/v1/contractor_document_uploads", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to create document upload: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Database error creating document upload: {}", error_text));
    }

    let document_uploads: Vec<DocumentUpload> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse document upload response: {}", e))?;

    document_uploads
        .into_iter()
        .next()
        .ok_or_else(|| "No document upload returned from database".to_string())
}

/// Get document uploads for contractor
#[command]
pub async fn get_document_uploads(
    contractor_id: String,
    app: tauri::AppHandle,
) -> Result<Vec<DocumentUpload>, String> {
    let db_config = get_authenticated_db(&app).await?;
    let session_check = crate::session::check_session(app.clone()).await?;
    if !session_check {
        return Err("Authentication required".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&format!("{}/rest/v1/contractor_document_uploads", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .query(&[("contractor_id", format!("eq.{}", contractor_id))])
        .send()
        .await
        .map_err(|e| format!("Failed to fetch document uploads: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Database error fetching document uploads: {}", error_text));
    }

    let document_uploads: Vec<DocumentUpload> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse document uploads response: {}", e))?;

    Ok(document_uploads)
}

/// Update document upload status
#[command]
pub async fn update_document_upload_status(
    document_id: String,
    stripe_file_id: Option<String>,
    stripe_upload_status: Option<String>,
    stripe_upload_error: Option<String>,
    verification_status: Option<String>,
    verification_notes: Option<String>,
    app: tauri::AppHandle,
) -> Result<DocumentUpload, String> {
    let db_config = get_authenticated_db(&app).await?;
    let session_check = crate::session::check_session(app.clone()).await?;
    if !session_check {
        return Err("Authentication required".to_string());
    }

    let client = reqwest::Client::new();
    let mut payload = serde_json::json!({});
    
    if let Some(file_id) = stripe_file_id {
        payload["stripe_file_id"] = serde_json::Value::String(file_id);
    }
    if let Some(upload_status) = stripe_upload_status {
        payload["stripe_upload_status"] = serde_json::Value::String(upload_status);
    }
    if let Some(upload_error) = stripe_upload_error {
        payload["stripe_upload_error"] = serde_json::Value::String(upload_error);
    }
    if let Some(verification_status) = verification_status {
        payload["verification_status"] = serde_json::Value::String(verification_status);
    }
    if let Some(verification_notes) = verification_notes {
        payload["verification_notes"] = serde_json::Value::String(verification_notes);
    }
    payload["updated_at"] = serde_json::Value::String(chrono::Utc::now().to_rfc3339());

    let response = client
        .patch(&format!("{}/rest/v1/contractor_document_uploads", db_config.database_url))
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .query(&[("id", format!("eq.{}", document_id))])
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to update document upload: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Database error updating document upload: {}", error_text));
    }

    let document_uploads: Vec<DocumentUpload> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse document upload response: {}", e))?;

    document_uploads
        .into_iter()
        .next()
        .ok_or_else(|| "No document upload returned from database".to_string())
}
