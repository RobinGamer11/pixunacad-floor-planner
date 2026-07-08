import React, { useMemo, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import {
  type DocumentFilter,
  type DocumentFilterMode,
  type FreeRemap,
  type AdjustParams,
  DEFAULT_ADJUST,
  ADJUST_GROUPS,
  ADJUST_PRESETS,
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

const MODE_OPTIONS: DocumentFilterMode[] = ["adjust", "bw", "grayscale", "tint", "free"];

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
      case "adjust": return ["#4dabff", "#89e576", "#d8b36a"];
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

      {/* Hintergrund ausschneiden */}
      <BgRemovePanel app={app} doc={doc} />
    </div>
  );
}

// ---------------------------------------------------------------- BgRemovePanel
function BgRemovePanel({ app, doc }: { app: CadApp | null; doc: any }) {
  const [, force] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [brushMode, setBrushMode] = useState<"fg" | "bg">("bg");
  const rerender = () => force(v => v + 1);
  const bg = doc.bgRemoval || null;
  const inter = app?.bgRemoveInteraction || null;
  const isThisDoc = !!inter && inter.docId === doc.id;

  const runAuto = (tol?: number) => {
    void import("@/cad/documentBgRemove").then(({ autoRemoveBackgroundFromCorners }) => {
      const t = tol ?? doc.bgRemoval?.tolerance ?? 32;
      const done = autoRemoveBackgroundFromCorners(doc, t, () => {
        autoRemoveBackgroundFromCorners(doc, t);
        rerender();
      });
      if (done) rerender();
    });
  };

  const enable = () => {
    void import("@/cad/documentBgRemove").then(({ defaultBgRemoval }) => {
      if (!doc.bgRemoval) {
        doc.bgRemoval = defaultBgRemoval();
        doc.bgRemoval.enabled = true;
        // Automatik direkt beim ersten Einschalten — genau das, was Nutzer erwartet.
        runAuto(doc.bgRemoval.tolerance);
      } else {
        doc.bgRemoval.enabled = !doc.bgRemoval.enabled;
      }
      rerender();
    });
  };
  const setInter = (tool: "wand" | "brush" | null, target: "fg" | "bg" = "bg") => {
    if (!app) return;
    if (tool === null) app.bgRemoveInteraction = null;
    else app.bgRemoveInteraction = { docId: doc.id, tool, target };
    rerender();
  };
  const patchBg = (patch: any) => {
    if (!doc.bgRemoval) return;
    Object.assign(doc.bgRemoval, patch);
    rerender();
  };
  const reset = () => {
    void import("@/cad/documentBgRemove").then(({ resetBgMask }) => {
      resetBgMask(doc);
      rerender();
    });
  };

  const wandActive = (t: "fg" | "bg") => isThisDoc && inter?.tool === "wand" && inter?.target === t;
  const brushActive = isThisDoc && inter?.tool === "brush";

  return (
    <div className="space-y-2" style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: 10 }}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
          Hintergrund entfernen
        </div>
        <label className="flex items-center gap-1 text-[11px] cursor-pointer" title="Aktiviert das Ausschneiden. Beim ersten Einschalten wird der Hintergrund automatisch anhand der Bild-Ecken erkannt.">
          <input type="checkbox" checked={!!bg?.enabled} onChange={enable} />
          <span>Aktiv</span>
        </label>
      </div>

      {bg?.enabled && (
        <>
          <p className="text-[10.5px] leading-snug" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
            Klicke im Canvas auf einen Hintergrund­bereich, um ihn zu entfernen.
            Mit dem Pinsel kannst du feine Kanten nachjustieren.
          </p>

          {/* Auto-Button */}
          <button
            type="button"
            onClick={() => runAuto()}
            className="cad-toolbar-btn h-8 w-full text-[11px] justify-center"
            style={{ borderColor: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.12)" }}
            title="Erkennt den Hintergrund automatisch anhand der 4 Bild-Ecken. Bei zu wenig/zu viel Wegschnitt die Genauigkeit unten anpassen und erneut klicken."
          >
            Automatisch erkennen
          </button>

          {/* Genauigkeit */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span title="Farb-Toleranz. Niedrig = nur sehr ähnliche Farben werden entfernt. Hoch = auch abweichende Töne werden mitgenommen.">
                Genauigkeit
              </span>
              <span style={{ color: "hsl(var(--cad-toolbar-muted))" }}>{bg.tolerance}</span>
            </div>
            <input type="range" min={1} max={128} step={1} value={bg.tolerance}
              onChange={(e) => patchBg({ tolerance: parseInt(e.target.value, 10) })}
              className="w-full" />
          </div>

          {/* Klick-Werkzeuge */}
          <div className="space-y-1">
            <div className="text-[11px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Klick-Werkzeug</div>
            <div className="grid grid-cols-2 gap-1">
              <ToolBtn
                active={wandActive("bg")}
                onClick={() => setInter(wandActive("bg") ? null : "wand", "bg")}
                label="Wegklicken"
                title="Klick auf einen Bereich im Bild → alle zusammenhängenden ähnlich­farbigen Pixel werden entfernt."
              />
              <ToolBtn
                active={wandActive("fg")}
                onClick={() => setInter(wandActive("fg") ? null : "wand", "fg")}
                label="Wiederherstellen"
                title="Klick auf einen entfernten Bereich → er wird wieder sichtbar."
              />
            </div>
          </div>

          {/* Pinsel */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Pinsel (Feinarbeit)</span>
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => setBrushMode("bg")}
                  className="cad-toolbar-btn h-5 px-1.5 text-[10px]"
                  style={{
                    borderColor: brushMode === "bg" ? "hsl(var(--primary))" : undefined,
                    background: brushMode === "bg" ? "hsl(var(--primary) / 0.15)" : undefined,
                  }}
                  title="Pinsel entfernt (radiert Vordergrund)"
                >Entfernen</button>
                <button
                  type="button"
                  onClick={() => setBrushMode("fg")}
                  className="cad-toolbar-btn h-5 px-1.5 text-[10px]"
                  style={{
                    borderColor: brushMode === "fg" ? "hsl(var(--primary))" : undefined,
                    background: brushMode === "fg" ? "hsl(var(--primary) / 0.15)" : undefined,
                  }}
                  title="Pinsel stellt wieder her"
                >Zurückholen</button>
              </div>
            </div>
            <ToolBtn
              active={brushActive}
              onClick={() => setInter(brushActive ? null : "brush", brushMode)}
              label={brushActive ? "Pinsel aktiv — im Canvas ziehen" : "Pinsel aktivieren"}
              title="Nach dem Aktivieren im Canvas auf das Bild klicken oder ziehen."
            />
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span>Pinselgröße</span>
                <span style={{ color: "hsl(var(--cad-toolbar-muted))" }}>{(bg.brushRadiusM * 100).toFixed(0)} cm</span>
              </div>
              <input type="range" min={1} max={200} step={1} value={Math.round(bg.brushRadiusM * 100)}
                onChange={(e) => patchBg({ brushRadiusM: parseInt(e.target.value, 10) / 100 })}
                className="w-full" />
            </div>
          </div>

          {isThisDoc && (
            <div className="text-[10px] rounded px-2 py-1" style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}>
              Bearbeitungs­modus aktiv — klicke im Canvas auf das Bild.
            </div>
          )}

          {/* Erweitert */}
          <button
            type="button"
            onClick={() => setAdvancedOpen(v => !v)}
            className="text-[11px] w-full text-left"
            style={{ color: "hsl(var(--cad-toolbar-muted))" }}
          >
            {advancedOpen ? "▾" : "▸"} Erweitert (Einfärben & Deckkraft)
          </button>

          {advancedOpen && (
            <div className="space-y-2 pl-2" style={{ borderLeft: "1px solid hsl(var(--border))" }}>
              <ColorAlphaRow
                label="Vordergrund"
                color={bg.fgColor}
                alpha={bg.fgAlpha}
                onChange={(color, alpha) => patchBg({ fgColor: color, fgAlpha: alpha })}
                hint="Bleibt sichtbar. Farbe = Einfärbung, Deckkraft = Transparenz des sichtbaren Bild­teils."
              />
              <ColorAlphaRow
                label="Hintergrund"
                color={bg.bgColor}
                alpha={bg.bgAlpha}
                onChange={(color, alpha) => patchBg({ bgColor: color, bgAlpha: alpha })}
                hint="Der weggeschnittene Bereich. Transparent + Deckkraft 0 % = komplett entfernt."
              />
            </div>
          )}

          <button
            type="button"
            onClick={reset}
            className="cad-toolbar-btn h-7 w-full text-[11px] justify-center"
            title="Setzt die Maske zurück — das ganze Bild wird wieder komplett sichtbar."
          >
            Maske zurücksetzen
          </button>
        </>
      )}
    </div>
  );
}

function ToolBtn({ active, onClick, label, title }: { active: boolean; onClick: () => void; label: string; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="cad-toolbar-btn h-7 px-2 text-[11px] justify-center"
      style={{
        borderColor: active ? "hsl(var(--primary))" : undefined,
        background: active ? "hsl(var(--primary) / 0.15)" : undefined,
      }}
    >
      {label}
    </button>
  );
}

function ColorAlphaRow({ label, color, alpha, onChange, hint }: {
  label: string; color: string | null; alpha: number;
  onChange: (color: string | null, alpha: number) => void;
  hint?: string;
}) {
  const transparent = color === null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span title={hint}>{label}</span>
        <label className="flex items-center gap-1 text-[10px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
          <input type="checkbox" checked={transparent} onChange={(e) => onChange(e.target.checked ? null : (color || "#ffffff"), alpha)} />
          <span>Transparent</span>
        </label>
      </div>
      {!transparent && (
        <div className="flex items-center gap-2">
          <input type="color" value={color || "#ffffff"} onChange={(e) => onChange(e.target.value, alpha)} className="w-8 h-7 rounded border cursor-pointer" />
          <input type="text" value={color || "#ffffff"} onChange={(e) => onChange(e.target.value, alpha)} className="flex-1 bg-transparent border rounded px-2 py-1 text-xs" />
        </div>
      )}
      <div className="flex items-center justify-between text-[11px]">
        <span style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Deckkraft</span>
        <span style={{ color: "hsl(var(--cad-toolbar-muted))" }}>{Math.round(alpha * 100)} %</span>
      </div>
      <input type="range" min={0} max={1} step={0.01} value={alpha}
        onChange={(e) => onChange(color, parseFloat(e.target.value))}
        className="w-full" />
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
      {filter.mode === "adjust" && (
        <AdjustEditor filter={filter} onChange={onChange} />
      )}
      {filter.mode === "grayscale" && (
        <div className="text-[11px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
          Keine weiteren Einstellungen.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- AdjustEditor
// Regler-Gruppen und Presets kommen zentral aus imageAdjustPipeline.ts.

function AdjustEditor({ filter, onChange }: { filter: DocumentFilter; onChange: (patch: Partial<DocumentFilter>) => void }) {
  const a: AdjustParams = { ...DEFAULT_ADJUST, ...(filter.adjust || {}) };
  const set = (patch: Partial<AdjustParams>) => onChange({ adjust: { ...a, ...patch } });
  const applyPreset = (params: Partial<AdjustParams>) => onChange({ adjust: { ...DEFAULT_ADJUST, ...params } });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {ADJUST_PRESETS.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.values)}
            className="cad-toolbar-btn h-6 px-2 text-[10px]"
            title={`Preset "${p.name}" anwenden`}
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => applyPreset({})}
          className="cad-toolbar-btn h-6 px-2 text-[10px] ml-auto"
          title="Alle Regler zurücksetzen"
        >
          Reset
        </button>
      </div>

      {ADJUST_GROUPS.map(group => (
        <div key={group.title} className="space-y-1 pt-1" style={{ borderTop: "1px dashed hsl(var(--border))" }}>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
            {group.title}
          </div>
          {group.note && (
            <div className="text-[9.5px] leading-tight" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              {group.note}
            </div>
          )}
          {group.keys.map(({ key, label }) => {
            const value = a[key];
            return (
              <div key={key}>
                <div className="flex items-center justify-between text-[10.5px] mb-0.5">
                  <span>{label}</span>
                  <span className="tabular-nums" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                    {value}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={value}
                  onChange={(e) => set({ [key]: parseInt(e.target.value, 10) } as Partial<AdjustParams>)}
                  onDoubleClick={() => set({ [key]: 0 } as Partial<AdjustParams>)}
                  className="w-full"
                  title="Doppelklick = auf 0 zurücksetzen"
                />
              </div>
            );
          })}
        </div>
      ))}
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
