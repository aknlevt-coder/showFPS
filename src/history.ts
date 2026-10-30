import { useEffect, useRef, useState } from "react";
import type { Telemetry } from "./types";

export const HISTORY_SECONDS = 60;

/** Son 60 saniyenin telemetrisi; saniyede bir örnek. Panel ve overlay penceresi kullanır. */
export function useHistory(t: Telemetry): Telemetry[] {
  const latest = useRef(t);
  latest.current = t;
  const [h, setH] = useState<Telemetry[]>([]);
  useEffect(() => {
    const id = window.setInterval(() => setH((p) => [...p.slice(-(HISTORY_SECONDS - 1)), latest.current]), 1000);
    return () => window.clearInterval(id);
  }, []);
  return h;
}
