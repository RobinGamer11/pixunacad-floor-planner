import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";
import { projectStore } from "@/lib/projectStore";
import { convertSelectionToPixel, getConvertibleSelection } from "@/cad/rasterize";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  app: CadApp | MiniCad | null | undefined;
  projectId?: string;
}

/**
 * Umschalter Vektor / Pixel für Linien-, Freihand-, Text- und Schraffur-Werkzeug.
 * Pixel = Objekt wird beim Fertigstellen zu einem Bild gerastert.
 */
export const RasterModeToggle: React.FC<Props> = ({ app, projectId }) => {
  const [mode, setMode] = useState<"vector" | "pixel">("vector");
  const projectSettings = projectId
    ? projectStore.getState().projects.find((project) => project.id === projectId)?.settings
    : undefined;
  const [dpi, setDpi] = useState(() => projectSettings?.pixelRenderDpi ?? 1200);
  const [supersampling, setSupersampling] = useState(() => projectSettings?.pixelSupersampling ?? false);
  const [supersamplingFactor, setSupersamplingFactor] = useState<2 | 4>(() => projectSettings?.pixelSupersamplingFactor ?? 2);

  useEffect(() => {
    if (!app) return;
    setMode((app as any).defaultDrawRasterMode === "pixel" ? "pixel" : "vector");
    const settings = projectId
      ? projectStore.getState().projects.find((project) => project.id === projectId)?.settings
      : undefined;
    const nextDpi = settings?.pixelRenderDpi ?? 1200;
    const nextSs = settings?.pixelSupersampling ?? false;
    const nextFactor = settings?.pixelSupersamplingFactor ?? 2;
    (app as any).pixelRenderDpi = nextDpi;
    (app as any).pixelSupersampling = nextSs;
    (app as any).pixelSupersamplingFactor = nextFactor;
    setDpi(nextDpi);
    setSupersampling(nextSs);
    setSupersamplingFactor(nextFactor);
  }, [app, projectId]);

  const saveQuality = (patch: { dpi?: number; supersampling?: boolean; factor?: 2 | 4 }) => {
    const nextDpi = patch.dpi ?? dpi;
    const nextSs = patch.supersampling ?? supersampling;
    const nextFactor = patch.factor ?? supersamplingFactor;
    if (app) {
      (app as any).pixelRenderDpi = nextDpi;
      (app as any).pixelSupersampling = nextSs;
      (app as any).pixelSupersamplingFactor = nextFactor;
    }
    if (projectId) {
      projectStore.updateProjectSettings(projectId, {
        pixelRenderDpi: nextDpi,
        pixelSupersampling: nextSs,
        pixelSupersamplingFactor: nextFactor,
      });
    }
  };

  const applyDpi = (raw: number) => {
    const next = Math.round(Math.max(600, Math.min(2400, raw || 600)) / 50) * 50;
    setDpi(next);
    saveQuality({ dpi: next });
  };

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const apply = (next: "vector" | "pixel") => {
    setHint(null);
    if (next === "pixel" && app) {
      const target = getConvertibleSelection(app);
      if (target && !("unsupported" in target)) {
        // Ausgewähltes Vektorobjekt: erst nach Bestätigung umwandeln.
        setConfirmOpen(true);
        return;
      }
      if (target) {
        setHint("Dieses ausgewählte Objekt kann nicht in Pixel umgewandelt werden. Der Pixelmodus gilt nur für neu gezeichnete Objekte.");
      }
    }
    if (app) (app as any).defaultDrawRasterMode = next;
    setMode(next);
  };

  const confirmConvert = () => {
    setConfirmOpen(false);
    if (!app) return;
    if (convertSelectionToPixel(app)) {
      setMode("pixel");
    } else {
      setHint("Umwandlung fehlgeschlagen – das Objekt bleibt unverändert als Vektor bestehen.");
    }
  };

  const btn = (value: "vector" | "pixel", label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => apply(value)}
      className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] ${mode === value ? "active" : ""}`}
    >
      {label}
    </button>
  );

  return (
    <div className="mb-2">
      <label className="block mb-1.5 text-[11px]">Objektart</label>
      <div className="flex gap-1">
        {btn("vector", "Vektor")}
        {btn("pixel", "Pixel")}
      </div>
      <div className="text-[10px] leading-tight mt-1.5" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
        {mode === "pixel"
          ? "Pixel: Das fertige Objekt wird als Bild abgelegt — Radiergummi (auch Smooth) funktioniert wie bei PNGs, aber Punkte/Text/Muster sind danach nicht mehr editierbar."
          : "Vektor: Objekt bleibt jederzeit editierbar (Punkte, Text, Muster)."}
      </div>
      {hint && (
        <div className="text-[10px] leading-tight mt-1.5 text-destructive">{hint}</div>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>In Pixel umwandeln?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Objekt wird auf die Pixeloberfläche eingebrannt. Punkte, Text-, Muster- und Vektoreinstellungen können danach nicht mehr bearbeitet werden. Rückgängig ist direkt über Rückgängig möglich.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmConvert}>In Pixel umwandeln</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
