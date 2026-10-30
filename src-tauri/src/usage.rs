//! Uygulamanın kendi tüketimi: ana süreç + sensör yardımcısı + WebView2 süreçleri (süreç ağacı).
//! Panel açıkken birkaç saniyede bir istenir; panel gizliyken hiç çalışmaz.
//! RAM, Görev Yöneticisi'nin "Bellek" sütunuyla aynı ölçüdür: özel çalışma kümesi.

use std::{collections::HashSet, sync::Mutex};

use serde::Serialize;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use windows_sys::Win32::{
    Foundation::CloseHandle,
    System::{
        ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX2},
        Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION},
    },
};

/// CPU yüzdesi iki ölçüm arasındaki farktan hesaplanır; System bu yüzden çağrılar arasında yaşar.
pub struct UsageState(Mutex<System>);

impl Default for UsageState {
    fn default() -> Self {
        Self(Mutex::new(System::new()))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfUsage {
    mem_mb: f64,
    /// Tüm işlemciye oranla (%); ilk çağrıda 0.
    cpu: f32,
    processes: usize,
}

fn private_ws(pid: u32) -> usize {
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return 0;
        }
        let mut c: PROCESS_MEMORY_COUNTERS_EX2 = std::mem::zeroed();
        c.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX2>() as u32;
        let ok = GetProcessMemoryInfo(h, &mut c as *mut _ as *mut PROCESS_MEMORY_COUNTERS, c.cb);
        CloseHandle(h);
        if ok != 0 { c.PrivateWorkingSetSize } else { 0 }
    }
}

pub fn self_usage(state: &UsageState) -> SelfUsage {
    let mut sys = state.0.lock().unwrap();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::new().with_cpu());

    // Kendi sürecimizden başlayıp çocuklarını (yardımcı, WebView2 ve onların çocukları) topla.
    let own = Pid::from_u32(std::process::id());
    let mut tree: HashSet<Pid> = HashSet::from([own]);
    loop {
        let before = tree.len();
        for (pid, p) in sys.processes() {
            if p.parent().is_some_and(|pp| tree.contains(&pp)) {
                tree.insert(*pid);
            }
        }
        if tree.len() == before {
            break;
        }
    }

    let cores = std::thread::available_parallelism().map(|n| n.get() as f32).unwrap_or(1.0);
    let mut cpu = 0.0;
    let mut mem = 0usize;
    for pid in &tree {
        if let Some(p) = sys.process(*pid) {
            cpu += p.cpu_usage(); // tek çekirdeğe oranla
        }
        mem += private_ws(pid.as_u32());
    }
    SelfUsage { mem_mb: mem as f64 / (1024.0 * 1024.0), cpu: cpu / cores, processes: tree.len() }
}
