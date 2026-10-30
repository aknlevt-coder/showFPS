import { useEffect, useState } from "react";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { isTauri } from "./backend";
import { TOGGLE_RECORD_EVENT } from "./session";
import { update } from "./store";
import type { Hotkeys } from "./types";
import { L } from "./i18n";

export type HotkeyAction = keyof Hotkeys;

const ACTIONS: Record<HotkeyAction, () => void> = {
  toggleOverlay: () => update((x) => ({ ...x, overlayVisible: !x.overlayVisible })),
  toggleLock: () => update((x) => ({ ...x, locked: !x.locked })),
  // Kaydedici panelde (session.ts) yaşar; olayla haber verilir.
  toggleRecord: () => window.dispatchEvent(new Event(TOGGLE_RECORD_EVENT)),
};

/** "Ctrl+Shift+KeyO" → "Ctrl + Shift + O" */
export function prettyHotkey(accel: string | null): string {
  if (!accel) return L("Kapalı", "Off");
  return accel
    .split("+")
    .map((p) => p.replace(/^Key([A-Z])$/, "$1").replace(/^Digit(\d)$/, "$1").replace(/^Arrow/, ""))
    .join(" + ");
}

/**
 * Tuş olayından hızlandırıcı üretir. Yalnız değiştirici tuşlar null döner (henüz tamamlanmadı).
 * F1–F24 dışındaki tuşlar en az bir değiştirici ister; yoksa oyunda yazarken tetiklenirdi.
 */
export function accelFromEvent(e: KeyboardEvent): { accel: string | null; error?: string } {
  if (["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(e.code)) {
    return { accel: null };
  }
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean) as string[];
  const fKey = /^F([1-9]|1\d|2[0-4])$/.test(e.code);
  if (!mods.length && !fKey) return { accel: null, error: L("Ctrl, Alt ya da Shift ile birlikte basın (F tuşları tek başına olabilir).", "Press together with Ctrl, Alt or Shift (F keys may be used alone).") };
  return { accel: [...mods, e.code].join("+") };
}

/**
 * Kısayolları kaydeder; ayarlar değişince eskileri bırakıp yenilerini kaydeder.
 * Başka bir uygulama aynı kısayolu tutuyorsa kayıt başarısız olur — hata eyleme göre döner.
 * Ana pencere gizliyken de çalışır (webview arka planda yaşar).
 */
export function useGlobalHotkeys(hk: Hotkeys): Partial<Record<HotkeyAction, string>> {
  const [errors, setErrors] = useState<Partial<Record<HotkeyAction, string>>>({});
  useEffect(() => {
    if (!isTauri) return;
    let dead = false;
    const done: string[] = [];
    (async () => {
      const errs: Partial<Record<HotkeyAction, string>> = {};
      for (const action of Object.keys(ACTIONS) as HotkeyAction[]) {
        const accel = hk[action];
        if (!accel) continue;
        try {
          await register(accel, (e) => { if (e.state === "Pressed") ACTIONS[action](); });
          if (dead) { await unregister(accel).catch(() => {}); continue; }
          done.push(accel);
        } catch (e) {
          errs[action] = L("Kaydedilemedi (başka bir uygulama kullanıyor olabilir)", "Could not register (another app may be using it)") + `: ${e}`;
        }
      }
      if (!dead) setErrors(errs);
    })();
    return () => {
      dead = true;
      for (const a of done) unregister(a).catch(() => {});
    };
  }, [hk.toggleOverlay, hk.toggleLock, hk.toggleRecord]);
  return errors;
}
