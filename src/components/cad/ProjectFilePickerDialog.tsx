import React, { useMemo, useState } from "react";
import { FileText, Folder, ChevronRight, Image as ImageIcon } from "lucide-react";
import { projectStore, type FileNode } from "@/lib/projectStore";

/** Wandelt eine gespeicherte Data-URL in ein echtes File-Objekt um. */
export function dataUrlToFile(dataUrl: string, name: string, mimeType?: string): File {
  const [head, body] = dataUrl.split(",");
  const mime = mimeType || /data:([^;]+)/.exec(head)?.[1] || "application/octet-stream";
  const bin = atob(body || "");
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new File([buf], name, { type: mime });
}

const isSupported = (n: FileNode) => {
  const t = (n.mimeType || "").toLowerCase();
  const name = (n.name || "").toLowerCase();
  return (
    t === "application/pdf" || name.endsWith(".pdf") ||
    t.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/.test(name)
  );
};

interface Props {
  projectId: string;
  onPick: (file: File) => void;
  onCancel: () => void;
}

/**
 * Zugriff auf die Startseiten-Ablage („Dokumente" & „Fotos") des Projekts,
 * damit im Dokumenten-Werkzeug (CAD + Projektmappe) bereits hochgeladene
 * Dateien direkt eingefügt werden können.
 */
export const ProjectFilePickerDialog: React.FC<Props> = ({ projectId, onPick, onCancel }) => {
  const [kind, setKind] = useState<"files" | "photos">("files");
  const [folderId, setFolderId] = useState<string | null>(null);

  const project = projectStore.getState().projects.find((p) => p.id === projectId);
  const nodes = ((project?.[kind] ?? []) as FileNode[]);

  const trail = useMemo(() => {
    const t: FileNode[] = [];
    let cur = folderId;
    while (cur) {
      const n = nodes.find((x) => x.id === cur);
      if (!n) break;
      t.unshift(n);
      cur = n.parentId;
    }
    return t;
  }, [nodes, folderId]);

  const children = nodes.filter((n) => n.parentId === folderId);
  const folders = children.filter((n) => n.kind === "folder");
  const files = children.filter((n) => n.kind === "file");

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6" style={{ background: "hsl(var(--ink) / 0.32)" }}>
      <div className="w-full max-w-xl rounded-md border p-4 shadow-xl" style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
        <div className="text-sm font-semibold mb-3">Aus Projekt-Ablage einfügen</div>

        <div className="flex items-center gap-1 mb-3">
          {(["files", "photos"] as const).map((k) => (
            <button key={k} type="button"
              onClick={() => { setKind(k); setFolderId(null); }}
              className="h-8 px-3 rounded-md border text-xs font-medium"
              style={kind === k
                ? { background: "hsl(var(--accent-gold))", color: "hsl(var(--surface-card))", borderColor: "hsl(var(--accent-gold))" }
                : { borderColor: "hsl(var(--hairline))" }}>
              {k === "files" ? "Dateien" : "Fotos"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 flex-wrap text-xs text-muted-foreground mb-2">
          <button type="button" onClick={() => setFolderId(null)} className="hover:underline">
            {kind === "files" ? "Dateien" : "Fotos"}
          </button>
          {trail.map((n) => (
            <span key={n.id} className="flex items-center gap-1">
              <ChevronRight size={11} />
              <button type="button" onClick={() => setFolderId(n.id)} className="hover:underline">{n.name}</button>
            </span>
          ))}
        </div>

        <div className="max-h-[52vh] overflow-y-auto rounded-md border p-2 space-y-1" style={{ borderColor: "hsl(var(--hairline))" }}>
          {children.length === 0 && (
            <div className="text-xs text-muted-foreground p-6 text-center">Keine Einträge in diesem Ordner.</div>
          )}
          {folders.map((f) => (
            <button key={f.id} type="button" onClick={() => setFolderId(f.id)}
              className="w-full flex items-center gap-2 h-9 px-2 rounded-md text-xs hover:bg-muted text-left">
              <Folder size={14} /> <span className="truncate">{f.name}</span>
            </button>
          ))}
          {files.map((f) => {
            const ok = isSupported(f);
            const img = (f.mimeType || "").startsWith("image/");
            return (
              <button key={f.id} type="button" disabled={!ok || !f.dataUrl}
                onClick={() => onPick(dataUrlToFile(f.dataUrl!, f.name, f.mimeType))}
                title={ok ? f.name : "Nicht unterstützt (nur PDF, PNG, JPG, WEBP, GIF)"}
                className="w-full flex items-center gap-2 h-9 px-2 rounded-md text-xs hover:bg-muted text-left disabled:opacity-40 disabled:cursor-not-allowed">
                {img ? <ImageIcon size={14} /> : <FileText size={14} />}
                <span className="truncate flex-1">{f.name}</span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onCancel} className="h-8 px-3 rounded-md border text-xs" style={{ borderColor: "hsl(var(--hairline))" }}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
};
