// Command and Stdio are no longer needed since we removed the local process management.

use std::path::PathBuf;
use std::fs;
use tauri::{Manager, AppHandle, GlobalShortcutManager};
use tauri::menu::MenuBuilder;
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};

//
// Ce fichier a été nettoyé pour supprimer toute la logique de démarrage des processus
// Python et de gestion de logs locaux. Les bots Discord et le serveur API sont
// désormais hébergés à distance sur Koyeb. Le Tauri backend se contente
// d'exposer des commandes pour accéder à l'API distante et manipuler des
// fichiers images locaux utilisés par l'application.

#[derive(Serialize, Deserialize)]
struct PublishPayload {
    r#type: String,
    title: String,
    content: String,
    tags: String,
    images: Vec<String>,
}

// La fonction `get_python_path` a été supprimée car l'application ne
// lance plus de scripts Python en local. Tout se déroule sur Koyeb.
// cette architecture. Les bots et l'API étant hébergés sur Koyeb, il n'est
// plus nécessaire de déterminer le chemin d'un Python embarqué.

// Obtenir le dossier de travail Python. Utilisé pour localiser les dossiers d'images.
fn get_python_workdir(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        // Dev : racine du projet (D:\Bot_Discord)
        std::env::current_dir()
            .ok()
            .and_then(|d| d.parent().map(|p| p.to_path_buf()))
            .ok_or_else(|| "Failed to get current dir".to_string())
    } else {
        // Production : les ressources sont dans _up_ subdirectory
        let resource_dir = app.path().resource_dir()
            .map_err(|e| format!("Failed to get resource_dir: {:?}", e))?;
        // Convertir le chemin UNC en chemin normal
        let canonical = dunce::canonicalize(&resource_dir)
            .unwrap_or_else(|_| resource_dir.clone());
        Ok(canonical.join("_up_"))
    }
}

#[tauri::command]
async fn test_api_connection() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    // Récupère l’URL de base de l’API, par défaut l’URL Koyeb
    let base_url = std::env::var("PUBLISHER_API_URL")
        .unwrap_or_else(|_| "https://dependent-klarika-rorymercury91-e1486cf2.koyeb.app".to_string());
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
    // Décoder le base64
    let image_data = general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    
    // Utiliser le même workdir que les autres commandes
    let workdir = get_python_workdir(&app)?;
    let images_dir = workdir.join("images");
    
    // Créer le dossier images/ s'il n'existe pas
    fs::create_dir_all(&images_dir)
        .map_err(|e| format!("Failed to create images directory: {}", e))?;
    
    // Générer un nom de fichier unique avec timestamp (comme dans la version legacy)
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let sanitized_name = file_name.replace(|c: char| !c.is_alphanumeric() && c != '.' && c != '-', "_");
    let final_name = format!("image_{}_{}", timestamp, sanitized_name);
    let file_path = images_dir.join(&final_name);
    
    // Écrire le fichier
    fs::write(&file_path, image_data)
        .map_err(|e| format!("Failed to write image file: {}", e))?;
    
    // Retourner le nom du fichier (comme save_image)
    Ok(final_name)
}

#[tauri::command]
async fn publish_post(payload: PublishPayload) -> Result<serde_json::Value, String> {
    let api_key = std::env::var("PUBLISHER_API_KEY").unwrap_or_default();
    let client = reqwest::Client::new();
    let base_url = std::env::var("PUBLISHER_API_URL")
        .unwrap_or_else(|_| "https://dependent-klarika-rorymercury91-e1486cf2.koyeb.app".to_string());
    let url = format!("{}/api/forum-post", base_url.trim_end_matches('/'));
    
    // NOTE: Pour diagnostiquer l'IP utilisée pour les requêtes Discord, 
    // ajoutez des logs dans publisher_api.py (Python) qui affichent:
    // - L'IP source de la requête HTTP reçue (request.remote)
    // - L'IP utilisée pour les requêtes vers Discord (via un service comme ipify.org ou httpbin.org/ip)
    // Exemple dans Python: print(f"IP source requête: {request.remote}, IP sortante Discord: {outgoing_ip}")
    
    let response = client.post(&url)
        .json(&payload)
        .header("X-API-KEY", api_key)
        .send().await
        .map_err(|e| format!("Erreur publication: {}", e))?;
    let json = response.json::<serde_json::Value>().await
        .map_err(|e| format!("Erreur parsing JSON: {}", e))?;
    Ok(json)
}


// Commande : Sauvegarder une image. Copie l'image vers le répertoire
// <workdir>/images et renvoie le nom de fichier.
#[tauri::command]
async fn save_image(app: AppHandle, source_path: String) -> Result<String, String> {
    let workdir = get_python_workdir(&app)?;
    let images_dir = workdir.join("images");
    // Créer le dossier images/ si nécessaire
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

// Commande : Lire une image en base64. Construit une URL data:uri à partir des
// données du fichier PNG.
#[tauri::command]
async fn read_image(app: AppHandle, image_path: String) -> Result<String, String> {
    let workdir = get_python_workdir(&app)?;
    // Nettoyer le chemin pour éviter les doublons images/images/
    let clean_path = image_path.trim_start_matches("images/").trim_start_matches("images\\");
    let full_path = workdir.join("images").join(&clean_path);
    let bytes = fs::read(&full_path)
        .map_err(|e| format!("Erreur lecture image: {}", e))?;
    
    // Détecter le type MIME depuis l'extension
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

// Commande : Supprimer une image
#[tauri::command]
async fn delete_image(app: AppHandle, image_path: String) -> Result<(), String> {
    let workdir = get_python_workdir(&app)?;
    // Nettoyer le chemin pour éviter les doublons images/images/
    let clean_path = image_path.trim_start_matches("images/").trim_start_matches("images\\");
    let full_path = workdir.join("images").join(&clean_path);
    fs::remove_file(&full_path)
        .map_err(|e| format!("Erreur suppression image: {}", e))?;
    Ok(())
}

// Commande : Obtenir la taille d'une image (en octets)
#[tauri::command]
async fn get_image_size(app: AppHandle, image_path: String) -> Result<u64, String> {
    let workdir = get_python_workdir(&app)?;
    // Nettoyer le chemin pour éviter les doublons images/images/
    let clean_path = image_path.trim_start_matches("images/").trim_start_matches("images\\");
    let full_path = workdir.join("images").join(&clean_path);
    let metadata = fs::metadata(&full_path)
        .map_err(|e| format!("Erreur lecture métadonnées image: {}", e))?;
    Ok(metadata.len())
}

// Commande : Lister toutes les images dans le dossier <workdir>/images
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

// Commande : Exporter la configuration (retourne le JSON tel quel)
#[tauri::command]
async fn export_config(config: String) -> Result<String, String> {
    Ok(config)
}

// Commande : Importer la configuration (valide le JSON)
#[tauri::command]
async fn import_config(content: String) -> Result<String, String> {
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| format!("JSON invalide: {}", e))?;
    Ok(content)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Crée l'icône de tray avec les entrées Afficher et Quitter. Toute
            // logique de gestion des processus Python a été retirée.
            let handle = app.handle();
            let tray_menu = MenuBuilder::new(handle)
                .text("show", "Afficher")
                .separator()
                .text("quit", "Quitter")
                .build()?;

            let icon = app.default_window_icon().cloned();
            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .tooltip("Publication Generator")
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                });
            // Gérer le double-clic pour afficher la fenêtre
            let handle2 = handle.clone();
            tray_builder = tray_builder.on_tray_icon_event(move |_, ev| {
                if let TrayIconEvent::DoubleClick { .. } = ev {
                    if let Some(win) = handle2.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            });
            if let Some(ic) = icon {
                tray_builder = tray_builder.icon(ic);
            }
            let _ = tray_builder.build(handle);
            
            // Activer les DevTools en production avec F12
            let window_handle = app.get_webview_window("main").cloned();
            
            // Raccourci F12 pour ouvrir/fermer les DevTools
            if let Ok(_) = app.global_shortcut_manager().register("F12", move |_app, _shortcut, _event| {
                if let Some(win) = window_handle.as_ref() {
                    if win.is_devtools_open() {
                        let _ = win.close_devtools();
                    } else {
                        let _ = win.open_devtools();
                    }
                }
            }) {
                println!("✅ Raccourci F12 activé pour les DevTools");
            } else {
                println!("⚠️ Impossible d'enregistrer le raccourci F12");
            }
            
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                // Sur clic de fermeture, on masque la fenêtre et on empêche la fermeture
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    let _ = window.hide();
                    api.prevent_close();
                }
                _ => {}
            }
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
