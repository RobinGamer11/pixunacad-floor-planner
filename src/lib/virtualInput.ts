// Synthetische Maus-/Tastatur-Events für das Tablet-Hilfsrad.
// Ziel: Auf einem Tablet ohne physische Maus/Tastatur RMB / SHIFT / ESC / ENTF
// verwenden können. Die App-Handler prüfen isTrusted nicht, daher genügen
// künstliche Events.

/** Findet das aktuell sinnvolle Ziel für Maus-Events: bevorzugt ein <canvas>
 * im aktiven <main>-Container, sonst das Element unter der letzten bekannten
 * Zeigerposition, sonst body. */
function pickTarget(): { el: Element; x: number; y: number } {
  const canvas = document.querySelector("main canvas") as HTMLCanvasElement | null;
  if (canvas) {
    const r = canvas.getBoundingClientRect();
    const p = _lastPointer;
    const inside = p && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
    return inside
      ? { el: canvas, x: p!.x, y: p!.y }
      : { el: canvas, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  const p = _lastPointer ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const el = document.elementFromPoint(p.x, p.y) ?? document.body;
  return { el, x: p.x, y: p.y };
}

let _lastPointer: { x: number; y: number } | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("pointermove", (e) => {
    // Nur echte User-Bewegungen tracken, nicht unsere eigenen synthetischen.
    if ((e as any).__virtual) return;
    _lastPointer = { x: e.clientX, y: e.clientY };
  }, true);
}

function dispatchPointer(
  type: "pointerdown" | "pointerup" | "pointermove",
  el: Element,
  x: number,
  y: number,
  button: number,
) {
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button,
    buttons: type === "pointerup" ? 0 : (button === 2 ? 2 : button === 1 ? 4 : 1),
    pointerType: "mouse",
    isPrimary: true,
    pointerId: 9999,
  });
  (ev as any).__virtual = true;
  el.dispatchEvent(ev);
  // Zusätzlich das äquivalente MouseEvent — manche Handler hören nur auf Maus.
  const mtype = type === "pointerdown" ? "mousedown" : type === "pointerup" ? "mouseup" : "mousemove";
  const mev = new MouseEvent(mtype, { bubbles: true, cancelable: true, clientX: x, clientY: y, button });
  (mev as any).__virtual = true;
  el.dispatchEvent(mev);
}

/** Simuliert ein Klick-Ereignis der linken/mittleren/rechten Maustaste an der
 *  aktuellen Zeigerposition. `button`: 0=links, 1=mitte, 2=rechts. */
export function virtualMouseClick(button: 0 | 1 | 2) {
  const { el, x, y } = pickTarget();
  dispatchPointer("pointerdown", el, x, y, button);
  setTimeout(() => {
    dispatchPointer("pointerup", el, x, y, button);
    if (button === 2) {
      const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 });
      (ev as any).__virtual = true;
      el.dispatchEvent(ev);
    }
  }, 30);
}

const _heldButtons = new Set<0 | 1 | 2>();
/** Hält eine Maustaste dauerhaft gedrückt (für Zwei-Hand-Bedienung). */
export function virtualMouseHold(button: 0 | 1 | 2, on: boolean) {
  const { el, x, y } = pickTarget();
  if (on) {
    if (_heldButtons.has(button)) return;
    _heldButtons.add(button);
    dispatchPointer("pointerdown", el, x, y, button);
    if (button === 2) {
      const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 });
      (ev as any).__virtual = true;
      el.dispatchEvent(ev);
    }
  } else {
    if (!_heldButtons.has(button)) return;
    _heldButtons.delete(button);
    dispatchPointer("pointerup", el, x, y, button);
  }
}

type KeyDef = { key: string; code: string; keyCode: number };
const KEYS: Record<string, KeyDef> = {
  Escape: { key: "Escape", code: "Escape", keyCode: 27 },
  Delete: { key: "Delete", code: "Delete", keyCode: 46 },
  Shift:  { key: "Shift",  code: "ShiftLeft", keyCode: 16 },
};

function keyTarget(): EventTarget {
  return (document.activeElement && document.activeElement !== document.body)
    ? document.activeElement
    : (document.querySelector("main canvas") ?? document);
}

/** Einmaliger Tastendruck (down+up). */
export function virtualKeyPress(name: "Escape" | "Delete") {
  const def = KEYS[name];
  const t = keyTarget();
  const down = new KeyboardEvent("keydown", { key: def.key, code: def.code, keyCode: def.keyCode, which: def.keyCode, bubbles: true, cancelable: true });
  const up = new KeyboardEvent("keyup", { key: def.key, code: def.code, keyCode: def.keyCode, which: def.keyCode, bubbles: true, cancelable: true });
  (down as any).__virtual = true;
  (up as any).__virtual = true;
  t.dispatchEvent(down);
  // Auch am window/document nachfeuern (viele App-Handler hängen dort).
  window.dispatchEvent(down);
  setTimeout(() => {
    t.dispatchEvent(up);
    window.dispatchEvent(up);
  }, 20);
}

const _heldKeys = new Set<string>();
/** Modifier gedrückt halten (für SHIFT beim Zeichnen). */
export function virtualKeyHold(name: "Shift", on: boolean) {
  const def = KEYS[name];
  if (on) {
    if (_heldKeys.has(name)) return;
    _heldKeys.add(name);
    const ev = new KeyboardEvent("keydown", { key: def.key, code: def.code, keyCode: def.keyCode, which: def.keyCode, shiftKey: true, bubbles: true, cancelable: true });
    (ev as any).__virtual = true;
    window.dispatchEvent(ev);
    document.dispatchEvent(ev);
  } else {
    if (!_heldKeys.has(name)) return;
    _heldKeys.delete(name);
    const ev = new KeyboardEvent("keyup", { key: def.key, code: def.code, keyCode: def.keyCode, which: def.keyCode, shiftKey: false, bubbles: true, cancelable: true });
    (ev as any).__virtual = true;
    window.dispatchEvent(ev);
    document.dispatchEvent(ev);
  }
}
