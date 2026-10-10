/**
 * Verzögerte Kachelquellen: Eine Kachel, deren Inhalt erst aus mehreren
 * Manifesteinträgen zusammengesetzt werden muss, erhält beim Öffnen nur eine
 * Referenz `pxc:<id>`. Zusammengesetzt (= dekodiert) wird erst, wenn die Kachel
 * wirklich gebraucht wird (sichtbar, bearbeitet, gespeichert).
 */
const PREFIX = "pxc:";
const pending = new Map<string, () => Promise<string | null>>();
const resolved = new Map<string, Promise<string | null>>();
let seq = 0;

export function isLazySrc(src: string | null | undefined): boolean {
  return typeof src === "string" && src.startsWith(PREFIX);
}

export function registerLazySrc(compose: () => Promise<string | null>): string {
  const id = `${PREFIX}${Date.now().toString(36)}-${(++seq).toString(36)}`;
  pending.set(id, compose);
  return id;
}

/** Liefert eine ladbare URL (Blob/Data); normale Quellen unverändert. */
export function resolveTileSrc(src: string): Promise<string | null> {
  if (!isLazySrc(src)) return Promise.resolve(src);
  let p = resolved.get(src);
  if (!p) {
    const fn = pending.get(src);
    p = fn ? fn().catch(() => null) : Promise.resolve(null);
    resolved.set(src, p);
    pending.delete(src);
  }
  return p;
}
