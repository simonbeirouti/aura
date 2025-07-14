// Import our custom modules
mod auth;
mod stronghold;

// Re-export for use in main
pub use auth::AppState;
use stronghold::*;
use tauri::{Manager, State};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Use our fast password hash function instead of slow argon2
            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::new(fast_password_hash).build())?;

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            auth::is_app_initialized,
            auth::initialize_app,
            auth::unlock_app,
            auth::lock_app,
            auth::is_authenticated,
            auth::reset_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
