use std::process::{Command, Child, Stdio};
use std::path::PathBuf;
use std::sync::Mutex;
use std::fs;
use tauri::{Manager, State, AppHandle};
use tauri::menu::MenuBuilder;
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};
mod write_env;
use write_env::write_env_file;

// État global des processus Python
struct PythonProcesses {
    bots: Mutex<Option<Child>>,
    api: Mutex<Option<Child>>,
}

#[derive(Serialize, Deserialize)]
struct PublishPayload {
    r#type: String,
    title: String,
    content: String,
    tags: String,
    images: Vec<String>,
}

// Obtenir le chemin Python (externe au dossier python-portable/)
fn get_python_path(app: &AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        // Dev: Python portable local (chemin absolu)
        let workdir = std::env::current_dir()
            .expect("Failed to get current dir")
            .parent()
            .expect("Failed to get parent")
            .to_path_buf();
        workdir.join("python-portable").join("python.exe")
    } else {
        // Production: les ressources sont dans _up_ subdirectory
        let resource_dir = app.path().resource_dir()
            .expect("Failed to get resource dir");
        // Convertir le chemin UNC en chemin normal
        let canonical = dunce::canonicalize(&resource_dir)
            .unwrap_or_else(|_| resource_dir.clone());
        canonical.join("_up_").join("python-portable").join("python.exe")
    }
}

// Obtenir le dossier de travail Python
fn get_python_workdir(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        // Dev: racine du projet (D:\Bot_Discord)
        std::env::current_dir()
            .ok()
            .and_then(|d| d.parent().map(|p| p.to_path_buf()))
            .ok_or_else(|| "Failed to get current dir".to_string())
    } else {
        // Production: les ressources sont dans _up_ subdirectory
        let resource_dir = app.path().resource_dir()
            .map_err(|e| format!("Failed to get resource_dir: {:?}", e))?;
        // Convertir le chemin UNC en chemin normal
        let canonical = dunce::canonicalize(&resource_dir)
            .unwrap_or_else(|_| resource_dir.clone());
        Ok(canonical.join("_up_"))
    }
}

// Commande: Démarrer les bots Discord
#[tauri::command]
async fn start_python_bots(app: AppHandle, state: State<'_, PythonProcesses>) -> Result<(), String> {
    let python_exe = get_python_path(&app);
    let workdir = get_python_workdir(&app)?;
    let script = workdir.join("python").join("main_bots.py");

    // Logs de débogage
    let log_msg = format!(
        "=== DÉMARRAGE BOTS ===\nPython: {:?}\nScript: {:?}\nWorkDir: {:?}\n",
        python_exe, script, workdir
    );
    println!("{}", log_msg);
    
    // Écrire dans un fichier de log
    let log_file = workdir.join("tauri_debug.log");
    let _ = std::fs::write(&log_file, &log_msg);

    if !python_exe.exists() {
        return Err(format!("Python introuvable: {:?}", python_exe));
    }
    
    if !script.exists() {
        return Err(format!("Script bots non trouvé: {:?}", script));
    }

    let mut cmd = Command::new(python_exe);
    cmd.arg(&script)
        .current_dir(&workdir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    let child = cmd.spawn()
        .map_err(|e| format!("Erreur spawn bots: {}. Vérifiez que Python et les dépendances sont installés.", e))?;

    println!("✅ Bots démarrés (PID: {:?})", child.id());
    *state.bots.lock().unwrap() = Some(child);
    Ok(())
}

// Commande: Démarrer l'API Publisher
#[tauri::command]
async fn start_python_api(app: AppHandle, state: State<'_, PythonProcesses>) -> Result<(), String> {
    let python_exe = get_python_path(&app);
    let workdir = get_python_workdir(&app)?;
    let script = workdir.join("python").join("publisher_api.py");

    // Écrire les logs dans un fichier pour debug - avec fallback vers temp
    let log_file = workdir.join("tauri_debug.log");
    let log_content = format!(
        "=== API START ===\nresource_dir: {:?}\ncurrent_exe: {:?}\npython_exe: {:?} (exists: {})\nscript: {:?} (exists: {})\nworkdir: {:?} (exists: {})\n",
        app.path().resource_dir(),
        std::env::current_exe(),
        python_exe,
        python_exe.exists(),
        script,
        script.exists(),
        workdir,
        workdir.exists()
    );
    match std::fs::write(&log_file, &log_content) {
        Ok(_) => {},
        Err(e) => {
            // Fallback vers le dossier temporaire si _up_ n'est pas accessible
            let temp_log = std::env::temp_dir().join("tauri_debug.log");
            let _ = std::fs::write(&temp_log, format!("Error writing to {:?}: {:?}\n{}", log_file, e, log_content));
        }
    }

    if !script.exists() {
        return Err(format!("Script API non trouvé: {:?}", script));
    }

    println!("🚀 Démarrage de l'API Publisher...");
    println!("   Python: {:?}", python_exe);
    println!("   Script: {:?}", script);
    println!("   WorkDir: {:?}", workdir);

    let mut cmd = Command::new(python_exe);
    cmd.arg(script)
        .current_dir(&workdir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    
    // Masquer la fenêtre console sur Windows
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    let child = cmd.spawn()
        .map_err(|e| format!("Erreur spawn API: {}", e))?;

    *state.api.lock().unwrap() = Some(child);
    Ok(())
}

// Commande: Test de connexion à l'API
#[tauri::command]
async fn test_api_connection() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("http://localhost:8080/health")
        .send()
        .await
        .map_err(|e| format!("Erreur connexion API: {}", e))?;

    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Erreur parsing JSON: {}", e))?;

    Ok(json)
}

// Commande: Publier sur l'API
#[tauri::command]
async fn publish_post(payload: PublishPayload) -> Result<serde_json::Value, String> {
    // Lire la clé API depuis le .env
    let api_key = std::env::var("PUBLISHER_API_KEY").unwrap_or_default();
    let client = reqwest::Client::new();
    let response = client
        .post("http://localhost:8080/api/forum-post")
        .json(&payload)
        .header("X-API-KEY", api_key)
        .send()
        .await
        .map_err(|e| format!("Erreur publication: {}", e))?;

    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Erreur parsing JSON: {}", e))?;

    Ok(json)
}

// Commande: Sauvegarder une image
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

// Commande: Lire une image en base64
#[tauri::command]
async fn read_image(app: AppHandle, image_path: String) -> Result<String, String> {
    let workdir = get_python_workdir(&app)?;
    let full_path = workdir.join("images").join(&image_path);

    let bytes = fs::read(&full_path)
        .map_err(|e| format!("Erreur lecture image: {}", e))?;

    Ok(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(&bytes)))
}

// Commande: Supprimer une image
#[tauri::command]
async fn delete_image(app: AppHandle, image_path: String) -> Result<(), String> {
    let workdir = get_python_workdir(&app)?;
    let full_path = workdir.join("images").join(&image_path);

    fs::remove_file(&full_path)
        .map_err(|e| format!("Erreur suppression image: {}", e))?;

    Ok(())
}

// Commande: Obtenir la taille d'une image
#[tauri::command]
async fn get_image_size(app: AppHandle, image_path: String) -> Result<u64, String> {
    let workdir = get_python_workdir(&app)?;
    let full_path = workdir.join("images").join(&image_path);

    let metadata = fs::metadata(&full_path)
        .map_err(|e| format!("Erreur metadata image: {}", e))?;

    Ok(metadata.len())
}

// Commande: Lister toutes les images
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

// Commande: Exporter la configuration (retourne le contenu JSON)
#[tauri::command]
async fn export_config(config: String) -> Result<String, String> {
    // Retourne simplement le contenu - le frontend gère le téléchargement
    Ok(config)
}

// Commande: Importer la configuration (prend le contenu JSON)
#[tauri::command]
async fn import_config(content: String) -> Result<String, String> {
    // Valide que c'est du JSON valide
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| format!("JSON invalide: {}", e))?;
    Ok(content)
}

// Commande: Ajouter du contenu au fichier de log
#[tauri::command]
async fn append_to_log(app: AppHandle, file_name: String, content: String) -> Result<(), String> {
    let workdir = get_python_workdir(&app)?;
    let log_path = workdir.join(&file_name);
    
    use std::fs::OpenOptions;
    use std::io::Write;
    
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;
    
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write to log file: {}", e))?;
    
    Ok(())
}

// Commande: Ouvrir le fichier de log avec l'éditeur par défaut
#[tauri::command]
async fn open_log_file(app: AppHandle, file_name: String) -> Result<(), String> {
    let workdir = get_python_workdir(&app)?;
    let log_path = workdir.join(&file_name);
    
    if !log_path.exists() {
        return Err(format!("Le fichier de log n'existe pas encore: {:?}", log_path));
    }
    
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(&["/C", "start", "", log_path.to_str().unwrap()])
            .spawn()
            .map_err(|e| format!("Failed to open log file: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(log_path)
            .spawn()
            .map_err(|e| format!("Failed to open log file: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(log_path)
            .spawn()
            .map_err(|e| format!("Failed to open log file: {}", e))?;
    }
    
    Ok(())
}

// Commande: Lire le contenu d'un fichier log (utf-8, 100ko max)
#[tauri::command]
async fn read_log_file(app: AppHandle, file_name: String) -> Result<String, String> {
    let workdir = get_python_workdir(&app)?;
    let log_path = workdir.join(&file_name);
    if !log_path.exists() {
        return Err(format!("Le fichier de log n'existe pas: {:?}", log_path));
    }
    use std::fs::File;
    use std::io::{Read, BufReader};
    let file = File::open(&log_path).map_err(|e| format!("Erreur ouverture log: {}", e))?;
    let reader = BufReader::new(file);
    let mut content = String::new();
    // Limite à 100ko pour éviter les gros dumps
    reader
        .take(100 * 1024)
        .read_to_string(&mut content)
        .map_err(|e| format!("Erreur lecture log: {}", e))?;
    Ok(content)
}

// Commande: Redémarrer les bots Python
#[tauri::command]
async fn restart_python_bots(app: AppHandle, state: State<'_, PythonProcesses>) -> Result<(), String> {
    // Kill bots s'ils tournent
    if let Some(mut child) = state.bots.lock().unwrap().take() {
        let _ = child.kill();
    }
    // Relancer
    start_python_bots(app, state).await
}
// Ajoute cette commande
#[tauri::command]
async fn get_bots_status(state: State<'_, PythonProcesses>) -> Result<serde_json::Value, String> {
    let bots_running = state.bots.lock().unwrap().is_some();
    let api_running = state.api.lock().unwrap().is_some();
    
    Ok(serde_json::json!({
        "bots_running": bots_running,
        "api_running": api_running
    }))
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PythonProcesses {
            bots: Mutex::new(None),
            api: Mutex::new(None),
        })
        .setup(|app| {
            // Crée l'icône de tray avec le menu Afficher/Quitter
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
                            // Tuer proprement les processus Python avant de quitter
                            let state: State<PythonProcesses> = app.state();
                            if let Some(mut child) = state.bots.lock().unwrap().take() {
                                let _ = child.kill();
                            }
                            if let Some(mut child) = state.api.lock().unwrap().take() {
                                let _ = child.kill();
                            }
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                ;
            // Capturer un clone du handle pour l'événement de double-clic
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

            // Démarrer automatiquement Python au lancement
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state: State<PythonProcesses> = app_handle.state();
                if let Err(e) = start_python_bots(app_handle.clone(), state.clone()).await {
                    eprintln!("Erreur démarrage bots: {}", e);
                }
            });

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state: State<PythonProcesses> = app_handle.state();
                if let Err(e) = start_python_api(app_handle.clone(), state).await {
                    eprintln!("Erreur démarrage API: {}", e);
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                // Sur clic de fermeture, on masque la fenêtre et on empêche la fermeture
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    let _ = window.hide();
                    api.prevent_close();
                }
                // Si la fenêtre est réellement détruite (par Quitter), on tue les processus
                tauri::WindowEvent::Destroyed => {
                    let state: State<PythonProcesses> = window.state();
                    // Prendre les enfants sous un scope pour libérer rapidement les verrous
                    let bot_child = { state.bots.lock().unwrap().take() };
                    if let Some(mut child) = bot_child {
                        let _ = child.kill();
                    }
                    let api_child = { state.api.lock().unwrap().take() };
                    if let Some(mut child) = api_child {
                        let _ = child.kill();
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_python_bots,
            start_python_api,
            test_api_connection,
            publish_post,
            save_image,
            read_image,
            delete_image,
            get_image_size,
            list_images,
            export_config,
            import_config,
            append_to_log,
            open_log_file,
            write_env_file,
            restart_python_bots,
            read_log_file,
            get_bots_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
