// Ön plandaki uygulamanın FPS/frametime ölçümü.
// PresentMon ile aynı ETW sağlayıcılarını dinler: Microsoft-Windows-DXGI ve Microsoft-Windows-D3D9
// Present_Start olayları (DirectX 9/10/11/12 ve DXGI üzerinden sunan Vulkan/OpenGL).
// ETW oturumu yönetici yetkisi veya "Performance Log Users" üyeliği ister.
using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Diagnostics.Tracing;
using Microsoft.Diagnostics.Tracing.Parsers;
using Microsoft.Diagnostics.Tracing.Session;

namespace LhmHelper;

sealed class FpsTracker : IDisposable
{
    // Sabit ad: süreç öldürülüp oturum açık kalırsa bir sonraki başlatma onu devralıp yeniden kurar.
    const string SessionName = "CustomPerfOverlay-FPS";
    static readonly Guid DxgiProvider = new("CA11C036-0102-4A2D-A6AD-F03CFED5D3C9");
    static readonly Guid D3d9Provider = new("783ACA0A-790E-4D7F-8451-AA850511C6B9");
    const int DxgiPresentStart = 42, DxgiPresentMpoStart = 55, D3d9PresentStart = 1;
    const int DxgiPresentTest = 0x1; // DXGI_PRESENT_TEST: görüntü üretmez, sayılmaz

    readonly TraceEventSession? _session;
    readonly object _lock = new();
    // pid → son birkaç saniyenin Present zaman damgaları (ms, oturuma göreli) ve son olay alım anı.
    readonly Dictionary<int, (List<double> ts, long lastSeen)> _presents = new();

    // Odaktaki süreç için birikimli istatistikler (odak değişince sıfırlanır).
    int _focusPid = -1;
    double _lastProcessedTs;
    double _sumMs;
    long _count;
    readonly List<double> _intervals = new(); // %1 düşük için, en fazla MaxIntervals
    double? _minFps;
    const int MaxIntervals = 20000;
    readonly Dictionary<int, string> _names = new();
    long _totalPresents; // teşhis: ETW'den gelen toplam Present olayı
    // teşhis: iki sağlayıcıdan gelen tüm olaylar ("DXGI/42" → adet) ve süreç başına Present sayısı
    readonly Dictionary<string, long> _byEvent = new();
    readonly Dictionary<int, long> _presentsByPid = new();

    public string? Error { get; }

    /// stdin "frames on/off" ile değişir. Açıkken her Take'te yeni kare süreleri biriktirilir.
    public static volatile bool FramesRequested;
    readonly List<double> _newFrames = new();
    const int MaxPendingFrames = 5000; // saniyede bir boşaltılır; 5000 FPS'e kadar yeter

    /// Son çağrıdan beri ölçülen sürecin kare süreleri (ms); listeyi boşaltır.
    public List<double> TakeFrames()
    {
        lock (_lock)
        {
            var copy = new List<double>(_newFrames);
            _newFrames.Clear();
            return copy;
        }
    }
    /// Olay okuma iş parçacığı hata ile biterse dolar (oturum açılmış ama olay gelmiyor demektir).
    public volatile string? RuntimeError;

    /// Uygulamanın kendi süreci: kontrol paneli ön plandayken ölçüm yapılmaz (panelin FPS'i anlamsız).
    readonly int _ownerPid;

    public FpsTracker(int ownerPid = -1)
    {
        _ownerPid = ownerPid;
        try
        {
            // Varsayılan 64 MB çekirdek tamponu; saniyede birkaç yüz Present olayı için 8 MB fazlasıyla yeter.
            _session = new TraceEventSession(SessionName) { StopOnDispose = true, BufferSizeMB = 8 };
            _session.EnableProvider(DxgiProvider, TraceEventLevel.Verbose);
            _session.EnableProvider(D3d9Provider, TraceEventLevel.Verbose);
            // Manifesti çözümlenen olaylar parser.All'a, çözümlenemeyenler UnhandledEvents'e düşer;
            // ikisi ayrık kümelerdir, Present sayımı için yalnızca sağlayıcı GUID'i ve olay ID'si gerekir.
            var parser = new RegisteredTraceEventParser(_session.Source);
            parser.All += OnEvent;
            _session.Source.UnhandledEvents += OnEvent;
            new Thread(() =>
            {
                try { _session.Source.Process(); }
                catch (Exception e) { RuntimeError = $"ETW olay okuma hatası: {e.GetType().Name}: {e.Message}"; }
            }) { IsBackground = true }.Start();
        }
        catch (Exception e)
        {
            _session?.Dispose();
            _session = null;
            Error = e is UnauthorizedAccessException
                ? "ETW için yönetici yetkisi gerekli"
                : $"ETW oturumu açılamadı: {e.Message}";
        }
    }

    void OnEvent(TraceEvent e)
    {
        int id = (int)e.ID;
        bool dxgi = e.ProviderGuid == DxgiProvider;
        if (!dxgi && e.ProviderGuid != D3d9Provider) return;
        lock (_lock)
        {
            var key = $"{(dxgi ? "DXGI" : "D3D9")}/{id}";
            _byEvent[key] = _byEvent.GetValueOrDefault(key) + 1;
        }
        bool present =
            (e.ProviderGuid == DxgiProvider && (id == DxgiPresentStart || id == DxgiPresentMpoStart)) ||
            (e.ProviderGuid == D3d9Provider && id == D3d9PresentStart);
        if (!present) return;
        if (e.ProviderGuid == DxgiProvider && FlagsOf(e) is int f && (f & DxgiPresentTest) != 0) return;
        Record(e.ProcessID, e.TimeStampRelativeMSec);
    }

    void Record(int pid, double t)
    {
        lock (_lock)
        {
            if (!_presents.TryGetValue(pid, out var p)) p = (new List<double>(), 0);
            p.ts.Add(t);
            // 5 saniyeden eski damgaları at.
            int drop = 0;
            while (drop < p.ts.Count && p.ts[drop] < t - 5000) drop++;
            if (drop > 0) p.ts.RemoveRange(0, drop);
            _presents[pid] = (p.ts, Environment.TickCount64);
            _totalPresents++;
            _presentsByPid[pid] = _presentsByPid.GetValueOrDefault(pid) + 1;
        }
    }

    /// --fps-test için tek satırlık teşhis özeti.
    public string Diagnose()
    {
        if (_session is null) return $"oturum yok: {Error}";
        int fg = ForegroundPid();
        lock (_lock)
        {
            var ev = string.Join(" ", _byEvent.OrderByDescending(x => x.Value).Take(8).Select(x => $"{x.Key}={x.Value}"));
            var top = string.Join(" ", _presentsByPid.OrderByDescending(x => x.Value).Take(5)
                .Select(x => $"{NameOf(x.Key) ?? "?"}({x.Key})={x.Value}"));
            int m = ResolvePresenter(fg);
            return $"ön plan={NameOf(fg) ?? "?"}({fg}) → ölçülen={NameOf(m) ?? "?"}({m}) | present toplam={_totalPresents} | olaylar: {(ev == "" ? "YOK" : ev)} | süreçler: {(top == "" ? "YOK" : top)}"
                + (RuntimeError is { } r ? $" | HATA: {r}" : "");
        }
    }

    static int? FlagsOf(TraceEvent e)
    {
        try { return Convert.ToInt32(e.PayloadByName("Flags")); } catch { return null; }
    }

    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

    static int ForegroundPid()
    {
        var h = GetForegroundWindow();
        if (h == IntPtr.Zero) return -1;
        GetWindowThreadProcessId(h, out var pid);
        return (int)pid;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct ProcessEntry32
    {
        public uint dwSize, cntUsage, th32ProcessID;
        public IntPtr th32DefaultHeapID;
        public uint th32ModuleID, cntThreads, th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
    }
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr snap, ref ProcessEntry32 e);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr snap, ref ProcessEntry32 e);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

    static Dictionary<int, int> ParentMap()
    {
        var map = new Dictionary<int, int>();
        var snap = CreateToolhelp32Snapshot(0x2 /* TH32CS_SNAPPROCESS */, 0);
        if (snap == new IntPtr(-1)) return map;
        try
        {
            var e = new ProcessEntry32 { dwSize = (uint)Marshal.SizeOf<ProcessEntry32>() };
            for (bool ok = Process32FirstW(snap, ref e); ok; ok = Process32NextW(snap, ref e))
                map[(int)e.th32ProcessID] = (int)e.th32ParentProcessID;
        }
        finally { CloseHandle(snap); }
        return map;
    }

    const long StaleMs = 4000;
    bool Fresh(int pid) => _presents.TryGetValue(pid, out var p) && Environment.TickCount64 - p.lastSeen <= StaleMs;

    /// Ön plan süreci kare göndermiyorsa kareleri onun bir alt süreci gönderiyor olabilir:
    /// Chromium/Electron/WebView2 uygulamaları çizimi ayrı bir GPU sürecinde yapar.
    /// Bu durumda kare gönderen en yakın (en fazla 4 nesil) alt süreç ölçülür. _lock altında çağrılır.
    int ResolvePresenter(int fg)
    {
        if (Fresh(fg)) return fg;
        var fresh = _presents.Keys.Where(Fresh).ToList();
        if (fresh.Count == 0) return fg;
        var parents = ParentMap();
        int best = fg, bestCount = 0;
        foreach (var pid in fresh)
        {
            int cur = pid;
            for (int depth = 0; depth < 4 && parents.TryGetValue(cur, out var parent) && parent != 0 && parent != cur; depth++)
            {
                if (parent == fg)
                {
                    int c = _presents[pid].ts.Count;
                    if (c > bestCount) (best, bestCount) = (pid, c);
                    break;
                }
                cur = parent;
            }
        }
        return best;
    }

    string? NameOf(int pid)
    {
        if (_names.TryGetValue(pid, out var n)) return n;
        try { n = Process.GetProcessById(pid).ProcessName; } catch { return null; }
        _names[pid] = n;
        return n;
    }

    /// Process: ölçülen (ön plan) süreç; değer olmasa da teşhis için doldurulur. Events: toplam Present olayı.
    /// PanelForeground: ön planda kontrol paneli var, ölçüm bilerek yapılmadı.
    public record Sample(double? Fps, double? AvgFps, double? FpsMin, double? Fps1Low, double? Frametime, string? Process, long? Events, bool PanelForeground = false);

    /// Saniyede bir çağrılır. Ön plan süreci Present yapmıyorsa tüm değerler null.
    /// ETW tamponları gecikmeli boşaltılabildiği için 4 sn olay gelmezse "bayat" sayılır.
    public Sample Take()
    {
        if (_session is null) return new Sample(null, null, null, null, null, null, null);

        int fg = ForegroundPid();
        long events;
        lock (_lock) events = _totalPresents;
        if (fg == _ownerPid) return new Sample(null, null, null, null, null, null, events, PanelForeground: true);
        var empty = new Sample(null, null, null, null, null, NameOf(fg), events);
        int pid;
        List<double> ts;
        lock (_lock)
        {
            pid = ResolvePresenter(fg);
            if (pid != _focusPid) ResetFocus(pid);
            if (!Fresh(pid)) return empty;
            ts = new List<double>(_presents[pid].ts);
        }
        if (ts.Count < 2) return empty;

        // Son 1 saniye: anlık FPS ve frametime.
        double last = ts[^1];
        int first = ts.FindIndex(x => x >= last - 1000);
        if (first > 0) first--; // pencerenin başındaki aralığı da dahil et
        int n = ts.Count - 1 - first;
        if (n < 1) return empty;
        double frametime = (last - ts[first]) / n;
        double fps = 1000 / frametime;

        // Odak süresince birikimli: ortalama, en düşük saniyelik FPS, %1 düşük (99. yüzdelik frametime).
        for (int i = 1; i < ts.Count; i++)
        {
            if (ts[i] <= _lastProcessedTs || ts[i - 1] < _lastProcessedTs) continue;
            double d = ts[i] - ts[i - 1];
            _sumMs += d;
            _count++;
            _intervals.Add(d);
            if (FramesRequested && _newFrames.Count < MaxPendingFrames) lock (_lock) _newFrames.Add(d);
        }
        _lastProcessedTs = last;
        if (_intervals.Count > MaxIntervals) _intervals.RemoveRange(0, _intervals.Count - MaxIntervals);
        _minFps = _minFps is null ? fps : Math.Min(_minFps.Value, fps);

        double? avg = _count > 0 ? 1000 / (_sumMs / _count) : null;
        double? low1 = null;
        if (_intervals.Count >= 20)
        {
            var sorted = _intervals.OrderBy(x => x).ToList();
            low1 = 1000 / sorted[(int)Math.Floor(0.99 * (sorted.Count - 1))];
        }
        return new Sample(fps, avg, _minFps, low1, frametime, NameOf(pid), events);
    }

    void ResetFocus(int pid)
    {
        _focusPid = pid;
        // Yalnızca odaklandıktan sonraki kareler sayılır.
        _lastProcessedTs = _presents.TryGetValue(pid, out var p) && p.ts.Count > 0 ? p.ts[^1] : 0;
        _sumMs = 0;
        _count = 0;
        _intervals.Clear();
        _minFps = null;
    }

    public void Dispose() => _session?.Dispose();
}
