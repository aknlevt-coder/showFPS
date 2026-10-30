mod apps;
mod autostart;
mod sessions;
mod usage;

use std::{
    fs,
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

use serde::Serialize;
use serde_json::json;
use sysinfo::System;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    window::{Effect, EffectState, EffectsBuilder},
    AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};

/// 0.1.12 ve öncesinin kimliği; ayarlar ve oturumlar %APPDATA%\<kimlik> altında durur.
const OLD_IDENTIFIER: &str = "com.example.customperformanceoverlay";

/// Kimlik değişince ayar klasörü de değişti: eskisi varsa ve yenisinde ayar yoksa taşı.
/// Ayarlar okunmadan (pencere açılmadan) çağrılır. Taşıma olmazsa eski klasör yerinde kalır.
fn migrate_config_dir(app: &AppHandle) {
    let Ok(new) = app.path().app_config_dir() else { return };
    if let Some(old) = new.parent().map(|p| p.join(OLD_IDENTIFIER)) {
        migrate_dir(&old, &new);
    }
}

fn migrate_dir(old: &std::path::Path, new: &std::path::Path) {
    if !old.join("state.json").exists() || new.join("state.json").exists() {
        return;
    }
    // Yeni klasör hiç yoksa tek adımda yeniden adlandır; varsa (boş ya da yalnız başka dosyalar) içeriği taşı.
    if !new.exists() && fs::rename(old, new).is_ok() {
        return;
    }
    let _ = fs::create_dir_all(new);
    if let Ok(entries) = fs::read_dir(old) {
        for e in entries.flatten() {
            let _ = fs::rename(e.path(), new.join(e.file_name()));
        }
    }
    let _ = fs::remove_dir(old); // boş kaldıysa
}

#[cfg(test)]
mod migrate_tests {
    use super::migrate_dir;
    use std::fs;

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("cpo-migrate-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn moves_whole_dir_when_new_missing() {
        let root = tmp("a");
        let (old, new) = (root.join("old"), root.join("new"));
        fs::create_dir_all(old.join("sessions")).unwrap();
        fs::write(old.join("state.json"), "{}").unwrap();
        fs::write(old.join("sessions").join("x.json"), "1").unwrap();
        migrate_dir(&old, &new);
        assert!(new.join("state.json").exists() && new.join("sessions").join("x.json").exists());
        assert!(!old.exists());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn moves_contents_into_existing_empty_dir() {
        let root = tmp("b");
        let (old, new) = (root.join("old"), root.join("new"));
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(&new).unwrap();
        fs::write(old.join("state.json"), "{\"a\":1}").unwrap();
        migrate_dir(&old, &new);
        assert_eq!(fs::read_to_string(new.join("state.json")).unwrap(), "{\"a\":1}");
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn keeps_new_settings() {
        let root = tmp("c");
        let (old, new) = (root.join("old"), root.join("new"));
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(&new).unwrap();
        fs::write(old.join("state.json"), "old").unwrap();
        fs::write(new.join("state.json"), "new").unwrap();
        migrate_dir(&old, &new);
        assert_eq!(fs::read_to_string(new.join("state.json")).unwrap(), "new");
        assert!(old.join("state.json").exists());
        fs::remove_dir_all(&root).unwrap();
    }
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("state.json"))
}

/// Kayıtlı ayarları döndürür. Dosya yok/bozuksa None (arayüz varsayılanlara döner).
#[tauri::command]
fn load_state(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    let p = state_path(&app)?;
    if !p.exists() {
        return Ok(None);
    }
    let s = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    match serde_json::from_str(&s) {
        Ok(v) => Ok(Some(v)),
        Err(_) => {
            // Bozuk dosyayı yedekle, sessizce silme.
            let _ = fs::rename(&p, p.with_extension("json.bak"));
            Ok(None)
        }
    }
}

/// Atomik yazım (tmp + rename) ve tüm pencerelere yayın.
#[tauri::command]
fn save_state(app: AppHandle, state: serde_json::Value) -> Result<(), String> {
    let p = state_path(&app)?;
    let tmp = p.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    app.emit("state-changed", state).map_err(|e| e.to_string())
}

/// locked = true → tıklama geçirgen (fare olayları alttaki pencereye gider).
struct TrayItems {
    show: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

/// Tepsi menüsü arayüz diliyle (Türkçe / İngilizce) aynı olsun.
#[tauri::command]
fn set_tray_labels(items: tauri::State<'_, TrayItems>, show: String, quit: String) -> Result<(), String> {
    items.show.set_text(show).map_err(|e| e.to_string())?;
    items.quit.set_text(quit).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_overlay_locked(app: AppHandle, locked: bool) -> Result<(), String> {
    let w = app.get_webview_window("overlay").ok_or("overlay penceresi bulunamadı")?;
    w.set_ignore_cursor_events(locked).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_overlay_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let w = app.get_webview_window("overlay").ok_or("overlay penceresi bulunamadı")?;
    if visible { w.show() } else { w.hide() }.map_err(|e| e.to_string())
}

/// Yardımcıya komut: yalnız bilinen komutlar ("frames on" / "frames off").
#[tauri::command]
fn helper_command(sensors: tauri::State<Sensors>, cmd: String) -> Result<(), String> {
    use std::io::Write;
    if cmd != "frames on" && cmd != "frames off" {
        return Err(format!("bilinmeyen komut: {cmd}"));
    }
    let mut guard = sensors.child.lock().unwrap();
    let stdin = guard.as_mut().and_then(|c| c.stdin.as_mut()).ok_or("sensör yardımcısı çalışmıyor")?;
    writeln!(stdin, "{cmd}").and_then(|_| stdin.flush()).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_session(app: AppHandle, id: String, summary: serde_json::Value, data: serde_json::Value) -> Result<(), String> {
    sessions::save(&app, &id, &summary, &data)
}

#[tauri::command]
fn list_sessions(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    sessions::list(&app)
}

#[tauri::command]
fn get_session(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    sessions::get(&app, &id)
}

#[tauri::command]
fn delete_session(app: AppHandle, id: String) -> Result<(), String> {
    sessions::delete(&app, &id)
}

/// CSV dışa aktarma: yol kaydetme penceresinden gelir; yalnız .csv yazılır.
#[tauri::command]
fn write_csv(path: String, contents: String) -> Result<(), String> {
    if !path.to_ascii_lowercase().ends_with(".csv") {
        return Err("yalnızca .csv dosyası yazılabilir".into());
    }
    // Excel'in Türkçe karakterleri doğru açması için UTF-8 BOM.
    fs::write(&path, format!("\u{feff}{contents}")).map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Windows 11 (derleme 22000+) Mica destekler. sysinfo çekirdek sürümünü "10.0.22631" ya da
/// "22631" biçiminde verebilir; son sayı derleme numarasıdır.
fn is_windows_11() -> bool {
    System::kernel_version()
        .and_then(|v| v.rsplit('.').next().and_then(|b| b.trim().parse::<u32>().ok()))
        .is_some_and(|build| build >= 22_000)
}

struct WindowInfo {
    mica: bool,
}

/// Arayüz Mica açıksa arka planını şeffaf yapar (html.mica).
#[tauri::command]
fn window_info(info: tauri::State<WindowInfo>) -> serde_json::Value {
    json!({ "mica": info.mica })
}

/// Uygulamanın kendi RAM/CPU tüketimi (panel açıkken birkaç saniyede bir istenir).
#[tauri::command]
fn self_usage(state: tauri::State<usage::UsageState>) -> usage::SelfUsage {
    usage::self_usage(&state)
}

/// Oyunlar sayfası: şu an açık, penceresi olan uygulamalar.
#[tauri::command]
fn running_apps() -> Vec<apps::RunningApp> {
    apps::running_apps()
}

#[tauri::command]
fn get_autostart() -> bool {
    autostart::is_enabled()
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<(), String> {
    if enabled { autostart::enable() } else { autostart::disable() }
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Yalnızca GERÇEKTEN okunan değerler gönderilir. Sıcaklık, GPU, VRAM ve FPS
/// alanları ilgili kaynaklar (Aşama 6/7) bağlanana kadar hiç gönderilmez.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Telemetry {
    cpu_load: f32,
    ram_used_mb: u64,
    ram_total_mb: u64,
}

fn spawn_system_sampler(app: AppHandle) {
    thread::spawn(move || {
        let mut sys = System::new();
        sys.refresh_cpu_usage(); // ilk ölçüm referans noktasıdır
        loop {
            thread::sleep(Duration::from_millis(1000));
            sys.refresh_cpu_usage();
            sys.refresh_memory();
            let t = Telemetry {
                cpu_load: sys.global_cpu_usage(),
                ram_used_mb: sys.used_memory() / (1024 * 1024),
                ram_total_mb: sys.total_memory() / (1024 * 1024),
            };
            let _ = app.emit("telemetry", t);
        }
    });
}

/// LibreHardwareMonitor yardımcı sürecinin durumu (arayüzdeki "Veri kaynakları" tablosu için).
#[derive(Default)]
struct Sensors {
    child: Mutex<Option<Child>>,
    status: Mutex<serde_json::Value>,
}

fn set_sensor_status(app: &AppHandle, status: serde_json::Value) {
    *app.state::<Sensors>().status.lock().unwrap() = status.clone();
    let _ = app.emit("sensor-status", status);
}

#[tauri::command]
fn sensor_status(sensors: tauri::State<Sensors>) -> serde_json::Value {
    sensors.status.lock().unwrap().clone()
}

/// Sidecar, Tauri tarafından ana exe'nin yanına "lhm-helper.exe" olarak kopyalanır.
fn spawn_sensor_helper(app: AppHandle) {
    let path = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("lhm-helper.exe")));
    let Some(path) = path.filter(|p| p.exists()) else {
        set_sensor_status(&app, json!({ "state": "missing" }));
        return;
    };

    let mut cmd = Command::new(&path);
    // Panel ön plandayken yardımcı FPS ölçmesin diye kendi süreç kimliğimizi veririz.
    cmd.arg("--owner-pid").arg(std::process::id().to_string());
    // stdin açık tutulur: ana süreç ölünce yardımcı EOF görüp kendini kapatır.
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            set_sensor_status(&app, json!({ "state": "error", "message": e.to_string() }));
            return;
        }
    };
    let stdout = child.stdout.take().expect("stdout piped");
    *app.state::<Sensors>().child.lock().unwrap() = Some(child);
    set_sensor_status(&app, json!({ "state": "starting" }));

    thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
            let Some(obj) = v.as_object_mut() else { continue };
            match obj.remove("type").as_ref().and_then(|t| t.as_str()) {
                Some("data") => {
                    let _ = app.emit("telemetry", v);
                }
                Some("info") => set_sensor_status(&app, json!({ "state": "running", "info": v })),
                Some("error") => {
                    let mut st = app.state::<Sensors>().status.lock().unwrap().clone();
                    st["lastError"] = obj.get("message").cloned().unwrap_or_default();
                    set_sensor_status(&app, st);
                }
                _ => {}
            }
        }
        // Süreç bitti: eski değerler ekranda donup kalmasın.
        let _ = app.emit(
            "telemetry",
            json!({
                "cpuTemp": null, "gpuTemp": null, "gpuLoad": null, "vramUsedMb": null, "vramTotalMb": null,
                "fps": null, "avgFps": null, "fpsMin": null, "fps1Low": null, "frametime": null, "fpsProcess": null, "presentEvents": null, "fpsPanel": null, "fgName": null, "fgFullscreen": null,
                "cpuClock": null, "gpuClock": null, "cpuPower": null, "gpuPower": null, "vramTemp": null, "fanRpm": null
            }),
        );
        set_sensor_status(&app, json!({ "state": "stopped" }));
    });
}

pub fn run() {
    tauri::Builder::default()
        // İkinci kopya açılmaz (otomatik başlatılmışken kısayola tıklanırsa); mevcut panel öne gelir.
        // İki kopya iki sensör yardımcısı ve çakışan ETW oturumu demek olurdu.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        // Genel kısayollar arayüzden (ana pencere) kaydedilir: Ayarlar → Klavye kısayolları.
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // Oyunlar sayfasında "Dosyadan seç" (.exe) için.
        .plugin(tauri_plugin_dialog::init())
        // Kritik sıcaklık bildirimi (Uygulama ayarları'ndan kapatılabilir).
        .plugin(tauri_plugin_notification::init())
        // Güncelleme: GitHub Releases'teki latest.json (tauri.conf.json → plugins.updater). Paketler
        // %USERPROFILE%\.tauri\cpo-updater.key ile imzalanır; imzası tutmayan paket kurulmaz.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(Sensors::default())
        .manage(usage::UsageState::default())
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            set_overlay_locked,
            set_overlay_visible,
            quit_app,
            sensor_status,
            get_autostart,
            set_autostart,
            window_info,
            running_apps,
            self_usage,
            helper_command,
            save_session,
            list_sessions,
            get_session,
            delete_session,
            write_csv,
            set_tray_labels
        ])
        .setup(|app| {
            // Ana pencere kodda oluşturulur: Mica için şeffaflık oluşturma anında verilmeli ve
            // sonradan değiştirilemez. Windows 10'da şeffaf pencerenin arkası boş görüneceği için
            // orada düz (aurora gradyanlı) arka plan kalır.
            migrate_config_dir(app.handle());
            let mica = is_windows_11();
            app.manage(WindowInfo { mica });
            let mut main = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("showFPS")
                .inner_size(1000.0, 700.0)
                .min_inner_size(820.0, 560.0)
                .decorations(false) // başlık çubuğu arayüzde çizilir
                .visible(false);
            if mica {
                main = main.transparent(true).effects(
                    EffectsBuilder::new().effect(Effect::Mica).state(EffectState::FollowsWindowActiveState).build(),
                );
            }
            main.build()?;

            // Metinler arayüz dili seçilince set_tray_labels ile değişir.
            let show = MenuItem::with_id(app, "show", "Kontrol panelini aç", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            app.manage(TrayItems { show: show.clone(), quit: quit.clone() });
            let mut tray = TrayIconBuilder::new()
                .tooltip("showFPS")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => {
                        // Süren oturum kaydı kaydedilsin: panel kaydı yazıp quit_app çağırır.
                        // Panel cevap vermezse (donmuş vb.) 2 sn sonra yine de çık.
                        let _ = app.emit_to("main", "app-quit-requested", ());
                        let app = app.clone();
                        thread::spawn(move || {
                            thread::sleep(Duration::from_secs(2));
                            app.exit(0);
                        });
                    }
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            // Ana pencere gizli oluşturulur (tauri.conf.json); otomatik başlatmada gizli kalır,
            // böylece yalnızca overlay ve tepsi simgesi görünür.
            if !std::env::args().any(|a| a == autostart::AUTOSTART_ARG) {
                show_main(app.handle());
            }
            autostart::refresh_path_if_enabled();

            spawn_system_sampler(app.handle().clone());
            spawn_sensor_helper(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Tauri uygulaması başlatılamadı")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(mut c) = app.state::<Sensors>().child.lock().unwrap().take() {
                    // Önce stdin'i kapat: yardımcı ETW oturumunu kapatıp kendisi çıksın.
                    // Doğrudan öldürülürse oturum sistemde açık kalır.
                    drop(c.stdin.take());
                    for _ in 0..20 {
                        if matches!(c.try_wait(), Ok(Some(_))) {
                            return;
                        }
                        thread::sleep(Duration::from_millis(50));
                    }
                    let _ = c.kill();
                }
            }
        });
}
