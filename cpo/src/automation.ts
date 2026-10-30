// Oyun algılama ve buna bağlı otomasyonlar: "yalnızca oyundayken göster" ve "oyuna göre profil".
// Kontrol panelinde çalışır (pencere gizliyken de yaşar). Telemetri saniyede bir gelir; kararlar
// zamanlayıcı yerine bu akışla verilir (gizli pencerede zamanlayıcılar kısılabilir).
import { useEffect, useRef, useState } from "react";
import { IDLE_FPS } from "./metrics";
import { normalizeGame, update } from "./store";
import type { AppState, Telemetry } from "./types";

const ENTER_MS = 2000; // oyuna girdikten bu kadar sonra "oyunda" say
const EXIT_MS = 3000; // Alt+Tab gibi kısa çıkışlarda overlay yanıp sönmesin

export interface GameState {
  inGame: boolean;
  /** Şu an eşleşen (kararlı) oyun adı ve profili. */
  game: string | null;
  profileId: string | null;
  /** Panelden önce ön planda olan son uygulama ("son uygulamayı ekle" için). */
  lastApp: string | null;
}

export type Pending = { key: string; since: number } | null;

/** Saf karar fonksiyonu (test edilebilir): bir telemetri örneğinden sonraki durum. */
export function decide(
  cur: GameState, pending: Pending, t: Telemetry, games: { exe: string; profileId: string | null }[], fpsAvailable: boolean, now: number,
): { state: GameState; pending: Pending } {
  // Ön planda panelimiz varsa (fgName null) bilgi yok: mevcut kararı koru.
  if (t.fgName == null) return { state: cur, pending };
  const name = normalizeGame(t.fgName);
  // Kayıtlı oyun pencere modunda da oyun sayılır; profili varsa o profile geçilir.
  const rule = games.find((g) => g.exe === name);
  const presenting = !fpsAvailable || (t.fps != null && t.fps >= IDLE_FPS);
  const inGame = !!rule || (!!t.fgFullscreen && presenting);
  const next = { inGame, game: inGame ? name : null, profileId: rule?.profileId ?? null };
  const key = JSON.stringify(next);
  const withApp = cur.lastApp === name ? cur : { ...cur, lastApp: name };

  if (key === JSON.stringify({ inGame: cur.inGame, game: cur.game, profileId: cur.profileId })) return { state: withApp, pending: null };
  const p = pending?.key === key ? pending : { key, since: now };
  if (now - p.since < (next.inGame ? ENTER_MS : EXIT_MS)) return { state: withApp, pending: p };
  return { state: { ...next, lastApp: name }, pending: null };
}

/**
 * fpsAvailable: ETW çalışıyorsa "oyun" için kare üretmek de şart (tam ekran ama boştaki uygulama oyun değil).
 * ETW yoksa yalnızca tam ekran olmak yeterli.
 */
export function useGameState(t: Telemetry, s: AppState, fpsAvailable: boolean): GameState {
  const [state, setState] = useState<GameState>({ inGame: false, game: null, profileId: null, lastApp: null });
  const pending = useRef<Pending>(null);
  useEffect(() => {
    setState((cur) => {
      // Silinmiş profile bağlı oyun profil değiştirmez.
      const games = s.games.map((g) => ({ exe: g.exe, profileId: s.profiles.some((p) => p.id === g.profileId) ? g.profileId : null }));
      const r = decide(cur, pending.current, t, games, fpsAvailable, Date.now());
      pending.current = r.pending;
      return r.state;
    });
  }, [t, s.games, s.profiles, fpsAvailable]);
  return state;
}

/** Oyuna bağlı profile geç; oyundan çıkınca elle seçilen (temel) profile dön. */
export function useAutoProfile(g: GameState, s: AppState) {
  useEffect(() => {
    if (!s.app.autoProfile) return;
    const base = s.app.baseProfileId && s.profiles.some((p) => p.id === s.app.baseProfileId) ? s.app.baseProfileId : null;
    const target = g.profileId ?? base;
    if (!target || target === s.activeProfileId) return;
    update((st) => ({
      ...st,
      activeProfileId: target,
      // İlk otomatik geçişte o anki profil temel profil olarak hatırlanır.
      app: { ...st.app, baseProfileId: st.app.baseProfileId ?? st.activeProfileId },
    }));
  }, [g.profileId, s.app.autoProfile]);
}
