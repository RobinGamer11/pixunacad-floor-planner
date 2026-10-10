/**
 * Einzige Stelle für Auflösungs- und Budgetentscheidungen neuer Pixelaktionen.
 * Werkzeuge (Linie, Freihand, Schraffur, Text) legen KEINE eigenen Grenzen fest.
 *
 * Stand: Die automatische Reduzierung der gespeicherten Auflösung ist
 * vorbereitet, aber bewusst DEAKTIVIERT. Sie wird erst eingeschaltet, wenn
 * unterschiedliche Auflösungen innerhalb derselben Ebene vom Datenmodell
 * (Manifest/Transformation) vollständig unterstützt werden. Bis dahin gilt die
 * feste Ebenenauflösung; was darin das Budget sprengt, wird abgelehnt.
 */

/** Startprofil (konservativ, keine gemessene Gerätefreigabe). */
export const RASTER_BUDGET = {
  /** Temporärer Arbeitsspeicher eines Rasterjobs (Bytes, RGBA). */
  tempJobBytes: 16 * 1024 * 1024,
  /** Obergrenze berührter Kacheln je Benutzeraktion. */
  maxActionTiles: 6000,
  /** Bis zu dieser Kachelzahl läuft die Aktion sofort (ohne Fortschritt). */
  syncTileLimit: 12,
  /** Obergrenze kodierter (PNG-)Assetbytes, die EINE neue Aktion erzeugen darf. */
  maxActionAssetBytes: 5_000_000,
  /** Kleinste zulässige Merkmalsbreite (Strich) in Pixeln nach einer Reduktion. */
  minFeaturePx: 3,
} as const;

/** Vorbereitet, aber inaktiv (siehe Modulkommentar). */
export const AUTO_RESOLUTION_REDUCTION_ENABLED = true;

/** Halbierungsstufen je Kachel (identisch zu `TILE_SCALES` in RasterLayers). */
export const RASTER_SCALE_STEPS = [1, 0.5, 0.25, 0.125] as const;

/**
 * Wählt für eine NEUE Aktion die Auflösungsstufe anhand einer Stichprobe
 * (kodierte Bytes je belegter Kachel bei Stufe 1). Bestehende Inhalte werden
 * nie umgerechnet. Feine Striche (`featurePx` bei Stufe 1) und Muster/Text
 * (`reducible=false`) werden nie vergröbert – dann lieber ablehnen.
 * Ergebnis null = auch reduziert zu groß → Vektor bleibt.
 */
export function chooseActionScale(input: {
  bytesPerTileAtFull: number;
  occupiedTiles: number;
  featurePx: number;
  reducible: boolean;
}): number | null {
  const budget = RASTER_BUDGET.maxActionAssetBytes;
  const est = (s: number) => input.bytesPerTileAtFull * input.occupiedTiles * s * s;
  if (est(1) <= budget) return 1;
  if (!AUTO_RESOLUTION_REDUCTION_ENABLED || !input.reducible) return null;
  for (const s of RASTER_SCALE_STEPS) {
    if (s === 1) continue;
    if (input.featurePx * s < RASTER_BUDGET.minFeaturePx) return null;
    if (est(s) <= budget) return s;
  }
  return null;
}

export type RasterPlan =
  | { ok: true; pxPerM: number; tiles: number; mode: "sync" | "job" }
  | { ok: false; reason: "too-large" | "invalid"; tiles: number };

export function tileBytes(tilePx: number): number {
  return tilePx * tilePx * 4;
}

/**
 * Entscheidet für eine neue Aktion anhand der tatsächlich berührten Kacheln
 * (nicht der Bounding-Box), ob sie sofort, als Hintergrundjob oder gar nicht
 * ausgeführt wird.
 */
export function planRasterAction(input: {
  layerPxPerM: number;
  tilePx: number;
  touchedTiles: number;
  /** true, wenn eine temporäre Ablage außerhalb des RAM verfügbar ist. */
  hasTempStore: boolean;
  /** true, wenn die App Hintergrundjobs mit atomarem Abschluss unterstützt. */
  supportsJobs: boolean;
}): RasterPlan {
  const { layerPxPerM, tilePx, touchedTiles } = input;
  if (!Number.isFinite(layerPxPerM) || layerPxPerM <= 0 || !Number.isFinite(touchedTiles) || touchedTiles < 0 || tilePx <= 0) {
    return { ok: false, reason: "invalid", tiles: touchedTiles };
  }
  if (touchedTiles > RASTER_BUDGET.maxActionTiles) return { ok: false, reason: "too-large", tiles: touchedTiles };
  const ramTiles = Math.max(1, Math.floor(RASTER_BUDGET.tempJobBytes / tileBytes(tilePx)));
  if (touchedTiles <= Math.min(RASTER_BUDGET.syncTileLimit, ramTiles)) {
    return { ok: true, pxPerM: layerPxPerM, tiles: touchedTiles, mode: "sync" };
  }
  if (!input.supportsJobs) return { ok: false, reason: "too-large", tiles: touchedTiles };
  // Ohne temporäre Ablage dürfen nur so viele Kacheln entstehen, wie das
  // Jobbudget im RAM erlaubt – kein unbegrenztes Sammeln im Speicher.
  if (!input.hasTempStore && touchedTiles > ramTiles) return { ok: false, reason: "too-large", tiles: touchedTiles };
  return { ok: true, pxPerM: layerPxPerM, tiles: touchedTiles, mode: "job" };
}

/**
 * Vorbereitete Schätzung für spätere Auflösungsreduktion (Halbierungsstufen).
 * Wird erst genutzt, wenn AUTO_RESOLUTION_REDUCTION_ENABLED aktiv ist.
 */
export function reducedPxPerM(currentPxPerM: number, estimatedPixels: number, budgetPixels: number, minPxPerM: number): number | null {
  if (estimatedPixels <= budgetPixels) return currentPxPerM;
  const ideal = currentPxPerM * Math.sqrt(budgetPixels / estimatedPixels);
  let r = currentPxPerM;
  while (r > ideal) r /= 2;
  return r >= minPxPerM ? r : null;
}
