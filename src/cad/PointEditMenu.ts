import { PointEditAction } from "./constants";
import { clamp } from "./geometry";

export class PointEditMenu {
  root: HTMLDivElement;
  buttonsByAction: Record<string, HTMLButtonElement>;
  actions = [PointEditAction.MOVE, PointEditAction.TRANSLATE, PointEditAction.ROTATE, PointEditAction.DELETE];
  index = -1;
  visible = false;
  private _onActivate: ((action: string) => void) | null = null;

  constructor(root: HTMLDivElement, buttonsByAction: Record<string, HTMLButtonElement>) {
    this.root = root;
    this.buttonsByAction = buttonsByAction;

    for (const action of this.actions) {
      const btn = this.buttonsByAction[action];
      if (!btn) continue;
      btn.addEventListener("click", () => {
        this.index = this.actions.indexOf(action);
        this._sync();
        this._onActivate && this._onActivate(action);
      });
    }
  }

  bindActivate(handler: (action: string) => void) {
    this._onActivate = handler;
  }

  /** Optional: nur diese Actions als Buttons sichtbar (alle anderen werden ausgeblendet). */
  showAt(sx: number, sy: number, allowedActions?: string[]) {
    this.visible = true;
    this.root.classList.remove("hidden");

    // Buttons je nach allowedActions ein-/ausblenden.
    const allow = allowedActions ? new Set(allowedActions) : null;
    for (const action of this.actions) {
      const btn = this.buttonsByAction[action];
      if (!btn) continue;
      const visible = !allow || allow.has(action);
      btn.style.display = visible ? "" : "none";
    }

    const pad = 12;
    const vp = this.root.parentElement!.getBoundingClientRect();
    const boxW = 136;
    const boxH = 36;

    const left = clamp(sx + pad, 8, vp.width - boxW - 8);
    const top = clamp(sy - boxH - 8, 8, vp.height - boxH - 8);

    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this._sync();
  }

  hide() {
    this.visible = false;
    this.index = -1;
    this.root.classList.add("hidden");
    // Alle Buttons wieder einblenden für nächsten Aufruf.
    for (const action of this.actions) {
      const btn = this.buttonsByAction[action];
      if (btn) btn.style.display = "";
    }
    this._sync();
  }

  next() {
    if (this.index < 0) this.index = 0;
    else this.index = (this.index + 1) % this.actions.length;
    this._sync();
  }

  activateCurrent() {
    if (this.index < 0) return;
    const action = this.actions[this.index];
    this._onActivate && this._onActivate(action);
  }

  private _sync() {
    for (const action of this.actions) {
      const btn = this.buttonsByAction[action];
      if (btn) btn.classList.toggle("active", this.index >= 0 && action === this.actions[this.index]);
    }
  }
}
