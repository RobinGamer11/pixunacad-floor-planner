---
name: Notiznetz
description: Zentrale Projektverwaltung mit Themen/Notizen/Aufgaben, hierarchisch verknüpft + Radial-Graph
type: feature
---
- Route: `/project/:projectId/notes` in `App.tsx`, verlinkt über den dritten Modus-Button ("Notiznetz") im `WorkspaceHeader`.
- Datenmodell in `src/lib/notesStore.ts`: `NoteNode { id, parentId, kind: topic|note|task|file|photo, title, description, category, status, priority, date, time, dueDate, responsible, participants[], comments[], linkedIds[] }` + `categories[]`. Persistiert in `localStorage` unter `pixuna.notes.<projectId>`.
- Pflichtfelder: nur Titel + Beschreibung. Kategorien frei erweiterbar. Ampel-Status (Offen/WIP/Erledigt) unabhängig von Priorität (Niedrig/Normal/Hoch/Dringend).
- `NotesPage` (3 Spalten): Links Liste + Filter (Suche, Kategorie, Status) + Add-Buttons; Mitte NoteEditor (alle Felder, Kommentare, Verknüpfungen); Rechts SVG-Radial-Graph (`NoteGraph`) mit Zentrum = aktueller Fokus, Kinder radial. Doppelklick auf Topic-Knoten zoomt in dessen Ebene; Klick auf Zentrum navigiert zurück.
- Verknüpfungen (`linkedIds`) sind ungerichtete Referenzen zwischen beliebigen Knoten (Notiz ↔ Datei etc.).
