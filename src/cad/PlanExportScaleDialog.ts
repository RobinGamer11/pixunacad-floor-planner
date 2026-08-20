/**
 * Maßstabs-Dialog für den PDF-Export der Druckpläne.
 *
 * Der gewählte Nenner (1:N) wird exakt auf alle Projektionen der ausgewählten
 * Pläne angewendet: 1 m Modell ⇒ (1000 / N) mm Papier.
 * Rückgabe: gewählter Nenner oder null (Abbruch).
 */

const PRESETS = [1, 5, 10, 20, 25, 50, 100, 200, 500, 1000];

export function askExportScale(current: number | null): Promise<number | null> {
  return new Promise((resolve) => {
    let value = current && current > 0 ? current : 100;
    let done = false;
    const finish = (v: number | null) => {
      if (done) return;
      done = true;
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(v);
    };

    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(15,18,22,.45);display:flex;align-items:center;justify-content:center;";
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) finish(null);
    });

    const box = document.createElement("div");
    box.style.cssText =
      "background:#fff;border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.28);padding:18px 20px;min-width:320px;font:13px/1.4 system-ui,sans-serif;color:#1b1f24;";

    const title = document.createElement("div");
    title.textContent = "Maßstab für PDF-Export";
    title.style.cssText = "font-weight:700;font-size:15px;margin-bottom:4px;";

    const hint = document.createElement("div");
    hint.style.cssText = "font-size:11px;opacity:.7;margin-bottom:12px;";

    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:12px;";

    const freeRow = document.createElement("div");
    freeRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:14px;";
    const freeLabel = document.createElement("span");
    freeLabel.textContent = "Frei  1:";
    freeLabel.style.cssText = "font-size:12px;";
    const freeInput = document.createElement("input");
    freeInput.type = "number";
    freeInput.min = "1";
    freeInput.step = "1";
    freeInput.style.cssText =
      "flex:1;padding:6px 8px;border:1px solid #d6dae0;border-radius:8px;background:#fff;font:13px system-ui;";

    const buttons: HTMLButtonElement[] = [];
    const paint = () => {
      hint.textContent = `1 m Modell ≙ ${(1000 / value).toLocaleString("de-DE", { maximumFractionDigits: 3 })} mm auf dem Papier`;
      buttons.forEach((b) => {
        const on = Number(b.dataset.v) === value;
        b.style.background = on ? "#1b1f24" : "#fff";
        b.style.color = on ? "#fff" : "#1b1f24";
        b.style.borderColor = on ? "#1b1f24" : "#d6dae0";
      });
      if (document.activeElement !== freeInput) freeInput.value = String(value);
    };

    for (const p of PRESETS) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.v = String(p);
      b.textContent = `1:${p}`;
      b.style.cssText =
        "padding:6px 4px;border:1px solid #d6dae0;border-radius:8px;background:#fff;cursor:pointer;font:12px system-ui;";
      b.addEventListener("click", () => { value = p; paint(); });
      buttons.push(b);
      grid.appendChild(b);
    }

    freeInput.addEventListener("input", () => {
      const v = parseFloat(freeInput.value);
      if (isFinite(v) && v > 0) { value = v; paint(); }
    });

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Abbrechen";
    cancel.style.cssText =
      "padding:7px 12px;border:1px solid #d6dae0;border-radius:8px;background:#fff;cursor:pointer;font:12px system-ui;";
    cancel.addEventListener("click", () => finish(null));
    const ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = "PDF erstellen";
    ok.style.cssText =
      "padding:7px 14px;border:1px solid #1b1f24;border-radius:8px;background:#1b1f24;color:#fff;cursor:pointer;font:12px system-ui;font-weight:600;";
    ok.addEventListener("click", () => finish(value));

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); finish(null); }
      else if (e.key === "Enter") { e.stopPropagation(); finish(value); }
    };
    document.addEventListener("keydown", onKey, true);

    freeRow.append(freeLabel, freeInput);
    actions.append(cancel, ok);
    box.append(title, hint, grid, freeRow, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    paint();
  });
}
