//! Windows ile otomatik başlatma.
//!
//! Uygulama yönetici ister (requireAdministrator); Windows, Run anahtarındaki yükseltme
//! gerektiren girişleri oturum açılışında sessizce atlar. Bu yüzden "en yüksek yetkiyle"
//! çalışan bir Görev Zamanlayıcı görevi kullanılır: oturum açılınca UAC sormadan başlar.
//! Görevi oluşturmak/silmek yönetici ister; uygulama zaten yükseltilmiş çalışır.

use std::{os::windows::process::CommandExt, process::Command};

/// Kaldırıcı da bu adı kullanır (src-tauri/windows/hooks.nsh) — değiştirirseniz orayı da güncelleyin.
pub const TASK_NAME: &str = "Custom Performance Overlay";
/// Görevle başlatıldığında ana pencere gizli açılır (yalnızca overlay + tepsi).
pub const AUTOSTART_ARG: &str = "--autostart";

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn schtasks(args: &[&str]) -> Result<String, String> {
    let out = Command::new("schtasks.exe")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("schtasks başlatılamadı: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        // schtasks mesajları sistem kod sayfasında; bozuk karakter olabilir ama hata kodu yeterli bilgi verir.
        Err(format!(
            "schtasks hata ({}): {}",
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stderr).trim()
        ))
    }
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// Görev kayıtlıysa, çalıştıracağı exe yolunu döndürür.
fn registered_command() -> Option<String> {
    let xml = schtasks(&["/Query", "/TN", TASK_NAME, "/XML"]).ok()?;
    let start = xml.find("<Command>")? + "<Command>".len();
    let end = xml[start..].find("</Command>")? + start;
    Some(xml[start..end].replace("&amp;", "&"))
}

pub fn is_enabled() -> bool {
    registered_command().is_some()
}

pub fn enable() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let user = format!(
        "{}\\{}",
        std::env::var("USERDOMAIN").unwrap_or_default(),
        std::env::var("USERNAME").map_err(|_| "USERNAME okunamadı")?
    );
    // Varsayılanlar bu uygulama için yanlış: dizüstünde pildeyken başlamaz ve 72 saat sonra
    // görevi sonlandırır. İkisi de kapatılıyor; oturum açılışından 10 sn sonra başlar.
    let xml = format!(
        r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Custom Performance Overlay'i oturum açılınca başlatır.</Description></RegistrationInfo>
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled><UserId>{user}</UserId><Delay>PT10S</Delay></LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author"><UserId>{user}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec><Command>{exe}</Command><Arguments>{arg}</Arguments></Exec>
  </Actions>
</Task>
"#,
        user = xml_escape(&user),
        exe = xml_escape(&exe.to_string_lossy()),
        arg = AUTOSTART_ARG,
    );

    // schtasks /XML UTF-16 dosya ister.
    let path = std::env::temp_dir().join("cpo-autostart-task.xml");
    let mut bytes = vec![0xFF, 0xFE];
    bytes.extend(xml.encode_utf16().flat_map(|u| u.to_le_bytes()));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    let res = schtasks(&["/Create", "/TN", TASK_NAME, "/XML", &path.to_string_lossy(), "/F"]);
    let _ = std::fs::remove_file(&path);
    res.map(|_| ())
}

pub fn disable() -> Result<(), String> {
    if !is_enabled() {
        return Ok(());
    }
    schtasks(&["/Delete", "/TN", TASK_NAME, "/F"]).map(|_| ())
}

/// Uygulama başka bir klasöre yeniden kurulduysa görev eski exe'yi gösterir; düzelt.
/// Dev derlemesinde çalışmaz: aksi halde görev kurulu uygulama yerine geliştirme exe'sine yönelirdi.
pub fn refresh_path_if_enabled() {
    if cfg!(debug_assertions) {
        return;
    }
    let (Some(cmd), Ok(exe)) = (registered_command(), std::env::current_exe()) else { return };
    if !cmd.eq_ignore_ascii_case(&exe.to_string_lossy()) {
        let _ = enable();
    }
}
