import { useEffect, useState } from "react";
import { Check, Move3D, Rotate3D, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { parseNum } from "@/components/cad/Object3DSettings";
import type { ManualMoveSession } from "@/cad/three3d/manualMoveSession";
import type { MoveDelta } from "@/cad/three3d/spatialTransform";

export interface ManualMovePanelProps {
  enabled: boolean; count: number; session: ManualMoveSession | null; mode: "translate"|"rotate"; error: string | null;
  onToggle: () => void; onMode: (mode:"translate"|"rotate")=>void;
  onDelta: (delta:MoveDelta)=>void; onApply:()=>void; onCancel:()=>void;
}
export function ManualMovePanel({enabled,count,session,mode,error,onToggle,onMode,onDelta,onApply,onCancel}:ManualMovePanelProps) {
  const [draft,setDraft]=useState<Partial<Record<keyof MoveDelta,string>>>({});
  useEffect(()=>setDraft({}),[session?.delta]);
  const invalid=Object.values(draft).some(v=>v!==undefined&&parseNum(v)===null);
  return <section className="space-y-2 border-t border-border pt-3 text-xs">
    <div className="flex items-center justify-between gap-2"><span className="font-medium">Manuell bewegen</span><Switch aria-label="Manuell bewegen" checked={enabled} onCheckedChange={onToggle}/></div>
    {enabled&&<>
      <div className="text-muted-foreground">{count?`${count} ${count===1?"Objekt":"Objekte"} ausgewählt`:"Bitte ein Objekt auswählen."}</div>
      {session&&<>
        <div className="flex gap-1"><Button size="sm" variant={mode==="translate"?"default":"outline"} onClick={()=>onMode("translate")}><Move3D size={14}/>Verschieben</Button><Button size="sm" variant={mode==="rotate"?"default":"outline"} onClick={()=>onMode("rotate")}><Rotate3D size={14}/>Drehen</Button></div>
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