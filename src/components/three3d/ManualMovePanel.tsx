import { RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { ManualMoveSession } from "@/cad/three3d/manualMoveSession";
import type { MoveDelta } from "@/cad/three3d/spatialTransform";
import { type SnapSettings3D } from "@/cad/three3d/manipulationSnap";

export interface ManualMovePanelProps {
  enabled: boolean; count: number; session: ManualMoveSession | null; mode: "translate"|"rotate"; error: string | null;
  onToggle: () => void; onMode: (mode:"translate"|"rotate")=>void;
  onDelta: (delta:MoveDelta)=>void; onApply:()=>void; onCancel:()=>void; onValidity:(valid:boolean)=>void;
  snapSettings:SnapSettings3D; onSnapSettings:(settings:SnapSettings3D)=>void;
  /** Räumliche Drehung aus „Manuell bewegen“ (Grad, formatiert); null = keine. */
  rotation?: { x: string; y: string; z: string } | null;
  onResetRotation?: () => void;
}
export function ManualMovePanel({enabled,error,onToggle,snapSettings,onSnapSettings,rotation,onResetRotation}:ManualMovePanelProps) {
  const chip = "flex-1 rounded-lg border px-2 py-2 text-center text-sm tabular-nums";
  return <section className="space-y-3 rounded-lg border p-3 text-xs" style={{ background: "hsl(var(--overlay-ink) / 0.94)", color: "hsl(var(--overlay-surface))", borderColor: "hsl(var(--overlay-surface) / 0.14)" }}>
    <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">Manuell bewegen</span><Switch aria-label="Manuell bewegen" checked={enabled} onCheckedChange={onToggle}/></div>
    <div className="text-[11px]" style={{ color: "hsl(var(--overlay-surface) / 0.62)" }}>Objekt im Raum verschieben und drehen</div>
    <label className="flex min-h-10 items-center justify-between gap-2 border-t pt-2" style={{ borderColor: "hsl(var(--overlay-surface) / 0.14)" }}><span className="text-sm font-semibold">Kontakt-Hilfsraster</span><Switch aria-label="Kontakt-Hilfsraster" checked={snapSettings.grid} onCheckedChange={grid=>onSnapSettings({...snapSettings,grid})}/></label>
    {rotation && (
      <div className="space-y-1.5 border-t pt-2" style={{ borderColor: "hsl(var(--overlay-surface) / 0.14)" }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px]" style={{ color: "hsl(var(--overlay-surface) / 0.62)" }}>Drehung im Raum</span>
          <button type="button" title="Drehung zurücksetzen" aria-label="Drehung zurücksetzen" disabled={!onResetRotation} className="grid h-6 w-6 place-items-center rounded hover:bg-muted disabled:opacity-40" onClick={onResetRotation}><RotateCcw size={12} /></button>
        </div>
        <div className="flex gap-1.5">
          <span className={chip} style={{ background: "hsl(var(--overlay-surface) / 0.07)", borderColor: "hsl(var(--overlay-surface) / 0.18)" }}>X {rotation.x}°</span>
          <span className={chip} style={{ background: "hsl(var(--overlay-surface) / 0.07)", borderColor: "hsl(var(--overlay-surface) / 0.18)" }}>Y {rotation.y}°</span>
          <span className={chip} style={{ background: "hsl(var(--overlay-surface) / 0.07)", borderColor: "hsl(var(--overlay-surface) / 0.18)" }}>Z {rotation.z}°</span>
        </div>
      </div>
    )}
    {error&&<p role="alert" className="text-destructive">{error}</p>}
  </section>;
}
