import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { projectStore } from "@/lib/projectStore";
import { getNetworkClient } from "@/lib/networkClient";
import { supabase as authClient } from "@/lib/supabase";
import { isPlaceholderName, syncAccountDisplayName } from "@/lib/accountProfile";

/**
 * Hält den Kontonamen sitzungsweit aktuell – unabhängig davon, ob das Netzwerk
 * geöffnet wurde. Rendert nichts.
 */
export function AccountProfileSync() {
  const { session } = useAuth();
  const lastPushed = useRef<string>("");

  useEffect(() => {
    if (!session) return;
    void syncAccountDisplayName();
  }, [session?.user.id]);

  useEffect(() => {
    if (!session) return;
    let timer = 0;
    const push = () => {
      const name = (projectStore.getState().profile.name ?? "").trim();
      if (!name || isPlaceholderName(name) || name === lastPushed.current) return;
      lastPushed.current = name;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const client = getNetworkClient();
        const current = authClient.getSession();
        if (!client || !current) return;
        void client
          .from("profiles")
          .upsert({ id: current.user.id, display_name: name, updated_at: new Date().toISOString() }, { onConflict: "id" })
          .then(() => undefined, () => undefined);
      }, 800);
    };
    push();
    const unsubscribe = projectStore.subscribe(push);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [session?.user.id]);

  return null;
}

export default AccountProfileSync;
