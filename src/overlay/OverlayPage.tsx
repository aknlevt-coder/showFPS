import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, availableMonitors, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";
import { isTauri } from "../backend";
import { activeProfile, getState, update, useAppState } from "../store";
import { useHistory } from "../history";
import { useTelemetry } from "../telemetry";
import { Overlay } from "./Overlay";
import { useRecentFrames } from "./recentFrames";
import { anchorPosition, clampInto, pickArea } from "./placement";

export function OverlayPage() {
  const s = useAppState();
  const p = activeProfile(s);
  const t = useTelemetry(s.app.demoData);
  const history = useHistory(t);
  const frames = useRecentFrames(p.overlay.graph === "frametime");
  const ref = useRef<HTMLDivElement>(null);

  // Kilitliyse tıklama geçirgen; kilit açıksa düzenleme (sürükleme) modu.
  useEffect(() => {
    if (!isTauri) return;
    invoke("set_overlay_locked", { locked: s.locked }).catch(console.error);
  }, [s.locked]);

  // Pencere boyutunu içeriğe uydur.
  useEffect(() => {
    const el = ref.current;
    if (!el || !isTauri) return;
    const win = getCurrentWindow();
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      win.setSize(new LogicalSize(Math.ceil(r.width) + 2, Math.ceil(r.height) + 2)).catch(() => {});
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Yerleşim: hazır konum (çapa) ya da fareyle sürüklenmiş özel konum. Her durumda pencere,
  // bulunduğu monitörün çalışma alanında (görev çubuğu hariç) tutulur; ekran dışına çıkamaz.
  const placeRef = useRef<(fromDrag?: boolean) => Promise<void>>();
  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWindow();
    let dead = false;
    let moveTimer: number | undefined, sizeTimer: number | undefined;
    const uns: (() => void)[] = [];
    // Kendi setPosition çağrımızın onMoved olayı kullanıcı sürüklemesi sanılmasın.
    let expected: { x: number; y: number } | null = null;
    const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2;

    const moveTo = async (p: { x: number; y: number }) => {
      expected = p;
      await win.setPosition(new PhysicalPosition(p.x, p.y));
    };

    const place = async (fromDrag = false) => {
      const [pos, size, mons] = await Promise.all([win.outerPosition(), win.outerSize(), availableMonitors()]);
      if (dead || !mons.length) return;
      const rect = { x: pos.x, y: pos.y, w: size.width, h: size.height };
      const areas = mons.map((m) => ({ x: m.workArea.position.x, y: m.workArea.position.y, w: m.workArea.size.width, h: m.workArea.size.height }));
      const i = pickArea(rect, areas);
      const st = getState();
      const anchored = st.overlayAnchor && !fromDrag;
      const target = anchored
        ? anchorPosition(st.overlayAnchor!, rect.w, rect.h, areas[i], Math.round(st.overlayMargin * mons[i].scaleFactor))
        : clampInto(rect, areas[i]);
      if (!anchored) {
        // Sürükleme hazır konumu bırakır; özel konum ekrana sığdırılmış haliyle kaydedilir.
        const cur = st.overlayPosition;
        if (st.overlayAnchor || !cur || cur.x !== target.x || cur.y !== target.y) {
          update((x) => ({ ...x, overlayAnchor: null, overlayPosition: target }));
        }
      }
      if (target.x !== pos.x || target.y !== pos.y) await moveTo(target);
    };
    placeRef.current = place;

    (async () => {
      const st = getState();
      if (!st.overlayAnchor && st.overlayPosition) await moveTo(st.overlayPosition);
      await place();
      uns.push(await win.onMoved(({ payload }) => {
        window.clearTimeout(moveTimer);
        moveTimer = window.setTimeout(() => {
          if (expected && near(payload, expected)) { expected = null; return; }
          expected = null;
          place(true).catch(console.error);
        }, 250);
      }));
      // İçerik büyüyünce (gösterge eklenince) çapaya göre yeniden hizala ya da ekrana sığdır.
      uns.push(await win.onResized(() => {
        window.clearTimeout(sizeTimer);
        sizeTimer = window.setTimeout(() => place().catch(console.error), 120);
      }));
      if (dead) uns.forEach((u) => u());
    })().catch(console.error);
    return () => { dead = true; uns.forEach((u) => u()); window.clearTimeout(moveTimer); window.clearTimeout(sizeTimer); };
  }, []);

  // Panelden hazır konum ya da boşluk değişince uygula.
  useEffect(() => {
    if (s.overlayAnchor) placeRef.current?.().catch(console.error);
  }, [s.overlayAnchor, s.overlayMargin]);

  return <Overlay ref={ref} settings={p.overlay} t={t} demo={s.app.demoData} editing={!s.locked} history={history} recording={s.recording} frames={frames} />;
}
