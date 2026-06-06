import { Defaults } from "./constants";
import { clamp } from "./geometry";
import type { CadApp } from "./CadApp";

export class IdPanel {
  app: CadApp;
  root: HTMLDivElement;
  bodyEl: HTMLDivElement;
  listEl: HTMLDivElement;
  addBtn: HTMLButtonElement;
  toggleBtn: HTMLButtonElement;
  isCollapsed = false;

  draggingId: string | null = null;
  dropIndex: number | null = null;

  constructor(
    app: CadApp,
    root: HTMLDivElement,
    bodyEl: HTMLDivElement,
    listEl: HTMLDivElement,
    addBtn: HTMLButtonElement,
    toggleBtn: HTMLButtonElement
  ) {
    this.app = app;
    this.root = root;
    this.bodyEl = bodyEl;
    this.listEl = listEl;
    this.addBtn = addBtn;
    this.toggleBtn = toggleBtn;

    this.addBtn.addEventListener("click", () => this._handleAdd());
    this.toggleBtn.addEventListener("click", () => this._toggleCollapse());
    this.listEl.addEventListener("dragover", (e) => this._onDragOver(e));
    this.listEl.addEventListener("drop", (e) => this._onDrop(e));
    this.listEl.addEventListener("dragleave", (e) => this._onDragLeave(e));
    this.listEl.addEventListener("dragend", () => this._onDragEnd());
  }

  private _toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    this.root.classList.toggle("collapsed", this.isCollapsed);
    this.bodyEl.classList.toggle("hidden", this.isCollapsed);
  }

  private _handleAdd() {
    const created = this.app.labelManager.createGroup();
    this.app.refreshLabelUI();
    this.app.setActiveDrawLabelId(created.id);
  }

  private _calcDropIndex(e: DragEvent): number {
    const rows = [...this.listEl.querySelectorAll(".id-row")];
    if (rows.length === 0) return 0;
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length;
  }

  private _onDragOver(e: DragEvent) {
    e.preventDefault();
    if (!this.draggingId) return;
    this.dropIndex = this._calcDropIndex(e);
    this._renderDropIndicator();
  }

  private _onDrop(e: DragEvent) {
    e.preventDefault();
    if (!this.draggingId) return;
    const index = this.dropIndex == null ? this._calcDropIndex(e) : this.dropIndex;
    if (this.app.labelManager.moveToIndex(this.draggingId, index)) {
      this.draggingId = null;
      this.dropIndex = null;
      this.app.refreshLabelUI();
    } else {
      this.draggingId = null;
      this.dropIndex = null;
      this.render();
    }
  }

  private _onDragLeave(e: DragEvent) {
    if (!this.listEl.contains(e.relatedTarget as Node)) {
      this.dropIndex = null;
      this._renderDropIndicator();
    }
  }

  private _onDragEnd() {
    this.draggingId = null;
    this.dropIndex = null;
    this.render();
  }

  private _renderDropIndicator() {
    const indicators = [...this.listEl.querySelectorAll(".id-drop-indicator")];
    indicators.forEach((el, idx) => {
      el.classList.toggle("active", this.dropIndex === idx && this.draggingId != null);
    });
  }

  render() {
    const groups = this.app.labelManager.list();
    this.listEl.innerHTML = "";

    const makeIndicator = (index: number) => {
      const ind = document.createElement("div");
      ind.className = "id-drop-indicator";
      ind.dataset.index = String(index);
      if (this.dropIndex === index && this.draggingId != null) ind.classList.add("active");
      return ind;
    };

    this.listEl.appendChild(makeIndicator(0));

    groups.forEach((group, index) => {
      const segCount = this.app.scene.getSegmentsByLabelId(group.id).length;
      const hatchCount = this.app.scene.getHatchesByLabelId(group.id).length;
      const dimCount = this.app.scene.getDimensionsByLabelId(group.id).length;
      const textCount = this.app.scene.getTextBoxesByLabelId(group.id).length;
      const freeCount = this.app.scene.getFreeStrokesByLabelId(group.id).length;
      const wallCount = this.app.scene.getWallsByLabelId(group.id).length;
      const count = segCount + hatchCount + dimCount + textCount + freeCount + wallCount;
      const row = document.createElement("div");
      row.className = "id-row";
      row.dataset.id = group.id;
      row.classList.toggle("active", this.app.selectedLabelId === group.id);
      row.classList.toggle("faded", group.visible === false);
      row.draggable = true;

      row.addEventListener("dragstart", (e) => {
        this.draggingId = group.id;
        row.classList.add("dragging");
        try { e.dataTransfer?.setData("text/plain", group.id); } catch (_) {}
        try { if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; } catch (_) {}
      });

      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
      });

      const main = document.createElement("div");
      main.className = "id-main";
      main.innerHTML = `
        <div class="id-name">${this._escapeHtml(group.name)}</div>
        <div class="id-count">${count} Objekt${count === 1 ? "" : "e"}</div>
      `;
      main.addEventListener("click", () => {
        if (group.visible === false) return;
        this.app.selectLabelGroup(group.id);
      });

      const actions = document.createElement("div");
      actions.className = "id-actions";

      const eyeBtn = document.createElement("button");
      eyeBtn.className = "id-icon-btn icon-only eye-btn";
      if (group.visible === false) eyeBtn.classList.add("slash");
      eyeBtn.title = group.visible === false ? "Einblenden" : "Ausblenden";
      eyeBtn.textContent = "◉";
      eyeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.app.labelManager.toggleVisible(group.id);
        if (this.app.selectedLabelId === group.id && !this.app.labelManager.isVisible(group.id)) {
          this.app.setSelectedLabelId(null);
        }
        const selectedSeg = this.app.getSelectedSegment();
        if (selectedSeg && !this.app.labelManager.isVisible(selectedSeg.labelId)) {
          this.app.clearSelection();
        }
        const selectedHatch = this.app.getSelectedHatch();
        if (selectedHatch && !this.app.labelManager.isVisible(selectedHatch.labelId)) {
          this.app.clearSelection();
        }
        const selectedTextBox = this.app.getSelectedTextBox();
        if (selectedTextBox && !this.app.labelManager.isVisible(selectedTextBox.labelId)) {
          this.app.clearSelection();
        }
        this.app.refreshLabelUI();
      });

      const editBtn = document.createElement("button");
      editBtn.className = "id-icon-btn icon-only";
      editBtn.title = "Umbenennen";
      editBtn.textContent = "✎";
      editBtn.disabled = !!group.locked;
      editBtn.style.opacity = group.locked ? "0.35" : "1";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (group.locked) return;
        const next = prompt("ID umbenennen", group.name);
        if (next == null) return;
        this.app.labelManager.renameGroup(group.id, next);
        this.app.refreshLabelUI();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "id-icon-btn icon-only";
      deleteBtn.title = "Löschen";
      deleteBtn.textContent = "🗑";
      deleteBtn.disabled = !!group.locked;
      deleteBtn.style.opacity = group.locked ? "0.35" : "1";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (group.locked) return;
        this.app.scene.reassignSegmentsLabel(group.id, Defaults.defaultLabelId);
        this.app.scene.reassignHatchesLabel(group.id, Defaults.defaultLabelId);
        this.app.scene.reassignDimensionsLabel(group.id, Defaults.defaultLabelId);
        this.app.scene.reassignTextBoxesLabel(group.id, Defaults.defaultLabelId);
        this.app.labelManager.deleteGroup(group.id);
        if (this.app.activeDrawLabelId === group.id) {
          this.app.setActiveDrawLabelId(Defaults.defaultLabelId);
        }
        if (this.app.selectedLabelId === group.id) {
          this.app.setSelectedLabelId(null);
        }
        this.app.refreshLabelUI();
      });

      actions.appendChild(eyeBtn);
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      row.appendChild(main);
      row.appendChild(actions);
      this.listEl.appendChild(row);
      this.listEl.appendChild(makeIndicator(index + 1));
    });
  }

  private _escapeHtml(str: string): string {
    return String(str)
      .split("&").join("&amp;")
      .split("<").join("&lt;")
      .split(">").join("&gt;")
      .split('"').join("&quot;")
      .split("'").join("&#39;");
  }

  destroy() {
    // cleanup handled by parent
  }
}
