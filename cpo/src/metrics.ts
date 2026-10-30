import {
  Activity, ArrowDownToLine, Clock, Cpu, Fan, Gauge, Layers, MemoryStick, Monitor, PlugZap, Thermometer, ThermometerSun, Timer, Zap,
  type LucideIcon,
} from "lucide-react";
import type { AlertLevels, AlertMetric, MetricId, Telemetry } from "./types";
import { L } from "./i18n";

export const METRIC_ORDER: MetricId[] = [
  "fps", "avgFps", "lowFps", "frametime",
  "cpuTemp", "cpuLoad", "gpuTemp", "gpuLoad", "ram", "vram",
  "cpuClock", "gpuClock", "cpuPower", "gpuPower", "vramTemp", "fan",
];

export const METRIC_COLORS: Record<MetricId, string> = {
  fps: "#4ade80", avgFps: "#86efac", lowFps: "#fbbf24", frametime: "#38bdf8",
  cpuTemp: "#fb923c", cpuLoad: "#f97316", gpuTemp: "#a78bfa", gpuLoad: "#c084fc",
  ram: "#22d3ee", vram: "#f472b6",
  cpuClock: "#fdba74", gpuClock: "#d8b4fe", cpuPower: "#facc15", gpuPower: "#e879f9", vramTemp: "#f9a8d4", fan: "#7dd3fc",
};

export interface MetricDef {
  label: string;
  short: string;
  Icon: LucideIcon;
  source: "fps" | "sensor" | "system"; // veri kaynağı katmanı
}

export const METRIC_DEFS: Record<MetricId, MetricDef> = {
  fps: { label: "FPS", short: "FPS", Icon: Gauge, source: "fps" },
  avgFps: { get label() { return L("Ortalama FPS", "Average FPS"); }, short: "AVG", Icon: Activity, source: "fps" },
  lowFps: { get label() { return L("Min / %1 düşük FPS", "Min / 1% low FPS"); }, short: "LOW", Icon: ArrowDownToLine, source: "fps" },
  frametime: { label: "Frametime", short: "FT", Icon: Timer, source: "fps" },
  cpuTemp: { get label() { return L("CPU sıcaklığı", "CPU temperature"); }, short: "CPU", Icon: Thermometer, source: "sensor" },
  cpuLoad: { get label() { return L("CPU kullanımı", "CPU usage"); }, short: "CPU", Icon: Cpu, source: "system" },
  gpuTemp: { get label() { return L("GPU sıcaklığı", "GPU temperature"); }, short: "GPU", Icon: Thermometer, source: "sensor" },
  gpuLoad: { get label() { return L("GPU kullanımı", "GPU usage"); }, short: "GPU", Icon: Monitor, source: "sensor" },
  ram: { get label() { return L("RAM kullanımı", "RAM usage"); }, short: "RAM", Icon: MemoryStick, source: "system" },
  vram: { get label() { return L("VRAM kullanımı", "VRAM usage"); }, short: "VRAM", Icon: Layers, source: "sensor" },
  cpuClock: { get label() { return L("CPU saat hızı (en hızlı çekirdek)", "CPU clock (fastest core)"); }, short: "CPU", Icon: Clock, source: "sensor" },
  gpuClock: { get label() { return L("GPU saat hızı", "GPU clock"); }, short: "GPU", Icon: Clock, source: "sensor" },
  cpuPower: { get label() { return L("CPU gücü", "CPU power"); }, short: "CPU", Icon: Zap, source: "sensor" },
  gpuPower: { get label() { return L("GPU gücü", "GPU power"); }, short: "GPU", Icon: PlugZap, source: "sensor" },
  vramTemp: { get label() { return L("GPU bellek sıcaklığı", "GPU memory temperature"); }, short: "VRAM", Icon: ThermometerSun, source: "sensor" },
  fan: { get label() { return L("Fan hızı (en hızlı)", "Fan speed (fastest)"); }, short: "FAN", Icon: Fan, source: "sensor" },
};

export interface Formatted { value: string; unit: string; pct: number | null }

const has = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);
const r0 = (n: number) => Math.round(n).toString();
const gb = (mb: number) => (mb / 1024).toFixed(1);
/** 1000 MHz ve üstü GHz olarak (4.2 GHz), altı MHz. */
const clock = (mhz: number): Formatted => (mhz >= 1000 ? { value: (mhz / 1000).toFixed(1), unit: "GHz", pct: null } : { value: r0(mhz), unit: "MHz", pct: null });

/** Değer yoksa null döner — asla uydurma değer üretmez. */
export function formatMetric(id: MetricId, t: Telemetry): Formatted | null {
  switch (id) {
    case "fps": return has(t.fps) ? { value: r0(t.fps), unit: "FPS", pct: null } : null;
    case "avgFps": return has(t.avgFps) ? { value: r0(t.avgFps), unit: "FPS", pct: null } : null;
    case "lowFps":
      return has(t.fpsMin) && has(t.fps1Low)
        ? { value: `${r0(t.fpsMin)}/${r0(t.fps1Low)}`, unit: "FPS", pct: null } : null;
    case "frametime": return has(t.frametime) ? { value: t.frametime.toFixed(1), unit: "ms", pct: null } : null;
    case "cpuTemp": return has(t.cpuTemp) ? { value: r0(t.cpuTemp), unit: "°C", pct: t.cpuTemp } : null;
    case "gpuTemp": return has(t.gpuTemp) ? { value: r0(t.gpuTemp), unit: "°C", pct: t.gpuTemp } : null;
    case "cpuLoad": return has(t.cpuLoad) ? { value: r0(t.cpuLoad), unit: "%", pct: t.cpuLoad } : null;
    case "gpuLoad": return has(t.gpuLoad) ? { value: r0(t.gpuLoad), unit: "%", pct: t.gpuLoad } : null;
    case "ram":
      return has(t.ramUsedMb) && has(t.ramTotalMb)
        ? { value: `${gb(t.ramUsedMb)}/${r0(t.ramTotalMb / 1024)}`, unit: "GB", pct: (t.ramUsedMb / t.ramTotalMb) * 100 } : null;
    case "vram":
      return has(t.vramUsedMb) && has(t.vramTotalMb)
        ? { value: `${gb(t.vramUsedMb)}/${r0(t.vramTotalMb / 1024)}`, unit: "GB", pct: (t.vramUsedMb / t.vramTotalMb) * 100 } : null;
    case "cpuClock": return has(t.cpuClock) ? clock(t.cpuClock) : null;
    case "gpuClock": return has(t.gpuClock) ? clock(t.gpuClock) : null;
    case "cpuPower": return has(t.cpuPower) ? { value: r0(t.cpuPower), unit: "W", pct: null } : null;
    case "gpuPower": return has(t.gpuPower) ? { value: r0(t.gpuPower), unit: "W", pct: null } : null;
    case "vramTemp": return has(t.vramTemp) ? { value: r0(t.vramTemp), unit: "°C", pct: t.vramTemp } : null;
    case "fan": return has(t.fanRpm) ? { value: r0(t.fanRpm), unit: "RPM", pct: null } : null;
  }
}

export function hexToRgba(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(0,0,0,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export type Level = "ok" | "warn" | "crit";

/** Gösterge → eşik anahtarı, karşılaştırılan sayı ve yön (FPS'te düşük kötü). */
const ALERT_SOURCE: Partial<Record<MetricId, { key: AlertMetric; value: (t: Telemetry) => number | null | undefined; lowerIsWorse?: boolean }>> = {
  fps: { key: "fps", value: (t) => t.fps, lowerIsWorse: true },
  avgFps: { key: "fps", value: (t) => t.avgFps, lowerIsWorse: true },
  lowFps: { key: "fps", value: (t) => t.fps1Low, lowerIsWorse: true },
  frametime: { key: "frametime", value: (t) => t.frametime },
  cpuTemp: { key: "cpuTemp", value: (t) => t.cpuTemp },
  gpuTemp: { key: "gpuTemp", value: (t) => t.gpuTemp },
  vramTemp: { key: "vramTemp", value: (t) => t.vramTemp },
  cpuPower: { key: "cpuPower", value: (t) => t.cpuPower },
  gpuPower: { key: "gpuPower", value: (t) => t.gpuPower },
  cpuLoad: { key: "cpuLoad", value: (t) => t.cpuLoad },
  gpuLoad: { key: "gpuLoad", value: (t) => t.gpuLoad },
  ram: { key: "ram", value: (t) => (has(t.ramUsedMb) && has(t.ramTotalMb) ? (t.ramUsedMb / t.ramTotalMb) * 100 : null) },
  vram: { key: "vram", value: (t) => (has(t.vramUsedMb) && has(t.vramTotalMb) ? (t.vramUsedMb / t.vramTotalMb) * 100 : null) },
};

/** Bu FPS'in altında uygulama "boşta" sayılır: tarayıcı gibi uygulamalar ekran değişmeyince kare çizmez. */
export const IDLE_FPS = 5;
export const isIdle = (t: Telemetry) => has(t.fps) && t.fps < IDLE_FPS;

/** Değer yoksa "ok" — veri olmadan uyarı üretilmez. Boştaki uygulamada FPS uyarısı verilmez. */
export function metricLevel(id: MetricId, t: Telemetry, alerts: Record<AlertMetric, AlertLevels>): Level {
  const src = ALERT_SOURCE[id];
  const v = src?.value(t);
  if (!src || !has(v)) return "ok";
  if ((src.key === "fps" || src.key === "frametime") && isIdle(t)) return "ok";
  const { warn, crit } = alerts[src.key];
  const bad = (lim: number | null) => lim != null && (src.lowerIsWorse ? v < lim : v > lim);
  return bad(crit) ? "crit" : bad(warn) ? "warn" : "ok";
}

/** Eşik tablosu, renk ve bildirim için tek kaynak: her eşiğin adı, birimi, değeri ve yönü. */
export const ALERT_INFO: Record<AlertMetric, { label: string; unit: string; value: (t: Telemetry) => number | null | undefined; lowerIsWorse?: boolean }> = {
  fps: { get label() { return L("FPS (ortalama ve %1 dahil)", "FPS (incl. average and 1%)"); }, unit: "FPS", value: (t) => t.fps, lowerIsWorse: true },
  frametime: { label: "Frametime", unit: "ms", value: (t) => t.frametime },
  cpuTemp: { get label() { return L("CPU sıcaklığı", "CPU temperature"); }, unit: "°C", value: (t) => t.cpuTemp },
  gpuTemp: { get label() { return L("GPU sıcaklığı", "GPU temperature"); }, unit: "°C", value: (t) => t.gpuTemp },
  vramTemp: { get label() { return L("GPU bellek sıcaklığı", "GPU memory temperature"); }, unit: "°C", value: (t) => t.vramTemp },
  cpuLoad: { get label() { return L("CPU kullanımı", "CPU usage"); }, unit: "%", value: (t) => t.cpuLoad },
  gpuLoad: { get label() { return L("GPU kullanımı", "GPU usage"); }, unit: "%", value: (t) => t.gpuLoad },
  ram: { get label() { return L("RAM doluluğu", "RAM usage"); }, unit: "%", value: (t) => (has(t.ramUsedMb) && has(t.ramTotalMb) ? (t.ramUsedMb / t.ramTotalMb) * 100 : null) },
  vram: { get label() { return L("VRAM doluluğu", "VRAM usage"); }, unit: "%", value: (t) => (has(t.vramUsedMb) && has(t.vramTotalMb) ? (t.vramUsedMb / t.vramTotalMb) * 100 : null) },
  cpuPower: { get label() { return L("CPU gücü", "CPU power"); }, unit: "W", value: (t) => t.cpuPower },
  gpuPower: { get label() { return L("GPU gücü", "GPU power"); }, unit: "W", value: (t) => t.gpuPower },
};
