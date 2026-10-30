//! Oyun oturumu kayıtları: app config dizininde sessions/ altında.
//! Her oturum iki dosya: <id>.summary.json (liste için küçük) ve <id>.json (saniyelik örnekler + kare süreleri).
//! En yeni KEEP oturum tutulur, eskileri silinir.

use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

const KEEP: usize = 50;

fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_config_dir().map_err(|e| e.to_string())?.join("sessions");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// Kimlik dosya adı olarak kullanılır: yalnız harf, rakam ve '-' (dizin dışına yazılamasın).
fn check_id(id: &str) -> Result<(), String> {
    if !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        Ok(())
    } else {
        Err(format!("geçersiz oturum kimliği: {id}"))
    }
}

fn write_atomic(p: &PathBuf, text: &str) -> Result<(), String> {
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, p).map_err(|e| e.to_string())
}

pub fn save(app: &AppHandle, id: &str, summary: &serde_json::Value, data: &serde_json::Value) -> Result<(), String> {
    check_id(id)?;
    let d = dir(app)?;
    write_atomic(&d.join(format!("{id}.json")), &serde_json::to_string(data).map_err(|e| e.to_string())?)?;
    write_atomic(&d.join(format!("{id}.summary.json")), &serde_json::to_string(summary).map_err(|e| e.to_string())?)?;
    prune(&d);
    Ok(())
}

/// Kimlikler zaman damgasıyla başlar (YYYYMMDD-HHMMSS-…): ada göre sıralama = zamana göre sıralama.
fn ids(d: &PathBuf) -> Vec<String> {
    let mut v: Vec<String> = fs::read_dir(d)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| e.file_name().to_str()?.strip_suffix(".summary.json").map(str::to_owned))
        .collect();
    v.sort_unstable_by(|a, b| b.cmp(a)); // en yeni önce
    v
}

fn prune(d: &PathBuf) {
    for old in ids(d).into_iter().skip(KEEP) {
        let _ = fs::remove_file(d.join(format!("{old}.json")));
        let _ = fs::remove_file(d.join(format!("{old}.summary.json")));
    }
}

pub fn list(app: &AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let d = dir(app)?;
    Ok(ids(&d)
        .into_iter()
        .filter_map(|id| fs::read_to_string(d.join(format!("{id}.summary.json"))).ok())
        .filter_map(|s| serde_json::from_str(&s).ok())
        .collect())
}

pub fn get(app: &AppHandle, id: &str) -> Result<serde_json::Value, String> {
    check_id(id)?;
    let s = fs::read_to_string(dir(app)?.join(format!("{id}.json"))).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

pub fn delete(app: &AppHandle, id: &str) -> Result<(), String> {
    check_id(id)?;
    let d = dir(app)?;
    let _ = fs::remove_file(d.join(format!("{id}.json")));
    fs::remove_file(d.join(format!("{id}.summary.json"))).map_err(|e| e.to_string())
}
