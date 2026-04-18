import { clamp } from "./geometry";

export class Camera {
  scale = 80;
  minScale = 0.5;
  maxScale = 4000;
  offsetX = 0;
  offsetY = 0;

  center(rect: { width: number; height: number }) {
    this.offsetX = rect.width / 2;
    this.offsetY = rect.height / 2;
  }

  worldToScreen(wx: number, wy: number) {
    return { x: wx * this.scale + this.offsetX, y: wy * this.scale + this.offsetY };
  }

  screenToWorld(sx: number, sy: number) {
    return { x: (sx - this.offsetX) / this.scale, y: (sy - this.offsetY) / this.scale };
  }

  panBy(dx: number, dy: number) {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  zoomAt(deltaY: number, pivotSx: number, pivotSy: number) {
    const factor = Math.pow(1.0015, -deltaY);
    const newScale = clamp(this.scale * factor, this.minScale, this.maxScale);
    const before = this.screenToWorld(pivotSx, pivotSy);
    this.scale = newScale;
    const after = this.screenToWorld(pivotSx, pivotSy);
    this.offsetX += (after.x - before.x) * this.scale;
    this.offsetY += (after.y - before.y) * this.scale;
  }
}
