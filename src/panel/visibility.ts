// Panel penceresinin görünürlüğü. Tauri pencereyi gizleyince WebView2'ye bildirmiyor; sayfa çizmeye
// devam ediyordu (ölçüm: gizli panel ~95 MB, CPU'nun %0,9'u + GPU yükü). Gizliyken arayüz çizilmez;
// otomasyon kancaları (oyun algılama, otomatik profil, kısayollar) çalışmaya devam eder.
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../backend";

const HIDDEN = "cpo-panel-hidden";

/** Paneli gizler ve arayüzün çizimi bırakmasını sağlar (tepsiye inme). */
export async function hidePanel() {
  await getCurrentWindow().hide();
  window.dispatchEvent(new Event(HIDDEN));
}

export function usePanelVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!isTauri) return;
    const w = getCurrentWindow();
    const check = () => { w.isVisible().then(setVisible).catch(() => {}); };
    check(); // otomatik başlatmada panel gizli açılır
    // Rust paneli her gösterişinde (tepsi, kısayol, ikinci kopya) haber verir. Yalnız odağa güvenmek
    // yetmiyordu: oturum açılışında Windows odağı vermeyince panel görev çubuğunda boş kalıyordu.
    const unShown = listen("panel-shown", () => setVisible(true));
    const unFocus = w.onFocusChanged(check);
    const onHidden = () => setVisible(false);
    window.addEventListener(HIDDEN, onHidden);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      unShown.then((f) => f());
      unFocus.then((f) => f());
      window.removeEventListener(HIDDEN, onHidden);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return visible;
}
