/**
 * „3D-Einstellungen“: gemeinsame Sektion für CAD und 3D-Bereich (dunkles Kartendesign).
 * Reihenfolge: Höhenlage/Körperhöhe → Flächen → Neigung bearbeiten → (Körperbeziehungen, vom 3D-Bereich).
 * Verwendet ausschließlich vorhandene Felder (Wandhöhe, Öffnungshöhe, Brüstung, Schraffurhöhe,
 * Bibliotheks-Körperhöhe). Jede bestätigte Änderung = genau ein Undo-Schritt (runAction).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Check, X as XIcon, RotateCcw, Pencil, Box, ArrowUpFromLine, Info as InfoIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resolveSelectedObjects } from "@/components/cad/ObjectInfoTabs";
import { libraryBodyHeightM, objectElevationM } from "@/cad/objectMeta";
import { sheetElevationM } from "@/cad/SheetManager";
import { computeStairGeometry } from "@/cad/stairGeometry";
import { frameForEdge, netArea, plumbScale, resolveTilt, straightEdgeIndices, tiltShapeError, topSurfaceArea, type TiltFrame, type TiltMode } from "@/cad/three3d/tiltGeometry";
import { TiltPreview3D } from "./TiltPreview3D";

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
  const c = Math.max(-85, Math.min(85, deg));
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
}> = ({ app, defaultOpen = false, onlyKinds, exceptKinds, className, onEditInCad, relations }) => {
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

      {!multi && kind === "hatch" && !isPolygon && <HatchSections app={app} obj={obj} sheetZ={sheetZ} editable={editable(obj)} />}
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
    </>
  );
};

/** Flächen + Neigung bearbeiten für Schraffurkörper. */
const HatchSections: React.FC<{ app: any; obj: any; sheetZ: number; editable: boolean }> = ({ app, obj, sheetZ, editable }) => {
  const z = sheetZ + objectElevationM(obj);
  const h = Math.max(0, Number(obj.heightM) || 0);
  const holes = (obj.holes || []).filter((r: any) => r?.length >= 3);
  const stored = obj.tilt3D;
  const resolved = resolveTilt(obj, z);
  const firstEdge = () => straightEdgeIndices(obj)[0] ?? null;
  const [edge, setEdge] = useState<number | null>(resolved?.frame?.edgeIndex ?? firstEdge());
  const [session, setSession] = useState<{ angle: number; mode: TiltMode; plumb: boolean; anchor: "top" | "bottom" } | null>(null);
  const dragStart = useRef<number>(0);
  useEffect(() => { setEdge(resolveTilt(obj, z)?.frame?.edgeIndex ?? firstEdge()); setSession(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [obj]);

  const pts = obj.points || [];
  const straight = useMemo(() => new Set(straightEdgeIndices(obj)), [obj, pts.length]);
  const sameEdge = !!(stored && resolved?.frame && resolved.frame.edgeIndex === edge);
  const storedAngle = sameEdge ? stored.angleDeg : 0;
  const storedMode: TiltMode = stored?.mode === "lift" ? "lift" : "rotate";
  const cur = session ?? { angle: storedAngle, mode: storedMode, plumb: !!stored?.plumb, anchor: (stored?.anchor === "bottom" ? "bottom" : "top") as "top" | "bottom" };
  const fr = edge !== null ? frameForEdge(obj, edge, cur.angle, z) : null;
  const frame: TiltFrame | undefined = fr?.frame;
  const shapeErr = frame ? tiltShapeError(cur.mode, frame, h, cur.plumb, cur.anchor) : undefined;
  const draftTilt = edge !== null && frame && Math.abs(cur.angle) > 1e-9 && !shapeErr
    ? { edgeIndex: edge, a: pts[edge], b: pts[(edge + 1) % pts.length], count: pts.length, angleDeg: cur.angle, mode: cur.mode, plumb: cur.plumb, anchor: cur.anchor }
    : (session ? undefined : stored);

  const begin = (patch: Partial<{ angle: number; mode: TiltMode; plumb: boolean; anchor: "top" | "bottom" }>) => setSession({ ...cur, ...patch });
  const commit = () => {
    if (!session || edge === null || !frame || shapeErr) return;
    const a = pts[edge], b = pts[(edge + 1) % pts.length], v = session;
    act(app, () => {
      if (Math.abs(v.angle) < 1e-9) delete obj.tilt3D;
      else obj.tilt3D = { edgeIndex: edge, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, count: pts.length, angleDeg: v.angle, ...(v.mode === "lift" ? { mode: "lift" } : {}), ...(v.plumb ? { plumb: true } : {}), ...(v.plumb && v.anchor === "bottom" ? { anchor: "bottom" } : {}) };
    });
    setSession(null);
  };
  // Zuverlässig speichern: eine gültige, noch offene Bearbeitung wird beim Verlassen
  // (Auswahlwechsel, Panel schließt) übernommen statt still verworfen.
  const commitRef = useRef(commit); commitRef.current = commit;
  useEffect(() => () => { commitRef.current(); }, [obj]);
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

  // Zug an der Kante: Höhenänderung der Kante → tatsächlicher Winkel des gewählten Modus.
  const onEdgeDrag = (phase: "start" | "move", dz: number) => {
    if (!frame) return;
    const D = frame.D;
    if (phase === "start") { dragStart.current = cur.mode === "lift" ? D * Math.tan(cur.angle * Math.PI / 180) : D * Math.sin(cur.angle * Math.PI / 180); if (!session) begin({}); return; }
    const rise = dragStart.current + dz;
    const deg = cur.mode === "lift" ? Math.atan(rise / D) * 180 / Math.PI : Math.asin(Math.max(-1, Math.min(1, rise / D))) * 180 / Math.PI;
    setSession(s => ({ ...(s ?? cur), angle: snapTiltAngle(deg) }));
  };

  const [angleDraft, setAngleDraft] = useState<string | null>(null);
  const [angleErr, setAngleErr] = useState<string | null>(null);
  const angleDraftRef = useRef<string | null>(null);
  const commitAngleText = () => {
    const d = angleDraftRef.current; angleDraftRef.current = null; setAngleDraft(null);
    if (d === null) return;
    const v = parseNum(d);
    if (v === null) { setAngleErr("Ungültiger Winkel – nicht übernommen."); return; }
    setAngleErr(null); begin({ angle: Math.max(-85, Math.min(85, v)) }); // freie Eingabe ohne Fangrundung
  };

  const area = netArea(pts, holes);
  const dt: any = draftTilt;
  const dFrame = dt && edge !== null ? frameForEdge(obj, edge, dt.angleDeg, z).frame : undefined;
  const real = topSurfaceArea(pts, holes, dt?.mode, dt?.plumb, dt?.angleDeg || 0, dFrame && dt?.plumb ? plumbScale(dFrame, h, dt.anchor) : 1);
  const canEdit = editable && edge !== null && !!frame;
  const pct = ((cur.angle + 85) / 170) * 100;

  return (
    <>
      <Section title="Flächen" info="Oberfläche inkl. Neigung/Verformung. Aussparungen abgezogen.">
        <div className="grid grid-cols-2 gap-2">
          <Info label="Grundfläche im CAD" value={`${fmt(area)} m²`} />
          <Info label="Tatsächliche Fläche" value={`${fmt(real)} m²`} />
        </div>
      </Section>

      <Section title="Neigung bearbeiten">
        {resolved?.error && <div className="rounded-lg border px-2 py-1.5 text-[11px]" style={C.err}>{resolved.error}</div>}
        <TiltPreview3D obj={obj} base={sheetZ} draftTilt={draftTilt} edge={edge} edgeLevel={cur.plumb && cur.mode === "rotate" ? cur.anchor : "top"} frame={frame} selectable={straight}
          bottomSelectable={cur.plumb && cur.mode === "rotate"}
          onPickEdge={editable ? (i, level) => {
            if (i !== edge) setEdge(i); // Kantenwechsel jederzeit; offene Bearbeitung gilt für die neue Kante
            if (cur.plumb && cur.mode === "rotate" && level !== cur.anchor) begin({ anchor: level });
          } : undefined} onEdgeDrag={canEdit && !shapeErr ? onEdgeDrag : undefined} />
        <div className="flex gap-2">
          <BigChoice active={cur.mode === "rotate"} disabled={!canEdit} icon={<Box size={15} />} label="Körper neigen" onClick={() => begin({ mode: "rotate" })} title="Gesamter Körper wird um die gegenüberliegende Seite geneigt" />
          <BigChoice active={cur.mode === "lift"} disabled={!canEdit} icon={<ArrowUpFromLine size={15} />} label="Kante anheben" onClick={() => begin({ mode: "lift" })} title="Gewählte Oberkante wird angehoben, Gegenkante und Unterseite bleiben fest" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]"><span style={C.muted}>Neigungswinkel</span>
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
            <input type="range" min={-85} max={85} step={0.5} value={cur.angle} disabled={!canEdit} aria-label="Neigungswinkel"
              onChange={(e) => begin({ angle: snapTiltAngle(+e.target.value) })} className="relative w-full opacity-90 disabled:opacity-40" style={{ accentColor: "hsl(var(--accent-gold))", touchAction: "pan-y" }} />
            <div className="flex justify-between text-[10px]" style={C.muted}><span>−85°</span><span>0°</span><span>+85°</span></div>
          </div>
          {angleErr && <div className="text-[10px]" style={C.err}>{angleErr}</div>}
        </div>
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
            <BigChoice disabled={!editable || !stored} icon={<RotateCcw size={15} />} label="Auf 0° zurücksetzen" onClick={() => act(app, () => { delete obj.tilt3D; })} />
          </div>
        )}
      </Section>
    </>
  );
};

