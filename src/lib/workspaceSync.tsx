import { ReactNode, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/AuthProvider";
import { captureSettings, mergeWorkspace, type WorkspacePayload } from "@/lib/workspaceStorage";

/**
 * Kontoweite Sicherung persönlicher Einstellungen.
 *
 * Wichtig: Hier wird bewusst KEIN vollständiger Abzug des lokalen Speichers
 * mehr übertragen. Projekt-, CAD-, Dokument- und Bilddaten laufen über die
 * projektbezogene Speicherung bzw. die objektbasierte Zusammenarbeit. Der
 * frühere Komplettabzug im Vier-Sekunden-Takt hat das Speicherkontingent
 * gesprengt („quota has been exceeded“).
 */
const CHECK_INTERVAL_MS = 15_000;
const MIN_RETRY_MS = 30_000;
const MAX_RETRY_MS = 10 * 60_000;

function LoadingWorkspace() {
  return (
    <div className="min-h-screen grid place-items-center bg-background p-6 text-center">
      <div>
        <div className="text-lg font-semibold">Arbeitsmappe wird geladen</div>
        <p className="mt-2 text-sm text-muted-foreground">Deine verschlüsselten Zugriffsrechte werden geprüft.</p>
      </div>
    </div>
  );
}

function friendlyMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/quota|payload too large|413/i.test(raw)) {
    return "Deine persönlichen Einstellungen konnten nicht gesichert werden, weil der Cloud-Speicher voll ist. Projekt- und Zeichnungsdaten sind davon nicht betroffen.";
  }
  if (/sitzung/i.test(raw)) return raw;
  return "Deine persönlichen Einstellungen konnten gerade nicht gesichert werden. Es wird später automatisch erneut versucht.";
}

export function WorkspaceSyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [ready, setReady] = useState(false);
  const [canSync, setCanSync] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const lastSnapshot = useRef<string>("");
  const saving = useRef(false);
  const retryAt = useRef(0);
  const retryDelay = useRef(MIN_RETRY_MS);
  const failures = useRef(0);

  useEffect(() => {
    if (!session) {
      setCanSync(false);
      setReady(true);
      return;
    }

    let active = true;
    const hydrationKey = `pixuna.workspace.hydrated.${session.user.id}`;

    const hydrate = async () => {
      try {
        setSyncError(null);
        setCanSync(false);
        if (window.sessionStorage.getItem(hydrationKey) === "1") {
          lastSnapshot.current = JSON.stringify(captureSettings());
          if (active) {
            setCanSync(true);
            setReady(true);
          }
          return;
        }

        const remote = await supabase.getWorkspace();
        if (remote?.payload && typeof remote.payload === "object") {
          // Vorhandene Stände (auch der frühere Komplettabzug) werden
          // übernommen, aber niemals lokale Daten gelöscht.
          const changed = mergeWorkspace(remote.payload as WorkspacePayload);
          window.sessionStorage.setItem(hydrationKey, "1");
          if (changed) {
            // Die synchronen Stores lesen beim Modulstart aus dem lokalen
            // Speicher – ein einmaliger Reload übernimmt den Cloud-Stand.
            window.location.reload();
            return;
          }
        } else {
          window.sessionStorage.setItem(hydrationKey, "1");
        }

        lastSnapshot.current = "";
        if (active) setCanSync(true);
      } catch (error) {
        if (active) {
          setCanSync(false);
          setSyncError(friendlyMessage(error));
        }
      } finally {
        if (active) setReady(true);
      }
    };

    setReady(false);
    void hydrate();
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (!session || !ready || !canSync) return;

    const sync = async () => {
      if (saving.current) return;
      if (Date.now() < retryAt.current) return;
      const snapshot = captureSettings();
      const serialized = JSON.stringify(snapshot);
      if (serialized === lastSnapshot.current) return;

      saving.current = true;
      try {
        await supabase.saveWorkspace(snapshot);
        lastSnapshot.current = serialized;
        retryDelay.current = MIN_RETRY_MS;
        retryAt.current = 0;
        failures.current = 0;
        setSyncError(null);
      } catch (error) {
        // Kein Dauerfeuer bei einer echten Störung: wachsende Wartezeit und
        // Hinweis erst, wenn es wiederholt nicht klappt.
        failures.current += 1;
        retryAt.current = Date.now() + retryDelay.current;
        retryDelay.current = Math.min(MAX_RETRY_MS, retryDelay.current * 2);
        if (failures.current >= 2) setSyncError(friendlyMessage(error));
      } finally {
        saving.current = false;
      }
    };

    const interval = window.setInterval(() => { void sync(); }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [canSync, ready, session]);

  if (!ready) return <LoadingWorkspace />;

  return (
    <>
      {children}
      {syncError && (
        <div role="alert" className="fixed bottom-4 right-4 z-[100] max-w-md rounded-lg border border-destructive/30 bg-background px-4 py-3 text-sm shadow-lg">
          <strong>Sicherung der Einstellungen pausiert.</strong>
          <div className="mt-1 text-muted-foreground">{syncError}</div>
        </div>
      )}
    </>
  );
}
