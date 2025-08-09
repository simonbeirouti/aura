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
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub database_url: String,
    pub access_token: String,
    pub anon_key: String,
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
async fn get_authenticated_db(app: &tauri::AppHandle) -> Result<DatabaseConfig, String> {
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
