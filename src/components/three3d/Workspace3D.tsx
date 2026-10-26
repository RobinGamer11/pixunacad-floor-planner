/**
 * 3D-Bereich über der gemeinsamen CadApp: Blattzusammenstellung, Auswahl,
 * Körperbeziehungen und Navigation. Alle Änderungen laufen über CadApp.runAction.
 */
import type React from "react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { Derived3D, Plane3D } from "@/cad/three3d/geometryDerivation";
import { type Relation3D, type RelationIssue } from "@/cad/three3d/relations";
import { Object3DSettings, BigChoice } from "@/components/cad/Object3DSettings";
import { Crosshair, X as XIcon, PanelRightClose, PanelRightOpen } from "lucide-react";
const REL = {
  card: { background: "hsl(var(--overlay-ink) / 0.94)", color: "hsl(var(--overlay-surface))", borderColor: "hsl(var(--overlay-surface) / 0.14)" },
  field: { background: "hsl(var(--overlay-surface) / 0.07)", borderColor: "hsl(var(--overlay-surface) / 0.18)", color: "hsl(var(--overlay-surface))" },
  active: { background: "hsl(var(--overlay-ink) / 0.94)", borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--overlay-surface))", boxShadow: "0 0 0 1px hsl(var(--accent-gold))" },
  muted: { color: "hsl(var(--overlay-surface) / 0.62)" },
  err: { color: "hsl(0 80% 72%)" },
  errBorder: { borderColor: "hsl(0 70% 60% / 0.6)" },
  join: { color: "hsl(var(--accent-gold))" },
};
/** Verbindungswort zwischen den Schritten (mit / bis / und) – deutlich hervorgehoben. */
const Joiner: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-2 py-0.5">
    <span className="h-px flex-1" style={{ background: "hsl(var(--overlay-surface) / 0.14)" }} />
    <span className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-none tracking-wide"
      style={{ color: "hsl(var(--accent-gold))", borderColor: "hsl(var(--accent-gold) / 0.35)", background: "hsl(var(--accent-gold) / 0.08)" }}>{children}</span>
    <span className="h-px flex-1" style={{ background: "hsl(var(--overlay-surface) / 0.14)" }} />
  </div>
);
import { libraryDefinitionsOf, sheetSnapshotOf } from "@/cad/three3d/projectBridge";
import { renderPlaneTexture } from "@/cad/three3d/planeTextures";
import { getTiltDraftPreview, subscribeTiltDraftPreview } from "@/cad/three3d/tiltDraftPreview";
import { addRelation, deriveFromApp, dossierInfo, render2DView, findObject, objectLabel, removeRelation, selectInCad, clearCadSelection, setSheetElevation, setSheetIn3D } from "@/cad/three3d/projectBridge";
import { sheetParticipatesIn3D, sheetElevationM } from "@/cad/SheetManager";
import type { Viewer3DHandle } from "./Viewer3D";
import { projectStore, useProject } from "@/lib/projectStore";
import { DEFAULT_PRESETS, PRESET_OPTIONS, type RenderPresets } from "@/cad/three3d/dossier";
import { Camera, FileDown, FileJson, ChevronDown, Grid3x3, Layers, Maximize2, Pencil, Trash2, FileText, Settings } from "lucide-react";
import { Joystick3D } from "./Joystick3D";
import { loadSens, saveSens, speedFactor, stickFactor, type Sens3D } from "./sensitivity";
import { MaterialPanel } from "./MaterialPanel";
import InfoBoxSettingsPanel from "@/components/cad/InfoBoxSettingsPanel";
import { infoBoxUi } from "@/lib/infoBoxUi";
import { setObjectMaterial, setOpeningState } from "@/cad/three3d/projectBridge";
import { Button } from "@/components/ui/button";
import type { Material3D } from "@/cad/three3d/materials";
import { ManualMovePanel } from "./ManualMovePanel";
import { beginManualMove, changedMove, commitManualMove, editableRef3D, previewManualMove, refKey3D, type ManualMoveSession } from "@/cad/three3d/manualMoveSession";
import { enter3DEditor, state3D, type ObjectRef3D } from "@/cad/three3d/manualMoveState";
import type { MoveDelta } from "@/cad/three3d/spatialTransform";
import { normalizedPose } from "@/cad/three3d/spatialTransform";
import { Euler, Matrix4 } from "three";
import { setTiltDraftPreview } from "@/cad/three3d/tiltDraftPreview";
import { CopyCheck } from "lucide-react";
import { DEFAULT_SNAP_3D, normalizeSnapSettings, type SnapSettings3D } from "@/cad/three3d/manipulationSnap";

const Viewer3D = lazy(() => import("./Viewer3D"));

const ID_FIELDS = ["wallId", "doorId", "hatchId", "stairId", "documentId", "textBoxId", "libraryInstanceId", "segmentId", "dimensionId", "freeStrokeId"];

export function Workspace3D({ app, projectId, onEditInCad, helpOn = false, tabletAidOn = false }: { app: CadApp; projectId?: string; onEditInCad: () => void; helpOn?: boolean; tabletAidOn?: boolean }) {
  const [open, setOpen] = useState<null | "sheets" | "dossier">(null);
  // Raster: lokaler Bedienzustand pro Gerät (nie Projekt/Cloud).
  const [grid, setGrid] = useState<{ on: boolean; opacity: number }>(() => {
    try { const g = JSON.parse(localStorage.getItem("pixuna.3d.grid") || "null"); if (g && typeof g.on === "boolean") return g; } catch {}
    return { on: true, opacity: 0.1 };
  });
  const [gridPanel, setGridPanel] = useState(false);
  const [sensPanel, setSensPanel] = useState(false);
  // Empfindlichkeit: lokaler Bedienzustand pro Gerät (Prozent).
  const [sens, setSens] = useState<Sens3D>(loadSens);
  useEffect(() => {
    saveSens(sens);
    const apply = () => viewer.current?.setSensitivity(speedFactor(sens.move), speedFactor(sens.look), speedFactor(sens.vert));
    apply(); const t = window.setInterval(() => { if (viewer.current) { apply(); window.clearInterval(t); } }, 250);
    return () => window.clearInterval(t);
  }, [sens]);
  const stickSize = Math.round(112 * stickFactor(sens.stick));
  const project = useProject(projectId);
  const presets: RenderPresets = { ...DEFAULT_PRESETS, ...(project?.settings?.renderPresets ?? {}) };
  const setPresets = (patch: Partial<RenderPresets>) => { if (projectId) projectStore.setRenderPresets(projectId, { ...presets, ...patch }); };
  const [busy, setBusy] = useState(false);
  const [dossierMsg, setDossierMsg] = useState<string | null>(null);
  const restoredCam = useRef(false);
  const viewer = useRef<Viewer3DHandle>(null);
  const [items, setItems] = useState<Derived3D[]>([]);
  const [issues, setIssues] = useState<RelationIssue[]>([]);
  const [tick, setTick] = useState(0);
  const [selKey, setSelKey] = useState<string | null>(null);
  const [refs3D,setRefs3D]=useState<ObjectRef3D[]>([]);
  const selectedKeys3D=useMemo(()=>refs3D.map(refKey3D),[refs3D]);
  const [panelOpen,setPanelOpen]=useState(true);
  const [multiSelect,setMultiSelect]=useState(false);
  // „Manuell bewegen“ ist eine lokale Geräte-Einstellung und gilt für jede Auswahl.
  const [manualOn,setManualOnRaw]=useState<boolean>(()=>{try{return localStorage.getItem("pixuna.3d.manualOn")==="1";}catch{return false;}});
  const setManualOn=(v:boolean)=>{setManualOnRaw(v);try{localStorage.setItem("pixuna.3d.manualOn",v?"1":"0");}catch{}};
  const manualOnRef=useRef(manualOn);manualOnRef.current=manualOn;
  const [manualSession,setManualSession]=useState<ManualMoveSession|null>(null);
  const sessionRef=useRef<ManualMoveSession|null>(null);
  const [moveError,setMoveError]=useState<string|null>(null);
  const numericValid=useRef(true);
  const onNumericValidity=useCallback((valid:boolean)=>{numericValid.current=valid;},[]);
  const [moveMode,setMoveMode]=useState<"translate"|"rotate">("translate");
  // Gizmo-Größe 1–100 % (lokal, für alle Gizmos gleich); 1 % sehr klein.
  const [gizmoPct,setGizmoPct]=useState<number>(()=>{try{const v=Number(localStorage.getItem("pixuna.3d.gizmoSize"));return Number.isFinite(v)&&v>=1&&v<=100?v:40;}catch{return 40;}});
  useEffect(()=>{try{localStorage.setItem("pixuna.3d.gizmoSize",String(gizmoPct));}catch{}},[gizmoPct]);
  // Fixed default snapping; only the contact helper grid switch is a local device preference.
  const [snapSettingsRaw,setSnapSettings]=useState<SnapSettings3D>(()=>{try{const raw=JSON.parse(localStorage.getItem("pixuna.3d.manipulation")??"null");return {...DEFAULT_SNAP_3D,grid:normalizeSnapSettings(raw).grid};}catch{return {...DEFAULT_SNAP_3D};}});
  const snapSettings=useMemo(()=>({...snapSettingsRaw,size:0.03+(gizmoPct-1)*(1.6-0.03)/99}),[snapSettingsRaw,gizmoPct]);
  useEffect(()=>{try{localStorage.setItem("pixuna.3d.manipulation",JSON.stringify({grid:snapSettingsRaw.grid}));}catch{}},[snapSettingsRaw]);
  const [previewItems,setPreviewItems]=useState<Derived3D[]|null>(null);
  const [pendingChange,setPendingChange]=useState<(()=>void)|null>(null);
  const replaceSession=(s:ManualMoveSession|null)=>{sessionRef.current=s;state3D(app).draftActive=!!s;setManualSession(s);if(!s){setPreviewItems(null);setMoveError(null);}};
  const restartSession=()=>{const refs=state3D(app).refs;if(!refs.length)return;try{replaceSession(beginManualMove(app,refs));}catch{/* Auswahl evtl. gesperrt */}};
  const cancelMove=()=>{replaceSession(null);setPendingChange(null);if(manualOn)restartSession();};
  const applyMove=()=>{const s=sessionRef.current;if(!s)return;if(!numericValid.current){setMoveError("Bitte alle ungültigen Zahlen korrigieren.");return;}try{commitManualMove(app,s);replaceSession(null);const current=deriveFromApp(app);setItems(current.items);setIssues(current.issues);setTick(t=>t+1);const next=pendingChange;setPendingChange(null);if(next)next();else if(manualOn)restartSession();}catch(e){setMoveError(e instanceof Error?e.message:"Bewegung fehlgeschlagen.");}};
  const guardChange=(next:()=>void)=>{if(sessionRef.current&&changedMove(sessionRef.current.delta)){setPendingChange(()=>next);return;}replaceSession(null);next();};
  const previewFrame=useRef(0);
  const updateDelta=(delta:MoveDelta)=>{const s=sessionRef.current;if(!s)return;const next={...s,delta};replaceSession(next);
    // Vorschau höchstens einmal pro Bild berechnen (sonst ruckelt das Ziehen).
    if(previewFrame.current)return;previewFrame.current=requestAnimationFrame(()=>{previewFrame.current=0;const cur=sessionRef.current;if(!cur)return;try{setPreviewItems(previewManualMove(app,cur));setMoveError(null);}catch(e){setMoveError(e instanceof Error?e.message:"Bewegung nicht möglich.");}});};
  useEffect(()=>enter3DEditor(app,()=>{if(!sessionRef.current)return false;replaceSession(null);setPendingChange(null);return true;},()=>setTick(t=>t+1)),[app]);
  useEffect(()=>{
    const beforeLeave=(e:BeforeUnloadEvent)=>{if(sessionRef.current&&changedMove(sessionRef.current.delta)){e.preventDefault();e.returnValue="";}};
    const navigation=(e:MouseEvent)=>{
      if(!sessionRef.current||!changedMove(sessionRef.current.delta))return;
      const target=e.target instanceof Element?e.target.closest("button,a"):null;
      if(!target||!target.closest(".workspace-header"))return;
      const label=target.getAttribute("title")??target.textContent??"";
      if(/Rückgängig|Wiederholen|Undo|Redo/i.test(label))return;
      e.preventDefault();e.stopImmediatePropagation();guardChange(()=>{(target as HTMLElement).click();});
    };
    window.addEventListener("beforeunload",beforeLeave);document.addEventListener("click",navigation,true);
    return()=>{window.removeEventListener("beforeunload",beforeLeave);document.removeEventListener("click",navigation,true);};
  });
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      const typing=e.target instanceof HTMLElement&&(e.target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if(typing)return;
      if((e.ctrlKey||e.metaKey)&&["z","y"].includes(e.key.toLowerCase())){e.preventDefault();e.stopImmediatePropagation();if(e.key.toLowerCase()==="y"||e.shiftKey)app.redo();else app.undo();}
      else if(sessionRef.current&&(e.key==="Escape"||e.key==="Enter")){e.preventDefault();e.stopImmediatePropagation();if(e.key==="Escape")cancelMove();else applyMove();}
    };
    window.addEventListener("keydown",key,true);return()=>window.removeEventListener("keydown",key,true);
  });
  const [picking, setPicking] = useState<null | Relation3D["type"]>(null);
  const [face, setFace] = useState<"top" | "bottom">("bottom");
  const [cutTrim, setCutTrim] = useState(false);
  const [keep, setKeep] = useState<"below" | "above">("below");
  const [msg, setMsg] = useState<string | null>(null);
  const lastSig = useRef("");
  const texCache = useRef(new Map<string, Promise<any>>());
  const snapCache = useRef(new Map<string, any>());

  /** Inhalt eines Objekts kurz zusammengefasst (lange Bilddaten nur angedeutet). */
  const contentKey = (o: any) => JSON.stringify(o, (_k, v) => (typeof v === "string" && v.length > 400 ? `${v.length}:${v.slice(-48)}` : v));
  const texturedKey = (d: Derived3D) => {
    if (!d.texture) return "";
    const o = (app as any).scenesById?.get(d.sheetId)?.[d.texture.list]?.find((x: any) => x?.id === d.sourceId)
      ?? (d.sheetId === app.activeSheetId ? (app as any).scene?.[d.texture.list]?.find((x: any) => x?.id === d.sourceId) : null);
    return o ? contentKey(o) : "";
  };
  const textureFor = useCallback((d: Derived3D) => {
    if (!d.texture) return Promise.resolve(null);
    const corners = d.texture.corners ?? (d.type === "plane" ? d.outline : []);
    const key = `${d.sheetId}::${d.sourceId}::${JSON.stringify(corners)}::${texturedKey(d)}`;
    let p = texCache.current.get(key);
    if (!p) {
      let snap = snapCache.current.get(d.sheetId);
      if (snap === undefined) { snap = sheetSnapshotOf(app, d.sheetId); snapCache.current.set(d.sheetId, snap); }
      p = renderPlaneTexture(d.texture.snapshot ?? snap, d.texture.list, d.texture.objectId ?? d.sourceId, corners, libraryDefinitionsOf(app));
      if (texCache.current.size > 300) texCache.current.clear();
      texCache.current.set(key, p);
    }
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);

  // Gemeinsamen Projektzustand beobachten (kein eigener Zustand, nur Lesen).
  useEffect(() => {
    let cheap = "";
    const read = () => {
      // Nur neu ableiten, wenn sich Inhalt, Blätter oder Auswahl geändert haben (sonst ruckelt die Ansicht).
      const selNow: any = app.selection;
      const ck = JSON.stringify([app.contentRevision, app.activeSheetId, app.sheetManager.toJSON(), infoBoxUi.get().selectedId, selNow ? ID_FIELDS.map(f => selNow[f]) : null, state3D(app).refs, manualOnRef.current, !!sessionRef.current]);
      if (ck === cheap) return;
      cheap = ck;
      const r = deriveFromApp(app);
      const sel: any = app.selection;
      const id = infoBoxUi.get().selectedId ?? (sel ? ID_FIELDS.map(f => sel[f]).find(Boolean) : null);
      const state=state3D(app);
      state.refs=state.refs.filter(x=>r.items.some(d=>d.sheetId===x.sheetId&&d.sourceId===x.id)&&editableRef3D(app,x));
      if(!state.refs.length&&id&&editableRef3D(app,{sheetId:app.activeSheetId,id}))state.refs=[{sheetId:app.activeSheetId,id}];
      if(sessionRef.current&&app.contentRevision!==sessionRef.current.revision){replaceSession(null);}
      if(!sessionRef.current&&manualOnRef.current&&state.refs.length){try{replaceSession(beginManualMove(app,state.refs));}catch{}}
      const sk=state.refs[0]?refKey3D(state.refs[0]):null;
      const sig = JSON.stringify([r.items, app.sheetManager.toJSON(), app.activeSheetId, sk, state.refs, r.issues, r.items.map(texturedKey)]);
      if (sig === lastSig.current) return;
      lastSig.current = sig;
      snapCache.current.clear();
      setItems(r.items); setIssues(r.issues); setSelKey(sk);setRefs3D([...state.refs]); setTick(t => t + 1);
    };
    read();
    const iv = window.setInterval(read, 500);
    return () => window.clearInterval(iv);
  }, [app]);

  useEffect(() => {
    if (restoredCam.current || !items.length || !presets.camera) return;
    const t = window.setTimeout(() => { viewer.current?.setCamera(presets.camera!); restoredCam.current = true; }, 300);
    return () => window.clearTimeout(t);
  }, [items.length]);

  useEffect(() => {
    try { localStorage.setItem("pixuna.3d.grid", JSON.stringify(grid)); } catch {}
    const apply = () => viewer.current?.setGrid(grid.on, grid.opacity);
    apply(); const t = window.setTimeout(apply, 400); return () => window.clearTimeout(t);
  }, [grid, items.length]);

  const makeDossier = async (format: "pdf" | "json") => {
    if(sessionRef.current){guardChange(()=>void makeDossier(format));return;}
    setBusy(true); setDossierMsg(null);
    try {
      const d = await import("@/cad/three3d/dossier");
      const data = d.buildDossierData(project?.name || "Projekt", items, k => dossierInfo(app, k), presets);
      if (!data.objects.length) { setDossierMsg("Keine Objekte in der 3D-Zusammenstellung."); return; }
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const base = `Render-Dossier_${(project?.name || "Projekt").replace(/[^\w-]+/g, "_")}_${stamp}`;
      if (format === "json") { d.downloadBytes(JSON.stringify(data, null, 2), `${base}.json`, "application/json"); return; }
      let img;
      if (presets.view === "3d") img = viewer.current?.capture(data.objects.map(o => ({ id: o.dossierId, ...o.center })));
      else img = await render2DView(app, data.objects);
      if (!img) { setDossierMsg("Ansicht konnte nicht erfasst werden."); return; }
      const byId = new Map(data.objects.map(o => [o.dossierId, o]));
      const bytes = await d.buildDossierPdf(data, { target: img, assignment: img }, (did) => {
        const o = byId.get(did); return o ? (dossierInfo(app, `${o.sheetId}::${o.objectId}`)?.attachments ?? []) : [];
      });
      d.downloadBytes(bytes, `${base}.pdf`, "application/pdf");
      setDossierMsg(`Dossier mit ${data.objects.length} Objekten erstellt.`);
    } catch (e) {
      console.error(e); setDossierMsg("Dossier konnte nicht erstellt werden.");
    } finally { setBusy(false); }
  };

  const sheets = useMemo(() => app.sheetManager.list().map(s => ({ ...s })), [app, tick]);
  const sel = selKey ? { sheetId: selKey.split("::")[0], id: selKey.split("::")[1] } : null;
  const selObj = sel ? findObject(app, sel.sheetId, sel.id)?.obj : null;
  const rels: Relation3D[] = selObj?.relations3D || [];
  const selectedHit = sel ? findObject(app, sel.sheetId,sel.id) : null;
  const materialImage = useCallback((m: Material3D) => project?.files?.find(f=>f.id===m.imageFileId)?.dataUrl,[project?.files]);
  const exportGLB = async () => {
    if(sessionRef.current){guardChange(()=>void exportGLB());return;}
    setBusy(true);setDossierMsg(null);
    try { const bytes=await viewer.current?.exportGLB();if(!bytes)throw new Error();const d=await import("@/cad/three3d/dossier");d.downloadBytes(new Uint8Array(bytes),`${project?.name||'Projekt'}.glb`,'model/gltf-binary'); }
    catch {setDossierMsg('GLB konnte nicht erstellt werden.');}finally{setBusy(false);}
  };

  useEffect(() => {
    if (!picking) return;
    const kd = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); setPicking(null); } };
    window.addEventListener("keydown", kd, true);
    return () => window.removeEventListener("keydown", kd, true);
  }, [picking]);
  const ghost = useSyncExternalStore(subscribeTiltDraftPreview, getTiltDraftPreview);
  const onPick = (sheetId: string, id: string, additive=false) => {
    if (picking && sel) {
      const err = addRelation(app, sel, { type: picking, targetSheetId: sheetId, targetId: id, ...(picking === "limitToSurface" ? { face, keep } : (cutTrim ? { trim: true } : {})) });
      setMsg(err || null); // Erfolg zeigt sich an der Beziehung selbst (inkl. Geometriefehlern)
      setPicking(null);
      return;
    }
    if(!editableRef3D(app,{sheetId,id}))return;
    guardChange(()=>{
      const s=state3D(app),ref={sheetId,id},key=refKey3D(ref);
      s.refs=additive||multiSelect ? s.refs.some(r=>refKey3D(r)===key)?s.refs.filter(r=>refKey3D(r)!==key):[...s.refs,ref] : [ref];
      const first=s.refs[0];if(first)selectInCad(app,first.sheetId,first.id);else clearCadSelection(app);
      setRefs3D([...s.refs]);setSelKey(first?refKey3D(first):null);
      if(manualOn&&s.refs.length){try{setTiltDraftPreview(null);replaceSession(beginManualMove(app,s.refs));}catch(e){setMoveError(e instanceof Error?e.message:"Auswahl nicht möglich.");}}
    });
  };
  const toggleManual=()=>guardChange(()=>{
    const next=!manualOn;setManualOn(next);setPicking(null);setTiltDraftPreview(null);
    if(next&&refs3D.length)try{replaceSession(beginManualMove(app,refs3D,items));}catch(e){setMoveError(e instanceof Error?e.message:"Auswahl nicht möglich.");}
  });
  const poseRot=useMemo(()=>{const p=selObj&&normalizedPose(selObj.pose3D);if(!p)return null;const e=new Euler().setFromRotationMatrix(new Matrix4().fromArray(p));const d=(r:number)=>(Math.round(r*1800/Math.PI)/10).toLocaleString("de-DE");return {x:d(e.x),y:d(e.y),z:d(e.z)};},[selObj,selObj?.pose3D,tick]);
  const movePanel=<ManualMovePanel enabled={manualOn} count={refs3D.length} session={manualSession} mode={moveMode} error={moveError} onValidity={onNumericValidity} onToggle={toggleManual} onMode={setMoveMode} onDelta={updateDelta} onApply={applyMove} onCancel={cancelMove} snapSettings={snapSettings} onSnapSettings={setSnapSettings}
    rotation={poseRot} onResetRotation={selObj?()=>guardChange(()=>app.runAction?.(()=>{delete selObj.pose3D;})):undefined}/>;

  const levels=useMemo(()=>[...app.sheetManager.list().filter(s=>sheetParticipatesIn3D(s,app.activeSheetId)).map(s=>({z:sheetElevationM(s),label:s.name})),{z:0,label:"3D-Oberfläche"}],[app,tick]);
  const movePreview=useMemo(()=>{
    if(!manualSession||!previewItems)return null;
    const keys=new Set(manualSession.refs.map(refKey3D)),orig=new Map<Derived3D,string>();
    return previewItems.filter((d,i)=>keys.has(`${d.sheetId}::${d.sourceId}`)||((d.source==="door"||d.source==="window")&&(orig.get(d)??JSON.stringify(d))!==JSON.stringify(items[i])));
  },[manualSession,previewItems,items]);
  const btn = "h-8 px-2.5 rounded-md text-xs font-medium border hover:bg-muted disabled:opacity-40";
  return (
    <div className="absolute inset-0 z-[40] flex bg-background">
      <div className="relative flex-1 min-w-0">
        <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">3D-Ansicht wird geladen …</div>}>
          <Viewer3D ref={viewer} items={items} movePreview={movePreview} levels={levels} selectedKey={selKey} selectedKeys={selectedKeys3D} manual={manualSession} transformMode={moveMode} snapSettings={snapSettings} onTransform={updateDelta} onPick={onPick} onEmpty={() => { if (!picking) guardChange(()=>{state3D(app).refs=[];setRefs3D([]);setSelKey(null);clearCadSelection(app);}); }} ghost={manualOn?null:ghost} textureFor={textureFor} materialImage={materialImage}
            onMaterialDrop={(sheetId,id,materialId)=>guardChange(()=>{const m=project?.settings?.materials3D?.find(x=>x.id===materialId);if(m)setObjectMaterial(app,sheetId,id,m);})}
            onToggleOpening={(sheetId,id)=>guardChange(()=>{const hit=findObject(app,sheetId,id);if(hit)setOpeningState(app,sheetId,id,!hit.obj.open3D);})} />
        </Suspense>
        <div className="absolute left-3 top-14 z-10"><Button size="sm" variant={multiSelect?"default":"outline"} aria-pressed={multiSelect} onClick={()=>setMultiSelect(v=>!v)}><CopyCheck size={14}/>Mehrfachauswahl</Button></div>
        {manualSession && changedMove(manualSession.delta) && !pendingChange && <div className="absolute left-1/2 bottom-32 z-20 flex -translate-x-1/2 gap-2 whitespace-nowrap"><Button size="sm" disabled={!!moveError} onClick={applyMove}>Übernehmen</Button><Button size="sm" variant="outline" onClick={cancelMove}>Verwerfen</Button></div>}
        {pendingChange&&<div role="dialog" aria-label="Unbestätigte Bewegung" className="absolute left-1/2 top-1/2 z-30 w-64 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-4 shadow-lg space-y-3 text-sm"><p>Bewegung übernehmen oder verwerfen?</p><div className="flex gap-2"><Button size="sm" disabled={!!moveError} onClick={applyMove}>Übernehmen</Button><Button size="sm" variant="outline" onClick={()=>{const next=pendingChange;cancelMove();next();}}>Verwerfen</Button></div></div>}
        {picking && (
          <div className="absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-lg border px-3 py-2 text-xs font-medium shadow-lg" style={REL.active}>
            {picking === "cutout" ? "Durchbricht" : "An Oberfläche begrenzen"}: Zielkörper anklicken … <button className="ml-2 underline" onClick={() => setPicking(null)}>Abbrechen (Esc)</button>
          </div>
        )}
        {/* Oben links: Render-Dossier */}
        <div className="absolute left-3 top-3 z-10 w-[280px]">
          <button className={`${btn} bg-card flex items-center gap-1.5`} onClick={() => setOpen(open === "dossier" ? null : "dossier")}>
            <FileText size={14} /> Render-Dossier <ChevronDown size={13} className={open === "dossier" ? "rotate-180" : ""} />
          </button>
          {open === "dossier" && <div className="mt-1.5 rounded-lg border bg-card p-3 shadow-lg space-y-2 max-h-[70vh] overflow-y-auto" style={{ borderColor: "hsl(var(--hairline))" }}>        <section className="pt-2 border-t space-y-2" style={{ borderColor: "hsl(var(--hairline))" }}>
          
          <div className="flex gap-1">
            {(["3d", "2d"] as const).map(v => (
              <button key={v} className={`${btn} flex-1`} style={presets.view === v ? { background: "hsl(var(--accent-gold))", color: "hsl(var(--surface))" } : undefined}
                onClick={() => setPresets({ view: v })}>{v === "3d" ? "3D-Kamera" : "2D-Draufsicht"}</button>
            ))}
          </div>
          {presets.view === "3d" && (
            <button className={`${btn} w-full flex items-center justify-center gap-1.5`} onClick={() => { const c = viewer.current?.getCamera(); if (c) { setPresets({ camera: c }); setDossierMsg("Blickrichtung gespeichert."); } }}>
              <Camera size={13} /> Aktuelle Blickrichtung übernehmen{presets.camera ? " ✓" : ""}
            </button>
          )}
          {([["timeOfDay", "Tageszeit"], ["weather", "Wetter"], ["season", "Jahreszeit"], ["style", "Darstellungsstil"], ["mood", "Bildwirkung"]] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0">{label}</span>
              <select className="flex-1 h-8 rounded border bg-background px-1" value={presets[k]} onChange={e => setPresets({ [k]: e.target.value } as any)}>
                {PRESET_OPTIONS[k].map(o => <option key={o}>{o}</option>)}
              </select>
            </label>
          ))}
          <textarea className="w-full min-h-[60px] rounded border bg-background p-1.5 text-xs" placeholder="Freitext (z. B. Bepflanzung, Personen, Lichtstimmung)"
            defaultValue={presets.freeText} key={presets.freeText}
            onBlur={e => { if (e.target.value !== presets.freeText) setPresets({ freeText: e.target.value }); }} />
          <div className="flex gap-1.5">
            <button className={`${btn} flex-1 flex items-center justify-center gap-1.5`} disabled={busy} onClick={() => makeDossier("pdf")}><FileDown size={13} /> PDF-Dossier</button>
            <button className={`${btn} flex-1 flex items-center justify-center gap-1.5`} disabled={busy} onClick={() => makeDossier("json")}><FileJson size={13} /> JSON</button>
          </div>
          {dossierMsg && <div className="text-xs text-muted-foreground">{dossierMsg}</div>}
          <Button variant="outline" size="sm" className="w-full" disabled={busy} onClick={()=>void exportGLB()}><FileDown size={13}/> 3D-Modell (.glb)</Button>
        </section>
</div>}
        </div>
        {/* Oben rechts: Blätter in 3D */}
        <div className="absolute right-3 top-3 z-10 w-[280px] flex flex-col items-end">
          <button className={`${btn} bg-card flex items-center gap-1.5`} onClick={() => setOpen(open === "sheets" ? null : "sheets")}>
            <Layers size={14} /> Blätter in 3D <ChevronDown size={13} className={open === "sheets" ? "rotate-180" : ""} />
          </button>
          {open === "sheets" && <div className="mt-1.5 w-full rounded-lg border bg-card p-3 shadow-lg max-h-[70vh] overflow-y-auto text-sm" style={{ borderColor: "hsl(var(--hairline))" }}>        <section>
          
          <p className="text-xs text-muted-foreground mb-2">Das aktive Blatt wird immer gezeigt. Weitere Blätter bewusst hinzunehmen – die Auswahl wird im Projekt gespeichert.</p>
          <div className="space-y-1.5">
            {sheets.map(s => {
              const active = s.id === app.activeSheetId;
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={sheetParticipatesIn3D(s, app.activeSheetId)} disabled={active}
                    onChange={e => setSheetIn3D(app, s.id, e.target.checked)} />
                  <span className="flex-1 truncate">{s.name}{active ? " (aktiv)" : ""}</span>
                  <input type="number" step={0.05} defaultValue={sheetElevationM(s)} key={`${s.id}-${sheetElevationM(s)}`}
                    className="w-16 h-7 rounded border px-1 text-xs bg-background" title="Blatthöhe (m)"
                    onBlur={e => { const v = parseFloat(e.target.value.replace(",", ".")); if (Number.isFinite(v) && v !== sheetElevationM(s)) setSheetElevation(app, s.id, v); }} />
                  <span className="text-xs text-muted-foreground">m</span>
                </div>
              );
            })}
          </div>
        </section>
</div>}
        </div>
        {/* Unten rechts: Raster, Gesamtansicht, Joysticks */}
        <div className="absolute right-3 bottom-3 z-10 flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            {gridPanel && (
              <div className="h-8 rounded-md border bg-card px-1 flex items-center gap-2 text-xs" style={{ borderColor: "hsl(var(--hairline))" }}>
                <button className="h-6 px-2.5 rounded text-[11px] font-semibold border" aria-pressed={grid.on}
                  style={grid.on ? { background: "hsl(var(--accent-gold))", color: "hsl(var(--surface))", borderColor: "hsl(var(--accent-gold))" } : { borderColor: "hsl(var(--hairline))" }}
                  onClick={() => setGrid(g => ({ ...g, on: !g.on }))}>{grid.on ? "Ein" : "Aus"}</button>
                <input type="range" min={0.1} max={1} step={0.05} value={grid.opacity} disabled={!grid.on} aria-label="Rasterstärke"
                  onChange={e => setGrid(g => ({ ...g, opacity: parseFloat(e.target.value) }))} className="w-28 mr-1" />
              </div>
            )}
            <button className={`${btn} bg-card w-8 px-0 grid place-items-center`} title="Raster ein/aus und Stärke"
              style={grid.on ? { color: "hsl(var(--accent-gold))" } : { opacity: 0.6 }} onClick={() => { setGridPanel(v => !v); setSensPanel(false); }}>
              <Grid3x3 size={15} />
            </button>
            <div className="relative">
              {sensPanel && (
                <div className="absolute bottom-10 right-0 w-56 rounded-lg border bg-card p-2.5 shadow-lg space-y-2 text-xs" style={{ borderColor: "hsl(var(--hairline))" }}>
                  <div className="text-[10px] font-semibold tracking-wider text-muted-foreground">EMPFINDLICHKEIT</div>
                  {([["move", "Laufen"], ["look", "Blick"], ["vert", "Hoch / Runter"]] as const).map(([k, l]) => (
                    <label key={k} className="block">
                      <span className="flex justify-between text-[11px]"><span>{l}</span><span className="tabular-nums">{sens[k]} %</span></span>
                      <input type="range" min={1} max={100} step={1} value={sens[k]} aria-label={`Empfindlichkeit ${l}`}
                        onChange={e => setSens(v => ({ ...v, [k]: parseInt(e.target.value, 10) }))} className="w-full" />
                    </label>
                  ))}
                  <div className="text-[9px] text-muted-foreground">Gilt für Joysticks, Tastatur und Maus.</div>
                  <label className="block pt-1 border-t" style={{ borderColor: "hsl(var(--hairline))" }}>
                    <span className="flex justify-between text-[11px]"><span>Gizmo-Größe</span><span className="tabular-nums">{gizmoPct} %</span></span>
                    <input type="range" min={1} max={100} step={1} value={gizmoPct} aria-label="Gizmo-Größe"
                      onChange={e => setGizmoPct(parseInt(e.target.value, 10))} className="w-full" />
                  </label>
                  <label className="block pt-1 border-t" style={{ borderColor: "hsl(var(--hairline))" }}>
                    <span className="flex justify-between text-[11px]"><span>Joystick-Größe</span><span className="tabular-nums">{sens.stick} %</span></span>
                    <input type="range" min={1} max={100} step={1} value={sens.stick} aria-label="Joystick-Größe"
                      onChange={e => setSens(v => ({ ...v, stick: parseInt(e.target.value, 10) }))} className="w-full" />
                  </label>
                </div>
              )}
              <button className={`${btn} bg-card w-8 px-0 grid place-items-center`} title="Empfindlichkeit"
                onClick={() => { setSensPanel(v => !v); setGridPanel(false); }}>
                <Settings size={15} />
              </button>
            </div>
            <button className={`${btn} bg-card w-8 px-0 grid place-items-center`} title="Gesamte Szene zeigen" aria-label="Gesamte Szene zeigen" onClick={() => viewer.current?.fitAll()}>
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
        {tabletAidOn && (
          <>
            <Joystick3D label="Laufen" size={stickSize} storageKey="pixuna.3d.stick.move"
              defaultPos={() => ({ x: window.innerWidth - 300 - 260, y: window.innerHeight - 190 })}
              onChange={(x, y) => viewer.current?.setStick("move", x, y)} />
            <Joystick3D label="Blick" size={stickSize} onVertical={(d, on) => viewer.current?.move(d, on)} storageKey="pixuna.3d.stick.look"
              defaultPos={() => ({ x: window.innerWidth - 300 - 135, y: window.innerHeight - 190 })}
              onChange={(x, y) => viewer.current?.setStick("look", x, y)} />
          </>
        )}
        {/* Bedienungshilfe unten mittig */}
        {helpOn && (
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-3 z-10 rounded-xl border shadow-xl backdrop-blur-md px-2 py-1.5"
            style={{ borderColor: "hsl(var(--overlay-surface) / 0.24)", background: "hsl(var(--overlay-ink) / 0.78)", color: "hsl(var(--overlay-surface))" }}>
            <div className="mb-0.5 text-[8px] font-semibold uppercase tracking-[0.16em] opacity-70">Navigation</div>
            <div className="flex items-end justify-center">
              <HelpItem icon={
                <div className="grid grid-cols-3 gap-0.5">
                  <span /><Key k="W" a="▲" /><span />
                  <Key k="A" a="◀" /><Key k="S" a="▼" /><Key k="D" a="▶" />
                </div>} shortcut="W A S D" description="Bewegen" />
              <HelpItem icon={<div className="flex items-center gap-1"><Key k="Space" a="▲" /><Key k="X" a="▼" /></div>} shortcut="Space / X" description="Steigen / Sinken" />
              <div className="mx-1.5 self-stretch w-px" style={{ background: "hsl(var(--overlay-surface) / 0.24)" }} />
              <div className="flex flex-col items-center">
                <div className="flex items-end">
                  <HelpItem icon={<MouseGlyph3D />} shortcut="Maustaste gedrückt" />
                  <HelpItem icon={<div className="flex items-center gap-1"><Key k="Shift" /><span className="text-[10px]">+</span><MouseGlyph3D wheel /></div>} shortcut="Shift + Rad gedrückt" />
                </div>
                <div className="whitespace-nowrap text-[8px] leading-3 opacity-75 pb-1">Blickarten</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {!panelOpen && <div className="shrink-0 border-l p-1" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
        <button onClick={() => setPanelOpen(true)} title="Panel einblenden" className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted"><PanelRightOpen size={14} style={{ color: "hsl(var(--ink-soft))" }} /></button>
      </div>}
      <aside className={`${panelOpen ? "" : "hidden "}w-[300px] shrink-0 border-l overflow-y-auto p-3 space-y-4 text-sm`} style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
        {!sel ? movePanel : selectedHit?.list === "infoBoxes" ? <><InfoBoxSettingsPanel app={app} in3D />{movePanel}</> : (
          <Object3DSettings app={app} defaultOpen onEditInCad={()=>guardChange(onEditInCad)} onCollapse={()=>setPanelOpen(false)} manualMove={movePanel} relations={
            <section className="space-y-2 rounded-xl border p-2.5 text-xs" style={REL.card}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={REL.muted}>Körperbeziehungen</div>
              <div className="space-y-1 rounded-lg border p-2" style={picking === "cutout" ? REL.active : REL.field}>
                <BigChoice active={picking === "cutout"} icon={<Crosshair size={15} />} label="Durchbricht (Ziel wählen)" onClick={() => setPicking(picking === "cutout" ? null : "cutout")} />
                <Joiner>und</Joiner>
                <div className="flex gap-1.5">
                  <BigChoice active={!cutTrim} label="Körper vollständig" onClick={() => setCutTrim(false)} />
                  <BigChoice active={cutTrim} label="Körper abgeschnitten" onClick={() => setCutTrim(true)} />
                </div>
              </div>
              <div className="space-y-1 rounded-lg border p-2" style={picking === "limitToSurface" ? REL.active : REL.field}>
                <BigChoice active={picking === "limitToSurface"} icon={<Crosshair size={15} />} label="An Oberfläche begrenzen (Ziel wählen)" onClick={() => setPicking(picking === "limitToSurface" ? null : "limitToSurface")} />
                <Joiner>bis</Joiner>
                <div className="flex gap-1.5">
                  <BigChoice active={face === "top"} label="Oberkante Körper" onClick={() => setFace("top")} />
                  <BigChoice active={face === "bottom"} label="Unterkante Körper" onClick={() => setFace("bottom")} />
                </div>
                <Joiner>und</Joiner>
                <div className="flex gap-1.5">
                  <BigChoice active={keep === "below"} label="Darunter behalten" onClick={() => setKeep("below")} />
                  <BigChoice active={keep === "above"} label="Darüber behalten" onClick={() => setKeep("above")} />
                </div>
              </div>
              {picking && <BigChoice icon={<XIcon size={15} />} label="Zielwahl abbrechen (Esc)" onClick={() => setPicking(null)} />}
              {msg && <div className="text-[11px]" style={REL.err}>{msg}</div>}
              {rels.map((r, i) => {
                const tk = `${r.targetSheetId}::${r.targetId}`;
                const errs = issues.filter(x => x.sourceKey === selKey && x.targetKey === tk);
                return (
                  <div key={i} className="rounded-lg border p-2" style={errs.length ? { ...REL.field, ...REL.errBorder } : REL.field}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-[12px] leading-snug">
                        {r.type === "cutout"
                          ? <>Durchbricht <b style={REL.join}>und</b> {r.trim ? "Körper abgeschnitten" : "Körper vollständig"}</>
                          : <>Begrenzt <b style={REL.join}>bis</b> {r.face === "top" ? "Oberkante" : "Unterkante"} <b style={REL.join}>und</b> {r.keep === "above" ? "darüber" : "darunter"} behalten</>}
                        <span className="block truncate text-[11px]" style={REL.muted}>{objectLabel(app, r.targetSheetId, r.targetId)}</span>
                      </span>
                      <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border" style={REL.field} title="Beziehung entfernen" aria-label="Beziehung entfernen" onClick={() => removeRelation(app, sel, i)}><Trash2 size={14} /></button>
                    </div>
                    {errs.map((x, j) => <div key={j} className="mt-1 text-[11px]" style={REL.err}>{x.message}</div>)}
                  </div>
                );
              })}
            </section>
          } />
        )}
        <MaterialPanel key={selKey} app={app} project={project} selected={sel && selectedHit ? {...sel,...selectedHit}:null}/>
      </aside>
    </div>
  );
}

function HelpItem({ icon, shortcut, description }: { icon: React.ReactNode; shortcut: string; description?: string }) {
  return (
    <div className="flex min-w-[62px] flex-col items-center justify-end px-1.5 py-1 text-center">
      <div className="mb-1 flex min-h-8 items-center justify-center">{icon}</div>
      <div className="whitespace-nowrap text-[10px] font-semibold leading-3.5">{shortcut}</div>
      {description && <div className="whitespace-nowrap text-[8px] leading-3 opacity-75">{description}</div>}
    </div>
  );
}

function MouseGlyph3D({ wheel = false }: { wheel?: boolean }) {
  const c = "hsl(var(--overlay-surface) / 0.86)", a = "hsl(var(--overlay-surface))";
  return (
    <svg viewBox="0 0 32 42" className="h-8 w-7" fill="none" aria-hidden="true">
      {!wheel && <path d="M6 16V13C6 6.7 9.7 3 15 3v13H6Z" fill={a} opacity="0.92" />}
      <rect x="5" y="2.5" width="22" height="37" rx="11" stroke={c} strokeWidth="1.6" />
      <path d="M16 3v13" stroke={c} strokeWidth="1.2" /><path d="M5.8 16.5h20.4" stroke={c} strokeWidth="1.2" />
      <rect x="13.4" y="6" width="5.2" height="9" rx="2.6" fill={wheel ? a : "transparent"} stroke={c} strokeWidth="1.2" />
    </svg>
  );
}

function Key({ k, a }: { k: string; a?: string }) {
  return (
    <span className="min-w-[20px] h-5 px-1 rounded border grid place-items-center leading-none text-[9px] font-semibold"
      style={{ borderColor: "hsl(var(--overlay-surface) / 0.55)", background: "hsl(var(--overlay-surface) / 0.12)", color: "hsl(var(--overlay-surface))" }}>
      {a ? <span className="flex flex-col items-center"><span className="text-[6px] opacity-60">{a}</span>{k}</span> : k}
    </span>
  );
}
