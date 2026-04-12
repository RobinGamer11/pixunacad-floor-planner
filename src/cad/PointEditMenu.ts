import { PointEditAction } from "./constants";
import { clamp } from "./geometry";

export class PointEditMenu {
  root: HTMLDivElement;
  buttonsByAction: Record<string, HTMLButtonElement>;
  actions = [PointEditAction.MOVE, PointEditAction.TRANSLATE, PointEditAction.ROTATE];
  index = -1;
  visible = false;
  private _onActivate: ((action: string) => void) | null = null;

  constructor(root: HTMLDivElement, buttonsByAction: Record<string, HTMLButtonElement>) {
    this.root = root;
    this.buttonsByAction = buttonsByAction;

    for (const action of this.actions) {
      const btn = this.buttonsByAction[action];
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

  showAt(sx: number, sy: number) {
    this.visible = true;
    this.root.classList.remove("hidden");

    const pad = 12;
    const vp = this.root.parentElement!.getBoundingClientRect();
    const boxW = 104;
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
      this.buttonsByAction[action].classList.toggle("active", this.index >= 0 && action === this.actions[this.index]);
    }
  }
}
