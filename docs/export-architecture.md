# Exportbereich – Architektur

- Export ist **derselbe CAD-Bereich** (`/project/:id/cad?view=export`): gleiche `CadApp`-Instanz, gleiche Werkzeuge, Auswahl, Fangpunkte, Zwischenablage und Verlauf. Wechsel CAD ↔ Export behält den Verlauf.
- Exportseiten = erweiterte `Plan`s (`PlanManager`), Ordner = `PlanFolder`; Baum/Reihenfolge/Auswahl in `src/cad/planTree.ts`.
- Jede Exportseite hat ihre Anmerkungs-Scene (`planScenesById`); Werkzeuge bearbeiten auf Exportseiten nur diese. Quell-CAD wird über „CAD-Blatt bearbeiten“ bewusst geöffnet.
- Ausschnitte (`Projection`) sind standardmäßig `linked` (keine Geometriekopie, Cache über `CadApp.contentRevision`), optional `frozen`; fehlende Quelle → Platzhalter.
- Alle Mutationen der Oberfläche laufen über `CadApp.mutatePlans` → genau ein Verlaufsschritt. Der globale Snapshot enthält Seiten, Ordner, Anmerkungs-Scenes, Transparenzpausen und Referenzen.
- Exportauswahl ist temporärer UI-Zustand (kein `includeInExport`). PDF: `CadApp.exportPlansByIds` in sichtbarer Baumreihenfolge, ohne Duplikate, inkl. Anmerkungen.
- Seitenrand und Lochung sind Hilfslinien, werden nie gedruckt.
- Freischaltung: bis Cloud-Objektsync + Zwei-Geräte-Test verborgen (`src/lib/exportFeature.ts`, `localStorage pixuna.exportPreview=1`).

## Cloud
- Seiten, Ordner und Transparenzpausen laufen als Strukturobjekte (`plans`, `planFolders`, `planOverlays` auf `__structure__`), Anmerkungs-Scenes als eigene Seiten `plan:<planId>` – einzeln, keine Gesamtstände.

## Offen
- Echter Zwei-Geräte-Test, danach Freischaltung des Reiters.

## Lokaler Bedienzustand (nie Projekt/Verlauf/Cloud)
- Geöffnete Exportseite: `localStorage pixuna.export.activePage.<projektId>` (`src/lib/exportLocalState.ts`). Undo/Redo und Cloud schalten die Seite nie um.
- Ordner auf-/zugeklappt: `pixuna.export.collapsed.<projektId>`.
- Häkchen der alten CAD-Druckplanliste: nur im Speicher von `PlanManager` (`isSelected`), nicht im Planmodell.
- Layout: Werkzeugleiste | Export-Seitenleiste | Papier | eine rechte Leiste (`Seiteneinstellungen | Werkzeug | Ebenen`), gesteuert über `CadEditor mode="export"`.
- Seitenrand und Lochung (`src/cad/pageGuides.ts`) sind nicht druckbare Fanggeometrie über `topology.planFrame.guides`.

## Lochungsmuster, Seitenverbund, Mindestseite
- `Plan.holePattern` ("none" | "din2" | "four" | "a5ring6") ersetzt `holePunch`; Altdaten `true` → `din2`. Renderer und Fangpunkte nutzen `holePunchPointsMm` – nie in der PDF.
- Verbund: je Seite `spreadOffset`, je Verbund `spreadLayouts[spreadId].layoutMode` (eigenes Strukturobjekt im Cloud-Abgleich). Nur die aktive Seite ist bearbeitbar; Nachbarn werden angezeigt und über Griffe verschoben (ein Verlaufsschritt beim Loslassen). PDF: ein Verbund = eine Seite.
- `deletePlan()` lehnt die letzte Seite ab.
