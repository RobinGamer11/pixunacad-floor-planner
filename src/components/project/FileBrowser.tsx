import { useMemo, useRef, useState } from "react";
import { Folder, FolderPlus, FileText, Image as ImageIcon, Upload, ChevronRight, ChevronDown, Pencil, Trash2, Download } from "lucide-react";
import { projectStore, type FileNode, type Project } from "@/lib/projectStore";

interface Props {
  project: Project;
  kind: "files" | "photos";
  /** Erlaubte MIME-Typen bzw. Endungen für den Datei-Upload. */
  accept: string;
  /** Fallback-Bezeichnung im leeren Zustand. */
  emptyHint: string;
  /** true = Foto-Grid mit Vorschau, false = Listendarstellung. */
  photoMode?: boolean;
}

export function FileBrowser({ project, kind, accept, emptyHint, photoMode }: Props) {
  const nodes = (project[kind] ?? []) as FileNode[];
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  const path = useMemo(() => {
    const trail: FileNode[] = [];
    let cur = currentFolder;
    while (cur) {
      const n = nodes.find((x) => x.id === cur);
      if (!n) break;
      trail.unshift(n);
      cur = n.parentId;
    }
    return trail;
  }, [nodes, currentFolder]);

  const children = nodes.filter((n) => n.parentId === currentFolder);
  const folders = children.filter((n) => n.kind === "folder");
  const files = children.filter((n) => n.kind === "file");

  const addFolder = () => {
    const id = projectStore.addFolder(project.id, kind, currentFolder, "Neuer Ordner");
    setRenamingId(id);
    setRenameDraft("Neuer Ordner");
  };

  const uploadFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        projectStore.addFile(project.id, kind, currentFolder, {
          name: f.name,
          dataUrl: String(reader.result),
          mimeType: f.type,
          sizeBytes: f.size,
        });
      };
      reader.readAsDataURL(f);
    });
  };

  const humanSize = (b?: number) => {
    if (!b) return "";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="mt-6">
      {/* Breadcrumb + Aktionen */}
      <div
        className="rounded-2xl px-4 py-3 flex items-center gap-2 flex-wrap"
        style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
      >
        <button
          onClick={() => setCurrentFolder(null)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {kind === "files" ? "Dateien" : "Fotos"}
        </button>
        {path.map((n) => (
          <span key={n.id} className="flex items-center gap-2">
            <ChevronRight size={12} className="text-muted-foreground" />
            <button
              onClick={() => setCurrentFolder(n.id)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {n.name}
            </button>
          </span>
        ))}
        <div className="flex-1" />
        <button
          onClick={addFolder}
          className="h-8 px-3 rounded-md border text-xs flex items-center gap-1.5 hover:bg-muted"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          <FolderPlus size={13} /> Ordner
        </button>
        <button
          onClick={() => uploadRef.current?.click()}
          className="h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5"
          style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
        >
          <Upload size={13} /> Hochladen
        </button>
        <input
          ref={uploadRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => {
            uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Inhalte */}
      {children.length === 0 ? (
        <div
          className="mt-4 rounded-2xl p-10 text-center text-sm text-muted-foreground"
          style={{ background: "hsl(var(--surface-card))", border: "1px dashed hsl(var(--hairline))" }}
        >
          {emptyHint}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {folders.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {folders.map((n) => (
                <div
                  key={n.id}
                  className="rounded-xl p-3 flex items-center gap-3 group cursor-pointer transition"
                  style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
                  onDoubleClick={() => setCurrentFolder(n.id)}
                >
                  <button
                    onClick={() => setCurrentFolder(n.id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <Folder size={18} style={{ color: "hsl(var(--accent-gold))" }} />
                    {renamingId === n.id ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => { projectStore.renameNode(project.id, kind, n.id, renameDraft.trim() || n.name); setRenamingId(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { projectStore.renameNode(project.id, kind, n.id, renameDraft.trim() || n.name); setRenamingId(null); }
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="text-sm bg-transparent border-b outline-none flex-1"
                        style={{ borderColor: "hsl(var(--hairline))" }}
                      />
                    ) : (
                      <span className="text-sm truncate">{n.name}</span>
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setRenamingId(n.id); setRenameDraft(n.name); }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                    title="Umbenennen"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Ordner "${n.name}" und Inhalte löschen?`)) {
                        projectStore.deleteNode(project.id, kind, n.id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                    title="Löschen"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {files.length > 0 && photoMode ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {files.map((n) => (
                <div
                  key={n.id}
                  className="rounded-xl overflow-hidden group relative"
                  style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
                >
                  <div className="aspect-square" style={{ background: "hsl(var(--surface-muted))" }}>
                    {n.dataUrl && <img src={n.dataUrl} alt={n.name} className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-2 flex items-center gap-2">
                    <span className="flex-1 min-w-0 text-xs truncate">{n.name}</span>
                    <span className="text-[10px] text-muted-foreground">{humanSize(n.sizeBytes)}</span>
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100">
                    <a
                      href={n.dataUrl}
                      download={n.name}
                      className="h-6 w-6 rounded-md flex items-center justify-center"
                      style={{ background: "hsl(var(--surface))", color: "hsl(var(--ink))" }}
                      title="Herunterladen"
                    >
                      <Download size={12} />
                    </a>
                    <button
                      onClick={() => { if (confirm(`"${n.name}" löschen?`)) projectStore.deleteNode(project.id, kind, n.id); }}
                      className="h-6 w-6 rounded-md flex items-center justify-center"
                      style={{ background: "hsl(var(--surface))", color: "hsl(0 70% 50%)" }}
                      title="Löschen"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : files.length > 0 ? (
            <div
              className="rounded-2xl divide-y overflow-hidden"
              style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))", borderColor: "hsl(var(--hairline))" }}
            >
              {files.map((n) => (
                <div key={n.id} className="flex items-center gap-3 p-3 group hover:bg-muted/40">
                  <FileText size={16} className="text-muted-foreground shrink-0" />
                  {renamingId === n.id ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => { projectStore.renameNode(project.id, kind, n.id, renameDraft.trim() || n.name); setRenamingId(null); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { projectStore.renameNode(project.id, kind, n.id, renameDraft.trim() || n.name); setRenamingId(null); }
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="text-sm bg-transparent border-b outline-none flex-1"
                      style={{ borderColor: "hsl(var(--hairline))" }}
                    />
                  ) : (
                    <span className="text-sm flex-1 truncate">{n.name}</span>
                  )}
                  <span className="text-xs text-muted-foreground">{humanSize(n.sizeBytes)}</span>
                  <button
                    onClick={() => { setRenamingId(n.id); setRenameDraft(n.name); }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                    title="Umbenennen"
                  >
                    <Pencil size={12} />
                  </button>
                  <a
                    href={n.dataUrl}
                    download={n.name}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                    title="Herunterladen"
                  >
                    <Download size={12} />
                  </a>
                  <button
                    onClick={() => { if (confirm(`"${n.name}" löschen?`)) projectStore.deleteNode(project.id, kind, n.id); }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                    title="Löschen"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
