import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";

/**
 * Schlichte Statusanzeige für das Pipetten-Werkzeug.
 * Zeigt, ob eine Quelle gemerkt ist und was der nächste Klick bewirkt.
 */
export const PipetteSettingsPanel: React.FC<{ app: CadApp | MiniCad | null }> = ({ app }) => {
  const [hasSource, setHasSource] = useState(false);

  useEffect(() => {
    if (!app) return;
    const read = () => setHasSource(!!(app as any).pipetteTool?.hasSource);
    read();
    const t = window.setInterval(read, 200);
    return () => window.clearInterval(t);
  }, [app]);

  if (!app) return null;

  return (
    <div
      className="rounded-md border p-2 text-xs leading-snug"
      style={{ borderColor: "hsl(var(--hairline))" }}
    >
      {hasSource ? (
        <span>Objekt ausgewählt — Auf anderes Objekt übertragen (L-Klick)</span>
      ) : (
        <span>Objekt auswählen (L-Klick)</span>
      )}
    </div>
  );
};

export default PipetteSettingsPanel;
