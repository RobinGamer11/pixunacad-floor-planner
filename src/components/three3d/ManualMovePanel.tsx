import { Switch } from "@/components/ui/switch";
import type { ManualMoveSession } from "@/cad/three3d/manualMoveSession";
import type { MoveDelta } from "@/cad/three3d/spatialTransform";
import { type SnapSettings3D } from "@/cad/three3d/manipulationSnap";

export interface ManualMovePanelProps {
  enabled: boolean; count: number; session: ManualMoveSession | null; mode: "translate"|"rotate"; error: string | null;
  onToggle: () => void; onMode: (mode:"translate"|"rotate")=>void;
  onDelta: (delta:MoveDelta)=>void; onApply:()=>void; onCancel:()=>void; onValidity:(valid:boolean)=>void;
  snapSettings:SnapSettings3D; onSnapSettings:(settings:SnapSettings3D)=>void;
}
export function ManualMovePanel({enabled,error,onToggle,snapSettings,onSnapSettings}:ManualMovePanelProps) {
  return <section className="space-y-2 border-t border-border pt-3 text-xs">
    <div className="flex items-center justify-between gap-2"><span className="font-medium">Manuell bewegen</span><Switch aria-label="Manuell bewegen" checked={enabled} onCheckedChange={onToggle}/></div>
      <label className="flex items-center justify-between gap-2 text-muted-foreground"><span>Kontakt-Hilfsraster</span><Switch aria-label="Kontakt-Hilfsraster" checked={snapSettings.grid} onCheckedChange={grid=>onSnapSettings({...snapSettings,grid})}/></label>
      {error&&<p role="alert" className="text-destructive">{error}</p>}
  </section>;
}