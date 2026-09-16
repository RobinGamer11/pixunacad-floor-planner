import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ChevronDown, ChevronRight, Copy, Download, FileCode2, Folder,
  FolderOpen, Info, ListRestart, MapPin, MoreHorizontal, Pencil, Plus, RefreshCw,
  Save, Search, SlidersHorizontal, Tags, Trash2, Ungroup, Upload, X,
} from "lucide-react";
import type { CadApp } from "@/cad/CadApp";
import { collectLibrarySelection } from "@/cad/library/LibraryManager";
import type { LibraryDefinition, LibraryGeometrySnapshot, LibraryUnits } from "@/cad/library/types";
import { PXOBJ_EXTENSION } from "@/cad/library/types";
import { detectDxfUnits, listDxfUnitOptions } from "@/cad/library/dxfImport";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LibraryGeometryPreview } from "@/components/cad/LibraryGeometryPreview";
import { cn } from "@/lib/utils";

interface Props {
  app: CadApp | null;
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
};

type Mode =
  | { kind: "none" }
  | { kind: "save" }
  | { kind: "edit"; id: string }
  | { kind: "svg"; svg: string; warnings: string[] }
  | { kind: "dxf"; dxf: string; detected: string };

const EMPTY_META: Meta = { name: "", category: "", tags: [], author: "", license: "", source: "", units: "m" };
const inputCls = "cad-settings-input h-11 w-full px-3 text-[12px]";
const selectCls = "cad-settings-select h-11 w-full px-3 text-[12px]";
const iconButtonCls = "h-9 w-9 shrink-0 border-border/80 text-muted-foreground hover:text-foreground";

function fileSafe(name: string) {
  return (name || "bibliotheksobjekt").replace(/[^\w\-]+/g, "_");
}

function menuIconClass() {
  return "mr-2 h-4 w-4";
}

export default function LibraryPanel({ app, onlyWhenInstance }: Props) {
  const [defs, setDefs] = useState<LibraryDefinition[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [mode, setMode] = useState<Mode>({ kind: "none" });
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [replaceOriginal, setReplaceOriginal] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [svgUnits, setSvgUnits] = useState(1000);
  const [dxfUnits, setDxfUnits] = useState(1000);
  const [selInfo, setSelInfo] = useState<{ count: number; unsupported: string[] }>({ count: 0, unsupported: [] });
  const [selectionGeometry, setSelectionGeometry] = useState<LibraryGeometrySnapshot[]>([]);
  const [instanceDefId, setInstanceDefId] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const importRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<HTMLInputElement>(null);
  const dxfRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!app) return;
    const sync = () => setDefs([...(app.libraryDefinitions || [])]);
    sync();
    const previous = app.onLibraryChange;
    app.onLibraryChange = () => { previous?.(); sync(); };
    return () => { app.onLibraryChange = previous; };
  }, [app]);

  useEffect(() => {
    if (!app) return;
    let lastSelectionKey = "";
    const timer = window.setInterval(() => {
      try {
        const selection = collectLibrarySelection(app);
        const selectionKey = selection.refs.map((ref) => `${ref.kind}:${ref.id}`).join("|");
        setSelInfo({ count: selection.snapshots.length, unsupported: selection.unsupported });
        if (selectionKey !== lastSelectionKey) {
          lastSelectionKey = selectionKey;
          setSelectionGeometry(selection.snapshots);
        }
        const instance = app.getSelectedLibraryInstance();
        const definitionId = instance ? String((instance as { definitionId: string }).definitionId) : null;
        setInstanceDefId(definitionId);
        setPlacingId(app.libraryTool?.activeDefinitionId || null);
        if (definitionId) setSelectedId(definitionId);
      } catch { /* Auswahlabfrage darf die Oberfläche nicht unterbrechen. */ }
    }, 150);
    return () => window.clearInterval(timer);
  }, [app]);

  const metaFromDefinition = useCallback((definition: LibraryDefinition): Meta => ({
    name: definition.name,
    category: definition.category || "",
    tags: [...(definition.tags || [])],
    author: definition.metadata?.author || "",
    license: definition.metadata?.license || "",
    source: definition.metadata?.source || "",
    units: definition.units || "m",
  }), []);

  const categories = useMemo(
    () => [...new Set(defs.map((definition) => definition.category || "Ohne Kategorie"))].sort((a, b) => a.localeCompare(b, "de")),
    [defs],
  );
  const allTags = useMemo(
    () => [...new Set(defs.flatMap((definition) => definition.tags || []))].sort((a, b) => a.localeCompare(b, "de")),
    [defs],
  );
  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return defs.filter((definition) => {
      if (category && (definition.category || "Ohne Kategorie") !== category) return false;
      if (tag && !definition.tags.includes(tag)) return false;
      if (!normalizedQuery) return true;
      return definition.name.toLowerCase().includes(normalizedQuery)
        || (definition.category || "").toLowerCase().includes(normalizedQuery)
        || (definition.tags || []).some((item) => item.toLowerCase().includes(normalizedQuery));
    });
  }, [defs, query, category, tag]);
  const groupedDefinitions = useMemo(() => categories.map((name) => ({
    name,
    definitions: visible.filter((definition) => (definition.category || "Ohne Kategorie") === name),
    total: defs.filter((definition) => (definition.category || "Ohne Kategorie") === name).length,
  })).filter((group) => group.definitions.length > 0), [categories, defs, visible]);
  const selectedDefinition = defs.find((definition) => definition.id === selectedId) ?? null;
  const editedDefinition = mode.kind === "edit" ? defs.find((definition) => definition.id === mode.id) ?? null : null;

  useEffect(() => {
    if (openCategories.size > 0 || groupedDefinitions.length === 0) return;
    setOpenCategories(new Set([groupedDefinitions[0].name]));
  }, [groupedDefinitions, openCategories.size]);

  if (!app) return null;
  if (onlyWhenInstance && !instanceDefId) return null;

  const buildMeta = () => ({ ...meta });
  const closeEditor = () => { setMode({ kind: "none" }); setMeta(EMPTY_META); setTagDraft(""); };
  const openSave = () => {
    setReplaceOriginal(false);
    setMeta({ ...EMPTY_META, name: `Bibliotheksobjekt ${defs.length + 1}` });
    setMode({ kind: "save" });
  };
  const openEdit = (definition: LibraryDefinition) => {
    setSelectedId(definition.id);
    setMeta(metaFromDefinition(definition));
    setMode({ kind: "edit", id: definition.id });
  };
  const addTag = (raw: string) => {
    const next = raw.trim();
    if (!next) return;
    setMeta((current) => current.tags.includes(next) ? current : { ...current, tags: [...current.tags, next] });
    setTagDraft("");
  };
  const download = (name: string, text: string, type: string) => {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };
  const saveSelection = () => {
    const result = replaceOriginal
      ? app.convertSelectionToLibraryObject(buildMeta())
      : app.addLibraryDefinitionFromSelection(buildMeta());
    if (!result.definition) { window.alert("Keine unterstützten Objekte in der Auswahl."); return; }
    if (result.unsupported.length) window.alert("Diese Objekte wurden NICHT gespeichert:\n• " + result.unsupported.join("\n• "));
    setSelectedId(result.definition.id);
    closeEditor();
  };
  const saveSvg = (svg: string) => {
    const result = app.importLibraryDefinitionFromSvg(svg, buildMeta(), svgUnits);
    if (!result.definition) { window.alert("SVG konnte nicht importiert werden:\n• " + (result.warnings.join("\n• ") || "Unbekannter Fehler")); return; }
    if (result.warnings.length) window.alert("SVG importiert. Hinweise:\n• " + result.warnings.join("\n• "));
    setSelectedId(result.definition.id);
    closeEditor();
  };
  const saveDxf = (dxf: string) => {
    const result = app.importLibraryDefinitionFromDxf(dxf, buildMeta(), dxfUnits);
    if (!result.definition) { window.alert("DXF konnte nicht importiert werden:\n• " + (result.failed || result.warnings.join("\n• ") || "Unbekannter Fehler")); return; }
    if (result.warnings.length) window.alert("DXF importiert. Hinweise:\n• " + result.warnings.join("\n• "));
    setSelectedId(result.definition.id);
    closeEditor();
  };
  const beginPlacement = (definition: LibraryDefinition) => {
    setSelectedId(definition.id);
    app.beginLibraryPlacement(definition.id);
  };
  const removeDefinition = (definition: LibraryDefinition) => {
    if (!window.confirm(`„${definition.name}“ löschen? Platzierte Exemplare werden ebenfalls entfernt.`)) return;
    app.removeLibraryDefinition(definition.id);
    if (selectedId === definition.id) setSelectedId(null);
    if (mode.kind === "edit" && mode.id === definition.id) closeEditor();
  };
  const exportPxobj = (definition: LibraryDefinition) => {
    const json = app.exportLibraryDefinition(definition.id);
    if (json) download(`${fileSafe(definition.name)}${PXOBJ_EXTENSION}`, json, "application/json");
  };
  const exportSvg = (definition: LibraryDefinition) => {
    const svg = app.exportLibraryDefinitionSvg(definition.id);
    if (svg) download(`${fileSafe(definition.name)}.svg`, svg, "image/svg+xml");
  };
  const exportDxf = (definition: LibraryDefinition) => {
    const result = app.exportLibraryDefinitionDxf(definition.id);
    if (!result) return;
    download(`${fileSafe(definition.name)}.dxf`, result.dxf, "image/vnd.dxf");
    if (result.warnings.length) window.alert("DXF exportiert. Hinweise:\n• " + result.warnings.join("\n• "));
  };

  const DefinitionMenu = ({ definition }: { definition: LibraryDefinition }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className={iconButtonCls} aria-label={`Weitere Aktionen für ${definition.name}`} title="Weitere Aktionen">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="library-menu w-52">
        <DropdownMenuItem onSelect={() => openEdit(definition)}><Pencil className={menuIconClass()} />Bearbeiten</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => exportPxobj(definition)}><Download className={menuIconClass()} />Pixuna-Datei exportieren</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportSvg(definition)}><FileCode2 className={menuIconClass()} />Als SVG exportieren</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportDxf(definition)}><FileCode2 className={menuIconClass()} />Als DXF exportieren</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => removeDefinition(definition)}><Trash2 className={menuIconClass()} />Löschen</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const tagEditor = (
    <div className="space-y-2">
      <label>Tags</label>
      <div className="flex flex-wrap gap-1.5">
        {meta.tags.map((item) => (
          <Button key={item} type="button" variant="outline" size="sm" className="library-tag active" onClick={() => setMeta((current) => ({ ...current, tags: current.tags.filter((tagItem) => tagItem !== item) }))} title="Tag entfernen">
            {item}<X className="h-3.5 w-3.5" />
          </Button>
        ))}
        <div className="flex min-w-[132px] flex-1">
          <input type="text" className={`${inputCls} rounded-r-none`} placeholder="Tag hinzufügen" value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(tagDraft); } }} />
          <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-l-none" onClick={() => addTag(tagDraft)} aria-label="Tag hinzufügen"><Plus /></Button>
        </div>
      </div>
      {allTags.filter((item) => !meta.tags.includes(item)).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.filter((item) => !meta.tags.includes(item)).slice(0, 8).map((item) => (
            <Button key={item} type="button" variant="ghost" size="sm" className="library-tag" onClick={() => addTag(item)}>+ {item}</Button>
          ))}
        </div>
      )}
    </div>
  );

  const coreFields = (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_76px] gap-3 max-[260px]:grid-cols-1">
        <div className="space-y-1.5">
          <label>Name</label>
          <input type="text" className={inputCls} placeholder="Name" value={meta.name} onChange={(event) => setMeta({ ...meta, name: event.target.value })} />
        </div>
        <LibraryGeometryPreview geometry={editedDefinition?.geometry ?? selectionGeometry} label={meta.name || "Bibliotheksobjekt"} className="h-[76px] w-[76px] max-[260px]:w-full" />
      </div>
      <div className="space-y-1.5">
        <label>Kategorie</label>
        <input type="text" className={inputCls} list="library-categories" placeholder="Kategorie wählen oder eingeben" value={meta.category} onChange={(event) => setMeta({ ...meta, category: event.target.value })} />
        <datalist id="library-categories">{categories.filter((item) => item !== "Ohne Kategorie").map((item) => <option key={item} value={item} />)}</datalist>
      </div>
      {tagEditor}
    </>
  );

  const additionalFields = (
    <Accordion type="single" collapsible className="library-details-accordion">
      <AccordionItem value="details">
        <AccordionTrigger className="py-3 text-left text-[12px] hover:no-underline">
          <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-muted-foreground" /><span><strong className="block text-foreground">Zusatzinformationen</strong><small className="text-[10px] font-normal text-muted-foreground">Autor, Lizenz, Quelle, Maßeinheit</small></span></span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 pt-2">
          <div><label>Autor</label><input type="text" className={inputCls} placeholder="Autor" value={meta.author} onChange={(event) => setMeta({ ...meta, author: event.target.value })} /></div>
          <div><label>Lizenz</label><input type="text" className={inputCls} placeholder="Lizenz" value={meta.license} onChange={(event) => setMeta({ ...meta, license: event.target.value })} /></div>
          <div><label>Quelle</label><input type="text" className={inputCls} placeholder="Quelle" value={meta.source} onChange={(event) => setMeta({ ...meta, source: event.target.value })} /></div>
          <div><label>Maßeinheit</label><select className={selectCls} value={meta.units} onChange={(event) => setMeta({ ...meta, units: event.target.value as LibraryUnits })}><option value="mm">Millimeter</option><option value="cm">Zentimeter</option><option value="m">Meter</option></select></div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );

  const editorHeader = (title: string, subtitle: string) => (
    <div className="library-editor-header">
      <Button type="button" variant="outline" size="icon" className={iconButtonCls} onClick={closeEditor} aria-label="Zurück" title="Zurück"><ArrowLeft /></Button>
      <div className="min-w-0">
        <h3 className="truncate text-[15px] font-semibold">{title}</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );

  if (mode.kind === "save" || mode.kind === "edit") {
    const isSave = mode.kind === "save";
    return (
      <section className="cad-settings-panel library-panel mb-2" aria-label={isSave ? "Bibliotheksobjekt speichern" : "Bibliotheksobjekt bearbeiten"}>
        <div className="library-title">Bibliothek</div>
        {editorHeader(
          isSave ? "Bibliotheksobjekt speichern" : "Bibliotheksobjekt bearbeiten",
          isSave ? `Auswahl: ${selInfo.count} ${selInfo.count === 1 ? "Objekt" : "Objekte"} · ${replaceOriginal ? "Original wird ersetzt" : "Original bleibt erhalten"}` : "Angaben gelten für alle platzierten Exemplare",
        )}
        {isSave && <Button type="button" variant="ghost" size="sm" className="library-change-selection" onClick={closeEditor}><ListRestart />Auswahl ändern</Button>}
        <div className="library-editor-body">
          {isSave && (
            <>
              <div className="library-mode-switch" role="group" aria-label="Speichermodus">
                <Button type="button" variant={replaceOriginal ? "ghost" : "default"} className={cn("h-auto min-h-12 flex-1 whitespace-normal px-3 py-2 text-left", !replaceOriginal && "library-primary")} onClick={() => setReplaceOriginal(false)}><Copy />Kopie als Bibliotheksobjekt</Button>
                <Button type="button" variant={replaceOriginal ? "default" : "ghost"} className={cn("h-auto min-h-12 flex-1 whitespace-normal px-3 py-2 text-left", replaceOriginal && "library-primary")} onClick={() => setReplaceOriginal(true)}><RefreshCw />Original als Bibliotheksobjekt</Button>
              </div>
              <p className="library-help-text">{replaceOriginal ? "Die Auswahl wird durch ein gemeinsames Bibliotheksobjekt ersetzt." : "Es wird eine neue, unabhängige Bibliothekskopie erstellt."}</p>
            </>
          )}
          <div className="library-form-section">{coreFields}</div>
          {additionalFields}
          <div className="library-insertion-info">
            <MapPin className="h-5 w-5 text-primary" />
            <div><strong>Einfügepunkt</strong><span>Mittelpunkt der Auswahl</span><small>Wird beim Platzieren als Dreh- und Fangpunkt verwendet.</small></div>
          </div>
          {isSave && selInfo.unsupported.length > 0 && <p className="text-[11px] leading-relaxed text-destructive">Nicht unterstützt: {selInfo.unsupported.join(", ")}</p>}
          <Button type="button" className="library-primary h-12 w-full text-[13px] font-semibold" onClick={() => {
            if (isSave) { saveSelection(); return; }
            app.updateLibraryDefinitionMeta(mode.id, buildMeta());
            closeEditor();
          }}><Save />{isSave ? "Bibliotheksobjekt speichern" : "Änderungen speichern"}</Button>
          <Button type="button" variant="ghost" className="h-10 w-full" onClick={closeEditor}>Abbrechen</Button>
        </div>
        {instanceDefId && (
          <div className="library-separated-action">
            <Button type="button" variant="ghost" className="w-full" onClick={() => { if (!app.explodeSelectedLibraryInstance()) window.alert("Das Bibliotheksobjekt konnte nicht aufgelöst werden."); }}><Ungroup />Auflösen</Button>
          </div>
        )}
      </section>
    );
  }

  if (mode.kind === "svg" || mode.kind === "dxf") {
    const isSvg = mode.kind === "svg";
    return (
      <section className="cad-settings-panel library-panel mb-2">
        <div className="library-title">Bibliothek</div>
        {editorHeader(`${isSvg ? "SVG" : "DXF"} importieren`, "Als neues Bibliotheksobjekt anlegen")}
        <div className="library-editor-body">
          <div className="library-form-section space-y-3">
            {!isSvg && <p className="library-help-text">Erkannte Einheit: {mode.detected}</p>}
            <div><label>{isSvg ? "SVG-Einheiten pro Meter" : "Einheit der Zeichnung"}</label>{isSvg
              ? <input type="text" inputMode="numeric" className={inputCls} value={String(svgUnits)} onChange={(event) => setSvgUnits(Math.max(1, parseFloat(event.target.value) || 1))} />
              : <select className={selectCls} value={String(dxfUnits)} onChange={(event) => setDxfUnits(parseFloat(event.target.value) || 1000)}>{listDxfUnitOptions().map((option) => <option key={option.code} value={String(option.unitsPerMeter)}>{option.label}</option>)}</select>}
            </div>
            {coreFields}
          </div>
          {additionalFields}
          {isSvg && mode.warnings.length > 0 && <p className="library-help-text">Hinweise: {mode.warnings.join(" · ")}</p>}
          <Button type="button" className="library-primary h-12 w-full" onClick={() => isSvg ? saveSvg(mode.svg) : saveDxf(mode.dxf)}><Save />Als Bibliotheksobjekt anlegen</Button>
          <Button type="button" variant="ghost" className="h-10 w-full" onClick={closeEditor}>Abbrechen</Button>
        </div>
      </section>
    );
  }

  return (
    <section className="cad-settings-panel library-panel mb-2" aria-label="Bibliothek">
      <div className="library-title">Bibliothek</div>
      <Button type="button" className="library-primary h-11 w-full text-[12px] font-semibold" disabled={selInfo.count === 0} onClick={openSave}><Plus />Bibliotheksobjekt speichern</Button>
      {selInfo.count === 0 && <p className="library-help-text px-1">Objekte auf der Zeichenfläche auswählen, um sie zu speichern.</p>}

      <div className="library-toolbar">
        <label className="library-search">
          <Search className="h-4 w-4" />
          <input type="text" placeholder="Suchen …" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label className="library-filter">
          <Folder className="h-4 w-4" />
          <select aria-label="Kategorie filtern" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Kategorie</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <ChevronDown className="h-3.5 w-3.5" />
        </label>
        <label className="library-filter">
          <Tags className="h-4 w-4" />
          <select aria-label="Tags filtern" value={tag} onChange={(event) => setTag(event.target.value)}><option value="">Tags</option>{allTags.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <ChevronDown className="h-3.5 w-3.5" />
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className={iconButtonCls} aria-label="Weitere Bibliotheksaktionen"><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="library-menu w-52">
            <DropdownMenuLabel>{defs.length} Bibliotheksobjekte</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => { setQuery(""); setCategory(""); setTag(""); }}><RefreshCw className={menuIconClass()} />Filter zurücksetzen</DropdownMenuItem>
            {placingId && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => app.cancelLibraryPlacement()}><X className={menuIconClass()} />Platzierung beenden</DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button type="button" variant="outline" className="h-10 w-full"><Upload />Importieren<ChevronDown className="ml-auto" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="library-menu w-[var(--radix-dropdown-menu-trigger-width)] min-w-56">
          <DropdownMenuItem onSelect={() => importRef.current?.click()}><Upload className={menuIconClass()} />Pixuna-Datei importieren</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => svgRef.current?.click()}><FileCode2 className={menuIconClass()} />SVG importieren</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => dxfRef.current?.click()}><FileCode2 className={menuIconClass()} />DXF importieren</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input ref={importRef} type="file" accept=".pxobj,application/json" className="hidden" multiple onChange={async (event) => {
        const files = Array.from(event.target.files || []);
        let imported = 0;
        for (const file of files) { try { if (app.importLibraryDefinition(await file.text())) imported += 1; } catch { /* ungültige Datei */ } }
        if (imported === 0 && files.length) window.alert("Keine gültige .pxobj-Datei gefunden.");
        event.target.value = "";
      }} />
      <input ref={svgRef} type="file" accept=".svg,image/svg+xml" className="hidden" onChange={async (event) => {
        const file = (event.target.files || [])[0]; event.target.value = ""; if (!file) return;
        setMeta({ ...EMPTY_META, name: file.name.replace(/\.svg$/i, "") });
        setMode({ kind: "svg", svg: await file.text(), warnings: [] });
      }} />
      <input ref={dxfRef} type="file" accept=".dxf,image/vnd.dxf,application/dxf" className="hidden" onChange={async (event) => {
        const file = (event.target.files || [])[0]; event.target.value = ""; if (!file) return;
        const text = await file.text();
        const info = detectDxfUnits(text);
        setDxfUnits(info.unitsPerMeter);
        setMeta({ ...EMPTY_META, name: file.name.replace(/\.dxf$/i, "") });
        setMode({ kind: "dxf", dxf: text, detected: info.label });
      }} />

      <div className="library-tree">
        <button type="button" className="library-folder-row" onClick={() => setLibraryOpen((open) => !open)} aria-expanded={libraryOpen}>
          {libraryOpen ? <ChevronDown /> : <ChevronRight />} {libraryOpen ? <FolderOpen /> : <Folder />}
          <strong>Meine Bibliothek</strong><span>({visible.length})</span>
        </button>
        {libraryOpen && groupedDefinitions.map((group) => {
          const open = openCategories.has(group.name);
          return (
            <div key={group.name} className="library-category-group">
              <button type="button" className="library-folder-row library-category-row" onClick={() => setOpenCategories((current) => {
                const next = new Set(current);
                if (next.has(group.name)) next.delete(group.name); else next.add(group.name);
                return next;
              })} aria-expanded={open}>
                {open ? <ChevronDown /> : <ChevronRight />} {open ? <FolderOpen /> : <Folder />}
                <strong>{group.name}</strong><span>({group.total})</span>
              </button>
              {open && <div className="library-object-list">{group.definitions.map((definition) => {
                const selected = selectedId === definition.id;
                return (
                  <div key={definition.id} className={cn("library-object-row", selected && "selected")} onClick={() => setSelectedId(definition.id)}>
                    <LibraryGeometryPreview geometry={definition.geometry} label={definition.name} className="h-11 w-11 shrink-0" />
                    <div className="min-w-0 flex-1"><strong className="block truncate text-[12px]">{definition.name}</strong><span className="block truncate text-[10px] text-muted-foreground">{[definition.category, ...(definition.tags || [])].filter(Boolean).join(" · ") || "Ohne Kategorie"}</span></div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary" onClick={(event) => { event.stopPropagation(); beginPlacement(definition); }} aria-label={`${definition.name} platzieren`} title="Platzieren"><MapPin /></Button>
                    <span onClick={(event) => event.stopPropagation()}><DefinitionMenu definition={definition} /></span>
                  </div>
                );
              })}</div>}
            </div>
          );
        })}
        {visible.length === 0 && <div className="py-8 text-center text-[11px] text-muted-foreground">Keine Bibliotheksobjekte gefunden</div>}
      </div>

      {instanceDefId && <Button type="button" variant="outline" className="h-10 w-full" onClick={() => { if (!app.explodeSelectedLibraryInstance()) window.alert("Das Bibliotheksobjekt konnte nicht aufgelöst werden."); }}><Ungroup />Ausgewählte Instanz auflösen</Button>}

      {selectedDefinition && (
        <div className="library-selected-bar">
          <LibraryGeometryPreview geometry={selectedDefinition.geometry} label={selectedDefinition.name} className="h-11 w-11 shrink-0" />
          <div className="min-w-0 flex-1"><strong className="block truncate text-[12px]">{selectedDefinition.name}</strong><span className="block truncate text-[10px] text-muted-foreground">{selectedDefinition.category || "Ohne Kategorie"}</span></div>
          <Button type="button" className="library-primary h-10 px-3 text-[12px]" onClick={() => beginPlacement(selectedDefinition)}><MapPin />Platzieren</Button>
          <DefinitionMenu definition={selectedDefinition} />
        </div>
      )}
      <div className="library-footer"><Info /><span>Objekte per Auswahl speichern und präzise platzieren.</span><strong>{defs.length}</strong></div>
    </section>
  );
}
