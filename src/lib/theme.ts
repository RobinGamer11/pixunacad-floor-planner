/**
 * theme.ts — globales Erscheinungsbild.
 *
 * - `theme`      : "light" | "dark" (gesamte Oberfläche, Klasse `dark` am <html>)
 * - `canvasDark` : nur die Zeichenflächen (CAD-Canvas + Projektmappen-Blätter)
 *                  werden optisch invertiert (weiß ⇄ schwarz), Klasse
 *                  `pixuna-canvas-dark` am <html>. Wird auch beim Export/Druck
 *                  berücksichtigt, da die Klasse global gesetzt bleibt.
 */

export type ThemeMode = "light" | "dark";

const THEME_KEY = "pixuna.theme";
const CANVAS_KEY = "pixuna.canvasDark";

type Listener = () => void;
const listeners = new Set<Listener>();

function read<T extends string>(key: string, fallback: T): T {
  try { return (localStorage.getItem(key) as T) || fallback; } catch { return fallback; }
}

export function getTheme(): ThemeMode {
  return read<ThemeMode>(THEME_KEY, "light") === "dark" ? "dark" : "light";
}

export function isCanvasDark(): boolean {
  try { return localStorage.getItem(CANVAS_KEY) === "1"; } catch { return false; }
}

function apply() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", getTheme() === "dark");
  root.classList.toggle("pixuna-canvas-dark", isCanvasDark());
}

export function setTheme(mode: ThemeMode) {
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* ignore */ }
  apply();
  listeners.forEach((l) => l());
}

export function setCanvasDark(on: boolean) {
  try { localStorage.setItem(CANVAS_KEY, on ? "1" : "0"); } catch { /* ignore */ }
  apply();
  listeners.forEach((l) => l());
}

export function subscribeTheme(fn: Listener) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Beim App-Start einmalig aufrufen. */
export function initTheme() {
  apply();
}
