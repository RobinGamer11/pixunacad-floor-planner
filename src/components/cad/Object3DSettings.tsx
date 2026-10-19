/**
 * „Darstellung → 3D-Einstellungen“: gemeinsame, wiederverwendbare Sektion für
 * CAD und 3D-Bereich. Zeigt je Objektart nur wirksame räumliche Werte und
 * verwendet ausschließlich vorhandene Felder (Wandhöhe, Schraffurhöhe,
 * Brüstung …). Jede bestätigte Änderung = genau ein Undo-Schritt (runAction).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Check, X as XIcon, RotateCcw } from "lucide-react";
import { resolveSelectedObjects } from "@/components/cad/ObjectInfoTabs";
import { libraryBodyHeightM, objectElevationM } from "@/cad/objectMeta";
import { sheetElevationM } from "@/cad/SheetManager";
import { computeStairGeometry } from "@/cad/stairGeometry";
import { frameForEdge, netArea, resolveTilt, straightEdgeIndices, tiltPoint, type TiltFrame } from "@/cad/three3d/tiltGeometry";
import type { Vec2 } from "@/cad/geometry";

const HAIRLINE = "hsl(var(--hairline))";
const fieldStyle = { borderColor: HAIRLINE, backgroundColor: "hsl(var(--card))" };
const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "—");
const parse = (s: string) => { const v = parseFloat(String(s).replace(",", ".")); return Number.isFinite(v) ? v : null; };

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

/** Zahlenfeld: übernimmt erst bei Enter/Verlassen (ein Verlaufsschritt). */
const NumField: React.FC<{ label: string; value: number | null; unit?: string; onCommit?: (v: number) => void; min?: number; disabled?: boolean; hint?: string }> = ({ label, value, unit = "m", onCommit, min, disabled, hint }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? "" : fmt(value));
  const commit = () => {
    if (draft === null) return;
    const v = parse(draft); setDraft(null);
    if (v === null || !onCommit || (min !== undefined && v < min) || (value !== null && Math.abs(v - value) < 1e-9)) return;
    onCommit(v);
  };
  return (
    <label className="block">
      <span className="mb-1 block text-[9px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="text" inputMode="decimal" value={shown} readOnly={!onCommit} disabled={disabled}
          placeholder={value === null ? "Verschieden" : undefined}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); } if (e.key === "Escape") setDraft(null); e.stopPropagation(); }}
          className={`h-7 w-full rounded-md border px-2 text-[11px] tabular-nums outline-none ${onCommit ? "" : "text-muted-foreground"}`}
          style={fieldStyle}
        />
        <span className="w-6 shrink-0 text-[10px] text-muted-foreground">{unit}</span>
      </div>
      {hint && <span className="mt-0.5 block text-[9px] text-muted-foreground">{hint}</span>}
    </label>
  );
};

const ReadRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between text-[10px]"><span className="text-muted-foreground">{label}</span><span className="tabular-nums">{value}</span></div>
);

export const Object3DSettings: React.FC<{ app: any; defaultOpen?: boolean; onlyKinds?: string[]; exceptKinds?: string[]; className?: string }> = ({ app, defaultOpen = false, onlyKinds, exceptKinds, className }) => {
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

  // Höhenlage (nicht für Türen/Fenster: deren Lage ergibt sich aus Wand + Brüstung).
  const elevItems = items.filter(x => x.kind !== "door");
  const elevVals = elevItems.map(x => objectElevationM(x.obj));
  const elevCommon = elevVals.length && elevVals.every(v => Math.abs(v - elevVals[0]) < 1e-9) ? elevVals[0] : null;
  const setElev = (v: number) => act(app, () => { for (const x of elevItems) { if (!editable(x.obj)) continue; if (v === 0) delete x.obj.elevationM; else x.obj.elevationM = v; } });

  return (
    <div className={className ?? "mb-2 rounded-md border"} style={{ borderColor: HAIRLINE }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} 3D-Einstellungen
      </button>
      {open && (
        <div className="space-y-3 border-t px-2 py-2 text-xs" style={{ borderColor: HAIRLINE }}>
          {!allEditable && <div className="text-[10px] text-muted-foreground">Ebene gesperrt – nur Anzeige.</div>}
          {elevItems.length > 0 && (
            <NumField label={`Höhenlage über Blatt${multi ? ` (für ${elevItems.length} Objekte)` : ""}`} value={elevCommon} onCommit={allEditable ? setElev : undefined}
              hint={`Blatthöhe ${fmt(sheetZ)} m · negative Werte erlaubt`} />
          )}
          {!multi && kind === "wall" && (
            <div className="space-y-1">
              <ReadRow label="Wandhöhe (Körperhöhe)" value={`${fmt(Number(obj.heightM) || 0)} m`} />
              <ReadRow label="Wanddicke" value={`${fmt(Number(obj.thicknessM) || 0)} m`} />
              <ReadRow label="Unterkante / Oberkante" value={`${fmt(sheetZ + objectElevationM(obj))} / ${fmt(sheetZ + objectElevationM(obj) + (Number(obj.heightM) || 0))} m`} />
              <div className="text-[9px] text-muted-foreground">Höhe und Dicke werden in den Wandeinstellungen bearbeitet. Anschlüsse an Nachbarwände entstehen automatisch.</div>
            </div>
          )}
          {!multi && isDoor && <DoorFields app={app} obj={obj} sheetZ={sheetZ} editable={editable(obj)} />}
          {!multi && kind === "hatch" && !isPolygon && <HatchFields app={app} obj={obj} sheetZ={sheetZ} editable={editable(obj)} />}
          {!multi && isPolygon && <div className="text-[9px] text-muted-foreground">Polygone werden flach auf ihrer Höhenlage dargestellt – kein Körper.</div>}
          {!multi && kind === "stair" && (() => {
            let total = 0; try { total = computeStairGeometry(obj).totalHeightM; } catch { /* noop */ }
            return <ReadRow label="Gesamthöhe (aus Treppenberechnung)" value={`${fmt(total)} m`} />;
          })()}
          {!multi && kind === "library" && (
            <NumField label="Räumliche Körperhöhe" value={libraryBodyHeightM(obj)} min={0.001} onCommit={editable(obj) ? (v) => act(app, () => { obj.bodyHeightM = v; }) : undefined}
              hint="Unabhängig von der 2D-Größe im Grundriss." />
          )}
          {!multi && ["document", "textbox", "table"].includes(kind) && <div className="text-[9px] text-muted-foreground">Wird als waagerechte Platte auf der Höhenlage gezeigt; Breite und Höhe bleiben die 2D-Maße.</div>}
          {!multi && ["segment", "dimension", "freeStroke"].includes(kind) && <div className="text-[9px] text-muted-foreground">Flache Darstellung auf der Höhenlage, keine Extrusion.</div>}
        </div>
      )}
    </div>
  );
};

const DoorFields: React.FC<{ app: any; obj: any; sheetZ: number; editable: boolean }> = ({ app, obj, sheetZ, editable }) => {
  const wall = (app.scene?.walls || []).find((w: any) => w.id === obj.wallId);
  const wallZ = sheetZ + (wall ? objectElevationM(wall) : 0);
  const sill = Math.max(0, Number(obj.breakHeightM) || 0), h = Math.max(0, Number(obj.heightM) || 0);
  const set = (k: "breakHeightM" | "heightM") => editable ? (v: number) => act(app, () => { obj[k] = Math.max(0, v); }) : undefined;
  return (
    <div className="space-y-2">
      <NumField label={obj.kind === "window" ? "Brüstungshöhe (Unterkante über Wand)" : "Unterkante über Wand"} value={sill} min={0} onCommit={set("breakHeightM")}
        hint="Die Höhenlage der Öffnung ist ihre Unterkante über der Wandunterkante." />
      <NumField label="Öffnungshöhe (ab Unterkante)" value={h} min={0} onCommit={set("heightM")} />
      <ReadRow label="Unterkante / Oberkante absolut" value={`${fmt(wallZ + sill)} / ${fmt(wallZ + sill + h)} m`} />
    </div>
  );
};

const HatchFields: React.FC<{ app: any; obj: any; sheetZ: number; editable: boolean }> = ({ app, obj, sheetZ, editable }) => {
  const z = sheetZ + objectElevationM(obj);
  const h = Math.max(0, Number(obj.heightM) || 0);
  const area = netArea(obj.points || [], (obj.holes || []).filter((r: any) => r?.length >= 3));
  const tilt = resolveTilt(obj, z);
  let lo = z, hi = z + h;
  if (tilt?.frame) {
    const zs: number[] = [];
    for (const p of obj.points) for (const zz of [z, z + h]) zs.push(tiltPoint(p.x, p.y, zz, tilt.frame).z);
    lo = Math.min(...zs); hi = Math.max(...zs);
  }
  return (
    <div className="space-y-2">
      <NumField label="Körperhöhe (vor dem Neigen, 0 = flache Fläche)" value={h} min={0} onCommit={editable ? (v) => act(app, () => { obj.heightM = v; }) : undefined} />
      <ReadRow label="Grundfläche (inkl. Aussparungen)" value={`${fmt(area)} m²`} />
      <ReadRow label="Unterkante / Oberkante nach Neigung" value={`${fmt(lo)} / ${fmt(hi)} m`} />
      {tilt?.error && <div className="rounded border px-2 py-1 text-[10px]" style={{ borderColor: "hsl(var(--destructive))", color: "hsl(var(--destructive))" }}>{tilt.error}</div>}
      <TiltControl app={app} obj={obj} z={z} h={h} editable={editable} />
    </div>
  );
};

/** Neigen: Kante wählen → „Neigen“ → an der Kante ziehen / Zahl / Regler → ✓ oder Enter. */
const TiltControl: React.FC<{ app: any; obj: any; z: number; h: number; editable: boolean }> = ({ app, obj, z, h, editable }) => {
  const stored = obj.tilt3D;
  const resolved = resolveTilt(obj, z);
  const [edge, setEdge] = useState<number | null>(resolved?.frame?.edgeIndex ?? null);
  const [session, setSession] = useState<{ angle: number } | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; angle: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => { setEdge(resolveTilt(obj, z)?.frame?.edgeIndex ?? null); setSession(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [obj]);

  const pts: Vec2[] = obj.points || [];
  const straight = useMemo(() => new Set(straightEdgeIndices(obj)), [obj, pts.length]);
  const W = 240, H = 150, PAD = 14;
  const bb = pts.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const sc = Math.min((W - 2 * PAD) / Math.max(1e-6, bb.maxX - bb.minX), (H - 2 * PAD) / Math.max(1e-6, bb.maxY - bb.minY));
  const X = (x: number) => PAD + (x - bb.minX) * sc, Y = (y: number) => PAD + (y - bb.minY) * sc;

  const storedAngle = stored && resolved?.frame && resolved.frame.edgeIndex === edge ? stored.angleDeg : 0;
  const angle = session ? session.angle : storedAngle;
  const fr = edge !== null ? frameForEdge(obj, edge, angle, z) : null;
  const frame: TiltFrame | undefined = fr?.frame;

  const commit = () => {
    if (!session || edge === null || !frame) return;
    const a = pts[edge], b = pts[(edge + 1) % pts.length];
    const v = session.angle;
    act(app, () => {
      if (Math.abs(v) < 1e-9) delete obj.tilt3D;
      else obj.tilt3D = { edgeIndex: edge, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, count: pts.length, angleDeg: v };
    });
    setSession(null);
  };
  const cancel = () => { setSession(null); drag.current = null; };
  const reset = () => { act(app, () => { delete obj.tilt3D; }); setSession(null); };

  // Enter bestätigt, Escape verwirft – nur solange die Neigung bearbeitet wird.
  useEffect(() => {
    if (!session) return;
    const kd = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && e.key !== "Escape") return;
      if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); cancel(); }
    };
    window.addEventListener("keydown", kd, true);
    return () => window.removeEventListener("keydown", kd, true);
  });

  // Ziehen: erster Kontakt startet ohne Sprung, Anheben hält die Vorschau,
  // erneuter Kontakt setzt vom aktuellen Winkel fort. Bedienknöpfe liegen außerhalb.
  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!session || !frame) return;
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, angle: session.angle };
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current; if (!d || d.id !== e.pointerId || !frame || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const k = (W / Math.max(1, r.width)) / sc; // Bildschirm → Meter
    const dx = (e.clientX - d.x) * k, dy = (e.clientY - d.y) * k;
    // Kante Richtung Achse ziehen = anheben.
    const du = dx * frame.n.x + dy * frame.n.y;
    setSession({ angle: snapTiltAngle(d.angle - (du / frame.D) * (180 / Math.PI)) });
  };
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => { if (drag.current?.id === e.pointerId) drag.current = null; };

  const proj = frame && session ? pts.map(p => tiltPoint(p.x, p.y, z + h, frame)) : null;
  const pathOf = (ring: { x: number; y: number }[]) => ring.map((p, i) => `${i ? "L" : "M"}${X(p.x)},${Y(p.y)}`).join(" ") + " Z";

  return (
    <div className="space-y-2 rounded-md border p-2" style={{ borderColor: HAIRLINE }}>
      <div className="text-[10px] font-semibold tracking-wider text-muted-foreground">NEIGUNG</div>
      <div className="text-[9px] text-muted-foreground">{session ? "An der Kante ziehen, Winkel eingeben oder Regler nutzen – ✓/Enter übernimmt, ✕/Esc verwirft." : "Gerade Kante antippen (Auswahl ändert noch nichts), dann „Neigen“."}</div>
      {pts.length >= 3 && Number.isFinite(sc) && (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full rounded border select-none" style={{ borderColor: HAIRLINE, touchAction: "none", cursor: session ? "grab" : "default" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <path d={pathOf(pts)} fill="hsl(var(--muted))" stroke="hsl(var(--ink-soft))" strokeWidth={1} />
          {proj && <path d={pathOf(proj)} fill="none" stroke="hsl(var(--accent-gold))" strokeDasharray="4 3" strokeWidth={1.2} />}
          {frame && (() => {
            const a = { x: frame.axis.x - frame.dir.x * 1e3, y: frame.axis.y - frame.dir.y * 1e3 }, b = { x: frame.axis.x + frame.dir.x * 1e3, y: frame.axis.y + frame.dir.y * 1e3 };
            return <line x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} stroke="hsl(var(--ink-soft))" strokeDasharray="2 3" strokeWidth={1} />;
          })()}
          {pts.map((p, i) => {
            const q = pts[(i + 1) % pts.length];
            const ok = straight.has(i);
            const sel = i === edge;
            return (
              <g key={i}>
                <line x1={X(p.x)} y1={Y(p.y)} x2={X(q.x)} y2={Y(q.y)} stroke={sel ? "hsl(var(--accent-gold))" : "transparent"} strokeWidth={sel ? 3 : 1} />
                {!session && ok && editable && (
                  <line x1={X(p.x)} y1={Y(p.y)} x2={X(q.x)} y2={Y(q.y)} stroke="transparent" strokeWidth={14} style={{ cursor: "pointer" }}
                    onPointerDown={(e) => { e.stopPropagation(); setEdge(i); }} />
                )}
              </g>
            );
          })}
          {session && <text x={W - 6} y={14} textAnchor="end" fontSize={11} fill="hsl(var(--ink))">{fmt(session.angle, 1)}° (Δ {fmt(session.angle - storedAngle, 1)}°)</text>}
        </svg>
      )}
      {fr?.error && <div className="text-[10px]" style={{ color: "hsl(var(--destructive))" }}>{fr.error}</div>}
      {!session ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" disabled={!editable || edge === null || !frame} onClick={() => setSession({ angle: storedAngle })}
            className="h-7 rounded-md border px-2.5 text-[11px] font-medium disabled:opacity-40" style={fieldStyle}>Neigen</button>
          {stored && <button type="button" disabled={!editable} onClick={reset} className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] disabled:opacity-40" style={fieldStyle}><RotateCcw size={12} /> Neigung zurücksetzen</button>}
          {stored && <span className="text-[10px] text-muted-foreground">{fmt(stored.angleDeg, 1)}°</span>}
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input type="range" min={-85} max={85} step={0.5} value={session.angle} onChange={(e) => setSession({ angle: snapTiltAngle(+e.target.value) })} className="flex-1" />
            <input type="text" inputMode="decimal" key={session.angle} defaultValue={fmt(session.angle, 1)}
              onBlur={(e) => { const v = parse(e.target.value); if (v !== null) setSession({ angle: Math.max(-85, Math.min(85, v)) }); }}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { const v = parse((e.target as HTMLInputElement).value); if (v !== null) setSession({ angle: Math.max(-85, Math.min(85, v)) }); } }}
              className="h-7 w-14 rounded-md border px-1 text-[11px] tabular-nums" style={fieldStyle} />
            <span className="text-[10px]">°</span>
          </div>
          <div className="flex gap-1.5">
            <button type="button" onClick={commit} className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border text-[11px] font-medium" style={{ ...fieldStyle, background: "hsl(var(--accent-gold))", color: "hsl(var(--surface))" }}><Check size={13} /> Übernehmen</button>
            <button type="button" onClick={cancel} className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border text-[11px]" style={fieldStyle}><XIcon size={13} /> Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
};
