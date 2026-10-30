// Kritik sıcaklık bildirimi: CPU/GPU sıcaklığı aktif profilin kritik eşiğini bir süre aralıksız aşınca
// Windows bildirimi. Panelde çalışır (pencere gizliyken de); karar saf fonksiyondadır (test edilebilir).
import { useEffect, useRef } from "react";
import { isTauri } from "./backend";
import { ALERT_INFO, isIdle } from "./metrics";
import type { AlertLevels, AlertMetric, Telemetry } from "./types";
import { L } from "./i18n";

export const SUSTAIN_MS = 10_000; // anlık sıçramalar bildirim üretmesin
export const COOLDOWN_MS = 5 * 60_000; // aynı sensör için en sık 5 dakikada bir


export interface AlertMemory { since: Partial<Record<string, number>>; lastSent: Partial<Record<string, number>> }
export interface Notice { title: string; body: string }

/**
 * Bir telemetri örneğinden sonra gönderilecek bildirimler (bellek yerinde güncellenir).
 * Yalnız "Bildirim" açık ve kritik eşiği olan satırlar; renk mantığıyla aynı yön ve karşılaştırma.
 */
export function checkCritical(t: Telemetry, alerts: Record<AlertMetric, AlertLevels>, mem: AlertMemory, now: number, game: string | null): Notice[] {
  const out: Notice[] = [];
  for (const key of Object.keys(ALERT_INFO) as AlertMetric[]) {
    const info = ALERT_INFO[key];
    const { crit, notify } = alerts[key];
    const v = info.value(t);
    // Boştaki uygulamada (tarayıcı vb.) FPS/frametime eşikleri anlamsız: renkte olduğu gibi yok sayılır.
    const idle = (key === "fps" || key === "frametime") && isIdle(t);
    const bad = notify && crit != null && v != null && !idle && (info.lowerIsWorse ? v < crit : v > crit);
    if (!bad) { delete mem.since[key]; continue; }
    const since = (mem.since[key] ??= now);
    if (now - since < SUSTAIN_MS) continue;
    if (now - (mem.lastSent[key] ?? -Infinity) < COOLDOWN_MS) continue;
    mem.lastSent[key] = now;
    const fmt = (x: number) => `${info.unit === "ms" ? x.toFixed(1) : Math.round(x)} ${info.unit}`;
    out.push({
      title: `${info.label.split(" (")[0]} ${L("kritik", "critical")}: ${fmt(v!)}`, // "FPS (ortalama ve %1 dahil)" → "FPS"
      body: L(
        `Kritik eşik ${fmt(crit!)} (${info.lowerIsWorse ? "altına indi" : "aşıldı"}), ${Math.round((now - since) / 1000)} saniyedir sürüyor.${game ? ` Ön planda: ${game}.` : ""} Ayarlar: Overlay düzenleyici → Uyarı eşikleri.`,
        `${info.lowerIsWorse ? "Below" : "Above"} the critical limit of ${fmt(crit!)} for ${Math.round((now - since) / 1000)} seconds.${game ? ` In foreground: ${game}.` : ""} Settings: Overlay editor → Alert thresholds.`,
      ),
    });
  }
  return out;
}

export function useCriticalAlerts(t: Telemetry, alerts: Record<AlertMetric, AlertLevels>, enabled: boolean, game: string | null) {
  const mem = useRef<AlertMemory>({ since: {}, lastSent: {} });
  useEffect(() => {
    if (!isTauri || !enabled) return;
    const notices = checkCritical(t, alerts, mem.current, Date.now(), game);
    if (!notices.length) return;
    sendNotices(notices).catch(console.error);
  }, [t]);
}

/** Bildirim gönderir; izin yoksa ister. Döndürür: "sent" ya da "denied" (Windows ayarlarında kapalı). */
export async function sendNotices(notices: Notice[]): Promise<"sent" | "denied"> {
  const n = await import("@tauri-apps/plugin-notification");
  let ok = await n.isPermissionGranted();
  if (!ok) ok = (await n.requestPermission()) === "granted";
  if (!ok) return "denied";
  notices.forEach((x) => n.sendNotification(x));
  return "sent";
}
