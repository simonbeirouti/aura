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
    let stripe_product = std::env::var("STRIPE_PRODUCT_ID").unwrap_or_else(|_| {
        println!("cargo:warning=STRIPE_PRODUCT_ID not found, using empty default");
        String::new()
    });
    
    // Also try VITE_ prefixed versions for frontend compatibility
    let vite_stripe_product = std::env::var("VITE_STRIPE_PRODUCT_ID").unwrap_or_else(|_| stripe_product.clone());
    
    println!("cargo:rustc-env=STRIPE_SECRET_KEY={}", stripe_secret);
    println!("cargo:rustc-env=STRIPE_PUBLISHABLE_KEY={}", stripe_publishable);
    println!("cargo:rustc-env=STRIPE_PRODUCT_ID={}", if !vite_stripe_product.is_empty() { vite_stripe_product } else { stripe_product });
    
    // Print build info
    if !stripe_secret.is_empty() && !stripe_publishable.is_empty() {
        println!("cargo:warning=Stripe environment variables configured successfully");
    } else {
        println!("cargo:warning=Some Stripe environment variables are missing - payment features may be limited");
    }
    
    tauri_build::build()
}
