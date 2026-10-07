import { useEffect, useState } from "react";
import { onLocalSaveStatus, type LocalSaveStatus } from "@/cad/raster/localScenePersist";

const LABEL: Record<LocalSaveStatus, string> = {
  idle: "", saving: "Speichert auf Gerät …", saved: "Auf Gerät gespeichert",
  quota: "Gerätespeicher voll", error: "Speichern fehlgeschlagen", blocked: "Speichern gesperrt (neuere Version)",
};

/** Dauerhafte Anzeige des lokalen Speicherstands (Gerät, nicht Cloud). */
export function LocalSaveIndicator() {
  const [s, setS] = useState<LocalSaveStatus>("idle");
  const [d, setD] = useState<string | undefined>();
  useEffect(() => onLocalSaveStatus((st, det) => { setS(st); setD(det); }), []);
  if (s === "idle") return null;
  const bad = s === "quota" || s === "error" || s === "blocked";
  return (
    <div title={d} className={`absolute bottom-2 left-2 z-[40] rounded-full px-2.5 py-1 text-[11px] pointer-events-none border ${bad ? "bg-destructive text-destructive-foreground border-destructive" : "bg-background/85 text-muted-foreground border-border"}`}>
      {LABEL[s]}
    </div>
  );
}
