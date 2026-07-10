import { SheetManager, SheetOverlayStore, OverlayMode, OverlayColors } from "./SheetManager";

/**
 * Floating-Panel für Zeichnungs-IDs (Blätter) inkl. Transparentpause.
 * Reine UI-Klasse — Geschäftslogik (aktives Blatt etc.) liegt im Caller via Callbacks.
 */
export interface SheetPanelCallbacks {
  getActiveSheetId: () => string;
  setActiveSheetId: (id: string) => void;
  /** Wird nach JEDER Mutation aufgerufen, damit Caller (CadApp) reagieren kann. */
  onChange: () => void;
}

export class SheetPanel {
  root: HTMLDivElement;
  bodyEl: HTMLDivElement;
  listEl: HTMLDivElement;
  addBtn: HTMLButtonElement;
  toggleBtn: HTMLButtonElement;

  manager: SheetManager;
  overlayStore: SheetOverlayStore;
  cb: SheetPanelCallbacks;

  isCollapsed = false;
  draggingId: string | null = null;
  dropIndex: number | null = null;
  expandedVisibilitySheetId: string | null = null;

  constructor(
    manager: SheetManager,
    overlayStore: SheetOverlayStore,
    root: HTMLDivElement,
    bodyEl: HTMLDivElement,
    listEl: HTMLDivElement,
    addBtn: HTMLButtonElement,
    toggleBtn: HTMLButtonElement,
    cb: SheetPanelCallbacks,
  ) {
    this.manager = manager;
    this.overlayStore = overlayStore;
    this.root = root;
    this.bodyEl = bodyEl;
    this.listEl = listEl;
    this.addBtn = addBtn;
    this.toggleBtn = toggleBtn;
    this.cb = cb;

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
    const created = this.manager.createSheet();
    this.cb.setActiveSheetId(created.id);
    this.cb.onChange();
  }

  private _calcDropIndex(e: DragEvent): number {
    const rows = [...this.listEl.querySelectorAll(".sheet-row")];
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
    if (this.manager.moveToIndex(this.draggingId, index)) {
      this.draggingId = null;
      this.dropIndex = null;
      this.cb.onChange();
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
    const indicators = [...this.listEl.querySelectorAll(".sheet-drop-indicator")];
    indicators.forEach((el, idx) => {
      el.classList.toggle("active", this.dropIndex === idx && this.draggingId != null);
    });
  }

  private _toggleVisibility(sheetId: string) {
    const state = this.overlayStore.get(sheetId);
    if (this.expandedVisibilitySheetId === sheetId || state.mode !== OverlayMode.NONE) {
      this.expandedVisibilitySheetId = null;
      this.overlayStore.setNone(sheetId);
    } else {
      this.expandedVisibilitySheetId = sheetId;
    }
    this.cb.onChange();
  }

  render() {
    const sheets = this.manager.list();
    const activeId = this.cb.getActiveSheetId();
    this.listEl.innerHTML = "";

    const makeIndicator = (index: number) => {
      const ind = document.createElement("div");
      ind.className = "sheet-drop-indicator";
      ind.dataset.index = String(index);
      if (this.dropIndex === index && this.draggingId != null) ind.classList.add("active");
      return ind;
    };

    this.listEl.appendChild(makeIndicator(0));

    sheets.forEach((sheet, index) => {
      const overlayState = this.overlayStore.get(sheet.id);

      const item = document.createElement("div");
      item.className = "sheet-item";

      const row = document.createElement("div");
      row.className = "sheet-row";
      row.dataset.id = sheet.id;
      row.classList.toggle("active", activeId === sheet.id);
      row.draggable = true;

      row.addEventListener("dragstart", (e) => {
        this.draggingId = sheet.id;
        row.classList.add("dragging");
        try {
          // Reorder-Mime
          e.dataTransfer?.setData("text/plain", sheet.id);
          // Plan-Drop-Mime: identifiziert das Blatt für Plan-Projektion
          e.dataTransfer?.setData("application/x-pixuna-sheet", sheet.id);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = "copyMove";
        } catch { /* noop */ }
      });

      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
      });

      const main = document.createElement("div");
      main.className = "sheet-main";
      // Maßstab ist im Modellbereich immer 1:1 — Ausgabemaßstab wird erst
      // beim Einfügen in die Projektmappe gewählt.
      main.innerHTML = `
        <div class="sheet-name">${this._esc(sheet.name)}</div>
        <div class="sheet-sub">Blatt · 1:1</div>
      `;

      main.addEventListener("click", () => {
        this.cb.setActiveSheetId(sheet.id);
      });

      const actions = document.createElement("div");
      actions.className = "sheet-actions";

      const visBtn = document.createElement("button");
      visBtn.className = "sheet-icon-btn icon-only";
      visBtn.title = "Transparentpause";
      visBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 3l18 18"/>
          <path d="M10.58 10.58a2 2 0 102.83 2.83"/>
          <path d="M9.88 5.09A10.94 10.94 0 0112 4.91c5.52 0 9.27 4.5 10 5.48a1 1 0 010 1.22 17.47 17.47 0 01-4.09 3.98"/>
          <path d="M6.61 6.61A17.32 17.32 0 002 11.39a1 1 0 000 1.22c.73.98 4.48 5.48 10 5.48 1.53 0 2.96-.35 4.25-.92"/>
        </svg>
      `;
      if (overlayState.mode !== OverlayMode.NONE || this.expandedVisibilitySheetId === sheet.id) {
        visBtn.classList.add("active");
      }
      visBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._toggleVisibility(sheet.id);
      });

      const editBtn = document.createElement("button");
      editBtn.className = "sheet-icon-btn icon-only";
      editBtn.title = "Umbenennen";
      editBtn.textContent = "✎";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const next = prompt("Blatt umbenennen", sheet.name);
        if (next == null) return;
        this.manager.renameSheet(sheet.id, next);
        this.cb.onChange();
      });

      const isLastSheet = this.manager.list().length <= 1;
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "sheet-icon-btn icon-only";
      deleteBtn.title = isLastSheet ? "Mindestens ein Blatt erforderlich" : "Löschen";
      deleteBtn.textContent = "🗑";
      deleteBtn.disabled = isLastSheet;
      deleteBtn.style.opacity = isLastSheet ? "0.35" : "1";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isLastSheet) return;
        const wasActive = this.cb.getActiveSheetId() === sheet.id;
        if (!this.manager.deleteSheet(sheet.id)) return;
        this.overlayStore.delete(sheet.id);
        if (wasActive) {
          const remaining = this.manager.list();
          if (remaining.length > 0) this.cb.setActiveSheetId(remaining[0].id);
        }
        this.cb.onChange();
      });


      // Maßstab-Auswahl im Modellbereich entfernt — Zeichnungen liegen
      // grundsätzlich 1:1 vor. Der Ausgabemaßstab wird erst beim Ablegen
      // eines Blatts in die Projektmappe / einen Plan abgefragt.


      actions.appendChild(visBtn);
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      row.appendChild(main);
      row.appendChild(actions);
      item.appendChild(row);

      if (this.expandedVisibilitySheetId === sheet.id) {
        const vis = document.createElement("div");
        vis.className = "sheet-visibility-panel";

        const colors = document.createElement("div");
        colors.className = "sheet-visibility-colors";

        const gradientSw = document.createElement("button");
        gradientSw.className = "sheet-swatch gradient";
        gradientSw.title = "Originalfarben";
        if (overlayState.mode === OverlayMode.STAMP) gradientSw.classList.add("active");
        gradientSw.addEventListener("click", (e) => {
          e.stopPropagation();
          this.overlayStore.setStamp(sheet.id);
          this.cb.onChange();
        });
        colors.appendChild(gradientSw);

        for (const col of OverlayColors) {
          const sw = document.createElement("button");
          sw.className = "sheet-swatch";
          sw.style.background = col.hex;
          if (overlayState.mode === OverlayMode.TINT && overlayState.color === col.hex) sw.classList.add("active");
          sw.addEventListener("click", (e) => {
            e.stopPropagation();
            this.overlayStore.setTint(sheet.id, col.hex);
            this.cb.onChange();
          });
          colors.appendChild(sw);
        }
        vis.appendChild(colors);

        const opacityWrap = document.createElement("div");
        opacityWrap.className = "sheet-opacity-wrap";
        const label = document.createElement("div");
        label.className = "sheet-opacity-label";
        label.textContent = "Transparenz";
        const slider = document.createElement("input");
        slider.className = "sheet-opacity-slider";
        slider.type = "range";
        slider.min = "0";
        slider.max = "100";
        slider.step = "1";
        slider.value = String(Math.round((overlayState.opacity ?? 0.72) * 100));
        slider.addEventListener("input", (e) => {
          const val = Number((e.target as HTMLInputElement).value) / 100;
          this.overlayStore.setOpacity(sheet.id, val);
          this.cb.onChange();
        });
        opacityWrap.appendChild(label);
        opacityWrap.appendChild(slider);
        vis.appendChild(opacityWrap);

        item.appendChild(vis);
      }

      this.listEl.appendChild(item);
      this.listEl.appendChild(makeIndicator(index + 1));
    });
  }

  private _esc(str: string): string {
    return String(str)
      .split("&").join("&amp;")
      .split("<").join("&lt;")
      .split(">").join("&gt;")
      .split('"').join("&quot;")
      .split("'").join("&#39;");
  }
}
