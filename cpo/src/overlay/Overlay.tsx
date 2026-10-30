import { forwardRef, type CSSProperties } from "react";
import { formatMetric, hexToRgba, metricLevel, METRIC_DEFS } from "../metrics";
import type { OverlayFont, OverlaySettings, Telemetry } from "../types";
import { L } from "../i18n";

interface Props {
  settings: OverlaySettings;
  t: Telemetry;
  demo: boolean;
  editing?: boolean;
  /** Son 60 sn; yalnızca mini grafik açıkken gerekir. */
  history?: Telemetry[];
  /** Süren oturum kaydı: köşede "● KAYIT 02:13". */
  recording?: { since: number } | null;
  /** Son ~3 sn'nin kare süreleri (ms); frametime grafiği bunlarla kare kare çizilir. */
  frames?: number[];
}

export const FONTS: Record<OverlayFont, string> = {
  sans: '"Manrope Variable", "Segoe UI", sans-serif',
  mono: '"Cascadia Mono", Consolas, monospace',
  condensed: '"Bahnschrift SemiCondensed", Bahnschrift, "Arial Narrow", sans-serif',
};

// Durum renkleri ayrılmıştır, gösterge renkleriyle karışmaz.
const LEVEL_COLOR = { warn: "#fbbf24", crit: "#f87171" } as const;

const elapsed = (since: number) => {
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const p = (x: number) => String(x).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` : `${p(Math.floor(s / 60))}:${p(s % 60)}`;
};

/** Hem gerçek overlay penceresinde hem de önizlemede kullanılan aynı bileşen. */
export const Overlay = forwardRef<HTMLDivElement, Props>(function Overlay({ settings: s, t, demo, editing, history, recording, frames }, ref) {
  // Kare verisi gelmiyorsa (FPS ölçümü yok / önizleme) saniyelik frametime'a düşer.
  const perFrame = s.graph === "frametime" && !!frames && frames.length > 1;
  const k = s.scale;
  const items = s.metrics.filter((m) => m.enabled);
  const bg = hexToRgba(s.bgColor, s.bgOpacity);
  const style = {
    "--k": k,
    background: s.surface === "glass"
      ? `linear-gradient(135deg, rgba(255,255,255,.16), rgba(255,255,255,.03)), ${bg}`
      : bg,
    color: s.textColor,
    fontFamily: FONTS[s.font],
    borderRadius: s.radius * k,
    fontSize: s.fontSize * k,
    fontWeight: s.fontWeight,
    gap: s.gap * k,
    border: s.outline || s.surface === "glass" ? `1px solid ${hexToRgba(s.textColor, s.surface === "glass" ? 0.28 : 0.22)}` : undefined,
  } as CSSProperties;
  const showLabel = s.showLabels || s.layout === "card" || s.layout === "detailed";
  const cls = [
    "ov", `ov-${s.layout}`,
    editing && "ov-editing",
    s.glow && "ov-glow",
    s.textShadow && "ov-shadow",
    s.surface === "glass" && "ov-glass",
    !s.showIcons && "ov-noicon",
  ].filter(Boolean).join(" ");
  // "Yalnızca ikon + değer" birimi gizler; ikon da yoksa sayılar birimsiz kalmasın.
  const showUnit = s.layout !== "iconOnly" || !s.showIcons;

  return (
    <div ref={ref} data-tauri-drag-region={editing ? "" : undefined} className={cls} style={style}>
      {demo && <span className="ov-demo">DEMO</span>}
      {recording && <span className="ov-rec" title={L("Oturum kaydediliyor", "Recording session")}>● {L("KAYIT", "REC")} {elapsed(recording.since)}</span>}
      {items.length === 0 && s.graph === "off" && <span className="ov-empty">{L("Gösterge seçilmedi", "No metrics selected")}</span>}
      {items.map((m) => {
        const def = METRIC_DEFS[m.id];
        const f = formatMetric(m.id, t);
        const level = s.alertsEnabled ? metricLevel(m.id, t, s.alerts) : "ok";
        const Icon = def.Icon;
        const valueColor = level !== "ok" ? LEVEL_COLOR[level] : s.valueColor === "metric" ? m.color : undefined;
        return (
          <div
            key={m.id}
            className={`ov-item${level === "crit" ? " ov-crit" : ""}`}
            title={f ? `${def.label}${level !== "ok" ? (level === "crit" ? L(" — kritik", " — critical") : L(" — uyarı", " — warning")) : ""}` : `${def.label}: ${L("veri yok", "no data")}`}
            style={{ gap: (s.gap / 2) * k }}
          >
            {s.showIcons && <Icon size={s.iconSize * k} color={m.color} style={{ color: m.color }} strokeWidth={2.2} />}
            {showLabel && <span className="ov-label">{def.short}</span>}
            <span className="ov-value" style={{ color: valueColor }}>
              {f ? f.value : "—"}
              {f && showUnit && <small>{f.unit}</small>}
            </span>
            {s.layout === "detailed" && f?.pct != null && (
              <i className="ov-bar">
                <b style={{ width: `${Math.min(100, Math.max(0, f.pct))}%`, background: valueColor ?? m.color }} />
              </i>
            )}
          </div>
        );
      })}
      {s.graph !== "off" && (
        <OverlayGraph
          values={perFrame ? frames! : (history ?? []).map((h) => (s.graph === "fps" ? h.fps : h.frametime) ?? null)}
          perFrame={perFrame}
          color={s.metrics.find((m) => m.id === s.graph)?.color ?? "#4ade80"}
          label={s.graph === "fps" ? "FPS" : "FT"}
          k={k}
          fontSize={s.fontSize}
          wide={s.layout === "detailed" || s.layout === "vertical"}
        />
      )}
    </div>
  );
});

const N = 60;

/**
 * Son 60 saniyenin FPS ya da frametime çizgisi; veri olmayan saniyelerde çizgi kopar.
 * perFrame: değerler tek tek kareler (son ~3 sn); tüm genişliğe yayılır, takılmalar sivri tepe olur.
 */
function OverlayGraph({ values, color, label, k, fontSize, wide, perFrame }: {
  values: (number | null)[]; color: string; label: string; k: number; fontSize: number; wide: boolean; perFrame?: boolean;
}) {
  const w = 72, h = 24;
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  let lo = Math.min(...nums), hi = Math.max(...nums);
  const span = Math.max(hi - lo, hi * 0.1, 1);
  lo -= span * 0.1;
  hi += span * 0.1;
  const steps = perFrame ? Math.max(values.length - 1, 1) : Math.min(Math.max(values.length - 1, 1), N - 1); // dolana kadar tüm genişlik
  const x = (i: number) => w - ((values.length - 1 - i) / steps) * w;
  const y = (v: number) => 2 + (1 - (v - lo) / (hi - lo)) * (h - 4);
  let d = "", pen = false;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return (
    <div className="ov-item ov-graph" title={`${label}: ${L("son 60 saniye", "last 60 seconds")}`} style={{ gap: 4 * k }}>
      <span className="ov-label">{label}</span>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ width: wide ? "100%" : w * k * (fontSize / 14), height: h * k * (fontSize / 14), minWidth: w * k * 0.8 }}
      >
        <line x1="0" x2={w} y1={h - 0.5} y2={h - 0.5} stroke="currentColor" strokeOpacity=".15" vectorEffect="non-scaling-stroke" />
        {nums.length >= 2 && <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
      </svg>
    </div>
  );
}
