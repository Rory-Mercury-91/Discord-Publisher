use std::path::PathBuf;
use std::fs;
use tauri::{Manager, AppHandle, WebviewWindow};
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};

#[derive(Serialize, Deserialize)]
struct PublishPayload {
    r#type: String,
    title: String,
    content: String,
    tags: String,
    images: Vec<String>,
}

// ✅ NOUVEAU : Fonction pour appliquer l'état de la fenêtre
fn apply_window_state(window: &WebviewWindow) -> Result<(), String> {
    // Lire l'état sauvegardé depuis localStorage (via une commande JS)
    // On utilise une approche alternative : lire depuis un fichier de config
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
                // Taille normale définie dans tauri.conf.json
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
                // Par défaut : maximisé
                window.maximize().ok();
            }
        }
    } else {
        // Par défaut : maximisé
        window.maximize().ok();
    }
    
    Ok(())
}

// ✅ NOUVEAU : Commande pour sauvegarder l'état de fenêtre
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

fn get_python_workdir(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        std::env::current_dir()
            .ok()
            .and_then(|d| d.parent().map(|p| p.to_path_buf()))
            .ok_or_else(|| "Failed to get current dir".to_string())
    } else {
        let resource_dir = app.path().resource_dir()
            .map_err(|e| format!("Failed to get resource_dir: {:?}", e))?;
        let canonical = dunce::canonicalize(&resource_dir)
            .unwrap_or_else(|_| resource_dir.clone());
        Ok(canonical.join("_up_"))
    }
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

#[tauri::command]
async fn save_image_from_base64(
    app: AppHandle,
    base64_data: String,
    file_name: String,
    _mime_type: String,
) -> Result<String, String> {
    let image_data = general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    
    let workdir = get_python_workdir(&app)?;
    let images_dir = workdir.join("images");
    
    fs::create_dir_all(&images_dir)
        .map_err(|e| format!("Failed to create images directory: {}", e))?;
    
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let sanitized_name = file_name.replace(|c: char| !c.is_alphanumeric() && c != '.' && c != '-', "_");
    let final_name = format!("image_{}_{}", timestamp, sanitized_name);
    let file_path = images_dir.join(&final_name);
    
    fs::write(&file_path, image_data)
        .map_err(|e| format!("Failed to write image file: {}", e))?;
    
    Ok(final_name)
}

#[tauri::command]
async fn publish_post(payload: PublishPayload) -> Result<serde_json::Value, String> {
    let api_key = std::env::var("PUBLISHER_API_KEY").unwrap_or_default();
    let client = reqwest::Client::new();
    let base_url = std::env::var("PUBLISHER_API_URL")
        .unwrap_or_else(|_| "http://138.2.182.125:8080".to_string());
    let url = format!("{}/api/forum-post", base_url.trim_end_matches('/'));
    
    let response = client.post(&url)
        .json(&payload)
        .header("X-API-KEY", api_key)
        .send().await
        .map_err(|e| format!("Erreur publication: {}", e))?;
    let json = response.json::<serde_json::Value>().await
        .map_err(|e| format!("Erreur parsing JSON: {}", e))?;
    Ok(json)
}

#[tauri::command]
async fn save_image(app: AppHandle, source_path: String) -> Result<String, String> {
    let workdir = get_python_workdir(&app)?;
    let images_dir = workdir.join("images");
    fs::create_dir_all(&images_dir)
        .map_err(|e| format!("Erreur création dossier images: {}", e))?;

    let source = PathBuf::from(&source_path);
    let filename = source.file_name()
        .ok_or("Nom de fichier invalide")?;
    let dest = images_dir.join(filename);

    fs::copy(&source, &dest)
        .map_err(|e| format!("Erreur copie image: {}", e))?;
    Ok(filename.to_string_lossy().to_string())
}

#[tauri::command]
async fn read_image(app: AppHandle, image_path: String) -> Result<String, String> {
    let workdir = get_python_workdir(&app)?;
    let clean_path = image_path.trim_start_matches("images/").trim_start_matches("images\\");
    let full_path = workdir.join("images").join(&clean_path);
    let bytes = fs::read(&full_path)
        .map_err(|e| format!("Erreur lecture image: {}", e))?;
    
    let ext = clean_path.split('.').last().unwrap_or("png").to_lowercase();
    let mime_type = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "tiff" | "tif" => "image/tiff",
        _ => "image/png",
    };
    
    Ok(format!("data:{};base64,{}", mime_type, general_purpose::STANDARD.encode(&bytes)))
}

#[tauri::command]
async fn delete_image(app: AppHandle, image_path: String) -> Result<(), String> {
    let workdir = get_python_workdir(&app)?;
    let clean_path = image_path.trim_start_matches("images/").trim_start_matches("images\\");
    let full_path = workdir.join("images").join(&clean_path);
    fs::remove_file(&full_path)
        .map_err(|e| format!("Erreur suppression image: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn get_image_size(app: AppHandle, image_path: String) -> Result<u64, String> {
    let workdir = get_python_workdir(&app)?;
    let clean_path = image_path.trim_start_matches("images/").trim_start_matches("images\\");
    let full_path = workdir.join("images").join(&clean_path);
    let metadata = fs::metadata(&full_path)
        .map_err(|e| format!("Erreur lecture métadonnées image: {}", e))?;
    Ok(metadata.len())
}

#[tauri::command]
async fn list_images(app: AppHandle) -> Result<Vec<String>, String> {
    let workdir = get_python_workdir(&app)?;
    let images_dir = workdir.join("images");
    if !images_dir.exists() {
        return Ok(vec![]);
    }
    let entries = fs::read_dir(&images_dir)
        .map_err(|e| format!("Erreur lecture dossier images: {}", e))?;
    let mut files = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            if let Ok(file_name) = entry.file_name().into_string() {
                files.push(file_name);
            }
        }
    }
    Ok(files)
}

#[tauri::command]
async fn export_config(config: String) -> Result<String, String> {
    Ok(config)
}

#[tauri::command]
async fn import_config(content: String) -> Result<String, String> {
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| format!("JSON invalide: {}", e))?;
    Ok(content)
}

fn local_history_user_folder(author_discord_id: Option<&String>) -> String {
    author_discord_id
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect::<String>())
        .unwrap_or_else(|| "default".to_string())
}

/// Historique local : sauvegarde un post (création ou mise à jour) dans un JSON par utilisateur.
/// Au-delà de 1000 entrées, les plus anciennes sont archivées dans posts_archive.json (pas de perte).
/// Dossier : app_data_dir / history / {author_discord_id ou "default"} / posts.json et posts_archive.json
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

/// Indique si l'utilisateur a un fichier d'archive d'historique local (à afficher la checkbox).
#[tauri::command]
async fn has_local_history_archive(app: AppHandle, author_discord_id: Option<String>) -> Result<bool, String> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Dossier données app: {:?}", e))?;
    let user_folder = local_history_user_folder(author_discord_id.as_ref());
    let archive_file = data_dir.join("history").join(&user_folder).join("posts_archive.json");
    Ok(archive_file.exists())
}

/// Charge le contenu de l'archive d'historique local (tableau JSON de posts, même format que posts.json).
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
            // ✅ Appliquer l'état de fenêtre au démarrage
            let window = app.get_webview_window("main")
                .ok_or("Failed to get main window")?;
            
            if let Err(e) = apply_window_state(&window) {
                eprintln!("⚠️ Erreur application état fenêtre: {}", e);
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            test_api_connection,
            publish_post,
            save_image,
            save_image_from_base64,
            read_image,
            delete_image,
            get_image_size,
            list_images,
            export_config,
            import_config,
            save_window_state,
            save_local_history_post,
            has_local_history_archive,
            get_local_history_archive,
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
