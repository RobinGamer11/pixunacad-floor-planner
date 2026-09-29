import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Scene } from "./Scene";
import { Camera } from "./Camera";
import { LabelManager } from "./LabelManager";
import { TopologyEngine } from "./TopologyEngine";
import { PlanController } from "./PlanController";
import { PlanManager } from "./PlanManager";
import { v } from "./geometry";
import { SpreadHandles } from "@/components/export/SpreadHandles";

/** Minimale App-Attrappe für die Verbund-Bedienung (nur Anzeige-Logik). */
function makeApp(editing: boolean) {
  const pm = new PlanManager();
  const a = pm.createPlan({ formatKey: "a4" });
  const b = pm.createPlan({ formatKey: "a4" });
  pm.linkSpread(a.id, b.id);
  pm.setSpreadLayoutMode(pm.getById(a.id)!.spreadId!, "free");
  const camera = new Camera();
  camera.scale = 100; camera.offsetX = 400; camera.offsetY = 400;
  const canvas = document.createElement("canvas");
  const selectTool = {};
  const rects = pm.spreadRects(pm.getById(a.id)!.spreadId!);
  const rb = rects.find(r => r.id === b.id)!;
  const app: any = {
    planManager: pm,
    activePlanId: a.id,
    camera,
    canvas,
    selectTool,
    activeTool: selectTool,
    spreadLayoutEditing: editing,
    setActivePlanId: () => {},
    cancelSpreadPreview: () => {},
    previewSpreadPage: () => {},
    commitSpreadPage: () => {},
    renderer: {
      planMode: {
        widthMm: 210, heightMm: 297, marginsMm: 10, holePattern: "none", holePunchSide: "left",
        spreadNeighbors: [{ id: b.id, name: b.name, dxMm: rb.x, dyMm: rb.y, widthMm: 210, heightMm: 297, marginsMm: 10, holePattern: "none", holePunchSide: "left" }],
      },
    },
  };
  return { app, a, b };
}

describe("Export: Seitenanordnung", () => {
  it("fixiert: keine Eckpunkte und keine Verschiebe-Bedienung", () => {
    const { app } = makeApp(false);
    render(<SpreadHandles app={app} />);
    expect(screen.queryAllByTitle("Aktive Seite verschieben")).toHaveLength(0);
  });

  it("Anordnungsmodus: genau vier Eckpunkte, nur an der aktiven Seite", () => {
    const { app, a, b } = makeApp(true);
    render(<SpreadHandles app={app} />);
    const handles = screen.getAllByTitle("Aktive Seite verschieben");
    expect(handles).toHaveLength(4);
    const active = app.planManager.getById(a.id)!;
    for (const h of handles) {
      expect(h.getAttribute("aria-label")).toContain(active.name);
      expect(h.getAttribute("aria-label")).not.toContain(app.planManager.getById(b.id)!.name);
    }
  });
});

describe("Export: Zeiger auf der Papierfläche", () => {
  function ctl() {
    const canvas = document.createElement("canvas");
    const c = Object.create(PlanController.prototype) as PlanController;
    (c as any).app = { canvas };
    (c as any)._cursorOwned = false;
    return { c, canvas };
  }

  it("setzt den Zeiger zurück, sobald keine Kante/Ecke mehr berührt wird", () => {
    const { c, canvas } = ctl();
    c._setCursor("ew-resize");
    expect(canvas.style.cursor).toBe("ew-resize");
    c._setCursor(null);
    expect(canvas.style.cursor).toBe("default");
  });

  it("überschreibt den Zeiger anderer CAD-Werkzeuge nicht", () => {
    const { c, canvas } = ctl();
    canvas.style.cursor = "crosshair";
    c._setCursor(null);
    expect(canvas.style.cursor).toBe("crosshair");
  });
});

describe("Export: Transparenzpause als schreibgeschützte Fangquelle", () => {
  function setup() {
    const scene = new Scene();
    const camera = new Camera();
    camera.scale = 100; camera.offsetX = 500; camera.offsetY = 500;
    const labels = new LabelManager();
    const topo = new TopologyEngine(scene, camera, labels);
    const bg = new Scene();
    bg.createSegment(v(1, 1), v(3, 1));
    return { scene, camera, topo, bg };
  }

  it("Endpunkte und Kanten der sichtbaren Hintergrundseite werden gefangen", () => {
    const { camera, topo, bg, scene } = setup();
    topo.tracingSnapScenes = [bg];
    const end = camera.worldToScreen(1, 1);
    const snapEnd = topo.findBestSnap(end, { x: 1, y: 1 });
    expect(snapEnd).toBeTruthy();
    const mid = camera.worldToScreen(2, 1);
    const snapMid = topo.findBestSnap(mid, { x: 2, y: 1 });
    expect(snapMid).toBeTruthy();
    // Schreibgeschützt: keine Kopie in der aktiven Scene, kein editierbares Objekt.
    expect(scene.segments).toHaveLength(0);
    expect(snapEnd!.segment).toBeNull();
    expect(snapMid!.segment).toBeNull();
  });

  it("ohne sichtbare Transparenzpause gibt es keine Fangpunkte", () => {
    const { camera, topo } = setup();
    topo.tracingSnapScenes = [];
    expect(topo.findBestSnap(camera.worldToScreen(1, 1), { x: 1, y: 1 })).toBeNull();
  });
});

describe("Export: Namensschild einer Nachbarseite", () => {
  function setupName(drawing: boolean) {
    const { app, b } = makeApp(false);
    const opened: string[] = [];
    app.setActivePlanId = (id: string) => opened.push(id);
    if (drawing) app.activeTool = {}; // beliebiges Zeichenwerkzeug
    render(<SpreadHandles app={app} />);
    const tag = screen.getByText(app.planManager.getById(b.id)!.name);
    return { tag, opened, b };
  }

  it("wechselt mit dem Auswahlwerkzeug zur Nachbarseite", () => {
    const { tag, opened, b } = setupName(false);
    fireEvent.pointerDown(tag);
    fireEvent.pointerUp(tag);
    fireEvent.click(tag);
    expect(opened).toEqual([b.id]);
  });

  it("wechselt mit einem Zeichenwerkzeug nicht", () => {
    const { tag, opened } = setupName(true);
    fireEvent.pointerDown(tag);
    fireEvent.pointerUp(tag);
    fireEvent.click(tag);
    expect(opened).toEqual([]);
  });
});

describe("Export: Fangquelle sichtbarer CAD-Ausschnitte", () => {
  it("fängt an transformierten Ausschnittpunkten, ohne Objekte anzubieten", () => {
    const scene = new Scene();
    const camera = new Camera();
    camera.scale = 2000; camera.offsetX = 500; camera.offsetY = 500;
    const topo = new TopologyEngine(scene, camera, new LabelManager());
    topo.tracingSnapGeometry = [{ points: [v(0.5, 0.5)], lines: [[v(0.5, 0.5), v(0.52, 0.5)]] }];
    const snap = topo.findBestSnap(camera.worldToScreen(0.5, 0.5), { x: 0.5, y: 0.5 });
    expect(snap).toBeTruthy();
    expect(snap!.segment).toBeNull();
    expect(snap!.hatch).toBeNull();
    expect(scene.segments).toHaveLength(0);
  });

  it("ohne Fanggeometrie gibt es keine Fangpunkte", () => {
    const scene = new Scene();
    const camera = new Camera();
    camera.scale = 2000; camera.offsetX = 500; camera.offsetY = 500;
    const topo = new TopologyEngine(scene, camera, new LabelManager());
    topo.tracingSnapGeometry = [];
    expect(topo.findBestSnap(camera.worldToScreen(0.5, 0.5), { x: 0.5, y: 0.5 })).toBeNull();
  });
});
