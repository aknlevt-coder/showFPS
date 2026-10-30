import { useEffect, useState } from "react";
import { onTelemetry } from "./backend";
import type { Telemetry } from "./types";

const walk = (v: number | null | undefined, base: number, amp: number, min: number, max: number) =>
  Math.min(max, Math.max(min, (v ?? base) + (Math.random() - 0.5) * amp));

function demoStep(p: Telemetry): Telemetry {
  const fps = walk(p.fps, 120, 24, 40, 240);
  return {
    fps,
    avgFps: walk(p.avgFps, 115, 4, 40, 240),
    fpsMin: walk(p.fpsMin, 88, 6, 20, 200),
    fps1Low: walk(p.fps1Low, 72, 6, 15, 180),
    frametime: 1000 / fps,
    cpuTemp: walk(p.cpuTemp, 62, 4, 35, 95),
    cpuLoad: walk(p.cpuLoad, 34, 14, 2, 100),
    gpuTemp: walk(p.gpuTemp, 68, 3, 35, 92),
    gpuLoad: walk(p.gpuLoad, 82, 10, 5, 100),
    ramUsedMb: walk(p.ramUsedMb, 12000, 500, 4000, 30000),
    ramTotalMb: 32768,
    vramUsedMb: walk(p.vramUsedMb, 6500, 250, 1000, 11800),
    vramTotalMb: 12288,
    cpuClock: walk(p.cpuClock, 4600, 300, 800, 5400),
    gpuClock: walk(p.gpuClock, 2400, 120, 300, 2900),
    cpuPower: walk(p.cpuPower, 65, 10, 8, 160),
    gpuPower: walk(p.gpuPower, 180, 15, 10, 320),
    vramTemp: walk(p.vramTemp, 74, 3, 35, 105),
    fanRpm: walk(p.fanRpm, 1650, 80, 0, 3000),
  };
}

/** demo=true → rastgele örnek veri (arayüzde DEMO etiketiyle işaretlenir). demo=false → yalnızca Rust'tan gelen gerçek veri. */
export function useTelemetry(demo: boolean): Telemetry {
  const [live, setLive] = useState<Telemetry>({});
  const [fake, setFake] = useState<Telemetry>({});

  useEffect(() => {
    if (demo) return;
    let un: (() => void) | undefined;
    let dead = false;
    onTelemetry((t) => setLive((p) => ({ ...p, ...t }))).then((u) => { if (dead) u(); else un = u; });
    return () => { dead = true; un?.(); };
  }, [demo]);

  useEffect(() => {
    if (!demo) return;
    setFake((p) => demoStep(p));
    const id = window.setInterval(() => setFake((p) => demoStep(p)), 1000);
    return () => window.clearInterval(id);
  }, [demo]);

  return demo ? fake : live;
}
