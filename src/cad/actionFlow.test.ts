import { describe, it, expect } from "vitest";
import { CadApp } from "./CadApp";

/** Minimaler Verlauf auf Basis der echten CadApp-Methoden, Szene = Zähler-Array. */
function makeApp() {
  const state = { items: [] as number[] };
  const app: any = Object.assign(Object.create(CadApp.prototype), {
    _history: [] as string[], _historyIndex: 0, _historyMax: 21, _lastSnapshot: "",
    _actionDepth: 0, _actionPrevSuspend: false, _actionStartSnapshot: null,
    _isRestoring: false, _destroyed: false, suspendHistory: false, contentRevision: 0,
    input: { mouse: {}, isPanning: false }, selectTool: { isEditing: () => false },
    documentTool: {}, stairTool: { undoStep: () => false }, activeTool: null,
    _rasterTileStore: { prune: () => {} },
    _serializeScene: () => JSON.stringify(state.items),
    _restoreScene: (s: string) => { state.items = JSON.parse(s); },
    _emitHistoryChange: () => {},
  });
  app._lastSnapshot = app._serializeScene();
  app._history = [app._lastSnapshot];
  return { app, state };
}

describe("Gemeinsamer Aktionsablauf", () => {
  it("verschachtelte Teilschritte (Objekt + Rastern) = genau ein Undo-Schritt", () => {
    const { app, state } = makeApp();
    app.runAction(() => {
      state.items.push(1);
      app.commitHistorySnapshot(); // z. B. rasterize – darf keinen Zwischenschritt erzeugen
      state.items.push(2);
    });
    expect(app._history.length).toBe(2);
    app.undo();
    expect(state.items).toEqual([]);
    app.redo();
    expect(state.items).toEqual([1, 2]);
  });

  it("Fehler mitten in der Aktion hinterlässt keine Teiländerung", () => {
    const { app, state } = makeApp();
    app.runAction(() => { state.items.push(1); throw new Error("x"); });
    expect(state.items).toEqual([]);
    expect(app._history.length).toBe(1);
    expect(app.suspendHistory).toBe(false);
  });

  it("unveränderte Geometrie erzeugt keinen leeren Schritt", () => {
    const { app } = makeApp();
    app.runAction(() => {});
    expect(app._history.length).toBe(1);
  });

  it("Werkzeugwechsel-Sicherung schließt offene Aktion und löst suspendHistory", () => {
    const { app, state } = makeApp();
    app.beginAction(); state.items.push(5);
    app.settleHistoryState();
    expect(app.isActionOpen()).toBe(false);
    expect(app.suspendHistory).toBe(false);
    expect(app._history.length).toBe(2);
  });
});

