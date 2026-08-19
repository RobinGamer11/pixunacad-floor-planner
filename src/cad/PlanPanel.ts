import { PlanManager, PaperFormats, PlanDefaults, getPlanPaperSize, type Plan } from "./PlanManager";
import { SheetOverlayStore, OverlayMode, OverlayColors } from "./SheetManager";

/**
 * Floating-Panel für Druckpläne.
 * - "+ Plan" → Format-Auswahldialog (A5..A0 / Frei BxL, Hoch-/Querformat)
 * - "PDF Drucken" → Sammelexport ausgewählter Pläne
 * - Zeile pro Plan: Checkbox · Name · Format · Transparentpause · ⋯ Aktionen
 */
export interface PlanPanelCallbacks {
  getActivePlanId: () => string | null;
  setActivePlanId: (id: string | null) => void;
  /** Sammelexport ausgewählter Pläne als ein PDF. */
  printSelected: () => void;
  /** Wird nach JEDER Mutation aufgerufen, damit Caller (CadApp) reagieren kann. */
  onChange: () => void;
}

export class PlanPanel {
  root: HTMLDivElement;
  bodyEl: HTMLDivElement;
  listEl: HTMLDivElement;
  addBtn: HTMLButtonElement;
  printBtn: HTMLButtonElement;
  toggleBtn: HTMLButtonElement;

  manager: PlanManager;
  overlayStore: SheetOverlayStore;
  cb: PlanPanelCallbacks;

  isCollapsed = false;
  draggingId: string | null = null;
  dropIndex: number | null = null;
  expandedVisibilityPlanId: string | null = null;

  /** DOM-Element des Format-Dialogs (lazy). */
  private _formatDialog: HTMLDivElement | null = null;

  constructor(
    manager: PlanManager,
    overlayStore: SheetOverlayStore,
    root: HTMLDivElement,
    bodyEl: HTMLDivElement,
    listEl: HTMLDivElement,
    addBtn: HTMLButtonElement,
    printBtn: HTMLButtonElement,
    toggleBtn: HTMLButtonElement,
    cb: PlanPanelCallbacks,
  ) {
    this.manager = manager;
    this.overlayStore = overlayStore;
    this.root = root;
    this.bodyEl = bodyEl;
    this.listEl = listEl;
    this.addBtn = addBtn;
    this.printBtn = printBtn;
    this.toggleBtn = toggleBtn;
    this.cb = cb;

    this.addBtn.addEventListener("click", () => this._openFormatDialog());
    this.printBtn.addEventListener("click", () => this._handlePrint());
    this.toggleBtn.addEventListener("click", () => this._toggleCollapse());
    this.listEl.addEventListener("dragover", (e) => this._onDragOver(e));
    this.listEl.addEventListener("drop", (e) => this._onDrop(e));
    this.listEl.addEventListener("dragleave", (e) => this._onDragLeave(e));
    this.listEl.addEventListener("dragend", () => this._onDragEnd());
  }

  private _toggleVisibility(planId: string) {
    const state = this.overlayStore.get(planId);
    if (this.expandedVisibilityPlanId === planId || state.mode !== OverlayMode.NONE) {
      this.expandedVisibilityPlanId = null;
      this.overlayStore.setNone(planId);
    } else {
      // Aktivieren = sofort Transparentpause in Originalfarben anzeigen.
      this.expandedVisibilityPlanId = planId;
      this.overlayStore.setStamp(planId);
    }
    this.cb.onChange();
  }

  private _toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    this.root.classList.toggle("collapsed", this.isCollapsed);
    this.bodyEl.classList.toggle("hidden", this.isCollapsed);
  }

  private _handlePrint() {
    const sel = this.manager.getSelected();
    if (sel.length === 0) {
      alert("Bitte mindestens einen Plan auswählen (Kästchen links).");
      return;
    }
    this.cb.printSelected();
  }

  /** Dialog-Erzeugung (modaler Overlay innerhalb des Panels-Roots). */
  private _openFormatDialog() {
    if (this._formatDialog) return;

    const overlay = document.createElement("div");
    overlay.className = "plan-format-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this._closeFormatDialog();
    });

    const dialog = document.createElement("div");
    dialog.className = "plan-format-dialog";

    const title = document.createElement("div");
    title.className = "plan-format-title";
    title.textContent = "Plangröße auswählen";

    const grid = document.createElement("div");
    grid.className = "plan-format-grid";

    let selectedKey = PlanDefaults.defaultFormatKey;
    let landscape = PlanDefaults.defaultLandscape;
    let freeW = PlanDefaults.defaultFreeWidth;
    let freeH = PlanDefaults.defaultFreeHeight;

    const updateActive = () => {
      [...grid.querySelectorAll(".plan-format-card")].forEach(el => {
        el.classList.toggle("active", (el as HTMLElement).dataset.key === selectedKey);
      });
      freeWrap.classList.toggle("hidden", selectedKey !== "free");
      orientationWrap.classList.toggle("hidden", selectedKey === "free");
    };

    for (const f of PaperFormats) {
      const card = document.createElement("button");
      card.className = "plan-format-card";
      card.dataset.key = f.key;
      card.innerHTML = `
        <div class="plan-format-card-label">${f.label}</div>
        <div class="plan-format-card-size">${f.width} × ${f.height} mm</div>
      `;
      card.addEventListener("click", () => { selectedKey = f.key; updateActive(); });
      grid.appendChild(card);
    }
    const freeCard = document.createElement("button");
    freeCard.className = "plan-format-card";
    freeCard.dataset.key = "free";
    freeCard.innerHTML = `
      <div class="plan-format-card-label">Frei</div>
      <div class="plan-format-card-size">B × L (mm)</div>
    `;
    freeCard.addEventListener("click", () => { selectedKey = "free"; updateActive(); });
    grid.appendChild(freeCard);

    // Querformat-Toggle
    const orientationWrap = document.createElement("div");
    orientationWrap.className = "plan-format-orientation";
    orientationWrap.innerHTML = `
      <label><input type="radio" name="plan-orient" value="portrait" checked /> Hochformat</label>
      <label><input type="radio" name="plan-orient" value="landscape" /> Querformat</label>
    `;
    orientationWrap.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.name === "plan-orient") landscape = t.value === "landscape";
    });

    // Freie Maße
    const freeWrap = document.createElement("div");
    freeWrap.className = "plan-format-free hidden";
    freeWrap.innerHTML = `
      <label>Breite (mm) <input type="number" min="10" step="1" value="${freeW}" data-field="w" /></label>
      <label>Länge (mm) <input type="number" min="10" step="1" value="${freeH}" data-field="h" /></label>
    `;
    freeWrap.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      const v = parseFloat(t.value);
      if (!isFinite(v) || v <= 0) return;
      if (t.dataset.field === "w") freeW = v;
      else if (t.dataset.field === "h") freeH = v;
    });

    const actions = document.createElement("div");
    actions.className = "plan-format-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "plan-format-btn";
    cancelBtn.textContent = "Abbrechen";
    cancelBtn.addEventListener("click", () => this._closeFormatDialog());
    const okBtn = document.createElement("button");
    okBtn.className = "plan-format-btn primary";
    okBtn.textContent = "Plan erstellen";
    okBtn.addEventListener("click", () => {
      const created = this.manager.createPlan({
        formatKey: selectedKey,
        landscape,
        freeWidth: freeW,
        freeHeight: freeH,
      });
      this._closeFormatDialog();
      this.cb.setActivePlanId(created.id);
      this.cb.onChange();
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);

    dialog.appendChild(title);
    dialog.appendChild(grid);
    dialog.appendChild(orientationWrap);
    dialog.appendChild(freeWrap);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    this._formatDialog = overlay;

    updateActive();
  }

  private _closeFormatDialog() {
    if (this._formatDialog) {
      this._formatDialog.remove();
      this._formatDialog = null;
    }
  }

  private _calcDropIndex(e: DragEvent): number {
    const rows = [...this.listEl.querySelectorAll(".plan-row")];
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
    const indicators = [...this.listEl.querySelectorAll(".plan-drop-indicator")];
    indicators.forEach((el, idx) => {
      el.classList.toggle("active", this.dropIndex === idx && this.draggingId != null);
    });
  }

  render() {
    const plans = this.manager.list();
    const activeId = this.cb.getActivePlanId();
    this.listEl.innerHTML = "";

    const makeIndicator = (index: number) => {
      const ind = document.createElement("div");
      ind.className = "plan-drop-indicator";
      ind.dataset.index = String(index);
      if (this.dropIndex === index && this.draggingId != null) ind.classList.add("active");
      return ind;
    };

    this.listEl.appendChild(makeIndicator(0));

    if (plans.length === 0) {
      const empty = document.createElement("div");
      empty.className = "plan-empty";
      empty.textContent = "Noch keine Pläne. „+ Plan“ zum Anlegen.";
      this.listEl.appendChild(empty);
      return;
    }

    plans.forEach((plan, index) => {
      const item = document.createElement("div");
      item.className = "plan-item";

      const row = document.createElement("div");
      row.className = "plan-row";
      row.dataset.id = plan.id;
      row.classList.toggle("active", activeId === plan.id);
      row.draggable = true;

      row.addEventListener("dragstart", (e) => {
        this.draggingId = plan.id;
        row.classList.add("dragging");
        try { e.dataTransfer?.setData("text/plain", plan.id); } catch { /* noop */ }
        try { if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; } catch { /* noop */ }
      });
      row.addEventListener("dragend", () => row.classList.remove("dragging"));

      // Auswahl-Checkbox (für PDF-Sammelexport)
      const cbWrap = document.createElement("label");
      cbWrap.className = "plan-checkbox";
      cbWrap.title = "Für PDF-Druck auswählen";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!plan.selected;
      cb.addEventListener("click", (e) => e.stopPropagation());
      cb.addEventListener("change", () => {
        this.manager.setSelected(plan.id, cb.checked);
        this.cb.onChange();
      });
      cbWrap.appendChild(cb);

      const main = document.createElement("div");
      main.className = "plan-main";
      const size = getPlanPaperSize(plan);
      const fmt = this._formatLabel(plan);
      main.innerHTML = `
        <div class="plan-name">${this._esc(plan.name)}</div>
        <div class="plan-sub">${this._esc(fmt)} · ${Math.round(size.width)}×${Math.round(size.height)} mm</div>
      `;
      main.addEventListener("click", () => {
        // Toggle: Klick auf aktiven Plan deaktiviert (zurück zur Zeichenfläche)
        if (activeId === plan.id) this.cb.setActivePlanId(null);
        else this.cb.setActivePlanId(plan.id);
      });

      const actions = document.createElement("div");
      actions.className = "plan-actions";

      // Transparentpause-Button (analog Sheet-Panel)
      const overlayState = this.overlayStore.get(plan.id);
      const visBtn = document.createElement("button");
      visBtn.className = "plan-icon-btn icon-only";
      visBtn.title = "Transparentpause";
      visBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 3l18 18"/>
          <path d="M10.58 10.58a2 2 0 102.83 2.83"/>
          <path d="M9.88 5.09A10.94 10.94 0 0112 4.91c5.52 0 9.27 4.5 10 5.48a1 1 0 010 1.22 17.47 17.47 0 01-4.09 3.98"/>
          <path d="M6.61 6.61A17.32 17.32 0 002 11.39a1 1 0 000 1.22c.73.98 4.48 5.48 10 5.48 1.53 0 2.96-.35 4.25-.92"/>
        </svg>
      `;
      if (overlayState.mode !== OverlayMode.NONE || this.expandedVisibilityPlanId === plan.id) {
        visBtn.classList.add("active");
      }
      visBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._toggleVisibility(plan.id);
      });

      const editBtn = document.createElement("button");
      editBtn.className = "plan-icon-btn icon-only";
      editBtn.title = "Umbenennen";
      editBtn.textContent = "✎";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const next = prompt("Plan umbenennen", plan.name);
        if (next == null) return;
        this.manager.renamePlan(plan.id, next);
        this.cb.onChange();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "plan-icon-btn icon-only";
      deleteBtn.title = "Löschen";
      deleteBtn.textContent = "🗑";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`Plan "${plan.name}" wirklich löschen?`)) return;
        this.manager.deletePlan(plan.id);
        this.overlayStore.delete(plan.id);
        if (activeId === plan.id) this.cb.setActivePlanId(null);
        this.cb.onChange();
      });

      actions.appendChild(visBtn);
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      row.appendChild(cbWrap);
      row.appendChild(main);
      row.appendChild(actions);
      item.appendChild(row);

      // Visibility-Panel (Farben + Opacity-Slider) wenn aufgeklappt
      if (this.expandedVisibilityPlanId === plan.id) {
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
          this.overlayStore.setStamp(plan.id);
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
            this.overlayStore.setTint(plan.id, col.hex);
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
          this.overlayStore.setOpacity(plan.id, val);
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

  private _formatLabel(plan: Plan): string {
    if (plan.formatKey === "free") {
      return plan.landscape ? "Frei (Quer)" : "Frei";
    }
    const f = PaperFormats.find(p => p.key === plan.formatKey);
    const base = f ? f.label : plan.formatKey.toUpperCase();
    return plan.landscape ? `${base} Quer` : `${base} Hoch`;
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
