use std::path::PathBuf;
use std::fs;
use tauri::{Manager, AppHandle, WebviewWindow};

// 🆕 Télécharger la mise à jour (sans l'installer)
#[tauri::command]
async fn download_update(app: AppHandle) -> Result<String, String> {
    use std::io::Write;
    
    println!("[Updater] 🚀 Starting download process...");
    
    // 1. Récupérer les infos de la dernière version depuis GitHub
    let client = reqwest::Client::builder()
        .user_agent("Discord-Publisher-Updater")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let releases_url = "https://api.github.com/repos/Rory-Mercury-91/Discord-Publisher/releases/latest";
    println!("[Updater] 📡 Fetching release info from: {}", releases_url);
    
    let response = client
        .get(releases_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch release info: {}", e))?;
    
    let release_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse release JSON: {}", e))?;
    
    // 2. Trouver l'installateur NSIS complet (fichier .exe)
    let assets = release_json["assets"]
        .as_array()
        .ok_or("No assets found in release")?;
    
    // Chercher le fichier qui se termine par "-setup.exe" (l'installateur NSIS)
    let installer_asset = assets
        .iter()
        .find(|asset| {
            let name = asset["name"].as_str().unwrap_or("");
            name.ends_with("-setup.exe")
        })
        .ok_or("No NSIS installer found in release assets")?;
    
    let download_url = installer_asset["browser_download_url"]
        .as_str()
        .ok_or("No download URL found")?;
    
    let installer_name = installer_asset["name"]
        .as_str()
        .ok_or("No installer name found")?;
    
    println!("[Updater] 📦 Found installer: {}", installer_name);
    println!("[Updater] 🔗 Download URL: {}", download_url);
    
    // 3. Télécharger l'installateur dans TEMP avec un nom unique pour éviter les conflits
    let temp_dir = std::env::temp_dir();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let temp_installer_name = format!("discord_publisher_update_{}.exe", timestamp);
    let installer_path = temp_dir.join(&temp_installer_name);
    
    println!("[Updater] 📥 Downloading to: {:?}", installer_path);
    
    let mut response = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download installer: {}", e))?;
    
    let total_size = response.content_length().unwrap_or(0);
    println!("[Updater] 📊 Total size: {:.2} MB", total_size as f64 / 1024.0 / 1024.0);
    
    // Créer et écrire le fichier
    let mut file = fs::File::create(&installer_path)
        .map_err(|e| format!("Failed to create installer file: {}", e))?;
    
    let mut downloaded: u64 = 0;
    
    while let Some(chunk) = response.chunk().await.map_err(|e| format!("Download error: {}", e))? {
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;
        
        downloaded += chunk.len() as u64;
        
        if total_size > 0 && downloaded % (1024 * 1024) == 0 {
            let progress = (downloaded as f64 / total_size as f64) * 100.0;
            println!("[Updater] ⏳ Progress: {:.1}%", progress);
        }
    }
    
    // IMPORTANT : Flush et fermer explicitement le fichier
    file.flush().map_err(|e| format!("Failed to flush file: {}", e))?;
    drop(file); // Fermer le handle explicitement
    
    println!("[Updater] ✅ Download complete: {:?}", installer_path);
    
    // Attendre un peu pour que le système libère complètement le fichier
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    
    // Vérifier que le fichier existe et est accessible
    if !installer_path.exists() {
        return Err("Downloaded installer file not found".to_string());
    }
    
    let file_size = fs::metadata(&installer_path)
        .map_err(|e| format!("Cannot access installer file: {}", e))?
        .len();
    
    if file_size == 0 {
        return Err("Downloaded installer file is empty".to_string());
    }
    
    println!("[Updater] ✅ Installer file verified: {} bytes", file_size);
    
    // Sauvegarder le chemin de l'installateur téléchargé dans la config
    let config_dir = app.path().app_config_dir()
        .map_err(|e| format!("Failed to get config dir: {:?}", e))?;
    
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config dir: {:?}", e))?;
    
    let download_path_file = config_dir.join("pending_update.txt");
    fs::write(&download_path_file, installer_path.to_string_lossy().as_bytes())
        .map_err(|e| format!("Failed to save update path: {}", e))?;
    
    // Retourner le chemin de l'installateur téléchargé
    Ok(installer_path.to_string_lossy().to_string())
}

// 🆕 Installer la mise à jour téléchargée
#[tauri::command]
async fn install_downloaded_update(app: AppHandle) -> Result<(), String> {
    println!("[Updater] 🚀 Starting installation process...");
    
    // 1. Récupérer le chemin de l'installateur téléchargé
    let config_dir = app.path().app_config_dir()
        .map_err(|e| format!("Failed to get config dir: {:?}", e))?;
    
    let download_path_file = config_dir.join("pending_update.txt");
    
    if !download_path_file.exists() {
        return Err("No pending update found".to_string());
    }
    
    let installer_path_str = fs::read_to_string(&download_path_file)
        .map_err(|e| format!("Failed to read update path: {}", e))?;
    
    let installer_path = PathBuf::from(installer_path_str.trim());
    
    if !installer_path.exists() {
        return Err("Update installer file not found".to_string());
    }
    
    println!("[Updater] 📦 Installing from: {:?}", installer_path);
    
    // 2. Obtenir le répertoire d'installation actuel
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?;
    
    let install_dir = exe_path
        .parent()
        .ok_or("Failed to get install directory")?;
    
    println!("[Updater] 📂 Current install directory: {:?}", install_dir);
    
    // 3. Lancer l'installateur NSIS
    #[cfg(target_os = "windows")]
    {
        println!("[Updater] 🚀 Launching NSIS installer...");
        
        let install_dir_str = install_dir.to_string_lossy().to_string();
        
        // Créer la commande pour lancer l'installateur
        // /D= = Force le répertoire d'installation (doit être le DERNIER argument)
        let mut command = std::process::Command::new(&installer_path);
        command.arg(format!("/D={}", install_dir_str));
        
        println!("[Updater] 🔍 Running: {:?}", command);
        
        // Lancer l'installateur en arrière-plan
        command
            .spawn()
            .map_err(|e| format!("Failed to launch installer: {} (error code: {})", e, e.raw_os_error().unwrap_or(0)))?;
        
        println!("[Updater] ✅ Installer launched successfully");
        
        // Nettoyer le fichier de référence
        let _ = fs::remove_file(&download_path_file);
        
        println!("[Updater] 🔄 Closing application in 300ms...");
        
        // Attendre un peu pour que l'installateur démarre complètement
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
        
        // Fermer l'application - l'installateur NSIS prendra le relais
        println!("[Updater] 👋 Exiting application...");
        app.exit(0);
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        return Err("Auto-update is only supported on Windows".to_string());
    }
    
    Ok(())
}

// 🧹 Fonction interne pour nettoyer les anciens fichiers d'installation
async fn cleanup_old_updates_internal(app: &AppHandle) -> Result<u32, String> {
    println!("[Updater] 🧹 Starting cleanup of old update files...");
    
    let temp_dir = std::env::temp_dir();
    let mut cleaned_count = 0u32;
    
    // Nettoyer les fichiers d'installation temporaires
    match fs::read_dir(&temp_dir) {
        Ok(entries) => {
            for entry in entries {
                if let Ok(entry) = entry {
                    let file_name = entry.file_name();
                    let file_name_str = file_name.to_string_lossy();
                    
                    // Supprimer les fichiers qui correspondent au pattern discord_publisher_update_*.exe
                    if file_name_str.starts_with("discord_publisher_update_") && 
                       file_name_str.ends_with(".exe") {
                        match fs::remove_file(entry.path()) {
                            Ok(_) => {
                                println!("[Updater] 🗑️  Removed: {:?}", entry.path());
                                cleaned_count += 1;
                            }
                            Err(e) => {
                                println!("[Updater] ⚠️  Failed to remove {:?}: {}", entry.path(), e);
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            println!("[Updater] ⚠️  Failed to read temp directory: {}", e);
        }
    }
    
    // Nettoyer aussi le fichier pending_update.txt s'il existe encore
    let config_dir = app.path().app_config_dir()
        .map_err(|e| format!("Failed to get config dir: {:?}", e))?;
    
    let pending_file = config_dir.join("pending_update.txt");
    if pending_file.exists() {
        match fs::remove_file(&pending_file) {
            Ok(_) => {
                println!("[Updater] 🗑️  Removed pending_update.txt");
                cleaned_count += 1;
            }
            Err(e) => {
                println!("[Updater] ⚠️  Failed to remove pending_update.txt: {}", e);
            }
        }
    }
    
    println!("[Updater] ✅ Cleanup complete. Removed {} file(s)", cleaned_count);
    Ok(cleaned_count)
}

// 🧹 Nettoyer les anciens fichiers d'installation temporaires (commande Tauri)
#[tauri::command]
async fn cleanup_old_updates(app: AppHandle) -> Result<u32, String> {
    cleanup_old_updates_internal(&app).await
}

fn apply_window_state(window: &WebviewWindow) -> Result<(), String> {
    let app = window.app_handle();
    let config_dir = app.path().app_config_dir()
        .map_err(|e| format!("Failed to get config dir: {:?}", e))?;
    
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config dir: {:?}", e))?;
    
    let config_file = config_dir.join("window_state.txt");
    
    if config_file.exists() {
        let state = fs::read_to_string(&config_file)
            .unwrap_or_else(|_| "maximized".to_string())
            .trim()
            .to_lowercase();
        
        println!("🪟 État de fenêtre détecté: {}", state);
        
        match state.as_str() {
            "normal" => {
                window.unmaximize().ok();
                window.set_fullscreen(false).ok();
            },
            "maximized" => {
                window.maximize().ok();
            },
            "fullscreen" => {
                window.set_fullscreen(true).ok();
            },
            "minimized" => {
                window.minimize().ok();
            },
            _ => {
                window.maximize().ok();
            }
        }
    } else {
        window.maximize().ok();
    }
    
    Ok(())
}

#[tauri::command]
async fn save_window_state(app: AppHandle, state: String) -> Result<(), String> {
    let config_dir = app.path().app_config_dir()
        .map_err(|e| format!("Failed to get config dir: {:?}", e))?;
    
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config dir: {:?}", e))?;
    
    let config_file = config_dir.join("window_state.txt");
    
    fs::write(&config_file, state.trim())
        .map_err(|e| format!("Failed to write window state: {:?}", e))?;
    
    println!("✅ État de fenêtre sauvegardé: {}", state);
    Ok(())
}

#[tauri::command]
async fn test_api_connection() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let base_url = std::env::var("PUBLISHER_API_URL")
        .unwrap_or_else(|_| "http://138.2.182.125:8080".to_string());
    let url = format!("{}/health", base_url.trim_end_matches('/'));
    let response = client.get(&url).send().await
        .map_err(|e| format!("Erreur connexion API: {}", e))?;
    let json = response.json::<serde_json::Value>().await
        .map_err(|e| format!("Erreur parsing JSON: {}", e))?;
    Ok(json)
}

fn local_history_user_folder(author_discord_id: Option<&String>) -> String {
    author_discord_id
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect::<String>())
        .unwrap_or_else(|| "default".to_string())
}

#[tauri::command]
async fn save_local_history_post(app: AppHandle, post_json: String, author_discord_id: Option<String>) -> Result<(), String> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Dossier données app: {:?}", e))?;
    let user_folder = local_history_user_folder(author_discord_id.as_ref());
    let history_dir = data_dir.join("history").join(&user_folder);
    fs::create_dir_all(&history_dir)
        .map_err(|e| format!("Création dossier historique: {:?}", e))?;
    let posts_file = history_dir.join("posts.json");
    let archive_file = history_dir.join("posts_archive.json");

    let post: serde_json::Value = serde_json::from_str(&post_json)
        .map_err(|e| format!("JSON post invalide: {}", e))?;
    let thread_id = post.get("thread_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let mut posts: Vec<serde_json::Value> = if posts_file.exists() {
        let content = fs::read_to_string(&posts_file)
            .map_err(|e| format!("Lecture historique: {:?}", e))?;
        serde_json::from_str(&content).unwrap_or_else(|_| vec![])
    } else {
        vec![]
    };

    if !thread_id.is_empty() {
        posts.retain(|p| p.get("thread_id").and_then(|v| v.as_str()).unwrap_or("") != thread_id);
    }
    posts.insert(0, post);

    if posts.len() > 1000 {
        let to_archive = posts.split_off(1000);
        let mut archive: Vec<serde_json::Value> = if archive_file.exists() {
            let content = fs::read_to_string(&archive_file)
                .map_err(|e| format!("Lecture archive: {:?}", e))?;
            serde_json::from_str(&content).unwrap_or_else(|_| vec![])
        } else {
            vec![]
        };
        for p in to_archive.into_iter().rev() {
            archive.push(p);
        }
        let archive_json = serde_json::to_string_pretty(&archive)
            .map_err(|e| format!("Sérialisation archive: {}", e))?;
        fs::write(&archive_file, archive_json)
            .map_err(|e| format!("Écriture archive: {:?}", e))?;
    }

    let json = serde_json::to_string_pretty(&posts)
        .map_err(|e| format!("Sérialisation historique: {}", e))?;
    fs::write(&posts_file, json)
        .map_err(|e| format!("Écriture historique: {:?}", e))?;
    Ok(())
}

#[tauri::command]
async fn has_local_history_archive(app: AppHandle, author_discord_id: Option<String>) -> Result<bool, String> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Dossier données app: {:?}", e))?;
    let user_folder = local_history_user_folder(author_discord_id.as_ref());
    let archive_file = data_dir.join("history").join(&user_folder).join("posts_archive.json");
    Ok(archive_file.exists())
}

#[tauri::command]
async fn get_local_history_archive(app: AppHandle, author_discord_id: Option<String>) -> Result<String, String> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Dossier données app: {:?}", e))?;
    let user_folder = local_history_user_folder(author_discord_id.as_ref());
    let archive_file = data_dir.join("history").join(&user_folder).join("posts_archive.json");
    if !archive_file.exists() {
        return Ok("[]".to_string());
    }
    let content = fs::read_to_string(&archive_file)
        .map_err(|e| format!("Lecture archive: {:?}", e))?;
    Ok(content)
}

#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", &url])
            .spawn()
            .map_err(|e| format!("Erreur ouverture URL: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Erreur ouverture URL: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Erreur ouverture URL: {}", e))?;
    }
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let window = app.get_webview_window("main")
                .ok_or("Failed to get main window")?;
            
            if let Err(e) = apply_window_state(&window) {
                eprintln!("⚠️ Erreur application état fenêtre: {}", e);
            }
            
            // 🧹 Nettoyer les anciens fichiers d'installation au démarrage
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match cleanup_old_updates_internal(&app_handle).await {
                    Ok(count) => {
                        if count > 0 {
                            println!("[Updater] 🧹 Cleaned up {} old update file(s)", count);
                        }
                    }
                    Err(e) => {
                        println!("[Updater] ⚠️ Cleanup failed: {}", e);
                    }
                }
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            test_api_connection,
            save_window_state,
            save_local_history_post,
            has_local_history_archive,
            get_local_history_archive,
            open_url,
            download_update,
            install_downloaded_update,
            cleanup_old_updates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
