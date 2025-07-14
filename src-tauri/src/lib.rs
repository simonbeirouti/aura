mod auth;

use std::collections::HashMap;
use tokio::sync::RwLock;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    dotenvy::dotenv().ok();
    
    // Initialize the public keys cache
    let keys_cache = RwLock::new(HashMap::<String, String>::new());
    
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(keys_cache)
        .invoke_handler(tauri::generate_handler![
            greet,
            auth::verify_firebase_token,
            auth::protected_action,
            auth::get_user_profile
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
