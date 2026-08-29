/**
 * Zentrale abgeleitete Rendergeometrie ("effektive Kontur").
 *
 * Die editierbare CAD-Geometrie (Punkte, Löcher, Bulges) bleibt unverändert und
 * liefert weiterhin alle echten Fangpunkte. Alles, was der Benutzer SIEHT —
 * Füllung, Musterclip, Kontur, Hover, blaue Auswahl, Auswahlgrenzen, Export —
 * muss dagegen aus dieser einen Funktion stammen, damit sichtbare Form und
 * Auswahl niemals auseinanderlaufen.
 */

import { hatchHoleRings, hatchOuterRing, tessellateWithBulges, type Vec2 } from "./geometry";
import { geometrySignature, roughenPolyline, type RoughenParams } from "./strokeEffects";

export interface EffectiveContourGeometry {
  /** Aufgeraute (oder unveränderte) Außenkontur. */
  outer: Vec2[];
  /** Aufgeraute (oder unveränderte) Lochkonturen. */
  holes: Vec2[][];
  /** Außenkontur + Löcher in Zeichenreihenfolge. */
  rings: Vec2[][];
  closed: boolean;
  /** Signatur der zugrunde liegenden Originalgeometrie. */
  signature: number;
}

/** Effektive geschlossene Kontur für Schraffur UND Polygon (eine Pipeline). */
export function getEffectiveContourGeometry(obj: any): EffectiveContourGeometry {
  // Offene Polygone (freier Modus) haben KEINE Kante letzter → erster Punkt.
  const isClosed = obj?.closed !== false;
  const outerRaw = isClosed
    ? hatchOuterRing(obj)
    : tessellateWithBulges(obj?.points || [], obj?.bulges, false, 48);
  const holesRaw = hatchHoleRings(obj);
  const rough: RoughenParams | undefined = obj?.roughen;
  const id = obj?.id || "anon";
  const enabled = !!rough?.enabled;

  const outer = enabled ? roughenPolyline(outerRaw, isClosed, rough!, { cacheKey: `contour:${id}:outer` }) : outerRaw;
  const holes = holesRaw.map((ring, i) =>
    enabled ? roughenPolyline(ring, true, rough!, { cacheKey: `contour:${id}:hole${i}` }) : ring);

  const sigPts: Vec2[] = [outerRaw, ...holesRaw].flat();
  return { outer, holes, rings: [outer, ...holes].filter((r) => r && r.length >= 2), closed: isClosed, signature: geometrySignature(sigPts) };
}

/** Effektive offene Kontur (Linie/Freihand) — gleiche Pipeline, nicht geschlossen. */
export function getEffectiveOpenGeometry(pts: Vec2[], rough: RoughenParams | undefined, cacheKey: string, phaseM = 0): Vec2[] {
  return rough?.enabled ? roughenPolyline(pts, false, rough, { cacheKey, phaseM }) : pts;
}

/** Tesselierte Originalkontur ohne Roughen (z. B. für Fangpunkte/Hit-Test). */
export function rawClosedContour(obj: any): Vec2[] {
  return tessellateWithBulges(obj.points, obj.bulges, obj?.closed !== false, 32);
}
