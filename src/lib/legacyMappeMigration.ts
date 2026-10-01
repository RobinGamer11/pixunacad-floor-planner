/**
 * Einmalige Bereinigung von Altdaten der früheren Projektmappe.
 *
 * Dies ist die einzige Stelle, die die alten gespeicherten Feldnamen noch
 * kennt. Sie entfernt ausschließlich Felder des Projekt-Payloads
 * (Mappen-Seiten, Mappen, aktive Mappe, Textvorlagen) und übernimmt die
 * frühere Hilfe-Einstellung einmalig in `settings.helpOn`.
 *
 * CAD-Blätter (`sheets`), CAD-Szenen (`scenesById`), Exportseiten und
 * Plan-Szenen liegen nicht im Projekt-Payload, sondern im getrennten
 * CAD-Snapshot – sie werden hier nie berührt.
 *
 * Idempotent: Läuft bei jedem Laden (lokaler Speicher und Cloud-Stand), damit
 * ein alter Stand die Mappe nie zurückbringen kann.
 */
const LEGACY_PROJECT_KEYS = ["pages", "mappen", "activeMappeId", "textSpanTemplates"] as const;
const LEGACY_HELP_KEY = "mappeHelpOn";

export function stripLegacyMappe<T extends object>(project: T): T {
  const src = project as Record<string, unknown>;
  const next: Record<string, unknown> = { ...src };
  for (const key of LEGACY_PROJECT_KEYS) delete next[key];
  const settings = src.settings as Record<string, unknown> | undefined;
  if (settings && typeof settings === "object") {
    const s: Record<string, unknown> = { ...settings };
    if (LEGACY_HELP_KEY in s) {
      if (typeof s.helpOn !== "boolean" && typeof s[LEGACY_HELP_KEY] === "boolean") s.helpOn = s[LEGACY_HELP_KEY];
      delete s[LEGACY_HELP_KEY];
    }
    delete s.cadAutoUpdate;
    next.settings = s;
  }
  return next as T;
}
