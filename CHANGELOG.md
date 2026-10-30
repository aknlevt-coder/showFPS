# Değişiklikler

`npm run release` bu dosyadaki sürüm başlığının altını güncelleme notu olarak kullanır (`latest.json` → `notes`).
Yeni sürümden önce en üste `## <sürüm>` başlığıyla ekleyin.

## 0.1.17

- PawnIO sürücüsü artık kurulumla birlikte geliyor: bilgisayarda yoksa showFPS kurulurken sessizce kurulur, CPU sıcaklığı için ayrıca bir şey yapmak gerekmez. Zaten kuruluysa dokunulmaz; showFPS kaldırılınca PawnIO kalır (başka uygulamalar da kullanabilir).
- Paneldeki "PawnIO'yu kur" düğmesi yedek olarak kaldı; indirmek yerine kurulumla gelen dosyayı kullanır.
- Hakkında'ya PawnIO (GPL-2.0) lisans bildirimi eklendi.

## 0.1.16

- CPU sıcaklığı için gereken PawnIO sürücüsü eksikse Veri kaynakları kartında ve ilk açılış rehberinde "PawnIO'yu kur" düğmesi: resmi kurulum dosyası indirilir, yayıncı imzası doğrulanır, kurulum penceresi açılır; ardından sensörler yeniden başlatılır.
- Kritik sıcaklık bildirimi artık varsayılan olarak kapalı; ilk açılış tercihlerinin hepsi kapalı gelir.

## 0.1.15

İlk herkese açık sürüm.

- FPS, frametime, %1 / %0,1 düşük (ETW), CPU/GPU sıcaklık ve kullanım, RAM, VRAM, saat hızı, güç, fan.
- Özelleştirilebilir overlay: 5 düzen, hazır temalar, 9 ekran konumu, uyarı renkleri, kare kare frametime grafiği.
- Oyun algılama, yalnızca oyundayken göster, oyuna göre profil.
- Oturum kaydı ve rapor (grafikler, CSV); varsayılan kapalı.
- Kritik sıcaklık bildirimi, genel kısayollar, Windows ile başlatma, uygulama içi güncelleme.
- Türkçe ve İngilizce arayüz, ilk açılış rehberi.
- Program Files'a kurulum; eski "Custom Performance Overlay" kurulumu ve ayarları otomatik taşınır.
- Güvenlik: otomatik başlatma görevi diske geçici dosya yazmadan oluşturulur, CSV yalnız kullanıcının seçtiği dosyaya yazılır, sıkı içerik güvenlik politikası (CSP).
