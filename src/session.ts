// Oyun oturumu kaydı: oyun başlayınca (ya da kısayolla) saniyelik örnekler ve her karenin süresi toplanır;
// bitince özet hesaplanıp diske yazılır (src-tauri/src/sessions.rs). Panelde çalışır (gizliyken de).
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "./backend";
import { update } from "./store";
import type { Telemetry } from "./types";

export const MIN_SESSION_SEC = 30; // daha kısa oturumlar kaydedilmez (yanlışlıkla açılıp kapanan oyunlar)
export const TOGGLE_RECORD_EVENT = "cpo-toggle-record";

export interface SessionSample {
  t: number; // oturum başından saniye
  fps: number | null; frametime: number | null;
  cpuTemp: number | null; gpuTemp: number | null; vramTemp: number | null;
  cpuLoad: number | null; gpuLoad: number | null;
  cpuPower: number | null; gpuPower: number | null;
  ramPct: number | null; vramPct: number | null;
}

export interface SessionData {
  id: string;
  game: string | null;
  start: string; // ISO
  manual: boolean; // kısayolla başlatıldı (otomatik değil)
  samples: SessionSample[];
  frames: number[]; // her karenin süresi (ms), sırayla
}

export interface SessionSummary {
  id: string; game: string | null; start: string; manual: boolean;
  durationSec: number; frameCount: number;
  avgFps: number | null; low1: number | null; low01: number | null; stutters: number | null;
  maxCpuTemp: number | null; maxGpuTemp: number | null; maxVramTemp: number | null;
  avgCpuLoad: number | null; avgGpuLoad: number | null;
  maxCpuPower: number | null; maxGpuPower: number | null;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const max = (xs: (number | null)[]) => { const v = xs.filter(num); return v.length ? Math.max(...v) : null; };
const avg = (xs: (number | null)[]) => { const v = xs.filter(num); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const pct = (u?: number | null, tot?: number | null) => (num(u) && num(tot) && tot > 0 ? (u / tot) * 100 : null);

/**
 * Özet. Kare verisi varsa FPS değerleri tüm karelerden hesaplanır:
 * - ortalama = kare sayısı / toplam süre (zaman ağırlıklı; saniyelik ortalamaların ortalaması değil)
 * - %1 / %0,1 düşük = 99. / 99,9. yüzdelik frametime'ın FPS karşılığı (overlay'deki %1 ile aynı tanım)
 * - takılma = ortanca frametime'ın 2,5 katından uzun kare
 * Kare verisi yoksa (FPS ölçümü yok) FPS alanları saniyelik örneklerden ya da null.
 */
export function summarize(d: SessionData): SessionSummary {
  const s = d.samples;
  const durationSec = s.length ? s[s.length - 1].t : 0;
  let avgFps: number | null = null, low1: number | null = null, low01: number | null = null, stutters: number | null = null;
  if (d.frames.length >= 2) {
    const total = d.frames.reduce((a, b) => a + b, 0);
    avgFps = (d.frames.length / total) * 1000;
    const sorted = [...d.frames].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
    low1 = 1000 / at(0.99);
    low01 = 1000 / at(0.999);
    const median = at(0.5);
    stutters = d.frames.filter((f) => f > median * 2.5).length;
  } else {
    avgFps = avg(s.map((x) => x.fps));
  }
  return {
    id: d.id, game: d.game, start: d.start, manual: d.manual,
    durationSec, frameCount: d.frames.length,
    avgFps, low1, low01, stutters,
    maxCpuTemp: max(s.map((x) => x.cpuTemp)), maxGpuTemp: max(s.map((x) => x.gpuTemp)), maxVramTemp: max(s.map((x) => x.vramTemp)),
    avgCpuLoad: avg(s.map((x) => x.cpuLoad)), avgGpuLoad: avg(s.map((x) => x.gpuLoad)),
    maxCpuPower: max(s.map((x) => x.cpuPower)), maxGpuPower: max(s.map((x) => x.gpuPower)),
  };
}

export function sampleOf(t: Telemetry, sec: number): SessionSample {
  const n = (v: number | null | undefined) => (num(v) ? Math.round(v * 10) / 10 : null);
  return {
    t: sec, fps: n(t.fps), frametime: n(t.frametime),
    cpuTemp: n(t.cpuTemp), gpuTemp: n(t.gpuTemp), vramTemp: n(t.vramTemp),
    cpuLoad: n(t.cpuLoad), gpuLoad: n(t.gpuLoad), cpuPower: n(t.cpuPower), gpuPower: n(t.gpuPower),
    ramPct: n(pct(t.ramUsedMb, t.ramTotalMb)), vramPct: n(pct(t.vramUsedMb, t.vramTotalMb)),
  };
}

/** "20261030-143502-eldenring": zamana göre sıralanır, dosya adı olarak güvenlidir. */
export function sessionId(start: Date, game: string | null): string {
  const p = (x: number) => String(x).padStart(2, "0");
  const ts = `${start.getFullYear()}${p(start.getMonth() + 1)}${p(start.getDate())}-${p(start.getHours())}${p(start.getMinutes())}${p(start.getSeconds())}`;
  const g = (game ?? "kayit").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "kayit";
  return `${ts}-${g}`;
}

interface Active { data: SessionData; startMs: number }

/**
 * Kaydedici. Oyun algılanınca (autoRecord) başlar, oyundan çıkınca biter; kısayol ile elle başlatılan kayıt
 * yalnız kısayolla biter. Kare süreleri birleşik telemetriden değil, yardımcının ham olaylarından alınır
 * (birleşik nesnede kalan eski "frames" bir sonraki birleştirmede tekrar sayılırdı).
 */
export function useSessionRecorder(live: Telemetry, game: { inGame: boolean; game: string | null }, autoRecord: boolean) {
  const active = useRef<Active | null>(null);
  const liveRef = useRef(live);
  liveRef.current = live;

  const start = (manual: boolean, name: string | null) => {
    if (active.current) return;
    const now = new Date();
    active.current = { startMs: now.getTime(), data: { id: sessionId(now, name), game: name, start: now.toISOString(), manual, samples: [], frames: [] } };
    update((st) => ({ ...st, recording: { since: now.getTime(), game: name } }));
  };

  const stop = async () => {
    const a = active.current;
    active.current = null;
    update((st) => ({ ...st, recording: null }));
    if (!a) return;
    const summary = summarize(a.data);
    if (summary.durationSec < MIN_SESSION_SEC) return;
    await invoke("save_session", { id: a.data.id, summary, data: a.data }).catch(console.error);
  };

  // Yardımcının ham olayları: saniyede bir örnek + o saniyenin kare süreleri.
  useEffect(() => {
    if (!isTauri) return;
    const un = listen<Telemetry & { fgName?: string | null; frames?: number[] | null }>("telemetry", (e) => {
      const a = active.current;
      if (!a || !("fgName" in e.payload)) return; // sysinfo olayları da "telemetry"; yardımcınınkiler fgName taşır
      if (Array.isArray(e.payload.frames)) for (const f of e.payload.frames) a.data.frames.push(f);
      const sec = Math.round((Date.now() - a.startMs) / 1000);
      a.data.samples.push(sampleOf({ ...liveRef.current, ...e.payload }, sec));
    });
    return () => { un.then((f) => f()); };
  }, []);

  // Otomatik: oyun başlayınca başla, bitince bitir (yalnız otomatik başlatılmış kayıtlar).
  useEffect(() => {
    if (game.inGame && autoRecord && !active.current) start(false, game.game);
    if (!game.inGame && active.current && !active.current.data.manual) stop();
  }, [game.inGame, autoRecord]);

  // Kısayol: başlat / bitir.
  useEffect(() => {
    const toggle = () => (active.current ? stop() : start(true, game.inGame ? game.game : null));
    window.addEventListener(TOGGLE_RECORD_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_RECORD_EVENT, toggle);
  }, [game.inGame, game.game]);

  // Tepsiden "Çıkış": Rust önce bu olayı yollar; süren kayıt kaydedilip sonra çıkılır
  // (Rust 2 sn içinde cevap gelmezse yine de kapatır).
  useEffect(() => {
    if (!isTauri) return;
    const un = listen("app-quit-requested", async () => {
      await stop();
      await invoke("quit_app");
    });
    return () => { un.then((f) => f()); };
  }, []);
}
