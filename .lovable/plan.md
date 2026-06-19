Du hast drei größere Themen angesprochen — bevor ich die alle anpacke, hier mein Plan zur Abstimmung. Bitte sag, was passt und was du anders haben möchtest (oder welche Punkte zuerst).

## 1) Text-Werkzeug: korrekte Skalierung auf der Seite

**Diagnose (was ich gemessen habe)**
Auf einer A4-Seite (210 mm) bei `width=1100 px` ergibt sich `basePxPerMm≈5.24` und `referencePxPerM=5240`. Daraus folgt:
- Default-Textbox: `2.6 m × 0.6 m`, multipliziert mit `worldScaleFactor (80/5240≈0.0153)` → ca. **4 cm × 1 cm** auf dem Blatt. Optisch nach wie vor groß und nicht "Papier-realistisch".
- Schriftgröße `16 px` wird per `cam.scale/referencePxPerM = zoom` skaliert → bei 100 % Zoom = 16 Bildschirm-px ≈ **3 mm auf Papier** (≈ 9 pt). Wirkt im aktuellen Render trotzdem zu groß, weil die Textbox selbst überdimensioniert ist (siehe oben) und die Vorschau am falschen Punkt sitzt.

**Geplante Fixes**
1. `defaultTextBoxWidthM/HeightM` für MiniCad neu rechnen statt `Defaults.textBoxWidthM` (2.6 m) zu nehmen: Standardbox = z. B. 60 mm × 14 mm (passend zu 9–12 pt Standard­schrift, mehrzeilig wächst).
2. Schriftgrößen-Mapping eindeutig in "Papier-Pixel": ein `16 px`-Wert im Settings-Panel ergibt **exakt 16 px auf dem Blatt** (≈ 4.2 mm bei A4) — TextTool/Renderer entsprechend anpassen.
3. Inline-Editor (contenteditable) erhält dieselbe Pixelgröße auf der Seite, damit "Was du tippst = was du siehst".
4. Vorschau-Rechteck am tatsächlichen Snap-Punkt (Maus) zentriert, nicht an Seitenecke.

## 2) Auswahl / Hub-Box für Text & Linie (1:1 wie CAD)

Aktuell macht `MiniSelectTool` direktes Drag. Du willst stattdessen das CAD-Verhalten: **klicken → markieren → Bearbeitung NUR über Hub-Box** (Länge/Winkel bei Linien, Größe/Rotation/Position bei Textboxen). Pan auf leerer Fläche bleibt.

**Plan**
1. Den vollständigen `SelectTool` aus der CAD-Oberfläche in `MiniCad` einbinden (statt der schlanken Eigenentwicklung). Abhängigkeiten (`PointEditMenu`, `LineHub`, Clipboard) sind bereits gehostet — nur fehlende Andockstellen ergänzen.
2. Direktes Drag in MiniSelectTool deaktivieren — Objekt wird beim Linksklick nur **selektiert**, Hub-Box öffnet (für Linien `LineHub` mit Länge/Winkel, für Textboxen ein **TextHub** mit Breite/Höhe/Drehung wie in der CAD-Oberfläche).
3. Verschieben/Drehen läuft komplett über Hub-Box-Eingaben (Tab/Enter wie gewohnt) und über die Translate-/Rotate-Buttons aus dem `PointEditMenu`.
4. Wenn nichts getroffen wird → bestehender Pan-Pfad (Plain-Left-Drag) bleibt aktiv.

Offene Frage: In der CAD-Oberfläche **gibt es aktuell keinen eigenen "TextHub" mit Maßen/Rotation** — Textboxen werden dort über die Eck-Handles und das PointEditMenu transformiert. Soll ich:
- (a) genau das in der Seite übernehmen (Eck-Handles + PointEditMenu), oder
- (b) zusätzlich eine neue Hub-Box "Breite × Höhe × Winkel" für Textboxen bauen?

## 3) CAD-Ansicht (Bild des Zeichenblatts) im Seiten-Element

Aktuell rendert `cad-view` nur einen Platzhalter ("CAD-Ansicht · sheet-id"). Du willst dort das **tatsächliche Bild des Zeichenblatts** sehen.

**Plan**
1. Neuer Helper `renderSheetToImage(projectId, sheetId, widthPx)` — lädt den persistierten CAD-State, baut einen unsichtbaren `Renderer`/`Scene` (ohne UI), rendert das Sheet 1:1 in einen Off-Screen-Canvas und liefert eine DataURL.
2. `cad-view`-Element rendert dieses Bild in seinem Rahmen (object-fit: contain, Maßstab gemäß `element.scale`).
3. Re-Render automatisch beim Öffnen einer Seite und beim Verlassen der CAD-Oberfläche (über das bereits existierende Auto-Save in `CadEditor`).
4. Optional (später): Live-Update statt DataURL, sobald Performance es erlaubt.

---

**Bitte bestätige / korrigiere:**
- Punkt 1: passt das Maß "Standard-Textbox 60 × 14 mm, Schrift = echte Papier-Pixel"?
- Punkt 2: Variante (a) oder (b) für Textbox-Bearbeitung?
- Punkt 3: Bild beim Seiten-Öffnen + nach CAD-Bearbeitung neu rendern (statt Live) ok?
