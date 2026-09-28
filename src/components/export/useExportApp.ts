import { useEffect, useReducer } from "react";
import type { CadApp } from "@/cad/CadApp";

/** Rendert neu, sobald sich Exportseiten/Ordner in der CAD-Engine ändern. */
export function usePlanUi(app: CadApp | null, pollMs = 0) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!app) return;
    const off = app.onPlanUiChange(force);
    const unsubHistory = (() => {
      const prev = app.onHistoryChange;
      app.onHistoryChange = (...args: any[]) => { (prev as any)?.(...args); force(); };
      return () => { app.onHistoryChange = prev; };
    })();
    const t = pollMs > 0 ? window.setInterval(force, pollMs) : 0;
    return () => { off(); unsubHistory(); if (t) window.clearInterval(t); };
  }, [app, pollMs]);
}

export function formatLabel(formatKey: string, landscape: boolean, w?: number, h?: number) {
  const base = formatKey === "free" ? `${Math.round(w ?? 0)}×${Math.round(h ?? 0)} mm` : formatKey.toUpperCase();
  return `${base} ${landscape ? "quer" : "hoch"}`;
}
