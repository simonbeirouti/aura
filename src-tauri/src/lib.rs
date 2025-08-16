// Session management module
mod session;
// Database management module
mod database;
// Enhanced store management module
mod enhanced_store;
// Stripe payment processing module
mod stripe;

// Import required for environment variable loading
#[cfg(not(target_os = "ios"))]
use dotenv;

// Load environment variables with cross-platform handling
fn load_environment_variables() {
    #[cfg(debug_assertions)]
    println!("Loading environment variables for cross-platform compatibility");
    
    // On desktop platforms, try to load .env file at runtime
    #[cfg(not(target_os = "ios"))]
    {
        let env_paths = [
            ".env",           // Current directory
            "../.env",        // Parent directory (common for Tauri apps)
            "../../.env",     // Two levels up
            "src-tauri/.env", // From project root
        ];
        
        let mut loaded = false;
        
        // Try each path until one works
        for path in &env_paths {
            if let Ok(_) = dotenv::from_path(path) {
                #[cfg(debug_assertions)]
                println!("Loaded runtime environment variables from: {}", path);
                loaded = true;
                break;
            }
        }
        
        if !loaded {
            #[cfg(debug_assertions)]
            println!("No .env file found at runtime, using compile-time variables");
        }
    }
    
    // On iOS and other mobile platforms, rely on compile-time variables
    #[cfg(target_os = "ios")]
    {
        #[cfg(debug_assertions)]
        println!("iOS platform detected - using compile-time environment variables");
    }
    
    // Validate critical Stripe environment variables are present
    validate_stripe_environment();
}

// Validate that required Stripe environment variables are set
fn validate_stripe_environment() {
    let required_vars = [
        "STRIPE_SECRET_KEY",
        "STRIPE_PUBLISHABLE_KEY",
    ];
    
    let mut missing_vars = Vec::new();
    
    for var in &required_vars {
        // Check both runtime and compile-time environment variables
        let runtime_var = std::env::var(var).ok();
        let compile_time_var = match *var {
            "STRIPE_SECRET_KEY" => {
                let val = env!("STRIPE_SECRET_KEY");
                if val.is_empty() { None } else { Some(val.to_string()) }
            },
            "STRIPE_PUBLISHABLE_KEY" => {
                let val = env!("STRIPE_PUBLISHABLE_KEY");
                if val.is_empty() { None } else { Some(val.to_string()) }
            },
            _ => None,
        };
        
        if runtime_var.is_none() && compile_time_var.is_none() {
            missing_vars.push(*var);
        }
    }
    
    if !missing_vars.is_empty() {
        #[cfg(debug_assertions)]
        eprintln!("WARNING: Missing required environment variables: {:?}", missing_vars);
        
        // On mobile platforms, this is less critical as Stripe might be optional for some features
        #[cfg(target_os = "ios")]
        {
            eprintln!("Note: On iOS, some Stripe features may be limited without environment variables");
        }
        
        #[cfg(not(debug_assertions))]
        eprintln!("WARNING: Some Stripe configuration is missing. Check environment variables.");
    } else {
        #[cfg(debug_assertions)]
        println!("All required Stripe environment variables are present");
    }
}



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file with platform-specific handling
    load_environment_variables();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
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
            database::update_subscription_status,
            database::get_subscription_plans_with_prices,
            database::get_packages_with_prices,
            database::get_user_purchases,
            // Payment method database commands
            database::store_payment_method,
            database::get_user_payment_methods,
            database::update_payment_method,
            database::delete_payment_method_from_db,
            database::mark_payment_method_used,
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
            enhanced_store::store_health,
            // Stripe payment processing commands
            stripe::get_stripe_publishable_key,
            stripe::fix_payment_method_attachments,
            stripe::create_payment_intent,
            stripe::create_stripe_customer,
            stripe::initialize_stripe_customer,
            stripe::get_or_create_customer,
            stripe::create_subscription,
            stripe::cancel_subscription,
            stripe::get_subscription_status,
            stripe::sync_subscription_status,
            stripe::sync_all_user_subscriptions,
            stripe::setup_stripe_product,
            stripe::create_price_for_product,
            stripe::get_product_with_prices,
            // Payment method management commands
            stripe::create_setup_intent,
            stripe::get_customer_payment_methods,
            stripe::list_payment_methods,
            stripe::delete_payment_method,
            stripe::set_default_payment_method,
            // Integrated payment method commands (Stripe + Database)
            stripe::create_and_store_payment_method,
            stripe::store_payment_method_after_setup,
            stripe::get_stored_payment_methods,
            stripe::set_default_payment_method_integrated,
            stripe::delete_payment_method_integrated,
            stripe::create_payment_intent_with_stored_method,
            // Purchase completion commands
            stripe::record_purchase,
            stripe::complete_purchase,
            stripe::verify_payment_intent,
            stripe::create_missing_package,
            stripe::create_missing_package_price,
            stripe::debug_get_product_id_from_price,
            stripe::debug_database_schema,
            stripe::sync_stripe_prices_to_database
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
