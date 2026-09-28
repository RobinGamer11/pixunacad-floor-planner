# Exportbereich – Architektur

- Export ist **derselbe CAD-Bereich** (`/project/:id/cad?view=export`): gleiche `CadApp`-Instanz, gleiche Werkzeuge, Auswahl, Fangpunkte, Zwischenablage und Verlauf. Wechsel CAD ↔ Export behält den Verlauf.
- Exportseiten = erweiterte `Plan`s (`PlanManager`), Ordner = `PlanFolder`; Baum/Reihenfolge/Auswahl in `src/cad/planTree.ts`.
- Jede Exportseite hat ihre Anmerkungs-Scene (`planScenesById`); Werkzeuge bearbeiten auf Exportseiten nur diese. Quell-CAD wird über „CAD-Blatt bearbeiten“ bewusst geöffnet.
- Ausschnitte (`Projection`) sind standardmäßig `linked` (keine Geometriekopie, Cache über `CadApp.contentRevision`), optional `frozen`; fehlende Quelle → Platzhalter.
- Alle Mutationen der Oberfläche laufen über `CadApp.mutatePlans` → genau ein Verlaufsschritt. Der globale Snapshot enthält Seiten, Ordner, Anmerkungs-Scenes, Transparenzpausen und Referenzen.
- Exportauswahl ist temporärer UI-Zustand (kein `includeInExport`). PDF: `CadApp.exportPlansByIds` in sichtbarer Baumreihenfolge, ohne Duplikate, inkl. Anmerkungen.
- Seitenrand und Lochung sind Hilfslinien, werden nie gedruckt.
- Freischaltung: bis Cloud-Objektsync + Zwei-Geräte-Test verborgen (`src/lib/exportFeature.ts`, `localStorage pixuna.exportPreview=1`).

## Offen
- Cloud-Objektoperationen für Seiten, Ordner, Overlays, Referenzen und Anmerkungs-Scenes; Zwei-Geräte-Test.
- `contentRevision` bei direkten Scene-Mutationen ohne Verlaufsschritt und bei Ebenen-Sichtbarkeit zentral erhöhen.
