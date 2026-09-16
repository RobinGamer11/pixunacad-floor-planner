/**
 * Bindet die CAD-Zusammenarbeit an einen geöffneten Editor.
 *
 * Bewusst minimal-invasiv: Der Zeichenkern wird nicht verändert, es wird nur
 * auf bestätigte Änderungen reagiert und fremde Änderungen werden objektweise
 * eingespielt.
 */
import { useEffect, useRef, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import { useAuth } from "@/components/auth/AuthProvider";
import { projectAccessStore } from "@/lib/projectAccess";
import { CadCollabSession, type CollabStatus } from "./session";

const EMPTY: CollabStatus = {
  connected: false,
  unavailable: false,
  peers: [],
  editingByObject: new Map(),
};

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

    const previous = app.onSceneCommitted;
    app.onSceneCommitted = () => {
      previous?.();
      collab.notifyLocalChange();
    };
    void collab.start();

    return () => {
      app.onSceneCommitted = previous;
      collab.destroy();
      sessionRef.current = null;
      setStatus(EMPTY);
    };
  }, [app, projectId, authSession]);

  return { status, session: sessionRef };
}
