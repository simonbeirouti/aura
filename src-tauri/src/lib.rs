// Session management module
mod session;
// Database management module
mod database;
// Enhanced store management module
mod enhanced_store;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            // Session management commands
            session::store_tokens,
            session::check_session,
            session::get_tokens,
            session::logout,
            session::update_tokens,
            // Database management commands
            database::init_database,
            database::get_user_profile,
            database::update_user_profile,
            database::create_user_profile,
            database::check_username_availability,
            database::get_database_status,
            // Enhanced store management commands
            enhanced_store::store_get,
            enhanced_store::store_set,
            enhanced_store::store_get_metadata,
            enhanced_store::store_list,
            enhanced_store::store_clear,
            enhanced_store::store_backup,
            enhanced_store::store_restore,
            enhanced_store::store_sync,
            enhanced_store::store_validate,
            enhanced_store::store_health
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
