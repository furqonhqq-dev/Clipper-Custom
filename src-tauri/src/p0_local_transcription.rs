// P0 experimental local speech-to-text adapter.
// The user explicitly selects FFmpeg, whisper-cli and the Whisper model.
// No shell interpolation, downloads, background services or network requests.
#[cfg(windows)]
use std::{fs, path::PathBuf, process::{Command, Stdio}, time::{SystemTime, UNIX_EPOCH}};

#[cfg(windows)]
fn checked_file(raw: String, expected: &[&str]) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw);
    let name = path.file_name().and_then(|s|s.to_str()).unwrap_or("").to_ascii_lowercase();
    if !expected.iter().any(|x| name == *x) || !path.is_file() {
        return Err(format!("Pilih file yang benar: {}.", expected.join(" atau ")));
    }
    fs::canonicalize(&path).map_err(|e| format!("File tidak dapat diakses: {e}"))
}
#[cfg(windows)]
fn video_file(raw: String) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw);
    let ext = path.extension().and_then(|s|s.to_str()).unwrap_or("").to_ascii_lowercase();
    if !["mp4","mov","webm","mkv","avi","m4v"].contains(&ext.as_str()) || !path.is_file() {
        return Err("Video sumber tidak valid atau tidak ditemukan.".into());
    }
    fs::canonicalize(&path).map_err(|e| format!("Video tidak dapat diakses: {e}"))
}
#[cfg(windows)]
fn short_error(process: &str, data: &[u8]) -> String {
    let message = String::from_utf8_lossy(data);
    let tail: String = message.chars().rev().take(450).collect::<String>().chars().rev().collect();
    if tail.is_empty() {
        format!("{process} gagal. Periksa codec, model, ruang penyimpanan dan file sumber.")
    } else {
        format!("{process} gagal: {tail}")
    }
}

#[cfg(windows)]
pub fn transcribe(video_path: String, ffmpeg_path: String, whisper_path: String, model_path: String)
  -> Result<String, String> {
    let video = video_file(video_path)?;
    let ffmpeg = checked_file(ffmpeg_path, &["ffmpeg.exe"])?;
    let whisper = checked_file(whisper_path, &["whisper-cli.exe"])?;
    let model = PathBuf::from(model_path);
    if !model.is_file() || !model.extension().and_then(|e|e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("bin")) {
        return Err("Pilih model Whisper ggml (.bin) yang sudah tersedia di komputer.".into());
    }
    let model = fs::canonicalize(model).map_err(|e| e.to_string())?;
    if fs::metadata(&model).map_err(|e| e.to_string())?.len() < 1_000_000 {
        return Err("File model terlalu kecil atau tidak valid.".into());
    }
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?.as_nanos();
    let temp = std::env::temp_dir().join(format!("openclipper-p0-{}-{timestamp}",std::process::id()));
    fs::create_dir(&temp).map_err(|e| format!("Tidak bisa menyiapkan direktori kerja: {e}"))?;
    let result = (|| {
        let wav = temp.join("audio.wav");
        let out_base = temp.join("subtitle");
        let output = Command::new(&ffmpeg)
            .arg("-nostdin").arg("-y").arg("-hide_banner").arg("-loglevel").arg("error")
            .arg("-i").arg(&video).arg("-vn").arg("-ar").arg("16000")
            .arg("-ac").arg("1").arg("-c:a").arg("pcm_s16le")
            .arg(&wav).stdin(Stdio::null()).output()
            .map_err(|e| format!("FFmpeg tidak dapat dijalankan: {e}"))?;
        if !output.status.success() {
            return Err(short_error("Ekstraksi audio", &output.stderr));
        }
        let output = Command::new(&whisper)
            .arg("-m").arg(&model).arg("-f").arg(&wav)
            .arg("-l").arg("auto").arg("-osrt").arg("-of").arg(&out_base)
            .arg("-np").stdin(Stdio::null()).output()
            .map_err(|e| format!("Whisper tidak dapat dijalankan: {e}"))?;
        if !output.status.success() {
            return Err(short_error("Transkripsi lokal", &output.stderr));
        }
        let subtitle = out_base.with_extension("srt");
        let size = fs::metadata(&subtitle).map_err(|_|"Whisper tidak menghasilkan file SRT.".to_owned())?.len();
        if size == 0 || size > 3_000_000 {
            return Err("Transkrip kosong atau terlalu besar untuk analisis awal (maksimal 3 MB).".into());
        }
        fs::read_to_string(&subtitle).map_err(|e| format!("SRT tidak bisa dibaca: {e}"))
    })();
    // Remove extracted private audio and temporary subtitle even if a command fails.
    let _ = fs::remove_dir_all(&temp);
    result
}
#[cfg(not(windows))]
pub fn transcribe(_: String, _: String, _: String, _: String) -> Result<String,String> {
    Err("Fitur speech-to-text lokal eksperimen hanya untuk Windows.".into())
}
