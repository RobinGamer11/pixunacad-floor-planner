/**
 * Bindet die Live-Zusammenarbeit an eine geöffnete Projektmappe.
 *
 * Die Schicht hängt sich nur an vorhandene Punkte: Änderungen im Projekt-Store,
 * die geöffnete Seite, die Auswahl und laufende Zeigergesten. Am Element- oder
 * Seitenmodell der Projektmappe wird nichts verändert.
 */
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { projectAccessStore } from "@/lib/projectAccess";
import { MappeCollabSession, type MappeCollabStatus } from "./session";
import { setMappeSession, setMappeStatus } from "./store";

const EMPTY: MappeCollabStatus = {
  connected: false,
  unavailable: false,
  peers: [],
  locksByObject: new Map(),
  previewByObject: new Map(),
};

export interface UseMappeCollabArgs {
  projectId: string | undefined;
  /** Aktuell geöffnete Projektmappen-Seite. */
  pageId: string | null;
  /** Aktuell ausgewähltes Element (weiche Bearbeitungsmarkierung). */
  selectedElementId: string | null;
  /** Element, in dem gerade getippt wird (Text/Tabelle). */
  editingElementId?: string | null;
  onFieldConflict?: (objectId: string) => void;
}

export function useMappeCollab({
  projectId,
  pageId,
  selectedElementId,
  editingElementId = null,
  onFieldConflict,
}: UseMappeCollabArgs) {
  const { session: authSession } = useAuth();
  const [status, setStatus] = useState<MappeCollabStatus>(EMPTY);
  const sessionRef = useRef<MappeCollabSession | null>(null);
  const editingRef = useRef<string | null>(editingElementId);
  editingRef.current = editingElementId;
  const conflictRef = useRef(onFieldConflict);
  conflictRef.current = onFieldConflict;

  useEffect(() => {
    const userId = authSession?.user?.id;
    if (!projectId || !userId) return;
    if (!projectAccessStore.accessFor(projectId).shared) return;

    const displayName =
      (authSession?.user?.user_metadata?.display_name as string | undefined) ||
      (authSession?.user?.email ?? "").split("@")[0] ||
      "Unbekannt";

    const collab = new MappeCollabSession({
      projectId,
      userId,
      displayName,
      getProtectedObjectId: () => editingRef.current,
      onFieldConflict: (id) => conflictRef.current?.(id),
      onStatus: (next) => { setStatus({ ...next }); setMappeStatus({ ...next }); },
    });
    sessionRef.current = collab;
    setMappeSession(collab);
    void collab.start();

    // Nach dem Loslassen: Vorschau beenden, die dauerhafte Änderung folgt.
    const onPointerUp = () => collab.finishPreview();
    const onKeyDown = (ev: KeyboardEvent) => { if (ev.key === "Escape") collab.cancelPreview(); };
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      collab.destroy();
      sessionRef.current = null;
      setStatus(EMPTY);
    };
  }, [projectId, authSession]);

  // Präsenz je geöffneter Seite.
  useEffect(() => {
    sessionRef.current?.setPage(pageId);
  }, [pageId]);

  // Weiche Bearbeitungsmarkierung für das ausgewählte Element.
  useEffect(() => {
    const collab = sessionRef.current;
    if (!collab || !pageId) return;
    if (!selectedElementId) { void collab.unlockAll(); return; }
    void collab.lockObject(pageId, selectedElementId);
    return () => { void collab.unlockObject(pageId, selectedElementId); };
  }, [pageId, selectedElementId]);

  return { status, session: sessionRef };
}
