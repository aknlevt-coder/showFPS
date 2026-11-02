// LibreHardwareMonitor yardımcı süreci.
// stdout'a satır başına bir JSON yazar:
//   {"type":"info", ...}  başlangıçta bir kez: yetki ve bulunan donanım/sensörler
//   {"type":"data", ...}  her saniye: bulunamayan değerler null (asla uydurulmaz)
// FPS: ön plan sürecinin DXGI/D3D9 Present olayları (ETW, yönetici ister; bkz. FpsTracker).
// stdin kapanınca (ana uygulama kapandı/çöktü) kendini sonlandırır.
using System.Security.Principal;
using System.Text.Json;
using System.Text.Json.Nodes;
using LibreHardwareMonitor.Hardware;
using LhmHelper;

// Teşhis: yönetici terminalde `lhm-helper.exe --fps-test` → 15 sn boyunca ETW'den gelenleri yazar.
// Teşhis: `lhm-helper.exe --list-sensors [--motherboard]` → tüm donanım sensörlerini değerleriyle yazar.
// Yeni bir donanımda hangi sensörün değer verdiğini görmek için (yönetici terminalde daha fazlası görünür).
if (args.Contains("--list-sensors"))
{
    Console.OutputEncoding = System.Text.Encoding.UTF8;
    var c = new Computer { IsCpuEnabled = true, IsGpuEnabled = true, IsMotherboardEnabled = args.Contains("--motherboard") };
    c.Open();
    for (int pass = 0; pass < 2; pass++) { foreach (var h in c.Hardware) { h.Update(); foreach (var sub in h.SubHardware) sub.Update(); } Thread.Sleep(1000); }
    void Dump(IHardware h, string indent)
    {
        Console.WriteLine($"{indent}[{h.HardwareType}] {h.Name}");
        foreach (var s in h.Sensors.OrderBy(s => s.SensorType).ThenBy(s => s.Name))
            Console.WriteLine($"{indent}  {s.SensorType,-12} {s.Name,-40} {(s.Value is float v ? v.ToString("0.##") : "—")}");
        foreach (var sub in h.SubHardware) Dump(sub, indent + "  ");
    }
    foreach (var h in c.Hardware) Dump(h, "");
    c.Close();
    return 0;
}

if (args.Contains("--fps-test"))
{
    Console.OutputEncoding = System.Text.Encoding.UTF8;
    using var test = new FpsTracker();
    Console.WriteLine(test.Error ?? "ETW oturumu açıldı. Oyuna geçin; 15 sn ölçülecek...");
    for (int i = 1; test.Error is null && i <= 15; i++)
    {
        Thread.Sleep(1000);
        var s = test.Take();
        Console.WriteLine($"[{i,2}] fps={s.Fps:F1} ft={s.Frametime:F2} | {test.Diagnose()}");
    }
    return 0;
}

var stdout = new StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true };
void Write(JsonObject o) { lock (stdout) stdout.WriteLine(o.ToJsonString()); }

// stdin: ana uygulamadan komutlar (satır başına bir). EOF = ana süreç gitti → çık.
//   "frames on" / "frames off": oturum kaydı ya da kare kare grafik için karelerin süresini gönder.
new Thread(() =>
{
    try
    {
        string? line;
        while ((line = Console.In.ReadLine()) != null)
        {
            if (line == "frames on") FpsTracker.FramesRequested = true;
            else if (line == "frames off") FpsTracker.FramesRequested = false;
        }
    }
    catch { }
    Environment.Exit(0);
}) { IsBackground = true }.Start();

var isAdmin = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);

// ETW oturumu süreç sonlanırken kapatılmalı; açık kalırsa sistem genelinde kaynak tutar.
// Ana uygulama kendi süreç kimliğini verir: panel ön plandayken FPS ölçülmez.
var ownerArg = Array.IndexOf(args, "--owner-pid");
var ownerPid = ownerArg >= 0 && ownerArg + 1 < args.Length && int.TryParse(args[ownerArg + 1], out var op) ? op : -1;
var fps = new FpsTracker(ownerPid);
AppDomain.CurrentDomain.ProcessExit += (_, _) => fps.Dispose();

// PawnIO sürücüsü (CPU sensörleri) hizmet olarak kurulur ve "elle başlat" türündedir. Yeni kurulmuş ya
// da yeniden başlatma bekleyen bir sistemde durmuş olabilir; LibreHardwareMonitor açılırken sürücüye
// bağlanamazsa CPU sıcaklığı hiç gelmez. Yönetici olduğumuz için açmadan önce başlatmayı deneriz.
var pawnInstalled = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\PawnIO") is not null;
string? pawnStart = null;
if (pawnInstalled && isAdmin && PawnIoState() != "RUNNING")
{
    pawnStart = RunSc("start PawnIO");
    for (int i = 0; i < 20 && PawnIoState() != "RUNNING"; i++) Thread.Sleep(100);
}

// sc.exe çıktısındaki durum: RUNNING, STOPPED, START_PENDING… (yerelleştirilmez).
static string? PawnIoState()
{
    var o = RunSc("query PawnIO");
    var m = System.Text.RegularExpressions.Regex.Match(o ?? "", @"\b(RUNNING|STOPPED|START_PENDING|STOP_PENDING|PAUSED)\b");
    return m.Success ? m.Value : null;
}

static string? RunSc(string arguments)
{
    try
    {
        var psi = new System.Diagnostics.ProcessStartInfo(Path.Combine(Environment.SystemDirectory, "sc.exe"), arguments)
        { RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true };
        using var pr = System.Diagnostics.Process.Start(psi)!;
        var text = pr.StandardOutput.ReadToEnd();
        pr.WaitForExit(5000);
        return text;
    }
    catch { return null; }
}

// Anakart: masaüstü fan hızları (SuperIO) için. Dizüstülerde genelde sensör yoktur.
var computer = new Computer { IsCpuEnabled = true, IsGpuEnabled = true, IsMotherboardEnabled = true };
try { computer.Open(); }
catch (Exception e)
{
    Write(new JsonObject { ["type"] = "error", ["message"] = $"Computer.Open başarısız: {e.Message}" });
    return 1;
}

void UpdateAll()
{
    foreach (var h in computer.Hardware)
    {
        h.Update();
        foreach (var sub in h.SubHardware) sub.Update();
    }
}

IEnumerable<ISensor> SensorsOf(IHardware h) => h.Sensors.Concat(h.SubHardware.SelectMany(s => s.Sensors));

static float? Valid(ISensor? s) => s?.Value is float v && float.IsFinite(v) ? v : null;

// İsim tercih sırasına göre ilk geçerli sensör.
static float? Pick(IEnumerable<ISensor> sensors, SensorType type, params string[] names)
{
    var list = sensors.Where(s => s.SensorType == type).ToList();
    foreach (var n in names)
    {
        var v = Valid(list.FirstOrDefault(s => s.Name.Equals(n, StringComparison.OrdinalIgnoreCase)));
        if (v is not null) return v;
    }
    return null;
}

// Harici GPU'yu tümleşiğe tercih et. AMD işlemcili dizüstülerde tümleşik "AMD Radeon(TM) Graphics"
// da GpuAmd türünde ve listede NVIDIA'dan önce gelebiliyor; onu seçince sıcaklık hiç gelmiyordu
// (tümleşik kartta sıcaklık sensörü yok) ve VRAM 1 GB görünüyordu. Sıra: NVIDIA (hep harici),
// sonra ayrılmış belleği en büyük olan (tümleşik kartlarda ~0,5–2 GB, harici kartlarda 4 GB+).
IHardware? MainGpu()
{
    float DedicatedMb(IHardware h) => SensorsOf(h)
        .Where(s => s.SensorType == SensorType.SmallData && s.Name is "GPU Memory Total" or "D3D Dedicated Memory Total")
        .Select(s => s.Value ?? 0).DefaultIfEmpty(0).Max();
    return computer.Hardware
        .Where(h => h.HardwareType is HardwareType.GpuNvidia or HardwareType.GpuAmd or HardwareType.GpuIntel)
        .OrderByDescending(h => h.HardwareType == HardwareType.GpuNvidia)
        .ThenByDescending(DedicatedMb)
        .FirstOrDefault();
}

UpdateAll();
var gpu = MainGpu();
Write(new JsonObject
{
    ["type"] = "info",
    ["isAdmin"] = isAdmin,
    ["gpu"] = gpu?.Name,
    ["fps"] = fps.Error ?? "ok",
    // LHM 0.9.5+ CPU sensörlerini PawnIO sürücüsüyle okur; kurulu değilse CPU sıcaklığı gelmez.
    ["pawnIO"] = pawnInstalled,
    // Kurulu ama çalışmıyorsa (çoğunlukla yeni kurulum, Windows yeniden başlatılmamış) panel bunu söyler.
    ["pawnIOState"] = pawnInstalled ? PawnIoState() : null,
    ["pawnIOStartTried"] = pawnStart is not null,
    ["cpu"] = computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.Cpu)?.Name,
    ["hardware"] = new JsonArray(computer.Hardware.Select(h => (JsonNode)new JsonObject
    {
        ["type"] = h.HardwareType.ToString(),
        ["name"] = h.Name,
        ["sensors"] = new JsonArray(SensorsOf(h)
            .Where(s => s.SensorType is SensorType.Temperature or SensorType.Load or SensorType.SmallData)
            .Select(s => (JsonNode)$"{s.SensorType}/{s.Name}").ToArray()),
    }).ToArray()),
});

var fpsErrReported = false;
while (true)
{
    Thread.Sleep(1000);
    try { UpdateAll(); }
    catch (Exception e) { Write(new JsonObject { ["type"] = "error", ["message"] = e.Message }); continue; }

    var cpu = computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.Cpu);
    float? cpuTemp = null, cpuClock = null, cpuPower = null;
    if (cpu is not null)
    {
        var cs = SensorsOf(cpu).ToList();
        cpuTemp = Pick(cs, SensorType.Temperature, "Core (Tctl/Tdie)", "CPU Package", "Core (Tdie)", "Core (Tctl)", "Core Average", "Core Max")
            // "Distance to TjMax" da Temperature tipinde ama sıcaklık değil, kalan pay.
            ?? cs.Where(s => s.SensorType == SensorType.Temperature && !s.Name.Contains("Distance")).Select(Valid).Max();
        // En hızlı çekirdek (anlık turbo); "Bus Speed" saat hızı değil, taban frekans.
        cpuClock = cs.Where(s => s.SensorType == SensorType.Clock && s.Name.Contains("Core")).Select(Valid).Max();
        cpuPower = Pick(cs, SensorType.Power, "CPU Package", "Package");
    }

    float? gpuTemp = null, gpuLoad = null, vramUsed = null, vramTotal = null, gpuClock = null, gpuPower = null, vramTemp = null;
    if (gpu is not null)
    {
        var gs = SensorsOf(gpu).ToList();
        gpuTemp = Pick(gs, SensorType.Temperature, "GPU Core", "GPU Hot Spot");
        gpuLoad = Pick(gs, SensorType.Load, "GPU Core", "D3D 3D");
        vramUsed = Pick(gs, SensorType.SmallData, "GPU Memory Used", "D3D Dedicated Memory Used");
        vramTotal = Pick(gs, SensorType.SmallData, "GPU Memory Total", "D3D Dedicated Memory Total");
        gpuClock = Pick(gs, SensorType.Clock, "GPU Core");
        gpuPower = Pick(gs, SensorType.Power, "GPU Package", "GPU Power", "GPU Core");
        vramTemp = Pick(gs, SensorType.Temperature, "GPU Memory Junction", "GPU Memory");
    }

    // En hızlı fan (GPU ya da anakart). 0 RPM gerçek olabilir (boştayken fanı duran kartlar): NonZero uygulanmaz.
    float? fan = computer.Hardware.SelectMany(SensorsOf).Where(s => s.SensorType == SensorType.Fan).Select(Valid).Max();

    // Değerler 0 ise (sensör var ama okunamıyor) de gerçek değer gibi davranmayalım.
    static float? NonZero(float? v) => v is > 0 ? v : null;

    var f = fps.Take();
    if (fps.RuntimeError is { } fpsErr && !fpsErrReported)
    {
        fpsErrReported = true;
        Write(new JsonObject { ["type"] = "error", ["message"] = fpsErr });
    }
    // Ön plan bilgisi (yönetici gerektirmez): kendi panelimiz ön plandaysa adı gönderilmez.
    var fg = Foreground.Get();
    bool fgSelf = fg.Pid == ownerPid;
    Write(new JsonObject
    {
        ["type"] = "data",
        ["fgName"] = fgSelf ? null : fg.Name,
        ["fgFullscreen"] = !fgSelf && fg.Fullscreen,
        ["fps"] = f.Fps,
        ["avgFps"] = f.AvgFps,
        ["fpsMin"] = f.FpsMin,
        ["fps1Low"] = f.Fps1Low,
        ["frametime"] = f.Frametime,
        ["fpsProcess"] = f.Process,
        ["presentEvents"] = f.Events,
        // Yalnız istenince (kayıt/kare grafiği): son satırdan beri ölçülen sürecin kare süreleri (ms).
        ["frames"] = FpsTracker.FramesRequested ? new JsonArray(fps.TakeFrames().Select(x => (JsonNode)Math.Round(x, 2)).ToArray()) : null,
        ["fpsPanel"] = f.PanelForeground,
        ["cpuTemp"] = NonZero(cpuTemp),
        ["gpuTemp"] = NonZero(gpuTemp),
        ["gpuLoad"] = gpuLoad,
        ["vramUsedMb"] = vramUsed,
        ["vramTotalMb"] = NonZero(vramTotal),
        // 0 W / 0 MHz yetkisiz okumadır (ör. CPU gücü PawnIO + yönetici ister): değer yok sayılır.
        ["cpuClock"] = NonZero(cpuClock),
        ["cpuPower"] = NonZero(cpuPower),
        ["gpuClock"] = NonZero(gpuClock),
        ["gpuPower"] = NonZero(gpuPower),
        ["vramTemp"] = NonZero(vramTemp),
        ["fanRpm"] = fan,
    });
}
