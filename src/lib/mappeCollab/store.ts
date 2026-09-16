/**
 * Kleiner Zugriffspunkt auf die laufende Projektmappen-Sitzung.
 *
 * Damit können tief liegende Teile der Oberfläche (Seiten, Elemente) eine
 * flüchtige Vorschau senden und fremde Hinweise anzeigen, ohne dass die
 * Sitzung durch viele Ebenen gereicht werden muss.
 */
import { useSyncExternalStore } from "react";
import type { MappeCollabSession, MappeCollabStatus } from "./session";

const EMPTY: MappeCollabStatus = {
  connected: false,
  unavailable: false,
  peers: [],
  locksByObject: new Map(),
  previewByObject: new Map(),
};

let session: MappeCollabSession | null = null;
let status: MappeCollabStatus = EMPTY;
const listeners = new Set<() => void>();

export function setMappeSession(next: MappeCollabSession | null) {
  session = next;
  if (!next) status = EMPTY;
  listeners.forEach((fn) => fn());
}

export function setMappeStatus(next: MappeCollabStatus) {
  status = next;
  listeners.forEach((fn) => fn());
}

export function getMappeSession(): MappeCollabSession | null {
  return session;
}

/** Flüchtige Vorschau eines Elements während einer laufenden Bewegung. */
export function previewMappeElement(
  pageId: string,
  elementId: string,
  payload: Record<string, unknown> | null,
) {
  session?.sendPreview(pageId, elementId, payload);
}

export function useMappeCollabStatus(): MappeCollabStatus {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => status,
    () => EMPTY,
  );
}
