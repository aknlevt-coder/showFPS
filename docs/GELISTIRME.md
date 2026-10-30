# showFPS — geliştirici notları

Kullanıcıya yönelik tanıtım için kökteki [README](../README.md). Elle test adımları: [TEST-REHBERI.md](TEST-REHBERI.md). Sürüm notları: [CHANGELOG.md](../CHANGELOG.md).

(0.1.13'e kadar adı "Custom Performance Overlay" idi; 0.1.14'e kadar proje depoda `cpo/` alt klasöründeydi.)

Tauri 2 + Rust + React/TypeScript + Vite. Windows 10/11 için özelleştirilebilir performans overlay'i.

## Geliştirme ortamı (Windows)
1. Node.js 20+, Rust (rustup, MSVC toolchain + "Desktop development with C++") ve .NET 10 SDK kurun. WebView2 Windows 11'de hazır gelir.
2. `npm install`
3. `npm run build:helper` — sensör yardımcısını (`helper/`) derleyip `src-tauri/binaries/` altına koyar. **`tauri dev`'den önce gereklidir**; yoksa Rust derlemesi sidecar dosyası bulunamadı hatası verir.
4. Tarayıcıda arayüz denemesi (demo veriyle): `npm run dev` → `http://localhost:1420` ve ikinci sekmede `http://localhost:1420/#/overlay`
5. Masaüstü uygulaması: `npm run tauri dev`
6. Kurulum paketi (NSIS): `npm run release` — sürümü artırır (`package.json`, patch), imzalı güncelleme dosyalarıyla derler ve yayınlanacak dosyaları `release/v<sürüm>/` altına koyar (bkz. Güncelleme). Derleme yarıda kalırsa aynı sürümü `node scripts/release.mjs --no-bump` ile yeniden deneyin. Yardımcı otomatik derlenir.

## Durum (dürüst özet)
| Aşama | Durum |
|---|---|
| 2 Frontend (düzenleyici, canlı önizleme, 5 düzen, profil, tema) | Derleniyor, Tauri içinde çalıştı |
| 3 Tauri entegrasyonu (2 pencere, tepsi) | Doğrulandı (tepsi menüsü yönetici yetkili kurulan sürümde de çalışıyor) |
| 4 Overlay (üstte kalma, şeffaflık, kilit = tıklama geçirgenliği, konum geri yükleme) | Windows 11'de doğrulandı; fareyle sürükleme elle test edilmedi |
| 5 Kalıcılık (app config dizininde `state.json`, atomik yazım) | Doğrulandı |
| 6 Donanım: CPU kullanımı + RAM (sysinfo) | Doğrulandı |
| 6 Donanım: GPU sıcaklık/kullanım, VRAM (LibreHardwareMonitor 0.9.6, `helper/`) | NVIDIA'da yöneticisiz doğrulandı; AMD/yalnız Intel GPU test edilmedi |
| 6 Donanım: CPU sıcaklığı | Yönetici + PawnIO sürücüsü ister. PawnIO kurulu + yönetici modunda doğrulandı (63 °C) |
| 7 FPS, ortalama, min, %1 düşük, frametime (ETW, `helper/FpsTracker.cs`) | Hesaplama sahte verilerle test edildi; yöneticisiz durum mesajı doğrulandı. Yönetici modunda `--fps-test` ile gerçek veriyle doğrulandı (Brave: 230–300 FPS). Release exe UAC ile açılıp overlay'de doğrulandı (Electron uygulaması, kareleri alt GPU sürecinden: 194 FPS / 5.2 ms). Kurulan sürümle oyunda doğrulandı |
| 8 Paketleme (NSIS) | `npm run tauri build` başarılı: `src-tauri/target/release/bundle/nsis/Custom Performance Overlay_0.1.0_x64-setup.exe` (~35 MB, yardımcı dahil). Kurulum paketi kuruldu, kurulan uygulama UAC ile açılıp tüm göstergeler doğrulandı |

Demo verisi yalnızca "Uygulama ayarları → Demo verisi" açıkken kullanılır ve overlay'de **DEMO** etiketi çıkar.

## Sensör yardımcısı (`helper/`)
.NET 10, tek dosya (~38 MB, .NET kurulumu gerekmez). Tauri sidecar olarak ana exe'nin yanına `lhm-helper.exe` adıyla kopyalanır. Her saniye stdout'a bir JSON satırı yazar (`{"type":"data","gpuTemp":…}`); okunamayan değer `null`'dur. stdin kapanınca kendini sonlandırır; ayrıca uygulama çıkarken öldürülür. Süreç ölürse değerler "—"ye döner ve panelde durum gösterilir.

## FPS ölçümü
PresentMon'un kullandığı ETW sağlayıcıları (Microsoft-Windows-DXGI ve D3D9 `Present_Start`) yardımcı içinde TraceEvent ile dinlenir; ayrı bir PresentMon exe'si gerekmez. Ölçülen süreç **ön plandaki pencerenin sürecidir**; odak değişince birikimli değerler sıfırlanır. Ön plan süreci kendisi kare göndermiyorsa (Chromium/Electron/WebView2 uygulamaları çizimi ayrı GPU sürecinde yapar), kare gönderen en yakın alt süreç (en fazla 4 nesil) ölçülür.
- **FPS / frametime:** son 1 saniyedeki Present aralıklarının ortalaması.
- **Ortalama:** odaklanıldığından beri tüm karelerin ortalaması.
- **Min:** odaklanıldığından beri en düşük saniyelik FPS.
- **%1 düşük:** son en fazla 20 000 karenin 99. yüzdelik frametime'ı (en az 20 kare gerekir).
- Bu değer uygulamanın Present çağrı hızıdır (PresentMon'daki MsBetweenPresents); ekrana gerçekten çıkan kare hızı (MsBetweenDisplayChange) değildir.
- DXGI ya da D3D9 kullanmayan sunumlar (DXGI katmanı olmadan çalışan Vulkan/OpenGL) sayılmaz.
- ETW oturumu (`CustomPerfOverlay-FPS`) yönetici yetkisi ister. Uygulama yönetici olarak çalışmazsa panelde bu yazar, overlay'de "—" görünür.
- 4 saniye kare gelmezse değerler "—"ye döner (ETW tamponları gecikmeli boşaltılabilir).
- Teşhis: yönetici terminalde `helper\publish\lhm-helper.exe --fps-test` 15 sn boyunca gelen ETW olaylarını ve süreçleri yazar.

## Bilinen riskler
- CPU sıcaklığı için iki şart var: uygulama yönetici olarak çalışmalı **ve PawnIO sürücüsü kurulu olmalı** (https://pawnio.eu). LHM 0.9.6 CPU'yu yalnızca PawnIO ile okur, eski WinRing0 desteği kaldırılmıştır. Panel, PawnIO eksikse bunu ayrıca gösterir.
- Tam ekran (exclusive) oyunlarda pencere overlay'i görünmeyebilir; kenarlıksız pencereli modda çalışması beklenir.
- Hem CPU sıcaklığı hem FPS (ETW) için uygulamanın yönetici olarak çalışması gerekir (ETW için Performance Log Users üyeliği de yeterli olabilir).
- Uygulama zorla sonlandırılırsa ETW oturumu açık kalabilir; bir sonraki başlatma aynı adla oturumu yeniden kurar.
- İki pencere de `state.json`'a yazar (kontrol paneli ayarları, overlay konumu); son yazan kazanır.

## Paketleme notları
- Simge kaynağı `src-tauri/icons/source/app-icon.svg`. Değiştirince `npm run icons`: Windows simgelerini (tauri icon), panel logosunu (`public/app-icon.svg`) ve kurulum görsellerini (`installer-header.bmp`, `installer-sidebar.bmp`; Edge başsız modla) yeniden üretir.
- Kurulum Türkçe ve İngilizce; Windows dili Türkçe ise Türkçe açılır.
- Sürümün tek kaynağı `package.json`: `tauri.conf.json` oradan okur, panel derlemede gömer (`__APP_VERSION__`).
- Ayarlar → Hakkında: kullanılan açık kaynak bileşenler ve lisansları (LibreHardwareMonitor MPL-2.0 olduğu için kaynak adresi belirtilir).
- Kurulum **Program Files'a, tüm kullanıcılar için** yapılır (`perMachine`, kurulum UAC ister); WebView2 yoksa önyükleyici indirilir.
- 0.1.11 ve öncesi kullanıcı klasörüne (`%LOCALAPPDATA%`) kuruluyordu. Yeni kurulum eskisini bulursa sessizce kaldırır (`src-tauri/windows/hooks.nsh`, `NSIS_HOOK_PREINSTALL`): ayarlar, oturumlar ve otomatik başlatma görevi korunur, eski kısayollar silinir. Görevin exe yolunu uygulama ilk açılışta günceller.
- Release exe'si `requireAdministrator` manifestiyle derlenir (`src-tauri/app-admin.manifest`, `build.rs`): kurulan uygulama **her açılışta UAC sorar**, böylece FPS ve CPU sıcaklığı çalışır. Yöneticisiz başlatma 740 "yükseltme gerekli" ile reddedilir (doğrulandı).
- Dev derlemesine (`npm run tauri dev`) manifest eklenmez; yöneticisiz terminalden açılır, FPS/CPU sıcaklığı için terminali yönetici olarak açın.
- `app-admin.manifest` saf ASCII kalmalı: Türkçe karakterli yorum, gömülü manifesti bozup exe'yi SideBySide 14001 hatasıyla açılmaz yapıyordu.
- Kurulan uygulama UAC ile açılıyor; tamamen kapatıp kısayoldan yeniden açma ve tepsi menüsü doğrulandı.
- Kimlik (`identifier`) 0.1.13'ten beri `io.github.aknlevt-coder.showfps`; ayarlar `%APPDATA%\io.github.aknlevt-coder.showfps\` altında. Eski klasör (`com.example.customperformanceoverlay`) ilk açılışta oraya taşınır (`migrate_config_dir`, birim testli); yenisinde ayar varsa dokunulmaz.

## Tasarım: Aurora
- Yazı tipi Manrope (gömülü, OFL-1.1, `@fontsource-variable/manrope`); yarı saydam yüzeyler ve simgedeki mavi→mor gradyan vurgular (`src/styles.css`).
- Ana pencere Rust'ta oluşturulur (`lib.rs`, `tauri.conf.json`'da yalnız overlay var). Windows 11'de (derleme 22000+) şeffaf + Mica; Windows 10'da şeffaflık açılmaz, aurora gradyan zemin kullanılır. Arayüz `window_info` ile öğrenir (`html.mica`).
- Pencere kenarlıksızdır; başlık çubuğu arayüzde (`src/panel/TitleBar.tsx`). Kapat düğmesi "tepsiye in" ayarına uyar; Alt+F4 de aynı kuralı izler.
- Genel bakışta kadranlı kartlar uyarı eşiklerine göre renk ve "Uyarı/Kritik" etiketi alır. Yeni kurulumların overlay teması "Aurora"; eski varsayılan "Klasik" adıyla durur.
- Gerçek pencerede doğrulandı: Mica algılama, başlık düğmeleri (küçült, büyüt/geri, kapat → tepsi). Pencere kenarından fareyle yeniden boyutlandırma ve açık tema Mica görünümü elle denenmedi.

## Ek sensörler ve bildirim
- CPU saat hızı (en hızlı çekirdek), GPU saat hızı, CPU/GPU gücü, GPU bellek sıcaklığı (Memory Junction), fan (en hızlı; GPU ya da anakart). 0 W / 0 MHz yetkisiz okuma sayılır ("—"); fan 0 RPM gerçek olabilir. CPU değerleri yönetici + PawnIO ister. Anakart taraması masaüstü fanları için açık (maliyeti ölçüldü: ~1 MB, ihmal edilebilir CPU).
- Teşhis: `lhm-helper.exe --list-sensors [--motherboard]` tüm sensörleri değerleriyle yazar.
- Bildirimler (`src/criticalAlerts.ts`, `tauri-plugin-notification`): Uyarı eşikleri tablosunda satır başına "Bildirim" anahtarı (varsayılan yalnız sıcaklıklarda açık). Kritik eşik 10 sn aralıksız aşılınca (FPS'te altına inince; boştaki uygulamada FPS yok sayılır), aynı gösterge için en sık 5 dk'da bir. Eşik tanımları tek kaynakta: `ALERT_INFO` (`src/metrics.ts`). Uygulama ayarları: ana anahtar ve "Test bildirimi gönder".
- Eşik yok: saat hızı ve fan (iyi/kötü yönü donanıma göre değişir). Güç eşikleri varsayılan kapalı.

## Kaynak tüketimi
Ölçüm: panel gizli (tepsi), yalnız overlay; yönetici yetkili; ana süreç + yardımcı + WebView2 süreç ağacı, özel çalışma kümesi, 20 sn ortalama. 24 çekirdekli işlemci.

| Sürüm | RAM | CPU (tüm işlemciye oranla) |
|---|---|---|
| 0.1.4 | 305 MB | %2,41 (≈ bir çekirdeğin %58'i) |
| 0.1.5 | 192–196 MB | %0,15–0,18 (≈ bir çekirdeğin %4'ü) |

- Gizli panel çizilmez (`src/panel/visibility.ts`): Tauri gizlemeyi WebView2'ye bildirmiyordu, sayfa her saniye yeniden çiziliyordu.
- Yardımcı: tek dosya sıkıştırması kapalı (açılışta belleğe açılıyordu), eşzamanlı GC ve dinamik PGO kapalı, DATAS açık (`helper/LhmHelper.csproj`): 70 → 46 MB, CPU %0,06 → %0,02 (yöneticisiz tek başına ölçüm). ReadyToRun denendi, fayda yok.
- ETW oturum tamponu 64 → 8 MB (çekirdek belleği; süreç satırında görünmez).
- Panel → Genel bakış → Veri kaynakları: "Bu uygulamanın tüketimi" (`src-tauri/src/usage.rs`), yalnız o sayfa açıkken 5 sn'de bir.
- Yan etki: kurulum paketi 35 → 27 MB (sıkıştırılmamış yardımcıyı NSIS daha iyi sıkıştırıyor).

## Oyun algılama ve otomatik profil
- Yardımcı her saniye ön plandaki süreç adını ve pencerenin monitörü tamamen kaplayıp kaplamadığını gönderir (`helper/Foreground.cs`, yönetici gerektirmez; masaüstü/görev çubuğu hariç).
- "Oyun": profile bağlı bir uygulama ya da tam ekran + kare üreten (FPS ölçümü yoksa yalnızca tam ekran) uygulama. Girişte 2 sn, çıkışta 3 sn beklenir (`src/automation.ts`, saf karar fonksiyonu `decide`).
- Yalnızca oyundayken göster: overlay = ana anahtar VE (oyunda | panel ön planda).
- Oyunlar sayfası: kayıtlı oyunlar (`AppState.games`: exe, görünen ad, profil). Ekleme: açık uygulamalardan seç (`src-tauri/src/apps.rs`: görünür, sahipsiz, araç/gizli olmayan pencereleri olan süreçler; kabuk ve sistem pencereleri hariç), dosyadan seç (.exe, `tauri-plugin-dialog`), elle. Kayıtlı oyun pencere modunda da oyun sayılır; profili seçiliyse o profile geçilir, çıkınca elle seçilen (temel) profile dönülür. 0.1.2'deki `profile.games` listeleri bu listeye taşınır.
- Bilinen sınır: tarayıcıda tam ekran video da oyun sayılır.

## Overlay temaları
- 16 hazır tema, 4 kategori (`src/panel/themes.ts`). Tema renkleri, gösterge paletini, yazı tipini (Manrope / Bahnschrift / Cascadia Mono) ve köşe yuvarlaklığını değiştirir; yerleşim ve açık göstergeler korunur.
- Bahnschrift ve Cascadia Mono Windows'ta yüklüdür; yoksa Arial Narrow / Consolas kullanılır.

## Overlay konumu
- Genel bakış → Ekran konumu: 3×3 hazır konum ve kenar boşluğu. Hazır konum köşeye yapışıktır: overlay büyüyünce o kenara hizalı kalır (`src/overlay/placement.ts`).
- Fareyle sürüklenince "Özel konum"a geçer. Her durumda overlay bulunduğu monitörün çalışma alanında (görev çubuğu hariç) tutulur; ekrandan taşan kısım bırakınca içeri alınır. Kayıtlı monitör çıkarılmışsa mevcut monitöre taşınır.
- Doğrulandı (2560×1440, %125 ölçek): 9 konum, gösterge eklenince hizalama ve kurulu sürümde gerçek fareyle ekran dışına sürükleme. Birden fazla monitörde denenmedi.

## Klavye kısayolları
- Varsayılan: `Ctrl+Shift+O` overlay'i gösterir/gizler, `Ctrl+Shift+L` kilitler/kilidi açar, `Ctrl+Alt+R` oturum kaydını başlatır/bitirir (`Ctrl+Shift+R` tarayıcılarda sert yenileme olduğu için seçilmedi). Uygulama ayarları → Klavye kısayolları'ndan değiştirilebilir ya da kapatılabilir.
- Genel kısayollardır (`tauri-plugin-global-shortcut`): oyun ön plandayken ve kontrol paneli gizliyken de çalışır. Kaydı kontrol paneli penceresi yapar (`src/hotkeys.ts`).
- Başka bir uygulama aynı kısayolu tutuyorsa ayarlarda hata gösterilir. Değiştirici tuşsuz kısayol kabul edilmez (F1–F24 hariç), aynı kısayol iki eyleme atanamaz.
- Sistem düzeyinde tuş basımıyla doğrulandı (dev sürümü, yöneticisiz).

## Oturum kaydı ve rapor
- Otomatik kayıt varsayılan olarak **kapalıdır** (her kullanıcı istemeyebilir); Ayarlar → "Oyun oturumlarını otomatik kaydet" ya da ilk açılış rehberinden açılır. Açıksa oyun algılanınca kayıt başlar, oyundan çıkınca biter. `Ctrl+Alt+R` ile her zaman elle başlatılabilir.
- Yalnızca sayılar tutulur (ekran, ses, tuş kaydı yok) ve hiçbir şey bilgisayardan dışarı gönderilmez. Kayıt sürerken overlay'de "● KAYIT mm:ss" görünür.
- Saniyede bir örnek (FPS, frametime, sıcaklıklar, kullanım, güç) ve kayıt boyunca her karenin süresi tutulur. Yardımcı kare listesini yalnızca istendiğinde gönderir (`frames on/off`, stdin; kayıt ya da frametime grafiği açıkken).
- Rapor (`src/session.ts`): ortalama FPS = kare / süre; %1 ve %0,1 düşük = 1000 / kare süresinin 99. ve 99,9. yüzdeliği; takılma = medyanın 2,5 katından uzun kare.
- Dosyalar: `%APPDATA%\com.example.customperformanceoverlay\sessions\<id>.json` (+ `.summary.json` liste için). Son 50 oturum tutulur, 30 sn'den kısalar kaydedilmez. CSV dışa aktarma `;` ayraçlı ve ondalık virgüllü (Türkçe Excel).
- Doğrulama: yönetici modunda yardımcı "frames on" sonrası saniyede ~240 kare süresi gönderdi; özet hesabı sentetik verilerle test edildi; Oturumlar listesi, rapor grafikleri, KAYIT rozeti ve 30 sn sınırı dev sürümünde denendi. Gerçek bir oyunla uzun oturum henüz denenmedi.

## İlk açılış rehberi
- `src/panel/Welcome.tsx`: 4 adımlı karşılama (tanıtım, ölçüm durumu, tercihler, kısayollar). Ayarlar anında uygulanır; "Atla" da seçimleri korur.
- `app.onboarded` false iken panel açılınca çıkar (önceki sürümden yükseltenlerde de bir kez). Uygulama ayarları → "Rehberi yeniden göster".
- `--autostart` ile gizli açılışta çizilmez; panel ilk açıldığında görünür.
- Tarayıcı önizlemesinde adımlar, Atla, "Oyunlarımı ekle" ve yeniden gösterme denendi.

## Windows ile başlatma
- Kurulu sürümde yeniden başlatmayla doğrulandı.
- Ayar: Uygulama ayarları → "Windows açılınca başlat". Kaynak `state.json` değil, Görev Zamanlayıcı'daki `showFPS` görevidir (eski adlı `Custom Performance Overlay` görevi ilk açılışta yeni ada taşınır) (`src-tauri/src/autostart.rs`).
- Uygulama yönetici istediği için Run anahtarı kullanılamaz (Windows yükseltme isteyen girişleri oturum açılışında atlar). Görev "en yüksek yetkiyle" çalışır: oturum açılışından 10 sn sonra **UAC sormadan** başlar.
- Görev ayarları: pildeyken de başlar, 72 saatlik süre sınırı kapalı.
- `--autostart` ile başlatılınca kontrol paneli gizli açılır; overlay ve tepsi simgesi görünür.
- Tek kopya: uygulama açıkken kısayola tıklanırsa yeni kopya açılmaz, mevcut panel öne gelir (`tauri-plugin-single-instance`).
- Kaldırıcı görevi siler (`src-tauri/windows/hooks.nsh`); güncellemede (`/UPDATE`) korunur. Görev yönetici yetkisiyle oluşturulduğu için kaldırıcı silerken bir kez UAC sorabilir.
- Bilinen sınır: kullanıcı adında Türkçe karakter varsa uygulama görev yolunu her açılışta gereksiz yere yeniden kaydeder (schtasks çıktısı sistem kod sayfasında); işlev bozulmaz.
- Güvenlik notu: görev exe'yi UAC sormadan yönetici olarak çalıştırır. 0.1.12'den beri exe Program Files'ta (yalnız yönetici yazabilir), bu yüzden kullanıcı yetkisindeki bir program onu değiştirip yetki yükseltemez. Eski sürümlerde (`%LOCALAPPDATA%`) bu risk vardı.

## Ad ve logo (0.1.14)
- Görünen ad, kurulum klasörü (`C:\Program Files\showFPS`), exe (`showFPS.exe`, `mainBinaryName`) ve Başlat menüsü kısayolu "showFPS". Rust paket adı (`custom-performance-overlay`) iç ad olarak kaldı.
- Logo: çerçeveli S (`src-tauri/icons/source/app-icon.svg`); köşeler overlay'in ekran köşelerine yerleşimini anımsatır. `npm run icons` tüm ikonları ve kurulum görsellerini üretir.
- Kurulum eski adlı kurulumu bulursa kaldırır: kullanıcı klasöründeki (0.1.11 ve öncesi, HKCU) ya da Program Files'taki (0.1.12–0.1.13, HKLM). Ayarlar, oturumlar ve otomatik başlatma korunur; eski kısayollar silinir (`hooks.nsh` → `REMOVE_OLD_INSTALL`).

## Dil
- Arayüz Türkçe ve İngilizce (`src/i18n.ts`). Metinler yerinde çift olarak yazılır: `L("Kaydet", "Save")`; modül düzeyindeki listeler getter kullanır ki dil değişince güncellensin.
- İlk açılışta Windows diline göre seçilir (Türkçe değilse İngilizce); Uygulama ayarları ve rehberin ilk adımında "Dil / Language".
- Tepsi menüsü de çevrilir (`set_tray_labels`). Bildirimler, CSV başlıkları ve ayraç (Türkçe `;` + ondalık virgül, İngilizce `,` + nokta) dile göre.
- Önceden oluşturulmuş profil adları (ör. "Genel kullanım") kullanıcı verisidir, çevrilmez; yeni kurulumda varsayılan profiller seçilen dilde adlanır.

## Güncelleme
- `tauri-plugin-updater`: açılıştan 15 sn sonra sessizce, ayrıca Ayarlar → Hakkında → "Güncellemeleri denetle". Yeni sürüm varsa panelde şerit çıkar; kurulum uygulamayı kapatıp yeni sürümü açar (oturum kaydı sürerken düğme kapalı).
- Adres: `tauri.conf.json → plugins.updater.endpoints` = `https://github.com/aknlevt-coder/showFPS/releases/latest/download/latest.json`. Depoda henüz sürüm yokken denetim "bulunamadı" hatası verir.
- Paketler bir anahtarla imzalanır; uygulama yalnız bu anahtarla imzalı paketi kurar. Özel anahtar depo dışında: `%USERPROFILE%\.tauri\cpo-updater.key` (parolasız). **Kaybolursa kurulu uygulamalar yeni sürümü kabul etmez; yedekleyin.** Açık anahtar `tauri.conf.json`'da.
- Yayın: `npm run release` → `release/v<sürüm>/` içinde `showFPS_<sürüm>_x64-setup.exe` ve `latest.json`. github.com/aknlevt-coder/showFPS → Releases → Draft a new release → etiket `v<sürüm>` (ör. `v0.1.15`) → iki dosyayı sürükle → Publish release. Etiket adı `latest.json`'daki adresle aynı olmalı.
- Güncelleme notu `CHANGELOG.md`'deki `## <sürüm>` bölümünden alınır; bölüm yoksa `npm run release` derlemeden önce durur.
- Doğrulanan: imzalı `.sig` ve `latest.json` üretimi. Uçtan uca güncelleme (GitHub'dan indirip kurma) henüz denenmedi.

## Kod imzalama
- `bundle.windows.signCommand` → `scripts/sign.mjs`: uygulama, yardımcı, kurulum ve kaldırıcı exe'leri için çağrılır. Sertifika yoksa imzalamadan geçer (SmartScreen "tanınmayan uygulama" uyarısı kalır).
- Sertifika alınınca yalnız ortam değişkeni yeter: `.pfx` için `CPO_SIGN_PFX` + `CPO_SIGN_PFX_PASSWORD`; Azure Trusted Signing için `CPO_SIGN_AZURE_DLIB` + `CPO_SIGN_AZURE_METADATA` (Windows SDK'daki signtool kullanılır).
- Sertifikasız yol denendi (derleme imzasız geçiyor); gerçek sertifikayla imzalama denenmedi.

## Güvenlik
Uygulama her zaman yönetici yetkisiyle çalışır (FPS için ETW, CPU sıcaklığı için sürücü). Bu yüzden arayüzün ve yardımcı araçların yapabildikleri bilerek daraltıldı:
- **Kurulum yeri:** Program Files (yalnız yönetici yazabilir). Otomatik başlatma görevi exe'yi UAC sormadan yönetici olarak açtığı için exe'nin kullanıcı yetkisiyle değiştirilemeyen bir yerde olması gerekir.
- **Otomatik başlatma görevi** (`src-tauri/src/autostart.rs`): görev tanımı diske yazılmaz; PowerShell `Register-ScheduledTask` ile `-EncodedCommand` üzerinden verilir. Önceden Temp'e yazılan XML, okunmadan önce yetkisiz bir program tarafından değiştirilip yönetici görevi olarak kaydettirilebilirdi. `schtasks.exe` ve `powershell.exe` System32'den tam yolla çağrılır (PATH'teki sahte bir exe çalışmasın). Kayıt yolu `cargo test -- --ignored` ile gerçek Görev Zamanlayıcı'da denenir.
- **Dosya yazma:** arayüz diske yol vererek yazamaz. CSV dışa aktarmada kaydetme penceresini Rust açar (`export_csv`); yalnız kullanıcının seçtiği dosyaya yazılır. Oturum kimlikleri harf, rakam ve tire ile sınırlı (`sessions.rs` → `check_id`).
- **PawnIO kurulumu:** PawnIO GPL-2.0; resmi imzalı kurulum değiştirilmeden pakete girer (`scripts/fetch-pawnio.mjs` derlemede indirir ve imzasını doğrular, `bundle.resources`). Kurulum, sürücü yoksa `PawnIO_setup.exe -install -silent` çalıştırır (`hooks.nsh` → `NSIS_HOOK_POSTINSTALL`; 3010 = yeniden başlatma gerekli). Kaldırıcı PawnIO'yu silmez. Panelden elle kurulum (`src-tauri/src/pawnio.rs`) pakettekini kullanır, yoksa (dev) `github.com/namazso/PawnIO.Setup` son sürümünü indirip uygulama klasörüne (Program Files) yazar; Authenticode imzası geçerli ve imzalayan `CN=namazso.eu, O=namazso` değilse çalıştırılmaz. Kurulum penceresi kullanıcıya gösterilir, sonra dosya silinir ve sensör yardımcısı yeniden başlatılır. Testler: Microsoft imzalı dosya reddedilir, resmi dosya kabul edilir (`cargo test -- --ignored`, ağ ister).
- **Yardımcıya komut:** yalnız `frames on` / `frames off` geçer (`helper_command`).
- **İçerik güvenlik politikası (CSP):** yalnız uygulamanın kendi dosyaları; satır içi betik, `eval`, dış adres yok. `freezePrototype` açık. Geliştirme sunucusunda (`devCsp: null`) uygulanmaz.
- **İzinler** (`src-tauri/capabilities`): overlay penceresi yalnız kendi boyutunu/konumunu değiştirebilir ve sürüklenebilir; panel izinleri ayrı. Kaydetme penceresi izni (`dialog:allow-save`) kaldırıldı.
- **Güncelleme:** yalnız HTTPS ve imza doğrulamalı (minisign). Özel anahtar depo dışında; `.gitignore` `*.key`, `*.pfx`, `.env` dosyalarını dışarıda tutar.
- **Bağımlılıklar:** `npm audit` temiz (vite 6.4.5). Rust tarafı için `cargo audit` kurulu değil, denenmedi.
- Bilinen sınır: `.pfx` ile imzalarken parola signtool'a komut satırından geçer (aynı bilgisayardaki süreç listesinde görünebilir); yalnız derleme bilgisayarını ilgilendirir.

## Sonraki adım
- İlk GitHub sürümünü yayımlamak (0.1.15), sonraki sürümle uçtan uca güncellemeyi denemek.
- İsteğe bağlı: kod imzalama sertifikası, `cargo audit`, derlemeyi denetleyen GitHub Actions iş akışı.
