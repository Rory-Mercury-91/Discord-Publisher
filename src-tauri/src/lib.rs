use std::process::{Command, Child, Stdio};
use std::path::PathBuf;
use std::sync::Mutex;
use std::fs;
use tauri::{Manager, State, AppHandle};
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};

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
        // Production: Python portable à côté de l'exe
        app.path().resource_dir()
            .expect("Failed to get resource dir")
            .parent()
            .expect("Failed to get parent dir")
            .join("python-portable")
            .join("python.exe")
    }
}

// Obtenir le dossier de travail Python
fn get_python_workdir(app: &AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        // Dev: racine du projet (D:\Bot_Discord)
        // En dev, on est dans src-tauri/, donc on remonte d'un niveau
        std::env::current_dir()
            .expect("Failed to get current dir")
            .parent()
            .expect("Failed to get parent")
            .to_path_buf()
    } else {
        // Production: à côté de l'exe
        app.path().resource_dir()
            .expect("Failed to get resource dir")
            .parent()
            .expect("Failed to get parent dir")
            .to_path_buf()
    }
}

// Commande: Démarrer les bots Discord
#[tauri::command]
async fn start_python_bots(app: AppHandle, state: State<'_, PythonProcesses>) -> Result<(), String> {
    let python_exe = get_python_path(&app);
    let workdir = get_python_workdir(&app);
    let script = workdir.join("python").join("main_bots.py");

    if !script.exists() {
        return Err(format!("Script bots non trouvé: {:?}", script));
    }

    println!("🤖 Démarrage des bots Discord...");
    println!("   Python: {:?}", python_exe);
    println!("   Script: {:?}", script);
    println!("   WorkDir: {:?}", workdir);

    let child = Command::new(python_exe)
        .arg(script)
        .current_dir(&workdir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Erreur spawn bots: {}", e))?;

    *state.bots.lock().unwrap() = Some(child);
    Ok(())
}

// Commande: Démarrer l'API Publisher
#[tauri::command]
async fn start_python_api(app: AppHandle, state: State<'_, PythonProcesses>) -> Result<(), String> {
    let python_exe = get_python_path(&app);
    let workdir = get_python_workdir(&app);
    let script = workdir.join("python").join("publisher_api.py");

    if !script.exists() {
        return Err(format!("Script API non trouvé: {:?}", script));
    }

    println!("🚀 Démarrage de l'API Publisher...");
    println!("   Python: {:?}", python_exe);
    println!("   Script: {:?}", script);
    println!("   WorkDir: {:?}", workdir);

    let child = Command::new(python_exe)
        .arg(script)
        .current_dir(&workdir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
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
    let client = reqwest::Client::new();
    let response = client
        .post("http://localhost:8080/publish")
        .json(&payload)
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
    let workdir = get_python_workdir(&app);
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
    let workdir = get_python_workdir(&app);
    let full_path = workdir.join("images").join(&image_path);

    let bytes = fs::read(&full_path)
        .map_err(|e| format!("Erreur lecture image: {}", e))?;

    Ok(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(&bytes)))
}

// Commande: Supprimer une image
#[tauri::command]
async fn delete_image(app: AppHandle, image_path: String) -> Result<(), String> {
    let workdir = get_python_workdir(&app);
    let full_path = workdir.join("images").join(&image_path);

    fs::remove_file(&full_path)
        .map_err(|e| format!("Erreur suppression image: {}", e))?;

    Ok(())
}

// Commande: Obtenir la taille d'une image
#[tauri::command]
async fn get_image_size(app: AppHandle, image_path: String) -> Result<u64, String> {
    let workdir = get_python_workdir(&app);
    let full_path = workdir.join("images").join(&image_path);

    let metadata = fs::metadata(&full_path)
        .map_err(|e| format!("Erreur metadata image: {}", e))?;

    Ok(metadata.len())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PythonProcesses {
            bots: Mutex::new(None),
            api: Mutex::new(None),
        })
        .setup(|app| {
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
            if let tauri::WindowEvent::Destroyed = event {
                // Arrêter les processus Python à la fermeture
                let state: State<PythonProcesses> = window.state();
                
                // Kill bots process
                if let Some(mut child) = state.bots.lock().unwrap().take() {
                    let _: Result<(), std::io::Error> = child.kill();
                };
                
                // Kill API process
                if let Some(mut child) = state.api.lock().unwrap().take() {
                    let _: Result<(), std::io::Error> = child.kill();
                };
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
