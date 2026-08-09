import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";

interface Props {
  app: CadApp | MiniCad | null | undefined;
}

/**
 * Umschalter Vektor / Pixel für Linien-, Freihand-, Text- und Schraffur-Werkzeug.
 * Pixel = Objekt wird beim Fertigstellen zu einem Bild gerastert.
 */
export const RasterModeToggle: React.FC<Props> = ({ app }) => {
  const [mode, setMode] = useState<"vector" | "pixel">("vector");

  useEffect(() => {
    if (!app) return;
    setMode((app as any).defaultDrawRasterMode === "pixel" ? "pixel" : "vector");
  }, [app]);

  const apply = (next: "vector" | "pixel") => {
    if (app) (app as any).defaultDrawRasterMode = next;
    setMode(next);
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
    </div>
  );
};
