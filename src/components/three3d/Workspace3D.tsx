/**
 * 3D-Bereich über der gemeinsamen CadApp: Blattzusammenstellung, Auswahl,
 * Körperbeziehungen und Navigation. Alle Änderungen laufen über CadApp.runAction.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { Derived3D } from "@/cad/three3d/geometryDerivation";
import type { Relation3D, RelationIssue } from "@/cad/three3d/relations";
import { addRelation, deriveFromApp, dossierInfo, render2DView, findObject, objectLabel, removeRelation, selectInCad, setSheetElevation, setSheetIn3D } from "@/cad/three3d/projectBridge";
import { sheetParticipatesIn3D, sheetElevationM } from "@/cad/SheetManager";
import type { Viewer3DHandle } from "./Viewer3D";
import { projectStore, useProject } from "@/lib/projectStore";
import { DEFAULT_PRESETS, PRESET_OPTIONS, type RenderPresets } from "@/cad/three3d/dossier";
import { Camera, FileDown, FileJson, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronsDown, ChevronsUp, Maximize2, Pencil, Trash2 } from "lucide-react";

const Viewer3D = lazy(() => import("./Viewer3D"));

const ID_FIELDS = ["wallId", "hatchId", "stairId", "documentId", "textBoxId", "libraryInstanceId", "segmentId", "dimensionId", "freeStrokeId"];

export function Workspace3D({ app, projectId, onEditInCad }: { app: CadApp; projectId?: string; onEditInCad: () => void }) {
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
  const [picking, setPicking] = useState<null | Relation3D["type"]>(null);
  const [face, setFace] = useState<"top" | "bottom">("bottom");
  const [keep, setKeep] = useState<"below" | "above">("below");
  const [msg, setMsg] = useState<string | null>(null);
  const lastSig = useRef("");

  // Gemeinsamen Projektzustand beobachten (kein eigener Zustand, nur Lesen).
  useEffect(() => {
    const read = () => {
      const r = deriveFromApp(app);
      const sel: any = app.selection;
      const id = sel ? ID_FIELDS.map(f => sel[f]).find(Boolean) : null;
      const sk = id ? `${app.activeSheetId}::${id}` : null;
      const sig = JSON.stringify([r.items, app.sheetManager.toJSON(), app.activeSheetId, sk, r.issues]);
      if (sig === lastSig.current) return;
      lastSig.current = sig;
      setItems(r.items); setIssues(r.issues); setSelKey(sk); setTick(t => t + 1);
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

  const makeDossier = async (format: "pdf" | "json") => {
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

  const onPick = (sheetId: string, id: string) => {
    if (picking && sel) {
      const err = addRelation(app, sel, { type: picking, targetSheetId: sheetId, targetId: id, ...(picking === "limitToSurface" ? { face, keep } : {}) });
      setMsg(err || "Beziehung angelegt.");
      setPicking(null);
      return;
    }
    selectInCad(app, sheetId, id);
  };

  const btn = "h-8 px-2.5 rounded-md text-xs font-medium border hover:bg-muted disabled:opacity-40";
  const padBtn = "h-11 w-11 rounded-lg flex items-center justify-center border bg-card active:bg-muted select-none";
  const hold = (d: Parameters<Viewer3DHandle["move"]>[0]) => ({
    onPointerDown: (e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); viewer.current?.move(d, true); },
    onPointerUp: () => viewer.current?.move(d, false),
    onPointerCancel: () => viewer.current?.move(d, false),
    onPointerLeave: () => viewer.current?.move(d, false),
  });

  return (
    <div className="absolute inset-0 z-[40] flex bg-background">
      <div className="relative flex-1 min-w-0">
        <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">3D-Ansicht wird geladen …</div>}>
          <Viewer3D ref={viewer} items={items} selectedKey={selKey} onPick={onPick} />
        </Suspense>
        {picking && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-md border bg-card px-3 py-1.5 text-xs shadow">
            Zielkörper anklicken … <button className="underline ml-2" onClick={() => setPicking(null)}>Abbrechen</button>
          </div>
        )}
        <div className="absolute left-3 bottom-3 grid grid-cols-3 gap-1.5" title="Bewegen (auch W A S D / Pfeiltasten, Q/E für runter/hoch)">
          <button className={padBtn} {...hold("d")} aria-label="Runter"><ChevronsDown size={16} /></button>
          <button className={padBtn} {...hold("f")} aria-label="Vorwärts"><ArrowUp size={16} /></button>
          <button className={padBtn} {...hold("u")} aria-label="Hoch"><ChevronsUp size={16} /></button>
          <button className={padBtn} {...hold("l")} aria-label="Links"><ArrowLeft size={16} /></button>
          <button className={padBtn} {...hold("b")} aria-label="Rückwärts"><ArrowDown size={16} /></button>
          <button className={padBtn} {...hold("r")} aria-label="Rechts"><ArrowRight size={16} /></button>
        </div>
        <button className={`${btn} absolute right-3 bottom-3 bg-card flex items-center gap-1.5`} onClick={() => viewer.current?.fitAll()}>
          <Maximize2 size={14} /> Gesamte Szene zeigen
        </button>
      </div>

      <aside className="w-[300px] shrink-0 border-l overflow-y-auto p-3 space-y-4 text-sm" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
        <section>
          <h3 className="font-semibold mb-2">Blätter in 3D</h3>
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

        <section>
          <h3 className="font-semibold mb-2">Auswahl</h3>
          {!sel ? <p className="text-xs text-muted-foreground">Körper in der 3D-Ansicht anklicken.</p> : (
            <div className="space-y-2">
              <div className="text-xs">{objectLabel(app, sel.sheetId, sel.id)}</div>
              <button className={`${btn} flex items-center gap-1.5`} onClick={onEditInCad}><Pencil size={13} /> Im CAD bearbeiten</button>
              <div className="pt-2 border-t space-y-2" style={{ borderColor: "hsl(var(--hairline))" }}>
                <div className="font-medium text-xs">Körperbeziehungen</div>
                <button className={btn} onClick={() => { setMsg(null); setPicking("cutout"); }}>Durchbricht … (Ziel wählen)</button>
                <div className="flex flex-wrap items-center gap-1.5">
                  <select className="h-8 rounded border text-xs bg-background px-1" value={face} onChange={e => setFace(e.target.value as any)}>
                    <option value="bottom">Unterseite</option><option value="top">Oberseite</option>
                  </select>
                  <select className="h-8 rounded border text-xs bg-background px-1" value={keep} onChange={e => setKeep(e.target.value as any)}>
                    <option value="below">darunter behalten</option><option value="above">darüber behalten</option>
                  </select>
                  <button className={btn} onClick={() => { setMsg(null); setPicking("limitToSurface"); }}>An Oberfläche begrenzen …</button>
                </div>
                {msg && <div className="text-xs text-muted-foreground">{msg}</div>}
                {rels.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="flex-1">
                      {r.type === "cutout" ? "Durchbricht" : `Begrenzt an ${r.face === "top" ? "Oberseite" : "Unterseite"} (${r.keep === "above" ? "darüber" : "darunter"})`}: {objectLabel(app, r.targetSheetId, r.targetId)}
                    </span>
                    <button className="h-7 w-7 grid place-items-center rounded hover:bg-muted" title="Beziehung entfernen" onClick={() => removeRelation(app, sel, i)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="pt-2 border-t space-y-2" style={{ borderColor: "hsl(var(--hairline))" }}>
          <h3 className="font-semibold">Render-Dossier</h3>
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
        </section>

        {issues.length > 0 && (
          <section>
            <h3 className="font-semibold mb-1 text-xs">Hinweise</h3>
            {issues.map((x, i) => <div key={i} className="text-xs text-muted-foreground">{x.message}</div>)}
          </section>
        )}
        <p className="text-xs text-muted-foreground">Ziehen: drehen · Rechts/Shift-Ziehen oder zwei Finger: schieben · Rad/Zwei-Finger-Zoom · W A S D: bewegen</p>
      </aside>
    </div>
  );
}
