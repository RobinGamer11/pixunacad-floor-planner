import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes, ChevronDown, ChevronRight, Folder, FolderPlus,
  MoreHorizontal, Plus, Save, Ungroup, Upload, X,
} from "lucide-react";
import type { CadApp } from "@/cad/CadApp";
import type { LibraryDefinition, LibraryFolder, LibraryUnits } from "@/cad/library/types";
import { PXOBJ_EXTENSION } from "@/cad/library/types";
import { detectDxfUnits, listDxfUnitOptions } from "@/cad/library/dxfImport";
import LibraryGeometryPreview from "./LibraryGeometryPreview";

interface Props {
  app: CadApp | null;
  /** Nur anzeigen, wenn gerade ein Bibliotheksobjekt ausgewählt ist. */
  onlyWhenInstance?: boolean;
}

type Meta = {
  name: string;
  category: string;
  tags: string[];
  author: string;
  license: string;
  source: string;
  units: LibraryUnits;
  folderId: string | null;
};

const EMPTY_META: Meta = {
  name: "", category: "", tags: [], author: "", license: "", source: "", units: "m", folderId: null,
};

type Mode =
  | { kind: "list" }
  | { kind: "save" }
  | { kind: "edit"; id: string }
  | { kind: "svg"; svg: string; warnings: string[] }
  | { kind: "dxf"; dxf: string; detected: string };

const inputCls = "cad-settings-input w-full h-9 text-[12px] px-3";
const selectCls = "cad-settings-select w-full h-9 text-[12px] px-2";
const muted = { color: "hsl(var(--cad-toolbar-muted))" };
const border = { borderColor: "hsl(var(--cad-hub-border))" };

function fileSafe(name: string) {
  return (name || "bibliotheksobjekt").replace(/[^\w\-]+/g, "_");
}

/**
 * Bibliothek — kompakte Ordner- und Objektverwaltung der eigenständigen
 * CAD-Oberfläche. Formulare zum Speichern/Bearbeiten sind eigene Zustände;
 * die Normalansicht bleibt eine schlanke Liste.
 */
export default function LibraryPanel({ app, onlyWhenInstance }: Props) {
  const [defs, setDefs] = useState<LibraryDefinition[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [replaceOriginal, setReplaceOriginal] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [extraOpen, setExtraOpen] = useState(false);
  const [svgUnits, setSvgUnits] = useState(1000);
  const [dxfUnits, setDxfUnits] = useState(1000);
  const [selInfo, setSelInfo] = useState<{ count: number; unsupported: string[] }>({ count: 0, unsupported: [] });
  const [instanceDefId, setInstanceDefId] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const importRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<HTMLInputElement>(null);
  const dxfRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!app) return;
    const sync = () => {
      setDefs([...(app.libraryDefinitions || [])]);
      setFolders([...(app.libraryFolders || [])]);
    };
    sync();
    const prev = app.onLibraryChange;
    app.onLibraryChange = () => { prev?.(); sync(); };
    return () => { app.onLibraryChange = prev; };
  }, [app]);

  // Auswahlstatus laufend auffrischen (die Canvas-Auswahl ist nicht reaktiv).
  useEffect(() => {
    if (!app) return;
    const t = window.setInterval(() => {
      try {
        setSelInfo(app.getLibrarySelectionInfo());
        const inst = app.getSelectedLibraryInstance();
        const defId = inst ? ((inst as any).definitionId as string) : null;
        setInstanceDefId(defId);
        if (defId) setSelectedId(defId);
        setPlacingId(app.libraryTool?.activeDefinitionId || null);
      } catch { /* ignore */ }
    }, 150);
    return () => window.clearInterval(t);
  }, [app]);

  const metaFromDefinition = useCallback((d: LibraryDefinition): Meta => ({
    name: d.name,
    category: d.category || "",
    tags: [...(d.tags || [])],
    author: d.metadata?.author || "",
    license: d.metadata?.license || "",
    source: d.metadata?.source || "",
    units: d.units || "m",
    folderId: d.folderId || null,
  }), []);

  const categories = useMemo(
    () => [...new Set(defs.map((d) => d.category).filter(Boolean))].sort(),
    [defs],
  );
  const allTags = useMemo(
    () => [...new Set(defs.flatMap((d) => d.tags || []))].sort(),
    [defs],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return defs
      .filter((d) => {
        if (category && d.category !== category) return false;
        if (tag && !(d.tags || []).includes(tag)) return false;
        if (!q) return true;
        return d.name.toLowerCase().includes(q)
          || (d.category || "").toLowerCase().includes(q)
          || (d.tags || []).some((t) => t.toLowerCase().includes(q));
      })
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [defs, query, category, tag]);

  const childFolders = useCallback(
    (parentId: string | null) => folders
      .filter((f) => (f.parentId || null) === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, "de")),
    [folders],
  );
  const defsInFolder = useCallback(
    (folderId: string | null) => visible.filter((d) => (d.folderId || null) === folderId),
    [visible],
  );
  /** Anzahl inklusive aller Unterordner. */
  const folderCount = useCallback((id: string): number => {
    let n = defsInFolder(id).length;
    for (const f of folders) if (f.parentId === id) n += folderCount(f.id);
    return n;
  }, [defsInFolder, folders]);

  if (!app) return null;
  if (onlyWhenInstance && !instanceDefId) return null;

  const buildMeta = () => ({
    name: meta.name,
    category: meta.category,
    tags: meta.tags,
    units: meta.units,
    author: meta.author,
    license: meta.license,
    source: meta.source,
    folderId: meta.folderId,
  });

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setMeta((m) => (m.tags.includes(t) ? m : { ...m, tags: [...m.tags, t] }));
    setTagDraft("");
  };

  const backToList = () => {
    setMode({ kind: "list" });
    setMeta(EMPTY_META);
    setTagDraft("");
    setExtraOpen(false);
  };

  const download = (name: string, text: string, type: string) => {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const saveSelection = () => {
    const res = replaceOriginal
      ? app.convertSelectionToLibraryObject(buildMeta())
      : app.addLibraryDefinitionFromSelection(buildMeta());
    if (!res.definition) { window.alert("Keine unterstützten Objekte in der Auswahl."); return; }
    if (res.unsupported.length) {
      window.alert("Diese Objekte wurden NICHT gespeichert:\n• " + res.unsupported.join("\n• "));
    }
    backToList();
  };

  const saveSvg = (svg: string) => {
    const res = app.importLibraryDefinitionFromSvg(svg, buildMeta(), svgUnits);
    if (!res.definition) {
      window.alert("SVG konnte nicht importiert werden:\n• " + (res.warnings.join("\n• ") || "Unbekannter Fehler"));
      return;
    }
    if (res.warnings.length) window.alert("SVG importiert. Hinweise:\n• " + res.warnings.join("\n• "));
    backToList();
  };

  const saveDxf = (dxf: string) => {
    const res = app.importLibraryDefinitionFromDxf(dxf, buildMeta(), dxfUnits);
    if (!res.definition) {
      window.alert("DXF konnte nicht importiert werden:\n• " + (res.failed || res.warnings.join("\n• ") || "Unbekannter Fehler"));
      return;
    }
    if (res.warnings.length) window.alert("DXF importiert. Hinweise:\n• " + res.warnings.join("\n• "));
    backToList();
  };

  const exportPxobj = (d: LibraryDefinition) => {
    const json = app.exportLibraryDefinition(d.id);
    if (json) download(`${fileSafe(d.name)}${PXOBJ_EXTENSION}`, json, "application/json");
  };
  const exportSvg = (d: LibraryDefinition) => {
    const svg = app.exportLibraryDefinitionSvg(d.id);
    if (svg) download(`${fileSafe(d.name)}.svg`, svg, "image/svg+xml");
  };
  const exportDxf = (d: LibraryDefinition) => {
    const res = app.exportLibraryDefinitionDxf(d.id);
    if (!res) return;
    download(`${fileSafe(d.name)}.dxf`, res.dxf, "image/vnd.dxf");
    if (res.warnings.length) window.alert("DXF exportiert. Hinweise:\n• " + res.warnings.join("\n• "));
  };

  const moveToFolderPrompt = (d: LibraryDefinition) => {
    const options = folders.map((f, i) => `${i + 1} = ${f.name}`).join("\n");
    const answer = window.prompt(
      `„${d.name}“ verschieben nach:\n0 = Nicht zugeordnet\n${options}`,
      "0",
    );
    if (answer == null) return;
    const idx = parseInt(answer, 10);
    if (Number.isNaN(idx)) return;
    app.setLibraryDefinitionFolder(d.id, idx === 0 ? null : (folders[idx - 1]?.id ?? null));
  };

  /* ------------------------------------------------------------ Bausteine */

  const menu = (id: string, items: { label: string; run: () => void; danger?: boolean }[]) => (
    <div className="relative">
      <button type="button" title="Weitere Aktionen"
        className="cad-toolbar-btn h-8 w-8 justify-center p-0"
        onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === id ? null : id); }}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {openMenu === id && (
        <div className="absolute right-0 top-9 z-50 min-w-[190px] rounded-md border py-1 shadow-lg"
          style={{ ...border, background: "hsl(var(--cad-settings-bg))" }}
          onClick={(e) => e.stopPropagation()}>
          {items.map((it) => (
            <button key={it.label} type="button"
              className="block w-full px-3 py-2 text-left text-[12px] hover:opacity-80"
              style={it.danger ? { color: "hsl(var(--destructive))" } : undefined}
              onClick={() => { setOpenMenu(null); it.run(); }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const objectRow = (d: LibraryDefinition, depth: number) => (
    <div
      key={d.id}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/pixuna-lib-def", d.id)}
      onClick={() => setSelectedId(d.id === selectedId ? null : d.id)}
      className="flex items-center gap-2 rounded-md px-2 cursor-pointer"
      style={{
        height: 56,
        paddingLeft: 8 + depth * 14,
        borderLeft: selectedId === d.id ? "3px solid hsl(var(--primary))" : "3px solid transparent",
        background: selectedId === d.id ? "hsl(var(--primary) / 0.12)" : undefined,
      }}
    >
      <div className="shrink-0 rounded border flex items-center justify-center" style={{ ...border, width: 38, height: 38 }}>
        <LibraryGeometryPreview geometry={d.geometry} size={34} title={d.name} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium truncate">{d.name}</div>
        <div className="text-[11px] truncate" style={muted}>
          {[d.category || "Ohne Kategorie", ...(d.tags || []).slice(0, 2)].join(" · ")}
        </div>
      </div>
      <button type="button" title="Platzieren"
        className={`cad-toolbar-btn h-8 w-8 justify-center p-0 ${placingId === d.id ? "active" : ""}`}
        onClick={(e) => { e.stopPropagation(); app.beginLibraryPlacement(d.id); }}>
        <Boxes className="h-4 w-4" />
      </button>
      {menu(`def:${d.id}`, [
        { label: "Bearbeiten", run: () => { setMeta(metaFromDefinition(d)); setMode({ kind: "edit", id: d.id }); } },
        { label: "Duplizieren", run: () => app.duplicateLibraryDefinition(d.id) },
        { label: "Verschieben nach …", run: () => moveToFolderPrompt(d) },
        { label: "Export Pixuna", run: () => exportPxobj(d) },
        { label: "Export SVG", run: () => exportSvg(d) },
        { label: "Export DXF", run: () => exportDxf(d) },
        {
          label: "Löschen", danger: true, run: () => {
            if (window.confirm(`„${d.name}“ löschen? Platzierte Exemplare werden ebenfalls entfernt.`)) {
              app.removeLibraryDefinition(d.id);
              setSelectedId((s) => (s === d.id ? null : s));
            }
          },
        },
      ])}
    </div>
  );

  const folderRow = (f: LibraryFolder, depth: number) => {
    const open = !collapsed[f.id];
    return (
      <div key={f.id}>
        <div
          className="flex items-center gap-2 rounded-md px-2 cursor-pointer"
          style={{ height: 40, paddingLeft: 8 + depth * 14 }}
          onClick={() => setCollapsed((c) => ({ ...c, [f.id]: open }))}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("text/pixuna-lib-def")) e.preventDefault(); }}
          onDrop={(e) => {
            const id = e.dataTransfer.getData("text/pixuna-lib-def");
            if (id) { e.preventDefault(); app.setLibraryDefinitionFolder(id, f.id); }
          }}
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <Folder className="h-4 w-4 shrink-0" style={muted} />
          <div className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
            {f.name} <span style={muted}>({folderCount(f.id)})</span>
          </div>
          {menu(`folder:${f.id}`, [
            { label: "Unterordner erstellen", run: () => { const n = window.prompt("Name des Unterordners:", "Neuer Ordner"); if (n) app.createLibraryFolder(n, f.id); } },
            { label: "Umbenennen", run: () => { const n = window.prompt("Neuer Name:", f.name); if (n) app.renameLibraryFolder(f.id, n); } },
            {
              label: "Ordner löschen", danger: true, run: () => {
                if (window.confirm(`Ordner „${f.name}“ löschen? Enthaltene Objekte bleiben erhalten und stehen danach unter „Nicht zugeordnet“.`)) {
                  app.removeLibraryFolder(f.id);
                }
              },
            },
          ])}
        </div>
        {open && (
          <div>
            {childFolders(f.id).map((sub) => folderRow(sub, depth + 1))}
            {defsInFolder(f.id).map((d) => objectRow(d, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const tagEditor = (
    <div className="space-y-2">
      <label className="text-[12px]">Tags</label>
      {meta.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {meta.tags.map((t) => (
            <button key={t} type="button" onClick={() => setMeta((m) => ({ ...m, tags: m.tags.filter((x) => x !== t) }))}
              className="cad-toolbar-btn h-7 px-2.5 text-[11.5px] active" title="Tag entfernen">
              {t} <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
      {allTags.filter((t) => !meta.tags.includes(t)).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.filter((t) => !meta.tags.includes(t)).map((t) => (
            <button key={t} type="button" onClick={() => addTag(t)} className="cad-toolbar-btn h-7 px-2.5 text-[11.5px]" title="Tag hinzufügen">
              + {t}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input type="text" className={inputCls} placeholder="Neuer Tag" value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagDraft); } }} />
        <button type="button" className="cad-toolbar-btn h-9 px-3 text-[12px]" onClick={() => addTag(tagDraft)}>Hinzufügen</button>
      </div>
    </div>
  );

  const folderSelect = (
    <div className="space-y-1">
      <label className="text-[12px]">Ordner</label>
      <div className="flex gap-2">
        <select className={selectCls} value={meta.folderId || ""} onChange={(e) => setMeta({ ...meta, folderId: e.target.value || null })}>
          <option value="">Nicht zugeordnet</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button type="button" className="cad-toolbar-btn h-9 px-3 text-[12px]" title="Neuen Ordner anlegen"
          onClick={() => {
            const n = window.prompt("Name des neuen Ordners:", "Neuer Ordner");
            if (!n) return;
            const f = app.createLibraryFolder(n, null);
            setMeta((m) => ({ ...m, folderId: f.id }));
          }}>
          <FolderPlus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  const previewGeometry = () => {
    if (mode.kind === "edit") return app.getLibraryDefinition(mode.id)?.geometry || [];
    return [];
  };

  const metaFields = (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded border flex items-center justify-center" style={{ ...border, width: 56, height: 56 }}>
            <LibraryGeometryPreview geometry={previewGeometry()} size={50} />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <label className="text-[12px]">Name</label>
            <input type="text" className={inputCls} placeholder="Name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
          </div>
        </div>
        {folderSelect}
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-[12px]">Kategorie</label>
          {categories.length > 0 && (
            <select className={selectCls} value={categories.includes(meta.category) ? meta.category : ""}
              onChange={(e) => setMeta({ ...meta, category: e.target.value })}>
              <option value="">Vorhandene Kategorie wählen …</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <input type="text" className={inputCls} placeholder="Neue Kategorie" value={meta.category}
            onChange={(e) => setMeta({ ...meta, category: e.target.value })} />
        </div>
        {tagEditor}
      </div>

      <div className="rounded-md border" style={border}>
        <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-[12px]"
          onClick={() => setExtraOpen((o) => !o)}>
          <span>Zusatzinformationen</span>
          {extraOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {extraOpen && (
          <div className="space-y-3 px-3 pb-3">
            <div className="space-y-1">
              <label className="text-[12px]">Autor</label>
              <input type="text" className={inputCls} value={meta.author} onChange={(e) => setMeta({ ...meta, author: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[12px]">Lizenz</label>
              <input type="text" className={inputCls} value={meta.license} onChange={(e) => setMeta({ ...meta, license: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[12px]">Quelle</label>
              <input type="text" className={inputCls} value={meta.source} onChange={(e) => setMeta({ ...meta, source: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-[12px]">Maßeinheit</label>
              <select className={selectCls} value={meta.units} onChange={(e) => setMeta({ ...meta, units: e.target.value as LibraryUnits })}>
                <option value="mm">Millimeter</option>
                <option value="cm">Zentimeter</option>
                <option value="m">Meter</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="text-[11.5px] leading-relaxed" style={muted}>
        Einfügepunkt: immer der Mittelpunkt der gespeicherten Geometrie.
      </div>
    </div>
  );

  const header = (title: string) => (
    <div className="mb-3 flex items-center gap-2">
      <button type="button" className="cad-toolbar-btn h-8 px-3 text-[12px]" onClick={backToList}>← Zurück</button>
      <div className="text-[12.5px] font-semibold">{title}</div>
    </div>
  );

  /* -------------------------------------------------------------- Zustände */

  if (mode.kind === "save" || mode.kind === "svg" || mode.kind === "dxf" || mode.kind === "edit") {
    const title = mode.kind === "edit" ? "Bibliotheksobjekt bearbeiten"
      : mode.kind === "svg" ? "SVG importieren"
      : mode.kind === "dxf" ? "DXF importieren"
      : "Bibliotheksobjekt speichern";
    return (
      <div className="cad-settings-panel mb-2" onClick={() => setOpenMenu(null)}>
        {header(title)}
        <div className="space-y-4">
          {mode.kind === "save" && (
            <div className="space-y-2">
              <div className="text-[11.5px]" style={muted}>
                Auswahl: {selInfo.count} {selInfo.count === 1 ? "Objekt" : "Objekte"}
              </div>
              <button type="button" onClick={() => setReplaceOriginal(false)}
                className={`cad-toolbar-btn w-full justify-start h-10 text-[12.5px] ${replaceOriginal ? "" : "active"}`}>
                Kopie als Bibliotheksobjekt
              </button>
              <button type="button" onClick={() => setReplaceOriginal(true)}
                className={`cad-toolbar-btn w-full justify-start h-10 text-[12.5px] ${replaceOriginal ? "active" : ""}`}>
                Original als Bibliotheksobjekt
              </button>
              {selInfo.unsupported.length > 0 && (
                <div className="text-[11.5px]" style={{ color: "hsl(var(--destructive))" }}>
                  Nicht unterstützt: {selInfo.unsupported.join(", ")}
                </div>
              )}
            </div>
          )}

          {mode.kind === "svg" && (
            <div className="space-y-1">
              <label className="text-[12px]">SVG-Einheiten pro Meter (1000 = 1 Einheit entspricht 1 mm)</label>
              <input type="text" inputMode="numeric" className={inputCls} value={String(svgUnits)}
                onChange={(e) => setSvgUnits(Math.max(1, parseFloat(e.target.value) || 1))} />
              {mode.warnings.length > 0 && (
                <div className="text-[11.5px]" style={muted}>Hinweise: {mode.warnings.join(" · ")}</div>
              )}
            </div>
          )}

          {mode.kind === "dxf" && (
            <div className="space-y-1">
              <div className="text-[11.5px]" style={muted}>Erkannte Einheit: {mode.detected}</div>
              <label className="text-[12px]">Einheit der Zeichnung</label>
              <select className={selectCls} value={String(dxfUnits)} onChange={(e) => setDxfUnits(parseFloat(e.target.value) || 1000)}>
                {listDxfUnitOptions().map((o) => (
                  <option key={o.code} value={String(o.unitsPerMeter)}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {metaFields}

          <div className="space-y-2">
            <button type="button" className="cad-toolbar-btn w-full justify-center h-11 text-[13px] font-semibold"
              style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
              onClick={() => {
                if (mode.kind === "save") saveSelection();
                else if (mode.kind === "svg") saveSvg(mode.svg);
                else if (mode.kind === "dxf") saveDxf(mode.dxf);
                else if (mode.kind === "edit") { app.updateLibraryDefinitionMeta(mode.id, buildMeta()); backToList(); }
              }}>
              <Save className="h-4 w-4" /> {mode.kind === "edit" ? "Änderungen speichern" : "Speichern"}
            </button>
            <button type="button" className="cad-toolbar-btn w-full justify-center h-9 text-[12px]" onClick={backToList}>
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selectedDef = selectedId ? defs.find((d) => d.id === selectedId) || null : null;
  const total = visible.length;

  return (
    <div className="cad-settings-panel mb-2" onClick={() => setOpenMenu(null)}>
      <div className="text-[12px] font-semibold uppercase tracking-[0.14em] mb-3" style={muted}>Bibliothek</div>

      <button
        type="button"
        onClick={() => {
          setMeta({ ...EMPTY_META, name: `Bibliotheksobjekt ${defs.length + 1}` });
          setMode({ kind: "save" });
        }}
        disabled={selInfo.count === 0}
        className="cad-toolbar-btn w-full justify-center h-11 text-[13px] font-semibold disabled:opacity-50"
        style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
      >
        <Plus className="h-4 w-4" />
        <span>Bibliotheksobjekt speichern{selInfo.count ? ` · ${selInfo.count}` : ""}</span>
      </button>

      <div className="mt-3 space-y-2">
        <input type="text" className={inputCls} placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <select className={`${selectCls} flex-1 min-w-[120px]`} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Alle Kategorien</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={`${selectCls} flex-1 min-w-[120px]`} value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Alle Tags</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <button type="button" className="cad-toolbar-btn w-full justify-center h-9 text-[12px]"
              onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === "import" ? null : "import"); }}>
              <Upload className="h-4 w-4" /> Importieren
            </button>
            {openMenu === "import" && (
              <div className="absolute left-0 top-10 z-50 w-full rounded-md border py-1 shadow-lg"
                style={{ ...border, background: "hsl(var(--cad-settings-bg))" }} onClick={(e) => e.stopPropagation()}>
                <button type="button" className="block w-full px-3 py-2 text-left text-[12px]"
                  onClick={() => { setOpenMenu(null); importRef.current?.click(); }}>Pixuna-Datei (.pxobj)</button>
                <button type="button" className="block w-full px-3 py-2 text-left text-[12px]"
                  onClick={() => { setOpenMenu(null); svgRef.current?.click(); }}>SVG</button>
                <button type="button" className="block w-full px-3 py-2 text-left text-[12px]"
                  onClick={() => { setOpenMenu(null); dxfRef.current?.click(); }}>DXF</button>
              </div>
            )}
          </div>
          {menu("global", [
            { label: "Neuer Ordner", run: () => { const n = window.prompt("Name des neuen Ordners:", "Neuer Ordner"); if (n) app.createLibraryFolder(n, null); } },
          ])}
        </div>
      </div>

      <input ref={importRef} type="file" accept=".pxobj,application/json" className="hidden" multiple onChange={async (e) => {
        const files = Array.from(e.target.files || []);
        let ok = 0;
        for (const f of files) {
          try { if (app.importLibraryDefinition(await f.text())) ok++; } catch { /* ignore */ }
        }
        if (ok === 0 && files.length) window.alert("Keine gültige .pxobj-Datei gefunden.");
        e.target.value = "";
      }} />
      <input ref={svgRef} type="file" accept=".svg,image/svg+xml" className="hidden" onChange={async (e) => {
        const f = (e.target.files || [])[0];
        e.target.value = "";
        if (!f) return;
        const text = await f.text();
        setMeta({ ...EMPTY_META, name: f.name.replace(/\.svg$/i, "") });
        setMode({ kind: "svg", svg: text, warnings: [] });
      }} />
      <input ref={dxfRef} type="file" accept=".dxf,image/vnd.dxf,application/dxf" className="hidden" onChange={async (e) => {
        const f = (e.target.files || [])[0];
        e.target.value = "";
        if (!f) return;
        const text = await f.text();
        const info = detectDxfUnits(text);
        setDxfUnits(info.unitsPerMeter);
        setMeta({ ...EMPTY_META, name: f.name.replace(/\.dxf$/i, "") });
        setMode({ kind: "dxf", dxf: text, detected: info.label });
      }} />

      {placingId && (
        <button type="button" onClick={() => app.cancelLibraryPlacement()}
          className="cad-toolbar-btn mt-2 w-full justify-center h-9 text-[12px]">
          <X className="h-4 w-4" /> Platzierung beenden
        </button>
      )}

      {/* ------------------------------------------------------------ Baum */}
      <div className="mt-3 rounded-md border p-1.5" style={border}>
        <div className="px-2 py-1.5 text-[12px] font-semibold">
          Meine Bibliothek <span style={muted}>({total})</span>
        </div>
        {total === 0 && folders.length === 0 && (
          <div className="px-2 py-5 text-center text-[12px]" style={muted}>Noch keine Bibliotheksobjekte</div>
        )}
        {childFolders(null).map((f) => folderRow(f, 0))}
        {defsInFolder(null).length > 0 && (
          <div>
            <div
              className="flex items-center gap-2 rounded-md px-2 cursor-pointer"
              style={{ height: 36 }}
              onClick={() => setCollapsed((c) => ({ ...c, __none: !c.__none }))}
              onDragOver={(e) => { if (e.dataTransfer.types.includes("text/pixuna-lib-def")) e.preventDefault(); }}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/pixuna-lib-def");
                if (id) { e.preventDefault(); app.setLibraryDefinitionFolder(id, null); }
              }}
            >
              {collapsed.__none ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <div className="flex-1 text-[12.5px]" style={muted}>Nicht zugeordnet ({defsInFolder(null).length})</div>
            </div>
            {!collapsed.__none && defsInFolder(null).map((d) => objectRow(d, 1))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------- Aktionsleiste */}
      {selectedDef && (
        <div className="mt-3 flex items-center gap-2 rounded-md border p-2"
          style={{ ...border, background: "hsl(var(--primary) / 0.08)" }}>
          <div className="shrink-0 rounded border flex items-center justify-center" style={{ ...border, width: 38, height: 38 }}>
            <LibraryGeometryPreview geometry={selectedDef.geometry} size={34} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-medium truncate">{selectedDef.name}</div>
            <div className="text-[11px] truncate" style={muted}>{selectedDef.category || "Ohne Kategorie"}</div>
          </div>
          <button type="button" className="cad-toolbar-btn h-9 px-3 text-[12px] font-semibold"
            style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
            onClick={() => app.beginLibraryPlacement(selectedDef.id)}>
            Platzieren
          </button>
          {menu(`bar:${selectedDef.id}`, [
            { label: "Bearbeiten", run: () => { setMeta(metaFromDefinition(selectedDef)); setMode({ kind: "edit", id: selectedDef.id }); } },
            { label: "Duplizieren", run: () => app.duplicateLibraryDefinition(selectedDef.id) },
            { label: "Verschieben nach …", run: () => moveToFolderPrompt(selectedDef) },
            { label: "Export Pixuna", run: () => exportPxobj(selectedDef) },
            { label: "Export SVG", run: () => exportSvg(selectedDef) },
            { label: "Export DXF", run: () => exportDxf(selectedDef) },
            {
              label: "Löschen", danger: true, run: () => {
                if (window.confirm(`„${selectedDef.name}“ löschen? Platzierte Exemplare werden ebenfalls entfernt.`)) {
                  app.removeLibraryDefinition(selectedDef.id);
                  setSelectedId(null);
                }
              },
            },
          ])}
        </div>
      )}

      {/* Auflösen bleibt an die ausgewählte Instanz auf der Zeichenfläche gebunden. */}
      {instanceDefId && (
        <button type="button" className="cad-toolbar-btn mt-2 w-full justify-center h-9 text-[12px]"
          onClick={() => { if (!app.explodeSelectedLibraryInstance()) window.alert("Das Bibliotheksobjekt konnte nicht aufgelöst werden."); }}>
          <Ungroup className="h-4 w-4" /> Ausgewähltes Exemplar auflösen
        </button>
      )}
    </div>
  );
}
