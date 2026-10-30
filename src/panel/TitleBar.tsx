import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { isTauri } from "../backend";
import { getState } from "../store";
import { hidePanel } from "./visibility";
import { L } from "../i18n";

/** Pencere kenarlıksız (decorations: false); başlık çubuğu burada çizilir. Tarayıcıda gösterilmez. */
export function TitleBar() {
  const [max, setMax] = useState(false);
  useEffect(() => {
    if (!isTauri) return;
    const w = getCurrentWindow();
    w.isMaximized().then(setMax).catch(() => {});
    const un = w.onResized(() => { w.isMaximized().then(setMax).catch(() => {}); });
    return () => { un.then((f) => f()); };
  }, []);
  if (!isTauri) return null;

  const w = getCurrentWindow();
  const close = async () => {
    // Kapatma isteğini beklemeden aynı kural: tepsiye in ya da çık.
    if (getState().app.minimizeToTray) await hidePanel();
    else await invoke("quit_app");
  };

  return (
    <header className="titlebar" data-tauri-drag-region>
      <img src="/app-icon.svg" alt="" width={16} height={16} data-tauri-drag-region />
      <span data-tauri-drag-region>showFPS</span>
      <div className="tb-btns">
        <button title={L("Simge durumuna küçült", "Minimize")} onClick={() => w.minimize()}><Minus size={15} /></button>
        <button title={max ? L("Önceki boyut", "Restore") : L("Büyüt", "Maximize")} onClick={() => w.toggleMaximize()}>{max ? <Copy size={13} /> : <Square size={13} />}</button>
        <button className="tb-close" title={L("Kapat", "Close")} onClick={close}><X size={16} /></button>
      </div>
    </header>
  );
}
