/**
 * Transparenzverlauf als reine Anzeigeeigenschaft.
 *
 * Wird von Schraffuren (Füllung + Muster) und Dokumenten (bereits gerendertes
 * Bild/PDF) gemeinsam genutzt. Die Struktur ist bewusst klein und wird über die
 * bestehenden Style-/Serialisierungsstrecken mitgeführt. Ohne aktivierten
 * Verlauf verhält sich alles exakt wie bisher.
 */

export type DisplayGradientType = "linear" | "vignette";
export type DisplayGradientDirection =
  | "left-to-right" | "right-to-left" | "top-to-bottom" | "bottom-to-top";

export interface DisplayGradient {
  enabled: boolean;
  type: DisplayGradientType;
  direction: DisplayGradientDirection;
  /** Zusätzliche Drehung der linearen Richtung (Grad). */
  angleDeg: number;
  /** Ab hier beginnt das Ausblenden (0..100 % der Objektausdehnung). */
  startPercent: number;
  /** Hier ist die Endtransparenz erreicht (0..100 %). */
  endPercent: number;
  /** Deckkraft am Ende des Verlaufs (0..1). */
  endOpacity: number;
  /** Weichheit des Übergangs (0 = linear, 100 = sehr weich). */
  softness: number;
  /** Vignette: Mittelpunkt relativ zur Objekthülle (0..1). */
  centerX: number;
  centerY: number;
  /** Vignette: Ausdehnung relativ zur halben Objekthülle. */
  radiusX: number;
  radiusY: number;
}

export const DEFAULT_DISPLAY_GRADIENT: DisplayGradient = {
  enabled: false,
  type: "linear",
  direction: "left-to-right",
  angleDeg: 0,
  startPercent: 0,
  endPercent: 100,
  endOpacity: 0,
  softness: 50,
  centerX: 0.5,
  centerY: 0.5,
  radiusX: 1,
  radiusY: 1,
};

const num = (val: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const DIRECTIONS: DisplayGradientDirection[] =
  ["left-to-right", "right-to-left", "top-to-bottom", "bottom-to-top"];

/** Liest einen gespeicherten Verlauf robust ein. undefined → kein Verlauf. */
export function normalizeDisplayGradient(src: unknown): DisplayGradient | undefined {
  if (!src || typeof src !== "object") return undefined;
  const s = src as Partial<DisplayGradient>;
  const dir = DIRECTIONS.includes(s.direction as DisplayGradientDirection)
    ? (s.direction as DisplayGradientDirection) : DEFAULT_DISPLAY_GRADIENT.direction;
  return {
    enabled: !!s.enabled,
    type: s.type === "vignette" ? "vignette" : "linear",
    direction: dir,
    angleDeg: num(s.angleDeg, 0, -360, 360),
    startPercent: num(s.startPercent, 0, 0, 100),
    endPercent: num(s.endPercent, 100, 0, 100),
    endOpacity: num(s.endOpacity, 0, 0, 1),
    softness: num(s.softness, 50, 0, 100),
    centerX: num(s.centerX, 0.5, 0, 1),
    centerY: num(s.centerY, 0.5, 0, 1),
    radiusX: num(s.radiusX, 1, 0.05, 3),
    radiusY: num(s.radiusY, 1, 0.05, 3),
  };
}

/** Kopie für Serialisierung/Zwischenablage (null-sicher). */
export function copyDisplayGradient(src: unknown): DisplayGradient | undefined {
  const g = normalizeDisplayGradient(src);
  return g ? { ...g } : undefined;
}

/** true, wenn der Verlauf tatsächlich sichtbar etwas verändert. */
export function isDisplayGradientActive(src: unknown): boolean {
  const g = normalizeDisplayGradient(src);
  return !!g?.enabled;
}

/** Deckkraft entlang des Verlaufs (0..1) an der normierten Stelle t. */
function alphaAt(g: DisplayGradient, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const soft = g.softness / 100;
  const smooth = clamped * clamped * (3 - 2 * clamped);
  const eased = clamped * (1 - soft) + smooth * soft;
  return 1 - (1 - g.endOpacity) * eased;
}

const STOPS = 12;

/** Farbverlauf mit weichen Stufen zwischen Start- und Endpunkt aufbauen. */
function addStops(grad: CanvasGradient, g: DisplayGradient) {
  const start = Math.min(g.startPercent, g.endPercent) / 100;
  const end = Math.max(g.startPercent, g.endPercent) / 100;
  grad.addColorStop(0, "rgba(0,0,0,1)");
  if (start > 0) grad.addColorStop(start, "rgba(0,0,0,1)");
  for (let i = 1; i <= STOPS; i++) {
    const f = i / STOPS;
    const pos = start + (end - start) * f;
    grad.addColorStop(Math.min(1, Math.max(0, pos)), `rgba(0,0,0,${alphaAt(g, f).toFixed(4)})`);
  }
  if (end < 1) grad.addColorStop(1, `rgba(0,0,0,${g.endOpacity.toFixed(4)})`);
}

function baseAngleDeg(dir: DisplayGradientDirection): number {
  switch (dir) {
    case "right-to-left": return 180;
    case "top-to-bottom": return 90;
    case "bottom-to-top": return 270;
    default: return 0;
  }
}

export interface GradientRect { x: number; y: number; w: number; h: number }

/**
 * Wendet den Verlauf als Alpha-Maske auf den bereits gezeichneten Inhalt des
 * übergebenen (Offscreen-)Kontextes an. Der Aufrufer zeichnet vorher Füllung,
 * Muster bzw. Bild — hier wird nur noch weich ausgeblendet.
 */
export function applyDisplayGradientMask(
  ctx: CanvasRenderingContext2D,
  rect: GradientRect,
  src: unknown,
) {
  const g = normalizeDisplayGradient(src);
  if (!g || !g.enabled || rect.w <= 0 || rect.h <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  if (g.type === "vignette") {
    const vx = rect.x + rect.w * g.centerX;
    const vy = rect.y + rect.h * g.centerY;
    const rx = Math.max(1e-3, (rect.w / 2) * g.radiusX);
    const ry = Math.max(1e-3, (rect.h / 2) * g.radiusY);
    ctx.translate(vx, vy);
    ctx.scale(rx, ry);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    addStops(grad, g);
    ctx.fillStyle = grad;
    // Im skalierten Raum großzügig füllen, damit auch die Ecken abgedeckt sind.
    const reach = Math.max(rect.w / rx, rect.h / ry) + 2;
    ctx.fillRect(-reach, -reach, reach * 2, reach * 2);
  } else {
    const rad = (baseAngleDeg(g.direction) + g.angleDeg) * Math.PI / 180;
    const dx = Math.cos(rad), dy = Math.sin(rad);
    const extent = Math.abs(rect.w * dx) + Math.abs(rect.h * dy) || 1;
    const grad = ctx.createLinearGradient(
      cx - dx * extent / 2, cy - dy * extent / 2,
      cx + dx * extent / 2, cy + dy * extent / 2,
    );
    addStops(grad, g);
    ctx.fillStyle = grad;
    ctx.fillRect(rect.x - 1, rect.y - 1, rect.w + 2, rect.h + 2);
  }
  ctx.restore();
}
