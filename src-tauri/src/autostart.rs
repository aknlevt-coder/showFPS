//! Windows ile otomatik başlatma.
//!
//! Uygulama yönetici ister (requireAdministrator); Windows, Run anahtarındaki yükseltme
//! gerektiren girişleri oturum açılışında sessizce atlar. Bu yüzden "en yüksek yetkiyle"
//! çalışan bir Görev Zamanlayıcı görevi kullanılır: oturum açılınca UAC sormadan başlar.
//! Görevi oluşturmak/silmek yönetici ister; uygulama zaten yükseltilmiş çalışır.
//!
//! Güvenlik: araçlar System32'den tam yolla çağrılır (PATH'e konmuş sahte schtasks.exe
//! yönetici yetkisiyle çalışmasın). Görev tanımı diske yazılmaz: kullanıcı Temp klasöründeki
//! bir XML'i yazmakla schtasks'ın okuması arasında yetkisiz bir program dosyayı değiştirip
//! kendi komutunu yönetici görevi olarak kaydettirebilirdi.

use std::{os::windows::process::CommandExt, path::PathBuf, process::Command};

/// Kaldırıcı da bu adı kullanır (src-tauri/windows/hooks.nsh) — değiştirirseniz orayı da güncelleyin.
pub const TASK_NAME: &str = "showFPS";
/// 0.1.13'e kadarki ad; varsa ilk açılışta yeni ada taşınır (iki görev iki kopya başlatırdı).
const OLD_TASK_NAME: &str = "Custom Performance Overlay";
/// Görevle başlatıldığında ana pencere gizli açılır (yalnızca overlay + tepsi).
pub const AUTOSTART_ARG: &str = "--autostart";

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// C:\Windows\System32 (ortam değişkeninden değil, Windows API'den).
fn system32() -> PathBuf {
    use windows_sys::Win32::System::SystemInformation::GetSystemDirectoryW;
    let mut buf = [0u16; 260];
    let n = unsafe { GetSystemDirectoryW(buf.as_mut_ptr(), buf.len() as u32) } as usize;
    if n == 0 || n >= buf.len() {
        return PathBuf::from(r"C:\Windows\System32");
    }
    PathBuf::from(String::from_utf16_lossy(&buf[..n]))
}

fn schtasks(args: &[&str]) -> Result<String, String> {
    let out = Command::new(system32().join("schtasks.exe"))
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
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

/// Görev kayıtlıysa, çalıştıracağı exe yolunu döndürür.
fn registered_command(name: &str) -> Option<String> {
    let xml = schtasks(&["/Query", "/TN", name, "/XML"]).ok()?;
    let start = xml.find("<Command>")? + "<Command>".len();
    let end = xml[start..].find("</Command>")? + start;
    Some(xml[start..end].replace("&amp;", "&"))
}

pub fn is_enabled() -> bool {
    registered_command(TASK_NAME).is_some()
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
        r#"<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>showFPS'i oturum açılınca başlatır.</Description></RegistrationInfo>
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

    register(TASK_NAME, &xml)
}

/// Görev tanımını diske yazmadan kaydeder.
fn register(name: &str, xml: &str) -> Result<(), String> {
    // schtasks /XML yalnız dosya kabul eder; Register-ScheduledTask ise XML'i metin olarak alır.
    // Betik -EncodedCommand ile (UTF-16LE + base64) verilir: tırnak/kodlama sorunu olmaz,
    // kullanıcı adındaki Türkçe karakterler de bozulmaz. XML'de "'@" geçemez (tek tırnak kaçışlı).
    let script = format!(
        "$ErrorActionPreference='Stop'; Register-ScheduledTask -TaskName '{name}' -Force -Xml @'\n{xml}\n'@ | Out-Null"
    );
    let utf16: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    let out = Command::new(system32().join(r"WindowsPowerShell\v1.0\powershell.exe"))
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &base64(&utf16)])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("powershell başlatılamadı: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!("görev oluşturulamadı: {}", String::from_utf8_lossy(&out.stderr).trim()))
    }
}

fn base64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for c in data.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            out.push(if i <= c.len() { T[(n >> (18 - 6 * i)) as usize & 63] as char } else { '=' });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn base64_matches_rfc4648() {
        assert_eq!(super::base64(b""), "");
        assert_eq!(super::base64(b"f"), "Zg==");
        assert_eq!(super::base64(b"fo"), "Zm8=");
        assert_eq!(super::base64(b"foo"), "Zm9v");
        assert_eq!(super::base64(b"foobar"), "Zm9vYmFy");
    }

    /// Gerçek kayıt: yönetici istemeyen (LeastPrivilege, devre dışı) geçici bir görev kaydedip siler.
    /// Görev Zamanlayıcı'ya dokunduğu için elle çalıştırılır: cargo test -- --ignored
    #[test]
    #[ignore]
    fn registers_task_without_temp_file() {
        let name = "showFPS-test-kayit";
        let user = format!("{}\\{}", std::env::var("USERDOMAIN").unwrap(), std::env::var("USERNAME").unwrap());
        let xml = format!(
            r#"<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Türkçe açıklama: ğüşiöç 'tırnak'</Description></RegistrationInfo>
  <Principals><Principal id="Author"><UserId>{u}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><Enabled>false</Enabled></Settings>
  <Actions Context="Author"><Exec><Command>C:\Windows\System32\cmd.exe</Command><Arguments>/c exit</Arguments></Exec></Actions>
</Task>"#,
            u = super::xml_escape(&user)
        );
        super::register(name, &xml).unwrap();
        let cmd = super::registered_command(name);
        let _ = super::schtasks(&["/Delete", "/TN", name, "/F"]);
        assert_eq!(cmd.as_deref(), Some(r"C:\Windows\System32\cmd.exe"));
    }
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
    if registered_command(OLD_TASK_NAME).is_some() {
        // Ad değişikliği: kullanıcının açık bıraktığı otomatik başlatma yeni adla sürsün.
        if enable().is_ok() {
            let _ = schtasks(&["/Delete", "/TN", OLD_TASK_NAME, "/F"]);
        }
        return;
    }
    let (Some(cmd), Ok(exe)) = (registered_command(TASK_NAME), std::env::current_exe()) else { return };
    if !cmd.eq_ignore_ascii_case(&exe.to_string_lossy()) {
        let _ = enable();
    }
}
