import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { CadApp } from "@/cad/CadApp";
import {
  OBJECT_TYPE_LABELS, filterProperties, getFilterProperty, suggestFilters,
  emptyFilterState, objectTypeKey, type FilterCriterion, type FilterContext,
} from "@/cad/selectionFilter";

const MUTED = "hsl(var(--cad-toolbar-muted))";
const HAIRLINE = "hsl(var(--hairline))";
let keySeq = 0;

/**
 * Filteransicht für „Alles auswählen“. Jede Änderung aktualisiert sofort die
 * bestehende Mehrfachauswahl und die Trefferzahl.
 */
export const SelectionFilterPanel: React.FC<{ app: CadApp }> = ({ app }) => {
  const [, force] = useState(0);
  const [query, setQuery] = useState("");
  const st = app.selectionFilterState;
  const count = app.selectTool.marqueeSelectedIds.length;

  const ctx: FilterContext = useMemo(() => ({
    layers: ((app as any).labelManager?.list?.() ?? []).map((l: any) => ({ id: l.id, name: l.name })),
  }), [app, count]);

  // Vorhandene Objekttypen und Farben im Plan (für Auswahl und Vorschläge).
  const present = useMemo(() => {
    const types = new Set<string>(); const colors = new Set<string>();
    const sc: any = app.scene;
    const lists: [string, any[]][] = [["segment", sc.segments], ["wall", sc.walls], ["hatch", sc.hatches],
      ["freeStroke", sc.freeStrokes], ["dimension", sc.dimensions], ["textbox", sc.textBoxes], ["table", sc.tables],
      ["document", sc.documents], ["library", sc.libraryInstances], ["stair", sc.stairs]];
    for (const [kind, arr] of lists) for (const o of arr || []) {
      types.add(objectTypeKey(kind, o));
      for (const c of [o?.color, o?.strokeColor, o?.fillColor, o?.style?.color]) if (typeof c === "string" && c) colors.add(c.toLowerCase());
    }
    return { types: [...types], colors: [...colors].slice(0, 24) };
  }, [app, count]);

  const apply = () => { app.applySelectionFilter(); force((n) => n + 1); };
  useEffect(() => { const t = window.setInterval(() => force((n) => n + 1), 300); return () => window.clearInterval(t); }, []);

  const toggleType = (t: string | null) => {
    if (t == null) st.types = [];
    else st.types = st.types.includes(t) ? st.types.filter((x) => x !== t) : [...st.types, t];
    apply();
  };
  const addCriterion = (propId: string, value?: string) => {
    const c: FilterCriterion = { key: `c${++keySeq}`, propId };
    if (value != null) c.values = [value];
    st.criteria = [...st.criteria, c];
    setQuery("");
    apply();
  };
  const patch = (key: string, p: Partial<FilterCriterion>) => {
    st.criteria = st.criteria.map((c) => (c.key === key ? { ...c, ...p } : c));
    apply();
  };
  const remove = (key: string) => { st.criteria = st.criteria.filter((c) => c.key !== key); apply(); };
  const reset = () => { const e = emptyFilterState(); st.types = e.types; st.criteria = e.criteria; apply(); };

  const suggestions = query.trim() ? suggestFilters(query, ctx) : filterProperties().map((p) => ({ propId: p.id, label: p.label, score: 0 } as any));
  const chip = (on: boolean): React.CSSProperties => ({
    borderColor: on ? "hsl(var(--primary))" : HAIRLINE,
    background: on ? "hsl(var(--primary) / 0.12)" : undefined,
    color: on ? "hsl(var(--primary))" : undefined,
  });
  const typeList = [...new Set([...Object.keys(OBJECT_TYPE_LABELS).filter((t) => present.types.includes(t)), ...st.types])];

  return (
    <div className="cad-settings-panel mb-2 space-y-3 text-xs" data-selection-filter>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: MUTED }}>Auswahlfilter</div>
        <span className="text-[11px] font-medium">{count} Treffer</span>
      </div>

      <div>
        <div className="mb-1 text-[11px]" style={{ color: MUTED }}>Objekttyp</div>
        <div className="flex flex-wrap gap-1">
          <button type="button" className="rounded border px-2 py-1" style={chip(!st.types.length)} onClick={() => toggleType(null)}>Alle</button>
          {typeList.map((t) => (
            <button key={t} type="button" className="rounded border px-2 py-1" style={chip(st.types.includes(t))} onClick={() => toggleType(t)}>
              {OBJECT_TYPE_LABELS[t] ?? t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[11px]" style={{ color: MUTED }}>Filter hinzufügen</div>
        <input className="cad-settings-input w-full rounded border px-2 py-1" style={{ borderColor: HAIRLINE }}
          placeholder="z. B. Ebene, Farbe, Wanddicke …" value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && suggestions[0]) addCriterion(suggestions[0].propId, suggestions[0].value); e.stopPropagation(); }} />
        {suggestions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {suggestions.map((s: any) => (
              <button key={s.propId + (s.value ?? "")} type="button" className="rounded border px-2 py-0.5" style={{ borderColor: HAIRLINE }}
                onClick={() => addCriterion(s.propId, s.value)}>+ {s.label}</button>
            ))}
          </div>
        )}
      </div>

      {st.criteria.map((c) => {
        const p = getFilterProperty(c.propId);
        if (!p) return null;
        return (
          <div key={c.key} className="rounded border p-2 space-y-1" style={{ borderColor: HAIRLINE }}>
            <div className="flex items-center justify-between">
              <span className="font-medium">{p.label}{p.unit ? ` (${p.unit})` : ""}</span>
              <button type="button" aria-label={`${p.label} entfernen`} onClick={() => remove(c.key)}><X size={12} /></button>
            </div>
            {p.type === "multi" && (
              <div className="flex flex-wrap gap-1">
                {(p.options?.(ctx) ?? []).map((o) => {
                  const on = !!c.values?.includes(o.value);
                  return (
                    <button key={o.value} type="button" className="rounded border px-2 py-0.5" style={chip(on)}
                      onClick={() => patch(c.key, { values: on ? c.values!.filter((v) => v !== o.value) : [...(c.values ?? []), o.value] })}>{o.label}</button>
                  );
                })}
              </div>
            )}
            {p.type === "color" && (
              <div className="flex flex-wrap items-center gap-1">
                {present.colors.map((col) => {
                  const on = !!c.values?.map((v) => v.toLowerCase()).includes(col);
                  return (
                    <button key={col} type="button" title={col} aria-label={`Farbe ${col}`} className="h-6 w-6 rounded border"
                      style={{ background: col, outline: on ? "2px solid hsl(var(--primary))" : undefined, outlineOffset: 1, borderColor: HAIRLINE }}
                      onClick={() => patch(c.key, { values: on ? c.values!.filter((v) => v.toLowerCase() !== col) : [...(c.values ?? []), col] })} />
                  );
                })}
                <input type="color" aria-label="Weitere Farbe" className="h-6 w-8"
                  onChange={(e) => patch(c.key, { values: [...new Set([...(c.values ?? []), e.target.value.toLowerCase()])] })} />
              </div>
            )}
            {p.type === "text" && (
              <input className="cad-settings-input w-full rounded border px-2 py-1" style={{ borderColor: HAIRLINE }}
                placeholder="enthält …" value={c.text ?? ""} onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => patch(c.key, { text: e.target.value })} />
            )}
            {p.type === "range" && (
              <div className="flex items-center gap-1">
                {(["min", "max"] as const).map((k) => (
                  <input key={k} type="number" step="any" className="cad-settings-input w-full rounded border px-2 py-1" style={{ borderColor: HAIRLINE }}
                    placeholder={k === "min" ? "von" : "bis"} value={c[k] ?? ""} onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => patch(c.key, { [k]: e.target.value === "" ? null : Number(e.target.value) })} />
                ))}
                <span style={{ color: MUTED }}>{p.unit}</span>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex gap-1">
        <button type="button" className="cad-toolbar-btn h-9 flex-1 justify-center" onClick={reset}>Filter zurücksetzen</button>
        <button type="button" className="cad-toolbar-btn h-9 flex-1 justify-center" style={chip(true)}
          onClick={() => app.closeSelectionFilter()}>Auswahl bearbeiten</button>
      </div>
    </div>
  );
};
