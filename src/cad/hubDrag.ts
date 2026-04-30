/**
 * Macht ein HUB-Element (z. B. .cad-point-menu) per Drag verschiebbar.
 * Drag wird nur ausgelöst, wenn der Pointer NICHT auf einem interaktiven
 * Kindelement (button/input/select/textarea) startet.
 *
 * Position wird via element.style.left / top (px, viewport-relativ)
 * geschrieben. Das Element sollte position: fixed oder absolute sein.
 *
 * Returns: cleanup() zum Entfernen der Listener.
 */
export function makeHubDraggable(el: HTMLElement, opts?: { positionMode?: "fixed" | "absolute" }): () => void {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let userMoved = false;

  const onMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a")) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    el.classList.add("dragging");
    startX = e.clientX;
    startY = e.clientY;
    const rect = el.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    if (opts?.positionMode === "absolute") {
      // Convert: in absolute mode, computed left/top are relative to offsetParent.
      const cs = parseFloat(el.style.left || "0");
      const ct = parseFloat(el.style.top || "0");
      startLeft = cs;
      startTop = ct;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.style.left = `${startLeft + dx}px`;
    el.style.top = `${startTop + dy}px`;
    userMoved = true;
    (el as any).__hubUserMoved = true;
  };

  const onMouseUp = () => {
    dragging = false;
    el.classList.remove("dragging");
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  el.addEventListener("mousedown", onMouseDown);

  return () => {
    el.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    void userMoved;
  };
}

/** Markierung lesen, ob der User die Box manuell verschoben hat. */
export function hubWasUserMoved(el: HTMLElement): boolean {
  return !!(el as any).__hubUserMoved;
}

/** Markierung zurücksetzen (z. B. wenn HUB neu für ein anderes Objekt geöffnet wird). */
export function resetHubUserMoved(el: HTMLElement): void {
  (el as any).__hubUserMoved = false;
}
