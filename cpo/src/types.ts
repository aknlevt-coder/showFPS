export type MetricId =
  | "fps" | "avgFps" | "lowFps" | "frametime"
  | "cpuTemp" | "cpuLoad" | "gpuTemp" | "gpuLoad"
  | "ram" | "vram"
  | "cpuClock" | "gpuClock" | "cpuPower" | "gpuPower" | "vramTemp" | "fan";

/** sans: Manrope (gömülü) · mono: Cascadia Mono/Consolas · condensed: Bahnschrift (Windows'ta yüklü) */
export type OverlayFont = "sans" | "mono" | "condensed";

export type LayoutMode = "horizontal" | "vertical" | "iconOnly" | "card" | "detailed";

export interface MetricConfig {
  id: MetricId;
  enabled: boolean;
  color: string;
}

export interface OverlaySettings {
  layout: LayoutMode;
  scale: number;
  fontSize: number;
  fontWeight: number;
  textColor: string;
  iconSize: number;
  gap: number;
  bgColor: string;
  bgOpacity: number;
  showLabels: boolean;
  showIcons: boolean; // göstergelerin yanındaki ikonlar
  font: OverlayFont;
  radius: number; // köşe yuvarlaklığı (px, ölçekten önce)
  metrics: MetricConfig[]; // dizi sırası = ekran sırası
  /** Değer rengi: yazı rengi ya da göstergenin kendi rengi. */
  valueColor: "text" | "metric";
  glow: boolean; // değerlerde neon parıltı
  textShadow: boolean; // şeffaf arka planda okunabilirlik gölgesi
  surface: "solid" | "glass"; // glass: yarı saydam, parlak kenar (gerçek bulanıklık değil)
  outline: boolean; // ince kenarlık
  graph: "off" | "fps" | "frametime"; // overlay sonunda son 60 sn mini grafiği
  alertsEnabled: boolean;
  alerts: Record<AlertMetric, AlertLevels>;
}

/** Eşik desteklenen göstergeler (ortalama FPS gibi türetilmiş olanlar ana FPS eşiğini kullanır). */
/** Saat hızı ve fan için eşik yok: "iyi/kötü" yönü donanıma ve duruma göre değişir. */
export type AlertMetric = "fps" | "frametime" | "cpuTemp" | "gpuTemp" | "vramTemp" | "cpuLoad" | "gpuLoad" | "ram" | "vram" | "cpuPower" | "gpuPower";
/** null = o seviye kapalı. Yönü göstergeye bağlıdır (FPS'te düşük kötü, sıcaklıkta yüksek kötü). */
/** notify: kritik eşik aşılınca (Uygulama ayarları'ndaki ana anahtar da açıksa) Windows bildirimi. */
export interface AlertLevels { warn: number | null; crit: number | null; notify: boolean }

export interface Profile {
  id: string;
  name: string;
  overlay: OverlaySettings;
}

/** Kayıtlı oyun. Kayıtlı oyunlar pencere modunda da "oyun" sayılır; profileId verilirse o profile geçilir. */
export interface GameEntry {
  exe: string; // süreç adı: küçük harf, .exe'siz (eşleşme anahtarı)
  name: string; // görünen ad (düzenlenebilir)
  profileId: string | null;
  path?: string | null; // dosyadan seçildiyse tam yol (bilgi amaçlı)
}

export interface AppSettings {
  theme: "dark" | "light";
  demoData: boolean;
  minimizeToTray: boolean;
  hotkeys: Hotkeys;
  autoHide: boolean; // overlay yalnızca oyundayken görünür
  autoProfile: boolean; // oyuna bağlı profile otomatik geç
  notifyCritical: boolean; // kritik sıcaklıkta Windows bildirimi
  autoRecord: boolean; // oyun oturumlarını otomatik kaydet (varsayılan kapalı: kullanıcı bilerek açar)
  onboarded: boolean; // ilk açılış rehberi tamamlandı ya da atlandı
  lang: "tr" | "en"; // arayüz dili; ilk açılışta Windows dilinden
  /** Elle seçilen profil; oyundan çıkınca buna dönülür. */
  baseProfileId: string | null;
}

/** Tauri hızlandırıcı biçimi (ör. "Ctrl+Shift+KeyO"); null = kapalı. */
export interface Hotkeys {
  toggleOverlay: string | null;
  toggleLock: string | null;
  toggleRecord: string | null;
}

/** Satır (t/m/b) + sütun (l/c/r): "tr" = sağ üst. */
export type Anchor = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";

export interface AppState {
  activeProfileId: string;
  profiles: Profile[];
  app: AppSettings;
  locked: boolean; // true = tıklama geçirgen, sürüklenemez
  overlayVisible: boolean;
  overlayPosition: { x: number; y: number } | null; // fiziksel piksel, sanal masaüstü
  /** Hazır konum; null = fareyle sürüklenmiş özel konum (overlayPosition). */
  overlayAnchor: Anchor | null;
  overlayMargin: number; // hazır konumda kenarlardan boşluk (mantıksal piksel)
  games: GameEntry[];
  /** Süren oturum kaydı (overlay göstergesi için); yüklemede her zaman null. */
  recording: { since: number; game: string | null } | null;
  origin?: string; // yazan pencerenin kimliği (yankıyı yok saymak için)
}

export interface Telemetry {
  fps?: number | null;
  avgFps?: number | null;
  fpsMin?: number | null;
  fps1Low?: number | null;
  frametime?: number | null;
  fpsProcess?: string | null; // FPS'i ölçülen ön plan süreci
  presentEvents?: number | null; // teşhis: ETW'den gelen toplam kare olayı
  fpsPanel?: boolean | null; // ön planda kontrol paneli var; FPS bilerek ölçülmedi
  fgName?: string | null; // ön plandaki uygulamanın süreç adı (panelimizse null)
  fgFullscreen?: boolean | null; // ön plandaki pencere monitörü tamamen kaplıyor
  cpuTemp?: number | null;
  cpuLoad?: number | null;
  gpuTemp?: number | null;
  gpuLoad?: number | null;
  ramUsedMb?: number | null;
  ramTotalMb?: number | null;
  vramUsedMb?: number | null;
  vramTotalMb?: number | null;
  cpuClock?: number | null; // MHz, en hızlı çekirdek
  gpuClock?: number | null; // MHz
  cpuPower?: number | null; // W, paket
  gpuPower?: number | null; // W
  vramTemp?: number | null; // °C, GPU bellek bağlantı noktası
  fanRpm?: number | null; // en hızlı fan; 0 gerçek olabilir
}
