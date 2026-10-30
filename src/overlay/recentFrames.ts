import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "../backend";

const WINDOW_MS = 3000; // overlay grafiğinde son 3 saniyenin kareleri

/** Yardımcının ham olaylarından son ~3 sn'nin kare süreleri (panel "frames on" istediğinde gelir). */
export function useRecentFrames(enabled: boolean): number[] {
  const [frames, setFrames] = useState<number[]>([]);
  useEffect(() => {
    if (!isTauri || !enabled) { setFrames([]); return; }
    const un = listen<{ frames?: number[] | null }>("telemetry", (e) => {
      const f = e.payload.frames;
      if (!Array.isArray(f)) return;
      setFrames((prev) => {
        const next = [...prev, ...f];
        let total = 0, start = next.length;
        while (start > 0 && total + next[start - 1] <= WINDOW_MS) total += next[--start];
        return next.slice(start);
      });
    });
    return () => { un.then((u) => u()); };
  }, [enabled]);
  return frames;
}
