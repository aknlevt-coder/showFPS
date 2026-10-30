//! PawnIO sürücüsünün kurulumu (CPU sıcaklığı ve bazı sensörler için gerekli).
//!
//! Normalde showFPS kurulumu PawnIO'yu sessizce kurar (windows/hooks.nsh; PawnIO GPL-2.0, resmi
//! kurulum değiştirilmeden pakette). Bu modül panelden elle kurulum içindir (kurulum sırasında
//! başarısız olduysa ya da sonradan kaldırıldıysa): pakette gelen dosya kullanılır, yoksa (dev
//! derlemesi) resmi adresten indirilir. Her iki durumda da yalnız yayıncının (namazso) geçerli
//! Authenticode imzası varsa çalıştırılır; kurulum penceresi kullanıcıya gösterilir.
//!
//! Dosyalar uygulama klasöründe (Program Files, yalnız yönetici yazabilir): kullanıcı Temp'inde
//! olsaydı imza denetimiyle çalıştırma arasında yetkisiz bir program değiştirebilirdi.

use std::{os::windows::process::CommandExt, process::Command};

use crate::autostart::{base64, system32};

const URL: &str = "https://github.com/namazso/PawnIO.Setup/releases/latest/download/PawnIO_setup.exe";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// Kurulum dosyası en fazla bu boyutta olabilir (2.2.0 ~3.4 MB).
const MAX_BYTES: usize = 32 * 1024 * 1024;

#[derive(serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Installed,
    /// Kuruldu, ancak Windows yeniden başlatma istiyor.
    Reboot,
    /// Kullanıcı kurulum penceresinde vazgeçti.
    Cancelled,
}

pub async fn install() -> Result<Outcome, String> {
    let dir = std::env::current_exe().map_err(|e| e.to_string())?.parent().ok_or("uygulama klasörü yok")?.to_path_buf();
    let bundled = dir.join("PawnIO_setup.exe");
    if bundled.exists() {
        return tauri::async_runtime::spawn_blocking(move || verify(&bundled).and_then(|()| run(&bundled)))
            .await
            .map_err(|e| e.to_string())?;
    }
    let bytes = download().await?;
    let path = dir.join("PawnIO_setup.download.exe");
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::write(&path, &bytes).map_err(|e| format!("kaydedilemedi: {e}"))?;
        let result = verify(&path).and_then(|()| run(&path));
        let _ = std::fs::remove_file(&path);
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

async fn download() -> Result<Vec<u8>, String> {
    // reqwest'in rustls'i sağlayıcısız derlenir; güncelleyici eklentisiyle aynı yolla ring kurulur.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let res = reqwest::get(URL).await.map_err(|e| format!("indirilemedi: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("indirilemedi: HTTP {}", res.status()));
    }
    let bytes = res.bytes().await.map_err(|e| format!("indirilemedi: {e}"))?;
    if bytes.len() > MAX_BYTES {
        return Err("indirilen dosya beklenenden büyük".into());
    }
    Ok(bytes.to_vec())
}

/// Kurulum penceresini açar (imza önceden doğrulanmış olmalı).
fn run(path: &std::path::Path) -> Result<Outcome, String> {
    // Parametresiz: PawnIO'nun kendi kurulum penceresi açılır (kullanıcı görür, vazgeçebilir).
    let status = Command::new(path).status().map_err(|e| format!("başlatılamadı: {e}"))?;
    match status.code() {
        Some(0) => Ok(Outcome::Installed),
        Some(3010) => Ok(Outcome::Reboot), // ERROR_SUCCESS_REBOOT_REQUIRED
        Some(1223) | Some(1602) => Ok(Outcome::Cancelled), // kullanıcı vazgeçti
        other => Err(format!("kurulum hata koduyla bitti: {}", other.unwrap_or(-1))),
    }
}

/// Authenticode: imza geçerli ve imzalayan PawnIO'nun yayıncısı olmalı.
fn verify(path: &std::path::Path) -> Result<(), String> {
    let p = path.to_string_lossy().replace('\'', "''");
    let script = format!(
        "$s = Get-AuthenticodeSignature -LiteralPath '{p}'; \
         if ($s.Status -eq 'Valid' -and $s.SignerCertificate.Subject -match '(^|, )CN=namazso\\.eu(,|$)' -and $s.SignerCertificate.Subject -match '(^|, )O=namazso(,|$)') {{ exit 0 }} \
         else {{ Write-Output \"$($s.Status) $($s.SignerCertificate.Subject)\"; exit 3 }}"
    );
    let utf16: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    let out = Command::new(system32().join(r"WindowsPowerShell\v1.0\powershell.exe"))
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &base64(&utf16)])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("imza denetlenemedi: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!("imza doğrulanamadı, dosya çalıştırılmadı ({})", String::from_utf8_lossy(&out.stdout).trim()))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn rejects_other_publishers() {
        // Geçerli imzalı ama başka yayıncı (Microsoft): çalıştırılmamalı.
        let notepad = crate::autostart::system32().join("notepad.exe");
        assert!(super::verify(&notepad).is_err());
    }

    /// Ağ ister: resmi dosyayı indirip yalnız imzasını denetler (çalıştırmaz). cargo test -- --ignored
    #[test]
    #[ignore]
    fn accepts_official_setup() {
        let bytes = tauri::async_runtime::block_on(super::download()).unwrap();
        let path = std::env::temp_dir().join(format!("pawnio-test-{}.exe", std::process::id()));
        std::fs::write(&path, &bytes).unwrap();
        let r = super::verify(&path);
        let _ = std::fs::remove_file(&path);
        r.unwrap();
    }
}
