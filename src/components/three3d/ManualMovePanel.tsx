import { useEffect, useState } from "react";
import { Check, Move3D, Rotate3D, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { parseNum } from "@/components/cad/Object3DSettings";
import type { ManualMoveSession } from "@/cad/three3d/manualMoveSession";
import type { MoveDelta } from "@/cad/three3d/spatialTransform";
import { normalizeSnapSettings, type SnapSettings3D } from "@/cad/three3d/manipulationSnap";

export interface ManualMovePanelProps {
  enabled: boolean; count: number; session: ManualMoveSession | null; mode: "translate"|"rotate"; error: string | null;
  onToggle: () => void; onMode: (mode:"translate"|"rotate")=>void;
  onDelta: (delta:MoveDelta)=>void; onApply:()=>void; onCancel:()=>void; onValidity:(valid:boolean)=>void;
  snapSettings:SnapSettings3D; onSnapSettings:(settings:SnapSettings3D)=>void;
}
export function ManualMovePanel({enabled,count,session,mode,error,onToggle,onMode,onDelta,onApply,onCancel,onValidity,snapSettings,onSnapSettings}:ManualMovePanelProps) {
  const [draft,setDraft]=useState<Partial<Record<keyof MoveDelta,string>>>({});
  useEffect(()=>setDraft({}),[session?.baseline]);
  const invalid=Object.values(draft).some(v=>v!==undefined&&parseNum(v)===null);
  useEffect(()=>onValidity(!invalid),[invalid,onValidity]);
  useEffect(()=>{
    if(document.activeElement?.getAttribute("aria-label")?.startsWith("Bewegung "))return;
    setDraft({});
  },[session?.delta]);
  return <section className="space-y-2 border-t border-border pt-3 text-xs">
    <div className="flex items-center justify-between gap-2"><span className="font-medium">Manuell bewegen</span><Switch aria-label="Manuell bewegen" checked={enabled} onCheckedChange={onToggle}/></div>
    {enabled&&<>
      <div className="text-muted-foreground">{count?`${count} ${count===1?"Objekt":"Objekte"} ausgewählt`:"Bitte ein Objekt auswählen."}</div>
      {session&&<>
        <div className="flex gap-3 text-[10px] text-muted-foreground"><span>X · Grundriss</span><span>Y · Grundriss</span><span>Z · Höhe</span></div>
        <div className="flex gap-1"><Button size="sm" variant={mode==="translate"?"default":"outline"} onClick={()=>onMode("translate")}><Move3D size={14}/>Verschieben</Button><Button size="sm" variant={mode==="rotate"?"default":"outline"} onClick={()=>onMode("rotate")}><Rotate3D size={14}/>Drehen</Button></div>
        <details className="border-b border-border pb-2">
          <summary className="cursor-pointer py-1 text-muted-foreground">Fangen und Gizmo</summary>
          <div className="mt-2 space-y-2">
            <label className="flex items-center justify-between gap-2"><span>Objekt- und Winkelfang</span><Switch aria-label="Objekt- und Winkelfang" checked={snapSettings.enabled} onCheckedChange={enabled=>onSnapSettings({...snapSettings,enabled})}/></label>
            <label className="flex items-center justify-between gap-2"><span>Hilfsraster</span><Switch aria-label="Hilfsraster" checked={snapSettings.grid} onCheckedChange={grid=>onSnapSettings({...snapSettings,grid})}/></label>
            <label className="flex items-center justify-between gap-2"><span>Rasterabstand (m)</span><input aria-label="Fangraster Abstand" type="number" min={.001} max={10} step={.01} value={snapSettings.stepM} className="h-8 w-20 rounded-md border border-input bg-background px-2" onChange={e=>{const stepM=Number(e.target.value);if(Number.isFinite(stepM)&&stepM>0)onSnapSettings(normalizeSnapSettings({...snapSettings,stepM}));}}/></label>
            <label className="flex items-center justify-between gap-2"><span>Winkelfang</span><select aria-label="Winkelfang" value={snapSettings.angleDeg} className="h-8 rounded-md border border-input bg-background px-2" onChange={e=>onSnapSettings({...snapSettings,angleDeg:Number(e.target.value)})}>{[5,15,30,45,90].map(v=><option key={v} value={v}>{v}°</option>)}</select></label>
            <label className="block"><span className="flex justify-between"><span>Gizmo-Größe</span><span>{Math.round(snapSettings.size*100)} %</span></span><input aria-label="Gizmo-Größe" type="range" min={.5} max={2} step={.05} value={snapSettings.size} className="w-full" onChange={e=>onSnapSettings({...snapSettings,size:Number(e.target.value)})}/></label>
          </div>
        </details>
        <div className="grid grid-cols-3 gap-2">
          {(["x","y","z","rx","ry","rz"] as const).map(k=><label key={k} className="min-w-0 space-y-1"><span className="text-muted-foreground">Δ{k.toUpperCase()} ({k.startsWith("r")?"°":"m"})</span><input className="h-9 w-full rounded-md border border-input bg-background px-2 tabular-nums" aria-label={`Bewegung ${k}`} inputMode="decimal" value={draft[k]??String(Number(session.delta[k].toFixed(3))).replace(".",",")} onChange={e=>{
            const text=e.target.value, value=parseNum(text);setDraft(s=>({...s,[k]:text}));if(value!==null)onDelta({...session.delta,[k]:value});
          }} onKeyDown={e=>{e.stopPropagation();if(e.key==="Escape"){e.preventDefault();onCancel();}if(e.key==="Enter"&&!invalid){e.preventDefault();onApply();}}}/></label>)}
        </div>
        {invalid&&<p role="alert" className="text-destructive">Bitte eine gültige Zahl eingeben.</p>}
        <div className="flex gap-2"><Button size="sm" disabled={invalid||!!error} onClick={onApply}><Check size={14}/>Übernehmen</Button><Button size="sm" variant="outline" onClick={onCancel}><X size={14}/>Verwerfen</Button></div>
      </>}
      {error&&<p role="alert" className="text-destructive">{error}</p>}
    </>}
  </section>;
}