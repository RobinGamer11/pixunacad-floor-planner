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
  let activePointerId: number | null = null;

  el.dataset.hubControl = "true";

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a")) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    activePointerId = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch {}
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
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.style.left = `${startLeft + dx}px`;
    el.style.top = `${startTop + dy}px`;
    userMoved = true;
    (el as any).__hubUserMoved = true;
  };

  const onPointerUp = (e?: PointerEvent) => {
    if (e && activePointerId !== null && e.pointerId !== activePointerId) return;
    dragging = false;
    if (e) { try { el.releasePointerCapture(e.pointerId); } catch {} }
    activePointerId = null;
    el.classList.remove("dragging");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  };

  el.addEventListener("pointerdown", onPointerDown);

  return () => {
    el.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
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
