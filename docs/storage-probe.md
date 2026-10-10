# Speicherprobe Pixelmodus

Gemessen mit `python3 scripts/storage_probe.py` (512-px-RGBA-PNG-Kacheln). Vollflächen ohne Muster: 0 Kacheln (solidFill).

```json
{
 "tile_png_bytes": {
  "skizze_leicht": 3202,
  "skizze_dicht": 12554,
  "schraffur_45": 4624,
  "schraffur_eng": 3792,
  "beton": 11232,
  "daemmung": 5019,
  "farbauftrag": 6881,
  "flaeche_radiert": 8380
 },
 "scenarios": {
  "A_EFH_Skizzen": {
   "tiles": 22,
   "pixel_bytes": 107852,
   "json_bytes": 180000,
   "total_bytes": 287852
  },
  "B_MFH_Muster": {
   "tiles": 106,
   "pixel_bytes": 687405,
   "json_bytes": 450000,
   "total_bytes": 1137405
  },
  "C_Werkplanung_viel_Pixel": {
   "tiles": 330,
   "pixel_bytes": 2221870,
   "json_bytes": 900000,
   "total_bytes": 3121870
  },
  "D_Stress_Pixel": {
   "tiles": 700,
   "pixel_bytes": 6215550,
   "json_bytes": 1000000,
   "total_bytes": 7215550
  }
 }
}
```

Startwerte: Projekt 50.000.000 B, Konto 150.000.000 B, Datei 10 MB, Kachel 2 MB, effektiv global 700 MB.
