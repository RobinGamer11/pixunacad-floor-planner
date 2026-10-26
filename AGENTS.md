# AGENTS.md – PixunaCAD Floor Planner

## 0. Start jeder Aufgabe
Aktuellen Stand von `main` nennen. Ist er nicht aktuell oder GitHub nicht erreichbar: sofort den sicheren PowerShell-Befehl zum Abruf von `main` geben und vor Bestätigung nichts ändern.

## 1. Projekt & Git
- Repo `RobinGamer11/pixunacad-floor-planner`, Branch `main` ist verbindlich. Workflow: Lovable ↔ GitHub `main` ↔ Codex.
- Vorher: Verbindung und `origin/main` prüfen, auf neuestem Stand arbeiten, nichts Neueres überschreiben; ein Export ohne Git gilt nicht als synchron.
- Nachher: Diff prüfen, Tests/Build, aussagekräftig committen, auf `main` pushen (nie Force-Push), Push auf GitHub verifizieren.
- Ohne Push: Arbeit behalten, Grund nennen und deutlich schreiben: `WICHTIG: Die Änderungen wurden noch nicht nach GitHub main übertragen. Vor der Weiterarbeit in Lovable muss der Commit/Push bzw. die GitHub-Verbindung noch abgeschlossen werden.`

## 2. Lovable
Lovable-Strukturen erhalten, Code in Lovable ladbar, keine Codex-Sonderversion.

## 3. Supabase, Secrets
- Frontend nur `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Nie service_role, Secret Keys, DB-Passwörter, Tokens im Repo/Frontend.
- RLS nie ohne Grund deaktivieren; Nutzer sehen standardmäßig nur eigene Daten; Auth/Policy/Storage-Änderungen auf Sicherheit prüfen.
- `.env*` nicht committen, `.env.example` nur Platzhalter; vor jedem Commit auf Secrets prüfen.

## 4. Prüfen & Schützen
- Vor Abschluss: Typecheck/Lint, Build, betroffene Abläufe testen; bei Auth: Registrierung, Login, Logout, Session, Passwort-Reset, geschützte Routen. Nicht Durchgeführtes benennen.
- Keine Features ohne Auftrag entfernen, keine Refactorings ohne Grund; Aufrufer, Stores, Hooks, Persistenz vor Änderungen per Suche prüfen; Kompilieren allein ist kein Erfolg.
- CAD-Logik, Persistenz, Supabase/Auth/RLS, Dateien, Projektdaten immer gründlich prüfen. Keine unnötigen Pakete.

## 5. Daten, Deployment, Recht
- Datenmodell: Nutzerdaten erhalten, nicht destruktiv, rückwärtskompatibel, Migrationen im Repo; Produktionsdaten nie ohne Freigabe löschen.
- Vercel: Vite/SPA-Routing erhalten, Env-Variablen dokumentieren, keine lokalen Pfade/Secrets.
- Impressum/Datenschutz: nichts erfinden, Platzhalter kennzeichnen.

## 6. Abschlussmeldung
Änderungen, Dateien, Tests, Build, Push-Status, Commit; Ende mit PowerShell-Befehl.

## Architekturregeln
- Manual 3D edits share transient sheet-qualified selection and draft routing through `manualMoveState`; source commits use one `runAction`, while previews use isolated scene copies to protect persistence and wall topology.
- Combined 3D manipulation uses two official Three.js controls with one gesture owner and one pivot; snap contacts, face-contact grids and 0,00 m level glow stay transient in `manipulationSnap`/viewer, the moved copy is only a preview until one commit, and device preferences stay outside project data to preserve shared undo and persistence.
- Tilt reference display uses the stored physical tilt frame until a draft changes it; boundary heights come from derived geometry, so selecting another reference never relocates the solid's highlighted edge.
- Rigid spatial orientation is `pose3D` in CAD coordinates, relative to sheet elevation; derive it after existing tilt and before relationships, and serialize it through object metadata so repeated rotations, copies and exports share one model.
- 3D materials are object metadata with project-file image references; export the derived scene as standard glTF/GLB so other renderers receive PBR values and textures without a separate CAD model.
- Keep the existing Three.js viewer engine for incremental 3D work; replacing it would risk the shared CAD selection and navigation behavior.
- Unterordner haben eigene `AGENTS.md` – vor Änderungen dort lesen (z. B. `src/cad/AGENTS.md`).
- Öffnen/Laden folgt nur `decideOpen` in `src/lib/cloudProjectState.ts` – Leerstand überschreibt nie die Cloud, keine automatische Vermischung.
- CAD-Blätter/Ebenen laufen als Strukturobjekte (`__structure__`) – sonst fehlen sie auf dem zweiten Gerät.
- `ProjectAccess.cloud` und `.shared` sind getrennt; Realtime/Präsenz/Sperren nur bei weiteren Personen – keine Team-Kosten für Solo-Projekte.
- Papierkorb folgt `network_projects.deleted_at` über `src/lib/cloudTrash.ts` – gelöschte Projekte kehren nicht zurück.
- Export = dieselbe `CadApp` (`?view=export`), Mutationen nur `CadApp.mutatePlans` (s. `docs/export-architecture.md`).
- Export-Bedienzustände sind lokal/flüchtig, nie Cloud/Undo/Snapshot/localStorage; Fangpunkte von Hintergrundseiten nur über `TopologyEngine.tracingSnapScenes`.
- Die frühere Projektmappe ist entfernt; nur `src/lib/legacyMappeMigration.ts` kennt alte Feldnamen und bereinigt nur den Projekt-Payload (nie CAD/Export).
- Export-Ausschnitt: Sitzung in `PlanController` (`_drag.preview`), Projection erst bei ✓/Enter.

## Hilfslinien
- Hilfslinien-Geometrie (Punkte, Kanten, anliegende Achsen) liefert nur `src/cad/guideGeometry.ts` aus echter Objektgeometrie (über `TopologyEngine.guideGeometry`) – nie Probeabfragen, nie Werkzeug-Sonderlogik.
- Rechtsklick-Hilfslinien laufen nur über `GuideInteractionController` → `GlobalGuides` (Gruppen mit Referenzzählung, je Kontext `cad|export:sheet|plan`) – flüchtig, nie Cloud/Undo/Export, nie zwischen Blatt und Exportseite.
- Benutzerhandlung = `CadApp.runAction` → 1 Undo, Fehler = volle Rücknahme.

## Speicher
- Gezeichnetes nur Vektor (Pixel nur in Importen). Lokaler Stand nur via `cad/persist/localScenePersist.ts`, Anhänge nur via `lib/storageQuota.ts` (Grenzen = SQL v2).
- Auswahlfilter-Eigenschaften nur via `registerFilterProperty` (`cad/selectionFilter.ts`); Treffer in `marqueeSelectedIds`, Werte lokal.

- Objektname/-ID/-Beschreibung nur über `cad/objectMeta.ts` (Serialisierung/Laden gekoppelt, Kopien ohne ID).
- Flächen schneiden/vereinigen nur via `cad/cutGeometry.ts` (`restoreArcs` = echte Bögen).
- Infoboxen sind Szenenobjekte (`Scene.infoBoxes`, Serialisierung wie Treppen); flüchtige Auswahl/Entwurf nur in `lib/infoBoxUi.ts`, Bearbeitung nur im Einstellungspanel – keine DB-Kommentare mehr im CAD.
- Stapelreihenfolge innerhalb einer Ebene nur über `src/cad/stackOrder.ts` (`stackOrder` via `objectMeta.ts`); fehlender Wert = alte Typordnung, damit Altprojekte unverändert bleiben.
