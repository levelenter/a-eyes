use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileItem {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
}

#[tauri::command]
fn list_files(path: String) -> Result<Vec<FileItem>, String> {
    let dir_path = Path::new(&path);
    if !dir_path.exists() {
        return Err(format!("パスが存在しません: {}", path));
    }
    if !dir_path.is_dir() {
        return Err(format!("ディレクトリではありません: {}", path));
    }

    let entries = fs::read_dir(dir_path).map_err(|e| e.to_string())?;
    let mut files: Vec<FileItem> = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files
        if name.starts_with('.') {
            continue;
        }

        files.push(FileItem {
            name: name.clone(),
            path: entry.path().to_string_lossy().to_string(),
            is_directory: meta.is_dir(),
            size: if meta.is_file() { Some(meta.len()) } else { None },
        });
    }

    // Sort: directories first, then by name
    files.sort_by(|a, b| {
        if a.is_directory == b.is_directory {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        } else if a.is_directory {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(files)
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &path])
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn read_file_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file_text(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("A-Eyes");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_files,
            open_file,
            read_file_text,
            write_file_text,
            delete_file,
        ])
        .run(tauri::generate_context!())
        .expect("A-Eyesの起動に失敗しました");
}
