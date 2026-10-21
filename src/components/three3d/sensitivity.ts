/** Anzeige 1–100 % ↔ interne Faktoren (lokaler Bedienzustand, nie Projekt/Cloud). */
export type Sens3D = { move: number; look: number; vert: number; stick: number };
const lin = (p: number, lo: number, hi: number) => lo + (Math.min(100, Math.max(1, p)) - 1) * (hi - lo) / 99;
const inv = (v: number, lo: number, hi: number) => Math.round(Math.min(100, Math.max(1, 1 + (v - lo) * 99 / (hi - lo))));
/** Bewegung/Blick/Höhe: 1 % = alter Wert 10 %, 100 % = alter Wert 300 % → Faktor. */
export const speedFactor = (p: number) => lin(p, 10, 300) / 100;
/** Joystick-Größe: 1 % = alt 60 %, 100 % = alt 180 % → Faktor. */
export const stickFactor = (p: number) => lin(p, 60, 180) / 100;
export const DEFAULT_SENS: Sens3D = { move: inv(100, 10, 300), look: inv(100, 10, 300), vert: inv(100, 10, 300), stick: inv(100, 60, 180) };
const KEY = "pixuna.3d.sens2";
export function loadSens(): Sens3D {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) || "null");
    if (g && Number.isFinite(g.move)) return { ...DEFAULT_SENS, ...g };
    const o = JSON.parse(localStorage.getItem("pixuna.3d.sens") || "null"); // alte Prozentwerte übernehmen
    if (o && Number.isFinite(o.move)) return { move: inv(o.move, 10, 300), look: inv(o.look ?? 100, 10, 300), vert: inv(o.move, 10, 300), stick: inv(o.stick ?? 100, 60, 180) };
  } catch {}
  return { ...DEFAULT_SENS };
}
export function saveSens(s: Sens3D) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
