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
import { toast } from "@/hooks/use-toast";

export function ProjectAccessProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();

  useEffect(() => {
    if (!session) {
      projectStore.setWriteGuard(null);
      return;
    }

    projectStore.setWriteGuard((projectId) => projectAccessStore.canEdit(projectId));
    void projectAccessStore.reload();

    let lastToast = 0;
    const offBlocked = projectStore.onWriteBlocked(() => {
      const now = Date.now();
      if (now - lastToast < 4000) return;
      lastToast = now;
      toast({
        title: "Keine Schreibrechte",
        description: "Für dieses Projekt besteht nur Leserecht. Änderungen wurden nicht gespeichert.",
        variant: "destructive",
      });
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
      projectStore.setWriteGuard(null);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [session]);

  return <>{children}</>;
}
