import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "./styles.css";
import { initStore } from "./store";
import { OverlayPage } from "./overlay/OverlayPage";
import { ControlPanel } from "./panel/ControlPanel";

const isOverlay = location.hash === "#/overlay";
if (isOverlay) document.documentElement.classList.add("overlay-root");

// Windows 11'de ana pencere Mica ile açılır; arka plan şeffaf olmalı ki Mica görünsün.
async function detectMica() {
  if (isOverlay || !("__TAURI_INTERNALS__" in window)) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const info = await invoke<{ mica: boolean }>("window_info");
    if (info.mica) document.documentElement.classList.add("mica");
  } catch { /* Mica yok: aurora gradyanı kalır */ }
}

Promise.all([initStore(), detectMica()])
  .catch((e) => console.error(e))
  .finally(() => {
    createRoot(document.getElementById("root")!).render(isOverlay ? <OverlayPage /> : <ControlPanel />);
  });
