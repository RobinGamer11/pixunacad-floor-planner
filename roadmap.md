# Umsetzungspaket 1 – Projektzugriff, Netzwerk/Team, Beiträge

## Schritt 1 – Gemeinsamer Projektzugriff und Rollen
- [x] Migration `db/migrations/20260831093000_project_access.sql` (Rollen, Overrides, `project_documents`, RLS, Guard-Trigger, RPC `save_project_document`)
- [x] Client-Rechte-Layer `src/lib/projectAccess.ts` (+ Hooks)
- [x] Zentraler Schreibschutz im `projectStore` (`setWriteGuard`, `onWriteBlocked`, `applySharedProject`)
- [x] Gemeinsame Projektdaten `src/lib/projectDocuments.ts` + `src/lib/sharedProjectSync.ts` (Versions-Konflikterkennung)
- [x] Geteilte Projekte aus persönlicher Workspace-Sicherung ausgenommen
- [ ] Migration im Supabase-Projekt einspielen (manuell durch den Nutzer)
- [ ] Read-only-Kennzeichnung in CAD/Mappe/Finanzen-Oberflächen (Buttons deaktivieren)

## Schritt 2 – Netzwerk und Projekt-Team
- [ ] Netzwerk-Reiter: Projekte/Teams + Kontakte, Ownership-Anzeige
- [ ] Team-Reiter je Projekt: Avatar, Rolle, Abweichungen, offene Beiträge
- [ ] Mitgliederverwaltung (nur Berechtigte), Rollenwechsel, Entfernen

## Schritt 3 – Einheitliche Beiträge
- [ ] Datenmodell „Beitrag“ (Name, Beschreibung, Status, Kategorie, Priorität, Verantwortliche[], Start/Ende)
- [ ] „+ Beitrag“ ersetzt Aufgabe/Termin/Notiz, Migration der Altdaten (IDs erhalten)
- [ ] Projektzeitraum prominent am Projekt
- [ ] Kalender, Ansichtstrahl, Projektnetz auf gemeinsame Beiträge umstellen
- [ ] Responsive Team-/Beitrags-UI (Desktop/Tablet/Smartphone)
