/**
 * Bindet die CAD-Zusammenarbeit an einen geöffneten Editor.
 *
 * Bewusst minimal-invasiv: Der Zeichenkern wird nicht verändert. Die Schicht
 * reagiert nur auf bestätigte Änderungen, überträgt während einer laufenden
 * Geste eine flüchtige Vorschau, setzt weiche Bearbeitungsmarkierungen und
 * meldet Präsenz.
 */
import { useEffect, useRef, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import { useAuth } from "@/components/auth/AuthProvider";
import { projectAccessStore } from "@/lib/projectAccess";
import { CadCollabSession, type CollabStatus } from "./session";

const EMPTY: CollabStatus = {
  connected: false,
  mode: "off",
  unavailable: false,
  peers: [],
  editingByObject: new Map(),
  locksByObject: new Map(),
};

const CURSOR_THROTTLE_MS = 120;

/** Liest die Objekt-ID aus der aktuellen Auswahl (unabhängig vom Auswahltyp). */
function selectionObjectId(selection: unknown): string | null {
  const sel = selection as Record<string, unknown> | null;
  if (!sel) return null;
  const keys = [
    "segmentId", "hatchId", "dimensionId", "textBoxId", "tableId",
    "libraryInstanceId", "documentId", "freeStrokeId", "wallId", "doorId",
  ];
  for (const key of keys) {
    const value = sel[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

export function useCadCollab(app: CadApp | null, projectId: string | undefined) {
  const { session: authSession } = useAuth();
  const [status, setStatus] = useState<CollabStatus>(EMPTY);
  const sessionRef = useRef<CadCollabSession | null>(null);

  useEffect(() => {
    const userId = authSession?.user?.id;
    if (!app || !projectId || !userId) return;
    const access = projectAccessStore.accessFor(projectId);
    if (!access.shared) return; // rein persönliches Projekt: unverändert lokal

    const displayName =
      (authSession?.user?.user_metadata?.display_name as string | undefined) ||
      (authSession?.user?.email ?? "").split("@")[0] ||
      "Unbekannt";

    const collab = new CadCollabSession({
      projectId,
      userId,
      displayName,
      app: app as never,
      requestRender: () => {
        app.markExternalChange();
        app.renderer?.render?.();
      },
      onStatus: (next) => setStatus({ ...next }),
    });
    sessionRef.current = collab;

    /* ------------------------------------------ bestätigte Änderungen */
    const previousCommit = app.onSceneCommitted;
    app.onSceneCommitted = () => {
      previousCommit?.();
      collab.notifyLocalChange();
    };

    // Bibliotheksdefinitionen und Ordner mitsynchronisieren.
    const previousLibrary = app.onLibraryChange;
    app.onLibraryChange = () => {
      previousLibrary?.();
      collab.notifyLocalChange();
    };

    /* ------------------------------------------ weiche Bearbeitungssperre */
    let lockedId: string | null = null;
    const releaseLock = () => {
      if (!lockedId) return;
      const id = lockedId;
      lockedId = null;
      void collab.unlockObject(app.activeSheetId, id);
    };
    const syncLock = () => {
      const id = selectionObjectId(app.selection);
      if (id === lockedId) return;
      releaseLock();
      if (id) {
        lockedId = id;
        void collab.lockObject(app.activeSheetId, id);
      }
    };

    const previousSelection = app.onSelectionChange;
    app.onSelectionChange = () => {
      previousSelection?.();
      syncLock();
    };

    const previousTool = app.onToolChange;
    app.onToolChange = (toolId: string) => {
      previousTool?.(toolId);
      releaseLock();
      collab.updatePresence({ sheetId: app.activeSheetId, editingObjectId: null });
    };

    /* ------------------------------------------ Vorschau und Präsenz */
    const canvas = app.canvas;
    let dragging = false;
    let lastCursorAt = 0;

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      dragging = true;
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (dragging) collab.previewLocalChanges();
      const now = Date.now();
      if (now - lastCursorAt < CURSOR_THROTTLE_MS) return;
      lastCursorAt = now;
      try {
        const rect = canvas.getBoundingClientRect();
        const world = app.camera.screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
        collab.updatePresence({
          sheetId: app.activeSheetId,
          cursor: { x: world.x, y: world.y },
          editingObjectId: lockedId,
        });
      } catch { /* Präsenz ist ein weicher Hinweis */ }
    };
    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      // Die dauerhafte Änderung folgt über den normalen Verlaufsschritt.
      collab.finishPreview();
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      dragging = false;
      collab.cancelPreview();
      releaseLock();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);

    /* ------------------------------------------ Blattwechsel */
    let lastSheetId = app.activeSheetId;
    const sheetTimer = window.setInterval(() => {
      if (app.activeSheetId === lastSheetId) return;
      lastSheetId = app.activeSheetId;
      releaseLock();
      collab.updatePresence({ sheetId: lastSheetId, cursor: null, editingObjectId: null });
    }, 500);

    void collab.start();

    return () => {
      app.onSceneCommitted = previousCommit;
      app.onLibraryChange = previousLibrary;
      app.onSelectionChange = previousSelection;
      app.onToolChange = previousTool;
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.clearInterval(sheetTimer);
      collab.destroy();
      sessionRef.current = null;
      setStatus(EMPTY);
    };
  }, [app, projectId, authSession]);

  return { status, session: sessionRef };
}
