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
  Enter:  { key: "Enter",  code: "Enter", keyCode: 13 },
  Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
};

function keyTarget(): EventTarget {
  return (document.activeElement && document.activeElement !== document.body)
    ? document.activeElement
    : (document.querySelector("main canvas") ?? document);
}

/** Einmaliger Tastendruck (down+up). */
export function virtualKeyPress(name: "Escape" | "Delete" | "Enter" | "Backspace") {
  const def = KEYS[name];
  const t = keyTarget();
  const mk = (type: "keydown" | "keyup") =>
    new KeyboardEvent(type, { key: def.key, code: def.code, keyCode: def.keyCode, which: def.keyCode, bubbles: true, cancelable: true });
  const down = mk("keydown"); (down as any).__virtual = true;
  const up = mk("keyup"); (up as any).__virtual = true;
  t.dispatchEvent(down);
  window.dispatchEvent(down);

  // Für Enter: falls Ziel ein Formular-Input ist, blur → Commit auslösen.
  if (name === "Enter" && t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
    (t as HTMLInputElement).blur();
  }
  // Für Backspace: Zeichen im Input löschen.
  if (name === "Backspace" && t instanceof HTMLInputElement) {
    const el = t as HTMLInputElement;
    const s = el.selectionStart ?? el.value.length;
    const e = el.selectionEnd ?? s;
    if (s === e && s > 0) {
      setNativeValue(el, el.value.slice(0, s - 1) + el.value.slice(e));
      el.setSelectionRange(s - 1, s - 1);
    } else if (s !== e) {
      setNativeValue(el, el.value.slice(0, s) + el.value.slice(e));
      el.setSelectionRange(s, s);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  setTimeout(() => {
    t.dispatchEvent(up);
    window.dispatchEvent(up);
  }, 20);
}

/** Setzt Input-Value über React's nativen Setter, damit React onChange sieht. */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

/** Tippt ein einzelnes Zeichen in den fokussierten Input (für Ziffernblock). */
export function virtualTypeChar(ch: string) {
  const el = document.activeElement as HTMLElement | null;
  if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA" && !(el as HTMLElement).isContentEditable)) return;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    const inp = el as HTMLInputElement;
    const s = inp.selectionStart ?? inp.value.length;
    const e = inp.selectionEnd ?? s;
    setNativeValue(inp, inp.value.slice(0, s) + ch + inp.value.slice(e));
    try { inp.setSelectionRange(s + ch.length, s + ch.length); } catch {}
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    document.execCommand("insertText", false, ch);
  }
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
