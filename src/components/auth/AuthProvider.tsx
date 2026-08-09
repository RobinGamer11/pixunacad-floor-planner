import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { clearWorkspaceStorage } from "@/lib/workspaceStorage";
import { supabase, SupabaseSession } from "@/lib/supabase";

type AuthContextValue = {
  session: SupabaseSession | null;
  loading: boolean;
  configured: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SupabaseSession | null>(supabase.getSession());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const unsubscribe = supabase.onAuthStateChange((nextSession) => {
      if (active) setSession(nextSession);
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
      // Verhindert, dass der nächste Account auf diesem Gerät Daten des
      // vorherigen Accounts sieht, bevor sein Cloud-Stand geladen ist.
      await supabase.signOut();
      clearWorkspaceStorage();
    },
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth muss innerhalb von AuthProvider verwendet werden.");
  return context;
}
