use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::sync::Mutex;
use tauri::{Manager, State, AppHandle};
use rand::Rng;
use hex;

// App state to hold authentication status
#[derive(Default)]
pub struct AppState {
    pub authenticated: Mutex<bool>,
}

#[derive(Serialize, Deserialize)]
pub struct AuthConfig {
    pub password_hash: String,
    pub salt: String,
}

#[tauri::command]
pub async fn is_app_initialized(app: AppHandle) -> Result<bool, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get config directory: {}", e))?;

    let auth_config_path = config_dir.join("auth_config.json");
    Ok(auth_config_path.exists())
}

#[tauri::command]
pub async fn initialize_app(
    password: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if password.len() < 8 {
        return Err("Password must be at least 8 characters long".to_string());
    }

    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get config directory: {}", e))?;

    // Create config directory if it doesn't exist
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    let auth_config_path = config_dir.join("auth_config.json");

    // Check if already initialized
    if auth_config_path.exists() {
        return Err("App is already initialized".to_string());
    }

    // Generate salt and hash password
    let salt = generate_salt();
    let password_hash = hash_password(&password, &salt);

    // Create auth config
    let auth_config = AuthConfig {
        password_hash: password_hash.clone(),
        salt: salt.clone(),
    };

    // Save auth config
    let config_json = serde_json::to_string(&auth_config)
        .map_err(|e| format!("Failed to serialize auth config: {}", e))?;

    fs::write(&auth_config_path, config_json)
        .map_err(|e| format!("Failed to write auth config: {}", e))?;

    // Set authenticated
    *state.authenticated.lock().unwrap() = true;

    Ok(())
}

#[tauri::command]
pub async fn unlock_app(
    password: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get config directory: {}", e))?;

    let auth_config_path = config_dir.join("auth_config.json");

    if !auth_config_path.exists() {
        return Err("App is not initialized".to_string());
    }

    // Read auth config
    let config_content = fs::read_to_string(&auth_config_path)
        .map_err(|e| format!("Failed to read auth config: {}", e))?;

    let auth_config: AuthConfig = serde_json::from_str(&config_content)
        .map_err(|e| format!("Failed to parse auth config: {}", e))?;

    // Verify password
    let password_hash = hash_password(&password, &auth_config.salt);
    if password_hash != auth_config.password_hash {
        return Err("Invalid password".to_string());
    }

    // Set authenticated
    *state.authenticated.lock().unwrap() = true;

    Ok(())
}

#[tauri::command]
pub async fn lock_app(state: State<'_, AppState>) -> Result<(), String> {
    *state.authenticated.lock().unwrap() = false;
    Ok(())
}

#[tauri::command]
pub async fn is_authenticated(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(*state.authenticated.lock().unwrap())
}

#[tauri::command]
pub async fn reset_app(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // Set unauthenticated first
    *state.authenticated.lock().unwrap() = false;
    
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get config directory: {}", e))?;

    let auth_config_path = config_dir.join("auth_config.json");
    
    // Remove auth config file if it exists
    if auth_config_path.exists() {
        fs::remove_file(&auth_config_path)
            .map_err(|e| format!("Failed to remove auth config: {}", e))?;
    }
    
    // Also try to remove Stronghold vault files
    let app_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    // Remove common Stronghold files
    let stronghold_files = vec![
        "vault.stronghold",
        "client.stronghold", 
        "stronghold.vault",
        "salt.txt"
    ];
    
    for file_name in stronghold_files {
        let file_path = app_data_dir.join(file_name);
        if file_path.exists() {
            let _ = fs::remove_file(&file_path); // Ignore errors for optional cleanup
        }
    }
    
    // Try to remove the entire app data directory if it's empty
    let _ = fs::remove_dir(&app_data_dir); // This will only succeed if directory is empty
    
    Ok(())
}

// Helper functions
fn generate_salt() -> String {
    let mut rng = rand::thread_rng();
    let salt: [u8; 16] = rng.gen();
    hex::encode(salt)
}

fn hash_password(password: &str, salt: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hasher.update(salt.as_bytes());
    hex::encode(hasher.finalize())
}
