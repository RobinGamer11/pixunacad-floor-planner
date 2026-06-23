import { clamp } from "./geometry";

export class LineHub {
  root: HTMLDivElement;
  lenInputEl: HTMLInputElement;
  angInputEl: HTMLInputElement;
  visible = false;
  editMode = false;
  private _activeIndex = 0;
  private _onCommit: ((vals: { lengthM: number | null; angleDeg: number | null }) => void) | null = null;
  private _cleanups: (() => void)[] = [];
  private _iconEl: HTMLSpanElement | null = null;
  private _compact = false;

  constructor(root: HTMLDivElement, lenInputEl: HTMLInputElement, angInputEl: HTMLInputElement) {
    this.root = root;
    this.lenInputEl = lenInputEl;
    this.angInputEl = angInputEl;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.visible) return;

      if (e.key === "Tab") {
        e.preventDefault();
        if (!this.editMode) {
          this.enterEditMode();
          this._focusActive();
          return;
        }
        this._activeIndex = (this._activeIndex + 1) % 2;
        this._focusActive();
      } else if (e.key === "Enter") {
        const activeIsHub = document.activeElement === this.lenInputEl || document.activeElement === this.angInputEl;
        if (!this.editMode && !activeIsHub) return;
        e.preventDefault();
        this._onCommit && this._onCommit(this.getValues());
      }
    };

    window.addEventListener("keydown", onKeyDown);
    this._cleanups.push(() => window.removeEventListener("keydown", onKeyDown));
  }

  bindCommit(handler: ((vals: { lengthM: number | null; angleDeg: number | null }) => void) | null) {
    this._onCommit = handler;
  }

  showAt(sx: number, sy: number) {
    this.visible = true;
    this.root.classList.remove("hidden");
    this.root.style.display = "flex";
    this.root.style.flexDirection = "row";
    this.root.style.alignItems = "center";

    const pad = 12;
    let vpW = window.innerWidth;
    let vpH = window.innerHeight;
    let node: HTMLElement | null = this.root.parentElement;
    while (node) {
      const r = node.getBoundingClientRect();
      if (r.width > 50 && r.height > 50) { vpW = r.width; vpH = r.height; break; }
      node = node.parentElement;
    }
    const boxW = 132;
    const boxH = 56;

    const left = clamp(sx + pad, 8, Math.max(8, vpW - boxW - 8));
    const top = clamp(sy + pad, 8, Math.max(8, vpH - boxH - 8));

    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }

  hide() {
    this.visible = false;
    this.editMode = false;
    this.root.classList.add("hidden");
    this.root.style.display = "";
    this.lenInputEl.readOnly = true;
    this.angInputEl.readOnly = true;
    // Compact-Mode immer zurücksetzen, damit der nächste Aufrufer wieder normal startet.
    this.setCompact(false);
  }

  /**
   * Kompakt-Modus für Kanten-Offset (Schraffur/Wand-Edge).
   * Blendet das Winkel-Feld aus und zeigt einen kleinen Icon-Präfix.
   */
  setCompact(enabled: boolean, iconText: string = "↔") {
    this._compact = enabled;
    if (enabled) {
      if (!this._iconEl) {
        const span = document.createElement("span");
        span.style.display = "inline-flex";
        span.style.alignItems = "center";
        span.style.justifyContent = "center";
        span.style.width = "22px";
        span.style.height = "22px";
        span.style.border = "1px solid hsl(var(--border, 220 13% 91%))";
        span.style.borderRadius = "4px";
        span.style.background = "white";
        span.style.fontSize = "12px";
        span.style.marginRight = "4px";
        span.style.userSelect = "none";
        this._iconEl = span;
      }
      this._iconEl.textContent = iconText;
      if (this._iconEl.parentElement !== this.root) {
        this.root.insertBefore(this._iconEl, this.root.firstChild);
      }
      this.angInputEl.style.display = "none";
    } else {
      if (this._iconEl && this._iconEl.parentElement === this.root) {
        this.root.removeChild(this._iconEl);
      }
      this.angInputEl.style.display = "";
    }
  }

  updateDisplay(lengthM: number, angleDegValue: number) {
    if (!this.editMode || document.activeElement !== this.lenInputEl) {
      this.lenInputEl.value = `${lengthM.toFixed(3)} m`;
    }
    if (!this.editMode || document.activeElement !== this.angInputEl) {
      this.angInputEl.value = `${angleDegValue.toFixed(1)}°`;
    }
  }

  setValues(lengthM: number, angleDeg: number) {
    this.lenInputEl.value = String(lengthM.toFixed(3));
    this.angInputEl.value = String(angleDeg.toFixed(1));
  }

  enterEditMode() {
    this.editMode = true;
    this.lenInputEl.readOnly = false;
    this.angInputEl.readOnly = false;
  }

  getValues() {
    const lenV = parseFloat((this.lenInputEl.value || "").replace("m", "").replace(",", ".").trim());
    const angV = parseFloat((this.angInputEl.value || "").replace("°", "").replace(",", ".").trim());
    return {
      lengthM: Number.isFinite(lenV) ? lenV : null,
      angleDeg: Number.isFinite(angV) ? angV : null,
    };
  }

  private _focusActive() {
    if (this._activeIndex === 0) {
      this.lenInputEl.focus();
      this.lenInputEl.select();
    } else {
      this.angInputEl.focus();
      this.angInputEl.select();
    }
  }

  destroy() {
    for (const fn of this._cleanups) fn();
    this._cleanups = [];
  }
}
