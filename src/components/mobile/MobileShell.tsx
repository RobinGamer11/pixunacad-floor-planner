import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Undo2, Redo2, Copy, ClipboardPaste, CopyPlus, Trash2, X, FileStack, Wrench, SlidersHorizontal,
  Layers, MoreHorizontal, Pencil, MousePointerSquareDashed, BringToFront, SendToBack, Crosshair, Presentation,
  HelpCircle, Tablet, RotateCcw, Move, Eye, EyeOff, FileText, DraftingCompass, Box, Printer, Plus,
} from "lucide-react";
import type { CadApp } from "@/cad/CadApp";
import { phonePanelStore, usePhonePanel, readWheelScale, writeWheelScale, resetWheelPosition, wheelScaleToPercent, wheelPercentToScale, type PhonePanel } from "@/lib/phoneLayout";

import { Button } from "@/components/ui/button";
import { WorkspaceSaveStatus } from "@/components/workspace/WorkspaceSaveStatus";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CommentModeButton } from "@/components/comments/CommentLayerUi";
import { StackOrderButtons } from "@/components/cad/StackOrderButtons";
import { PhoneSelectionButton } from "@/components/mobile/PhoneSelectionButton";

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

/** Sichtbare Inhaltsbereiche des Bedienfensters (eigene oder per CSS eingeblendete Leisten). */
function phoneScrollRoots(): HTMLElement[] {
  const panel = document.body.dataset.phonePanel;
  if (!panel) return [];
  const sel = [".phone-sheet-body", ".w3d-panel", ".w3d-right-tools", ".cad-settings-sidebar"].join(",");
  return Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed" && el.getClientRects().length > 0);
}
function biggestScroller(): HTMLElement | null {
  let best: HTMLElement | null = null, area = 0;
  for (const root of phoneScrollRoots()) {
    for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]) {
      if (el.scrollHeight <= el.clientHeight + 4) continue;
      const oy = getComputedStyle(el).overflowY;
      if (oy !== "auto" && oy !== "scroll") continue;
      const a = el.clientWidth * el.clientHeight;
      if (a > area) { area = a; best = el; }
    }
  }
  return best;
}
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
  const [exportOpen, setExportOpen] = useState(false);
  useEffect(() => { if (p.mode !== "export" || panel) setExportOpen(false); }, [p.mode, panel]);
  useEffect(() => { if (exportOpen) document.body.dataset.phoneExport = "1"; else delete document.body.dataset.phoneExport; return () => { delete document.body.dataset.phoneExport; }; }, [exportOpen]);
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

  // Scrollposition je Bereich merken (flüchtig, pro Ansicht).
  const scrollMem = useRef(new Map<string, number>());
  useEffect(() => {
    if (!panel) return;
    const key = `${p.mode}:${panel}`;
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLElement && phoneScrollRoots().some((r) => r === t || r.contains(t))) scrollMem.current.set(key, t.scrollTop);
    };
    document.addEventListener("scroll", onScroll, true);
    const want = scrollMem.current.get(key) ?? 0;
    let n = 0;
    const restore = () => {
      const el = biggestScroller();
      if (el) el.scrollTop = want;
      if (++n < 6 && el && Math.abs(el.scrollTop - want) > 2) requestAnimationFrame(restore);
    };
    requestAnimationFrame(() => requestAnimationFrame(restore));
    return () => document.removeEventListener("scroll", onScroll, true);
  }, [panel, p.mode]);

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
  const grip = useRef<HTMLDivElement | null>(null);
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
  const cancelGrip = () => {
    const d = drag.current; drag.current = null; setDragH(null);
    if (d) { try { grip.current?.releasePointerCapture(d.id); } catch {} }
  };
  const closeSheet = () => { cancelGrip(); phonePanelStore.set(null); };
  useEffect(() => { if (!panel) cancelGrip(); }, [panel]);

  const go = (m: Mode) => p.projectId && navigate(`/project/${p.projectId}/${m}`);
  const showEdit = editOpen || p.canDelete || p.multiPasteActive;
  const navItems: { id: Exclude<PhonePanel, null>; label: string; Icon: any }[] = [
    { id: "pages", label: "Seiten", Icon: FileStack },
    { id: "props", label: "Eigenschaften", Icon: SlidersHorizontal },
    { id: "tools", label: "Werkzeuge", Icon: Wrench },
    { id: "layers", label: "Ebenen", Icon: Layers },
    { id: "more", label: "Mehr", Icon: MoreHorizontal },
  ];
  const availableNav = (p.mode === "3d" ? navItems.map((n) => n.id === "pages" ? { ...n, label: "Blätter" } : n) : navItems)
    .filter((n) => !(p.mode === "3d" && n.id === "tools"));

  return (
    <>
      <header {...shield} className="phone-header shrink-0 border-b" style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))", paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex h-11 items-center gap-1 px-1.5">
          <IconBtn label="Zurück zur Projektübersicht" onClick={() => navigate("/")}><ArrowLeft size={18} /></IconBtn>
          <div className="min-w-0 flex-1 truncate text-sm font-semibold" title={p.projectName}>{p.projectName || "Projekt"}</div>
          <IconBtn label="Rückgängig" disabled={!p.canUndo} onClick={p.onUndo}><Undo2 size={17} /></IconBtn>
          <IconBtn label="Wiederholen" disabled={!p.canRedo} onClick={p.onRedo}><Redo2 size={17} /></IconBtn>
          <WorkspaceSaveStatus key={p.projectId} projectId={p.projectId} />
          {p.mode === "export" && <Button variant="outline" aria-label="Bearbeiten" aria-pressed={showEdit} className="phone-edit-toggle px-2" onClick={() => setEditOpen(v => !v)}><Pencil /><span className="hidden min-[440px]:inline">Bearbeiten</span></Button>}
        </div>
        <div className="phone-mode-group mx-2 mb-1.5 grid grid-cols-3 gap-1 rounded-md p-1">
          {(["cad", "3d", "export"] as Mode[]).map(m => {
            const Icon = m === "cad" ? DraftingCompass : m === "3d" ? Box : Printer;
            return <Button key={m} variant="ghost" aria-pressed={p.mode === m} onClick={() => go(m)} className="phone-mode-button h-9 gap-1 px-1 text-xs border"><Icon />{m === "cad" ? "CAD" : m === "3d" ? "3D" : "Export"}</Button>;
          })}
        </div>
      </header>

      {showEdit && p.mode === "export" && (
        <div {...shield} className="phone-editbar fixed left-1/2 z-[80] flex max-w-[calc(100vw-112px)] -translate-x-1/2 items-center gap-1 rounded-lg border p-1 shadow-lg"
          style={{ top: `calc(${headerH + 8}px + env(safe-area-inset-top, 0px))`, background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
          <IconBtn label="Kopieren" disabled={!p.canCopy} onClick={p.onCopy}><Copy size={16} /></IconBtn>
          <IconBtn label="Einfügen" disabled={!p.canPaste} onClick={p.onPaste}><ClipboardPaste size={16} /></IconBtn>
          <IconBtn label={p.multiPasteActive ? "Mehrfach einfügen beenden" : "Mehrfach einfügen"} active={p.multiPasteActive} disabled={!p.canPaste && !p.multiPasteActive}
            onClick={p.multiPasteActive ? p.onStopMultiPaste : p.onMultiPaste}><CopyPlus size={16} /></IconBtn>
          <IconBtn label="Auswahl löschen" disabled={!p.canDelete} onClick={p.onDelete}><Trash2 size={16} /></IconBtn>

        </div>
      )}

      {panel && (
        <div {...shield} className="phone-sheet-chrome fixed inset-x-0 z-[75] rounded-t-2xl border-t"
          style={{ bottom: `calc(var(--phone-sheet-bottom) + var(--phone-sheet-h) - 48px)`, height: 48, background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))", boxShadow: "0 -8px 24px rgba(0,0,0,0.18)" }}>
          <div ref={grip} onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={endGrip} onPointerCancel={cancelGrip} onLostPointerCapture={() => { if (drag.current) cancelGrip(); }}
            className="absolute left-20 right-14 top-0 h-6 cursor-ns-resize" style={{ touchAction: "none" }} aria-label="Bedienfenster vergrößern oder verkleinern">
            <div className="mx-auto mt-2 h-1.5 w-11 rounded-full" style={{ background: "hsl(var(--ink-soft) / 0.45)" }} />
          </div>
          <div className="pointer-events-none flex h-full items-end justify-between px-3 pb-1.5">
            <span className="text-sm font-semibold">{TITLES[panel]}</span>
            <div className="pointer-events-auto"><IconBtn label="Schließen" onClick={closeSheet}><X size={16} /></IconBtn></div>
          </div>
        </div>
      )}

      {(panel === "tools" && p.mode !== "3d") || (panel === "layers" && p.mode === "3d") ? (
        <div {...shield} data-phone-scroll={panel} className="phone-sheet-body fixed inset-x-0 z-[76] overflow-y-auto overscroll-contain px-3 pb-4 text-sm"
          style={{ bottom: "var(--phone-sheet-bottom)", height: "calc(var(--phone-sheet-h) - 48px)", background: "hsl(var(--surface-card))" }}>
          {panel === "tools" ? <ToolsContent /> : <LayersContent3D app={p.app} />}
        </div>
      ) : null}

      {panel === "more" && (
        <div {...shield} data-phone-scroll="more" className="phone-sheet-body fixed inset-x-0 z-[75] overflow-y-auto overscroll-contain px-3 pb-4 text-sm"
          style={{ bottom: "var(--phone-sheet-bottom)", height: "calc(var(--phone-sheet-h) - 48px)", background: "hsl(var(--surface-card))" }}>
          <MoreContent {...p} />
        </div>
      )}

      {p.mode === "export" && (
        <div {...shield} className="phone-cad-actions fixed inset-x-3 z-[65] flex items-center gap-2 overflow-x-auto" style={{ top: `calc(${headerH + 12}px + env(safe-area-inset-top, 0px))` }}>
          <Button variant="outline" className="phone-canvas-fab phone-export-fab shrink-0" aria-label="Exportfenster" title="Exportfenster" aria-pressed={exportOpen}
            onClick={() => { phonePanelStore.set(null); setExportOpen(v => !v); }}><Plus /><Printer /></Button>
          <PhoneSelectionButton app={p.app} />
          <StackOrderButtons getApp={() => p.app as any} />
          <CommentModeButton disabled={!p.projectId} />
        </div>
      )}

      {p.mode === "cad" && (
        <div {...shield} className="phone-cad-actions fixed inset-x-3 z-[65] flex items-center gap-2 overflow-x-auto" style={{ top: `calc(${headerH + 12}px + env(safe-area-inset-top, 0px))` }}>
          <CommentModeButton disabled={!p.projectId} />
          <PhoneSelectionButton app={p.app} />
          <StackOrderButtons getApp={() => p.app as any} />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="phone-canvas-fab shrink-0" aria-label="Kopieren und Einfügen" title="Kopieren und Einfügen" aria-pressed={p.multiPasteActive}><Copy /></Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="z-[100] w-auto space-y-1 p-1" onPointerDown={e => e.stopPropagation()}>
              <Button variant="ghost" className="w-full justify-start" disabled={!p.canCopy} onClick={p.onCopy}><Copy />Kopieren</Button>
              <Button variant="ghost" className="w-full justify-start" disabled={!p.canPaste} onClick={p.onPaste}><ClipboardPaste />Einfügen</Button>
              <Button variant="ghost" className="w-full justify-start" aria-pressed={p.multiPasteActive} disabled={!p.canPaste && !p.multiPasteActive}
                onClick={p.multiPasteActive ? p.onStopMultiPaste : p.onMultiPaste}><CopyPlus />{p.multiPasteActive ? "Mehrfach einfügen beenden" : "Mehrfach einfügen"}</Button>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" className="phone-canvas-fab shrink-0" aria-label="Auswahl löschen" title="Auswahl löschen" disabled={!p.canDelete} onClick={p.onDelete}><Trash2 /></Button>
          <Button variant="outline" size="icon" className="phone-canvas-fab ml-auto shrink-0" aria-label="Ansicht zentrieren" title="Ansicht zentrieren" onClick={p.onCenterView}><Crosshair /></Button>
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


/* ── Werkzeuge: Gruppen, Beschriftung, „Zuletzt verwendet“ ──
 * Kacheln steuern die vorhandenen Leistenknöpfe (kein zweiter Werkzeugzustand). */
const RECENT_KEY = "pixuna.phone.recentTools";
const GROUPS: { title: string; names: string[] }[] = [
  { title: "Zeichnen", names: ["Wand", "Türen/Fenster", "Treppe", "Polygon", "Linie", "Freihand", "Schraffur", "Text", "Bibliothek", "Dokument"] },
  { title: "Bearbeiten", names: ["Auswahl", "Radierer", "Pipette", "Cutter"] },
  { title: "Messen", names: ["Maßkette", "Lineal"] },
  { title: "Helfen", names: ["Raster"] },
];
const ALIAS: Record<string, string> = { "Radiergummi": "Radierer", "Raster-Einstellungen": "Raster" };
type RailTool = { name: string; svg: string; active: boolean; el: HTMLButtonElement };
export function railToolName(el: HTMLElement): string {
  const raw = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").split(/ \(| —/)[0].trim();
  return ALIAS[raw] ?? raw;
}
function readRail(): RailTool[] {
  const out: RailTool[] = [];
  document.querySelectorAll<HTMLButtonElement>(".cad-tool-rail .cad-rail-btn").forEach((el) => {
    const name = railToolName(el);
    if (!name || out.some((t) => t.name === name)) return;
    out.push({ name, svg: el.querySelector("svg")?.outerHTML ?? "", active: el.classList.contains("active"), el });
  });
  return out;
}
export function readRecent(): string[] { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 4) : []; } catch { return []; } }
export function pushRecent(list: string[], name: string): string[] { return [name, ...list.filter((n) => n !== name)].slice(0, 4); }

function ToolsContent() {
  const [tools, setTools] = useState<RailTool[]>(readRail);
  const [recent, setRecent] = useState<string[]>(readRecent);
  useEffect(() => {
    const rail = document.querySelector(".cad-tool-rail");
    if (!rail) return;
    const mo = new MutationObserver(() => setTools(readRail()));
    mo.observe(rail, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
    return () => mo.disconnect();
  }, []);
  const use = (t: RailTool) => {
    const next = pushRecent(recent, t.name); setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
    t.el.click();
  };
  const known = new Set(GROUPS.flatMap((g) => g.names));
  const groups = GROUPS.map((g) => ({ title: g.title, items: g.names.map((n) => tools.find((t) => t.name === n)).filter(Boolean) as RailTool[] }));
  const rest = tools.filter((t) => !known.has(t.name));
  if (rest.length) groups[3].items.push(...rest);
  const recentTools = recent.map((n) => tools.find((t) => t.name === n)).filter(Boolean) as RailTool[];
  const Tile = ({ t }: { t: RailTool }) => (
    <button type="button" onClick={() => use(t)} aria-pressed={t.active}
      className="flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-[11px] font-medium leading-tight"
      style={{ borderColor: t.active ? "hsl(var(--accent-gold) / 0.7)" : "hsl(var(--hairline))", background: t.active ? "hsl(var(--accent-gold) / 0.15)" : "hsl(var(--surface-muted))", color: t.active ? "hsl(var(--accent-gold))" : "hsl(var(--ink))" }}>
      <span aria-hidden className="grid h-5 place-items-center [&>svg]:h-5 [&>svg]:w-5" dangerouslySetInnerHTML={{ __html: t.svg }} />
      <span className="text-center">{t.name}</span>
    </button>
  );
  const grid = "grid grid-cols-4 gap-2";
  return (
    <div className="space-y-4 pt-1">
      {recentTools.length > 0 && (
        <div><div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--accent-gold))" }}>Zuletzt verwendet</div>
          <div className={grid}>{recentTools.map((t) => <Tile key={"r" + t.name} t={t} />)}</div></div>
      )}
      {groups.filter((g) => g.items.length).map((g) => (
        <div key={g.title}><div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--ink-soft))" }}>{g.title}</div>
          <div className={grid}>{g.items.map((t) => <Tile key={t.name} t={t} />)}</div></div>
      ))}
    </div>
  );
}

function LayersContent3D({ app }: { app: CadApp | null }) {
  const [, force] = useState(0);
  const groups = app?.labelManager.list() ?? [];
  const toggle = (id: string) => {
    if (!app) return;
    app.labelManager.toggleVisible(id);
    app.clearSelection?.();
    app.refreshLabelUI();
    force((n) => n + 1);
  };
  return (
    <div className="space-y-1 pt-1">
      <p className="px-1 pb-1 text-xs" style={{ color: "hsl(var(--ink-soft))" }}>Ausgeblendete Ebenen erscheinen nicht im 3D-Modell.</p>
      {groups.map((g) => (
        <button key={g.id} type="button" onClick={() => toggle(g.id)} aria-pressed={g.visible !== false}
          className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left"
          style={{ borderColor: "hsl(var(--hairline))", opacity: g.visible === false ? 0.5 : 1 }}>
          {g.visible === false ? <EyeOff size={17} /> : <Eye size={17} style={{ color: "hsl(var(--accent-gold))" }} />}
          <span className="flex-1 truncate">{g.name}</span>
        </button>
      ))}
    </div>
  );
}

function MoreContent(p: MobileShellProps) {
  const app = p.app;
  const [scale, setScale] = useState(readWheelScale);
  useEffect(() => { const on = () => setScale(readWheelScale()); window.addEventListener("pixuna-wheel-settings", on); return () => window.removeEventListener("pixuna-wheel-settings", on); }, []);
  const tile = "phone-action-tile";
  return (
    <div className="space-y-4 pt-1">
      {p.mode === "3d" && <Section title="3D"><div className="grid grid-cols-3 gap-2"><Button variant="outline" className={tile} onClick={() => { phonePanelStore.set(null); window.dispatchEvent(new CustomEvent("pixuna-3d-open", { detail: "dossier" })); }}><FileText />Render-Dossier</Button></div></Section>}
      <Section title="Ansicht"><div className="grid grid-cols-3 gap-2">
        <Button variant="outline" className={tile} onClick={() => { phonePanelStore.set(null); p.onPresent(); }}><Presentation />Präsentation</Button>
        <Button variant="outline" className={tile} aria-pressed={p.helpOn} onClick={p.onToggleHelp}><HelpCircle />Hilfe {p.helpOn ? "ausblenden" : "einblenden"}</Button>
      </div></Section>
      <Section title="Bedienung · Hilfsrad"><div className="grid grid-cols-3 gap-2">
        <Button variant="outline" className={tile} aria-pressed={p.tabletAidOn} onClick={p.onToggleTabletAid}><Tablet />Hilfsrad</Button>
        <Button variant="outline" className={tile} onClick={() => { setScale(1); writeWheelScale(1); }}><RotateCcw />Größe zurücksetzen</Button>
        <Button variant="outline" className={tile} onClick={resetWheelPosition}><Move />Position zurücksetzen</Button>
      </div>
        <div className="px-2 py-1">
          <div className="mb-1 flex justify-between text-xs"><span>Größe</span><span className="tabular-nums font-semibold" style={{ color: "hsl(var(--accent-gold))" }}>{wheelScaleToPercent(scale)} %</span></div>
          <input type="range" min={0} max={100} step={1} value={wheelScaleToPercent(scale)} className="w-full accent-primary"
            onChange={(e) => { const v = wheelPercentToScale(Number(e.target.value)); setScale(v); writeWheelScale(v); }} aria-label="Größe des Hilfsrads" />
        </div>

      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--ink-soft))" }}>{title}</div>
      <div>{children}</div>
    </section>
  );
}

function IconBtn({ label, onClick, disabled, active, children }: { label: string; onClick?: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  const edit = ["Kopieren", "Einfügen", "Mehrfach einfügen", "Mehrfach einfügen beenden", "Auswahl löschen"].includes(label);
  return <Button variant="outline" type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} aria-pressed={active}
    className={edit ? "phone-action-tile min-w-0 flex-1 px-1" : "h-10 w-10 shrink-0 p-0"}>
    {children}{edit && <span>{label.startsWith("Mehrfach") ? "Mehrfach" : label === "Auswahl löschen" ? "Löschen" : label}</span>}
  </Button>;
}
