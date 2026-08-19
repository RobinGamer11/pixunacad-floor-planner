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
