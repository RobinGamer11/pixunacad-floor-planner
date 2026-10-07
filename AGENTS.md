# AGENTS.md – PixunaCAD Floor Planner

## 0. Start jeder Aufgabe
Aktuellen Stand von `main` nennen. Ist er nicht aktuell oder GitHub nicht erreichbar: sofort den sicheren PowerShell-Befehl zum Abruf von `main` geben und vor Bestätigung nichts ändern.

## 1. Projekt & Git
- Repo `RobinGamer11/pixunacad-floor-planner`, Branch `main` ist verbindlich. Workflow: Lovable ↔ GitHub `main` ↔ Codex.
- Vorher: Verbindung und `origin/main` prüfen, auf neuestem Stand arbeiten, nichts Neueres überschreiben; ein Export ohne Git gilt nicht als synchron.
- Nachher: Diff prüfen, Tests/Build, aussagekräftig committen, auf `main` pushen (nie Force-Push), Push auf GitHub verifizieren.
- Ohne Push: Arbeit behalten, Grund nennen und deutlich schreiben: `WICHTIG: Die Änderungen wurden noch nicht nach GitHub main übertragen. Vor der Weiterarbeit in Lovable muss der Commit/Push bzw. die GitHub-Verbindung noch abgeschlossen werden.`

## 2. Lovable
Lovable-Strukturen und -Funktionen nicht ohne Grund entfernen; Code muss in Lovable ladbar bleiben; keine separate Codex-Version; Architekturänderungen auf Vorschau/Sync prüfen.

## 3. Supabase, Secrets
- Frontend nur `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Nie service_role, Secret Keys, DB-Passwörter, Tokens im Repo/Frontend.
- RLS nie ohne Grund deaktivieren; Nutzer sehen standardmäßig nur eigene Daten; Auth/Policy/Storage-Änderungen auf Sicherheit prüfen.
- `.env*` nicht committen, `.env.example` nur Platzhalter; vor jedem Commit auf Secrets prüfen.

## 4. Prüfen & Schützen
- Vor Abschluss: Typecheck/Lint, Build, betroffene Abläufe testen; bei Auth: Registrierung, Login, Logout, Session, Passwort-Reset, geschützte Routen. Nicht Durchgeführtes benennen.
- Keine Features ohne Auftrag entfernen, keine unnötigen Refactorings; Aufrufer, Stores, Hooks, Persistenz vor Änderungen per Suche prüfen; Kompilieren allein ist kein Erfolg.
- Aufwand an Risiko anpassen; CAD-Logik, Persistenz, Supabase/Auth/RLS, Dateien, Projektdaten immer gründlich prüfen. Keine unnötigen Pakete.

## 5. Daten, Deployment, Recht
- Datenmodell: Nutzerdaten erhalten, nicht destruktiv, rückwärtskompatibel, Migrationen im Repo; Produktionsdaten nie ohne Freigabe löschen.
- Vercel: Vite/SPA-Routing erhalten, Env-Variablen dokumentieren, keine lokalen Pfade/Secrets.
- Impressum/Datenschutz: keine erfundenen Angaben; Platzhalter klar kennzeichnen.

## 6. Abschlussmeldung
Was geändert, wichtige Dateien, Tests, Build, Push-Status, Commit-Hash (fehlender Push deutlich). Immer mit vollständigem PowerShell-Befehl für den nächsten Schritt enden.

## Architekturregeln
- Öffnen/Laden folgt nur `decideOpen` in `src/lib/cloudProjectState.ts` – Leerstand überschreibt nie die Cloud, keine automatische Vermischung.
- CAD-Blätter/Ebenen laufen als Strukturobjekte (`__structure__`) – sonst fehlen sie auf dem zweiten Gerät.
- `ProjectAccess.cloud` und `.shared` sind getrennt; Realtime/Präsenz/Sperren nur bei weiteren Personen – keine Team-Kosten für Solo-Projekte.
- Papierkorb folgt `network_projects.deleted_at` über `src/lib/cloudTrash.ts` – gelöschte Projekte kehren nicht zurück.
- Export = dieselbe `CadApp` (`?view=export`), Mutationen nur `CadApp.mutatePlans` (s. `docs/export-architecture.md`).
- Export-Bedienzustände sind lokal/flüchtig, nie Cloud/Undo/Snapshot/localStorage; Fangpunkte von Hintergrundseiten nur über `TopologyEngine.tracingSnapScenes`.
- Die frühere Projektmappe ist entfernt; nur `src/lib/legacyMappeMigration.ts` kennt alte Feldnamen und bereinigt nur den Projekt-Payload (nie CAD/Export).
- Treppen sind ein einzelnes `Stair`-Objekt; Stufen, Podeste, Fangpunkte und Beschriftung leitet nur `src/cad/stairGeometry.ts` ab – nie als eigene Scene-Objekte speichern.
- Treppen-Knöpfe sind DOM über der Zeichenfläche, nie Geometrie; Cursor-Reset zentral in `CadApp.setTool`.
- Export-Ausschnitte transformieren als Sitzung in `PlanController` (`_drag.preview`); Projection erst bei ✓/Enter geändert.
- Treppengriffe laufen über das gemeinsame `PointEditMenu` (CadApp leitet im Bearbeitungsmodus an `StairTool.onPointMenuAction` weiter); bearbeitbare Kanten liefert nur `stairEditableEdges` – kein zweites Bedienkonzept.
- Restlängen vor Podesten verteilt nur `computeStairGeometry` (max. `MAX_TREAD_ADJUST_M` je Auftritt) – Podeste wachsen nie automatisch, nur durch bewusste Eingabe.

## Hilfslinien
- Hilfslinien-Geometrie (Punkte, Kanten, anliegende Achsen) liefert nur `src/cad/guideGeometry.ts` aus echter Objektgeometrie (über `TopologyEngine.guideGeometry`) – nie Probeabfragen, nie Werkzeug-Sonderlogik.
- Rechtsklick-Hilfslinien laufen nur über `GuideInteractionController` → `GlobalGuides` (Gruppen mit Referenzzählung, je Kontext `cad|export:sheet|plan`) – flüchtig, nie Cloud/Undo/Export, nie zwischen Blatt und Exportseite.
- Benutzerhandlung = `CadApp.runAction` → 1 Undo, Fehler = volle Rücknahme.
- Verlauf: Kacheln nur via `RasterTileStore`. Pixel: Grenzen nur `raster/RasterPolicy`, Jobs atomar via `CadApp.commitRasterJob`; Ablehnung = Vektor bleibt.
- Lokaler CAD-Stand: IndexedDB (`raster/localScenePersist.ts`, Format `RASTER_FORMAT`) ist maßgeblich; Pixel nur als Hash-Blobs im Manifest (`raster/rasterManifest.ts`), localStorage nur Vektorstand – höheres Format wird nie geladen/überschrieben.
