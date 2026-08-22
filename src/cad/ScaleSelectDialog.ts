/**
 * Maßstabs-Auswahl für Druckplan-Projektionen.
 *
 * Wird beim Einfügen eines CAD-Blattes auf einen Druckplan und beim
 * nachträglichen Ändern des Maßstabs einer Projektion verwendet.
 *
 * Der gewählte Nenner N bedeutet: 1 m Modell ⇒ (1000 / N) mm Papier.
 * Rückgabe: gewählter Nenner oder null (Abbruch).
 */
import { SCALE_PRESETS, normalizeScaleDen, formatScaleLabel, modelMetersToPaperMm } from "@/lib/scale";

export function askProjectionScale(
  current: number | null,
  opts: { title?: string } = {},
): Promise<number | null> {
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
      "background:#fff;border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.28);padding:18px 20px;min-width:340px;font:13px/1.4 system-ui,sans-serif;color:#1b1f24;";

    const title = document.createElement("div");
    title.textContent = opts.title || "Maßstab der Ansicht";
    title.style.cssText = "font-weight:700;font-size:15px;margin-bottom:4px;";

    const hint = document.createElement("div");
    hint.style.cssText = "color:#5b636d;margin-bottom:12px;";

    const grid = document.createElement("div");
    grid.style.cssText =
      "display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px;";

    const freeRow = document.createElement("div");
    freeRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:14px;";
    const freeLabel = document.createElement("span");
    freeLabel.textContent = "Frei  1 :";
    const freeInput = document.createElement("input");
    freeInput.type = "text";
    freeInput.inputMode = "decimal";
    freeInput.value = String(value);
    freeInput.style.cssText =
      "flex:1;background:#fff;border:1px solid #d6dae0;border-radius:8px;padding:7px 9px;font:13px system-ui,sans-serif;color:#1b1f24;";
    freeRow.append(freeLabel, freeInput);

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;";
    const cancel = document.createElement("button");
    cancel.textContent = "Abbrechen";
    cancel.style.cssText =
      "border:1px solid #d6dae0;background:#fff;border-radius:8px;padding:7px 14px;cursor:pointer;font:13px system-ui,sans-serif;";
    const ok = document.createElement("button");
    ok.textContent = "Übernehmen";
    ok.style.cssText =
      "border:1px solid #caa64a;background:#e6c76a;border-radius:8px;padding:7px 16px;cursor:pointer;font:600 13px system-ui,sans-serif;color:#2a2410;";
    actions.append(cancel, ok);

    const buttons: HTMLButtonElement[] = [];
    const syncUi = () => {
      for (const b of buttons) {
        const den = Number(b.dataset.den);
        const active = Math.abs(den - value) < 1e-9;
        b.style.borderColor = active ? "#caa64a" : "#d6dae0";
        b.style.background = active ? "#f6e7bb" : "#fff";
        b.style.fontWeight = active ? "700" : "400";
      }
      const mm = modelMetersToPaperMm(1, value);
      hint.textContent = `${formatScaleLabel(value)} · 1 m Modell = ${
        Math.round(mm * 1000) / 1000
      } mm Papier`;
    };

    for (const den of SCALE_PRESETS) {
      const b = document.createElement("button");
      b.textContent = formatScaleLabel(den);
      b.dataset.den = String(den);
      b.style.cssText =
        "border:1px solid #d6dae0;background:#fff;border-radius:8px;padding:6px 4px;cursor:pointer;font:13px system-ui,sans-serif;";
      b.addEventListener("click", () => {
        value = den;
        freeInput.value = String(den);
        syncUi();
      });
      buttons.push(b);
      grid.appendChild(b);
    }

    freeInput.addEventListener("input", () => {
      value = normalizeScaleDen(freeInput.value);
      syncUi();
    });

    cancel.addEventListener("click", () => finish(null));
    ok.addEventListener("click", () => finish(normalizeScaleDen(freeInput.value)));

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); finish(null); }
      else if (e.key === "Enter") { e.stopPropagation(); finish(normalizeScaleDen(freeInput.value)); }
    };
    document.addEventListener("keydown", onKey, true);

    box.append(title, hint, grid, freeRow, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    syncUi();
    freeInput.focus();
    freeInput.select();
  });
}
