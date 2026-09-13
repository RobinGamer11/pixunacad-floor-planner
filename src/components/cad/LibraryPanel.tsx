import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Download, FileCode2, Pencil, Plus, Save, Trash2, Upload, Ungroup, X } from "lucide-react";
import type { CadApp } from "@/cad/CadApp";
import type { LibraryDefinition, LibraryUnits } from "@/cad/library/types";
import { PXOBJ_EXTENSION } from "@/cad/library/types";
import { detectDxfUnits, listDxfUnitOptions } from "@/cad/library/dxfImport";


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
};

const EMPTY_META: Meta = {
  name: "", category: "", tags: [], author: "", license: "", source: "", units: "m",
};

type Mode =
  | { kind: "none" }
  | { kind: "save" }
  | { kind: "edit"; id: string }
  | { kind: "svg"; svg: string; warnings: string[] }
  | { kind: "dxf"; dxf: string; detected: string };

const inputCls = "cad-settings-input w-full h-10 text-[12px] px-3";
const selectCls = "cad-settings-select w-full h-10 text-[12px] px-3";


function fileSafe(name: string) {
  return (name || "bibliotheksobjekt").replace(/[^\w\-]+/g, "_");
}

/**
 * Bibliothek — nur eigenständige CAD-Oberfläche.
 * Speichern aus Auswahl (Kopie/Original), Suche, Kategorien, Tags,
 * Platzieren, Bearbeiten, Auflösen sowie .pxobj- und SVG-Austausch.
 */
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
  const [instanceDefId, setInstanceDefId] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<HTMLInputElement>(null);
  const dxfRef = useRef<HTMLInputElement>(null);
  const lastInstanceDef = useRef<string | null>(null);


  useEffect(() => {
    if (!app) return;
    const sync = () => setDefs([...(app.libraryDefinitions || [])]);
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
        const defId = inst ? (inst as any).definitionId as string : null;
        setInstanceDefId(defId);
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
  }), []);

  // Klick auf eine Instanz öffnet automatisch deren Definition zum Bearbeiten.
  useEffect(() => {
    if (!app) return;
    if (instanceDefId && instanceDefId !== lastInstanceDef.current) {
      const d = app.getLibraryDefinition(instanceDefId);
      if (d) { setMeta(metaFromDefinition(d)); setMode({ kind: "edit", id: d.id }); }
    }
    if (!instanceDefId && lastInstanceDef.current) {
      setMode((m) => (m.kind === "edit" ? { kind: "none" } : m));
    }
    lastInstanceDef.current = instanceDefId;
  }, [instanceDefId, app, metaFromDefinition]);

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
    return defs.filter((d) => {
      if (category && d.category !== category) return false;
      if (tag && !d.tags.includes(tag)) return false;
      if (!q) return true;
      return d.name.toLowerCase().includes(q)
        || (d.category || "").toLowerCase().includes(q)
        || (d.tags || []).some((t) => t.toLowerCase().includes(q));
    });
  }, [defs, query, category, tag]);

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
  });

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setMeta((m) => (m.tags.includes(t) ? m : { ...m, tags: [...m.tags, t] }));
    setTagDraft("");
  };

  const closeDialog = () => { setMode({ kind: "none" }); setMeta(EMPTY_META); setTagDraft(""); };

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
    closeDialog();
  };

  const saveSvg = (svg: string) => {
    const res = app.importLibraryDefinitionFromSvg(svg, buildMeta(), svgUnits);
    if (!res.definition) {
      window.alert("SVG konnte nicht importiert werden:\n• " + (res.warnings.join("\n• ") || "Unbekannter Fehler"));
      return;
    }
    if (res.warnings.length) {
      window.alert("SVG importiert. Hinweise:\n• " + res.warnings.join("\n• "));
    }
    closeDialog();
  };

  const saveDxf = (dxf: string) => {
    const res = app.importLibraryDefinitionFromDxf(dxf, buildMeta(), dxfUnits);
    if (!res.definition) {
      window.alert("DXF konnte nicht importiert werden:\n• " + (res.failed || res.warnings.join("\n• ") || "Unbekannter Fehler"));
      return;
    }
    if (res.warnings.length) {
      window.alert("DXF importiert. Hinweise:\n• " + res.warnings.join("\n• "));
    }
    closeDialog();
  };


  /* --------------------------------------------------------- Teilansichten */

  const tagEditor = (
    <div className="space-y-2">
      <label className="text-[12px]">Tags</label>
      {meta.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {meta.tags.map((t) => (
            <button key={t} type="button" onClick={() => setMeta((m) => ({ ...m, tags: m.tags.filter((x) => x !== t) }))}
              className="cad-toolbar-btn h-8 px-3 text-[12px] active" title="Tag entfernen">
              {t} <X className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}
      {allTags.filter((t) => !meta.tags.includes(t)).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.filter((t) => !meta.tags.includes(t)).map((t) => (
            <button key={t} type="button" onClick={() => addTag(t)} className="cad-toolbar-btn h-8 px-3 text-[12px]" title="Tag hinzufügen">
              + {t}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input type="text" className={inputCls} placeholder="Neuer Tag" value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(tagDraft); } }} />
        <button type="button" className="cad-toolbar-btn h-10 px-4 text-[12px]" onClick={() => addTag(tagDraft)}>Hinzufügen</button>
      </div>
    </div>
  );

  const metaFields = (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-[12px]">Name</label>
        <input type="text" className={inputCls} placeholder="Name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
      </div>
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
      <div className="space-y-1">
        <label className="text-[12px]">Autor</label>
        <input type="text" className={inputCls} placeholder="Autor" value={meta.author} onChange={(e) => setMeta({ ...meta, author: e.target.value })} />
      </div>
      <div className="space-y-1">
        <label className="text-[12px]">Lizenz</label>
        <input type="text" className={inputCls} placeholder="Lizenz" value={meta.license} onChange={(e) => setMeta({ ...meta, license: e.target.value })} />
      </div>
      <div className="space-y-1">
        <label className="text-[12px]">Quelle</label>
        <input type="text" className={inputCls} placeholder="Quelle" value={meta.source} onChange={(e) => setMeta({ ...meta, source: e.target.value })} />
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
  );

  return (
    <div className="cad-settings-panel mb-2">
      <div className="text-[12px] font-semibold uppercase tracking-[0.14em] mb-4" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
        Bibliothek
      </div>

      <div className="space-y-5">
        {/* ---------------------------------------------------- Speichern */}
        {mode.kind !== "edit" && mode.kind !== "svg" && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setMeta({ ...EMPTY_META, name: `Bibliotheksobjekt ${defs.length + 1}` });
                setMode({ kind: "save" });
              }}
              disabled={selInfo.count === 0}
              className="cad-toolbar-btn w-full justify-center h-12 text-[14px] font-semibold disabled:opacity-50"
              style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
            >
              <Plus className="h-5 w-5" />
              <span>Bibliotheksobjekt speichern{selInfo.count ? ` · ${selInfo.count} ${selInfo.count === 1 ? "Objekt" : "Objekte"}` : ""}</span>
            </button>
            {selInfo.count === 0 && (
              <div className="text-[12px] leading-relaxed" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                Wähle Objekte auf der Zeichenfläche aus — Klick, Shift-Klick oder Rahmenauswahl funktionieren hier wie im Auswahlwerkzeug.
              </div>
            )}
          </div>
        )}

        {mode.kind === "save" && (
          <div className="rounded-lg border p-3 space-y-4" style={{ borderColor: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.08)" }}>
            <div className="space-y-2">
              <button type="button" onClick={() => setReplaceOriginal(false)}
                className={`cad-toolbar-btn w-full justify-start h-11 text-[13px] font-semibold ${replaceOriginal ? "" : "active"}`}>
                Kopie als Bibliotheksobjekt
              </button>
              <div className="text-[12px] leading-relaxed pl-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                Die ausgewählten Originale bleiben auf dem Blatt.
              </div>
              <button type="button" onClick={() => setReplaceOriginal(true)}
                className={`cad-toolbar-btn w-full justify-start h-11 text-[13px] font-semibold ${replaceOriginal ? "active" : ""}`}>
                Original als Bibliotheksobjekt
              </button>
              <div className="text-[12px] leading-relaxed pl-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                Die ausgewählten Originale werden durch ein gemeinsames Bibliotheksobjekt ersetzt.
              </div>
            </div>

            {metaFields}

            {selInfo.unsupported.length > 0 && (
              <div className="text-[12px] leading-relaxed" style={{ color: "hsl(var(--destructive))" }}>
                Nicht unterstützt: {selInfo.unsupported.join(", ")}
              </div>
            )}

            <div className="space-y-2">
              <button type="button" className="cad-toolbar-btn w-full justify-center h-12 text-[14px] font-semibold"
                style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
                onClick={saveSelection}>
                <Save className="h-5 w-5" /> Speichern
              </button>
              <button type="button" className="cad-toolbar-btn w-full justify-center h-10 text-[12px]" onClick={closeDialog}>
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------ SVG-Dialog */}
        {mode.kind === "svg" && (
          <div className="rounded-lg border p-3 space-y-4" style={{ borderColor: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.08)" }}>
            <div className="text-[13px] font-semibold">SVG als Bibliotheksobjekt importieren</div>
            <div className="space-y-1">
              <label className="text-[12px]">Importgröße: SVG-Einheiten pro Meter</label>
              <input type="text" inputMode="numeric" className={inputCls} value={String(svgUnits)}
                onChange={(e) => setSvgUnits(Math.max(1, parseFloat(e.target.value) || 1))} />
            </div>
            {metaFields}
            {mode.warnings.length > 0 && (
              <div className="text-[12px] leading-relaxed" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                Hinweise: {mode.warnings.join(" · ")}
              </div>
            )}
            <div className="space-y-2">
              <button type="button" className="cad-toolbar-btn w-full justify-center h-12 text-[14px] font-semibold"
                style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
                onClick={() => saveSvg(mode.svg)}>
                <Save className="h-5 w-5" /> Als Bibliotheksobjekt anlegen
              </button>
              <button type="button" className="cad-toolbar-btn w-full justify-center h-10 text-[12px]" onClick={closeDialog}>
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {/* -------------------------------------------------- Bearbeiten */}
        {mode.kind === "edit" && (
          <div className="rounded-lg border p-3 space-y-4" style={{ borderColor: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.08)" }}>
            <div className="text-[13px] font-semibold">Bibliotheksobjekt bearbeiten</div>
            <div className="text-[12px] leading-relaxed" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              Änderungen gelten für alle platzierten Exemplare. Position, Drehung und Größe bleiben unverändert.
            </div>
            {metaFields}
            <div className="space-y-2">
              <button type="button" className="cad-toolbar-btn w-full justify-center h-12 text-[14px] font-semibold"
                style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
                onClick={() => {
                  if (mode.kind !== "edit") return;
                  app.updateLibraryDefinitionMeta(mode.id, buildMeta());
                  closeDialog();
                }}>
                <Save className="h-5 w-5" /> Änderungen speichern
              </button>
              <button type="button" className="cad-toolbar-btn w-full justify-center h-10 text-[12px]" onClick={closeDialog}>
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {/* --------------------------------------------------- Auflösen */}
        {instanceDefId && (
          <button
            type="button"
            onClick={() => { if (!app.explodeSelectedLibraryInstance()) window.alert("Das Bibliotheksobjekt konnte nicht aufgelöst werden."); }}
            className="cad-toolbar-btn w-full justify-center h-12 text-[14px] font-semibold"
          >
            <Ungroup className="h-5 w-5" /> Auflösen
          </button>
        )}

        {placingId && (
          <button type="button" onClick={() => app.cancelLibraryPlacement()}
            className="cad-toolbar-btn w-full justify-center h-10 text-[12px]">
            <X className="h-4 w-4" /> Platzierung beenden
          </button>
        )}

        {/* ------------------------------------------------------- Suche */}
        <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: "hsl(var(--cad-hub-border))" }}>
          <input type="text" className={inputCls} placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="space-y-2">
            <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Alle Kategorien</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className={selectCls} value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Alle Tags</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* --------------------------------------------------- Austausch */}
        <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "hsl(var(--cad-hub-border))" }}>
          <button type="button" className="cad-toolbar-btn w-full justify-center h-10 text-[12px]" onClick={() => importRef.current?.click()}>
            <Upload className="h-4 w-4" /> Pixuna-Datei importieren
          </button>
          <button type="button" className="cad-toolbar-btn w-full justify-center h-10 text-[12px]" onClick={() => svgRef.current?.click()}>
            <FileCode2 className="h-4 w-4" /> SVG importieren
          </button>
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
        </div>

        {/* ----------------------------------------------------- Liste */}
        <div className="space-y-3">
          {visible.length === 0 && (
            <div className="text-[12px] text-center py-6" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              Noch keine Bibliotheksobjekte
            </div>
          )}
          {visible.map((d) => (
            <div key={d.id} className="rounded-lg border p-3 space-y-3" style={{ borderColor: "hsl(var(--cad-hub-border))", background: "hsl(var(--cad-settings-bg))" }}>
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 shrink-0 rounded-md border flex items-center justify-center"
                  style={{ borderColor: "hsl(var(--cad-hub-border))" }}>
                  {d.preview?.thumbnail
                    ? <img src={d.preview.thumbnail} alt={d.name} className="h-full w-full object-contain rounded-md" />
                    : <Boxes className="h-6 w-6" style={{ color: "hsl(var(--cad-toolbar-muted))" }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">{d.name}</div>
                  <div className="text-[12px] truncate" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                    {d.category || "Ohne Kategorie"}
                  </div>
                  {d.tags?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.tags.map((t) => (
                        <span key={t} className="cad-kbd" style={{ minWidth: 0 }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button type="button" onClick={() => app.beginLibraryPlacement(d.id)}
                className={`cad-toolbar-btn w-full justify-center h-11 text-[13px] font-semibold ${placingId === d.id ? "active" : ""}`}>
                <Boxes className="h-4 w-4" /> Platzieren
              </button>

              <div className="grid grid-cols-3 gap-2">
                <button type="button" className="cad-toolbar-btn justify-center h-10 text-[12px]"
                  onClick={() => { setMeta(metaFromDefinition(d)); setMode({ kind: "edit", id: d.id }); }}>
                  <Pencil className="h-3.5 w-3.5" /> Bearbeiten
                </button>
                <button type="button" className="cad-toolbar-btn justify-center h-10 text-[12px]"
                  onClick={() => {
                    const json = app.exportLibraryDefinition(d.id);
                    if (json) download(`${fileSafe(d.name)}${PXOBJ_EXTENSION}`, json, "application/json");
                  }}>
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
                <button type="button" className="cad-toolbar-btn justify-center h-10 text-[12px]"
                  onClick={() => {
                    if (window.confirm(`„${d.name}“ löschen? Platzierte Exemplare werden ebenfalls entfernt.`)) {
                      app.removeLibraryDefinition(d.id);
                      setMode({ kind: "none" });
                    }
                  }}>
                  <Trash2 className="h-3.5 w-3.5" /> Löschen
                </button>
              </div>

              <button type="button" className="cad-toolbar-btn w-full justify-center h-10 text-[12px]"
                onClick={() => {
                  const svg = app.exportLibraryDefinitionSvg(d.id);
                  if (svg) download(`${fileSafe(d.name)}.svg`, svg, "image/svg+xml");
                }}>
                <FileCode2 className="h-3.5 w-3.5" /> Als SVG exportieren
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
