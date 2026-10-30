import { useState, type PointerEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { HISTORY_SECONDS as HISTORY } from "../history";
import { isIdle, metricLevel, METRIC_COLORS, METRIC_DEFS, type Level } from "../metrics";
import type { MetricId, OverlaySettings, Telemetry } from "../types";
import { L, percent } from "../i18n";

const num = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const r0 = (v: number) => Math.round(v).toString();
const pctOf = (u?: number | null, tot?: number | null) => (num(u) && num(tot) && tot > 0 ? (u / tot) * 100 : null);

interface TileDef {
  id: MetricId;
  label: string;
  /** Grafik serisi; null = o saniye veri yok. */
  series: (t: Telemetry) => number | null;
  value: (t: Telemetry) => { v: string; unit: string } | null;
  sub?: (t: Telemetry) => string | null;
  fmt: (v: number) => string;
  /** Yüzdeler 0–100'de sabit; diğerleri verinin aralığına uyar. */
  fixed?: [number, number];
}

/** FPS kartlarında sayının neden anlamsız olduğunu söyleyen not (panel ön planda ya da uygulama boşta). */
function fpsNote(t: Telemetry): string | null {
  if (t.fpsPanel) return L("Oyuna geçince ölçülür", "Measured in game"); // panel ön planda; kartta kısa olmalı
  if (isIdle(t)) return `${L("boşta (ekran değişmiyor)", "idle (screen not changing)")}${t.fpsProcess ? ` · ${t.fpsProcess}` : ""}`;
  return null;
}

const TILES: TileDef[] = [
  {
    id: "fps", label: "FPS", series: (t) => t.fps ?? null,
    value: (t) => (num(t.fps) ? { v: r0(t.fps), unit: "FPS" } : null),
    sub: (t) => fpsNote(t) ?? ([num(t.avgFps) && `${L("ort", "avg")} ${r0(t.avgFps)}`, num(t.fps1Low) && `${percent(1)} ${r0(t.fps1Low)}`, t.fpsProcess].filter(Boolean).join(" · ") || null),
    fmt: (v) => `${r0(v)} FPS`,
  },
  {
    id: "frametime", label: "Frametime", series: (t) => t.frametime ?? null,
    value: (t) => (num(t.frametime) ? { v: t.frametime.toFixed(1), unit: "ms" } : null),
    sub: (t) => fpsNote(t) ?? (num(t.fpsMin) ? `${L("en düşük", "min")} ${r0(t.fpsMin)} FPS` : null),
    fmt: (v) => `${v.toFixed(1)} ms`,
  },
  {
    id: "cpuLoad", get label() { return L("CPU kullanımı", "CPU usage"); }, series: (t) => t.cpuLoad ?? null, fixed: [0, 100],
    value: (t) => (num(t.cpuLoad) ? { v: r0(t.cpuLoad), unit: "%" } : null), fmt: (v) => percent(r0(v)),
  },
  {
    id: "cpuTemp", get label() { return L("CPU sıcaklığı", "CPU temperature"); }, series: (t) => t.cpuTemp ?? null,
    value: (t) => (num(t.cpuTemp) ? { v: r0(t.cpuTemp), unit: "°C" } : null), fmt: (v) => `${r0(v)} °C`,
  },
  {
    id: "gpuLoad", get label() { return L("GPU kullanımı", "GPU usage"); }, series: (t) => t.gpuLoad ?? null, fixed: [0, 100],
    value: (t) => (num(t.gpuLoad) ? { v: r0(t.gpuLoad), unit: "%" } : null), fmt: (v) => percent(r0(v)),
  },
  {
    id: "gpuTemp", get label() { return L("GPU sıcaklığı", "GPU temperature"); }, series: (t) => t.gpuTemp ?? null,
    value: (t) => (num(t.gpuTemp) ? { v: r0(t.gpuTemp), unit: "°C" } : null), fmt: (v) => `${r0(v)} °C`,
  },
  {
    id: "ram", label: "RAM", series: (t) => pctOf(t.ramUsedMb, t.ramTotalMb), fixed: [0, 100],
    // Toplam alt satırda: kadranın yanında "12.1 / 32 GB" sığmıyor.
    value: (t) => (num(t.ramUsedMb) ? { v: (t.ramUsedMb / 1024).toFixed(1), unit: "GB" } : null),
    sub: (t) => { const p = pctOf(t.ramUsedMb, t.ramTotalMb); return p == null ? null : `${r0(t.ramTotalMb! / 1024)} GB · ${L(`%${r0(p)} dolu`, `${r0(p)}% used`)}`; },
    fmt: (v) => percent(r0(v)),
  },
  {
    id: "vram", label: "VRAM", series: (t) => pctOf(t.vramUsedMb, t.vramTotalMb), fixed: [0, 100],
    // Toplam alt satırda: kadranın yanında "12.1 / 32 GB" sığmıyor.
    value: (t) => (num(t.vramUsedMb) ? { v: (t.vramUsedMb / 1024).toFixed(1), unit: "GB" } : null),
    sub: (t) => { const p = pctOf(t.vramUsedMb, t.vramTotalMb); return p == null ? null : `${r0(t.vramTotalMb! / 1024)} GB · ${L(`%${r0(p)} dolu`, `${r0(p)}% used`)}`; },
    fmt: (v) => percent(r0(v)),
  },
];

/** Kadran gösterilen kartlar: yüzde ya da 0–100 °C ölçekli değerler. */
const GAUGE = new Set<MetricId>(["cpuLoad", "cpuTemp", "gpuLoad", "gpuTemp", "ram", "vram"]);
const LEVEL_COLOR = { warn: "#fbbf24", crit: "#f87171" } as const;

export function MetricTiles({ t, history, overlay }: { t: Telemetry; history: Telemetry[]; overlay: OverlaySettings }) {
  return (
    <div className="tiles">
      {TILES.map((d) => (
        <Tile key={d.id} d={d} t={t} data={history.map(d.series)} level={overlay.alertsEnabled ? metricLevel(d.id, t, overlay.alerts) : "ok"} />
      ))}
    </div>
  );
}

function Tile({ d, t, data, level }: { d: TileDef; t: Telemetry; data: (number | null)[]; level: Level }) {
  const Icon: LucideIcon = METRIC_DEFS[d.id].Icon;
  // Eşik aşılınca kart kendi rengini bırakıp durum rengini alır (etiketle birlikte; yalnız renge dayanmaz).
  const color = level === "ok" ? METRIC_COLORS[d.id] : LEVEL_COLOR[level];
  const g = GAUGE.has(d.id) ? d.series(t) : null;
  const v = d.value(t);
  const sub = d.sub?.(t);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="tile">
      <div className="tile-top">
        <span className="ic"><Icon size={14} color={color} /></span>
        <span className="grow">{d.label}</span>
        {level !== "ok" && <span className={`badge ${level === "crit" ? "crit" : "warn"}`}>{level === "crit" ? L("Kritik", "Critical") : L("Uyarı", "Warning")}</span>}
      </div>
      <div className="tile-body">
        <div>
          <div className={`tile-val${v ? "" : " none"}`} title={v ? undefined : L("Veri yok (kaynak bağlı değil ya da ön planda kare üreten uygulama yok)", "No data (source not connected, or no app presenting frames in the foreground)")}>
            {v ? <>{v.v}<small>{v.unit}</small></> : "—"}
          </div>
        </div>
        {GAUGE.has(d.id) && <Gauge pct={g} color={color} />}
      </div>
      <div className="tile-sub">{sub ?? ""}</div>
      <Sparkline data={data} color={color} fixed={d.fixed} onHover={setHover} hover={hover} />
      {hover != null && data[hover] != null && (
        <span className="spark-tip">{data.length - 1 - hover === 0 ? L("şimdi", "now") : L(`${data.length - 1 - hover} sn önce`, `${data.length - 1 - hover} s ago`)}: {d.fmt(data[hover]!)}</span>
      )}
    </div>
  );
}

/** Simgedeki 270°'lik kadran. Değer değişince yay yumuşakça döner (CSS geçişi). */
function Gauge({ pct, color }: { pct: number | null; color: string }) {
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  // Merkez (28,29), yarıçap 21; 135°'den saat yönünde 270°.
  const arc = "M13.15,43.85 A21,21 0 1 1 42.85,43.85";
  return (
    <svg className="gauge" width="48" height="45" viewBox="0 0 56 52" aria-hidden>
      <path d={arc} fill="none" stroke="var(--border-strong)" strokeWidth="6" strokeLinecap="round" />
      {pct != null && (
        <path d={arc} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" pathLength={100}
          strokeDasharray={`${p} 100`} style={{ transition: "stroke-dasharray .6s ease, stroke .3s" }} />
      )}
    </svg>
  );
}

const W = 200, H = 38, PAD = 3;

function Sparkline({ data, color, fixed, hover, onHover }: {
  data: (number | null)[]; color: string; fixed?: [number, number];
  hover: number | null; onHover: (i: number | null) => void;
}) {
  const vals = data.filter(num);
  if (vals.length < 2) return <div className="spark-wrap"><svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden /></div>;

  let [lo, hi] = fixed ?? [Math.min(...vals), Math.max(...vals)];
  if (!fixed) {
    const span = Math.max(hi - lo, Math.abs(hi) * 0.1, 1); // düz çizgide gürültüyü büyütme
    lo -= span * 0.15;
    hi += span * 0.15;
  }
  // Yeni örnek sağdan girer. 60 sn dolana kadar mevcut örnekler tüm genişliğe yayılır
  // (yoksa ilk saniyelerde sağ köşede kopuk bir çizgi kalıyordu).
  const span = Math.min(Math.max(data.length - 1, 1), HISTORY - 1);
  const x = (i: number) => W - ((data.length - 1 - i) / span) * W;
  const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD);

  // Veri olmayan saniyelerde çizgi kopar; boşluk uydurma değerle doldurulmaz.
  const segs: string[] = [];
  let cur = "";
  data.forEach((v, i) => {
    if (num(v)) cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    else if (cur) { segs.push(cur); cur = ""; }
  });
  if (cur) segs.push(cur);
  const line = segs.join("");
  const area = segs.map((s) => {
    const pts = s.slice(1).split(/[ML]/).map((p) => p.split(",").map(Number));
    return `${s}L${pts[pts.length - 1][0]},${H}L${pts[0][0]},${H}Z`;
  }).join("");

  const last = data.length - 1;
  const gid = `g${color.slice(1)}`;
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(last - ((W - px) / W) * span);
    onHover(i >= 0 && i <= last ? i : null);
  };

  // SVG genişliğe esnediği için nokta SVG'de daire kalmaz; HTML öğesi olarak konumlanır.
  const dot = hover ?? last;
  return (
    <div className="spark-wrap">
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerMove={move} onPointerLeave={() => onHover(null)} role="img" aria-label={L("Son 60 saniye", "Last 60 seconds")}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".22" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="2 2" />}
      </svg>
      {num(data[dot]) && <span className="spark-dot" style={{ left: `${(x(dot) / W) * 100}%`, top: y(data[dot]!), background: color }} />}
    </div>
  );
}
