use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

#[derive(Default)]
struct AppState {
    working_folder: Mutex<Option<PathBuf>>,
}

#[derive(Serialize, Deserialize)]
struct FileItem {
    name: String,
    path: String,
    is_directory: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<u64>,
}

fn resolve_path(base: &Option<PathBuf>, name: &str) -> Result<PathBuf, String> {
    let base = base
        .as_ref()
        .ok_or_else(|| "作業フォルダが設定されていません。".to_string())?;
    let base = base.canonicalize().map_err(|e| e.to_string())?;
    let path = base.join(name);
    let path = path.canonicalize().unwrap_or(path);
    if !path.starts_with(&base) {
        return Err("アクセス拒否: フォルダ外へのアクセスはできません".to_string());
    }
    Ok(path)
}

#[tauri::command]
fn set_working_folder(state: State<AppState>, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err("指定されたパスはフォルダではありません。".to_string());
    }
    *state.working_folder.lock().map_err(|e| e.to_string())? = Some(p);
    Ok(())
}

#[tauri::command]
fn get_working_folder(state: State<AppState>) -> Result<Option<String>, String> {
    let guard = state.working_folder.lock().map_err(|e| e.to_string())?;
    Ok(guard
        .as_ref()
        .map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn list_files(state: State<AppState>) -> Result<Vec<FileItem>, String> {
    let base = state
        .working_folder
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    let base = base.ok_or_else(|| "作業フォルダが設定されていません。".to_string())?;
    let base = base.canonicalize().map_err(|e| e.to_string())?;
    let entries = fs::read_dir(&base).map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = meta.is_dir();
        let size = if meta.is_file() { Some(meta.len()) } else { None };
        items.push(FileItem {
            path: name.clone(),
            name,
            is_directory: is_dir,
            size,
        });
    }
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(items)
}

#[tauri::command]
fn read_text_file(state: State<AppState>, path: String) -> Result<String, String> {
    let full = resolve_path(
        &state.working_folder.lock().map_err(|e| e.to_string())?.clone(),
        &path,
    )?;
    fs::read_to_string(&full).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(
    state: State<AppState>,
    path: String,
    content: String,
) -> Result<(), String> {
    let full = resolve_path(
        &state.working_folder.lock().map_err(|e| e.to_string())?.clone(),
        &path,
    )?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&full, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_binary_file(state: State<AppState>, path: String) -> Result<Vec<u8>, String> {
    let full = resolve_path(
        &state.working_folder.lock().map_err(|e| e.to_string())?.clone(),
        &path,
    )?;
    fs::read(&full).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_binary_file(
    state: State<AppState>,
    path: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let full = resolve_path(
        &state.working_folder.lock().map_err(|e| e.to_string())?.clone(),
        &path,
    )?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&full, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_file(state: State<AppState>, path: String) -> Result<(), String> {
    let full = resolve_path(
        &state.working_folder.lock().map_err(|e| e.to_string())?.clone(),
        &path,
    )?;
    if full.is_file() {
        fs::remove_file(&full).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_in_system(state: State<AppState>, path: String) -> Result<(), String> {
    let full = resolve_path(
        &state.working_folder.lock().map_err(|e| e.to_string())?.clone(),
        &path,
    )?;
    opener::open(&full).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            set_working_folder,
            get_working_folder,
            list_files,
            read_text_file,
            write_text_file,
            read_binary_file,
            write_binary_file,
            delete_file,
            open_in_system,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
