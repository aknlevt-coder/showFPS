import { useEffect, useState } from "react";
import { isTauri } from "./backend";
import { L } from "./i18n";

// Güncelleme denetimi: açılıştan bir süre sonra bir kez sessizce, ayrıca Hakkında'dan elle.
// Adres ve imza anahtarı tauri.conf.json → plugins.updater; paketler scripts/release.mjs ile hazırlanır.

type Update = Awaited<ReturnType<typeof import("@tauri-apps/plugin-updater").check>>;

export interface UpdaterState {
  status: "idle" | "checking" | "none" | "available" | "installing" | "error";
  version?: string;
  notes?: string;
  error?: string;
  progress?: number; // 0–1, indirme
}

let current: UpdaterState = { status: "idle" };
let pending: Update = null;
const listeners = new Set<(s: UpdaterState) => void>();
const set = (s: UpdaterState) => { current = s; listeners.forEach((l) => l(s)); };

export async function checkForUpdate(manual: boolean) {
  if (!isTauri || current.status === "checking" || current.status === "installing") return;
  set({ status: "checking" });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    pending = await check();
    set(pending ? { status: "available", version: pending.version, notes: pending.body ?? undefined } : { status: "none" });
  } catch (e) {
    // Sessiz denetimde (çevrimdışı vb.) hata gösterilmez.
    set(manual ? { status: "error", error: String(e) } : { status: "idle" });
  }
}

/** İndirir ve kurar; kurulum uygulamayı kapatıp yeni sürümü açar. */
export async function installUpdate() {
  if (!pending) return;
  let total = 0, got = 0;
  set({ ...current, status: "installing", progress: 0 });
  try {
    await pending.downloadAndInstall((ev) => {
      if (ev.event === "Started") total = ev.data.contentLength ?? 0;
      else if (ev.event === "Progress") { got += ev.data.chunkLength; if (total) set({ ...current, progress: got / total }); }
    });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    set({ ...current, status: "error", error: `${L("Kurulamadı", "Could not install")}: ${e}` });
  }
}

export function useUpdater(): UpdaterState {
  const [s, setS] = useState(current);
  useEffect(() => { listeners.add(setS); return () => { listeners.delete(setS); }; }, []);
  return s;
}

/** Ana pencerede bir kez: açılıştan 15 sn sonra (açılışı yavaşlatmasın). Geliştirmede denetlenmez. */
export function useAutoUpdateCheck() {
  useEffect(() => {
    if (!isTauri || import.meta.env.DEV) return;
    const id = window.setTimeout(() => void checkForUpdate(false), 15000);
    return () => window.clearTimeout(id);
  }, []);
}
