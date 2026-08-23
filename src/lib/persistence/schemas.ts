/**
 * Registrierung aller Persistenz-Schemata (zentral, oberflächenübergreifend).
 *
 * Alle Migrationen sind additiv und verhaltensneutral: sie ergänzen nur
 * Felder, die in älteren Datenständen fehlten, und zwar mit genau dem Wert,
 * der das bisherige sichtbare Ergebnis reproduziert. Es wird niemals
 * bestehende Geometrie neu berechnet (Schraffuren/Füllkonturen, Textlayout,
 * Tabellenlayout, Dokumentpositionen, Maßstäbe bleiben unangetastet).
 */
import { defineSchema, migrateData } from "./schema";

/* ------------------------------------------------------------------ Helpers */

const isObj = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Setzt `key` nur, wenn er fehlt (undefined/null). Mutiert `o`. */
function fill(o: Record<string, any>, key: string, value: unknown) {
  if (o[key] === undefined || o[key] === null) o[key] = value;
}

function mapArray(o: Record<string, any>, key: string, fn: (item: any) => void) {
  const arr = o[key];
  if (!Array.isArray(arr)) return;
  for (const item of arr) if (isObj(item)) fn(item);
}

/* ------------------------------------------------- Szenen-Objektmigrationen */

/**
 * Hebt eine einzelne Szene (CAD-Blatt, Druckplan oder Mappe-Viewport) auf das
 * aktuelle Objektmodell. Rein additiv – Legacy-Objekte sehen danach identisch
 * aus, verfügen aber über alle neuen Felder.
 */
export function migrateSceneData<T>(scene: T): T {
  if (!isObj(scene)) return scene;

  mapArray(scene, "segments", (s) => {
    fill(s, "bulge", 0);              // vor v2 gab es keine Kanten-Wölbung
    fill(s, "arrowStart", false);
    fill(s, "arrowEnd", false);
    fill(s, "arrowScale", 1);
    fill(s, "isGuide", false);
  });

  mapArray(scene, "freeStrokes", (s) => {
    fill(s, "opacity", 1);
  });

  mapArray(scene, "hatches", (h) => {
    fill(h, "holes", []);
    fill(h, "patternEnabled", false); // Legacy-Schraffuren waren musterlos
    // bulges/holeBulges bewusst NICHT gefüllt: fehlende Werte bedeuten
    // "gerade Kanten" und werden vom Renderer bereits so behandelt. Eine
    // bestehende Füllkontur wird nie neu berechnet.
  });

  mapArray(scene, "walls", (w) => {
    fill(w, "kind", "outer");
    fill(w, "referenceSide", "outer");
    fill(w, "hiddenCornerIndices", []);
    fill(w, "corners", []);
  });

  mapArray(scene, "dimensions", (d) => {
    fill(d, "mirror", false);         // "Spiegeln" kam erst später dazu
    fill(d, "bulge", 0);              // Arc-Modus kam erst später dazu
  });

  mapArray(scene, "textBoxes", (t) => {
    fill(t, "rotationRad", 0);
    fill(t, "style", {});
  });

  mapArray(scene, "documents", (d) => {
    fill(d, "rotationRad", 0);
    fill(d, "opacity", 1);
    fill(d, "flipX", false);
    fill(d, "flipY", false);
    fill(d, "filters", []);
  });

  mapArray(scene, "stickerInstances", (s) => {
    fill(s, "rotationRad", 0);
    fill(s, "scale", 1);
  });

  mapArray(scene, "tables", (t) => {
    fill(t, "rotationRad", 0);
    fill(t, "scale", 1);
  });

  mapArray(scene, "doors", (d) => {
    fill(d, "breakHeightVisible", false);
  });

  return scene;
}

/* ---------------------------------------------------------- CAD-Gesamtstand */

export const CAD_SNAPSHOT_KIND = "cad-snapshot";

defineSchema({
  kind: CAD_SNAPSHOT_KIND,
  current: 2,
  steps: [
    {
      // v1: Grundstruktur sicherstellen (Multi-Sheet, Druckpläne, Raster).
      to: 1,
      up: (data: any) => {
        if (!isObj(data)) return data;
        fill(data, "labels", []);
        fill(data, "stickers", []);
        fill(data, "sheets", []);
        fill(data, "scenesById", {});
        fill(data, "plans", []);
        fill(data, "planScenesById", {});
        fill(data, "rasterLayersByKey", {});
        return data;
      },
    },
    {
      // v2: Objektmodell aller enthaltenen Szenen anheben.
      to: 2,
      up: (data: any) => {
        if (!isObj(data)) return data;
        migrateSceneData(data); // flach gespeicherte aktive Szene
        for (const bucket of ["scenesById", "planScenesById"]) {
          const map = data[bucket];
          if (!isObj(map)) continue;
          for (const key of Object.keys(map)) migrateSceneData(map[key]);
        }
        return data;
      },
    },
  ],
});

export function migrateCadSnapshot<T>(data: T): T {
  return migrateData(CAD_SNAPSHOT_KIND, data);
}

/* ------------------------------------------------------------ Projektmappe */

/**
 * Hebt eine Liste von Mappe-/Vorlagenseiten auf das aktuelle Objektmodell.
 * Wird sowohl von der Projekt-Migration als auch von Bestandsdaten ohne
 * Versionsfeld genutzt (z. B. gespeicherte Finanz-Mustervorlagen, die als
 * reines Seiten-Array in localStorage liegen und deshalb keinen
 * Versionsstempel tragen können). Rein additiv und idempotent: Positionen,
 * Größen, Inhalte, Farben, Schriftformatierungen und Tabellenwerte bleiben
 * unverändert, es werden nur fehlende Felder rückwärtskompatibel ergänzt.
 */
export function migrateProjectPages<T>(pages: T): T {
  if (!Array.isArray(pages)) return pages;
  for (const pg of pages) {
    if (!isObj(pg)) continue;
    mapArray(pg, "elements", (el) => {
      fill(el, "rotation", 0);
      if (el.kind === "table") fill(el, "scale", 1);
    });
  }
  return pages;
}


export const PROJECT_STATE_KIND = "project-state";

defineSchema({
  kind: PROJECT_STATE_KIND,
  current: 2,
  steps: [
    {
      // v1: Grundstruktur des Gesamtstandes.
      to: 1,
      up: (state: any) => {
        if (!isObj(state)) return state;
        fill(state, "projects", []);
        fill(state, "folders", []);
        return state;
      },
    },
    {
      // v2: Objektmodell der Seitenelemente und CAD-Blatt-Szenen anheben.
      to: 2,
      up: (state: any) => {
        if (!isObj(state) || !Array.isArray(state.projects)) return state;
        for (const p of state.projects) {
          if (!isObj(p)) continue;
          migrateProjectPages(p.pages);
          // Sheet-Szenen liegen als JSON-String vor → migrieren und
          // unverändert zurückschreiben (nur ergänzte Felder).
          mapArray(p, "sheets", (s) => {
            if (typeof s.sceneJson !== "string" || !s.sceneJson) return;
            try {
              s.sceneJson = JSON.stringify(migrateSceneData(JSON.parse(s.sceneJson)));
            } catch { /* defekte Szene unangetastet lassen */ }
          });
        }
        return state;
      },
    },

  ],
});

export function migrateProjectState<T>(state: T): T {
  return migrateData(PROJECT_STATE_KIND, state);
}

/* ---------------------------------------------------------------- Finanzen */

export const FINANCE_KIND = "finance-state";

defineSchema({
  kind: FINANCE_KIND,
  current: 1,
  steps: [
    {
      to: 1,
      up: (s: any) => {
        if (!isObj(s)) return s;
        fill(s, "nodes", []);
        fill(s, "positions", []);
        fill(s, "projectEstimate", 0);
        fill(s, "projectNote", "");
        mapArray(s, "nodes", (n) => { if (n.enabled === undefined) n.enabled = true; });
        mapArray(s, "positions", (p) => { fill(p, "note", ""); fill(p, "amount", 0); });
        return s;
      },
    },
  ],
});

export function migrateFinanceState<T>(s: T): T {
  return migrateData(FINANCE_KIND, s);
}

/* ------------------------------------------------------------ CAD-Tabellen */

export const CAD_TABLES_KIND = "cad-tables";

defineSchema({
  kind: CAD_TABLES_KIND,
  current: 1,
  steps: [
    {
      to: 1,
      up: (store: any) => {
        if (!isObj(store)) return store;
        for (const key of Object.keys(store)) {
          const list = store[key];
          if (!Array.isArray(list)) continue;
          for (const el of list) {
            if (!isObj(el)) continue;
            fill(el, "rotation", 0);
            fill(el, "scale", 1);
          }
        }
        return store;
      },
    },
  ],
});

export function migrateCadTables<T>(s: T): T {
  return migrateData(CAD_TABLES_KIND, s);
}
