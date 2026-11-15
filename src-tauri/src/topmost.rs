//! Tam ekran oyunlarda overlay'i oyunun üstünde tutar.
//!
//! Overlay "her zaman üstte" bir penceredir; ama oyun tam ekrana geçerken kendini öne alır ve çoğu
//! zaman o da en üst katmana (HWND_TOPMOST) girer. Aynı katmanda en son öne gelen üstte kalır: overlay
//! oyunun arkasında kalıyor, görünmüyordu. Windows 10/11'in tam ekran iyileştirmesi (varsayılan açık)
//! tam ekran oyunun üstünde başka pencerelere izin verir; yeter ki sırada üstte olsunlar. Bu yüzden ön
//! plandaki pencere ekranını tamamen kapladığı sürece overlay saniyede bir yeniden en üste alınır.
//! Gerçek "özel tam ekran" (fullscreen optimizations kapalı) modunda hiçbir pencere görünemez; o
//! durumda oyunu kenarlıksız (borderless) moda almak gerekir.

use std::{thread, time::Duration};

use tauri::{AppHandle, Manager};
use windows_sys::Win32::{
    Foundation::{HWND, RECT},
    Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST},
    UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowRect, IsWindowVisible, SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOOWNERZORDER, SWP_NOSIZE,
    },
};

/// Pencere bulunduğu ekranın tamamını kaplıyor mu (tam ekran ya da kenarlıksız tam ekran)?
fn covers_monitor(hwnd: HWND) -> bool {
    unsafe {
        let mut r: RECT = std::mem::zeroed();
        if GetWindowRect(hwnd, &mut r) == 0 {
            return false;
        }
        let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(mon, &mut mi) == 0 {
            return false;
        }
        let m = mi.rcMonitor;
        r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
    }
}

pub fn spawn(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(1000));
        let Some(w) = app.get_webview_window("overlay") else { continue };
        let Ok(h) = w.hwnd() else { continue };
        let overlay = h.0 as HWND;
        unsafe {
            if IsWindowVisible(overlay) == 0 {
                continue;
            }
            let fg = GetForegroundWindow();
            if fg.is_null() || fg == overlay || !covers_monitor(fg) {
                continue;
            }
            // Odak çalmadan, konum/boyut değiştirmeden yalnız sırayı en üste al.
            SetWindowPos(overlay, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER);
        }
    });
}
