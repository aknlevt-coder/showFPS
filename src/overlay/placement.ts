// Overlay penceresinin ekrandaki yerleşimi. Tüm değerler fiziksel piksel (sanal masaüstü koordinatı).
import type { Anchor } from "../types";
import { L } from "../i18n";

export interface Rect { x: number; y: number; w: number; h: number }

export const ANCHORS: { id: Anchor; label: string }[] = [
  { id: "tl", get label() { return L("Sol üst", "Top left"); } }, { id: "tc", get label() { return L("Üst orta", "Top center"); } }, { id: "tr", get label() { return L("Sağ üst", "Top right"); } },
  { id: "ml", get label() { return L("Sol orta", "Middle left"); } }, { id: "mc", get label() { return L("Orta", "Center"); } }, { id: "mr", get label() { return L("Sağ orta", "Middle right"); } },
  { id: "bl", get label() { return L("Sol alt", "Bottom left"); } }, { id: "bc", get label() { return L("Alt orta", "Bottom center"); } }, { id: "br", get label() { return L("Sağ alt", "Bottom right"); } },
];

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Pencereyle en çok örtüşen alanın indeksi; hiçbiriyle örtüşmüyorsa (monitör çıkarılmış) 0. */
export function pickArea(win: Rect, areas: Rect[]): number {
  let best = 0, bestOv = -1;
  areas.forEach((a, i) => {
    const ov = overlap(win, a);
    if (ov > bestOv) { best = i; bestOv = ov; }
  });
  return best;
}

/** Pencereyi alanın tamamen içine çeker. Pencere alandan büyükse sol/üst kenara hizalanır. */
export function clampInto(win: Rect, area: Rect): { x: number; y: number } {
  const x = Math.max(area.x, Math.min(win.x, area.x + area.w - win.w));
  const y = Math.max(area.y, Math.min(win.y, area.y + area.h - win.h));
  return { x: Math.round(x), y: Math.round(y) };
}

/** Çapa noktasına göre konum; margin kenarlardan boşluk (orta hizalamada uygulanmaz). */
export function anchorPosition(anchor: Anchor, w: number, h: number, area: Rect, margin: number): { x: number; y: number } {
  const col = anchor[1], row = anchor[0];
  const x = col === "l" ? area.x + margin : col === "r" ? area.x + area.w - w - margin : area.x + (area.w - w) / 2;
  const y = row === "t" ? area.y + margin : row === "b" ? area.y + area.h - h - margin : area.y + (area.h - h) / 2;
  // Boşluk alanı aşacak kadar büyükse bile ekran dışına çıkma.
  return clampInto({ x, y, w, h }, area);
}
