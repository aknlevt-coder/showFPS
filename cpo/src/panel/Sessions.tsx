// Oturumlar: kayıtlı oyun oturumlarının listesi ve raporu (özet, grafikler, CSV).
import { useEffect, useMemo, useState, type PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, Download, History, Trash2 } from "lucide-react";
import { isTauri } from "../backend";
import { MIN_SESSION_SEC, type SessionData, type SessionSample, type SessionSummary } from "../session";
import { prettyHotkey } from "../hotkeys";
import { useAppState } from "../store";
import { Card } from "./ui";
import { L, lang, locale } from "../i18n";

const fmtNum = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toFixed(d));
const fmtDur = (sec: number) => {
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = Math.floor(sec % 60);
  return lang() === "en"
    ? (h ? `${h} h ${m} min` : m ? `${m} min ${s} s` : `${s} s`)
    : (h ? `${h} sa ${m} dk` : m ? `${m} dk ${s} sn` : `${s} sn`);
};
const fmtDate = (iso: string) => new Date(iso).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" });

export function SessionsPage() {
  const s = useAppState();
  const [list, setList] = useState<SessionSummary[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = () => {
    if (!isTauri) { setList([]); return; }
    invoke<SessionSummary[]>("list_sessions").then(setList).catch((e) => setErr(String(e)));
  };
  // Kayıt bitince liste yenilensin (recording null olunca).
  useEffect(load, [s.recording === null]);

  const remove = async (id: string) => {
    if (!confirm(L("Bu oturum kalıcı olarak silinsin mi?", "Delete this session permanently?"))) return;
    await invoke("delete_session", { id }).catch((e) => setErr(String(e)));
    if (open === id) setOpen(null);
    load();
  };

  if (open) return <SessionDetail id={open} onBack={() => setOpen(null)} onDelete={() => remove(open)} />;

  return (
    <Card title={L("Kayıtlı oturumlar", "Saved sessions")} icon={History} actions={list && <span className="chip"><b>{list.length}</b> / 50</span>}>
      {s.recording && <p className="hint warn-note" style={{ marginTop: 0 }}>{L("Şu an kayıt sürüyor", "Recording now")}{s.recording.game ? ` (${s.recording.game})` : ""}. {L("Bitince burada görünür.", "It will show up here when it ends.")}</p>}
      {err && <p className="hint err">{err}</p>}
      {list && list.length === 0 && (
        <p className="hint" style={{ marginTop: 0 }}>
          {L("Henüz kayıt yok.", "No sessions yet.")}{" "}
          {s.app.autoRecord
            ? L("Oyun algılandığında kayıt otomatik başlar ve oyundan çıkınca biter.", "Recording starts when a game is detected and ends when you leave it.")
            : L("Otomatik kayıt kapalı (Uygulama ayarları).", "Automatic recording is off (Settings).")}{" "}
          {L(`Elle başlatıp bitirmek için ${prettyHotkey(s.app.hotkeys.toggleRecord)}. ${MIN_SESSION_SEC} saniyeden kısa oturumlar kaydedilmez.`,
            `Press ${prettyHotkey(s.app.hotkeys.toggleRecord)} to start or stop manually. Sessions shorter than ${MIN_SESSION_SEC} seconds are not saved.`)}
        </p>
      )}
      {list && list.length > 0 && (
        <table className="sessions">
          <thead>
            <tr><th>{L("Oyun", "Game")}</th><th>{L("Tarih", "Date")}</th><th>{L("Süre", "Duration")}</th><th title={L("Tüm karelerden, zaman ağırlıklı", "From all frames, time-weighted")}>{L("Ort. FPS", "Avg FPS")}</th><th title={L("99. yüzdelik frametime", "99th percentile frametime")}>{L("%1 düşük", "1% low")}</th><th>{L("Takılma", "Stutters")}</th><th>{L("En yüksek °C", "Max °C")}<br /><small>CPU / GPU</small></th><th /></tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.id} onClick={() => setOpen(x.id)} className="clickable">
                <td><b>{x.game ?? L("Elle kayıt", "Manual recording")}</b>{x.manual && <span className="badge" style={{ marginLeft: 6 }}>{L("elle", "manual")}</span>}</td>
                <td>{fmtDate(x.start)}</td>
                <td>{fmtDur(x.durationSec)}</td>
                <td className="numc">{fmtNum(x.avgFps)}</td>
                <td className="numc">{fmtNum(x.low1)}</td>
                <td className="numc">{fmtNum(x.stutters)}</td>
                <td className="numc">{fmtNum(x.maxCpuTemp)} / {fmtNum(x.maxGpuTemp)}</td>
                <td style={{ width: 1 }}>
                  <button className="icon" title={L("Sil", "Delete")} aria-label={L("Oturumu sil", "Delete session")} onClick={(e) => { e.stopPropagation(); remove(x.id); }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">{L("Son 50 oturum saklanır; daha eskileri otomatik silinir. Bir satıra tıklayınca rapor açılır.", "The last 50 sessions are kept; older ones are deleted automatically. Click a row to open its report.")}</p>
    </Card>
  );
}

function SessionDetail({ id, onBack, onDelete }: { id: string; onBack: () => void; onDelete: () => void }) {
  const [d, setD] = useState<SessionData | null>(null);
  const [sum, setSum] = useState<SessionSummary | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    invoke<SessionData>("get_session", { id }).then(setD).catch((e) => setMsg(String(e)));
    invoke<SessionSummary[]>("list_sessions").then((l) => setSum(l.find((x) => x.id === id) ?? null)).catch(() => {});
  }, [id]);

  const exportCsv = async (kind: "samples" | "frames") => {
    if (!d) return;
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: `${d.id}-${kind === "samples" ? L("saniyelik", "per-second") : L("kareler", "frames")}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }] });
    if (!path) return;
    const contents = kind === "samples" ? samplesCsv(d.samples) : framesCsv(d.frames);
    await invoke("write_csv", { path, contents }).then(() => setMsg(`${L("Kaydedildi", "Saved")}: ${path}`)).catch((e) => setMsg(`${L("Kaydedilemedi", "Could not save")}: ${e}`));
  };

  if (!d) return <Card><p className="hint">{msg || L("Yükleniyor…", "Loading…")}</p></Card>;
  const s = d.samples;
  const sec = s.map((x) => x.t);

  return (
    <>
      <div className="detail-head">
        <button className="btn ghost" onClick={onBack}><ArrowLeft size={14} /> {L("Oturumlar", "Sessions")}</button>
        <div className="grow">
          <b>{d.game ?? L("Elle kayıt", "Manual recording")}</b>
          <span className="hint" style={{ margin: 0 }}> · {fmtDate(d.start)} · {sum ? fmtDur(sum.durationSec) : ""}</span>
        </div>
        <button className="btn ghost" onClick={() => exportCsv("samples")}><Download size={14} /> {L("Saniyelik CSV", "Per-second CSV")}</button>
        <button className="btn ghost" disabled={!d.frames.length} onClick={() => exportCsv("frames")}><Download size={14} /> {L("Kare süreleri CSV", "Frame times CSV")}</button>
        <button className="btn danger" onClick={onDelete}><Trash2 size={14} /> {L("Sil", "Delete")}</button>
      </div>
      {msg && <p className="hint">{msg}</p>}

      {sum && (
        <div className="stat-row">
          <Stat label={L("Ortalama FPS", "Average FPS")} value={fmtNum(sum.avgFps)} hint={L("Tüm karelerden, zaman ağırlıklı", "From all frames, time-weighted")} />
          <Stat label={L("%1 düşük", "1% low")} value={fmtNum(sum.low1)} hint={L("99. yüzdelik frametime'ın FPS karşılığı", "FPS equivalent of the 99th percentile frametime")} />
          <Stat label={L("%0,1 düşük", "0.1% low")} value={fmtNum(sum.low01)} hint={L("99,9. yüzdelik: seyrek büyük takılmaları gösterir", "99.9th percentile: shows rare big hitches")} />
          <Stat label={L("Takılma", "Stutters")} value={fmtNum(sum.stutters)} hint={L("Ortanca frametime'ın 2,5 katından uzun kare", "Frames longer than 2.5× the median frametime")} />
          <Stat label={L("En yüksek CPU", "Max CPU")} value={sum.maxCpuTemp == null ? "—" : `${fmtNum(sum.maxCpuTemp)} °C`} />
          <Stat label={L("En yüksek GPU", "Max GPU")} value={sum.maxGpuTemp == null ? "—" : `${fmtNum(sum.maxGpuTemp)} °C`} />
          <Stat label={L("En yüksek GPU gücü", "Max GPU power")} value={sum.maxGpuPower == null ? "—" : `${fmtNum(sum.maxGpuPower)} W`} />
          <Stat label={L("Kare sayısı", "Frames")} value={sum.frameCount ? sum.frameCount.toLocaleString(locale()) : "—"} />
        </div>
      )}
      {!d.frames.length && <p className="hint warn-note">{L("Bu oturumda kare verisi yok (FPS ölçümü yönetici yetkisi ister). FPS değerleri saniyelik örneklerden.", "No per-frame data in this session (FPS measurement needs administrator rights). FPS values come from per-second samples.")}</p>}

      <Card title={L("FPS (saniyelik)", "FPS (per second)")}>
        <LineChart x={sec} unit="FPS" series={[{ name: "FPS", color: "#4ade80", values: s.map((x) => x.fps) }]} />
      </Card>
      {d.frames.length > 0 && (
        <Card title={L("Frametime (kare kare)", "Frametime (per frame)")} actions={<span className="chip">{L("Her dilimde en uzun kare: takılmalar kaybolmaz", "Longest frame per slice, so stutters stay visible")}</span>}>
          <FrametimeChart frames={d.frames} />
        </Card>
      )}
      <Card title={L("Sıcaklıklar", "Temperatures")}>
        <LineChart x={sec} unit="°C" series={[
          { name: "CPU", color: "#fb923c", values: s.map((x) => x.cpuTemp) },
          { name: "GPU", color: "#a78bfa", values: s.map((x) => x.gpuTemp) },
          { name: L("GPU bellek", "GPU memory"), color: "#f472b6", values: s.map((x) => x.vramTemp) },
        ]} />
      </Card>
      <Card title={L("Kullanım", "Usage")}>
        <LineChart x={sec} unit="%" fixed={[0, 100]} series={[
          { name: "CPU", color: "#f97316", values: s.map((x) => x.cpuLoad) },
          { name: "GPU", color: "#c084fc", values: s.map((x) => x.gpuLoad) },
        ]} />
      </Card>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="stat" title={hint}><span>{label}</span><b>{value}</b></div>;
}

// Türkçe Excel ; ayraç ve ondalık virgül bekler, İngilizce , ve nokta.
const csvSep = () => L(";", ",");
const csvRow = (xs: (string | number | null)[]) => xs.map((x) => (x == null ? "" : lang() === "en" ? String(x) : String(x).replace(".", ","))).join(csvSep());

/** Excel'in dil ayarına uygun: Türkçede ; ve ondalık virgül. */
function samplesCsv(s: SessionSample[]): string {
  const head = lang() === "en"
    ? ["second", "fps", "frametime_ms", "cpu_temp", "gpu_temp", "gpu_mem_temp", "cpu_usage", "gpu_usage", "cpu_power_w", "gpu_power_w", "ram_pct", "vram_pct"]
    : ["saniye", "fps", "frametime_ms", "cpu_sicaklik", "gpu_sicaklik", "gpu_bellek_sicaklik", "cpu_kullanim", "gpu_kullanim", "cpu_guc_w", "gpu_guc_w", "ram_yuzde", "vram_yuzde"];
  return [head.join(csvSep()), ...s.map((x) => csvRow([x.t, x.fps, x.frametime, x.cpuTemp, x.gpuTemp, x.vramTemp, x.cpuLoad, x.gpuLoad, x.cpuPower, x.gpuPower, x.ramPct, x.vramPct]))].join("\r\n");
}

function framesCsv(f: number[]): string {
  let t = 0;
  return [L("kare;zaman_ms;frametime_ms", "frame,time_ms,frametime_ms"), ...f.map((ms, i) => { t += ms; return csvRow([i + 1, Math.round(t * 100) / 100, ms]); })].join("\r\n");
}

// ---------- Grafikler ----------
const CW = 800, CH = 180, PL = 40, PR = 10, PT = 8, PB = 22;

interface Series { name: string; color: string; values: (number | null)[] }

/** Çok serili çizgi grafiği: ortak tek eksen, 2 px çizgi, crosshair + ipucu, ≥2 seride açıklama. */
function LineChart({ x, series, unit, fixed }: { x: number[]; series: Series[]; unit: string; fixed?: [number, number] }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = series.filter((s) => s.values.some((v) => v != null));
  if (x.length < 2 || !shown.length) return <p className="hint" style={{ marginTop: 0 }}>{L("Veri yok.", "No data.")}</p>;
  const all = shown.flatMap((s) => s.values).filter((v): v is number => v != null);
  let [lo, hi] = fixed ?? [Math.min(...all), Math.max(...all)];
  if (!fixed) { const pad = Math.max((hi - lo) * 0.1, 1); lo = Math.max(0, lo - pad); hi += pad; }
  const xMax = x[x.length - 1] || 1;
  const px = (t: number) => PL + (t / xMax) * (CW - PL - PR);
  const py = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (CH - PT - PB);
  const path = (vals: (number | null)[]) => {
    let d = "", pen = false;
    vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${px(x[i]).toFixed(1)},${py(v).toFixed(1)}`; pen = true; });
    return d;
  };
  const ticks = [lo, (lo + hi) / 2, hi];
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = (((e.clientX - r.left) / r.width) * CW - PL) / (CW - PL - PR) * xMax;
    let best = 0; x.forEach((v, i) => { if (Math.abs(v - t) < Math.abs(x[best] - t)) best = i; });
    setHover(best);
  };
  return (
    <div className="chart">
      {shown.length > 1 && (
        <div className="legend">{shown.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
      )}
      <div className="chart-box">
        <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" onPointerMove={move} onPointerLeave={() => setHover(null)} role="img" aria-label={shown.map((s) => s.name).join(", ")}>
          {ticks.map((v, i) => <line key={i} x1={PL} x2={CW - PR} y1={py(v)} y2={py(v)} stroke="var(--border)" vectorEffect="non-scaling-stroke" />)}
          {shown.map((s) => <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
          {hover != null && <line x1={px(x[hover])} x2={px(x[hover])} y1={PT} y2={CH - PB} stroke="var(--muted)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        </svg>
        {ticks.map((v, i) => <span key={i} className="ytick" style={{ top: `${(py(v) / CH) * 100}%` }}>{Math.round(v)}</span>)}
        <span className="xtick" style={{ left: `${(PL / CW) * 100}%` }}>0</span>
        <span className="xtick" style={{ right: `${(PR / CW) * 100}%` }}>{fmtDur(xMax)}</span>
        {hover != null && (
          // Sağ kenara yakınsa ipucu imlecin soluna geçer (kartın dışına taşmasın).
          <div className="chart-tip" style={{ left: `${(px(x[hover]) / CW) * 100}%`, transform: px(x[hover]) / CW > 0.6 ? "translateX(calc(-100% - 8px))" : undefined }}>
            <b>{fmtDur(x[hover])}</b>
            {shown.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}: {s.values[hover] == null ? "—" : `${unit === "ms" ? s.values[hover]!.toFixed(1) : Math.round(s.values[hover]!)} ${unit}`}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Kare kare frametime: kareler zaman eksenine dizilir, her piksel diliminde en uzun kare çizilir. */
function FrametimeChart({ frames }: { frames: number[] }) {
  const buckets = useMemo(() => {
    const total = frames.reduce((a, b) => a + b, 0);
    const n = Math.min(800, frames.length);
    const out = Array.from({ length: n }, () => ({ max: 0, t: 0 }));
    let t = 0;
    for (const f of frames) {
      const i = Math.min(n - 1, Math.floor((t / total) * n));
      if (f > out[i].max) out[i] = { max: f, t };
      t += f;
    }
    return { out, total };
  }, [frames]);
  const xs = buckets.out.map((_, i) => (i / buckets.out.length) * (buckets.total / 1000));
  return <LineChart x={xs} unit="ms" series={[{ name: "Frametime", color: "#38bdf8", values: buckets.out.map((b) => (b.max ? Math.round(b.max * 10) / 10 : null)) }]} />;
}
