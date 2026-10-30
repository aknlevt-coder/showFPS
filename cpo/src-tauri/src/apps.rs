//! Açık uygulamalar: Oyunlar sayfasındaki "Açık uygulamalardan seç" listesi.
//! Görev çubuğunda görünecek türden pencereleri olan süreçler listelenir; kabuk ve sistem pencereleri atlanır.

use std::collections::HashMap;

use serde::Serialize;
use windows_sys::Win32::{
    Foundation::{CloseHandle, HWND, LPARAM},
    Graphics::Dwm::DwmGetWindowAttribute,
    System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION},
    UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowLongPtrW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
        GWL_EXSTYLE, GW_OWNER, WS_EX_TOOLWINDOW,
    },
};

#[derive(Serialize, Clone)]
pub struct RunningApp {
    /// Süreç adı: küçük harf, .exe'siz (oyun eşleşme anahtarıyla aynı biçim).
    exe: String,
    title: String,
    path: String,
}

/// Oyun olamayacak kabuk/sistem pencereleri.
const SKIP: &[&str] = &[
    "explorer", "applicationframehost", "textinputhost", "shellexperiencehost", "searchhost",
    "startmenuexperiencehost", "systemsettings", "lockapp", "widgets", "msedgewebview2",
    // Uygulamanın kendisi: kurulu sürüm showFPS.exe, dev ve 0.1.13'e kadarki sürümler custom-performance-overlay.exe.
    "showfps", "custom-performance-overlay",
];
const DWMWA_CLOAKED: u32 = 14;

unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> i32 {
    let out = &mut *(lparam as *mut Vec<(u32, String)>);
    // Görünür, sahipsiz, araç penceresi olmayan ve gizlenmemiş (cloaked: arka plandaki UWP) pencereler.
    if IsWindowVisible(hwnd) == 0 || !GetWindow(hwnd, GW_OWNER).is_null() {
        return 1;
    }
    if (GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32) & WS_EX_TOOLWINDOW != 0 {
        return 1;
    }
    let mut cloaked: u32 = 0;
    DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut cloaked as *mut u32 as *mut _, 4);
    if cloaked != 0 {
        return 1;
    }
    let mut buf = [0u16; 256];
    let n = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
    if n <= 0 {
        return 1;
    }
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, &mut pid);
    out.push((pid, String::from_utf16_lossy(&buf[..n as usize])));
    1
}

fn exe_path(pid: u32) -> Option<String> {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return None;
        }
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut len);
        CloseHandle(h);
        (ok != 0).then(|| String::from_utf16_lossy(&buf[..len as usize]))
    }
}

/// Süreç başına bir kayıt (ilk/ana pencere başlığıyla), başlığa göre sıralı.
pub fn running_apps() -> Vec<RunningApp> {
    let mut windows: Vec<(u32, String)> = Vec::new();
    unsafe { EnumWindows(Some(collect), &mut windows as *mut _ as LPARAM) };

    let own = std::process::id();
    let mut by_pid: HashMap<u32, RunningApp> = HashMap::new();
    for (pid, title) in windows {
        if pid == own || by_pid.contains_key(&pid) {
            continue;
        }
        let Some(path) = exe_path(pid) else { continue };
        let exe = std::path::Path::new(&path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if exe.is_empty() || SKIP.contains(&exe.as_str()) {
            continue;
        }
        by_pid.insert(pid, RunningApp { exe, title, path });
    }
    // Aynı uygulamanın birden çok süreci (ör. tarayıcı) tek satır olsun.
    let mut seen = std::collections::HashSet::new();
    let mut apps: Vec<RunningApp> = by_pid.into_values().filter(|a| seen.insert(a.exe.clone())).collect();
    apps.sort_by_key(|a| a.title.to_lowercase());
    apps
}

#[cfg(test)]
mod tests {
    /// `cargo test --lib apps -- --nocapture`: açık uygulamaları yazdırır, kabuk pencereleri olmamalı.
    #[test]
    fn lists_running_apps() {
        let apps = super::running_apps();
        for a in &apps {
            println!("{:<28} {}", a.exe, a.title);
            assert!(!super::SKIP.contains(&a.exe.as_str()));
        }
    }
}
