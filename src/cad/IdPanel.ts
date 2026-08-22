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

  /** Hilfe-Modus aktiv? Dann Symbol-Erklärungen im Panel einblenden. */
  private _helpOn(): boolean {
    try { return (this.app as any).helpOn !== false && !!(this.app as any).helpOn; } catch { return false; }
  }

  render() {
    const groups = this.app.labelManager.list();
    this.listEl.innerHTML = "";

    // Ebenen-Button im Kopf: Icon + Anzahl, Klick klappt das Panel auf/zu.
    try {
      const titleEl = this.root.querySelector(".id-title") as HTMLElement | null;
      if (titleEl) {
        titleEl.textContent = `▤ Bezeichnungs-ID (${groups.length})`;
        titleEl.style.cursor = "pointer";
        titleEl.title = "Ebenen-Panel öffnen/schließen";
        if (!(titleEl as any).__pixunaLayerToggle) {
          (titleEl as any).__pixunaLayerToggle = true;
          titleEl.addEventListener("click", () => this._toggleCollapse());
        }
      }
    } catch {}

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
      // Bilder/PDFs zählen genauso als Objekte dieser Bezeichnungs-ID.
      let docCount = 0;
      try { docCount = this.app.scene.getDocumentsByLabelId?.(group.id).length ?? 0; } catch {}
      // Rasterinhalt (Pixelmodus der Projektmappe) zählt ebenfalls als Objekte.
      let rasterCount = 0;
      try { rasterCount = (this.app as any).rasterLayers?.get?.(group.id)?.strokeCount ?? 0; } catch {}
      let extraCount = 0;
      try { extraCount = (this.app as any).externalLabelCounter?.(group.id) ?? 0; } catch {}
      const count = segCount + hatchCount + dimCount + textCount + freeCount + wallCount + docCount + rasterCount + extraCount;
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
        if (group.editLocked) return;
        // Toggle: erneuter Klick auf die bereits aktive Ebene hebt die Auswahl auf.
        if (this.app.selectedLabelId === group.id) {
          this.app.clearSelection?.();
          this.app.setSelectedLabelId(null);
        } else {
          this.app.selectLabelGroup(group.id);
        }
      });

      const actions = document.createElement("div");
      actions.className = "id-actions";

      const eyeBtn = document.createElement("button");
      eyeBtn.className = "id-icon-btn icon-only eye-btn";
      if (group.visible === false) eyeBtn.classList.add("slash");
      eyeBtn.title = group.visible === false ? "Einblenden" : "Ausblenden";
      eyeBtn.innerHTML = group.visible === false
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
             <path d="M3 3l18 18"/>
             <path d="M10.58 10.58a2 2 0 102.83 2.83"/>
             <path d="M9.88 5.09A10.94 10.94 0 0112 4.91c5.52 0 9.27 4.5 10 5.48a1 1 0 010 1.22 17.47 17.47 0 01-4.09 3.98"/>
             <path d="M6.61 6.61A17.32 17.32 0 002 11.39a1 1 0 000 1.22c.73.98 4.48 5.48 10 5.48 1.53 0 2.96-.35 4.25-.92"/>
           </svg>`
        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
             <path d="M2 12s3.75-5.5 10-5.5S22 12 22 12s-3.75 5.5-10 5.5S2 12 2 12z"/>
             <circle cx="12" cy="12" r="2.5"/>
           </svg>`;
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
      const onlyOne = this.app.labelManager.list().length <= 1;
      deleteBtn.disabled = onlyOne;
      deleteBtn.style.opacity = onlyOne ? "0.35" : "1";
      if (onlyOne) deleteBtn.title = "Mindestens eine Ebene muss existieren";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const groups = this.app.labelManager.list();
        if (groups.length <= 1) return;
        // Fallback-Ebene = erste verbleibende Gruppe (kann z.B. Default oder eine andere sein).
        const fallback = groups.find(g => g.id !== group.id);
        const fallbackId = fallback ? fallback.id : Defaults.defaultLabelId;
        this.app.scene.reassignSegmentsLabel(group.id, fallbackId);
        this.app.scene.reassignHatchesLabel(group.id, fallbackId);
        this.app.scene.reassignDimensionsLabel(group.id, fallbackId);
        this.app.scene.reassignTextBoxesLabel(group.id, fallbackId);
        (this.app.scene as any).reassignTablesLabel?.(group.id, fallbackId);
        this.app.labelManager.deleteGroup(group.id);
        if (this.app.activeDrawLabelId === group.id) {
          this.app.setActiveDrawLabelId(fallbackId);
        }
        if (this.app.selectedLabelId === group.id) {
          this.app.setSelectedLabelId(null);
        }
        this.app.refreshLabelUI();
      });


      const lockBtn = document.createElement("button");
      lockBtn.className = "id-icon-btn icon-only";
      lockBtn.title = group.editLocked
        ? "Ebene entsperren (Auswahl, Verschieben, Löschen, Radieren wieder erlaubt)"
        : "Ebene sperren (Auswahl, Verschieben, Löschen, Radieren gesperrt — Fangpunkte bleiben nutzbar)";
      lockBtn.textContent = group.editLocked ? "🔒" : "🔓";
      lockBtn.style.opacity = group.editLocked ? "1" : "0.55";
      lockBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const nowLocked = this.app.labelManager.toggleEditLocked(group.id);
        if (nowLocked) {
          // Aktive Auswahl und Zeichenebene dürfen nicht auf einer gesperrten Ebene bleiben.
          try { this.app.clearSelection?.(); } catch {}
          if (this.app.selectedLabelId === group.id) this.app.setSelectedLabelId(null);
          if (this.app.activeDrawLabelId === group.id) {
            const free = this.app.labelManager.list().find((g) => !g.editLocked && g.visible !== false);
            if (free) this.app.setActiveDrawLabelId(free.id);
          }
        }
        this.app.refreshLabelUI();
        try { (this.app as any).persistLabels?.(); } catch {}
      });

      actions.appendChild(lockBtn);
      actions.appendChild(eyeBtn);
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      if (group.editLocked) {
        row.style.opacity = "0.75";
        const hint = document.createElement("div");
        hint.className = "id-count";
        hint.textContent = "gesperrt — nur Fang-Referenz";
        main.appendChild(hint);
      }

      row.appendChild(main);
      row.appendChild(actions);
      this.listEl.appendChild(row);
      this.listEl.appendChild(makeIndicator(index + 1));
    });

    if (this._helpOn()) {
      const legend = document.createElement("div");
      legend.className = "id-count";
      legend.style.padding = "6px 8px";
      legend.style.lineHeight = "1.5";
      legend.innerHTML = "\uD83D\uDD12 Sperren · \uD83D\uDC41 Ein-/Ausblenden · \u270E Umbenennen · \uD83D\uDDD1 L\u00f6schen";
      this.listEl.appendChild(legend);
    }
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
