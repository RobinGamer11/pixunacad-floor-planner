/**
 * „3D-Einstellungen“: gemeinsame Sektion für CAD und 3D-Bereich (dunkles Kartendesign).
 * Reihenfolge: Höhenlage/Körperhöhe → Flächen → Neigung bearbeiten → (Körperbeziehungen, vom 3D-Bereich).
 * Verwendet ausschließlich vorhandene Felder (Wandhöhe, Öffnungshöhe, Brüstung, Schraffurhöhe,
 * Bibliotheks-Körperhöhe). Jede bestätigte Änderung = genau ein Undo-Schritt (runAction).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Check, X as XIcon, RotateCcw, Pencil, Box, ArrowUpFromLine, Grid2x2, Ruler, Info as InfoIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resolveSelectedObjects } from "@/components/cad/ObjectInfoTabs";
import { libraryBodyHeightM, objectElevationM } from "@/cad/objectMeta";
import { sheetElevationM } from "@/cad/SheetManager";
import { computeStairGeometry } from "@/cad/stairGeometry";
import { cardinalEdge, convexHull, frameForCardinal, genericVertex, resolveGenericTilt, withOpposite, type Cardinal } from "@/cad/three3d/tiltGeometry";
import { projectObject2D } from "@/cad/three3d/tiltProject2D";
import { deriveObjectFromApp } from "@/cad/three3d/projectBridge";
import { piecePoints } from "@/cad/three3d/geometryDerivation";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { frameForEdge, netArea, scaleAcrossAxis, plumbScale, resolveTilt, straightEdgeIndices, tiltShapeError, topSurfaceArea, type TiltFrame, type TiltMode } from "@/cad/three3d/tiltGeometry";
import { TiltPreview3D, meshOfDerived, mergeMeshes } from "./TiltPreview3D";
import type { Vec2 } from "@/cad/geometry";
import { deriveHatch } from "@/cad/three3d/geometryDerivation";
import { setTiltDraftPreview } from "@/cad/three3d/tiltDraftPreview";
import { projectionCos } from "@/cad/three3d/tiltGeometry";
import { setOpeningState } from "@/cad/three3d/projectBridge";

const C = {
  card: { background: "hsl(var(--overlay-ink) / 0.94)", color: "hsl(var(--overlay-surface))", borderColor: "hsl(var(--overlay-surface) / 0.14)" },
  field: { background: "hsl(var(--overlay-surface) / 0.07)", borderColor: "hsl(var(--overlay-surface) / 0.18)", color: "hsl(var(--overlay-surface))" },
  muted: { color: "hsl(var(--overlay-surface) / 0.62)" },
  gold: { background: "hsl(var(--accent-gold))", borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--overlay-ink))" },
  err: { color: "hsl(0 80% 72%)", borderColor: "hsl(0 70% 60% / 0.6)" },
};
const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "—");
/** Dezimalkomma und -punkt; ungültig = null (nie still als 0). */
export const parseNum = (s: string): number | null => {
  const t = String(s).trim().replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const v = parseFloat(t); return Number.isFinite(v) ? v : null;
};

/** Neigungswinkel: übliche Winkel fangen (±1°), freie Winkel bleiben möglich. */
export function snapTiltAngle(deg: number): number {
  const c = Math.max(-90, Math.min(90, deg));
  const r = Math.round(c / 5) * 5;
  return Math.abs(r - c) <= 1 ? r : Math.round(c * 10) / 10;
}

function act(app: any, fn: () => void) {
  app.runAction?.(fn);
  try { app.renderer?.render?.(); } catch { /* noop */ }
}

/** Zahlenfeld: Enter oder Verlassen bestätigt genau einmal, Escape verwirft. */
/** Kleiner „i“-Knopf: Infotext erst auf Antippen. */
export const InfoTip: React.FC<{ text: string }> = ({ text }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label="Info" className="ml-1 inline-grid h-4 w-4 place-items-center rounded-full border align-middle" style={C.field}><InfoIcon size={10} /></button>
    </PopoverTrigger>
    <PopoverContent side="top" className="w-56 border p-2 text-[11px] leading-snug" style={C.card}>{text}</PopoverContent>
  </Popover>
);

const NumField: React.FC<{ label: string; value: number | null; unit?: string; onCommit?: (v: number) => void; min?: number; minExclusive?: boolean; hint?: string; info?: string }> = ({ label, value, unit = "m", onCommit, min, minExclusive, hint, info }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const set = (v: string | null) => { draftRef.current = v; setDraft(v); };
  const commit = () => {
    const d = draftRef.current; if (d === null) return;
    const v = parseNum(d);
    if (v === null) { setErr("Ungültige Zahl – nicht übernommen."); set(null); return; }
    if (min !== undefined && (minExclusive ? v <= min : v < min)) { setErr(min === 0 ? "Negative Werte sind hier nicht erlaubt." : `Mindestens ${fmt(min)} ${unit}.`); set(null); return; }
    set(null); setErr(null);
    if (!onCommit || (value !== null && Math.abs(v - value) < 1e-9)) return;
    onCommit(v);
  };
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center text-[10px] leading-tight" style={C.muted}>{label}{info && <InfoTip text={info} />}</span>
      <div className="flex items-center gap-1.5">
        <input type="text" inputMode="decimal" value={draft ?? (value === null ? "" : fmt(value))} readOnly={!onCommit}
          placeholder={value === null ? "Verschieden" : undefined}
          onChange={(e) => { set(e.target.value); setErr(null); }} onBlur={commit}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); } else if (e.key === "Escape") { set(null); setErr(null); (e.target as HTMLInputElement).blur(); } }}
          className="h-10 w-full min-w-0 rounded-lg border px-2.5 text-sm tabular-nums outline-none focus:ring-1"
          style={{ ...C.field, opacity: onCommit ? 1 : 0.6 }} />
        <span className="w-5 shrink-0 text-[11px]" style={C.muted}>{unit}</span>
      </div>
      {err ? <span className="mt-0.5 block text-[10px]" style={C.err}>{err}</span> : hint && <span className="mt-0.5 block text-[10px]" style={C.muted}>{hint}</span>}
    </label>
  );
};

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0 rounded-lg border px-2.5 py-2" style={C.field}>
    <div className="text-[10px] leading-tight" style={C.muted}>{label}</div>
    <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
  </div>
);
const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="text-[11px] leading-snug" style={C.muted}>{children}</div>;
const Section: React.FC<{ title: string; info?: string; children: React.ReactNode }> = ({ title, info, children }) => (
  <section className="space-y-2 rounded-xl border p-2.5" style={C.card}>
    <div className="flex items-center text-[10px] font-semibold uppercase tracking-[0.14em]" style={C.muted}>{title}{info && <InfoTip text={info} />}</div>
    {children}
  </section>
);
/** Großer Auswahlknopf mit Symbol und Beschriftung; aktiv = gold. */
export const BigChoice: React.FC<{ active?: boolean; disabled?: boolean; icon?: React.ReactNode; label: string; onClick?: () => void; title?: string }> = ({ active, disabled, icon, label, onClick, title }) => (
  <button type="button" disabled={disabled} onClick={onClick} title={title}
    className="flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[12px] font-medium leading-tight disabled:opacity-40"
    style={active ? C.gold : C.field}>
    {icon}<span className="text-center">{label}</span>
  </button>
);

const KIND_LABEL = (kind: string, obj: any) => ({ wall: "Wand", hatch: obj?.isPolygon ? "Polygon" : "Schraffur", door: obj?.kind === "window" ? "Fenster" : "Tür", stair: "Treppe", library: "Bibliothekselement", document: "Dokument", textbox: "Text", table: "Tabelle", segment: "Linie", dimension: "Maßkette", freeStroke: "Freihand" } as Record<string, string>)[kind] ?? "Objekt";

export const Object3DSettings: React.FC<{
  app: any; defaultOpen?: boolean; onlyKinds?: string[]; exceptKinds?: string[]; className?: string;
  /** Nur im 3D-Bereich: Kopfzeile mit „Im CAD bearbeiten“. */
  onEditInCad?: () => void;
  /** Nur im 3D-Bereich: Körperbeziehungen als vierte Karte. */
  relations?: React.ReactNode;
  manualMove?: React.ReactNode; manualActive?: boolean;
}> = ({ app, defaultOpen = false, onlyKinds, exceptKinds, className, onEditInCad, relations, manualMove, manualActive }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [, force] = useState(0);
  const [items, setItems] = useState<{ kind: string; obj: any }[]>([]);
  useEffect(() => {
    if (!app) return;
    let last: any[] = [];
    const t = window.setInterval(() => {
      const r = resolveSelectedObjects(app);
      const same = r.length === last.length && r.every((x, i) => x.obj === last[i]);
      if (!same) { last = r.map(x => x.obj); setItems(r); }
      force(x => x + 1);
    }, 300);
    return () => window.clearInterval(t);
  }, [app]);
  if (!app || !items.length) return null;
  if (onlyKinds && !onlyKinds.includes(items[0].kind)) return null;
  if (exceptKinds && exceptKinds.includes(items[0].kind)) return null;

  const sheet = app.sheetManager?.getById?.(app.activeSheetId);
  const sheetZ = sheet ? sheetElevationM(sheet) : 0;
  const editable = (o: any) => !o?.labelId || app.labelManager?.isEditable?.(o.labelId) !== false;
  const allEditable = items.every(x => editable(x.obj));
  const multi = items.length > 1;
  const { kind, obj } = items[0];
  const isPolygon = kind === "hatch" && obj.isPolygon === true;
  const isDoor = kind === "door";

  // Höhenlage über Blatt (Türen/Fenster: über Wand + Brüstung, eigener Pfad).
  const elevItems = items.filter(x => x.kind !== "door");
  const elevVals = elevItems.map(x => objectElevationM(x.obj));
  const elevCommon = elevVals.length && elevVals.every(v => Math.abs(v - elevVals[0]) < 1e-9) ? elevVals[0] : null;
  const setElev = (v: number) => act(app, () => { for (const x of elevItems) { if (!editable(x.obj)) continue; if (v === 0) delete x.obj.elevationM; else x.obj.elevationM = v; } });
  const name = obj.objName || obj.objCode || "";

  const body = (
    <div className="space-y-2.5 text-xs">
      {onEditInCad && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border p-2.5" style={C.card}>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold leading-tight">{multi ? `${items.length} Objekte` : KIND_LABEL(kind, obj)}</div>
            {!multi && <div className="truncate text-[11px]" style={C.muted}>{name ? `${obj.objName || ""}${obj.objCode ? ` · #${obj.objCode}` : ""}` : "ohne Namen"}</div>}
          </div>
          <button type="button" onClick={onEditInCad} className="flex h-10 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium" style={C.field}><Pencil size={14} /> Im CAD bearbeiten</button>
        </div>
      )}
      {!allEditable && <Note>Ebene gesperrt – nur Anzeige.</Note>}

      <Section title="Höhenlage und Körperhöhe">
        <div className="grid grid-cols-1 gap-2">
          {elevItems.length > 0 && (
            <NumField label={`Höhenlage ü. Blatt${multi ? ` (${elevItems.length} Objekte)` : ""}`} info={`Bezogen auf das Blatt (Blatthöhe ${fmt(sheetZ)} m). Negative Werte erlaubt.`} value={elevCommon} onCommit={allEditable ? setElev : undefined} />
          )}
          {!multi && isDoor && <DoorFields app={app} obj={obj} editable={editable(obj)} />}
          {!multi && kind === "wall" && (
            <NumField label="Körperhöhe (Wandhöhe)" info={`Anschlüsse an Nachbarwände entstehen automatisch. Wanddicke ${fmt(Number(obj.thicknessM) || 0)} m.`} value={Number(obj.heightM) || 0} min={0} minExclusive
              onCommit={editable(obj) ? (v) => act(app, () => { obj.heightM = v; }) : undefined} />
          )}
          {!multi && kind === "hatch" && !isPolygon && (
            <NumField label="Körperhöhe" info="Höhe des Körpers über seiner Höhenlage. 0 ergibt eine flache Fläche." value={Math.max(0, Number(obj.heightM) || 0)} min={0}
              onCommit={editable(obj) ? (v) => act(app, () => { obj.heightM = v; }) : undefined} />
          )}
          {!multi && kind === "library" && (
            <NumField label="Körperhöhe" info="Höhe des Bibliothekskörpers über seiner Höhenlage." value={libraryBodyHeightM(obj)} min={0} minExclusive
              onCommit={editable(obj) ? (v) => act(app, () => { obj.bodyHeightM = v; }) : undefined} />
          )}
        </div>
        {!multi && kind === "stair" && (() => {
          let total = 0; try { total = computeStairGeometry(obj).totalHeightM; } catch { /* noop */ }
          return <Info label="Gesamthöhe (aus Treppenberechnung)" value={`${fmt(total)} m`} />;
        })()}
        {!multi && isPolygon && <Note>Polygone liegen flach auf ihrer Höhenlage – kein Körper.</Note>}
        {!multi && ["document", "textbox", "table"].includes(kind) && <Note>Waagerechte Platte auf der Höhenlage; Breite und Höhe bleiben 2D-Maße.</Note>}
        {!multi && ["segment", "dimension", "freeStroke"].includes(kind) && <Note>Flache Darstellung auf der Höhenlage, keine Extrusion.</Note>}
      </Section>

      {manualMove}
      {!manualActive && !multi && kind === "hatch" && !isPolygon && <HatchSections app={app} obj={obj} sheetZ={sheetZ} editable={editable(obj)} />}
      {!manualActive && !multi && !(kind === "hatch" && !isPolygon) && kind !== "door" && <HatchSections app={app} obj={obj} sheetZ={sheetZ} editable={editable(obj)} generic />}
      {relations}
    </div>
  );

  if (onEditInCad) return <div className={className}>{body}</div>;
  return (
    <div className={className ?? "mb-2 mt-3 rounded-md border"} style={{ borderColor: "hsl(var(--hairline))" }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-1.5 px-2 py-2 text-[11px] font-semibold">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} 3D-Einstellungen
      </button>
      {open && <div className="border-t p-1.5" style={{ borderColor: "hsl(var(--hairline))" }}>{body}</div>}
    </div>
  );
};

/** Tür/Fenster: Höhenlage ü. Blatt = Wandhöhenlage + Unterkante (keine zweite Höhenposition). */
const DoorFields: React.FC<{ app: any; obj: any; editable: boolean }> = ({ app, obj, editable }) => {
  const wall = (app.scene?.walls || []).find((w: any) => w.id === obj.wallId);
  const wallElev = wall ? objectElevationM(wall) : 0;
  const sill = Number(obj.breakHeightM) || 0, h = Math.max(0, Number(obj.heightM) || 0);
  const on = (fn: (v: number) => void) => editable ? (v: number) => act(app, () => fn(v)) : undefined;
  return (
    <>
      <NumField label="Höhenlage ü. Blatt" value={wallElev + sill} onCommit={on(v => { obj.breakHeightM = v - wallElev; })} />
      <NumField label="Körperhöhe (Öffnungshöhe)" info="Lichte Höhe der Öffnung über ihrer Unterkante." value={h} min={0} minExclusive onCommit={on(v => { obj.heightM = v; })} />
      <NumField label={obj.kind === "window" ? "Brüstung (über Wand)" : "Unterkante (über Wand)"} value={sill} onCommit={on(v => { obj.breakHeightM = v; })} />
      <BigChoice active={!!obj.open3D} disabled={!editable} label={obj.open3D ? "Schließen" : "Öffnen"} onClick={() => setOpeningState(app, app.activeSheetId, obj.id, !obj.open3D)} />
    </>
  );
};

/** Flächen + Neigung bearbeiten für Schraffurkörper. */
const HatchSections: React.FC<{ app: any; obj: any; sheetZ: number; editable: boolean; generic?: boolean }> = ({ app, obj, sheetZ, editable, generic }) => {
  const z = sheetZ + objectElevationM(obj);
  // Allgemeine Objekte: Teile ohne Neigung (für Umriss und Körperhöhe).
  const flatPieces = generic ? deriveObjectFromApp(app, obj, undefined) : [];
  const h = generic ? Math.max(0, ...flatPieces.map((d: any) => (d.z1 ?? d.z ?? z) - z)) : Math.max(0, Number(obj.heightM) || 0);
  const holes = generic ? [] : (obj.holes || []).filter((r: any) => r?.length >= 3);
  const stored = obj.tilt3D;
  const rawPts: Vec2[] = generic ? piecePoints(flatPieces) : (obj.points || []);
  // Alle Objektarten: Kanten = Umrisshülle der abgeleiteten Teile (wie Schraffurkanten wählbar).
  const outline: Vec2[] = generic ? convexHull(rawPts) : rawPts;
  const resolveNow = () => generic ? resolveGenericTilt(obj.tilt3D, rawPts, z) : resolveTilt(obj, z);
  const resolved = resolveNow();
  const firstEdge = () => generic ? null : (straightEdgeIndices(obj)[0] ?? null);
  const initCard = (t: any): Cardinal | null => t?.cardinal ?? (generic && !t ? "bottom" : null);
  const [edge, setEdge] = useState<number | null>(resolved?.frame && !stored?.cardinal ? resolved.frame.edgeIndex : firstEdge());
  const [card, setCard] = useState<Cardinal | null>(initCard(stored));
  const [session, setSession] = useState<{ angle: number; mode: TiltMode; plumb: boolean; anchor: "top" | "bottom"; basis?: "plan" | "actual"; opposite: boolean } | null>(null);
  useEffect(() => {
    const r = resolveNow();
    setCard(initCard(obj.tilt3D));
    setEdge(r?.frame && !obj.tilt3D?.cardinal ? r.frame.edgeIndex : firstEdge()); setSession(null);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [obj]);

  const pts: Vec2[] = outline;
  const straight = useMemo(() => new Set(generic ? pts.map((_, i) => i) : straightEdgeIndices(obj)), [obj, pts.length, generic]);
  const sameEdge = !!(stored && resolved?.frame && (card ? stored.cardinal === card : !stored.cardinal && resolved.frame.edgeIndex === edge));
  const storedAngle = sameEdge ? stored.angleDeg : 0;
  const storedMode: TiltMode = stored?.mode === "lift" ? "lift" : "rotate";
  const cur = session ?? { angle: storedAngle, mode: storedMode, plumb: !!stored?.plumb, anchor: (stored?.anchor === "bottom" ? "bottom" : "top") as "top" | "bottom", basis: stored ? stored.basis : "plan" as "plan" | "actual" | undefined, opposite: !!stored?.opposite };
  // Winkel, bei dem die 2D-Punkte bei „Tatsächliche Fläche“ derzeit projiziert sind.
  const projDeg = stored?.basis === "actual" && resolved?.frame ? stored.angleDeg : 0;
  const frameAt = (deg: number, opp = cur.opposite) => withOpposite(card ? frameForCardinal(outline, card, deg, z) : edge !== null ? frameForEdge(generic ? { points: pts } : obj, edge, deg, z) : null, opp);
  const fr = frameAt(cur.angle);
  const frame: TiltFrame | undefined = fr?.frame;
  const shapeErr = frame ? tiltShapeError(cur.mode, frame, h, cur.plumb, cur.anchor) : undefined;
  const cEdge = card ? cardinalEdge(outline, card) : null;
  const tiltFields = () => card && cEdge
    ? { edgeIndex: -1, a: { x: cEdge[0].x, y: cEdge[0].y }, b: { x: cEdge[1].x, y: cEdge[1].y }, count: outline.length, cardinal: card }
    : edge !== null ? { edgeIndex: edge, a: { x: pts[edge].x, y: pts[edge].y }, b: { x: pts[(edge + 1) % pts.length].x, y: pts[(edge + 1) % pts.length].y }, count: pts.length } : null;
  const tf = tiltFields();
  const draftTilt = tf && frame && Math.abs(cur.angle) > 1e-9 && !shapeErr
    ? { ...tf, angleDeg: cur.angle, mode: cur.mode, plumb: cur.plumb, anchor: cur.anchor, ...(cur.basis ? { basis: cur.basis } : {}), ...(cur.opposite ? { opposite: true } : {}), projDeg }
    : (session ? undefined : stored);
  const draftPieces = generic ? (draftTilt ? deriveObjectFromApp(app, obj, draftTilt) : flatPieces) : undefined;
  // Gedachte Kante räumlich (Oberkante bzw. Unterkante bei „Kanten bündig“ unten).
  const highlight = cEdge && frame ? (() => {
    const zz = cur.plumb && cur.mode === "rotate" && cur.anchor === "bottom" ? z : z + h;
    const dt: any = draftTilt;
    const tv = (p: Vec2) => dt ? genericVertex(p.x, p.y, zz, frameAt(dt.angleDeg, !!dt.opposite)?.frame ?? frame, dt, h) : { x: p.x, y: p.y, z: zz };
    return [tv(cEdge[0]), tv(cEdge[1])] as [any, any];
  })() : undefined;

  // Echte Kanten bei allen Objektarten: Ober-/Unterkanten der Hülle räumlich (Auswahl/Hervorhebung).
  const ringFaces = generic && !card ? (() => {
    const dt: any = draftTilt, f2 = dt ? frameAt(dt.angleDeg, !!dt.opposite)?.frame : undefined;
    const tv = (p: Vec2, zz: number) => dt && f2 ? genericVertex(p.x, p.y, zz, f2, dt, h) : { x: p.x, y: p.y, z: zz };
    return { top: pts.map(p => tv(p, z + h)), bottom: pts.map(p => tv(p, z)) };
  })() : undefined;

  const begin = (patch: Partial<{ angle: number; mode: TiltMode; plumb: boolean; anchor: "top" | "bottom"; basis?: "plan" | "actual"; opposite: boolean }>) => setSession({ ...cur, ...patch });
  const projectAcross = (f: TiltFrame, k: number) => {
    if (generic) { projectObject2D(obj, f, k); return; }
    obj.points = scaleAcrossAxis(obj.points, f, k);
    if (Array.isArray(obj.holes)) obj.holes = obj.holes.map((r: any) => Array.isArray(r) ? scaleAcrossAxis(r, f, k) : r);
  };
  /** Bei gespeicherter „Tatsächlicher Fläche“ die 2D-Projektion zurück in die wahre Form strecken. */
  const unproject = () => {
    if (obj.tilt3D?.basis !== "actual") return;
    const r = resolveNow();
    if (r?.frame) projectAcross(r.frame, 1 / projectionCos(obj.tilt3D.angleDeg));
  };
  const commit = () => {
    if (!session || !tf || !frame || shapeErr) return;
    const v = session;
    const useBasis = v.mode === "rotate" && !v.plumb ? v.basis : undefined;
    act(app, () => {
      unproject();
      // Tatsächliche Fläche: 2D zeigt die Projektion des geneigten Körpers (quer zur Achse gestaucht).
      if (useBasis === "actual" && Math.abs(v.angle) > 1e-9) {
        const nf = frameAt(v.angle)?.frame;
        if (nf) projectAcross(nf, projectionCos(v.angle));
      }
      if (Math.abs(v.angle) < 1e-9) delete obj.tilt3D;
      else obj.tilt3D = { ...tf, angleDeg: v.angle, ...(v.mode === "lift" ? { mode: "lift" } : {}), ...(v.plumb ? { plumb: true } : {}), ...(v.plumb && v.anchor === "bottom" ? { anchor: "bottom" } : {}), ...(useBasis ? { basis: useBasis } : {}), ...(v.opposite ? { opposite: true } : {}) };
    });
    setSession(null);
  };
  // Jedes Objekt unabhängig: offene Entwürfe werden beim Objektwechsel verworfen, nie übertragen.
  // 3D-Vorschau (flüchtig) des Entwurfs auf dem ausgewählten Körper.
  useEffect(() => {
    if (!session || !draftTilt) { setTiltDraftPreview(null); return; }
    if (generic) {
      const m = mergeMeshes((draftPieces || []).map(meshOfDerived));
      const re = ringFaces && edge !== null && pts.length ? [ringFaces.top[edge], ringFaces.top[(edge + 1) % pts.length]] as any : undefined;
      setTiltDraftPreview(m ? { mesh: m, edge: (highlight as any) ?? re } : null); return;
    }
    const d: any = deriveHatch({ ...obj, tilt3D: draftTilt }, "preview", sheetZ);
    const m = meshOfDerived(d);
    if (!m) { setTiltDraftPreview(null); return; }
    if (highlight) { setTiltDraftPreview({ mesh: m, edge: highlight as any }); return; }
    const lvl = cur.plumb && cur.mode === "rotate" && cur.anchor === "bottom" ? "bottom" : "top";
    const ring = d?.faces?.[lvl]?.outer;
    const e = edge !== null && ring && ring.length === pts.length ? [ring[edge], ring[(edge + 1) % ring.length]] as any : undefined;
    setTiltDraftPreview({ mesh: m, edge: e });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify([session, draftTilt, edge, card, obj?.id, pts, sheetZ])]);
  useEffect(() => () => setTiltDraftPreview(null), [obj]);
  const cancel = () => setSession(null);
  useEffect(() => {
    if (!session) return;
    const kd = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); cancel(); }
    };
    window.addEventListener("keydown", kd, true);
    return () => window.removeEventListener("keydown", kd, true);
  });

  const [angleDraft, setAngleDraft] = useState<string | null>(null);
  const [angleErr, setAngleErr] = useState<string | null>(null);
  const angleDraftRef = useRef<string | null>(null);
  const commitAngleText = () => {
    const d = angleDraftRef.current; angleDraftRef.current = null; setAngleDraft(null);
    if (d === null) return;
    const v = parseNum(d);
    if (v === null) { setAngleErr("Ungültiger Winkel – nicht übernommen."); return; }
    setAngleErr(null); begin({ angle: Math.max(-90, Math.min(90, v)) }); // freie Eingabe ohne Fangrundung
  };

  const area = netArea(pts, holes);
  const dt: any = draftTilt;
  const dFrame = dt ? frameAt(dt.angleDeg)?.frame : undefined;
  const rigidBasis = dt && dt.mode !== "lift" && !dt.plumb ? dt.basis : undefined;
  const real = rigidBasis === "plan" ? (Math.abs(dt.angleDeg) === 90 ? area : area / projectionCos(dt.angleDeg || 0))
     : rigidBasis === "actual" ? area / projectionCos((dt.projDeg ?? dt.angleDeg) || 0)
    : topSurfaceArea(pts, holes, dt?.mode, dt?.plumb, dt?.angleDeg || 0, dFrame && dt?.plumb ? plumbScale(dFrame, h, dt.anchor) : 1);
  const canEdit = editable && !!tf && !!frame;
  const cardBtn = (c: Cardinal, icon: React.ReactNode, label: string, pos: string) => (
    <button key={c} type="button" disabled={!editable} title={`Waagerechte/lotrechte Bezugskante am äußersten Punkt: ${label}`} aria-label={`Bezugskante ${label}`} aria-pressed={card === c}
      onClick={() => { setCard(card === c ? null : c); if (card === c) setEdge(e => e ?? firstEdge() ?? (pts.length ? 0 : null)); }}
      className={`absolute z-10 flex h-7 items-center gap-1 rounded-md border px-1.5 text-[10px] font-medium disabled:opacity-40 ${pos}`}
      style={card === c ? C.gold : { ...C.field, background: "hsl(var(--overlay-ink) / 0.85)" }}>{icon}{label}</button>
  );
  const pct = ((cur.angle + 90) / 180) * 100;

  return (
    <>
      {!generic && <Section title="Flächen" info="Oberfläche inkl. Neigung/Verformung. Aussparungen abgezogen.">
        <div className="grid grid-cols-2 gap-2">
          <Info label="Grundfläche im CAD" value={`${fmt(area)} m²`} />
          <Info label="Tatsächliche Fläche" value={`${fmt(real)} m²`} />
        </div>
      </Section>}

      <Section title="Neigung bearbeiten">
        {resolved?.error && <div className="rounded-lg border px-2 py-1.5 text-[11px]" style={C.err}>{resolved.error}</div>}
        <TiltPreview3D obj={obj} base={sheetZ} draftTilt={draftTilt} edge={card ? null : edge} pieces={draftPieces} highlight={highlight} ring={generic ? pts : undefined} ringFaces={ringFaces} edgeLevel={cur.plumb && cur.mode === "rotate" ? cur.anchor : "top"} frame={frame} selectable={straight}
          bottomSelectable={cur.plumb && cur.mode === "rotate"}
          onPickEdge={editable ? (i, level) => {
            setCard(null);
            if (i !== edge) setEdge(i); // Kantenwechsel jederzeit; offene Bearbeitung gilt für die neue Kante
            if (cur.plumb && cur.mode === "rotate" && level !== cur.anchor) begin({ anchor: level });
          } : undefined}>
          {cardBtn("top", <ArrowUp size={11} />, "Oben", "left-1/2 top-1.5 -translate-x-1/2")}
          {cardBtn("bottom", <ArrowDown size={11} />, "Unten", "bottom-1.5 left-1/2 -translate-x-1/2")}
          {cardBtn("left", <ArrowLeft size={11} />, "Links", "left-1.5 top-1/2 -translate-y-1/2")}
          {cardBtn("right", <ArrowRight size={11} />, "Rechts", "right-1.5 top-1/2 -translate-y-1/2")}
        </TiltPreview3D>
        <div className="flex gap-2">
          <BigChoice active={cur.mode === "rotate"} disabled={!canEdit} icon={<Box size={15} />} label="Körper neigen" onClick={() => begin({ mode: "rotate" })} title="Gesamter Körper wird um die gegenüberliegende Seite geneigt" />
          <BigChoice active={cur.mode === "lift"} disabled={!canEdit} icon={<ArrowUpFromLine size={15} />} label="Kante neigen" onClick={() => begin({ mode: "lift" })} title="Gewählte Oberkante wird geneigt, Gegenkante und Unterseite bleiben fest" />
        </div>
        <div className="space-y-1" style={{ opacity: canEdit && cur.mode === "rotate" && !cur.plumb ? 1 : 0.45 }}>
          <div className="flex items-center text-[11px]" style={C.muted}>Orientierung an<InfoTip text="Grundfläche: der Körper bleibt im Grundriss wie in 2D gezeichnet und wird durch die Neigung größer. Tatsächliche Fläche: die Fläche bleibt gleich, der Grundriss wird kleiner – so auch in 2D angezeigt." /></div>
          <div className="flex gap-2">
            <BigChoice active={cur.basis === "plan"} disabled={!canEdit || cur.mode !== "rotate" || cur.plumb} icon={<Grid2x2 size={15} />} label="Grundfläche" onClick={() => begin({ basis: "plan" })} />
            <BigChoice active={cur.basis === "actual"} disabled={!canEdit || cur.mode !== "rotate" || cur.plumb} icon={<Ruler size={15} />} label="Tatsächliche Fläche" onClick={() => begin({ basis: "actual" })} />
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]"><span style={C.muted}>Neigungswinkel<InfoTip text="Bei genau ±90° wird der Körper starr aufgerichtet. Grundfläche fest, Kante neigen und lotrechte Seiten sind dort mathematisch nicht als endliche Höhenfunktion möglich. Tatsächliche Fläche bleibt erhalten; die 2D-Projektion behält eine minimale, rücksetzbare Breite." /></span>
            <div className="flex items-center gap-1">
              <input type="text" inputMode="decimal" disabled={!canEdit} value={angleDraft ?? fmt(cur.angle, 1)}
                onChange={(e) => { angleDraftRef.current = e.target.value; setAngleDraft(e.target.value); setAngleErr(null); }} onBlur={commitAngleText}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); commitAngleText(); (e.target as HTMLInputElement).blur(); } else if (e.key === "Escape") { angleDraftRef.current = null; setAngleDraft(null); (e.target as HTMLInputElement).blur(); } }}
                className="h-9 w-16 rounded-lg border px-2 text-right text-sm tabular-nums outline-none disabled:opacity-40" style={C.field} />
              <span>°</span>
            </div>
          </div>
          <div className="relative py-2">
            <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ background: "linear-gradient(90deg, hsl(var(--overlay-surface) / 0.28), hsl(var(--overlay-surface) / 0.08) 50%, hsl(var(--accent-gold) / 0.55))" }} />
            <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2" style={{ left: "50%", background: "hsl(var(--overlay-surface))" }} />
            <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ left: `${Math.min(50, pct)}%`, width: `${Math.abs(pct - 50)}%`, background: "hsl(var(--accent-gold))" }} />
            <input type="range" min={-90} max={90} step={0.5} value={cur.angle} disabled={!canEdit} aria-label="Neigungswinkel"
              onChange={(e) => begin({ angle: snapTiltAngle(+e.target.value) })} className="relative w-full opacity-90 disabled:opacity-40" style={{ accentColor: "hsl(var(--accent-gold))", touchAction: "pan-y" }} />
            <div className="flex justify-between text-[10px]" style={C.muted}><span>−90°</span><span>0°</span><span>+90°</span></div>
          </div>
          {angleErr && <div className="text-[10px]" style={C.err}>{angleErr}</div>}
        </div>
        {tf && <label className="flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5" style={{ ...C.field, opacity: canEdit ? 1 : 0.5 }}>
          <span className="flex items-center text-[12px]">Gegenüberliegende Kante neigen<InfoTip text="Die gewählte Kante bleibt fest, die gegenüberliegende Seite wird geneigt." /></span>
          <button type="button" role="switch" aria-checked={cur.opposite} aria-label="Gegenüberliegende Kante neigen" disabled={!canEdit} onClick={() => begin({ opposite: !cur.opposite })}
            className="relative h-6 w-11 shrink-0 rounded-full border transition-colors" style={cur.opposite ? C.gold : C.field}>
            <span className="absolute top-0.5 h-4 w-4 rounded-full transition-all" style={{ left: cur.opposite ? 22 : 3, background: cur.opposite ? "hsl(var(--overlay-ink))" : "hsl(var(--overlay-surface))" }} />
          </button>
        </label>}
        <label className="flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5" style={{ ...C.field, opacity: canEdit && cur.mode === "rotate" ? 1 : 0.5 }}>
          <span className="flex items-center text-[12px]">Kanten bündig<InfoTip text="Die gewählte Kante bleibt an ihrer Stelle, die Seiten werden lotrecht. Oberkante gewählt: die Kante darunter wird lotrecht nach unten geführt. Unterkante gewählt (in der Vorschau antippen): die Kante darüber wird lotrecht nach oben geführt. Der Körper wird nicht länger." /></span>
          <button type="button" role="switch" aria-checked={cur.plumb} disabled={!canEdit || cur.mode === "lift"} onClick={() => begin({ plumb: !cur.plumb })}
            className="relative h-6 w-11 shrink-0 rounded-full border transition-colors" style={cur.plumb ? C.gold : C.field}>
            <span className="absolute top-0.5 h-4 w-4 rounded-full transition-all" style={{ left: cur.plumb ? 22 : 3, background: cur.plumb ? "hsl(var(--overlay-ink))" : "hsl(var(--overlay-surface))" }} />
          </button>
        </label>
        {(fr?.error || shapeErr) && <div className="rounded-lg border px-2 py-1.5 text-[11px]" style={C.err}>{fr?.error || shapeErr}</div>}
        {session ? (
          <div className="flex gap-2">
            <BigChoice active disabled={!!shapeErr || !frame} icon={<Check size={15} />} label="Übernehmen" onClick={commit} />
            <BigChoice icon={<XIcon size={15} />} label="Abbrechen" onClick={cancel} />
          </div>
        ) : (
          <div className="flex gap-2">
            <BigChoice disabled={!editable || !stored} icon={<RotateCcw size={15} />} label="Auf 0° zurücksetzen" onClick={() => act(app, () => { unproject(); delete obj.tilt3D; })} />
          </div>
        )}
      </Section>
    </>
  );
};

