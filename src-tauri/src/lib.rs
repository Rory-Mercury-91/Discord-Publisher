use std::fs;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Emitter, Manager, AppHandle, WebviewWindow};
use tokio::sync::Mutex;

// ─── Types pour le serveur local Tampermonkey ────────────────────────────────

/// Données envoyées par le script Tampermonkey depuis le navigateur
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
struct TampermonkeyPayload {
    domain: String,
    id: Option<serde_json::Value>,
    name: String,
    version: Option<String>,
    status: Option<String>,
    #[serde(rename = "type")]
    game_type: Option<String>,
    tags: Option<String>,
    link: Option<String>,
    image: Option<String>,
    synopsis: Option<String>,
}

/// Événement émis vers la fenêtre Tauri pour traitement par le frontend
#[derive(Debug, Clone, serde::Serialize)]
struct QuickAddEvent {
    request_id: String,
    payload: TampermonkeyPayload,
}

/// Résultat renvoyé par le frontend après écriture dans Supabase
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct QuickAddResult {
    ok: bool,
    action: Option<String>,
    error: Option<String>,
}

/// Génère un u32 pseudo-aléatoire à partir de l'adresse d'une variable locale (pas de dépendance externe).
fn rand_u32() -> u32 {
    let x: u32 = 0;
    let addr = &x as *const u32 as usize;
    (addr ^ (addr >> 16)) as u32
}

/// État partagé entre le serveur axum et les commandes Tauri
type PendingRequests = Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<QuickAddResult>>>>;

/// État du serveur local passé à chaque handler axum
#[derive(Clone)]
struct LocalServerState {
    app: AppHandle,
    pending: PendingRequests,
}

// ─── Handler axum ────────────────────────────────────────────────────────────

async fn handle_quick_add(
    axum::extract::State(state): axum::extract::State<LocalServerState>,
    axum::Json(payload): axum::Json<TampermonkeyPayload>,
) -> axum::Json<QuickAddResult> {
    // Identifiant unique pour corréler requête ↔ réponse du frontend
    let request_id = format!(
        "{}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        rand_u32()
    );

    let (tx, rx) = tokio::sync::oneshot::channel::<QuickAddResult>();
    {
        let mut pending = state.pending.lock().await;
        pending.insert(request_id.clone(), tx);
    }

    // Émettre l'événement vers le WebView (React)
    let event = QuickAddEvent { request_id: request_id.clone(), payload };
    if let Err(e) = state.app.emit("tampermonkey:quick-add", &event) {
        let mut pending = state.pending.lock().await;
        pending.remove(&request_id);
        eprintln!("[LocalServer] Erreur emit tampermonkey:quick-add : {}", e);
        return axum::Json(QuickAddResult {
            ok: false,
            action: None,
            error: Some("L'application n'est pas prête. Réessayez dans quelques secondes.".to_string()),
        });
    }

    // Attendre la réponse du frontend (max 15 s)
    match tokio::time::timeout(std::time::Duration::from_secs(15), rx).await {
        Ok(Ok(result)) => axum::Json(result),
        Ok(Err(_)) => axum::Json(QuickAddResult {
            ok: false,
            action: None,
            error: Some("Réponse annulée par l'application.".to_string()),
        }),
        Err(_) => {
            let mut pending = state.pending.lock().await;
            pending.remove(&request_id);
            axum::Json(QuickAddResult {
                ok: false,
                action: None,
                error: Some("Délai dépassé — l'application n'a pas répondu dans les 15 s.".to_string()),
            })
        }
    }
}

// ─── Démarrage du serveur local ──────────────────────────────────────────────

async fn start_local_server(app: AppHandle, pending: PendingRequests) {
    use axum::{Router, routing::post};
    use tower_http::cors::CorsLayer;

    let state = LocalServerState { app, pending };

    let router = Router::new()
        .route("/quick-add", post(handle_quick_add))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = "127.0.0.1:7832";
    match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => {
            println!("[LocalServer] 🚀 Serveur Tampermonkey démarré sur http://{}", addr);
            if let Err(e) = axum::serve(listener, router).await {
                eprintln!("[LocalServer] Arrêt inattendu : {}", e);
            }
        }
        Err(e) => {
            eprintln!("[LocalServer] ❌ Impossible de démarrer sur {} : {}", addr, e);
        }
    }
}

// ─── Commande Tauri appelée par le frontend après traitement Supabase ─────────

#[tauri::command(rename_all = "camelCase")]
async fn report_quick_add_result(
    state: tauri::State<'_, PendingRequests>,
    request_id: String,
    ok: bool,
    action: Option<String>,
    error: Option<String>,
) -> Result<(), String> {
    let mut pending = state.lock().await;
    if let Some(tx) = pending.remove(&request_id) {
        let _ = tx.send(QuickAddResult { ok, action, error });
    }
    Ok(())
}

// ✨ NOUVELLE APPROCHE : Télécharger ET installer en une seule commande
// Cela simplifie le workflow et réduit les erreurs
#[tauri::command(rename_all = "camelCase")]
async fn download_and_install_update(
    app: AppHandle,
    use_elevation: bool,
) -> Result<(), String> {
    use std::io::Write;

    println!("[Updater] 🚀 Téléchargement et installation de la mise à jour...");
    println!("[Updater] 🔐 Mode : {}", if use_elevation { "Avec UAC" } else { "Sans UAC" });

    // 1. Récupérer les infos de la release
    let client = reqwest::Client::builder()
        .user_agent("Discord-Publisher-Updater")
        .build()
        .map_err(|e| format!("Client HTTP : {}", e))?;

    let releases_url =
        "https://api.github.com/repos/Rory-Mercury-91/Discord-Publisher/releases/latest";
    println!("[Updater] 📡 Récupération depuis : {}", releases_url);

    let response = client
        .get(releases_url)
        .send()
        .await
        .map_err(|e| format!("Erreur réseau : {}", e))?;

    let release_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("JSON invalide : {}", e))?;

    // 2. Trouver l'installateur NSIS
    let assets = release_json["assets"]
        .as_array()
        .ok_or("Pas d'assets dans la release")?;

    let installer_asset = assets
        .iter()
        .find(|asset| {
            let name = asset["name"].as_str().unwrap_or("");
            name.ends_with("-setup.exe")
        })
        .ok_or("Installateur NSIS introuvable")?;

    let download_url = installer_asset["browser_download_url"]
        .as_str()
        .ok_or("URL de téléchargement manquante")?;

    let installer_name = installer_asset["name"]
        .as_str()
        .ok_or("Nom de l'installateur manquant")?;

    println!("[Updater] 📦 Fichier : {}", installer_name);

    // 3. Télécharger dans TEMP
    let temp_dir = std::env::temp_dir();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let temp_installer_name = format!("discord_publisher_update_{}.exe", timestamp);
    let installer_path = temp_dir.join(&temp_installer_name);

    println!("[Updater] 📥 Téléchargement...");

    let mut response = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("Téléchargement échoué : {}", e))?;

    let total_size = response.content_length().unwrap_or(0);
    let mut file = fs::File::create(&installer_path)
        .map_err(|e| format!("Création fichier : {}", e))?;

    let mut downloaded: u64 = 0;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Erreur chunk : {}", e))?
    {
        file.write_all(&chunk)
            .map_err(|e| format!("Écriture : {}", e))?;
        downloaded += chunk.len() as u64;

        if total_size > 0 && downloaded % (1024 * 1024) == 0 {
            let progress = (downloaded as f64 / total_size as f64) * 100.0;
            println!("[Updater] ⏳ {:.1}%", progress);
        }
    }

    file.flush()
        .map_err(|e| format!("Flush : {}", e))?;
    drop(file);

    println!("[Updater] ✅ Téléchargement terminé");

    // Attendre que le fichier soit libéré
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    // Vérifier le fichier
    if !installer_path.exists() {
        return Err("Fichier téléchargé introuvable".to_string());
    }

    let file_size = fs::metadata(&installer_path)
        .map_err(|e| format!("Métadonnées : {}", e))?
        .len();

    if file_size == 0 {
        return Err("Fichier vide".to_string());
    }

    println!("[Updater] ✅ Fichier vérifié : {} octets", file_size);

    // 4. Obtenir le répertoire d'installation
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Chemin exe : {}", e))?;
    let install_dir = exe_path
        .parent()
        .ok_or("Répertoire d'installation introuvable")?;

    println!("[Updater] 📂 Installation dans : {:?}", install_dir);

    // 5. Lancer l'installateur
    #[cfg(target_os = "windows")]
    {
        let installer_str = installer_path.to_string_lossy().to_string();
        let install_dir_str = install_dir.to_string_lossy().to_string();

        let spawn_result = if use_elevation {
            println!("[Updater] 🔐 Avec élévation UAC...");

            // Avec UAC : utiliser PowerShell Start-Process -Verb RunAs
            let ps_command = format!(
                "Start-Process -FilePath '{}' -Verb RunAs -ArgumentList '/D={}'",
                installer_str.replace('\'', "''"),
                install_dir_str.replace('\'', "''"),
            );

            std::process::Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    &ps_command,
                ])
                .spawn()
        } else {
            println!("[Updater] 🔓 Sans élévation...");

            // Sans UAC : lancer directement l'installateur
            // L'installateur NSIS est configuré en "currentUser" donc ne demande pas UAC
            std::process::Command::new(&installer_str)
                .arg(format!("/D={}", install_dir_str))
                .spawn()
        };

        match spawn_result {
            Ok(_) => {
                println!("[Updater] ✅ Installateur lancé");

                // Attendre un peu
                tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

                // Fermer l'application
                println!("[Updater] 👋 Fermeture...");
                app.exit(0);
            }
            Err(e) => {
                let code = e.raw_os_error().unwrap_or(0);

                if code == 1223 {
                    return Err("UAC refusé par l'utilisateur. Réessayez sans UAC ou contactez votre administrateur.".to_string());
                }

                if code == 740 {
                    return Err("Droits administrateur requis. Activez 'Élévation admin' et réessayez.".to_string());
                }

                return Err(format!("Impossible de lancer l'installateur : {} (code {})", e, code));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        return Err("Uniquement Windows supporté".to_string());
    }

    Ok(())
}

// 🧹 Nettoyer les anciens fichiers de mise à jour
async fn cleanup_old_updates_internal(_app: &AppHandle) -> Result<u32, String> {
    println!("[Updater] 🧹 Nettoyage...");

    let temp_dir = std::env::temp_dir();
    let mut cleaned = 0;

    if let Ok(entries) = fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let file_name_str = file_name.to_string_lossy();

            if file_name_str.starts_with("discord_publisher_update_")
                && file_name_str.ends_with(".exe")
            {
                if fs::remove_file(entry.path()).is_ok() {
                    println!("[Updater] 🗑️  Supprimé : {:?}", entry.path());
                    cleaned += 1;
                }
            }
        }
    }

    println!("[Updater] ✅ {} fichier(s) supprimé(s)", cleaned);
    Ok(cleaned)
}

#[tauri::command]
async fn cleanup_old_updates(app: AppHandle) -> Result<u32, String> {
    cleanup_old_updates_internal(&app).await
}

// 📊 État de la fenêtre
fn apply_window_state(window: &WebviewWindow) -> Result<(), String> {
    let app = window.app_handle();
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Config dir : {:?}", e))?;

    fs::create_dir_all(&config_dir).ok();

    let config_file = config_dir.join("window_state.txt");

    if config_file.exists() {
        let state = fs::read_to_string(&config_file)
            .unwrap_or_else(|_| "maximized".to_string())
            .trim()
            .to_lowercase();

        match state.as_str() {
            "normal" => {
                window.unmaximize().ok();
                window.set_fullscreen(false).ok();
            }
            "maximized" => {
                window.maximize().ok();
            }
            "fullscreen" => {
                window.set_fullscreen(true).ok();
            }
            "minimized" => {
                window.minimize().ok();
            }
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
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Config dir : {:?}", e))?;

    fs::create_dir_all(&config_dir).ok();

    let config_file = config_dir.join("window_state.txt");
    fs::write(&config_file, state.trim()).ok();

    Ok(())
}

#[tauri::command]
async fn test_api_connection() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let base_url = std::env::var("PUBLISHER_API_URL")
        .unwrap_or_else(|_| "http://138.2.182.125:8080".to_string());
    let url = format!("{}/health", base_url.trim_end_matches('/'));
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("API : {}", e))?;
    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("JSON : {}", e))?;
    Ok(json)
}

fn local_history_user_folder(author_discord_id: Option<&String>) -> String {
    author_discord_id
        .filter(|s| !s.trim().is_empty())
        .map(|s| {
            s.chars()
                .map(|c| {
                    if c.is_alphanumeric() || c == '-' || c == '_' {
                        c
                    } else {
                        '_'
                    }
                })
                .collect::<String>()
        })
        .unwrap_or_else(|| "default".to_string())
}

#[tauri::command]
async fn save_local_history_post(
    app: AppHandle,
    post_json: String,
    author_discord_id: Option<String>,
) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| format!("{:?}", e))?;
    let user_folder = local_history_user_folder(author_discord_id.as_ref());
    let history_dir = data_dir.join("history").join(&user_folder);
    fs::create_dir_all(&history_dir).ok();

    let posts_file = history_dir.join("posts.json");
    let archive_file = history_dir.join("posts_archive.json");

    let post: serde_json::Value =
        serde_json::from_str(&post_json).map_err(|e| format!("{}", e))?;
    let thread_id = post.get("thread_id").and_then(|v| v.as_str()).unwrap_or("");

    let mut posts: Vec<serde_json::Value> = if posts_file.exists() {
        let content = fs::read_to_string(&posts_file).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_else(|_| vec![])
    } else {
        vec![]
    };

    if !thread_id.is_empty() {
        posts.retain(|p| {
            p.get("thread_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                != thread_id
        });
    }
    posts.insert(0, post);

    if posts.len() > 1000 {
        let to_archive = posts.split_off(1000);
        let mut archive: Vec<serde_json::Value> = if archive_file.exists() {
            let content = fs::read_to_string(&archive_file).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_else(|_| vec![])
        } else {
            vec![]
        };
        for p in to_archive.into_iter().rev() {
            archive.push(p);
        }
        let archive_json = serde_json::to_string_pretty(&archive).unwrap_or_default();
        fs::write(&archive_file, archive_json).ok();
    }

    let json = serde_json::to_string_pretty(&posts).unwrap_or_default();
    fs::write(&posts_file, json).ok();
    Ok(())
}

#[tauri::command]
async fn has_local_history_archive(
    app: AppHandle,
    author_discord_id: Option<String>,
) -> Result<bool, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| format!("{:?}", e))?;
    let user_folder = local_history_user_folder(author_discord_id.as_ref());
    let archive_file = data_dir
        .join("history")
        .join(&user_folder)
        .join("posts_archive.json");
    Ok(archive_file.exists())
}

#[tauri::command]
async fn get_local_history_archive(
    app: AppHandle,
    author_discord_id: Option<String>,
) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| format!("{:?}", e))?;
    let user_folder = local_history_user_folder(author_discord_id.as_ref());
    let archive_file = data_dir
        .join("history")
        .join(&user_folder)
        .join("posts_archive.json");
    if !archive_file.exists() {
        return Ok("[]".to_string());
    }
    let content = fs::read_to_string(&archive_file).unwrap_or_else(|_| "[]".to_string());
    Ok(content)
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    // Méthode silencieuse sur Windows (pas de fenêtre CMD)
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .spawn();
    }

    // Sur les autres OS (Linux/Mac) on garde le comportement normal
    #[cfg(not(target_os = "windows"))]
    {
        let _ = tauri::shell::open(&url, None);
    }

    Ok(())
}

/// Lance un exécutable (ou ouvre un fichier avec l’application par défaut).
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // Ouvrir avec l’application par défaut (exécute .exe, ouvre .txt avec l’éditeur, etc.)
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Impossible de lancer : {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = tauri::shell::open(&path, None)
            .map_err(|e| format!("Impossible de lancer : {}", e))?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                // Masquer les WARN de la boucle d'événements tao sur Windows (ordre d'événements inoffensif)
                .filter(|metadata| !metadata.target().starts_with("tao::"))
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .ok_or("Fenêtre principale introuvable")?;

            if let Err(e) = apply_window_state(&window) {
                eprintln!("⚠️  État fenêtre : {}", e);
            }

            // Nettoyage au démarrage
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(count) = cleanup_old_updates_internal(&app_handle).await {
                    if count > 0 {
                        println!("[Updater] 🧹 {} ancien(s) fichier(s) nettoyé(s)", count);
                    }
                }
            });

            // Serveur local pour le script Tampermonkey (localhost:7832)
            let pending_requests: PendingRequests = Arc::new(Mutex::new(HashMap::new()));
            let pending_for_server = pending_requests.clone();
            app.manage(pending_requests);

            let app_handle_server = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                start_local_server(app_handle_server, pending_for_server).await;
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
            open_path,
            download_and_install_update,
            cleanup_old_updates,
            report_quick_add_result,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur Tauri");
}
