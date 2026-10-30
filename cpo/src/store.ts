import { useSyncExternalStore } from "react";
import { isTauri, loadState, onStateChanged, saveState } from "./backend";
import { METRIC_COLORS, METRIC_ORDER } from "./metrics";
import { AURORA } from "./panel/themes";
import { L, setLang, systemLang } from "./i18n";
import type { AlertLevels, AlertMetric, AppState, GameEntry, Hotkeys, MetricConfig, MetricId, OverlaySettings, Profile } from "./types";

const ORIGIN = Math.random().toString(36).slice(2);

/** FPS'te değer eşiğin ALTINA inince, diğerlerinde ÜSTÜNE çıkınca tetiklenir. RAM/VRAM yüzde doluluktur. */
export const DEFAULT_ALERTS: Record<AlertMetric, AlertLevels> = {
  fps: { warn: 60, crit: 30, notify: false },
  frametime: { warn: 25, crit: 40, notify: false },
  cpuTemp: { warn: 80, crit: 90, notify: true },
  gpuTemp: { warn: 80, crit: 90, notify: true },
  vramTemp: { warn: 90, crit: 100, notify: true }, // GDDR6/6X bağlantı noktası ~105 °C'ye kadar tasarlanır
  cpuLoad: { warn: 90, crit: 98, notify: false },
  gpuLoad: { warn: 90, crit: 98, notify: false },
  ram: { warn: 85, crit: 95, notify: false },
  vram: { warn: 85, crit: 95, notify: false },
  // Güç sınırı donanıma çok bağlı (dizüstü 15 W, masaüstü 250 W): varsayılan kapalı, kullanıcı girer.
  cpuPower: { warn: null, crit: null, notify: false },
  gpuPower: { warn: null, crit: null, notify: false },
};

// Kayıt Ctrl+Alt: Ctrl+Shift+R tarayıcılarda "önbelleksiz yenile"dir, genel kısayol onu çalardı.
export const DEFAULT_HOTKEYS: Hotkeys = { toggleOverlay: "Ctrl+Shift+KeyO", toggleLock: "Ctrl+Shift+KeyL", toggleRecord: "Ctrl+Alt+KeyR" };

export const DEFAULT_OVERLAY: OverlaySettings = {
  layout: "horizontal",
  scale: 1,
  fontSize: 14,
  fontWeight: 600,
  textColor: AURORA.textColor,
  iconSize: 16,
  gap: 10,
  bgColor: AURORA.bgColor,
  bgOpacity: AURORA.bgOpacity,
  showLabels: false,
  showIcons: true,
  font: AURORA.font,
  radius: AURORA.radius,
  metrics: METRIC_ORDER.map((id) => ({ id, enabled: false, color: METRIC_COLORS[id] })),
  valueColor: AURORA.valueColor,
  glow: AURORA.glow,
  textShadow: AURORA.textShadow,
  surface: AURORA.surface,
  outline: AURORA.outline,
  graph: "off",
  alertsEnabled: true,
  alerts: DEFAULT_ALERTS,
};

function makeProfile(id: string, name: string, enabled: MetricId[]): Profile {
  const rest = METRIC_ORDER.filter((m) => !enabled.includes(m));
  const metrics: MetricConfig[] = [...enabled, ...rest].map((mid) => ({
    id: mid, enabled: enabled.includes(mid), color: METRIC_COLORS[mid],
  }));
  return { id, name, overlay: { ...DEFAULT_OVERLAY, metrics } };
}

export function defaultState(): AppState {
  return {
    activeProfileId: "general",
    profiles: [
      makeProfile("minimal", "Minimal", ["fps", "gpuTemp"]),
      makeProfile("competitive", L("Rekabetçi oyun", "Competitive"), ["fps", "frametime", "lowFps"]),
      makeProfile("hardware", L("Donanım takibi", "Hardware monitor"), ["cpuLoad", "cpuTemp", "gpuLoad", "gpuTemp", "ram", "vram"]),
      makeProfile("general", L("Genel kullanım", "Everyday"), ["fps", "cpuLoad", "gpuLoad", "ram"]),
    ],
    // Tarayıcıda (Tauri dışı) geliştirirken gerçek veri olmadığı için demo açık başlar.
    app: { theme: "dark", demoData: !isTauri, minimizeToTray: true, hotkeys: DEFAULT_HOTKEYS, autoHide: false, autoProfile: true, baseProfileId: null, notifyCritical: true, autoRecord: false, onboarded: false, lang: systemLang() },
    locked: false,
    overlayVisible: true,
    overlayPosition: null,
    overlayAnchor: "tl",
    overlayMargin: 20,
    games: [],
    recording: null,
  };
}

export function normalizeOverlay(raw: Partial<OverlaySettings> | undefined): OverlaySettings {
  const o = { ...DEFAULT_OVERLAY, ...(raw ?? {}) };
  // Bu alanlar eklenmeden önce kaydedilmiş profiller eski görünümünü korusun (10 px köşe).
  if (raw && raw.radius === undefined) o.radius = 10;
  const given: MetricConfig[] = Array.isArray(raw?.metrics) ? raw!.metrics : [];
  const seen = new Set<MetricId>();
  const metrics: MetricConfig[] = [];
  for (const m of given) {
    if (METRIC_ORDER.includes(m.id) && !seen.has(m.id)) {
      seen.add(m.id);
      metrics.push({ id: m.id, enabled: !!m.enabled, color: m.color || METRIC_COLORS[m.id] });
    }
  }
  for (const id of METRIC_ORDER) if (!seen.has(id)) metrics.push({ id, enabled: false, color: METRIC_COLORS[id] });
  // Eski kayıtlarda alerts yok ya da eksik gösterge içerebilir: gösterge bazında birleştir.
  const alerts = { ...DEFAULT_ALERTS };
  for (const k of Object.keys(DEFAULT_ALERTS) as AlertMetric[]) {
    const a = raw?.alerts?.[k];
    if (a) alerts[k] = { warn: a.warn ?? null, crit: a.crit ?? null, notify: a.notify ?? DEFAULT_ALERTS[k].notify };
  }
  return { ...o, metrics, alerts };
}

/** fromDisk: açılışta okunan kayıt; pencereler arası yayında (state-changed) süren kayıt korunur. */
function normalize(raw: unknown, fromDisk = true): AppState {
  const d = defaultState();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<AppState>;
  if (!Array.isArray(r.profiles) || r.profiles.length === 0) return d;
  const profiles = r.profiles.map((p) => ({
    id: String(p.id), name: String(p.name ?? "Profil"), overlay: normalizeOverlay(p.overlay),
  }));
  const active = profiles.some((p) => p.id === r.activeProfileId) ? r.activeProfileId! : profiles[0].id;
  const games = normalizeGames(r, profiles.map((p) => p.id));
  return {
    activeProfileId: active,
    profiles,
    app: { ...d.app, ...(r.app ?? {}), hotkeys: { ...DEFAULT_HOTKEYS, ...(r.app?.hotkeys ?? {}) } },
    locked: !!r.locked,
    overlayVisible: r.overlayVisible ?? true,
    overlayPosition: r.overlayPosition ?? null,
    // Eski kayıtlarda çapa yok: sürüklenmiş konum varsa onu koru (özel), yoksa sol üst.
    overlayAnchor: r.overlayAnchor !== undefined ? r.overlayAnchor : r.overlayPosition ? null : "tl",
    overlayMargin: typeof r.overlayMargin === "number" ? r.overlayMargin : 20,
    games,
    // Önceki çalıştırmadan kalan "kayıt sürüyor" işareti takılı kalmasın; canlı yayında ise geçsin.
    recording: fromDisk ? null : r.recording ?? null,
  };
}

let state: AppState = defaultState();
const listeners = new Set<() => void>();
let timer: number | undefined;

const emit = () => {
  setLang(state.app.lang === "en" ? "en" : "tr");
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export const getState = () => state;
export const useAppState = () => useSyncExternalStore(subscribe, getState);
export const activeProfile = (s: AppState) => s.profiles.find((p) => p.id === s.activeProfileId) ?? s.profiles[0];

export function update(fn: (s: AppState) => AppState) {
  state = fn(state);
  emit();
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void saveState({ ...state, origin: ORIGIN }), 150);
}

export async function initStore() {
  state = normalize(await loadState());
  emit();
  await onStateChanged((raw) => {
    if ((raw as AppState | null)?.origin === ORIGIN) return; // kendi yazımızın yankısı
    state = normalize(raw, false);
    emit();
  });
}

export function resetAll() { update(() => defaultState()); }

export function patchOverlay(patch: Partial<OverlaySettings>) {
  update((s) => ({
    ...s,
    profiles: s.profiles.map((p) => (p.id === s.activeProfileId ? { ...p, overlay: { ...p.overlay, ...patch } } : p)),
  }));
}

export function patchMetric(id: MetricId, patch: Partial<MetricConfig>) {
  const o = activeProfile(state).overlay;
  patchOverlay({ metrics: o.metrics.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
}

export function moveMetric(id: MetricId, dir: -1 | 1) {
  const list = [...activeProfile(state).overlay.metrics];
  const i = list.findIndex((m) => m.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  patchOverlay({ metrics: list });
}

/** Sürükle-bırak: göstergeyi listede verilen konuma taşır. */
export function moveMetricTo(id: MetricId, to: number) {
  const list = [...activeProfile(state).overlay.metrics];
  const from = list.findIndex((m) => m.id === id);
  if (from < 0 || to < 0 || to >= list.length || from === to) return;
  const [m] = list.splice(from, 1);
  list.splice(to, 0, m);
  patchOverlay({ metrics: list });
}

/** "Valorant.exe" → "valorant": süreç adları büyük/küçük harf ve uzantıdan bağımsız eşleşir. */
export function normalizeGame(name: unknown): string {
  return String(name ?? "").trim().toLowerCase().replace(/.exe$/, "");
}

/** Elle profil seçimi: oyundan çıkınca dönülecek temel profil de bu olur. */
export function selectProfileManually(id: string) {
  update((st) => ({ ...st, activeProfileId: id, app: { ...st.app, baseProfileId: id } }));
}

/**
 * Kayıtlı oyunlar. 0.1.2'de oyunlar profillerin içinde (profile.games) tutuluyordu; bunlar bağlı
 * oldukları profille birlikte listeye taşınır. Var olmayan profile bağlı oyun "profil yok" olur.
 */
function normalizeGames(r: Partial<AppState>, profileIds: string[]): GameEntry[] {
  const out = new Map<string, GameEntry>();
  const valid = (id: unknown) => (typeof id === "string" && profileIds.includes(id) ? id : null);
  for (const g of Array.isArray(r.games) ? r.games : []) {
    const exe = normalizeGame(g?.exe);
    if (exe && !out.has(exe)) out.set(exe, { exe, name: String(g.name || exe), profileId: valid(g.profileId), path: g.path ?? null });
  }
  for (const p of (r.profiles ?? []) as (Profile & { games?: unknown })[]) {
    for (const raw of Array.isArray(p.games) ? p.games : []) {
      const exe = normalizeGame(raw);
      if (exe && !out.has(exe)) out.set(exe, { exe, name: exe, profileId: valid(p.id), path: null });
    }
  }
  return [...out.values()];
}

/** Oyunu kaydeder; zaten kayıtlıysa yalnızca boş alanlarını doldurur. Döndürür: kaydedilen exe adı. */
export function addGame(raw: string, opts: { name?: string; path?: string | null; profileId?: string | null } = {}): string | null {
  const exe = normalizeGame(raw);
  if (!exe) return null;
  update((st) => {
    if (st.games.some((g) => g.exe === exe)) {
      return { ...st, games: st.games.map((g) => (g.exe === exe ? { ...g, path: g.path ?? opts.path ?? null } : g)) };
    }
    return { ...st, games: [...st.games, { exe, name: opts.name?.trim() || exe, profileId: opts.profileId ?? null, path: opts.path ?? null }] };
  });
  return exe;
}

export function updateGame(exe: string, patch: Partial<Pick<GameEntry, "name" | "profileId">>) {
  update((st) => ({ ...st, games: st.games.map((g) => (g.exe === exe ? { ...g, ...patch } : g)) }));
}

export function removeGame(exe: string) {
  update((st) => ({ ...st, games: st.games.filter((g) => g.exe !== exe) }));
}
