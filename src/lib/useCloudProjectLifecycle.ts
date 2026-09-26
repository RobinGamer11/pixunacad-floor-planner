/**
 * Kontoübergreifender Projektablauf beim Öffnen eines Projekts.
 *
 *  - Registriert das Projekt nicht-blockierend in der Cloud (gleiche ID,
 *    angemeldeter Benutzer als Besitzer). Scheitert das, bleibt das Projekt
 *    voll nutzbar („Nur auf diesem Gerät“) und es wird beim nächsten Öffnen
 *    bzw. über „In Cloud sichern“ erneut versucht.
 *  - Prüft bei Rückkehr in die App (Fokus/Sichtbarkeit) den Cloudstand –
 *    eine einzelne, leichte Abfrage, keine Dauerverbindung.
 */
import { useEffect } from "react";
import { ensureSharedProject } from "@/lib/projectRegistration";
import { refreshProjectFromCloud } from "@/lib/projectSync";
import { projectStore } from "@/lib/projectStore";

const REFRESH_MIN_GAP_MS = 15_000;

export function registerProjectInCloud(projectId: string) {
  const name = projectStore.getState().projects.find((p) => p.id === projectId)?.name;
  return ensureSharedProject(projectId, name);
}

export function useCloudProjectLifecycle(projectId: string | undefined) {
  useEffect(() => {
    if (!projectId) return;
    void registerProjectInCloud(projectId);

    let last = Date.now();
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < REFRESH_MIN_GAP_MS) return;
      last = Date.now();
      void refreshProjectFromCloud(projectId);
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [projectId]);
}
