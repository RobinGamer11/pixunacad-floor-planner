/**
 * Auswahlfilter für „Alles auswählen“.
 *
 * Gemeinsames Verzeichnis filterbarer Eigenschaften (Feldkennung, Anzeigename,
 * Synonyme, Datentyp, Einheit, Objekttypen, lesender Zugriff). Weitere
 * Eigenschaften (z. B. Indexdaten) werden per `registerFilterProperty`
 * ergänzt – die Oberfläche liest nur dieses Verzeichnis.
 *
 * Filterwerte sind lokaler Bedienzustand: nie Projekt-/Cloud-Daten, nie Undo.
 */
import { engineToolForObject } from "./selectionTools";

export type FilterValueType = "multi" | "color" | "text" | "range";

export interface FilterContext {
  /** Ebenen für Mehrfachauswahl-Optionen. */
  layers: { id: string; name: string }[];
}

export interface FilterProperty {
  id: string;
  label: string;
  synonyms: string[];
  type: FilterValueType;
  unit?: string;
  /** Objekttypen (siehe `objectTypeKey`); leer = alle. */
  types: string[];
  /** Wert(e) eines Objekts; `undefined`/`null` = Eigenschaft fehlt. */
  read: (obj: any, typeKey: string) => unknown;
  /** Feste Optionen (nur `multi`). */
  options?: (ctx: FilterContext) => { value: string; label: string }[];
}

export interface FilterCriterion {
  /** Eindeutige Baustein-ID. */
  key: string;
  propId: string;
  values?: string[];
  text?: string;
  min?: number | null;
  max?: number | null;
}

export interface SelectionFilterState {
  /** Objekttypen; leer = „Alle“. */
  types: string[];
  criteria: FilterCriterion[];
}

export const emptyFilterState = (): SelectionFilterState => ({ types: [], criteria: [] });

/* ------------------------------------------------------------- Objekttypen */

export const OBJECT_TYPE_LABELS: Record<string, string> = {
  line: "Linie", guide: "Hilfslinie", free: "Freihand", polygon: "Polygon",
  hatch: "Schraffur", text: "Text", table: "Tabelle", document: "Bild/PDF",
  measure: "Bemaßung", wall: "Wand", door: "Tür", stair: "Treppe", library: "Bibliothek",
};

/** Objekttyp eines Engine-Objekts (Werkzeugtyp oder eigener Objekttyp). */
export function objectTypeKey(kind: string, obj: any): string {
  return engineToolForObject(kind, obj) ?? kind;
}

/* ----------------------------------------------------------- Verzeichnis */

const registry = new Map<string, FilterProperty>();

export function registerFilterProperty(p: FilterProperty) { registry.set(p.id, p); }
export function filterProperties(): FilterProperty[] { return [...registry.values()]; }
export function getFilterProperty(id: string) { return registry.get(id) ?? null; }

const num = (v: any) => (typeof v === "number" && isFinite(v) ? v : undefined);

registerFilterProperty({
  id: "layer", label: "Ebene", synonyms: ["ebenen", "layer", "id", "gruppe"],
  type: "multi", types: [],
  read: (o) => o?.labelId ?? undefined,
  options: (ctx) => ctx.layers.map((l) => ({ value: l.id, label: l.name })),
});
registerFilterProperty({
  id: "color", label: "Farbe", synonyms: ["farbe", "linienfarbe", "color", "füllfarbe", "rot", "blau", "grün", "schwarz"],
  type: "color", types: [],
  read: (o) => {
    const vals = [o?.color, o?.strokeColor, o?.fillColor, o?.style?.color].filter((x) => typeof x === "string" && x);
    return vals.length ? vals : undefined;
  },
});
registerFilterProperty({
  id: "lineWidth", label: "Linienstärke", synonyms: ["linienstaerke", "strichstärke", "stärke", "dicke linie", "breite"],
  type: "range", unit: "mm", types: ["line", "guide", "free"],
  read: (o) => { const t = num(o?.thicknessM); return t == null ? undefined : t * 1000; },
});
registerFilterProperty({
  id: "wallThickness", label: "Wanddicke", synonyms: ["wandstärke", "wandstaerke", "mauerdicke", "dicke"],
  type: "range", unit: "cm", types: ["wall"],
  read: (o) => { const t = num(o?.thicknessM); return t == null ? undefined : t * 100; },
});
registerFilterProperty({
  id: "text", label: "Textinhalt", synonyms: ["text", "inhalt", "beschriftung", "wort"],
  type: "text", types: ["text"],
  read: (o) => {
    const h = typeof o?.html === "string" ? o.html : typeof o?.text === "string" ? o.text : undefined;
    return h == null ? undefined : h.replace(/<[^>]*>/g, " ");
  },
});

/* -------------------------------------------------------------- Abgleich */

const normColor = (c: string) => c.trim().toLowerCase();

function criterionMatches(p: FilterProperty, c: FilterCriterion, obj: any, typeKey: string): boolean {
  if (p.types.length && !p.types.includes(typeKey)) return false;
  const raw = p.read(obj, typeKey);
  if (raw == null) return false; // fehlende Eigenschaft erfüllt nie
  const vals = Array.isArray(raw) ? raw : [raw];
  switch (p.type) {
    case "multi":
      return !!c.values?.length && vals.some((v) => c.values!.includes(String(v)));
    case "color":
      return !!c.values?.length && vals.some((v) => c.values!.map(normColor).includes(normColor(String(v))));
    case "text": {
      const q = (c.text ?? "").trim().toLowerCase();
      return !!q && vals.some((v) => String(v).toLowerCase().includes(q));
    }
    case "range":
      return vals.some((v) => {
        const n = Number(v);
        if (!isFinite(n)) return false;
        if (c.min != null && n < c.min - 1e-9) return false;
        if (c.max != null && n > c.max + 1e-9) return false;
        return true;
      });
  }
}

/** Nicht ausgefüllte Bausteine wirken nicht (sonst leert ein neuer Baustein sofort alles). */
export function isCriterionActive(c: FilterCriterion): boolean {
  const p = getFilterProperty(c.propId);
  if (!p) return false;
  if (p.type === "text") return !!(c.text ?? "").trim();
  if (p.type === "range") return c.min != null || c.max != null;
  return !!c.values?.length;
}

/** Innerhalb einer Eigenschaft ODER, zwischen Eigenschaften UND. */
export function objectMatchesFilter(state: SelectionFilterState, kind: string, obj: any): boolean {
  const typeKey = objectTypeKey(kind, obj);
  if (state.types.length && !state.types.includes(typeKey)) return false;
  const groups = new Map<string, FilterCriterion[]>();
  for (const c of state.criteria) {
    if (!isCriterionActive(c)) continue;
    const g = groups.get(c.propId) ?? [];
    g.push(c); groups.set(c.propId, g);
  }
  for (const [propId, cs] of groups) {
    const p = getFilterProperty(propId)!;
    if (!cs.some((c) => criterionMatches(p, c, obj, typeKey))) return false;
  }
  return true;
}

/* ---------------------------------------------------------- Vorschläge */

const fold = (s: string) => s.toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").trim();

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= n; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[n];
}

/** Ähnlichkeit 0 (keine) … 3 (exakt), tolerant gegenüber kleinen Tippfehlern. */
export function fuzzyScore(query: string, word: string): number {
  const q = fold(query), w = fold(word);
  if (!q) return 0;
  if (w === q) return 3;
  if (w.startsWith(q) || w.includes(q)) return 2;
  const tol = q.length <= 3 ? 0 : q.length <= 6 ? 1 : 2;
  if (tol && lev(q, w.slice(0, Math.max(q.length, Math.min(w.length, q.length + 1)))) <= tol) return 1;
  if (tol && lev(q, w) <= tol) return 1;
  return 0;
}

export interface FilterSuggestion {
  propId: string;
  label: string;
  /** Vorbelegter Wert (z. B. Ebene „ID-02“). */
  value?: string;
  score: number;
}

export function suggestFilters(query: string, ctx: FilterContext): FilterSuggestion[] {
  const out: FilterSuggestion[] = [];
  for (const p of filterProperties()) {
    const s = Math.max(fuzzyScore(query, p.label), ...p.synonyms.map((w) => fuzzyScore(query, w)));
    if (s) out.push({ propId: p.id, label: p.label, score: s });
    for (const o of p.options?.(ctx) ?? []) {
      const vs = fuzzyScore(query, o.label);
      if (vs) out.push({ propId: p.id, label: `${p.label}: ${o.label}`, value: o.value, score: vs });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 8);
}
