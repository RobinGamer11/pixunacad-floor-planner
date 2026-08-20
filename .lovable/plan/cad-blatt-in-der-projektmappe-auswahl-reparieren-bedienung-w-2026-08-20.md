# CAD-Blatt in der Projektmappe: Auswahl reparieren + Bedienung wie ursprünglich gewünscht

Ziel: Das CAD-Blatt-Objekt verhält sich exakt so, wie es beschrieben wurde — blaue Optik, normale Ebenen-Hierarchie, Bedienung ausschließlich über HUB-Symbole, Bestätigung per L-Klick/ENTER bzw. Häkchen. Keine neuen Konzepte, sondern die vorhandene Werkzeug-Logik der Mappe wiederverwenden. Der Maßstab (Papier-mm × Nennmaßstab) bleibt unverändert.

## 1. Auswahl funktioniert wieder

Ursache (geprüft): Die CAD-Zeichenebene (`CadOverlayLayer`) liegt im DOM nach den Seiten-Elementen und ist beim Auswahl-Werkzeug aktiv. CAD-Blatt-Objekte bekommen aktuell kein erhöhtes `zIndex` (`elevated` schließt `cad-view`/`cad-viewport` explizit aus), liegen also unter der Zeichenebene und fangen keinen Klick mehr.

Fix: CAD-Blätter bei aktivem Auswahl-Werkzeug wieder über die Zeichenebene stellen (gleiche Behandlung wie andere Objekte), damit ein Klick sie auswählt.

## 2. Blaue Optik statt Gold

- Auswahlrahmen dünn und blau (`#4da3ff`) statt goldenem Rahmen.
- Fangpunkte (Ecken/Kantenmitten) blau, in der gleichen dezenten Größe wie bei den anderen Werkzeugen.
- Kanten werden nicht als dicke blaue Balken gezeichnet, sondern nur als feine Linien/Punkte.

## 3. Cursor bleibt unverändert

Über Kanten und Fangpunkten kein Resize-/Move-Cursor mehr — Standard-Cursor wie bei den übrigen Werkzeugen. Nur während einer aktiven HUB-Aktion (Verschieben/Drehen) das übliche Fadenkreuz.

## 4. Ebenen-Hierarchie

CAD-Blätter folgen der normalen Ebenenreihenfolge. Bei aktivem Zeichenwerkzeug (Linie, Freihand, Text, Schraffur, Radierer, Dokument …) nehmen sie keine Pointer-Events an, damit neue Objekte darüber gezeichnet werden können und nicht an den Kanten stoppen.

## 5. Bedienung nur über HUB-Symbole

- Verschieben und Drehen starten ausschließlich über das jeweilige HUB-Symbol; ein Klick/Zug auf das Objekt selbst verschiebt es nicht.
- Während der Aktion folgt das Objekt der Maus (Vorschau). Linksklick setzt es an der aktuellen Position ab, ENTER schließt final ab; ESC bricht ab.
- Kanten ein-/ausschneiden nur nach Klick auf das Kanten-Symbol der jeweiligen Kante; Bestätigung per Häkchen oder ENTER.
- Tablet: alle drei Aktionen zusätzlich per Ziehen mit Häkchen-Bestätigung bedienbar (bestehendes Tablet-Hilfsrad-Muster).

## 6. Einstellungen (bereits vorhanden, wird geprüft/angeglichen)

Pro CAD-Blatt-Objekt im „CAD-Blatt“-Werkzeug: „Objektart“ (Vektor/Pixel) und „Automatisch aktualisieren“. Der globale Schalter ganz oben bleibt entfernt. Die Objektart-Buttons werden auf die blaue Aktiv-Optik umgestellt, damit sie zum Rest passen.

## Technische Hinweise

- Betroffen: `src/pages/ProjectWorkspace.tsx` (`ElementView`: `isCadView`, `cadHubUx`, `elevated`/`zIndex`, `pointerEvents`, Rahmen-/Handle-Farben, Cursor; CAD-Blatt-Panel) und ggf. `src/components/page/CadViewportView.tsx` nur für Darstellung.
- Der HUB-Ablauf (Modus → Vorschau → L-Klick → ENTER/Häkchen) ist im `ElementView` bereits implementiert und wird über das Flag wieder aktiviert statt neu gebaut.
- Maßstabslogik (`paperMm × scaleDen`, Paper-Space-Recompute beim Kantenschnitt, gesperrte Ecken-Skalierung) bleibt unangetastet.
