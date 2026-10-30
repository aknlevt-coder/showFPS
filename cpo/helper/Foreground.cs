// Ön plandaki uygulama ve tam ekran olup olmadığı. Yönetici gerektirmez (ETW'den bağımsız).
// Arayüz "oyunda mı?" kararını bununla verir (yalnızca oyundayken göster, oyuna göre profil).
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace LhmHelper;

static class Foreground
{
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor, rcWork; public uint dwFlags; }

    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);

    // Masaüstü ve görev çubuğu da ekranı kaplar; oyun sayılmamalı.
    static readonly HashSet<string> ShellClasses = new() { "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd" };
    static readonly Dictionary<int, string> Names = new();

    public record Info(int Pid, string? Name, bool Fullscreen);

    public static Info Get()
    {
        var h = GetForegroundWindow();
        if (h == IntPtr.Zero) return new Info(-1, null, false);
        GetWindowThreadProcessId(h, out var upid);
        int pid = (int)upid;

        var cls = new StringBuilder(64);
        GetClassName(h, cls, cls.Capacity);
        bool fullscreen = false;
        if (!ShellClasses.Contains(cls.ToString()) && !IsIconic(h) && GetWindowRect(h, out var r))
        {
            var mi = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
            if (GetMonitorInfo(MonitorFromWindow(h, 2 /* MONITOR_DEFAULTTONEAREST */), ref mi))
            {
                var m = mi.rcMonitor;
                fullscreen = r.Left <= m.Left && r.Top <= m.Top && r.Right >= m.Right && r.Bottom >= m.Bottom;
            }
        }
        return new Info(pid, NameOf(pid), fullscreen);
    }

    static string? NameOf(int pid)
    {
        if (Names.TryGetValue(pid, out var n)) return n;
        try { n = Process.GetProcessById(pid).ProcessName; } catch { return null; }
        if (Names.Count > 512) Names.Clear(); // pid'ler yeniden kullanılır; sınırsız büyümesin
        Names[pid] = n;
        return n;
    }
}
