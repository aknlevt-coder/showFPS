import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check as CheckIcon, Gamepad2, Keyboard, Radar, SlidersHorizontal, Sparkles } from "lucide-react";
import { prettyHotkey } from "../hotkeys";
import { L } from "../i18n";
import { update, useAppState } from "../store";
import { ANCHORS } from "../overlay/placement";
import type { AppSettings } from "../types";
import { Check, Row } from "./ui";

const setApp = (patch: Partial<AppSettings>) => update((x) => ({ ...x, app: { ...x.app, ...patch } }));

/**
 * İlk açılış rehberi: 4 adım. Ayarlar anında uygulanır (Atla deseniz de seçtikleriniz kalır).
 * Bitince ya da atlanınca app.onboarded = true; Uygulama ayarları'ndan yeniden açılabilir.
 * sources / autostart: panelin kendi bileşenleri (aynı durum rozetleri, aynı Görev Zamanlayıcı ayarı).
 */
export function Welcome({ sources, autostart, onClose }: {
  sources: ReactNode; autostart: ReactNode; onClose: (goTo?: "games" | "editor") => void;
}) {
  const s = useAppState();
  const [step, setStep] = useState(0);
  const finish = (goTo?: "games" | "editor") => { setApp({ onboarded: true }); onClose(goTo); };
  const hk = s.app.hotkeys;
  const anchor = s.overlayAnchor ? ANCHORS.find((a) => a.id === s.overlayAnchor)!.label : L("özel konum", "custom position");

  const steps: { title: string; Icon: typeof Sparkles; body: ReactNode }[] = [
    {
      title: L("Hoş geldiniz", "Welcome"),
      Icon: Sparkles,
      body: (
        <>
          {/* Dil ilk adımda: Windows dilinden seçildi, yanlışsa hemen değiştirilebilsin. */}
          <div className="wel-opts">
            <Row label="Dil / Language">
              <select value={s.app.lang} onChange={(e) => setApp({ lang: e.target.value as "tr" | "en" })}>
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
              </select>
            </Row>
          </div>
          <p>{L("showFPS; FPS, sıcaklık ve kullanım değerlerini oyunun üzerinde küçük bir şerit olarak gösterir.", "showFPS shows FPS, temperatures and usage as a small strip on top of your game.")}</p>
          <ul className="wel-list">
            <li>{L("Overlay şu an ekranda:", "The overlay is currently at:")} <b>{anchor}</b>. {L("Konumu Genel bakış'tan değiştirebilirsiniz.", "You can move it on the Overview page.")}</li>
            <li>{L("Bu pencereyi kapatınca uygulama kapanmaz, saatin yanındaki tepsi simgesine iner. Tamamen çıkmak için simgeye sağ tıklayıp Çıkış.", "Closing this window doesn't quit the app; it goes to the tray icon next to the clock. To quit, right-click the icon and choose Quit.")}</li>
            <li>{L("Hiçbir veri internete gönderilmez; ayarlar bu bilgisayarda kalır.", "Nothing is sent to the internet; settings stay on this PC.")}</li>
          </ul>
          <p className="hint">{L("Dört kısa adım. İstediğiniz an atlayabilirsiniz; seçtikleriniz yine kaydedilir.", "Four short steps. Skip any time; your choices are still saved.")}</p>
        </>
      ),
    },
    {
      title: L("Ölçüm durumu", "What can be measured"),
      Icon: Radar,
      body: (
        <>
          <p>{L("Hangi değerlerin okunabildiği aşağıda. Yeşil olanlar çalışıyor.", "Below is what can be read on this PC. Green ones are working.")}</p>
          {sources}
          <ul className="wel-list">
            <li>{L("FPS yalnızca bir oyun ön plandayken ölçülür; şu an “Hazır” yazması normaldir.", "FPS is only measured while a game is in front; “Ready” is normal right now.")}</li>
            <li>{L("CPU sıcaklığı ücretsiz PawnIO sürücüsünü ister. Kurulu değilse yukarıdaki “PawnIO'yu kur” düğmesiyle kurabilirsiniz; kurmasanız da diğer değerler çalışır.", "CPU temperature needs the free PawnIO driver. If it's missing, use “Install PawnIO” above; everything else works without it.")}</li>
          </ul>
        </>
      ),
    },
    {
      title: L("Tercihler", "Preferences"),
      Icon: SlidersHorizontal,
      body: (
        <>
          <p>{L("Hepsi sonradan Uygulama ayarları'ndan değiştirilebilir.", "All of these can be changed later in Settings.")}</p>
          <div className="wel-opts">
            <Check label={L("Overlay'i yalnızca oyundayken göster", "Show the overlay only while in game")} checked={s.app.autoHide} onChange={(v) => setApp({ autoHide: v })} />
            {autostart}
            <Check label={L("Kritik sıcaklıkta Windows bildirimi gönder", "Send a Windows notification at critical temperatures")} checked={s.app.notifyCritical} onChange={(v) => setApp({ notifyCritical: v })} />
            <Check label={L("Oyun oturumlarını otomatik kaydet", "Record game sessions automatically")} checked={s.app.autoRecord} onChange={(v) => setApp({ autoRecord: v })} />
          </div>
          <p className="hint">
            {L(
              "Oturum kaydı oyun boyunca FPS, sıcaklık ve kullanım sayılarını bu bilgisayarda saklar (ekran ya da tuş kaydı yapılmaz); sonra Oturumlar sayfasında rapor olarak bakarsınız. İstemiyorsanız kapalı bırakın.",
              "Session recording keeps FPS, temperature and usage numbers on this PC while you play (no screen or key capture); you can review them later as reports on the Sessions page. Leave it off if you don't want it.",
            )}
          </p>
        </>
      ),
    },
    {
      title: L("Kısayollar ve oyunlar", "Shortcuts and games"),
      Icon: Keyboard,
      body: (
        <>
          <p>{L("Bu kısayollar oyunun içindeyken de çalışır:", "These shortcuts work inside games too:")}</p>
          <table className="status wel-keys">
            <tbody>
              <tr><td>{L("Overlay'i göster / gizle", "Show / hide overlay")}</td><td><span className="kbd">{prettyHotkey(hk.toggleOverlay)}</span></td></tr>
              <tr><td>{L("Kilitle / taşımak için kilidi aç", "Lock / unlock to move")}</td><td><span className="kbd">{prettyHotkey(hk.toggleLock)}</span></td></tr>
              <tr><td>{L("Oturum kaydını başlat / bitir", "Start / stop session recording")}</td><td><span className="kbd">{prettyHotkey(hk.toggleRecord)}</span></td></tr>
            </tbody>
          </table>
          <p>
            <Gamepad2 size={15} style={{ verticalAlign: -3 }} />{" "}
            {L(
              "Tam ekran oyunlar kendiliğinden algılanır. Oyunlarınızı Oyunlar sayfasına eklerseniz her birine ayrı bir overlay profili atayabilirsiniz.",
              "Fullscreen games are detected automatically. Add your games on the Games page to give each one its own overlay profile.",
            )}
          </p>
        </>
      ),
    },
  ];
  const cur = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="wel-bg" role="dialog" aria-modal="true" aria-labelledby="wel-title">
      <div className="wel">
        <div className="wel-head">
          <span className="wel-icon"><cur.Icon size={20} /></span>
          <div className="grow">
            <small>{L("Adım", "Step")} {step + 1} / {steps.length}</small>
            <h3 id="wel-title">{cur.title}</h3>
          </div>
          <button className="link-btn" onClick={() => finish()}>{L("Atla", "Skip")}</button>
        </div>
        <div className="wel-dots" aria-hidden>{steps.map((_, i) => <i key={i} className={i <= step ? "on" : ""} />)}</div>
        <div className="wel-body" key={step}>{cur.body}</div>
        <div className="wel-foot">
          {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)}><ArrowLeft size={14} /> {L("Geri", "Back")}</button>}
          <span className="grow" />
          {last ? (
            <>
              <button className="btn ghost" onClick={() => finish("games")}><Gamepad2 size={14} /> {L("Oyunlarımı ekle", "Add my games")}</button>
              <button className="btn" onClick={() => finish()}><CheckIcon size={14} /> {L("Başla", "Start")}</button>
            </>
          ) : (
            <button className="btn" onClick={() => setStep(step + 1)}>{L("İleri", "Next")} <ArrowRight size={14} /></button>
          )}
        </div>
      </div>
    </div>
  );
}
