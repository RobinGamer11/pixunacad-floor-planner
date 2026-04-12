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

    const pad = 12;
    const vp = this.root.parentElement!.getBoundingClientRect();
    const boxW = 132;
    const boxH = 56;

    const left = clamp(sx + pad, 8, vp.width - boxW - 8);
    const top = clamp(sy + pad, 8, vp.height - boxH - 8);

    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }

  hide() {
    this.visible = false;
    this.editMode = false;
    this.root.classList.add("hidden");
    this.lenInputEl.readOnly = true;
    this.angInputEl.readOnly = true;
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
