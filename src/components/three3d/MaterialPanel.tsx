import { useRef, useState } from "react";
import { ImagePlus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_MATERIAL, MATERIAL_DRAG_TYPE, type Material3D } from "@/cad/three3d/materials";
import { setObjectMaterial } from "@/cad/three3d/projectBridge";
import type { CadApp } from "@/cad/CadApp";
import { projectStore, type Project } from "@/lib/projectStore";
interface MaterialObject { material3D?: Material3D; frameMaterial3D?: Material3D; panelMaterial3D?: Material3D; kind?: string }

export function MaterialPanel({ app, project, selected }: { app: CadApp; project?: Project; selected: {sheetId:string;id:string;obj:MaterialObject;list:string} | null }) {
  const [error,setError] = useState<string|null>(null);
  const [slot,setSlot] = useState<"material3D"|"frameMaterial3D"|"panelMaterial3D">(selected?.list === "doors" ? "frameMaterial3D" : "material3D");
  const [draft,setDraft] = useState<Material3D|null>(null);
  const palette = project?.settings?.materials3D ?? [];
  const material: Material3D | null = selected ? selected.obj[slot] ?? null : draft;
  const image = (m: Material3D) => project?.files?.find(f=>f.id===m.imageFileId)?.dataUrl;
  const savePalette = (m: Material3D) => project && projectStore.setMaterials3D(project.id, [...palette.filter(x=>x.id!==m.id),m]);
  const change = (patch: Partial<Material3D>) => {
    if (!material) return;
    const next = {...material,...patch};
    if (selected) { if(!setObjectMaterial(app,selected.sheetId,selected.id,next,slot))setError("Ebene gesperrt – Material nicht geändert."); }
    else if(savePalette(next))setDraft(next);else setError("Material konnte nicht gespeichert werden.");
  };
  const upload = async (file: File | undefined) => {
    if (!file || !project) return;
    setError(null);
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Bitte PNG, JPEG oder WebP auswählen.");
      const dataUrl = await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error("Bild konnte nicht gelesen werden."));r.readAsDataURL(file);});
      const imageFileId = projectStore.addFile(project.id,"files",null,{name:file.name,dataUrl,mimeType:file.type,sizeBytes:file.size});
      if (!imageFileId) throw new Error("Bild konnte nicht gespeichert werden. Speicherplatz und Verbindung prüfen.");
      const m: Material3D = {...DEFAULT_MATERIAL,id:crypto.randomUUID(),name:file.name.replace(/\.[^.]+$/,""),imageFileId};
      if (!savePalette(m)) throw new Error("Material konnte nicht gespeichert werden."); setDraft(m);
      if (selected) setObjectMaterial(app,selected.sheetId,selected.id,m,slot);
    } catch(e) { setError(e instanceof Error?e.message:"Material konnte nicht angelegt werden."); }
  };
  return <section className="space-y-3 border-t border-border pt-3">
    <div className="flex items-center justify-between"><h3 className="text-xs font-semibold">Materialien</h3><Button variant="outline" size="icon" className="h-8 w-8" title="Materialbild hinzufügen" asChild><label><ImagePlus/><input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Materialbild hinzufügen" onChange={e=>{void upload(e.target.files?.[0]);e.target.value="";}}/></label></Button></div>
    {selected?.list === "doors" && <div className="grid grid-cols-2 gap-1">{([['frameMaterial3D','Rahmen'],['panelMaterial3D',selected.obj.kind === 'window'?'Glas':'Türblatt']] as const).map(([s,label])=><Button key={s} variant={slot===s?'secondary':'outline'} size="sm" onClick={()=>setSlot(s)}>{label}</Button>)}</div>}
    <div className="grid grid-cols-2 gap-2">{palette.map(m=><div key={m.id} draggable onDragStart={e=>e.dataTransfer.setData(MATERIAL_DRAG_TYPE,m.id)} className="rounded-md border border-border overflow-hidden"><Button variant="ghost" className="h-auto w-full flex-col p-2 whitespace-normal" onClick={()=>{setDraft(m);if(selected)setObjectMaterial(app,selected.sheetId,selected.id,m,slot);}}>{image(m)?<img src={image(m)} alt={m.name} className="aspect-[4/3] w-full rounded object-cover"/>:<span className="aspect-[4/3] w-full bg-muted"/>}<span className="w-full truncate text-xs">{m.name}</span></Button></div>)}</div>
    {material && <div className="space-y-2">
      <label className="block text-xs">Name<input className="cad-settings-input mt-1 h-8 w-full px-2" defaultValue={material.name} key={`${material.id}-${material.name}`} onBlur={e=>change({name:e.target.value.trim()||material.name})}/></label>
      <Numeric label="Skalierung (m)" value={material.scaleM} min={0.001} max={10000} sliderMax={10} onCommit={v=>change({scaleM:v})}/>
      <Numeric label="Transparenz (%)" value={Math.round((1-material.opacity)*100)} min={0} max={100} onCommit={v=>change({opacity:1-v/100})}/>
      <Numeric label="Leuchtkraft" value={material.emissiveIntensity} min={0} max={100} sliderMax={5} onCommit={v=>change({emissiveIntensity:v})}/>
      {selected && <div className="flex gap-1"><Button variant="outline" size="sm" className="flex-1" onClick={()=>savePalette(material)}>In Palette speichern</Button><Button variant="ghost" size="icon" className="h-9 w-9" title="Material entfernen" onClick={()=>setObjectMaterial(app,selected.sheetId,selected.id,undefined,slot)}><RotateCcw/></Button></div>}
    </div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </section>;
}

function Numeric({label,value,min,max,sliderMax=max,onCommit}:{label:string;value:number;min:number;max:number;sliderMax?:number;onCommit:(v:number)=>void}) {
  const [v,setV]=useState<number|null>(null);
  const pending=useRef<number|null>(null);
  const commit=(raw:number)=>{pending.current=null;if(Number.isFinite(raw)&&raw!==value)onCommit(Math.max(min,Math.min(max,raw)));setV(null);};
  return <label className="block text-xs"><span className="flex items-center justify-between gap-2">{label}<input aria-label={label} type="number" step="any" min={min} max={max} value={v??value} className="cad-settings-input h-8 w-20 px-2" onChange={e=>setV(e.target.valueAsNumber)} onBlur={()=>{if(v!==null)commit(v);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></span><input aria-label={`${label} Regler`} className="mt-1 w-full" type="range" min={min} max={sliderMax} step="any" value={v??Math.min(value,sliderMax)} onChange={e=>setV(e.target.valueAsNumber)} onPointerUp={e=>commit(e.currentTarget.valueAsNumber)} onKeyUp={e=>commit(e.currentTarget.valueAsNumber)}/></label>;
}