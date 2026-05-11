## Drei Probleme an T-Stoß / Verbindungen

### 01 — T-Stoß überlappt in einer Diagonal-Richtung

**Ursache.** In `wallHeal.ts → healEnd` werden Sub/Hilfslinien mit dem Clamp gegen fremde `main`-Linien begrenzt. Der Clamp filtert nur Treffpunkte, deren Vorzeichen (`Math.sign(tt)`) dem des „Ideal"-Treffpunkts entspricht (`Math.sign(tt) !== sign → continue`). Bei einer T-Diagonale liegt der gleichnamige Sub-Treffer der bestehenden Wand auf *einer* Strahl-Seite, der bremsende Schnitt mit deren `main` aber auf der *anderen* — er wird verworfen. Die Sub-/Hilfslinie der neuen Wand schießt dann ungebremst über die bestehende `main` hinaus → Überlappung. Bei der spiegelverkehrten Zeichenrichtung tauschen sich Vorzeichen, sodass es zufällig nicht überlappt.

**Fix.** Im Sub/Help-Clamp die Vorzeichen-Beschränkung entfernen — jede fremde `main`, die der Strahl schneidet, ist eine harte Grenze. Es bleibt der nächstgelegene Treffer (kleinste `|tt|`) gewinnt.

### 02 — 90°-Wände (Shift) verbinden sich nicht

**Ursache.** `WallTool.update` ermittelt zuerst den Snap (z.B. auf den Endpunkt der Wand 1), `_previewWorld` überschreibt ihn aber bei gehaltenem Shift mit `orthoSnapFromA(base, p)`. Sobald ortho aktiv ist, geht der Wand-Snap verloren und Wand 2 endet ein paar Pixel neben dem Endpunkt → kein gemeinsamer Knoten → kein Heal.

**Fix.** In `_previewWorld` ortho nur anwenden, wenn KEIN Wand-Endpunkt-Snap aktiv ist. Snap auf `wallId` (Punkt) hat Vorrang vor Shift-Ortho. (Linien-Snaps und Snaps ohne `wallId` dürfen weiterhin von Ortho überschrieben werden.)

### 03 — Heal bricht bei steilen Winkeln ab

**Ursache.** `wallHeal.ts → HEAL_MAX_DIST_M = 5.0` verwirft jeden Schnitt, bei dem der nötige Verlängerungs-Abstand entlang des Strahls > 5 m ist. Bei sehr stumpfen/steilen Übergängen (Wand-zu-Wand fast parallel) wird der Gehrungs-Treffer schnell zweistellig → Sub/Hilfslinien des spitz auslaufenden Endes bleiben ungeheilt, optisch entsteht eine Lücke.

**Fix.** Cap auf `30.0 m` anheben. Liegt im Rahmen üblicher Räume und verhindert zugleich noch Ausreißer bei nahezu parallelen Wänden.

## Geänderte Dateien

- `src/cad/wallHeal.ts`: Sub/Help-Clamp ohne Vorzeichen-Filter; `HEAL_MAX_DIST_M = 30`.
- `src/cad/WallTool.ts`: `_previewWorld` skipped Ortho, wenn Snap auf `wallId`-Punkt liegt.

## Verifikation im Preview

1. Horizontale Wand zeichnen, dann diagonale Wand von oben-links bis Mitte → kein Übersteher (vorher Überlappung in dieser Richtung).
2. Erste Wand horizontal mit Shift, dann mit Shift senkrecht aus dem Endpunkt → die zwei Wände mitern sauber am Eck.
3. Wand bei 140°, dann zweite Wand bei 340° (≈20° Knick zur ersten) → Heal verbindet beide ohne Lücke.
