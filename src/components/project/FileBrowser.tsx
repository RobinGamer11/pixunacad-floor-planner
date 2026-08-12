import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  FileImage,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { projectStore, type FileKind, type FileNode, type Project } from "@/lib/projectStore";
import { DocumentViewer } from "@/components/project/DocumentViewer";

const DOCUMENT_DRAG_TYPE = "application/x-pixuna-document-node";
const ACCEPTED_DOCUMENTS = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
const DOCUMENT_ACTION_CLASS = "inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted disabled:opacity-25";

type NodeGroup = {
  folders: FileNode[];
  files: FileNode[];
};

type DropTarget =
  | { mode: "before"; parentId: string | null; beforeId: string | null; kind: FileKind }
  | { mode: "inside"; folderId: string }
  | { mode: "root" };

function sameDropTarget(current: DropTarget | null, next: DropTarget) {
  if (!current || current.mode !== next.mode) return false;
  if (current.mode === "root" && next.mode === "root") return true;
  if (current.mode === "inside" && next.mode === "inside") return current.folderId === next.folderId;
  return current.mode === "before" && next.mode === "before"
    && current.parentId === next.parentId
    && current.beforeId === next.beforeId
    && current.kind === next.kind;
}

interface Props {
  project: Project;
}

function isPdf(node: FileNode) {
  return node.mimeType === "application/pdf" || node.name.toLowerCase().endsWith(".pdf");
}

function isImage(node: FileNode) {
  const mime = (node.mimeType ?? "").toLowerCase();
  const name = node.name.toLowerCase();
  return mime.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/.test(name);
}

function isAcceptedDocument(file: File) {
  return /\.(pdf|jpe?g|png)$/i.test(file.name);
}

function documentMimeType(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (/\.jpe?g$/.test(name)) return "image/jpeg";
  return file.type || "application/octet-stream";
}

function humanSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function PdfPreview({ node }: { node: FileNode }) {
  const source = node.dataUrl ?? "";
  const [preview, setPreview] = useState<{ source: string; url: string } | null>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const containerRef = useRef<HTMLDivElement>(null);
  const previewUrl = preview?.source === source ? preview.url : "";

  useEffect(() => {
    const element = containerRef.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: "160px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!source || !visible) return;
    let cancelled = false;

    const renderPreview = async () => {
      try {
        const base64 = source.includes(",") ? source.slice(source.indexOf(",") + 1) : source;
        const { renderPdfPageToCanvas } = await import("@/cad/documentImport");
        const canvas = await renderPdfPageToCanvas(base64, 0, 160);
        if (!cancelled) setPreview({ source, url: canvas.toDataURL("image/png") });
      } catch {
        if (!cancelled) setPreview({ source, url: "" });
      }
    };

    void renderPreview();
    return () => { cancelled = true; };
  }, [source, visible]);

  return (
    <div ref={containerRef} className="flex h-full w-full items-center justify-center">
      {previewUrl ? (
        <img src={previewUrl} alt="" draggable={false} className="h-full w-full object-contain" />
      ) : (
        <FileText size={26} aria-hidden="true" className="text-muted-foreground" />
      )}
    </div>
  );
}

function DocumentPreview({ node }: { node: FileNode }) {
  return (
    <div
      className="flex h-20 w-28 items-center justify-center overflow-hidden rounded-sm"
      style={{ background: "hsl(var(--surface-muted))" }}
      aria-hidden="true"
    >
      {isImage(node) && node.dataUrl ? (
        <img src={node.dataUrl} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : isPdf(node) ? (
        <PdfPreview node={node} />
      ) : (
        <FileImage size={26} className="text-muted-foreground" />
      )}
    </div>
  );
}

function DropSlot({
  active,
  dragging,
  label,
  parentId,
  beforeId,
  kind,
  onDragOver,
  onDrop,
}: {
  active: boolean;
  dragging: boolean;
  label: string;
  parentId: string | null;
  beforeId: string | null;
  kind: FileKind;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDrop: (event: DragEvent<HTMLLIElement>) => void;
}) {
  return (
    <li
      aria-hidden="true"
      data-drop-zone="before"
      data-parent-id={parentId ?? ""}
      data-before-id={beforeId ?? ""}
      data-kind={kind}
      className={`relative transition-[height] ${dragging ? "h-3" : "h-1"}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >

      {active && (
        <div
          className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2"
          style={{ background: "hsl(var(--accent-gold))" }}
        >
          <span
            className="absolute right-0 -top-5 rounded px-1.5 py-0.5 text-[10px]"
            style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--surface))" }}
          >
            {label}
          </span>
        </div>
      )}
    </li>
  );
}

export function FileBrowser({ project }: Props) {
  const nodes = useMemo(() => project.files ?? [], [project.files]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const draggingIdRef = useRef<string | null>(null);
  const moveTriggerRef = useRef<HTMLButtonElement | null>(null);

  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const draggingNode = draggingId ? nodesById.get(draggingId) : undefined;
  const draggingFromFolder = Boolean(draggingNode?.parentId);
  const movingNode = movingId ? nodesById.get(movingId) : undefined;
  const viewingNode = viewingId ? nodesById.get(viewingId) : undefined;
  const destinationFolders = useMemo(() => {
    if (!movingNode) return [];
    return nodes.filter((candidate) => {
      if (candidate.kind !== "folder" || candidate.id === movingNode.id) return false;
      if (movingNode.kind !== "folder") return true;

      const visited = new Set<string>();
      let current: FileNode | undefined = candidate;
      while (current) {
        if (current.id === movingNode.id || visited.has(current.id)) return false;
        visited.add(current.id);
        current = current.parentId ? nodesById.get(current.parentId) : undefined;
      }
      return true;
    });
  }, [movingNode, nodes, nodesById]);
  const childrenByParent = useMemo(() => {
    const groups = new Map<string | null, NodeGroup>();
    for (const node of nodes) {
      const group = groups.get(node.parentId) ?? { folders: [], files: [] };
      if (node.kind === "folder") group.folders.push(node);
      else group.files.push(node);
      groups.set(node.parentId, group);
    }
    return groups;
  }, [nodes]);

  const folderPath = (folder: FileNode) => {
    const names = [folder.name];
    const visited = new Set([folder.id]);
    let parentId = folder.parentId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = nodesById.get(parentId);
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.parentId;
    }
    return names.join(" / ");
  };

  const activateDropTarget = (next: DropTarget) => {
    setDropTarget((current) => sameDropTarget(current, next) ? current : next);
  };

  const startRename = (node: FileNode) => {
    setRenamingId(node.id);
    setRenameDraft(node.name);
  };

  const showPersistenceError = (action: string) => {
    const message = `${action} konnte nicht dauerhaft gespeichert werden. Der verfügbare Browser-Speicher reicht nicht aus.`;
    setAnnouncement(message);
    window.alert(message);
  };

  const showMoveError = (name: string) => {
    const message = `${name} konnte nicht verschoben werden. Prüfe Zielordner und verfügbaren Browser-Speicher.`;
    setAnnouncement(message);
    window.alert(message);
  };

  const finishRename = (node: FileNode) => {
    const renamed = projectStore.renameNode(project.id, "files", node.id, renameDraft.trim() || node.name);
    if (renamed) projectStore.sealHistory(project.id);
    else showPersistenceError(`„${node.name}“`);
    setRenamingId(null);
  };

  const addFolder = (parentId: string | null) => {
    const id = projectStore.addFolder(project.id, "files", parentId, "Neuer Ordner");
    if (!id) {
      showPersistenceError("Der neue Ordner");
      return;
    }
    if (parentId) {
      setExpandedFolderIds((current) => new Set(current).add(parentId));
    }
    setRenamingId(id);
    setRenameDraft("Neuer Ordner");
  };

  const uploadDocuments = (fileList: FileList | null) => {
    if (!fileList) return;
    const files = Array.from(fileList);
    const rejected = files.filter((file) => !isAcceptedDocument(file));

    for (const file of files) {
      if (!isAcceptedDocument(file)) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const nodeId = projectStore.addFile(project.id, "files", null, {
          name: file.name,
          dataUrl: String(reader.result),
          mimeType: documentMimeType(file),
          sizeBytes: file.size,
        });
        if (!nodeId) {
          window.alert(`„${file.name}“ konnte nicht dauerhaft gespeichert werden. Der verfügbare Browser-Speicher reicht nicht aus.`);
          return;
        }
        projectStore.sealHistory(project.id);
      };
      reader.readAsDataURL(file);
    }

    if (rejected.length > 0) {
      window.alert(`Nicht unterstützt: ${rejected.map((file) => file.name).join(", ")}. Erlaubt sind PDF, JPG und PNG.`);
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const readDraggedId = (event: DragEvent<HTMLElement>) =>
    event.dataTransfer.getData(DOCUMENT_DRAG_TYPE) || draggingIdRef.current;

  const clearDrag = () => {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
  };

  const moveNodeTo = (node: FileNode, parentId: string | null) => {
    if ((node.parentId ?? null) === parentId) return;
    const moved = projectStore.moveFileNode(project.id, node.id, parentId);
    const target = parentId ? nodesById.get(parentId)?.name : null;
    setAnnouncement(moved
      ? `${node.name} wurde ${target ? `nach ${target} verschoben` : "ohne Ordner abgelegt"}.`
      : `${node.name} kann dort nicht abgelegt werden.`);
    if (moved) {
      if (parentId) setExpandedFolderIds((current) => new Set(current).add(parentId));
      projectStore.sealHistory(project.id);
    } else showMoveError(node.name);
  };

  const pointerDragRef = useRef<{ id: string; pointerId: number; x: number; y: number; active: boolean } | null>(null);

  const hitDropZone = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el?.closest<HTMLElement>("[data-drop-zone]") ?? null;
  };

  const onNodePointerDown = (event: ReactPointerEvent<HTMLElement>, node: FileNode) => {
    if (event.button !== 0 || renamingId === node.id) return;
    if ((event.target as HTMLElement).closest("button, a, input")) return;
    pointerDragRef.current = { id: node.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false };
  };


  const onFilePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      const dx = Math.abs(event.clientX - drag.x);
      const dy = Math.abs(event.clientY - drag.y);
      if (Math.hypot(dx, dy) < 10) return;
      if (event.pointerType === "touch" && dy > dx) { pointerDragRef.current = null; return; }
      drag.active = true;
      draggingIdRef.current = drag.id;
      setDraggingId(drag.id);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    const target = resolvePointerTarget(event.clientX, event.clientY, drag.id);
    if (target) activateDropTarget(target);
    else setDropTarget(null);
  };


  const onFilePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = pointerDragRef.current;
    pointerDragRef.current = null;
    if (!drag || drag.pointerId !== event.pointerId || !drag.active) return;
    const node = nodesById.get(drag.id);
    const zone = hitDropZone(event.clientX, event.clientY);
    if (node) {
      if (zone?.dataset.dropZone === "root") moveNodeTo(node, null);
      else if (zone?.dataset.dropZone === "folder" && zone.dataset.folderId) moveNodeTo(node, zone.dataset.folderId);
    }
    clearDrag();
  };


  const dropBefore = (
    event: DragEvent<HTMLElement>,
    parentId: string | null,
    beforeId: string | null,
    kind: FileKind
  ) => {
    const nodeId = readDraggedId(event);
    const node = nodeId ? nodesById.get(nodeId) : undefined;
    if (!node || node.kind !== kind) return;
    event.preventDefault();
    event.stopPropagation();
    const moved = projectStore.moveFileNode(project.id, node.id, parentId, beforeId);
    setAnnouncement(moved ? `${node.name} wurde verschoben.` : `${node.name} kann dort nicht abgelegt werden.`);
    if (moved) projectStore.sealHistory(project.id);
    else showMoveError(node.name);
    clearDrag();
  };

  const dropInsideFolder = (event: DragEvent<HTMLElement>, folder: FileNode) => {
    const nodeId = readDraggedId(event);
    const node = nodeId ? nodesById.get(nodeId) : undefined;
    if (!node || node.id === folder.id) return;
    event.preventDefault();
    event.stopPropagation();
    const moved = projectStore.moveFileNode(project.id, node.id, folder.id, null);
    setAnnouncement(moved ? `${node.name} wurde nach ${folder.name} verschoben.` : `${node.name} kann dort nicht abgelegt werden.`);
    if (moved) {
      setExpandedFolderIds((current) => new Set(current).add(folder.id));
      projectStore.sealHistory(project.id);
    } else showMoveError(node.name);
    clearDrag();
  };

  const dropAtRoot = (event: DragEvent<HTMLElement>) => {
    const nodeId = readDraggedId(event);
    const node = nodeId ? nodesById.get(nodeId) : undefined;
    if (!node?.parentId) return;
    event.preventDefault();
    event.stopPropagation();
    const moved = projectStore.moveFileNode(project.id, node.id, null);
    setAnnouncement(moved ? `${node.name} wurde ohne Ordner abgelegt.` : `${node.name} kann dort nicht abgelegt werden.`);
    if (moved) projectStore.sealHistory(project.id);
    else showMoveError(node.name);
    clearDrag();
  };

  const moveByButton = (node: FileNode, direction: -1 | 1) => {
    const moved = projectStore.moveNodeOrder(project.id, "files", node.id, direction);
    setAnnouncement(moved ? `${node.name} wurde verschoben.` : `${node.name} konnte nicht verschoben werden.`);
    if (moved) projectStore.sealHistory(project.id);
    else showMoveError(node.name);
  };

  const closeMoveDialog = () => {
    const nodeId = movingId;
    setMovingId(null);
    window.setTimeout(() => {
      const currentTrigger = nodeId ? document.getElementById(`document-move-${nodeId}`) : null;
      (currentTrigger ?? moveTriggerRef.current)?.focus();
    }, 0);
  };

  const openMoveDialog = (event: ReactMouseEvent<HTMLButtonElement>, nodeId: string) => {
    moveTriggerRef.current = event.currentTarget;
    setMovingId(nodeId);
  };

  const moveToDestination = (destinationParentId: string | null) => {
    if (!movingNode) return;
    const moved = projectStore.moveFileNode(project.id, movingNode.id, destinationParentId);
    const destinationName = destinationParentId ? nodesById.get(destinationParentId)?.name : "Dokumente ohne Ordner";
    setAnnouncement(moved
      ? `${movingNode.name} wurde nach ${destinationName ?? "dem gewählten Ordner"} verschoben.`
      : `${movingNode.name} kann dort nicht abgelegt werden.`);
    if (!moved) {
      showMoveError(movingNode.name);
      return;
    }
    if (destinationParentId) {
      setExpandedFolderIds((current) => new Set(current).add(destinationParentId));
    }
    projectStore.sealHistory(project.id);
    closeMoveDialog();
  };

  const renderDropSlot = (
    parentId: string | null,
    beforeId: string | null,
    kind: FileKind,
    label: string
  ) => {
    const active = dropTarget?.mode === "before"
      && dropTarget.parentId === parentId
      && dropTarget.beforeId === beforeId
      && dropTarget.kind === kind;

    return (
      <DropSlot
        active={active}
        dragging={Boolean(draggingId)}
        label={label}
        parentId={parentId}
        beforeId={beforeId}
        kind={kind}

        onDragOver={(event) => {
          const nodeId = draggingIdRef.current;
          const node = nodeId ? nodesById.get(nodeId) : undefined;
          if (!node || node.kind !== kind) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          activateDropTarget({ mode: "before", parentId, beforeId, kind });
        }}
        onDrop={(event) => dropBefore(event, parentId, beforeId, kind)}
      />
    );
  };

  const renderGroup = (parentId: string | null, ancestors: Set<string>, root = false): ReactNode => {
    const group = childrenByParent.get(parentId) ?? { folders: [], files: [] };

    return (
      <ul>
        {group.folders.map((folder, index) => {
          if (ancestors.has(folder.id)) return null;
          const expanded = expandedFolderIds.has(folder.id);
          const folderDropActive = dropTarget?.mode === "inside" && dropTarget.folderId === folder.id;
          const nextAncestors = new Set(ancestors).add(folder.id);

          return (
            <Fragment key={folder.id}>
              {renderDropSlot(parentId, folder.id, "folder", "Ordner hier einsortieren")}
              <li>
                <div
                  data-drop-zone="folder"
                  data-folder-id={folder.id}
                  onDragOver={(event) => {
                    const nodeId = draggingIdRef.current;
                    if (!nodeId || nodeId === folder.id) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = "move";
                    activateDropTarget({ mode: "inside", folderId: folder.id });
                  }}
                  onDrop={(event) => dropInsideFolder(event, folder)}
                  className="group flex flex-col gap-1 py-1.5 transition-colors hover:bg-muted/30"
                  style={{
                    background: folderDropActive ? "hsl(var(--accent-gold) / 0.12)" : undefined,
                    opacity: draggingId === folder.id ? 0.45 : 1,
                  }}
                >
                  <div className="flex min-h-9 items-center gap-2">
                    <span
                      onPointerDown={(event) => onNodePointerDown(event, folder)}
                      onPointerMove={onFilePointerMove}
                      onPointerUp={onFilePointerUp}
                      onPointerCancel={() => { pointerDragRef.current = null; clearDrag(); }}
                      className="shrink-0 cursor-grab touch-none text-muted-foreground"
                      aria-hidden="true"
                    >
                      <GripVertical size={14} />
                    </span>
                    {renamingId === folder.id ? (
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleFolder(folder.id)}
                          aria-expanded={expanded}
                          aria-controls={`document-folder-${folder.id}`}
                          aria-label={`${folder.name} ${expanded ? "einklappen" : "ausklappen"}`}
                          className="flex shrink-0 items-center gap-2"
                        >
                          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          {expanded ? (
                            <FolderOpen size={18} style={{ color: "hsl(var(--accent-gold))" }} />
                          ) : (
                            <Folder size={18} style={{ color: "hsl(var(--accent-gold))" }} />
                          )}
                        </button>
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          onBlur={() => finishRename(folder)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") finishRename(folder);
                            if (event.key === "Escape") setRenamingId(null);
                          }}
                          className="min-w-0 flex-1 border-b bg-transparent text-sm outline-none"
                          style={{ borderColor: "hsl(var(--hairline))" }}
                          aria-label={`${folder.name} umbenennen`}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleFolder(folder.id)}
                        aria-expanded={expanded}
                        aria-controls={`document-folder-${folder.id}`}
                        aria-label={`${folder.name} ${expanded ? "einklappen" : "ausklappen"}`}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        {expanded ? (
                          <FolderOpen size={18} style={{ color: "hsl(var(--accent-gold))" }} />
                        ) : (
                          <Folder size={18} style={{ color: "hsl(var(--accent-gold))" }} />
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{folder.name}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-0.5 pl-9">
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); addFolder(folder.id); }}
                      className="whitespace-nowrap px-1 text-[11px] font-medium hover:underline"
                      style={{ color: "hsl(var(--accent-gold))" }}
                      aria-label={`Unterordner in ${folder.name} erstellen`}
                    >
                      + Unterordner
                    </button>
                    <button type="button" disabled={index === 0} onClick={() => moveByButton(folder, -1)} title="Nach oben" aria-label={`${folder.name} nach oben verschieben`} className={DOCUMENT_ACTION_CLASS}>
                      <ChevronUp size={13} />
                    </button>
                    <button type="button" disabled={index === group.folders.length - 1} onClick={() => moveByButton(folder, 1)} title="Nach unten" aria-label={`${folder.name} nach unten verschieben`} className={DOCUMENT_ACTION_CLASS}>
                      <ChevronDown size={13} />
                    </button>
                    <button id={`document-move-${folder.id}`} type="button" onClick={(event) => openMoveDialog(event, folder.id)} title="Verschieben" aria-label={`${folder.name} verschieben`} className={DOCUMENT_ACTION_CLASS}>
                      <FolderInput size={13} />
                    </button>
                    <button type="button" onClick={() => startRename(folder)} title="Umbenennen" aria-label={`${folder.name} umbenennen`} className={DOCUMENT_ACTION_CLASS}>
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Ordner „${folder.name}“ und alle Inhalte löschen?`)) {
                          const deleted = projectStore.deleteNode(project.id, "files", folder.id);
                          if (deleted) projectStore.sealHistory(project.id);
                          else showPersistenceError(`Der Ordner „${folder.name}“`);
                        }
                      }}
                      title="Löschen"
                      aria-label={`${folder.name} löschen`}
                      className={DOCUMENT_ACTION_CLASS}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>


                {expanded && (
                  <div
                    id={`document-folder-${folder.id}`}
                    className="ml-5 border-l pl-3"
                    style={{ borderColor: "hsl(var(--hairline))" }}
                  >
                    {renderGroup(folder.id, nextAncestors)}
                  </div>
                )}
              </li>
            </Fragment>
          );
        })}

        {renderDropSlot(parentId, null, "folder", "Ordner ans Ende verschieben")}

        {root && group.folders.length > 0 && group.files.length > 0 && (
          <li className="pb-1 pt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Dokumente ohne Ordner
          </li>
        )}

        {group.files.length > 0 && (
          <li>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {group.files.map((file) => {
                const dropActive = dropTarget?.mode === "before"
                  && dropTarget.kind === "file"
                  && dropTarget.parentId === parentId
                  && dropTarget.beforeId === file.id;
                return (
                  <div
                    key={file.id}
                    draggable={renamingId !== file.id}
                    onDragStart={(event) => {
                      draggingIdRef.current = file.id;
                      setDraggingId(file.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(DOCUMENT_DRAG_TYPE, file.id);
                      event.dataTransfer.setData("text/plain", file.name);
                    }}
                    onDragEnd={clearDrag}
                    onPointerDown={(event) => onNodePointerDown(event, file)}
                    onPointerMove={onFilePointerMove}
                    onPointerUp={onFilePointerUp}
                    onPointerCancel={() => { pointerDragRef.current = null; clearDrag(); }}
                    onDragOver={(event) => {
                      const nodeId = draggingIdRef.current;
                      const dragged = nodeId ? nodesById.get(nodeId) : undefined;
                      if (!dragged || dragged.kind !== "file" || dragged.id === file.id) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = "move";
                      activateDropTarget({ mode: "before", parentId, beforeId: file.id, kind: "file" });
                    }}
                    onDrop={(event) => dropBefore(event, parentId, file.id, "file")}
                    className="flex flex-col gap-1.5 rounded-md border p-2"
                    style={{
                      touchAction: "pan-y",
                      opacity: draggingId === file.id ? 0.45 : 1,
                      borderColor: "hsl(var(--hairline))",
                      boxShadow: dropActive ? "inset 2px 0 0 hsl(var(--accent-gold))" : undefined,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setViewingId(file.id)}
                      title={`${file.name} öffnen`}
                      aria-label={`${file.name} öffnen`}
                      className="w-full"
                    >
                      <DocumentPreview node={file} />
                    </button>

                    {renamingId === file.id ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onBlur={() => finishRename(file)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") finishRename(file);
                          if (event.key === "Escape") setRenamingId(null);
                        }}
                        className="w-full border-b bg-transparent text-xs outline-none"
                        style={{ borderColor: "hsl(var(--hairline))" }}
                      />
                    ) : (
                      <div className="break-words text-xs leading-4" title={file.name}>{file.name}</div>
                    )}
                    <div className="text-[10px] text-muted-foreground">{humanSize(file.sizeBytes)}</div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                      <button type="button" onClick={() => startRename(file)} className="hover:underline">Umbenennen</button>
                      {file.dataUrl && (
                        <a href={file.dataUrl} download={file.name} className="hover:underline">Herunterladen</a>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`„${file.name}“ löschen?`)) {
                            const deleted = projectStore.deleteNode(project.id, "files", file.id);
                            if (deleted) projectStore.sealHistory(project.id);
                            else showPersistenceError(`„${file.name}“`);
                          }
                        }}
                        className="hover:underline"
                      >
                        Löschen
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </li>
        )}

        {renderDropSlot(parentId, null, "file", "Dokument ans Ende verschieben")}


        {!root && group.folders.length === 0 && group.files.length === 0 && (
          <li className="py-2 text-xs text-muted-foreground">Dieser Ordner ist leer.</li>
        )}
      </ul>
    );
  };

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-end gap-2 border-b pb-3" style={{ borderColor: "hsl(var(--hairline))" }}>
        <button
          type="button"
          onClick={() => addFolder(null)}
          className="flex h-8 items-center gap-1.5 px-2 text-xs font-medium hover:underline"
        >
          <Folder size={14} /> + Ordner
        </button>
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium"
          style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
        >
          <FileText size={14} /> + Dokument
        </button>
        <input
          ref={uploadRef}
          type="file"
          multiple
          accept={ACCEPTED_DOCUMENTS}
          className="hidden"
          onChange={(event) => {
            uploadDocuments(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <div className="pt-3">
        {draggingFromFolder && (
          <div
            onDragOver={(event) => {
              const nodeId = draggingIdRef.current;
              const node = nodeId ? nodesById.get(nodeId) : undefined;
              if (!node?.parentId) return;
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "move";
              activateDropTarget({ mode: "root" });
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setDropTarget((current) => current?.mode === "root" ? null : current);
            }}
            data-drop-zone="root"
            onDrop={dropAtRoot}
            className="mb-3 flex min-h-14 items-center justify-center gap-2 rounded-md border border-dashed px-3 text-center text-xs font-medium transition-colors"
            style={{
              background: dropTarget?.mode === "root"
                ? "hsl(var(--accent-gold) / 0.16)"
                : "hsl(var(--surface-muted) / 0.5)",
              borderColor: dropTarget?.mode === "root"
                ? "hsl(var(--accent-gold) / 0.75)"
                : "hsl(var(--hairline))",
            }}
          >
            <FolderInput size={16} aria-hidden="true" style={{ color: "hsl(var(--accent-gold))" }} />
            Ohne Ordner ablegen
          </div>
        )}
        {nodes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Noch keine Dokumente. Lege einen Ordner an oder füge ein PDF, JPG oder PNG hinzu.
          </p>
        ) : (
          renderGroup(null, new Set(), true)
        )}
      </div>

      <Dialog open={Boolean(movingNode)} onOpenChange={(open) => { if (!open) closeMoveDialog(); }}>
        {movingNode && (
          <DialogContent className="max-w-md p-4">
            <DialogHeader>
              <DialogTitle className="text-sm">„{movingNode.name}“ verschieben</DialogTitle>
              <DialogDescription className="text-xs">Wähle einen Zielordner oder lege das Element ohne Ordner ab.</DialogDescription>
            </DialogHeader>

            <div className="max-h-[50vh] space-y-1 overflow-y-auto">
              <button
                type="button"
                disabled={movingNode.parentId === null}
                onClick={() => moveToDestination(null)}
                className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-muted disabled:opacity-40"
              >
                <Folder size={14} /> Ohne Ordner ablegen
                {movingNode.parentId === null && <span className="ml-auto text-muted-foreground">Aktuell</span>}
              </button>
              {destinationFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  disabled={movingNode.parentId === folder.id}
                  onClick={() => moveToDestination(folder.id)}
                  className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted disabled:opacity-40"
                >
                  <Folder size={14} className="shrink-0" />
                  <span className="min-w-0 flex-1 break-words">{folderPath(folder)}</span>
                  {movingNode.parentId === folder.id && <span className="text-muted-foreground">Aktuell</span>}
                </button>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={closeMoveDialog}
                className="h-8 rounded-md border px-3 text-xs"
                style={{ borderColor: "hsl(var(--hairline))" }}
              >
                Abbrechen
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {viewingNode && <DocumentViewer node={viewingNode} onClose={() => setViewingId(null)} />}

      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}
