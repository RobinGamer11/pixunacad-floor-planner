import React, { useMemo, useRef, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import { PaperFormats, getPlanPaperSize } from "@/cad/PlanManager";
import {
  buildTree, folderCheckState, orderedSelection, pagesInFolder, toggleFolder, togglePage,
  type TreeNode,
} from "@/cad/planTree";
import { OverlayMode } from "@/cad/SheetManager";
import { usePlanUi, formatLabel } from "./useExportApp";
import { ChevronDown, ChevronRight, FileText, Folder, FolderPlus, FilePlus, Download, Check, Minus, GripVertical, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getLocalCollapsed, setLocalCollapsed } from "@/lib/exportLocalState";

/**
 * Linke Exportseiten-Leiste: zeigt ausschließlich Exportordner und
 * Exportseiten (erweiterte `Plan`s). Alle Mutationen laufen über
 * `app.mutatePlans` → genau ein Verlaufsschritt. Die Exportauswahl ist
 * temporärer UI-Zustand und wird nie gespeichert.
 */
export function ExportSidebar({ app, projectId }: { app: CadApp; projectId?: string }) {
  usePlanUi(app);
  const pm = app.planManager;
  const plans = pm.list();
  const folders = pm.listFolders();
  const tree = useMemo(
    () => buildTree(folders, plans.map(p => ({ id: p.id, parentFolderId: p.parentFolderId, order: p.order }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.planUiVersion],
  );
  const activeId = app.activePlanId;

  // Auf-/Zuklappen ist lokaler Bedienzustand pro Gerät (nie Projekt/Verlauf/Cloud).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => getLocalCollapsed(projectId));
  const toggleCollapsed = (id: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    setLocalCollapsed(projectId, next);
    return next;
  });
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Drag & Drop (Pointer-basiert, tabletfähig)
  const dragRef = useRef<{ kind: "page" | "folder"; id: string; startY: number; moved: boolean } | null>(null);
  const [dropHint, setDropHint] = useState<{ targetKey: string; pos: "before" | "into" } | null>(null);

  const startSelecting = () => {
    setSelected(new Set(activeId ? [activeId] : []));
    setSelecting(true);
  };
  const ordered = orderedSelection(tree, selected);

  const doExport = async () => {
    if (ordered.length === 0) return;
    setBusy(true);
    try { await app.exportPlansByIds(ordered); setSelecting(false); }
    finally { setBusy(false); }
  };

  const addFolder = () => {
    const parent = activeFolderContext();
    app.mutatePlans(() => { pm.createFolder("Neuer Ordner", parent); });
  };
  const activeFolderContext = (): string | null => {
    const a = activeId ? pm.getById(activeId) : null;
    return a?.parentFolderId ?? null;
  };

  const onRowPointerDown = (e: React.PointerEvent, kind: "page" | "folder", id: string) => {
    if (selecting) return;
    dragRef.current = { kind, id, startY: e.clientY, moved: false };
  };
  const onListPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientY - d.startY) < 8) return;
    d.moved = true;
    const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-tree-key]") as HTMLElement | null;
    if (!el) { setDropHint(null); return; }
    const key = el.dataset.treeKey!;
    const rect = el.getBoundingClientRect();
    const isFolder = key.startsWith("folder:");
    const pos = isFolder && e.clientY > rect.top + rect.height * 0.35 ? "into" : "before";
    setDropHint({ targetKey: key, pos });
  };
  const onListPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    const hint = dropHint;
    setDropHint(null);
    if (!d || !d.moved || !hint) return;
    const [tKind, tId] = hint.targetKey.split(":") as ["page" | "folder", string];
    if (tKind === d.kind && tId === d.id) return;
    app.mutatePlans(() => {
      let parent: string | null;
      let index: number;
      if (hint.pos === "into" && tKind === "folder") {
        parent = tId; index = Number.MAX_SAFE_INTEGER;
      } else {
        const target = tKind === "page" ? pm.getById(tId) : pm.getFolder(tId);
        parent = tKind === "page" ? (target as any)?.parentFolderId ?? null : (target as any)?.parentId ?? null;
        index = (target as any)?.order ?? 0;
        // Ordnungsnummern sind dicht (0..n); beim Verschieben nach unten innerhalb desselben Eltern ausgleichen.
        const src = d.kind === "page" ? pm.getById(d.id) : pm.getFolder(d.id);
        const srcParent = d.kind === "page" ? (src as any)?.parentFolderId ?? null : (src as any)?.parentId ?? null;
        if (srcParent === parent && (src as any)?.order < index) index -= 1;
      }
      if (d.kind === "page") pm.movePage(d.id, parent, index);
      else if (!pm.moveFolder(d.id, parent, index)) toast({ title: "Ordner kann nicht in sich selbst verschoben werden." });
    });
  };

  const renderNode = (n: TreeNode): React.ReactNode => {
    if (n.kind === "folder") {
      const f = n.folder;
      const key = `folder:${f.id}`;
      const count = pagesInFolder(n).length;
      const st = folderCheckState(n, selected);
      return (
        <div key={key}>
          {dropHint?.targetKey === key && dropHint.pos === "before" && <DropLine depth={n.depth} />}
          <div
            data-tree-key={key}
            className="flex items-center gap-1.5 rounded-md cursor-pointer select-none"
            style={{
              paddingLeft: 6 + n.depth * 14, minHeight: selecting ? 44 : 32,
              background: dropHint?.targetKey === key && dropHint.pos === "into" ? "hsl(var(--accent-gold-soft))" : undefined,
            }}
            onPointerDown={(e) => onRowPointerDown(e, "folder", f.id)}
            onClick={() => {
              if (selecting) setSelected(s => toggleFolder(n, s));
            }}
            onDoubleClick={() => !selecting && setRenaming(key)}
          >
            {selecting && <BigCheck state={st} />}
            <button
              type="button"
              className="h-6 w-5 grid place-items-center"
              onClick={(e) => { e.stopPropagation(); toggleCollapsed(f.id); }}
              aria-label={collapsed.has(f.id) ? "Aufklappen" : "Zuklappen"}
            >
              {collapsed.has(f.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
            <Folder size={14} className="shrink-0" style={{ color: "hsl(var(--accent-gold))" }} />
            {renaming === key ? (
              <RenameInput initial={f.name} onDone={(v) => { setRenaming(null); if (v && v !== f.name) app.mutatePlans(() => pm.renameFolder(f.id, v)); }} />
            ) : (
              <span className="text-xs font-medium truncate flex-1">{f.name}</span>
            )}
            <span className="text-[10px] text-muted-foreground pr-1">{count}</span>
            {!selecting && (
              <button type="button" className="h-6 w-6 grid place-items-center opacity-50 hover:opacity-100"
                title="Ordner löschen (Seiten bleiben erhalten)"
                onClick={(e) => { e.stopPropagation(); app.mutatePlans(() => pm.deleteFolder(f.id)); }}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
          {!collapsed.has(f.id) && n.children.map(renderNode)}
        </div>
      );
    }
    const p = pm.getById(n.pageId);
    if (!p) return null;
    const key = `page:${p.id}`;
    const isActive = p.id === activeId;
    const size = getPlanPaperSize(p);
    return (
      <div key={key}>
        {dropHint?.targetKey === key && <DropLine depth={n.depth} />}
        <div
          data-tree-key={key}
          className="flex items-center gap-1.5 rounded-md cursor-pointer select-none"
          style={{
            paddingLeft: 6 + n.depth * 14 + 20, minHeight: selecting ? 44 : 32,
            background: isActive ? "hsl(var(--accent-gold-soft))" : undefined,
            outline: isActive ? "1px solid hsl(var(--accent-gold))" : undefined,
          }}
          onPointerDown={(e) => onRowPointerDown(e, "page", p.id)}
          onClick={() => {
            if (dragRef.current?.moved) return;
            if (selecting) setSelected(s => togglePage(p.id, s));
            else app.setActivePlanId(p.id);
          }}
          onDoubleClick={() => !selecting && setRenaming(key)}
        >
          {selecting && <BigCheck state={selected.has(p.id) ? "all" : "none"} />}
          {!selecting && <GripVertical size={12} className="opacity-30 shrink-0" />}
          <FileText size={14} className="shrink-0" />
          <div className="min-w-0 flex-1">
            {renaming === key ? (
              <RenameInput initial={p.name} onDone={(v) => { setRenaming(null); if (v && v !== p.name) app.mutatePlans(() => pm.renamePlan(p.id, v)); }} />
            ) : (
              <div className="text-xs truncate">{p.name}</div>
            )}
            <div className="text-[10px] text-muted-foreground truncate">
              {formatLabel(p.formatKey, p.landscape, size.width, size.height)}{p.spreadId ? " · Verbund" : ""}
            </div>
          </div>
          {!selecting && (
            <button type="button" className="h-6 w-6 grid place-items-center opacity-50 hover:opacity-100 disabled:opacity-20"
              title={pm.canDeletePlan(p.id) ? "Seite löschen" : "Die letzte Exportseite kann nicht gelöscht werden"}
              disabled={!pm.canDeletePlan(p.id)}
              onClick={(e) => {
                e.stopPropagation();
                if (!pm.canDeletePlan(p.id)) return;
                if (!window.confirm(`Exportseite „${p.name}“ löschen?`)) return;
                app.mutatePlans(() => pm.deletePlan(p.id));
              }}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <aside
      className="export-sidebar shrink-0 w-[240px] h-full flex flex-col border-r"
      style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}
    >
      <div className="p-2 space-y-2 border-b" style={{ borderColor: "hsl(var(--hairline))" }}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--ink-soft))" }}>Export</div>
        {selecting ? (
          <div className="space-y-2">
            <div className="text-[11px] text-muted-foreground">Seiten oder Ordner antippen, um sie auszuwählen.</div>
            <button
              type="button"
              disabled={ordered.length === 0 || busy}
              onClick={() => { void doExport(); }}
              className="w-full h-10 rounded-md text-xs font-semibold disabled:opacity-40"
              style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--surface))" }}
            >
              {busy ? "PDF wird erstellt …" : `${ordered.length} ${ordered.length === 1 ? "Seite" : "Seiten"} als PDF exportieren`}
            </button>
            <button type="button" onClick={() => setSelecting(false)} className="w-full h-9 rounded-md text-xs border" style={{ borderColor: "hsl(var(--hairline))" }}>
              Abbrechen
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={startSelecting}
              disabled={plans.length === 0}
              className="w-full h-10 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
              style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
            >
              <Download size={14} /> Exportieren
            </button>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => setNewPageOpen(true)} className="h-9 rounded-md text-xs border flex items-center justify-center gap-1" style={{ borderColor: "hsl(var(--hairline))" }}>
                <FilePlus size={13} /> Seite
              </button>
              <button type="button" onClick={addFolder} className="h-9 rounded-md text-xs border flex items-center justify-center gap-1" style={{ borderColor: "hsl(var(--hairline))" }}>
                <FolderPlus size={13} /> Ordner
              </button>
            </div>
          </>
        )}
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-0.5"
        style={{ touchAction: dragRef.current ? "none" : "pan-y" }}
        onPointerMove={onListPointerMove}
        onPointerUp={onListPointerUp}
        onPointerCancel={() => { dragRef.current = null; setDropHint(null); }}
      >
        {tree.length === 0 && (
          <div className="text-[11px] text-muted-foreground p-3 leading-snug">
            Noch keine Exportseiten. Lege mit „Seite“ die erste Papierseite an.
          </div>
        )}
        {tree.map(renderNode)}
      </div>

      {!selecting && <TracingPausePanel app={app} />}
      {newPageOpen && (
        <NewPageDialog
          onCancel={() => setNewPageOpen(false)}
          onCreate={(opts) => {
            setNewPageOpen(false);
            let id = "";
            const parent = activeFolderContext();
            app.mutatePlans(() => { id = pm.createPlan({ ...opts, parentFolderId: parent }).id; });
            if (id) app.setActivePlanId(id);
          }}
        />
      )}
    </aside>
  );
}

function DropLine({ depth }: { depth: number }) {
  return <div className="h-0.5 rounded" style={{ marginLeft: 6 + depth * 14, background: "hsl(var(--accent-gold))" }} />;
}

function BigCheck({ state }: { state: "none" | "all" | "partial" }) {
  return (
    <span
      className="h-6 w-6 shrink-0 rounded-md border-2 grid place-items-center"
      style={{
        borderColor: state === "none" ? "hsl(var(--hairline))" : "hsl(var(--accent-gold))",
        background: state === "none" ? "transparent" : "hsl(var(--accent-gold))",
        color: "hsl(var(--surface))",
      }}
      aria-hidden
    >
      {state === "all" && <Check size={16} />}
      {state === "partial" && <Minus size={16} />}
    </span>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (v: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => onDone(v.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(v.trim());
        if (e.key === "Escape") onDone(initial);
        e.stopPropagation();
      }}
      className="w-full text-xs px-1 py-0.5 rounded border bg-transparent"
      style={{ borderColor: "hsl(var(--hairline))" }}
    />
  );
}

export function NewPageDialog({ onCancel, onCreate }: {
  onCancel: () => void;
  onCreate: (o: { name: string; formatKey: string; landscape: boolean; freeWidth?: number; freeHeight?: number }) => void;
}) {
  const [name, setName] = useState("");
  const [formatKey, setFormatKey] = useState("a3");
  const [landscape, setLandscape] = useState(true);
  const [w, setW] = useState(297);
  const [h, setH] = useState(210);
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-foreground/30" onClick={onCancel}>
      <div className="w-[320px] rounded-lg border p-4 space-y-3 shadow-lg" style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }} onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold">Neue Exportseite</div>
        <label className="block text-xs space-y-1">
          <span>Seitentitel</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Grundriss EG" className="w-full h-8 px-2 rounded border bg-transparent" style={{ borderColor: "hsl(var(--hairline))" }} />
        </label>
        <div className="grid grid-cols-4 gap-1">
          {[...PaperFormats.map(f => ({ key: f.key, label: f.label })), { key: "free", label: "Frei" }].map(f => (
            <button key={f.key} type="button" onClick={() => setFormatKey(f.key)}
              className="h-9 rounded text-xs border"
              style={{ borderColor: formatKey === f.key ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))", background: formatKey === f.key ? "hsl(var(--accent-gold-soft))" : undefined }}>
              {f.label}
            </button>
          ))}
        </div>
        {formatKey === "free" ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label>Breite (mm)<input type="number" value={w} min={10} onChange={(e) => setW(Number(e.target.value))} className="w-full h-8 px-2 rounded border bg-transparent" style={{ borderColor: "hsl(var(--hairline))" }} /></label>
            <label>Höhe (mm)<input type="number" value={h} min={10} onChange={(e) => setH(Number(e.target.value))} className="w-full h-8 px-2 rounded border bg-transparent" style={{ borderColor: "hsl(var(--hairline))" }} /></label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {[{ v: false, l: "Hochformat" }, { v: true, l: "Querformat" }].map(o => (
              <button key={o.l} type="button" onClick={() => setLandscape(o.v)} className="h-9 rounded text-xs border"
                style={{ borderColor: landscape === o.v ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))", background: landscape === o.v ? "hsl(var(--accent-gold-soft))" : undefined }}>
                {o.l}
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="h-8 px-3 rounded text-xs border" style={{ borderColor: "hsl(var(--hairline))" }}>Abbrechen</button>
          <button type="button"
            onClick={() => onCreate({ name, formatKey, landscape: formatKey === "free" ? false : landscape, freeWidth: w, freeHeight: h })}
            className="h-8 px-3 rounded text-xs font-medium" style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--surface))" }}>
            Anlegen
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Transparenzpause: eine andere Exportseite wird als Hintergrund angezeigt.
 * Nutzt die bestehende planOverlayStore-Semantik (Zustand je Hintergrundseite),
 * wird mitgespeichert, im Verlauf erfasst und nicht gedruckt.
 */
function TracingPausePanel({ app }: { app: CadApp }) {
  const pm = app.planManager;
  const activeId = app.activePlanId;
  const others = pm.list().filter(p => p.id !== activeId);
  const store = app.planOverlayStore;
  const current = others.find(p => store.get(p.id).mode !== OverlayMode.NONE) ?? null;
  const state = current ? store.get(current.id) : null;

  const setBackground = (id: string) => {
    app.mutatePlans(() => {
      const opacity = state?.opacity;
      for (const p of others) store.setNone(p.id);
      if (id) { store.setStamp(id); if (typeof opacity === "number") store.setOpacity(id, opacity); }
    });
  };

  return (
    <div className="border-t p-2 space-y-2 text-xs" style={{ borderColor: "hsl(var(--hairline))" }}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--ink-soft))" }}>Hintergrund (Transparenzpause)</div>
      <select
        value={current?.id ?? ""}
        onChange={(e) => setBackground(e.target.value)}
        disabled={!activeId || others.length === 0}
        className="w-full h-8 px-1 rounded border bg-transparent"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        <option value="">Kein Hintergrund</option>
        {others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {current && state && (
        <>
          <label className="flex items-center gap-2">
            <span className="w-16">Deckkraft</span>
            <input type="range" min={5} max={100} value={Math.round(state.opacity * 100)}
              onChange={(e) => { store.setOpacity(current.id, Number(e.target.value) / 100); app.refreshPlanUI(); (app as any)._syncPlanTracingLayers?.(); }}
              onPointerUp={() => app.mutatePlans(() => {})}
              className="flex-1" />
          </label>
          <div className="grid grid-cols-2 gap-1">
            <button type="button" className="h-8 rounded border"
              style={{ borderColor: state.mode === OverlayMode.STAMP ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))" }}
              onClick={() => app.mutatePlans(() => store.setStamp(current.id))}>Originalfarben</button>
            <button type="button" className="h-8 rounded border"
              style={{ borderColor: state.mode === OverlayMode.TINT ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))" }}
              onClick={() => app.mutatePlans(() => store.setTint(current.id, state.color || "#3b82f6"))}>Einfärben</button>
          </div>
          {state.mode === OverlayMode.TINT && (
            <label className="flex items-center gap-2">
              <span className="w-16">Farbe</span>
              <input type="color" value={state.color || "#3b82f6"} onChange={(e) => app.mutatePlans(() => store.setTint(current.id, e.target.value))} />
            </label>
          )}
          <button type="button" className="w-full h-8 rounded border" style={{ borderColor: "hsl(var(--hairline))" }} onClick={() => setBackground("")}>
            Hintergrund ausblenden
          </button>
        </>
      )}
    </div>
  );
}
