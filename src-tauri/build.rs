fn main() {
    // Load environment variables at build time for cross-platform compatibility
    dotenv::dotenv().ok();
    
    // Inject environment variables into the build for mobile platforms
    println!("cargo:rustc-env=STRIPE_SECRET_KEY={}", std::env::var("STRIPE_SECRET_KEY").unwrap_or_default());
    println!("cargo:rustc-env=STRIPE_PUBLISHABLE_KEY={}", std::env::var("STRIPE_PUBLISHABLE_KEY").unwrap_or_default());
    println!("cargo:rustc-env=STRIPE_PRODUCT_ID={}", std::env::var("STRIPE_PRODUCT_ID").unwrap_or_default());
    
    tauri_build::build()
}
