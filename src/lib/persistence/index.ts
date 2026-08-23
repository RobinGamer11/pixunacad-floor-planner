/**
 * Zentraler Einstiegspunkt für Schema-Migrationen aller persistenten Daten.
 * Alle Restore-/Deserialisierungs-Pfade (CAD, Projektmappe, Finanzen,
 * Druckpläne, Tabellen) importieren ausschließlich von hier.
 */
export {
  SCHEMA_VERSION_KEY,
  defineSchema,
  getSchema,
  readVersion,
  stampVersion,
  migrateData,
} from "./schema";

export {
  migrateSceneData,
  migrateCadSnapshot,
  migrateProjectState,
  migrateProjectPages,

  migrateFinanceState,
  migrateCadTables,
  CAD_SNAPSHOT_KIND,
  PROJECT_STATE_KIND,
  FINANCE_KIND,
  CAD_TABLES_KIND,
} from "./schemas";
