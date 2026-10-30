# Test rehberi

Her sürümden sonra bu sırayla bakın. Her adımın yanında **ne görmeniz gerektiği** yazıyor; farklı bir şey görürseniz adımın numarasıyla ekran görüntüsü gönderin.

## 0. Hazırlık
1. Çalışan uygulamayı tepsi simgesinden **Çıkış** ile kapatın (görev çubuğundaki X yetmez, tepsiye iner).
2. `src-tauri\target\release\bundle\nsis\` klasöründeki **en yüksek sürüm numaralı** paketi kurun (ör. `showFPS_0.1.15_x64-setup.exe`). 0.1.12'den beri kurulum UAC ister ve Program Files'a kurar.
   Kurduktan sonra panelin sol altındaki sürümün aynı olduğuna bakın; üzerine gelince derleme tarihi görünür.
3. Başlat menüsünden açın, UAC'yi onaylayın.

## 1. Pencere ve tasarım
| Adım | Beklenen |
|---|---|
| Uygulama açılır | Windows'un gri başlığı yok; üstte simge + ad + üç düğme. Köşeler yuvarlak, pencerenin gölgesi var. |
| Arka plana bakın | Sol üstte mavi, sağda mor, altta eflatun hafif ışımalar. Düz gri değil. |
| Masaüstünüzde renkli bir duvar kâğıdı varken pencereyi sürükleyin | Pencere zemini duvar kâğıdının rengine hafifçe bürünür (Mica). |
| Görünüm ve tema → Tema: **Açık** | Lavanta tonlu zemin, beyaz yarı saydam kartlar. Aurora'nın asıl hali. Sonra tercih ettiğiniz temaya dönün. |
| Başlıkta çift tıklayın, sonra tekrar | Pencere tam ekran olur, sonra eski boyutuna döner. |
| Pencerenin sağ alt köşesinden sürükleyin | Pencere büyür/küçülür. En dar halinde kartlar 2 sütuna iner. |
| Başlıktaki X | Pencere kaybolur, tepsi simgesi kalır, overlay ekranda durur. |

## 2. Genel bakış kartları
| Adım | Beklenen |
|---|---|
| Veri kaynakları kartının en alt satırı | "Bu uygulamanın tüketimi: … MB RAM · %… işlemci · … süreç"; 5 sn'de bir güncellenir. Görev Yöneticisi'ndeki toplamla aynı büyüklükte olmalı. |
| Paneli açıp 10 sn bekleyin | Kartlardaki çizgiler soldan sağa tüm genişliği kaplar (sağ köşede kopuk parça yok). |
| Panel ön plandayken FPS kartı | "—" ve altında **"Panel ön planda — bir oyuna geçin"**. Kırmızı "Kritik" etiketi yok. |
| Bir tarayıcıyı ön plana alıp hiçbir şeye dokunmadan bekleyin, sonra panele bakın | FPS çok düşükse "boşta (ekran değişmiyor)" yazar, uyarı rengi yoktur. |
| Bir oyunu açıp 30 sn oynayın, sonra panele dönün | FPS kartının çizgisinde oyun sırasındaki değerler görünür; altında "ort … · %1 … · oyun adı". |
| Kadranlar | CPU/GPU kullanımı ve sıcaklık, RAM, VRAM kartlarında yay değerle birlikte yumuşakça döner. |

## 2b. Ek sensörler ve kritik sıcaklık bildirimi
| Adım | Beklenen |
|---|---|
| Genel bakış → **Ek sensörler** kartı | CPU/GPU saat hızı, CPU/GPU gücü, GPU bellek sıcaklığı, fan. Yönetici + PawnIO ile CPU değerleri dolu; fan dizüstünde "bu bilgisayarda okunamıyor" olabilir. |
| Sensör seçimi → yeni göstergelerden birini açın | Overlay'de görünür (saat hızı 1000 MHz üstünde GHz). |
| Uygulama ayarları → **Test bildirimi gönder** | Hemen bir Windows bildirimi gelir. Gelmezse altında nedeni yazar (izin / Rahatsız etme). |
| Sensör seçimi listesi | Değer gelmeyen göstergelerin yanında "şu an veri yok" (ör. Fan), FPS göstergelerinde oyun dışında "oyunda ölçülür". |
| Düzenleyici → Uyarı eşikleri → **CPU kullanımı** uyarı 5, kritik 10 (şu anki değerin **altı**) | Overlay'de CPU kullanımı kırmızı ve arkası vurgulu; Genel bakış kartında "Kritik". |
| **CPU sıcaklığı** kritik eşiğini şu anki sıcaklığın altına (ör. 40) çekin, 10 sn bekleyin | "CPU sıcaklığı kritik: … °C" Windows bildirimi; 5 dk boyunca tekrar gelmez. Sonra **Varsayılan eşikler**. |
| Uyarı eşikleri tablosu | GPU bellek sıcaklığı, CPU gücü ve GPU gücü satırları var (güç eşikleri başta boş = kapalı). |
| Uyarı eşikleri → **Bildirim** sütunu | Sıcaklıklarda açık, diğerlerinde kapalı. Kritik eşiği boş satırda ve ana anahtar kapalıyken devre dışı. Örn. FPS satırında açıp kritik eşiği oyundaki FPS'in üstüne (ör. 200) koyun: 10 sn sonra "FPS kritik" bildirimi. |
| Teşhis: yönetici terminalde `helperpublishlhm-helper.exe --list-sensors --motherboard` | Bilgisayardaki tüm sensörler değerleriyle listelenir. |

## 3. Overlay (oyun içinde)
| Adım | Beklenen |
|---|---|
| Oyunu açın | Overlay seçtiğiniz köşede; FPS ve frametime dolu. |
| `Ctrl+Shift+O` | Overlay gizlenir / tekrar görünür. |
| `Ctrl+Shift+L` | Kilit açılınca overlay'in etrafında kesik mavi çizgi çıkar, fareyle taşınabilir; tekrar basınca tıklamalar oyuna geçer. |
| Kilit açıkken overlay'i ekranın dışına sürükleyip bırakın | Hemen ekranın içine geri oturur. |
| Görünüm ve tema → **Aurora** temasını seçin | Overlay indigo cam zemine ve renkli değerlere geçer. |
| Görünüm ve tema → **Terminal**, sonra **Aurora** | Terminal'de yazı sabit genişlikli, köşeler keskin, göstergelerin hepsi yeşil olur; Aurora'ya dönünce renkler varsayılana döner. Seçili temada "Seçili" etiketi görünür. |
| Düzenleyici → Yazı ve ikon → **İkonları göster** kapatın | Overlay'deki ikonlar kaybolur, değerler birimleriyle kalır; İkon boyutu soluklaşır. Etiketler de kapalıysa sarı uyarı ve "Etiketleri aç" çıkar. Detaylı panel düzeninde etiketler solda, değerler sağda hizalı kalır. |

## 3b. Oyun algılama ve otomatik profil
| Adım | Beklenen |
|---|---|
| Genel bakış → Davranış kartının sağ üstü | Oyun yokken "Oyun yok". |
| **Yalnızca oyundayken göster**'i açın, paneli tepsiye indirin | Masaüstünde ve tarayıcıda overlay görünmez. |
| Tam ekran (ya da kenarlıksız tam ekran) bir oyun açın | ~2 sn sonra overlay görünür. Panele dönünce kartta "Oyunda: oyunadı". |
| Oyundayken Alt+Tab ile kısa süre masaüstüne çıkıp dönün | Overlay yanıp sönmez (çıkışta 3 sn beklenir). |
| Paneli öne getirin (oyun kapalıyken) | Ayarlarken görebilmeniz için overlay görünür. |
| Oyunu açın, Alt+Tab ile panele dönün → **Oyunlar** → **Açık uygulamalardan seç** | Açık uygulamalar pencere başlıklarıyla listelenir; Gezgin ve sistem pencereleri yoktur. Oyun en üstte "Son kullanılan" etiketiyle görünür. |
| Listede oyunun yanındaki **Ekle** | Oyun pencere başlığıyla "Kayıtlı oyunlar"a eklenir; listede "Kayıtlı" olur. Arama kutusu ve Yenile çalışır. |
| **Dosyadan seç (.exe)** ile başka bir oyunun exe'sini seçin | Windows dosya penceresi açılır; seçilen oyun listeye eklenir. |
| Listede bir oyunun **Kullanacağı profil** açılır listesinden profil seçin | Profiller sayfasında o profilin altında "· 1 oyun" yazar. |
| Profiller'de başka bir profili elle seçin, sonra o oyuna geçin | ~2 sn sonra oyunun profiline geçilir; listede oyunun yanında "Şu an açık". |
| Oyundan çıkın | ~3 sn sonra elle seçtiğiniz profile dönülür. |
| Bir oyunun profilini "Profil değiştirme" yapın | Oyun yine oyun sayılır (yalnızca oyundayken göster), profil değişmez. |
| 0.1.2'de profillere eklediğiniz oyunlar | Güncellemeden sonra Oyunlar listesinde, eski profilleriyle birlikte görünür. |

Not: Tarayıcıda tam ekran video da "oyun" sayılır.

## 3c. Oturum kaydı ve rapor
| Adım | Beklenen |
|---|---|
| Ayarlar'da **Oyun oturumlarını otomatik kaydet**'i açın (yeni kurulumda kapalı gelir) | — |
| Kayıtlı bir oyunu açıp en az 1 dakika oynayın | Overlay'de kırmızı "● KAYIT 00:42" sayacı görünür ve ilerler. |
| Oyundan çıkın, panel → **Oturumlar** | Oyun adıyla bir satır: süre, ortalama FPS, %1 düşük, en yüksek sıcaklıklar. |
| Satıra tıklayın | Rapor: ortalama / %1 / %0,1 düşük FPS, takılma sayısı, kare sayısı; FPS, kare kare frametime, sıcaklık ve kullanım grafikleri. Grafiğin üzerinde gezinince o anın değerleri görünür. |
| **Saniyelik CSV** / **Kare süreleri CSV** | Kaydetme penceresi açılır; dosya Excel'de Türkçe karakterler ve sütunlarla düzgün açılır. |
| Oyun dışında **Ctrl + Alt + R**, 40 sn bekleyip yine **Ctrl + Alt + R** | "Elle kayıt" adıyla oturum eklenir. 30 sn'den kısa denemeler kaydedilmez. |
| Kayıt sürerken tepsiden **Çıkış** | Oturum kaydedilip uygulama kapanır. |
| Profil → Overlay'de grafik "Frametime" | Oyunda grafik son ~3 sn'yi kare kare çizer; takılmalar sivri tepe olur. |

Notlar: Kare kare veri (%1 düşük, frametime) FPS ölçümü gibi yönetici yetkisi ister. Son 50 oturum saklanır. Türkçe klavyede sağ Alt (AltGr) Ctrl+Alt sayılabilir; bir uygulamayla çakışırsa kısayolu Ayarlar'dan değiştirin.

## 3d. İlk açılış rehberi
| Adım | Beklenen |
|---|---|
| 0.1.11'i kurup paneli açın | Karşılama penceresi "Adım 1 / 4" ile açılır (önceki sürümden gelenlerde de bir kez). |
| İleri ile adımları gezin | 2: veri kaynakları rozetleri (panelin Veri kaynakları kartıyla aynı). 3: tercihler; otomatik kayıt kapalı. 4: kısayollar. |
| 3. adımda bir seçeneği değiştirip **Atla** | Pencere kapanır; değiştirdiğiniz ayar Uygulama ayarları'nda da öyle görünür. |
| Uygulama ayarları → **Rehberi yeniden göster** → son adımda **Oyunlarımı ekle** | Rehber kapanır, Oyunlar sayfası açılır. |
| Uygulamadan çıkıp yeniden açın | Rehber bir daha çıkmaz. |

## 3e. Program Files kurulumu, ad, kimlik, dil ve güncelleme (0.1.15)
| Adım | Beklenen |
|---|---|
| 0.1.11 ya da 0.1.14 kuruluyken 0.1.15 paketini çalıştırın | Kurulum UAC ister. Çalışan uygulama kapatılır. Bittiğinde `C:\Program Files\showFPS\` oluşur, `%LOCALAPPDATA%\Custom Performance Overlay\` silinir. |
| Masaüstü / Başlat menüsü / görev çubuğu | Yeni mor "çerçeveli S" simgesi ve "showFPS" adı; eski "Custom Performance Overlay" kısayolu kalmaz. |
| Görev Zamanlayıcı (otomatik başlatma açıksa) | Uygulama bir kez açıldıktan sonra yalnız `showFPS` görevi var; `Custom Performance Overlay` görevi yok. |
| Ayarlar → Uygulamalar listesi | Uygulama **bir kez** görünür (eski kullanıcı kurulumu kalmaz). |
| Başlat menüsü / masaüstü | Tek kısayol, yeni konumu açar. |
| Uygulamayı açın | Ayarlar, profiller, oyunlar ve oturumlar aynen duruyor. `%APPDATA%\io.github.aknlevt-coder.showfps\` oluşmuş, `%APPDATA%\com.example.customperformanceoverlay\` kalmamış. |
| Windows ile başlat açıksa: bilgisayarı yeniden başlatın | Overlay yine UAC sormadan gelir (görev yeni yolu gösterir). |
| Uygulama ayarları → **Dil / Language** → English | Panel anında İngilizce olur; tepsi menüsü "Open control panel / Quit" olur. Overlay'deki kayıt rozeti "● REC" olur (gösterge kısaltmaları FPS, CPU vb. iki dilde aynı). |
| Oturumlar → bir oturum → CSV (İngilizce) | Excel'de virgül ayraçlı, İngilizce başlıklı açılır. |
| Türkçeye geri dönün | Her şey Türkçe. |
| Ayarlar → Hakkında → **Güncellemeleri denetle** (GitHub'da sürüm yokken) | Hata mesajı beklenir. |
| `release\v0.1.15\` içindeki iki dosyayı GitHub'da `v0.1.15` sürümü olarak yayımlayın, yine denetleyin | "En son sürümü kullanıyorsunuz." |
| Sonraki sürümü (0.1.16) yayımlayınca | Panelde "Yeni sürüm hazır" şeridi; Kur → uygulama kapanıp yeni sürümle açılır. |

## 3f. Güvenlik değişiklikleri (0.1.15)
| Adım | Beklenen |
|---|---|
| Uygulama ayarları → "Windows açılınca başlat"ı kapatıp açın | Hata yok; Görev Zamanlayıcı'da `showFPS` görevi var, "En yüksek ayrıcalıklarla" çalışır. |
| Bilgisayarı yeniden başlatın | Overlay UAC sormadan gelir. |
| Oturumlar → bir oturum → CSV | Windows kaydetme penceresi açılır; seçtiğiniz yere `.csv` olarak kaydedilir. Vazgeçince mesaj çıkmaz. |
| Panelin tüm sayfalarını gezin, overlay'i sürükleyin | Boş sayfa ya da eksik görünüm yok (yeni içerik güvenlik politikası bir şeyi engellemiyor). |

## 3g. PawnIO kurulumu (0.1.17, PawnIO kurulu olmayan bir bilgisayarda)
| Adım | Beklenen |
|---|---|
| showFPS'i kurun (kurulum ayrıntılarını gösterin) | "PawnIO sürücüsü kuruluyor…" satırı; ayrı bir pencere açılmaz. Uygulama açılınca CPU sıcaklığı "Canlı". Gerekirse bitiş sayfası yeniden başlatmayı önerir. |
| Ayarlar → Uygulamalar | showFPS ve ayrıca PawnIO görünür. |
| showFPS'i kaldırın | PawnIO yerinde kalır. |
| Aşağıdakiler yalnız PawnIO sonradan kaldırıldıysa: | |
| Genel bakış → Veri kaynakları | CPU sıcaklığı satırında sarı "PawnIO sürücüsü kurulu değil" ve **PawnIO'yu kur** düğmesi. |
| Düğmeye basın | Birkaç saniye "Kuruluyor…", sonra PawnIO'nun kendi kurulum penceresi açılır. |
| Kurulumu bitirin | Birkaç saniye içinde CPU sıcaklığı "Canlı" olur (gerekirse Windows'u yeniden başlatma mesajı çıkar). |
| Kurulum penceresinde vazgeçin | "Kurulumdan vazgeçildi." |
| İlk açılış rehberi → 2. adım | Aynı düğme orada da var. |
| Yeni kurulumda ilk açılış rehberi → 3. adım | Dört tercihin hepsi kapalı. |

## 4. Kalıcılık ve başlangıç
| Adım | Beklenen |
|---|---|
| Tepsiden Çıkış, sonra kısayoldan açın | Tema, konum, profil ve göstergeler aynı. |
| Uygulama açıkken kısayola tekrar tıklayın | İkinci kopya açılmaz, mevcut panel öne gelir. |
| (İsteğe bağlı) Bilgisayarı yeniden başlatın | ~10 sn sonra UAC sormadan overlay ve tepsi simgesi gelir, panel gizli kalır. |

## Sorun bildirirken
- Adım numarası + ekran görüntüsü.
- Panel → Genel bakış → **Veri kaynakları** kartının görüntüsü (FPS ve sensör durumunu gösterir).
- FPS ile ilgiliyse yönetici terminalde `helper\publish\lhm-helper.exe --fps-test` çıktısı.
