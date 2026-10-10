import { useEffect, useState } from "react";
import { onLocalSaveStatus, type LocalSaveStatus } from "@/cad/persist/localScenePersist";

const LABEL: Record<LocalSaveStatus, string> = {
  idle: "", saving: "Speichert auf Gerät …", saved: "Auf Gerät gespeichert",
  quota: "Gerätespeicher voll", error: "Speichern fehlgeschlagen", blocked: "Speichern gesperrt (neuere Version)",
};

/** Dauerhafte Anzeige des lokalen Gerätestands. */
export function LocalSaveIndicator(_props: { projectId?: string }) {
  const [s, setS] = useState<LocalSaveStatus>("idle");
  const [d, setD] = useState<string | undefined>();
  useEffect(() => onLocalSaveStatus((st, det) => { setS(st); setD(det); }), []);
  if (s === "idle") return null;
  const bad = s === "quota" || s === "error" || s === "blocked";
  return (
    <div className="absolute bottom-2 left-2 z-[40] flex gap-1.5 pointer-events-none">
      <div title={d} className={`rounded-full px-2.5 py-1 text-[11px] border ${bad ? "bg-destructive text-destructive-foreground border-destructive" : "bg-background/85 text-muted-foreground border-border"}`}>{LABEL[s]}</div>
    </div>
  );
}
