#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Mutex, OnceLock};
use sysinfo::{ProcessesToUpdate, System};

#[derive(serde::Serialize)]
struct C3cProcessMetrics {
    cpu_percent: f32,
    memory_mb: f64,
    pid: u32,
}

// Per-process measurements, not full-system/GPU/power statistics.
// sysinfo CPU usage needs at least two refreshes to become meaningful.
#[tauri::command]
fn c3c_process_metrics() -> Result<C3cProcessMetrics, String> {
    static SYSTEM: OnceLock<Mutex<System>> = OnceLock::new();
    let system = SYSTEM.get_or_init(|| Mutex::new(System::new()));
    let mut system = system.lock().map_err(|_| "Metrics lock poisoned".to_owned())?;
    let pid = sysinfo::get_current_pid().map_err(|e| e.to_string())?;
    system.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
    let process = system.process(pid).ok_or("Process metrics unavailable")?;
    Ok(C3cProcessMetrics {
        cpu_percent: process.cpu_usage(),
        memory_mb: process.memory() as f64 / 1_048_576.0,
        pid: std::process::id(),
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![c3c_process_metrics])
        .run(tauri::generate_context!())
        .expect("Gagal menjalankan OpenClipper Custom");
}
