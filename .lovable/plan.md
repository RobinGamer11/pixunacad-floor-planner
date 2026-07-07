## Ziel
Die Projektmappe soll bei **Auswahl**, **Linie**, **Freihand** und **Radiergummi** sichtbar und bedienbar wie die CAD-Oberfläche funktionieren. Zusätzlich werden die aktuellen Unsauberkeiten beim Zeichnen, Auswählen und Zoomen behoben.

## Plan
1. **Tool-Auswahl wie im CAD übernehmen**
   - Die separaten Rail-Buttons **Linie**, **Freihand** und **Radiergummi** in der Projektmappe durch denselben ausklappbaren Linien-Button ersetzen, wie er in der CAD-Oberfläche unter „Linie“ genutzt wird.
   - Das Popover zeigt **Linie / Freihand / Radiergummi** mit Icon, Label und aktivem Zustand wie im hochgeladenen Referenzbild.
   - Auswahl bleibt als eigenes Werkzeug sichtbar und eindeutig aktivierbar.

2. **Doppelte/alte Zeichenlogik entfernen**
   - Die alte React/SVG-Linienebene in der Projektmappe wird für neue CAD-Linien nicht mehr verwendet.
   - Linie, Freihand, Radiergummi und Auswahl laufen ausschließlich über `MiniCad` mit den bestehenden CAD-Klassen (`LineTool`, `FreeDrawTool`, `EraserTool`, `SelectTool`).
   - Dadurch gibt es keine zwei konkurrierenden Zeichen-/Auswahl-Systeme mehr.

3. **Zoom-/Verschwindeproblem korrigieren**
   - Die Canvas-Größe und Position des `CadOverlayLayer` wird an die tatsächlich sichtbare Seitenfläche gekoppelt.
   - Beim Zoomen darf die CAD-Canvas nicht aus dem sichtbaren Seitencontainer laufen oder durch CSS-Scale/Wrapper-Offsets falsch ausgerichtet werden.
   - Selection-Hit-Tests und gezeichnete Objekte bleiben bei jedem Zoom deckungsgleich mit der Papierseite.

4. **Auswahlwerkzeug stabilisieren**
   - Auswahl im Projektmappenmodus wird so verdrahtet, dass die CAD-Auswahl nicht von der React-Seitenauswahl überlagert oder sofort wieder abgewählt wird.
   - Mehrfachauswahl/Shift-Auswahl bleibt erhalten, aber nur eine Instanz entscheidet über CAD-Objekte.
   - CAD-Objekte (Linien/Freihand) und Projektmappen-Elemente (PDF/Bild/CAD-Blatt) werden klar getrennt, damit Klicks vorhersehbar sind.

5. **Settings-Panels konsistent machen**
   - Bei aktivem Linien-Popover werden die passenden Einstellungen angezeigt: Linie, Freihand oder Radiergummi.
   - Bestehende CAD-Settings-Panels werden weiterverwendet, keine vereinfachten Parallel-Panels.

6. **Verifikation**
   - Mit Playwright prüfen: Tool-Popover sichtbar wie Referenz, Linie zeichnen, Freihand zeichnen, Radiergummi radiert, Auswahl selektiert/verschiebt, Zoom rein/raus ohne Verschwinden oder Versatz.

## Technische Ursache, die behoben wird
Aktuell ist die Projektmappe nicht komplett „clean“, weil sie zwar `MiniCad` nutzt, aber daneben noch alte Projektmappen-Logik existiert: skalierter Seiten-Div, SVG-Linienlayer, React-Auswahl und ein separat positionierter CAD-Canvas-Overlay. Diese Schichten können bei Zoom und Auswahl auseinanderlaufen. Der Fix reduziert das auf eine eindeutige CAD-Engine-Schicht für CAD-Werkzeuge und richtet den Overlay exakt an der Seite aus.