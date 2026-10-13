import React, { useEffect, useRef, useState } from "react";
import {
  ensureObjectCode, formatObjectId, objectDisplayName, autoObjectName,
  setObjectCode, setObjectNameMany, addAttachments, attachmentBytes,
  MAX_ATTACHMENT_BYTES_PER_OBJECT, type ObjectAttachment,
} from "@/cad/objectMeta";
import { iterSceneObjects } from "@/cad/objectMeta";
import { OBJECT_TYPE_LABELS, objectTypeKey } from "@/cad/selectionFilter";
import { Button } from "@/components/ui/button";

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

const KIND_TO_KEY: Record<string, string[]> = {
  segment: ["segments"], wall: ["walls"], hatch: ["hatches"], freeStroke: ["freeStrokes"],
  dimension: ["dimensions"], textbox: ["textBoxes", "tables"], textBox: ["textBoxes", "tables"], table: ["tables"],
  document: ["documents"], library: ["libraryInstances"], stair: ["stairs"], door: ["doors"],
};

/** Alle ausgewählten Objekte (Mehrfachauswahl + Einzelauswahl), ohne Duplikate. */
export function resolveSelectedObjects(app: any): { kind: string; obj: any }[] {
  const sc = app?.scene;
  if (!sc) return [];
  const out: { kind: string; obj: any }[] = [];
  const seen = new Set<any>();
  const multi = (app?.selectTool?.marqueeSelectedIds || []) as { kind: string; id: string }[];
  for (const m of multi) {
    for (const key of KIND_TO_KEY[m.kind] || []) {
      const obj = (sc[key] || []).find((o: any) => o?.id === m.id);
      if (obj && !seen.has(obj)) {
        seen.add(obj);
        const kind = key === "tables" ? "table" : key === "textBoxes" ? "textbox" : m.kind;
        out.push({ kind, obj });
        break;
      }
    }
  }
  if (!out.length) { const r = resolveSelectedObject(app); if (r) out.push(r); }
  return out;
}

/** Objektart, die das aktive Zeichenwerkzeug erzeugt (für Daten vor dem Erstellen). */
const TOOL_KIND: Record<string, string> = {
  line: "segment", polygon: "segment", hatch: "hatch", free: "freeStroke", wall: "wall",
  door: "door", text: "textbox", table: "table", stair: "stair", measure: "dimension",
};
export function toolDraftKind(app: any): string | null {
  const t = app?.activeTool;
  if (!t || t === app.selectTool) return null;
  for (const [id, kind] of Object.entries(TOOL_KIND)) {
    const tool = app[id === "free" ? "freeDrawTool" : `${id}Tool`];
    if (tool && tool === t) return kind;
  }
  return null;
}

export function allAppScenes(app: any): any[] {
  const list: any[] = [];
  try { for (const sc of app?.scenesById?.values?.() ?? []) list.push(sc); } catch { /* noop */ }
  if (app?.scene && !list.includes(app.scene)) list.push(app.scene);
  return list;
}

const commit = (app: any, obj?: any) => { if (obj?.__draft) return; try { app?.commitHistorySnapshot?.(); } catch { /* noop */ } };

/** Objektname/ID + Untertabs „Darstellung | Infos“ (nur bei ausgewähltem Objekt). */
export const ObjectInfoTabs: React.FC<{
  app: any;
  tab: ObjectInfoTab;
  onTab: (t: ObjectInfoTab) => void;
  onHasObject: (has: boolean) => void;
}> = ({ app, tab, onTab, onHasObject }) => {
  const [, force] = useState(0);
  const [items, setItems] = useState<{ kind: string; obj: any }[]>([]);

  useEffect(() => {
    if (!app) return;
    let lastKey = "";
    let lastObjs: any[] = [];
    // Bekannte Objekte; neu auftauchende erhalten beim Erstellen die Entwurfsdaten.
    const known = new WeakSet<object>();
    const scanNew = (): { kind: string; obj: any }[] => {
      const fresh: { kind: string; obj: any }[] = [];
      for (const x of iterSceneObjects(allAppScenes(app))) {
        if (!known.has(x.obj)) { known.add(x.obj); fresh.push(x); }
      }
      return fresh;
    };
    scanNew();
    const applyDraft = () => {
      const fresh = scanNew();
      const draft = app.__objMetaDraft;
      if (!fresh.length || !draft || !toolDraftKind(app)) return;
      const scenes = allAppScenes(app);
      for (const x of fresh) {
        if (draft.objName) x.obj.objName = draft.objName;
        if (draft.objDesc) x.obj.objDesc = draft.objDesc;
        if (draft.objAttachments?.length) x.obj.objAttachments = draft.objAttachments.map((a: any) => ({ ...a }));
        x.obj.objCode = undefined;
        ensureObjectCode(scenes, x.kind, x.obj);
      }
      app.__objMetaDraft = null;
    };
    // Erstellen + Objektdaten = derselbe Rückgängig-Schritt.
    const origCommit = app.commitHistorySnapshot;
    if (typeof origCommit === "function") {
      app.commitHistorySnapshot = function (...args: any[]) {
        try { applyDraft(); } catch { /* noop */ }
        return origCommit.apply(this, args);
      };
    }
    const t = window.setInterval(() => {
      applyDraft();
      let r = resolveSelectedObjects(app);
      const dk = r.length ? null : toolDraftKind(app);
      if (dk) {
        let d = app.__objMetaDraft;
        if (!d || d.__kind !== dk) d = app.__objMetaDraft = { __kind: dk, __draft: true };
        if (dk === "door") d.kind = app.doorTool?.settings?.mode ?? app.doorTool?.mode;
        d.objCode = undefined;
        ensureObjectCode(allAppScenes(app), dk, d);
        r = [{ kind: dk, obj: d }];
      }
      const same = r.length === lastObjs.length && r.every((x, i) => x.obj === lastObjs[i]);
      if (!same) {
        const wasEmpty = !lastObjs.length;
        lastObjs = r.map((x) => x.obj);
        const scenes = allAppScenes(app);
        for (const x of r) if (!x.obj.__draft) ensureObjectCode(scenes, x.kind, x.obj);
        setItems(r);
        onHasObject(r.length > 0);
        const key = r.length === 1 ? "one" : "many";
        if (wasEmpty || key !== lastKey) onTab("darstellung");
        lastKey = key;
      }
      force((x) => x + 1);
    }, 300);
    return () => {
      window.clearInterval(t);
      if (typeof origCommit === "function") app.commitHistorySnapshot = origCommit;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);

  if (!items.length) return null;
  const current = items[0];
  const header = items.length === 1
    ? formatObjectId(current.kind, current.obj)
    : (() => {
        const names = new Set(items.map((x) => objectDisplayName(x.kind, x.obj)));
        return names.size === 1 ? `${[...names][0]} (${items.length} Objekte)` : `Mehrfachauswahl (${items.length} Objekte)`;
      })();
  return (
    <div className="mb-2 pt-3">
      <div className="mb-3 truncate px-1 text-center text-[12px] font-semibold" title={header}>
        {header}
      </div>
      <div className="grid grid-cols-2 border-b" style={{ borderColor: HAIRLINE }}>
        {(["darstellung", "infos"] as const).map((t) => (
          <Button
            key={t}
            type="button"
            variant="ghost"
            onClick={() => onTab(t)}
            className="h-auto rounded-none py-1.5 text-[11px] font-medium transition-colors"
            style={{
              color: tab === t ? "hsl(var(--ink))" : "hsl(var(--ink-soft))",
              borderBottom: tab === t ? "2px solid hsl(var(--accent-gold))" : "2px solid transparent",
            }}
          >
            {t === "darstellung" ? "Darstellung" : "Infos"}
          </Button>
        ))}
      </div>
      {tab === "infos" && <ObjectInfoPanel app={app} items={items} />}
    </div>
  );
};

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground">{children}</div>
);

const fieldStyle = { borderColor: HAIRLINE, backgroundColor: "hsl(var(--card))" };

const common = (vals: (string | undefined)[]) => (vals.every((v) => (v ?? "") === (vals[0] ?? "")) ? (vals[0] ?? "") : null);

const ObjectInfoPanel: React.FC<{ app: any; items: { kind: string; obj: any }[] }> = ({ app, items }) => {
  const [, force] = useState(0);
  const [codeDraft, setCodeDraft] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [miscOpen, setMiscOpen] = useState(true);
  useEffect(() => { setCodeDraft(null); setCodeError(null); setMiscOpen(true); }, [items]);

  const multi = items.length > 1;
  const { kind, obj } = items[0];
  const scenes = allAppScenes(app);
  const layerOf = (o: any) => {
    try { return app?.labelManager?.list?.().find((l: any) => l.id === o.labelId)?.name ?? o.labelId ?? "—"; }
    catch { return "—"; }
  };
  const typeOf = (k: string, o: any) => k === "door" ? autoObjectName(k, o) : (OBJECT_TYPE_LABELS[objectTypeKey(k, o)] ?? autoObjectName(k, o));
  const typeLabel = common(items.map((x) => typeOf(x.kind, x.obj))) ?? "Verschieden";
  const layer = common(items.map((x) => layerOf(x.obj))) ?? "Verschieden";
  const nameVal = common(items.map((x) => x.obj.objName));
  const descVal = common(items.map((x) => x.obj.objDesc));
  const placeholder = multi ? (nameVal === null ? "Verschiedene Namen" : common(items.map((x) => autoObjectName(x.kind, x.obj))) ?? "Name für alle") : autoObjectName(kind, obj);

  return (
    <div className="mt-3 space-y-4 text-xs">
      <div className="space-y-2">
        <Heading>OBJEKTDATEN</Heading>
        <label className="block">
          <span className="mb-1 block text-[9px] text-muted-foreground">Name{multi ? ` (für ${items.length} Objekte)` : ""}</span>
          <input
            type="text"
            value={nameVal ?? ""}
            placeholder={placeholder}
            onChange={(e) => { setObjectNameMany(scenes, items, e.target.value); force((x) => x + 1); }}
            onBlur={() => commit(app, obj)}
            className="h-8 w-full rounded-md border px-2 text-[11px] outline-none"
            style={fieldStyle}
          />
        </label>
        {multi ? (
          <div className="block">
            <span className="mb-1 block text-[9px] text-muted-foreground">Objekt-IDs</span>
            <div className="max-h-24 overflow-y-auto rounded-md border px-2 py-1 text-[10px] tabular-nums text-muted-foreground" style={fieldStyle}>
              {items.map((x, i) => <div key={i} className="truncate">{formatObjectId(x.kind, x.obj)}</div>)}
            </div>
          </div>
        ) : (
          <label className="block">
            <span className="mb-1 block text-[9px] text-muted-foreground">Objekt-ID</span>
            <span className="flex h-8 items-center overflow-hidden rounded-md border" style={{ ...fieldStyle, borderColor: codeError ? "hsl(var(--destructive))" : HAIRLINE }}>
              <span className="truncate pl-2 text-[11px] text-muted-foreground">{objectDisplayName(kind, obj)} - #</span>
              <input
                type="text"
                value={codeDraft ?? obj.objCode ?? ""}
                onChange={(e) => { setCodeDraft(e.target.value); setCodeError(setObjectCode(scenes, kind, obj, e.target.value)); }}
                onBlur={() => { setCodeDraft(null); setCodeError(null); commit(app, obj); }}
                className="h-full min-w-0 flex-1 bg-transparent pr-2 text-[11px] uppercase tabular-nums outline-none"
              />
            </span>
            {codeError && <span className="mt-1 block text-[9px]" style={{ color: "hsl(var(--destructive))" }}>{codeError}</span>}
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-[9px] text-muted-foreground">Beschreibung</span>
          <textarea
            rows={4}
            value={descVal ?? ""}
            placeholder={descVal === null ? "Verschiedene Beschreibungen" : ""}
            onChange={(e) => { for (const x of items) x.obj.objDesc = e.target.value; force((n) => n + 1); }}
            onBlur={() => commit(app, obj)}
            className="w-full resize-y rounded-md border px-2 py-1.5 text-[11px] outline-none"
            style={fieldStyle}
          />
        </label>
      </div>

      {!multi && <AttachmentsSection app={app} obj={obj} />}

      <div>
        <Button type="button" variant="ghost" onClick={() => setMiscOpen((o) => !o)} aria-expanded={miscOpen} className="h-auto w-full justify-between rounded-none p-0 hover:bg-transparent">
          <Heading>SONSTIGES</Heading>
          <span className="mb-1.5 text-[10px] text-muted-foreground">{miscOpen ? "▾" : "▸"}</span>
        </Button>
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

const readFile = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(r.error);
  r.readAsDataURL(f);
});

const fmtMB = (b: number) => (b / (1024 * 1024)).toFixed(1).replace(".", ",");

export const AttachmentsSection: React.FC<{ app: any; obj: any }> = ({ app, obj }) => {
  const [, force] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<ObjectAttachment | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setMsg(null); setMenu(null); setPreview(null); }, [obj]);
  const list: ObjectAttachment[] = obj.objAttachments || [];

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const items: ObjectAttachment[] = [];
    for (const f of Array.from(files)) {
      items.push({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, name: f.name, type: f.type, size: f.size, dataUrl: await readFile(f) });
    }
    const rejected = addAttachments(obj, items);
    setMsg(rejected.length ? `Nicht hinzugefügt (Format oder 5-MB-Grenze): ${rejected.join(", ")}` : null);
    commit(app, obj); force((x) => x + 1);
  };
  const rename = (a: ObjectAttachment) => {
    setMenu(null);
    const n = window.prompt("Anlage umbenennen", a.name);
    if (!n?.trim()) return;
    obj.objAttachments = list.map((x) => (x.id === a.id ? { ...x, name: n.trim() } : x));
    commit(app, obj); force((x) => x + 1);
  };
  const remove = (a: ObjectAttachment) => {
    setMenu(null);
    obj.objAttachments = list.filter((x) => x.id !== a.id);
    commit(app, obj); force((x) => x + 1);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Heading>ANLAGEN</Heading>
        <span className="mb-1.5 text-[9px] tabular-nums text-muted-foreground">{fmtMB(attachmentBytes(obj))} / {fmtMB(MAX_ATTACHMENT_BYTES_PER_OBJECT)} MB</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-square items-center justify-center rounded-md border text-3xl text-muted-foreground transition-colors hover:text-foreground"
          style={fieldStyle}
          aria-label="Anlage hinzufügen"
        >+</button>
        {list.map((a) => (
          <div key={a.id} className="relative aspect-square overflow-hidden rounded-md border" style={fieldStyle}>
            <button type="button" onClick={() => setPreview(a)} className="flex h-full w-full flex-col items-center justify-center" title={a.name}>
              {a.type.startsWith("image/") ? (
                <img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" />
              ) : (
                <>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ color: "hsl(var(--destructive))", border: "1px solid hsl(var(--destructive))" }}>PDF</span>
                  <span className="mt-1 w-full truncate px-1 text-center text-[9px]">{a.name}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMenu(menu === a.id ? null : a.id)}
              className="absolute right-1 top-1 rounded px-1 text-[12px] leading-none"
              style={{ backgroundColor: "hsl(var(--card) / 0.85)" }}
              aria-label="Anlage-Optionen"
            >⋯</button>
            {menu === a.id && (
              <div className="absolute right-1 top-6 z-10 rounded-md border text-[10px] shadow" style={fieldStyle}>
                <button type="button" onClick={() => rename(a)} className="block w-full px-2 py-1 text-left hover:bg-muted">Umbenennen</button>
                <button type="button" onClick={() => remove(a)} className="block w-full px-2 py-1 text-left hover:bg-muted" style={{ color: "hsl(var(--destructive))" }}>Entfernen</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <input ref={inputRef} type="file" multiple accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" className="hidden"
        onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
      {msg && <div className="mt-1 text-[9px]" style={{ color: "hsl(var(--destructive))" }}>{msg}</div>}
      {preview && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6" style={{ backgroundColor: "hsl(var(--background) / 0.85)" }} onClick={() => setPreview(null)}>
          <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-md border" style={fieldStyle} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-3 py-2 text-[11px]" style={{ borderColor: HAIRLINE }}>
              <span className="truncate">{preview.name}</span>
              <button type="button" onClick={() => setPreview(null)} aria-label="Schließen">✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {preview.type.startsWith("image/")
                ? <img src={preview.dataUrl} alt={preview.name} className="mx-auto max-h-full max-w-full object-contain" />
                : <iframe src={preview.dataUrl} title={preview.name} className="h-full w-full" />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
