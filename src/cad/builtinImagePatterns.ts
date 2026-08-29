/**
 * builtinImagePatterns.ts — eingebaute Schraffurmuster, die als Bildkachel
 * (1:1 die gelieferten Vorlagen) gezeichnet werden. Die Bilder werden einmalig
 * geladen, zwischengespeichert und lösen nach dem Laden ein Neuzeichnen aus.
 */
import { notifyPatternsChanged } from "./customHatchPatterns";

import kies02 from "@/assets/hatch/kies-02.png";
import pflasterung01 from "@/assets/hatch/pflasterung-01.png";
import holzdielen01 from "@/assets/hatch/holzdielen-01.png";
import naturstein from "@/assets/hatch/naturstein.png";
import abdichtung01 from "@/assets/hatch/abdichtung-01.png";
import waermedaemmungTile from "@/assets/hatch/waermedaemmung-tile.png";

export const IMAGE_PATTERN_SRC: Record<string, string> = {
  kies_02: kies02,
  pflasterung_01: pflasterung01,
  holzdielen_01: holzdielen01,
  naturstein: naturstein,
  abdichtung_01: abdichtung01,
  // Schraffur „Wärmedämmung“: exakt die gelieferte Bildvorlage.
  daemmung_weich: waermedaemmungTile,
};


export function isImagePatternId(id: string | undefined | null): boolean {
  return !!id && Object.prototype.hasOwnProperty.call(IMAGE_PATTERN_SRC, id);
}

const imageCache = new Map<string, HTMLImageElement>();

/** Liefert das geladene Bild oder `null`, solange es noch lädt. */
export function getImagePattern(id: string): HTMLImageElement | null {
  const hit = imageCache.get(id);
  if (hit) return hit.complete && hit.naturalWidth > 0 ? hit : null;
  const src = IMAGE_PATTERN_SRC[id];
  if (!src) return null;
  const img = new Image();
  img.onload = () => notifyPatternsChanged();
  img.src = src;
  imageCache.set(id, img);
  return img.complete && img.naturalWidth > 0 ? img : null;
}
