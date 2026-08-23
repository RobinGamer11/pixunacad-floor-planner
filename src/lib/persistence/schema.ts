/**
 * Zentrale Schema-/Versionsverwaltung für alle persistenten Datenformate.
 *
 * Grundprinzip
 * ------------
 * - Jeder Persistenz-Bereich ("kind") besitzt eine ganzzahlige Schema-Version.
 * - Beim Laden wird der gespeicherte Datenstand über registrierte, schrittweise
 *   Migrationen (v1 -> v2 -> v3 ...) auf die aktuelle Version gehoben.
 * - Migrationen sind ausschließlich *additiv*: Sie ergänzen fehlende Felder mit
 *   Werten, die das bisherige sichtbare Verhalten exakt reproduzieren.
 *   Bestehende Geometrie, Farben, Positionen, Größen, Drehungen, Schrift,
 *   Ebenenzuordnung, Maßstäbe und Inhalte werden niemals verändert.
 * - Neue Werkzeug-Defaults gelten nur für neu erzeugte Objekte, niemals
 *   rückwirkend für migrierte Bestandsobjekte.
 *
 * Die Version wird direkt am Objekt unter `__schemaVersion` mitgeführt. Ältere
 * Datenstände ohne dieses Feld gelten als Version 0 und durchlaufen alle
 * Schritte. Alle Migrationen müssen zusätzlich idempotent sein, damit auch
 * Datenstände ohne Versionsstempel (z. B. Fremdimporte) sicher sind.
 */

export const SCHEMA_VERSION_KEY = "__schemaVersion";

export type MigrationStep<T = any> = {
  /** Zielversion nach Ausführung dieses Schrittes. */
  to: number;
  up: (data: T) => T;
};

export interface SchemaDef<T = any> {
  kind: string;
  current: number;
  steps: MigrationStep<T>[];
}

const registry = new Map<string, SchemaDef>();

export function defineSchema<T>(def: SchemaDef<T>): SchemaDef<T> {
  registry.set(def.kind, def as SchemaDef);
  return def;
}

export function getSchema(kind: string): SchemaDef | undefined {
  return registry.get(kind);
}

/** Liest die gespeicherte Version eines Datenstands (0 = unversioniert/Legacy). */
export function readVersion(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const v = (data as any)[SCHEMA_VERSION_KEY];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Setzt den aktuellen Versionsstempel (nur bei Objekt-Payloads möglich). */
export function stampVersion<T>(kind: string, data: T): T {
  const schema = registry.get(kind);
  if (!schema || !data || typeof data !== "object" || Array.isArray(data)) return data;
  (data as any)[SCHEMA_VERSION_KEY] = schema.current;
  return data;
}

/**
 * Hebt einen geladenen Datenstand schrittweise auf die aktuelle Schema-Version.
 * Fehler in einem einzelnen Schritt brechen den Ladevorgang nicht ab – der
 * bisherige Stand bleibt dann unverändert erhalten (keine Datenverluste).
 */
export function migrateData<T>(kind: string, data: T): T {
  const schema = registry.get(kind);
  if (!schema || data == null) return data;
  let out: any = data;
  let version = readVersion(out);
  for (const step of [...schema.steps].sort((a, b) => a.to - b.to)) {
    if (step.to <= version) continue;
    try {
      out = step.up(out);
      version = step.to;
    } catch (e) {
      console.error(`[schema:${kind}] Migration auf v${step.to} fehlgeschlagen:`, e);
      break;
    }
  }
  if (out && typeof out === "object" && !Array.isArray(out)) {
    out[SCHEMA_VERSION_KEY] = Math.max(version, readVersion(out));
  }
  return out as T;
}
