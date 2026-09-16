/**
 * Schreibgeschützte Fangquelle für platzierte Bibliotheksinstanzen.
 *
 * Eine Instanz wird — exakt wie beim Rendern — über `transformSnapshots` in
 * WELT-Geometrie aufgelöst und in eine transiente Szene geschrieben. Dadurch
 * können alle Werkzeuge die innere Geometrie eines Bibliotheksobjekts über die
 * gemeinsame Fanglogik fangen, ohne dass Sonderfälle pro Werkzeug entstehen.
 *
 * Die transienten Szenen sind ausschließlich Fang-/Konturquelle. Sie werden
 * nie bearbeitet, nie gespeichert und nie ausgewählt — das Bibliotheksobjekt
 * bleibt ein Container.
 */
import type { Scene } from "../Scene";
import { Scene as SceneClass } from "../Scene";
import { createObjectsFromSnapshots, transformSnapshots } from "./libraryGeometry";
import type { LibraryDefinition } from "./types";

export interface LibrarySnapScene {
  instanceId: string;
  labelId: string;
  scene: Scene;
}

export class LibrarySnapSource {
  /** Projektweite Definitionen (von CadApp gesetzt). */
  definitions: (() => LibraryDefinition[]) | null = null;
  private _cache = new Map<string, { sig: string; entry: LibrarySnapScene }>();

  private _definition(id: string): LibraryDefinition | null {
    return (this.definitions?.() || []).find((d) => d.id === id) || null;
  }

  private _resolve(inst: any): LibrarySnapScene | null {
    const def = this._definition(inst.definitionId);
    if (!def) return null;
    const sig = [
      def.id, def.version, def.updatedAt, inst.position.x, inst.position.y,
      inst.rotationRad, inst.scaleX, inst.scaleY, inst.labelId,
    ].join("|");
    const hit = this._cache.get(inst.id);
    if (hit && hit.sig === sig) return hit.entry;
    const snaps = transformSnapshots(def.geometry, {
      position: { x: inst.position.x, y: inst.position.y },
      rotationRad: inst.rotationRad,
      scaleX: inst.scaleX,
      scaleY: inst.scaleY,
    });
    const scene = new SceneClass();
    createObjectsFromSnapshots(scene, snaps, inst.labelId);
    const entry: LibrarySnapScene = { instanceId: inst.id, labelId: inst.labelId, scene };
    this._cache.set(inst.id, { sig, entry });
    return entry;
  }

  /**
   * Alle fangbaren Bibliotheks-Weltszenen einer Szene.
   * `excludeIds` schließt z. B. die aktuell transformierte Instanz aus, damit
   * sie nicht an ihre eigenen Fangpunkte zurückschnappt.
   */
  scenesFor(
    scene: Scene,
    isVisible: (labelId: string) => boolean,
    excludeIds?: ReadonlySet<string>,
  ): LibrarySnapScene[] {
    const list: any[] = (scene as any).libraryInstances || [];
    if (list.length === 0) return [];
    const out: LibrarySnapScene[] = [];
    const live = new Set<string>();
    for (const inst of list) {
      live.add(inst.id);
      if (excludeIds?.has(inst.id)) continue;
      if (!isVisible(inst.labelId)) continue;
      const res = this._resolve(inst);
      if (res) out.push(res);
    }
    if (this._cache.size > 400) {
      for (const k of [...this._cache.keys()]) if (!live.has(k)) this._cache.delete(k);
    }
    return out;
  }

  clear() { this._cache.clear(); }
}
