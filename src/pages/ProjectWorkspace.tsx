import { useMemo, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  Plus,
  Type,
  Minus,
  Compass,
  FileText,
  Image as ImageIcon,
  StickyNote,
  Shapes,
  Table as TableIcon,
  Clock,
  Layers as LayersIcon,
  LayoutTemplate,
  Eye,
  Settings,
  Wrench,
  CheckSquare,
  Trash2,
  Copy,
  Undo2,
  Redo2,
  Share2,
  Play,
  Maximize2,
  Move,
} from "lucide-react";
import {
  projectStore,
  useProject,
  type PageElement,
  type ElementKind,
  type PageFormat,
} from "@/lib/projectStore";

const FORMAT_SIZES: Record<PageFormat, { w: number; h: number; label: string }> = {
  "A3-quer": { w: 420, h: 297, label: "A3 Querformat (420 × 297 mm)" },
  "A3-hoch": { w: 297, h: 420, label: "A3 Hochformat (297 × 420 mm)" },
  "A4-quer": { w: 297, h: 210, label: "A4 Querformat (297 × 210 mm)" },
  "A4-hoch": { w: 210, h: 297, label: "A4 Hochformat (210 × 297 mm)" },
  frei: { w: 400, h: 300, label: "Freies Format" },
};

export default function ProjectWorkspace() {
  const { projectId } = useParams();
  const project = useProject(projectId);
  const navigate = useNavigate();
  const [activePageId, setActivePageId] = useState<string | undefined>(project?.pages[0]?.id);
  const [selectedElementId, setSelectedElementId] = useState<string | undefined>();
  const [rightTab, setRightTab] = useState<"settings" | "tools" | "tasks">("settings");
  const [bgOverlay, setBgOverlay] = useState<{ pageId?: string; opacity: number; visible: boolean }>({
    opacity: 0.35,
    visible: true,
  });

  if (!project) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <div className="text-lg">Projekt nicht gefunden.</div>
          <button onClick={() => navigate("/")} className="mt-3 underline">
            Zurück zur Startseite
          </button>
        </div>
      </div>
    );
  }

  const activePage = project.pages.find((p) => p.id === activePageId) ?? project.pages[0];
  const selectedElement = activePage?.elements.find((e) => e.id === selectedElementId);
  const bgPage = bgOverlay.pageId ? project.pages.find((p) => p.id === bgOverlay.pageId) : undefined;

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ background: "hsl(var(--surface))", color: "hsl(var(--ink))" }}
    >
      {/* Far-left tool rail */}
      <aside
        className="flex flex-col items-center py-3 w-14 shrink-0 border-r gap-1"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        <ToolRailButton icon={<LayoutTemplate size={18} />} label="Seiten" active />
        <ToolRailButton icon={<Type size={18} />} label="Text" />
        <ToolRailButton icon={<Minus size={18} />} label="Linie" />
        <ToolRailButton
          icon={<Compass size={18} />}
          label="CAD-Zeichnen"
          onClick={() => navigate(`/project/${project.id}/cad`)}
          accent
        />
        <ToolRailButton icon={<FileText size={18} />} label="PDF einfügen" />
        <ToolRailButton icon={<ImageIcon size={18} />} label="Bild" />
        <ToolRailButton icon={<StickyNote size={18} />} label="Notiz" />
        <ToolRailButton icon={<Shapes size={18} />} label="Formen" />
        <ToolRailButton icon={<TableIcon size={18} />} label="Tabelle" />
        <ToolRailButton icon={<Clock size={18} />} label="Zeitstrahl" />
        <div className="mt-auto flex flex-col items-center gap-1">
          <ToolRailButton icon={<LayersIcon size={18} />} label="Ebenen" />
          <ToolRailButton icon={<LayoutTemplate size={18} />} label="Vorlagen" />
        </div>
      </aside>

      {/* Top header */}
      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="h-12 flex items-center justify-between px-4 border-b shrink-0"
          style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate("/")}
              className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted"
              title="Zurück zur Projektübersicht"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-sm font-semibold truncate">{project.name}</div>
            <span className="text-xs text-muted-foreground">›</span>
            <div className="text-sm truncate">{activePage?.title}</div>
            <span
              className="ml-1 text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }}
            >
              Bearbeiten
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <button className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted" title="Rückgängig">
              <Undo2 size={16} />
            </button>
            <button className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted" title="Wiederherstellen">
              <Redo2 size={16} />
            </button>
            <span className="text-xs px-2">77%</span>
            <button className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted" title="Vollbild">
              <Maximize2 size={16} />
            </button>
            <button className="h-8 px-3 rounded-md border text-sm flex items-center gap-1.5" style={{ borderColor: "hsl(var(--hairline))" }}>
              <Share2 size={14} /> Teilen
            </button>
            <button
              className="h-8 w-8 rounded-md flex items-center justify-center"
              style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }}
              title="Präsentieren"
            >
              <Play size={14} />
            </button>
            <button
              className="h-8 px-3 rounded-md text-sm font-medium"
              style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
            >
              Exportieren
            </button>
          </div>
        </header>

        <div className="flex-1 flex min-h-0">
          {/* Pages sidebar */}
          <aside
            className="w-[240px] shrink-0 border-r flex flex-col"
            style={{ borderColor: "hsl(var(--hairline))" }}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <span className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">SEITEN</span>
              <button onClick={() => projectStore.addPage(project.id)}>
                <Plus size={14} className="text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
              {project.pages.map((pg, idx) => {
                const active = pg.id === activePage?.id;
                return (
                  <button
                    key={pg.id}
                    onClick={() => {
                      setActivePageId(pg.id);
                      setSelectedElementId(undefined);
                    }}
                    className="w-full text-left rounded-lg p-2 flex gap-2.5 transition"
                    style={{
                      background: active ? "hsl(var(--surface-card))" : "transparent",
                      border: active ? "1px solid hsl(var(--accent-gold) / 0.4)" : "1px solid transparent",
                    }}
                  >
                    <div
                      className="w-12 h-9 rounded shrink-0 border"
                      style={{ background: "white", borderColor: "hsl(var(--hairline))" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-muted-foreground">
                        {String(idx + 1).padStart(2, "0")}
                      </div>
                      <div className="text-sm truncate">{pg.title.replace(/^\d+\s*/, "")}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Background overlay */}
            <div
              className="border-t p-3"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              <div className="flex items-center justify-between text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-2">
                HINTERGRUND (TRANSPARENZ)
                <button onClick={() => setBgOverlay((o) => ({ ...o, visible: !o.visible }))}>
                  <Eye size={13} style={{ opacity: bgOverlay.visible ? 1 : 0.4 }} />
                </button>
              </div>
              <select
                value={bgOverlay.pageId ?? ""}
                onChange={(e) => setBgOverlay((o) => ({ ...o, pageId: e.target.value || undefined }))}
                className="w-full text-sm h-8 px-2 rounded bg-transparent border"
                style={{ borderColor: "hsl(var(--hairline))" }}
              >
                <option value="">— Keine —</option>
                {project.pages
                  .filter((p) => p.id !== activePage?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
              </select>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(bgOverlay.opacity * 100)}
                  onChange={(e) =>
                    setBgOverlay((o) => ({ ...o, opacity: Number(e.target.value) / 100 }))
                  }
                  className="flex-1 accent-foreground"
                />
                <span className="text-xs w-8 text-right">
                  {Math.round(bgOverlay.opacity * 100)} %
                </span>
              </div>
            </div>
          </aside>

          {/* Canvas */}
          <main className="flex-1 relative overflow-auto" style={{ background: "hsl(var(--surface))" }}>
            {activePage && (
              <PageCanvas
                projectId={project.id}
                page={activePage}
                overlayPage={bgOverlay.visible ? bgPage : undefined}
                overlayOpacity={bgOverlay.opacity}
                selectedElementId={selectedElementId}
                onSelect={(id) => {
                  setSelectedElementId(id);
                  if (id) setRightTab("tools");
                }}
              />
            )}

            {/* bottom bar */}
            <div
              className="absolute left-1/2 -translate-x-1/2 bottom-4 flex items-center gap-2 rounded-full px-4 py-2 text-sm"
              style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
            >
              <button
                onClick={() => {
                  if (!activePage) return;
                  projectStore.addElement(project.id, activePage.id, {
                    kind: "text",
                    x: 10,
                    y: 10,
                    w: 30,
                    h: 8,
                    text: "Neuer Text",
                    fontSize: 16,
                  });
                }}
                className="flex items-center gap-1"
              >
                <Plus size={14} /> Element hinzufügen
              </button>
              <span className="text-muted-foreground">▾</span>
            </div>
            <div className="absolute right-4 bottom-4 flex items-center gap-2">
              <button
                className="h-8 w-8 rounded-md border flex items-center justify-center"
                style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}
                onClick={() => projectStore.addPage(project.id)}
                title="Seite duplizieren"
              >
                <Copy size={14} />
              </button>
              <button
                className="h-8 w-8 rounded-md border flex items-center justify-center"
                style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}
                onClick={() => {
                  if (activePage && project.pages.length > 1) {
                    projectStore.deletePage(project.id, activePage.id);
                    setActivePageId(project.pages.find((p) => p.id !== activePage.id)?.id);
                  }
                }}
                title="Seite löschen"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </main>

          {/* Right inspector */}
          <RightInspector
            projectId={project.id}
            page={activePage}
            element={selectedElement}
            tab={rightTab}
            setTab={setRightTab}
            project={project}
            onJumpCad={(sheetId) => navigate(`/project/${project.id}/cad${sheetId ? `/${sheetId}` : ""}`)}
          />
        </div>
      </div>
    </div>
  );
}

function ToolRailButton({
  icon,
  label,
  active,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  accent?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="w-10 h-10 rounded-lg flex flex-col items-center justify-center text-[9px] gap-0.5 hover:bg-muted"
      style={{
        background: active ? "hsl(var(--surface-muted))" : "transparent",
        color: accent
          ? "hsl(var(--accent-gold))"
          : active
          ? "hsl(var(--ink))"
          : "hsl(var(--ink-soft))",
      }}
    >
      {icon}
      <span className="leading-none">{label.length > 8 ? label.slice(0, 6) + "…" : label}</span>
    </button>
  );
}

function PageCanvas({
  projectId,
  page,
  overlayPage,
  overlayOpacity,
  selectedElementId,
  onSelect,
}: {
  projectId: string;
  page: import("@/lib/projectStore").ProjectPage;
  overlayPage?: import("@/lib/projectStore").ProjectPage;
  overlayOpacity: number;
  selectedElementId?: string;
  onSelect: (id?: string) => void;
}) {
  const fmt = FORMAT_SIZES[page.format];
  const aspect = fmt.w / fmt.h;
  const width = Math.min(1100, 1100);
  const height = width / aspect;
  return (
    <div className="min-h-full flex items-center justify-center p-10">
      <div
        className="relative shadow-xl"
        style={{
          width,
          height,
          background: "white",
          border: "1px solid hsl(var(--hairline))",
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onSelect(undefined);
        }}
      >
        {overlayPage && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ opacity: overlayOpacity }}
          >
            {overlayPage.elements.map((el) => (
              <ElementView key={el.id} el={el} readOnly />
            ))}
            <div className="absolute inset-0 bg-amber-100/10" />
          </div>
        )}
        {page.elements.map((el) => (
          <ElementView
            key={el.id}
            el={el}
            selected={el.id === selectedElementId}
            onSelect={() => onSelect(el.id)}
            onDrag={(dx, dy) => {
              projectStore.updateElement(projectId, page.id, el.id, {
                x: Math.max(0, Math.min(95, el.x + (dx / width) * 100)),
                y: Math.max(0, Math.min(95, el.y + (dy / height) * 100)),
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ElementView({
  el,
  selected,
  readOnly,
  onSelect,
  onDrag,
}: {
  el: PageElement;
  selected?: boolean;
  readOnly?: boolean;
  onSelect?: () => void;
  onDrag?: (dx: number, dy: number) => void;
}) {
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    onSelect?.();
    dragRef.current = { x: e.clientX, y: e.clientY };
    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.x;
      const dy = ev.clientY - dragRef.current.y;
      dragRef.current = { x: ev.clientX, y: ev.clientY };
      onDrag?.(dx, dy);
    };
    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className="absolute"
      style={{
        left: `${el.x}%`,
        top: `${el.y}%`,
        width: `${el.w}%`,
        height: `${el.h}%`,
        outline: selected ? "2px solid hsl(var(--accent-gold))" : "none",
        cursor: readOnly ? "default" : "move",
        opacity: el.opacity ?? 1,
        boxShadow: el.shadow ? "0 8px 24px -8px rgba(0,0,0,0.25)" : undefined,
        border: el.border ? "1px solid hsl(var(--ink))" : undefined,
      }}
    >
      {el.kind === "text" && (
        <div
          style={{
            fontSize: el.fontSize ?? 16,
            color: el.color ?? "hsl(var(--ink))",
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
          }}
        >
          {el.text || "Text"}
        </div>
      )}
      {el.kind === "image" && (
        <img
          src={el.imageUrl}
          alt=""
          className="w-full h-full object-cover"
          style={{ background: "hsl(var(--surface-muted))" }}
        />
      )}
      {el.kind === "note" && (
        <div
          className="w-full h-full p-3 text-sm"
          style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--ink))" }}
        >
          {el.text || "Notiz"}
        </div>
      )}
      {el.kind === "cad-view" && (
        <div
          className="w-full h-full flex items-center justify-center text-xs text-muted-foreground border-2 border-dashed"
          style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-muted))" }}
        >
          CAD-Ansicht{el.sheetId ? ` · ${el.sheetId}` : ""}
        </div>
      )}
      {(el.kind === "shape" || el.kind === "line" || el.kind === "table" || el.kind === "pdf" || el.kind === "timeline") && (
        <div
          className="w-full h-full flex items-center justify-center text-xs text-muted-foreground"
          style={{ background: "hsl(var(--surface-muted))" }}
        >
          {el.kind}
        </div>
      )}
    </div>
  );
}

function RightInspector({
  projectId,
  page,
  element,
  tab,
  setTab,
  project,
  onJumpCad,
}: {
  projectId: string;
  page?: import("@/lib/projectStore").ProjectPage;
  element?: PageElement;
  tab: "settings" | "tools" | "tasks";
  setTab: (t: "settings" | "tools" | "tasks") => void;
  project: import("@/lib/projectStore").Project;
  onJumpCad: (sheetId?: string) => void;
}) {
  const taskCount = project.tasks.filter((t) => !t.done).length;
  return (
    <aside
      className="w-[340px] shrink-0 border-l flex flex-col"
      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
    >
      <div className="grid grid-cols-3 border-b" style={{ borderColor: "hsl(var(--hairline))" }}>
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")} icon={<Settings size={14} />} label="Seiteneinstellungen" />
        <TabButton active={tab === "tools"} onClick={() => setTab("tools")} icon={<Wrench size={14} />} label="Werkzeug" />
        <TabButton
          active={tab === "tasks"}
          onClick={() => setTab("tasks")}
          icon={<CheckSquare size={14} />}
          label="Aufgaben"
          badge={taskCount > 0 ? taskCount : undefined}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {tab === "settings" && page && <PageSettings projectId={projectId} page={page} />}
        {tab === "tools" && (
          <ToolsTab projectId={projectId} pageId={page?.id} element={element} project={project} onJumpCad={onJumpCad} />
        )}
        {tab === "tasks" && <TasksTab project={project} />}
      </div>
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="py-3 flex flex-col items-center gap-1 text-[11px] relative"
      style={{
        color: active ? "hsl(var(--ink))" : "hsl(var(--ink-soft))",
        fontWeight: active ? 600 : 400,
        background: active ? "hsl(var(--surface))" : "transparent",
      }}
    >
      <span className="flex items-center gap-1">
        {icon}
        {badge !== undefined && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ background: "hsl(var(--accent-gold))", color: "white" }}
          >
            {badge}
          </span>
        )}
      </span>
      <span className="text-center leading-tight">{label}</span>
      {active && (
        <span
          className="absolute left-2 right-2 -bottom-px h-[2px]"
          style={{ background: "hsl(var(--accent-gold))" }}
        />
      )}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function PageSettings({
  projectId,
  page,
}: {
  projectId: string;
  page: import("@/lib/projectStore").ProjectPage;
}) {
  const update = (patch: Partial<typeof page>) => projectStore.updatePage(projectId, page.id, patch);
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
          SEITENEINSTELLUNGEN
        </div>
        <div className="space-y-3">
          <Row label="Seitentitel">
            <input
              value={page.title}
              onChange={(e) => update({ title: e.target.value })}
              className="w-full h-8 px-2 rounded bg-transparent border text-sm"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
          </Row>
          <Row label="Format">
            <select
              value={page.format}
              onChange={(e) => update({ format: e.target.value as PageFormat })}
              className="w-full h-8 px-2 rounded bg-transparent border text-sm"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              {(Object.entries(FORMAT_SIZES) as [PageFormat, typeof FORMAT_SIZES[PageFormat]][]).map(
                ([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                )
              )}
            </select>
          </Row>
          <Row label="Ausrichtung">
            <div className="flex gap-2">
              <button
                onClick={() => update({ format: page.format.includes("hoch") ? (page.format.replace("hoch", "quer") as PageFormat) : page.format })}
                className="h-8 w-8 rounded border flex items-center justify-center"
                style={{ borderColor: "hsl(var(--hairline))" }}
                title="Querformat"
              >
                ▭
              </button>
              <button
                onClick={() => update({ format: page.format.includes("quer") ? (page.format.replace("quer", "hoch") as PageFormat) : page.format })}
                className="h-8 w-8 rounded border flex items-center justify-center"
                style={{ borderColor: "hsl(var(--hairline))" }}
                title="Hochformat"
              >
                ▯
              </button>
            </div>
          </Row>
          <Row label="Ränder">
            <select
              value={page.margins}
              onChange={(e) => update({ margins: Number(e.target.value) })}
              className="w-full h-8 px-2 rounded bg-transparent border text-sm"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              <option value={10}>Schmal (10 mm)</option>
              <option value={20}>Normal (20 mm)</option>
              <option value={30}>Breit (30 mm)</option>
            </select>
          </Row>
          <Row label="Hintergrund">
            <input
              type="checkbox"
              checked={page.background}
              onChange={(e) => update({ background: e.target.checked })}
            />
          </Row>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
          LAYOUT
        </div>
        <div className="space-y-3">
          <Row label="Spalten">
            <input
              type="number"
              value={page.columns ?? 12}
              onChange={(e) => update({ columns: Number(e.target.value) })}
              className="w-full h-8 px-2 rounded bg-transparent border text-sm"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
          </Row>
          <Row label="Spaltenabstand">
            <input
              value={`${page.columnGap ?? 6} mm`}
              onChange={(e) =>
                update({ columnGap: Number(e.target.value.replace(/\D/g, "")) || 0 })
              }
              className="w-full h-8 px-2 rounded bg-transparent border text-sm"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
          </Row>
          <Row label="Hilfslinien">
            <input
              type="checkbox"
              checked={page.guides ?? true}
              onChange={(e) => update({ guides: e.target.checked })}
            />
          </Row>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-2">
          NOTIZEN (SEITENBEZOGEN)
        </div>
        <textarea
          value={page.notes ?? ""}
          onChange={(e) => update({ notes: e.target.value })}
          rows={5}
          placeholder="Bauherren wünschen eine größere Terrassenüberdachung…"
          className="w-full text-sm p-2 rounded border bg-transparent"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
      </div>
    </div>
  );
}

function ToolsTab({
  projectId,
  pageId,
  element,
  project,
  onJumpCad,
}: {
  projectId: string;
  pageId?: string;
  element?: PageElement;
  project: import("@/lib/projectStore").Project;
  onJumpCad: (sheetId?: string) => void;
}) {
  if (!element) {
    return (
      <div>
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
          ZEICHNUNGSBLÄTTER
        </div>
        <div className="space-y-2">
          {project.sheets.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Noch keine Zeichnungsblätter. Wechsle in den CAD-Bereich.
            </div>
          )}
          {project.sheets.map((s) => (
            <div
              key={s.id}
              onClick={() => {
                if (pageId) {
                  projectStore.addElement(projectId, pageId, {
                    kind: "cad-view",
                    x: 30,
                    y: 30,
                    w: 40,
                    h: 30,
                    sheetId: s.id,
                  });
                }
              }}
              onDoubleClick={() => onJumpCad(s.id)}
              className="flex items-center gap-3 p-2 rounded-md border cursor-pointer hover:bg-muted"
              style={{ borderColor: "hsl(var(--hairline))" }}
              title="Klick: auf Seite platzieren · Doppelklick: CAD öffnen"
            >
              <div className="w-12 h-9 rounded bg-white border" style={{ borderColor: "hsl(var(--hairline))" }} />
              <div className="flex-1">
                <div className="text-sm">{s.name}</div>
                <div className="text-[11px] text-muted-foreground">{s.scale}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 text-xs text-muted-foreground">
          Klicke ein Element auf der Seite an, um seine Werkzeug-Eigenschaften zu bearbeiten.
        </div>
      </div>
    );
  }

  if (!pageId) return null;
  const update = (patch: Partial<PageElement>) =>
    projectStore.updateElement(projectId, pageId, element.id, patch);

  return (
    <div className="space-y-4">
      <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-1">
        {element.kind.toUpperCase()}
      </div>
      <Row label="Breite">
        <input
          type="number"
          value={Math.round(element.w)}
          onChange={(e) => update({ w: Number(e.target.value) })}
          className="w-full h-8 px-2 rounded bg-transparent border text-sm"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
      </Row>
      <Row label="Höhe">
        <input
          type="number"
          value={Math.round(element.h)}
          onChange={(e) => update({ h: Number(e.target.value) })}
          className="w-full h-8 px-2 rounded bg-transparent border text-sm"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
      </Row>
      <Row label="Position X">
        <input
          type="number"
          value={Math.round(element.x)}
          onChange={(e) => update({ x: Number(e.target.value) })}
          className="w-full h-8 px-2 rounded bg-transparent border text-sm"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
      </Row>
      <Row label="Position Y">
        <input
          type="number"
          value={Math.round(element.y)}
          onChange={(e) => update({ y: Number(e.target.value) })}
          className="w-full h-8 px-2 rounded bg-transparent border text-sm"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
      </Row>

      {element.kind === "text" && (
        <>
          <Row label="Inhalt">
            <textarea
              value={element.text ?? ""}
              onChange={(e) => update({ text: e.target.value })}
              rows={3}
              className="w-full text-sm p-2 rounded border bg-transparent"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
          </Row>
          <Row label="Größe">
            <input
              type="number"
              value={element.fontSize ?? 16}
              onChange={(e) => update({ fontSize: Number(e.target.value) })}
              className="w-full h-8 px-2 rounded bg-transparent border text-sm"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
          </Row>
          <Row label="Farbe">
            <input
              type="color"
              value={element.color ?? "#1a1a1a"}
              onChange={(e) => update({ color: e.target.value })}
              className="h-8 w-full rounded border bg-transparent"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
          </Row>
        </>
      )}
      {element.kind === "image" && (
        <Row label="Bild-URL">
          <input
            value={element.imageUrl ?? ""}
            onChange={(e) => update({ imageUrl: e.target.value })}
            className="w-full h-8 px-2 rounded bg-transparent border text-sm"
            style={{ borderColor: "hsl(var(--hairline))" }}
          />
        </Row>
      )}
      <Row label="Transparenz">
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((element.opacity ?? 1) * 100)}
          onChange={(e) => update({ opacity: Number(e.target.value) / 100 })}
          className="w-full"
        />
      </Row>
      <Row label="Schatten">
        <input
          type="checkbox"
          checked={!!element.shadow}
          onChange={(e) => update({ shadow: e.target.checked })}
        />
      </Row>
      <Row label="Rahmen">
        <input
          type="checkbox"
          checked={!!element.border}
          onChange={(e) => update({ border: e.target.checked })}
        />
      </Row>

      {element.kind === "cad-view" && (
        <div className="pt-2">
          <button
            onClick={() => onJumpCad(element.sheetId)}
            className="w-full h-9 rounded-md text-sm font-medium flex items-center justify-center gap-2"
            style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
          >
            <Move size={14} /> Im CAD öffnen
          </button>
        </div>
      )}

      <button
        onClick={() => projectStore.deleteElement(projectId, pageId, element.id)}
        className="w-full h-9 rounded-md text-sm border flex items-center justify-center gap-2 mt-2"
        style={{ borderColor: "hsl(var(--hairline))", color: "hsl(0 60% 50%)" }}
      >
        <Trash2 size={14} /> Element löschen
      </button>
    </div>
  );
}

function TasksTab({ project }: { project: import("@/lib/projectStore").Project }) {
  const [draft, setDraft] = useState("");
  const today = new Date();
  const inDays = (date?: string) => {
    if (!date) return Infinity;
    const d = new Date(date);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  };
  const groups = useMemo(() => {
    const heute: typeof project.tasks = [];
    const woche: typeof project.tasks = [];
    const spaeter: typeof project.tasks = [];
    for (const t of project.tasks) {
      const d = inDays(t.date);
      if (d <= 0) heute.push(t);
      else if (d <= 7) woche.push(t);
      else spaeter.push(t);
    }
    return { heute, woche, spaeter };
  }, [project.tasks]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Aufgaben</div>
        <button
          onClick={() => {
            if (!draft.trim()) return;
            projectStore.addTask(project.id, { title: draft.trim() });
            setDraft("");
          }}
          className="text-xs"
          style={{ color: "hsl(var(--accent-gold))" }}
        >
          + Aufgabe
        </button>
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            projectStore.addTask(project.id, { title: draft.trim() });
            setDraft("");
          }
        }}
        placeholder="Neue Aufgabe…"
        className="w-full h-9 px-2 rounded border bg-transparent text-sm"
        style={{ borderColor: "hsl(var(--hairline))" }}
      />
      {(["heute", "woche", "spaeter"] as const).map((g) => {
        const list = groups[g];
        if (!list.length) return null;
        const label = g === "heute" ? "HEUTE" : g === "woche" ? "DIESE WOCHE" : "GEPLANTE TERMINE";
        return (
          <div key={g}>
            <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-2">
              {label}
            </div>
            <div className="space-y-2">
              {list.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => projectStore.toggleTask(project.id, t.id)}
                    className="accent-foreground"
                  />
                  <span className={`flex-1 ${t.done ? "line-through text-muted-foreground" : ""}`}>
                    {t.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t.date
                      ? new Date(t.date).toLocaleDateString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                        })
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// re-export helpful types
export type { PageElement, ElementKind };
