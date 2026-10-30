import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Activity, Brush, Database, Download, ChevronDown, ChevronUp, Eye, FileJson, Image, LayoutDashboard, LayoutGrid,
  MonitorCog, Palette, Plus, Radar, RotateCcw, Settings, SlidersHorizontal, Sparkles, Trash2, TriangleAlert, Type, Upload, Users, Keyboard, GripVertical, Info, Move, Gamepad2, FolderOpen, AppWindow, Cpu, History,
  type LucideIcon,
} from "lucide-react";
import { isTauri, onSensorStatus, type SensorStatus } from "../backend";
import { ALERT_INFO, formatMetric, METRIC_COLORS, METRIC_DEFS } from "../metrics";
import {
  activeProfile, addGame, DEFAULT_ALERTS, DEFAULT_HOTKEYS, removeGame, selectProfileManually, updateGame, getState, moveMetric, moveMetricTo, normalizeOverlay, patchMetric, patchOverlay, resetAll, update, useAppState,
} from "../store";
import { useTelemetry } from "../telemetry";
import { Overlay } from "../overlay/Overlay";
import type { AlertMetric, LayoutMode, MetricId, OverlayFont, OverlaySettings, Telemetry } from "../types";
import { Card, Check, Color, ColorInput, Range, Row } from "./ui";
import { useHistory } from "../history";
import { useAutoProfile, useGameState } from "../automation";
import { sendNotices, useCriticalAlerts } from "../criticalAlerts";
import { useSessionRecorder } from "../session";
import { checkForUpdate, installUpdate, useAutoUpdateCheck, useUpdater } from "../updater";
import { SessionsPage } from "./Sessions";
import { accelFromEvent, prettyHotkey, useGlobalHotkeys, type HotkeyAction } from "../hotkeys";
import { MetricTiles } from "./Overview";
import { TitleBar } from "./TitleBar";
import { Welcome } from "./Welcome";
import { hidePanel, usePanelVisible } from "./visibility";
import { ANCHORS } from "../overlay/placement";
import { activeThemeId, categoryLabel, THEME_CATEGORIES, THEMES, themePatchFor } from "./themes";
import { L, locale, percent } from "../i18n";

type Section = "overview" | "editor" | "sensors" | "appearance" | "profiles" | "games" | "sessions" | "settings";

const NAV: { id: Section; label: string; desc: string; Icon: LucideIcon }[] = [
  { id: "overview", get label() { return L("Genel bakış", "Overview"); }, get desc() { return L("Canlı değerler, son 60 saniye ve veri kaynakları", "Live values, the last 60 seconds and data sources"); }, Icon: LayoutDashboard },
  { id: "editor", get label() { return L("Overlay düzenleyici", "Overlay editor"); }, get desc() { return L("Yerleşim, yazı, arka plan, stil, mini grafik ve uyarı eşikleri", "Layout, text, background, style, mini graph and alert thresholds"); }, Icon: SlidersHorizontal },
  { id: "sensors", get label() { return L("Sensör seçimi", "Sensors"); }, get desc() { return L("Overlay'de görünecek göstergeler, renkleri ve sırası", "Metrics shown on the overlay, their colours and order"); }, Icon: Radar },
  { id: "appearance", get label() { return L("Görünüm ve tema", "Appearance"); }, get desc() { return L("Panel teması ve hazır overlay temaları", "Panel theme and ready-made overlay themes"); }, Icon: Palette },
  { id: "profiles", get label() { return L("Profiller", "Profiles"); }, get desc() { return L("Farklı oyunlar ve kullanımlar için ayrı overlay ayarları", "Separate overlay settings for different games and uses"); }, Icon: Users },
  { id: "games", get label() { return L("Oyunlar", "Games"); }, get desc() { return L("Kayıtlı oyunlar ve her oyunun kullanacağı profil", "Registered games and the profile each one uses"); }, Icon: Gamepad2 },
  { id: "sessions", get label() { return L("Oturumlar", "Sessions"); }, get desc() { return L("Kaydedilen oyun oturumları: FPS, %1 düşük, takılma, sıcaklık", "Recorded game sessions: FPS, 1% low, stutters, temperatures"); }, Icon: History },
  { id: "settings", get label() { return L("Uygulama ayarları", "Settings"); }, get desc() { return L("Başlangıç, tepsi ve demo verisi", "Startup, language, tray and demo data"); }, Icon: Settings },
];

const buildDate = () => new Date(__BUILD_TIME__).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" });

const pct = (v: number) => percent(Math.round(v * 100));
const px = (v: number) => `${v} px`;

const layouts = (): [LayoutMode, string][] => [
  ["horizontal", L("Yatay kompakt", "Horizontal compact")], ["vertical", L("Dikey kompakt", "Vertical compact")], ["iconOnly", L("Yalnızca ikon + değer", "Icon + value only")],
  ["card", L("Kart düzeni", "Cards")], ["detailed", L("Detaylı panel", "Detailed panel")],
];

export function ControlPanel() {
  const s = useAppState();
  const p = activeProfile(s);
  const [section, setSection] = useState<Section>("overview");
  const t = useTelemetry(s.app.demoData);

  // Demo açıkken t sahte veridir; kaynak durumu her zaman gerçek veriden okunur.
  const live = useTelemetry(false);
  const history = useHistory(t);
  // Ana pencere hep yaşar (gizliyken de); kısayollar burada kaydedilir.
  const hotkeyErrors = useGlobalHotkeys(s.app.hotkeys);
  useAutoUpdateCheck();
  const upd = useUpdater();
  const [dragId, setDragId] = useState<MetricId | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const nav = NAV.find((n) => n.id === section)!;
  const [sensors, setSensors] = useState<SensorStatus | null>(null);
  useEffect(() => {
    let un: (() => void) | undefined;
    let dead = false;
    onSensorStatus(setSensors).then((u) => { if (dead) u(); else un = u; });
    return () => { dead = true; un?.(); };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = s.app.theme;
    // Mica'nın koyu/açık tonu pencere temasını izler.
    if (isTauri) getCurrentWindow().setTheme(s.app.theme).catch(() => {});
  }, [s.app.theme]);

  useEffect(() => {
    document.documentElement.lang = s.app.lang;
    if (isTauri) invoke("set_tray_labels", { show: L("Kontrol panelini aç", "Open control panel"), quit: L("Çıkış", "Quit") }).catch(console.error);
  }, [s.app.lang]);

  // Oyun algılama ve otomasyonlar (panel gizliyken de çalışır).
  const game = useGameState(live, s, sensors?.info?.fps === "ok");
  useAutoProfile(game, s);
  // Kritik sıcaklık bildirimi gerçek veriyle (demo açıkken de) ve aktif profilin eşikleriyle.
  useCriticalAlerts(live, p.overlay.alerts, s.app.notifyCritical, game.game);
  useSessionRecorder(live, game, s.app.autoRecord);
  // Kare süreleri yalnız gerektiğinde istenir (kayıt ya da overlay'de kare kare grafik); yardımcı yeniden
  // başlarsa (durum "running" olur) istek tekrarlanır.
  const needFrames = !!s.recording || p.overlay.graph === "frametime";
  useEffect(() => {
    if (!isTauri || sensors?.state !== "running") return;
    invoke("helper_command", { cmd: needFrames ? "frames on" : "frames off" }).catch(console.error);
  }, [needFrames, sensors?.state]);
  // Panel ön plandayken overlay "yalnızca oyunda" açık olsa da görünür: ayarlarken sonucu görmek için.
  const panelVisible = usePanelVisible();
  const own = useSelfUsage(panelVisible && section === "overview");
  const [panelFocused, setPanelFocused] = useState(true);
  useEffect(() => {
    if (!isTauri) return;
    const un = getCurrentWindow().onFocusChanged(({ payload }) => setPanelFocused(payload));
    return () => { un.then((f) => f()); };
  }, []);

  // Overlay gizle/göster: ana anahtar (kısayol) açık VE (otomatik gizleme kapalı | oyunda | panel ön planda).
  const overlayShown = s.overlayVisible && (!s.app.autoHide || game.inGame || panelFocused);
  useEffect(() => {
    if (isTauri) invoke("set_overlay_visible", { visible: overlayShown }).catch(console.error);
  }, [overlayShown]);

  // Pencere kapatılınca tepsiye in ya da çık
  useEffect(() => {
    if (!isTauri) return;
    const w = getCurrentWindow();
    const un = w.onCloseRequested(async (e) => {
      if (getState().app.minimizeToTray) { e.preventDefault(); await hidePanel(); }
      else await invoke("quit_app");
    });
    return () => { un.then((f) => f()); };
  }, []);

  // Gizli panel çizilmez (kancalar yukarıda çalışmaya devam eder).
  if (!panelVisible) return null;

  // Genel bakış ve ilk açılış rehberi aynı durum tablosunu gösterir.
  const sourcesTable = (withOwn: boolean) => (
    <table className="status">
      <tbody>
        <tr><td>{L("CPU kullanımı, RAM", "CPU usage, RAM")}</td><td>{isTauri ? <span className="badge ok">{L("Canlı", "Live")} (sysinfo)</span> : <span className="badge">{L("Yalnızca masaüstü uygulamasında", "Desktop app only")}</span>}</td></tr>
        <tr><td>{L("GPU sıcaklık/kullanım, VRAM", "GPU temperature/usage, VRAM")}</td><td><SensorBadge st={sensors} ok={live.gpuTemp != null || live.gpuLoad != null} okText={`${L("Canlı", "Live")} (LibreHardwareMonitor${sensors?.info?.gpu ? ` · ${sensors.info.gpu}` : ""})`} /></td></tr>
        <tr><td>{L("CPU sıcaklığı", "CPU temperature")}</td><td><SensorBadge st={sensors} ok={live.cpuTemp != null} okText={`${L("Canlı", "Live")} (LibreHardwareMonitor)`} cpu /></td></tr>
        <tr><td>{L("FPS, frametime, ortalama, min/%1", "FPS, frametime, average, min/1%")}</td><td><FpsBadge st={sensors} live={live} /></td></tr>
        {withOwn && own && <tr><td>{L("Bu uygulamanın tüketimi", "This app's usage")}</td><td><span className="badge">{Math.round(own.memMb)} MB RAM · {percent(own.cpu.toFixed(1))} {L("işlemci", "CPU")} · {own.processes} {L("süreç", "processes")}</span></td></tr>}
      </tbody>
    </table>
  );

  return (
    <div className="shell">
    <TitleBar />
    {!s.app.onboarded && (
      <Welcome sources={sourcesTable(false)} autostart={<AutostartSetting />} onClose={(goTo) => goTo && setSection(goTo)} />
    )}
    <div className="panel">
      <aside className="side">
        <div className="brand">
          <img className="brand-mark" src="/app-icon.svg" alt="" width={32} height={32} />
          <div><b>Performance Overlay</b><small>{L("Sistem ve FPS göstergesi", "System and FPS monitor")}</small></div>
        </div>
        {NAV.map(({ id, label, Icon }) => (
          <button key={id} className={`nav-btn${section === id ? " active" : ""}`} onClick={() => setSection(id)}>
            <Icon size={17} /> {label}
          </button>
        ))}
        <div className="side-foot">
          <span title={`${L("Derleme", "Build")}: ${buildDate()}`}>v{__APP_VERSION__}</span>
          {s.app.demoData ? <span className="badge warn">Demo</span> : isTauri ? <span className="badge ok">{L("Canlı", "Live")}</span> : <span className="badge">{L("Tarayıcı", "Browser")}</span>}
        </div>
      </aside>
      <main>
        <header className="page-head">
          <div>
            <h2>{nav.label}</h2>
            <p>{nav.desc}</p>
          </div>
          <div className="head-tags">
            {s.app.demoData && <span className="badge warn">{L("DEMO verisi gösteriliyor", "Showing DEMO data")}</span>}
            <span className="chip">{L("Profil", "Profile")} <b>{p.name}</b></span>
          </div>
        </header>
        {upd.status === "available" && section !== "settings" && (
          <div className="update-bar">
            <Sparkles size={16} />
            <span className="grow">{L(`Yeni sürüm hazır: ${upd.version}`, `A new version is available: ${upd.version}`)}</span>
            <button className="btn ghost" onClick={() => setSection("settings")}>{L("Ayrıntılar", "Details")}</button>
          </div>
        )}

        {section === "overview" && (
          <>
            <div className="grid-2">
              <Card title={L("Ekran konumu", "Screen position")} icon={Move}>
                <div className="pos-wrap">
                  <div className="pos-grid" role="radiogroup" aria-label={L("Overlay'in ekrandaki konumu", "Overlay position on screen")}>
                    {ANCHORS.map((a) => (
                      <button
                        key={a.id}
                        role="radio"
                        aria-checked={s.overlayAnchor === a.id}
                        title={a.label}
                        className={`pos-cell${s.overlayAnchor === a.id ? " active" : ""}`}
                        onClick={() => update((x) => ({ ...x, overlayAnchor: a.id }))}
                      ><i /></button>
                    ))}
                  </div>
                  <div className="pos-info">
                    <b>{s.overlayAnchor ? ANCHORS.find((a) => a.id === s.overlayAnchor)!.label : L("Özel konum", "Custom position")}</b>
                    <span className="hint" style={{ margin: 0 }}>
                      {s.overlayAnchor
                        ? L("Overlay büyüyünce bu köşeye yapışık kalır.", "The overlay stays pinned to this spot as it grows.")
                        : L("Fareyle sürüklendi. Bir hazır konum seçerek geri dönebilirsiniz.", "Dragged with the mouse. Pick a preset to snap back.")}
                    </span>
                  </div>
                </div>
                <Range label={L("Kenar boşluğu", "Edge margin")} value={s.overlayMargin} min={0} max={120} step={2} format={px} onChange={(v) => update((x) => ({ ...x, overlayMargin: v }))} />
              </Card>
              <Card title={L("Davranış", "Behaviour")} icon={MonitorCog} actions={isTauri && (game.inGame ? <span className="badge ok">{L("Oyunda", "In game")}: {game.game}</span> : <span className="badge">{L("Oyun yok", "No game")}</span>)}>
                <Check label={L("Görünür", "Visible")} checked={s.overlayVisible} onChange={(v) => update((x) => ({ ...x, overlayVisible: v }))} />
                <Check label={L("Kilitli", "Locked")} checked={s.locked} onChange={(v) => update((x) => ({ ...x, locked: v }))} />
                <Check label={L("Yalnızca oyundayken göster", "Show only while in game")} checked={s.app.autoHide} onChange={(v) => update((x) => ({ ...x, app: { ...x.app, autoHide: v } }))} />
                <Check label={L("Oyuna göre profil değiştir", "Switch profile per game")} checked={s.app.autoProfile} onChange={(v) => update((x) => ({ ...x, app: { ...x.app, autoProfile: v } }))} />
                <p className="hint">
                  {s.locked
                    ? L("Kilitliyken overlay oyunla etkileşime girmez. Fareyle taşımak için kilidi kapatın.", "While locked the overlay ignores the mouse. Unlock it to drag it around.")
                    : L("Kilit kapalı: overlay'i fareyle sürükleyebilirsiniz. Bıraktığınızda ekrandan taşan kısım içeri alınır.", "Unlocked: drag the overlay with the mouse. Anything off-screen is pulled back in when you release it.")}
                </p>
              </Card>
            </div>
            <MetricTiles t={t} history={history} overlay={p.overlay} />
            <ExtraSensors t={t} admin={!!sensors?.info?.isAdmin} />
            <Card title={L("Veri kaynakları", "Data sources")} icon={Database}>
              {sourcesTable(true)}
              <p className="hint">{L("Bağlı olmayan kaynaklar overlay'de “—” olarak görünür; değer uydurulmaz.", "Unavailable sources show as “—” on the overlay; values are never made up.")}</p>
            </Card>
          </>
        )}

        {section === "editor" && (
          <>
            <div className="sticky-preview">
              <Card title={L("Canlı önizleme", "Live preview")} icon={Eye}>
                <div className="preview">
                  <Overlay settings={p.overlay} t={t} demo={s.app.demoData} history={history} />
                </div>
              </Card>
            </div>
            <div className="grid-2">
              <Card title={L("Yerleşim", "Layout")} icon={LayoutGrid}>
                <Row label={L("Düzen", "Layout")}>
                  <select value={p.overlay.layout} onChange={(e) => patchOverlay({ layout: e.target.value as LayoutMode })}>
                    {layouts().map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Row>
                <Check label={L("Etiketleri göster", "Show labels")} checked={p.overlay.showLabels} onChange={(v) => patchOverlay({ showLabels: v })} />
                <Range label={L("Ölçek", "Scale")} value={p.overlay.scale} min={0.6} max={2.5} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => patchOverlay({ scale: v })} />
                <Range label={L("Bileşen boşluğu", "Item spacing")} value={p.overlay.gap} min={0} max={32} format={px} onChange={(v) => patchOverlay({ gap: v })} />
              </Card>
              <Card title={L("Yazı ve ikon", "Text and icons")} icon={Type}>
                <Row label={L("Yazı tipi", "Font")}>
                  <select value={p.overlay.font} onChange={(e) => patchOverlay({ font: e.target.value as OverlayFont })}>
                    <option value="sans">Manrope ({L("varsayılan", "default")})</option>
                    <option value="condensed">Bahnschrift ({L("dar, spor", "condensed, sporty")})</option>
                    <option value="mono">Cascadia Mono ({L("sabit genişlik", "monospaced")})</option>
                  </select>
                </Row>
                <Range label={L("Yazı boyutu", "Font size")} value={p.overlay.fontSize} min={9} max={32} format={px} onChange={(v) => patchOverlay({ fontSize: v })} />
                <Range label={L("Yazı kalınlığı", "Font weight")} value={p.overlay.fontWeight} min={300} max={800} step={100} onChange={(v) => patchOverlay({ fontWeight: v })} />
                <Color label={L("Yazı rengi", "Text colour")} value={p.overlay.textColor} onChange={(v) => patchOverlay({ textColor: v })} />
                <Check label={L("İkonları göster", "Show icons")} checked={p.overlay.showIcons} onChange={(v) => patchOverlay({ showIcons: v })} />
                <Range label={L("İkon boyutu", "Icon size")} value={p.overlay.iconSize} min={10} max={36} format={px} disabled={!p.overlay.showIcons} onChange={(v) => patchOverlay({ iconSize: v })} />
                {!p.overlay.showIcons && !p.overlay.showLabels && p.overlay.layout !== "card" && p.overlay.layout !== "detailed" && (
                  <p className="hint warn-note">
                    {L("İkonlar ve etiketler kapalı: örneğin CPU ve GPU kullanımı yalnızca “%” ile görünür, ayırt edilemeyebilir.", "Icons and labels are off: CPU and GPU usage would both show only as “%” and may be hard to tell apart.")}{" "}
                    <button className="link-btn" onClick={() => patchOverlay({ showLabels: true })}>{L("Etiketleri aç", "Turn labels on")}</button>
                  </p>
                )}
              </Card>
              <Card title={L("Arka plan", "Background")} icon={Image}>
                <Color label={L("Arka plan rengi", "Background colour")} value={p.overlay.bgColor} onChange={(v) => patchOverlay({ bgColor: v })} />
                <Range label={L("Köşe yuvarlaklığı", "Corner radius")} value={p.overlay.radius} min={0} max={24} format={px} onChange={(v) => patchOverlay({ radius: v })} />
                <Range label={L("Opaklık", "Opacity")} value={p.overlay.bgOpacity} min={0} max={1} step={0.05} format={pct} onChange={(v) => patchOverlay({ bgOpacity: v })} />
                <Row label={L("Zemin", "Surface")}>
                  <select value={p.overlay.surface} onChange={(e) => patchOverlay({ surface: e.target.value as "solid" | "glass" })}>
                    <option value="solid">{L("Düz", "Solid")}</option>
                    <option value="glass">{L("Cam (parlak kenar)", "Glass (bright edge)")}</option>
                  </select>
                </Row>
                <Check label={L("İnce kenarlık", "Thin outline")} checked={p.overlay.outline} onChange={(v) => patchOverlay({ outline: v })} />
              </Card>
              <Card title={L("Stil ve grafik", "Style and graph")} icon={Sparkles}>
                <Row label={L("Değer rengi", "Value colour")}>
                  <select value={p.overlay.valueColor} onChange={(e) => patchOverlay({ valueColor: e.target.value as "text" | "metric" })}>
                    <option value="text">{L("Yazı rengi", "Text colour")}</option>
                    <option value="metric">{L("Gösterge rengi", "Metric colour")}</option>
                  </select>
                </Row>
                <Check label={L("Neon parıltı", "Neon glow")} checked={p.overlay.glow} onChange={(v) => patchOverlay({ glow: v })} />
                <Check label={L("Okunabilirlik gölgesi", "Readability shadow")} checked={p.overlay.textShadow} onChange={(v) => patchOverlay({ textShadow: v })} />
                <Row label={L("Mini grafik (son 60 sn)", "Mini graph (last 60 s)")}>
                  <select value={p.overlay.graph} onChange={(e) => patchOverlay({ graph: e.target.value as "off" | "fps" | "frametime" })}>
                    <option value="off">{L("Kapalı", "Off")}</option>
                    <option value="fps">FPS</option>
                    <option value="frametime">Frametime</option>
                  </select>
                </Row>
              </Card>
            </div>
            <AlertsCard overlay={p.overlay} notifyOn={s.app.notifyCritical} />
          </>
        )}

        {section === "sensors" && (
          <Card title={L("Göstergeler", "Metrics")} icon={Activity} actions={<span className="chip"><b>{p.overlay.metrics.filter((m) => m.enabled).length}</b> / {p.overlay.metrics.length} {L("açık", "on")}</span>}>
            {p.overlay.metrics.map((m, i) => {
              const d = METRIC_DEFS[m.id];
              const Icon = d.Icon;
              const n = p.overlay.metrics.length;
              return (
                <div
                  className={`sensor${dragId === m.id ? " dragging" : ""}${dropAt === i && dragId ? " drop-before" : ""}${dropAt === n && i === n - 1 && dragId ? " drop-after" : ""}`}
                  key={m.id}
                  data-row
                >
                  <span
                    className="grip"
                    title={L("Sürükleyerek sırala", "Drag to reorder")}
                    onPointerDown={(e) => {
                      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* yakalama olmadan da sürüklenir */ }
                      setDragId(m.id);
                      setDropAt(i);
                    }}
                    onPointerMove={(e) => {
                      if (!dragId) return;
                      // İmlecin altındaki satırın üst/alt yarısına göre hedef konum.
                      const rows = [...e.currentTarget.closest(".card")!.querySelectorAll<HTMLElement>("[data-row]")];
                      let at = rows.length;
                      for (let k = 0; k < rows.length; k++) {
                        const r = rows[k].getBoundingClientRect();
                        if (e.clientY < r.top + r.height / 2) { at = k; break; }
                      }
                      setDropAt(at);
                    }}
                    onPointerUp={() => {
                      if (dragId != null && dropAt != null) {
                        const from = p.overlay.metrics.findIndex((x) => x.id === dragId);
                        moveMetricTo(dragId, dropAt > from ? dropAt - 1 : dropAt);
                      }
                      setDragId(null);
                      setDropAt(null);
                    }}
                    onPointerCancel={() => { setDragId(null); setDropAt(null); }}
                  ><GripVertical size={16} /></span>
                  <input type="checkbox" role="switch" aria-label={d.label} checked={m.enabled} onChange={(e) => patchMetric(m.id, { enabled: e.target.checked })} />
                  <span className="dot-ic"><Icon size={16} color={m.color} /></span>
                  <span className="grow">
                    {d.label}
                    {/* Değer gelmeyen göstergeler baştan belli olsun (ör. dizüstünde fan). */}
                    {isTauri && !formatMetric(m.id, live) && <span className="badge nodata">{d.source === "fps" ? L("oyunda ölçülür", "measured in game") : L("şu an veri yok", "no data right now")}</span>}
                    <br /><small className="hint">{d.source === "fps" ? L("FPS kaynağı (ETW)", "FPS source (ETW)") : d.source === "sensor" ? L("Donanım sensörü", "Hardware sensor") : L("Sistem", "System")}</small>
                  </span>
                  <ColorInput value={m.color} onChange={(v) => patchMetric(m.id, { color: v })} />
                  <button className="icon" title={L("Yukarı taşı", "Move up")} disabled={i === 0} onClick={() => moveMetric(m.id as MetricId, -1)}><ChevronUp size={14} /></button>
                  <button className="icon" title={L("Aşağı taşı", "Move down")} disabled={i === p.overlay.metrics.length - 1} onClick={() => moveMetric(m.id as MetricId, 1)}><ChevronDown size={14} /></button>
                </div>
              );
            })}
            <p className="hint">{L("Listedeki sıra overlay'deki sıradır. Tutamaçtan sürükleyin ya da oklarla taşıyın.", "The list order is the overlay order. Drag by the handle or use the arrows.")}</p>
          </Card>
        )}

        {section === "appearance" && (
          <>
            <Card title={L("Panel teması", "Panel theme")} icon={Palette}>
              <Row label={L("Tema", "Theme")}>
                <select value={s.app.theme} onChange={(e) => update((x) => ({ ...x, app: { ...x.app, theme: e.target.value as "dark" | "light" } }))}>
                  <option value="dark">{L("Koyu", "Dark")}</option>
                  <option value="light">{L("Açık", "Light")}</option>
                </select>
              </Row>
            </Card>
            <Card title={L("Overlay temaları", "Overlay themes")} icon={Brush} actions={!activeThemeId(p.overlay) && <span className="chip">{L("Özel ayarlar", "Custom settings")}</span>}>
              {THEME_CATEGORIES.map((cat) => (
                <div key={cat} className="theme-group">
                  <h4>{categoryLabel(cat)}</h4>
                  <div className="themes">
                    {THEMES.filter((th) => th.category === cat).map((th) => {
                      const active = activeThemeId(p.overlay) === th.id;
                      const applied = themePatchFor(th, p.overlay);
                      // Önizlemede en fazla 3 gösterge, temanın kendi renkleriyle.
                      const preview = {
                        // Karşılaştırılabilsin diye hep yatay düzen; ikon/etiket tercihi korunur.
                        ...p.overlay, ...applied, layout: "horizontal" as const, scale: 0.8, graph: "off" as const,
                        metrics: applied.metrics!.map((m, i, all) => ({ ...m, enabled: m.enabled && all.slice(0, i).filter((x) => x.enabled).length < 3 })),
                      };
                      return (
                        <button key={th.id} className={`theme${active ? " active" : ""}`} onClick={() => patchOverlay(applied)}>
                          <span className="theme-scene"><Overlay settings={preview} t={t} demo={false} /></span>
                          <span className="theme-name">{th.name}{active && <span className="badge ok">{L("Seçili", "Selected")}</span>}</span>
                          <span className="theme-desc">{th.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <p className="hint">{L("Tema aktif profilin renklerini, gösterge renklerini, yazı tipini ve köşelerini değiştirir; yerleşim ve hangi göstergelerin açık olduğu korunur. Ayrıntılar düzenleyicide değiştirilebilir.", "A theme changes the active profile's colours, metric colours, font and corners; the layout and which metrics are on are kept. Fine-tune it in the editor.")}</p>
            </Card>
          </>
        )}

        {section === "profiles" && <Profiles />}
        {section === "sessions" && <SessionsPage />}
        {section === "games" && <GamesPage current={game.inGame ? game.game : null} lastApp={game.lastApp} />}

        {section === "settings" && (
          <>
            <Card title={L("Başlangıç ve pencere", "Startup and window")} icon={Settings}>
              <Row label="Dil / Language">
                <select value={s.app.lang} onChange={(e) => update((x) => ({ ...x, app: { ...x.app, lang: e.target.value as "tr" | "en" } }))}>
                  <option value="tr">Türkçe</option>
                  <option value="en">English</option>
                </select>
              </Row>
              <AutostartSetting />
              <Check label={L("Oyun oturumlarını otomatik kaydet (Oturumlar sayfası)", "Record game sessions automatically (Sessions page)")} checked={s.app.autoRecord} onChange={(v) => update((x) => ({ ...x, app: { ...x.app, autoRecord: v } }))} />
              <Check label={L("Kritik sıcaklıkta Windows bildirimi gönder", "Send a Windows notification at critical temperatures")} checked={s.app.notifyCritical} onChange={(v) => update((x) => ({ ...x, app: { ...x.app, notifyCritical: v } }))} />
              {isTauri && <TestNotification />}
              <Check label={L("Pencereyi kapatınca sistem tepsisine in", "Minimise to the system tray when the window is closed")} checked={s.app.minimizeToTray} onChange={(v) => update((x) => ({ ...x, app: { ...x.app, minimizeToTray: v } }))} />
              <Check label={L("Demo verisi kullan (gerçek veri yerine örnek)", "Use demo data (sample values instead of real ones)")} checked={s.app.demoData} onChange={(v) => update((x) => ({ ...x, app: { ...x.app, demoData: v } }))} />
            </Card>
            <HotkeysCard errors={hotkeyErrors} />
            <Card title={L("İlk açılış rehberi", "Welcome guide")} icon={Sparkles}>
              <p className="hint" style={{ marginTop: 0 }}>{L("Ölçüm durumu, temel tercihler ve kısayolları adım adım gösteren karşılama penceresi.", "A step-by-step welcome showing what can be measured, the basic preferences and the shortcuts.")}</p>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn ghost" onClick={() => update((x) => ({ ...x, app: { ...x.app, onboarded: false } }))}><Sparkles size={14} /> {L("Rehberi yeniden göster", "Show the guide again")}</button>
              </div>
            </Card>
            <Card title={L("Sıfırlama", "Reset")} icon={RotateCcw}>
              <p className="hint" style={{ marginTop: 0 }}>{L("Tüm profiller, overlay ayarları ve konum varsayılana döner. Geri alınamaz.", "All profiles, overlay settings and the position go back to defaults. This cannot be undone.")}</p>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn danger" onClick={() => { if (confirm(L("Tüm ayarlar ve profiller varsayılana dönsün mü?", "Reset all settings and profiles to defaults?"))) resetAll(); }}><Trash2 size={14} /> {L("Tüm ayarları sıfırla", "Reset all settings")}</button>
              </div>
            </Card>
            <AboutCard />
          </>
        )}
      </main>
    </div>
    </div>
  );
}

function Profiles() {
  const s = useAppState();
  const p = activeProfile(s);
  const [io, setIo] = useState("");
  const [err, setErr] = useState("");

  return (
    <>
      <Card title={L("Profiller", "Profiles")} icon={Users}>
        {s.profiles.map((x) => (
          <label className="sensor" key={x.id} style={{ cursor: "pointer" }}>
            <input type="radio" name="profile" checked={x.id === s.activeProfileId} onChange={() => selectProfileManually(x.id)} />
            <span className="grow">{x.name}<br /><small className="hint">{x.overlay.metrics.filter((m) => m.enabled).length} {L("gösterge", "metrics")}{s.games.filter((g) => g.profileId === x.id).length > 0 && ` · ${s.games.filter((g) => g.profileId === x.id).length} ${L("oyun", "games")}`}</small></span>
            {x.id === s.activeProfileId && <span className="badge ok">{L("Aktif", "Active")}</span>}
            <button
              className="icon"
              disabled={s.profiles.length <= 1}
              title={L("Sil", "Delete")}
              onClick={() => update((st) => {
                const rest = st.profiles.filter((q) => q.id !== x.id);
                // Silinen profili kullanan oyunlar "profil yok" olur (kayıtlı kalırlar).
                const games = st.games.map((g) => (g.profileId === x.id ? { ...g, profileId: null } : g));
                return { ...st, profiles: rest, games, activeProfileId: st.activeProfileId === x.id ? rest[0].id : st.activeProfileId };
              })}
            ><Trash2 size={14} /></button>
          </label>
        ))}
        <Row label={L("Aktif profilin adı", "Active profile name")}>
          <input
            type="text"
            value={p.name}
            onChange={(e) => update((st) => ({ ...st, profiles: st.profiles.map((q) => (q.id === st.activeProfileId ? { ...q, name: e.target.value } : q)) }))}
          />
        </Row>
        <div className="btn-row">
        <button
          className="btn ghost"
          onClick={() => update((st) => {
            const cur = activeProfile(st);
            const id = `p_${Date.now().toString(36)}`;
            return { ...st, activeProfileId: id, profiles: [...st.profiles, { id, name: `${cur.name} ${L("kopya", "copy")}`, overlay: structuredClone(cur.overlay), games: [] }] };
          })}
        ><Plus size={14} /> {L("Aktif profili kopyala", "Duplicate active profile")}</button>
        </div>
        <p className="hint">{L("Değişiklikler aktif profile otomatik kaydedilir ve uygulama yeniden açıldığında geri yüklenir.", "Changes are saved to the active profile automatically and restored when the app starts again.")}</p>
      </Card>
      <Card title={L("İçe / dışa aktar", "Import / export")} icon={FileJson}>
        <textarea rows={8} value={io} onChange={(e) => setIo(e.target.value)} placeholder={L("Profil JSON'unu buraya yapıştırın ya da aktif profili dışa aktarın", "Paste a profile JSON here or export the active profile")} />
        <div className="btn-row">
        <button className="btn ghost" onClick={() => { setIo(JSON.stringify({ name: p.name, overlay: p.overlay }, null, 2)); setErr(""); }}><Download size={14} /> {L("Aktif profili dışa aktar", "Export active profile")}</button>
        <button
          className="btn ghost"
          onClick={() => {
            try {
              const o = JSON.parse(io) as { name?: string; overlay?: unknown };
              if (!o || typeof o !== "object" || !o.overlay) throw new Error(L("Geçersiz profil", "Invalid profile"));
              const id = `p_${Date.now().toString(36)}`;
              const overlay = normalizeOverlay(o.overlay as never);
              update((st) => ({ ...st, activeProfileId: id, profiles: [...st.profiles, { id, name: String(o.name ?? L("İçe aktarılan", "Imported")), overlay, games: [] }] }));
              setErr("");
            } catch (e) { setErr(`${L("İçe aktarma başarısız", "Import failed")}: ${(e as Error).message}`); }
          }}
        ><Upload size={14} /> {L("İçe aktar", "Import")}</button>
        </div>
        {err && <p className="hint err">{err}</p>}
      </Card>
    </>
  );
}

function SensorBadge({ st, ok, okText, cpu }: { st: SensorStatus | null; ok: boolean; okText: string; cpu?: boolean }) {
  if (!isTauri) return <span className="badge">{L("Yalnızca masaüstü uygulamasında", "Desktop app only")}</span>;
  if (ok) return <span className="badge ok">{okText}</span>;
  switch (st?.state) {
    case "running":
      if (cpu && st.info?.pawnIO === false) return <span className="badge warn">{L("PawnIO sürücüsü kurulu değil (CPU sıcaklığı için gerekli)", "PawnIO driver not installed (needed for CPU temperature)")}</span>;
      return st.info?.isAdmin
        ? <span className="badge">{L("Sensör değer vermiyor", "Sensor reports no value")}</span>
        : <span className="badge warn">{L("Okunamadı — yönetici olarak çalıştırın (CPU sıcaklığı sürücü ister)", "Not readable — run as administrator (CPU temperature needs a driver)")}</span>;
    case "starting": return <span className="badge">{L("Başlatılıyor…", "Starting…")}</span>;
    case "missing": case "stopped": case "error": return <span className="badge warn">{helperMessage(st)}</span>;
    default: return <span className="badge">{L("Bekleniyor…", "Waiting…")}</span>;
  }
}

/** Yardımcının durum mesajı arayüz dilinde; Rust'tan gelen ayrıntı (işletim sistemi hatası) eklenir. */
function helperMessage(st: SensorStatus) {
  switch (st.state) {
    case "missing": return L("Sensör yardımcısı bulunamadı (lhm-helper.exe)", "Sensor helper not found (lhm-helper.exe)");
    case "stopped": return L("Sensör yardımcısı durdu", "Sensor helper stopped");
    default: return L("Sensör yardımcısı başlatılamadı", "Sensor helper failed to start") + (st.message ? `: ${st.message}` : "");
  }
}

function FpsBadge({ st, live }: { st: SensorStatus | null; live: Telemetry }) {
  if (!isTauri) return <span className="badge">{L("Yalnızca masaüstü uygulamasında", "Desktop app only")}</span>;
  if (live.fps != null) return <span className="badge ok">{L("Canlı", "Live")} (ETW{live.fpsProcess ? ` · ${live.fpsProcess}` : ""})</span>;
  if (st?.state !== "running") return <SensorBadge st={st} ok={false} okText="" />;
  if (st.info?.fps && st.info.fps !== "ok") return <span className="badge warn">{st.info.fps} — {L("uygulamayı yönetici olarak çalıştırın", "run the app as administrator")}</span>;
  if (live.fpsPanel) return <span className="badge">{L("Hazır — panel ön planda olduğu için ölçülmüyor; bir oyuna geçin", "Ready — not measuring while the panel is in front; switch to a game")}</span>;
  return (
    <span className="badge">
      {L("Hazır — ön plandaki", "Ready — the foreground")} {live.fpsProcess ? `“${live.fpsProcess}”` : L("uygulama", "app")} {L("kare üretmiyor (bir oyuna geçin)", "is not presenting frames (switch to a game)")}
      {live.presentEvents != null && ` · ETW: ${live.presentEvents} ${L("kare olayı", "present events")}`}
    </span>
  );
}

/** Kaynak, Görev Zamanlayıcı'daki görevin kendisi; state.json'da tutulmaz. */
function AutostartSetting() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (isTauri) invoke<boolean>("get_autostart").then(setOn).catch((e) => setErr(String(e)));
  }, []);

  if (!isTauri) return <p className="hint">{L("Windows ile başlatma yalnızca masaüstü uygulamasında ayarlanabilir.", "Start with Windows can only be set in the desktop app.")}</p>;

  const toggle = async (v: boolean) => {
    setBusy(true);
    setErr("");
    try {
      await invoke("set_autostart", { enabled: v });
    } catch (e) {
      setErr(`${L("Ayarlanamadı", "Could not change it")}: ${e}`);
    }
    // İstenen değeri değil, gerçekte kayıtlı olanı göster.
    setOn(await invoke<boolean>("get_autostart").catch(() => null));
    setBusy(false);
  };

  return (
    <>
      <Row label={L("Windows açılınca başlat (overlay ve tepsi simgesiyle, panel gizli)", "Start with Windows (overlay and tray icon, panel hidden)")}>
        <input type="checkbox" checked={!!on} disabled={on === null || busy} onChange={(e) => toggle(e.target.checked)} />
      </Row>
      {err && <p className="hint err">{err}</p>}
    </>
  );
}

// Her çizimde: etiketler dile göre (ALERT_INFO getter).
const alertRows = () => (Object.keys(ALERT_INFO) as AlertMetric[]).map((key) => ({ key, ...ALERT_INFO[key], lower: ALERT_INFO[key].lowerIsWorse }));

/** Boş alan = o seviye kapalı. */
function AlertsCard({ overlay: o, notifyOn }: { overlay: OverlaySettings; notifyOn: boolean }) {
  const set = (key: AlertMetric, level: "warn" | "crit", raw: string) => {
    const n = raw.trim() === "" ? null : Number(raw);
    if (n !== null && !Number.isFinite(n)) return;
    patchOverlay({ alerts: { ...o.alerts, [key]: { ...o.alerts[key], [level]: n } } });
  };
  return (
    <Card
      title={L("Uyarı eşikleri", "Alert thresholds")}
      icon={TriangleAlert}
      actions={<input type="checkbox" role="switch" aria-label={L("Uyarı renkleri", "Alert colours")} checked={o.alertsEnabled} onChange={(e) => patchOverlay({ alertsEnabled: e.target.checked })} />}
    >
      <table className={`alerts${o.alertsEnabled ? "" : " off"}`}>
        <thead>
          <tr><th>{L("Gösterge", "Metric")}</th><th>{L("Ne zaman", "When")}</th><th><span className="lv warn">{L("Uyarı", "Warning")}</span></th><th><span className="lv crit">{L("Kritik", "Critical")}</span></th><th title={L("Kritik eşik 10 sn aralıksız aşılınca Windows bildirimi", "Windows notification after 10 s past the critical limit")}>{L("Bildirim", "Notify")}</th></tr>
        </thead>
        <tbody>
          {alertRows().map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              <td className="dir">{r.lower ? L("altına inince", "drops below") : L("üstüne çıkınca", "rises above")}</td>
              {(["warn", "crit"] as const).map((lv) => (
                <td key={lv}>
                  <span className="num">
                    <input
                      type="number" disabled={!o.alertsEnabled} value={o.alerts[r.key][lv] ?? ""} placeholder={L("kapalı", "off")}
                      onChange={(e) => set(r.key, lv, e.target.value)}
                    />
                    <small>{r.unit}</small>
                  </span>
                </td>
              ))}
              <td>
                <input
                  type="checkbox" role="switch" aria-label={L(`${r.label} için bildirim`, `Notification for ${r.label}`)}
                  disabled={!o.alertsEnabled || !notifyOn || o.alerts[r.key].crit == null}
                  title={!notifyOn ? L("Uygulama ayarları'nda bildirimler kapalı", "Notifications are off in Settings") : o.alerts[r.key].crit == null ? L("Önce kritik eşik girin", "Enter a critical limit first") : undefined}
                  checked={o.alerts[r.key].notify}
                  onChange={(e) => patchOverlay({ alerts: { ...o.alerts, [r.key]: { ...o.alerts[r.key], notify: e.target.checked } } })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn ghost" disabled={!o.alertsEnabled} onClick={() => patchOverlay({ alerts: DEFAULT_ALERTS })}><RotateCcw size={14} /> {L("Varsayılan eşikler", "Default thresholds")}</button>
      </div>
      <p className="hint">
        {L(
          "Değer eşiği geçince overlay'de ve Genel bakış kartlarında sarı (uyarı) ya da kırmızı (kritik) olur. Boş bırakılan seviye kapalıdır. Denemek için eşiği şu anki değerin altına çekin (FPS'te üstüne). “Bildirim” açık satırlarda kritik eşik 10 sn aralıksız aşılınca Windows bildirimi gönderilir (aynı gösterge için en sık 5 dakikada bir). Varsayılan olarak yalnızca sıcaklıklarda açıktır. Tüm bildirimler Uygulama ayarları'ndan tek anahtarla kapatılabilir.",
          "When a value crosses a limit it turns yellow (warning) or red (critical) on the overlay and the Overview cards. An empty level is off. To try it, set a limit below the current value (above it for FPS). Rows with “Notify” on send a Windows notification after 10 s past the critical limit (at most every 5 minutes per metric). By default only temperatures notify. All notifications can be turned off with one switch in Settings.",
        )}
      </p>
    </Card>
  );
}

const HOTKEY_ROWS: { action: HotkeyAction; label: string }[] = [
  { action: "toggleOverlay", get label() { return L("Overlay'i göster / gizle", "Show / hide overlay"); } },
  { action: "toggleLock", get label() { return L("Kilitle / kilidi aç (taşıma modu)", "Lock / unlock (move mode)"); } },
  { action: "toggleRecord", get label() { return L("Oturum kaydını başlat / bitir", "Start / stop session recording"); } },
];

function HotkeysCard({ errors }: { errors: Partial<Record<HotkeyAction, string>> }) {
  const s = useAppState();
  const [rec, setRec] = useState<HotkeyAction | null>(null);
  const [msg, setMsg] = useState("");

  const setKey = (action: HotkeyAction, accel: string | null) =>
    update((x) => ({ ...x, app: { ...x.app, hotkeys: { ...x.app.hotkeys, [action]: accel } } }));

  useEffect(() => {
    if (!rec) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") { setRec(null); setMsg(""); return; }
      if ((e.code === "Backspace" || e.code === "Delete") && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setKey(rec, null); setRec(null); setMsg(""); return;
      }
      const { accel, error } = accelFromEvent(e);
      if (error) { setMsg(error); return; }
      if (!accel) return; // yalnız değiştirici: kombinasyonun devamını bekle
      const other = HOTKEY_ROWS.find((r) => r.action !== rec && s.app.hotkeys[r.action] === accel);
      if (other) { setMsg(L(`Bu kısayol zaten “${other.label}” için kullanılıyor.`, `This shortcut is already used for “${other.label}”.`)); return; }
      setKey(rec, accel);
      setRec(null);
      setMsg("");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [rec, s.app.hotkeys]);

  return (
    <Card title={L("Klavye kısayolları", "Keyboard shortcuts")} icon={Keyboard}>
      {HOTKEY_ROWS.map(({ action, label }) => (
        <div className="row" key={action}>
          <span>
            {label}
            {errors[action] && <><br /><small className="hint err">{errors[action]}</small></>}
          </span>
          <span className="row-ctl">
            <kbd className={`kbd${rec === action ? " rec" : ""}${s.app.hotkeys[action] ? "" : " off"}`}>
              {rec === action ? L("Tuşlara basın…", "Press keys…") : prettyHotkey(s.app.hotkeys[action])}
            </kbd>
            <button className="btn ghost" onClick={() => { setRec(rec === action ? null : action); setMsg(""); }}>
              {rec === action ? L("İptal", "Cancel") : L("Değiştir", "Change")}
            </button>
          </span>
        </div>
      ))}
      {msg && <p className="hint err">{msg}</p>}
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn ghost" onClick={() => update((x) => ({ ...x, app: { ...x.app, hotkeys: DEFAULT_HOTKEYS } }))}><RotateCcw size={14} /> {L("Varsayılanlar", "Defaults")}</button>
      </div>
      <p className="hint">
        {L("Kısayollar oyun açıkken de çalışır. Değiştirirken Esc iptal eder, Backspace kısayolu kapatır.", "Shortcuts work while a game is running too. While changing one, Esc cancels and Backspace turns it off.")}
        {!isTauri && L(" Tarayıcıda yalnızca ayarlanabilir; çalışması masaüstü uygulamasında.", " In the browser they can only be set; they work in the desktop app.")}
      </p>
    </Card>
  );
}

const CREDITS: { name: string; use: string; license: string; url: string }[] = [
  { name: "LibreHardwareMonitor", get use() { return L("Sıcaklık, GPU ve VRAM sensörleri", "Temperature, GPU and VRAM sensors"); }, license: "MPL-2.0", url: "github.com/LibreHardwareMonitor/LibreHardwareMonitor" },
  { name: "Microsoft TraceEvent", get use() { return L("FPS ölçümü (ETW)", "FPS measurement (ETW)"); }, license: "MIT", url: "github.com/microsoft/perfview" },
  { name: "Tauri", get use() { return L("Masaüstü uygulama çatısı", "Desktop app framework"); }, license: "MIT / Apache-2.0", url: "tauri.app" },
  { name: "sysinfo", get use() { return L("CPU kullanımı ve RAM", "CPU usage and RAM"); }, license: "MIT", url: "github.com/GuillaumeGomez/sysinfo" },
  { name: "React", get use() { return L("Arayüz", "User interface"); }, license: "MIT", url: "react.dev" },
  { name: "Lucide", get use() { return L("Simgeler", "Icons"); }, license: "ISC", url: "lucide.dev" },
];

function UpdateButton() {
  const u = useUpdater();
  const s = useAppState();
  if (u.status === "available" || u.status === "installing") {
    return (
      <button className="btn" disabled={u.status === "installing" || !!s.recording} title={s.recording ? L("Önce oturum kaydını bitirin", "Stop the session recording first") : undefined} onClick={() => void installUpdate()}>
        <Download size={14} /> {u.status === "installing" ? `${L("İndiriliyor", "Downloading")} ${percent(Math.round((u.progress ?? 0) * 100))}` : L(`${u.version} sürümünü kur`, `Install ${u.version}`)}
      </button>
    );
  }
  return (
    <button className="btn ghost" disabled={u.status === "checking"} onClick={() => void checkForUpdate(true)}>
      <RotateCcw size={14} /> {u.status === "checking" ? L("Denetleniyor…", "Checking…") : L("Güncellemeleri denetle", "Check for updates")}
    </button>
  );
}

function UpdateStatus() {
  const u = useUpdater();
  if (u.status === "none") return <p className="hint">{L("En son sürümü kullanıyorsunuz.", "You're on the latest version.")}</p>;
  if (u.status === "error") return <p className="hint err">{L("Güncelleme denetlenemedi", "Could not check for updates")}: {u.error}</p>;
  if (u.status === "available" || u.status === "installing") {
    return <p className="hint">{L("Kurulum uygulamayı kısa süreliğine kapatıp yeni sürümle yeniden açar; ayarlar korunur.", "The installer briefly closes the app and reopens the new version; settings are kept.")}</p>;
  }
  return null;
}

function AboutCard() {
  return (
    <Card title={L("Hakkında", "About")} icon={Info}>
      <div className="about">
        <img src="/app-icon.svg" alt="" width={48} height={48} />
        <div className="grow">
          <b>Custom Performance Overlay</b>
          <div className="hint" style={{ margin: 0 }}>{L("Sürüm", "Version")} {__APP_VERSION__} · {L("Derleme", "Build")} {buildDate()} · Windows 10/11</div>
        </div>
        {isTauri && <UpdateButton />}
      </div>
      <UpdateStatus />
      <table className="credits">
        <tbody>
          {CREDITS.map((c) => (
            <tr key={c.name}>
              <td><b>{c.name}</b> <small className="hint">· {c.use}</small><br /><span className="url">{c.url}</span></td>
              <td className="lic"><span className="chip">{c.license}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">{L("LibreHardwareMonitor, MPL-2.0 lisansıyla değiştirilmeden dağıtılır; kaynak kodu yukarıdaki adreste bulunur.", "LibreHardwareMonitor is distributed unmodified under the MPL-2.0 licence; its source code is at the address above.")}</p>
    </Card>
  );
}

/** Kayıtlı oyunlar: her oyunun kullanacağı profil burada seçilir. */
function GamesPage({ current, lastApp }: { current: string | null; lastApp: string | null }) {
  const s = useAppState();
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState("");
  const [picking, setPicking] = useState(false);
  const added = (exe: string | null, how: string) => setMsg(exe ? L(`${exe} ${how} eklendi. Aşağıdaki listeden kullanacağı profili seçin.`, `${exe} added ${how}. Pick its profile in the list below.`) : "");

  const pickFile = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, directory: false, title: L("Oyunun exe dosyasını seçin", "Select the game's exe file"), filters: [{ name: L("Oyun (.exe)", "Game (.exe)"), extensions: ["exe"] }] });
    if (typeof path !== "string") return;
    const file = path.split(/[\/]/).pop() ?? "";
    added(addGame(file, { name: file.replace(/.exe$/i, ""), path }), L("dosyadan", "from file"));
  };

  return (
    <>
      <Card title={L("Oyun ekle", "Add a game")} icon={Plus}>
        <div className="btn-row" style={{ alignItems: "center" }}>
          {isTauri && (
            <button className="btn" onClick={() => setPicking((v) => !v)} aria-expanded={picking}>
              <AppWindow size={14} /> {picking ? L("Listeyi kapat", "Close list") : L("Açık uygulamalardan seç", "Pick from running apps")}
            </button>
          )}
          {isTauri && <button className="btn ghost" onClick={() => pickFile().catch((e) => setMsg(`${L("Dosya seçilemedi", "Could not pick the file")}: ${e}`))}><FolderOpen size={14} /> {L("Dosyadan seç (.exe)", "Pick a file (.exe)")}</button>}
          <input type="text" value={input} placeholder="valorant.exe" style={{ width: 190 }}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) { added(addGame(input), L("elle", "manually")); setInput(""); } }} />
          <button className="btn ghost" disabled={!input.trim()} onClick={() => { added(addGame(input), L("elle", "manually")); setInput(""); }}>{L("Ekle", "Add")}</button>
        </div>
        {picking && <RunningAppsPicker lastApp={lastApp} onAdd={(a) => added(addGame(a.exe, { name: a.title.length <= 40 ? a.title : a.exe, path: a.path }), L("açık uygulamalardan", "from running apps"))} />}
        {msg && <p className="hint">{msg}</p>}
        <p className="hint">
          {L(
            "En kolayı: oyunu açın, Alt+Tab ile panele dönün ve “Açık uygulamalardan seç” listesinden oyunu ekleyin. Dosyadan seçerken başlatıcıyı (launcher) değil, oyunun kendi exe'sini seçin.",
            "Easiest: start the game, Alt+Tab back to the panel and add it from “Pick from running apps”. When picking a file, choose the game's own exe, not its launcher.",
          )}
        </p>
      </Card>

      <Card title={L("Kayıtlı oyunlar", "Registered games")} icon={Gamepad2} actions={<span className="chip"><b>{s.games.length}</b> {L("oyun", "games")}</span>}>
        {s.games.length === 0 ? (
          <p className="hint" style={{ marginTop: 0 }}>{L("Henüz kayıtlı oyun yok. Kayıtlı oyunlar pencere modunda da oyun sayılır ve seçtiğiniz profile otomatik geçilir.", "No registered games yet. Registered games count as games in windowed mode too, and their profile is applied automatically.")}</p>
        ) : (
          <table className="games">
            <thead><tr><th>{L("Oyun", "Game")}</th><th>{L("Kullanacağı profil", "Profile")}</th><th /></tr></thead>
            <tbody>
              {s.games.map((g) => (
                <tr key={g.exe}>
                  <td>
                    <input type="text" className="game-name" value={g.name} aria-label={L("Görünen ad", "Display name")} onChange={(e) => updateGame(g.exe, { name: e.target.value })} />
                    <div className="game-exe" title={g.path ?? undefined}>
                      {g.exe}.exe{current === g.exe && <span className="badge ok">{L("Şu an açık", "Running now")}</span>}
                    </div>
                  </td>
                  <td>
                    <select value={g.profileId ?? ""} onChange={(e) => updateGame(g.exe, { profileId: e.target.value || null })}>
                      <option value="">{L("Profil değiştirme", "Don't switch profile")}</option>
                      {s.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td style={{ width: 1 }}>
                    <button className="icon" title={L("Listeden kaldır", "Remove from list")} aria-label={L(`${g.name} kaldır`, `Remove ${g.name}`)} onClick={() => removeGame(g.exe)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="hint">
          {L(
            "“Profil değiştirme” seçili oyunlar yine oyun sayılır (yalnızca oyundayken göster), ama profil değişmez. Oyundan çıkınca Profiller'de elle seçtiğiniz profile dönülür. Otomatik geçiş Genel bakış → Davranış → “Oyuna göre profil değiştir” açıkken çalışır.",
            "Games set to “Don't switch profile” still count as games (show only while in game), but the profile stays. After the game the profile you picked on Profiles comes back. Switching works while Overview → Behaviour → “Switch profile per game” is on.",
          )}
        </p>
      </Card>
    </>
  );
}

interface RunningApp { exe: string; title: string; path: string }

/** Şu an açık, penceresi olan uygulamalar; panelden önce kullanılan en üstte. */
function RunningAppsPicker({ lastApp, onAdd }: { lastApp: string | null; onAdd: (a: RunningApp) => void }) {
  const s = useAppState();
  const [apps, setApps] = useState<RunningApp[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const load = () => {
    setErr("");
    invoke<RunningApp[]>("running_apps").then(setApps).catch((e) => setErr(String(e)));
  };
  useEffect(load, []);

  const query = q.trim().toLowerCase();
  const list = (apps ?? [])
    .filter((a) => !query || a.title.toLowerCase().includes(query) || a.exe.includes(query))
    .sort((a, b) => Number(b.exe === lastApp) - Number(a.exe === lastApp));

  return (
    <div className="picker">
      <div className="picker-bar">
        <input type="text" value={q} placeholder={L("Ara…", "Search…")} onChange={(e) => setQ(e.target.value)} autoFocus />
        <button className="btn ghost" onClick={load} title={L("Listeyi yenile", "Refresh list")}><RotateCcw size={14} /> {L("Yenile", "Refresh")}</button>
      </div>
      {err && <p className="hint err">{L("Liste alınamadı", "Could not get the list")}: {err}</p>}
      {apps && list.length === 0 && <p className="hint">{query ? L("Eşleşen uygulama yok.", "No matching apps.") : L("Penceresi açık uygulama bulunamadı. Oyunu açıp Yenile'ye basın.", "No apps with an open window. Start the game and press Refresh.")}</p>}
      <ul>
        {list.map((a) => {
          const registered = s.games.some((g) => g.exe === a.exe);
          return (
            <li key={a.exe}>
              <div className="grow">
                <b>{a.title}</b>
                <span className="game-exe" title={a.path}>
                  {a.exe}.exe{a.exe === lastApp && <span className="badge ok">{L("Son kullanılan", "Last used")}</span>}
                </span>
              </div>
              {registered ? <span className="badge">{L("Kayıtlı", "Registered")}</span> : <button className="btn" onClick={() => onAdd(a)}><Plus size={14} /> {L("Ekle", "Add")}</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface SelfUsage { memMb: number; cpu: number; processes: number }

/** Uygulamanın kendi tüketimi (ana süreç + yardımcı + WebView2). Yalnız etkinken 5 sn'de bir ölçülür. */
function useSelfUsage(active: boolean): SelfUsage | null {
  const [u, setU] = useState<SelfUsage | null>(null);
  useEffect(() => {
    if (!isTauri || !active) return;
    // İlk ölçümde CPU 0 gelir (fark için iki ölçüm gerekir); 5 sn sonra gerçek değer.
    const tick = () => invoke<SelfUsage>("self_usage").then(setU).catch(() => {});
    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, [active]);
  return u;
}

const EXTRA: MetricId[] = ["cpuClock", "gpuClock", "cpuPower", "gpuPower", "vramTemp", "fan"];
/** Kartta kısa ve ayırt edici adlar ("CPU" tek başına saat mi güç mü belli değil). */
const extraLabel = (id: MetricId) => ({
  cpuClock: L("CPU saat hızı", "CPU clock"), gpuClock: L("GPU saat hızı", "GPU clock"), cpuPower: L("CPU gücü", "CPU power"),
  gpuPower: L("GPU gücü", "GPU power"), vramTemp: L("GPU bellek sıcaklığı", "GPU memory temp."), fan: L("Fan hızı", "Fan speed"),
} as Partial<Record<MetricId, string>>)[id];

/** Ek sensörler: kompakt değer satırı. Okunamayanlarda nedeni yazar. */
function ExtraSensors({ t, admin }: { t: Telemetry; admin: boolean }) {
  const why = (id: MetricId) =>
    id === "fan" ? L("bu bilgisayarda okunamıyor", "not readable on this PC") : id.startsWith("cpu") && !admin ? L("yönetici + PawnIO gerekli", "needs admin + PawnIO") : L("veri yok", "no data");
  return (
    <Card title={L("Ek sensörler", "Extra sensors")} icon={Cpu} actions={<span className="chip">{L("Sensör seçimi'nden overlay'e eklenebilir", "Can be added to the overlay under Sensors")}</span>}>
      <div className="extras">
        {EXTRA.map((id) => {
          const d = METRIC_DEFS[id];
          const f = formatMetric(id, t);
          return (
            <div key={id} className="extra">
              <span className="ic"><d.Icon size={15} color={METRIC_COLORS[id]} /></span>
              <div>
                <span className="extra-label">{extraLabel(id)}</span>
                {f ? <b>{f.value}<small>{f.unit}</small></b> : <span className="extra-none" title={why(id)}>— <small>{why(id)}</small></span>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Bildirimlerin bu bilgisayarda çalışıp çalışmadığını eşik beklemeden dener. */
function TestNotification() {
  const [msg, setMsg] = useState("");
  const send = () => {
    setMsg(L("Gönderiliyor…", "Sending…"));
    sendNotices([{ title: "Custom Performance Overlay", body: L("Test bildirimi: kritik sıcaklık uyarıları bu şekilde görünecek.", "Test notification: critical temperature alerts will look like this.") }])
      .then((r) => setMsg(r === "sent"
        ? L("Gönderildi. Görmediyseniz Windows Ayarlar → Sistem → Bildirimler'de uygulamanın ve Rahatsız etme'nin durumuna bakın.", "Sent. If you didn't see it, check the app and Do not disturb under Windows Settings → System → Notifications.")
        : L("Windows bildirim izni verilmedi. Ayarlar → Sistem → Bildirimler'den açabilirsiniz.", "Windows notification permission was not granted. You can turn it on in Settings → System → Notifications.")))
      .catch((e) => setMsg(`${L("Gönderilemedi", "Could not send")}: ${e}`));
  };
  return (
    <div className="row">
      <span>{L("Bildirimleri dene", "Try notifications")}{msg && <><br /><small className="hint">{msg}</small></>}</span>
      <span className="row-ctl"><button className="btn ghost" onClick={send}>{L("Test bildirimi gönder", "Send a test notification")}</button></span>
    </div>
  );
}
