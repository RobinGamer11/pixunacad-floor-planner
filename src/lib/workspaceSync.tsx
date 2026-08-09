import { ReactNode, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/AuthProvider";
import { captureWorkspace, restoreWorkspace, type WorkspacePayload } from "@/lib/workspaceStorage";

const SYNC_INTERVAL_MS = 4_000;

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

export function WorkspaceSyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [ready, setReady] = useState(false);
  const [canSync, setCanSync] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const lastSnapshot = useRef<string>("");
  const saving = useRef(false);

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
          lastSnapshot.current = JSON.stringify(captureWorkspace());
          if (active) {
            setCanSync(true);
            setReady(true);
          }
          return;
        }

        const remote = await supabase.getWorkspace();
        if (remote?.payload && typeof remote.payload === "object") {
          restoreWorkspace(remote.payload as WorkspacePayload);
          window.sessionStorage.setItem(hydrationKey, "1");
          // Die bestehenden synchronen Stores lesen beim Modulstart aus localStorage.
          // Ein einmaliger Reload stellt daher sicher, dass sie den Cloud-Stand übernehmen.
          window.location.reload();
          return;
        }

        const snapshot = captureWorkspace();
        await supabase.saveWorkspace(snapshot);
        window.sessionStorage.setItem(hydrationKey, "1");
        lastSnapshot.current = JSON.stringify(snapshot);
        if (active) setCanSync(true);
      } catch (error) {
        if (active) {
          setCanSync(false);
          setSyncError(error instanceof Error ? error.message : "Die Cloud-Synchronisierung ist nicht verfügbar.");
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
      const snapshot = captureWorkspace();
      const serialized = JSON.stringify(snapshot);
      if (serialized === lastSnapshot.current) return;

      saving.current = true;
      try {
        await supabase.saveWorkspace(snapshot);
        lastSnapshot.current = serialized;
        setSyncError(null);
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Die Cloud-Synchronisierung ist nicht verfügbar.");
      } finally {
        saving.current = false;
      }
    };

    const interval = window.setInterval(() => { void sync(); }, SYNC_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [canSync, ready, session]);

  if (!ready) return <LoadingWorkspace />;

  return (
    <>
      {children}
      {syncError && (
        <div role="alert" className="fixed bottom-4 right-4 z-[100] max-w-md rounded-lg border border-destructive/30 bg-background px-4 py-3 text-sm shadow-lg">
          <strong>Cloud-Synchronisierung pausiert.</strong>
          <div className="mt-1 text-muted-foreground">{syncError}</div>
        </div>
      )}
    </>
  );
}
