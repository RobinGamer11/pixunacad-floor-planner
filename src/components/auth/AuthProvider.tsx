import { Context, createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { activateAccount, currentAccount, flushAccountWrites } from "@/lib/accountStorage";
import { supabase, SupabaseSession } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

type AuthContextValue = {
  session: SupabaseSession | null;
  loading: boolean;
  configured: boolean;
  signOut: () => Promise<void>;
};

const AUTH_CONTEXT_KEY = "__pixuna_auth_context__";
const globalScope = globalThis as Record<string, unknown>;
const AuthContext: Context<AuthContextValue | null> =
  (globalScope[AUTH_CONTEXT_KEY] as Context<AuthContextValue | null> | undefined) ??
  ((globalScope[AUTH_CONTEXT_KEY] = createContext<AuthContextValue | null>(null)) as Context<AuthContextValue | null>);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SupabaseSession | null>(supabase.getSession());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const unsubscribe = supabase.onAuthStateChange((nextSession) => {
      if (!active) return;
      const nextId = nextSession?.user.id ?? null;
      if (nextId !== currentAccount()) {
        // A full document restart discards every module cache and old async callback.
        activateAccount(null);
        window.location.reload();
        return;
      }
      setSession(nextSession);
    });

    void supabase.restoreSession()
      .then((nextSession) => { if (active) setSession(nextSession); })
      .finally(() => { if (active) setLoading(false); });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    loading,
    configured: supabase.isConfigured,
    signOut: async () => {
      // Flush locally, never force a cloud upload. On failure keep this session open.
      try { await flushAccountWrites(); } catch (error) {
        toast({ title: "Abmelden angehalten", description: error instanceof Error ? error.message : "Lokale Speicherung nicht abgeschlossen. Vorhandene Daten bleiben erhalten.", variant: "destructive" });
        return;
      }
      await supabase.signOut();
    },
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth muss innerhalb von AuthProvider verwendet werden.");
  return context;
}
