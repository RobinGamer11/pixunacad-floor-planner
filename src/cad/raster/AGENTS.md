# Raster/Pixel
- Verlauf: Kacheln nur via `RasterTileStore`. Pixel: Grenzen nur `raster/RasterPolicy`, Jobs atomar via `CadApp.commitRasterJob`; Ablehnung = Vektor bleibt.
- Lokaler CAD-Stand: IndexedDB (`raster/localScenePersist.ts`, Format `RASTER_FORMAT`) ist maßgeblich; Pixel nur als Hash-Blobs im Manifest (`raster/rasterManifest.ts`), localStorage nur Vektorstand – höheres Format wird nie geladen/überschrieben.
