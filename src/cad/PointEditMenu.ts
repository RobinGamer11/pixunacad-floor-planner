import { PointEditAction } from "./constants";
import { clamp } from "./geometry";
import { makeHubDraggable, resetHubUserMoved, hubWasUserMoved } from "./hubDrag";

export class PointEditMenu {
  root: HTMLDivElement;
  buttonsByAction: Record<string, HTMLButtonElement>;
  actions = [PointEditAction.MOVE, PointEditAction.TRANSLATE, PointEditAction.ROTATE, PointEditAction.OFFSET, PointEditAction.INSERT_POINT, PointEditAction.RESIZE, PointEditAction.DUPLICATE, PointEditAction.DELETE];
  private visibleActions: string[] = [];
  index = -1;
  visible = false;
  private _onActivate: ((action: string) => void) | null = null;
  private _dragCleanup: (() => void) | null = null;

  constructor(root: HTMLDivElement, buttonsByAction: Record<string, HTMLButtonElement>) {
    this.root = root;
    this.buttonsByAction = buttonsByAction;
    this._dragCleanup = makeHubDraggable(root, { positionMode: "absolute" });

    for (const action of this.actions) {
      const btn = this.buttonsByAction[action];
      if (!btn) continue;
      btn.addEventListener("click", () => {
        const nextIndex = this.visibleActions.indexOf(action);
        if (nextIndex < 0) return;
        this.index = nextIndex;
        this._sync();
        try { (window as any).__pixunaSkipFirstDraw = true; } catch {}
        this._onActivate && this._onActivate(action);
      });
    }
  }

  bindActivate(handler: (action: string) => void) {
    this._onActivate = handler;
  }

  /** Optional: nur diese Actions als Buttons sichtbar (alle anderen werden ausgeblendet). */
  showAt(sx: number, sy: number, allowedActions?: string[], opts?: { align?: "default" | "centerAbove" }) {
    const wasVisible = this.visible;
    this.visible = true;
    this.root.classList.remove("hidden");
    // Layout horizontal (Buttons nebeneinander).
    this.root.style.display = "flex";
    this.root.style.flexDirection = "row";
    this.root.style.alignItems = "center";

    // Buttons je nach allowedActions ein-/ausblenden.
    const allow = allowedActions ? new Set(allowedActions) : null;
    const selectedAction = this.index >= 0 ? this.visibleActions[this.index] : null;
    this.visibleActions = this.actions.filter((action) => {
      const btn = this.buttonsByAction[action];
      return !!btn && (!allow || allow.has(action));
    });
    this.index = selectedAction ? this.visibleActions.indexOf(selectedAction) : -1;
    for (const action of this.actions) {
      const btn = this.buttonsByAction[action];
      if (!btn) continue;
      const visible = !allow || allow.has(action);
      btn.style.display = visible ? "" : "none";
    }
    this._sync();

    // Wenn der User die Box bereits manuell verschoben hat und wir nur
    // re-positionieren würden (gleiche Selektion), Position respektieren.
    if (wasVisible && hubWasUserMoved(this.root)) return;

    // Clamp gegen die nächste tatsächlich gemessene Viewport-Box.
    // parentElement ist im Embed-Layout ein 0×0-Wrapper, daher Fallback.
    let vpW = window.innerWidth;
    let vpH = window.innerHeight;
    const p = this.root.parentElement;
    if (p) {
      const r = p.getBoundingClientRect();
      if (r.width > 0) vpW = r.width;
      if (r.height > 0) vpH = r.height;
      let node: HTMLElement | null = p;
      while (node && (node.getBoundingClientRect().width < 50 || node.getBoundingClientRect().height < 50)) {
        node = node.parentElement;
        if (node) {
          const rr = node.getBoundingClientRect();
          if (rr.width > 50) vpW = rr.width;
          if (rr.height > 50) vpH = rr.height;
        }
      }
    }

    const boxW = 200;
    const boxH = 36;

    let left: number;
    let top: number;
    if (opts?.align === "centerAbove") {
      left = clamp(sx - boxW / 2, 8, Math.max(8, vpW - boxW - 8));
      top = clamp(sy - boxH - 12, 8, Math.max(8, vpH - boxH - 8));
    } else {
      left = clamp(sx + 12, 8, Math.max(8, vpW - boxW - 8));
      top = clamp(sy - boxH - 8, 8, Math.max(8, vpH - boxH - 8));
    }

    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }

  hide() {
    this.visible = false;
    this.index = -1;
    this.visibleActions = [];
    this.root.classList.add("hidden");
    this.root.style.display = "";
    resetHubUserMoved(this.root);
    try { (window as any).__pixunaSkipFirstDraw = false; } catch {}
    // Alle Buttons wieder einblenden für nächsten Aufruf.
    for (const action of this.actions) {
      const btn = this.buttonsByAction[action];
      if (btn) btn.style.display = "";
    }
    this._sync();
  }

  next() {
    if (this.visibleActions.length === 0) return;
    if (this.index < 0) this.index = 0;
    else this.index = (this.index + 1) % this.visibleActions.length;
    this._sync();
  }

  activateCurrent() {
    if (this.index < 0) return;
    const action = this.visibleActions[this.index];
    if (!action) return;
    this._onActivate && this._onActivate(action);
  }

  private _sync() {
    const activeAction = this.index >= 0 ? this.visibleActions[this.index] : null;
    for (const action of this.actions) {
      const btn = this.buttonsByAction[action];
      if (btn) btn.classList.toggle("active", action === activeAction);
    }
  }
}
