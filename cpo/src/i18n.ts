// Bağımlılığı yok: store ve metrics bunu içe aktarır; dil store'dan setLang ile gelir.

export type Lang = "tr" | "en";

/** İlk açılışta Windows (WebView2) diline göre: Türkçe değilse İngilizce. */
export const systemLang = (): Lang => (navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en");

let current: Lang = systemLang();
export const setLang = (l: Lang) => { current = l; };
export const lang = () => current;

/**
 * Metin çiftleri yerinde yazılır: L("Kaydet", "Save"). Bileşenler durum değişince yeniden
 * çizildiği için dil değişikliği anında yansır; modül düzeyindeki listeler getter ile okunur.
 */
export const L = (tr: string, en: string) => (current === "en" ? en : tr);

/** Yüzde: Türkçede işaret önde (%46), İngilizcede arkada (46%). */
export const percent = (n: number | string) => (current === "en" ? `${n}%` : `%${n}`);

/** Sayı / tarih biçimi (ondalık virgül vs. nokta). */
export const locale = () => (current === "en" ? "en-US" : "tr-TR");
