import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppState, Telemetry } from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const LS_KEY = "cpo-state-v1";
const bc: BroadcastChannel | null =
  !isTauri && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("cpo") : null;

export async function loadState(): Promise<unknown> {
  try {
    if (isTauri) return await invoke("load_state");
    const s = localStorage.getItem(LS_KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    console.error("Ayarlar okunamadı:", e);
    return null;
  }
}

export async function saveState(s: AppState): Promise<void> {
  try {
    if (isTauri) await invoke("save_state", { state: s });
    else {
      localStorage.setItem(LS_KEY, JSON.stringify(s));
      bc?.postMessage(s);
    }
  } catch (e) {
    console.error("Ayarlar kaydedilemedi:", e);
  }
}

export async function onStateChanged(cb: (s: unknown) => void): Promise<() => void> {
  if (isTauri) return listen("state-changed", (e) => cb(e.payload));
  if (bc) {
    const h = (e: MessageEvent) => cb(e.data);
    bc.addEventListener("message", h);
    return () => bc.removeEventListener("message", h);
  }
  return () => {};
}

export interface SensorStatus {
  state?: "starting" | "running" | "missing" | "stopped" | "error";
  message?: string;
  lastError?: string;
  info?: { isAdmin?: boolean; gpu?: string | null; fps?: string; pawnIO?: boolean }; // fps: "ok" ya da hata mesajı
}

/** LibreHardwareMonitor yardımcı sürecinin durumu; tarayıcıda null. */
export async function onSensorStatus(cb: (s: SensorStatus) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const un = await listen<SensorStatus>("sensor-status", (e) => cb(e.payload));
  invoke<SensorStatus>("sensor_status").then(cb).catch(console.error);
  return un;
}

export async function onTelemetry(cb: (t: Telemetry) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  return listen<Telemetry>("telemetry", (e) => cb(e.payload));
}
