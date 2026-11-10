import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Undo2, Redo2, Copy, ClipboardPaste, CopyPlus, Trash2, X, FileStack, Wrench, SlidersHorizontal,
  Layers, MoreHorizontal, Pencil, MousePointerSquareDashed, BringToFront, SendToBack, Crosshair, Presentation,
  HelpCircle, Tablet, RotateCcw, Move,
} from "lucide-react";
import type { CadApp } from "@/cad/CadApp";
import { phonePanelStore, usePhonePanel, readWheelScale, writeWheelScale, resetWheelPosition, WHEEL_MIN, WHEEL_MAX, type PhonePanel } from "@/lib/phoneLayout";

type Mode = "cad" | "3d" | "export";
export interface MobileShellProps {
  projectId?: string; projectName?: string; mode: Mode; app: CadApp | null;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  canCopy: boolean; onCopy: () => void; canPaste: boolean; onPaste: () => void;
  multiPasteActive: boolean; onMultiPaste: () => void; onStopMultiPaste: () => void;
  canDelete: boolean; onDelete: () => void; onCenterView: () => void; onPresent: () => void;
  helpOn: boolean; onToggleHelp: () => void; tabletAidOn: boolean; onToggleTabletAid: () => void;
}

const NAV_H = 58;
const TITLES: Record<Exclude<PhonePanel, null>, string> = { pages: "Seiten", tools: "Werkzeuge", props: "Eigenschaften", layers: "Ebenen", more: "Mehr" };

/** Verhindert, dass Tipps auf Bedienelemente als Zeichengeste auf der Fläche landen. */
const shield = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onTouchStart: (e: React.TouchEvent) => e.stopPropagation() };

function useViewport() {
  const [vp, setVp] = useState(() => ({ h: window.visualViewport?.height ?? window.innerHeight, kb: 0 }));
  useEffect(() => {
    const on = () => {
      const vv = window.visualViewport;
      const h = vv?.height ?? window.innerHeight;
      const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      setVp({ h, kb });
    };
    on();
    window.visualViewport?.addEventListener("resize", on);
    window.addEventListener("resize", on);
    return () => { window.visualViewport?.removeEventListener("resize", on); window.removeEventListener("resize", on); };
  }, []);
  return vp;
}

export function MobileShell(p: MobileShellProps) {
  const navigate = useNavigate();
  const [panel, snap] = usePhonePanel();
  const vp = useViewport();
  const [editOpen, setEditOpen] = useState(false);
  const [dragH, setDragH] = useState<number | null>(null);
  const landscape = window.innerWidth > window.innerHeight;
  const headerH = 92;
  const halfH = Math.round((vp.h - NAV_H) * (landscape ? 0.62 : 0.46));
  const fullH = Math.max(halfH, Math.round(vp.h - headerH - NAV_H - 8));
  const sheetH = panel ? (dragH ?? (snap === "full" ? fullH : halfH)) : 0;
  const keyboardOpen = vp.kb > 80;
  const bottom = keyboardOpen ? vp.kb : NAV_H;

  // CSS-Variablen + Datenattribute: die vorhandenen Leisten werden per CSS zum Bedienfenster.
  useEffect(() => {
    const b = document.body, r = document.documentElement;
    b.dataset.phone = "1";
    b.dataset.phoneMode = p.mode;
    if (panel) b.dataset.phonePanel = panel; else delete b.dataset.phonePanel;
    r.style.setProperty("--phone-sheet-h", `${sheetH}px`);
    r.style.setProperty("--phone-sheet-bottom", `${bottom}px`);
    r.style.setProperty("--phone-bottom-reserve", `${NAV_H + sheetH}px`);
    window.dispatchEvent(new Event("pixuna-phone-layout"));
  }, [panel, sheetH, bottom, p.mode]);
  useEffect(() => () => {
    const b = document.body, r = document.documentElement;
    delete b.dataset.phone; delete b.dataset.phoneMode; delete b.dataset.phonePanel;
    ["--phone-sheet-h", "--phone-sheet-bottom", "--phone-bottom-reserve"].forEach((k) => r.style.removeProperty(k));
    phonePanelStore.set(null);
  }, []);
  useEffect(() => { requestAnimationFrame(() => p.app?.resize?.()); }, [panel, p.app]);

  // Werkzeugwahl: Zeichenwerkzeug gewählt → Fenster fährt zurück (bleibt markiert).
  useEffect(() => {
    if (panel !== "tools") return;
    const rail = document.querySelector(".cad-tool-rail");
    if (!rail || !p.app) return;
    const onClick = () => {
      const before = (p.app as any).activeTool;
      window.setTimeout(() => {
        const now = (p.app as any)?.activeTool;
        if (now && now !== before && now !== (p.app as any).selectTool) phonePanelStore.set(null);
      }, 0);
    };
    rail.addEventListener("click", onClick, true);
    return () => rail.removeEventListener("click", onClick, true);
  }, [panel, p.app]);

  // Eingabefeld bei Tastatur in den sichtbaren Bereich holen.
  useEffect(() => {
    const on = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (!t?.matches?.("input,textarea,select,[contenteditable=true]")) return;
      window.setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
    };
    document.addEventListener("focusin", on);
    return () => document.removeEventListener("focusin", on);
  }, []);

  // Ziehgriff: nur der Griff verändert die Höhe, Inhalte scrollen unabhängig.
  const drag = useRef<{ id: number; y0: number; h0: number; moved: boolean } | null>(null);
  const onGripDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, y0: e.clientY, h0: sheetH, moved: false };
  };
  const onGripMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const dy = d.y0 - e.clientY; if (Math.abs(dy) > 4) d.moved = true;
    setDragH(Math.max(60, Math.min(fullH, d.h0 + dy)));
  };
  const endGrip = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    if (!d) return;
    const h = dragH ?? d.h0; setDragH(null);
    if (!d.moved) { phonePanelStore.setSnap(snap === "full" ? "half" : "full"); return; }
    if (h < halfH * 0.55) phonePanelStore.set(null);
    else phonePanelStore.setSnap(h > (halfH + fullH) / 2 ? "full" : "half");
  };
  const cancelGrip = () => { drag.current = null; setDragH(null); };

  const go = (m: Mode) => p.projectId && navigate(`/project/${p.projectId}/${m}`);
  const showEdit = editOpen || p.canDelete || p.multiPasteActive;
  const navItems: { id: Exclude<PhonePanel, null>; label: string; Icon: any }[] = [
    { id: "pages", label: "Seiten", Icon: FileStack },
    { id: "tools", label: "Werkzeuge", Icon: Wrench },
    { id: "props", label: "Eigenschaften", Icon: SlidersHorizontal },
    { id: "layers", label: "Ebenen", Icon: Layers },
    { id: "more", label: "Mehr", Icon: MoreHorizontal },
  ];
  const availableNav = navItems.filter((n) => !(p.mode === "3d" && (n.id === "tools" || n.id === "pages" || n.id === "layers")));

  return (
    <>
      <header {...shield} className="phone-header shrink-0 border-b" style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))", paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex h-11 items-center gap-1 px-1.5">
          <IconBtn label="Zurück zur Projektübersicht" onClick={() => navigate("/")}><ArrowLeft size={18} /></IconBtn>
          <div className="min-w-0 flex-1 truncate text-sm font-semibold" title={p.projectName}>{p.projectName || "Projekt"}</div>
          <IconBtn label="Rückgängig" disabled={!p.canUndo} onClick={p.onUndo}><Undo2 size={17} /></IconBtn>
          <IconBtn label="Wiederholen" disabled={!p.canRedo} onClick={p.onRedo}><Redo2 size={17} /></IconBtn>
          <IconBtn label="Bearbeiten" active={showEdit} onClick={() => setEditOpen((v) => !v)}><Pencil size={16} /></IconBtn>
        </div>
        <div className="grid grid-cols-3 gap-1 px-2 pb-1.5">
          {(["cad", "3d", "export"] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => go(m)} className="h-8 rounded-md text-xs font-semibold"
              style={{ background: p.mode === m ? "hsl(var(--accent-gold) / 0.18)" : "hsl(var(--surface-muted))", color: p.mode === m ? "hsl(var(--accent-gold))" : "hsl(var(--ink-soft))", border: `1px solid ${p.mode === m ? "hsl(var(--accent-gold) / 0.6)" : "transparent"}` }}>
              {m === "cad" ? "CAD" : m === "3d" ? "3D" : "Export"}
            </button>
          ))}
        </div>
      </header>

      {showEdit && p.mode !== "3d" && (
        <div {...shield} className="phone-editbar fixed left-1/2 z-[80] flex -translate-x-1/2 items-center gap-1 rounded-xl border p-1 shadow-lg"
          style={{ top: `calc(${headerH + 8}px + env(safe-area-inset-top, 0px))`, background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
          <IconBtn label="Kopieren" disabled={!p.canCopy} onClick={p.onCopy}><Copy size={16} /></IconBtn>
          <IconBtn label="Einfügen" disabled={!p.canPaste} onClick={p.onPaste}><ClipboardPaste size={16} /></IconBtn>
          <IconBtn label={p.multiPasteActive ? "Mehrfach einfügen beenden" : "Mehrfach einfügen"} active={p.multiPasteActive} disabled={!p.canPaste && !p.multiPasteActive}
            onClick={p.multiPasteActive ? p.onStopMultiPaste : p.onMultiPaste}><CopyPlus size={16} /></IconBtn>
          <IconBtn label="Auswahl löschen" disabled={!p.canDelete} onClick={p.onDelete}><Trash2 size={16} /></IconBtn>
          {p.multiPasteActive && <span className="px-1.5 text-[11px] font-semibold" style={{ color: "hsl(var(--accent-gold))" }}>Mehrfach aktiv</span>}
        </div>
      )}

      {panel && (
        <div {...shield} className="phone-sheet-chrome fixed inset-x-0 z-[75] rounded-t-2xl border-t"
          style={{ bottom: `calc(var(--phone-sheet-bottom) + var(--phone-sheet-h) - 48px)`, height: 48, background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))", boxShadow: "0 -8px 24px rgba(0,0,0,0.18)" }}>
          <div onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={endGrip} onPointerCancel={cancelGrip} onLostPointerCapture={() => { if (drag.current) cancelGrip(); }}
            className="absolute inset-x-0 top-0 h-6 cursor-ns-resize" style={{ touchAction: "none" }} aria-label="Bedienfenster vergrößern oder verkleinern">
            <div className="mx-auto mt-2 h-1.5 w-11 rounded-full" style={{ background: "hsl(var(--ink-soft) / 0.45)" }} />
          </div>
          <div className="flex h-full items-end justify-between px-3 pb-1.5">
            <span className="text-sm font-semibold">{TITLES[panel]}</span>
            <IconBtn label="Schließen" onClick={() => phonePanelStore.set(null)}><X size={16} /></IconBtn>
          </div>
        </div>
      )}

      {panel === "more" && (
        <div {...shield} className="phone-sheet-body fixed inset-x-0 z-[75] overflow-y-auto overscroll-contain px-3 pb-4 text-sm"
          style={{ bottom: "var(--phone-sheet-bottom)", height: "calc(var(--phone-sheet-h) - 48px)", background: "hsl(var(--surface-card))" }}>
          <MoreContent {...p} />
        </div>
      )}

      <nav {...shield} className="phone-bottom-nav fixed inset-x-0 bottom-0 z-[78] grid border-t"
        style={{ gridTemplateColumns: `repeat(${availableNav.length}, 1fr)`, height: `calc(${NAV_H}px + env(safe-area-inset-bottom, 0px))`, paddingBottom: "env(safe-area-inset-bottom, 0px)", background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
        {availableNav.map(({ id, label, Icon }) => {
          const on = panel === id;
          return (
            <button key={id} type="button" onClick={() => phonePanelStore.toggle(id)} aria-pressed={on}
              className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium"
              style={{ color: on ? "hsl(var(--accent-gold))" : "hsl(var(--ink-soft))" }}>
              <Icon size={19} /><span className="truncate max-w-full px-0.5">{label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

function MoreContent(p: MobileShellProps) {
  const app = p.app;
  const [scale, setScale] = useState(readWheelScale);
  const [, force] = useState(0);
  const stack = (dir: "front" | "back") => { app?.moveSelectionStack(dir); force((n) => n + 1); };
  const row = "flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left disabled:opacity-40";
  return (
    <div className="space-y-4 pt-1">
      <Section title="Auswahl">
        <button className={row} disabled={p.mode === "3d"} onClick={() => { app?.selectAllInActiveCadPlan(); force((n) => n + 1); }}><MousePointerSquareDashed size={17} />Alles auswählen</button>
        <button className={row} disabled={p.mode === "3d"} onClick={() => phonePanelStore.set("props")}><SlidersHorizontal size={17} />Auswahlfilter (in Eigenschaften)</button>
        <button className={row} disabled={!app?.canMoveSelectionStack("front")} onClick={() => stack("front")}><BringToFront size={17} />In den Vordergrund</button>
        <button className={row} disabled={!app?.canMoveSelectionStack("back")} onClick={() => stack("back")}><SendToBack size={17} />In den Hintergrund</button>
      </Section>
      <Section title="Ansicht">
        <button className={row} onClick={() => { p.onCenterView(); phonePanelStore.set(null); }}><Crosshair size={17} />Ansicht zentrieren</button>
        <button className={row} onClick={() => { phonePanelStore.set(null); p.onPresent(); }}><Presentation size={17} />Präsentationsmodus</button>
        <button className={row} onClick={p.onToggleHelp}><HelpCircle size={17} />Hilfe {p.helpOn ? "ausblenden" : "einblenden"}</button>
      </Section>
      <Section title="Bedienung · Hilfsrad">
        <button className={row} onClick={p.onToggleTabletAid}><Tablet size={17} />Hilfsrad {p.tabletAidOn ? "ausblenden" : "einblenden"}</button>
        <div className="px-2 py-1">
          <div className="mb-1 flex justify-between text-xs"><span>Größe</span><span className="tabular-nums font-semibold" style={{ color: "hsl(var(--accent-gold))" }}>{Math.round(scale * 100)} %</span></div>
          <input type="range" min={WHEEL_MIN * 100} max={WHEEL_MAX * 100} step={5} value={Math.round(scale * 100)} className="w-full accent-primary"
            onChange={(e) => { const v = Number(e.target.value) / 100; setScale(v); writeWheelScale(v); }} aria-label="Größe des Hilfsrads" />
        </div>
        <button className={row} onClick={() => { setScale(1); writeWheelScale(1); }}><RotateCcw size={17} />Größe zurücksetzen</button>
        <button className={row} onClick={resetWheelPosition}><Move size={17} />Position zurücksetzen</button>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--ink-soft))" }}>{title}</div>
      <div className="rounded-xl border" style={{ borderColor: "hsl(var(--hairline))" }}>{children}</div>
    </section>
  );
}

function IconBtn({ label, onClick, disabled, active, children }: { label: string; onClick?: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg disabled:opacity-35"
      style={{ color: active ? "hsl(var(--accent-gold))" : "hsl(var(--ink))", background: active ? "hsl(var(--accent-gold) / 0.15)" : "transparent" }}>
      {children}
    </button>
  );
}
