import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { projectStore, spanTargetPageIds, isSpanGroupActiveForPage } from "@/lib/projectStore";
import type { MiniCad } from "@/cad/embed/MiniCad";

/** Serialisiert eine TextBox exakt im CAD-Overlay-Format (Papierkoordinaten). */
function serializeBox(box: any) {
  return {
    id: box.id,
    center: { x: box.center.x, y: box.center.y },
    widthM: box.widthM,
    heightM: box.heightM,
    rotationRad: box.rotationRad,
    html: box.html,
    style: { ...box.style },
    labelId: box.labelId,
  };
}

/**
 * „Auf allen Seiten“ — verteilt die ausgewählte Textbox als eigenständige
 * Kopie auf alle Seiten der Mappe. Die Kopien bleiben danach individuell
 * bearbeitbar; die gemeinsame `spanGroupId` bleibt nur als Zuordnung erhalten.
 */
export function TextSpanAllPages({
  engine,
  projectId,
  pageId,
}: {
  engine: MiniCad;
  projectId: string;
  pageId: string;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 300);
    return () => window.clearInterval(id);
  }, []);

  const box = engine.getSelectedTextBox?.() ?? null;
  if (!box) return null;
  const groupId = ((box.style as any)?.spanGroupId as string | undefined) ?? null;

  // Der Schalter zeigt den GRUPPENSTATUS, nicht ein lokales Flag: solange die
  // Gruppe eine aktive Vorlage im Projekt besitzt, ist „Auf allen Seiten“ auf
  // jeder zugehörigen Seitenkopie EIN.
  const project = projectStore.getState().projects.find((p) => p.id === projectId);
  // Gültig ist eine Gruppe nur im Seitenkontext („Buch“) dieser Seite:
  // normale Mappe bzw. genau diese Finanz-Mustervorlage (templateKey).
  const hasTemplate = !!groupId && !!project
    && isSpanGroupActiveForPage(project, pageId, groupId);
  const active = hasTemplate;

  /**
   * Nur diese eine Seitenkopie entfernen — die Gruppe bleibt aktiv. War es die
   * letzte Kopie, wird auch die Vorlage entfernt (kein Wiederauftauchen auf
   * neuen Seiten).
   */
  const removeHere = () => {
    if (groupId) {
      const hasOtherCopy = (project?.pages ?? []).some(
        (pg) =>
          pg.id !== pageId
          && ((pg.cadOverlay as any)?.textBoxes ?? []).some(
            (b: any) => b?.style?.spanGroupId === groupId,
          ),
      );
      if (!hasOtherCopy) projectStore.removeTextSpanGroup(projectId, pageId, groupId);
    }
    (engine as any).scene?.removeTextBox?.(box);
    engine.commitHistorySnapshot?.();
    setTick((t) => t + 1);
  };

  const toggle = () => {
    const style = box.style as any;
    if (active && groupId) {
      projectStore.removeTextSpanGroup(projectId, pageId, groupId);
      delete style.spanGroupId;
      engine.commitHistorySnapshot?.();
    } else {
      const groupId = `tsg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      style.spanGroupId = groupId;
      engine.commitHistorySnapshot?.();
      projectStore.applyTextSpanToPages(projectId, pageId, groupId, serializeBox(box));
    }
    setTick((t) => t + 1);
  };

  return (
    <div className="rounded-md border p-2" style={{ borderColor: "hsl(var(--hairline))" }}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={active}
        className="flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
        style={{
          borderColor: "hsl(var(--hairline))",
          background: active ? "hsl(var(--accent))" : "transparent",
        }}
      >
        <Layers size={14} />
        <span className="flex-1">Auf allen Seiten</span>
        <span className="text-[10px] text-muted-foreground">{active ? "AN" : "AUS"}</span>
      </button>
      {active && (
        <button
          type="button"
          onClick={removeHere}
          className="mt-1.5 flex w-full items-center justify-center rounded border px-2 py-1.5 text-[11px] transition-colors hover:bg-muted"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          Auf dieser Seite entfernen
        </button>
      )}
      <div className="mt-1.5 text-[10px] leading-tight text-muted-foreground">
        {active
          ? "Gruppe aktiv: Kopien liegen auf allen Seiten und sind dort einzeln bearbeitbar. „Auf allen Seiten“ AUS beendet die Verteilung überall; „Auf dieser Seite entfernen“ löscht nur diese eine Kopie."
          : "Legt diese Textbox an identischer Papierposition auf allen Seiten an — auch auf später erstellten."}
      </div>
    </div>
  );
}
