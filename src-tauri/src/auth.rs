use serde::{Deserialize, Serialize};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use reqwest;
use std::collections::HashMap;
use std::env;
use tauri::State;
use tokio::sync::RwLock;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: Option<String>,
    pub email_verified: Option<bool>,
    pub name: Option<String>,
    pub picture: Option<String>,
    pub iss: String,
    pub aud: String,
    pub exp: usize,
    pub iat: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GooglePublicKey {
    pub kty: String,
    pub alg: String,
    pub r#use: String,
    pub kid: String,
    pub n: String,
    pub e: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GooglePublicKeys {
    pub keys: Vec<GooglePublicKey>,
}

pub type PublicKeysCache = RwLock<HashMap<String, String>>;

#[tauri::command]
pub async fn verify_firebase_token(
    token: String,
    keys_cache: State<'_, PublicKeysCache>,
) -> Result<Claims, String> {
    // Decode the header to get the key ID
    let header = decode_header(&token).map_err(|e| format!("Invalid token header: {}", e))?;
    
    let kid = header.kid.ok_or("Token missing key ID")?;
    
    // Get the public key for verification
    let public_key = get_public_key(&kid, &keys_cache).await?;
    
    // Set up validation parameters
    let mut validation = Validation::new(Algorithm::RS256);
    
    // Get Firebase project ID from environment variable
    let project_id = env::var("FIREBASE_PROJECT_ID")
        .map_err(|_| "FIREBASE_PROJECT_ID environment variable not set".to_string())?;
    
    validation.set_audience(&[&project_id]);
    validation.set_issuer(&[&format!("https://securetoken.google.com/{}", project_id)]);
    
    // Decode and verify the token
    let token_data = decode::<Claims>(
        &token,
        &DecodingKey::from_rsa_pem(public_key.as_bytes()).map_err(|e| format!("Invalid public key: {}", e))?,
        &validation,
    ).map_err(|e| format!("Token verification failed: {}", e))?;
    
    Ok(token_data.claims)
}

async fn get_public_key(kid: &str, keys_cache: &State<'_, PublicKeysCache>) -> Result<String, String> {
    // Check cache first
    {
        let cache = keys_cache.read().await;
        if let Some(key) = cache.get(kid) {
            return Ok(key.clone());
        }
    }
    
    // Fetch from Google if not in cache
    let response = reqwest::get("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com")
        .await
        .map_err(|e| format!("Failed to fetch public keys: {}", e))?;
    
    let keys: HashMap<String, String> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse public keys: {}", e))?;
    
    // Update cache
    {
        let mut cache = keys_cache.write().await;
        for (k, v) in &keys {
            cache.insert(k.clone(), v.clone());
        }
    }
    
    keys.get(kid)
        .cloned()
        .ok_or_else(|| format!("Public key not found for kid: {}", kid))
}

#[tauri::command]
pub async fn protected_action(
    token: String,
    keys_cache: State<'_, PublicKeysCache>,
) -> Result<String, String> {
    // Verify the token first
    let claims = verify_firebase_token(token, keys_cache).await?;
    
    // If we get here, the token is valid
    // Perform your protected action here
    Ok(format!("Protected action executed for user: {}", claims.sub))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserProfile {
    pub uid: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub picture: Option<String>,
}

#[tauri::command]
pub async fn get_user_profile(
    token: String,
    keys_cache: State<'_, PublicKeysCache>,
) -> Result<UserProfile, String> {
    // Verify the token first
    let claims = verify_firebase_token(token, keys_cache).await?;
    
    // Return user profile from claims
    Ok(UserProfile {
        uid: claims.sub,
        email: claims.email,
        name: claims.name,
        picture: claims.picture,
    })
}
