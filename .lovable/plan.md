## Ziel

Wand-zu-Wand-Verbindungen so umbauen, dass sie deinen 4 Szenarien folgen: Endpunkt der neuen Wand "rastet" beim Setzen ein, alle drei Linien (Main/Sub/Help) verbinden sich automatisch nach Priorität, und ein T-Stoß auf einer durchgehenden Bezugslinie teilt die alte Wand in zwei Teile.

## Verhalten pro Szenario

**S1 – Anschluss an Wand 01 (Eckpunkt oder freier Punkt der Hauptlinie):**
Beim Setzen von B auf Wand 01 werden B' (Sub) und B'' (Help) der neuen Wand 02 entlang ihrer eigenen Achse so getrimmt, dass sie auf der gleichnamigen Linie der Wand 01 landen (Sub↔Sub, Help↔Help, Main↔Main).

**S2 – Wand 02 ragt über Wand 01 hinaus:**
Endpunkt B wird beim Click auf den Schnittpunkt mit Wand 01 zurückgezogen (Snap "Hauptlinie"). Es wird nicht über Wand 01 hinausgezeichnet.

**S3 – Sub/Help der Wand 02 würden Wand 01 schneiden, aber Hauptlinie (Priorität 1) blockiert:**
Sub/Help werden bis zur Hauptlinie der Wand 01 herangezogen (unterpriorisierter Stoß auf Main statt auf gleichnamige Linie). Wand 01 bleibt unverändert. Keine Lücke zwischen Wand 02 und Wand 01.

**S4 – T-Stoß auf einer durchgehenden Wand 01 (zwischen zwei Endpunkten):**
Wenn Wand 02 mitten auf die Bezugslinie von Wand 01 trifft und Wand 01 hinter dem Treffpunkt weiter zu einer dritten Wand verbunden ist, wird Wand 01 automatisch am Treffpunkt geteilt. Es entsteht Wand 04 als Reststück zwischen Wand 02 und Wand 03. (Nur wenn das Reststück tatsächlich an Wand 03 anschließt – sonst bleibt Wand 01 ein Stück.)

## Technische Umsetzung

### 1. WallTool – Endpunkt-Anschluss live beim Setzen
`src/cad/WallTool.ts`
- Beim `click` in `update(input)`: Wenn die aktuell gesetzte Position auf einer fremden Wand-Hauptlinie/-Eckpunkt liegt (`snap.wallId` mit `wallLine === 'main'` oder Eckpunkt einer fremden Wand), den neuen Eckpunkt exakt auf den Schnittpunkt setzen (S2 = nicht hinausziehen).
- Nach `finish()`: Für jeden Endpunkt der neuen Wand prüfen, ob er auf Main/Sub/Help einer bestehenden Wand liegt; vermerke das als "Anschluss-Hint" für den Heal-Schritt (Wand-ID + Linientyp).

### 2. wallHeal – Priorisiertes Trimmen
`src/cad/wallHeal.ts` erweitern:
- `healEnd` arbeitet derzeit nur auf der Bezugs-Mittellinie. Erweitern um:
  - **Gleichnamiger Stoß bevorzugt:** Main→Main, Sub→Sub, Help→Help (Priorität-1-Verbindung).
  - **Fallback "Main blockiert" (S3):** Wenn der gleichnamige Schnitt auf der anderen Seite der Hauptlinie der Nachbar-Wand läge, trimme stattdessen Sub und Help bis an die Main-Linie der Nachbar-Wand (= Stoß auf höhere Priorität, keine Lücke).
  - **Außenwand vor Innenwand:** AW-Hauptlinie hat Vorrang vor IW; IW wird an AW-Main getrimmt, AW wird nie an IW getrimmt.
- Heal-Resultat muss die effektiven Endpunkte aller drei Linien getrennt liefern (heute nur Main/Sub).

### 3. Auto-Split einer durchgehenden Wand bei T-Stoß (S4)
Neue Funktion `src/cad/wallSplit.ts`:
- Nach dem Setzen einer neuen Wand: Für jeden Endpunkt prüfen, ob er **innerhalb** einer Edge (nicht am Endpunkt) einer fremden Wand 01 liegt.
- Wenn ja **und** die fremde Wand auf der "Rückseite" hinter dem Treffpunkt mit einer dritten Wand verbunden ist (Endpunkt der fremden Wand fällt mit Endpunkt einer weiteren Wand zusammen, Toleranz `HEAL_TOL_M`), dann:
  - Splitte Wand 01 am Treffpunkt in zwei Wände (gleiche Eigenschaften, gleiche Layer-Group bzw. neue Auto-ID `AW0n`/`IW0n` für das Reststück).
  - Übernehme Bezugsseite, Dicke, Farbe, Kind aus Wand 01.
- Wenn die "Rückseite" frei endet, **kein** Split – einfacher Eckanschluss.

### 4. CadApp/Scene-Anbindung
- `Scene.splitWallAt(wall, pointOnAxis)` als Helfer (gibt zwei neue Walls zurück, entfernt original; History-Eintrag wie sonst nach Mutationen).
- `WallTool.finish()` ruft `_runConnectionPipeline()` auf: zuerst Endpunkt-Snap-Refine, dann Heal, dann Split-Check.

### 5. Snap-Auswahl beim Zeichnen
`WallTool._applyPrioritySnap` aktuell bevorzugt eigene Linie (Main↔Main usw.). Ergänzen:
- Während des **End-Click** (letzter gesetzter Eckpunkt) zusätzlich Eckpunkte fremder Wände als höchste Snap-Priorität (egal welche Linie), sodass S1 sauber rastet.

## Edge Cases

- Wand 02 hat eine andere Dicke als Wand 01: Sub/Help-Trim bleibt korrekt, da pro Linientyp separat geschnitten.
- Fast-parallele Walls: kein Schnitt → kein Trim, Cap bleibt (kein Datenschaden).
- Mehrere Anschluss-Kandidaten: Wand mit kürzerem Trim-Weg gewinnt.
- Split (S4): Mindest-Restlänge `Defaults.minSegLenM`, sonst kein Split.

## Testszenarien (manuell)

1. AW01 horizontal, AW02 vertikal von oben anrasten → Eckstoß sauber.
2. AW02 in der Mitte von AW01 enden lassen, AW01 nur zwei Punkte → Eckstoß, kein Split.
3. Wie 2., aber AW01 ist Teil eines U mit AW03 am anderen Ende → Split: AW01 wird in AW01 + AW04.
4. IW gegen AW: IW-Endpunkt wird an AW-Main getrimmt; AW unverändert.
5. AW02 schräg gegen AW01: Sub/Help laufen sauber zur Schnittlinie der Main von AW01 (S3).
