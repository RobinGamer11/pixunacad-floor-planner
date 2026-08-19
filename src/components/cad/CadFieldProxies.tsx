import React, { useEffect, useState } from "react";

/**
 * Spiegelt das engine-gebundene Ebenen-Dropdown der CAD-Oberfläche als
 * React-Feld, damit die Reihenfolge der Werkzeugeinstellungen (Ebene → Modus →
 * Objektart → Rahmen) 1:1 zur Projektmappe passt, ohne die DOM-Bindungen der
 * Engine anzufassen.
 */
export function CadEbeneSelect({ target }: { target: React.RefObject<HTMLSelectElement> }) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [value, setValue] = useState("");

  useEffect(() => {
    const read = () => {
      const el = target.current;
      if (!el) return;
      const next = Array.from(el.options).map((o) => ({ value: o.value, label: o.textContent ?? o.value }));
      setOptions((prev) =>
        prev.length === next.length && prev.every((p, i) => p.value === next[i].value && p.label === next[i].label)
          ? prev
          : next,
      );
      setValue(el.value);
    };
    read();
    const id = window.setInterval(read, 350);
    return () => window.clearInterval(id);
  }, [target]);

  return (
    <div>
      <div className="text-[10px] font-semibold tracking-wider mb-1.5" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
        EBENE
      </div>
      <select
        className="cad-settings-select w-full"
        value={value}
        onChange={(e) => {
          const el = target.current;
          setValue(e.target.value);
          if (!el) return;
          el.value = e.target.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }}
      >
        {options.length === 0 ? <option value="">Default</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Millimeter-Eingabe, die an das engine-gebundene Zentimeter-Feld gekoppelt ist
 * (analog zur doppelten Maßeingabe im Linien-Werkzeug der Projektmappe).
 */
export function CadThicknessMmInput({ target }: { target: React.RefObject<HTMLInputElement> }) {
  const [text, setText] = useState("10");

  useEffect(() => {
    const read = () => {
      const el = target.current;
      if (!el || document.activeElement === el) return;
      const cm = parseFloat(el.value.replace(",", "."));
      if (!Number.isFinite(cm)) return;
      const mm = Math.round(cm * 10 * 1000) / 1000;
      setText((prev) => (parseFloat(prev.replace(",", ".")) === mm ? prev : String(mm)));
    };
    read();
    const id = window.setInterval(read, 350);
    return () => window.clearInterval(id);
  }, [target]);

  const commit = (raw: string) => {
    const mm = parseFloat(raw.replace(",", "."));
    const el = target.current;
    if (!el || !Number.isFinite(mm) || mm <= 0) return;
    el.value = String(Math.round((mm / 10) * 10000) / 10000);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  return (
    <input
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
      }}
    />
  );
}

const HAIRLINE = "hsl(var(--hairline))";
const HEX = /^#[0-9a-f]{6}$/i;

/** Poll-Helfer: liest zyklisch aus einem engine-gebundenen DOM-Feld. */
function usePolled<T>(read: () => T | undefined, deps: unknown[] = []) {
  const [value, setValue] = useState<T | undefined>(() => read());
  useEffect(() => {
    const tick = () => {
      const next = read();
      setValue((prev) => (Object.is(prev, next) ? prev : next));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

function fire(el: HTMLElement) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Farbwahl in Mappen-Optik (großes Feld + Farbbezeichnung), gebunden an ein verstecktes Color-Input. */
export function CadColorProxy({ label, target }: { label: string; target: React.RefObject<HTMLInputElement> }) {
  const raw = usePolled(() => target.current?.value, [target]) ?? "#000000";
  const value = HEX.test(raw) ? raw : "#000000";
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span
        className="relative block h-10 w-full overflow-hidden rounded-md border shadow-inner"
        style={{ borderColor: HAIRLINE, backgroundColor: value }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => {
            const el = target.current;
            if (!el) return;
            el.value = e.target.value;
            fire(el);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={`${label} auswählen`}
        />
      </span>
      <span className="text-[9px] font-medium tabular-nums tracking-wide text-muted-foreground">
        {value.toUpperCase()}
      </span>
    </label>
  );
}

/** Maßeingabe in Mappen-Optik (Beschriftung + gerahmtes Feld + Einheit), gekoppelt an ein Text-Input der Engine. */
export function CadMeasureProxy({
  label,
  unit,
  target,
  factor = 1,
  digits = 2,
  min = 0,
}: {
  label: string;
  unit: string;
  target: React.RefObject<HTMLInputElement>;
  /** Anzeigewert = Engine-Wert * factor */
  factor?: number;
  digits?: number;
  min?: number;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const engine = usePolled(() => target.current?.value, [target]);

  useEffect(() => {
    if (focused) return;
    const n = parseFloat(String(engine ?? "").replace(",", "."));
    if (!Number.isFinite(n)) return;
    setDraft(String(Number((n * factor).toFixed(digits))));
  }, [engine, factor, digits, focused]);

  const commit = (raw: string) => {
    const n = parseFloat(raw.replace(",", "."));
    const el = target.current;
    if (!el || !Number.isFinite(n) || n < min) return;
    el.value = String(Number((n / factor).toFixed(6)));
    fire(el);
  };

  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[9px] text-muted-foreground">{label}</span>
      <span className="flex h-8 items-center overflow-hidden rounded-md border" style={{ borderColor: HAIRLINE }}>
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          onFocus={() => setFocused(true)}
          onBlur={(e) => { setFocused(false); commit(e.target.value); }}
          onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-right text-[11px] tabular-nums outline-none"
        />
        <span className="pr-2 text-[9px] text-muted-foreground">{unit}</span>
      </span>
    </label>
  );
}

/** Gerahmter Umschalt-Button (Mappen-Optik), gebunden an einen versteckten Engine-Button. */
export function CadToggleProxy({
  target,
  title,
  children,
  className = "",
}: {
  target: React.RefObject<HTMLButtonElement>;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const active = usePolled(() => target.current?.classList.contains("active") ?? false, [target]) ?? false;
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={() => target.current?.click()}
      className={`flex h-9 items-center justify-center gap-1 rounded border px-2 text-[11px] transition-colors ${
        active ? "bg-accent" : "hover:bg-muted"
      } ${className}`}
      style={{ borderColor: HAIRLINE }}
    >
      {children}
    </button>
  );
}

/** Regler + gerahmtes Zahlenfeld mit Einheit (Mappen-Optik), gebunden an Engine-Felder. */
export function CadRangeProxy({
  target,
  min = 1,
  max = 100,
  step = 1,
  unit = "%",
  rangeTarget,
}: {
  /** Text-/Zahlenfeld der Engine (führend). */
  target: React.RefObject<HTMLInputElement>;
  rangeTarget?: React.RefObject<HTMLInputElement>;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  const engine = usePolled(() => target.current?.value, [target]);
  const value = (() => {
    const n = parseFloat(String(engine ?? "").replace(",", "."));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  })();

  const commit = (n: number) => {
    const v = Math.min(max, Math.max(min, n));
    const el = target.current;
    if (el) { el.value = String(v); fire(el); }
    const r = rangeTarget?.current;
    if (r) { r.value = String(v); fire(r); }
  };

  return (
    <div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => commit(Number(e.target.value))}
        className="pixuna-range w-full"
      />
      <label className="mt-1 flex h-7 items-center overflow-hidden rounded-md border" style={{ borderColor: HAIRLINE }}>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) commit(Math.round(n));
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-right text-xs tabular-nums outline-none"
        />
        <span className="pr-2 text-[10px] text-muted-foreground">{unit}</span>
      </label>
    </div>
  );
}

/** Checkbox mit Beschriftung, gebunden an eine versteckte Engine-Checkbox. */
export function CadCheckboxProxy({ target, label }: { target: React.RefObject<HTMLInputElement>; label: string }) {
  const checked = usePolled(() => target.current?.checked ?? false, [target]) ?? false;
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => target.current?.click()}
        className="accent-primary"
      />
      {label}
    </label>
  );
}
