import React, { useMemo, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import {
  type DocumentFilter,
  type DocumentFilterMode,
  type FreeRemap,
  makeDefaultFilter,
  filterModeLabel,
  extractDominantColors,
} from "@/cad/documentFilters";
import { Plus, Trash2, Pencil, Check } from "lucide-react";

interface Props {
  app: CadApp | null;
  docId: string;
  /** Re-render-Trigger aus dem Polling. */
  sig: string;
}

const MODE_OPTIONS: DocumentFilterMode[] = ["bw", "grayscale", "tint", "free"];

export function DocumentFilterPanel({ app, docId, sig }: Props) {
  // Doc bei jedem Render frisch lesen (sig erzwingt Re-Render via parent state).
  void sig;
  const doc: any = app?.scene.getDocumentById(docId) || null;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);

  const filters: DocumentFilter[] = doc?.filters || [];
  const activeId: string | null = doc?.activeFilterId || null;
  const opacity: number = typeof doc?.opacity === "number" ? doc.opacity : 1;

  const setOpacity = (v: number) => {
    if (!doc) return;
    doc.opacity = Math.max(0, Math.min(1, v));
  };
  const setActive = (id: string | null) => {
    if (!doc) return;
    doc.activeFilterId = id;
  };
  const addFilter = (mode: DocumentFilterMode) => {
    if (!doc) return;
    const f = makeDefaultFilter(mode);
    // Sinnvolle Defaults für "frei": dominante Farben aus aktueller Bitmap holen
    if (mode === "free") {
      const src = getDocSourceImage(doc);
      if (src) {
        try {
          const palette = extractDominantColors(src, 160, 6);
          f.freeRemaps = palette.map(c => ({ from: c, to: c }));
        } catch { /* ignore */ }
      }
    }
    doc.filters = [...filters, f];
    doc.activeFilterId = f.id;
    setEditingId(f.id);
    setAddOpen(false);
  };
  const removeFilter = (id: string) => {
    if (!doc) return;
    doc.filters = filters.filter(f => f.id !== id);
    if (doc.activeFilterId === id) doc.activeFilterId = null;
    if (editingId === id) setEditingId(null);
  };
  const renameFilter = (id: string, name: string) => {
    if (!doc) return;
    doc.filters = filters.map(f => f.id === id ? { ...f, name } : f);
  };
  const updateFilter = (id: string, patch: Partial<DocumentFilter>) => {
    if (!doc) return;
    doc.filters = filters.map(f => f.id === id ? { ...f, ...patch } : f);
  };

  const swatchesFor = (f: DocumentFilter): string[] => {
    switch (f.mode) {
      case "bw": return ["#000000", "#ffffff"];
      case "grayscale": return ["#1a1a1a", "#808080", "#e6e6e6"];
      case "tint": return [f.tintColor || "#999999", "#ffffff"];
      case "free": return (f.freeRemaps || []).slice(0, 4).map(r => r.to || r.from || "#cccccc");
    }
  };

  const editingFilter = useMemo(
    () => filters.find(f => f.id === editingId) || null,
    [filters, editingId],
  );

  if (!doc) return null;

  return (
    <div className="space-y-3" style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: 10 }}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
        Darstellung
      </div>

      {/* Opacity */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span>Transparenz</span>
          <span style={{ color: "hsl(var(--cad-toolbar-muted))" }}>{Math.round(opacity * 100)} %</span>
        </div>
        <input
          type="range" min={0} max={1} step={0.01} value={opacity}
          onChange={(e) => setOpacity(parseFloat(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Filter-Liste */}
      <div>
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-medium">Filter</span>
          <button
            type="button"
            className="cad-toolbar-btn h-6 px-2 text-[11px]"
            onClick={() => setAddOpen(v => !v)}
            title="Neuen Filter erstellen"
          >
            <Plus className="h-3 w-3" /> Neu
          </button>
        </div>

        {addOpen && (
          <div className="mb-2 grid grid-cols-2 gap-1">
            {MODE_OPTIONS.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => addFilter(m)}
                className="cad-toolbar-btn h-7 px-2 text-[11px] justify-center"
                title={`Filter "${filterModeLabel(m)}" hinzufügen`}
              >
                {filterModeLabel(m)}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-1">
          {/* Original */}
          <FilterButton
            active={activeId === null}
            name="Original"
            swatches={["#ffffff", "#808080", "#000000"]}
            onSelect={() => setActive(null)}
          />
          {filters.map(f => (
            <FilterButton
              key={f.id}
              active={activeId === f.id}
              name={f.name}
              swatches={swatchesFor(f)}
              renaming={renamingId === f.id}
              renameValue={renameValue}
              onRenameChange={setRenameValue}
              onRenameStart={() => { setRenamingId(f.id); setRenameValue(f.name); }}
              onRenameCommit={() => { renameFilter(f.id, renameValue.trim() || f.name); setRenamingId(null); }}
              onSelect={() => setActive(f.id)}
              onEdit={() => setEditingId(editingId === f.id ? null : f.id)}
              onDelete={() => { if (window.confirm(`Filter "${f.name}" löschen?`)) removeFilter(f.id); }}
              isEditing={editingId === f.id}
            />
          ))}
        </div>
      </div>

      {/* Editor für aktiv editierten Filter */}
      {editingFilter && (
        <FilterEditor
          filter={editingFilter}
          onChange={(patch) => updateFilter(editingFilter.id, patch)}
          doc={doc}
        />
      )}
    </div>
  );
}

function FilterButton(props: {
  active: boolean; name: string; swatches: string[];
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isEditing?: boolean;
  renaming?: boolean;
  renameValue?: string;
  onRenameChange?: (v: string) => void;
  onRenameStart?: () => void;
  onRenameCommit?: () => void;
}) {
  const { active, name, swatches, onSelect, onEdit, onDelete, isEditing, renaming, renameValue, onRenameChange, onRenameStart, onRenameCommit } = props;
  return (
    <div
      className="flex items-center gap-1 rounded-md border px-2 py-1.5"
      style={{
        borderColor: active ? "hsl(var(--primary))" : "hsl(var(--border))",
        background: active ? "hsl(var(--primary) / 0.08)" : "transparent",
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 flex items-center gap-2 text-left"
        title={active ? "Aktiv" : "Filter aktivieren"}
      >
        <div className="flex gap-0.5">
          {swatches.length > 0 ? swatches.map((c, i) => (
            <div key={i} className="w-3 h-4 rounded-sm border" style={{ background: c, borderColor: "hsl(var(--border))" }} />
          )) : <div className="w-3 h-4 rounded-sm border" style={{ background: "transparent", borderColor: "hsl(var(--border))" }} />}
        </div>
        {renaming ? (
          <input
            value={renameValue || ""}
            onChange={(e) => onRenameChange?.(e.target.value)}
            onBlur={() => onRenameCommit?.()}
            onKeyDown={(e) => { if (e.key === "Enter") onRenameCommit?.(); if (e.key === "Escape") onRenameCommit?.(); }}
            autoFocus
            className="flex-1 bg-transparent text-xs outline-none border-b"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="text-xs truncate flex-1"
            onDoubleClick={(e) => { e.stopPropagation(); onRenameStart?.(); }}
            title={onRenameStart ? "Doppelklick zum Umbenennen" : undefined}
          >
            {name}
          </span>
        )}
        {active && <Check className="h-3 w-3" style={{ color: "hsl(var(--primary))" }} />}
      </button>
      {onEdit && (
        <button type="button" onClick={onEdit} className="opacity-60 hover:opacity-100 p-0.5" title={isEditing ? "Editor schließen" : "Bearbeiten"}>
          <Pencil className="h-3 w-3" />
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={onDelete} className="opacity-60 hover:opacity-100 p-0.5" title="Filter löschen">
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function FilterEditor({ filter, onChange, doc }: { filter: DocumentFilter; onChange: (patch: Partial<DocumentFilter>) => void; doc: any }) {
  return (
    <div className="rounded-md border p-2 space-y-2" style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted) / 0.3)" }}>
      <div className="text-[11px] font-semibold" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
        {filterModeLabel(filter.mode)} bearbeiten
      </div>
      {filter.mode === "bw" && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span>Schwelle</span>
            <span style={{ color: "hsl(var(--cad-toolbar-muted))" }}>{filter.bwThreshold ?? 160}</span>
          </div>
          <input
            type="range" min={0} max={255} step={1}
            value={filter.bwThreshold ?? 160}
            onChange={(e) => onChange({ bwThreshold: parseInt(e.target.value, 10) })}
            className="w-full"
          />
        </div>
      )}
      {filter.mode === "tint" && (
        <div className="flex items-center gap-2 text-xs">
          <span>Farbe</span>
          <input
            type="color"
            value={filter.tintColor || "#c0392b"}
            onChange={(e) => onChange({ tintColor: e.target.value })}
            className="w-8 h-7 rounded border cursor-pointer"
          />
          <input
            type="text"
            value={filter.tintColor || "#c0392b"}
            onChange={(e) => onChange({ tintColor: e.target.value })}
            className="flex-1 bg-transparent border rounded px-2 py-1 text-xs"
          />
        </div>
      )}
      {filter.mode === "free" && (
        <FreeFilterEditor filter={filter} onChange={onChange} doc={doc} />
      )}
      {filter.mode === "grayscale" && (
        <div className="text-[11px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
          Keine weiteren Einstellungen.
        </div>
      )}
    </div>
  );
}

function FreeFilterEditor({ filter, onChange, doc }: { filter: DocumentFilter; onChange: (patch: Partial<DocumentFilter>) => void; doc: any }) {
  const remaps: FreeRemap[] = filter.freeRemaps || [];
  const updateRemap = (i: number, patch: Partial<FreeRemap>) => {
    const next = remaps.map((r, k) => k === i ? { ...r, ...patch } : r);
    onChange({ freeRemaps: next });
  };
  const reextract = () => {
    const src = getDocSourceImage(doc);
    if (!src) { window.alert("Bild noch nicht geladen."); return; }
    try {
      const palette = extractDominantColors(src, 160, 6);
      onChange({ freeRemaps: palette.map(c => ({ from: c, to: c })) });
    } catch { /* ignore */ }
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <span style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Hauptfarben</span>
        <button type="button" onClick={reextract} className="cad-toolbar-btn h-6 px-2 text-[11px]" title="Hauptfarben neu extrahieren">
          Neu extrahieren
        </button>
      </div>
      {remaps.length === 0 && (
        <div className="text-[11px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
          Noch keine Farben — auf "Neu extrahieren" klicken.
        </div>
      )}
      <div className="space-y-1">
        {remaps.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-6 h-5 rounded border" style={{ background: r.from, borderColor: "hsl(var(--border))" }} title={`Original: ${r.from}`} />
            <span style={{ color: "hsl(var(--cad-toolbar-muted))" }}>→</span>
            <input
              type="color"
              value={r.to || r.from}
              onChange={(e) => updateRemap(i, { to: e.target.value })}
              className="w-7 h-6 rounded border cursor-pointer"
            />
            <input
              type="text"
              value={r.to || r.from}
              onChange={(e) => updateRemap(i, { to: e.target.value })}
              className="flex-1 bg-transparent border rounded px-1.5 py-0.5 text-[11px]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Holt das aktuelle Quellbild eines Dokuments für Filter-Analyse (Bild oder gerendertes PDF). */
function getDocSourceImage(doc: any): HTMLImageElement | HTMLCanvasElement | null {
  // Bevorzugt: bereits geladenes HTMLImage (über doc.src). Lazy laden, indem ein Image-Tag erstellt wird.
  if (!doc?.src) return null;
  const img = new Image();
  img.src = doc.src;
  if (img.complete && img.naturalWidth > 0) return img;
  // Falls noch nicht geladen, gibt null zurück; UI fordert Re-Klick an.
  return null;
}
