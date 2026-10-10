import { useEffect, useState } from "react";
import { onLocalSaveStatus, type LocalSaveStatus } from "@/cad/raster/localScenePersist";
import { onRasterCloudStatus, type RasterCloudStatus } from "@/cad/raster/rasterCloud";

const LABEL: Record<LocalSaveStatus, string> = {
  idle: "", saving: "Speichert auf Gerät …", saved: "Auf Gerät gespeichert",
  quota: "Gerätespeicher voll", error: "Speichern fehlgeschlagen", blocked: "Speichern gesperrt (neuere Version)",
};
const CLOUD: Record<RasterCloudStatus, string> = {
  off: "", syncing: "Pixel: Cloud …", synced: "Pixel in Cloud", quota: "Cloud-Speicher voll",
  unconfigured: "Lokal gespeichert – Cloud-Einrichtung fehlt", conflict: "Pixel-Konflikt", error: "Pixel-Cloud fehlgeschlagen",
  "setup-missing": "Lokal gespeichert – Cloud-Einrichtung fehlt", forbidden: "Pixel nur lokal (keine Cloud-Berechtigung)", offline: "Offline – Pixel nur lokal",
};

/** Dauerhafte Anzeige: lokaler Gerätestand und getrennt der Cloud-Stand der Pixel. */
export function LocalSaveIndicator({ projectId }: { projectId?: string }) {
  const [s, setS] = useState<LocalSaveStatus>("idle");
  const [d, setD] = useState<string | undefined>();
  const [c, setC] = useState<RasterCloudStatus>("off");
  const [cd, setCd] = useState<string | undefined>();
  useEffect(() => onLocalSaveStatus((st, det) => { setS(st); setD(det); }), []);
  useEffect(() => onRasterCloudStatus((st, det) => { setC(st); setCd(det); }, projectId), [projectId]);
  if (s === "idle" && c === "off") return null;
  const pill = (bad: boolean) => `rounded-full px-2.5 py-1 text-[11px] border ${bad ? "bg-destructive text-destructive-foreground border-destructive" : "bg-background/85 text-muted-foreground border-border"}`;
  return (
    <div className="absolute bottom-2 left-2 z-[40] flex gap-1.5 pointer-events-none">
      {s !== "idle" && <div title={d} className={pill(s === "quota" || s === "error" || s === "blocked")}>{LABEL[s]}</div>}
      {c !== "off" && <div title={cd} className={pill(c === "quota" || c === "conflict" || c === "error")}>{CLOUD[c]}</div>}
    </div>
  );
}
