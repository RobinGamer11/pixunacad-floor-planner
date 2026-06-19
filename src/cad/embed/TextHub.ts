/**
 * TextHub — kleine Hub-Box für Textboxen (analog zu LineHub für Linien).
 *
 * Eingaben:
 *   • Breite (mm)
 *   • Höhe  (mm)
 *   • Drehung (°)
 *   • Verschiebung X (mm) und Y (mm) — bezogen auf die Seiten-Top-Left.
 *
 * Bedienung: Tab springt zwischen Feldern, Enter committet via Callback.
 */

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

export interface TextHubValues {
  widthMm: number | null;
  heightMm: number | null;
  rotationDeg: number | null;
  xMm: number | null;
  yMm: number | null;
}

export class TextHub {
  root: HTMLDivElement;
  wIn: HTMLInputElement;
  hIn: HTMLInputElement;
  rIn: HTMLInputElement;
  xIn: HTMLInputElement;
  yIn: HTMLInputElement;
  private _inEdit = false;
  private _onCommit: ((v: TextHubValues) => void) | null = null;
  private _keyCleanup: (() => void) | null = null;

  constructor(
    root: HTMLDivElement,
    wIn: HTMLInputElement,
    hIn: HTMLInputElement,
    rIn: HTMLInputElement,
    xIn: HTMLInputElement,
    yIn: HTMLInputElement,
  ) {
    this.root = root;
    this.wIn = wIn; this.hIn = hIn; this.rIn = rIn;
    this.xIn = xIn; this.yIn = yIn;
    const onKey = (e: KeyboardEvent) => {
      if (!this.isVisible()) return;
      if (e.key === "Tab") {
        this.enterEditMode();
        const inputs = [this.wIn, this.hIn, this.rIn, this.xIn, this.yIn];
        const idx = inputs.indexOf(document.activeElement as HTMLInputElement);
        const next = inputs[(idx + 1 + inputs.length) % inputs.length];
        e.preventDefault();
        next?.focus();
        next?.select();
      } else if (e.key === "Enter") {
        e.preventDefault();
        this._commit();
      } else if (e.key === "Escape") {
        this._inEdit = false;
        [this.wIn, this.hIn, this.rIn, this.xIn, this.yIn].forEach((i) => (i.readOnly = true));
        (document.activeElement as HTMLElement)?.blur?.();
      }
    };
    window.addEventListener("keydown", onKey);
    this._keyCleanup = () => window.removeEventListener("keydown", onKey);
  }

  bindCommit(cb: ((v: TextHubValues) => void) | null) { this._onCommit = cb; }

  isVisible() { return !this.root.classList.contains("hidden"); }

  showAt(sx: number, sy: number) {
    this.root.classList.remove("hidden");
    this.root.style.display = "flex";
    const parent = this.root.offsetParent as HTMLElement | null;
    const maxX = parent ? parent.clientWidth - this.root.offsetWidth - 6 : 9999;
    const maxY = parent ? parent.clientHeight - this.root.offsetHeight - 6 : 9999;
    this.root.style.left = `${clamp(sx, 4, Math.max(4, maxX))}px`;
    this.root.style.top = `${clamp(sy, 4, Math.max(4, maxY))}px`;
  }

  hide() {
    this.root.classList.add("hidden");
    this.root.style.display = "";
    this._inEdit = false;
    [this.wIn, this.hIn, this.rIn, this.xIn, this.yIn].forEach((i) => (i.readOnly = true));
  }

  updateDisplay(v: { widthMm: number; heightMm: number; rotationDeg: number; xMm: number; yMm: number }) {
    if (this._inEdit) return;
    this.wIn.value = `${Math.round(v.widthMm * 10) / 10} mm`;
    this.hIn.value = `${Math.round(v.heightMm * 10) / 10} mm`;
    this.rIn.value = `${Math.round(v.rotationDeg * 10) / 10}°`;
    this.xIn.value = `${Math.round(v.xMm * 10) / 10} mm`;
    this.yIn.value = `${Math.round(v.yMm * 10) / 10} mm`;
  }

  enterEditMode() {
    this._inEdit = true;
    [this.wIn, this.hIn, this.rIn, this.xIn, this.yIn].forEach((i) => (i.readOnly = false));
  }

  private _parse(s: string): number | null {
    const t = s.trim().replace(",", ".").replace(/mm|°/gi, "").trim();
    if (!t) return null;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : null;
  }

  private _commit() {
    if (!this._onCommit) return;
    this._onCommit({
      widthMm: this._parse(this.wIn.value),
      heightMm: this._parse(this.hIn.value),
      rotationDeg: this._parse(this.rIn.value),
      xMm: this._parse(this.xIn.value),
      yMm: this._parse(this.yIn.value),
    });
  }

  destroy() { this._keyCleanup?.(); this._keyCleanup = null; }
}
