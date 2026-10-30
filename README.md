<p align="center">
  <img src="public/app-icon.svg" width="96" height="96" alt="showFPS">
</p>

<h1 align="center">showFPS</h1>

<p align="center">
  Windows 10/11 için oyun içi FPS ve sistem performansı overlay'i<br>
  <sub>In-game FPS and system performance overlay for Windows 10/11 · <a href="#english">English below</a></sub>
</p>

---

## Özellikler

- **FPS, frametime, %1 ve %0,1 düşük**: kare kare ölçüm (ETW; PresentMon'un kullandığı kaynak). Ayrı bir program gerekmez.
- **Donanım**: CPU/GPU sıcaklığı ve kullanımı, RAM, VRAM, saat hızları, güç tüketimi, fan (LibreHardwareMonitor).
- **Özelleştirilebilir overlay**: 5 düzen, 15+ hazır tema, renkler, yazı tipi, mini grafik, 9 ekran konumu, uyarı renkleri.
- **Oyun algılama**: tam ekran oyunlar kendiliğinden algılanır; "yalnızca oyundayken göster" ve oyuna göre profil.
- **Oturum kaydı ve rapor**: oyun boyunca FPS, sıcaklık ve kullanım; grafikler ve CSV dışa aktarma. İsteğe bağlıdır, varsayılan kapalı.
- **Kritik sıcaklık bildirimi**, genel kısayollar, Windows ile başlatma, otomatik güncelleme.
- **Türkçe ve İngilizce** arayüz.
- **Gizlilik**: hiçbir veri internete gönderilmez. Tek ağ isteği, GitHub'daki yeni sürüm denetimidir.

## Kurulum

1. [Releases](https://github.com/aknlevt-coder/showFPS/releases/latest) sayfasından `showFPS_<sürüm>_x64-setup.exe` dosyasını indirip çalıştırın.
2. Windows SmartScreen "tanınmayan uygulama" derse **Ek bilgi → Yine de çalıştır** (paket henüz kod imzalı değil).
3. Uygulama her açılışta yönetici izni (UAC) ister: FPS ölçümü ve sensörler bunu gerektirir. "Windows ile başlat" açıksa açılışta UAC sorulmaz.

**CPU sıcaklığı** için ücretsiz [PawnIO](https://pawnio.eu) sürücüsü gerekir; kurulu değilse diğer değerler yine çalışır.

Güncellemeler uygulamanın içinden gelir: **Uygulama ayarları → Hakkında → Güncellemeleri denetle**.

## Kısayollar (varsayılan)

| Kısayol | Eylem |
|---|---|
| `Ctrl + Shift + O` | Overlay'i göster / gizle |
| `Ctrl + Shift + L` | Kilitle / taşımak için kilidi aç |
| `Ctrl + Alt + R` | Oturum kaydını başlat / bitir |

Hepsi **Uygulama ayarları → Klavye kısayolları**'ndan değiştirilebilir.

## Geliştirme

Gerekenler: Node.js 20+, Rust (MSVC), .NET 10 SDK.

```bash
npm install
npm run build:helper   # sensör yardımcısını derler (ilk seferde gerekli)
npm run tauri dev      # geliştirme sürümü
npm run release        # sürümü artırır, kurulum paketini ve güncelleme dosyalarını release/ altına üretir
```

Ayrıntılar: [docs/GELISTIRME.md](docs/GELISTIRME.md) (mimari, ölçüm yöntemi, paketleme, güncelleme, güvenlik) ve [docs/TEST-REHBERI.md](docs/TEST-REHBERI.md) (elle test adımları).

Yapı:

```
src/            Arayüz (React + TypeScript): panel, overlay, oturum kaydı, dil
src-tauri/      Masaüstü uygulaması (Rust, Tauri 2): pencereler, tepsi, komutlar, kurulum ayarları
helper/         Sensör ve FPS yardımcısı (.NET): LibreHardwareMonitor + ETW
scripts/        Derleme, ikon, imzalama ve yayın betikleri
docs/           Geliştirici notları ve test rehberi
```

## Lisans

[MIT](LICENSE) © 2026 aknlevt-coder

Üçüncü taraf bileşenler: [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) (MPL-2.0, değiştirilmeden dağıtılır), [Microsoft TraceEvent](https://github.com/microsoft/perfview) (MIT), [Tauri](https://tauri.app) (MIT / Apache-2.0), [sysinfo](https://github.com/GuillaumeGomez/sysinfo) (MIT), [React](https://react.dev) (MIT), [Lucide](https://lucide.dev) (ISC).

---

## English

**showFPS** shows FPS, frametime, 1% / 0.1% lows, CPU/GPU temperatures and usage, RAM, VRAM, clocks, power and fan speed as a small, customizable strip on top of your game.

- Per-frame FPS measurement via ETW (the same source PresentMon uses); hardware sensors via LibreHardwareMonitor.
- 5 layouts, 15+ themes, 9 screen positions, alert colors, mini graph.
- Automatic game detection, "show only in game", per-game profiles.
- Optional session recording with charts and CSV export (off by default).
- Critical temperature notifications, global shortcuts, start with Windows, in-app updates.
- Turkish and English UI. No data is sent anywhere; the only network request is the update check against GitHub.

**Install:** download `showFPS_<version>_x64-setup.exe` from [Releases](https://github.com/aknlevt-coder/showFPS/releases/latest). The installer is not code-signed yet, so SmartScreen may warn: choose **More info → Run anyway**. The app asks for administrator rights (UAC) because FPS capture and sensors need them. CPU temperature needs the free [PawnIO](https://pawnio.eu) driver.

**License:** [MIT](LICENSE).
