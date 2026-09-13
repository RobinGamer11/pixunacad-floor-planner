import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Download, Pencil, Plus, Trash2, Upload, Ungroup } from "lucide-react";
import type { CadApp } from "@/cad/CadApp";
import type { LibraryDefinition, LibraryUnits } from "@/cad/library/types";
import { PXOBJ_EXTENSION } from "@/cad/library/types";

interface Props {
  app: CadApp | null;
}

type Meta = {
  name: string;
  category: string;
  tags: string;
  author: string;
  license: string;
  source: string;
  units: LibraryUnits;
  insertion: "center" | "origin";
};

const EMPTY_META: Meta = {
  name: "", category: "", tags: "", author: "", license: "", source: "",
  units: "m", insertion: "center",
};

/**
 * Bibliothek (nur eigenständige CAD-Oberfläche).
 * Speichern aus Auswahl, Suche/Kategorien/Tags, Platzieren, Auflösen,
 * Umbenennen, Löschen sowie Import/Export im Pixuna-Format (.pxobj).
 */
export default function LibraryPanel({ app }: Props) {
  const [defs, setDefs] = useState<LibraryDefinition[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [selInfo, setSelInfo] = useState<{ count: number; unsupported: string[] }>({ count: 0, unsupported: [] });
  const [hasInstance, setHasInstance] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!app) return;
    const sync = () => setDefs([...(app.libraryDefinitions || [])]);
    sync();
    const prev = app.onLibraryChange;
    app.onLibraryChange = () => { prev?.(); sync(); };
    return () => { app.onLibraryChange = prev; };
  }, [app]);

  // Auswahlstatus regelmäßig auffrischen (Canvas-Auswahl ist nicht reaktiv).
  useEffect(() => {
    if (!app) return;
    const t = window.setInterval(() => {
      try {
        setSelInfo(app.getLibrarySelectionInfo());
        setHasInstance(!!app.getSelectedLibraryInstance());
      } catch { /* ignore */ }
    }, 400);
    return () => window.clearInterval(t);
  }, [app]);

  const categories = useMemo(
    () => [...new Set(defs.map(d => d.category).filter(Boolean))].sort(),
    [defs],
  );
  const tags = useMemo(
    () => [...new Set(defs.flatMap(d => d.tags))].sort(),
    [defs],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return defs.filter(d => {
      if (category && d.category !== category) return false;
      if (tag && !d.tags.includes(tag)) return false;
      if (!q) return true;
      return d.name.toLowerCase().includes(q)
        || d.category.toLowerCase().includes(q)
        || d.tags.some(t => t.toLowerCase().includes(q));
    });
  }, [defs, query, category, tag]);

  if (!app) return null;

  const buildMeta = () => ({
    name: meta.name,
    category: meta.category,
    tags: meta.tags.split(",").map(t => t.trim()).filter(Boolean),
    units: meta.units,
    author: meta.author,
    license: meta.license,
    source: meta.source,
    insertionPointWorld: meta.insertion === "origin" ? { x: 0, y: 0 } : null,
  });

  const report = (res: { definition: LibraryDefinition | null; unsupported: string[] }) => {
    if (!res.definition) {
      window.alert("Keine unterstützten Objekte in der Auswahl.");
      return false;
    }
    if (res.unsupported.length) {
      window.alert("Nicht unterstützte Objekte wurden NICHT gespeichert:\n• " + res.unsupported.join("\n• "));
    }
    setDialogOpen(false);
    setMeta(EMPTY_META);
    return true;
  };

  const download = (name: string, text: string) => {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="cad-settings-panel mb-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
        Bibliothek
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => {
            setMeta({ ...EMPTY_META, name: `Bibliotheksobjekt ${defs.length + 1}` });
            setDialogOpen(true);
          }}
          disabled={selInfo.count === 0}
          className="cad-toolbar-btn w-full justify-center h-11 text-[13px] font-semibold disabled:opacity-50"
          style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
          title="Aktuelle Auswahl als Bibliotheksobjekt speichern"
        >
          <Plus className="h-4 w-4" /> <span>Aus Auswahl speichern{selInfo.count ? ` (${selInfo.count})` : ""}</span>
        </button>

        {hasInstance && (
          <button
            type="button"
            onClick={() => {
              if (!app.explodeSelectedLibraryInstance()) window.alert("Das Bibliotheksobjekt konnte nicht aufgelöst werden.");
            }}
            className="cad-toolbar-btn w-full justify-center h-9 text-xs font-semibold"
            title="Ausgewähltes Bibliotheksobjekt dauerhaft in normale CAD-Objekte auflösen"
          >
            <Ungroup className="h-4 w-4" /> <span>Auflösen</span>
          </button>
        )}

        {dialogOpen && (
          <div className="rounded-md border p-2 space-y-2" style={{ borderColor: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.08)" }}>
            <input className="cad-settings-input w-full" placeholder="Name" value={meta.name} onChange={e => setMeta({ ...meta, name: e.target.value })} />
            <input className="cad-settings-input w-full" placeholder="Kategorie" value={meta.category} onChange={e => setMeta({ ...meta, category: e.target.value })} />
            <input className="cad-settings-input w-full" placeholder="Tags (Komma-getrennt)" value={meta.tags} onChange={e => setMeta({ ...meta, tags: e.target.value })} />
            <input className="cad-settings-input w-full" placeholder="Autor" value={meta.author} onChange={e => setMeta({ ...meta, author: e.target.value })} />
            <input className="cad-settings-input w-full" placeholder="Lizenz" value={meta.license} onChange={e => setMeta({ ...meta, license: e.target.value })} />
            <input className="cad-settings-input w-full" placeholder="Quelle" value={meta.source} onChange={e => setMeta({ ...meta, source: e.target.value })} />
            <div className="flex gap-2">
              <select className="cad-settings-select flex-1" value={meta.units} onChange={e => setMeta({ ...meta, units: e.target.value as LibraryUnits })}>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="m">m</option>
              </select>
              <select className="cad-settings-select flex-1" value={meta.insertion} onChange={e => setMeta({ ...meta, insertion: e.target.value as Meta["insertion"] })}>
                <option value="center">Einfügepunkt: Mitte</option>
                <option value="origin">Einfügepunkt: Nullpunkt</option>
              </select>
            </div>
            {selInfo.unsupported.length > 0 && (
              <div className="text-[11px]" style={{ color: "hsl(var(--destructive))" }}>
                Nicht unterstützt: {selInfo.unsupported.join(", ")}
              </div>
            )}
            <div className="flex gap-1">
              <button type="button" className="cad-toolbar-btn flex-1 justify-center h-8 text-xs"
                onClick={() => report(app.addLibraryDefinitionFromSelection(buildMeta()))}>
                Zur Bibliothek hinzufügen
              </button>
              <button type="button" className="cad-toolbar-btn flex-1 justify-center h-8 text-xs"
                onClick={() => report(app.convertSelectionToLibraryObject(buildMeta()))}>
                In Bibliotheksobjekt umwandeln
              </button>
            </div>
            <button type="button" className="cad-toolbar-btn w-full justify-center h-7 text-xs" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </button>
          </div>
        )}

        <div className="rounded-md border p-2 space-y-2" style={{ borderColor: "hsl(var(--hairline))" }}>
          <input className="cad-settings-input w-full" placeholder="Suchen…" value={query} onChange={e => setQuery(e.target.value)} />
          <div className="flex gap-2">
            <select className="cad-settings-select flex-1" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Alle Kategorien</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="cad-settings-select flex-1" value={tag} onChange={e => setTag(e.target.value)}>
              <option value="">Alle Tags</option>
              {tags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-md border p-2" style={{ borderColor: "hsl(var(--hairline))" }}>
          <div className="flex gap-1">
            <button type="button" className="cad-toolbar-btn flex-1 justify-center h-8 text-xs" title="Alle als .pxobj exportieren (einzeln)"
              onClick={() => {
                if (visible.length === 0) return;
                for (const d of visible) {
                  const json = app.exportLibraryDefinition(d.id);
                  if (json) download(`${d.name.replace(/[^\w\-]+/g, "_")}${PXOBJ_EXTENSION}`, json);
                }
              }}>
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <button type="button" className="cad-toolbar-btn flex-1 justify-center h-8 text-xs" onClick={() => importRef.current?.click()} title="Pixuna-Datei importieren">
              <Upload className="h-3.5 w-3.5" /> Import
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
          </div>
        </div>

        <div className="rounded-md border p-2" style={{ borderColor: "hsl(var(--hairline))" }}>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {visible.length === 0 && (
              <div className="text-xs text-center py-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                Noch keine Bibliotheksobjekte
              </div>
            )}
            {visible.map(d => {
              const isActive = app.libraryTool?.activeDefinitionId === d.id;
              return (
                <div key={d.id} className="flex items-center gap-1">
                  <button type="button" onClick={() => app.beginLibraryPlacement(d.id)}
                    className={`cad-toolbar-btn flex-1 justify-start h-8 text-xs ${isActive ? "active" : ""}`} title="Platzieren">
                    <Boxes className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{d.name}</span>
                  </button>
                  <button type="button" className="cad-toolbar-btn h-8 w-8 justify-center px-0" title="Umbenennen"
                    onClick={() => {
                      const next = window.prompt("Bibliotheksobjekt umbenennen:", d.name);
                      if (next && next.trim()) app.renameLibraryDefinition(d.id, next);
                    }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="cad-toolbar-btn h-8 w-8 justify-center px-0" title="Als .pxobj exportieren"
                    onClick={() => {
                      const json = app.exportLibraryDefinition(d.id);
                      if (json) download(`${d.name.replace(/[^\w\-]+/g, "_")}${PXOBJ_EXTENSION}`, json);
                    }}>
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="cad-toolbar-btn h-8 w-8 justify-center px-0" title="Löschen"
                    onClick={() => {
                      if (window.confirm(`"${d.name}" löschen? Platzierte Instanzen werden ebenfalls entfernt.`)) {
                        app.removeLibraryDefinition(d.id);
                      }
                    }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
