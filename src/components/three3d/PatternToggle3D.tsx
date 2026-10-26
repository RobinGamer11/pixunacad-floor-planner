import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { CadApp } from "@/cad/CadApp";
import { hasPattern } from "@/cad/three3d/pattern3D";
import { pattern3DState, setPattern3D } from "@/cad/three3d/projectBridge";

/** „Muster in 3D“: pro Objekt oder – ohne Auswahl – für alle Objekte (mit Bestätigung). */
export function PatternToggle3D({ app, target, onChange }: { app: CadApp; target: { obj: any; list: string } | null; onChange: () => void }) {
  const [ask, setAsk] = useState<boolean | null>(null);
  if (target && !hasPattern(target.obj, target.list)) return null;
  const state = target ? (target.obj.pattern3D === false ? "off" : "on") : pattern3DState(app);
  if (state === "none") return null;
  const checked = state !== "off";
  const change = (on: boolean) => { if (target) { setPattern3D(app, on, target); onChange(); } else setAsk(on); };
  return (
    <section className="space-y-1 rounded-lg border p-3 text-xs" style={{ background: "hsl(var(--overlay-ink) / 0.94)", color: "hsl(var(--overlay-surface))", borderColor: "hsl(var(--overlay-surface) / 0.14)" }}>
      <label className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Muster in 3D</span>
        <Switch aria-label="Muster in 3D" checked={checked} onCheckedChange={change} />
      </label>
      <div className="text-[11px]" style={{ color: "hsl(var(--overlay-surface) / 0.62)" }}>
        {target ? "Schraffur-/Wandmuster dieses Objekts anzeigen" : state === "mixed" ? "Gilt für alle Objekte · aktuell unterschiedlich" : "Gilt für alle Objekte mit Muster"}
      </div>
      <AlertDialog open={ask !== null} onOpenChange={o => { if (!o) setAsk(null); }}>
        <AlertDialogContent className="max-w-sm rounded-2xl border" style={{ borderColor: "hsl(var(--accent-gold) / 0.45)", background: "hsl(var(--surface-card))" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Muster für alle Objekte {ask ? "einblenden" : "ausblenden"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Einstellung ändert die Muster in 3D bei allen Objekten. Eigene Einstellungen einzelner Objekte werden dabei überschrieben. Mit Rückgängig lässt sich das wieder zurücknehmen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Abbrechen</AlertDialogCancel>
            <AlertDialogAction className="rounded-lg border-0" style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--surface))" }}
              onClick={() => { if (ask !== null) { setPattern3D(app, ask, null); onChange(); } setAsk(null); }}>
              Für alle übernehmen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
