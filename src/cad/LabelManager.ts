import { Defaults } from "./constants";
import { clamp } from "./geometry";

export interface LabelGroup {
  id: string;
  name: string;
  locked: boolean;
  visible: boolean;
}

export class LabelManager {
  groups: LabelGroup[] = [
    { id: Defaults.defaultLabelId, name: Defaults.defaultLabelName, locked: true, visible: true }
  ];
  private _counter = 1;

  list(): LabelGroup[] {
    return [...this.groups];
  }

  getById(id: string): LabelGroup | null {
    return this.groups.find(g => g.id === id) || null;
  }

  getIndex(id: string): number {
    return this.groups.findIndex(g => g.id === id);
  }

  isVisible(id: string): boolean {
    const g = this.getById(id);
    return g ? g.visible !== false : true;
  }

  toggleVisible(id: string): boolean {
    const g = this.getById(id);
    if (!g) return false;
    g.visible = !g.visible;
    return g.visible;
  }

  createGroup(): LabelGroup {
    const id = `label-${Date.now()}-${this._counter++}`;
    const name = `ID-${String(this._counter - 1).padStart(2, "0")}`;
    const group: LabelGroup = { id, name, locked: false, visible: true };
    this.groups.unshift(group);
    return group;
  }

  renameGroup(id: string, newName: string): LabelGroup | null {
    const g = this.getById(id);
    if (!g || g.locked) return null;
    const clean = (newName || "").trim();
    if (!clean) return null;
    g.name = clean;
    return g;
  }

  deleteGroup(id: string): boolean {
    const g = this.getById(id);
    if (!g) return false;
    // Mindestens eine Ebene muss erhalten bleiben — auch die Default-Gruppe darf
    // gelöscht werden, sofern noch mindestens eine andere Ebene existiert.
    if (this.groups.length <= 1) return false;
    this.groups = this.groups.filter(x => x.id !== id);
    return true;
  }

  /** Erzeugt (falls noch nicht vorhanden) eine Layer-Gruppe mit explizitem Namen und gibt sie zurück. */
  ensureGroupNamed(name: string): LabelGroup {
    const clean = (name || "").trim();
    if (clean) {
      const existing = this.groups.find(g => g.name === clean);
      if (existing) return existing;
    }
    const id = `label-${Date.now()}-${this._counter++}`;
    const group: LabelGroup = { id, name: clean || `ID-${String(this._counter - 1).padStart(2, "0")}`, locked: false, visible: true };
    this.groups.unshift(group);
    return group;
  }

  moveToIndex(id: string, targetIndex: number): boolean {
    const from = this.getIndex(id);
    if (from < 0) return false;
    const clamped = clamp(targetIndex, 0, this.groups.length - 1);
    if (from === clamped) return false;
    const [item] = this.groups.splice(from, 1);
    this.groups.splice(clamped, 0, item);
    return true;
  }

  restore(groups: LabelGroup[]) {
    if (!Array.isArray(groups) || groups.length === 0) return;
    this.groups = groups.map(g => ({ ...g }));
  }
}
