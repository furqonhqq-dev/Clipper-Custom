#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
mod c3c_diagnostics {
    use std::ffi::c_void;
    use std::sync::{Mutex, OnceLock};
    use std::time::Instant;

    type Handle = *mut c_void;

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct FileTime {
        low: u32,
        high: u32,
    }

    impl FileTime {
        fn ticks(self) -> u64 {
            ((self.high as u64) << 32) | self.low as u64
        }
    }

    #[repr(C)]
    #[derive(Default)]
    struct ProcessMemoryCounters {
        cb: u32,
        page_fault_count: u32,
        peak_working_set_size: usize,
        working_set_size: usize,
        quota_peak_paged_pool_usage: usize,
        quota_paged_pool_usage: usize,
        quota_peak_non_paged_pool_usage: usize,
        quota_non_paged_pool_usage: usize,
        pagefile_usage: usize,
        peak_pagefile_usage: usize,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcess() -> Handle;
        fn GetProcessTimes(
            process: Handle,
            creation: *mut FileTime,
            exit: *mut FileTime,
            kernel: *mut FileTime,
            user: *mut FileTime,
        ) -> i32;
    }

    #[link(name = "psapi")]
    extern "system" {
        fn GetProcessMemoryInfo(
            process: Handle,
            counters: *mut ProcessMemoryCounters,
            size: u32,
        ) -> i32;
    }

    // Returns [CPU percent of one logical core, working-set RAM in MiB].
    // First CPU sample is 0: meaningful values need a subsequent call.
    pub fn snapshot() -> Result<[f64; 2], String> {
        static LAST: OnceLock<Mutex<Option<(Instant, u64)>>> = OnceLock::new();
        let process = unsafe { GetCurrentProcess() };
        let mut memory = ProcessMemoryCounters {
            cb: std::mem::size_of::<ProcessMemoryCounters>() as u32,
            ..Default::default()
        };
        let mut creation = FileTime::default();
        let mut exit = FileTime::default();
        let mut kernel = FileTime::default();
        let mut user = FileTime::default();

        let memory_ok = unsafe { GetProcessMemoryInfo(process, &mut memory, memory.cb) };
        let times_ok = unsafe {
            GetProcessTimes(
                process,
                &mut creation,
                &mut exit,
                &mut kernel,
                &mut user,
            )
        };
        if memory_ok == 0 || times_ok == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }

        let now = Instant::now();
        let total_ticks = kernel.ticks().saturating_add(user.ticks());
        let state = LAST.get_or_init(|| Mutex::new(None));
        let mut last = state.lock().map_err(|_| "CPU sample lock poisoned".to_owned())?;
        let cpu = if let Some((previous_time, previous_ticks)) = *last {
            let elapsed = now.duration_since(previous_time).as_secs_f64();
            if elapsed > 0.0 {
                (total_ticks.saturating_sub(previous_ticks) as f64 / 10_000_000.0)
                    / elapsed
                    * 100.0
            } else {
                0.0
            }
        } else {
            0.0
        };
        *last = Some((now, total_ticks));
        Ok([cpu, memory.working_set_size as f64 / 1_048_576.0])
    }
}

#[tauri::command]
fn c3c_process_metrics() -> Result<[f64; 2], String> {
    #[cfg(windows)]
    {
        c3c_diagnostics::snapshot()
    }
    #[cfg(not(windows))]
    {
        Err("Checkpoint 3C process diagnostics are Windows-only".to_owned())
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![c3c_process_metrics])
        .run(tauri::generate_context!())
        .expect("Gagal menjalankan OpenClipper Custom");
}
