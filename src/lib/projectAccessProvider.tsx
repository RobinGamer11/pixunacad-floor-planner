/**
 * Verbindet den gemeinsamen Projektzugriff mit dem lokalen Projektstore.
 *
 * Aufgaben:
 *  - Rollen/Rechte des angemeldeten Benutzers laden und aktuell halten
 *    (inkl. Realtime, damit ein Rechteentzug sofort greift).
 *  - Zentralen Schreibschutz im Projektstore registrieren: Änderungen an
 *    Projekten ohne Schreibrecht werden verworfen – auch über Tastenkürzel,
 *    Einfügen, Löschen oder Import. Serverseitig gilt dieselbe Regel per RLS.
 */
import { ReactNode, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getNetworkClient } from "@/lib/networkClient";
import { projectAccessStore } from "@/lib/projectAccess";
import { projectStore } from "@/lib/projectStore";
import {
  hydrateSharedProject,
  onSharedSync,
  resetSharedSyncState,
  scheduleSharedSave,
  sharedProjectIds,
} from "@/lib/sharedProjectSync";
import { setSharedProjectIdsProvider } from "@/lib/workspaceStorage";
import { toast } from "@/hooks/use-toast";

export function ProjectAccessProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();

  useEffect(() => {
    if (!session) {
      projectStore.setWriteGuard(null);
      setSharedProjectIdsProvider(null);
      resetSharedSyncState();
      return;
    }

    projectStore.setWriteGuard((projectId) => projectAccessStore.canEdit(projectId));
    setSharedProjectIdsProvider(sharedProjectIds);
    void projectAccessStore.reload();

    let lastToast = 0;
    const notifyOnce = (title: string, description: string) => {
      const now = Date.now();
      if (now - lastToast < 4000) return;
      lastToast = now;
      toast({ title, description, variant: "destructive" });
    };

    const offBlocked = projectStore.onWriteBlocked(() => {
      notifyOnce(
        "Keine Schreibrechte",
        "Für dieses Projekt besteht nur Leserecht. Änderungen wurden nicht gespeichert.",
      );
    });

    const offSync = onSharedSync((event) => {
      if (event.type === "conflict") {
        notifyOnce(
          "Gleichzeitige Änderung",
          "Jemand anderes hat dieses Projekt zwischenzeitlich gespeichert. Der neuere Stand wurde geladen.",
        );
      } else if (event.type === "forbidden") {
        notifyOnce("Keine Schreibrechte", "Die Änderung wurde von der Datenbank abgelehnt.");
      }
    });

    // Geteilte Projekte laden, sobald die Rollen bekannt sind.
    const hydrated = new Set<string>();
    const hydrateAll = () => {
      if (!projectAccessStore.getState().ready) return;
      sharedProjectIds().forEach((id) => {
        if (hydrated.has(id)) return;
        hydrated.add(id);
        void hydrateSharedProject(id);
      });
    };
    const offAccess = projectAccessStore.subscribe(hydrateAll);
    hydrateAll();

    // Lokale Änderungen an geteilten Projekten hochladen.
    let known = new Map(projectStore.getState().projects.map((p) => [p.id, p] as const));
    const offProjects = projectStore.subscribe(() => {
      const next = new Map(projectStore.getState().projects.map((p) => [p.id, p] as const));
      next.forEach((project, id) => {
        if (known.get(id) !== project) scheduleSharedSave(id);
      });
      known = next;
    });

    // Rollen-/Mitgliedschaftsänderungen sofort übernehmen.
    const client = getNetworkClient();
    let debounce = 0;
    const refresh = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => { void projectAccessStore.reload(); }, 250);
    };
    const channel = client
      ?.channel("pixuna-project-access")
      .on("postgres_changes", { event: "*", schema: "public", table: "project_members" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "network_projects" }, refresh)
      .subscribe();
    const poll = window.setInterval(refresh, 60_000);

    return () => {
      window.clearTimeout(debounce);
      window.clearInterval(poll);
      offBlocked();
      offSync();
      offAccess();
      offProjects();
      projectStore.setWriteGuard(null);
      setSharedProjectIdsProvider(null);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [session]);

  return <>{children}</>;
}
