/**
 * Dezente Live-Hinweise auf einer Projektmappen-Seite.
 *
 * Zeigt für Elemente, die gerade jemand anderes bearbeitet, eine
 * zurückhaltende farbige Kontur mit Namen und während einer laufenden
 * Bewegung eine flüchtige Vorschau. Es wird nur dargestellt – am
 * Elementmodell der Projektmappe ändert sich nichts.
 */
import type { PageElement, ProjectPage } from "@/lib/projectStore";
import type { MappeCollabStatus } from "@/lib/mappeCollab/session";
import { useMappeCollabStatus } from "@/lib/mappeCollab/store";

interface Props {
  page: ProjectPage;
  status: MappeCollabStatus;
}

/** Bequemer Einstieg: holt den Live-Zustand selbst. */
export function MappeCollabPageLayer({ page }: { page: ProjectPage }) {
  const status = useMappeCollabStatus();
  return <MappeCollabLayer page={page} status={status} />;
}

function box(el: Partial<PageElement>) {
  return {
    left: `${el.x ?? 0}%`,
    top: `${el.y ?? 0}%`,
    width: `${el.w ?? 0}%`,
    height: `${el.h ?? 0}%`,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
  } as const;
}

export function MappeCollabLayer({ page, status }: Props) {
  if (!status.connected) return null;
  const elements = page.elements ?? [];

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* Fremde Bearbeitungsmarkierungen */}
      {elements.map((el) => {
        const lock = status.locksByObject.get(el.id);
        if (!lock || lock.pageId !== page.id) return null;
        return (
          <div key={`lock-${el.id}`} className="absolute" style={box(el)}>
            <div
              className="absolute inset-0 rounded-[2px]"
              style={{ border: `1.5px dashed ${lock.color}`, opacity: 0.85 }}
            />
            <span
              className="absolute -top-[18px] left-0 whitespace-nowrap rounded-sm px-1.5 py-[1px] text-[10px] font-medium"
              style={{ background: lock.color, color: "#0b1020" }}
            >
              {lock.displayName}
            </span>
          </div>
        );
      })}

      {/* Flüchtige Vorschau einer laufenden Bewegung */}
      {[...status.previewByObject.values()].map((preview) => {
        if (preview.pageId !== page.id || !preview.payload) return null;
        return (
          <div
            key={`preview-${preview.objectId}`}
            className="absolute rounded-[2px]"
            style={{
              ...box(preview.payload as Partial<PageElement>),
              border: "1.5px dashed hsl(var(--primary))",
              opacity: 0.7,
            }}
          />
        );
      })}
    </div>
  );
}
