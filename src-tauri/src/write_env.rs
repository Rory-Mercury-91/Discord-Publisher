use std::fs;
use tauri::AppHandle;

#[tauri::command]
pub async fn write_env_file(_app: AppHandle, env_content: String) -> Result<(), String> {
    let workdir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current_dir: {:?}", e))?;
    let env_path = workdir.join("python").join("config_bots.env");
    fs::create_dir_all(workdir.join("python")).map_err(|e| format!("Failed to create python dir: {:?}", e))?;
    fs::write(&env_path, env_content).map_err(|e| format!("Failed to write .env: {:?}", e))?;
    Ok(())
}
