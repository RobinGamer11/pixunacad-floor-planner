// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { PropertyEditSession, installPropertyEditListeners } from "./propertyEdit";
import { mirrorProxy } from "./multiEdit";

/** Minimaler Verlauf nach dem Muster von CadApp.beginAction/commitAction/cancelAction. */
function makeHost(objs: any[]) {
  const history: string[] = [JSON.stringify(objs)];
  let start: string | null = null;
  return {
    history,
    beginAction() { start = JSON.stringify(objs); },
    commitAction() { start = null; history.push(JSON.stringify(objs)); },
    cancelAction() {
      if (start) { const prev = JSON.parse(start); objs.forEach((o, i) => Object.assign(o, prev[i])); }
      start = null;
    },
    undo() { history.pop(); const prev = JSON.parse(history[history.length - 1]); objs.forEach((o, i) => Object.assign(o, prev[i])); },
  };
}

describe("Eigenschafts-Transaktion bei Mehrfachauswahl", () => {
  it("kontinuierlicher Farbwechsel auf mehreren Linien = genau ein Undo", () => {
    const a: any = { id: "a", color: "#000", thicknessM: 0.01 };
    const b: any = { id: "b", color: "#111", thicknessM: 0.05 };
    const host = makeHost([a, b]);
    const s = new PropertyEditSession(host);
    const p = mirrorProxy(a, [b]);
    for (const c of ["#100", "#200", "#f00"]) s.update("color", () => { p.color = c; });
    s.commit("color");
    expect([a.color, b.color]).toEqual(["#f00", "#f00"]);
    expect(b.thicknessM).toBe(0.05);
    expect(host.history.length).toBe(2);
    host.undo();
    expect([a.color, b.color]).toEqual(["#000", "#111"]);
  });

  it("Aufrauen auf Polygonen gemeinsam, Escape stellt alles ohne Undo-Schritt wieder her", () => {
    const a: any = { id: "a", isPolygon: true, roughen: { enabled: false }, points: [{ x: 0, y: 0 }] };
    const b: any = { id: "b", isPolygon: true, roughen: { enabled: false }, points: [{ x: 5, y: 5 }] };
    const host = makeHost([a, b]);
    const s = new PropertyEditSession(host);
    s.update("r", () => { for (const o of [a, b]) o.roughen = { ...o.roughen, enabled: true, strengthMm: 4 }; });
    expect(b.roughen.strengthMm).toBe(4);
    expect(b.points).toEqual([{ x: 5, y: 5 }]);
    s.cancel();
    expect([a.roughen.enabled, b.roughen.enabled]).toEqual([false, false]);
    expect(host.history.length).toBe(1);
  });

  it("Regler im DOM: pointerdown → viele input → pointerup ergibt einen Schritt; Escape verwirft", () => {
    const obj: any = { thicknessM: 0.1 };
    const host = makeHost([obj]);
    const s = new PropertyEditSession(host);
    const off = installPropertyEditListeners(s);
    const r = document.createElement("input"); r.type = "range"; document.body.appendChild(r);
    r.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    obj.thicknessM = 0.2; obj.thicknessM = 0.3;
    r.dispatchEvent(new Event("pointerup", { bubbles: true }));
    expect(host.history.length).toBe(2);
    r.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    obj.thicknessM = 0.9;
    r.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(obj.thicknessM).toBe(0.3);
    expect(host.history.length).toBe(2);
    off();
  });
});
