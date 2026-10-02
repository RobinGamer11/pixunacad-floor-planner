# CAD-Werkzeug „Treppe“ – Stufe A: gerade Treppen und Podeste

Ausgangsstand `main`: `61d6c63a`.

## Umfang dieser Runde
Gerade Treppen und L-/U-Treppen mit Podest werden vollständig umgesetzt: Platzieren, Fangpunkte, Auswahl, Bearbeiten, Undo, Cloud, Export/PDF und Rastern.
Gewendelte (`winder`) und runde (`arc`) Treppen sind schon im Datenmodell vorgesehen. In der Oberfläche erscheinen sie aber gesperrt mit dem Hinweis „folgt“. Freigeschaltet werden sie erst, wenn die gerade Treppe abgenommen ist.

## Für den Nutzer sichtbar
- Neues Treppen-Symbol in der linken Werkzeugleiste.
- Rechts unter „Werkzeugeinstellungen“: Modus, Auftritt, Laufbreite, Steigung, Schrittmaßregel an/aus mit Schrittmaß (Standard 63 cm), optional Geschosshöhe mit Vorschlag einer Stufenzahl, Bezug links/rechts, Pfeil aufwärts/abwärts sowie Pfeil, Kreis, Beschriftung und Maße jeweils an/aus.
- Live-Anzeige: Prüfung „2 × 17,5 cm + 28 cm = 63 cm“, Stufenzahl, Gesamtlauflänge, Gesamthöhe und Restlänge (gelb hervorgehoben, nie als Teilstufe).
- Ablauf: erst die Vorschau der ersten Stufe, dann bestätigen (Häkchen/Enter). Danach Bezug links oder rechts wählen und die Referenzlinie zeichnen (Punkte per Klick/Tipp). Abschluss per Häkchen, Enter oder Doppelklick. Ein erster Fingerkontakt setzt nie etwas.
- Darstellung: Stufen, Teilungskanten, Kreis an der ersten Stufe, Pfeil bis zur letzten Stufe und zweizeilige Beschriftung („16 × 17,5 cm“ / „15 × 28 cm“, optional „B = 1,10 m“).
- Bei ausgewählter Treppe: Verschieben/Drehen (Vorschau, Bestätigung nur per Häkchen/Enter, Abbruch mit Escape), Griffe an den Seitenkanten für die Laufbreite und an jeder Teilungskante für die Stufengrenze. Dazu Richtung umkehren, Podest hinzufügen/entfernen, Rastern (mit der bestehenden Warnung) und Löschen.

## Technische Umsetzung
- `stairGeometry.ts` (neu, reine Funktionen): Schrittmaßregel, Stufenzahl/Restlänge, Stufenpolygone entlang der Referenzlinie mit Bezugsseite. An Knicken entsteht ein Podest (Mindesttiefe = Laufbreite). Dazu gehören eindeutige Fangpunkte (gemeinsame Ecken nur einmal, per Schlüssel dedupliziert), Kantenmitten und Kanten, Pfeil/Kreis/Beschriftungsposition sowie die Grenzverschiebung (nachfolgende Stufen behalten ihren Auftritt).
- `constants.ts`: `ToolIds.STAIR`, `SelectionType.STAIR`.
- `Scene.ts`: Klasse `Stair` (Felder gemäß Konzept inkl. Feldern für `arc`), `scene.stairs`, create/get/remove, Klonen sowie Label-/Ebenen-Filter wie bei Türen.
- `StairTool.ts` (neu): Phasen 01–03, Tablet-sicher nach dem bestehenden Muster „scharfstellen → Vorschau → Häkchen“.
- `Renderer.ts`: Zeichnen aus den abgeleiteten Daten. Derselbe Pfad wird für CAD, Exportausschnitte, PDF und Rastern genutzt.
- `TopologyEngine.ts` und `tracingSnapGeometry.ts`: Fangpunkte und Kanten der Treppe, auch für die Transparenzpause.
- `SelectTool.ts`: Trefferprüfung (Stufe wählt die ganze Treppe), Gruppen-Verschieben/Drehen, Griff-Sitzungen mit Vorschau ohne Mutation am Modell. Erst die Bestätigung schreibt und erzeugt genau einen Undo-Schritt.
- `sceneSerde.ts`, `CadApp.ts` (Klon/Snapshot), `ClipboardManager.ts`, `groupTransform.ts`, `sceneDiff.ts`/`applyOps.ts`: Serialisierung (rückwärtskompatibel, fehlendes `stairs` ergibt `[]`), Copy/Paste, Cloud-Diff. Eine Persistenzmigration ist nicht nötig, weil das Feld nur hinzukommt.
- `CadEditor.tsx`: Werkzeugsymbol (Vektor-Icon mit Tooltip/aria-label) sowie Einstellungs- und Auswahlpanel.
- `AGENTS.md`: Regel „Treppen sind ein semantisches Objekt; Stufen werden nur abgeleitet, nie gespeichert“.

## Tests
- Schrittmaßregel in beide Richtungen, Vorschlag aus der Geschosshöhe.
- Stufenzahl und Restlänge (keine Teilstufe).
- Eindeutige gemeinsame Fangpunkte.
- Verschiebung einer Stufengrenze mit Mitverschiebung der Folgestufen, inkl. Grenzen und Mindestauftritt.
- Verschieben/Drehen der ganzen Treppe.
- Podest bei L- und U-Form.
- Tablet: erster Kontakt setzt nichts, nur Häkchen/Enter bestätigt.
- Serialisierung, Cloud-Diff, Copy/Paste, Undo (ein Schritt).
- Darstellung im Exportausschnitt.
- Danach: Typprüfung, Produktions-Build, vollständige Testsuite und eine Browserprüfung der Platzierung.

## Nicht in dieser Runde
Gewendelte und runde Treppen (nur vorbereitet), freie S-Kurven.
