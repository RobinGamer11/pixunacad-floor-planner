import React, { useEffect, useState } from "react";
import {
  ensureObjectCode, formatObjectId, objectDisplayName, autoObjectName,
  setObjectCode, setObjectName,
} from "@/cad/objectMeta";
import { OBJECT_TYPE_LABELS, objectTypeKey } from "@/cad/selectionFilter";

const HAIRLINE = "hsl(var(--hairline))";

export type ObjectInfoTab = "darstellung" | "infos";

/** Auswahlfeld → Szenenliste + Objektart. */
const SEL_FIELDS: { field: string; key: string; kind: string }[] = [
  { field: "segmentId", key: "segments", kind: "segment" },
  { field: "wallId", key: "walls", kind: "wall" },
  { field: "hatchId", key: "hatches", kind: "hatch" },
  { field: "freeStrokeId", key: "freeStrokes", kind: "freeStroke" },
  { field: "dimensionId", key: "dimensions", kind: "dimension" },
  { field: "textBoxId", key: "tables", kind: "table" },
  { field: "textBoxId", key: "textBoxes", kind: "textbox" },
  { field: "documentId", key: "documents", kind: "document" },
  { field: "libraryInstanceId", key: "libraryInstances", kind: "library" },
  { field: "stairId", key: "stairs", kind: "stair" },
  { field: "doorId", key: "doors", kind: "door" },
];

export function resolveSelectedObject(app: any): { kind: string; obj: any } | null {
  const sel = app?.selection;
  const sc = app?.scene;
  if (!sel || !sc) return null;
  for (const { field, key, kind } of SEL_FIELDS) {
    const id = sel[field];
    if (!id) continue;
    const obj = (sc[key] || []).find((o: any) => o?.id === id);
    if (obj) return { kind, obj };
  }
  return null;
}

export function allAppScenes(app: any): any[] {
  const list: any[] = [];
  try { for (const sc of app?.scenesById?.values?.() ?? []) list.push(sc); } catch { /* noop */ }
  if (app?.scene && !list.includes(app.scene)) list.push(app.scene);
  return list;
}

const commit = (app: any) => { try { app?.commitHistorySnapshot?.(); } catch { /* noop */ } };

/** Objektname/ID + Untertabs „Darstellung | Infos“ (nur bei ausgewähltem Objekt). */
export const ObjectInfoTabs: React.FC<{
  app: any;
  tab: ObjectInfoTab;
  onTab: (t: ObjectInfoTab) => void;
  onHasObject: (has: boolean) => void;
}> = ({ app, tab, onTab, onHasObject }) => {
  const [, force] = useState(0);
  const [current, setCurrent] = useState<{ kind: string; obj: any } | null>(null);

  useEffect(() => {
    if (!app) return;
    let last: any = null;
    const t = window.setInterval(() => {
      const r = resolveSelectedObject(app);
      if (r?.obj !== last) {
        last = r?.obj ?? null;
        if (r) ensureObjectCode(allAppScenes(app), r.kind, r.obj);
        setCurrent(r);
        onHasObject(!!r);
        onTab("darstellung");
      }
      force((x) => x + 1);
    }, 300);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);

  if (!current) return null;
  return (
    <div className="mb-2">
      <div className="mb-1 truncate px-1 text-[12px] font-semibold" title={formatObjectId(current.kind, current.obj)}>
        {formatObjectId(current.kind, current.obj)}
      </div>
      <div className="grid grid-cols-2 border-b" style={{ borderColor: HAIRLINE }}>
        {(["darstellung", "infos"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTab(t)}
            className="py-1.5 text-[11px] font-medium transition-colors"
            style={{
              color: tab === t ? "hsl(var(--ink))" : "hsl(var(--ink-soft))",
              borderBottom: tab === t ? "2px solid hsl(var(--accent-gold))" : "2px solid transparent",
            }}
          >
            {t === "darstellung" ? "Darstellung" : "Infos"}
          </button>
        ))}
      </div>
      {tab === "infos" && <ObjectInfoPanel app={app} kind={current.kind} obj={current.obj} />}
    </div>
  );
};

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground">{children}</div>
);

const fieldStyle = { borderColor: HAIRLINE, backgroundColor: "hsl(var(--card))" };

const ObjectInfoPanel: React.FC<{ app: any; kind: string; obj: any }> = ({ app, kind, obj }) => {
  const [, force] = useState(0);
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [miscOpen, setMiscOpen] = useState(false);
  useEffect(() => { setCodeDraft(null); setCodeError(null); }, [obj]);

  const scenes = allAppScenes(app);
  const layer = (() => {
    try { return app?.labelManager?.list?.().find((l: any) => l.id === obj.labelId)?.name ?? obj.labelId ?? "—"; }
    catch { return "—"; }
  })();
  const typeLabel = kind === "door" ? autoObjectName(kind, obj) : (OBJECT_TYPE_LABELS[objectTypeKey(kind, obj)] ?? autoObjectName(kind, obj));

  return (
    <div className="mt-3 space-y-4 text-xs">
      <div className="space-y-2">
        <Heading>OBJEKTDATEN</Heading>
        <label className="block">
          <span className="mb-1 block text-[9px] text-muted-foreground">Name</span>
          <input
            type="text"
            value={obj.objName ?? ""}
            placeholder={autoObjectName(kind, obj)}
            onChange={(e) => { setObjectName(scenes, kind, obj, e.target.value); force((x) => x + 1); }}
            onBlur={() => commit(app)}
            className="h-8 w-full rounded-md border px-2 text-[11px] outline-none"
            style={fieldStyle}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[9px] text-muted-foreground">Objekt-ID</span>
          <span className="flex h-8 items-center overflow-hidden rounded-md border" style={{ ...fieldStyle, borderColor: codeError ? "hsl(var(--destructive))" : HAIRLINE }}>
            <span className="truncate pl-2 text-[11px] text-muted-foreground">{objectDisplayName(kind, obj)} - #</span>
            <input
              type="text"
              value={codeDraft ?? obj.objCode ?? ""}
              onChange={(e) => {
                setCodeDraft(e.target.value);
                const err = setObjectCode(scenes, kind, obj, e.target.value);
                setCodeError(err);
              }}
              onBlur={() => { setCodeDraft(null); setCodeError(null); commit(app); }}
              className="h-full min-w-0 flex-1 bg-transparent pr-2 text-[11px] uppercase tabular-nums outline-none"
            />
          </span>
          {codeError && <span className="mt-1 block text-[9px]" style={{ color: "hsl(var(--destructive))" }}>{codeError}</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-[9px] text-muted-foreground">Beschreibung</span>
          <textarea
            rows={4}
            value={obj.objDesc ?? ""}
            onChange={(e) => { obj.objDesc = e.target.value; force((x) => x + 1); }}
            onBlur={() => commit(app)}
            className="w-full resize-y rounded-md border px-2 py-1.5 text-[11px] outline-none"
            style={fieldStyle}
          />
        </label>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setMiscOpen((o) => !o)}
          aria-expanded={miscOpen}
          className="flex w-full items-center justify-between"
        >
          <Heading>SONSTIGES</Heading>
          <span className="mb-1.5 text-[10px] text-muted-foreground">{miscOpen ? "▾" : "▸"}</span>
        </button>
        {miscOpen && (
          <div className="space-y-1 rounded-md border p-2 text-[11px]" style={{ borderColor: HAIRLINE }}>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Objekttyp</span><span className="truncate">{typeLabel}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Ebene</span><span className="truncate">{layer}</span></div>
          </div>
        )}
      </div>
    </div>
  );
};
