/**
 * Mehrfachauswahl-Bearbeitung:
 * Liefert einen Schreib-Proxy auf das primär selektierte Objekt, der jede
 * gesetzte Eigenschaft zusätzlich auf alle gleichartigen Geschwister-Objekte
 * der Auswahl spiegelt. Geometrie-Felder bleiben bewusst lokal, damit sich
 * Position/Größe der einzelnen Objekte nicht angleichen.
 */

const GEOMETRY_KEYS = new Set([
  "id", "a", "b", "x", "y", "points", "holes", "center", "widthM", "heightM",
  "rotationRad", "p1", "p2", "placementPoint", "bulge", "bulges", "holeBulges",
]);

export function mirrorProxy<T extends object>(primary: T, siblings: T[]): T {
  if (!siblings || siblings.length === 0) return primary;
  return new Proxy(primary as any, {
    get(target, prop, recv) {
      const val = Reflect.get(target, prop, recv);
      if (
        typeof prop === "string" &&
        val && typeof val === "object" && !Array.isArray(val) &&
        !GEOMETRY_KEYS.has(prop)
      ) {
        const subs: any[] = [];
        for (const s of siblings) {
          const sv = (s as any)?.[prop];
          if (sv && typeof sv === "object") subs.push(sv);
        }
        if (subs.length) return mirrorProxy(val, subs);
      }
      return val;
    },
    set(target, prop, value) {
      const ok = Reflect.set(target, prop, value);
      if (typeof prop === "string" && !GEOMETRY_KEYS.has(prop)) {
        for (const s of siblings) {
          try { (s as any)[prop] = value; } catch { /* ignore */ }
        }
      }
      return ok;
    },
  }) as T;
}
