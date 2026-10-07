# Raster/Pixel
- Verlauf: Kacheln nur via `RasterTileStore`. Pixel: Grenzen nur `raster/RasterPolicy`, Jobs atomar via `CadApp.commitRasterJob`; Ablehnung = Vektor bleibt.
- Lokaler CAD-Stand: IndexedDB (`raster/localScenePersist.ts`, Format `RASTER_FORMAT`) ist maßgeblich; Pixel nur als Hash-Blobs im Manifest (`raster/rasterManifest.ts`), localStorage nur Vektorstand – höheres Format wird nie geladen/überschrieben.
- RAM: Kachelpuffer nur über `raster/RasterResourceManager` (LRU, nur saubere Kacheln verdrängbar); verdrängt = unbekannt, nie transparent; Änderungen an ladenden Kacheln laufen über die `pending`-Warteschlange.
- Konsumenten: Masken melden `complete`; unvollständig = `RasterNotReadyError`, nie leer. Ausgaben (PDF) warten über `RasterLayers.whenLoaded`.
- Auflösung je Kachel: Faktor `s` (Halbierungsstufen, Weltgröße gleich); bestehende Kacheln werden nie umgerechnet, Komposition nimmt die feinste Stufe. Automatische Reduktion nur über `RasterPolicy`.
