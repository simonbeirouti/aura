fn main() {
    // Load environment variables at build time for cross-platform compatibility
    dotenv::dotenv().ok();
    
    // Inject environment variables into the build for mobile platforms
    // Use safe defaults to prevent build failures
    let stripe_secret = std::env::var("STRIPE_SECRET_KEY").unwrap_or_else(|_| {
        println!("cargo:warning=STRIPE_SECRET_KEY not found, using empty default");
        String::new()
    });
    let stripe_publishable = std::env::var("STRIPE_PUBLISHABLE_KEY").unwrap_or_else(|_| {
        println!("cargo:warning=STRIPE_PUBLISHABLE_KEY not found, using empty default");
        String::new()
    });
    println!("cargo:rustc-env=STRIPE_SECRET_KEY={}", stripe_secret);
    println!("cargo:rustc-env=STRIPE_PUBLISHABLE_KEY={}", stripe_publishable);
    
    // Print build info
    if !stripe_secret.is_empty() && !stripe_publishable.is_empty() {
        println!("cargo:warning=Stripe environment variables configured successfully");
    } else {
        println!("cargo:warning=Some Stripe environment variables are missing - payment features may be limited");
    }
    
    tauri_build::build()
}
