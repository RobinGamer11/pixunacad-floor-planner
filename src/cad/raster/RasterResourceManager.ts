/**
 * Gemeinsames RAM-Budget für Pixelkacheln aller Ebenen/Blätter (LRU).
 *
 * Nur "saubere" Kacheln (kodierte Quelle vorhanden, keine offenen Änderungen,
 * nicht ladend) dürfen verdrängt werden. Verdrängt = Pixelpuffer freigegeben,
 * Quelle bleibt; beim nächsten Bedarf wird nachgeladen. Ein verdrängter Zustand
 * ist NIE "transparent" – Konsumenten erhalten "unbekannt".
 */
import { tileBytes } from "./RasterPolicy";

export interface ResidentTile {
  /** Gibt den Pixelpuffer frei; false = derzeit nicht verdrängbar. */
  evict(): boolean;
  readonly tilePx: number;
}

/** Startprofil: 64 MiB Kachel-Cache. */
export const RASTER_CACHE_BYTES = 64 * 1024 * 1024;

class Manager {
  private lru = new Map<ResidentTile, number>();
  private bytes = 0;
  budget = RASTER_CACHE_BYTES;

  touch(t: ResidentTile) {
    if (this.lru.has(t)) { this.lru.delete(t); this.lru.set(t, 1); return; }
    this.lru.set(t, 1);
    this.bytes += tileBytes(t.tilePx);
    this.trim(t);
  }

  release(t: ResidentTile) {
    if (this.lru.delete(t)) this.bytes -= tileBytes(t.tilePx);
  }

  /** Verdrängt älteste saubere Kacheln, bis das Budget eingehalten ist. */
  trim(keep?: ResidentTile) {
    if (this.bytes <= this.budget) return;
    for (const t of [...this.lru.keys()]) {
      if (this.bytes <= this.budget) break;
      if (t === keep) continue;
      if (t.evict()) this.release(t);
    }
  }

  get usedBytes() { return this.bytes; }
  get residentCount() { return this.lru.size; }
}

export const rasterResources = new Manager();
