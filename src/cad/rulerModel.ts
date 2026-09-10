/**
 * Gemeinsame Lineal-Basis für CAD und Projektmappe.
 *
 * Das Lineal ist ein Objekt der Szene (`scene.rulerGuide`). Die Strecke a→b
 * ist IMMER die Zeichenkante — die Auswahl "links / mittig / rechts" verschiebt
 * nur den halbtransparenten Linealkörper, nie die Zeichenkante selbst.
 *
 * Intern sind alle Längen (wie im restlichen CAD) in Metern. Die Anzeigeeinheit
 * (mm / cm / m) ist eine reine Darstellungseigenschaft des Lineals.
 */

export type RulerSide = "left" | "center" | "right";
export type RulerUnit = "mm" | "cm" | "m";

export const DEFAULT_RULER_SIDE: RulerSide = "center";
/** Abwärtskompatibilität: Lineale ohne gespeicherte Einheit waren cm. */
export const DEFAULT_RULER_UNIT: RulerUnit = "cm";

export const RULER_SIDES: { value: RulerSide; label: string }[] = [
  { value: "left", label: "Links" },
  { value: "center", label: "Mittig" },
  { value: "right", label: "Rechts" },
];

export const RULER_UNITS: { value: RulerUnit; label: string }[] = [
  { value: "mm", label: "mm" },
  { value: "cm", label: "cm" },
  { value: "m", label: "m" },
];

/** Einheiten pro Meter. */
export function unitsPerMeter(unit: RulerUnit): number {
  return unit === "mm" ? 1000 : unit === "cm" ? 100 : 1;
}

/**
 * Das Lineal ist eine Bildschirm-Zeichenhilfe: Eine Einheit belegt IMMER
 * dieselbe Anzahl Bildschirmpixel — unabhängig vom Kamera-/Seitenzoom.
 * Dadurch bleiben Länge, Teilstriche, Zahlen und Griffe optisch konstant.
 */
export const RULER_PX_PER_UNIT: Record<RulerUnit, number> = { mm: 6, cm: 40, m: 90 };

/** Bildschirmpixel pro Einheit (k = Backing-Store-Faktor der Zeichenfläche). */
export function rulerPxPerUnit(unit: RulerUnit, k = 1): number {
  return RULER_PX_PER_UNIT[unit] * k;
}

/** Backing-Store-Faktor der Zeichenfläche (1, wenn nicht ermittelbar). */
export function rulerScreenScale(app: any): number {
  try {
    const k = app?.renderer?._screenPxScale?.();
    if (Number.isFinite(k) && k > 0) return k;
  } catch { /* optional */ }
  return 1;
}

export function rulerSideOf(g: any): RulerSide {
  const s = g?.side;
  return s === "left" || s === "right" || s === "center" ? s : DEFAULT_RULER_SIDE;
}

export function rulerUnitOf(g: any): RulerUnit {
  const u = g?.unit;
  return u === "mm" || u === "cm" || u === "m" ? u : DEFAULT_RULER_UNIT;
}

/** Nachkommastellen für die Anzeige in der jeweiligen Einheit. */
export function rulerDecimals(unit: RulerUnit): number {
  return unit === "mm" ? 0 : unit === "cm" ? 1 : 3;
}

/** Meter → Anzeigewert der gewählten Einheit. */
export function metersToUnit(m: number, unit: RulerUnit): number {
  return m * unitsPerMeter(unit);
}

/** Anzeigewert der gewählten Einheit → Meter. */
export function unitToMeters(value: number, unit: RulerUnit): number {
  return value / unitsPerMeter(unit);
}

/**
 * Fangpunkt für das Lineal: nutzt dieselbe TopologyEngine wie alle anderen
 * Werkzeuge (Objektpunkte, Mittel-/Teilungspunkte, Wände, Texte, Tabellen,
 * Dokumente, Blattrahmen, Hilfslinien und deren Schnittpunkte).
 */
export function snapRulerPoint(app: any, input: any): { x: number; y: number; snapped: boolean } {
  const raw = { x: input.mouse.wx, y: input.mouse.wy };
  try {
    const snap = app?.topology?.findBestSnap?.(
      { x: input.mouse.sx, y: input.mouse.sy },
      raw,
      // Das Lineal darf niemals an sich selbst fangen.
      { ruler: true }
    );
    if (snap?.world) return { x: snap.world.x, y: snap.world.y, snapped: true };
  } catch { /* Fangsystem optional */ }
  return { ...raw, snapped: false };
}

/**
 * Shift-Fang: hält das Lineal auf 0°, 45°, 90°, 135°, 180° … relativ zum
 * Anfangspunkt. Die Länge bleibt dabei erhalten.
 */
export function constrainRulerAngle(
  anchor: { x: number; y: number },
  p: { x: number; y: number }
): { x: number; y: number } {
  const dx = p.x - anchor.x, dy = p.y - anchor.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: p.x, y: p.y };
  const step = Math.PI / 4;
  const ang = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: anchor.x + Math.cos(ang) * len, y: anchor.y + Math.sin(ang) * len };
}
