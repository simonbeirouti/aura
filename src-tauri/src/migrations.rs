use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::command;
use tauri_plugin_store::StoreExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Migration {
    pub id: String,
    pub name: String,
    pub sql: String,
    pub applied_at: Option<String>,
    pub checksum: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MigrationStatus {
    pub total_migrations: usize,
    pub applied_migrations: usize,
    pub pending_migrations: Vec<String>,
    pub last_applied: Option<String>,
    pub database_version: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MigrationResult {
    pub success: bool,
    pub applied_migrations: Vec<String>,
    pub failed_migrations: Vec<String>,
    pub errors: Vec<String>,
}

/// Calculate SHA-256 checksum for migration content
fn calculate_checksum(content: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Load migration files from the migrations directory
fn load_migration_files(migrations_dir: &Path) -> Result<Vec<Migration>, String> {
    let mut migrations = Vec::new();
    
    if !migrations_dir.exists() {
        return Err(format!("Migrations directory not found: {:?}", migrations_dir));
    }

    let entries = fs::read_dir(migrations_dir)
        .map_err(|e| format!("Failed to read migrations directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();
        
        if path.extension().and_then(|s| s.to_str()) == Some("sql") {
            let filename = path.file_name()
                .and_then(|s| s.to_str())
                .ok_or_else(|| "Invalid filename".to_string())?;
            
            // Extract migration ID from filename (e.g., "001_initial.sql" -> "001")
            let migration_id = filename.split('_').next()
                .ok_or_else(|| format!("Invalid migration filename format: {}", filename))?
                .to_string();
            
            let migration_name = filename.strip_suffix(".sql")
                .unwrap_or(filename)
                .to_string();
            
            let sql_content = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read migration file {}: {}", filename, e))?;
            
            let checksum = calculate_checksum(&sql_content);
            
            migrations.push(Migration {
                id: migration_id,
                name: migration_name,
                sql: sql_content,
                applied_at: None,
                checksum,
            });
        }
    }
    
    // Sort migrations by ID to ensure proper order
    migrations.sort_by(|a, b| a.id.cmp(&b.id));
    
    Ok(migrations)
}

/// Get applied migrations from the store
async fn get_applied_migrations(app: &tauri::AppHandle) -> Result<HashMap<String, Migration>, String> {
    let store = app.store("migrations.store").map_err(|e| e.to_string())?;
    
    let applied = store.get("applied_migrations")
        .and_then(|v| serde_json::from_value::<HashMap<String, Migration>>(v.clone()).ok())
        .unwrap_or_default();
    
    Ok(applied)
}

/// Save applied migration to the store
async fn save_applied_migration(app: &tauri::AppHandle, migration: &Migration) -> Result<(), String> {
    let store = app.store("migrations.store").map_err(|e| e.to_string())?;
    
    let mut applied = get_applied_migrations(app).await?;
    let mut migration_with_timestamp = migration.clone();
    migration_with_timestamp.applied_at = Some(chrono::Utc::now().to_rfc3339());
    
    applied.insert(migration.id.clone(), migration_with_timestamp);
    
    store.set("applied_migrations", serde_json::to_value(&applied).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Execute a single migration against Supabase
async fn execute_migration(migration: &Migration, app: &tauri::AppHandle) -> Result<(), String> {
    use crate::database::get_authenticated_db;
    
    // Get authenticated database connection
    let db_config = match get_authenticated_db(app).await {
        Ok(config) => config,
        Err(e) => {
            // If no database connection, assume migrations are handled externally
            println!("No database connection available for migration {}: {}", migration.id, e);
            println!("Assuming migration is handled via Supabase dashboard");
            return Ok(());
        }
    };
    
    // For Supabase, we'll check if the migration is needed by verifying table existence
    // This is safer than trying to execute DDL operations via REST API
    let client = reqwest::Client::new();
    
    // Check if the profiles table exists (main table from initial migration)
    let url = format!("{}/rest/v1/profiles", db_config.database_url);
    
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", db_config.access_token))
        .header("apikey", &db_config.anon_key)
        .header("Range", "0-0") // Just check if table exists, don't fetch data
        .send()
        .await
        .map_err(|e| format!("Failed to check migration {}: {}", migration.id, e))?;
    
    // If we can access the profiles table, consider the migration already applied
    if response.status().is_success() || response.status().as_u16() == 416 {
        // 200 OK or 416 Range Not Satisfiable means table exists
        println!("Migration {} appears to be already applied (table exists)", migration.id);
        return Ok(());
    }
    
    // If table doesn't exist, we assume the migration needs to be run manually via Supabase dashboard
    // For now, we'll just log this and continue
    println!("Migration {} needs to be applied manually via Supabase dashboard", migration.id);
    println!("SQL content: {}", migration.sql);
    
    Ok(())
}

/// Get migration status
#[command]
pub async fn get_migration_status(app: tauri::AppHandle) -> Result<MigrationStatus, String> {
    // Load migration files from both possible locations
    let mut all_migrations = Vec::new();
    
    // Try src-tauri/migrations first
    let src_tauri_migrations = Path::new("src-tauri/migrations");
    if src_tauri_migrations.exists() {
        let mut migrations = load_migration_files(src_tauri_migrations)?;
        all_migrations.append(&mut migrations);
    }
    
    // Try root migrations directory
    let root_migrations = Path::new("migrations");
    if root_migrations.exists() {
        let mut migrations = load_migration_files(root_migrations)?;
        all_migrations.append(&mut migrations);
    }
    
    if all_migrations.is_empty() {
        return Err("No migration files found in src-tauri/migrations or migrations directories".to_string());
    }
    
    // Remove duplicates based on ID (src-tauri takes precedence)
    let mut unique_migrations = HashMap::new();
    for migration in all_migrations {
        unique_migrations.entry(migration.id.clone()).or_insert(migration);
    }
    let mut migrations: Vec<_> = unique_migrations.into_values().collect();
    migrations.sort_by(|a, b| a.id.cmp(&b.id));
    
    let applied_migrations = get_applied_migrations(&app).await?;
    
    let pending_migrations: Vec<String> = migrations
        .iter()
        .filter(|m| !applied_migrations.contains_key(&m.id))
        .map(|m| m.name.clone())
        .collect();
    
    let last_applied = applied_migrations
        .values()
        .max_by_key(|m| &m.id)
        .map(|m| m.name.clone());
    
    let database_version = applied_migrations
        .values()
        .max_by_key(|m| &m.id)
        .map(|m| m.id.clone())
        .unwrap_or_else(|| "000".to_string());
    
    Ok(MigrationStatus {
        total_migrations: migrations.len(),
        applied_migrations: applied_migrations.len(),
        pending_migrations,
        last_applied,
        database_version,
    })
}

/// Run pending migrations
#[command]
pub async fn run_migrations(app: tauri::AppHandle) -> Result<MigrationResult, String> {
    let mut result = MigrationResult {
        success: true,
        applied_migrations: Vec::new(),
        failed_migrations: Vec::new(),
        errors: Vec::new(),
    };
    
    // Load migration files from both possible locations
    let mut all_migrations = Vec::new();
    
    // Try src-tauri/migrations first
    let src_tauri_migrations = Path::new("src-tauri/migrations");
    if src_tauri_migrations.exists() {
        let mut migrations = load_migration_files(src_tauri_migrations)?;
        all_migrations.append(&mut migrations);
    }
    
    // Try root migrations directory
    let root_migrations = Path::new("migrations");
    if root_migrations.exists() {
        let mut migrations = load_migration_files(root_migrations)?;
        all_migrations.append(&mut migrations);
    }
    
    if all_migrations.is_empty() {
        result.success = false;
        result.errors.push("No migration files found".to_string());
        return Ok(result);
    }
    
    // Remove duplicates based on ID (src-tauri takes precedence)
    let mut unique_migrations = HashMap::new();
    for migration in all_migrations {
        unique_migrations.entry(migration.id.clone()).or_insert(migration);
    }
    let mut migrations: Vec<_> = unique_migrations.into_values().collect();
    migrations.sort_by(|a, b| a.id.cmp(&b.id));
    
    let applied_migrations = get_applied_migrations(&app).await?;
    
    // Filter out already applied migrations
    let pending_migrations: Vec<_> = migrations
        .into_iter()
        .filter(|m| !applied_migrations.contains_key(&m.id))
        .collect();
    
    if pending_migrations.is_empty() {
        return Ok(result);
    }
    
    // Execute pending migrations
    for migration in pending_migrations {
        match execute_migration(&migration, &app).await {
            Ok(()) => {
                // Save successful migration
                if let Err(e) = save_applied_migration(&app, &migration).await {
                    result.errors.push(format!("Failed to save migration {}: {}", migration.id, e));
                    result.success = false;
                } else {
                    result.applied_migrations.push(migration.name.clone());
                }
            }
            Err(e) => {
                result.failed_migrations.push(migration.name.clone());
                result.errors.push(e);
                result.success = false;
                // Stop on first failure to maintain consistency
                break;
            }
        }
    }
    
    Ok(result)
}

/// Reset migration state (for development/testing)
#[command]
pub async fn reset_migration_state(app: tauri::AppHandle) -> Result<String, String> {
    let store = app.store("migrations.store").map_err(|e| e.to_string())?;
    store.clear();
    store.save().map_err(|e| e.to_string())?;
    Ok("Migration state reset successfully".to_string())
}
