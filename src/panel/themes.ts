import { METRIC_COLORS, METRIC_ORDER } from "../metrics";
import type { MetricId, OverlaySettings } from "../types";
import { L } from "../i18n";

/** Tema renk, stil, yazı tipi ve köşeleri değiştirir; yerleşim, boyut ve hangi göstergelerin açık olduğu korunur. */
export type ThemePatch = Pick<
  OverlaySettings,
  "bgColor" | "bgOpacity" | "textColor" | "valueColor" | "glow" | "textShadow" | "surface" | "outline" | "font" | "radius"
>;
export type Palette = Partial<Record<MetricId, string>>;

export type ThemeCategory = "Temel" | "Oyun" | "Renkli" | "Erişilebilirlik";

export interface Theme {
  id: string;
  name: string;
  desc: string;
  category: ThemeCategory;
  patch: ThemePatch;
  /** Gösterge renkleri; verilmezse varsayılan palet (tema değişince özel renkler de sıfırlanır). */
  palette?: Palette;
}

/** Yeni kurulumların varsayılan overlay görünümü (store.ts DEFAULT_OVERLAY). */
export const AURORA: ThemePatch = {
  bgColor: "#1e1b4b", bgOpacity: 0.5, textColor: "#eef2ff", valueColor: "metric", glow: false, textShadow: false,
  surface: "glass", outline: false, font: "sans", radius: 12,
};

const base = { valueColor: "metric", glow: false, textShadow: false, surface: "solid", outline: false, font: "sans", radius: 10 } as const;
/** Tek renkli palet: tüm göstergeler (sonradan eklenenler dahil) aynı renk. */
const one = (c: string): Palette => Object.fromEntries(METRIC_ORDER.map((id) => [id, c]));

const P = {
  terminal: { fps: "#39ff88", avgFps: "#2fd873", lowFps: "#a3ff5c", frametime: "#5cffb0", cpuTemp: "#c6ff5c", cpuLoad: "#39ff88", gpuTemp: "#8dffb8", gpuLoad: "#2fe39a", ram: "#74f7a5", vram: "#b4ff9a" },
  sunset: { fps: "#fbbf24", avgFps: "#fcd34d", lowFps: "#fb923c", frametime: "#f472b6", cpuTemp: "#f97316", cpuLoad: "#fb7185", gpuTemp: "#e879f9", gpuLoad: "#f43f5e", ram: "#fdba74", vram: "#c084fc" },
  ocean: { fps: "#22d3ee", avgFps: "#67e8f9", lowFps: "#5eead4", frametime: "#38bdf8", cpuTemp: "#2dd4bf", cpuLoad: "#0ea5e9", gpuTemp: "#818cf8", gpuLoad: "#60a5fa", ram: "#a5f3fc", vram: "#93c5fd" },
  forest: { fps: "#84cc16", avgFps: "#a3e635", lowFps: "#facc15", frametime: "#34d399", cpuTemp: "#f59e0b", cpuLoad: "#4ade80", gpuTemp: "#fb923c", gpuLoad: "#22c55e", ram: "#bef264", vram: "#86efac" },
  // Açık zeminde okunabilmesi için orta tonlu pasteller.
  pastel: { fps: "#3f9d6a", avgFps: "#5bab7c", lowFps: "#c08a2c", frametime: "#3b82c4", cpuTemp: "#d0724a", cpuLoad: "#e07b5f", gpuTemp: "#8b6fd6", gpuLoad: "#a36bd1", ram: "#2f9fb0", vram: "#d0679a" },
  cyber: { fps: "#fde047", avgFps: "#facc15", lowFps: "#f472b6", frametime: "#22d3ee", cpuTemp: "#f472b6", cpuLoad: "#fde047", gpuTemp: "#e879f9", gpuLoad: "#22d3ee", ram: "#a3e635", vram: "#f0abfc" },
  esports: { fps: "#ffffff", avgFps: "#d4d4d4", lowFps: "#ff4655", frametime: "#ff8a93", cpuTemp: "#ff4655", cpuLoad: "#ffffff", gpuTemp: "#ff4655", gpuLoad: "#ffffff", ram: "#d4d4d4", vram: "#d4d4d4" },
  contrast: { fps: "#00ff66", avgFps: "#00ff66", lowFps: "#ffd400", frametime: "#00e5ff", cpuTemp: "#ffd400", cpuLoad: "#00e5ff", gpuTemp: "#ff9f1a", gpuLoad: "#00e5ff", ram: "#ffffff", vram: "#ffffff" },
} satisfies Record<string, Palette>;

export const THEMES: Theme[] = [
  // Temel
  { id: "aurora", name: "Aurora", get desc() { return L("Uygulamanın kendi teması: indigo cam", "The app's own theme: indigo glass"); }, category: "Temel", patch: AURORA },
  { id: "default", get name() { return L("Klasik", "Classic"); }, get desc() { return L("Koyu, yarı saydam zemin", "Dark, semi-transparent background"); }, category: "Temel",
    patch: { ...base, bgColor: "#0b0f19", bgOpacity: 0.6, textColor: "#f1f5f9", valueColor: "text" } },
  { id: "minimal", name: "Minimal", get desc() { return L("Zemin yok, gölgeli yazı", "No background, shadowed text"); }, category: "Temel",
    patch: { ...base, bgColor: "#000000", bgOpacity: 0, textColor: "#ffffff", valueColor: "text", textShadow: true } },
  { id: "mono", name: "Mono", get desc() { return L("Tek renk, sade ve sakin", "Single colour, plain and calm"); }, category: "Temel", palette: one("#d4d4d8"),
    patch: { ...base, bgColor: "#000000", bgOpacity: 0.45, textColor: "#fafafa", radius: 8 } },
  { id: "light", get name() { return L("Açık", "Light"); }, get desc() { return L("Açık renkli oyunlar için", "For bright games"); }, category: "Temel",
    patch: { ...base, bgColor: "#ffffff", bgOpacity: 0.85, textColor: "#0f172a", valueColor: "text", outline: true } },

  // Oyun
  { id: "hud", get name() { return L("Oyun HUD", "Game HUD"); }, get desc() { return L("Dar yazı, yüksek kontrast", "Condensed text, high contrast"); }, category: "Oyun",
    patch: { ...base, bgColor: "#000000", bgOpacity: 0.85, textColor: "#ffffff", font: "condensed", radius: 4 } },
  { id: "esports", get name() { return L("Turnuva", "Esports"); }, get desc() { return L("Beyaz ve kırmızı, keskin köşe", "White and red, sharp corners"); }, category: "Oyun", palette: P.esports,
    patch: { ...base, bgColor: "#0f1923", bgOpacity: 0.9, textColor: "#ece8e1", font: "condensed", radius: 0, outline: true } },
  { id: "cyber", get name() { return L("Siberpunk", "Cyberpunk"); }, get desc() { return L("Sarı ve pembe, parıltılı", "Yellow and pink, glowing"); }, category: "Oyun", palette: P.cyber,
    patch: { ...base, bgColor: "#120024", bgOpacity: 0.8, textColor: "#fef9c3", font: "condensed", radius: 0, glow: true, outline: true } },
  { id: "neon", name: "Neon", get desc() { return L("Renkli, parıltılı değerler", "Colourful, glowing values"); }, category: "Oyun",
    patch: { ...base, bgColor: "#07030f", bgOpacity: 0.78, textColor: "#f5f3ff", glow: true, outline: true, radius: 14 } },
  { id: "terminal", name: "Terminal", get desc() { return L("Fosfor yeşili, sabit genişlikli yazı", "Phosphor green, monospaced text"); }, category: "Oyun", palette: P.terminal,
    patch: { ...base, bgColor: "#001a0d", bgOpacity: 0.85, textColor: "#39ff88", font: "mono", radius: 2, glow: true } },

  // Renkli
  { id: "glass", get name() { return L("Cam", "Glass"); }, get desc() { return L("Yarı saydam, parlak kenar", "Semi-transparent, bright edge"); }, category: "Renkli",
    patch: { ...base, bgColor: "#1e293b", bgOpacity: 0.35, textColor: "#ffffff", valueColor: "text", textShadow: true, surface: "glass", radius: 16 } },
  { id: "sunset", get name() { return L("Gün batımı", "Sunset"); }, get desc() { return L("Sıcak turuncu ve pembe tonlar", "Warm orange and pink tones"); }, category: "Renkli", palette: P.sunset,
    patch: { ...base, bgColor: "#3b0a2a", bgOpacity: 0.55, textColor: "#fff7ed", surface: "glass", radius: 16 } },
  { id: "ocean", get name() { return L("Okyanus", "Ocean"); }, get desc() { return L("Turkuaz ve mavi, derin lacivert", "Teal and blue on deep navy"); }, category: "Renkli", palette: P.ocean,
    patch: { ...base, bgColor: "#042f49", bgOpacity: 0.7, textColor: "#ecfeff", radius: 12 } },
  { id: "forest", get name() { return L("Orman", "Forest"); }, get desc() { return L("Yeşil ve toprak tonları", "Green and earth tones"); }, category: "Renkli", palette: P.forest,
    patch: { ...base, bgColor: "#052e16", bgOpacity: 0.7, textColor: "#f7fee7", radius: 12 } },
  { id: "pastel", name: "Pastel", get desc() { return L("Yumuşak, açık ve yuvarlak", "Soft, light and rounded"); }, category: "Renkli", palette: P.pastel,
    patch: { ...base, bgColor: "#faf5ff", bgOpacity: 0.9, textColor: "#3b2f5c", outline: true, radius: 18 } },

  // Erişilebilirlik
  { id: "contrast", get name() { return L("Yüksek kontrast", "High contrast"); }, get desc() { return L("Tam siyah zemin, en net okuma", "Pure black background, clearest reading"); }, category: "Erişilebilirlik", palette: P.contrast,
    patch: { ...base, bgColor: "#000000", bgOpacity: 1, textColor: "#ffffff", outline: true, radius: 4 } },
];

export const THEME_CATEGORIES: ThemeCategory[] = ["Temel", "Oyun", "Renkli", "Erişilebilirlik"];

/** Kategori adı anahtar olarak kalır; görünen ad dile göre. */
export const categoryLabel = (c: ThemeCategory) =>
  ({ Temel: L("Temel", "Basic"), Oyun: L("Oyun", "Gaming"), Renkli: L("Renkli", "Colourful"), Erişilebilirlik: L("Erişilebilirlik", "Accessibility") })[c];

/** Temanın paletinde olmayan göstergeler varsayılan rengini alır. */
const paletteOf = (th: Theme): Record<MetricId, string> => ({ ...METRIC_COLORS, ...th.palette });

/** Temayı uygulamak için yama: stil alanları + göstergelerin renkleri (açık/kapalı ve sıra korunur). */
export function themePatchFor(th: Theme, o: OverlaySettings): Partial<OverlaySettings> {
  const pal = paletteOf(th);
  return { ...th.patch, metrics: o.metrics.map((m) => ({ ...m, color: pal[m.id] })) };
}

export function activeThemeId(o: OverlaySettings): string | null {
  const t = THEMES.find(
    (th) =>
      (Object.keys(th.patch) as (keyof ThemePatch)[]).every((k) => o[k] === th.patch[k]) &&
      o.metrics.every((m) => m.color.toLowerCase() === paletteOf(th)[m.id].toLowerCase()),
  );
  return t?.id ?? null;
}
