/**
 * Kleines DOM-Widget für die "Parallel-Hilfslinie per Rechtsklick"-Funktion.
 *
 * Zeigt ein Inputfeld für den Abstand in Millimetern. Enter / OK ruft den
 * gebundenen Commit-Handler mit dem Wert, ESC oder Cancel schließt ohne Effekt.
 *
 * Die DOM-Elemente werden beim Konstruktor selbst erzeugt und an `mount`
 * angehängt — kein zusätzlicher React-Code notwendig.
 */

import { clamp } from "./geometry";

export class ParallelGuideHub {
  root: HTMLDivElement;
  input: HTMLInputElement;
  okBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
  visible = false;
  private _onCommit: ((mm: number | null) => void) | null = null;
  private _onCancel: (() => void) | null = null;

  constructor(mount: HTMLElement) {
    const root = document.createElement("div");
    root.className = "hidden";
    Object.assign(root.style, {
      position: "absolute",
      display: "none",
      flexDirection: "row",
      alignItems: "center",
      gap: "6px",
      background: "white",
      border: "1px solid hsl(var(--hairline))",
      borderRadius: "6px",
      padding: "6px 8px",
      boxShadow: "0 4px 16px -4px rgba(0,0,0,0.18)",
      zIndex: "60",
      fontFamily: "system-ui, Arial, sans-serif",
      fontSize: "12px",
    } as Partial<CSSStyleDeclaration>);

    const label = document.createElement("span");
    label.textContent = "Abstand";
    label.style.color = "#374151";

    const input = document.createElement("input");
    input.type = "text";
    input.value = "100";
    Object.assign(input.style, {
      width: "72px",
      fontSize: "12px",
      padding: "3px 6px",
      border: "1px solid hsl(var(--hairline))",
      borderRadius: "4px",
      outline: "none",
    } as Partial<CSSStyleDeclaration>);

    const unit = document.createElement("span");
    unit.textContent = "mm";
    unit.style.color = "#6b7280";

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.textContent = "OK";
    Object.assign(okBtn.style, {
      fontSize: "12px",
      padding: "3px 10px",
      border: "1px solid hsl(var(--hairline))",
      borderRadius: "4px",
      background: "#111827",
      color: "white",
      cursor: "pointer",
    } as Partial<CSSStyleDeclaration>);

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "✕";
    Object.assign(cancelBtn.style, {
      fontSize: "12px",
      padding: "3px 8px",
      border: "1px solid hsl(var(--hairline))",
      borderRadius: "4px",
      background: "white",
      color: "#374151",
      cursor: "pointer",
    } as Partial<CSSStyleDeclaration>);

    root.append(label, input, unit, okBtn, cancelBtn);
    mount.appendChild(root);

    this.root = root;
    this.input = input;
    this.okBtn = okBtn;
    this.cancelBtn = cancelBtn;

    const commit = () => {
      if (!this._onCommit) return;
      const v = parseFloat((input.value || "").replace(",", ".").trim());
      this._onCommit(Number.isFinite(v) ? v : null);
    };
    const cancel = () => {
      if (this._onCancel) this._onCancel();
      this.hide();
    };

    okBtn.addEventListener("click", (e) => { e.preventDefault(); commit(); });
    cancelBtn.addEventListener("click", (e) => { e.preventDefault(); cancel(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
  }

  bindCommit(handler: ((mm: number | null) => void) | null) { this._onCommit = handler; }
  bindCancel(handler: (() => void) | null) { this._onCancel = handler; }

  showAt(sx: number, sy: number, defaultMm = 100) {
    this.visible = true;
    this.root.classList.remove("hidden");
    this.root.style.display = "flex";
    this.input.value = String(defaultMm);

    // Viewport-Bounds via nächstem ausreichend großen Parent.
    let vpW = window.innerWidth;
    let vpH = window.innerHeight;
    let node: HTMLElement | null = this.root.parentElement;
    while (node) {
      const r = node.getBoundingClientRect();
      if (r.width > 50 && r.height > 50) { vpW = r.width; vpH = r.height; break; }
      node = node.parentElement;
    }
    const boxW = 260;
    const boxH = 38;
    const left = clamp(sx + 12, 8, Math.max(8, vpW - boxW - 8));
    const top = clamp(sy + 12, 8, Math.max(8, vpH - boxH - 8));
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;

    setTimeout(() => {
      try { this.input.focus(); this.input.select(); } catch {}
    }, 0);
  }

  hide() {
    this.visible = false;
    this.root.classList.add("hidden");
    this.root.style.display = "none";
  }

  destroy() {
    try { this.root.remove(); } catch {}
  }
}
