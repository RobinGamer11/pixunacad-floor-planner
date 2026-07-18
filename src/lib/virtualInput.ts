// Synthetische Maus-/Tastatur-Events für das Tablet-Hilfsrad.
// Ziel: Auf einem Tablet ohne physische Maus/Tastatur RMB / SHIFT / ESC / ENTF
// verwenden können. Die App-Handler prüfen isTrusted nicht, daher genügen
// künstliche Events.

function isIgnoredTabletTarget(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  return !!el?.closest(
    '[data-tablet-aid="true"], [data-hub-control], .cad-hub, .cad-point-menu, .cad-toolbar-btn, header, aside, nav, button, input, select, textarea',
  );
}

function visibleCanvasFromPoint(x: number, y: number): HTMLCanvasElement | null {
  const stack = typeof document.elementsFromPoint === "function" ? document.elementsFromPoint(x, y) : [];
  for (const el of stack) {
    if (el instanceof HTMLCanvasElement && el.closest("main")) return el;
  }
  const canvases = Array.from(document.querySelectorAll("main canvas")) as HTMLCanvasElement[];
  return canvases.find((canvas) => {
    const r = canvas.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }) ?? null;
}

/** Findet das aktuell sinnvolle Ziel für Maus-Events: bevorzugt das <canvas>
 * unter der zuletzt echten Canvas-Position, sonst ein sichtbares Canvas im
 * aktiven <main>-Container, sonst body. */
function pickTarget(): { el: Element; x: number; y: number } {
  const p = _lastPointer;
  const pointedCanvas = p ? visibleCanvasFromPoint(p.x, p.y) : null;
  const canvas = pointedCanvas ?? (document.querySelector("main canvas") as HTMLCanvasElement | null);
  if (canvas) {
    const r = canvas.getBoundingClientRect();
    const inside = p && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
    return inside
      ? { el: canvas, x: p!.x, y: p!.y }
      : { el: canvas, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  const fallback = _lastPointer ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const el = document.elementFromPoint(fallback.x, fallback.y) ?? document.body;
  return { el, x: fallback.x, y: fallback.y };
}

let _lastPointer: { x: number; y: number } | null = null;
if (typeof window !== "undefined") {
  const rememberPointer = (e: PointerEvent) => {
    // Nur echte User-Bewegungen tracken, nicht unsere eigenen synthetischen.
    if ((e as any).__virtual) return;
    // Rad/HUB/UI nie als Zielposition übernehmen — sonst setzt LMB/ENTER den
    // Punkt unter dem Hilfsrad statt an der zuletzt berührten Zeichenfläche.
    if (isIgnoredTabletTarget(e.target)) return;
    _lastPointer = { x: e.clientX, y: e.clientY };
  };
  window.addEventListener("pointerdown", rememberPointer, true);
  window.addEventListener("pointermove", rememberPointer, true);
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

function keyTarget(target?: EventTarget | null): EventTarget {
  return target
    ?? ((document.activeElement && document.activeElement !== document.body)
    ? document.activeElement
    : (document.querySelector("main canvas") ?? document);
}

/** Einmaliger Tastendruck (down+up). */
export function virtualKeyPress(name: "Escape" | "Delete" | "Enter" | "Backspace", target?: HTMLElement | null) {
  const def = KEYS[name];
  const t = keyTarget(target);
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
  if (name === "Backspace" && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) {
    const el = t as HTMLInputElement | HTMLTextAreaElement;
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

/** Tippt ein einzelnes Zeichen in ein Eingabefeld (für Ziffernblock). */
export function virtualTypeChar(ch: string, target?: HTMLElement | null) {
  const el = (target ?? document.activeElement) as HTMLElement | null;
  if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA" && !(el as HTMLElement).isContentEditable)) return;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    const inp = el as HTMLInputElement | HTMLTextAreaElement;
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
