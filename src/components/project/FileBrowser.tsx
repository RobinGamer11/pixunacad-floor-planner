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
  Search,
  Trash2,
  UploadCloud,
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
      title={label}
      className={`relative transition-all ${dragging ? "h-2" : "h-1"}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dragging && (
        // Nur ein schmaler Strich: zeigt die Einsortier-Position an, ist aber
        // klar von den Ordner-Ablageflächen unterscheidbar.
        <span
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-full transition-all"
          style={{
            height: active ? 3 : 1,
            background: active
              ? "hsl(var(--accent-gold))"
              : "hsl(var(--hairline))",
          }}
        />
      )}
    </li>
  );
}


export function FileBrowser({ project }: Props) {
  const nodes = useMemo(() => project.files ?? [], [project.files]);
  const [query, setQuery] = useState("");
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());
  /** Aktuell geöffneter Ordner (Pfadnavigation wie in der Vorlage). */
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
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
  const visibleNodeIds = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("de-DE");
    if (!term) return null;
    const ids = new Set<string>();
    for (const node of nodes) {
      if (!node.name.toLocaleLowerCase("de-DE").includes(term)) continue;
      ids.add(node.id);
      let parentId = node.parentId;
      while (parentId) {
        ids.add(parentId);
        parentId = nodesById.get(parentId)?.parentId ?? null;
      }
    }
    return ids;
  }, [nodes, nodesById, query]);
  const childrenByParent = useMemo(() => {
    const groups = new Map<string | null, NodeGroup>();
    for (const node of nodes) {
      if (visibleNodeIds && !visibleNodeIds.has(node.id)) continue;
      const group = groups.get(node.parentId) ?? { folders: [], files: [] };
      if (node.kind === "folder") group.folders.push(node);
      else group.files.push(node);
      groups.set(node.parentId, group);
    }
    return groups;
  }, [nodes, visibleNodeIds]);

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

  /** Pfad des aktuell geöffneten Ordners für die Pfadleiste. */
  const trail = useMemo(() => {
    const out: FileNode[] = [];
    const visited = new Set<string>();
    let id: string | null = currentFolderId;
    while (id && !visited.has(id)) {
      visited.add(id);
      const node = nodesById.get(id);
      if (!node) break;
      out.unshift(node);
      id = node.parentId ?? null;
    }
    return out;
  }, [currentFolderId, nodesById]);

  // Gelöschter oder verschobener Ordner: sauber zurück auf die oberste Ebene.
  useEffect(() => {
    if (currentFolderId && !nodesById.has(currentFolderId)) setCurrentFolderId(null);
  }, [currentFolderId, nodesById]);

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
        const nodeId = projectStore.addFile(project.id, "files", currentFolderId, {
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
  const suppressClickRef = useRef(false);


  const PROXIMITY_PX = 70;

  const hitDropZone = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const direct = el?.closest<HTMLElement>("[data-drop-zone]") ?? null;
    if (direct) return direct;
    // Nähe-Erkennung: nächstgelegene Einfüge-Zone innerhalb eines Toleranzbereichs
    let best: HTMLElement | null = null;
    let bestDist = PROXIMITY_PX;
    document.querySelectorAll<HTMLElement>('[data-drop-zone="before"]').forEach((zone) => {
      const r = zone.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const dx = Math.max(r.left - x, 0, x - r.right);
      const dy = Math.max(r.top - y, 0, y - r.bottom);
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = zone;
      }
    });
    return best;
  };


  const resolvePointerTarget = (x: number, y: number, draggedId: string): DropTarget | null => {
    const dragged = nodesById.get(draggedId);
    if (!dragged) return null;
    const zone = hitDropZone(x, y);
    if (!zone) return null;
    const mode = zone.dataset.dropZone;
    if (mode === "root") return dragged.parentId ? { mode: "root" } : null;
    if (mode === "folder") {
      const folderId = zone.dataset.folderId;
      if (!folderId || folderId === draggedId) return null;
      return { mode: "inside", folderId };
    }
    if (mode === "before") {
      const kind = zone.dataset.kind as FileKind | undefined;
      if (!kind || kind !== dragged.kind) return null;
      return {
        mode: "before",
        parentId: zone.dataset.parentId ? zone.dataset.parentId : null,
        beforeId: zone.dataset.beforeId ? zone.dataset.beforeId : null,
        kind,
      };
    }
    return null;
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
    suppressClickRef.current = true;

    const node = nodesById.get(drag.id);
    const target = resolvePointerTarget(event.clientX, event.clientY, drag.id);
    if (node && target) {
      if (target.mode === "root") moveNodeTo(node, null);
      else if (target.mode === "inside") moveNodeTo(node, target.folderId);
      else {
        const moved = projectStore.moveFileNode(project.id, node.id, target.parentId, target.beforeId);
        setAnnouncement(moved ? `${node.name} wurde verschoben.` : `${node.name} kann dort nicht abgelegt werden.`);
        if (moved) projectStore.sealHistory(project.id);
        else showMoveError(node.name);
      }
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
          // Ohne Suche wird navigiert (Pfadleiste), bei Suche flach aufgeklappt.
          const expanded = Boolean(visibleNodeIds);
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
                  className="group flex flex-col gap-1 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/30"
                  style={{
                    background: folderDropActive
                      ? "hsl(var(--accent-gold) / 0.16)"
                      : draggingId && draggingId !== folder.id
                        ? "hsl(var(--accent-gold) / 0.05)"
                        : undefined,
                    // Nur echte Ablageziele (Ordner) bekommen beim Ziehen einen Rahmen.
                    border: folderDropActive
                      ? "1px dashed hsl(var(--accent-gold))"
                      : draggingId && draggingId !== folder.id
                        ? "1px dashed hsl(var(--accent-gold) / 0.45)"
                        : "1px dashed transparent",
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
                          onClick={() => openFolder(folder.id)}
                          aria-label={`${folder.name} öffnen`}
                          className="flex shrink-0 items-center gap-2"
                        >
                          {expanded ? (
                            <FolderOpen size={22} style={{ color: "hsl(var(--accent-gold))" }} />
                          ) : (
                            <Folder size={22} style={{ color: "hsl(var(--accent-gold))" }} />
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
                        onClick={() => openFolder(folder.id)}
                        aria-label={`${folder.name} öffnen`}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        {expanded ? (
                          <FolderOpen size={26} style={{ color: "hsl(var(--accent-gold))" }} />
                        ) : (
                          <Folder size={26} style={{ color: "hsl(var(--accent-gold))" }} />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">{folder.name}</span>
                          <span className="block text-[11px] text-muted-foreground">Ordner</span>
                        </span>
                        <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
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
            <div>
              {group.files.map((file) => {
                const dropActive = dropTarget?.mode === "before"
                  && dropTarget.kind === "file"
                  && dropTarget.parentId === parentId
                  && dropTarget.beforeId === file.id;
                return (
                  <div
                    key={file.id}
                    draggable={false}
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
                    onClick={(event) => {
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                      }
                      if ((event.target as HTMLElement).closest("button, a, input")) return;
                      setViewingId(file.id);
                    }}
                    role="button"
                    tabIndex={0}
                    title={`${file.name} öffnen`}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && event.target === event.currentTarget) setViewingId(file.id);
                    }}
                    className="group flex min-h-16 cursor-pointer items-center gap-3 border-b px-2 py-2.5 transition-colors hover:bg-muted/30"
                    style={{
                      touchAction: "pan-y",
                      opacity: draggingId === file.id ? 0.45 : 1,
                      borderColor: dropActive ? "hsla(38, 45%, 45%, 0.7)" : "hsl(var(--hairline))",
                      background: dropActive ? "hsla(38, 45%, 70%, 0.25)" : undefined,
                    }}
                  >
                    <div className="h-12 w-16 shrink-0 overflow-hidden rounded-sm" aria-hidden="true">
                      <DocumentPreview node={file} />
                    </div>


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
                        className="min-w-0 flex-1 border-b bg-transparent text-sm outline-none"
                        style={{ borderColor: "hsl(var(--hairline))" }}
                      />
                    ) : (
                      <div className="min-w-0 flex-1" title={file.name}>
                        <div className="truncate text-sm font-semibold">{file.name}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {(isPdf(file) ? "PDF" : isImage(file) ? "Bild" : "Dokument")}{humanSize(file.sizeBytes) ? ` · ${humanSize(file.sizeBytes)}` : ""}
                        </div>
                      </div>
                    )}

                    <div className="ml-auto flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] opacity-70 transition-opacity group-hover:opacity-100">
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
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          className="flex h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold"
          style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--ink))" }}
        >
          <FileText size={16} /> + Dokument
        </button>
        <button
          type="button"
          onClick={() => addFolder(null)}
          className="flex h-11 items-center justify-center gap-2 rounded-md border px-5 text-sm font-semibold"
          style={{ borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--accent-gold))" }}
        >
          <Folder size={16} /> + Ordner
        </button>
        <label className="relative sm:ml-auto sm:w-[360px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Dokumente durchsuchen …"
            aria-label="Dokumente durchsuchen"
            className="h-11 w-full rounded-md border bg-transparent pl-10 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-muted) / 0.45)" }}
          />
        </label>
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

      <div className="rounded-md border p-4 sm:p-5" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
        <div className="mb-3 border-b pb-3 text-sm font-medium" style={{ borderColor: "hsl(var(--hairline))" }}>
          Alle Dokumente
        </div>
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
        ) : visibleNodeIds?.size === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Keine passenden Dokumente gefunden.</p>
        ) : (
          renderGroup(null, new Set(), true)
        )}
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("Files")) event.preventDefault();
          }}
          onDrop={(event) => {
            if (!event.dataTransfer.files.length) return;
            event.preventDefault();
            uploadDocuments(event.dataTransfer.files);
          }}
          className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-md border border-dashed px-4 text-sm text-muted-foreground transition-colors hover:bg-muted/30"
          style={{ borderColor: "hsl(var(--accent-gold) / 0.45)" }}
        >
          <UploadCloud size={18} style={{ color: "hsl(var(--accent-gold))" }} />
          Dokumente hier ablegen oder <span className="font-semibold" style={{ color: "hsl(var(--accent-gold))" }}>hinzufügen</span>
        </button>
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
