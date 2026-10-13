/**
 * Vorschaufenster oben rechts auf der Zeichenfläche während der Platzierung
 * eines Bibliotheksobjekts. Drehen, Spiegeln und Maße steuern direkt die
 * Transformation des Platzierungswerkzeugs – Vorschau und gesetztes Objekt
 * sind damit 1:1 identisch.
 */
import { useEffect, useMemo, useReducer } from "react";
import { X } from "lucide-react";
import type { CadApp } from "@/cad/CadApp";
import LibraryGeometryPreview from "./LibraryGeometryPreview";
import { snapshotsBounds, transformSnapshots } from "@/cad/library/libraryGeometry";

const SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315, 360];
const SNAP_TOL = 4;

/** Rastet Drehwinkel nahe 0/45/90/…/360° ein. */
export function snapRotationDeg(deg: number): number {
  for (const a of SNAP_ANGLES) if (Math.abs(deg - a) <= SNAP_TOL) return a;
  return Math.round(deg);
}

type Mirror = "none" | "h" | "v" | "both";

export default function LibraryPlacementPreview({ app }: { app: CadApp | null }) {
  const [, force] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!app) return;
    const t = window.setInterval(force, 150);
    return () => window.clearInterval(t);
  }, [app]);

  const tool = app?.libraryTool;
  const def = tool && tool.phase !== "idle" ? tool.activeDef : null;
  const tr = tool?.getTransform();
  const geometry = useMemo(
    () => (def && tr ? transformSnapshots(def.geometry, { position: { x: 0, y: 0 }, ...tr }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def, tr?.rotationRad, tr?.scaleX, tr?.scaleY],
  );
  if (!app || !tool || !def || !tr) return null;

  const base = snapshotsBounds(def.geometry);
  const baseW = Math.max(1e-6, base.maxX - base.minX);
  const baseH = Math.max(1e-6, base.maxY - base.minY);
  const deg = Math.round(((tool.rotationRad * 180) / Math.PI + 3600) % 360 * 10) / 10;
  const mirror: Mirror = tool.mirrorX && tool.mirrorY ? "both" : tool.mirrorX ? "h" : tool.mirrorY ? "v" : "none";
  const widthM = baseW * tool.scaleX;
  const lengthM = baseH * tool.scaleY;

  const setMirror = (m: Mirror) => tool.setMirror(m === "h" || m === "both", m === "v" || m === "both");
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className="absolute right-3 top-3 z-30 w-[260px] rounded-md border shadow-xl"
      style={{ borderColor: "hsl(var(--cad-hub-border))", background: "hsl(var(--cad-settings-bg))" }}
      onPointerDown={stop} onMouseDown={stop} onClick={stop} onWheel={stop}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold">{def.name}</div>
          <div className="truncate text-[11px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
            {def.category || "Ohne Kategorie"} · Klick auf die Zeichenfläche platziert
          </div>
        </div>
        <button type="button" title="Platzierung beenden" className="cad-toolbar-btn h-7 w-7 justify-center p-0"
          onClick={() => app.cancelLibraryPlacement()}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mx-3 flex items-center justify-center rounded border" style={{ borderColor: "hsl(var(--cad-hub-border))", height: 200 }}>
        <LibraryGeometryPreview geometry={geometry} size={190} title={def.name} />
      </div>
      <div className="space-y-2.5 p-3 text-[12px]">
        <label className="block">
          <span className="mb-1 flex justify-between"><span>Drehen</span><span>{deg}°</span></span>
          <input type="range" min={0} max={360} step={1} value={deg} className="w-full"
            onChange={(e) => tool.setRotationDeg(snapRotationDeg(parseFloat(e.target.value)))} />
        </label>
        <label className="block">
          <span className="mb-1 block">Spiegeln</span>
          <select className="cad-settings-select h-8 w-full px-2 text-[12px]" value={mirror}
            onChange={(e) => setMirror(e.target.value as Mirror)}>
            <option value="none">Nicht gespiegelt</option>
            <option value="h">Horizontal spiegeln</option>
            <option value="v">Vertikal spiegeln</option>
            <option value="both">Horizontal und vertikal</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block">Breite (m)</span>
            <input type="number" min={0.001} step={0.01} className="cad-settings-input h-8 w-full px-2 text-[12px]"
              value={Number(widthM.toFixed(3))}
              onChange={(e) => { const n = parseFloat(e.target.value); if (n > 0) tool.setScale(n / baseW, tool.scaleY); }} />
          </label>
          <label className="block">
            <span className="mb-1 block">Länge (m)</span>
            <input type="number" min={0.001} step={0.01} className="cad-settings-input h-8 w-full px-2 text-[12px]"
              value={Number(lengthM.toFixed(3))}
              onChange={(e) => { const n = parseFloat(e.target.value); if (n > 0) tool.setScale(tool.scaleX, n / baseH); }} />
          </label>
        </div>
      </div>
    </div>
  );
}
