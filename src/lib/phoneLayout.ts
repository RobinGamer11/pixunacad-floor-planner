import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Zentrale Handy-Erkennung für CAD, 3D und Export.
 * Handy = kürzere Geräteseite < 768 CSS-px ODER verfügbare Fensterbreite < 1024 CSS-px
 * (und zugleich kürzere Fensterseite < 768, damit schmale Desktopfenster nicht kippen).
 * Die Höhe des Fensters wird bewusst über `window.innerWidth` / Geräteseiten bestimmt –
 * eine eingeblendete Bildschirmtastatur verändert nur die Höhe und löst daher keinen Wechsel aus.
 */
export const PHONE_SHORT_SIDE_PX = 768;
export const PHONE_WIDTH_PX = 1024;

export function computeIsPhone(input: { screenW: number; screenH: number; innerW: number; coarse: boolean }): boolean {
  const shortScreen = Math.min(input.screenW, input.screenH);
  if (shortScreen > 0 && shortScreen < PHONE_SHORT_SIDE_PX && input.coarse) return true;
  // Schmales Fenster (z. B. Desktop-Fenster verkleinert): nur Breite zählt, nie die Höhe.
  return input.innerW < PHONE_SHORT_SIDE_PX || (input.coarse && input.innerW < PHONE_WIDTH_PX && shortScreen < PHONE_SHORT_SIDE_PX);
}

function readIsPhone(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = !!window.matchMedia?.("(pointer: coarse)").matches;
  return computeIsPhone({ screenW: window.screen?.width ?? 0, screenH: window.screen?.height ?? 0, innerW: window.innerWidth, coarse });
}

export function usePhoneLayout(): boolean {
  const [v, setV] = useState(readIsPhone);
  useEffect(() => {
    const on = () => setV(readIsPhone());
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => { window.removeEventListener("resize", on); window.removeEventListener("orientationchange", on); };
  }, []);
  return v;
}

/* ── Flüchtiger Bedienzustand des Handy-Bedienfensters (nie Cloud/Undo) ── */
export type PhonePanel = null | "pages" | "tools" | "props" | "layers" | "more";
export type PhoneSnap = "half" | "full";
let panel: PhonePanel = null;
let snap: PhoneSnap = "half";
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const phonePanelStore = {
  get: () => panel,
  getSnap: () => snap,
  set(p: PhonePanel) { if (p === panel) return; panel = p; emit(); },
  toggle(p: Exclude<PhonePanel, null>) { panel = panel === p ? null : p; emit(); },
  setSnap(s: PhoneSnap) { if (s === snap) return; snap = s; emit(); },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};
export function usePhonePanel(): [PhonePanel, PhoneSnap] {
  const p = useSyncExternalStore(phonePanelStore.subscribe, phonePanelStore.get, phonePanelStore.get);
  const s = useSyncExternalStore(phonePanelStore.subscribe, phonePanelStore.getSnap, phonePanelStore.getSnap);
  return [p, s];
}

/* ── Hilfsrad-Einstellungen (lokal pro Gerät) ── */
export const WHEEL_SCALE_KEY = "pixuna.tabletAid.scale";
export const WHEEL_MIN = 0.75, WHEEL_MAX = 1.5;
export function clampWheelScale(v: number): number { return Number.isFinite(v) ? Math.min(WHEEL_MAX, Math.max(WHEEL_MIN, v)) : 1; }
export function readWheelScale(): number { try { return clampWheelScale(Number(localStorage.getItem(WHEEL_SCALE_KEY) ?? 1)); } catch { return 1; } }
export function writeWheelScale(v: number) {
  try { localStorage.setItem(WHEEL_SCALE_KEY, String(clampWheelScale(v))); } catch {}
  window.dispatchEvent(new CustomEvent("pixuna-wheel-settings"));
}
/** Anzeige 0–100 % ↔ physischer Faktor 0,75–1,5. */
export const wheelScaleToPercent = (v: number) => Math.round((clampWheelScale(v) - WHEEL_MIN) / (WHEEL_MAX - WHEEL_MIN) * 100);
export const wheelPercentToScale = (p: number) => clampWheelScale(WHEEL_MIN + Math.min(100, Math.max(0, p)) / 100 * (WHEEL_MAX - WHEEL_MIN));
export function resetWheelPosition() { window.dispatchEvent(new CustomEvent("pixuna-wheel-reset-pos")); }
