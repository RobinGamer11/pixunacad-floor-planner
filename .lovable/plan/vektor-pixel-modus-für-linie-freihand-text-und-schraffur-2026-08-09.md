# Vektor- / Pixel-Modus für Linie, Freihand, Text und Schraffur

Ganz oben in den Werkzeug-Einstellungen dieser vier Werkzeuge kommt ein Umschalter **Vektor | Pixel** – in der CAD-Oberfläche und in der Mappe.

- **Vektor** (Default): alles bleibt exakt wie heute – editierbare Punkte, Text bleibt Text, Schraffurmuster bleiben parametrisch.
- **Pixel**: das Objekt wird direkt beim Fertigstellen (ENTER bzw. Abschluss der Zeichnung) in ein Bild umgewandelt – wie in Sketchbook o. ä. Danach verhält es sich wie ein importiertes PNG: verschieben, drehen, skalieren, spiegeln, Transparenz, und vor allem Radieren mit dem Radiergummi inklusive weichem „Smooth“-Modus.

## Verhalten im Pixel-Modus

- Während des Zeichnens sieht alles unverändert aus (gleiche Vorschau, gleiche Fangpunkte).
- Beim Abschließen wird das Objekt gerendert und als Bildobjekt in die Zeichnung gelegt, an derselben Stelle, mit derselben Größe und Drehung.
- Auflösung automatisch aus dem aktuellen Zoom, mindestens 300 dpi bezogen auf den Blattmaßstab, mit einer Obergrenze, damit sehr große Flächen nicht zu riesigen Bildern führen.
- Ein kleiner Rand um das Objekt bleibt frei, damit Linienenden, Pinselkanten und Schatten nicht abgeschnitten werden.
- Keine Punkt-, Text- oder Musterbearbeitung mehr – dafür volle Radiergummi-Funktion (hart und smooth).
- Undo/Redo wie gewohnt: ein Schritt zurück entfernt das Pixelobjekt.
- Kopieren/Einfügen, Ebenen (Label), Export und PDF-Ausgabe funktionieren wie bei anderen Bildern.

## Umsetzung (technisch)

- Neues gemeinsames Modul `src/cad/rasterize.ts`: rendert eine Liste frisch erzeugter Objekte (Linie, Freihand-Stroke, Text, Schraffur) offscreen über die bestehende Renderer-Zeichenlogik in ein Canvas, ermittelt die Weltbounding-Box inkl. Padding und liefert PNG-DataURL + Pixelmaße.
- Ergebnis wird als `DocumentObject` (`kind: "image"`) über `Scene.addDocument` eingefügt; das Vektor-Original wird nicht in die Szene übernommen. Damit greifen `EraserTool` (Maske, hart/smooth), Filter, Warp und Transformationen automatisch.
- Zustand `drawRasterMode: "vector" | "pixel"` in `CadApp.ts` (persistiert wie andere Tool-Defaults) und analog im Mappe-Zustand in `ProjectWorkspace.tsx`.
- Commit-Punkte anpassen: `LineTool.ts`, `FreeDrawTool.ts`, `TextTool.ts`, `HatchTool.ts` – dort, wo das fertige Objekt der Szene hinzugefügt wird, bei `pixel` stattdessen rasterisieren.
- Auflösungsermittlung: `dpiTarget = max(300, aktuelle Bildschirm-Auflösung des Objekts)`, begrenzt auf max. ca. 16 MPixel.
- UI: neuer kompakter Segment-Umschalter als eigene Komponente `src/components/cad/RasterModeToggle.tsx`, eingebunden ganz oben in `FreeDrawSettingsPanel.tsx`, `HatchSettingsPanel.tsx`, den Linien- und Text-Einstellungen im CAD-Panel sowie in den entsprechenden Mappe-Panels.
- Kurzer Hilfetext (hellgrau) im Panel: „Pixel: Objekt wird als Bild abgelegt und kann mit dem Radiergummi (auch Smooth) bearbeitet werden – keine nachträgliche Punkt-/Textbearbeitung.“
